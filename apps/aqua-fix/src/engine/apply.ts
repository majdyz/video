// CPU reference of the grade shader. One pixel at a time, same stages and
// constants as GLSL/WGSL in grade-shader.ts — used by the Node harness and
// the unit tests, never in the render path.

import { capChroma, fitToGamut, linearToOklab, linearToSrgb, luminance, oklabToLinear, srgbToLinear } from "./color.ts";
import { TEMPORAL, DETAIL_GUARD, DETAIL_TAPS, detailGuardOf, OBJECT_NEUTRAL, objectNeutralOf, CONF_BRIGHT, DEHAZE_LUM, LOOK, PERSON_LUM, SKIN, ULAP, VIVID, HAZE_LIFT, boostParams, deepHaze, hazeLiftRatio, hazeLiftT, hazeParams, hazeSettings, hazeWeight, lookParams, lookSettings, presetParams, presetSettings, pushOf, resolveSettings, type ClaheLuts, type DepthMap, type GradeParams, type GradeSettings, type UserSettings } from "./params.ts";
import { shadowFloorAt } from "./analyze.ts";
import { calmParams, calmSettings } from "./calm.ts";
import { BACKDROP, backdropDev, backdropSubject } from "./backdrop.ts";

export type ApplyContext = {
  /** When set, gradePixel returns (k, confPix, confMap) instead of a colour. */
  debug?: boolean;
  /** When set, gradePixel records its intermediates here (diagnostics). */
  trace?: Record<string, unknown>;
  params: GradeParams;
  settings: UserSettings;
  depth: DepthMap;
  clahe: ClaheLuts;
};

/** The context as gradePixel reads it: intensity already resolved. */
type PixelContext = Omit<ApplyContext, "settings"> & { settings: GradeSettings };

export function resolveContext(ctx: ApplyContext): PixelContext {
  const hz = ctx.settings.hazeAuto !== false;
  const params = lookParams((hz ? hazeParams : (p: GradeParams) => p)(presetParams(boostParams(calmParams(ctx.params), pushOf(ctx.settings)), ctx.settings)), ctx.settings);
  const base = presetSettings(calmSettings(resolveSettings(ctx.settings), params), ctx.settings);
  return { ...ctx, params, settings: lookSettings(hz ? hazeSettings(base, params) : base, params) };
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
  const wSub = smoothstep(p.subLo, p.subHi, sig) * (1 - hueFar(pa, pb, p));
  const prop = Math.max(p.floorFrac, 1 - lumBs / lumI);
  const full = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const I = src[c];
    const per = Math.max(I - Bs[c], I * p.floorFrac);
    const D = I * prop + (per - I * prop) * wSub;
    const rangeGain = Math.min(p.gainCap, Math.max(1 / p.gainCap, Math.exp(p.attn[c] * (z - p.zMean))));
    full[c] = D * rangeGain * p.wb[c];
  }
  // Per-pixel classification for the fallback: hue against the veil and
  // the signal fraction, the same tests the analysis runs on the thumbnail.
  const confSignal = smoothstep(p.confLo, p.confHi, sig);
  const confBright = smoothstep(CONF_BRIGHT.lo, CONF_BRIGHT.hi, sig);
  // In open water (backdrop frames) the hue test does not decide (see analyze.ts).
  const ow = objectNeutralOf(p);
  const fit = p.backdropFit;
  const bsub = ow > 0 && fit && fit.length === 18 ? backdropSubject(lab0[0], pa, pb, u, v, fit) : 1;
  const confPix = Math.min(confSignal, Math.max(hueConf(pa, pb, p) * (1 + (bsub - 1) * ow), confBright));
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
  const subjRaw = ow > 0 && fit && fit.length === 18 ? Math.max(subjectWeight(ctx.depth, u, v, clamp(confMap, 0, 1) * k, bdevP), subjPrior * (smoothstep(TEMPORAL.priorLo, TEMPORAL.priorHi, bdevP) + (smoothstep(TEMPORAL.inLo, TEMPORAL.inHi, bdevP) - smoothstep(TEMPORAL.priorLo, TEMPORAL.priorHi, bdevP)) * smoothstep(TEMPORAL.priorIn, 1, subjPrior))) : 0;
  const subj = subjRaw * ow * tone;
  if (ctx.debug) return [k, confPix, clamp(confMap, 0, 1)];
  const out = [0, 0, 0];
  const ew = Math.pow(p.exposure, p.waterExposure);
  // Water path: own brightness, toned-down balance, optional hue-preserving
  // dehaze (gives up part of the veil fraction; floor keeps pure water lit).
  const wd = 1 - s.dehaze * Math.min(0.9, lumBs / lumI) * smoothstep(DEHAZE_LUM.lo, DEHAZE_LUM.hi, lumI);
  for (let c = 0; c < 3; c++) {
    const water = src[c] * p.waterWb[c] * ew * wd;
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

  // Local contrast on encoded luminance (CLAHE), mixed by clarity.
  if (s.clarity > 0) {
    const encY = linearToSrgb(clamp(Y, 0, 1));
    const eq = sampleClahe(ctx.clahe, u, v, encY);
    const encNew = encY + (eq - encY) * s.clarity;
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
  const [L, a, b] = linearToOklab(Math.max(0, out[0]), Math.max(0, out[1]), Math.max(0, out[2]));
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
  const tN = objectNeutral(L, a, b, r0, g0, b0, onFar, objectWeight(subj), objectNeutralOf(p));
  // In open blue water the person detector also fires on sharks and big
  // fish: skin colour only where the source has red left to be skin.
  const personS = person * (1 - objectNeutralOf(p) * redDeficit(r0, g0, b0));
  scale *= warmClamp(a, b, r0, g0, b0, onFar, personS, objectNeutralOf(p));
  const [, vla, vlb] = linearToOklab(p.veilColor[0], p.veilColor[1], p.veilColor[2]);
  const vln = Math.hypot(vla, vlb) || 1;
  const na = a * scale + ((vla / vln) * OBJECT_NEUTRAL.silver - a * scale) * tN;
  const nb = b * scale + ((vlb / vln) * OBJECT_NEUTRAL.silver - b * scale) * tN;
  // Subjects in open water also step forward a little in lightness.
  const Ls = L + objectLift(L, objectWeight(subj), objectNeutralOf(p));
  const skinned = skinTone(Ls, na, nb, personS);
  // Water-likeness for the look comes from the pixel's own hue (the mask or
  // the water/object split would cut one garment into differently treated parts).
  const looked = deepBlueLook(Ls, skinned[0], skinned[1], s.look, 1 - hueConf(pa, pb, p), hazeWeight(p), deepHaze(p));
  const capped = capChroma(looked[0], looked[1], looked[2], cSrc);
  const [r1, g1, b1] = oklabToLinear(looked[0], capped[0], capped[1]);
  void C;

  // Artifact guard: the pixel's detail against its base, at unit gain.
  const dr = base ? detailRatio(sr, sg, sb, r0, g0, b0) : 1;
  const [r2, g2, b2] = fitToGamut(r1 * dr, g1 * dr, b1 * dr);
  const rs = linearToSrgb(r2), gs = linearToSrgb(g2), bs = linearToSrgb(b2);
  if (ctx.trace) {
    const f3 = (v: number[]) => v.map((x) => +x.toFixed(3));
    Object.assign(ctx.trace, { lin: f3([r0, g0, b0]), z: +z.toFixed(2), k: +k.toFixed(2), conf: +conf.toFixed(2), veilScale: +veilScale.toFixed(2), B: f3(Bv), sig: +sig.toFixed(2), wSub: +wSub.toFixed(2), full: f3(full), outPreLevels: f3(out.map((v) => v)), Y: +Y.toFixed(3), C: +C.toFixed(3), cMax: +cMax.toFixed(3), scale: +scale.toFixed(2), o1: f3([r1, g1, b1]), o2: f3([r2, g2, b2]) });
  }
  return [
    sr + (rs - sr) * s.strength,
    sg + (gs - sg) * s.strength,
    sb + (bs - sb) * s.strength,
  ];
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
  const inner = smoothstep(BACKDROP.coreIn, 1, core);
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
export function detailBase(rgba: Uint8ClampedArray, w: number, h: number, x: number, y: number, guard: number): [number, number, number] {
  const i0 = (y * w + x) * 4;
  const sr = rgba[i0] / 255, sg = rgba[i0 + 1] / 255, sb = rgba[i0 + 2] / 255;
  if (guard <= 0) return [sr, sg, sb];
  const kk = DETAIL_GUARD.k / (guard * guard);
  let ar = sr, ag = sg, ab = sb, sw = 1;
  const cx = (q: number) => (q < 0 ? 0 : q >= w ? w - 1 : q), cy = (q: number) => (q < 0 ? 0 : q >= h ? h - 1 : q);
  for (const [ox, oy, ws] of DETAIL_TAPS) {
    // half-texel offsets: texels floor(x + o) and floor(x + o) + 1, weight 1/2 each
    const fx = Math.floor(x + ox), fy = Math.floor(y + oy);
    const xa = cx(fx), xb = cx(fx + 1), ya = cy(fy), yb = cy(fy + 1);
    const a = (ya * w + xa) * 4, b = (ya * w + xb) * 4, c = (yb * w + xa) * 4, d = (yb * w + xb) * 4;
    const tr = (rgba[a] + rgba[b] + rgba[c] + rgba[d]) / 1020, tg = (rgba[a + 1] + rgba[b + 1] + rgba[c + 1] + rgba[d + 1]) / 1020, tb = (rgba[a + 2] + rgba[b + 2] + rgba[c + 2] + rgba[d + 2]) / 1020;
    const dr = tr - sr, dg = tg - sg, db = tb - sb;
    const wt = ws * Math.exp(-(dr * dr + dg * dg + db * db) * kk);
    ar += wt * tr; ag += wt * tg; ab += wt * tb; sw += wt;
  }
  return [ar / sw, ag / sw, ab / sw];
}

/** Grades a whole RGBA8 image (upright). */
export function applyGrade(ctxIn: ApplyContext, rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const ctx = resolveContext(ctxIn);
  const guard = detailGuardOf(ctx.params);
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = gradePixel(ctx, rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255, (x + 0.5) / w, v, guard > 0 ? detailBase(rgba, w, h, x, y, guard) : undefined);
      out[i] = r * 255 + 0.5;
      out[i + 1] = g * 255 + 0.5;
      out[i + 2] = b * 255 + 0.5;
      out[i + 3] = 255;
    }
  }
  return out;
}
