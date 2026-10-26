// Do-no-harm: measurable evidence that a frame needs little or no
// correction, and how that evidence pulls the estimated grade toward the
// identity.
//
// Why: the physics estimate assumes an underwater cast. On footage that is
// already balanced (shallow, lit, filtered or graded) or not underwater at
// all, its assumptions break in a specific way — the ULAP range proxy reads
// colour, not distance (cyan rubble and blue-grey coral read as "far"), so
// the dark-pixel backscatter fit, dominated by open blue water, hands dim
// reef a blue veil larger than the pixel's own blue; per-channel
// subtraction then strips the blue out (pink coral → brown, blue-grey coral
// → green) while the Shades-of-Gray vote on cyan rubble asks for red ×2.
// The camera already recorded the reds, so the right move is to back off.
//
// Two scores, both 0..1 and both computed on the analysis thumbnail:
//  - `calm` (colour): backs off the white balance, the range compensation
//    and the backscatter subtraction. Driven by healthy reds — a frame where
//    a real share of pixels is clearly red/orange (coral, skin in sunlight,
//    a lit subject) has red light reaching the camera — and by the topside
//    evidence below.
//  - `calmTone` (tone): also backs off exposure, levels, local contrast,
//    haze removal and the person/skin memory colour. Driven only by
//    "this is not underwater at all": no water cast in the bright pixels
//    (R ≈ G, B ≈ G), no warm/magenta cast in the dark floor and clear
//    air (blacks not lifted).
// Both are functions of frame statistics only; the clip lock takes their
// median and the temporal smoother eases them like any other parameter.

import { linearToOklab } from "./color.ts";
import type { GradeParams, GradeSettings, Vec3 } from "./params.ts";

export const CALM = {
  // Healthy reds: share of pixels with Oklab hue in [hueLo, hueHi] (red →
  // orange), chroma ≥ warmC and lightness ≥ warmL. Raw underwater footage
  // measures ~0 here (red is the first colour the water takes); an
  // already-balanced reef 2–25 %.
  hueLo: (-30 * Math.PI) / 180,
  hueHi: (70 * Math.PI) / 180,
  warmC: 0.06,
  warmL: 0.2,
  warmLo: 0.012,
  warmHi: 0.05,
  // No water cast: median R/G of the brighter pixels (linear Y ≥ rgY).
  // Raw underwater ≤ ~0.5, balanced/topside ~0.9–1.3.
  rgY: 0.15,
  rgLo: 0.78,
  rgHi: 0.95,
  // … and B/G inside a neutral band (a purple or yellow cast is still a cast).
  bgLo0: 0.45,
  bgLo1: 0.6,
  bgHi0: 1.25,
  bgHi1: 1.5,
  // Dark floor: p2 of red over max(p2 green, p2 blue). Backscatter leaves
  // almost no red in the floor (≤ ~0.1 even in camera-balanced footage);
  // topside shadows, blue sea included, keep ≥ ~0.4. A floor well above
  // neutral is a warm/magenta cast (over-filtered or pink-hazed footage)
  // that the balance should still remove. A floor too dark to measure
  // (< floorMin) counts as neutral.
  floorLo: 0.15,
  floorHi: 0.3,
  floorMin: 0.015,
  floorWarmLo: 1.05,
  floorWarmHi: 1.2,
  // … but only a magenta floor (blue up with red, B/G of the bright pixels
  // at or above neutral) is a cast to remove: a warm floor under yellow-brown
  // bright pixels (B/G well below 1, R/G above 1) is graded or lit footage —
  // a sea floor under ROV lights, already balanced — and is left alone.
  floorMagentaLo: 0.85,
  floorMagentaHi: 1.0,
  // Clear air: the lifted-black haze measure (GradeParams.haze) above which
  // a frame is murky water, not topside.
  // (An overcast sea measures ~0.2; murky water and hazy reefs 0.35+.)
  hazeLo: 0.2,
  hazeHi: 0.35,
  // Strong healthy reds (a red share well above any raw underwater frame:
  // lionfish, red coral, sponges under daylight or a light) mean the camera
  // already recorded the scene — graded or lit footage — and also back off
  // the tone stages (exposure, levels, local contrast), in clear water only.
  redToneLo: 0.06,
  redToneHi: 0.12,
  // How far each score moves its stages toward the identity at 1.
  colourMax: 0.9,
  toneMax: 0.9,
  // Highlight shoulder knee at full tone calm (1 would divide by zero in the shader).
  knee: 0.97,
};

export type CalmEvidence = {
  /** Share of clearly red/orange pixels. */
  warm: number;
  /** Median R/G of the brighter pixels. */
  rg: number;
  /** Median B/G of the brighter pixels. */
  bg: number;
  /** Dark-floor red over max(green, blue), 1 when too dark to tell. */
  floor: number;
  /** Healthy-reds score (0..1). */
  reds: number;
  /** No-cast score (0..1): bright pixels R ≈ G ≈ B and no warm cast in the dark floor. */
  noCast: number;
};

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Histogram quantiles on a fixed range (no sorting: this runs per analysis).
const HIST_BINS = 1024;
const hist = { rg: new Uint32Array(HIST_BINS), bg: new Uint32Array(HIST_BINS), r: new Uint32Array(HIST_BINS), g: new Uint32Array(HIST_BINS), b: new Uint32Array(HIST_BINS) };
const RATIO_MAX = 4; // R/G and B/G histograms cover 0..4
const FLOOR_MAX = 0.25; // dark-floor histograms cover linear 0..0.25 (p2 lives far below)
function bin(v: number, max: number): number {
  return Math.min(HIST_BINS - 1, Math.max(0, (v * (HIST_BINS / max)) | 0));
}
function histQuantile(h: Uint32Array, n: number, q: number, max: number): number {
  const target = q * n;
  let acc = 0;
  for (let k = 0; k < HIST_BINS; k++) {
    acc += h[k];
    if (acc >= target) return ((k + 0.5) * max) / HIST_BINS;
  }
  return max;
}

/**
 * Frame evidence from the linear-RGB thumbnail (every 3rd pixel).
 */
export function calmEvidence(lin: Float32Array, n: number): CalmEvidence {
  for (const h of Object.values(hist)) h.fill(0);
  let warm = 0, cnt = 0, nrg = 0;
  const mid = (CALM.hueLo + CALM.hueHi) / 2, cMid = Math.cos(mid), sMid = Math.sin(mid);
  const halfCos = Math.cos((CALM.hueHi - CALM.hueLo) / 2);
  for (let i = 0; i < n; i += 3) {
    const r = lin[i * 3], g = lin[i * 3 + 1], b = lin[i * 3 + 2];
    cnt++;
    hist.r[bin(r, FLOOR_MAX)]++;
    hist.g[bin(g, FLOOR_MAX)]++;
    hist.b[bin(b, FLOOR_MAX)]++;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (Y >= CALM.rgY) {
      const gi = 1 / Math.max(1e-4, g);
      hist.rg[bin(r * gi, RATIO_MAX)]++;
      hist.bg[bin(b * gi, RATIO_MAX)]++;
      nrg++;
    }
    // Warm candidates need red above green; skip the Oklab maths otherwise.
    if (r <= g * 0.9) continue;
    const [L, a, bb] = linearToOklab(r, g, b);
    const C = Math.hypot(a, bb);
    // Hue inside the band ⇔ angle to the band's centre ≤ half its width.
    if (L >= CALM.warmL && C >= CALM.warmC && (a * cMid + bb * sMid) / C >= halfCos) warm++;
  }
  const warmFrac = warm / Math.max(1, cnt);
  const enough = nrg >= cnt * 0.02;
  const rgMed = enough ? histQuantile(hist.rg, nrg, 0.5, RATIO_MAX) : 0;
  const bgMed = enough ? histQuantile(hist.bg, nrg, 0.5, RATIO_MAX) : 0;
  const fR = histQuantile(hist.r, cnt, 0.02, FLOOR_MAX);
  const fGB = Math.max(histQuantile(hist.g, cnt, 0.02, FLOOR_MAX), histQuantile(hist.b, cnt, 0.02, FLOOR_MAX));
  const floor = fGB < CALM.floorMin ? 1 : fR / fGB;
  const noCast =
    smoothstep(CALM.rgLo, CALM.rgHi, rgMed) *
    smoothstep(CALM.bgLo0, CALM.bgLo1, bgMed) * (1 - smoothstep(CALM.bgHi0, CALM.bgHi1, bgMed)) *
    smoothstep(CALM.floorLo, CALM.floorHi, floor) * (1 - smoothstep(CALM.floorWarmLo, CALM.floorWarmHi, floor) * smoothstep(CALM.floorMagentaLo, CALM.floorMagentaHi, bgMed));
  return { warm: warmFrac, rg: rgMed, bg: bgMed, floor, reds: smoothstep(CALM.warmLo, CALM.warmHi, warmFrac), noCast };
}

/**
 * The two calm scores for a frame from its evidence and lifted-black haze
 * (GradeParams.haze). No cast in clear air reads as topside (or footage
 * already corrected): both scores. Healthy reds alone: colour only. A hazy
 * frame without a cast keeps its veil removal — there the neutral veil is
 * the haze.
 */
export function calmScores(e: CalmEvidence, haze: number): { calm: number; calmTone: number } {
  const clear = 1 - smoothstep(CALM.hazeLo, CALM.hazeHi, haze);
  const topside = e.noCast * clear;
  const graded = smoothstep(CALM.redToneLo, CALM.redToneHi, e.warm) * clear;
  return { calm: CALM.colourMax * Math.max(e.reds, topside), calmTone: CALM.toneMax * Math.max(topside, graded) };
}

/** Tone calm of a parameter set (0 when absent). */
export function calmToneOf(p: GradeParams): number {
  return Math.min(1, Math.max(0, p.calmTone ?? 0));
}

/**
 * Pulls the estimated parameters toward the identity by the frame's calm
 * scores: colour calm on the balance, range compensation and veil; tone
 * calm on exposure, levels, haze and the highlight shoulder. Runs first,
 * before the intensity push, presets, haze-adaptive defaults and the look.
 */
export function calmParams(p: GradeParams): GradeParams {
  const k = Math.min(1, Math.max(0, p.calm ?? 0));
  const t = Math.min(1, Math.max(0, p.calmTone ?? 0));
  if (k <= 0 && t <= 0) return p;
  const toward1 = (g: number) => Math.pow(Math.max(1e-4, g), 1 - k);
  const keep = 1 - t;
  return {
    ...p,
    wb: p.wb.map(toward1) as Vec3,
    waterWb: p.waterWb.map(toward1) as Vec3,
    attn: p.attn.map((a) => a * (1 - k)) as Vec3,
    binf: p.binf.map((b) => b * (1 - k)) as Vec3,
    exposure: Math.pow(Math.max(1e-4, p.exposure), keep),
    levelsMix: p.levelsMix * keep,
    haze: p.haze * keep,
    hazeBlack: p.hazeBlack * keep,
    hazeFloor: p.hazeFloor.map((f) => f * keep) as Vec3,
    knee: p.knee + (Math.max(p.knee, CALM.knee) - p.knee) * t,
  };
}

/** Tone calm on the controls: local contrast and water-path dehaze. */
export function calmSettings(g: GradeSettings, p: GradeParams): GradeSettings {
  const t = Math.min(1, Math.max(0, p.calmTone ?? 0));
  if (t <= 0) return g;
  return { ...g, clarity: g.clarity * (1 - t), dehaze: g.dehaze * (1 - t) };
}
