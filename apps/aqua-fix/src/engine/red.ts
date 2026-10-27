// Red restoration and the colour guards that keep it honest. CPU reference
// (apply.ts calls these) plus the GLSL / WGSL snippets grade-shader.ts
// includes: the three must stay in step (parity within 1/255).
//
// Why: under water the red channel (and in green water the blue one too) is
// a few codes of signal on top of compression noise and chroma blocks. Every
// stage that restores it multiplies that noise — pink speckle, blotches and
// macroblocks that crawl. The physics is right; the input is not fit for the
// gain. So:
//
//  1. Chroma rebuild. A channel the grade is about to amplify is rebuilt as
//     a heavily smoothed, edge-aware ratio times the pixel's own detail from
//     the channels that carry it: c' = s_c · δ, where s is the joint-bilateral
//     guide colour (the analysis thumbnail, ~12 px texels at 1080p, eased over
//     time, matched to the pixel by colour, i.e. smooth inside a region and
//     sharp at edges) and δ = the pixel's luminance detail relative to s,
//     measured on the channels that are not rebuilt. High-frequency red is
//     never amplified, it is taken from green/blue. Bounded to the pixel's own
//     value ± a noise tolerance, so a stale or mismatched guide can never
//     paint a halo.
//  2. Red SNR. Per region (on the smoothed colour): codes of red signal above
//     the veil over the noise floor. The red gain of the physics path scales
//     with it — full in green/coastal water where reds are recorded, moderate
//     in mid blue, minimal in deep blue where red is noise (a thresher clip at
//     R 21–38 across the frame is all veil).
//  3. Guards on the result, in Oklab: a saturation ceiling with a soft
//     roll-off on red/pink/magenta hues (no glaring red, no red clipping),
//     a lower ceiling for light pixels (sand and whites never turn pink), and
//     skin capped at natural skin (hue never below skinHueMin, chroma never
//     above skinCMax) on detected people.
//  4. Green water: under a green veil the balance limits open up and the
//     water path takes (most of) the full balance (analyze.ts) — the rebuild
//     keeps the amplified channels clean — and what is still green-cast after
//     the balance (the veil itself: a red channel of ~0 cannot be balanced
//     back) has its chroma moved toward a muted blue-grey (greenNeutral, a
//     per-pixel Oklab operation on its own colour: no gain, no structure).

import { linearToOklab, linearToSrgb } from "./color.ts";
import type { DepthMap } from "./params.ts";

const D2R = Math.PI / 180;
export const RED = {
  /** Noise floor, sRGB codes (compressed video: grain + chroma blocks). */
  sigma: 2,
  /** Channel gain (relative to green) over which the channel is rebuilt … */
  gainLo: 1.25,
  gainHi: 2.0,
  /** … unless its own signal (codes above the veil / sigma) is this strong. */
  keepLo: 15,
  keepHi: 40,
  /** Rebuilt value stays within the pixel's own ± (tolFrac · value + tolLin). */
  tolFrac: 0.35,
  tolLin: 0.004,
  /** Red gain strength vs red SNR: snrMin at snrLo or less, full by snrHi. */
  snrLo: 1.5,
  snrHi: 6,
  snrMin: 0.25,
  /** Water path: red gain moves this far (log) toward the full red gain as the red SNR (above the local water) rises from waterSnrLo to waterSnrHi. */
  waterRed: 0.8,
  waterSnrLo: 4,
  waterSnrHi: 12,
  /** Red ceiling: hue band centred on `hue` (red), full inside bandIn, none beyond bandOut. */
  hue: 15 * D2R,
  bandIn: 35 * D2R,
  bandOut: 60 * D2R,
  /** Oklab chroma ceiling and the share of it where the soft roll-off starts. */
  cMax: 0.15,
  knee: 0.65,
  /** Pink band (centre, full inside, none beyond): on light pixels the ceiling falls to whiteC between whiteLo and whiteHi (sand, whites never pink). */
  pinkHue: 5 * D2R,
  pinkIn: 40 * D2R,
  pinkOut: 60 * D2R,
  whiteLo: 0.55,
  whiteHi: 0.78,
  whiteC: 0.015,
  /** Skin (detected person, red-starved in the source): hue floor and chroma ceiling. */
  skinHueMin: 15 * D2R,
  skinCMax: 0.085,
  /** Source chroma above which a person pixel is gear, not skin (pink fins keep their colour). */
  skinSrcCLo: 0.07,
  skinSrcCHi: 0.11,
  /** Green veil: B∞ green/blue ratio over which the frame counts as green water. */
  greenLo: 1.15,
  greenHi: 1.8,
  /** … where the balance limits open up to these (red, blue) … */
  greenRMax: 5,
  greenBMax: 3,
  /** … and the water path takes this share of the full balance (instead of the toned-down one). */
  greenWater: 0.7,
  /** … the water path dehazes (gives up part of its veil) by at least this much, so murk clears instead of turning grey-white … */
  greenDehaze: 0.85,
  /** … and the hue test (useless when every object shares the veil's hue) is overruled by this much: the signal test decides. */
  greenObj: 0.9,
  /** … and this share of the veil subtraction is hue-preserving (per channel, the big green veil strips green from near objects: olive seagrass turns red-brown). */
  greenProp: 0.6,
  /** … and the gray-world vote aims at a warm average (R up, B down by these factors at full green). */
  greenWarmR: 1.1,
  greenWarmB: 0.9,
  /** A veil dimmer than this (B∞ green, linear) is too dark to call a cast (ROV lights, night): no green weight. */
  /** Veil colour G/B over which the frame counts as (cyan-)green water too, with enough veil chroma to be a cast. */
  veilGreenLo: 1.35,
  veilGreenHi: 1.85,
  veilChromaLo: 0.03,
  veilChromaHi: 0.06,
  greenLevelLo: 0.03,
  greenLevelHi: 0.08,
  /** greenNeutral: output hue band (centre, full inside, none beyond) … */
  gnHue: 150 * D2R,
  gnIn: 20 * D2R,
  gnOut: 45 * D2R,
  /** … moved this far toward the target chroma (hue, chroma at L = 0.6, scales with L). */
  gnMix: 0.75,
  /** Objects (seagrass, algae: real greens) keep this much of their green: the neutralisation is mostly for the water. */
  gnObjKeep: 0.7,
  gnTargetHue: 240 * D2R,
  gnTargetC: 0.012,
  /** Natural materials in green water (stone, sand, seagrass; source hue near the veil's): warm hues (band centre, full inside, none beyond) keep at most matC chroma, rolled off softly from matKnee x matC. */
  matHue: 70 * D2R,
  matIn: 40 * D2R,
  matOut: 65 * D2R,
  matC: 0.05,
  matKnee: 0.6,
  /** Murk is never lifted: in green water a water-path pixel ends at most at its source luminance. */
  murkHold: 1,
  /** … and dark murk (source linear luminance below murkLo, easing out by murkHi) ends darker still, at murkDark × its source: cleared, not greyed. */
  murkDark: 0.75,
  murkLo: 0.08,
  murkHi: 0.25,
};

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Green-water weight of a frame from its veiling light (0 blue/cyan … 1 green). */
export function greenCastOf(binf: readonly number[], veil?: readonly number[]): number {
  const fromBinf = smoothstep(RED.greenLo, RED.greenHi, binf[1] / Math.max(1e-4, binf[2]));
  // The veil colour (the brightest far water) is the steadier witness of a
  // cyan-green cast: tropical cyan reef water sits at G/B <= ~1.26, cyan-green
  // coastal water well above.
  const fromVeil = veil ? smoothstep(RED.veilGreenLo, RED.veilGreenHi, veil[1] / Math.max(1e-4, veil[2])) * smoothstep(RED.veilChromaLo, RED.veilChromaHi, veilChroma(veil)) : 0;
  return Math.max(fromBinf, fromVeil) * smoothstep(RED.greenLevelLo, RED.greenLevelHi, binf[1]);
}

/** Oklab chroma of the veil colour (how strong a cast it is). */
function veilChroma(v: readonly number[]): number {
  const [, a, b] = linearToOklab(Math.max(0, v[0]), Math.max(0, v[1]), Math.max(0, v[2]));
  return Math.hypot(a, b);
}

/** Green-water weight the shaders read (uniform p22.w): the veil's, backed off by the colour calm. */
export function greenWeight(p: { binf: readonly number[]; veilColor?: readonly number[]; calm?: number }): number {
  return greenCastOf(p.binf, p.veilColor) * (1 - Math.min(1, Math.max(0, p.calm ?? 0)));
}

/** Green water on the controls: the water-path dehaze is at least greenDehaze × the green weight. */
export function greenSettings<T extends { dehaze: number }>(g: T, p: { binf: readonly number[]; veilColor?: readonly number[]; calm?: number }): T {
  const d = RED.greenDehaze * greenWeight(p);
  return d > g.dehaze ? { ...g, dehaze: Math.min(1, d) } : g;
}

/**
 * Green-water chroma neutralisation on the graded Oklab chroma (a, b) at
 * lightness L: hues in the green band move toward a muted blue-grey by
 * gnMix × the frame's green weight g. Returns (a, b).
 */
export function greenNeutral(L: number, a: number, b: number, g: number): [number, number] {
  if (g <= 0) return [a, b];
  const C = Math.hypot(a, b);
  if (C < 1e-5) return [a, b];
  const band = smoothstep(Math.cos(RED.gnOut), Math.cos(RED.gnIn), (a * Math.cos(RED.gnHue) + b * Math.sin(RED.gnHue)) / C);
  const t = RED.gnMix * g * band;
  const tc = RED.gnTargetC * clamp(L / 0.6, 0, 1.3);
  return [a + (tc * Math.cos(RED.gnTargetHue) - a) * t, b + (tc * Math.sin(RED.gnTargetHue) - b) * t];
}

/**
 * Edge-aware smooth colour at the pixel: the guide map's joint-bilateral
 * average (same taps and weights as sampleFields), mixed toward the pixel
 * itself by the guide match k (content that moved since the map was made
 * keeps its own colour). Linear RGB.
 */
export function guideSmooth(d: DepthMap, u: number, v: number, r: number, g: number, b: number): [number, number, number] {
  const fx = Math.min(Math.max(u * d.width - 0.5, 0), d.width - 1);
  const fy = Math.min(Math.max(v * d.height - 0.5, 0), d.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, d.width - 1), y1 = Math.min(y0 + 1, d.height - 1);
  const tx = fx - x0, ty = fy - y0;
  const cn = Math.hypot(r, g, b) + 0.02;
  let sr = 0, sg = 0, sb = 0, sw = 0;
  const taps: [number, number, number][] = [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]];
  for (const [x, y, ws] of taps) {
    const i = y * d.width + x;
    const gr = d.guide[i * 3], gg = d.guide[i * 3 + 1], gb = d.guide[i * 3 + 2];
    const diff = Math.hypot(r - gr, g - gg, b - gb) / (cn + Math.hypot(gr, gg, gb));
    const wgt = ws * Math.exp(-(diff * diff) / (2 * 0.12 * 0.12));
    sr += wgt * gr; sg += wgt * gg; sb += wgt * gb; sw += wgt;
  }
  if (sw < 1e-6) return [r, g, b];
  const k = Math.min(1, sw / 0.08);
  return [r + (sr / sw - r) * k, g + (sg / sw - g) * k, b + (sb / sw - b) * k];
}

/** Signal codes above the veil over the noise floor: enc(s) − enc(veil part) measured as the remainder. */
export function signalSnr(s: number, bs: number): number {
  return (255 * Math.max(0, linearToSrgb(Math.max(0, s)) - linearToSrgb(Math.max(0, Math.min(s, bs))))) / RED.sigma;
}

/**
 * Chroma rebuild (see the header). `lin` the pixel (linear, the artifact
 * guard's base), `s` its smooth colour (guideSmooth), `gain` the grade's
 * per-channel gain relative to green, `bs` the veil the grade subtracts.
 * Returns the rebuilt colour and the red SNR.
 */
export function chromaRebuild(lin: readonly number[], s: readonly number[], gain: readonly number[], bs: readonly number[]): { c: [number, number, number]; snrR: number } {
  const w = [0, 0, 0];
  let snrR = 0;
  for (let c = 0; c < 3; c++) {
    const snr = signalSnr(s[c], bs[c]);
    if (c === 0) snrR = snr;
    w[c] = smoothstep(RED.gainLo, RED.gainHi, gain[c] / Math.max(1e-4, gain[1])) * (1 - smoothstep(RED.keepLo, RED.keepHi, snr));
  }
  const lw = [0.2126, 0.7152, 0.0722];
  let num = 0, den = 0;
  for (let c = 0; c < 3; c++) { const u = lw[c] * (1 - 0.95 * w[c]); num += u * lin[c]; den += u * s[c]; }
  const delta = den > 1e-6 ? num / den : 1;
  const out: [number, number, number] = [lin[0], lin[1], lin[2]];
  for (let c = 0; c < 3; c++) {
    const tol = RED.tolFrac * lin[c] + RED.tolLin;
    const rb = clamp(s[c] * delta, lin[c] - tol, lin[c] + tol);
    out[c] = lin[c] + (rb - lin[c]) * w[c];
  }
  return { c: out, snrR };
}

/**
 * Red gain of the water path: the toned-down water balance, moving (log)
 * toward the full red gain `full` where the pixel holds red above the local
 * water (a reef the hue test calls water); plain water (no red above itself)
 * keeps the water balance.
 */
export function waterRedGain(water: number, full: number, snrR: number): number {
  const t = RED.waterRed * smoothstep(RED.waterSnrLo, RED.waterSnrHi, snrR);
  return water * Math.pow(Math.max(1, full / Math.max(1e-4, water)), t);
}

/**
 * Natural-material ceiling on the graded Oklab chroma (a, b) at lightness L
 * in green water (g = the frame's green weight): a big red/blue balance turns
 * stone, sand and seagrass that shared the veil's hue orange or yellow; their
 * chroma is rolled off toward matC on warm hues. srcFar (source hue far from
 * the veil: a yellow fish that escaped the cast) is exempt.
 */
export function warmMaterial(L: number, a: number, b: number, g: number, srcFar: number): [number, number] {
  if (g <= 0) return [a, b];
  const C = Math.hypot(a, b);
  const knee = RED.matKnee * RED.matC;
  if (C <= knee) return [a, b];
  const band = smoothstep(Math.cos(RED.matOut), Math.cos(RED.matIn), (a * Math.cos(RED.matHue) + b * Math.sin(RED.matHue)) / C);
  const w = g * (1 - srcFar) * band * smoothstep(0.2, 0.3, L) * (1 - smoothstep(0.85, 0.95, L));
  if (w <= 0) return [a, b];
  const room = RED.matC - knee;
  const rolled = knee + room * (1 - Math.exp(-(C - knee) / room));
  const C2 = C + (rolled - C) * w;
  return [(a * C2) / C, (b * C2) / C];
}

/** Murk hold: final luminance y of a water-path pixel, pulled down to (at most) the source luminance ySrc by weight g (green weight × water share). */
export function murkHold(y: number, ySrc: number, g: number): number {
  const cap = ySrc * (RED.murkDark + (1 - RED.murkDark) * smoothstep(RED.murkLo, RED.murkHi, ySrc));
  if (g <= 0 || y <= cap) return y;
  return y + (cap - y) * g * RED.murkHold;
}

/** Strength of the physics path's red gain for a red SNR (see RED.snrLo/snrHi). */
export function redGainStrength(snrR: number): number {
  return RED.snrMin + (1 - RED.snrMin) * smoothstep(RED.snrLo, RED.snrHi, snrR);
}

/**
 * Colour guards on the graded Oklab colour (L, a, b): red ceiling with soft
 * roll-off, light-pixel (sand, whites) pink ceiling, skin cap. (a0, b0) is
 * the source pixel's Oklab chroma: a source that already held a vivid red
 * keeps it. `person` the person mask, `srcFar` the source hue farness from
 * the veil (gear and fish that escaped the cast are not skin).
 */
export function redGuard(L: number, a: number, b: number, a0: number, b0: number, person: number, srcFar: number): [number, number] {
  const C = Math.hypot(a, b);
  if (C < 1e-5) return [a, b];
  const band = smoothstep(Math.cos(RED.bandOut), Math.cos(RED.bandIn), (a * Math.cos(RED.hue) + b * Math.sin(RED.hue)) / C);
  const pink = smoothstep(Math.cos(RED.pinkOut), Math.cos(RED.pinkIn), (a * Math.cos(RED.pinkHue) + b * Math.sin(RED.pinkHue)) / C);
  // Skin: hue floor and chroma ceiling on detected, red-starved person pixels.
  const cSrc = Math.hypot(a0, b0);
  const ws = smoothstep(0.1, 0.5, person) * (1 - smoothstep(RED.skinSrcCLo, RED.skinSrcCHi, cSrc)) * (1 - srcFar) * smoothstep(0.3, 0.45, L);
  let h = Math.atan2(b, a);
  if (ws > 0) {
    // Only hues on the red side of the floor move (−90°..floor); yellow-ward skin is left alone.
    const hr = h < RED.skinHueMin && h > -Math.PI / 2 ? RED.skinHueMin : h;
    h += (hr - h) * ws;
  }
  // Ceiling: red band; light pink pixels far lower (not on skin); never below what the source itself held.
  let cap = RED.cMax + (RED.whiteC - RED.cMax) * smoothstep(RED.whiteLo, RED.whiteHi, L) * pink * (1 - ws);
  cap += (Math.min(cap, RED.skinCMax) - cap) * ws;
  const cosr0 = cSrc > 1e-5 ? (a0 * Math.cos(RED.hue) + b0 * Math.sin(RED.hue)) / cSrc : 0;
  const held = cSrc * smoothstep(Math.cos(RED.bandOut), Math.cos(RED.bandIn), cosr0);
  cap = Math.max(cap, held);
  const w = Math.max(band, pink, ws);
  const knee = Math.max(RED.knee * cap, held);
  let C2 = C;
  if (C2 > knee && w > 0) {
    const room = cap - knee;
    const rolled = knee + room * (1 - Math.exp(-(C2 - knee) / Math.max(1e-6, room)));
    C2 += (rolled - C2) * w;
  }
  if (C2 === C && ws <= 0) return [a, b];
  return [C2 * Math.cos(h), C2 * Math.sin(h)];
}

// ---------------------------------------------------------------- shaders
// Constants as literals, then the same functions in GLSL ES 3.00 and WGSL.
// Need from the including shader: linearToSrgb (vec3), smoothstepf and the
// u_data0 (fields) / u_data2 (guide) textures.
const RED_CONSTS_GLSL = `
const float RED_SIGMA = ${RED.sigma.toFixed(4)};
const float RED_GAIN_LO = ${RED.gainLo.toFixed(4)};
const float RED_GAIN_HI = ${RED.gainHi.toFixed(4)};
const float RED_KEEP_LO = ${RED.keepLo.toFixed(4)};
const float RED_KEEP_HI = ${RED.keepHi.toFixed(4)};
const float RED_TOL_FRAC = ${RED.tolFrac.toFixed(4)};
const float RED_TOL_LIN = ${RED.tolLin.toFixed(5)};
const float RED_SNR_LO = ${RED.snrLo.toFixed(4)};
const float RED_SNR_HI = ${RED.snrHi.toFixed(4)};
const float RED_SNR_MIN = ${RED.snrMin.toFixed(4)};
const float RED_WATER_RED = ${RED.waterRed.toFixed(4)};
const float RED_WATER_SNR_LO = ${RED.waterSnrLo.toFixed(4)};
const float RED_WATER_SNR_HI = ${RED.waterSnrHi.toFixed(4)};
const float RED_HUE_COS = ${Math.cos(RED.hue).toFixed(6)};
const float RED_HUE_SIN = ${Math.sin(RED.hue).toFixed(6)};
const float RED_COS_IN = ${Math.cos(RED.bandIn).toFixed(6)};
const float RED_COS_OUT = ${Math.cos(RED.bandOut).toFixed(6)};
const float RED_PINK_COS = ${Math.cos(RED.pinkHue).toFixed(6)};
const float RED_PINK_SIN = ${Math.sin(RED.pinkHue).toFixed(6)};
const float RED_PINK_COS_IN = ${Math.cos(RED.pinkIn).toFixed(6)};
const float RED_PINK_COS_OUT = ${Math.cos(RED.pinkOut).toFixed(6)};
const float RED_C_MAX = ${RED.cMax.toFixed(4)};
const float RED_KNEE = ${RED.knee.toFixed(4)};
const float RED_WHITE_LO = ${RED.whiteLo.toFixed(4)};
const float RED_WHITE_HI = ${RED.whiteHi.toFixed(4)};
const float RED_WHITE_C = ${RED.whiteC.toFixed(4)};
const float RED_SKIN_HUE_MIN = ${RED.skinHueMin.toFixed(6)};
const float RED_SKIN_C_MAX = ${RED.skinCMax.toFixed(4)};
const float RED_SKIN_SRC_C_LO = ${RED.skinSrcCLo.toFixed(4)};
const float RED_SKIN_SRC_C_HI = ${RED.skinSrcCHi.toFixed(4)};
const float RED_GREEN_PROP = ${RED.greenProp.toFixed(4)};
const float RED_GREEN_OBJ = ${RED.greenObj.toFixed(4)};
const float RED_MAT_COS = ${Math.cos(RED.matHue).toFixed(6)};
const float RED_MAT_SIN = ${Math.sin(RED.matHue).toFixed(6)};
const float RED_MAT_COS_IN = ${Math.cos(RED.matIn).toFixed(6)};
const float RED_MAT_COS_OUT = ${Math.cos(RED.matOut).toFixed(6)};
const float RED_MAT_C = ${RED.matC.toFixed(4)};
const float RED_MAT_KNEE = ${RED.matKnee.toFixed(4)};
const float RED_MURK_HOLD = ${RED.murkHold.toFixed(4)};
const float RED_MURK_DARK = ${RED.murkDark.toFixed(4)};
const float RED_MURK_LO = ${RED.murkLo.toFixed(4)};
const float RED_MURK_HI = ${RED.murkHi.toFixed(4)};
const float RED_GN_COS = ${Math.cos(RED.gnHue).toFixed(6)};
const float RED_GN_SIN = ${Math.sin(RED.gnHue).toFixed(6)};
const float RED_GN_COS_IN = ${Math.cos(RED.gnIn).toFixed(6)};
const float RED_GN_COS_OUT = ${Math.cos(RED.gnOut).toFixed(6)};
const float RED_GN_OBJ_KEEP = ${RED.gnObjKeep.toFixed(4)};
const float RED_GN_MIX = ${RED.gnMix.toFixed(4)};
const float RED_GN_TA = ${(RED.gnTargetC * Math.cos(RED.gnTargetHue)).toFixed(6)};
const float RED_GN_TB = ${(RED.gnTargetC * Math.sin(RED.gnTargetHue)).toFixed(6)};
`;
const RED_CONSTS_WGSL = RED_CONSTS_GLSL.replace(/const float (\w+) = ([^;]+);/g, "const $1: f32 = $2;");

export const RED_GLSL = `${RED_CONSTS_GLSL}
vec3 guideSmooth(vec2 uv, vec3 c) {
  ivec2 size = textureSize(u_data0, 0);
  vec2 f = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size) - 1.0);
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, size - 1);
  vec2 t = f - vec2(i0);
  float cn = length(c) + 0.02;
  vec3 sum = vec3(0.0);
  float sw = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 ij = ivec2(k == 1 || k == 3 ? i1.x : i0.x, k >= 2 ? i1.y : i0.y);
    float ws = (k == 1 || k == 3 ? t.x : 1.0 - t.x) * (k >= 2 ? t.y : 1.0 - t.y);
    vec3 g = texelFetch(u_data2, ij, 0).xyz;
    float diff = length(c - g) / (cn + length(g));
    float wgt = ws * exp(-(diff * diff) / (2.0 * 0.12 * 0.12));
    sum += wgt * g;
    sw += wgt;
  }
  if (sw < 1e-6) return c;
  return mix(c, sum / sw, min(1.0, sw / 0.08));
}
vec3 chromaRebuild(vec3 lin, vec3 s, vec3 gain, vec3 bs, out float snrR) {
  vec3 snr = 255.0 * max(linearToSrgb(max(s, vec3(0.0))) - linearToSrgb(max(min(s, bs), vec3(0.0))), vec3(0.0)) / RED_SIGMA;
  snrR = snr.r;
  vec3 g = gain / max(1e-4, gain.g);
  vec3 w = vec3(
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.r) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.r)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.g) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.g)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.b) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.b)));
  vec3 u = vec3(0.2126, 0.7152, 0.0722) * (1.0 - 0.95 * w);
  float den = dot(u, s);
  float delta = den > 1e-6 ? dot(u, lin) / den : 1.0;
  vec3 tol = RED_TOL_FRAC * lin + RED_TOL_LIN;
  vec3 rb = clamp(s * delta, lin - tol, lin + tol);
  return lin + (rb - lin) * w;
}
vec2 greenNeutral(float L, vec2 ab, float g) {
  if (g <= 0.0) return ab;
  float C = length(ab);
  if (C < 1e-5) return ab;
  float t = RED_GN_MIX * g * smoothstepf(RED_GN_COS_OUT, RED_GN_COS_IN, dot(ab, vec2(RED_GN_COS, RED_GN_SIN)) / C);
  return mix(ab, vec2(RED_GN_TA, RED_GN_TB) * clamp(L / 0.6, 0.0, 1.3), t);
}
float waterRedGain(float water, float full, float snrR) {
  float t = RED_WATER_RED * smoothstepf(RED_WATER_SNR_LO, RED_WATER_SNR_HI, snrR);
  return water * pow(max(1.0, full / max(1e-4, water)), t);
}
vec2 warmMaterial(float L, vec2 ab, float g, float srcFar) {
  if (g <= 0.0) return ab;
  float C = length(ab);
  float knee = RED_MAT_KNEE * RED_MAT_C;
  if (C <= knee) return ab;
  float band = smoothstepf(RED_MAT_COS_OUT, RED_MAT_COS_IN, dot(ab, vec2(RED_MAT_COS, RED_MAT_SIN)) / C);
  float w = g * (1.0 - srcFar) * band * smoothstepf(0.2, 0.3, L) * (1.0 - smoothstepf(0.85, 0.95, L));
  if (w <= 0.0) return ab;
  float room = RED_MAT_C - knee;
  float rolled = knee + room * (1.0 - exp(-(C - knee) / room));
  return ab * ((C + (rolled - C) * w) / C);
}
float murkHold(float y, float ySrc, float g) {
  float cap = ySrc * (RED_MURK_DARK + (1.0 - RED_MURK_DARK) * smoothstepf(RED_MURK_LO, RED_MURK_HI, ySrc));
  if (g <= 0.0 || y <= cap) return y;
  return y + (cap - y) * g * RED_MURK_HOLD;
}
float redGainStrength(float snrR) { return RED_SNR_MIN + (1.0 - RED_SNR_MIN) * smoothstepf(RED_SNR_LO, RED_SNR_HI, snrR); }
vec2 redGuard(float L, vec2 ab, vec2 ab0, float person, float srcFar) {
  float C = length(ab);
  if (C < 1e-5) return ab;
  vec2 hv = vec2(RED_HUE_COS, RED_HUE_SIN);
  float band = smoothstepf(RED_COS_OUT, RED_COS_IN, dot(ab, hv) / C);
  float pink = smoothstepf(RED_PINK_COS_OUT, RED_PINK_COS_IN, dot(ab, vec2(RED_PINK_COS, RED_PINK_SIN)) / C);
  float cSrc = length(ab0);
  float ws = smoothstepf(0.1, 0.5, person) * (1.0 - smoothstepf(RED_SKIN_SRC_C_LO, RED_SKIN_SRC_C_HI, cSrc)) * (1.0 - srcFar) * smoothstepf(0.3, 0.45, L);
  float h = atan(ab.y, ab.x);
  if (ws > 0.0) {
    float hr = (h < RED_SKIN_HUE_MIN && h > -1.5707963) ? RED_SKIN_HUE_MIN : h;
    h += (hr - h) * ws;
  }
  float cap = RED_C_MAX + (RED_WHITE_C - RED_C_MAX) * smoothstepf(RED_WHITE_LO, RED_WHITE_HI, L) * pink * (1.0 - ws);
  cap += (min(cap, RED_SKIN_C_MAX) - cap) * ws;
  float cosr0 = cSrc > 1e-5 ? dot(ab0, hv) / cSrc : 0.0;
  float held = cSrc * smoothstepf(RED_COS_OUT, RED_COS_IN, cosr0);
  cap = max(cap, held);
  float w = max(max(band, pink), ws);
  float knee = max(RED_KNEE * cap, held);
  float C2 = C;
  if (C2 > knee && w > 0.0) {
    float room = cap - knee;
    float rolled = knee + room * (1.0 - exp(-(C2 - knee) / max(1e-6, room)));
    C2 += (rolled - C2) * w;
  }
  if (C2 == C && ws <= 0.0) return ab;
  return C2 * vec2(cos(h), sin(h));
}`;

export const RED_WGSL = `${RED_CONSTS_WGSL}
fn guideSmooth(uv: vec2<f32>, c: vec3<f32>) -> vec3<f32> {
  let size = vec2<i32>(textureDimensions(u_data0, 0));
  let f = clamp(uv * vec2<f32>(size) - 0.5, vec2(0.0), vec2<f32>(size) - 1.0);
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, size - 1);
  let t = f - vec2<f32>(i0);
  let cn = length(c) + 0.02;
  var sum = vec3(0.0);
  var sw = 0.0;
  for (var k = 0; k < 4; k++) {
    let right = (k == 1 || k == 3);
    let bottom = (k >= 2);
    let ij = vec2<i32>(select(i0.x, i1.x, right), select(i0.y, i1.y, bottom));
    let ws = select(1.0 - t.x, t.x, right) * select(1.0 - t.y, t.y, bottom);
    let g = textureLoad(u_data2, ij, 0).xyz;
    let diff = length(c - g) / (cn + length(g));
    let wgt = ws * exp(-(diff * diff) / (2.0 * 0.12 * 0.12));
    sum += wgt * g;
    sw += wgt;
  }
  if (sw < 1e-6) { return c; }
  return mix(c, sum / sw, min(1.0, sw / 0.08));
}
// Rebuilt colour in .xyz, red SNR in .w.
fn chromaRebuild(lin: vec3<f32>, s: vec3<f32>, gain: vec3<f32>, bs: vec3<f32>) -> vec4<f32> {
  let snr = 255.0 * max(linearToSrgb(max(s, vec3(0.0))) - linearToSrgb(max(min(s, bs), vec3(0.0))), vec3(0.0)) / RED_SIGMA;
  let g = gain / max(1e-4, gain.g);
  let w = vec3(
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.r) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.r)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.g) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.g)),
    smoothstepf(RED_GAIN_LO, RED_GAIN_HI, g.b) * (1.0 - smoothstepf(RED_KEEP_LO, RED_KEEP_HI, snr.b)));
  let u = vec3(0.2126, 0.7152, 0.0722) * (1.0 - 0.95 * w);
  let den = dot(u, s);
  let delta = select(1.0, dot(u, lin) / den, den > 1e-6);
  let tol = RED_TOL_FRAC * lin + RED_TOL_LIN;
  let rb = clamp(s * delta, lin - tol, lin + tol);
  return vec4<f32>(lin + (rb - lin) * w, snr.r);
}
fn greenNeutral(L: f32, ab: vec2<f32>, g: f32) -> vec2<f32> {
  if (g <= 0.0) { return ab; }
  let C = length(ab);
  if (C < 1e-5) { return ab; }
  let t = RED_GN_MIX * g * smoothstepf(RED_GN_COS_OUT, RED_GN_COS_IN, dot(ab, vec2(RED_GN_COS, RED_GN_SIN)) / C);
  return mix(ab, vec2(RED_GN_TA, RED_GN_TB) * clamp(L / 0.6, 0.0, 1.3), t);
}
fn waterRedGain(water: f32, full: f32, snrR: f32) -> f32 {
  let t = RED_WATER_RED * smoothstepf(RED_WATER_SNR_LO, RED_WATER_SNR_HI, snrR);
  return water * pow(max(1.0, full / max(1e-4, water)), t);
}
fn warmMaterial(L: f32, ab: vec2<f32>, g: f32, srcFar: f32) -> vec2<f32> {
  if (g <= 0.0) { return ab; }
  let C = length(ab);
  let knee = RED_MAT_KNEE * RED_MAT_C;
  if (C <= knee) { return ab; }
  let band = smoothstepf(RED_MAT_COS_OUT, RED_MAT_COS_IN, dot(ab, vec2(RED_MAT_COS, RED_MAT_SIN)) / C);
  let w = g * (1.0 - srcFar) * band * smoothstepf(0.2, 0.3, L) * (1.0 - smoothstepf(0.85, 0.95, L));
  if (w <= 0.0) { return ab; }
  let room = RED_MAT_C - knee;
  let rolled = knee + room * (1.0 - exp(-(C - knee) / room));
  return ab * ((C + (rolled - C) * w) / C);
}
fn murkHold(y: f32, ySrc: f32, g: f32) -> f32 {
  let cap = ySrc * (RED_MURK_DARK + (1.0 - RED_MURK_DARK) * smoothstepf(RED_MURK_LO, RED_MURK_HI, ySrc));
  if (g <= 0.0 || y <= cap) { return y; }
  return y + (cap - y) * g * RED_MURK_HOLD;
}
fn redGainStrength(snrR: f32) -> f32 { return RED_SNR_MIN + (1.0 - RED_SNR_MIN) * smoothstepf(RED_SNR_LO, RED_SNR_HI, snrR); }
fn redGuard(L: f32, ab: vec2<f32>, ab0: vec2<f32>, person: f32, srcFar: f32) -> vec2<f32> {
  let C = length(ab);
  if (C < 1e-5) { return ab; }
  let hv = vec2(RED_HUE_COS, RED_HUE_SIN);
  let band = smoothstepf(RED_COS_OUT, RED_COS_IN, dot(ab, hv) / C);
  let pink = smoothstepf(RED_PINK_COS_OUT, RED_PINK_COS_IN, dot(ab, vec2(RED_PINK_COS, RED_PINK_SIN)) / C);
  let cSrc = length(ab0);
  let ws = smoothstepf(0.1, 0.5, person) * (1.0 - smoothstepf(RED_SKIN_SRC_C_LO, RED_SKIN_SRC_C_HI, cSrc)) * (1.0 - srcFar) * smoothstepf(0.3, 0.45, L);
  var h = atan2(ab.y, ab.x);
  if (ws > 0.0) {
    let hr = select(h, RED_SKIN_HUE_MIN, h < RED_SKIN_HUE_MIN && h > -1.5707963);
    h += (hr - h) * ws;
  }
  var cap = RED_C_MAX + (RED_WHITE_C - RED_C_MAX) * smoothstepf(RED_WHITE_LO, RED_WHITE_HI, L) * pink * (1.0 - ws);
  cap += (min(cap, RED_SKIN_C_MAX) - cap) * ws;
  let cosr0 = select(0.0, dot(ab0, hv) / cSrc, cSrc > 1e-5);
  let held = cSrc * smoothstepf(RED_COS_OUT, RED_COS_IN, cosr0);
  cap = max(cap, held);
  let w = max(max(band, pink), ws);
  let knee = max(RED_KNEE * cap, held);
  var C2 = C;
  if (C2 > knee && w > 0.0) {
    let room = cap - knee;
    let rolled = knee + room * (1.0 - exp(-(C2 - knee) / max(1e-6, room)));
    C2 += (rolled - C2) * w;
  }
  if (C2 == C && ws <= 0.0) { return ab; }
  return C2 * vec2(cos(h), sin(h));
}`;
