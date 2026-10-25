// The three tools as the UI sees them: on/off, a preset, one Strength
// (0..100 on screen) and the advanced rest — and the pure mapping from that
// state to what each engine reads. No React, no GPU: unit-tested.

import { DEFAULT_SETTINGS, INTENSITY_MAX, SCENE_PRESETS, type ScenePreset, type UserSettings } from "../../../aqua-fix/src/engine/params.ts";
import type { StabilizeParams } from "../../../motion-fix/src/lib/stabilize.ts";
import type { Projection } from "../../../dewarp/src/fisheye.ts";
import { DEFAULT_PROFILE, PROFILES } from "../../../dewarp/src/profiles.ts";

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
};

export const STAB_PRESETS: (Chip<StabPreset> & { strength: number; maxCrop: number })[] = [
  { id: "gentle", label: "Gentle", hint: "Keeps intentional motion, least crop", strength: 55, maxCrop: 0.08 },
  { id: "steady", label: "Steady", hint: "Balanced default", strength: Math.round(STAB_DEFAULTS.smoothing * 100), maxCrop: STAB_DEFAULTS.maxCrop },
  { id: "locked", label: "Locked", hint: "Tripod-like, crops more", strength: 100, maxCrop: 0.25 },
];

export const DEFAULT_STABILISE: StabiliseState = { enabled: false, preset: "steady", strength: Math.round(STAB_DEFAULTS.smoothing * 100), maxCrop: STAB_DEFAULTS.maxCrop };

export function stabiliseParams(s: StabiliseState): StabilizeParams {
  return { smoothing: Math.min(1, Math.max(0, s.strength / 100)), maxCrop: Math.min(0.3, Math.max(0.02, s.maxCrop)) };
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
  { id: "osmo-action-wide", label: "Osmo Wide", hint: PROFILES["osmo-action-wide"].label },
  { id: "osmo-action-wide-raw", label: "Osmo Wide · raw", hint: PROFILES["osmo-action-wide-raw"].label },
  { id: "osmo-action-ultra-wide", label: "Osmo Ultra Wide", hint: PROFILES["osmo-action-ultra-wide"].label },
  { id: "gopro-hero11-wide", label: "GoPro Wide", hint: PROFILES["gopro-hero11-wide"].label },
  { id: "generic-fisheye", label: "Other", hint: PROFILES["generic-fisheye"].label },
];

export function profileDefaults(id: string): Pick<DewarpState, "profile" | "strength" | "fovDeg"> {
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
