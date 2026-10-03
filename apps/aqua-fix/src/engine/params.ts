// Engine parameter model and the packed uniform layout both shaders read.
// The analysis pass produces a GradeParams for the current frame; the
// temporal smoother blends them; packUniforms() serialises them.

import { UNIFORM_FLOATS } from "./backend.ts";
import { linearToOklab } from "./color.ts";

/** ULAP depth prior (Song et al. 2018): d = mu0 + mu1·max(G,B) + mu2·R on 0..1 sRGB. */
export const ULAP = { mu0: 0.53214829, mu1: 0.51309827, mu2: -0.91066194 };

/** User-facing controls. Everything else is estimated per frame. */
export type UserSettings = {
  /** Overall mix between source and corrected, 0..1. */
  strength: number;
  /** Oklab chroma multiplier, 0..2 (1 = as corrected). */
  saturation: number;
  /** Local-contrast (CLAHE) mix, 0..1. */
  clarity: number;
  /** Backscatter subtraction amount, 0..1.2 (1 = as fitted). */
  veil: number;
};

export const DEFAULT_SETTINGS: UserSettings = {
  strength: 1,
  saturation: 1,
  clarity: 0.45,
  veil: 1,
};

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
};

/**
 * Low-res per-pixel fields the shader upsamples with a joint bilateral
 * filter: `fields` holds (z, conf, dSmooth, veilScale) per texel, `guide`
 * the linear RGB of the same texel (the range kernel compares the full-res
 * pixel to it). veilScale multiplies the veiling light: it is brighter
 * toward the sunlit surface than the single B∞ fit says.
 */
export type DepthMap = { width: number; height: number; fields: Float32Array; guide: Float32Array };

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
 *  p2: betaB.rgb, 0
 *  p3: cB.rgb, 0
 *  p4: attn.rgb, gainCap
 *  p9.w: zMean
 *  p5: wb.rgb, exposure
 *  p6: black, white, levelsMix, clarity
 *  p7: saturation, chromaK, chromaC0, depthGuide
 *  p8: depthW, depthH, tilesX, tilesY
 *  p9: bins, floorFrac, zLo, zHi
 *  p10: ulap mu0, mu1, mu2, 0
 *  p11: waterWb.rgb, 0
 *  p12: confLo, confHi, cosLo, cosHi
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
  u.set([rotation, split, settings.strength, 0], 0);
  u.set([...params.binf, settings.veil], 4);
  u.set([...params.betaB, 0], 8);
  u.set([...params.cB, 0], 12);
  u.set([...params.attn, params.gainCap], 16);
  u.set([...params.wb, params.exposure], 20);
  u.set([params.black, params.white, params.levelsMix, settings.clarity], 24);
  u.set([settings.saturation, params.chromaK, params.chromaC0, params.depthGuide], 28);
  u.set([depth.width, depth.height, clahe.tilesX, clahe.tilesY], 32);
  u.set([clahe.bins, params.floorFrac, params.zLo, params.zHi], 36);
  // zMean rides in p14.w (p9 is full).

  u.set([ULAP.mu0, ULAP.mu1, ULAP.mu2, 0], 40);
  u.set([...params.waterWb, 0], 44);
  u.set([params.confLo, params.confHi, params.cosLo, params.cosHi], 48);
  u.set([...params.veilColor, params.achroma], 52);
  {
    const [, a, b] = linearToOklab(params.veilColor[0], params.veilColor[1], params.veilColor[2]);
    const c = Math.hypot(a, b) || 1;
    u.set([a / c, b / c, params.waterExposure, params.zMean], 56);
  }
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
  };
}
