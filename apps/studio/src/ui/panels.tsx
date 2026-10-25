import type { ReactNode } from "react";
import {
  COLOUR_PRESETS,
  DEFAULT_COLOUR,
  DEFAULT_STABILISE,
  DEWARP_PROFILES,
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
import { Chips, Segmented, Slider, Switch } from "./controls";
import { IconColour, IconDewarp, IconSliders, IconStabilise } from "./icons";

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
  disabled: boolean;
  onAdvanced: () => void;
};

/** The active tool's controls: header with on/off, preset chips, one Strength, Advanced. */
export function ToolPanel({ tool, tools, setTools, stab, info, colourProfiled, disabled, onAdvanced }: Props) {
  const enabled = tools[tool].enabled;
  const Icon = TOOL_ICON[tool];
  const setEnabled = (v: boolean) => setTools((t) => ({ ...t, [tool]: { ...t[tool], enabled: v } }));
  let status: ReactNode = TOOL_BLURB[tool];
  if (tool === "stabilise" && enabled) {
    if (stab.state === "analysing") status = <span className="status-live">Analysing motion · {Math.round(stab.progress * 100)}%</span>;
    else if (stab.state === "solving") status = <span className="status-live">Planning a smooth path…</span>;
    else if (stab.state === "ready" && stab.summary) status = <span className="status-good">{stab.summary}</span>;
    else if (stab.state === "error") status = <span className="status-bad">Analysis failed: {stab.message}</span>;
  }
  if (tool === "colour" && enabled) status = colourProfiled ? <span className="status-good">Scene-locked to this clip</span> : <span className="status-live">Reading the water…</span>;
  if (tool === "dewarp" && enabled && info && profileAspectMismatch(tools.dewarp.profile, info.codedW, info.codedH)) status = <span className="status-warn">This lens profile expects a different frame shape</span>;

  return (
    <div className={`panel${enabled ? "" : " is-off"}`}>
      <div className="panel__head">
        <span className="panel__icon"><Icon size={18} /></span>
        <div className="panel__title">
          <h3>{TOOL_LABEL[tool]}</h3>
          <p>{status}</p>
        </div>
        <Switch checked={enabled} onChange={setEnabled} label={`${TOOL_LABEL[tool]} on`} disabled={disabled} />
      </div>
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
          </>
        )}
        {tool === "dewarp" && (
          <>
            <Chips label="Camera" items={DEWARP_PROFILES} value={tools.dewarp.profile} disabled={disabled}
              onChange={(id) => setTools((t) => ({ ...t, dewarp: { ...t.dewarp, ...profileDefaults(id), enabled: true } }))} />
            <Slider emphasis label="Strength" value={tools.dewarp.strength} min={0} max={100} defaultValue={profileDefaults(tools.dewarp.profile).strength} disabled={disabled}
              onChange={(v) => setTools((t) => ({ ...t, dewarp: { ...t.dewarp, strength: v, enabled: true } }))} />
          </>
        )}
        <button type="button" className="link-btn" onClick={onAdvanced} disabled={disabled}>
          <IconSliders size={16} />
          Advanced
        </button>
      </div>
    </div>
  );
}

/** Everything that isn't the main Strength. */
export function AdvancedControls({ tool, tools, setTools }: { tool: ToolId; tools: ToolsState; setTools: (fn: (t: ToolsState) => ToolsState) => void }) {
  if (tool === "colour") {
    const c = tools.colour;
    const up = (patch: Partial<typeof c>) => setTools((t) => ({ ...t, colour: { ...t.colour, ...patch } }));
    return (
      <div className="adv">
        <Slider label="Deep-blue look" value={c.look * 100} min={0} max={100} defaultValue={0} onChange={(v) => up({ look: v / 100 })} />
        <p className="adv__hint">A creative grade on top of the correction: darker, water tinted toward deep blue, subjects keep their colour.</p>
        <Slider label="Saturation" value={c.saturation * 100} min={0} max={200} defaultValue={100} format={(v) => `${Math.round(v)}%`} onChange={(v) => up({ saturation: v / 100 })} />
        <Slider label="Clarity" value={c.clarity * 100} min={0} max={100} defaultValue={DEFAULT_COLOUR.clarity * 100} onChange={(v) => up({ clarity: v / 100 })} />
        <Slider label="Haze removal" value={c.veil * 100} min={0} max={120} defaultValue={DEFAULT_COLOUR.veil * 100} onChange={(v) => up({ veil: v / 100 })} />
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
        <button type="button" className="btn btn--ghost" onClick={() => setTools((t) => ({ ...t, stabilise: { ...DEFAULT_STABILISE, enabled: t.stabilise.enabled } }))}>Reset stabilise</button>
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
