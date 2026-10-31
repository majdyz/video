// Engine parameter model and the packed uniform layout both shaders read.
// The analysis pass produces a GradeParams for the current frame; the
// temporal smoother blends them; packUniforms() serialises them.

import type { AnimalMap } from "./animals.ts";
import { UNIFORM_FLOATS } from "./backend.ts";
import { linearToOklab } from "./color.ts";
import { calmParams, calmSettings, type CalmEvidence } from "./calm.ts";
import { greenSettings, greenWeight } from "./red.ts";

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
  /** Scene preset (prior on the estimate). */
  preset: ScenePreset;
  /**
   * "Vivid" look, 0..1 (opt-in, default 0; see VIVID_LOOK): cyan water turned
   * a deep, muted navy and darkened, shadows kept black, near-white highlights
   * neutral. A per-pixel function of the graded colour only (no masks).
   */
  vivid?: number;
  /** Debug (?hazeauto=0): disables the haze-adaptive default for A/B runs. */
  hazeAuto?: boolean;
  /**
   * "Subject pop" (opt-in, default off): in open blue water, subjects (a
   * shark, a diver, a big fish) are toned silver and lifted against the
   * water (OBJECT_NEUTRAL, backdrop.ts, tracked by the temporal layer).
   */
  subjectPop?: boolean;
  /** Subject pop Strength, 0..1 (0.5 = the tuned default; 0 keeps only the subject's colour clearing). */
  subjectPopStrength?: number;
};

/**
 * Scene preset: a prior on top of the estimated (clip-locked) correction.
 * "auto" trusts the estimate; the others nudge it the way a diver would for
 * that water — green/murky kills more green and dehazes harder, deep blue
 * restores more red, shallow reef is gentle (little cast to begin with).
 */
export type ScenePreset = "auto" | "murky" | "deep" | "reef";
export const SCENE_PRESETS: { id: ScenePreset; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Trust the estimate" },
  { id: "murky", label: "Green water", hint: "Murky, green, low visibility" },
  { id: "deep", label: "Deep blue", hint: "Deep or far, blue cast" },
  { id: "reef", label: "Shallow reef", hint: "Bright, close, little cast" },
];
export const PRESET_ADJUST: Record<ScenePreset, { red: number; blue: number; redMax: number; dehaze: number; clarity: number; exposure: number; hazeLift: number }> = {
  auto: { red: 1, blue: 1, redMax: 5, dehaze: 0, clarity: 0, exposure: 1, hazeLift: 0 },
  // Haze lift scales the frame's own lifted black, so a full lift on a clear frame does little.
  murky: { red: 1.1, blue: 1.2, redMax: 5, dehaze: 0.65, clarity: 0.35, exposure: 1.1, hazeLift: 0.9 },
  deep: { red: 1.5, blue: 0.9, redMax: 5, dehaze: 0.25, clarity: 0.15, exposure: 1.05, hazeLift: 0.5 },
  reef: { red: 1, blue: 1, redMax: 1.6, dehaze: 0, clarity: -0.1, exposure: 0.97, hazeLift: 0 },
};

export const DEFAULT_SETTINGS: UserSettings = { intensity: 1, saturation: 1, clarity: 0.25, veil: 0.7, look: 0, preset: "auto", subjectPop: false, subjectPopStrength: 0.5, vivid: 0 };
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
  /**
   * Haze lift removal, 0..1: share of the frame's lifted black
   * (GradeParams.hazeBlack) subtracted from every pixel's luminance with a
   * soft toe (see hazeLiftRatio). 0 in clear frames.
   */
  hazeLift: number;
  /** Open-water subject tone on (UserSettings.subjectPop). */
  subjectPop?: boolean;
  /** Subject pop Strength, 0..1 (UserSettings.subjectPopStrength). */
  subjectPopStrength?: number;
  /** Vivid look amount after the do-no-harm gate (vividAmountOf; CPU reference). */
  vivid?: number;
};

/**
 * Signal fraction above which a pixel counts as an object whatever its hue:
 * sig = 1 − lumWater/lumPixel, so 0.55 → 2.2× brighter than the water at
 * its range, 0.78 → 4.5×. Skin, sand and pale coral share the water's hue
 * under a cyan cast, yet nothing that bright is water.
 */
export const CONF_BRIGHT = { lo: 0.55, hi: 0.78 };
/**
 * Below this source luminance a detected person no longer forces the object
 * path: a black wetsuit is mostly veil, and subtracting it leaves black with
 * a hard edge at the mask boundary (the water path keeps it smooth).
 */
export const PERSON_LUM = { lo: 0.06, hi: 0.18 };
/**
 * Water-path dehaze fades out on dark pixels: a dark garment is "all veil" to
 * the model and would be crushed to black with a hard edge where the veil
 * fraction saturates.
 */
export const DEHAZE_LUM = { lo: 0.05, hi: 0.2 };

/**
 * Haze lift removal (murky water): a murky frame's darkest pixels sit far
 * above black — the scattered light is added to everything. Subtracting a
 * share t of that lifted black from each channel, (v − t)/(1 − t), restores
 * the contrast the haze took. It is a function of the pixel's own colour and
 * frame-wide constants only (no masks, no water/object split), so it can
 * never draw an edge inside a garment; the soft toe keeps every channel at
 * ≥ `floor` × its value, so dark pixels darken smoothly instead of clipping
 * to black blobs. `soft` is the width of the smooth max between the toe and
 * the line; `chroma` is the share of t that follows the measured haze colour
 * (per-channel floor) rather than neutral grey. Driven by HAZE_AUTO.lift ×
 * hazeWeight, so clear frames are untouched. Pixels whose hue is far from the
 * veil (yellow algae, an orange fish: they have escaped the cast) take a
 * hue-preserving luminance ratio with `farKeep` less of the subtraction.
 */
export const HAZE_LIFT = { floor: 0.25, soft: 0.12, chroma: 0.7, farKeep: 0.6 };

/**
 * Per-channel haze-lift subtraction: `lift` × a blend of the luminance black
 * (neutral) and the measured per-channel floor (the haze colour, capped at
 * 2× the luminance black so one channel is never stripped alone).
 */
export function hazeLiftT(p: GradeParams, lift: number): Vec3 {
  if (lift <= 0 || p.hazeBlack <= 0) return [0, 0, 0];
  const k = HAZE_LIFT.chroma;
  return p.hazeFloor.map((f) => lift * ((1 - k) * p.hazeBlack + k * Math.min(Math.max(f, 0), 2 * p.hazeBlack))) as Vec3;
}

/** Luminance ratio of the haze-lift removal at luminance Y for subtraction t (see HAZE_LIFT; mirrored in the shaders). */
export function hazeLiftRatio(Y: number, t: number): number {
  if (t <= 0) return 1;
  const q = (Y - t) / ((1 - t) * Math.max(Y, 1e-6));
  const d = q - HAZE_LIFT.floor;
  // Smooth max(q, floor), minus its bias at q = 1 so t → 0 is the identity.
  const d1 = 1 - HAZE_LIFT.floor;
  const s2 = HAZE_LIFT.soft * HAZE_LIFT.soft;
  return 0.5 * (q + HAZE_LIFT.floor + Math.sqrt(d * d + s2)) - 0.5 * (Math.sqrt(d1 * d1 + s2) - d1);
}

/**
 * Artifact guard (compression blocks, sensor noise). Every gain stage of the
 * grade (haze-lift toe, levels, CLAHE, dehaze, white balance) amplifies
 * whatever sits in a dark, flat region along with the signal - on a heavily
 * compressed clip that is 8x8/16x16 macroblock steps and grain, which then
 * crawl from frame to frame. The grade therefore runs on an edge-preserving
 * base of the source (a sigma filter: taps whose colour differs from the
 * pixel by more than the noise floor drop out) and the pixel's own residual
 * detail is put back as a luminance ratio at unit gain. Edges and texture
 * above the floor are in the base and get the full grade; detail below the
 * floor is neither amplified nor removed (chroma noise below it goes).
 *  sigma: noise floor as RMS sRGB difference per channel (~2.3 codes; 3.3 lost
 *  some murky-reef texture, 1.7 let macroblock steps through);
 *  k = 1 / (2*3*sigma^2) per squared RGB distance; eps: luminance offset of
 *  the detail ratio (tames it in near-black); rMin/rMax clamp it.
 */
export const DETAIL_GUARD = { sigma: 0.009, k: 1 / (2 * 3 * 0.009 * 0.009), eps: 0.004, rMin: 0.5, rMax: 2 };
/**
 * Guard taps (source texels, half-texel offsets -> each is a 2x2 mean), with
 * spatial weight. Closed under 90-degree rotation/reflection so the result
 * does not depend on the source orientation.
 */
export const DETAIL_TAPS: readonly (readonly [number, number, number])[] = [
  [-2.5, -2.5, 1], [2.5, -2.5, 1], [-2.5, 2.5, 1], [2.5, 2.5, 1],
  [-6.5, -1.5, 0.7], [6.5, 1.5, 0.7], [-1.5, 6.5, 0.7], [1.5, -6.5, 0.7],
  [-6.5, 1.5, 0.7], [6.5, -1.5, 0.7], [1.5, 6.5, 0.7], [-1.5, -6.5, 0.7],
];
/**
 * Object neutral tone. Under water the red channel of a far object is gone,
 * and white balance cannot restore what is not there: after the veil is
 * subtracted a grey shark or a white belly comes out green-cyan (the colour
 * of "grey minus red"), which reads as a colour the subject never had. Object
 * pixels whose corrected hue lies on that red-deficit side (within bandIn of
 * the cyan axis, fading out by bandOut; the band opens to every hue when
 * the source red is fully gone, since a red gain over nothing turns a belly
 * orange just as its absence leaves it cyan) and
 * whose source red is negligible next to green/blue (r/max(g, b) below rLo,
 * fading by rHi) and that are light (Oklab L from lLo to lHi: a dark far
 * reef keeps the water's tint) and whose source hue is within farLo..farHi
 * of the veil's (a yellow fish already escaped the cast) lose up to `mix` of their chroma, so the subject reads as a
 * natural neutral against the water instead of as more water. Water-path
 * pixels are never touched (weighted by object confidence). In the same
 * frames object mid-tones gain up to `lift` Oklab lightness (fading out
 * toward black and white), so the subject steps forward from the water.
 */
/**
 * Subject pop tone ("subject clearing"): the subject is shown as if in clearer water, never painted. Per pixel, on
 * the graded colour: its chroma shrinks by the share k of the part that points along the water's own hue (the
 * cast), at most cMax (Oklab units, so a strongly cast pixel moves by a bounded step and keeps its variation), then
 * by desat toward neutral; the hue never turns (a deep blue does not go purple), texture and the animal's own
 * colours survive.
 * Lightness is left as graded (no lift: shading, counter-shading, highlights stay). The gate is OBJECT_NEUTRAL's
 * (red-starved, lit pixels of the subject). The engine-mask weight softens where the subject's colour fades into
 * the water's (edgeFloor at no departure).
 * A negative desat gives the chroma left after the cast back a little (×(1 − desat)): the animal's own colour comes
 * forward instead of fading to grey; a full clearing with desaturation turns a blue-grey shark into a flat white
 * cut-out (the clearing alone raises a blue-cast grey's luminance).
 */
export const SUBJECT_CLEAR = { k: 0.35, cMax: 0.045, desat: -0.15, edgeFloor: 0.3 };

/**
 * Subject pop separation (on top of SUBJECT_CLEAR), per unit of the pop weight P = subject tone weight × pop
 * strength × the user's Strength (uniform p23.w, 1 = default): all of it stays on the subject (with an AI mask,
 * inside its contour: grade-shader toneWeight), nothing outside it changes, and none of it invents colour or
 * structure. At the default Strength: about +10 L* on a lit subject, most of the separation from local contrast and
 * colour (the cast cleared, the animal's own chroma kept) rather than a white lift; a diver should see it at once.
 *   vividKeep  the share of the Vivid look's water darkening the subject is spared (its colour stays Vivid's);
 *              Vivid tells water by hue, so a blue-grey animal would otherwise darken with the water.
 *   clarity    extra local contrast (the frame's own CLAHE) on the subject: its own texture, more of it.
 *   lift       a midtone lift of the subject's Oklab L (4·L·(1 − L): blacks and highlights stay).
 *   chromaFollow  the share of the lift's L ratio the chroma follows (1 = saturation kept; less, so a lifted
 *              cast-blue belly does not turn more cyan, and the lift reads as clearer water)
 *   engineKeep  the share of all this the engine's own subject masks get (no AI detection): they reach past
 *              the animal, so their tone stays at about the previous default (no stronger glow)
 *   keepDarkLo/Hi  below this graded Oklab L a part keeps its colour: no cast clearing, chroma follows the lift in
 *              full (a thin dark tail would otherwise turn grey-mauve / brownish next to the saturated water)
 *   darkLo/Hi  the whole pop (clearing included) fades out as the graded lightness (Oklab L) drops through
 *              lo..hi: a dark, low-chroma part (a thresher's long tail) keeps the plain grade's colour.
 *   hueMax     on the subject, the output hue stays within this angle (radians) of the source pixel's own hue:
 *              the tone never rotates a dark blue toward magenta or brown.
 */
export const SUBJECT_POP = { vividKeep: 0.8, clarity: 0.42, lift: 0.085, chromaFollow: 0.3, engineKeep: 0.5, keepDarkLo: 0.35, keepDarkHi: 0.55, darkLo: 0.2, darkHi: 0.45, hueMax: (20 * Math.PI) / 180 };

/** Subject pop Strength (UserSettings.subjectPopStrength, 0..1, 0.5 = default) → the shader's multiplier (p23.w). */
export function popStrengthK(s: { subjectPopStrength?: number }): number {
  return 2 * Math.min(1, Math.max(0, s.subjectPopStrength ?? 0.5));
}

export const OBJECT_NEUTRAL = { hue: (195 * Math.PI) / 180, bandIn: (45 * Math.PI) / 180, bandOut: (85 * Math.PI) / 180, rLo: 0.08, rHi: 0.3, mix: 0.92, silver: 0.022, lLo: 0.12, lHi: 0.32, farLo: (30 * Math.PI) / 180, farHi: (60 * Math.PI) / 180, lift: 0.05, confLo: 0.05, confHi: 0.5, warmHue: (50 * Math.PI) / 180, warmLo: 0.1, warmHi: 0.5 };
/**
 * Object-neutral strength for a frame (uniform p16.w): only frames that are
 * mostly open water with subjects in them (backdrop validity) — on a reef
 * that fills the frame, green coral is a real colour, not a red deficit.
 */
export function objectNeutralOf(p: GradeParams): number {
  // Not on frames without a cast at all (topside: a smooth sky is a backdrop too).
  return Math.min(1, Math.max(0, p.backdrop ?? 0)) * (1 - Math.min(1, Math.max(0, p.calmTone ?? 0)));
}

/** Guard strength for a frame (uniform p16.z; 0 = off, 1 = noise floor DETAIL_GUARD.sigma). */
export function detailGuardOf(_p: GradeParams): number {
  return 1;
}

/**
 * Temporal layer (temporal.ts; GPU only — the CPU reference grades single
 * frames, where every term below is the identity). A motion-compensated
 * history at 1/8 resolution serves two jobs:
 *  - anti-crawl: the low-resolution correction (graded / source per channel)
 *    is blended in the log domain with the previous frame's, aligned by block
 *    flow; the full-resolution grade is multiplied by stabilised / current
 *    (clamped kMin..kMax), so the correction can no longer change faster
 *    than the scene. betaMax: history weight at a perfect match; betaDiff:
 *    log-ratio change at which the history is dropped (a real change).
 *  - subject tracking: the previous frame's subject mask, warped by the same
 *    flow (decay per frame), is a prior for the open-water subject weight,
 *    kept near the current analysis map where the pixel departs from the
 *    water like a subject (BACKDROP.subjLo..subjHi, the same trim as the
 *    map's own reach) — the same object as one frame ago.
 *  - dark flat water gets a light motion-adaptive temporal denoise (denoise
 *    × flow confidence × flatness × darkness × not-subject × similarity to
 *    the warped previous output, tau in sRGB units).
 * Block flow: 3×3 luma patches, ±flowR low-res texels (±24 px at 1/8),
 * lambda: per-texel bias toward zero motion; conf ramps out by sadLo..sadHi.
 */
export const TEMPORAL = {
  scale: 8,
  flowR: 3,
  lambda: 0.004,
  sadLo: 0.012,
  sadHi: 0.04,
  betaMax: 0.8,
  betaDiff: 0.15,
  kMin: 0.8,
  kMax: 1.25,
  decay: 0.9,
  /** The prior is carried only near the current analysis map (its max within supportR map texels, ramped
   * supportLo..supportHi): it bridges the map's lag and per-pixel dropouts, but never feeds itself into a
   * trail where the animal no longer is. */
  supportR: 2,
  supportLo: 0.2,
  supportHi: 0.6,
  denoise: 0.5,
  tau: 5 / 255,
  flatLo: 3 / 255,
  flatHi: 8 / 255,
  darkLo: 0.3,
  darkHi: 0.5,
};

/**
 * Vivid objects keep their colour: a pixel that is strongly chromatic in the
 * source and far from the veil hue (an orange fish, a red sea fan) has
 * already escaped the cast, and the grade must not wash it out — its output
 * chroma is floored at `keep` × the source chroma.
 */
export const VIVID = { cLo: 0.06, cHi: 0.12, keep: 0.95 };

/** Deep-blue look constants (fitted to a reference grade in Oklab). */
export const LOOK = {
  // Measured against the user's references: hazy scenes come out ≈0.65×
  // darker, clear scenes keep their exposure. The dim rides on the exposure
  // uniform, scaled by the frame's haze (see lookParams); gamma is a mild
  // per-pixel shadow crush.
  gamma: 0.0,
  dim: 0.5, // refit 7 Oct: both hazy references sit ≈0.82× below the 0.3 result
  liftRelief: 0.6, // the dim backs off by up to this share when the haze lift is subtracting …
  liftRef: 0.1, // … this much (linear luminance) or more
  hazeDehaze: 0.4, // hazy frames: the look also dehazes the water path …
  hazeClarity: 0.4, // … local contrast (dark garments are safe now that dehaze skips them; more than this does nothing visible — CLAHE_CLIP caps it) …
  hazeLevels: 0.15, // … and a slightly fuller levels stretch
  waterDim: 0.25, // in clear frames water-coloured pixels (by hue, never by mask) go darker; hazy frames already dim globally
  hazeLo: 0.05, // lifted-black haze below which nothing dims …
  hazeHi: 0.3, // … and above which the full dim applies
  hazeChroma: 2.0, // water tint chroma target rises with haze (murky ref: C ≈ 0.13 at mid L vs our 0.08 at 0.8)
  deepLo: 0.35, // lifted-black haze above which "objects" stop being told apart from water in the look (a murky frame is water everywhere) …
  deepHi: 0.8, // … fully by here
  objChroma: 0.045, // in hazy frames pixels that are not water-hued (reef, rock) settle at this chroma: the references turn the reef grey-blue, not saturated blue
  neutralDesat: 0.8, // light near-neutral pixels (sand, white coral) lose chroma …
  neutralLo: 0.025, // … below this chroma fully …
  neutralHi: 0.05, // … fading out by this (surface water sits above it) …
  neutralLLo: 0.65, // … and only when light (water is never "white")
  neutralLHi: 0.8,
  warmHue: (65 * Math.PI) / 180, // warm band (skin, sand: ~20°–110°) never takes the tint …
  warmIn: (45 * Math.PI) / 180,
  warmOut: (70 * Math.PI) / 180,
  warmLo: 0.006, // … once it has any chroma at all …
  warmHi: 0.015,
  warmHaze: 0.06, // … but in hazy frames dull warm pixels (brown reef, rubble) need this much more chroma to escape the tint; skin after its memory colour sits above it, and detected people skip the look anyway
  brightLo: 0.6, // light pixels (pale skin, white coral, hands) keep their colour …
  brightHi: 0.8,
  keepLo: 0.09, // vivid in-band colours (blue fins) are kept …
  keepHi: 0.14,
  targetHue: (252 * Math.PI) / 180,
  c0: 0.0, // target chroma = c0 + c1·L: zero at black, so blacks stay black …
  c1: 0.11,
  darkLo: 0.08, // … and dark pixels (wetsuits, shadows) take no tint below this lightness
  darkHi: 0.45, // (a wide ramp: one garment must not split into tinted and untinted parts)
  darkHaze: 0.6, // in hazy frames the ramp's top drops by this share (dark reef takes the tint like the references; wetsuits below darkLo still don't)
  farLo: (50 * Math.PI) / 180, // hues far from the target (greens, browns) …
  farHi: (110 * Math.PI) / 180,
  farKeep: 0.55, // … keep this much of their own hue, so the reef keeps colour variety
  mix: 0.8, // how far (a, b) move toward the target
};

/**
 * "Vivid" look (UserSettings.vivid), fitted to the user's graded pairs
 * (refgrade: water CIELAB hue ≈204° → ≈255°, water ≈0.77× darker, shadows
 * black, sand and skin natural). Runs last in Oklab on the graded colour,
 * and every weight is a smooth function of that colour (and of the source
 * nothing else) — never of a mask or the water/object split,
 * so it cannot draw an edge the picture does not already have.
 *
 * Hue: graded hues in the cyan band are pulled toward `target` by `pull`;
 * the band fades in over `bandLo0..bandLo1` (teal reef turns a little teal-
 * blue, greens and everything warm are untouched) and out over `bandHi0..
 * bandHi1` (dull violets — dark-rock speckle — come back to blue; vivid
 * violets, purple coral, keep theirs). Green water (red.ts greenWeight g)
 * swaps the pull for a coherent shift of `greenShift` over the whole cool
 * half of the frame (band from `greenLo0..greenLo1`), so murk over reef moves
 * as one instead of the water alone turning blue. Pixels below `cLo..cHi`
 * chroma (sand, greys) or `lLo..lHi` lightness hardly move. Whitish water
 * (the sun opening, sunbeams, the surface) is not darkened — the darkening
 * grows with the square of the chroma — and the brightest water is lifted
 * toward a warm white (`lift*`). The tone curve stays compressive along L
 * (a lightness-only fade would steepen bright water into new edges), and
 * every ramp is wide enough that the look adds no edges Auto does not
 * (eval/vivid.ts newEdgePct).
 */
export const VIVID_LOOK = {
  target: (242 * Math.PI) / 180, // Oklab ≈ CIELAB 260°: the references' navy
  pull: 0.6,
  bandLo0: (130 * Math.PI) / 180, // a wide entry ramp: the pull expands hues where it starts (teal next to green would split)
  bandLo1: (225 * Math.PI) / 180,
  bandHi0: (255 * Math.PI) / 180,
  bandHi1: (305 * Math.PI) / 180,
  violetCLo: 0.08, // violets above this chroma are real colour …
  violetCHi: 0.14,
  greenShift: (22 * Math.PI) / 180,
  greenLo0: (85 * Math.PI) / 180,
  greenLo1: (125 * Math.PI) / 180,
  greenTop0: (205 * Math.PI) / 180, // … the green shift fades out toward blue (never into violet)
  greenTop1: (240 * Math.PI) / 180,
  cLo: 0.0, // the pull grows with chroma over a wide ramp (greys hardly turn; no chroma step becomes a hue step)
  cHi: 0.1,
  lLo: 0.15,
  lHi: 0.4,
  chroma: 0.1, // modest chroma gain on the turned water
  dark: 0.2, // water darkening at full weight (Oklab L ×(1 − dark·ramp)) …
  darkGreen: 0.1, // … in green water, where it covers the whole cool half
  darkLLo: 0.3, // darkening ramp on L (dark water is not darkened further)
  darkLHi: 0.6,
  darkCLo: 0.015, // darkening / chroma gain grow with the square of a wide chroma ramp: whitish water near the surface,
  darkCHi: 0.16, // sunbeams and the sun opening (C ≲ 0.04) are not darkened, and a smooth cyan-to-white gradient never
  // turns into a dark-blue / white boundary; along L the curve stays compressive (no new edges in bright water)
  blackK: 0.1, // shadow toe: L ×(1 − blackK) at black, easing out by blackHi (Auto's lifted shadows go back to black;
  blackLo: 0.0, // a smooth function of the graded lightness, so no per-pixel noise drives it; kept to the deep
  blackHi: 0.25, // shadows — a toe reaching into the mid-tones sharpens murky reef texture into new edges)
  shadowC0: 0.006, // dark-area chroma bound c0 + c1·smoothstep(sLo, sHi, L) …
  shadowC1: 0.1,
  shadowLLo: 0.15,
  shadowLHi: 0.6,
  shadowKeep: 0.5, // … chroma above it is kept at this share (violet speckle in dark rock)
  shadowFadeLo: 0.35, // … in dark areas only (fades out over this lightness)
  shadowFadeHi: 0.55,
  // Sun / surface highlight: bright water-hued pixels (the sun opening, sunbeams, the surface) go toward a
  // warm white instead of navy — L += lift·(1 − L), chroma ×(1 − hiDesat) plus a warm tint of warmC at
  // warmHue — on a smooth ramp over the graded lightness from liftLLo (no clipping, no flat blob, no new edge).
  liftLLo: 0.9,
  liftNeutralC: 0.04, // near-neutral pixels count as water here (their hue is noise)
  lift: 0.08,
  hiDesat: 0.45,
  warmC: 0.006,
  warmHue: (80 * Math.PI) / 180,
};

/**
 * Near-white tint guard in the default grade: faint pink/magenta in a
 * near-white highlight (a sun opening, the surface) goes neutral. Skin hues
 * (≥ ~55°) and the warm white of sunlight are outside the band.
 */
export const HIGHLIGHT_PINK = { hue: (355 * Math.PI) / 180, bandIn: (30 * Math.PI) / 180, bandOut: (55 * Math.PI) / 180, lLo: 0.86, lHi: 0.96, cLo: 0.04, cHi: 0.08, mix: 0.85 };

/**
 * Where Vivid (on by default) stands down. The look is fitted to daylight
 * water with a cast; on other footage it softens or switches off, from
 * clip-locked frame evidence (never per pixel):
 *  - already graded / topside: the do-no-harm scores (calm.ts) — off from
 *    calmHi, eased in from calmLo (the scores stop at 0.9, so a plain
 *    1 − calm would leave a tenth of the look on);
 *  - night, torch-lit caves: a dark veil (Oklab L of B∞ below veilLLo..
 *    veilLHi; daylight water measures ≥ 0.39 on the valset, torch / night
 *    ≤ 0.29);
 *  - ROV / lamp-lit seabed: the frame is lit from the camera, not from the
 *    surface — the bottom third clearly brighter than the top (`lift`, Oklab
 *    L) under a grey, low-chroma veil — softened to rovKeep (a daylight
 *    frame looking down at bright sand under a grey veil softens too).
 * Cenote and cave sunbeams are handled per pixel (whitish beams are lifted,
 * not darkened: VIVID_LOOK.darkC*, lift*); torch-lit caves by the veil.
 */
export const VIVID_GATE = { calmLo: 0.15, calmHi: 0.6, veilLLo: 0.27, veilLHi: 0.38, liftLo: 0.08, liftHi: 0.25, veilCLo: 0.06, veilCHi: 0.11, rovKeep: 0.25 };

function smoothstepP(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Frame evidence for the Vivid gate (analyze.ts): veil Oklab L and chroma, bottom-minus-top mean Oklab L. 1 = full look. */
export function vividGateOf(veilL: number, veilC: number, lift: number): number {
  const G = VIVID_GATE;
  const night = smoothstepP(G.veilLLo, G.veilLHi, veilL);
  const rov = smoothstepP(G.liftLo, G.liftHi, lift) * (1 - smoothstepP(G.veilCLo, G.veilCHi, veilC));
  return night * (1 - (1 - G.rovKeep) * rov);
}

/** The Vivid amount the shader reads (0..1): the user's setting through the gate (VIVID_GATE). */
export function vividAmountOf(p: GradeParams, s: UserSettings): number {
  const v = Math.min(1, Math.max(0, s.vivid ?? 0));
  if (v <= 0) return 0;
  const calm = Math.min(1, Math.max(0, Math.max(p.calm ?? 0, p.calmTone ?? 0)));
  return v * (1 - smoothstepP(VIVID_GATE.calmLo, VIVID_GATE.calmHi, calm)) * Math.min(1, Math.max(0, p.vividGate ?? 1));
}

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
    hazeLift: 0,
    subjectPop: !!s.subjectPop,
    subjectPopStrength: s.subjectPopStrength,
  };
}

/**
 * Drives the estimated parameters harder by the push amount: the balance
 * is extrapolated (gains to the power 1 + 0.8t, which also widens the
 * range compensation it sets), the water path follows it further, and the
 * levels / chroma ceilings open up.
 */
/** How much of the look's haze-dependent behaviour applies to this frame, 0..1. */
/** 1 when the frame is so hazy that the references tint everything like water (see LOOK.deepLo/deepHi). */
export function deepHaze(p: GradeParams): number {
  const t = Math.min(1, Math.max(0, (p.haze - LOOK.deepLo) / (LOOK.deepHi - LOOK.deepLo)));
  return t * t * (3 - 2 * t);
}

export function hazeWeight(p: GradeParams): number {
  return hazeWeightOf(p.haze);
}
export function hazeWeightOf(haze: number): number {
  const t = Math.min(1, Math.max(0, (haze - LOOK.hazeLo) / (LOOK.hazeHi - LOOK.hazeLo)));
  return t * t * (3 - 2 * t);
}

/** Scene-preset prior on the estimated parameters. */
export function presetParams(p: GradeParams, s: UserSettings): GradeParams {
  const a = PRESET_ADJUST[s.preset ?? "auto"];
  if (!s.preset || s.preset === "auto" || !a) return p;
  const wb: Vec3 = [Math.min(a.redMax, Math.max(1, p.wb[0] * a.red)), 1, Math.min(1.6, Math.max(0.5, p.wb[2] * a.blue))];
  const waterWb: Vec3 = [Math.min(2, Math.pow(wb[0], 0.6)), 1, Math.min(2, Math.max(0.5, Math.pow(wb[2], 0.6)))];
  return { ...p, wb, waterWb, exposure: p.exposure * a.exposure };
}
export function presetSettings(g: GradeSettings, s: UserSettings): GradeSettings {
  const a = PRESET_ADJUST[s.preset ?? "auto"];
  if (!s.preset || s.preset === "auto" || !a) return g;
  // Reef: little haze by definition — also damp the automatic dehaze.
  const dehaze = s.preset === "reef" ? Math.min(g.dehaze, 0.15) : Math.min(1, Math.max(g.dehaze, a.dehaze));
  return { ...g, dehaze, clarity: Math.min(1, Math.max(0, g.clarity + a.clarity)), hazeLift: Math.max(g.hazeLift, a.hazeLift) };
}

/** Look-driven global adjustments (exposure dim in hazy scenes). */
export function lookParams(p: GradeParams, s: UserSettings): GradeParams {
  const look = Math.min(1, Math.max(0, s.look));
  if (look <= 0) return p;
  const hw = hazeWeight(p) * look;
  // The automatic haze lift already darkens a murky frame: the look's dim
  // backs off in proportion to the lift (else the two stack to near-black).
  const tl = s.hazeAuto !== false ? HAZE_AUTO.lift * hazeWeight(p) * p.hazeBlack : 0;
  const relief = LOOK.liftRelief * Math.min(1, tl / LOOK.liftRef);
  return { ...p, exposure: p.exposure * (1 - LOOK.dim * hw * (1 - relief)), levelsMix: Math.min(0.85, p.levelsMix + LOOK.hazeLevels * hw) };
}

/**
 * Haze-adaptive default: hazy frames get dehaze, local contrast and a fuller
 * levels stretch on their own (no balance push), so a murky clip clears up
 * at the default Intensity while clear scenes are untouched.
 */
// clarity 0.3 cost ~35 % temporal grain on hazy clips (review A/B, 4 Oct); 0.15 keeps most of the clearing.
export const HAZE_AUTO = { dehaze: 0.5, clarity: 0.15, levels: 0.15, lift: 0.9 };
export function hazeSettings(g: GradeSettings, p: GradeParams): GradeSettings {
  const hw = hazeWeight(p);
  if (hw <= 0) return g;
  return { ...g, dehaze: Math.max(g.dehaze, HAZE_AUTO.dehaze * hw), clarity: Math.min(1, g.clarity + HAZE_AUTO.clarity * hw), hazeLift: Math.max(g.hazeLift, HAZE_AUTO.lift * hw) };
}
export function hazeParams(p: GradeParams): GradeParams {
  const hw = hazeWeight(p);
  if (hw <= 0) return p;
  return { ...p, levelsMix: Math.min(0.85, p.levelsMix + HAZE_AUTO.levels * hw) };
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
  // The water path (pixels that share the water's hue and brightness) gets a
  // toned-down balance; a push lets it follow the full balance much further,
  // which is what a deep blue-green scene with no neutral reference needs.
  const waterMax = 1.6 + 1.4 * t;
  const waterPow = 0.6 + 0.3 * t;
  const waterWb = wb.map((g) => Math.min(waterMax, Math.max(1 / waterMax, Math.pow(g, waterPow)))) as Vec3;
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
  /** Lifted black: p0.4 of the exposed luminance, uncapped (the haze-lift stage subtracts a share of it). */
  hazeBlack: number;
  /** Per-channel lifted black (p0.4 of each exposed channel): the colour of the haze floor. */
  hazeFloor: Vec3;
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
  /**
   * Do-no-harm (see calm.ts), 0..1: evidence that the frame is already
   * colour-balanced (calm: backs off balance, range compensation and veil)
   * or not underwater at all (calmTone: also exposure, levels, local
   * contrast, haze removal, skin colour). Absent = 0.
   */
  calm?: number;
  calmTone?: number;
  /**
   * Validity of the smooth-water backdrop model (backdrop.ts), 0..1: the
   * frame is mostly open water with subjects in it. Drives the object
   * neutral tone (see OBJECT_NEUTRAL). Optional for older packets.
   */
  backdrop?: number;
  /** The backdrop surface (18 coefficients: Oklab L, a, b over upright uv; backdrop.ts). Per frame, never clip-locked. */
  backdropFit?: number[];
  /** 1 when the frame holds an open-water animal with a lit side (backdrop.ts growSubjects); clip-locked, it gates the subject tone. */
  subjectTone?: number;
  /** Vivid gate from the frame (vividGateOf: night / torch / ROV evidence), 0..1; clip-locked. Absent = 1. */
  vividGate?: number;
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
  hazeBlack: 0,
  hazeFloor: [0, 0, 0],
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
  /** Open water: the animals of the subject map (animals.ts), labelled on this grid. */
  animals?: AnimalMap;
  /** Per-animal strength texture (animals.ts AnimalTracker.strength, RGBA at the animals' grid) in place of the still targets (harness / CPU reference). */
  strength?: Float32Array;
};

/**
 * Skin memory colour, applied to person pixels that are light and not
 * strongly coloured: hue pulled toward SKIN.hue and a chroma floor, so skin
 * comes out pink rather than cream/grey. Wetsuits (dark) and fins (vivid)
 * are untouched.
 */
export const SKIN = {
  hue: (18 * Math.PI) / 180, // pink: the reference skin measures ~19° (35° read peach/cream)
  bandHue: (65 * Math.PI) / 180, // candidates: hue within ~15°–115° …
  bandIn: (50 * Math.PI) / 180,
  bandOut: (75 * Math.PI) / 180,
  achroma: 0.012, // … or nearly neutral
  lLo: 0.4, // light enough
  lHi: 0.55,
  cLo: 0.07, // not vivid
  cHi: 0.1,
  mix: 1.0, // how far the hue moves toward SKIN.hue
  wLo: 0.1, // person weight saturates: smoothstep(wLo, wHi, person)
  wHi: 0.5,
  cMin: 0.05, // chroma floor
};

/** CLAHE tile LUTs: `tilesX*tilesY` rows of `bins` entries (R channel). */
export type ClaheLuts = { tilesX: number; tilesY: number; bins: number; data: Float32Array };

export type FrameAnalysis = {
  params: GradeParams;
  depth: DepthMap;
  clahe: ClaheLuts;
  /** Mean sRGB of the thumbnail, for scene-cut detection. */
  mean: Vec3;
  /** Diagnostics (harness only; the worker does not post it). */
  diag?: { sandWeight: number; sandFrac: number; sandMask: Uint8Array; calm: CalmEvidence; backdrop?: number };
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
 *  p16: hazeWeight, deepHaze, detail guard, object-neutral strength
 *  p17: haze-lift subtraction per channel (hazeLiftT), neutral subtraction (hazeLift·hazeBlack)
 *  p18–p22: backdrop surface (18 coefficients, L / a / b; backdrop.ts), p22.z subject tone, p22.w green-water weight (red.ts)
 *  p23: temporal history valid (backend), temporal layer on (engine), Vivid amount (vividAmountOf), 0
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
  const hz = settings.hazeAuto !== false;
  params = lookParams((hz ? hazeParams : (p: GradeParams) => p)(presetParams(boostParams(calmParams(params), pushOf(settings)), settings)), settings);
  const base = greenSettings(presetSettings(calmSettings(resolveSettings(settings), params), settings), params);
  const s = lookSettings(hz ? hazeSettings(base, params) : base, params);
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
  u.set([hazeWeight(params), deepHaze(params), detailGuardOf(params), objectNeutralOf(params)], 64);
  u.set([...hazeLiftT(params, s.hazeLift), s.hazeLift * params.hazeBlack], 68);
  if (params.backdropFit && params.backdropFit.length === 18) u.set(params.backdropFit, 72);
  u[90] = settings.subjectPop ? Math.min(1, Math.max(0, params.subjectTone ?? 0)) : 0;
  u[91] = greenWeight(params); // p22.w: green-water weight (red.ts)
  // p23: history valid (set by the backend per frame), temporal layer on, Vivid amount, 0
  u[93] = 1;
  u[94] = vividAmountOf(params, settings);
  u[95] = popStrengthK(settings); // p23.w: Subject pop Strength multiplier
  u[96] = 1; // p24.x: Subject pop lift direction (set per frame by the engine, seg-overlay.ts popDirection)
  // p24.y: an AI subject overlay is on this frame (set by the engine): the AI alone weights the pop (grade-shader toneWeight)
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

/**
 * Component-wise median of several frames' parameters: the clip-wide
 * estimate the engine locks so a passing subject (an orange fish filling
 * the frame) cannot swing the balance for the frames it is in.
 */
export function medianParams(list: GradeParams[]): GradeParams {
  if (list.length === 0) throw new Error("medianParams: empty");
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const out = { ...list[0] } as Record<string, unknown>;
  for (const key of Object.keys(list[0]) as (keyof GradeParams)[]) {
    const v0 = list[0][key];
    if (typeof v0 === "number") out[key] = med(list.map((p) => p[key] as number));
    else if (Array.isArray(v0)) out[key] = (v0 as number[]).map((_, i) => med(list.map((p) => (p[key] as number[])[i])));
  }
  return out as unknown as GradeParams;
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
    hazeBlack: m(a.hazeBlack, b.hazeBlack),
    hazeFloor: v(a.hazeFloor, b.hazeFloor),
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
    calm: m(a.calm ?? 0, b.calm ?? 0),
    calmTone: m(a.calmTone ?? 0, b.calmTone ?? 0),
    backdrop: m(a.backdrop ?? 0, b.backdrop ?? 0),
    subjectTone: m(a.subjectTone ?? 0, b.subjectTone ?? 0),
    vividGate: m(a.vividGate ?? 1, b.vividGate ?? 1),
    backdropFit: a.backdropFit && b.backdropFit && a.backdropFit.length === b.backdropFit.length ? a.backdropFit.map((x, i) => m(x, b.backdropFit![i])) : b.backdropFit,
  };
}
