// The three tools as the UI sees them: on/off, a preset, one Strength
// (0..100 on screen) and the advanced rest — and the pure mapping from that
// state to what each engine reads. No React, no GPU: unit-tested.

import { DEFAULT_SETTINGS, INTENSITY_MAX, SCENE_PRESETS, type ScenePreset, type UserSettings } from "../../../aqua-fix/src/engine/params.ts";
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
};

export const COLOUR_PRESETS: Chip<ScenePreset>[] = SCENE_PRESETS.map((p) => ({ id: p.id, label: p.id === "reef" ? "Reef" : p.label, hint: p.hint }));

export const DEFAULT_COLOUR: ColourState = {
  enabled: true,
  preset: DEFAULT_SETTINGS.preset,
  strength: (DEFAULT_SETTINGS.intensity / INTENSITY_MAX) * 100,
  look: DEFAULT_SETTINGS.look,
  saturation: DEFAULT_SETTINGS.saturation,
  clarity: DEFAULT_SETTINGS.clarity,
  veil: DEFAULT_SETTINGS.veil,
};

export function colourSettings(c: ColourState): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    preset: c.preset,
    intensity: (Math.min(100, Math.max(0, c.strength)) / 100) * INTENSITY_MAX,
    look: c.look,
    saturation: c.saturation,
    clarity: c.clarity,
    veil: c.veil,
  };
}

// ---------------------------------------------------------------- stabilise

/**
 * Motion Fix's DEFAULT_PARAMS, copied so the tool UI doesn't pull the motion
 * solver into the first-load bundle (test/tools.test.ts keeps them equal).
 */
const STAB_DEFAULTS: StabilizeParams = { smoothing: 0.8, maxCrop: 0.15 };

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
  { id: "gentle", label: "Gentle", hint: "Keeps intentional motion, least crop", strength: 55, maxCrop: 0.08 },
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
export function processingChain(t: ToolsState): string {
  const parts: string[] = [];
  if (t.dewarp.enabled) parts.push("Dewarp");
  if (t.stabilise.enabled) parts.push("Stabilise");
  if (t.colour.enabled) parts.push("Colour");
  return parts.length ? parts.join(" → ") : "Original";
}

/** Output file suffix for the enabled tools. */
export function exportSuffix(t: ToolsState): string {
  const parts = [t.dewarp.enabled && "dewarped", t.stabilise.enabled && "stabilised", t.colour.enabled && "colour"].filter(Boolean);
  return parts.length ? parts.join("-") : "copy";
}
