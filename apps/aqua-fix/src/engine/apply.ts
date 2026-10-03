// CPU reference of the grade shader. One pixel at a time, same stages and
// constants as GLSL/WGSL in grade-shader.ts — used by the Node harness and
// the unit tests, never in the render path.

import { compressToGamut, linearToOklab, linearToSrgb, luminance, oklabToLinear, srgbToLinear } from "./color.ts";
import { CONF_BRIGHT, LOOK, SKIN, ULAP, boostParams, pushOf, resolveSettings, type ClaheLuts, type DepthMap, type GradeParams, type GradeSettings, type UserSettings } from "./params.ts";
import { shadowFloorAt } from "./analyze.ts";

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
  return { ...ctx, params: boostParams(ctx.params, pushOf(ctx.settings)), settings: resolveSettings(ctx.settings) };
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

/** Grades one sRGB pixel (0..1) at upright uv. Returns sRGB 0..1. */
export function gradePixel(ctx: PixelContext, sr: number, sg: number, sb: number, u: number, v: number): [number, number, number] {
  const { params: p, settings: s } = ctx;
  const r0 = srgbToLinear(sr), g0 = srgbToLinear(sg), b0 = srgbToLinear(sb);

  // Range proxy: coarse map plus guided per-pixel detail from the prior.
  const dPix = ULAP.mu0 + ULAP.mu1 * Math.max(sg, sb) + ULAP.mu2 * sr;
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
  const [, pa, pb] = linearToOklab(r0, g0, b0);
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
  const confPix = Math.min(confSignal, Math.max(hueConf(pa, pb, p), confBright));
  // A pixel the veil model would nearly erase takes the water path whatever
  // the map says (see grade-shader.ts).
  // A detected person is an object whatever the colour tests say (the
  // "tiny D" protection via confSignal still applies).
  const conf = Math.max(clamp(confMap, 0, 1) * k + confPix * (1 - k), person) * confSignal;
  if (ctx.debug) return [k, confPix, clamp(confMap, 0, 1)];
  const out = [0, 0, 0];
  const ew = Math.pow(p.exposure, p.waterExposure);
  // Water path: own brightness, toned-down balance, optional hue-preserving
  // dehaze (gives up part of the veil fraction; floor keeps pure water lit).
  const wd = 1 - s.dehaze * Math.min(0.9, lumBs / lumI);
  for (let c = 0; c < 3; c++) {
    const water = src[c] * p.waterWb[c] * ew * wd;
    out[c] = water + (full[c] * p.exposure - water) * conf;
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
    const yMin = shadowFloorAt(lumI, p.shadowFloor) * lumI * ew;
    let yt = Math.max(yo, yMin);
    if (yt > p.knee) yt = p.knee + (1 - p.knee) * (1 - Math.exp(-(yt - p.knee) / (1 - p.knee)));
    if (yo > 1e-6 && yt !== yo) {
      const sc = yt / yo;
      out[0] *= sc; out[1] *= sc; out[2] *= sc;
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
  scale *= s.saturation;
  const skinned = skinTone(L, a * scale, b * scale, person);
  const looked = deepBlueLook(L, skinned[0], skinned[1], s.look, 1 - conf);
  const [r1, g1, b1] = oklabToLinear(looked[0], looked[1], looked[2]);
  void C;

  const [r2, g2, b2] = compressToGamut(r1, g1, b1);
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

/** Skin memory colour on person pixels (mirrors the shaders; see SKIN in params.ts). Returns (a, b). */
export function skinTone(L: number, a: number, b: number, person: number): [number, number] {
  if (person <= 0) return [a, b];
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const wrap = (x: number) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
  const inBand = Math.max(1 - smoothstep(SKIN.bandIn, SKIN.bandOut, Math.abs(wrap(h - SKIN.bandHue))), 1 - smoothstep(SKIN.achroma * 0.5, SKIN.achroma, C));
  const w = person * inBand * smoothstep(SKIN.lLo, SKIN.lHi, L) * (1 - smoothstep(SKIN.cLo, SKIN.cHi, C));
  if (w <= 0) return [a, b];
  const h2 = h + wrap(SKIN.hue - h) * SKIN.mix * w;
  const C2 = C + Math.max(0, SKIN.cMin - C) * w;
  return [C2 * Math.cos(h2), C2 * Math.sin(h2)];
}

/** Deep-blue look in Oklab (mirrors the shaders; see LOOK in params.ts). */
export function deepBlueLook(L: number, a: number, b: number, look: number, water: number): [number, number, number] {
  if (look <= 0) return [L, a, b];
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const wrap = (x: number) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
  // The tint follows the engine's own water/object split: water (and the far
  // reef the model can't separate from it) goes deep blue; graded objects
  // keep their colour. Warm, very light or vivid pixels are never tinted.
  const vivid = smoothstep(LOOK.keepLo, LOOK.keepHi, C);
  const warm = (1 - smoothstep(LOOK.warmIn, LOOK.warmOut, Math.abs(wrap(h - LOOK.warmHue)))) * smoothstep(LOOK.warmLo, LOOK.warmHi, C);
  const wTint = water * (1 - vivid) * (1 - warm) * (1 - smoothstep(LOOK.brightLo, LOOK.brightHi, L));
  const w = wTint * look * LOOK.mix;
  const L2 = Math.pow(Math.max(0, L), 1 + LOOK.gamma * look) * (1 - LOOK.dim * look);
  const Ct = LOOK.c0 + LOOK.c1 * L2;
  return [L2, a + (Ct * Math.cos(LOOK.targetHue) - a) * w, b + (Ct * Math.sin(LOOK.targetHue) - b) * w];
}

/** Mirrors analyze.ts hueFarness: 1 when the hue is ≥ hueFarHi from the veil's. */
function hueFar(a: number, b: number, p: GradeParams): number {
  const c = Math.hypot(a, b);
  if (c < p.achroma) return 0;
  const [, va, vb] = linearToOklab(p.veilColor[0], p.veilColor[1], p.veilColor[2]);
  const vn = Math.hypot(va, vb) || 1;
  const cosang = Math.max(-1, Math.min(1, (a * va / vn + b * vb / vn) / c));
  const t = 1 - smoothstep(Math.cos(p.hueFarHi), Math.cos(p.hueFarLo), cosang);
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


/** Grades a whole RGBA8 image (upright). */
export function applyGrade(ctxIn: ApplyContext, rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const ctx = resolveContext(ctxIn);
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = gradePixel(ctx, rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255, (x + 0.5) / w, v);
      out[i] = r * 255 + 0.5;
      out[i + 1] = g * 255 + 0.5;
      out[i + 2] = b * 255 + 0.5;
      out[i + 3] = 255;
    }
  }
  return out;
}
