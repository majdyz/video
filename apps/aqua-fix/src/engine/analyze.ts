// Per-frame estimation of the grade from a small upright RGBA8 thumbnail.
// Pure TypeScript, no DOM: the app feeds it the GPU-downscaled frame and the
// Node harness feeds it a resized photo.
//
// Pipeline (all colour maths in linear light):
//   1. range proxy z̃ from the ULAP prior, smoothed, percentile-normalised
//   2. backscatter: darkest pixels per range bin → B∞, β, c per channel
//      (Sea-thru's dark-pixel fit against a range proxy instead of SfM depth)
//   3. de-scatter + clamped range-adaptive attenuation compensation
//   4. white balance on the de-scattered image (Shades-of-Gray, p = 6),
//      with a memory-colour guardrail that backs the red gain off when warm
//      tones drift into magenta
//   5. auto exposure / levels in linear luminance
//   6. CLAHE tile LUTs on the encoded luminance for local contrast

import { SRGB_TO_LINEAR_LUT, linearToOklab, linearToSrgb, luminance, oklabHueDeg } from "./color.ts";
import {
  CLAHE_BINS,
  CLAHE_TILES_X,
  CLAHE_TILES_Y,
  ULAP,
  type ClaheLuts,
  type DepthMap,
  type FrameAnalysis,
  type GradeParams,
  type Vec3,
} from "./params.ts";

/** Thumbnail size the engine analyses at (upright, 16:9 box). */
export const ANALYSIS_W = 256;
export const ANALYSIS_H = 144;

const MAP_W = 160;
const MAP_H = 90;
const RANGE_BINS = 10;
const DARK_FRACTION = 0.015;
const MIN_DARK = 6;
// Range-adaptive compensation: the white balance is spread over range with
// exponent γ·ln(wb) around the mean range, bounded per pixel.
const ATTN_GAMMA = 1.1;
const GAIN_CAP = 2.2;
// Signal confidence: lum(D)/lum(I). Veil-dominated pixels (open water) keep
// a toned-down version of the input instead of amplified noise.
const CONF_LO = 0.1;
const CONF_HI = 0.4;
// Hue test: Oklab hue distance between the pixel and the veiling light.
// Water shares the veil's hue whatever its brightness; below HUE_LO it is
// water, above HUE_HI an object. Achromatic pixels (dark wetsuits, white
// sand) have no usable hue and always count as objects.
const HUE_LO = 10 * Math.PI / 180;
const HUE_HI = 26 * Math.PI / 180;
// Spatial veil: per cell, the median brightness of water-hued pixels
// relative to the global veil fit. Sunlit upper water sits well above the
// fit; without this it would read as a bright object and go white.
const VEIL_CELLS_X = 16;
const VEIL_CELLS_Y = 9;
const VEIL_SCALE_MIN = 0.6;
const VEIL_SCALE_MAX = 2.2;
const VEIL_MIN_SAMPLES = 6;
const ACHROMA = 0.025;
// The water path keeps most of its original brightness.
const WATER_EXPOSURE = 0.8;
// How much of the white balance the water path gets (exponent on the gains).
const WATER_WB_POWER = 0.6;
// White balance limits (linear gains relative to green).
// Under water the cast is always blue/green: a red gain below 1 (or a
// blue gain far above 1) only ever comes from a gray-world vote dominated
// by one warm object, so those directions are clamped.
const WB_R_MAX = 3.5;
const WB_R_MIN = 1.0;
const WB_B_MIN = 0.55;
const WB_B_MAX = 1.5;
// Below this share of confident pixels the scene is mostly water and the
// gray-world assumption is weak: shrink the balance toward identity.
const WB_CONF_LO = 0.03;
const WB_CONF_HI = 0.25;
// Memory-colour guardrail: back red off while too many mid-tone, saturated
// pixels sit in the magenta hue band.
const MAGENTA_LO = 300;
const MAGENTA_HI = 348;
const MAGENTA_MAX_FRACTION = 0.015;
const GUARD_STEPS = 6;
// Exposure / levels.
const KEY_TARGET = 0.14;
const EXPOSURE_MIN = 0.6;
const EXPOSURE_MAX = 1.35;
const HIGHLIGHT_CEILING = 0.86;
const LEVELS_MIX = 0.5;
const LEVELS_WHITE_MIN = 0.55;
const CLAHE_CLIP = 2.0;
// Highlight shoulder: linear luminance above KNEE rolls off toward 1.
const KNEE = 0.75;
// Veil subtraction: per channel (colour restoration) when the pixel keeps
// a healthy signal fraction after the veil, proportional (hue-preserving)
// when it doesn't — per-channel subtraction on a weak pixel floors G/B,
// leaves R, and turns compression noise into black/green blotches.
const SUB_LO = 0.2;
const SUB_HI = 0.55;
// Chroma ceiling relative to the source pixel's chroma.
const CHROMA_K = 2.6;
const CHROMA_C0 = 0.025;
const FLOOR_FRAC = 0.05;
// Dark subjects are mostly veil; subtracting it makes them darker still.
// Hold corrected luminance at ≥ this fraction of the source luminance.
const SHADOW_FLOOR = 0.55;
const DEPTH_GUIDE = 0.5;

export function analyzeThumbnail(rgba: Uint8ClampedArray, w: number, h: number): FrameAnalysis {
  const n = w * h;
  const lin = new Float32Array(n * 3);
  const d = new Float32Array(n);
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < n; i++) {
    const r8 = rgba[i * 4], g8 = rgba[i * 4 + 1], b8 = rgba[i * 4 + 2];
    lin[i * 3] = SRGB_TO_LINEAR_LUT[r8];
    lin[i * 3 + 1] = SRGB_TO_LINEAR_LUT[g8];
    lin[i * 3 + 2] = SRGB_TO_LINEAR_LUT[b8];
    const r = r8 / 255, g = g8 / 255, b = b8 / 255;
    d[i] = ULAP.mu0 + ULAP.mu1 * Math.max(g, b) + ULAP.mu2 * r;
    mr += r; mg += g; mb += b;
  }
  const mean: Vec3 = [mr / n, mg / n, mb / n];

  // 1. Range proxy: smooth the prior (two 5×5 box passes ≈ Gaussian σ≈2
  // at thumbnail scale), normalise between robust percentiles.
  const ds = boxBlur(boxBlur(d, w, h, 2), w, h, 2);
  const [zLo, zHi] = percentiles(ds, [0.02, 0.98]);
  const zRange = Math.max(0.02, zHi - zLo);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = clamp01((ds[i] - zLo) / zRange);

  // 2. Backscatter fit from the darkest pixels in each range bin. Per bin,
  // a luminance histogram gives the brightness threshold of the darkest
  // DARK_FRACTION; everything under it is a sample (O(n), no sorting).
  const samplesZ: number[] = [];
  const samplesC: number[][] = [[], [], []];
  const lum = new Float32Array(n);
  const bin = new Uint8Array(n);
  const binCount = new Uint32Array(RANGE_BINS);
  const LBINS = 128;
  const lumHist = new Uint32Array(RANGE_BINS * LBINS);
  for (let i = 0; i < n; i++) {
    lum[i] = lum3(lin, i);
    const b = Math.min(RANGE_BINS - 1, (z[i] * RANGE_BINS) | 0);
    bin[i] = b;
    binCount[b]++;
    lumHist[b * LBINS + Math.min(LBINS - 1, (Math.sqrt(lum[i]) * LBINS) | 0)]++;
  }
  const thresh = new Float32Array(RANGE_BINS);
  for (let b = 0; b < RANGE_BINS; b++) {
    if (binCount[b] < MIN_DARK * 4) { thresh[b] = -1; continue; }
    const want = Math.max(MIN_DARK, Math.round(binCount[b] * DARK_FRACTION));
    let acc = 0, k = 0;
    for (; k < LBINS; k++) { acc += lumHist[b * LBINS + k]; if (acc >= want) break; }
    const t = (k + 1) / LBINS;
    thresh[b] = t * t;
  }
  for (let i = 0; i < n; i++) {
    const t = thresh[bin[i]];
    if (t < 0 || lum[i] > t) continue;
    samplesZ.push(z[i]);
    samplesC[0].push(lin[i * 3]);
    samplesC[1].push(lin[i * 3 + 1]);
    samplesC[2].push(lin[i * 3 + 2]);
  }
  // Veiling-light colour: mean of the farthest 2 % (brightest water).
  const veilColor: Vec3 = [0, 0, 0];
  {
    const [zTop] = percentiles(z, [0.98]);
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (z[i] < zTop) continue;
      veilColor[0] += lin[i * 3]; veilColor[1] += lin[i * 3 + 1]; veilColor[2] += lin[i * 3 + 2];
      cnt++;
    }
    if (cnt > 0) { veilColor[0] /= cnt; veilColor[1] /= cnt; veilColor[2] /= cnt; }
    else { veilColor[0] = mean[0]; veilColor[1] = mean[1]; veilColor[2] = mean[2]; }
  }
  const [, va, vb] = linearToOklab(veilColor[0], veilColor[1], veilColor[2]);
  const vNorm = Math.hypot(va, vb) || 1;
  const veilHue: [number, number] = [va / vNorm, vb / vNorm];
  const binf: Vec3 = [0, 0, 0];
  const betaB: Vec3 = [0, 0, 0];
  const cB: Vec3 = [0, 0, 0];
  {
    const fits = fitBackscatter3(samplesZ, samplesC);
    for (let c = 0; c < 3; c++) {
      binf[c] = fits[c].A;
      betaB[c] = fits[c].beta;
      cB[c] = fits[c].c;
    }
  }

  let zSum = 0;
  for (let i = 0; i < n; i++) zSum += z[i];
  const zMean = zSum / n;

  // Spatial veil scale from water-hued pixels (see VEIL_CELLS_*).
  const hueObj = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [, pa, pb] = linearToOklab(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]);
    hueObj[i] = hueConfidence(pa, pb, veilHue, HUE_LO, HUE_HI, ACHROMA);
  }
  const veilScale = veilScaleMap(lin, z, hueObj, binf, betaB, cB, w, h);
  const J = new Float32Array(n * 3);
  const conf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const zi = z[i];
    let dl = 0;
    for (let c = 0; c < 3; c++) {
      const I = lin[i * 3 + c];
      const B = veilScale[i] * binf[c] * (1 - Math.exp(-(betaB[c] * zi + cB[c])));
      const D = Math.max(I - B, I * FLOOR_FRAC);
      dl += D * (c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722);
      J[i * 3 + c] = D;
    }
    void zi;
    const confSignal = smoothstep(CONF_LO, CONF_HI, dl / Math.max(1e-5, lum[i]));
    conf[i] = Math.min(confSignal, hueObj[i]);
  }

  // 4. Shades-of-Gray white balance (p = 6) on the de-scattered image,
  // weighted by confidence so open water doesn't vote.
  const P = 6;
  let sr = 0, sg = 0, sb = 0, sw = 0;
  for (let i = 0; i < n; i++) {
    const wgt = conf[i];
    if (wgt <= 0) continue;
    const r = J[i * 3], g = J[i * 3 + 1], b = J[i * 3 + 2];
    const r2 = r * r, g2 = g * g, b2 = b * b;
    sr += wgt * r2 * r2 * r2;
    sg += wgt * g2 * g2 * g2;
    sb += wgt * b2 * b2 * b2;
    sw += wgt;
  }
  const wb: Vec3 = [1, 1, 1];
  if (sw > 0) {
    const er = Math.pow(sr / sw, 1 / P) + 1e-5;
    const eg = Math.pow(sg / sw, 1 / P) + 1e-5;
    const eb = Math.pow(sb / sw, 1 / P) + 1e-5;
    wb[0] = Math.min(WB_R_MAX, Math.max(WB_R_MIN, eg / er));
    wb[2] = Math.min(WB_B_MAX, Math.max(WB_B_MIN, eg / eb));
  }
  // Mostly-water scenes: shrink toward identity.
  const wbConf = smoothstep(WB_CONF_LO, WB_CONF_HI, sw / n);
  wb[0] = 1 + (wb[0] - 1) * wbConf;
  wb[2] = 1 + (wb[2] - 1) * wbConf;
  // Memory-colour guardrail.
  for (let step = 0; step < GUARD_STEPS; step++) {
    if (magentaFraction(J, conf, n, wb) <= MAGENTA_MAX_FRACTION) break;
    wb[0] = Math.max(WB_R_MIN, wb[0] * 0.9);
  }
  const attn: Vec3 = [ATTN_GAMMA * Math.log(wb[0]), 0, ATTN_GAMMA * Math.log(wb[2])];
  for (let i = 0; i < n; i++) {
    const dz = z[i] - zMean;
    for (let c = 0; c < 3; c++) {
      J[i * 3 + c] *= Math.min(GAIN_CAP, Math.max(1 / GAIN_CAP, Math.exp(attn[c] * dz)));
    }
  }
  const waterWb: Vec3 = [Math.pow(wb[0], WATER_WB_POWER), 1, Math.pow(wb[2], WATER_WB_POWER)];
  // Final per-pixel signal before exposure: mix(water, physics, conf). The
  // exposure is solved below on the physics path; the water path takes
  // exposure^WATER_EXPOSURE, which the shader applies per pixel.
  const waterLin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const wgt = conf[i];
    for (let c = 0; c < 3; c++) {
      J[i * 3 + c] = J[i * 3 + c] * wb[c];
      waterLin[i * 3 + c] = lin[i * 3 + c] * waterWb[c];
    }
    void wgt;
  }

  // 5. Exposure (log-average luminance → key, highlight-protected) and
  // robust levels. The key is measured on the confident (object) pixels so
  // open water doesn't dictate it; the ceiling sees every pixel.
  const Y = new Float32Array(n);
  let logSum = 0, logW = 0;
  for (let i = 0; i < n; i++) {
    const y = luminance(J[i * 3], J[i * 3 + 1], J[i * 3 + 2]);
    const wgt = 0.15 + conf[i];
    logSum += wgt * Math.log(1e-4 + y);
    logW += wgt;
  }
  const lavg = Math.exp(logSum / Math.max(1e-6, logW));
  let exposure = Math.min(EXPOSURE_MAX, Math.max(EXPOSURE_MIN, KEY_TARGET / Math.max(1e-4, lavg)));
  const mixY = (i: number, e: number) => {
    const ew = Math.pow(e, WATER_EXPOSURE);
    const wgt = conf[i];
    let y = 0;
    for (let c = 0; c < 3; c++) {
      const v = waterLin[i * 3 + c] * ew + (J[i * 3 + c] * e - waterLin[i * 3 + c] * ew) * wgt;
      y += v * (c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722);
    }
    // Shadow floor and highlight shoulder, as the shader applies them.
    y = Math.max(y, shadowFloorAt(lum[i]) * lum[i] * ew);
    return y > KNEE ? KNEE + (1 - KNEE) * (1 - Math.exp(-(y - KNEE) / (1 - KNEE))) : y;
  };
  for (let i = 0; i < n; i++) Y[i] = mixY(i, exposure);
  const [p995] = percentiles(Y, [0.995]);
  if (p995 > HIGHLIGHT_CEILING) {
    // Scale the whole exposure down until the highlights fit (both paths
    // are monotone in the exposure, so one proportional step is enough).
    exposure = Math.max(EXPOSURE_MIN, exposure * (HIGHLIGHT_CEILING / p995));
    for (let i = 0; i < n; i++) Y[i] = mixY(i, exposure);
  }
  const [black, white] = percentiles(Y, [0.004, 0.996]);
  const blackPt = Math.min(black, 0.06);
  // Never stretch more than ~1.8×: a dim clip should stay dim-ish rather
  // than have its brighter patches shoved to white.
  const whitePt = Math.min(1.0, Math.max(white, blackPt + 0.2, LEVELS_WHITE_MIN));

  // 6. CLAHE on the encoded luminance after levels.
  const enc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const yl = Y[i];
    const ylv = yl + ((yl - blackPt) / (whitePt - blackPt) - yl) * LEVELS_MIX;
    enc[i] = linearToSrgb(clamp01(ylv));
  }
  const clahe = buildClahe(enc, w, h);

  const depth = buildMaps(z, conf, ds, veilScale, lin, w, h);
  const params: GradeParams = {
    binf,
    betaB,
    cB,
    attn,
    gainCap: GAIN_CAP,
    zMean,
    wb,
    waterWb,
    confLo: CONF_LO,
    confHi: CONF_HI,
    veilColor,
    cosLo: HUE_LO,
    cosHi: HUE_HI,
    achroma: ACHROMA,
    waterExposure: WATER_EXPOSURE,
    exposure,
    black: blackPt,
    white: whitePt,
    levelsMix: LEVELS_MIX,
    chromaK: CHROMA_K,
    chromaC0: CHROMA_C0,
    zLo,
    zHi,
    depthGuide: DEPTH_GUIDE,
    floorFrac: FLOOR_FRAC,
    shadowFloor: SHADOW_FLOOR,
    knee: KNEE,
    subLo: SUB_LO,
    subHi: SUB_HI,
  };
  return { params, depth, clahe, mean };
}

function lum3(lin: Float32Array, i: number): number {
  return luminance(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Per-pixel veil scale: in each cell, the median of lum(I) / lum(B_fit(z))
 * over water-hued pixels; cells without enough water inherit from their
 * neighbours; the cell grid is bilinearly expanded to the thumbnail.
 */
function veilScaleMap(
  lin: Float32Array, z: Float32Array, hueObj: Float32Array,
  binf: Vec3, betaB: Vec3, cB: Vec3, w: number, h: number,
): Float32Array {
  const cx = VEIL_CELLS_X, cy = VEIL_CELLS_Y;
  const samples: number[][] = Array.from({ length: cx * cy }, () => []);
  for (let y = 0; y < h; y++) {
    const ty = Math.min(cy - 1, Math.floor((y * cy) / h));
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (hueObj[i] > 0.5) continue;
      let lb = 0;
      for (let c = 0; c < 3; c++) lb += binf[c] * (1 - Math.exp(-(betaB[c] * z[i] + cB[c]))) * (c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722);
      if (lb < 1e-3) continue;
      const li = luminance(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]);
      const tx = Math.min(cx - 1, Math.floor((x * cx) / w));
      samples[ty * cx + tx].push(li / lb);
    }
  }
  const cell = new Float32Array(cx * cy).fill(NaN);
  for (let k = 0; k < cx * cy; k++) {
    const sm = samples[k];
    if (sm.length < VEIL_MIN_SAMPLES) continue;
    sm.sort((a, b) => a - b);
    cell[k] = Math.min(VEIL_SCALE_MAX, Math.max(VEIL_SCALE_MIN, sm[sm.length >> 1]));
  }
  // Fill holes from neighbours (a few dilation passes), then 1.0.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    const next = new Float32Array(cell);
    for (let ty = 0; ty < cy; ty++) {
      for (let tx = 0; tx < cx; tx++) {
        const k = ty * cx + tx;
        if (!Number.isNaN(cell[k])) continue;
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = tx + dx, ny = ty + dy;
            if (nx < 0 || ny < 0 || nx >= cx || ny >= cy) continue;
            const v = cell[ny * cx + nx];
            if (!Number.isNaN(v)) { sum += v; cnt++; }
          }
        }
        if (cnt > 0) { next[k] = sum / cnt; changed = true; }
      }
    }
    cell.set(next);
    if (!changed) break;
  }
  for (let k = 0; k < cx * cy; k++) if (Number.isNaN(cell[k])) cell[k] = 1;
  // Bilinear expansion to the thumbnail.
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max(((y + 0.5) * cy) / h - 0.5, 0), cy - 1);
    const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, cy - 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max(((x + 0.5) * cx) / w - 0.5, 0), cx - 1);
      const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, cx - 1), tx = fx - x0;
      const top = cell[y0 * cx + x0] * (1 - tx) + cell[y0 * cx + x1] * tx;
      const bot = cell[y1 * cx + x0] * (1 - tx) + cell[y1 * cx + x1] * tx;
      out[y * w + x] = top * (1 - ty) + bot * ty;
    }
  }
  return out;
}

/** 1 for objects, 0 for water: hue distance to the veil, achromatic → object. */
export function hueConfidence(a: number, b: number, veilHue: [number, number], lo: number, hi: number, achroma: number): number {
  const c = Math.hypot(a, b);
  if (c < achroma) return 1;
  const cosang = Math.max(-1, Math.min(1, (a * veilHue[0] + b * veilHue[1]) / c));
  const ang = Math.acos(cosang);
  const t = smoothstep(lo, hi, ang);
  // Fade the achromatic rule in smoothly just above the threshold.
  const k = smoothstep(achroma, achroma * 2, c);
  return t + (1 - t) * (1 - k);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Shadow floor as a fraction of the source luminance: shadows (linear
 * luminance ≲ 0.02) are never darkened — a stale map that calls a shadow an
 * object would crush it to black — easing to SHADOW_FLOOR by ~0.15.
 */
export function shadowFloorAt(lumI: number, floor = SHADOW_FLOOR): number {
  return 0.97 + (floor - 0.97) * smoothstep(0.02, 0.15, lumI);
}

/** Fraction of mid-lightness, chromatic pixels whose Oklab hue is magenta. */
function magentaFraction(J: Float32Array, conf: Float32Array, n: number, wb: Vec3): number {
  let chromatic = 0;
  let magenta = 0;
  for (let i = 0; i < n; i += 2) {
    if (conf[i] < 0.5) continue;
    const [L, a, b] = linearToOklab(J[i * 3] * wb[0], J[i * 3 + 1] * wb[1], J[i * 3 + 2] * wb[2]);
    if (L < 0.25 || L > 0.9) continue;
    const C = Math.hypot(a, b);
    if (C < 0.06) continue;
    chromatic++;
    const hdeg = oklabHueDeg(a, b);
    if (hdeg > MAGENTA_LO && hdeg < MAGENTA_HI) magenta++;
  }
  return chromatic < 20 ? 0 : magenta / chromatic;
}

/**
 * Least-squares fit of B(z) = A·(1 − exp(−(β z + c))) over a (β, c) grid with
 * A closed-form per candidate, for the three channels at once (the basis
 * functions depend only on z, so they are evaluated once per grid point).
 * Samples are the darkest pixels per range bin, capped at MAX_FIT_SAMPLES.
 */
const MAX_FIT_SAMPLES = 400;
const FIT_BETAS = [0.3, 0.45, 0.65, 0.9, 1.3, 1.8, 2.5, 3.5, 5, 7];
const FIT_CS = [0, 0.1, 0.2, 0.35, 0.5, 0.7, 1.0, 1.5];
function fitBackscatter3(zsAll: number[], ysAll: number[][]): { A: number; beta: number; c: number }[] {
  const none = [{ A: 0, beta: 1, c: 0 }, { A: 0, beta: 1, c: 0 }, { A: 0, beta: 1, c: 0 }];
  if (zsAll.length < MIN_DARK * 2) return none;
  const stride = Math.max(1, Math.ceil(zsAll.length / MAX_FIT_SAMPLES));
  const zs: number[] = [];
  const ys: number[][] = [[], [], []];
  for (let k = 0; k < zsAll.length; k += stride) {
    zs.push(zsAll[k]);
    for (let c = 0; c < 3; c++) ys[c].push(ysAll[c][k]);
  }
  const m = zs.length;
  const g = new Float32Array(m);
  const best = [
    { A: 0, beta: 1, c: 0, err: Number.POSITIVE_INFINITY },
    { A: 0, beta: 1, c: 0, err: Number.POSITIVE_INFINITY },
    { A: 0, beta: 1, c: 0, err: Number.POSITIVE_INFINITY },
  ];
  for (const beta of FIT_BETAS) {
    for (const c of FIT_CS) {
      let gg = 0;
      for (let k = 0; k < m; k++) {
        const v = 1 - Math.exp(-(beta * zs[k] + c));
        g[k] = v;
        gg += v * v;
      }
      // Mild preference for smaller offsets so the near field keeps its signal.
      const penalty = 1 + 0.05 * c;
      for (let ch = 0; ch < 3; ch++) {
        const y = ys[ch];
        let gy = 0, yy = 0;
        for (let k = 0; k < m; k++) {
          gy += g[k] * y[k];
          yy += y[k] * y[k];
        }
        const A = gg > 1e-9 ? Math.min(1, Math.max(0, gy / gg)) : 0;
        // SSE = Σ(A g − y)² = A²gg − 2A gy + yy
        const err = (A * A * gg - 2 * A * gy + yy) * penalty;
        if (err < best[ch].err) best[ch] = { A, beta, c, err };
      }
    }
  }
  // Red backscatter is physically the smallest of the three; a red fit that
  // sits above green/blue anywhere in range (noise-floor samples pick a flat
  // offset) would make the near-range veil red-dominant and turn neutral
  // objects cyan. Scale red's amplitude down until it stays below.
  const bAt = (f: { A: number; beta: number; c: number }, z: number) => f.A * (1 - Math.exp(-(f.beta * z + f.c)));
  let scaleR = 1;
  for (const z of [0.1, 0.3, 0.6, 1.0]) {
    const r = bAt(best[0], z);
    const gbMin = 0.85 * Math.min(bAt(best[1], z), bAt(best[2], z));
    if (r > gbMin) scaleR = Math.min(scaleR, r > 1e-6 ? gbMin / r : 0);
  }
  best[0].A *= Math.max(0, scaleR);
  return best.map((b) => ({ A: b.A, beta: b.beta, c: b.c }));
}

function percentiles(v: Float32Array, qs: number[]): number[] {
  let lo = Number.POSITIVE_INFINITY, hi = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (!(hi > lo)) return qs.map(() => lo);
  const BINS = 2048;
  const hist = new Uint32Array(BINS);
  const scale = (BINS - 1) / (hi - lo);
  for (let i = 0; i < v.length; i++) hist[((v[i] - lo) * scale) | 0]++;
  const out: number[] = [];
  for (const q of qs) {
    const target = q * v.length;
    let acc = 0;
    let b = 0;
    for (; b < BINS; b++) {
      acc += hist[b];
      if (acc >= target) break;
    }
    out.push(lo + Math.min(b, BINS - 1) / scale);
  }
  return out;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + clampI(x, w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / k;
      acc += src[y * w + clampI(x + r + 1, w)] - src[y * w + clampI(x - r, w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clampI(y, h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / k;
      acc += tmp[clampI(y + r + 1, h) * w + x] - tmp[clampI(y - r, h) * w + x];
    }
  }
  return out;
}

function clampI(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/**
 * Low-res fields for the shader: z, conf and smoothed d, lightly blurred so
 * per-pixel decisions can't speckle, plus the linear colour of each texel as
 * the guide for joint bilateral upsampling.
 */
function buildMaps(z: Float32Array, conf: Float32Array, ds: Float32Array, veilScale: Float32Array, lin: Float32Array, w: number, h: number): DepthMap {
  const zb = boxBlur(z, w, h, 1);
  const cb = boxBlur(boxBlur(conf, w, h, 1), w, h, 1);
  const fields = new Float32Array(MAP_W * MAP_H * 4);
  const guide = new Float32Array(MAP_W * MAP_H * 3);
  for (let ty = 0; ty < MAP_H; ty++) {
    const y0 = Math.floor((ty * h) / MAP_H);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / MAP_H));
    for (let tx = 0; tx < MAP_W; tx++) {
      const x0 = Math.floor((tx * w) / MAP_W);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / MAP_W));
      let sz = 0, sc = 0, sd = 0, sv = 0, sr = 0, sg = 0, sb = 0, cnt = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          sz += zb[i]; sc += cb[i]; sd += ds[i]; sv += veilScale[i];
          sr += lin[i * 3]; sg += lin[i * 3 + 1]; sb += lin[i * 3 + 2];
          cnt++;
        }
      }
      const o = ty * MAP_W + tx;
      fields[o * 4] = sz / cnt;
      fields[o * 4 + 1] = sc / cnt;
      fields[o * 4 + 2] = sd / cnt;
      fields[o * 4 + 3] = sv / cnt;
      guide[o * 3] = sr / cnt;
      guide[o * 3 + 1] = sg / cnt;
      guide[o * 3 + 2] = sb / cnt;
    }
  }
  return { width: MAP_W, height: MAP_H, fields, guide };
}

/** Contrast-limited tile histograms → per-tile equalisation LUTs. */
function buildClahe(enc: Float32Array, w: number, h: number): ClaheLuts {
  const tilesX = CLAHE_TILES_X, tilesY = CLAHE_TILES_Y, bins = CLAHE_BINS;
  const data = new Float32Array(tilesX * tilesY * bins);
  const hist = new Float32Array(bins);
  for (let ty = 0; ty < tilesY; ty++) {
    const y0 = Math.floor((ty * h) / tilesY);
    const y1 = Math.floor(((ty + 1) * h) / tilesY);
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = Math.floor((tx * w) / tilesX);
      const x1 = Math.floor(((tx + 1) * w) / tilesX);
      hist.fill(0);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[Math.min(bins - 1, (enc[y * w + x] * bins) | 0)]++;
          count++;
        }
      }
      // Clip and redistribute the excess evenly.
      const limit = (CLAHE_CLIP * count) / bins;
      let excess = 0;
      for (let b = 0; b < bins; b++) {
        if (hist[b] > limit) {
          excess += hist[b] - limit;
          hist[b] = limit;
        }
      }
      const add = excess / bins;
      let acc = 0;
      const base = (ty * tilesX + tx) * bins;
      for (let b = 0; b < bins; b++) {
        acc += hist[b] + add;
        // LUT value = CDF at the upper edge of the bin.
        data[base + b] = count > 0 ? acc / count : (b + 1) / bins;
      }
    }
  }
  return { tilesX, tilesY, bins, data };
}
