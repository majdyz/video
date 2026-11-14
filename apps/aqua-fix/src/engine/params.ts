// Engine parameter model and the packed uniform layout both shaders read.
// The analysis pass produces a GradeParams for the current frame; the
// temporal smoother blends them; packUniforms() serialises them.

import type { AnimalMap } from "./animals.ts";
import type { SubjectBlob } from "./backdrop.ts";
import { UNIFORM_FLOATS } from "./backend.ts";
import { linearToOklab } from "./color.ts";
import { calmParams, calmSettings, type CalmEvidence } from "./calm.ts";
import { greenSettings, greenWeight } from "./red.ts";
import { fitLookAmountOf, fitLookMixOf } from "./look-fit.ts";

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
  /**
   * "Blue water" style, 0..1 (see BLUE_WATER): on top of Vivid, all water
   * (green and teal included) goes to one cobalt blue, warm subjects more
   * orange, silver/white subjects neutral, shadows deeper. Vivid alone already
   * carries this mapping at WATER_HUE.amount (the default look); 1 runs it in
   * full. A per-pixel function of the graded colour only (no masks).
   */
  blue?: number;
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
  /** Warm pop on the subject, 0..1 (0 = off). */
  subjectPopWarmth?: number;
  /** Seabed recovery, 0..1 (SEABED): sand and reef turned neutral where the water left no red at all; open water kept. */
  seabed?: number;
  /** Temporal noise reduction before the grade (NR): "auto" (default) is gated on the frame's measured noise, "strong" blends harder and opens earlier. */
  noiseReduction?: NoiseReduction;
  /**
   * Tap-to-neutral (tap.ts): gains on red and blue (green = 1) on top of the estimated balance, solved once from a
   * point the user says is white or grey. A constant of the clip: it rides on whatever balance is in force (the
   * clip lock, each shot's offset, a scene preset), so no later analysis undoes it. Absent = none.
   */
  wbTap?: [number, number];
  /** "Water colour", −1..1 (0 = as graded): the water's hue turned toward teal (−) or a deeper blue (+); see WATER_TINT. */
  waterHue?: number;
};

export type NoiseReduction = "off" | "auto" | "strong";
/** Uniform p26.x for a Noise reduction choice (0 off, 1 auto, 2 strong). */
export function noiseLevelOf(s: Pick<UserSettings, "noiseReduction">): number {
  return s.noiseReduction === "off" ? 0 : s.noiseReduction === "strong" ? 2 : 1;
}

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

// clarity: 0.25 before the colour review's item 8 (local contrast as a modest control; the slider goes to 1).
export const DEFAULT_SETTINGS: UserSettings = { intensity: 1, saturation: 1, clarity: 0.15, veil: 0.7, look: 0, preset: "auto", subjectPop: false, subjectPopStrength: 0.5, subjectPopWarmth: 0.5, seabed: 0.6, vivid: 0, blue: 0, noiseReduction: "auto" };
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
  /** Warm pop on the subject, 0..1 (UserSettings.subjectPopWarmth). */
  subjectPopWarmth?: number;
  /** Vivid look amount after the do-no-harm gate (vividAmountOf; CPU reference). */
  vivid?: number;
  /** Blue water amount after the same gate (blueAmountOf; CPU reference). */
  blue?: number;
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
/** k / cMax 0 (14 Nov, second pass): no cast clearing, the subject keeps its own hue and chroma; the negative desat alone is left, a small chroma boost (× (1 − desat)) on the subject's red-starved lit parts. edgeFloor 0.3 → 0 (14 Nov): the engine's masks reach past the subject, and a third of the tone on plain water showed as a paler ring around it. */
export const SUBJECT_CLEAR = { k: 0, cMax: 0, desat: -0.4, edgeFloor: 0 };

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
 *   keepDarkLo/Hi  below this graded Oklab L a part keeps its colour: no cast clearing, and its chroma follows the
 *              lift by chromaFollowDark (a thin dark tail would otherwise turn grey-mauve / brownish next to the
 *              saturated water); kept low so a body's shaded side is toned like the rest (one colour, no patch)
 *   darkLo/Hi  the whole pop (clearing included) fades out as the graded lightness (Oklab L) drops through
 *              lo..hi: a dark, low-chroma part (a thresher's long tail) keeps the plain grade's colour.
 *   hueMax     on the subject, the output hue stays within this angle (radians) of the source pixel's own hue:
 *              the tone never rotates a dark blue toward magenta or brown.
 */
/**
 * Warm pop: on the subject only (the pop's weight × warmth), its Oklab chroma pulled toward a warm cream hue (`hue`,
 * radians) at `keep` of its own chroma, at least `cMin` on its lit parts (L over lLo..lHi) and at most `cMax` (a
 * saturated cyan turned warm at full chroma read orange, not cream), the way a dive colour fixer warms a whole
 * frame, but the water keeps its colour. (A red gain alone does nothing on a cyan shark: it has almost no red.) The
 * weight is the subject mask's own (tone weight over wLo..wHi), not the pop's strength: the engine's masks pop at half
 * strength and a murky backdrop lowers it further, which left the warmth invisible.
 * The pull goes through neutral, not through green: the part of the pixel's chroma across the warm hue (for a teal or
 * cyan pixel, all of it) fades as (1 − k)^`side`, the part along it mixes linearly as before. A plain mix of teal and
 * cream is green: a subject region that a tap-to-neutral (or green water) had left teal came out as a green patch
 * beside neutral sand. A blue subject, straight across from the cream, is as it was.
 * And the pull is for a subject that carries a cast: it fades out where the graded colour (before the subject's cast
 * clearing) is already near neutral (chroma `castLo..castHi`). A region a tap-to-neutral has balanced has nothing
 * left to warm; painting it cream at `cMin` showed as a khaki patch on neutral sand wherever a mask covered it.
 */
/**
 * Seabed recovery: under water that has taken all the red (8-bit red ~0 even on white sand), no gain can bring the
 * colour back; the sand and reef are given a warm neutral instead (the way a dive colour fixer synthesises red),
 * while open water keeps its blue. `need` comes from how little red the bright pixels have (redLo..redHi of green),
 * only when the frame's bottom third is brighter than its top (bandLo..bandHi of Oklab L: a seabed below; open water
 * is lit from above); open water (backdrop validity) is spared.
 *
 * Where: a pixel counts as seabed by the ground around it, never by itself. The analysis measures, on a coarse grid
 * over the frame (`grid` × `grid` cells, GradeParams.seabedGrid), the share of lit seabed in each cell (brightness
 * over the frame's water level, a wide ramp: lo/span of Lb − Lw); the shader reads that grid with a smooth
 * (quadratic B-spline) interpolation and a soft ramp (`wLo..wHi`: ground that is half lit sand, half dark stone or
 * weed, is seabed in full). It used to be the larger of the pixel's own brightness ramp and a small ring of the
 * guide map's: dark stones lying on bright sand went neutral with it, the same stones a little further off (dimmer
 * sand, or just past the ring) stayed blue, and the sand itself switched from neutral to blue along a visible line
 * where its brightness crossed the ramp (user clip, 11 Nov: "the stone, some goes to blue some goes to grey
 * depending it's on top of the sand or the water background"). Now one material at one distance gets one weight,
 * and the weight has no detail finer than a cell (a sixth of the frame): the seabed fades into the blue with
 * distance, and nothing in it can draw a boundary or flicker with the grain. A pixel whose own source colour is far
 * from the water's (VIVID: yellow coral, an orange fish) is not red-less ground and keeps its colour.
 *   hue/chroma  the neutral's tint (Oklab, warm sand); keep: share of the pixel's own chroma kept at full strength;
 *   lift        Oklab L added at full strength (sand reads white, not grey); y0/y1: the top of the frame is spared.
 */
export const SEABED = { hue: (75 * Math.PI) / 180, chroma: 0.02, keep: 0.15, lift: 0.06, grid: 6, wLo: 0, wHi: 0.55, lo: 0.1, span: 0.8, redLo: 0.12, redHi: 0.35, bandLo: -0.1, bandHi: -0.02, y0: 0.2, y1: 0.5 };

/**
 * 14 Nov (the freediver "turns grey"): at the default Warmth 50 the pull stopped half way, which for a blue subject
 * is dead neutral. Now the Warmth slider reaches the full pull at 50, the pull is for the subject's lit parts only
 * (graded L litLo..litHi) that stand lighter than the water behind them (source L against the backdrop's or the
 * AI overlay's local water, upLo..upHi), toward a paler, more skin-like tone (hue 78° → 65°, cMin 0.05 → 0.026,
 * cMax 0.075 → 0.034), and the result keeps at least min(floorKeep × its chroma, floor): never a grey. With the
 * engine's own masks the tone is `engineTone` of that: the looks run after the pull there and deepen a warm colour
 * (a white rope came out orange).
 * Second pass, 14 Nov: `amount` 0. The pull is off (the subject keeps its own hue, see SEG_RESTORE): sharks came out
 * beige, and sand under a leaked outline orange. The code stays for a future, better-informed use.
 */
export const WARM_POP = { hue: (65 * Math.PI) / 180, cMin: 0.026, cMax: 0.034, keep: 0.25, lLo: 0.2, lHi: 0.55, wLo: 0.03, wHi: 0.3, side: 4, castLo: 0.015, castHi: 0.045, litLo: 0.3, litHi: 0.5, upLo: -0.03, upHi: 0.05, floor: 0.018, floorKeep: 0.5, engineTone: 0.35, amount: 0 };

/** 14 Nov, third pass ("almost no pop"): lift 0.1 → 0.28 and clarity 0.22 → 0.38 with the engine's own masks (the mild step of the strength sweep, greyfix/v3: the middle one washed overlapping sharks out). The engine's masks reach past the subject, so the pop's lift, clarity and Vivid sparing also need the pixel itself to stand off the backdrop (waterLo..waterHi of its departure, a stricter ramp than the tone's): the water and the blurred rim around a diver's arms came up as a pale glow. */
export const SUBJECT_POP = { vividKeep: 0.8, clarity: 0.3, lift: 0.2, waterLo: 0.05, waterHi: 0.12, chromaFollow: 0.3, chromaFollowDark: 0.7, engineKeep: 0.5, keepDarkLo: 0.25, keepDarkHi: 0.4, darkLo: 0.2, darkHi: 0.45, hueMax: (20 * Math.PI) / 180 };

/**
 * AI subject restore: what a real AI mask on the frame adds to Subject pop (grade-shader segRestore; never with the
 * engine's own masks, which reach past the animal). With the animal's own outline in hand the subject is brought a
 * little closer: part of its water cast taken off, more of its own contrast. Everything scales with S = the AI tone
 * weight (the mask's feathered ramp × its confidence × the regional trust: grade-shader toneWeight) × the Pop
 * slider's multiplier (p23.w: 0 at Pop 0, 1 at 50, 2 at 100), so Pop 0 leaves the plain grade and nothing outside the
 * mask's contour changes.
 *
 * Retuned 12 Nov after the owner's review ("really bad, too jarring"): the first version took 65–90% of the cast
 * off, pushed the colour past neutral toward a sand hue and lifted the midtones by 0.1 L, and the pop's own
 * clearing and warm pop came on top. The ray came out a neutral grey-brown (orange when far away) in an all-blue
 * scene: a cut-out sticker. The subject has to stay in the scene's light, like the same animal seen a little closer:
 *   - under an AI mask this stage is the only one that touches the subject's cast (the pop's cast clearing, its
 *     warm pop and its stronger warm clamp are for the engine's own masks: grade-shader gradeD), so the share
 *     taken off is exactly what is set here;
 *   - at Pop 50 at most half of a pixel's cast goes (S = 1, deep inside a close subject; less over a whole animal
 *     with its feathered rim and its dark parts), at Pop 100 at most two thirds; the colour
 *     never reaches neutral and never crosses to the warm side;
 *   - a small lift only, and none of the pop's own lightness changes (its lift or deepening, its sparing of
 *     Vivid's darkening): the subject's lightness against the water stays close to the plain grade's;
 *   - the colour part fades in from the contour over more of the mask than the tone does (edge), so thin and small
 *     subjects get less of it, and far or low-contrast subjects get a share of it only (farKeep).
 *
 *   darkLo/Hi  S fades out as the graded lightness (cube root of the luminance) drops through lo..hi. Lower than the
 *              engine pop's own fade (SUBJECT_POP.darkLo..Hi): an AI mask on a dark back is still the animal;
 *   popGate    the AI tone weight itself is scaled by min(1, popGate × p23.w): full from Pop ≈ 12 up, nothing at 0;
 *   cast/castMax  the share of a cool pixel's chroma taken off per unit S × K, and its ceiling (hue kept; "cool" =
 *              the cosine of its hue to the opposite of `hue`: a warm, green or magenta pixel keeps its colour);
 *   hue/warm/warmShare  then a little chroma along the warm hue (radians), `warm` per unit S × K × twice the Warmth
 *              slider (p24.z; Warmth 0 = none), on lit parts only (litLo..litHi of Oklab L) and not on highlights
 *              (hiLo..hiHi), and never more than warmShare of what the pixel still has on the cool side of that
 *              hue: it stays on the water's side of neutral, whatever the sliders (the first version went up to a
 *              chroma of 0.045 on the warm side: the orange);
 *   K (edge, farKeep)  the colour share (grade-shader segColourK) = the edge feather × the subject's closeness:
 *              the feather fades the colour in from the contour over `edge` mask px of the read-back distance (the
 *              tone itself is in after SEG_TONE.rampIn): no colour step at the mask's edge, and a thin or small
 *              subject, never that deep, keeps more of the water's colour. The closeness (seg-overlay.ts
 *              subjectCloseness, one value per animal) is how far the subject stands out from the water around it
 *              on the analysis guide (mean Oklab ΔE over veilLo..veilHi): water veils what is far away, so a subject
 *              that hardly stands out is far and gets the farKeep share only, one that stands out clearly all of it;
 *   pack/levels  how the closeness rides in the R channel of the strength texture next to the local water's L
 *              (seg-overlay.ts packSegR: R + pack × the closeness in `levels` steps; the shaders unpack each texel
 *              before they interpolate);
 *   detail     local contrast against the analysis guide (the source's low-pass, plain bilinear): the graded
 *              lightness × (pixel luminance / guide luminance, clamped to rMin..rMax)^(detail × S): spots and
 *              markings stand out from the back;
 *   lift       the midtone lift (4·L·(1 − L)) per unit S, all the lift the subject gets: Subject pop's own
 *              (SUBJECT_POP.lift × P × the clip's direction: 0.1 L and more up, or down for a subject darker than
 *              the water, its chroma scaled along) is left out under an AI mask (grade-shader gradeD), so the
 *              subject's lightness against the water stays close to the plain grade's.
 * Measured offline with the CPU reference on the owner's clip (eagleray-dark: the ray close at 7.9 s, farther off
 * at 15 s; a hand-made mask; apps/aqua-fix/scripts/seg-frames.ts prints the table), subject mean RGB / share of the
 * plain grade's chroma kept / Oklab hue against the water's 248°:
 *   close   plain (3, 35, 57) 100% 245°   was Pop 50 (34, 43, 50) 33%, Pop 100 (43, 47, 51) 16%
 *                                         now Pop 50 (12, 35, 53) 78% 244°, Pop 100 (17, 36, 51) 66% 243°
 *                                         (in the core, 3.5 px inside the contour: 59% and 39% kept)
 *   far     plain (4, 37, 63) 100% 247°   was Pop 50 (34, 45, 55) 40%, Pop 100 (43, 49, 56) 23%
 *                                         now Pop 50 (7, 38, 62) 94% 247°, Pop 100 (10, 39, 61) 88% 246°
 * and the subject's lightness against the water (Oklab L, −0.085 close / −0.063 far in the plain grade) moves by
 * under 0.01 (it was 0.04–0.06 L closer to the water: the grey patch).
 *
 * The upper half of the Pop slider (13 Nov, the owner: "Pop barely changes the picture"). Up to Pop 50 everything
 * above is unchanged (the tuned look). Past 50 the terms above had little left to give: the cast share stops at
 * castMax from Pop 75, the lift is 0.012 L per unit and the local contrast only went from an exponent of 0.25 to
 * 0.5, so Pop 100 read as Pop 50. The boost X = the AI weight × (the multiplier − 1) (0 up to Pop 50, 1 at Pop 100
 * deep inside a close subject; grade-shader gradeD) adds, per unit X:
 *   boostDetail    to the local-contrast exponent (0.5 → 1.2 at Pop 100): spots and markings clearly lighter, the
 *                  back around them darker. This is the bite, and it is separation, not a wash: against the guide's
 *                  low-pass a small dark animal moves away from the water's lightness, not toward it;
 *   boostLift      a little more midtone lift (0.024 → 0.049 L per 4·L·(1 − L) at Pop 100);
 *   boostWarm / boostWarmShare  more of the warm hue (with the Warmth slider) and a higher ceiling for it (still a
 *                  share of what is left on the cool side: never neutral, never warm).
 * No more of the cast comes off than before (castMax): the grey sticker was the cast going, not the contrast.
 *
 * Never a grey, no ring (14 Nov, the owner's freediver in deep blue: "turns grey, and a ring of water around him";
 * the outline method made no difference). Taking half of a red-less subject's cast off leaves slate grey, and the
 * outline's water went with it. Now:
 *   - the cut is smaller (cast 0.45 → 0.3 per unit S, castMax 0.62 → 0.4): dark parts (a wetsuit, a dark back) keep
 *     at least 60% of their colour and stay in the water's light;
 *   - the lit parts of a close subject that stand lighter than the water behind them (skin, a belt, a pale belly:
 *     WARM_POP litLo..litHi on the graded L, upLo..upHi on the source's L against the local water's) go to a warm,
 *     skin-like neutral instead (warmPop, `tone` per unit S up to toneMax, × the Warmth slider up to 50), with a
 *     chroma floor (WARM_POP.floor): a partial pull is the pixel's own hue or the warm one at the floor, never a
 *     grey. What is darker than the water (and the blurred rim of a dark subject against bright water) is not
 *     warmed; a far, veiled subject is not either (warmCloseLo..Hi of its closeness: the orange sticker of 12 Nov);
 *   - within SEG_TONE.trustLo..trustHi mask px of the contour the whole restore follows the pixel: only as far as
 *     it departs from the local water (rimLo..rimHi, Oklab; apply.ts segRim), so the water under an outline that
 *     runs wide keeps its colour. For that the local water's L now rides in R on thick parts too (`thick` + L).
 *
 * Own hue only (14 Nov, second pass; the review of the above: "Basic hammerheads still beige-grey, the ray's leaked
 * sand orange, the freediver only modestly better"). Without red no pull toward neutral or warm can be right for
 * every subject, and wherever the outline leaks it paints. Inside the outline the colour is now never neutralised
 * and never tinted: no cast cut, no warm pull (WARM_POP.amount 0, SUBJECT_CLEAR k 0). The subject pops by light:
 *   sep / boostSep   its lightness moves away from the local water's (per unit S up to Pop 50 / per unit X above, × 4·L·(1 − L)): what is lighter
 *                    than the water behind it gets lighter, what is darker gets darker, by how far the source's L is
 *                    from the water's over `sepRange` (signed, smooth through 0; the clip's pop direction where
 *                    there is no water to compare with). A dark diver against bright water is not lifted into it;
 *                    never downward (a dark blue pushed darker leaves the display's gamut and comes back
 *                    greyer); what is darker than the water is lifted by `sepDark` of the step instead (a midtone
 *                    lift: the subject as if seen through less water, with room for more of its colour);
 *   detail / boostDetail  the local contrast (per unit S up to Pop 50 / per unit X above), upward only (rMin 1: what
 *                    is lighter than its neighbourhood gets lighter; nothing is darkened, the gamut again);
 *   head             all the lightening together takes at most this share of the pixel's headroom to white (a soft
 *                    shoulder): a light spot lifted to white lost its colour (clipped);
 *   vib / boostVib   a little more of its own colour (chroma × (1 + vib), hue kept; fading out vibLo..vibHi so a
 *                    saturated subject is not pushed), by how far the pixel's lightness is from the water's (|t|:
 *                    water under a leaked outline is not made bluer): its chroma never ends under the plain grade's.
 * The rim test and the feather are as above; the Warmth slider has nothing left to act on.
 * Third pass, 14 Nov ("almost no pop: freediver new ≈ off"): the middle step of a strength sweep (sep 0.07 → 0.13,
 * sepDark 0 → 0.45, detail 0.5 → 0.8, vib 0.3 → 0.45): the subject reads 10–18% lighter than in the plain grade on
 * the three reference frames, with more of its own chroma. Two limits came with it (the freediver near the surface,
 * 28–29 s): the chroma boost stops where the colour is as strong as open water's (vibLo..vibHi 0.06..0.12: a lifted
 * dark torso went electric blue), and the lift and the local contrast fade out over hiLo..hiHi (graded L) with `head` 0.4 (bright water
 * under a leaked outline went white).
 */
export const SEG_RESTORE = { darkLo: 0.1, darkHi: 0.28, popGate: 4, sep: 0.13, boostSep: 0.04, sepRange: 0.12, sepDark: 0.45, head: 0.4, vib: 0.45, boostVib: 0.15, vibLo: 0.06, vibHi: 0.12, rimLo: 0.07, rimHi: 0.15, thick: 9, hue: (65 * Math.PI) / 180, hiLo: 0.7, hiHi: 0.9, detail: 0.8, rMin: 1, rMax: 1.45, boostDetail: 0.7, edge: 3, farKeep: 0.35, veilLo: 0.065, veilHi: 0.125, pack: 32, levels: 16 };

/**
 * White guard (Subjects on, open water). Subjects on puts the subject's pixels on the object path (the pop's own
 * confidence map), whose white balance takes the blue out of anything that still has red. On a near-white source
 * that carried the water's cast (white fins, a light rope: bluish white) the balance overshoots: the pixel lands on
 * the far side of neutral, yellow-green (the owner's freediver at 11 s: white fins "turn yellow/beige", 14 Nov).
 * A light pixel (graded L over lLo..lHi) whose source was on the water's side and whose graded colour has crossed
 * to the other side of neutral (by `cross` of its chroma along the water's hue) loses that chroma: white gear
 * stays white. Darker things (skin, a yellow fin that was yellow in the source) are not touched.
 */
export const WHITE_GUARD = { lLo: 0.72, lHi: 0.86, cross: 0.5, srcLo: 0.004 };

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
 * The same block flow feeds the full-frame noise reduction ahead of the grade (NR below), which replaced the
 * light denoise of dark flat water this layer used to apply to the graded picture.
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
};

/**
 * Full-frame temporal noise reduction, before the grade (temporal.ts NR passes, apply.ts TemporalNR): the source
 * is blended with the previous denoised frame, fetched at a whole-pixel displacement (no resampling, so the
 * recursion cannot blur): the 1/8-resolution block flow, refined per block against the history itself to one pixel
 * of the working frame (refineTaps² pixels per block; the 5×5 offsets of step refineStep, then the 3×3 of step 1
 * around the best, biased toward the block flow by refineBias per pixel so flat noisy blocks stay put), read
 * bilinearly and rounded. The block's remaining difference is its motion confidence: noise alone leaves about
 * 0.6 × the noise level e0 (below; the previous frame's), and from blockLo to blockHi × e0 the block (a school of
 * fish, a kicking fin, anything the flow cannot follow) fades out of the blend altogether.
 *
 * Noise level, once per frame: tilesX × tilesY tiles of tileTaps² pixels each measure the mean difference between
 * the source and the warped history (largest channel), at the pixel (e0) and over its 3×3 tent average (el). A
 * flat tile reads the noise alone; texture adds its own difference wherever the picture moves (a whole-pixel
 * displacement leaves up to half a pixel of misalignment), so a tile counts by its flatness (texLo..texHi of the
 * low-resolution luminance's step to its neighbours: water, sand, haze count, reef does not) and a level is the
 * soft minimum over the tiles (power mean of exponent −4; eps keeps a small tile finite). A frame with fewer than
 * tilesMin flat tiles has no level, and the noise reduction stands down on it. Tiles darker than lumLo or
 * brighter than lumHi (clipped) and tiles that do not change at all (below `dead`: letterbox, crushed blacks,
 * blocks the encoder skipped) carry no information and are left out. Noise depends on brightness, so the level is
 * kept per luminance bin (`bins` of them, centres spread over 0..1, each tile weighted by its distance to the
 * centre): a bin with fewer than binMin tiles leans on the whole frame's level, and no bin may exceed binMax ×
 * that level (a bright fish that is the only bright thing in frame must not set its own, motion-inflated level)
 * or eMax.
 *
 * Per pixel (level read at the luminance of its 3×3 average) the blend weight is w × gate(e0) × flow confidence ×
 * two motion tests in units of that level: the pixel's own difference (c0Lo..c0Hi × e0: a speck of marine snow or
 * a highlight is kept whole, and where it was the water returns at once, so nothing trails) and the 3×3 average
 * difference (lLo..lHi × el: a moving fish, a misaligned edge). The gate (gateLo..gateHi of e0, encoded units)
 * leaves clean footage alone.
 */
export const NR = {
  // While the gate is shut for every luminance bin the reduction idles: frames pass through untouched and only
  // every idleEvery-th one is measured (a copy of the frame before it stands in for the history). The first
  // measurement that opens the gate starts the reduction on that frame; while open, every idleEvery-th
  // measurement may shut it again.
  idleEvery: 8,
  refineTaps: 3,
  refineStep: 2,
  refineBias: 0.3 / 255,
  blockLo: 0.75,
  blockHi: 1.15,
  tilesX: 16,
  tilesY: 9,
  tileTaps: 4,
  texLo: 3 / 255,
  texHi: 6 / 255,
  tilesMin: 4,
  eps: 0.25 / 255,
  lumLo: 0.02,
  lumHi: 0.98,
  dead: 0.15 / 255,
  bins: 6,
  binMin: 4,
  binMax: 1.5,
  eMax: 6 / 255,
  c0Lo: 2.5,
  c0Hi: 4.0,
  lLo: 1.6,
  lHi: 2.8,
  // Auto opens where the measured difference is clearly above what 8-bit rounding and a clean encode leave
  // (about 1/255) and is fully on by 3.5/255 (white noise of about 2.4 steps a channel): a clip between the two,
  // such as a shimmering school of fish, is mostly left alone. Strong opens at half that and blends harder.
  auto: { w: 0.7, gateLo: 1.5 / 255, gateHi: 3.5 / 255 },
  strong: { w: 0.8, gateLo: 0.75 / 255, gateHi: 2.0 / 255 },
};

/** Blend weight toward the history before the per-pixel tests: the level's strength × the noise gate at noise e0 (0 when off). */
export function nrStrength(level: number, e0: number): number {
  if (level < 0.5) return 0;
  const c = level > 1.5 ? NR.strong : NR.auto;
  const t = Math.min(1, Math.max(0, (e0 - c.gateLo) / (c.gateHi - c.gateLo)));
  return c.w * t * t * (3 - 2 * t);
}
/** Whether the gate is open in any luminance bin of `levels` (nrLevel's layout, or the level target's texels: e0 first, `stride` floats per bin). */
export function nrOpen(level: number, levels: ArrayLike<number>, stride = 2): boolean {
  for (let b = 0; b < NR.bins; b++) if (nrStrength(level, levels[b * stride]) > 0) return true;
  return false;
}

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
 * The cobalt water-hue map: part of the default look (Vivid, at
 * WATER_HUE.amount) and the whole of the "Blue water" style (UserSettings.blue).
 * First fitted to the user's human-graded pairs (~/video-data/refs/
 * human-graded-2026-11-01: barracuda, cenote, jellyfish), then refitted on all
 * eight reference pairs (eval/fit-look.ts) as one mapping for every scene.
 * The graders put ALL water — blue, teal and green alike — on one
 * cobalt blue (Oklab hue 249–256°, chroma 0.07–0.08 median, ≈0.1 at L 0.4–0.5),
 * turn warm subjects more orange (jellyfish 88° → 62°, chroma ×2), leave
 * silver and white subjects neutral and deepen the shadows. Runs after Vivid,
 * last in Oklab; like Vivid every weight is a smooth function of the graded
 * colour (never of a mask), so it draws no edge the picture does not have
 * and adds no flicker of its own.
 *
 * Water: (a, b) blends toward the cobalt point T(L) = ct(L)·(cos target,
 * sin target) by `mix`. ct = `cK`·L (≤ `cMax`, ×(1 − hiDrop) over
 * `hiLo..hiHi`): zero at black, so blacks stay black. What is "water" is
 * decided by a linear projection, not a hue angle: s = (a, b)·(cos warmDir,
 * sin warmDir), cool = 1 − smoothstep(sLo, sHi, s). Near-greys (whose hue
 * is noise) have s ≈ 0 whatever their hue, so source chroma noise passes at
 * a bounded gain (no blue/green speckle on dark noisy water, no blotches on
 * hazy reef); warm colours with real chroma (skin, sand in sunlight, orange
 * fish) keep theirs. Vegetation (yellow-green `vegIn0..vegOut1` with chroma
 * `vegCLo..vegCHi`) keeps its green. Vivid violets (purple coral: chroma vcLo..vcHi, hue
 * vio0..vio1, fading back by vio2..2π) keep their colour.
 * Silver / white: bright (neutralL*) low-chroma (neutralC*) pixels take no
 * blue and lose `neutralK` of their chroma.
 * Warm: hues in `warmIn0..warmOut1` with real chroma are pulled toward
 * `warmHue` by `warmPull` and gain `warmGain` chroma (≤ `warmCMax`).
 * Shadows: L ×(1 − shadowK) at black, easing out by `shadowHi` (monotone).
 */
export const BLUE_WATER = {
  target: (258 * Math.PI) / 180, // the graded water's Oklab hue measured 249–256° on three pairs; the fit on all eight lands a little bluer
  mix: 0.9,
  warmDir: (45 * Math.PI) / 180, // the warm side of the projection (skin, orange, sand, red)
  sLo: -0.05, // fitted: the ramp ends just past neutral, so sand, whites and skin under a faint cast take (almost) no blue
  sHi: 0.03, // (ramp widths: the near-grey noise gain stays under 3, test/bluewater.test.ts)
  vcLo: 0.07,
  vcHi: 0.12,
  vio0: (285 * Math.PI) / 180,
  vio1: (310 * Math.PI) / 180,
  vio2: (345 * Math.PI) / 180,
  vegIn0: (60 * Math.PI) / 180, // vegetation (moss, seagrass, algae: yellow-green 80–130° with real chroma) keeps its
  vegIn1: (80 * Math.PI) / 180, // colour; green water sits at 140–200° (the graded cenote / jellyfish) and still turns
  vegOut0: (150 * Math.PI) / 180,
  vegOut1: (195 * Math.PI) / 180, // fitted: shallow sunlit reef the balance leaves grey-green (IMG_9552) keeps its colour instead of turning blue
  vegCLo: 0.02,
  vegCHi: 0.04,
  vegGreen: 0.8, // in green water (red.ts greenWeight) the green is mostly cast: the keep relaxes by this share
  cK: 0.24, // water chroma cK·L (the references: 0.065 at L 0.25, 0.08–0.12 at L 0.4–0.5) …
  cMax: 0.12, // … capped …
  hiLo: 0.55, // … and falling off in bright water (sunlit surface, beams: 0.04 at L 0.8)
  hiHi: 0.85,
  hiDrop: 0.3,
  neutralLLo: 0.35, // bright … (wide ramps: a pixel hovering at the edge must not flip between neutral and blue)
  neutralLHi: 0.6,
  neutralCLo: 0.015, // … low-chroma pixels are silver / white, not water (the graded barracuda: C 0.02)
  neutralCHi: 0.05,
  neutralK: 0.8,
  warmHue: (62 * Math.PI) / 180, // measured: the graded jellyfish
  warmIn0: (30 * Math.PI) / 180,
  warmIn1: (50 * Math.PI) / 180,
  warmOut0: (82 * Math.PI) / 180, // yellow-green grass is not pushed orange
  warmOut1: (105 * Math.PI) / 180,
  warmCLo: 0.015,
  warmCHi: 0.045,
  warmLLo: 0.2,
  warmLHi: 0.4,
  warmPull: 0.5,
  warmGain: 0.35, // (0.7 fits the jellyfish pair alone and turns sand and warm-cast water orange)
  warmCMax: 0.15,
  shadowK: 0.25,
  shadowHi: 0.4,
  // Off-hue water: at the default look's share (WATER_HUE.amount) cyan, teal and green water stopped 25–30° short
  // of the references' cobalt (h1, h2: CIELAB 245° against 270–274°) while blue water was already there. Water
  // whose hue lies `farLo..farHi` on the green side of the target, with real chroma (`farCLo..farCHi`: near-greys
  // have no hue), takes up to (1 + farBoost)× the amount (never more than the full style): the further off, the
  // more of the way. Blue water, and so graded blue footage, is unchanged.
  farLo: (50 * Math.PI) / 180,
  farHi: (80 * Math.PI) / 180,
  farMin0: (105 * Math.PI) / 180, // … and not past the greens into the yellows (not water)
  farMin1: (140 * Math.PI) / 180,
  farCLo: 0.02,
  farCHi: 0.05,
  farBoost: 0.43, // 1 / WATER_HUE.amount − 1: the whole map on fully off-hue water
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
  return Math.min(1, Math.max(0, s.vivid ?? 0)) * calmGateOf(p) * Math.min(1, Math.max(0, p.vividGate ?? 1));
}

/**
 * Blue water's gate: Vivid's, except that a dark veil does not mean night
 * when the frame is clearly lit from above (top third much lighter than the
 * bottom: a sunlit cenote or a dark deep-water frame, `sunLo..sunHi` of
 * bottom-minus-top Oklab L; torch-lit caves and night dives measure ≥ −0.05
 * on the valset, the graded cenote −0.41).
 */
export const BLUE_GATE = { sunLo: -0.15, sunHi: -0.3 };

/** Frame evidence for the Blue water gate (analyze.ts), as vividGateOf. 1 = full look. No scene term: the mapping is the same for every scene. */
export function blueGateOf(veilL: number, veilC: number, lift: number): number {
  const G = VIVID_GATE;
  const night = Math.max(smoothstepP(G.veilLLo, G.veilLHi, veilL), smoothstepP(-BLUE_GATE.sunLo, -BLUE_GATE.sunHi, -lift));
  const rov = smoothstepP(G.liftLo, G.liftHi, lift) * (1 - smoothstepP(G.veilCLo, G.veilCHi, veilC));
  return night * (1 - (1 - G.rovKeep) * rov);
}

/**
 * Shadow toe of the tone target (analyze.ts TONE; uniform p24.w carries its gamma g). A plain gamma L^g darkens in
 * proportion most where the picture is already darkest: at g 1.25 a shadow at Oklab L 0.1 lost 44 %, and subjects
 * in shade (a ray's back, a diver's suit, reef under an overhang) fell to black: 1.2 % of the valset's pixels went
 * from L* ≥ 20 to under 8, all of it this stage. The exponent now eases in with the lightness itself:
 * L^(1 + (g − 1)·smoothstep(lo, hi, L)): the full gamma from `hi` up (the mid-tones and the water, where the
 * references are low-key; white stays white), none below `lo`. Monotone for g up to 1.7 (test/tone-toe.test.ts).
 */
export const TONE_TOE = { lo: 0.1, hi: 0.45 };
/** The tone-target curve on the graded Oklab lightness (mirrored in GLSL / WGSL). */
export function toneCurve(L: number, g: number): number {
  const x = Math.max(0, L);
  return g > 1 && x > 0 ? Math.pow(x, 1 + (g - 1) * smoothstepP(TONE_TOE.lo, TONE_TOE.hi, x)) : x;
}

/**
 * The water-hue map in the default look. Vivid carries the cobalt mapping (BLUE_WATER) at `amount`; the Blue water
 * style runs it at 1. One global, continuous mapping of the graded colour, the same for every scene: no scene gate.
 * Fitted with BLUE_WATER on the reference pairs (eval/fit-look.ts, leave-one-out reported there).
 */
export const WATER_HUE = {
  amount: 0.7, // the dial between reference distance and do-no-harm: 0.85 fits the pairs best but costs twice the harm of 0.5; 0.7 with RICH_LOOK: reference 10.1 → 9.0, harm +0.22
  // Do no harm: the map is a larger move than the rest of Vivid, so it stands down sooner on footage that looks
  // graded or topside (calm.ts scores; Vivid's own ramp is VIVID_GATE.calmLo..calmHi).
  calmLo: 0.05,
  calmHi: 0.3,
};

/**
 * Saturation by hue in the default look (Vivid): the user's references and their own edits of the engine's output
 * hold about 1.5× its chroma, more on warm subjects (skin, orange fish and jellyfish, coral); the deeper blue of
 * their open water is the water-hue map's (WATER_HUE.amount, fitted together with this). Hue is never touched here. Runs after the water-hue map, last before Seabed; every weight is a smooth function of the graded
 * colour, the amount is Vivid's (so it stands down with it on graded, topside, night and lamp-lit footage), and the
 * Saturation slider and Subjects → Warmth ride on top as before. Fitted on the reference pairs (eval/fit-look.ts).
 *
 * Chroma: C ×(1 + g·exp(−C / top)), a vibrance curve — monotone in C for any g, the gain fading as the colour is
 * already rich (no neon). g = `gain`, cut by `coolCut` over the water hues (from `coolIn0..coolIn1` up to the
 * magentas: the water's chroma is set by the water-hue map, and a full gain there turns the blue cast the balance
 * leaves on sand and its shadows into blue speckle), plus `warmGain` over the warm hues (`warmIn0..warmOut1`), with
 * its own roll-off `warmTop`. Magentas (`magIn0..magOut1`) take none: the look never adds pink. Near-neutrals take
 * none either (`cLo..cHi`: whites, sand and silver stay as they are, and chroma noise is not amplified), nor do the
 * deep shadows (`lLo..lHi`) and the highlights (`hiLo..hiHi`).
 */
export const RICH_LOOK = {
  gain: 0.5,
  top: 0.15,
  warmGain: 0.5,
  warmTop: 0.12,
  warmIn0: (10 * Math.PI) / 180,
  warmIn1: (45 * Math.PI) / 180,
  warmOut0: (80 * Math.PI) / 180,
  warmOut1: (115 * Math.PI) / 180,
  magIn0: (285 * Math.PI) / 180,
  magIn1: (320 * Math.PI) / 180,
  magOut0: (330 * Math.PI) / 180,
  magOut1: (360 * Math.PI) / 180,
  cLo: 0.01,
  cHi: 0.07,
  lLo: 0.1,
  lHi: 0.3,
  hiLo: 0.85,
  hiHi: 0.97,
  coolCut: 0.6,
  coolIn0: (165 * Math.PI) / 180,
  coolIn1: (215 * Math.PI) / 180,
};

/**
 * Tap-to-neutral limits. `max`: the largest gain (or cut) the tap may ask of red or blue; `wbMin..wbMax`: the range
 * of the balance with the tap on it (boostParams' own range); `waterPow`: the share (as an exponent) of the tap the
 * water path takes — the toned-down balance of veil-dominated pixels follows the full balance the same way
 * (analyze.ts WATER_WB_POWER), so open water does not go purple when a grey rock asks for more red; `waterMax`: its
 * range. The red gain itself still follows the region's red SNR in the shader (red.ts redGainStrength): a tap
 * cannot amplify a red channel that holds nothing.
 */
export const TAP = { max: 4, wbMin: 0.25, wbMax: 5, waterPow: 0.6, waterMax: 3 };

/** The tap's gains as stored: finite, green-normalised, inside ±TAP.max. Null when there is none (or it is the identity). */
export function tapGains(s: Pick<UserSettings, "wbTap">): [number, number] | null {
  const t = s.wbTap;
  if (!t || !(t[0] > 0) || !(t[1] > 0) || !Number.isFinite(t[0]) || !Number.isFinite(t[1])) return null;
  const c = (g: number) => Math.min(TAP.max, Math.max(1 / TAP.max, g));
  const r = c(t[0]), b = c(t[1]);
  return r === 1 && b === 1 ? null : [r, b];
}

/**
 * Tap-to-neutral on the parameters: the last step of the chain (after do-no-harm, the push and the scene preset), so
 * none of them takes it back. The object path gets the gains in full, the water path their toned-down share.
 */
export function tapParams(p: GradeParams, s: Pick<UserSettings, "wbTap">): GradeParams {
  const t = tapGains(s);
  if (!t) return p;
  const g: Vec3 = [t[0], 1, t[1]];
  const wb = p.wb.map((x, c) => (c === 1 ? x : Math.min(TAP.wbMax, Math.max(TAP.wbMin, x * g[c])))) as Vec3;
  const waterWb = p.waterWb.map((x, c) => (c === 1 ? x : Math.min(TAP.waterMax, Math.max(1 / TAP.waterMax, x * Math.pow(g[c], TAP.waterPow))))) as Vec3;
  return { ...p, wb, waterWb };
}

/**
 * "Water colour": one control that turns the hue of the water, −1 (teal, `teal` radians toward green) … 0 (as
 * graded) … +1 (a deeper blue, `blue` radians toward indigo; much smaller: the default look already sits on cobalt, and 20° read violet on pale sand and open water). A
 * rotation of the graded Oklab chroma, weighted by the water-hue map's own idea of water (BLUE_WATER: the cool side
 * of its warm projection, vegetation and vivid violets kept), so skin, sand in sunlight, orange fish and coral do not
 * move, a near-grey moves by next to nothing (a rotation scales with the chroma) and no chroma is added: noise is
 * not amplified and no edge appears that the picture does not have. Runs right after the water-hue map in every
 * style (Natural has no map, the control still works) and whatever the do-no-harm gates say: it is the user's call.
 */
export const WATER_TINT = { teal: (35 * Math.PI) / 180, blue: (14 * Math.PI) / 180 };

/** The water-hue rotation at full water weight, radians (positive = toward blue / indigo); uniform p26.w. */
export function waterTintOf(s: Pick<UserSettings, "waterHue">): number {
  const x = Math.min(1, Math.max(-1, s.waterHue ?? 0));
  return Number.isFinite(x) ? x * (x < 0 ? WATER_TINT.teal : WATER_TINT.blue) : 0;
}

/** The Blue water amount the shader reads (0..1): Vivid's share (WATER_HUE) or the Blue water style, through the gate (graded, topside, night, ROV). */
export function blueAmountOf(p: GradeParams, s: UserSettings): number {
  const c01 = (x: number) => Math.min(1, Math.max(0, x));
  const calm = c01(Math.max(p.calm ?? 0, p.calmTone ?? 0));
  return Math.max(c01(s.blue ?? 0), WATER_HUE.amount * c01(s.vivid ?? 0)) * calmGateOf(p) * (1 - smoothstepP(WATER_HUE.calmLo, WATER_HUE.calmHi, calm)) * c01(p.blueGate ?? p.vividGate ?? 1);
}

function calmGateOf(p: GradeParams): number {
  const calm = Math.min(1, Math.max(0, Math.max(p.calm ?? 0, p.calmTone ?? 0)));
  return 1 - smoothstepP(VIVID_GATE.calmLo, VIVID_GATE.calmHi, calm);
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
    subjectPopWarmth: s.subjectPopWarmth,
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
// clarity 0.3 cost ~35 % temporal grain on hazy clips (review A/B, 4 Oct); 0.15 kept most of the clearing. Since the
// colour review (P5, item 8) haze adds no local contrast at all: a hazy frame is the low-signal case, where local
// contrast stretches grain ("crunchy"), and the reference pairs score no worse without it. The lift is a little
// under full (0.9 before) and capped by the frame's signal (analyze.ts HAZE_CAP, VEIL_CAP).
export const HAZE_AUTO = { dehaze: 0.5, clarity: 0, levels: 0.15, lift: 0.8 };
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
  /** Blue water gate from the frame (blueGateOf), 0..1; clip-locked. Absent = vividGate. */
  blueGate?: number;
  /** Seabed recovery (SEABED): how much red is missing (0..1), and the frame's water / bright Oklab L. */
  seabedNeed?: number;
  /** Tone target (analyze.ts TONE): gamma on the graded Oklab lightness, ≥ 1 (1 = off). */
  toneGamma?: number;
  /** This frame's own (capped) lifted black, kept through a clip lock: the lock's haze lift never exceeds what the frame holds (lock.ts LOCK_LIFT). Absent = hazeBlack. */
  frameBlack?: number;
  seabedLw?: number;
  seabedLb?: number;
  /** Seabed recovery: share of lit seabed per cell of a SEABED.grid² grid over the upright frame (row-major, top-left first; analyze.ts seabedGridOf). Follows the frame, never clip-locked. */
  seabedGrid?: number[];
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
  /**
   * Subject pop's conf channel (one value per texel), when it differs from the fields': the same map with the small,
   * separate animals of a school in it (backdrop.ts BACKDROP.smallLo). Read in place of fields' conf when Subject
   * pop is on (popFields); the plain grade never sees it (small fish keep the normal grade).
   */
  popConf?: Float32Array;
  /** Open water: every region that departs from the water, toned or not (backdrop.ts SubjectBlob). */
  blobs?: SubjectBlob[];
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
  hue: (45 * Math.PI) / 180, // natural: was 18° (pink), which the looks after it saturated into red hands and faces (owner, 13 Nov; eval/skin-check.ts); the owner's own grade of skin measures 55° on h2, about 5° (pale) on u1. Same hue as SKIN_GUARD (look-fit.ts)
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
  diag?: { sandWeight: number; sandFrac: number; sandMask: Uint8Array; calm: CalmEvidence; backdrop?: number; /** Tone caps (analyze.ts HAZE_CAP, VEIL_CAP): measured black, 10th percentile and median of the exposed luminance, and the veil cap's weight. */ tone?: { black: number; yLow: number; yMid: number; veilCap: number } };
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
 *  p23: temporal history valid (backend), temporal layer on (engine), Vivid amount (vividAmountOf), Subject pop Strength
 *  p25: Seabed amount, water L, bright L, Blue water amount (blueAmountOf)
 *  p26: Noise reduction level, its history valid, hold, "Water colour" hue rotation (waterTintOf)
 *  p27–p35: Seabed grid (SEABED.grid² cells, row-major; GradeParams.seabedGrid)
 *  p36: fitted Look amount (fitLookAmountOf), its style mix (fitLookMixOf; 0 = Vivid's set, 1 = Blue water's)
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
  params = tapParams(lookParams((hz ? hazeParams : (p: GradeParams) => p)(presetParams(boostParams(calmParams(params), pushOf(settings)), settings)), settings), settings);
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
  u[98] = settings.subjectPop ? Math.min(1, Math.max(0, settings.subjectPopWarmth ?? 0)) : 0; // p24.z: Warm pop amount
  // p25: Seabed recovery amount (setting × missing red × not open water), water L, bright L.
  u[100] = Math.min(1, Math.max(0, settings.seabed ?? 0)) * Math.min(1, Math.max(0, params.seabedNeed ?? 0)) * (1 - Math.min(1, Math.max(0, params.backdrop ?? 0)));
  u[101] = params.seabedLw ?? 0;
  u[102] = params.seabedLb ?? 1;
  u[103] = blueAmountOf(params, settings); // p25.w: Blue water amount
  u[99] = Math.max(1, params.toneGamma ?? 1); // p24.w: tone-target gamma on the graded lightness (analyze.ts TONE)
  u[96] = 1; // p24.x: Subject pop lift direction (set per frame by the engine, seg-overlay.ts popDirection)
  // p24.y: an AI subject overlay is on this frame (set by the engine): the AI alone weights the pop (grade-shader toneWeight)
  // p26: Noise reduction level (0 off, 1 auto, 2 strong), its history valid (set by the backend per frame),
  // hold (set by the engine: the same frame drawn again, the history must not advance), Water colour (below)
  u[104] = noiseLevelOf(settings);
  u[107] = waterTintOf(settings); // p26.w: "Water colour" hue rotation (WATER_TINT)
  // p27–p35: Seabed grid (zeros without one: no seabed anywhere).
  if (params.seabedGrid && params.seabedGrid.length === SEABED.grid * SEABED.grid) u.set(params.seabedGrid, 108);
  // p36: the fitted Look (look-fit.ts): amount, style mix.
  u[144] = fitLookAmountOf(params, settings);
  u[145] = fitLookMixOf(settings);
  return u;
}

/** RGBA32F texel data for the fields map (R = z, G = conf, B = smoothed d, A = veil scale). */
export function fieldsTexture(d: DepthMap): Float32Array {
  return new Float32Array(d.fields);
}

/** Writes Subject pop's conf channel (DepthMap.popConf) into fields texel data, in place. */
export function popFields(fields: Float32Array, popConf: ArrayLike<number>): Float32Array {
  for (let i = 0; i < popConf.length; i++) fields[i * 4 + 1] = popConf[i];
  return fields;
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

/** Share of a clip's profile samples that must hold a lit open-water animal for its subjects to be toned (medianParams). */
export const SUBJECT_TONE_SHARE = 0.15;

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
  // The subject tone asks "does the clip hold a lit animal", not "do most of its frames": a school that swims
  // through a third of the clip had a median of 0, and Subject pop did nothing on any frame (owner's hammerhead
  // clip). The upper quantile: lit in at least SUBJECT_TONE_SHARE of the samples.
  if (typeof list[0].subjectTone === "number") {
    const s = list.map((p) => p.subjectTone ?? 0).sort((a, b) => a - b);
    out.subjectTone = s[Math.min(s.length - 1, Math.floor((1 - SUBJECT_TONE_SHARE) * s.length))];
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
    blueGate: m(a.blueGate ?? a.vividGate ?? 1, b.blueGate ?? b.vividGate ?? 1),
    seabedNeed: m(a.seabedNeed ?? 0, b.seabedNeed ?? 0),
    toneGamma: m(a.toneGamma ?? 1, b.toneGamma ?? 1),
    frameBlack: m(a.frameBlack ?? a.hazeBlack, b.frameBlack ?? b.hazeBlack),
    seabedLw: m(a.seabedLw ?? 0, b.seabedLw ?? 0),
    seabedLb: m(a.seabedLb ?? 1, b.seabedLb ?? 1),
    seabedGrid: a.seabedGrid && b.seabedGrid && a.seabedGrid.length === b.seabedGrid.length ? a.seabedGrid.map((x, i) => m(x, b.seabedGrid![i])) : b.seabedGrid,
    backdropFit: a.backdropFit && b.backdropFit && a.backdropFit.length === b.backdropFit.length ? a.backdropFit.map((x, i) => m(x, b.backdropFit![i])) : b.backdropFit,
  };
}
