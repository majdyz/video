// CPU reference of the grade shader. One pixel at a time, same stages and
// constants as GLSL/WGSL in grade-shader.ts (Seabed recovery included; person
// segmentation and the temporal layer are inputs the harness leaves empty) — used by the Node harness and
// the unit tests, never in the render path.

import { stillStrength, type AnimalMap } from "./animals.ts";
import { capChroma, fitToGamut, linearToOklab, linearToSrgb, luminance, oklabToLinear, srgbToLinear } from "./color.ts";
import { nrOpen, nrStrength, DETAIL_GUARD, DETAIL_TAPS, detailGuardOf, OBJECT_NEUTRAL, SUBJECT_CLEAR, SUBJECT_POP, SEG_RESTORE, WARM_POP, popStrengthK, objectNeutralOf, CONF_BRIGHT, DEHAZE_LUM, LOOK, PERSON_LUM, SKIN, ULAP, VIVID, VIVID_LOOK, BLUE_WATER, RICH_LOOK, HIGHLIGHT_PINK, HAZE_LIFT, SEABED, NR, TEMPORAL, boostParams, tapParams, waterTintOf, vividAmountOf, blueAmountOf, deepHaze, hazeLiftRatio, hazeLiftT, hazeParams, hazeSettings, hazeWeight, lookParams, lookSettings, presetParams, presetSettings, pushOf, resolveSettings, type ClaheLuts, type DepthMap, type GradeParams, type GradeSettings, type UserSettings } from "./params.ts";
import { shadowFloorAt } from "./analyze.ts";
import { SEG_TONE } from "./grade-shader.ts";
import { calmParams, calmSettings } from "./calm.ts";
import { BACKDROP, backdropDev, backdropSubject } from "./backdrop.ts";
import { RED, chromaRebuild, greenNeutral, greenWeight, guideSmooth, greenSettings, redGainStrength, redGuard, waterRedGain, warmMaterial, murkHold } from "./red.ts";

export type ApplyContext = {
  /** When set, gradePixel returns (k, confPix, confMap) instead of a colour. */
  debug?: boolean;
  /** When set, gradePixel records its intermediates here (diagnostics). */
  trace?: Record<string, unknown>;
  params: GradeParams;
  settings: UserSettings;
  depth: DepthMap;
  clahe: ClaheLuts;
  /**
   * An AI subject overlay on the frame (the engine's data texture 3 with p24.y set: seg-overlay.ts
   * composeSegStrength) and the clip's pop direction (p24.x; 1 = lift). With it the AI mask alone weights Subject
   * pop (grade-shader toneWeight) and the AI subject restore applies (SEG_RESTORE).
   */
  seg?: { strength: { width: number; height: number; data: Float32Array }; popDir?: number };
};

/** The context as gradePixel reads it: intensity already resolved. */
type PixelContext = Omit<ApplyContext, "settings"> & { settings: GradeSettings; /** Seabed recovery amount (seabedAmountOf). */ seabed?: number; /** "Water colour" hue rotation, radians (waterTintOf). */ waterTint?: number };

export function resolveContext(ctx: ApplyContext): PixelContext {
  const hz = ctx.settings.hazeAuto !== false;
  const params = tapParams(lookParams((hz ? hazeParams : (p: GradeParams) => p)(presetParams(boostParams(calmParams(ctx.params), pushOf(ctx.settings)), ctx.settings)), ctx.settings), ctx.settings);
  const base = greenSettings(presetSettings(calmSettings(resolveSettings(ctx.settings), params), ctx.settings), params);
  return { ...ctx, params, settings: { ...lookSettings(hz ? hazeSettings(base, params) : base, params), vivid: vividAmountOf(params, ctx.settings), blue: blueAmountOf(params, ctx.settings) }, seabed: seabedAmountOf(params, ctx.settings), waterTint: waterTintOf(ctx.settings) };
}

/** Seabed recovery amount as packUniforms sends it (p25.x): setting × missing red × not open water. */
export function seabedAmountOf(params: GradeParams, settings: UserSettings): number {
  return clamp(settings.seabed ?? 0, 0, 1) * clamp(params.seabedNeed ?? 0, 0, 1) * (1 - clamp(params.backdrop ?? 0, 0, 1));
}

/**
 * Seabed weight (grade-shader seabedW): how much of the ground around the pixel is lit seabed, read from the
 * analysis' coarse grid (GradeParams.seabedGrid, SEABED.grid² cell means) with a quadratic B-spline (smooth, no
 * detail finer than a cell) and a soft ramp. The pixel's own brightness has no say: a dark stone and the sand it
 * lies on share one weight, and the weight fades with the ground's brightness (distance), so the seabed goes over
 * into the blue gradually instead of splitting where the sand stops being bright. Spared toward the top of the frame.
 */
export function seabedW(p: GradeParams, u: number, v: number): number {
  const G = SEABED.grid, g = p.seabedGrid;
  if (!g || g.length !== G * G) return 0;
  const gx = u * G - 0.5, gy = v * G - 0.5;
  const cx = Math.floor(gx + 0.5), cy = Math.floor(gy + 0.5), fx = gx - cx, fy = gy - cy;
  const wx = [0.5 * (0.5 - fx) * (0.5 - fx), 0.75 - fx * fx, 0.5 * (0.5 + fx) * (0.5 + fx)];
  const wy = [0.5 * (0.5 - fy) * (0.5 - fy), 0.75 - fy * fy, 0.5 * (0.5 + fy) * (0.5 + fy)];
  let acc = 0;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) acc += wx[i] * wy[j] * g[clamp(cy + j - 1, 0, G - 1) * G + clamp(cx + i - 1, 0, G - 1)];
  return smoothstep(SEABED.wLo, SEABED.wHi, acc) * smoothstep(SEABED.y0, SEABED.y1, v);
}

/**
 * Joint bilateral upsample of the (z, conf, dSmooth) fields at upright uv:
 * the four bilinear neighbours are re-weighted by how much the full-res
 * pixel colour resembles each neighbour's guide colour. Smooth inside a
 * region, sharp at edges, no halos.
 */
export const JBU_SIGMA = 0.12;
/** Returns the upsampled fields and the guide-match weight k (0 = the map says nothing about this pixel). */
function sampleFields(d: DepthMap, u: number, v: number, r: number, g: number, b: number): [number, number, number, number, number, number] {
  const fx = Math.min(Math.max(u * d.width - 0.5, 0), d.width - 1);
  const fy = Math.min(Math.max(v * d.height - 0.5, 0), d.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, d.width - 1), y1 = Math.min(y0 + 1, d.height - 1);
  const tx = fx - x0, ty = fy - y0;
  const cn = Math.hypot(r, g, b) + 0.02;
  let sz = 0, sc = 0, sd = 0, sv = 0, sw = 0, sp = 0;
  let bz = 0, bc = 0, bd = 0, bv = 0, bp = 0;
  const taps: [number, number, number][] = [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]];
  for (const [x, y, ws] of taps) {
    const i = y * d.width + x;
    const gr = d.guide[i * 3], gg = d.guide[i * 3 + 1], gb = d.guide[i * 3 + 2];
    const diff = Math.hypot(r - gr, g - gg, b - gb) / (cn + Math.hypot(gr, gg, gb));
    const wr = Math.exp(-(diff * diff) / (2 * JBU_SIGMA * JBU_SIGMA));
    const wgt = ws * wr;
    const f = i * 4;
    const pg = d.person ? d.person[i] : 0;
    sz += wgt * d.fields[f]; sc += wgt * d.fields[f + 1]; sd += wgt * d.fields[f + 2]; sv += wgt * d.fields[f + 3]; sp += wgt * pg; sw += wgt;
    bz += ws * d.fields[f]; bc += ws * d.fields[f + 1]; bd += ws * d.fields[f + 2]; bv += ws * d.fields[f + 3]; bp += ws * pg;
  }
  // k → 0 when no neighbour resembles the pixel (content moved since the
  // map was made): the caller then falls back to a per-pixel estimate.
  const k = Math.min(1, sw / 0.08);
  if (sw < 1e-6) return [bz, bc, bd, bv, 0, bp];
  return [sz / sw, sc / sw, sd / sw, sv / sw, k, sp / sw];
}

/**
 * CLAHE lookup. LUT entry b is the CDF at the upper edge of bin b, so the
 * value axis maps to fb = value·bins − 1; below the first edge the curve
 * ramps from 0. Bilinear across the four nearest tiles.
 */
function sampleClahe(c: ClaheLuts, u: number, v: number, value: number): number {
  const fb = value * c.bins - 1;
  const lutAt = (tile: number) => {
    const base = tile * c.bins;
    if (fb < 0) return c.data[base] * (fb + 1);
    const b0 = Math.min(c.bins - 1, Math.floor(fb));
    const b1 = Math.min(c.bins - 1, b0 + 1);
    const tb = Math.min(1, Math.max(0, fb - b0));
    return c.data[base + b0] + (c.data[base + b1] - c.data[base + b0]) * tb;
  };
  const fx = Math.min(Math.max(u * c.tilesX - 0.5, 0), c.tilesX - 1);
  const fy = Math.min(Math.max(v * c.tilesY - 0.5, 0), c.tilesY - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, c.tilesX - 1), y1 = Math.min(y0 + 1, c.tilesY - 1);
  const tx = fx - x0, ty = fy - y0;
  const top = lutAt(y0 * c.tilesX + x0) * (1 - tx) + lutAt(y0 * c.tilesX + x1) * tx;
  const bot = lutAt(y1 * c.tilesX + x0) * (1 - tx) + lutAt(y1 * c.tilesX + x1) * tx;
  return top * (1 - ty) + bot * ty;
}

/**
 * Grades one sRGB pixel (0..1) at upright uv. Returns sRGB 0..1.
 * `base` (optional) is the artifact guard's edge-preserving base of the
 * source at this pixel (see detailBase): the grade runs on the base and the
 * pixel's own sub-noise detail is put back at unit gain, so compression
 * blocks and noise are never amplified. Without it the pixel is its own base.
 */
export function gradePixel(ctx: PixelContext, sr: number, sg: number, sb: number, u: number, v: number, base?: readonly [number, number, number], subjPrior = 0): [number, number, number] {
  const { params: p, settings: s } = ctx;
  const er = base ? base[0] : sr, eg = base ? base[1] : sg, eb = base ? base[2] : sb;
  const r0 = srgbToLinear(er), g0 = srgbToLinear(eg), b0 = srgbToLinear(eb);

  // Range proxy: coarse map plus guided per-pixel detail from the prior.
  const dPix = ULAP.mu0 + ULAP.mu1 * Math.max(eg, eb) + ULAP.mu2 * er;
  const [zc, confMap, dc, veilMap, k, personMap] = sampleFields(ctx.depth, u, v, r0, g0, b0);
  const person = clamp(personMap, 0, 1);
  const zRange = Math.max(0.02, p.zHi - p.zLo);
  const zPix = clamp((dPix - p.zLo) / zRange, 0, 1.15);
  const zMap = clamp(zc + clamp((p.depthGuide * (dPix - dc)) / zRange, -0.25, 0.25), 0, 1.15);
  const z = zPix + (zMap - zPix) * k;
  const veilScale = 1 + (veilMap - 1) * k;

  // De-scatter: per channel where the signal is healthy, proportional
  // (hue-preserving) where it isn't; then compensate and white-balance.
  const src = [r0, g0, b0];
  const lumI = Math.max(1e-5, luminance(r0, g0, b0));
  // Scaled veil classifies (is this water?); at most the global fit is
  // subtracted from an object (see analyze.ts).
  const Bv = [0, 0, 0];
  const Bs = [0, 0, 0];
  let lumB = 0, lumBs = 0;
  const subScale = Math.min(1, veilScale);
  for (let c = 0; c < 3; c++) {
    const bf = s.veil * p.binf[c] * (1 - Math.exp(-(p.betaB[c] * z + p.cB[c])));
    Bv[c] = veilScale * bf;
    Bs[c] = subScale * bf;
    const wl = c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722;
    lumB += Bv[c] * wl;
    lumBs += Bs[c] * wl;
  }
  const sig = Math.max(0, (lumI - lumB) / lumI);
  // An object whose hue sits far from the veil's (yellow algae, a red fish
  // under blue water) has already escaped the cast: it is near, and the
  // global fit overstates its veil. Per-channel subtraction would push it
  // past its own colour (yellow → orange), so it is de-scattered
  // proportionally instead.
  const lab0 = linearToOklab(r0, g0, b0);
  const pa = lab0[1], pb = lab0[2];
  // Green water (red.ts): part of the veil comes off hue-preserving, so near objects keep their own hue (olive seagrass).
  const wSub = smoothstep(p.subLo, p.subHi, sig) * (1 - hueFar(pa, pb, p)) * (1 - RED.greenProp * greenWeight(p));
  const prop = Math.max(p.floorFrac, 1 - lumBs / lumI);
  // Red restoration (red.ts): channels the grade amplifies are rebuilt from
  // the smoothed, edge-aware chroma with the detail of the others; the red
  // gain follows the region's red SNR.
  const rg3 = [0, 1, 2].map((c) => Math.min(p.gainCap, Math.max(1 / p.gainCap, Math.exp(p.attn[c] * (z - p.zMean)))));
  const rb = chromaRebuild(src, guideSmooth(ctx.depth, u, v, r0, g0, b0), rg3.map((g, c) => Math.max(g * p.wb[c], p.waterWb[c])), Bv);
  const srcC = rb.c;
  const redS = redGainStrength(rb.snrR);
  // Water-hued pixels that still hold red above the local water (reef under a
  // cyan cast) take more of the full red gain (red.ts waterRedGain).
  const waterRed = waterRedGain(p.waterWb[0], rg3[0] * p.wb[0], rb.snrR);
  const full = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const I = srcC[c];
    const per = Math.max(I - Bs[c], I * p.floorFrac);
    const D = I * prop + (per - I * prop) * wSub;
    const gainC = rg3[c] * p.wb[c];
    full[c] = D * (c === 0 ? 1 + (gainC - 1) * redS : gainC);
  }
  // Per-pixel classification for the fallback: hue against the veil and
  // the signal fraction, the same tests the analysis runs on the thumbnail.
  const confSignal = smoothstep(p.confLo, p.confHi, sig);
  const confBright = smoothstep(CONF_BRIGHT.lo, CONF_BRIGHT.hi, sig);
  // In open water (backdrop frames) the hue test does not decide (see analyze.ts).
  const ow = objectNeutralOf(p);
  const fit = p.backdropFit;
  const bsub = ow > 0 && fit && fit.length === 18 ? backdropSubject(lab0[0], pa, pb, u, v, fit) : 1;
  const confPix = Math.min(confSignal, Math.max(hueConf(pa, pb, p) * (1 + (bsub - 1) * ow), confBright, greenWeight(p) * RED.greenObj));
  // A pixel the veil model would nearly erase takes the water path whatever
  // the map says (see grade-shader.ts).
  // A detected person is an object whatever the colour tests say (the
  // "tiny D" protection via confSignal still applies).
  const personW = person * smoothstep(PERSON_LUM.lo, PERSON_LUM.hi, lumI);
  // Open water: the map lags a moving subject (ghosts where it was); a pixel
  // the backdrop surface predicts as plain water vetoes the map's verdict.
  const veto = 1 + (bsub - 1) * ow;
  // Open blue water: a source with no red left cannot get its colour back
  // from the object path (a red gain over nothing turns a grey shark neon
  // yellow-green): such pixels keep the water path's hue-preserving colour.
  // Subject pop (below) separates them by tone instead.
  const conf = Math.max(Math.min(clamp(confMap, 0, 1), veto) * k + confPix * (1 - k), personW) * confSignal * (1 - ow * redDeficit(r0, g0, b0));
  // Subject tone weight (open water): the whole-animal map trimmed per pixel, without the signal test (a dark back is part of the shark).
  const tone = ctx.settings.subjectPop ? clamp(p.subjectTone ?? 0, 0, 1) : 0;
  // Raw mask (before the tone gate) also takes the temporal layer's warped previous mask (GPU only; 0 here by default).
  const bdevP = ow > 0 && fit && fit.length === 18 ? backdropDev(lab0[0], pa, pb, u, v, fit) : 1;
  const subjRaw = ow > 0 && fit && fit.length === 18 ? Math.max(subjectWeight(ctx.depth, u, v, clamp(confMap, 0, 1) * k, bdevP), subjPrior * smoothstep(BACKDROP.subjLo, BACKDROP.subjHi, bdevP)) : 0;
  const [anS, anCore] = animalStrengthAt(ctx.depth, u, v);
  // AI subject overlay (grade-shader animalStrength with p24.y): water L / regional trust / ML alpha / ML weight.
  const an = ctx.seg && ctx.settings.subjectPop ? segSample(ctx.seg.strength, u, v) : null;
  const popK = ctx.settings.subjectPop ? popStrengthK(ctx.settings) : 0;
  const [, vla, vlb] = linearToOklab(p.veilColor[0], p.veilColor[1], p.veilColor[2]);
  const vln = Math.hypot(vla, vlb) || 1;
  const subj = Math.max(subjRaw, ow > 0 ? anCore * smoothstep(BACKDROP.holdLo, BACKDROP.holdHi, bdevP) : 0) * ow * tone * anS;
  if (ctx.debug) return [k, confPix, clamp(confMap, 0, 1)];
  const out = [0, 0, 0];
  const ew = Math.pow(p.exposure, p.waterExposure);
  // Water path: own brightness, toned-down balance, optional hue-preserving
  // dehaze (gives up part of the veil fraction; floor keeps pure water lit).
  const wd = 1 - s.dehaze * Math.min(0.9, lumBs / lumI) * smoothstep(DEHAZE_LUM.lo, DEHAZE_LUM.hi, lumI);
  for (let c = 0; c < 3; c++) {
    const water = srcC[c] * (c === 0 ? waterRed : p.waterWb[c]) * ew * wd;
    out[c] = water + (full[c] * p.exposure - water) * conf;
  }
  // Haze lift removal (murky frames): subtract a share of the frame's lifted
  // black from the luminance with a soft toe — luminance and frame constants
  // only, so no edges; the shadow floor below follows the same ratio.
  const tLift = hazeLiftT(p, s.hazeLift);
  let hf = 1;
  if (tLift[0] + tLift[1] + tLift[2] > 0) {
    const y0 = luminance(out[0], out[1], out[2]);
    // A pixel whose hue is far from the veil's (yellow algae, an orange
    // fish) has escaped the cast: it takes the hue-preserving (luminance
    // ratio) form, since per-channel subtraction shifts a hue toward its
    // dominant channel (yellow → orange).
    const far = hueFar(pa, pb, p);
    const rY = hazeLiftRatio(y0, s.hazeLift * p.hazeBlack * (1 - HAZE_LIFT.farKeep));
    for (let c = 0; c < 3; c++) out[c] *= hazeLiftRatio(out[c], tLift[c]) + (rY - hazeLiftRatio(out[c], tLift[c])) * far;
    hf = y0 > 1e-6 ? luminance(out[0], out[1], out[2]) / y0 : 1;
  }
  // Levels on luminance, ratio-preserving.
  let Y = luminance(out[0], out[1], out[2]);
  const Ylv = Y + ((Y - p.black) / (p.white - p.black) - Y) * p.levelsMix;
  let ratio = Y > 1e-5 ? Math.max(0, Ylv) / Y : 1;
  for (let c = 0; c < 3; c++) out[c] *= ratio;
  Y = Math.max(0, Ylv);

  // Subject pop weight (grade-shader popP): the engine-mask tone weight × pop strength × the user's Strength.
  // The pop fades out as the graded lightness drops (SUBJECT_POP.darkLo..Hi): dark parts keep the plain grade.
  // With an AI overlay on the frame the AI's weight alone (grade-shader toneWeight), and the pop strength is a sure
  // ML subject's own where the frame has no open water (popStrength).
  const cbY = Math.cbrt(Math.max(0, Y));
  const twAi = an ? segToneWeight(an, lab0, vla / vln, vlb / vln, tone, popK) : 0;
  const toneW = (an ? twAi : SUBJECT_POP.engineKeep * objectWeight(subj) * (SUBJECT_CLEAR.edgeFloor + (1 - SUBJECT_CLEAR.edgeFloor) * smoothstep(BACKDROP.subjLo, BACKDROP.subjHi, bdevP))) * smoothstep(SUBJECT_POP.darkLo, SUBJECT_POP.darkHi, cbY);
  const popS = Math.max(objectNeutralOf(p), an ? segPop(an[3]) : 0);
  const popP = toneW * popS * popK;
  // AI subject restore amount S (SEG_RESTORE): the AI weight (its own, lower dark fade) × the Pop multiplier.
  const segS = an ? twAi * smoothstep(SEG_RESTORE.darkLo, SEG_RESTORE.darkHi, cbY) * popK : 0;
  // Local contrast on encoded luminance (CLAHE), mixed by clarity (the subject takes more: SUBJECT_POP.clarity).
  if (s.clarity > 0) {
    const encY = linearToSrgb(clamp(Y, 0, 1));
    const eq = sampleClahe(ctx.clahe, u, v, encY);
    const encNew = encY + (eq - encY) * (s.clarity + SUBJECT_POP.clarity * popP);
    const Ynew = srgbToLinear(clamp(encNew, 0, 1));
    ratio = Y > 1e-5 ? Ynew / Y : 1;
    for (let c = 0; c < 3; c++) out[c] *= ratio;
  }

  // Shadow floor (never darker than the luminance-dependent fraction of the
  // source) and highlight shoulder — last, so levels/CLAHE can't undo them.
  {
    const yo = luminance(out[0], out[1], out[2]);
    const yMin = shadowFloorAt(lumI, p.shadowFloor) * lumI * ew * hf;
    let yt = Math.max(yo, yMin);
    // Green water (red.ts): murk (the water path) is never lifted above the source.
    yt = murkHold(yt, lumI, greenWeight(p) * (1 - conf));
    if (yt > p.knee) yt = p.knee + (1 - p.knee) * (1 - Math.exp(-(yt - p.knee) / (1 - p.knee)));
    if (yo > 1e-6) {
      if (yt !== yo) {
        const sc = yt / yo;
        out[0] *= sc; out[1] *= sc; out[2] *= sc;
      }
    } else {
      // Levels clipped this pixel to nothing (its luminance sat below a
      // black point locked from brighter frames): rebuild it from the source
      // at the floor luminance instead of leaving a hole of pure black.
      const sc = yt / lumI;
      out[0] = src[0] * sc; out[1] = src[1] * sc; out[2] = src[2] * sc;
    }
  }

  // Chroma control in Oklab: ceiling relative to the source chroma, then
  // the saturation control.
  const [, a0, bb0] = linearToOklab(r0, g0, b0);
  const cSrc = Math.hypot(a0, bb0);
  const lab1 = linearToOklab(Math.max(0, out[0]), Math.max(0, out[1]), Math.max(0, out[2]));
  const L = lab1[0];
  let a = lab1[1], b = lab1[2];
  let C = Math.hypot(a, b);
  const cMax = p.chromaK * cSrc + p.chromaC0;
  let scale = C > cMax ? cMax / C : 1;
  // Vivid far-hue pixels keep (most of) their source chroma.
  const vividW = smoothstep(VIVID.cLo, VIVID.cHi, cSrc) * hueFar(a0, bb0, p);
  const cMin = VIVID.keep * cSrc * vividW;
  if (C > 1e-6 && C * scale < cMin) scale = cMin / C;
  scale *= s.saturation;
  const onFar = hueFarAt(a0, bb0, p, OBJECT_NEUTRAL.farLo, OBJECT_NEUTRAL.farHi);
  // Red-starved subject chroma goes to a cool silver (a faint tint of the
  // water's own hue): a dead-neutral or greenish grey next to saturated blue
  // water reads peach by simultaneous contrast.
  // Green water (red.ts): the cast the balance could not remove goes to a muted blue-grey.
  [a, b] = greenNeutral(L, a, b, greenWeight(p) * (1 - RED.gnObjKeep * conf));
  // Engine-mask weight, softened where the subject's colour fades into the water's (grade-shader toneWeight).
  const tN = objectNeutral(L, a, b, r0, g0, b0, onFar, toneW, popS) * smoothstep(SUBJECT_POP.keepDarkLo, SUBJECT_POP.keepDarkHi, L);
  // In open blue water the person detector also fires on sharks and big
  // fish: skin colour only where the source has red left to be skin.
  const personS = person * (1 - objectNeutralOf(p) * redDeficit(r0, g0, b0));
  scale *= warmClamp(a, b, r0, g0, b0, onFar, personS, popS);
  const [na, nb] = clearCast(a * scale, b * scale, vla / vln, vlb / vln, tN / OBJECT_NEUTRAL.mix);
  // The cast left on the graded colour, before the subject's clearing: what the warm pull is for (WARM_POP.castLo..Hi).
  const castW = smoothstep(WARM_POP.castLo, WARM_POP.castHi, Math.hypot(a, b) * scale);
  // Lightness stays as graded: shading, counter-shading and highlights are the subject's own.
  const Ls = L;
  const skinned = skinTone(Ls, na, nb, personS);
  // Water-likeness for the look comes from the pixel's own hue (the mask or
  // the water/object split would cut one garment into differently treated parts).
  const looked = deepBlueLook(Ls, skinned[0], skinned[1], s.look, 1 - hueConf(pa, pb, p), hazeWeight(p), deepHaze(p));
  const guarded0 = redGuard(looked[0], looked[1], looked[2], a0, bb0, person, onFar);
  const guarded = warmMaterial(looked[0], guarded0[0], guarded0[1], greenWeight(p), onFar);
  // Vivid look (opt-in), then the near-white pink guard (always).
  // The subject keeps Vivid's colour but is spared part of its water darkening, and is lifted a little
  // (SUBJECT_POP).
  const vv = vividLook(looked[0], guarded[0], guarded[1], s.vivid ?? 0, greenWeight(p));
  const Lv = popP > 0 ? vividLook(looked[0], guarded[0], guarded[1], (s.vivid ?? 0) * (1 - SUBJECT_POP.vividKeep * Math.min(1, popP)), greenWeight(p))[0] : vv[0];
  const popDir = an ? ctx.seg!.popDir ?? 1 : 1;
  const Lp = Lv + SUBJECT_POP.lift * popP * popDir * 4 * Lv * Math.max(0, 1 - Lv);
  // The chroma follows part of the lift: a lifted blue-grey stays blue-grey.
  const cf = SUBJECT_POP.chromaFollowDark + (SUBJECT_POP.chromaFollow - SUBJECT_POP.chromaFollowDark) * smoothstep(SUBJECT_POP.keepDarkLo, SUBJECT_POP.keepDarkHi, Lv);
  const kc = 1 + cf * (Lp / Math.max(1e-4, Lv) - 1);
  vv[0] = Lp; vv[1] *= kc; vv[2] *= kc;
  const hn0 = highlightPink(vv[0], vv[1], vv[2]);
  const hn1 = popHue(hn0[0], hn0[1], a0, bb0, clamp(toneW * popS, 0, 1));
  const wk = smoothstep(WARM_POP.wLo, WARM_POP.wHi, toneW) * (an ? 1 : smoothstep(BACKDROP.subjLo, BACKDROP.subjHi, bdevP)) * (s.subjectPop ? Math.min(1, Math.max(0, s.subjectPopWarmth ?? 0)) : 0) * castW;
  const hn = warmPop(vv[0], hn1[0], hn1[1], wk);
  // Blue water style (opt-in): cobalt water, orange warm subjects, neutral silver, deeper shadows.
  const bl = blueLook(vv[0], hn[0], hn[1], s.blue ?? 0, greenWeight(p));
  // "Water colour" (WATER_TINT): the water's hue turned toward teal or a deeper blue; subjects keep theirs.
  [bl[1], bl[2]] = waterTint(bl[1], bl[2], ctx.waterTint ?? 0, greenWeight(p));
  // Saturation by hue (RICH_LOOK; rides on the Vivid amount): richer colour, warm subjects more.
  [bl[1], bl[2]] = richLook(bl[0], bl[1], bl[2], s.vivid ?? 0);
  // Seabed recovery (grade-shader, after the Blue water style): sand and reef to a warm neutral (and a little lighter) where the water left no red.
  if ((ctx.seabed ?? 0) > 0) {
    // A pixel whose own colour escaped the cast (yellow coral, an orange fish: vividW) is not the red-less ground.
    const sbw = seabedW(p, u, v) * (1 - vividW) * ctx.seabed!;
    bl[0] += SEABED.lift * sbw;
    bl[1] += (Math.cos(SEABED.hue) * SEABED.chroma + SEABED.keep * bl[1] - bl[1]) * sbw;
    bl[2] += (Math.sin(SEABED.hue) * SEABED.chroma + SEABED.keep * bl[2] - bl[2]) * sbw;
  }
  // AI subject restore (SEG_RESTORE; grade-shader segRestore): after every look, so none of them amplifies it.
  if (segS > 0) {
    const lr = (lumI + DETAIL_GUARD.eps) / (guideLum(ctx.depth, u, v) + DETAIL_GUARD.eps);
    [bl[0], bl[1], bl[2]] = segRestore(bl[0], bl[1], bl[2], segS, s.subjectPop ? Math.min(1, Math.max(0, s.subjectPopWarmth ?? 0)) : 0, lr, SUBJECT_POP.lift * popP * popDir);
  }
  // Tone target (analyze.ts TONE): one gamma on the graded lightness, the same for every pixel of the frame.
  if ((p.toneGamma ?? 1) > 1) bl[0] = Math.pow(Math.max(0, bl[0]), p.toneGamma!);
  const capped = capChroma(bl[0], bl[1], bl[2], Math.max(cSrc, wk * WARM_POP.cMin * 1.5, bl[3], segS > 0 ? SEG_RESTORE.warmMax : 0));
  const [r1, g1, b1] = oklabToLinear(bl[0], capped[0], capped[1]);
  void C;

  // Artifact guard: the pixel's detail against its base, at unit gain.
  const dr = base ? detailRatio(sr, sg, sb, r0, g0, b0) : 1;
  const [r2, g2, b2] = fitToGamut(r1 * dr, g1 * dr, b1 * dr);
  const rs = linearToSrgb(r2), gs = linearToSrgb(g2), bs = linearToSrgb(b2);
  if (ctx.trace) {
    const f3 = (v: number[]) => v.map((x) => +x.toFixed(3));
    Object.assign(ctx.trace, { subj, srcC: f3(srcC), redS: +redS.toFixed(2), lin: f3([r0, g0, b0]), z: +z.toFixed(2), k: +k.toFixed(2), conf: +conf.toFixed(2), veilScale: +veilScale.toFixed(2), B: f3(Bv), sig: +sig.toFixed(2), wSub: +wSub.toFixed(2), full: f3(full), outPreLevels: f3(out.map((v) => v)), Y: +Y.toFixed(3), C: +C.toFixed(3), cMax: +cMax.toFixed(3), scale: +scale.toFixed(2), o1: f3([r1, g1, b1]), o2: f3([r2, g2, b2]) });
  }
  return [
    sr + (rs - sr) * s.strength,
    sg + (gs - sg) * s.strength,
    sb + (bs - sb) * s.strength,
  ];
}

/** Warm pop (grade-shader warmPop): the subject's chroma toward a warm cream hue (k = weight × warmth). */
export function warmPop(L: number, a: number, b: number, k: number): [number, number] {
  if (k <= 0) return [a, b];
  const ct = Math.min(WARM_POP.cMax, Math.max(WARM_POP.keep * Math.hypot(a, b), WARM_POP.cMin * smoothstep(WARM_POP.lLo, WARM_POP.lHi, L)));
  // Along the warm hue: a linear mix; across it: faded faster, so the pull passes through neutral, never green.
  const wx = Math.cos(WARM_POP.hue), wy = Math.sin(WARM_POP.hue);
  const al = a * wx + b * wy, side = Math.pow(Math.max(0, 1 - k), WARM_POP.side);
  const m = al + (ct - al) * k;
  return [wx * m + (a - wx * al) * side, wy * m + (b - wy * al) * side];
}

/** Hue guard (grade-shader popHue): on the subject (weight w) the hue stays within SUBJECT_POP.hueMax of the source's. */
function popHue(a: number, b: number, as: number, bs: number, w: number): [number, number] {
  const C = Math.hypot(a, b), Cs = Math.hypot(as, bs);
  // Faded in with the source chroma: a near-white source hue is noise (a hard cut there leaves patches).
  w *= smoothstep(0.01, 0.04, Cs);
  if (w <= 0 || C < 1e-4) return [a, b];
  const ux = a / C, uy = b / C, sx = as / Cs, sy = bs / Cs;
  const cm = Math.cos(SUBJECT_POP.hueMax), sm = Math.sin(SUBJECT_POP.hueMax);
  if (ux * sx + uy * sy >= cm) return [a, b];
  const side = Math.sign(sx * uy - sy * ux);
  const lx = sx * cm - side * sy * sm, ly = sy * cm + side * sx * sm;
  const mx = ux + (lx - ux) * w, my = uy + (ly - uy) * w, n = Math.hypot(mx, my) || 1;
  return [(C * mx) / n, (C * my) / n];
}

/** The AI overlay texture (composeSegStrength) at upright (u, v), bilinear (grade-shader animalStrength). */
function segSample(t: { width: number; height: number; data: Float32Array }, u: number, v: number): [number, number, number, number] {
  const fx = Math.min(Math.max(u * t.width - 0.5, 0), t.width - 1), fy = Math.min(Math.max(v * t.height - 0.5, 0), t.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, t.width - 1), y1 = Math.min(y0 + 1, t.height - 1), tx = fx - x0, ty = fy - y0;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const a = t.data[(y0 * t.width + x0) * 4 + c], b = t.data[(y0 * t.width + x1) * 4 + c], d = t.data[(y1 * t.width + x0) * 4 + c], e = t.data[(y1 * t.width + x1) * 4 + c];
    out[c] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
  }
  return out;
}

/** How much a tracked ML subject is popped (its ML weight over SEG_TONE.popLo..popHi; grade-shader segPop). */
function segPop(a: number): number {
  return a > 0 ? smoothstep(SEG_TONE.popLo, SEG_TONE.popHi, a) : 0;
}

/**
 * The AI tone weight (grade-shader toneWeight with an overlay on the frame): 0 on and outside the mask's contour,
 * ramping in over SEG_TONE.rampIn of the read-back distance; on thin parts near the contour only as far as the
 * source pixel (Oklab lab0) departs from the local water (an[0]; its hue (vhx, vhy)); × the ML weight, the regional
 * trust and the Pop gate (SEG_RESTORE.popGate × the Pop multiplier `popK`: nothing at Pop 0). `tone` = p22.z.
 */
export function segToneWeight(an: readonly [number, number, number, number], lab0: readonly [number, number, number], vhx: number, vhy: number, tone: number, popK: number): number {
  if (an[3] <= 0) return 0;
  const d = (an[2] - 0.5) * 2 * SEG_TONE.alphaR;
  const ev = an[0] < 0 || an[0] > 2 ? 1 : smoothstep(SEG_TONE.evLo, SEG_TONE.evHi, Math.hypot(lab0[0] - an[0], lab0[1] * vhy - lab0[2] * vhx));
  const inner = ev + (1 - ev) * smoothstep(SEG_TONE.trustLo, SEG_TONE.trustHi, d);
  return smoothstep(0, SEG_TONE.rampIn, d) * inner * Math.max(tone, segPop(an[3])) * an[1] * Math.min(1, SEG_RESTORE.popGate * popK);
}

/** The analysis guide's luminance at upright (u, v), plain bilinear (no range weight): the source's low-pass. */
function guideLum(d: DepthMap, u: number, v: number): number {
  const fx = Math.min(Math.max(u * d.width - 0.5, 0), d.width - 1), fy = Math.min(Math.max(v * d.height - 0.5, 0), d.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, d.width - 1), y1 = Math.min(y0 + 1, d.height - 1), tx = fx - x0, ty = fy - y0;
  const at = (x: number, y: number) => { const i = (y * d.width + x) * 3; return luminance(d.guide[i], d.guide[i + 1], d.guide[i + 2]); };
  return (at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx) * (1 - ty) + (at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx) * ty;
}

/**
 * AI subject restore (SEG_RESTORE; mirrors grade-shader segRestore) on the finished Oklab colour: `s` = the AI tone
 * weight × the Pop multiplier (0..2), `warmth` = the Warmth slider (0..1), `lr` =
 * the source pixel's luminance over its neighbourhood's (the analysis guide), `lifted` = the lift Subject pop has
 * already applied (SUBJECT_POP.lift × P × the clip's direction; negative = deepened).
 */
export function segRestore(L: number, a: number, b: number, s: number, warmth: number, lr: number, lifted = 0): [number, number, number] {
  if (s <= 0) return [L, a, b];
  const R = SEG_RESTORE, wx = Math.cos(R.hue), wy = Math.sin(R.hue);
  // De-blue: a cool pixel loses chroma (hue kept); warm, green and magenta pixels keep theirs.
  const C = Math.hypot(a, b);
  const cool = C > 1e-5 ? smoothstep(0, 0.5, -(a * wx + b * wy) / C) : 0;
  const k = 1 - Math.min(R.castMax, R.cast * s) * cool;
  a *= k; b *= k;
  // Warm-up: chroma along the warm hue, never past warmMax along it; lit parts only, highlights stay white.
  const lit = smoothstep(R.litLo, R.litHi, L) * (1 - smoothstep(R.hiLo, R.hiHi, L));
  const add = clamp(R.warmMax * lit - (a * wx + b * wy), 0, R.warm * s * Math.min(1, 2 * warmth) * lit);
  a += wx * add; b += wy * add;
  // Local contrast against the neighbourhood, then the midtone lift: up to lift × S in all, whatever the pop's own
  // lift did (its dark fade, or its deepening of a subject darker than the water, is made up for).
  let L1 = L * Math.pow(clamp(lr, R.rMin, R.rMax), R.detail * s);
  L1 += Math.max(0, R.lift * s - lifted) * 4 * L1 * Math.max(0, 1 - L1);
  return [L1, a, b];
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Object neutral tone (see OBJECT_NEUTRAL in params.ts): the share of chroma
 * an object pixel loses because its corrected colour sits on the red-deficit
 * side (greens, cyans, blues) while the source had no red to restore it from.
 * (L, a, b) = corrected Oklab; r, g, bl = linear source; srcFar = source hue
 * farness from the veil (hueFar); conf = object confidence.
 */
/** Subject clearing (SUBJECT_CLEAR; mirrors grade-shader clearCast): part of the water's cast out of the chroma. */
export function clearCast(a: number, b: number, vha: number, vhb: number, g: number): [number, number] {
  const C = Math.hypot(a, b);
  if (g <= 0 || C < 1e-6) return [a, b];
  // The cast is the chroma along the water's hue: shrink the chroma by that share, bounded, without turning the hue.
  const pc = Math.max(0, a * vha + b * vhb);
  const c1 = Math.max(0, (C - g * Math.min(SUBJECT_CLEAR.k * pc, SUBJECT_CLEAR.cMax)) * (1 - g * SUBJECT_CLEAR.desat));
  return [(a * c1) / C, (b * c1) / C];
}

export function objectNeutral(L: number, a: number, b: number, r: number, g: number, bl: number, srcFar: number, conf: number, strength: number): number {
  if (strength <= 0 || conf <= 0) return 0;
  const C = Math.hypot(a, b);
  if (C < 1e-5) return 0;
  // Angle to the cyan (red-deficit) axis, compared through cosines (see hueConf).
  const cosang = (a * Math.cos(OBJECT_NEUTRAL.hue) + b * Math.sin(OBJECT_NEUTRAL.hue)) / C;
  const band = smoothstep(Math.cos(OBJECT_NEUTRAL.bandOut), Math.cos(OBJECT_NEUTRAL.bandIn), cosang);
  const redDef = 1 - smoothstep(OBJECT_NEUTRAL.rLo, OBJECT_NEUTRAL.rHi, r / Math.max(1e-4, g, bl));
  // Light objects only (a dark far reef keeps the water's tint instead of
  // turning into a grey-black mass), and never a source colour that already
  // escaped the cast (yellow fish: srcFar = hue far from the veil).
  const light = smoothstep(OBJECT_NEUTRAL.lLo, OBJECT_NEUTRAL.lHi, L);
  // With no source red at all every hue is unreliable (a red gain over noise
  // turns the belly orange just as its absence leaves it cyan): the band opens.
  return strength * OBJECT_NEUTRAL.mix * conf * (band + (1 - band) * redDef) * redDef * light * (1 - srcFar);
}

/** Object-confidence weight of the open-water subject treatment: saturates early, so a map that lags a moving subject still gives it (nearly) the full treatment. */
export function objectWeight(conf: number): number {
  return smoothstep(OBJECT_NEUTRAL.confLo, OBJECT_NEUTRAL.confHi, conf);
}

/**
 * Warm clamp for red-starved pixels in open-water frames: a source with no
 * red cannot be orange, so whatever warm chroma the red gain made of noise is
 * removed (the result is never pushed past neutral). Independent of the
 * object confidence (a lagging map leaves partial confidence, i.e. a partial
 * red gain, on a moving subject). Not for detected people (skin) or source
 * colours that already escaped the cast. Returns the chroma scale.
 */
export function warmClamp(a: number, b: number, r: number, g: number, bl: number, srcFar: number, person: number, strength: number): number {
  if (strength <= 0) return 1;
  const C = Math.hypot(a, b);
  if (C < 1e-5) return 1;
  const cosw = (a * Math.cos(OBJECT_NEUTRAL.warmHue) + b * Math.sin(OBJECT_NEUTRAL.warmHue)) / C;
  const redDef = 1 - smoothstep(OBJECT_NEUTRAL.rLo, OBJECT_NEUTRAL.rHi, r / Math.max(1e-4, g, bl));
  return 1 - strength * redDef * smoothstep(OBJECT_NEUTRAL.warmLo, OBJECT_NEUTRAL.warmHi, cosw) * (1 - srcFar) * (1 - clamp(person, 0, 1));
}

/** Oklab lightness added to an object pixel in an open-water frame (see OBJECT_NEUTRAL.lift). */
export function objectLift(L: number, conf: number, strength: number): number {
  if (strength <= 0 || conf <= 0) return 0;
  return OBJECT_NEUTRAL.lift * strength * conf * smoothstep(OBJECT_NEUTRAL.lLo - 0.1, OBJECT_NEUTRAL.lHi - 0.1, L) * (1 - smoothstep(0.82, 0.95, L));
}

/** 1 when the (linear) source has no red left next to green/blue (OBJECT_NEUTRAL.rLo..rHi). */
export function redDeficit(r: number, g: number, b: number): number {
  return 1 - smoothstep(OBJECT_NEUTRAL.rLo, OBJECT_NEUTRAL.rHi, r / Math.max(1e-4, g, b));
}

/** Skin memory colour on person pixels (mirrors the shaders; see SKIN in params.ts). Returns (a, b). */
export function skinTone(L: number, a: number, b: number, person: number): [number, number] {
  if (person <= 0) return [a, b];
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const wrap = (x: number) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
  const inBand = Math.max(1 - smoothstep(SKIN.bandIn, SKIN.bandOut, Math.abs(wrap(h - SKIN.bandHue))), 1 - smoothstep(SKIN.achroma * 0.5, SKIN.achroma, C));
  const w = smoothstep(SKIN.wLo, SKIN.wHi, person) * inBand * smoothstep(SKIN.lLo, SKIN.lHi, L) * (1 - smoothstep(SKIN.cLo, SKIN.cHi, C));
  if (w <= 0) return [a, b];
  const h2 = h + wrap(SKIN.hue - h) * SKIN.mix * w;
  const C2 = C + Math.max(0, SKIN.cMin - C) * w;
  return [C2 * Math.cos(h2), C2 * Math.sin(h2)];
}

/** Deep-blue look in Oklab (mirrors the shaders; see LOOK in params.ts). */
export function deepBlueLook(L: number, a: number, b: number, look: number, water: number, hazeW: number, deep = 0): [number, number, number] {
  if (look <= 0) return [L, a, b];
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const wrap = (x: number) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
  // The references tint the whole frame toward deep blue — water and reef
  // alike — and leave only skin (warm), blacks, whites and vivid colours
  // alone. Tinting by the water/object split instead left object patches
  // in their graded colour inside a blue frame (a halo around people).
  const vivid = smoothstep(LOOK.keepLo, LOOK.keepHi, C);
  const warm = (1 - smoothstep(LOOK.warmIn, LOOK.warmOut, Math.abs(wrap(h - LOOK.warmHue)))) * smoothstep(LOOK.warmLo + LOOK.warmHaze * hazeW, LOOK.warmHi + LOOK.warmHaze * hazeW, C);
  const far = smoothstep(LOOK.farLo, LOOK.farHi, Math.abs(wrap(h - LOOK.targetHue)));
  // Far hues keep part of their own hue in clear frames (reef variety); in
  // hazy frames the references tint everything, so the keep fades with haze.
  const darkHi = LOOK.darkLo + (LOOK.darkHi - LOOK.darkLo) * (1 - LOOK.darkHaze * hazeW);
  const wTint = (1 - vivid) * (1 - warm) * (1 - smoothstep(LOOK.brightLo, LOOK.brightHi, L)) * smoothstep(LOOK.darkLo, darkHi, L) * (1 - LOOK.farKeep * (1 - hazeW) * far);
  const w = wTint * look * LOOK.mix;
  const L2 = Math.pow(Math.max(0, L), 1 + LOOK.gamma * look) * (1 - LOOK.waterDim * look * water * (1 - hazeW));
  // Chroma target: in clear frames the tint never desaturates (an
  // already-blue pixel keeps its chroma); in hazy frames water goes to a
  // saturated deep blue while everything else (reef, rock) settles at a
  // grey-blue, as in the references.
  const keep = Math.max(C, LOOK.c0 + LOOK.c1 * L2);
  const ctWater = Math.max(C, (LOOK.c0 + LOOK.c1 * L2) * (1 + LOOK.hazeChroma * hazeW));
  const ctObj = keep + (LOOK.objChroma - keep) * hazeW;
  const Ct = ctObj + (ctWater - ctObj) * Math.max(water, deep);
  // Light near-neutral pixels (sand, white coral) go fully neutral.
  const ds = 1 - look * LOOK.neutralDesat * (1 - smoothstep(LOOK.neutralLo, LOOK.neutralHi, C)) * smoothstep(LOOK.neutralLLo, LOOK.neutralLHi, L);
  return [L2, (a + (Ct * Math.cos(LOOK.targetHue) - a) * w) * ds, (b + (Ct * Math.sin(LOOK.targetHue) - b) * w) * ds];
}

/**
 * Vivid look in Oklab (mirrors the shaders; see VIVID_LOOK in params.ts).
 * (L, a, b) = graded colour, v = amount (vividAmountOf),
 * g = green-water weight. Every weight is a smooth function of these.
 */
export function vividLook(L: number, a: number, b: number, v: number, g: number): [number, number, number] {
  if (v <= 0) return [L, a, b];
  const V = VIVID_LOOK;
  let C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const hh = h < 0 ? h + 2 * Math.PI : h;
  const d = h - V.target - 2 * Math.PI * Math.round((h - V.target) / (2 * Math.PI));
  const wC = smoothstep(V.cLo, V.cHi, C) * smoothstep(V.lLo, V.lHi, L);
  const hiKeep = 1 - smoothstep(V.bandHi0, V.bandHi1, hh);
  // Clear water: pull toward the target over the cyan band (vivid violets keep their hue).
  const band = smoothstep(V.bandLo0, V.bandLo1, hh) * hiKeep * (1 - smoothstep(V.violetCLo, V.violetCHi, C) * smoothstep(V.target, V.bandHi1, hh));
  // Green water: one coherent shift over the cool half of the frame.
  const gLo = smoothstep(V.greenLo0, V.greenLo1, hh);
  const gBand = gLo * (1 - smoothstep(V.greenTop0, V.greenTop1, hh));
  const h2 = h + ((1 - g) * band * V.pull * -d + g * gBand * V.greenShift) * wC * v;
  // Darker, slightly richer water: by hue and (gently) by chroma.
  const water = (1 - g) * band + g * gLo * hiKeep;
  // Darkening / chroma gain grow with the square of a wide chroma ramp: whitish water (the sun opening,
  // sunbeams, the surface) is left alone, saturated water gets the full look, and the tone curve stays
  // compressive in L (slope ≤ 1: bright water never sharpens into new edges).
  const cw = smoothstep(V.darkCLo, V.darkCHi, C);
  const w = water * cw * cw * v;
  C *= 1 + V.chroma * w * (1 - g);
  let L2 = L * (1 - (V.dark + (V.darkGreen - V.dark) * g) * w * smoothstep(V.darkLLo, V.darkLHi, L));
  // Shadow toe: blacks stay black.
  L2 *= 1 - V.blackK * v * (1 - smoothstep(V.blackLo, V.blackHi, L2));
  // Dark-area chroma bound (violet / green speckle in dark rock).
  const cD = V.shadowC0 + V.shadowC1 * smoothstep(V.shadowLLo, V.shadowLHi, L2);
  if (C > cD) C -= (C - cD) * (1 - V.shadowKeep) * v * (1 - smoothstep(V.shadowFadeLo, V.shadowFadeHi, L2));
  // Sun / surface highlight: bright water lifted gently toward a warm white.
  const lw = v * (1 + (water - 1) * smoothstep(0, V.liftNeutralC, C)) * smoothstep(V.liftLLo, 1, L);
  L2 += V.lift * lw * (1 - L2);
  C *= 1 - V.hiDesat * lw;
  const wt = V.warmC * lw;
  return [L2, C * Math.cos(h2) + wt * Math.cos(V.warmHue), C * Math.sin(h2) + wt * Math.sin(V.warmHue)];
}

/**
 * Blue water style in Oklab (mirrors the shaders; see BLUE_WATER in params.ts).
 * (L, a, b) = graded colour after Vivid, v = amount (blueAmountOf), g = green-water weight.
 * Returns (L, a, b, chroma floor for capChroma): the chroma the style sets on purpose is not rolled off.
 */
export function blueLook(L: number, a: number, b: number, v: number, g: number): [number, number, number, number] {
  if (v <= 0) return [L, a, b, 0];
  const B = BLUE_WATER;
  const C0 = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const hh = h < 0 ? h + 2 * Math.PI : h;
  // Warm subjects first, on the pixel's own hue (30°–120°: the pull never wraps): toward orange, richer.
  const warm = smoothstep(B.warmIn0, B.warmIn1, hh) * (1 - smoothstep(B.warmOut0, B.warmOut1, hh)) * smoothstep(B.warmCLo, B.warmCHi, C0) * smoothstep(B.warmLLo, B.warmLHi, L) * v;
  const hw = hh + (B.warmHue - hh) * B.warmPull * warm;
  const Cw = Math.max(C0, Math.min(C0 * (1 + B.warmGain * warm), B.warmCMax));
  let a2 = Cw * Math.cos(hw), b2 = Cw * Math.sin(hw);
  // Water: blend (a, b) toward the cobalt point; "water" by a linear projection on the warm direction (no hue angle).
  const s = a * Math.cos(B.warmDir) + b * Math.sin(B.warmDir);
  const cool = 1 - smoothstep(B.sLo, B.sHi, s);
  const vio = smoothstep(B.vcLo, B.vcHi, C0) * smoothstep(B.vio0, B.vio1, hh) * (1 - smoothstep(B.vio2, 2 * Math.PI, hh));
  const neutral = smoothstep(B.neutralLLo, B.neutralLHi, L) * (1 - smoothstep(B.neutralCLo, B.neutralCHi, C0));
  const ct = Math.min(B.cMax, B.cK * L) * (1 - B.hiDrop * smoothstep(B.hiLo, B.hiHi, L));
  const veg = smoothstep(B.vegCLo, B.vegCHi, C0) * smoothstep(B.vegIn0, B.vegIn1, hh) * (1 - smoothstep(B.vegOut0, B.vegOut1, hh)) * (1 - B.vegGreen * g);
  const w = B.mix * cool * (1 - vio) * (1 - veg) * (1 - neutral) * v;
  a2 += (ct * Math.cos(B.target) - a2) * w;
  b2 += (ct * Math.sin(B.target) - b2) * w;
  // Silver / white: neutral (cool side only; warm whites keep their warmth).
  const nk = 1 - B.neutralK * neutral * cool * v;
  a2 *= nk; b2 *= nk;
  // Deeper shadows (monotone in L).
  const L2 = L * (1 - B.shadowK * v * (1 - smoothstep(0, B.shadowHi, L)));
  return [L2, a2, b2, Math.max(ct * w, Cw * warm)];
}

/**
 * "Water colour" (mirrors the shaders; see WATER_TINT in params.ts): (a, b) = graded chroma after the water-hue map,
 * t = rotation at full water weight (radians, waterTintOf), g = green-water weight. Returns (a, b), same chroma.
 */
export function waterTint(a: number, b: number, t: number, g: number): [number, number] {
  if (t === 0) return [a, b];
  const B = BLUE_WATER;
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const hh = h < 0 ? h + 2 * Math.PI : h;
  // Water as the water-hue map sees it: the cool side of the warm projection, vegetation and vivid violets kept.
  const cool = 1 - smoothstep(B.sLo, B.sHi, a * Math.cos(B.warmDir) + b * Math.sin(B.warmDir));
  const vio = smoothstep(B.vcLo, B.vcHi, C) * smoothstep(B.vio0, B.vio1, hh) * (1 - smoothstep(B.vio2, 2 * Math.PI, hh));
  const veg = smoothstep(B.vegCLo, B.vegCHi, C) * smoothstep(B.vegIn0, B.vegIn1, hh) * (1 - smoothstep(B.vegOut0, B.vegOut1, hh)) * (1 - B.vegGreen * g);
  const ang = t * cool * (1 - vio) * (1 - veg);
  const cs = Math.cos(ang), sn = Math.sin(ang);
  return [a * cs - b * sn, a * sn + b * cs];
}

/** Saturation by hue (mirrors the shaders; see RICH_LOOK in params.ts). (L, a, b) = graded colour, v = Vivid amount. Returns (a, b). */
export function richLook(L: number, a: number, b: number, v: number): [number, number] {
  const C = Math.hypot(a, b);
  if (v <= 0 || C < 1e-6) return [a, b];
  const R = RICH_LOOK;
  const h = Math.atan2(b, a);
  const hh = h < 0 ? h + 2 * Math.PI : h;
  const warm = smoothstep(R.warmIn0, R.warmIn1, hh) * (1 - smoothstep(R.warmOut0, R.warmOut1, hh));
  const mag = smoothstep(R.magIn0, R.magIn1, hh) * (1 - smoothstep(R.magOut0, R.magOut1, hh));
  const tone = smoothstep(R.cLo, R.cHi, C) * smoothstep(R.lLo, R.lHi, L) * (1 - smoothstep(R.hiLo, R.hiHi, L));
  const cool = smoothstep(R.coolIn0, R.coolIn1, hh) * (1 - smoothstep(R.magOut0, R.magOut1, hh));
  const g = (R.gain * (1 - R.coolCut * cool) + R.warmGain * warm) * (1 - mag) * tone * v;
  const k = 1 + g * Math.exp(-C / (R.top + (R.warmTop - R.top) * warm));
  return [a * k, b * k];
}

/** Near-white pink guard (mirrors the shaders; see HIGHLIGHT_PINK in params.ts). Returns (a, b). */
export function highlightPink(L: number, a: number, b: number): [number, number] {
  const C = Math.hypot(a, b);
  if (C < 1e-6) return [a, b];
  const H = HIGHLIGHT_PINK;
  const h = Math.atan2(b, a);
  const dist = Math.abs(h - H.hue - 2 * Math.PI * Math.round((h - H.hue) / (2 * Math.PI)));
  const w = H.mix * smoothstep(H.lLo, H.lHi, L) * (1 - smoothstep(H.cLo, H.cHi, C)) * (1 - smoothstep(H.bandIn, H.bandOut, dist));
  return [a * (1 - w), b * (1 - w)];
}

/** Mirrors analyze.ts hueFarness: 1 when the hue is ≥ hueFarHi from the veil's. */
function hueFar(a: number, b: number, p: GradeParams): number {
  return hueFarAt(a, b, p, p.hueFarLo, p.hueFarHi);
}
function hueFarAt(a: number, b: number, p: GradeParams, lo: number, hi: number): number {
  const c = Math.hypot(a, b);
  if (c < p.achroma) return 0;
  const [, va, vb] = linearToOklab(p.veilColor[0], p.veilColor[1], p.veilColor[2]);
  const vn = Math.hypot(va, vb) || 1;
  const cosang = Math.max(-1, Math.min(1, (a * va / vn + b * vb / vn) / c));
  const t = 1 - smoothstep(Math.cos(hi), Math.cos(lo), cosang);
  return t * smoothstep(p.achroma, p.achroma * 2, c);
}

/** Mirrors analyze.ts hueConfidence using the packed veil hue. */
function hueConf(a: number, b: number, p: GradeParams): number {
  const c = Math.hypot(a, b);
  if (c < p.achroma) return 1;
  const [, va, vb] = linearToOklab(p.veilColor[0], p.veilColor[1], p.veilColor[2]);
  const vn = Math.hypot(va, vb) || 1;
  // Thresholds are angles; compare cosines instead of calling acos (whose
  // precision differs between GPU stacks and flips pixels at the boundary).
  const cosang = Math.max(-1, Math.min(1, (a * va / vn + b * vb / vn) / c));
  const t = 1 - smoothstep(Math.cos(p.cosHi), Math.cos(p.cosLo), cosang);
  const kk = smoothstep(p.achroma, p.achroma * 2, c);
  return t + (1 - t) * (1 - kk);
}


/** Plain bilinear sample of the fields map's object channel (mirrors the shaders' mapConf). */
function mapConfAt(d: DepthMap, u: number, v: number): number {
  const fx = Math.min(Math.max(u * d.width - 0.5, 0), d.width - 1);
  const fy = Math.min(Math.max(v * d.height - 0.5, 0), d.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, d.width - 1), y1 = Math.min(y0 + 1, d.height - 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x: number, y: number) => d.fields[(y * d.width + x) * 4 + 1];
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}
const RING: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
/**
 * Open-water subject weight: the whole-animal map at the pixel (one strength
 * over the animal, smooth at its outline), or — where the animal has moved
 * since the map was made — the map's maximum within BACKDROP.ringR texels,
 * trimmed to pixels that depart from the water surface (lenient ramp).
 */
function subjectWeight(d: DepthMap, u: number, v: number, coreJbu: number, dev: number): number {
  // Core: the colour-guided (joint bilateral) map times its guide match k: where
  // the animal has swum away the pixel no longer resembles the map's guide
  // colour (k → 0), so the lagging map leaves no toned ghost, while a stretch of
  // body that merely matches the water still matches its own guide (k ≈ 1).
  const core = Math.min(1, Math.max(0, coreJbu));
  let ring = 0;
  for (const [ox, oy] of RING) ring = Math.max(ring, mapConfAt(d, u + (ox * BACKDROP.ringR) / d.width, v + (oy * BACKDROP.ringR) / d.height));
  // Inside the animal (core ≈ 1) one strength; where the coarse map fades
  // (its outline, ~1 texel) the pixel's own departure decides, so the water
  // just outside the animal is never toned.
  // (A stretch of body lit exactly like the water stays toned; the engine
  // eases this channel fast in open water, so the map does not leave a toned
  // ghost where the animal was.)
  const trim = smoothstep(BACKDROP.subjLo, BACKDROP.subjHi, dev);
  const inner = smoothstep(BACKDROP.coreIn, 1, core) * smoothstep(BACKDROP.coreLo, BACKDROP.coreHi, dev);
  return Math.max(core * (trim + (1 - trim) * inner), Math.min(Math.min(1, ring), trim));
}

/** Luminance ratio of the source pixel (sRGB) to its base (linear), clamped (see DETAIL_GUARD). */
export function detailRatio(sr: number, sg: number, sb: number, br: number, bg: number, bb: number): number {
  const ys = luminance(srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb));
  const yb = luminance(br, bg, bb);
  return clamp((ys + DETAIL_GUARD.eps) / (yb + DETAIL_GUARD.eps), DETAIL_GUARD.rMin, DETAIL_GUARD.rMax);
}

/**
 * Artifact guard base: an edge-preserving (sigma-filter) average of the
 * source around pixel (x, y), mirroring the shaders' detailBase tap for tap.
 * Each tap is a bilinear sample at a half-texel offset, i.e. the mean of a
 * 2x2 texel block (exact in 8-bit filtering); taps whose colour differs from
 * the pixel by more than the noise floor drop out, so real edges stay sharp
 * while block steps and grain below the floor are averaged away. `guard` = 0
 * returns the pixel itself.
 */
export function detailBase(rgba: ArrayLike<number>, w: number, h: number, x: number, y: number, guard: number, scale = 255): [number, number, number] {
  const i0 = (y * w + x) * 4;
  const sr = rgba[i0] / scale, sg = rgba[i0 + 1] / scale, sb = rgba[i0 + 2] / scale;
  if (guard <= 0) return [sr, sg, sb];
  const kk = DETAIL_GUARD.k / (guard * guard);
  let ar = sr, ag = sg, ab = sb, sw = 1;
  const cx = (q: number) => (q < 0 ? 0 : q >= w ? w - 1 : q), cy = (q: number) => (q < 0 ? 0 : q >= h ? h - 1 : q);
  for (const [ox, oy, ws] of DETAIL_TAPS) {
    // half-texel offsets: texels floor(x + o) and floor(x + o) + 1, weight 1/2 each
    const fx = Math.floor(x + ox), fy = Math.floor(y + oy);
    const xa = cx(fx), xb = cx(fx + 1), ya = cy(fy), yb = cy(fy + 1);
    const a = (ya * w + xa) * 4, b = (ya * w + xb) * 4, c = (yb * w + xa) * 4, d = (yb * w + xb) * 4;
    const q = 4 * scale;
    const tr = (rgba[a] + rgba[b] + rgba[c] + rgba[d]) / q, tg = (rgba[a + 1] + rgba[b + 1] + rgba[c + 1] + rgba[d + 1]) / q, tb = (rgba[a + 2] + rgba[b + 2] + rgba[c + 2] + rgba[d + 2]) / q;
    const dr = tr - sr, dg = tg - sg, db = tb - sb;
    const wt = ws * Math.exp(-(dr * dr + dg * dg + db * db) * kk);
    ar += wt * tr; ag += wt * tg; ab += wt * tb; sw += wt;
  }
  return [ar / sw, ag / sw, ab / sw];
}

/**
 * Grades a whole RGBA image (upright): 8-bit, or floats in 0..1 (`scale` 1; the denoised source of TemporalNR).
 * `rect` = the part of the frame the image is (a crop graded with the whole frame's maps); default the whole frame.
 */
export function applyGrade(ctxIn: ApplyContext, rgba: ArrayLike<number>, w: number, h: number, rect?: { x: number; y: number; w: number; h: number }, scale = 255): Uint8ClampedArray {
  const ctx = resolveContext(ctxIn);
  const guard = detailGuardOf(ctx.params);
  const out = new Uint8ClampedArray(rgba.length);
  const rx = rect?.x ?? 0, ry = rect?.y ?? 0, rw = rect?.w ?? 1, rh = rect?.h ?? 1;
  for (let y = 0; y < h; y++) {
    const v = ry + ((y + 0.5) / h) * rh;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = gradePixel(ctx, rgba[i] / scale, rgba[i + 1] / scale, rgba[i + 2] / scale, rx + ((x + 0.5) / w) * rw, v, guard > 0 ? detailBase(rgba, w, h, x, y, guard, scale) : undefined);
      out[i] = r * 255 + 0.5;
      out[i + 1] = g * 255 + 0.5;
      out[i + 2] = b * 255 + 0.5;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Per-animal Subject pop strength and interior hold at upright (u, v) for a still (animals.ts stillStrength: each animal at its own
 * whole-or-nothing target; the engine tracks and eases them over time instead). Mirrors grade-shader animalStrength.
 */
const STILL_STRENGTH = new WeakMap<AnimalMap, Float32Array>();
function animalStrengthAt(d: DepthMap, u: number, v: number): [number, number] {
  const am = d.animals;
  if (!am) return [0, 0];
  let s = d.strength ?? STILL_STRENGTH.get(am);
  if (!s) { s = stillStrength(am).data; STILL_STRENGTH.set(am, s); }
  const W = am.width, H = am.height;
  const x = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
  const y = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
  // Interior hold read bilinearly (soft edge), as in the shaders.
  const fx = Math.min(Math.max(u * W - 0.5, 0), W - 1), fy = Math.min(Math.max(v * H - 0.5, 0), H - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const tx = fx - x0, ty = fy - y0;
  const g = (xx: number, yy: number) => s[(yy * W + xx) * 4 + 1];
  const core = (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
  return [s[(y * W + x) * 4], core];
}

// ------------------------------------------------------------------------------------------------------------
// Temporal noise reduction: CPU reference of the temporal layer's lum and flow passes and of the NR level and
// blend passes (temporal.ts GLSL_TP_LUM / GLSL_TP_FLOW / GLSL_NR_LEVEL / GLSL_NR and their WGSL twins), tap for
// tap. Images are upright, top row first: `rgb` = 3 floats per pixel (sRGB-encoded, 0..1).

/** Size of the temporal layer's low-resolution targets for a w × h frame. */
export function tpLowSize(w: number, h: number): [number, number] {
  return [Math.max(1, Math.ceil(w / TEMPORAL.scale)), Math.max(1, Math.ceil(h / TEMPORAL.scale))];
}

/** Pass 1 (lum): the encoded luminance of four bilinear taps 2 px around each low-resolution texel centre. */
export function tpLum(rgb: Float32Array, w: number, h: number): Float32Array {
  const [lw, lh] = tpLowSize(w, h);
  const out = new Float32Array(lw * lh);
  const cx = (q: number) => (q < 0 ? 0 : q >= w ? w - 1 : q), cy = (q: number) => (q < 0 ? 0 : q >= h ? h - 1 : q);
  const Y = (x: number, y: number) => { const i = (cy(y) * w + cx(x)) * 3; return 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2]; };
  const tap = (fx: number, fy: number) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    return (Y(x0, y0) * (1 - tx) + Y(x0 + 1, y0) * tx) * (1 - ty) + (Y(x0, y0 + 1) * (1 - tx) + Y(x0 + 1, y0 + 1) * tx) * ty;
  };
  for (let ly = 0; ly < lh; ly++) {
    const py = ((ly + 0.5) / lh) * h - 0.5;
    for (let lx = 0; lx < lw; lx++) {
      const px = ((lx + 0.5) / lw) * w - 0.5;
      out[ly * lw + lx] = 0.25 * (tap(px - 2, py - 2) + tap(px + 2, py - 2) + tap(px - 2, py + 2) + tap(px + 2, py + 2));
    }
  }
  return out;
}

/**
 * Pass 2 (flow): block matching of 3×3 luminance patches against the previous frame, ±flowR texels. Returns
 * (dx, dy, confidence) per low-resolution texel: this frame's texel x matches the previous frame at x + (dx, dy).
 */
export function tpFlow(cur: Float32Array, prev: Float32Array, lw: number, lh: number): Float32Array {
  const out = new Float32Array(lw * lh * 3);
  const R = TEMPORAL.flowR;
  const cx = (q: number) => (q < 0 ? 0 : q >= lw ? lw - 1 : q), cy = (q: number) => (q < 0 ? 0 : q >= lh ? lh - 1 : q);
  const c = new Float32Array(9);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      let k = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) c[k++] = cur[cy(y + oy) * lw + cx(x + ox)];
      const sad = (dx: number, dy: number) => {
        let s = 0, j = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) s += Math.abs(c[j++] - prev[cy(y + oy + dy) * lw + cx(x + ox + dx)]);
        return s / 9;
      };
      let best = 1e9, bx = 0, by = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const s = sad(dx, dy) + TEMPORAL.lambda * Math.hypot(dx, dy);
          if (s < best) { best = s; bx = dx; by = dy; }
        }
      }
      const o = (y * lw + x) * 3;
      out[o] = bx;
      out[o + 1] = by;
      out[o + 2] = 1 - smoothstep(TEMPORAL.sadLo, TEMPORAL.sadHi, best);
    }
  }
  return out;
}

/**
 * NR pass 1 (refine): the block flow taken to whole pixels of the working frame. Per low-resolution texel, a
 * refineTaps² grid of pixels across its block is compared (mean absolute difference over the channels) with the
 * history at the block's displacement plus an offset: first the 5×5 offsets of step refineStep, then the 3×3 of
 * step 1 around the best, each with a small bias (refineBias per pixel of offset) toward the block's own
 * displacement so flat, noisy blocks stay put. Returns (dx, dy, confidence) in pixels of the working frame; the
 * confidence is the block flow's × the block's own (NR.blockLo..blockHi: its remaining difference against the
 * noise level `levels`, the previous frame's nrLevel, at the block's luminance).
 */
export function nrRefine(src: Float32Array, hist: Float32Array | null, flow: Float32Array, levels: Float32Array | null, w: number, h: number, refine = true): Float32Array {
  const [lw, lh] = tpLowSize(w, h);
  const out = new Float32Array(lw * lh * 3);
  const T = NR.refineTaps, px = new Int32Array(T * T), py = new Int32Array(T * T);
  for (let ly = 0; ly < lh; ly++) {
    for (let lx = 0; lx < lw; lx++) {
      const o = (ly * lw + lx) * 3;
      const bx = Math.floor((flow[o] * w) / lw + 0.5), by = Math.floor((flow[o + 1] * h) / lh + 0.5);
      out[o] = bx; out[o + 1] = by; out[o + 2] = flow[o + 2];
      if (!hist) continue;
      let lum = 0;
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const x = (px[j * T + i] = clamp(Math.floor(((lx + (i + 0.5) / T) / lw) * w), 0, w - 1)), y = (py[j * T + i] = clamp(Math.floor(((ly + (j + 0.5) / T) / lh) * h), 0, h - 1));
        lum += (0.2126 * src[(y * w + x) * 3] + 0.7152 * src[(y * w + x) * 3 + 1] + 0.0722 * src[(y * w + x) * 3 + 2]) / (T * T);
      }
      const cost = (dx: number, dy: number) => {
        let sum = 0;
        for (let k = 0; k < T * T; k++) {
          const a = (py[k] * w + px[k]) * 3, b = (clamp(py[k] + by + dy, 0, h - 1) * w + clamp(px[k] + bx + dx, 0, w - 1)) * 3;
          sum += Math.abs(src[a] - hist[b]) + Math.abs(src[a + 1] - hist[b + 1]) + Math.abs(src[a + 2] - hist[b + 2]);
        }
        return sum / (T * T * 3) + NR.refineBias * (Math.abs(dx) + Math.abs(dy));
      };
      let best = cost(0, 0), ox = 0, oy = 0;
      for (const [reach, step] of refine ? [[2, NR.refineStep], [1, 1]] : []) {
        const cx = ox, cy = oy;
        for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++) {
          if (!i && !j) continue;
          const c = cost(cx + i * step, cy + j * step);
          if (c < best) { best = c; ox = cx + i * step; oy = cy + j * step; }
        }
      }
      out[o] = bx + ox; out[o + 1] = by + oy;
      if (levels) {
        const e0 = Math.max(nrLevelAt(levels, lum)[0], 1e-6);
        out[o + 2] = flow[o + 2] * (1 - smoothstep(NR.blockLo * e0, NR.blockHi * e0, best - NR.refineBias * (Math.abs(ox) + Math.abs(oy))));
      }
    }
  }
  return out;
}

/** A low-resolution (dx, dy, confidence) field read bilinearly at upright (u, v), as the full-resolution passes sample it. */
function flowAt(flow: Float32Array, lw: number, lh: number, u: number, v: number, out: Float32Array): void {
  const fx = Math.min(Math.max(u * lw - 0.5, 0), lw - 1), fy = Math.min(Math.max(v * lh - 0.5, 0), lh - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, lw - 1), y1 = Math.min(y0 + 1, lh - 1);
  const tx = fx - x0, ty = fy - y0;
  const a = (y0 * lw + x0) * 3, b = (y0 * lw + x1) * 3, c = (y1 * lw + x0) * 3, d = (y1 * lw + x1) * 3;
  for (let k = 0; k < 3; k++) out[k] = (flow[a + k] * (1 - tx) + flow[b + k] * tx) * (1 - ty) + (flow[c + k] * (1 - tx) + flow[d + k] * tx) * ty;
}

/** 3×3 tent average around (x, y): the mean of four bilinear taps half a pixel out on the diagonals (edges clamped). */
function tent3(img: Float32Array, w: number, h: number, x: number, y: number, out: Float32Array): void {
  const xa = x > 0 ? x - 1 : 0, xb = x < w - 1 ? x + 1 : w - 1, ya = y > 0 ? y - 1 : 0, yb = y < h - 1 ? y + 1 : h - 1;
  const r0 = ya * w, r1 = y * w, r2 = yb * w;
  for (let k = 0; k < 3; k++) {
    out[k] = (img[(r0 + xa) * 3 + k] + img[(r0 + xb) * 3 + k] + img[(r2 + xa) * 3 + k] + img[(r2 + xb) * 3 + k]
      + 2 * (img[(r0 + x) * 3 + k] + img[(r2 + x) * 3 + k] + img[(r1 + xa) * 3 + k] + img[(r1 + xb) * 3 + k]) + 4 * img[(r1 + x) * 3 + k]) / 16;
  }
}

/** Scratch for one pixel's history lookup (nrProbe): [m0, ml, inside, qIndex, confidence]. */
type NrProbe = { fl: Float32Array; a: Float32Array; b: Float32Array; m0: number; ml: number; inside: boolean; q: number; conf: number };
const nrScratch = (): NrProbe => ({ fl: new Float32Array(3), a: new Float32Array(3), b: new Float32Array(3), m0: 0, ml: 0, inside: false, q: 0, conf: 0 });

/**
 * One pixel against the history: the refined flow (nrRefine) at the pixel, rounded to whole pixels, gives the history texel q; m0 is
 * the largest channel difference between the source pixel and q, ml the same between their 3×3 tent averages.
 */
function nrProbe(src: Float32Array, hist: Float32Array, flow: Float32Array, w: number, h: number, lw: number, lh: number, x: number, y: number, s: NrProbe): void {
  flowAt(flow, lw, lh, (x + 0.5) / w, (y + 0.5) / h, s.fl);
  const qx = x + Math.floor(s.fl[0] + 0.5), qy = y + Math.floor(s.fl[1] + 0.5);
  s.conf = s.fl[2];
  s.inside = qx >= 0 && qy >= 0 && qx < w && qy < h;
  const cx = qx < 0 ? 0 : qx >= w ? w - 1 : qx, cy = qy < 0 ? 0 : qy >= h ? h - 1 : qy;
  const i = (y * w + x) * 3, q = (cy * w + cx) * 3;
  s.q = q;
  s.m0 = Math.max(Math.abs(src[i] - hist[q]), Math.abs(src[i + 1] - hist[q + 1]), Math.abs(src[i + 2] - hist[q + 2]));
  tent3(src, w, h, x, y, s.a);
  tent3(hist, w, h, cx, cy, s.b);
  s.ml = Math.max(Math.abs(s.a[0] - s.b[0]), Math.abs(s.a[1] - s.b[1]), Math.abs(s.a[2] - s.b[2]));
}

/**
 * The frame's noise levels (NR): per luminance bin, [e0, el] = the soft minimum over tiles of the mean pixel
 * difference and the mean 3×3-average difference between the source and the warped history (2 floats per bin).
 */
export function nrLevel(src: Float32Array, hist: Float32Array, flow: Float32Array, lumLow: Float32Array, w: number, h: number): Float32Array {
  const [lw, lh] = tpLowSize(w, h);
  const T = NR.tileTaps, B = NR.bins, s = nrScratch();
  const Y = (x: number, y: number) => lumLow[clamp(y, 0, lh - 1) * lw + clamp(x, 0, lw - 1)];
  const S0 = new Float64Array(B + 1), Sl = new Float64Array(B + 1), N = new Float64Array(B + 1);
  for (let ty = 0; ty < NR.tilesY; ty++) {
    for (let tx = 0; tx < NR.tilesX; tx++) {
      let a0 = 0, al = 0, lum = 0, tex = 0, n = 0;
      for (let j = 0; j < T; j++) {
        for (let i = 0; i < T; i++) {
          const x = Math.min(w - 1, Math.floor(((tx + (i + 0.5) / T) / NR.tilesX) * w)), y = Math.min(h - 1, Math.floor(((ty + (j + 0.5) / T) / NR.tilesY) * h));
          nrProbe(src, hist, flow, w, h, lw, lh, x, y, s);
          if (!s.inside) continue;
          // Texture: the low-resolution luminance's largest step to its four neighbours.
          const lx = Math.floor(((x + 0.5) / w) * lw), ly = Math.floor(((y + 0.5) / h) * lh), yc = Y(lx, ly);
          tex += Math.max(Math.abs(yc - Y(lx - 1, ly)), Math.abs(yc - Y(lx + 1, ly)), Math.abs(yc - Y(lx, ly - 1)), Math.abs(yc - Y(lx, ly + 1)));
          a0 += s.m0; al += s.ml; lum += 0.2126 * s.a[0] + 0.7152 * s.a[1] + 0.0722 * s.a[2]; n++;
        }
      }
      if (n * 2 < T * T || lum < NR.lumLo * n || lum > NR.lumHi * n || a0 < NR.dead * n) continue;
      const flat = 1 - smoothstep(NR.texLo, NR.texHi, tex / n);
      const r0 = (a0 / n + NR.eps) / NR.eps, rl = (al / n + NR.eps) / NR.eps;
      const q0 = flat / (r0 * r0 * r0 * r0), ql = flat / (rl * rl * rl * rl), pos = (lum / n) * (B - 1);
      S0[B] += q0; Sl[B] += ql; N[B] += flat;
      for (let b = 0; b < B; b++) {
        const wt = flat * Math.max(0, 1 - Math.abs(pos - b));
        S0[b] += wt * q0; Sl[b] += wt * ql; N[b] += wt;
      }
    }
  }
  const out = new Float32Array(B * 2);
  if (N[B] < NR.tilesMin) return out;
  const soft = (S: number, n: number) => Math.max(0, NR.eps / Math.sqrt(Math.sqrt(S / n)) - NR.eps);
  const g0 = soft(S0[B], N[B]), gl = soft(Sl[B], N[B]);
  for (let b = 0; b < B; b++) {
    const t = clamp(N[b] / NR.binMin, 0, 1);
    const b0 = N[b] > 0 ? Math.min(soft(S0[b], N[b]), NR.binMax * g0) : g0, bl = N[b] > 0 ? Math.min(soft(Sl[b], N[b]), NR.binMax * gl) : gl;
    out[b * 2] = Math.min(NR.eMax, g0 + (b0 - g0) * t);
    out[b * 2 + 1] = Math.min(NR.eMax, gl + (bl - gl) * t);
  }
  return out;
}

/** The levels [e0, el] at encoded luminance Y: linear between the bin centres (the shaders' filtered read of the level texture). */
export function nrLevelAt(levels: Float32Array, Y: number): [number, number] {
  const B = NR.bins, f = clamp(Y, 0, 1) * (B - 1), i = Math.min(B - 2, Math.floor(f)), t = f - i;
  return [levels[i * 2] + (levels[i * 2 + 2] - levels[i * 2]) * t, levels[i * 2 + 1] + (levels[i * 2 + 3] - levels[i * 2 + 1]) * t];
}

export { nrStrength, nrOpen };

/** The two motion tests of a pixel (NR): 1 = within the noise, 0 = a real change. */
export function nrKeep(m0: number, ml: number, e0: number, el: number): number {
  const a = Math.max(e0, 1e-6), b = Math.max(el, 1e-6);
  return (1 - smoothstep(NR.c0Lo * a, NR.c0Hi * a, m0)) * (1 - smoothstep(NR.lLo * b, NR.lHi * b, ml));
}

/**
 * The NR pass: the denoised frame (also the next frame's history), stored at `bits` per channel as the GPU target
 * stores it (RGB10_A2). `hist` null (no history yet, a cut, a seek) or level 0 returns the source.
 */
export function nrBlend(src: Float32Array, hist: Float32Array | null, flow: Float32Array, levels: Float32Array, level: number, w: number, h: number, bits = 10, stats?: { weight: number }): Float32Array {
  const [lw, lh] = tpLowSize(w, h);
  const out = new Float32Array(w * h * 3), Q = 2 ** bits - 1, s = nrScratch();
  const on = hist !== null && level > 0.5;
  let wsum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      let wt = 0;
      if (on) {
        nrProbe(src, hist!, flow, w, h, lw, lh, x, y, s);
        if (s.inside) {
          const [e0, el] = nrLevelAt(levels, 0.2126 * s.a[0] + 0.7152 * s.a[1] + 0.0722 * s.a[2]);
          wt = nrStrength(level, e0) * s.conf * nrKeep(s.m0, s.ml, e0, el);
        }
      }
      wsum += wt;
      for (let c = 0; c < 3; c++) {
        const v = wt > 0 ? src[i + c] + (hist![s.q + c] - src[i + c]) * wt : src[i + c];
        out[i + c] = Math.floor(v * Q + 0.5) / Q;
      }
    }
  }
  if (stats) stats.weight = wsum / (w * h);
  return out;
}

/** RGBA8 → rgb floats (0..1). */
export function rgbOf(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3);
  for (let i = 0, n = w * h; i < n; i++) { out[i * 3] = rgba[i * 4] / 255; out[i * 3 + 1] = rgba[i * 4 + 1] / 255; out[i * 3 + 2] = rgba[i * 4 + 2] / 255; }
  return out;
}

/**
 * The temporal NR as the backends run it, frame after frame: lum → flow → level → blend, the result kept as the
 * next frame's history (lum → flow → refine, against the previous frame's levels → level → blend), idling
 * while the gate is shut exactly as backend-webgl2.ts does. `step` returns the denoised source (rgb floats) the grade then reads.
 */
export class TemporalNR {
  private lumPrev: Float32Array | null = null;
  private hist: Float32Array | null = null;
  private w = 0;
  private h = 0;
  /** The last frame's noise levels (nrLevel) and flow (diagnostics, the eval). */
  levels: Float32Array = new Float32Array(NR.bins * 2);
  flow: Float32Array | null = null;
  /** The last frame's mean blend weight toward the history (diagnostics). */
  weight = 0;
  /** Options: `refine` false = the block flow alone (no pixel refinement), `bits` = history precision. */
  private readonly opts: { refine?: boolean; bits?: number };
  constructor(opts: { refine?: boolean; bits?: number } = {}) { this.opts = opts; }

  /** Idle (NR.idleEvery): the gate was shut at the last measurement, frames pass through untouched. */
  idle = true;
  private count = NR.idleEvery - 2;

  /** Forgets the history (scene cut, seek); an idle reduction measures again on the next two frames. */
  reset(): void {
    this.lumPrev = null;
    this.hist = null;
    if (this.idle) this.count = NR.idleEvery - 2;
  }

  step(rgba: ArrayLike<number>, w: number, h: number, level: number): Float32Array {
    if (w !== this.w || h !== this.h) { this.reset(); this.w = w; this.h = h; }
    const src = rgbOf(rgba, w, h);
    const [lw, lh] = tpLowSize(w, h);
    const lum = tpLum(src, w, h);
    const block = this.lumPrev ? tpFlow(lum, this.lumPrev, lw, lh) : new Float32Array(lw * lh * 3);
    this.lumPrev = lum;
    this.weight = 0;
    if (level < 0.5) { this.hist = null; this.levels = new Float32Array(NR.bins * 2); this.flow = null; return src; }
    const bits = this.opts.bits ?? 10, M = NR.idleEvery;
    if (this.idle) {
      // Shut gate: every idleEvery-th frame is measured against a copy of the frame before it; the rest cost nothing.
      const phase = this.count++ % M;
      if (phase === M - 2) { this.hist = nrBlend(src, null, block, this.levels, level, w, h, bits); return src; }
      if (phase !== M - 1 || !this.hist) { this.hist = null; return src; }
      const flow = nrRefine(src, this.hist, block, this.levels, w, h, this.opts.refine !== false);
      this.flow = flow;
      this.levels = nrLevel(src, this.hist, flow, lum, w, h);
      if (!nrOpen(level, this.levels)) { this.hist = null; return src; }
      this.idle = false;
      this.count = 0;
      return (this.hist = nrBlend(src, this.hist, flow, this.levels, level, w, h, bits, this));
    }
    const flow = nrRefine(src, this.hist, block, this.levels, w, h, this.opts.refine !== false);
    this.flow = flow;
    this.levels = this.hist ? nrLevel(src, this.hist, flow, lum, w, h) : new Float32Array(NR.bins * 2);
    const measured = this.hist !== null;
    const out = nrBlend(src, this.hist, flow, this.levels, level, w, h, bits, this);
    this.hist = out;
    // Open: every idleEvery-th measured frame checks whether the gate has shut.
    if (measured && ++this.count % M === 0 && !nrOpen(level, this.levels)) { this.idle = true; this.count = 0; this.hist = null; }
    return out;
  }
}
