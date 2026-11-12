// The three tools as the UI sees them: on/off, a preset, one Strength
// (0..100 on screen) and the advanced rest — and the pure mapping from that
// state to what each engine reads. No React, no GPU: unit-tested.

import { DEFAULT_SETTINGS, INTENSITY_MAX, SCENE_PRESETS, type NoiseReduction, type ScenePreset, type UserSettings } from "../../../aqua-fix/src/engine/params.ts";
import type { StabilizeParams } from "../../../motion-fix/src/lib/stabilize.ts";
import type { SolveParams } from "../../../motion-fix/src/lib/plan.ts";
import type { Projection } from "../../../dewarp/src/fisheye.ts";
import { DEFAULT_PROFILE, FROM_FILE, PROFILES, UNRECOGNISED_HINT, UNRECOGNISED_PROFILE } from "../../../dewarp/src/profiles.ts";
import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";

export type ToolId = "colour" | "stabilise" | "dewarp";
export const TOOL_ORDER: ToolId[] = ["colour", "stabilise", "dewarp"];
export const TOOL_LABEL: Record<ToolId, string> = { colour: "Colour", stabilise: "Stabilise", dewarp: "Dewarp" };

export type Chip<T extends string> = { id: T; label: string; hint: string };

// ---------------------------------------------------------------- colour

export type ColourState = {
  enabled: boolean;
  preset: ScenePreset;
  /** Main slider, 0..100; 50 = the engine's own estimate (intensity 1). */
  strength: number;
  look: number;
  saturation: number;
  clarity: number;
  veil: number;
  /** Advanced: "Subject pop" (opt-in): subjects in open blue water toned silver and lifted. */
  subjectPop?: boolean;
  /** Subject pop Strength, 0..100 (50 = the tuned default, 100 = strong; 0 = colour clearing only with the engine's own masks, nothing at all with an AI mask: aqua-fix SEG_RESTORE). */
  popStrength?: number;
  /** Warm pop on the subjects, 0..100 (0 = off): a red push on the subject only, the water keeps its colour. */
  popWarmth?: number;
  /** Seabed recovery, 0..100 (0 = off): sand and reef to a warm neutral where the water left no red; open water kept. */
  seabed?: number;
  /** "Vivid" look (on by default): deep muted navy water, darker water, black shadows, the sun kept bright (VIVID_LOOK in the engine; it stands down by itself on graded, topside, night and ROV footage). */
  vivid?: boolean;
  /** "Blue water" style (with vivid): all water one cobalt blue, warm subjects orange, silver neutral, deeper shadows (BLUE_WATER in the engine; same gate as Vivid). */
  blue?: boolean;
  /** Noise reduction (Advanced): "auto" (default) follows the clip's measured noise, "strong" pushes harder, "off" skips it. */
  noise?: NoiseReduction;
  /** Tap-to-neutral: the white / grey point the user tapped and the balance offset solved there (null / absent = none). */
  neutral?: NeutralPick | null;
  /** "Water colour", −100..100 (0 = auto): the water's hue toward teal (−) or a deeper blue (+); subjects keep theirs. */
  waterHue?: number;
};

/**
 * A tap-to-neutral pick (engine tap.ts): gains on red and blue on top of the clip's automatic balance, where and
 * when the user tapped (upright 0..1, clip seconds), and whether the engine had to stop short of neutral. `clip`
 * names the file it was solved on: the offset corrects that clip's balance and is ignored on any other.
 */
export type NeutralPick = { r: number; b: number; u: number; v: number; t: number; limited?: boolean; clip: string };

/** The key a pick is tied to. */
export function clipKeyOf(file: { name: string; size: number; lastModified?: number } | null | undefined): string {
  return file ? `${file.name}:${file.size}:${file.lastModified ?? 0}` : "";
}

/** The pick in force on `clip` (undefined = any clip: tests, tools without a file). */
export function neutralFor(c: Pick<ColourState, "neutral">, clip?: string): NeutralPick | null {
  const n = c.neutral;
  return n && (clip === undefined || n.clip === clip) ? n : null;
}

/** What the engine made of a tap (aqua-fix tap.ts TapSolve), as the UI needs it. */
export type NeutralResult = { ok: true; gains: [number, number]; limited: boolean } | { ok: false; reason: "dark" | "bright" } | null;

/** The line under the picture after a tap. */
export function neutralNote(r: NeutralResult): string {
  if (!r) return "Colour is still reading this frame. Tap again in a moment";
  if (!r.ok) return r.reason === "dark" ? "Too dark to read there. Tap something brighter" : "That spot is blown out. Tap a white or grey that still has detail";
  if (!r.limited) return "Balanced to that point";
  return r.gains[0] === 1 && r.gains[1] === 1 ? "No red left there to balance. Try sand, a tank or bubbles nearer the camera" : "Balanced as far as is safe: that spot has little red left";
}
export const NEUTRAL_HINT = "Tap something that should be white or grey";

/** The Water colour slider's value text. */
export function waterHueLabel(v: number): string {
  const x = Math.round(v);
  return x === 0 ? "Auto" : x < 0 ? `Teal ${-x}` : `Blue ${x}`;
}

/** The Noise reduction choices (engine NR: temporal, before the colour correction). */
export const NOISE_CHOICES: { id: NoiseReduction; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "auto", label: "Auto" },
  { id: "strong", label: "Strong" },
];
export const NOISE_HINT = "Averages grain over time before the colour is corrected; Auto only acts on noisy clips, moving subjects are left alone";

/** The "Subject pop" switch stays hidden until its mask tracking is clean (the engine path ships off; `?pop=1` forces it on for checks). */
export const SUBJECT_POP_UI = true;

/** Labs: `?labs=1` shows the hidden Subject pop switch (marked Beta) for people trying it out. */
export function subjectPopVisible(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return SUBJECT_POP_UI || new URLSearchParams(search).get("labs") === "1";
}

export const COLOUR_PRESETS: Chip<ScenePreset>[] = SCENE_PRESETS.map((p) => ({ id: p.id, label: p.id === "reef" ? "Reef" : p.label, hint: p.hint }));

export const DEFAULT_COLOUR: ColourState = {
  enabled: true,
  preset: DEFAULT_SETTINGS.preset,
  strength: (DEFAULT_SETTINGS.intensity / INTENSITY_MAX) * 100,
  look: DEFAULT_SETTINGS.look,
  saturation: DEFAULT_SETTINGS.saturation,
  clarity: DEFAULT_SETTINGS.clarity,
  veil: DEFAULT_SETTINGS.veil,
  subjectPop: false,
  popStrength: 50,
  popWarmth: 50,
  seabed: 60,
  vivid: true,
  noise: "auto",
  neutral: null,
  waterHue: 0,
};

/** Where an explicit Vivid choice (the main-panel switch) is remembered. */
export const VIVID_PREF_KEY = "studio.vivid";

/**
 * Vivid at start-up: `?vivid=0|1` overrides; otherwise a saved explicit choice
 * ("0" / "1" under VIVID_PREF_KEY); otherwise on.
 */
export function initialVivid(search: string, saved: string | null): boolean {
  const q = new URLSearchParams(search).get("vivid");
  if (q === "0" || q === "1") return q === "1";
  if (saved === "0" || saved === "1") return saved === "1";
  return DEFAULT_COLOUR.vivid !== false;
}

/** The colour style picker: Natural (no look), Vivid (the default; carries the cobalt water-hue map at WATER_HUE.amount), Blue water (the map in full). */
export type ColourStyle = "natural" | "vivid" | "blue";
export const COLOUR_STYLES: Chip<ColourStyle>[] = [
  { id: "natural", label: "Natural", hint: "Natural correction only" },
  { id: "vivid", label: "Vivid", hint: "Deep blue water, white sand, rich blacks, bright sun" },
  { id: "blue", label: "Blue water", hint: "The cobalt water in full: all water one blue, warm subjects, deeper shadows" },
];

export function styleOf(c: { vivid?: boolean; blue?: boolean }): ColourStyle {
  return c.vivid ? (c.blue ? "blue" : "vivid") : "natural";
}

/** The ColourState flags for a style. */
export function styleFlags(id: ColourStyle): { vivid: boolean; blue: boolean } {
  return { vivid: id !== "natural", blue: id === "blue" };
}

/**
 * Style at start-up: `?style=natural|vivid|blue` overrides, then `?vivid=0|1`;
 * otherwise a saved explicit choice ("0" / "1" / "blue" under VIVID_PREF_KEY); otherwise Vivid.
 */
export function initialStyle(search: string, saved: string | null): ColourStyle {
  const q = new URLSearchParams(search).get("style");
  if (q === "natural" || q === "vivid" || q === "blue") return q;
  if (saved === "blue" && new URLSearchParams(search).get("vivid") === null) return "blue";
  return initialVivid(search, saved) ? "vivid" : "natural";
}

/** Remembers an explicit style choice (Vivid's key, so older builds still read "0" / "1"). */
export function saveStyle(id: ColourStyle): void {
  try { localStorage.setItem(VIVID_PREF_KEY, id === "blue" ? "blue" : id === "vivid" ? "1" : "0"); } catch { /* private mode */ }
}

/** Reads the saved Vivid choice (null when none, or storage is unavailable). */
export function savedVivid(): string | null {
  try { return typeof localStorage === "undefined" ? null : localStorage.getItem(VIVID_PREF_KEY); } catch { return null; }
}

/** Remembers an explicit Vivid choice from the switch. */
export function saveVivid(on: boolean): void {
  try { localStorage.setItem(VIVID_PREF_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/** A segment's colour settings (Split on the timeline): everything but the on/off, which stays global. */
export type ColourLook = Omit<ColourState, "enabled">;

export function lookOf(c: ColourState): ColourLook {
  const { enabled: _enabled, ...look } = c;
  return look;
}

/** `clip`: the open file's key (clipKeyOf); a tap solved on another clip is left out. */
export function colourSettings(c: ColourLook, clip?: string): UserSettings {
  const pick = neutralFor(c, clip);
  const hue = Math.min(100, Math.max(-100, c.waterHue ?? 0)) / 100;
  return {
    ...DEFAULT_SETTINGS,
    preset: c.preset,
    intensity: (Math.min(100, Math.max(0, c.strength)) / 100) * INTENSITY_MAX,
    look: c.look,
    saturation: c.saturation,
    clarity: c.clarity,
    veil: c.veil,
    subjectPop: !!c.subjectPop,
    subjectPopStrength: Math.min(100, Math.max(0, c.popStrength ?? DEFAULT_COLOUR.popStrength ?? 50)) / 100,
    subjectPopWarmth: Math.min(100, Math.max(0, c.popWarmth ?? DEFAULT_COLOUR.popWarmth ?? 0)) / 100,
    // Seabed recovery rides on Vivid (one look: deep blue water, white sand), no control of its own.
    seabed: c.vivid ? Math.min(100, Math.max(0, c.seabed ?? DEFAULT_COLOUR.seabed ?? 0)) / 100 : 0,
    vivid: c.vivid ? 1 : 0,
    blue: c.vivid && c.blue ? 1 : 0,
    noiseReduction: c.noise ?? DEFAULT_COLOUR.noise ?? "auto",
    ...(pick ? { wbTap: [pick.r, pick.b] as [number, number] } : {}),
    ...(hue ? { waterHue: hue } : {}),
  };
}

// ---------------------------------------------------------------- stabilise

/**
 * Motion Fix's DEFAULT_PARAMS, copied so the tool UI doesn't pull the motion
 * solver into the first-load bundle (test/tools.test.ts keeps them equal).
 */
const STAB_DEFAULTS: StabilizeParams = { smoothing: 0.8, maxCrop: 0.1 };

export type StabPreset = "gentle" | "steady" | "locked";
export type StabiliseState = {
  enabled: boolean;
  preset: StabPreset | "custom";
  /** Main slider, 0..100 → path smoothing 0..1. */
  strength: number;
  /** Advanced: largest crop the path may use, 0.05..0.3. */
  maxCrop: number;
  /** Advanced (gyro path): roll the virtual camera so the horizon stays level. */
  keepLevel: boolean;
  /** Advanced (gyro path): medium in front of the lens port; auto = the clip's picture check. */
  lens: "auto" | "air" | "water";
  /** Advanced: use visual tracking even when the file carries gyro data. */
  visual: boolean;
  /** Gyro path: also track the picture and remove heave / sway the gyro cannot see (Motion Fix hybrid). */
  bobbing: boolean;
};

export const STAB_PRESETS: (Chip<StabPreset> & { strength: number; maxCrop: number })[] = [
  { id: "gentle", label: "Gentle", hint: "Keeps intentional motion, least crop", strength: 55, maxCrop: 0.06 },
  { id: "steady", label: "Steady", hint: "Balanced default", strength: Math.round(STAB_DEFAULTS.smoothing * 100), maxCrop: STAB_DEFAULTS.maxCrop },
  { id: "locked", label: "Locked", hint: "Tripod-like, crops more", strength: 100, maxCrop: 0.25 },
];

export const DEFAULT_STABILISE: StabiliseState = { enabled: false, preset: "steady", strength: Math.round(STAB_DEFAULTS.smoothing * 100), maxCrop: STAB_DEFAULTS.maxCrop, keepLevel: false, lens: "auto", visual: false, bobbing: true };

/** Motion Fix v3's gyro default smoothing (DEFAULT_GYRO_PARAMS.smoothing; test/tools.test.ts keeps it equal). */
export const GYRO_DEFAULT_SMOOTHING = 0.6;

/**
 * Visual-path parameters (Motion Fix v2): Strength 0..100 → smoothing 0..1.
 */
export function stabiliseParams(s: Pick<StabiliseState, "strength" | "maxCrop">): StabilizeParams {
  return { smoothing: Math.min(1, Math.max(0, s.strength / 100)), maxCrop: Math.min(0.3, Math.max(0.02, s.maxCrop)) };
}

/**
 * Solve parameters for either path. One Strength slider serves both: the
 * gyro path's own default (0.6) sits where the visual default (0.8) does,
 * so "Steady" means each path's tuned default and 100 is full smoothing on
 * both. `output` is rectilinear when Dewarp is on (the gyro warp then
 * undoes the lens itself), else the camera's lens look.
 */
export function solveParams(s: StabiliseState, mode: "gyro" | "visual", output: "lens" | "rectilinear"): SolveParams {
  const v = stabiliseParams(s);
  const k = STAB_DEFAULTS.smoothing;
  const gyroSmoothing = v.smoothing <= k ? (v.smoothing / k) * GYRO_DEFAULT_SMOOTHING : GYRO_DEFAULT_SMOOTHING + ((v.smoothing - k) / (1 - k)) * (1 - GYRO_DEFAULT_SMOOTHING);
  return {
    smoothing: mode === "gyro" ? gyroSmoothing : v.smoothing,
    maxCrop: v.maxCrop,
    horizonLock: s.keepLevel ? 1 : 0,
    output,
    medium: s.lens,
    hybrid: s.bobbing === false ? 0 : 1,
  };
}

export function applyStabPreset(s: StabiliseState, id: StabPreset): StabiliseState {
  const p = STAB_PRESETS.find((x) => x.id === id)!;
  return { ...s, preset: id, strength: p.strength, maxCrop: p.maxCrop };
}

// ---------------------------------------------------------------- dewarp

export type DewarpState = {
  enabled: boolean;
  profile: string;
  /** Main slider, 0..100 → correction strength. */
  strength: number;
  projection: Projection;
  /** Auto-fit the zoom so no black corners show; else `zoom`. */
  autoZoom: boolean;
  zoom: number;
  /** Diagonal FOV override for the generic profile (degrees). */
  fovDeg: number;
};

export const DEWARP_PROFILES: Chip<string>[] = [
  { id: "osmo-action-wide", label: "Osmo Wide", hint: PROFILES["osmo-action-wide"]?.label ?? "" },
  { id: "osmo-action-wide-raw", label: "Osmo Wide · raw", hint: PROFILES["osmo-action-wide-raw"]?.label ?? "" },
  { id: "osmo-action-ultra-wide", label: "Osmo Ultra Wide", hint: PROFILES["osmo-action-ultra-wide"]?.label ?? "" },
  { id: "gopro-wide-16x9", label: "GoPro Wide", hint: PROFILES["gopro-wide-16x9"]?.label ?? "" },
  { id: "gopro-wide-4x3", label: "GoPro Wide 4:3", hint: PROFILES["gopro-wide-4x3"]?.label ?? "" },
  { id: "phone-ultra-wide", label: "Phone 0.5×", hint: PROFILES["phone-ultra-wide"]?.label ?? "" },
  { id: "none", label: "Already straight", hint: PROFILES["none"]?.label ?? "" },
  { id: "generic-fisheye", label: "Other", hint: PROFILES["generic-fisheye"]?.label ?? "" },
];

/** Chip for the lens calibration the camera wrote into this clip (DJI, GoPro HERO11+). */
export const FROM_FILE_CHIP: Chip<string> = { id: FROM_FILE, label: "From clip", hint: "The lens data your camera wrote into this clip" };
export { FROM_FILE };

/** Camera chips for a clip: the clip's own lens first when it carries one. */
export function dewarpChips(camera: CameraInfo | null | undefined): Chip<string>[] {
  return camera?.lens ? [FROM_FILE_CHIP, ...DEWARP_PROFILES] : DEWARP_PROFILES;
}

/**
 * The profile the detector suggests for this clip (null: detection not in
 * yet, or a suggestion the chips don't offer; keep the user's pick). A clip
 * whose metadata names no lens starts straight (see UNRECOGNISED_PROFILE).
 */
export function detectedProfile(camera: CameraInfo | null | undefined): string | null {
  if (!camera) return null;
  const id = camera.profileId;
  if (!id) return UNRECOGNISED_PROFILE;
  if (id === FROM_FILE) return camera?.lens ? FROM_FILE : null;
  return id in PROFILES && DEWARP_PROFILES.some((c) => c.id === id) ? id : null;
}

/** The Dewarp status line for a clip without camera metadata, else null. */
export function unrecognisedCameraHint(c: CameraInfo | null | undefined): string | null {
  return c && !c.brand && !c.profileId ? UNRECOGNISED_HINT : null;
}

/** "GoPro HERO12 Black · Wide" style label, or null when nothing was detected. */
export function cameraLabel(c: CameraInfo | null | undefined): string | null {
  if (!c?.brand) return null;
  const who = [c.brand, c.model].filter(Boolean).join(" ");
  return c.lensMode ? `${who} · ${c.lensMode}` : who;
}

export function profileDefaults(id: string): Pick<DewarpState, "profile" | "strength" | "fovDeg"> {
  if (id === FROM_FILE) return { profile: FROM_FILE, strength: 100, fovDeg: 150 };
  const p = PROFILES[id] ?? PROFILES[DEFAULT_PROFILE];
  return { profile: id in PROFILES ? id : DEFAULT_PROFILE, strength: Math.round((p.strength ?? 1) * 100), fovDeg: p.fovDeg };
}

export const DEFAULT_DEWARP: DewarpState = {
  enabled: false,
  ...profileDefaults(DEFAULT_PROFILE),
  projection: "rectilinear",
  autoZoom: true,
  zoom: 1,
};

/** True when the lens profile's aspect differs from the clip's (the calibration may not fit). */
export function profileAspectMismatch(id: string, codedW: number, codedH: number): boolean {
  if (id === FROM_FILE) return false;
  const lens = PROFILES[id]?.lens;
  if (!lens || !codedW || !codedH) return false;
  return Math.abs(codedW / codedH - lens.width / lens.height) > 0.02;
}

// ---------------------------------------------------------------- all

export type ToolsState = { colour: ColourState; stabilise: StabiliseState; dewarp: DewarpState };
export const DEFAULT_TOOLS: ToolsState = { colour: DEFAULT_COLOUR, stabilise: DEFAULT_STABILISE, dewarp: DEFAULT_DEWARP };

export function enabledTools(t: ToolsState): ToolId[] {
  return TOOL_ORDER.filter((id) => t[id].enabled);
}

/** Order the processing runs in (matches the render graph): geometry first, colour last. */
export function processingChain(t: ToolsState, colourSegments = 1): string {
  const parts: string[] = [];
  if (t.dewarp.enabled) parts.push("Dewarp");
  if (t.stabilise.enabled) parts.push("Stabilise");
  if (t.colour.enabled) parts.push(colourSegments > 1 ? `Colour (${colourSegments} segments)` : "Colour");
  return parts.length ? parts.join(" → ") : "Original";
}

/** Output file suffix for the enabled tools. */
export function exportSuffix(t: ToolsState): string {
  const parts = [t.dewarp.enabled && "dewarped", t.stabilise.enabled && "stabilised", t.colour.enabled && "colour"].filter(Boolean);
  return parts.length ? parts.join("-") : "copy";
}
