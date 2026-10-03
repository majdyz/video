// Engine parameter model and the packed uniform layout both shaders read.
// The analysis pass produces a GradeParams for the current frame; the
// temporal smoother blends them; packUniforms() serialises them.

import { UNIFORM_FLOATS } from "./backend.ts";
import { linearToOklab } from "./color.ts";

/** ULAP depth prior (Song et al. 2018): d = mu0 + mu1·max(G,B) + mu2·R on 0..1 sRGB. */
export const ULAP = { mu0: 0.53214829, mu1: 0.51309827, mu2: -0.91066194 };

/**
 * The one user-facing control. Everything else is estimated per frame.
 * 0 = source, 1 = the estimated correction as is, 2 = pushed: the balance,
 * range compensation, veil removal and chroma are all driven harder than
 * the estimate (reds redder, sand whiter, at the cost of some fidelity).
 */
export type UserSettings = {
  intensity: number;
  /** Advanced: Oklab chroma multiplier, 0..2 (1 = as corrected). */
  saturation: number;
  /** Advanced: local-contrast (CLAHE) mix, 0..1. */
  clarity: number;
  /** Advanced: backscatter subtraction amount, 0..1.2 (1 = as fitted). */
  veil: number;
  /**
   * Deep-blue look, 0..1: a creative grade on top of the correction —
   * darker with mild shadow crush, and the water (per the engine's own
   * water/object split) tinted toward deep blue; graded objects keep their
   * colour.
   */
  look: number;
};

export const DEFAULT_SETTINGS: UserSettings = { intensity: 1, saturation: 1, clarity: 0.25, veil: 0.7, look: 0 };
export const INTENSITY_MAX = 2;

/** Internal controls the shader reads, derived from the intensity. */
export type GradeSettings = {
  /** Overall mix between source and corrected, 0..1. */
  strength: number;
  /** Oklab chroma multiplier (1 = as corrected). */
  saturation: number;
  /** Local-contrast (CLAHE) mix, 0..1. */
  clarity: number;
  /** Backscatter subtraction amount (1 = as fitted). */
  veil: number;
  /** Deep-blue look amount, 0..1. */
  look: number;
  /**
   * Water-path dehaze, 0..1: how much of the (hue-preserving) veil the
   * water path gives up. 0 keeps water at its own brightness; the push
   * raises it so murky far reef gains contrast and water goes darker.
   */
  dehaze: number;
};

/**
 * Signal fraction above which a pixel counts as an object whatever its hue:
 * sig = 1 − lumWater/lumPixel, so 0.55 → 2.2× brighter than the water at
 * its range, 0.78 → 4.5×. Skin, sand and pale coral share the water's hue
 * under a cyan cast, yet nothing that bright is water.
 */
export const CONF_BRIGHT = { lo: 0.55, hi: 0.78 };

/** Deep-blue look constants (fitted to a reference grade in Oklab). */
export const LOOK = {
  // Measured against the user's references: hazy scenes come out ≈0.65×
  // darker, clear scenes keep their exposure. The dim rides on the exposure
  // uniform, scaled by the frame's haze (see lookParams); gamma is a mild
  // per-pixel shadow crush.
  gamma: 0.05,
  dim: 0.3,
  hazeDehaze: 0.7, // hazy frames: the look also dehazes the water path …
  hazeClarity: 0.5, // … adds local contrast …
  hazeLevels: 0.2, // … and a fuller levels stretch, so the reef comes back
  waterDim: 0.25, // water-path pixels go darker (deep water reads navy in the references)
  hazeLo: 0.05, // lifted-black haze below which nothing dims …
  hazeHi: 0.3, // … and above which the full dim applies
  hazeChroma: 0.8, // water tint chroma target rises with haze (murky refs are more saturated)
  neutralDesat: 0.8, // light near-neutral pixels (sand, white coral) lose chroma …
  neutralLo: 0.025, // … below this chroma fully …
  neutralHi: 0.05, // … fading out by this (surface water sits above it) …
  neutralLLo: 0.65, // … and only when light (water is never "white")
  neutralLHi: 0.8,
  warmHue: (65 * Math.PI) / 180, // warm band (skin, sand: ~20°–110°) never takes the tint …
  warmIn: (45 * Math.PI) / 180,
  warmOut: (70 * Math.PI) / 180,
  warmLo: 0.006, // … once it has any chroma at all
  warmHi: 0.015,
  brightLo: 0.6, // light pixels (pale skin, white coral, hands) keep their colour …
  brightHi: 0.8,
  keepLo: 0.09, // vivid in-band colours (blue fins) are kept …
  keepHi: 0.14,
  targetHue: (252 * Math.PI) / 180,
  c0: 0.0, // target chroma = c0 + c1·L: zero at black, so blacks stay black …
  c1: 0.11,
  darkLo: 0.12, // … and dark pixels take no tint at all below this lightness
  darkHi: 0.3,
  mix: 0.9, // how far (a, b) move toward the target
};

/** Push amount above the estimate, 0..1. */
export function pushOf(s: UserSettings): number {
  return Math.min(1, Math.max(0, s.intensity - 1));
}

export function resolveSettings(s: UserSettings): GradeSettings {
  const t = pushOf(s);
  // The push rides on top of the advanced values.
  return {
    strength: Math.min(1, Math.max(0, s.intensity)),
    saturation: s.saturation + 0.35 * t,
    clarity: Math.min(1, s.clarity + 0.5 * t),
    veil: s.veil + 0.3 * t,
    look: Math.min(1, Math.max(0, s.look)),
    dehaze: 0.6 * t,
  };
}

/**
 * Drives the estimated parameters harder by the push amount: the balance
 * is extrapolated (gains to the power 1 + 0.8t, which also widens the
 * range compensation it sets), the water path follows it further, and the
 * levels / chroma ceilings open up.
 */
/** How much of the look's haze-dependent behaviour applies to this frame, 0..1. */
export function hazeWeight(p: GradeParams): number {
  const t = Math.min(1, Math.max(0, (p.haze - LOOK.hazeLo) / (LOOK.hazeHi - LOOK.hazeLo)));
  return t * t * (3 - 2 * t);
}

/** Look-driven global adjustments (exposure dim in hazy scenes). */
export function lookParams(p: GradeParams, s: UserSettings): GradeParams {
  const look = Math.min(1, Math.max(0, s.look));
  if (look <= 0) return p;
  const hw = hazeWeight(p) * look;
  return { ...p, exposure: p.exposure * (1 - LOOK.dim * hw), levelsMix: Math.min(0.85, p.levelsMix + LOOK.hazeLevels * hw) };
}

/** Look-driven control adjustments: hazy frames get dehaze and clarity. */
export function lookSettings(g: GradeSettings, p: GradeParams): GradeSettings {
  const look = g.look;
  if (look <= 0) return g;
  const hw = hazeWeight(p) * look;
  return { ...g, dehaze: Math.max(g.dehaze, LOOK.hazeDehaze * hw), clarity: Math.min(1, g.clarity + LOOK.hazeClarity * hw) };
}

export function boostParams(p: GradeParams, t: number): GradeParams {
  if (t <= 0) return p;
  const e = 1 + 0.8 * t;
  const wb = p.wb.map((g) => Math.min(5, Math.max(0.25, Math.pow(g, e)))) as Vec3;
  const waterMax = 1.6 + 0.4 * t;
  const waterWb = wb.map((g) => Math.min(waterMax, Math.max(1 / waterMax, Math.pow(g, 0.6)))) as Vec3;
  return {
    ...p,
    wb,
    waterWb,
    attn: p.attn.map((a) => a * e) as Vec3,
    gainCap: p.gainCap + t,
    levelsMix: Math.min(0.85, p.levelsMix + 0.3 * t),
    chromaK: p.chromaK + t,
  };
}

export type Vec3 = [number, number, number];

/** Per-frame estimated grade. All colour quantities are linear-light. */
export type GradeParams = {
  /** Veiling light B∞ per channel. */
  binf: Vec3;
  /** Backscatter growth with the range proxy: B(z) = B∞·(1 − exp(−(beta·z + c))). */
  betaB: Vec3;
  cB: Vec3;
  /**
   * Range-adaptive compensation: gain_c = clamp(exp(attn_c · (z − zMean)), 1/cap, cap).
   * attn_c = γ·ln(wb_c): the white balance is distributed over range so the
   * far field gets more lift than the foreground, mean unchanged.
   */
  attn: Vec3;
  gainCap: number;
  zMean: number;
  /** White-balance gains applied after compensation (green ≈ 1). */
  wb: Vec3;
  /** Toned-down balance applied to veil-dominated ("water") pixels. */
  waterWb: Vec3;
  /** Signal-confidence ramp on lum(D)/lum(I): below confLo a pixel is water, above confHi it gets the full physics. */
  confLo: number;
  confHi: number;
  /** Veiling-light colour (linear) used by the chromaticity water test. */
  veilColor: Vec3;
  /** Oklab hue distance (radians) ramp: below hueLo a pixel's hue matches the veil → water. */
  cosLo: number;
  cosHi: number;
  /** Hue distance (radians) from the veil beyond which an object is
   *  de-scattered proportionally (hue-preserving) rather than per channel. */
  hueFarLo: number;
  hueFarHi: number;
  /** Water-path share of the frame (0 clear objects … 1 all water/haze); drives the look's dimming. */
  haze: number;
  /** Oklab chroma below which a pixel is achromatic and always counts as an object. */
  achroma: number;
  /** Exponent on the exposure for the water path (water keeps its brightness). */
  waterExposure: number;
  /** Linear exposure multiplier. */
  exposure: number;
  /** Auto-levels in linear luminance: (Y − black) / (white − black), mixed by levelsMix. */
  black: number;
  white: number;
  levelsMix: number;
  /** Chroma ceiling relative to the source: C ≤ chromaK·C_src + chromaC0. */
  chromaK: number;
  chromaC0: number;
  /** Range proxy normalisation: z = clamp((d − zLo) / (zHi − zLo)). */
  zLo: number;
  zHi: number;
  /** How much of the per-pixel ULAP detail is added back to the coarse map. */
  depthGuide: number;
  /** Floor on the de-scattered signal as a fraction of the input, keeps shadows from crushing. */
  floorFrac: number;
  /** Corrected luminance never drops below this fraction of the source luminance (hue preserved). */
  shadowFloor: number;
  /** Highlight shoulder knee (linear luminance); above it luminance rolls off toward 1. */
  knee: number;
  /** Signal-fraction ramp between hue-preserving (proportional) and per-channel veil subtraction. */
  subLo: number;
  subHi: number;
};

export const IDENTITY_PARAMS: GradeParams = {
  binf: [0, 0, 0],
  betaB: [0, 0, 0],
  cB: [0, 0, 0],
  attn: [0, 0, 0],
  gainCap: 1,
  zMean: 0.5,
  wb: [1, 1, 1],
  waterWb: [1, 1, 1],
  confLo: 0,
  confHi: 0.001,
  veilColor: [0, 0, 1],
  cosLo: 0,
  cosHi: 0.001,
  hueFarLo: 3,
  hueFarHi: 3.1,
  haze: 0,
  achroma: 0,
  waterExposure: 1,
  exposure: 1,
  black: 0,
  white: 1,
  levelsMix: 0,
  chromaK: 100,
  chromaC0: 1,
  zLo: 0,
  zHi: 1,
  depthGuide: 0,
  floorFrac: 0.04,
  shadowFloor: 0,
  knee: 1,
  subLo: 0,
  subHi: 0.001,
};

/**
 * Low-res per-pixel fields the shader upsamples with a joint bilateral
 * filter: `fields` holds (z, conf, dSmooth, veilScale) per texel, `guide`
 * the linear RGB of the same texel (the range kernel compares the full-res
 * pixel to it). veilScale multiplies the veiling light: it is brighter
 * toward the sunlit surface than the single B∞ fit says.
 */
export type DepthMap = {
  width: number;
  height: number;
  fields: Float32Array;
  guide: Float32Array;
  /** Optional person mask (0..1, one value per texel), rides in the guide's alpha. */
  person?: Float32Array;
};

/**
 * Skin memory colour, applied to person pixels that are light and not
 * strongly coloured: hue pulled toward SKIN.hue and a chroma floor, so skin
 * comes out pink rather than cream/grey. Wetsuits (dark) and fins (vivid)
 * are untouched.
 */
export const SKIN = {
  hue: (35 * Math.PI) / 180,
  bandHue: (65 * Math.PI) / 180, // candidates: hue within ~15°–115° …
  bandIn: (50 * Math.PI) / 180,
  bandOut: (75 * Math.PI) / 180,
  achroma: 0.012, // … or nearly neutral
  lLo: 0.4, // light enough
  lHi: 0.55,
  cLo: 0.07, // not vivid
  cHi: 0.1,
  mix: 0.9, // how far the hue moves toward SKIN.hue
  wLo: 0.1, // person weight saturates: smoothstep(wLo, wHi, person)
  wHi: 0.5,
  cMin: 0.045, // chroma floor
};

/** CLAHE tile LUTs: `tilesX*tilesY` rows of `bins` entries (R channel). */
export type ClaheLuts = { tilesX: number; tilesY: number; bins: number; data: Float32Array };

export type FrameAnalysis = {
  params: GradeParams;
  depth: DepthMap;
  clahe: ClaheLuts;
  /** Mean sRGB of the thumbnail, for scene-cut detection. */
  mean: Vec3;
};

export const CLAHE_TILES_X = 8;
export const CLAHE_TILES_Y = 6;
export const CLAHE_BINS = 32;

/**
 * Uniform block layout (16 × vec4):
 *  p0: rotation, split, strength, 0
 *  p1: binf.rgb, veil
 *  p2: betaB.rgb, look
 *  p3: cB.rgb, dehaze
 *  p4: attn.rgb, gainCap
 *  p9.w: zMean
 *  p5: wb.rgb, exposure
 *  p6: black, white, levelsMix, clarity
 *  p7: saturation, chromaK, chromaC0, depthGuide
 *  p8: depthW, depthH, tilesX, tilesY
 *  p9: bins, floorFrac, zLo, zHi
 *  p10: ulap mu0, mu1, mu2, shadowFloor
 *  p11: waterWb.rgb, hueFarHi
 *  p12: confLo, confHi, cosLo, cosHi
 *  p15: knee, subLo, subHi, hueFarLo
 *  p16: hazeWeight, 0, 0, 0
 *  p13: veilColor.rgb, achroma
 *  p14: veilHueA, veilHueB, waterExposure, zMean  (unit vector of the veil's Oklab hue)
 */
export function packUniforms(
  params: GradeParams,
  settings: UserSettings,
  depth: DepthMap,
  clahe: ClaheLuts,
  rotation: number,
  split: number,
): Float32Array {
  const u = new Float32Array(UNIFORM_FLOATS);
  params = lookParams(boostParams(params, pushOf(settings)), settings);
  const s = lookSettings(resolveSettings(settings), params);
  u.set([rotation, split, s.strength, 0], 0);
  u.set([...params.binf, s.veil], 4);
  u.set([...params.betaB, s.look], 8);
  u.set([...params.cB, s.dehaze], 12);
  u.set([...params.attn, params.gainCap], 16);
  u.set([...params.wb, params.exposure], 20);
  u.set([params.black, params.white, params.levelsMix, s.clarity], 24);
  u.set([s.saturation, params.chromaK, params.chromaC0, params.depthGuide], 28);
  u.set([depth.width, depth.height, clahe.tilesX, clahe.tilesY], 32);
  u.set([clahe.bins, params.floorFrac, params.zLo, params.zHi], 36);
  // zMean rides in p14.w (p9 is full).

  u.set([ULAP.mu0, ULAP.mu1, ULAP.mu2, params.shadowFloor], 40);
  u.set([...params.waterWb, params.hueFarHi], 44);
  u.set([params.confLo, params.confHi, params.cosLo, params.cosHi], 48);
  u.set([...params.veilColor, params.achroma], 52);
  {
    const [, a, b] = linearToOklab(params.veilColor[0], params.veilColor[1], params.veilColor[2]);
    const c = Math.hypot(a, b) || 1;
    u.set([a / c, b / c, params.waterExposure, params.zMean], 56);
  }
  u.set([params.knee, params.subLo, params.subHi, params.hueFarLo], 60);
  u.set([hazeWeight(params), 0, 0, 0], 64);
  return u;
}

/** RGBA32F texel data for the fields map (R = z, G = conf, B = smoothed d, A = veil scale). */
export function fieldsTexture(d: DepthMap): Float32Array {
  return new Float32Array(d.fields);
}

/** RGBA32F texel data for the guide map (linear RGB). */
export function guideTexture(d: DepthMap): Float32Array {
  const out = new Float32Array(d.width * d.height * 4);
  for (let i = 0; i < d.width * d.height; i++) {
    out[i * 4] = d.guide[i * 3];
    out[i * 4 + 1] = d.guide[i * 3 + 1];
    out[i * 4 + 2] = d.guide[i * 3 + 2];
    out[i * 4 + 3] = d.person ? d.person[i] : 0;
  }
  return out;
}

/** RGBA32F texel data for the CLAHE LUTs: width = bins, height = tiles. */
export function claheTexture(c: ClaheLuts): Float32Array {
  const n = c.tilesX * c.tilesY * c.bins;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) out[i * 4] = c.data[i];
  return out;
}

export function lerpParams(a: GradeParams, b: GradeParams, t: number): GradeParams {
  const m = (x: number, y: number) => x + (y - x) * t;
  // Gains blend in the log domain so a 2× → 4× ramp is perceptually even.
  const ml = (x: number, y: number) => Math.exp(m(Math.log(Math.max(1e-4, x)), Math.log(Math.max(1e-4, y))));
  const v = (x: Vec3, y: Vec3, f = m): Vec3 => [f(x[0], y[0]), f(x[1], y[1]), f(x[2], y[2])];
  return {
    binf: v(a.binf, b.binf),
    betaB: v(a.betaB, b.betaB),
    cB: v(a.cB, b.cB),
    attn: v(a.attn, b.attn),
    gainCap: m(a.gainCap, b.gainCap),
    zMean: m(a.zMean, b.zMean),
    wb: v(a.wb, b.wb, ml),
    waterWb: v(a.waterWb, b.waterWb, ml),
    confLo: m(a.confLo, b.confLo),
    confHi: m(a.confHi, b.confHi),
    veilColor: v(a.veilColor, b.veilColor),
    cosLo: m(a.cosLo, b.cosLo),
    cosHi: m(a.cosHi, b.cosHi),
    hueFarLo: m(a.hueFarLo, b.hueFarLo),
    hueFarHi: m(a.hueFarHi, b.hueFarHi),
    haze: m(a.haze, b.haze),
    achroma: m(a.achroma, b.achroma),
    waterExposure: m(a.waterExposure, b.waterExposure),
    exposure: ml(a.exposure, b.exposure),
    black: m(a.black, b.black),
    white: m(a.white, b.white),
    levelsMix: m(a.levelsMix, b.levelsMix),
    chromaK: m(a.chromaK, b.chromaK),
    chromaC0: m(a.chromaC0, b.chromaC0),
    zLo: m(a.zLo, b.zLo),
    zHi: m(a.zHi, b.zHi),
    depthGuide: m(a.depthGuide, b.depthGuide),
    floorFrac: m(a.floorFrac, b.floorFrac),
    shadowFloor: m(a.shadowFloor, b.shadowFloor),
    knee: m(a.knee, b.knee),
    subLo: m(a.subLo, b.subLo),
    subHi: m(a.subHi, b.subHi),
  };
}
