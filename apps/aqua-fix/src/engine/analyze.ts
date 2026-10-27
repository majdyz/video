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
//      pulled toward neutralising a sand / white-rubble reference when one
//      fills enough of the frame, with a memory-colour guardrail that backs
//      the red gain off when warm tones drift into magenta
//   (+) do-no-harm evidence (calm.ts): already-balanced / topside scores
//   5. auto exposure / levels in linear luminance
//   6. CLAHE tile LUTs on the encoded luminance for local contrast

import { labelAnimals, type AnimalMap } from "./animals.ts";
import { BACKDROP, backdropObjectness, growSubjects } from "./backdrop.ts";
import { calmEvidence, calmScores } from "./calm.ts";
import { RED, greenCastOf } from "./red.ts";
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
 CONF_BRIGHT, DEFAULT_SETTINGS, HAZE_AUTO, hazeLiftRatio, hazeWeightOf } from "./params.ts";

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
// Spread of the range prior (p98 − p2 of ULAP d) below which range
// compensation fades out.
const RANGE_SPREAD_LO = 0.12;
const RANGE_SPREAD_HI = 0.3;
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
// Hue distance from the veil beyond which an object is de-scattered
// proportionally only (it has escaped the cast: it is near, and the global
// fit overstates its veil — per-channel subtraction turns yellow orange).
const HUE_FAR_LO = (60 * Math.PI) / 180;
const HUE_FAR_HI = (110 * Math.PI) / 180;
// Backdrop fit votes: pixels whose hue is this far from the veil's cannot be water.
const BACKDROP_HUE_LO = (30 * Math.PI) / 180;
const BACKDROP_HUE_HI = (60 * Math.PI) / 180;
// The water path keeps most of its original brightness.
const WATER_EXPOSURE = 0.8;
// How much of the white balance the water path gets (exponent on the gains).
const WATER_WB_POWER = 0.6;
const WATER_WB_MAX = 1.6;
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
// A deep or murky scene is far-dominated everywhere: few pixels keep much
// signal, yet it is exactly where the balance must act. A few percent of
// voting pixels is enough.
const WB_CONF_LO = 0.01;
const WB_CONF_HI = 0.06;
// Memory-colour guardrail: back red off while too many mid-tone, saturated
// pixels sit in the magenta hue band.
const MAGENTA_LO = 300;
const MAGENTA_HI = 348;
const MAGENTA_MAX_FRACTION = 0.015;
const GUARD_STEPS = 6;
// Exposure / levels.
const KEY_TARGET = 0.14;
// Share of confident pixels below which the key stops driving exposure.
const KEY_COVER_LO = 0.02;
const KEY_COVER_HI = 0.15;
const EXPOSURE_MIN = 0.6;
// The key alone pulls a bright scene down no further than this; the
// highlight ceiling may go on to EXPOSURE_MIN.
const KEY_EXPOSURE_MIN = 0.75;
const EXPOSURE_MAX = 1.35;
const HIGHLIGHT_CEILING = 0.86;
const LEVELS_MIX = 0.5;
const LEVELS_WHITE_MIN = 0.65;
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
// Lifted-black level (p0.4 of exposed luminance) that counts as fully hazy.
const HAZE_BLACK_REF = 0.12;

// Per-frame temporaries, reused between calls (one analysis at a time per
// worker): ~15 thumbnail-sized allocations a frame were a tenth of the cost in GC.
const scratch = new Map<string, Float32Array>();
function temp(name: string, len: number): Float32Array {
  let a = scratch.get(name);
  if (!a || a.length !== len) { a = new Float32Array(len); scratch.set(name, a); }
  return a;
}
// linear → sRGB encoding on a 4096-entry table with linear interpolation
// (error < 2e-5, far below the 256-bin CLAHE histogram's resolution).
const ENC_LUT_N = 4096;
const ENC_LUT = new Float32Array(ENC_LUT_N + 1);
for (let i = 0; i <= ENC_LUT_N; i++) ENC_LUT[i] = linearToSrgb(i / ENC_LUT_N);
function encodeLut(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  const f = c * ENC_LUT_N;
  const i = f | 0;
  const t = f - i;
  return ENC_LUT[i] + (ENC_LUT[i + 1] - ENC_LUT[i]) * t;
}

export function analyzeThumbnail(rgba: Uint8ClampedArray, w: number, h: number): FrameAnalysis {
  const n = w * h;
  const lin = temp("lin", n * 3);
  const d = temp("d", n);
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
  const ds = boxBlur(boxBlur(d, w, h, 2, temp("blurA", n), temp("blurT", n)), w, h, 2, temp("blurB", n), temp("blurT", n));
  const [zLo, zHi] = percentiles(ds, [0.02, 0.98]);
  const zRange = Math.max(0.02, zHi - zLo);
  const z = temp("z", n);
  for (let i = 0; i < n; i++) z[i] = clamp01((ds[i] - zLo) / zRange);

  // 2. Backscatter fit from the darkest pixels in each range bin. Per bin,
  // a luminance histogram gives the brightness threshold of the darkest
  // DARK_FRACTION; everything under it is a sample (O(n), no sorting).
  const samplesZ: number[] = [];
  const samplesC: number[][] = [[], [], []];
  const lum = temp("lum", n);
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
  const hueObj = temp("hueObj", n);
  const hueFarArr = temp("hueFar", n);
  // Chroma and cosine of the hue angle to the veil, kept for the sand reference.
  const chroma = temp("chroma", n);
  const veilCos = temp("veilCos", n);
  const okL = temp("okL", n), okA = temp("okA", n), okB = temp("okB", n), bdWater = temp("bdWater", n);
  for (let i = 0; i < n; i++) {
    const [pl, pa, pb] = linearToOklab(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]);
    okL[i] = pl; okA[i] = pa; okB[i] = pb;
    bdWater[i] = 1 - hueFarness(pa, pb, veilHue, BACKDROP_HUE_LO, BACKDROP_HUE_HI, ACHROMA);
    const pc = Math.hypot(pa, pb);
    chroma[i] = pc;
    veilCos[i] = pc > 1e-6 ? (pa * veilHue[0] + pb * veilHue[1]) / pc : 1;
    hueObj[i] = hueConfidence(pa, pb, veilHue, HUE_LO, HUE_HI, ACHROMA);
    hueFarArr[i] = hueFarness(pa, pb, veilHue, HUE_FAR_LO, HUE_FAR_HI, ACHROMA);
  }
  // Global backscatter fit per pixel and channel, shared by the veil-scale
  // map and the de-scatter pass below.
  const bfArr = temp("bf", n * 3);
  for (let i = 0; i < n; i++) {
    const zi = z[i];
    bfArr[i * 3] = binf[0] * (1 - Math.exp(-(betaB[0] * zi + cB[0])));
    bfArr[i * 3 + 1] = binf[1] * (1 - Math.exp(-(betaB[1] * zi + cB[1])));
    bfArr[i * 3 + 2] = binf[2] * (1 - Math.exp(-(betaB[2] * zi + cB[2])));
  }
  // Subjects that share the water's hue but depart from the smooth water
  // backdrop (see backdrop.ts) are objects too: they neither vote for the
  // local veil scale nor take the water path.
  const backdrop = temp("backdrop", n);
  const backdropFit = new Float32Array(18);
  const bdDev = temp("bdDev", n);
  // Clear blue open water only (veil B/G well above 1): in green or cyan murk the
  // hue test and the existing grade already separate the reef, and the
  // open-water treatment cost them local contrast.
  const openBlue = smoothstep(BACKDROP.blueLo, BACKDROP.blueHi, veilColor[2] / Math.max(1e-4, veilColor[1]));
  const backdropValidity = openBlue > 0 ? backdropObjectness(okL, okA, okB, bdWater, w, h, backdrop, backdropFit, bdDev) * openBlue : 0;
  if (openBlue <= 0) backdrop.fill(0, 0, n);
  else if (openBlue < 1) for (let i = 0; i < n; i++) backdrop[i] *= openBlue;
  const objHue = temp("objHue", n);
  // Where the backdrop holds it alone tells subject from water: the hue test
  // calls the deeper blue near the bottom of an open-water frame an object
  // (23° off the brightest water), and the object path then paints it as a
  // dark mottled band that moves with the camera.
  // Only pixels the surface predicts as water lose the hue verdict (a dark reef
  // in green murk departs from the surface and keeps it).
  for (let i = 0; i < n; i++) objHue[i] = Math.max(hueObj[i] * (1 - backdropValidity * (1 - bdDev[i])), backdrop[i]);
  const veilScale = veilScaleMap(lin, objHue, bfArr, w, h, temp("veilScale", n));
  // Green water (red.ts): every object shares the green veil's hue, so the hue
  // test calls the whole scene water; there the signal test decides alone.
  const greenObj = greenCastOf(binf, veilColor) * RED.greenObj;
  const J = temp("J", n * 3);
  const conf = temp("conf", n);
  const wbWeight = temp("wbWeight", n);
  // Mirrors the shader: the scaled veil says whether a pixel *is* water
  // (sunlit water sits above the global fit); what gets subtracted from an
  // object is at most the global fit; and a pixel that keeps little signal
  // gets a proportional (hue-preserving) subtraction instead of per channel.
  for (let i = 0; i < n; i++) {
    const lumI = Math.max(1e-5, lum[i]);
    const subScale = Math.min(1, veilScale[i]);
    let lumBc = 0, lumBs = 0;
    const Bsub = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const bf = bfArr[i * 3 + c];
      Bsub[c] = subScale * bf;
      const wl = c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722;
      lumBc += veilScale[i] * bf * wl;
      lumBs += Bsub[c] * wl;
    }
    const sig = Math.max(0, (lumI - lumBc) / lumI);
    const wSub = smoothstep(SUB_LO, SUB_HI, sig) * (1 - hueFarArr[i]);
    const prop = Math.max(FLOOR_FRAC, 1 - lumBs / lumI);
    for (let c = 0; c < 3; c++) {
      const I = lin[i * 3 + c];
      const per = Math.max(I - Bsub[c], I * FLOOR_FRAC);
      J[i * 3 + c] = I * prop + (per - I * prop) * wSub;
    }
    const confSignal = smoothstep(CONF_LO, CONF_HI, sig);
    // Far brighter than the water at its range → object, whatever the hue.
    // Where the water backdrop holds, brightness alone is not enough: a sun
    // glow under the surface is brighter water without an outline, and only
    // what the backdrop calls a subject keeps the brightness rule.
    const confBright = smoothstep(CONF_BRIGHT.lo, CONF_BRIGHT.hi, sig) * (1 - backdropValidity + backdrop[i]);
    conf[i] = Math.min(confSignal, Math.max(objHue[i], confBright, greenObj));

    // The balance vote uses the signal test alone: in a blue scene nearly
    // every object shares the water's hue and the hue test would starve the
    // vote, leaving deep reef uncorrected. Open water drops out by itself.
    wbWeight[i] = Math.sqrt(confSignal);
  }

  // 4. Shades-of-Gray white balance (p = 6) on the de-scattered image,
  // weighted by confidence so open water doesn't vote.
  const P = 6;
  let sr = 0, sg = 0, sb = 0, sw = 0;
  for (let i = 0; i < n; i++) {
    const wgt = wbWeight[i];
    if (wgt <= 0) continue;
    const r = J[i * 3], g = J[i * 3 + 1], b = J[i * 3 + 2];
    const r2 = r * r, g2 = g * g, b2 = b * b;
    sr += wgt * r2 * r2 * r2;
    sg += wgt * g2 * g2 * g2;
    sb += wgt * b2 * b2 * b2;
    sw += wgt;
  }
  const wb: Vec3 = [1, 1, 1];
  // Green water (red.ts): the balance limits open up under a green veil.
  const green = greenCastOf(binf, veilColor);
  if (sw > 0) {
    const er = Math.pow(sr / sw, 1 / P) + 1e-5;
    const eg = Math.pow(sg / sw, 1 / P) + 1e-5;
    const eb = Math.pow(sb / sw, 1 / P) + 1e-5;
    wb[0] = Math.min(WB_R_MAX + (RED.greenRMax - WB_R_MAX) * green, Math.max(WB_R_MIN, eg / er));
    // Blue is the last channel the water takes: a blue gain above 1 is only
    // physical when the water itself is green (chlorophyll absorbs blue).
    // Under a blue veil a gray-world blue push is a yellow subject (algae,
    // sand) being neutralised, so cap it by the veil's green:blue ratio.
    const bMax = Math.min(WB_B_MAX + (RED.greenBMax - WB_B_MAX) * green, Math.max(1, binf[1] / Math.max(1e-4, binf[2])));
    wb[2] = Math.min(bMax, Math.max(WB_B_MIN, eg / eb));
  }
  // Mostly-water scenes: shrink toward identity.
  const wbConf = smoothstep(WB_CONF_LO, WB_CONF_HI, sw / n);
  wb[0] = 1 + (wb[0] - 1) * wbConf;
  wb[2] = 1 + (wb[2] - 1) * wbConf;
  // Neutral reference: a large, bright, smooth patch on the cast side of
  // neutral (sand, white rubble) is the best white point a reef offers.
  // Gray-world averages it with seagrass and green reef and stops short
  // (sand stays beige-green); where such a patch exists the balance moves
  // toward neutralising it.
  // The reference colour is de-scattered the way the shader will do it at
  // the default veil amount: per-pixel range detail (bright sand reads
  // nearer than the smoothed prior) and DEFAULT_SETTINGS.veil of the fit.
  // Solving on the analysis' own J (smoothed range, full veil) removed more
  // green veil than the render does and left the sand green.
  const sandSub = (i: number, out: Vec3): number => {
    const zs = Math.min(1.15, Math.max(0, z[i] + Math.min(0.25, Math.max(-0.25, (DEPTH_GUIDE * (d[i] - ds[i])) / zRange))));
    const lumI = Math.max(1e-5, lum[i]);
    let lumBc = 0, lumBs = 0;
    const bs: Vec3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const bf = DEFAULT_SETTINGS.veil * binf[c] * (1 - Math.exp(-(betaB[c] * zs + cB[c])));
      const wl = c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722;
      bs[c] = Math.min(1, veilScale[i]) * bf;
      lumBc += veilScale[i] * bf * wl;
      lumBs += bs[c] * wl;
    }
    // Same blend as the shader: per channel where the signal is healthy,
    // proportional (hue-preserving) where it is weak.
    const wSub = smoothstep(SUB_LO, SUB_HI, Math.max(0, (lumI - lumBc) / lumI)) * (1 - hueFarArr[i]);
    const prop = Math.max(FLOOR_FRAC, 1 - lumBs / lumI);
    for (let c = 0; c < 3; c++) {
      const I = lin[i * 3 + c];
      const per = Math.max(I - bs[c], I * FLOOR_FRAC);
      out[c] = I * prop + (per - I * prop) * wSub;
    }
    return zs;
  };
  // Green water (red.ts): a green-water scene averages warm (sand, rock,
  // brown algae under the cast), not grey: the gray-world vote aims there
  // (a sand reference, below, overrides it).
  if (green > 0) {
    wb[0] *= 1 + (RED.greenWarmR - 1) * green;
    wb[2] *= 1 + (RED.greenWarmB - 1) * green;
  }
  const sandMask = new Uint8Array(n);
  const sand = sandReference(sandSub, conf, hueObj, chroma, veilCos, lum, w, h, sandMask);
  if (sand.weight > 0) {
    const veilGB = binf[1] / Math.max(1e-4, binf[2]);
    // Under a green veil blue is genuinely attenuated; the sand may ask for
    // more blue than the gray-world cap (that cap guards against yellow
    // algae, which never passes the cast-side test below).
    const bMax = veilGB > 1 ? Math.min(SAND_B_MAX, veilGB * veilGB) : 1;
    // The range compensation then multiplies channel c by wb_c^(γ·rc·(z − zMean)):
    // solve for the balance that neutralises the sand after it.
    const e = 1 / Math.max(0.5, 1 + ATTN_GAMMA * smoothstep(RANGE_SPREAD_LO, RANGE_SPREAD_HI, zHi - zLo) * (sand.z - zMean));
    const gR = Math.min(WB_R_MAX, Math.max(WB_R_MIN, Math.pow(sand.mean[1] / Math.max(1e-5, sand.mean[0]), e)));
    const gB = Math.min(bMax, Math.max(WB_B_MIN, Math.pow((SAND_BLUE_TARGET * sand.mean[1]) / Math.max(1e-5, sand.mean[2]), e)));
    const mixLog = (a: number, b: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * sand.weight);
    wb[0] = mixLog(wb[0], gR);
    wb[2] = mixLog(wb[2], gB);
  }
  // Memory-colour guardrail.
  for (let step = 0; step < GUARD_STEPS; step++) {
    if (magentaFraction(J, wbWeight, n, wb) <= MAGENTA_MAX_FRACTION) break;
    wb[0] = Math.max(WB_R_MIN, wb[0] * 0.9);
  }
  // Range compensation only where the range prior actually spreads: on a
  // flat prior its per-pixel noise is all it would act on, and the prior
  // reads bright, red-rich subjects (skin) as nearest — handing exactly the
  // pixels that need the most red the least.
  const rangeConf = smoothstep(RANGE_SPREAD_LO, RANGE_SPREAD_HI, zHi - zLo);
  const attn: Vec3 = [ATTN_GAMMA * rangeConf * Math.log(wb[0]), 0, ATTN_GAMMA * rangeConf * Math.log(wb[2])];
  for (let i = 0; i < n; i++) {
    const dz = z[i] - zMean;
    for (let c = 0; c < 3; c++) {
      J[i * 3 + c] *= Math.min(GAIN_CAP, Math.max(1 / GAIN_CAP, Math.exp(attn[c] * dz)));
    }
  }
  // The water path gets a toned-down balance, capped: deep or murky water
  // whose balance runs to the clamp must stay water-coloured rather than
  // turn grey-white.
  const waterGain = (g: number) => Math.min(WATER_WB_MAX, Math.max(1 / WATER_WB_MAX, Math.pow(g, WATER_WB_POWER)));
  const waterWb: Vec3 = [waterGain(wb[0]), 1, waterGain(wb[2])];
  // Open blue water keeps its blue: a gray-world blue cut on the water path
  // (asked for by a yellow subject) turns clean blue water teal. Only where
  // the backdrop model says the frame is open water, and only under a blue
  // (not cyan or green) veil.
  if (waterWb[2] < 1) waterWb[2] += (1 - waterWb[2]) * backdropValidity * smoothstep(1, 1.25, binf[2] / Math.max(1e-4, binf[1]));
  // Green water (red.ts): the water is the cast; it takes (most of) the full balance.
  if (green > 0) for (const c of [0, 2]) waterWb[c] = Math.exp(Math.log(waterWb[c]) + (Math.log(wb[c]) - Math.log(waterWb[c])) * green * RED.greenWater);
  // Final per-pixel signal before exposure: mix(water, physics, conf). The
  // exposure is solved below on the physics path; the water path takes
  // exposure^WATER_EXPOSURE, which the shader applies per pixel.
  const waterLin = temp("waterLin", n * 3);
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
  const Y = temp("Y", n);
  const mixYAt = (i: number, e: number, ew: number) => {
    const wgt = conf[i];
    const i3 = i * 3;
    const w0 = waterLin[i3] * ew, w1 = waterLin[i3 + 1] * ew, w2 = waterLin[i3 + 2] * ew;
    let y = (w0 + (J[i3] * e - w0) * wgt) * 0.2126;
    y += (w1 + (J[i3 + 1] * e - w1) * wgt) * 0.7152;
    y += (w2 + (J[i3 + 2] * e - w2) * wgt) * 0.0722;
    // Shadow floor and highlight shoulder, as the shader applies them.
    y = Math.max(y, shadowFloorAt(lum[i]) * lum[i] * ew);
    return y > KNEE ? KNEE + (1 - KNEE) * (1 - Math.exp(-(y - KNEE) / (1 - KNEE))) : y;
  };
  const mixY = (i: number, e: number) => mixYAt(i, e, Math.pow(e, WATER_EXPOSURE));
  // Key from the object pixels of the blended image at unit exposure. A
  // scene with (almost) no confident pixels — deep blue, far wreck, murky
  // haze — is left at its own brightness: lifting it only whitens the haze.
  let logSum = 0, logW = 0, confSum = 0;
  for (let i = 0; i < n; i++) {
    const y = mixYAt(i, 1, 1);
    logSum += conf[i] * Math.log(1e-4 + y);
    logW += conf[i];
    confSum += conf[i];
  }
  const coverage = smoothstep(KEY_COVER_LO, KEY_COVER_HI, confSum / n);
  const lavg = logW > 1e-6 ? Math.exp(logSum / logW) : KEY_TARGET;
  let exposure = Math.min(EXPOSURE_MAX, Math.max(KEY_EXPOSURE_MIN, KEY_TARGET / Math.max(1e-4, lavg)));
  exposure = 1 + (exposure - 1) * coverage;
  {
    const ew = Math.pow(exposure, WATER_EXPOSURE);
    for (let i = 0; i < n; i++) Y[i] = mixYAt(i, exposure, ew);
  }
  const [p995] = percentiles(Y, [0.995]);
  if (p995 > HIGHLIGHT_CEILING) {
    // Scale the whole exposure down until the highlights fit (both paths
    // are monotone in the exposure, so one proportional step is enough).
    exposure = Math.max(EXPOSURE_MIN, exposure * (HIGHLIGHT_CEILING / p995));
    const ew = Math.pow(exposure, WATER_EXPOSURE);
    for (let i = 0; i < n; i++) Y[i] = mixYAt(i, exposure, ew);
  }
  const [black] = percentiles(Y, [0.004]);
  // Per-channel lifted black (the colour of the haze floor), same blend as Y.
  const hazeFloor: Vec3 = [0, 0, 0];
  {
    const ew = Math.pow(exposure, WATER_EXPOSURE);
    const ch = temp("hazeCh", n);
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < n; i++) {
        const wv = waterLin[i * 3 + c] * ew;
        ch[i] = wv + (J[i * 3 + c] * exposure - wv) * conf[i];
      }
      hazeFloor[c] = percentiles(ch, [0.004])[0];
    }
  }
  // The default haze-lift removal (see HAZE_LIFT) runs before levels in the
  // shader: levels and CLAHE are measured on the lifted-black-removed image.
  {
    const tLift = HAZE_AUTO.lift * hazeWeightOf(clamp01(black / HAZE_BLACK_REF)) * black;
    if (tLift > 0) for (let i = 0; i < n; i++) Y[i] *= hazeLiftRatio(Y[i], tLift);
  }
  const [blackL, white] = percentiles(Y, [0.004, 0.996]);
  // A black point is a crush by definition; keep it tiny so a frame that
  // darkens under a smoothed, brighter-frame black point loses nothing.
  const blackPt = Math.min(blackL, 0.015);
  // Never stretch more than ~1.5×: a dim clip should stay dim-ish rather
  // than have its brighter patches shoved to white.
  const whitePt = Math.min(1.0, Math.max(white, blackPt + 0.2, LEVELS_WHITE_MIN));

  // 6. CLAHE on the encoded luminance after levels.
  const enc = temp("enc", n);
  for (let i = 0; i < n; i++) {
    const yl = Y[i];
    const ylv = yl + ((yl - blackPt) / (whitePt - blackPt) - yl) * LEVELS_MIX;
    enc[i] = encodeLut(clamp01(ylv));
  }
  void mixY;
  const clahe = buildClahe(enc, w, h);

  // Open water: the stored object map is dilated (the subject moves before
  // the next analysis lands and the map eases); the shaders' per-pixel
  // backdrop test (backdropSubject) cuts it back to the subject itself.
  // In open water the stored map is the whole-animal subject map (growSubjects:
  // back, fins and tail join the bright flank; small fish drop out and keep
  // the normal colour) — the shaders' colour path still multiplies by the
  // per-pixel signal test, so a dark back stays on the water path's colour
  // and only takes the subject tone.
  let confMap = conf;
  let subjectTone = 0;
  let animals: AnimalMap | undefined;
  if (backdropValidity > 0) {
    const subj = temp("subjMap", n);
    subjectTone = growSubjects(backdrop, bdDev, backdropValidity, w, h, subj, okL, backdropFit, bdWater);
    confMap = temp("confMap", n);
    for (let i = 0; i < n; i++) confMap[i] = conf[i] + (subj[i] - conf[i]) * backdropValidity;
    animals = labelAnimals(subj, bdDev, w, h, MAP_W, MAP_H);
  }
  const depth = buildMaps(z, confMap, ds, veilScale, lin, w, h);
  if (animals) depth.animals = animals;
  const haze = clamp01(black / HAZE_BLACK_REF);
  const evidence = calmEvidence(lin, n);
  const { calm, calmTone } = calmScores(evidence, haze);
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
    hueFarLo: HUE_FAR_LO,
    hueFarHi: HUE_FAR_HI,
    // Haze for the look: how lifted the blacks are after exposure (the
    // references stretch hazy frames down to a real black point and leave
    // clear, contrasty frames alone).
    haze,
    hazeBlack: black,
    hazeFloor,
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
    calm,
    calmTone,
    backdrop: backdropValidity,
    backdropFit: Array.from(backdropFit),
    subjectTone,
  };
  return { params, depth, clahe, mean, diag: { sandWeight: sand.weight, sandFrac: sand.frac, sandMask, calm: evidence, backdrop: backdropValidity } };
}

// Neutral reference (sand / white rubble) for the balance, see sandReference.
const SAND_CONF = 0.5; // object pixels only
const SAND_LUM = 0.12; // source linear luminance (Oklab L ≈ 0.5) …
const SAND_C_MAX = 0.13; // … not strongly coloured in the source …
const SAND_HUE_MAX = (75 * Math.PI) / 180; // … and on the cast side: within this angle of the veil hue (or nearly neutral)
const SAND_ACHROMA = 0.03;
const SAND_HUE_COS = Math.cos(SAND_HUE_MAX);
const SAND_HUE_OBJ = 0.3; // hue-test object confidence (analyze HUE_LO/HUE_HI) at least this
const SAND_TEXTURE = 0.22; // local luminance std / mean (r = 2) below this: smooth …
const SAND_TEXTURE_MIN = 0.045; // … but grainy: open water (bright, smooth, off the deep veil hue near the surface) is smoother still
const SAND_FRAC_LO = 0.05; // candidate share of the frame where the reference starts to count …
const SAND_FRAC_HI = 0.15; // … and fully
const SAND_WEIGHT = 0.95; // how far the balance moves toward neutralising it
const SAND_TOP = 0.7; // the reference is the brightest 30 % of the candidates
const SAND_BLUE_TARGET = 0.94; // sand is a touch warm: B ends at 0.94·G
const SAND_B_MAX = 1.8;

/**
 * Bright, smooth (yet grainy), low-chroma object pixels on the cast side of
 * neutral; the brightest SAND_TOP share of them is the reference. Returns
 * its mean de-scattered colour (before the balance), mean range and a
 * weight from the candidates' share of the frame; `maskOut` (diagnostics)
 * marks the reference pixels.
 */
export function sandReference(
  descatter: (i: number, out: Vec3) => number, conf: Float32Array, hueObj: Float32Array, chroma: Float32Array, veilCos: Float32Array, lum: Float32Array, w: number, h: number,
  maskOut: Uint8Array,
): { weight: number; frac: number; mean: Vec3; z: number } {
  const n = w * h;
  const sq = temp("sandSq", n);
  for (let i = 0; i < n; i++) sq[i] = lum[i] * lum[i];
  const mL = boxBlur(lum, w, h, 2, temp("sandM", n), temp("blurT", n));
  const mS = boxBlur(sq, w, h, 2, temp("sandS", n), temp("blurT", n));
  const cand = temp("sandCand", n);
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    cand[i] = -1;
    // Not water-hued: sunlit open water is bright and smooth too, but it
    // shares the veil's hue; sand under a cast sits off it toward neutral.
    if (conf[i] < SAND_CONF || hueObj[i] < SAND_HUE_OBJ || lum[i] < SAND_LUM) continue;
    const sd = Math.sqrt(Math.max(0, mS[i] - mL[i] * mL[i]));
    if (sd > SAND_TEXTURE * mL[i] || sd < SAND_TEXTURE_MIN * mL[i]) continue;
    const c = chroma[i];
    if (c > SAND_C_MAX) continue;
    if (c > SAND_ACHROMA && veilCos[i] < SAND_HUE_COS) continue;
    cand[i] = lum[i];
    cnt++;
  }
  const frac = cnt / n;
  const weight = SAND_WEIGHT * smoothstep(SAND_FRAC_LO, SAND_FRAC_HI, frac);
  const mean: Vec3 = [0, 0, 0];
  if (weight <= 0) return { weight: 0, frac, mean, z: 0 };
  // Brightest share of the candidates (shadowed sand carries more veil error).
  // Quantile among the candidates only (non-candidates sit at −1, below all).
  const [med] = percentiles(cand, [1 - (1 - SAND_TOP) * frac]);
  let k = 0;
  const px: Vec3 = [0, 0, 0];
  let zSum = 0;
  for (let i = 0; i < n; i++) {
    if (cand[i] < med) continue;
    zSum += descatter(i, px);
    mean[0] += px[0]; mean[1] += px[1]; mean[2] += px[2];
    k++;
  }
  if (k === 0) return { weight: 0, frac, mean, z: 0 };
  mean[0] /= k; mean[1] /= k; mean[2] /= k;
  for (let i = 0; i < n; i++) maskOut[i] = cand[i] >= med ? 1 : 0;
  return { weight, frac, mean, z: zSum / k };
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
  lin: Float32Array, hueObj: Float32Array, bfArr: Float32Array, w: number, h: number, out: Float32Array,
): Float32Array {
  const cx = VEIL_CELLS_X, cy = VEIL_CELLS_Y;
  const samples: number[][] = Array.from({ length: cx * cy }, () => []);
  for (let y = 0; y < h; y++) {
    const ty = Math.min(cy - 1, Math.floor((y * cy) / h));
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (hueObj[i] > 0.5) continue;
      let lb = bfArr[i * 3] * 0.2126;
      lb += bfArr[i * 3 + 1] * 0.7152;
      lb += bfArr[i * 3 + 2] * 0.0722;
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

/** 1 when the hue is ≥ hi radians from the veil's, 0 when ≤ lo or achromatic. */
export function hueFarness(a: number, b: number, veilHue: [number, number], lo: number, hi: number, achroma: number): number {
  const c = Math.hypot(a, b);
  if (c < achroma) return 0;
  const cosang = Math.max(-1, Math.min(1, (a * veilHue[0] + b * veilHue[1]) / c));
  const ang = Math.acos(cosang);
  return smoothstep(lo, hi, ang) * smoothstep(achroma, achroma * 2, c);
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

function boxBlur(src: Float32Array, w: number, h: number, r: number, out: Float32Array = new Float32Array(w * h), tmp: Float32Array = new Float32Array(w * h)): Float32Array {
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
