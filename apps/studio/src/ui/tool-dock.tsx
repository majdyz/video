import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  COLOUR_PRESETS,
  DEFAULT_COLOUR,
  DEFAULT_STABILISE,
  STAB_PRESETS,
  applyStabPreset,
  cameraLabel,
  dewarpChips,
  profileDefaults,
  saveStyle,
  styleFlags,
  styleOf,
  COLOUR_STYLES,
  NOISE_CHOICES,
  NOISE_HINT,
  SHOT_IN_HINT,
  SHOT_IN_LABEL,
  waterHueLabel,
  type ToolId,
  type ToolsState,
} from "../pipeline/tools.ts";
import type { FootageChoice } from "../pipeline/footage.ts";
import { FOOTAGE_SHORT } from "./footage";
import type { FootageStatus, StabStatus } from "../pipeline/studio.ts";
import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";
import type { NeutralControls, SubjectControls } from "./panels";
import { Chips, Slider } from "./controls";
import { StyleThumbs, type StyleThumbSource } from "./style-thumbs";
import { IconCheck, IconPause, IconPlay, IconReset } from "./icons";

/**
 * One adjustable thing of a tool, as a bubble in the phone's option row. A bubble with a slider or choices opens
 * one bar above the row (Instagram's Adjust); a toggle flips on tap; an action runs.
 */
type Param = {
  id: string;
  label: string;
  /** Short state under the label ("50", "Auto", "On"). */
  value?: string;
  /** One of the rarer options (after the main ones in the row). */
  more?: boolean;
  slider?: { value: number; min: number; max: number; def?: number; format?: (v: number) => string; onChange: (v: number) => void };
  choices?: { items: { id: string; label: string; hint?: string }[]; value: string; onChange: (id: string) => void; note?: string };
  /** A slider under the choices, in the same bar (Colour → Style carries Strength). */
  under?: { label: string } & NonNullable<Param["slider"]>;
  toggle?: { on: boolean; onChange: (v: boolean) => void };
  action?: () => void;
  /** An action that is a mode (tap-to-neutral waiting for a tap): shown lit while on. */
  lit?: boolean;
  disabled?: boolean;
};

type Setter = (fn: (t: ToolsState) => ToolsState) => void;

/** Colour's Style option (Natural / Vivid / Blue water). */
const STYLE_ID = "vivid";

const pct = (v: number) => String(Math.round(v));

function colourParams(tools: ToolsState, set: Setter, footage: FootageStatus | null, onFootage: ((c: FootageChoice) => void) | null, neutral: NeutralControls | null): Param[] {
  const c = tools.colour;
  const up = (patch: Partial<typeof c>) => set((t) => ({ ...t, colour: { ...t.colour, ...patch, enabled: true } }));
  const scene = COLOUR_PRESETS.find((p) => p.id === c.preset);
  const noise = c.noise ?? DEFAULT_COLOUR.noise ?? "auto";
  // Style and Strength are one panel (owner, 13 Nov): which look, and how much of the correction, in one tap.
  const strength: NonNullable<Param["under"]> = { label: "Strength", value: c.strength, min: 0, max: 100, def: DEFAULT_COLOUR.strength, onChange: (v) => up({ strength: v }) };
  const STYLE: Param = { id: STYLE_ID, label: "Style", value: `${COLOUR_STYLES.find((s) => s.id === styleOf(c))?.label ?? "Vivid"} ${pct(c.strength)}`, under: strength, choices: { items: COLOUR_STYLES, value: styleOf(c), onChange: (id) => { const s = id as ReturnType<typeof styleOf>; saveStyle(s); up(styleFlags(s)); } } };
  const ps: Param[] = [
    // Style (the main creative choice) is the one main option: the bar Colour opens on, three pictures of the frame (StyleThumbs) over the Strength slider.
    STYLE,
    // Behind More: the manual overrides. What water it was shot in (a correction hint; Auto = the engine's own reading), a white point (tap the picture) and the water's tint.
    { id: "scene", label: SHOT_IN_LABEL, more: true, value: scene?.label ?? "Auto", choices: { items: COLOUR_PRESETS, value: c.preset, onChange: (id) => up({ preset: id as typeof c.preset }), note: SHOT_IN_HINT } },
    ...(neutral ? [{ id: "white", label: "White point", more: true, value: neutral.active ? "Tap…" : neutral.pick ? "Set" : "Auto", action: neutral.onToggle, lit: neutral.active } as Param] : []),
    { id: "water", label: "Water tint", more: true, value: waterHueLabel(c.waterHue ?? 0), slider: { value: c.waterHue ?? 0, min: -100, max: 100, def: 0, format: waterHueLabel, onChange: (v) => up({ waterHue: Math.abs(v) < 4 ? 0 : v }) } },
    { id: "sat", label: "Saturation", more: true, value: `${Math.round(c.saturation * 100)}%`, slider: { value: c.saturation * 100, min: 0, max: 200, def: 100, format: (v) => `${Math.round(v)}%`, onChange: (v) => up({ saturation: v / 100 }) } },
    { id: "clarity", label: "Clarity", more: true, value: pct(c.clarity * 100), slider: { value: c.clarity * 100, min: 0, max: 100, def: DEFAULT_COLOUR.clarity * 100, onChange: (v) => up({ clarity: v / 100 }) } },
    { id: "haze", label: "Haze", more: true, value: pct(c.veil * 100), slider: { value: c.veil * 100, min: 0, max: 120, def: DEFAULT_COLOUR.veil * 100, onChange: (v) => up({ veil: v / 100 }) } },
    { id: "noise", label: "Noise", more: true, value: NOISE_CHOICES.find((n) => n.id === noise)?.label ?? "Auto", choices: { items: NOISE_CHOICES, value: noise, onChange: (id) => up({ noise: id as typeof noise }), note: NOISE_HINT } },
  ];
  if (footage && onFootage) {
    const detected = footage.info?.detected ?? "standard";
    ps.push({
      id: "footage", label: "Footage", more: true, value: footage.choice === "auto" ? "Auto" : FOOTAGE_SHORT[footage.choice],
      choices: {
        items: [{ id: "auto", label: `Auto · ${FOOTAGE_SHORT[detected]}` }, ...(["standard", "dlogm", "gplog", "hlg", "pq", "applelog", "wide"] as const).map((id) => ({ id, label: FOOTAGE_SHORT[id] }))],
        value: footage.choice, onChange: (id) => onFootage(id as FootageChoice),
        note: footage.active === "standard" ? "What the camera recorded. Standard is used as it is" : `What the camera recorded. ${FOOTAGE_SHORT[footage.active]} is turned into standard colour first`,
      },
    });
  }
  ps.push({ id: "reset", label: "Reset", more: true, action: () => set((t) => ({ ...t, colour: { ...DEFAULT_COLOUR, enabled: t.colour.enabled, vivid: t.colour.vivid, blue: t.colour.blue } })) });
  return ps;
}

function stabParams(tools: ToolsState, set: Setter, stab: StabStatus, onMotionLog: (() => void) | null): Param[] {
  const s = tools.stabilise;
  const up = (patch: Partial<typeof s>) => set((t) => ({ ...t, stabilise: { ...t.stabilise, ...patch, enabled: true } }));
  const gyro = stab.info?.mode === "gyro";
  const ps: Param[] = [
    { id: "strength", label: "Strength", value: pct(s.strength), slider: { value: s.strength, min: 0, max: 100, def: DEFAULT_STABILISE.strength, onChange: (v) => up({ strength: v, preset: "custom" }) } },
    { id: "preset", label: "Style", value: STAB_PRESETS.find((p) => p.id === s.preset)?.label ?? "Custom", choices: { items: STAB_PRESETS, value: s.preset, onChange: (id) => set((t) => ({ ...t, stabilise: { ...applyStabPreset(t.stabilise, id as (typeof STAB_PRESETS)[number]["id"]), enabled: true } })) } },
    { id: "crop", label: "Max crop", more: true, value: `${Math.round(s.maxCrop * 100)}%`, slider: { value: s.maxCrop * 100, min: 4, max: 30, def: DEFAULT_STABILISE.maxCrop * 100, format: (v) => `${Math.round(v)}%`, onChange: (v) => up({ maxCrop: v / 100, preset: "custom" }) } },
  ];
  if (gyro && stab.info?.canBobbing) ps.push({ id: "bob", label: "Bobbing", value: s.bobbing === false ? "Gyro only" : "Remove", choices: { items: [{ id: "on", label: "Remove" }, { id: "off", label: "Gyro only" }], value: s.bobbing === false ? "off" : "on", onChange: (v) => up({ bobbing: v === "on" }), note: "Heave and sway from fin kicks, which the gyro can't see" } });
  if (stab.info?.canSwitch) ps.push({ id: "source", label: "Motion", more: true, value: s.visual ? "Visual" : "Gyro", choices: { items: [{ id: "gyro", label: "Gyro data" }, { id: "visual", label: "Visual tracking" }], value: s.visual ? "visual" : "gyro", onChange: (v) => up({ visual: v === "visual" }) } });
  if (gyro) ps.push({ id: "lens", label: "Lens port", more: true, value: s.lens === "auto" ? "Auto" : s.lens === "water" ? "Underwater" : "Air", choices: { items: [{ id: "auto", label: "Auto" }, { id: "air", label: "Air" }, { id: "water", label: "Underwater" }], value: s.lens, onChange: (v) => up({ lens: v as typeof s.lens }), note: "A flat port underwater changes the lens" } });
  if (gyro && stab.info?.canLevel) ps.push({ id: "level", label: "Keep level", more: true, value: s.keepLevel ? "On" : "Off", toggle: { on: s.keepLevel, onChange: (v) => up({ keepLevel: v }) } });
  if (onMotionLog) ps.push({ id: "log", label: stab.motionLog ? "Motion log ✓" : "Motion log", more: true, action: onMotionLog });
  ps.push({ id: "reset", label: "Reset", more: true, action: () => set((t) => ({ ...t, stabilise: { ...DEFAULT_STABILISE, enabled: t.stabilise.enabled, visual: t.stabilise.visual, bobbing: t.stabilise.bobbing } })) });
  return ps;
}

function dewarpParams(tools: ToolsState, set: Setter, camera: CameraInfo | null): Param[] {
  const d = tools.dewarp;
  const up = (patch: Partial<typeof d>) => set((t) => ({ ...t, dewarp: { ...t.dewarp, ...patch, enabled: true } }));
  const chips = dewarpChips(camera);
  const ps: Param[] = [
    { id: "strength", label: "Strength", value: pct(d.strength), slider: { value: d.strength, min: 0, max: 100, def: profileDefaults(d.profile).strength, onChange: (v) => up({ strength: v }) } },
    { id: "camera", label: "Camera", value: chips.find((c) => c.id === d.profile)?.label ?? cameraLabel(camera) ?? "Pick", choices: { items: chips, value: d.profile, onChange: (id) => up({ ...profileDefaults(id) }) } },
    ...(d.profile === "phone-ultra-wide" ? [] : [{ id: "proj", label: "Projection", more: true, value: d.projection === "rectilinear" ? "Straight" : "Natural", choices: { items: [{ id: "rectilinear", label: "Straight lines" }, { id: "stereographic", label: "Natural shapes" }], value: d.projection, onChange: (v) => up({ projection: v as typeof d.projection }) } } as Param]),
    { id: "fit", label: "Auto-fit", more: true, value: d.autoZoom ? "On" : "Off", toggle: { on: d.autoZoom, onChange: (v) => up({ autoZoom: v }) } },
  ];
  if (!d.autoZoom) ps.push({ id: "zoom", label: "Zoom", more: true, value: `${d.zoom.toFixed(2)}×`, slider: { value: d.zoom * 100, min: 60, max: 200, def: 100, format: (v) => `${(v / 100).toFixed(2)}×`, onChange: (v) => up({ zoom: v / 100 }) } });
  if (d.profile === "generic-fisheye") ps.push({ id: "fov", label: "Lens FOV", more: true, value: `${Math.round(d.fovDeg)}°`, slider: { value: d.fovDeg, min: 90, max: 200, def: 150, format: (v) => `${Math.round(v)}°`, onChange: (v) => up({ fovDeg: v }) } });
  ps.push({ id: "reset", label: "Reset", more: true, action: () => set((t) => ({ ...t, dewarp: { ...t.dewarp, ...profileDefaults(t.dewarp.profile), projection: "rectilinear", autoZoom: true, zoom: 1 } })) });
  return ps;
}

function subjectParams(tools: ToolsState, set: Setter, subjects: SubjectControls, photo: boolean): Param[] {
  const c = tools.colour;
  const ps: Param[] = [
    { id: "pop", label: "Pop", value: pct(c.popStrength ?? DEFAULT_COLOUR.popStrength ?? 50), slider: { value: c.popStrength ?? DEFAULT_COLOUR.popStrength ?? 50, min: 0, max: 100, def: DEFAULT_COLOUR.popStrength, format: (v) => (v < 25 ? "Subtle" : v > 75 ? "Strong" : String(Math.round(v))), onChange: (v) => set((t) => ({ ...t, colour: { ...t.colour, popStrength: v } })) } },
  ];
  const warm = c.popWarmth ?? DEFAULT_COLOUR.popWarmth ?? 0;
  ps.push({ id: "warm", label: "Warmth", value: warm ? pct(warm) : "Off", slider: { value: warm, min: 0, max: 100, def: DEFAULT_COLOUR.popWarmth, format: (v) => (v < 1 ? "Off" : String(Math.round(v))), onChange: (v) => set((t) => ({ ...t, colour: { ...t.colour, popWarmth: v } })) } });
  if (!photo && subjects.ai) ps.push({ id: "ai", label: "Detection", value: subjects.ai.on ? "AI" : "Basic", toggle: { on: subjects.ai.on, onChange: subjects.ai.onToggle } });
  ps.push({ id: "reset", label: "Reset picks", action: subjects.onReset, disabled: !subjects.corrections });
  return ps;
}

/**
 * The phone's tool controls, floating over the picture: the selected option's one bar (a slider or a row of
 * choices) and the tool's options as one scrolling row of bubbles (on/off first, the rarer ones last). Nothing here takes picture space: it sits on a soft scrim at the bottom of the full-screen preview.
 */
export function ToolDock({ pane, tools, setTools, stab, camera, photo, footage, onFootage, onMotionLog, subjects, neutral, disabled, status, onClose, playback, styleThumbs }: {
  /** Colour → Style as pictures of the frame on screen; without it, the plain choices. */
  styleThumbs?: StyleThumbSource | null;
  /** Colour: tap-to-neutral (the "White point" bubble). */
  neutral?: NeutralControls | null;
  onClose: () => void;
  /** Video: play / pause from the bubbles (the timeline steps aside while a tool is open; a tap on the picture may pick subjects). */
  playback?: { playing: boolean; toggle: () => void } | null;
  pane: ToolId | "subjects";
  tools: ToolsState;
  setTools: Setter;
  stab: StabStatus;
  camera: CameraInfo | null;
  photo: boolean;
  footage: FootageStatus | null;
  onFootage: ((c: FootageChoice) => void) | null;
  onMotionLog: (() => void) | null;
  subjects: SubjectControls;
  disabled: boolean;
  /** The tool's live state ("Scene-locked", "Analysing motion 40%"), over the bubbles. */
  status: ReactNode;
}) {
  const params = pane === "colour" ? colourParams(tools, setTools, footage, onFootage, neutral ?? null)
    : pane === "stabilise" ? stabParams(tools, setTools, stab, onMotionLog)
    : pane === "dewarp" ? dewarpParams(tools, setTools, camera)
    : subjectParams(tools, setTools, subjects, photo);
  const enabled = pane === "subjects" ? !!tools.colour.subjectPop && tools.colour.enabled : tools[pane].enabled;
  const setEnabled = (v: boolean) => setTools((t) => (pane === "subjects" ? { ...t, colour: { ...t.colour, subjectPop: v, enabled: v || t.colour.enabled } } : { ...t, [pane]: { ...t[pane], enabled: v } }));
  const [sel, setSel] = useState<string>(pane === "colour" ? STYLE_ID : "strength");
  const rowRef = useRef<HTMLDivElement>(null);
  // A new tool: its first bar (Strength / Pop), the row scrolled back to its start.
  useEffect(() => { setSel(params[0]?.id ?? ""); rowRef.current?.scrollTo({ left: 0 }); }, [pane]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = params.find((p) => p.id === sel && (p.slider || p.choices));
  const main = params.filter((p) => !p.more), extra = params.filter((p) => p.more);
  // The rarely used options sit behind "More" (Fable review, 13 Nov: Colour had 14 bubbles in a row 2.8 screens wide):
  // open while one of them is selected, and closed again with a new tool.
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pane]);
  const showExtra = moreOpen || extra.some((p) => p.id === current?.id);

  const bubble = (p: Param) => {
    const on = p.id === current?.id;
    const click = () => {
      if (p.toggle) p.toggle.onChange(!p.toggle.on);
      else if (p.action) p.action();
      else setSel(p.id);
    };
    return (
      <button key={p.id} type="button" className={`bubble${on ? " is-on" : ""}${p.toggle?.on || p.lit ? " is-lit" : ""}${p.more ? " bubble--more" : ""}`} onClick={click} disabled={disabled || p.disabled || (!enabled && !p.toggle && !p.action)}
        aria-pressed={p.toggle ? p.toggle.on : p.lit !== undefined ? p.lit : p.slider || p.choices ? on : undefined}>
        <span className="bubble__label">{p.id === "reset" ? <><IconReset size={13} /> {p.label}</> : p.label}</span>
        {p.value !== undefined && <span className="bubble__value">{p.value}</span>}
      </button>
    );
  };

  return (
    <div className={`tool-dock${enabled ? "" : " is-off"}`}>
      <div className="tool-dock__bar">
        {!enabled ? (
          <button type="button" className="tool-dock__enable" onClick={() => setEnabled(true)} disabled={disabled}>Turn {pane === "subjects" ? "Subject pop" : pane === "colour" ? "Colour" : pane === "stabilise" ? "Stabilise" : "Dewarp"} on</button>
        ) : current?.slider ? (
          <Slider label={current.label} value={current.slider.value} min={current.slider.min} max={current.slider.max} defaultValue={current.slider.def} format={current.slider.format} onChange={current.slider.onChange} disabled={disabled} />
        ) : current?.choices ? (
          <>
            {pane === "colour" && current.id === STYLE_ID && styleThumbs ? (
              <StyleThumbs items={COLOUR_STYLES} value={styleOf(tools.colour)} onChange={current.choices.onChange} disabled={disabled} source={styleThumbs} />
            ) : (
              <div className="tool-dock__choices">
                <Chips label={current.label} items={current.choices.items} value={current.choices.value} onChange={current.choices.onChange} disabled={disabled} />
                {current.choices.note && <p className="tool-dock__note">{current.choices.note}</p>}
              </div>
            )}
            {current.under && (
              <div className="tool-dock__under">
                <Slider label={current.under.label} value={current.under.value} min={current.under.min} max={current.under.max} defaultValue={current.under.def} format={current.under.format} onChange={current.under.onChange} disabled={disabled} />
              </div>
            )}
          </>
        ) : null}
      </div>
      <div className="tool-dock__status" aria-live="polite">{status}</div>
      <div className="bubbles" ref={rowRef}>
        <button type="button" className="bubble bubble--done" onClick={onClose} aria-label="Done">
          <span className="bubble__label"><IconCheck size={16} /></span>
        </button>
        {playback && (
          <button type="button" className="bubble bubble--done bubble--play" onClick={playback.toggle} aria-label={playback.playing ? "Pause" : "Play"}>
            <span className="bubble__label">{playback.playing ? <IconPause size={16} /> : <IconPlay size={16} />}</span>
          </button>
        )}
        <button type="button" role="switch" aria-checked={enabled} aria-label={`${pane === "subjects" ? "Subject pop" : pane === "colour" ? "Colour" : pane === "stabilise" ? "Stabilise" : "Dewarp"} on`} className={`bubble bubble--power${enabled ? " is-lit" : ""}`} onClick={() => setEnabled(!enabled)} disabled={disabled}>
          <span className="bubble__label">{enabled ? "On" : "Off"}</span>
        </button>
        {main.map(bubble)}
        {extra.length > 0 && !showExtra && (
          <button type="button" className="bubble bubble--more" onClick={() => setMoreOpen(true)} aria-expanded={false}>
            <span className="bubble__label">More</span>
            <span className="bubble__value">{extra.length}</span>
          </button>
        )}
        {showExtra && extra.map(bubble)}
      </div>
    </div>
  );
}
