import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Studio } from "./pipeline/studio.ts";
import { DEFAULT_TOOLS, TOOL_LABEL, TOOL_ORDER, type ToolId, type ToolsState } from "./pipeline/tools.ts";
import { BRAND } from "./brand.ts";
import { Stage } from "./ui/stage";
import { Timeline } from "./ui/timeline";
import { AdvancedControls, TOOL_ICON, ToolPanel } from "./ui/panels";
import { ExportSheet } from "./ui/export-sheet";
import { EmptyState } from "./ui/empty";
import { Sheet } from "./ui/sheet";
import { IconButton, Segmented } from "./ui/controls";
import { IconClose, IconCompare, IconExport, IconMore, IconPlus, IconWarning } from "./ui/icons";

type Theme = "abyss" | "coral" | "depth";
const THEMES: { id: Theme; label: string }[] = [
  { id: "abyss", label: "Abyss" },
  { id: "coral", label: "Coral" },
  { id: "depth", label: "Depth" },
];

function initialTools(): ToolsState {
  // Headless/debug presets: ?tools=colour,stabilise,dewarp&profile=…
  const q = new URLSearchParams(location.search);
  const list = q.get("tools");
  if (!list) return DEFAULT_TOOLS;
  const on = new Set(list.split(","));
  const t: ToolsState = {
    colour: { ...DEFAULT_TOOLS.colour, enabled: on.has("colour") },
    stabilise: { ...DEFAULT_TOOLS.stabilise, enabled: on.has("stabilise") },
    dewarp: { ...DEFAULT_TOOLS.dewarp, enabled: on.has("dewarp") },
  };
  return t;
}

export default function App() {
  const studio = useMemo(() => new Studio(), []);
  const s = useSyncExternalStore(studio.subscribe, studio.getSnapshot);
  const colourRef = useRef<HTMLCanvasElement>(null);
  const geoRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tools, setToolsState] = useState<ToolsState>(initialTools);
  const [tab, setTab] = useState<ToolId>(() => (new URLSearchParams(location.search).get("tab") as ToolId) || "colour");
  const [split, setSplit] = useState<number | null>(0.5);
  const [advOpen, setAdvOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || "abyss");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const c = colourRef.current, g = geoRef.current, v = videoRef.current;
    if (!c || !g || !v) return;
    void studio.attach(c, g, v);
    return () => studio.dispose();
  }, [studio]);

  useEffect(() => studio.setTools(tools), [studio, tools]);
  useEffect(() => studio.setSplit(split), [studio, split]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#08090b");
    try { localStorage.setItem("studio.theme", theme); } catch { /* private mode */ }
  }, [theme]);

  const setTools = useCallback((fn: (t: ToolsState) => ToolsState) => setToolsState(fn), []);
  const onFrameSize = useCallback((w: number, h: number) => studio.setStageSize(w, h, window.devicePixelRatio), [studio]);
  const exporting = s.exp.state === "preparing" || s.exp.state === "running";
  const ready = s.phase === "ready";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && ready && !(e.target as HTMLElement).closest("input,button,[role=slider]")) {
        e.preventDefault();
        studio.togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, studio]);

  const openFile = (f: File) => {
    setSplit(0.5);
    void studio.open(f);
  };
  const aspect = s.info ? s.info.displayW / s.info.displayH : null;
  const pill = s.busy ?? (tools.stabilise.enabled && !exporting && (s.stab.state === "analysing" || s.stab.state === "solving")
    ? (s.stab.state === "solving" ? "Planning a smooth path…" : `Analysing motion ${Math.round(s.stab.progress * 100)}%`)
    : null);

  return (
    <div className={`app phase-${s.phase}`} data-stab={s.stab.state} data-export={s.exp.state}>
      <header className="topbar">
        <div className="wordmark">{BRAND.name}</div>
        <div className="topbar__actions">
          {s.phase !== "empty" && (
            <IconButton label="Open another clip" onClick={() => fileInputRef.current?.click()} disabled={exporting}>
              <IconPlus size={18} />
            </IconButton>
          )}
          <IconButton label="About and appearance" onClick={() => setAboutOpen(true)}>
            <IconMore size={18} />
          </IconButton>
        </div>
      </header>

      <main className="workspace">
        <section className="viewer">
          <Stage
            aspect={s.phase === "empty" ? null : aspect}
            colourRef={colourRef}
            geoRef={geoRef}
            visible={s.visible}
            split={ready && !exporting ? split : null}
            onSplit={setSplit}
            onTap={() => studio.togglePlay()}
            onFrameSize={onFrameSize}
            paused={!s.playing}
            showPlayHint={ready && !s.busy && !exporting}
          >
            {s.phase === "empty" && <EmptyState onFile={openFile} onSample={() => { setSplit(0.5); void studio.openUrl(`${import.meta.env.BASE_URL}samples/reef.mp4`, "reef-sample.mp4"); }} busy={s.busy} />}
            {s.phase !== "empty" && pill && (
              <div className="pill" role="status"><span className="pill__dot" />{pill}</div>
            )}
          </Stage>
          {s.phase !== "empty" && (
            <div className="viewer__bar">
              <Timeline time={s.currentTime} duration={s.duration} playing={s.playing} disabled={!ready || exporting} onToggle={() => studio.togglePlay()} onSeek={(t) => studio.seek(t)} />
              <IconButton label={split === null ? "Show before / after" : "Hide before / after"} className={split !== null ? "is-active" : ""} onClick={() => setSplit((v) => (v === null ? 0.5 : null))} disabled={!ready}>
                <IconCompare size={18} />
              </IconButton>
            </div>
          )}
        </section>

        {s.phase !== "empty" && (
          <aside className="controls">
            <nav className="tabs" role="tablist" aria-label="Tools">
              {TOOL_ORDER.map((id) => {
                const Icon = TOOL_ICON[id];
                return (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab${tab === id ? " is-on" : ""}${tools[id].enabled ? " is-enabled" : ""}`} onClick={() => setTab(id)}>
                    <span className="tab__icon"><Icon size={16} /></span>
                    <span className="tab__label">{TOOL_LABEL[id]}</span>
                    <span className="tab__dot" aria-label={tools[id].enabled ? "on" : "off"} />
                  </button>
                );
              })}
            </nav>
            <div className="controls__panel">
              <ToolPanel tool={tab} tools={tools} setTools={setTools} stab={s.stab} info={s.info} colourProfiled={s.colourProfiled} disabled={exporting || !ready} onAdvanced={() => setAdvOpen(true)} />
            </div>
            <section className="chain" aria-label="Processing order">
              <h4 className="chain__label">Processing order</h4>
              <ol>
                {(["dewarp", "stabilise", "colour"] as ToolId[]).map((id) => {
                  const Icon = TOOL_ICON[id];
                  const on = tools[id].enabled;
                  const note = !on ? "Off"
                    : id === "stabilise" ? (s.stab.state === "ready" ? "Ready" : s.stab.state === "error" ? "Failed" : s.stab.state === "off" ? "Waiting" : `${Math.round(s.stab.progress * 100)}%`)
                    : id === "colour" ? (s.colourProfiled ? "Scene-locked" : "Analysing") : "On";
                  return (
                    <li key={id} className={on ? "is-on" : ""}>
                      <button type="button" onClick={() => setTab(id)} className={tab === id ? "is-current" : ""}>
                        <span className="chain__icon"><Icon size={16} /></span>
                        <span className="chain__name">{TOOL_LABEL[id]}</span>
                        <span className="chain__note">{note}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
            <button type="button" className="btn btn--primary export-btn" onClick={() => setExportOpen(true)} disabled={!ready || !s.canExport}>
              <IconExport size={18} />
              <span>Export</span>
            </button>
          </aside>
        )}
      </main>

      {s.error && (
        <div className="toast" role="alert">
          <IconWarning size={18} />
          <span>{s.error}</span>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Dismiss" onClick={() => studio.clearError()}><IconClose size={16} /></button>
        </div>
      )}

      <video ref={videoRef} className="source-video" muted playsInline />
      <input ref={fileInputRef} type="file" accept="video/*,.mov,.mp4,.m4v" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openFile(f); }} />

      <Sheet open={advOpen} onClose={() => setAdvOpen(false)} title={`${TOOL_LABEL[tab]} · Advanced`}>
        <AdvancedControls tool={tab} tools={tools} setTools={setTools} />
      </Sheet>

      <ExportSheet open={exportOpen} onClose={() => { setExportOpen(false); if (s.exp.state === "done" || s.exp.state === "error") studio.dismissExport(); }} studio={studio} exp={s.exp} tools={tools} info={s.info} duration={s.duration} />

      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title={BRAND.name}>
        <div className="about">
          <div className="adv__field">
            <span className="adv__label">Appearance</span>
            <Segmented label="Appearance" items={THEMES} value={theme} onChange={setTheme} />
          </div>
          <p>{BRAND.tagline} Everything runs on this device: nothing is uploaded.</p>
          <ul className="about__list">
            <li><b>Colour</b> physically based underwater correction (backscatter removal, range-adaptive white balance), locked per scene across the clip.</li>
            <li><b>Stabilise</b> feature tracking with an L1-optimal camera path and wobble suppression.</li>
            <li><b>Dewarp</b> calibrated fisheye lens profiles (Gyroflow, CC0) to straight lines.</li>
          </ul>
          <p className="about__fine">
            {s.engine === "webgpu" ? "WebGPU" : s.engine === "webgl2" ? "WebGL2" : "GPU starting"} · {s.canExport ? "WebCodecs export" : "export unavailable in this browser"}
            <br />Sample clip: {BRAND.sampleCredit}
            <br />Classic tools: <a href="../aqua-fix/">Aqua Fix</a> · <a href="../motion-fix/">Motion Fix</a> · <a href="../dewarp/">Dewarp</a>
          </p>
        </div>
      </Sheet>
    </div>
  );
}
