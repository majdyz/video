// The fitted Look: one small, global colour transform applied to the graded colour after everything else
// (apply.ts gradePixel / grade-shader.ts, just before the gamut fit). It is a function of the pixel's graded Oklab
// colour alone: no masks, no maps, no frame statistics, the same for every pixel of every frame, so it cannot
// flicker or split a region. A style is a parameter set (FIT_LOOK.vivid, FIT_LOOK.blue), not a code path.
//
// Twelve parameters per style, fitted to the owner's reference pairs by eval/fit-look2.ts (leave-one-out and the
// valset guards are reported there; the numbers of the last fit are in the comment on FIT_LOOK):
//
//   tone       sh, mid, hi        Oklab L shifts at the shadows (L 0.25), mid-tones (0.5) and highlights (0.75);
//                                 black and white stay where they are (the bases vanish at 0 and 1)
//   water hue  rot                rotation of the water hues (radians; positive = cyan toward blue / indigo)
//   chroma     sat, coolSat,      chroma gain: everywhere, extra on the water hues, extra on the warm hues,
//              warmSat, satL      and its slope with lightness (positive = richer lights, quieter shadows)
//   tint       shA, shB, hiA, hiB split toning: an Oklab (a, b) offset in the shadows and in the lights; clearly
//                                 warm colours (skin, sand with colour, orange fish) take none of it
//
// The hue bands are fixed (FIT_LOOK_BANDS), not fitted. The amount (0..1) is Vivid's setting through the do-no-harm
// gates (fitLookAmountOf): the look stands down on graded, topside, night and lamp-lit footage with the rest of
// the style, and Natural has none.

import { VIVID_GATE, WATER_HUE, type GradeParams, type UserSettings } from "./params.ts";

export type FitLookSet = {
  sh: number; mid: number; hi: number;
  rot: number;
  sat: number; coolSat: number; warmSat: number; satL: number;
  shA: number; shB: number; hiA: number; hiB: number;
};
export const FIT_LOOK_KEYS = ["sh", "mid", "hi", "rot", "sat", "coolSat", "warmSat", "satL", "shA", "shB", "hiA", "hiB"] as const satisfies readonly (keyof FitLookSet)[];
export const FIT_LOOK_IDENTITY: FitLookSet = { sh: 0, mid: 0, hi: 0, rot: 0, sat: 0, coolSat: 0, warmSat: 0, satL: 0, shA: 0, shB: 0, hiA: 0, hiB: 0 };

/**
 * Limits of a parameter set (the fit searches inside them; test/look-fit.test.ts holds the shipped sets to them).
 * With the tone shifts inside ±`tone` the curve can still fold, so the fit and the test also require its slope to
 * stay within `slopeMin..slopeMax` (a slope over 1 amplifies the lightness steps the restore stage makes).
 */
export const FIT_LOOK_LIMITS = { tone: 0.1, rot: (25 * Math.PI) / 180, sat: 0.5, tint: 0.03, slopeMin: 0.5, slopeMax: 1.35 };

/** Oklab hue bands (radians): water = within `coolIn` of `cool`, fading out to `coolOut`; warm likewise. `protLo..protHi`: the chroma over which a warm colour is spared the tint. */
export const FIT_LOOK_BANDS = {
  cool: (240 * Math.PI) / 180, coolIn: (50 * Math.PI) / 180, coolOut: (95 * Math.PI) / 180,
  warm: (65 * Math.PI) / 180, warmIn: (45 * Math.PI) / 180, warmOut: (80 * Math.PI) / 180,
  protLo: 0.015, protHi: 0.05,
};

/**
 * The parameter sets. They come from eval/fit-look2.ts: do not hand-tune; refit and paste.
 *
 * Fit of 13 Nov 2026 (8 reference pairs, 47-clip valset; reference distance = score.ts's CIELAB sliced Wasserstein,
 * mean over the pairs; the runs and contact sheets are in ~/video-data/review-fable/colour3/):
 *
 *   without the Look                                   8.66
 *   one shared set, valset guards on    in-sample      8.62    leave-one-out 8.81 (1 pair closer, 4 further)
 *   one shared set, no guards           in-sample      8.09    leave-one-out 9.67 on 7 pairs (8.93 without; 2 closer,
 *                                                              5 further), and it breaks 18 valset clips (blue-tinted
 *                                                              sand and whites, crushed shadows, harm on graded clips)
 *   one set per picture (no guards)                    4.16    (what these twelve parameters can express)
 *
 * No shared set passes: the per-picture optima disagree in sign on every tone and hue parameter (mid −0.10 … +0.09,
 * rot −12° … +25°, sat −0.39 … +0.50), so their mean is close to the identity and what is left of it does not carry
 * over to a held-out pair. Both sets therefore stay the identity (fitLookAmountOf sends 0 and the shaders skip the
 * stage). The stage, the fit, the guards and the CPU / GLSL / WGSL parity check are in place for per-shot sets (a
 * look fitted to a reference still the owner picks) and for a refit once there are enough pairs to learn from.
 */
export const FIT_LOOK: { vivid: FitLookSet; blue: FitLookSet } = {
  vivid: { ...FIT_LOOK_IDENTITY },
  blue: { ...FIT_LOOK_IDENTITY },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
/** Peak-normalised bases on lightness: shadows (peak at 0.25), mids (0.5), lights (0.75); all vanish at 0 and 1. */
const BASIS_K = 256 / 27;
export function fitLookBases(L: number): [number, number, number] {
  const x = clamp01(L), y = 1 - x;
  return [BASIS_K * x * y * y * y, 16 * x * x * y * y, BASIS_K * x * x * x * y];
}
/** The tone curve of a set at amount 1 (the L part of fitLook). */
export function fitLookTone(L: number, P: FitLookSet): number {
  const [S, M, H] = fitLookBases(L);
  return L + P.sh * S + P.mid * M + P.hi * H;
}
/** Smallest and largest slope of a set's tone curve over 0..1. */
export function fitLookSlope(P: FitLookSet): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const d = (fitLookTone((i + 1) / N, P) - fitLookTone(i / N, P)) * N;
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  return [lo, hi];
}

const mixSet = (a: FitLookSet, b: FitLookSet, m: number): FitLookSet => {
  if (m <= 0) return a;
  const o = { ...a };
  for (const k of FIT_LOOK_KEYS) o[k] = a[k] + (b[k] - a[k]) * m;
  return o;
};

/**
 * The fitted Look on a graded Oklab colour (mirrored in GLSL / WGSL below). `t` = amount (fitLookAmountOf),
 * `m` = style mix (0 = Vivid's set, 1 = Blue water's). Returns (L, a, b).
 */
export function fitLook(L: number, a: number, b: number, t: number, m = 0, sets: { vivid: FitLookSet; blue: FitLookSet } = FIT_LOOK): [number, number, number] {
  if (t <= 0) return [L, a, b];
  const P = mixSet(sets.vivid, sets.blue, clamp01(m)), B = FIT_LOOK_BANDS;
  const x = clamp01(L);
  const [S, M, H] = fitLookBases(x);
  const L1 = L + t * (P.sh * S + P.mid * M + P.hi * H);
  const C = Math.hypot(a, b);
  let cool = 0, warm = 0;
  if (C > 1e-6) {
    const h = Math.atan2(b, a);
    const dist = (h0: number) => { const d = h - h0; return Math.abs(d - 2 * Math.PI * Math.round(d / (2 * Math.PI))); };
    cool = 1 - smoothstep(B.coolIn, B.coolOut, dist(B.cool));
    warm = 1 - smoothstep(B.warmIn, B.warmOut, dist(B.warm));
  }
  const ang = t * P.rot * cool, cs = Math.cos(ang), sn = Math.sin(ang);
  const k = Math.max(0, 1 + t * (P.sat + P.coolSat * cool + P.warmSat * warm + P.satL * (2 * x - 1)));
  const tw = t * (1 - warm * smoothstep(B.protLo, B.protHi, C));
  return [L1, (a * cs - b * sn) * k + tw * (P.shA * S + P.hiA * H), (a * sn + b * cs) * k + tw * (P.shB * S + P.hiB * H)];
}

/** Whether a parameter set changes nothing. */
export const fitLookIsIdentity = (P: FitLookSet) => FIT_LOOK_KEYS.every((k) => P[k] === 0);
/**
 * The amount the shader reads (uniform p36.x): the gate (fitLookGateOf), or 0 while the style's parameter set is
 * the identity (the shaders return at once on 0, so a style without a fitted set costs nothing per pixel).
 */
export function fitLookAmountOf(p: GradeParams, s: UserSettings, sets: { vivid: FitLookSet; blue: FitLookSet } = FIT_LOOK): number {
  const m = fitLookMixOf(s);
  return (m < 1 && !fitLookIsIdentity(sets.vivid)) || (m > 0 && !fitLookIsIdentity(sets.blue)) ? fitLookGateOf(p, s) : 0;
}
/**
 * The Look's gate: the Vivid setting through the do-no-harm gates. The look is a global move like the water-hue
 * map, so it stands down as early (WATER_HUE.calmLo..calmHi of the calm scores: graded and topside footage) and
 * with Vivid's own gate (night, lamp-lit); under the Blue water style, with that style's gate.
 */
export function fitLookGateOf(p: GradeParams, s: UserSettings): number {
  const calm = clamp01(Math.max(p.calm ?? 0, p.calmTone ?? 0));
  const m = fitLookMixOf(s);
  const gv = clamp01(p.vividGate ?? 1), gate = gv + (clamp01(p.blueGate ?? p.vividGate ?? 1) - gv) * m;
  return clamp01(s.vivid ?? 0) * (1 - smoothstep(VIVID_GATE.calmLo, VIVID_GATE.calmHi, calm)) * (1 - smoothstep(WATER_HUE.calmLo, WATER_HUE.calmHi, calm)) * gate;
}
/** The style mix the shader reads (uniform p36.y): 0 = Vivid's parameter set, 1 = Blue water's. */
export function fitLookMixOf(s: UserSettings): number {
  return clamp01(s.blue ?? 0);
}

// ---------- skin guard ----------

/**
 * Skin guard: the last word on a person's skin, after every look (apply.ts gradePixel / grade-shader.ts, just before
 * the fitted Look). Two complaints of 13 Nov 2026, measured by eval/skin-check.ts:
 *
 *  - "the skin becomes red when using our app" (freediver-line-skinred.mov): under the person mask the skin memory
 *    colour pulled pale skin to a pink hue (SKIN.hue was 18°) with a chroma floor, and the looks after it (richer
 *    warm colours, Blue water's warm subjects) saturated that into red blotches on hands and face;
 *  - "face / hands / neck read cold blue-grey" (Blue water style): pale skin that the grade leaves near-neutral or
 *    faintly blue got nothing, because the memory colour only takes cream and exactly neutral pixels.
 *
 * The guard works in the frame of the skin hue (`hue`, Oklab; the owner's own grade of skin measures 55° on h2,
 * the natural range is about 30–60° in CIELAB LCh): s = the colour's component along it, o = across it.
 *
 *  1. Never red, never orange (weight `cap` = the person mask): on warm colours (within `warmIn..warmOut` of the
 *     hue) the across component is cut to `hueKeep` of itself (the hue comes most of the way to natural) and the
 *     chroma rolls off from `knee` toward `cap` (natural skin under water: the references hold 0.03–0.08).
 *     Where the source is clearly blue or green (`cool`: skinGuardCool of the pixel or of the source around it,
 *     the analysis guide, or a frame of open water, objectNeutralOf: skin lit by deep water, no red left in it)
 *     both shrink by `coolCut`: the warmth the grade can honestly give such skin is a pale neutral, and the
 *     memory colour's floor on single pale pixels of a blue hand read as orange patches (the owner's clip, 25 s).
 *  2. Not cold (weight `rest` = the mask where the source has red left to be skin, as the memory colour): pale
 *     low-chroma colours (under `coolLo..coolHi`, lightness `lLo..lHi` up to `hiLo..hiHi`) get a faint natural
 *     warmth: s is floored at `rest` and the across component (the blue or green cast) removed, by `restMix`.
 *
 * Both are spared where the source colour itself is vivid and off the water's hue (apply.ts vividW: an orange
 * glove, a red suit). What it cannot do: tell strongly blue skin at depth from blue gear (a swimsuit, fins) by
 * colour; those stay as graded. That needs a skin-class segmenter, not the person mask.
 */
export const SKIN_GUARD = {
  hue: (45 * Math.PI) / 180,
  warmIn: (60 * Math.PI) / 180, warmOut: (100 * Math.PI) / 180,
  hueKeep: 0.4,
  knee: 0.05, cap: 0.08,
  rest: 0.03, restMix: 0.5,
  coolCut: 0.85, srcLo: 0.035, srcHi: 0.065,
  coolLo: 0.03, coolHi: 0.055,
  lLo: 0.3, lHi: 0.45, hiLo: 0.86, hiHi: 0.95,
};
/** How blue-lit the source pixel is for the skin guard (its `cool`): chromatic (`srcLo..srcHi`) and not on the warm side of the skin hue. (a0, b0) = the source's Oklab chroma. */
export function skinGuardCool(a0: number, b0: number): number {
  const G = SKIN_GUARD, C = Math.hypot(a0, b0);
  if (C < 1e-6) return 0;
  return smoothstep(G.srcLo, G.srcHi, C) * (1 - smoothstep(Math.cos(G.warmOut), Math.cos(G.warmIn), (a0 * Math.cos(G.hue) + b0 * Math.sin(G.hue)) / C));
}
/** The skin guard on a graded Oklab colour (mirrored in GLSL / WGSL below). Returns (a, b); lightness is never touched. */
export function skinGuard(L: number, a: number, b: number, cap: number, rest: number, cool = 0): [number, number] {
  if (cap <= 0 && rest <= 0) return [a, b];
  const G = SKIN_GUARD, ch = Math.cos(G.hue), sh = Math.sin(G.hue);
  const C = Math.hypot(a, b);
  let s = a * ch + b * sh, o = b * ch - a * sh;
  const warm = C > 1e-6 ? smoothstep(Math.cos(G.warmOut), Math.cos(G.warmIn), s / C) : 0;
  const kw = clamp01(cap) * warm;
  o *= 1 - (1 - G.hueKeep) * kw;
  const C1 = Math.hypot(s, o);
  const lim = 1 - G.coolCut * clamp01(cool), knee = G.knee * lim, room = (G.cap - G.knee) * lim;
  if (C1 > knee) {
    const q = 1 + ((knee + room * (1 - Math.exp(-(C1 - knee) / room))) / C1 - 1) * kw;
    s *= q; o *= q;
  }
  const kr = clamp01(rest) * G.restMix * smoothstep(G.lLo, G.lHi, L) * (1 - smoothstep(G.hiLo, G.hiHi, L)) * (1 - smoothstep(G.coolLo, G.coolHi, C));
  s += (Math.max(s, G.rest) - s) * kr;
  o *= 1 - kr;
  return [s * ch - o * sh, s * sh + o * ch];
}

// ---------- shaders ----------

const f = (x: number) => { const s = x.toFixed(7).replace(/0+$/, ""); return s.endsWith(".") ? s + "0" : s; };
type Sets = { vivid: FitLookSet; blue: FitLookSet };
/** One parameter of the active style: mix(Vivid's, Blue water's, m). */
const parOf = (sets: Sets) => (k: keyof FitLookSet) => `mix(${f(sets.vivid[k])}, ${f(sets.blue[k])}, m)`;
const B = FIT_LOOK_BANDS, SG = SKIN_GUARD;

/** GLSL twin of fitLook (needs smoothstepf). `sets`: other parameter sets than the shipped ones (the parity check in scripts/check-shaders.ts). */
export function fitLookGlsl(sets: Sets = FIT_LOOK): string {
  const par = parOf(sets);
  return `// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
float fitLookDist(float h, float h0) { float d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
vec3 fitLook(vec3 lab, float t, float m) {
  if (t <= 0.0) return lab;
  float x = clamp(lab.x, 0.0, 1.0), y = 1.0 - x;
  float S = ${f(BASIS_K)} * x * y * y * y, M = 16.0 * x * x * y * y, H = ${f(BASIS_K)} * x * x * x * y;
  float L1 = lab.x + t * (${par("sh")} * S + ${par("mid")} * M + ${par("hi")} * H);
  float C = length(lab.yz);
  float cool = 0.0, warm = 0.0;
  if (C > 1e-6) {
    float h = atan(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${f(B.coolIn)}, ${f(B.coolOut)}, fitLookDist(h, ${f(B.cool)}));
    warm = 1.0 - smoothstepf(${f(B.warmIn)}, ${f(B.warmOut)}, fitLookDist(h, ${f(B.warm)}));
  }
  float ang = t * ${par("rot")} * cool, cs = cos(ang), sn = sin(ang);
  float k = max(0.0, 1.0 + t * (${par("sat")} + ${par("coolSat")} * cool + ${par("warmSat")} * warm + ${par("satL")} * (2.0 * x - 1.0)));
  float tw = t * (1.0 - warm * smoothstepf(${f(B.protLo)}, ${f(B.protHi)}, C));
  return vec3(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${par("shA")} * S + ${par("hiA")} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${par("shB")} * S + ${par("hiB")} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
float skinGuardCool(vec2 ab0) {
  float C = length(ab0);
  if (C < 1e-6) return 0.0;
  return smoothstepf(${f(SG.srcLo)}, ${f(SG.srcHi)}, C) * (1.0 - smoothstepf(${f(Math.cos(SG.warmOut))}, ${f(Math.cos(SG.warmIn))}, dot(ab0, vec2(${f(Math.cos(SG.hue))}, ${f(Math.sin(SG.hue))})) / C));
}
vec2 skinGuard(vec3 lab, float cap, float rest, float cool) {
  if (cap <= 0.0 && rest <= 0.0) return lab.yz;
  vec2 d = vec2(${f(Math.cos(SG.hue))}, ${f(Math.sin(SG.hue))});
  float C = length(lab.yz);
  float s = dot(lab.yz, d), o = lab.z * d.x - lab.y * d.y;
  float warm = C > 1e-6 ? smoothstepf(${f(Math.cos(SG.warmOut))}, ${f(Math.cos(SG.warmIn))}, s / C) : 0.0;
  float kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${f(1 - SG.hueKeep)} * kw;
  float C1 = length(vec2(s, o));
  float lim = 1.0 - ${f(SG.coolCut)} * clamp(cool, 0.0, 1.0), knee = ${f(SG.knee)} * lim, room = ${f(SG.cap - SG.knee)} * lim;
  if (C1 > knee) {
    float q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  float kr = clamp(rest, 0.0, 1.0) * ${f(SG.restMix)} * smoothstepf(${f(SG.lLo)}, ${f(SG.lHi)}, lab.x) * (1.0 - smoothstepf(${f(SG.hiLo)}, ${f(SG.hiHi)}, lab.x)) * (1.0 - smoothstepf(${f(SG.coolLo)}, ${f(SG.coolHi)}, C));
  s += (max(s, ${f(SG.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2(s * d.x - o * d.y, s * d.y + o * d.x);
}`;
}

/** WGSL twin of fitLook (needs smoothstepf). */
export function fitLookWgsl(sets: Sets = FIT_LOOK): string {
  const par = parOf(sets);
  return `// Fitted Look (look-fit.ts fitLook): a global transform of the graded Oklab colour. t = amount, m = style mix.
fn fitLookDist(h: f32, h0: f32) -> f32 { let d = h - h0; return abs(d - 6.2831853 * round(d / 6.2831853)); }
fn fitLook(lab: vec3<f32>, t: f32, m: f32) -> vec3<f32> {
  if (t <= 0.0) { return lab; }
  let x = clamp(lab.x, 0.0, 1.0);
  let y = 1.0 - x;
  let S = ${f(BASIS_K)} * x * y * y * y;
  let M = 16.0 * x * x * y * y;
  let H = ${f(BASIS_K)} * x * x * x * y;
  let L1 = lab.x + t * (${par("sh")} * S + ${par("mid")} * M + ${par("hi")} * H);
  let C = length(lab.yz);
  var cool = 0.0;
  var warm = 0.0;
  if (C > 1e-6) {
    let h = atan2(lab.z, lab.y);
    cool = 1.0 - smoothstepf(${f(B.coolIn)}, ${f(B.coolOut)}, fitLookDist(h, ${f(B.cool)}));
    warm = 1.0 - smoothstepf(${f(B.warmIn)}, ${f(B.warmOut)}, fitLookDist(h, ${f(B.warm)}));
  }
  let ang = t * ${par("rot")} * cool;
  let cs = cos(ang);
  let sn = sin(ang);
  let k = max(0.0, 1.0 + t * (${par("sat")} + ${par("coolSat")} * cool + ${par("warmSat")} * warm + ${par("satL")} * (2.0 * x - 1.0)));
  let tw = t * (1.0 - warm * smoothstepf(${f(B.protLo)}, ${f(B.protHi)}, C));
  return vec3<f32>(L1,
    (lab.y * cs - lab.z * sn) * k + tw * (${par("shA")} * S + ${par("hiA")} * H),
    (lab.y * sn + lab.z * cs) * k + tw * (${par("shB")} * S + ${par("hiB")} * H));
}
// Skin guard (look-fit.ts skinGuard). cap, rest = its two weights. Returns (a, b).
fn skinGuardCool(ab0: vec2<f32>) -> f32 {
  let C = length(ab0);
  if (C < 1e-6) { return 0.0; }
  return smoothstepf(${f(SG.srcLo)}, ${f(SG.srcHi)}, C) * (1.0 - smoothstepf(${f(Math.cos(SG.warmOut))}, ${f(Math.cos(SG.warmIn))}, dot(ab0, vec2<f32>(${f(Math.cos(SG.hue))}, ${f(Math.sin(SG.hue))})) / C));
}
fn skinGuard(lab: vec3<f32>, cap: f32, rest: f32, cool: f32) -> vec2<f32> {
  if (cap <= 0.0 && rest <= 0.0) { return lab.yz; }
  let d = vec2<f32>(${f(Math.cos(SG.hue))}, ${f(Math.sin(SG.hue))});
  let C = length(lab.yz);
  var s = dot(lab.yz, d);
  var o = lab.z * d.x - lab.y * d.y;
  var warm = 0.0;
  if (C > 1e-6) { warm = smoothstepf(${f(Math.cos(SG.warmOut))}, ${f(Math.cos(SG.warmIn))}, s / C); }
  let kw = clamp(cap, 0.0, 1.0) * warm;
  o *= 1.0 - ${f(1 - SG.hueKeep)} * kw;
  let C1 = length(vec2<f32>(s, o));
  let lim = 1.0 - ${f(SG.coolCut)} * clamp(cool, 0.0, 1.0);
  let knee = ${f(SG.knee)} * lim;
  let room = ${f(SG.cap - SG.knee)} * lim;
  if (C1 > knee) {
    let q = 1.0 + ((knee + room * (1.0 - exp(-(C1 - knee) / room))) / C1 - 1.0) * kw;
    s *= q; o *= q;
  }
  let kr = clamp(rest, 0.0, 1.0) * ${f(SG.restMix)} * smoothstepf(${f(SG.lLo)}, ${f(SG.lHi)}, lab.x) * (1.0 - smoothstepf(${f(SG.hiLo)}, ${f(SG.hiHi)}, lab.x)) * (1.0 - smoothstepf(${f(SG.coolLo)}, ${f(SG.coolHi)}, C));
  s += (max(s, ${f(SG.rest)}) - s) * kr;
  o *= 1.0 - kr;
  return vec2<f32>(s * d.x - o * d.y, s * d.y + o * d.x);
}`;
}
