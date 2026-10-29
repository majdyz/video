import { useRef, type ReactNode } from "react";
import {
  COLOUR_PRESETS,
  DEFAULT_COLOUR,
  subjectPopVisible,
  DEFAULT_STABILISE,
  cameraLabel,
  unrecognisedCameraHint,
  dewarpChips,
  STAB_PRESETS,
  TOOL_LABEL,
  applyStabPreset,
  profileAspectMismatch,
  profileDefaults,
  type ToolId,
  type ToolsState,
} from "../pipeline/tools.ts";
import type { StabStatus } from "../pipeline/studio.ts";
import type { ClipInfo } from "../pipeline/probe.ts";
import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";
import { Chips, Segmented, Slider, Switch } from "./controls";
import { IconColour, IconDewarp, IconStabilise } from "./icons";

export const TOOL_ICON: Record<ToolId, (p: { size?: number }) => ReactNode> = {
  colour: IconColour,
  stabilise: IconStabilise,
  dewarp: IconDewarp,
};

const TOOL_BLURB: Record<ToolId, string> = {
  colour: "Restores the colour water takes away",
  stabilise: "Smooths shaky, swimming shots",
  dewarp: "Straightens action-cam fisheye",
};

type Props = {
  tool: ToolId;
  tools: ToolsState;
  setTools: (fn: (t: ToolsState) => ToolsState) => void;
  stab: StabStatus;
  info: ClipInfo | null;
  colourProfiled: boolean;
  photo?: boolean;
  camera?: CameraInfo | null;
  disabled: boolean;
  /** The inline Advanced section (AdvancedDrawer), under the main controls. */
  advanced?: ReactNode;
  /** What the controls apply to when the clip is split, e.g. "Segment 2 of 3 · 0:03.0–0:06.5". */
  scope?: string | null;
};

/** The active tool's controls: header with on/off, preset chips, one Strength, Advanced. */
export function ToolPanel({ tool, tools, setTools, stab, info, colourProfiled, photo, camera, disabled, advanced, scope }: Props) {
  const enabled = tools[tool].enabled;
  const Icon = TOOL_ICON[tool];
  const setEnabled = (v: boolean) => setTools((t) => ({ ...t, [tool]: { ...t[tool], enabled: v } }));
  let status: ReactNode = TOOL_BLURB[tool];
  if (tool === "stabilise" && enabled) {
    if (stab.state === "analysing") status = <span className="status-live">Analysing motion · {Math.round(stab.progress * 100)}%</span>;
    else if (stab.state === "solving") status = <span className="status-live">Planning a smooth path…</span>;
    else if (stab.state === "ready" && stab.info) status = <span className="status-good">{stab.info.badge}</span>;
    else if (stab.state === "ready" && stab.summary) status = <span className="status-good">{stab.summary}</span>;
    else if (stab.state === "error") status = <span className="status-bad">Analysis failed: {stab.message}</span>;
  }
  if (tool === "colour" && enabled) status = colourProfiled ? <span className="status-good">{photo ? "Balanced for this photo" : "Scene-locked to this clip"}</span> : <span className="status-live">Reading the water…</span>;
  const detected = cameraLabel(camera);
  if (tool === "dewarp" && detected) status = <span className="status-good">Detected: {detected}</span>;
  const unrecognised = tool === "dewarp" ? unrecognisedCameraHint(camera) : null;
  if (unrecognised) status = <span className="status-live">{unrecognised}</span>;
  if (tool === "dewarp" && enabled && info && profileAspectMismatch(tools.dewarp.profile, info.codedW, info.codedH)) status = <span className="status-warn">Calibrated for a different aspect ratio</span>;
  // Gyro stabilisation + Dewarp: the gyro warp straightens through the clip's own lens model.
  const gyroLens = tool === "dewarp" && enabled && tools.stabilise.enabled && stab.state === "ready" && stab.info?.mode === "gyro";
  if (gyroLens) status = <span className="status-good">{detected ? `Detected: ${detected}` : stab.info?.camera} · gyro lens model</span>;
  const note = tool === "stabilise" && enabled && stab.info?.warning ? stab.info.warning : null;

  return (
    <div className={`panel${enabled ? "" : " is-off"}`}>
      <div className="panel__head">
        <span className="panel__icon" aria-hidden="true"><Icon size={18} /></span>
        <div className="panel__title">
          <h3>{TOOL_LABEL[tool]}</h3>
          <p aria-live="polite">{status}</p>
        </div>
        <Switch checked={enabled} onChange={setEnabled} label={`${TOOL_LABEL[tool]} on`} disabled={disabled} />
      </div>
      {note && <p className="panel__note" role="note">{note}</p>}
      {scope && <p className="panel__scope" aria-live="polite">{scope}</p>}
      {tool === "stabilise" && stab.state === "analysing" && enabled && (
        <div className="progress-line"><div style={{ width: `${Math.round(stab.progress * 100)}%` }} /></div>
      )}
      <div className="panel__body" aria-disabled={!enabled}>
        {tool === "colour" && (
          <>
            <Chips label="Scene" items={COLOUR_PRESETS} value={tools.colour.preset} disabled={disabled}
              onChange={(id) => setTools((t) => ({ ...t, colour: { ...t.colour, preset: id, enabled: true } }))} />
            <Slider emphasis label="Strength" value={tools.colour.strength} min={0} max={100} defaultValue={DEFAULT_COLOUR.strength} disabled={disabled}
              onChange={(v) => setTools((t) => ({ ...t, colour: { ...t.colour, strength: v, enabled: true } }))} />
          </>
        )}
        {tool === "stabilise" && (
          <>
            <Chips label="Stabilise preset" items={STAB_PRESETS} value={tools.stabilise.preset} disabled={disabled}
              onChange={(id) => setTools((t) => ({ ...t, stabilise: { ...applyStabPreset(t.stabilise, id), enabled: true } }))} />
            <Slider emphasis label="Strength" value={tools.stabilise.strength} min={0} max={100} defaultValue={DEFAULT_STABILISE.strength} disabled={disabled}
              onChange={(v) => setTools((t) => ({ ...t, stabilise: { ...t.stabilise, strength: v, preset: "custom", enabled: true } }))} />
            {enabled && stab.info?.mode === "gyro" && stab.info.canBobbing && (
              <div className="adv__field">
                <span className="adv__label">Bobbing <small aria-live="polite">{stab.bobbing ?? "Heave and sway from walking or fin kicks, which the gyro cannot see"}</small></span>
                <Segmented label="Bobbing" value={tools.stabilise.bobbing === false ? "off" : "on"} disabled={disabled}
                  onChange={(v) => setTools((t) => ({ ...t, stabilise: { ...t.stabilise, bobbing: v === "on" } }))}
                  items={[{ id: "on", label: "Remove" }, { id: "off", label: "Gyro only" }]} />
              </div>
            )}
          </>
        )}
        {tool === "dewarp" && (
          <>
            <Chips label="Camera" items={dewarpChips(camera)} value={tools.dewarp.profile} disabled={disabled}
              onChange={(id) => setTools((t) => ({ ...t, dewarp: { ...t.dewarp, ...profileDefaults(id), enabled: true } }))} />
            <Slider emphasis label="Strength" value={tools.dewarp.strength} min={0} max={100} defaultValue={profileDefaults(tools.dewarp.profile).strength} disabled={disabled}
              onChange={(v) => setTools((t) => ({ ...t, dewarp: { ...t.dewarp, strength: v, enabled: true } }))} />
          </>
        )}
      </div>
      {advanced}
    </div>
  );
}

/**
 * Sidecar motion log for phone clips and loggers: a Gyroflow .gcsv or
 * Sensor Logger's Gyroscope.csv recorded with the clip. Stock phone camera
 * apps store no gyro in the video, so this is the only gyro route for them.
 */
function MotionLogField({ name, onChange }: { name: string | null; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="adv__field">
      <span className="adv__label">Motion log <small>{name ?? "gyro recorded next to the clip by a logging app (.gcsv, Sensor Logger Gyroscope.csv)"}</small></span>
      <input ref={input} type="file" accept=".gcsv,.csv,text/csv,text/plain" hidden
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) onChange(f); }} />
      {name
        ? <button type="button" className="btn btn--ghost" onClick={() => onChange(null)}>Remove motion log</button>
        : <button type="button" className="btn btn--ghost" onClick={() => input.current?.click()}>Add motion log (.gcsv)</button>}
    </div>
  );
}

/** Everything that isn't the main Strength. */
/** Subject pop selection controls (App owns the select mode; the studio keeps the corrections). */
export type SubjectControls = { corrections: number; onReset: () => void };

export function AdvancedControls({ tool, tools, setTools, stab, onMotionLog, subjects }: { tool: ToolId; tools: ToolsState; setTools: (fn: (t: ToolsState) => ToolsState) => void; stab?: StabStatus; onMotionLog?: (file: File | null) => void; subjects?: SubjectControls }) {
  if (tool === "colour") {
    const c = tools.colour;
    const up = (patch: Partial<typeof c>) => setTools((t) => ({ ...t, colour: { ...t.colour, ...patch } }));
    return (
      <div className="adv">
        <div className="adv__field adv__field--row">
          <span className="adv__label">Vivid <small>Deep, muted blue water, darker water, black shadows; sand, skin and reef stay natural</small></span>
          <Switch checked={!!c.vivid} onChange={(v) => up({ vivid: v })} label="Vivid" />
        </div>
        <Slider label="Deep-blue look" value={c.look * 100} min={0} max={100} defaultValue={0} onChange={(v) => up({ look: v / 100 })} />
        <p className="adv__hint">A creative grade on top of the correction: darker, water tinted toward deep blue, subjects keep their colour.</p>
        <Slider label="Saturation" value={c.saturation * 100} min={0} max={200} defaultValue={100} format={(v) => `${Math.round(v)}%`} onChange={(v) => up({ saturation: v / 100 })} />
        <Slider label="Clarity" value={c.clarity * 100} min={0} max={100} defaultValue={DEFAULT_COLOUR.clarity * 100} onChange={(v) => up({ clarity: v / 100 })} />
        <Slider label="Haze removal" value={c.veil * 100} min={0} max={120} defaultValue={DEFAULT_COLOUR.veil * 100} onChange={(v) => up({ veil: v / 100 })} />
        {subjectPopVisible() && (
          <div className="adv__field adv__field--row">
            <span className="adv__label">Subject pop<span className="adv__beta">Beta</span> <small>Separates fish, divers and animals from open blue water</small></span>
            <Switch checked={!!c.subjectPop} onChange={(v) => up({ subjectPop: v })} label="Subject pop" />
          </div>
        )}
        {subjectPopVisible() && c.subjectPop && subjects && (
          <div className="adv__field">
            <span className="adv__label">Subjects <small>{subjects.corrections ? `${subjects.corrections} ${subjects.corrections === 1 ? "change" : "changes"} to the automatic choice` : "chosen automatically; tap one in the picture to leave it out, or tap anything else to add it"}</small></span>
            <span className="adv__actions">
              <button type="button" className="link-btn" onClick={subjects.onReset} disabled={!subjects.corrections}>Reset selection</button>
            </span>
          </div>
        )}
        <p className="adv__hint">Strength 50 is the engine's own estimate for this clip; above it the correction is pushed harder (redder reds, whiter sand) at some cost to fidelity.</p>
        <button type="button" className="btn btn--ghost" onClick={() => setTools((t) => ({ ...t, colour: { ...DEFAULT_COLOUR, enabled: t.colour.enabled } }))}>Reset colour</button>
      </div>
    );
  }
  if (tool === "stabilise") {
    const s = tools.stabilise;
    return (
      <div className="adv">
        <Slider label="Maximum crop" value={s.maxCrop * 100} min={4} max={30} defaultValue={DEFAULT_STABILISE.maxCrop * 100} format={(v) => `${Math.round(v)}%`}
          onChange={(v) => setTools((t) => ({ ...t, stabilise: { ...t.stabilise, maxCrop: v / 100, preset: "custom" } }))} />
        <p className="adv__hint">The camera path may zoom in this far to hide the moving edges. More crop allows a calmer path.</p>
        {stab?.info?.canSwitch && (
          <div className="adv__field">
            <span className="adv__label">Motion source <small>{stab.info.mode === "gyro" ? `gyro data from ${stab.info.camera}` : "tracking the picture"}</small></span>
            <Segmented label="Motion source" value={s.visual ? "visual" : "gyro"} onChange={(v) => setTools((t) => ({ ...t, stabilise: { ...t.stabilise, visual: v === "visual" } }))}
              items={[{ id: "gyro", label: "Gyro data" }, { id: "visual", label: "Visual tracking" }]} />
          </div>
        )}
        {stab?.info?.mode === "gyro" && (
          <div className="adv__field">
            <span className="adv__label">Lens port <small>refraction of a flat port underwater changes the lens</small></span>
            <Segmented label="Lens port" value={s.lens} onChange={(v) => setTools((t) => ({ ...t, stabilise: { ...t.stabilise, lens: v } }))}
              items={[
                { id: "auto", label: `Auto${stab.info.mediumDetected ? ` (${stab.info.mediumDetected === "water" ? "underwater" : "air"})` : ""}` },
                { id: "air", label: "Air" },
                { id: "water", label: "Underwater" },
              ]} />
          </div>
        )}
        {stab?.info?.mode === "gyro" && stab.info.canLevel && (
          <div className="adv__field adv__field--row">
            <span className="adv__label">Keep level <small>rolls the view so the horizon stays straight</small></span>
            <Switch checked={s.keepLevel} onChange={(v) => setTools((t) => ({ ...t, stabilise: { ...t.stabilise, keepLevel: v } }))} label="Keep level" />
          </div>
        )}
        {onMotionLog && <MotionLogField name={stab?.motionLog ?? null} onChange={onMotionLog} />}
        {stab?.summary && <p className="adv__hint">{stab.summary}</p>}
        <button type="button" className="btn btn--ghost" onClick={() => setTools((t) => ({ ...t, stabilise: { ...DEFAULT_STABILISE, enabled: t.stabilise.enabled, visual: t.stabilise.visual, bobbing: t.stabilise.bobbing } }))}>Reset stabilise</button>
      </div>
    );
  }
  const d = tools.dewarp;
  const up = (patch: Partial<typeof d>) => setTools((t) => ({ ...t, dewarp: { ...t.dewarp, ...patch } }));
  return (
    <div className="adv">
      <div className="adv__field">
        <span className="adv__label">Projection</span>
        <Segmented label="Projection" value={d.projection} onChange={(v) => up({ projection: v })}
          items={[{ id: "rectilinear", label: "Straight lines" }, { id: "stereographic", label: "Natural shapes" }]} />
      </div>
      <div className="adv__field adv__field--row">
        <span className="adv__label">Auto-fit zoom <small>no black corners</small></span>
        <Switch checked={d.autoZoom} onChange={(v) => up({ autoZoom: v })} label="Auto-fit zoom" />
      </div>
      {!d.autoZoom && <Slider label="Zoom" value={d.zoom * 100} min={60} max={200} defaultValue={100} format={(v) => `${(v / 100).toFixed(2)}×`} onChange={(v) => up({ zoom: v / 100 })} />}
      {d.profile === "generic-fisheye" && <Slider label="Lens field of view" value={d.fovDeg} min={90} max={200} defaultValue={150} format={(v) => `${Math.round(v)}°`} onChange={(v) => up({ fovDeg: v })} />}
      <p className="adv__hint">Lens profiles are Gyroflow calibrations (CC0). Osmo Wide clips already carry part of the camera's own dewarp, hence 55 % by default.</p>
      <button type="button" className="btn btn--ghost" onClick={() => setTools((t) => ({ ...t, dewarp: { ...t.dewarp, ...profileDefaults(t.dewarp.profile), projection: "rectilinear", autoZoom: true, zoom: 1 } }))}>Reset dewarp</button>
    </div>
  );
}
