import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Studio } from "./pipeline/studio.ts";
import { DEFAULT_TOOLS, TOOL_LABEL, TOOL_ORDER, detectedProfile, lookOf, profileDefaults, type ToolId, type ToolsState } from "./pipeline/tools.ts";
import { BRAND, SAMPLE } from "./brand.ts";
import { Stage } from "./ui/stage";
import { Timeline } from "./ui/timeline";
import { AdvancedControls, TOOL_ICON, ToolPanel } from "./ui/panels";
import { SubjectOutlines } from "./ui/subjects";
import { ExportSheet } from "./ui/export-sheet";
import { AdvancedDrawer } from "./ui/advanced";
import { EmptyState } from "./ui/empty";
import { Sheet } from "./ui/sheet";
import { IconButton, Segmented } from "./ui/controls";
import { IconClose, IconCompare, IconExport, IconMore, IconPlus, IconWarning } from "./ui/icons";
import { useMedia } from "./ui/use-media";
import { FootageField } from "./ui/footage";
import { isNativeShell } from "./native/registry.ts";
import { formatTimecode, trimAt } from "./pipeline/trim.ts";
import { lookAfterRemove, removeCut, segmentAtTime, segmentNumber, splitAt, visibleSegments } from "./pipeline/segments.ts";

type Theme = "abyss" | "light";
const THEMES: { id: Theme; label: string }[] = [
  { id: "abyss", label: "Dark" },
  { id: "light", label: "Light" },
];

/** Same breakpoint as the CSS: wide screens and phones in landscape get the sidebar layout. */
const WIDE_QUERY = "(min-width: 960px), (orientation: landscape) and (max-height: 560px) and (min-width: 600px)";
const ACCEPT = "video/*,image/*,.mov,.mp4,.m4v,.heic,.heif";

function initialTools(): ToolsState {
  // Headless/debug presets: ?tools=colour,stabilise,dewarp&profile=…
  const q = new URLSearchParams(location.search);
  const list = q.get("tools");
  if (!list) return DEFAULT_TOOLS;
  const on = new Set(list.split(","));
  const t: ToolsState = {
    colour: { ...DEFAULT_TOOLS.colour, enabled: on.has("colour"), vivid: q.get("vivid") === "1" },
    stabilise: { ...DEFAULT_TOOLS.stabilise, enabled: on.has("stabilise") },
    dewarp: { ...DEFAULT_TOOLS.dewarp, enabled: on.has("dewarp") },
  };
  return t;
}

/** `?dock=open|closed` for screenshots; otherwise the dock follows the picture (see below). */
function initialDock(): boolean | null {
  const q = new URLSearchParams(location.search).get("dock");
  return q ? q === "open" : null;
}

export default function App() {
  const studio = useMemo(() => new Studio(), []);
  // Headless checks (`?debug=1`) drive the studio directly.
  useEffect(() => { if (new URLSearchParams(location.search).has("debug")) (window as unknown as { studio?: Studio }).studio = studio; }, [studio]);
  const s = useSyncExternalStore(studio.subscribe, studio.getSnapshot);
  const colourRef = useRef<HTMLCanvasElement>(null);
  const geoRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tools, setToolsState] = useState<ToolsState>(initialTools);
  const [tab, setTab] = useState<ToolId>(() => (new URLSearchParams(location.search).get("tab") as ToolId) || "colour");
  const [split, setSplit] = useState<number | null>(0.5);
  /** Selected timeline segment (its region index, segments.ts): what the Colour panel edits once the clip is split. */
  const [selLook, setSelLook] = useState(0);
  const [holding, setHolding] = useState(false);
  /** Advanced section, inline under the tool's main controls (the preview stays in view). */
  const [advOpen, setAdvOpen] = useState(false);
  const advRef = useRef(advOpen);
  advRef.current = advOpen;
  const [tapPulse, setTapPulse] = useState<{ u: number; v: number; t: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Phone dock: collapsed for portrait clips (the picture gets the height), open for
  // landscape ones (the space is there anyway) until the user toggles it.
  const [dockPref, setDockOpen] = useState<boolean | null>(initialDock);
  const [hasLive, setHasLive] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "abyss"));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wide = useMedia(WIDE_QUERY);

  useEffect(() => {
    const c = colourRef.current, g = geoRef.current, v = videoRef.current;
    if (!c || !g || !v) return;
    void studio.attach(c, g, v);
    return () => studio.dispose();
  }, [studio]);

  useEffect(() => studio.setTools(tools), [studio, tools]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#08090b");
    try { localStorage.setItem("studio.theme", theme); } catch { /* private mode */ }
  }, [theme]);

  // Live view of an offline export: bitmaps of the encoded frames, drawn over the stage.
  useEffect(() => studio.onExportFrame((bmp) => {
    const c = liveRef.current;
    if (!c) return;
    if (c.width !== bmp.width || c.height !== bmp.height) {
      c.width = bmp.width;
      c.height = bmp.height;
    }
    c.getContext("2d")?.drawImage(bmp, 0, 0);
    setHasLive(true);
  }), [studio]);

  const setTools = useCallback((fn: (t: ToolsState) => ToolsState) => setToolsState(fn), []);
  const onFrameSize = useCallback((w: number, h: number) => studio.setStageSize(w, h, window.devicePixelRatio), [studio]);
  const onZoom = useCallback((z: number) => studio.setZoom(z), [studio]);
  const exporting = s.exp.state === "preparing" || s.exp.state === "running";
  const ready = s.phase === "ready";
  const photo = s.kind === "photo";

  // ---- split / per-segment colour
  const segs = s.segments;
  const visibleSegs = visibleSegments(segs.cuts, s.trim, s.duration);
  // The selected segment, or (when it is outside the trim) the one under the playhead.
  const selSeg = visibleSegs.find((g) => g.look === selLook) ?? segmentAtTime(segs.cuts, s.currentTime, s.trim, s.duration);
  /** Region whose look the Colour panel edits; null = unsplit (tools.colour, as before splits). */
  const editLook = segs.cuts.length && !photo ? selSeg.look : null;
  const segNum = editLook !== null ? segmentNumber(segs.cuts, editLook, s.trim, s.duration) : null;
  const segScope = segNum ? `Segment ${segNum.index} of ${segNum.count} · ${formatTimecode(selSeg.start)}–${formatTimecode(selSeg.end)}` : null;
  // The panels read and write tools.colour; once split, that is the selected segment's look (on/off stays global).
  const panelTools: ToolsState = editLook !== null && segs.looks[editLook] ? { ...tools, colour: { ...segs.looks[editLook], enabled: tools.colour.enabled } } : tools;
  const setPanelTools = (fn: (t: ToolsState) => ToolsState) => {
    if (editLook === null) return setToolsState(fn);
    const next = fn(panelTools);
    const looks = segs.looks.slice();
    looks[editLook] = lookOf(next.colour);
    studio.setSegments({ cuts: segs.cuts, looks }, false);
    setToolsState((t) => ({ ...t, stabilise: next.stabilise, dewarp: next.dewarp, colour: { ...t.colour, enabled: next.colour.enabled } }));
  };
  const canSplit = ready && !photo && !exporting && splitAt(segs, s.currentTime, s.trim, s.duration, lookOf(tools.colour)) !== null;
  const doSplit = () => {
    const snap = studio.getSnapshot();
    const t = studio.playhead();
    const next = splitAt(snap.segments, t, snap.trim, snap.duration, lookOf(tools.colour));
    if (!next) return;
    studio.setSegments(next, true);
    // The new segment (right of the cut) is the one the user goes on to grade.
    setSelLook(next.cuts.indexOf(t) + 1);
  };
  const removeSplit = (k: number) => {
    const next = removeCut(studio.getSnapshot().segments, k);
    setSelLook((l) => lookAfterRemove(l, k));
    // Back to one segment: its look becomes the clip's colour again.
    if (!next.cuts.length && next.looks[0]) setToolsState((t) => ({ ...t, colour: { ...next.looks[0], enabled: t.colour.enabled } }));
    studio.setSegments(next, true);
  };
  const splitRef = useRef(doSplit);
  splitRef.current = doSplit;
  // The live overlay covers the stage while an offline (or photo) export renders; the real-time
  // recorder paints the visible canvas itself.
  const liveOn = exporting && s.exportMode !== "realtime" && hasLive;
  useEffect(() => {
    if (!exporting) setHasLive(false);
  }, [exporting]);

  // Dewarp preselects the camera / lens the clip's metadata names (the user can still pick another).
  useEffect(() => {
    const id = detectedProfile(s.camera);
    if (id) setToolsState((t) => (t.dewarp.profile === id ? t : { ...t, dewarp: { ...t.dewarp, ...profileDefaults(id) } }));
  }, [s.camera]);

  const tabs = photo ? TOOL_ORDER.filter((id) => id !== "stabilise") : TOOL_ORDER;
  useEffect(() => {
    if (photo && tab === "stabilise") setTab("colour");
  }, [photo, tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && ready && !photo && !(e.target as HTMLElement).closest("input,button,[role=slider],[role=dialog]")) {
        e.preventDefault();
        studio.togglePlay();
      }
      // I / O: trim in / out point at the playhead (desktop editors' convention).
      const k = e.key.toLowerCase();
      const editorKey = ready && !photo && !exporting && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target as HTMLElement).closest("input,textarea,select,[contenteditable],[role=dialog]");
      if ((k === "i" || k === "o") && editorKey) {
        e.preventDefault();
        const snap = studio.getSnapshot();
        studio.setTrim(trimAt(k === "i" ? "in" : "out", snap.currentTime, snap.trim, snap.duration), true);
      }
      // S: split at the playhead.
      if (k === "s" && editorKey) {
        e.preventDefault();
        splitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, photo, exporting, studio]);

  const openFile = (f: File) => {
    setSplit(0.5);
    setSelLook(0);
    void studio.open(f);
  };
  // In the app (apps/mobile) clips come from the native pickers: originals,
  // telemetry tracks intact, and a sandbox path the native exporter reads the
  // audio from. The web keeps <input type=file>.
  const native = isNativeShell();
  const pick = (source: "photos" | "files" = "photos") => {
    if (!native) {
      fileInputRef.current?.click();
      return;
    }
    void import("./native/bridge.ts")
      .then((nat) => nat.pickNativeFile(source))
      .then((f) => { if (f) openFile(f); })
      .catch((e: unknown) => console.error("[native] pick failed", e));
  };
  const aspect = s.info ? s.info.displayW / s.info.displayH : null;
  const dockOpen = dockPref ?? (aspect !== null && aspect > 1.05);
  const pill = s.busy ?? (tools.stabilise.enabled && !photo && !exporting && (s.stab.state === "analysing" || s.stab.state === "solving")
    ? (s.stab.state === "solving" ? "Planning a smooth path…" : `Analysing motion ${Math.round(s.stab.progress * 100)}%`)
    : null);

  const closeAdv = useCallback(() => setAdvOpen(false), []);
  const popOn = !!panelTools.colour.subjectPop || new URLSearchParams(location.search).get("pop") === "1";
  /**
   * Selecting subjects (Subject pop): while Colour's Advanced section is open with Subject pop on, the subjects it
   * found are outlined over the preview and a tap on the picture includes / excludes the one under the finger
   * (instead of closing Advanced); the before / after line steps aside so the whole picture is the result.
   */
  const selectActive = advOpen && (wide || dockOpen) && popOn && ready && !exporting && tab === "colour" && tools.colour.enabled;
  useEffect(() => {
    // The outlines must match the paused frame, not the last analysis taken while playing.
    if (selectActive) void studio.refreshSubjects();
  }, [studio, selectActive]);
  useEffect(() => studio.setSplit(holding ? 1 : selectActive ? null : split), [studio, split, holding, selectActive]);
  const getSelection = useCallback(() => studio.subjectSelection(), [studio]);
  const openAdv = () => {
    setAdvOpen(true);
    setDockOpen(true);
  };
  const selectTab = (id: ToolId) => {
    if (!wide && id === tab && dockOpen) {
      setDockOpen(false);
      setAdvOpen(false);
    } else {
      setTab(id);
      setDockOpen(true);
    }
  };

  const compare = (
    <IconButton label={split === null ? "Show before and after" : "Hide before and after"} pressed={split !== null} className={split !== null ? "is-active" : ""} onClick={() => setSplit((v) => (v === null ? 0.5 : null))} disabled={!ready || exporting}>
      <IconCompare size={18} />
    </IconButton>
  );
  // Photos have no timeline: name and size instead.
  const bar = s.phase !== "empty" && (
    <div className={`viewer__bar${photo ? "" : " viewer__bar--video"}`}>
      {photo ? (
        <>
          <div className="photo-meta">
            <span className="photo-meta__name">{s.fileName}</span>
            <span className="photo-meta__size">{s.info ? `${s.info.displayW} × ${s.info.displayH}` : ""}</span>
          </div>
          {compare}
        </>
      ) : (
        <Timeline time={s.currentTime} duration={s.duration} playing={s.playing} disabled={!ready || exporting} trim={s.trim} thumbs={s.thumbs} onToggle={() => studio.togglePlay()} onSeek={(t) => studio.seek(t)} onTrim={(r, commit) => studio.setTrim(r, commit)}
          cuts={segs.cuts} selected={editLook} canSplit={canSplit} onSplit={doSplit}
          onSelect={setSelLook}
          onCuts={(cuts, commit) => studio.setSegments({ cuts, looks: studio.getSnapshot().segments.looks }, commit)}
          onRemoveCut={removeSplit}>
          {compare}
        </Timeline>
      )}
    </div>
  );

  return (
    <div className={`app phase-${s.phase}${wide ? " is-wide" : " is-narrow"}${dockOpen ? " dock-open" : ""}${advOpen && (wide || dockOpen) ? " adv-open" : ""}`} style={aspect ? ({ ["--clip-ar" as string]: aspect.toFixed(4) }) : undefined} data-stab={s.stab.state} data-export={s.exp.state} data-kind={s.kind ?? "none"}>
      <header className="topbar">
        <h1 className="wordmark">{BRAND.name}</h1>
        <div className="topbar__actions">
          {s.phase !== "empty" && (
            <IconButton label="Open another clip or photo" onClick={() => pick()} disabled={exporting}>
              <IconPlus size={18} />
            </IconButton>
          )}
          <IconButton label="About and appearance" onClick={() => setAboutOpen(true)}>
            <IconMore size={18} />
          </IconButton>
        </div>
      </header>

      <main className="workspace">
        <section className="viewer" aria-label="Preview" onClick={advOpen ? (e) => { if (!(e.target as HTMLElement).closest(".stage__frame, .viewer__bar")) closeAdv(); } : undefined}>
          <Stage
            aspect={s.phase === "empty" ? null : aspect}
            nativeWidth={s.info?.displayW ?? 0}
            colourRef={colourRef}
            geoRef={geoRef}
            liveRef={liveRef}
            liveOn={liveOn}
            visible={s.visible}
            split={ready && !exporting && !selectActive ? split : null}
            holding={holding}
            onSplit={setSplit}
            onHold={ready && !exporting ? setHolding : undefined}
            onTap={selectActive ? undefined : advOpen ? closeAdv : photo ? undefined : () => studio.togglePlay()}
            onTapAt={selectActive ? (u, v) => { void studio.toggleSubjectAt(u, v); setTapPulse({ u, v, t: performance.now() }); } : undefined}
            overlay={selectActive ? <SubjectOutlines getSelection={getSelection} pulse={tapPulse} /> : undefined}
            onZoom={onZoom}
            interactive={ready && !exporting}
            onFrameSize={onFrameSize}
            paused={!s.playing}
            showPlayHint={ready && !photo && !s.busy && !exporting && !selectActive}
            resetKey={`${s.fileName}:${s.info?.displayW}x${s.info?.displayH}`}
          >
            {s.phase === "empty" && <EmptyState accept={ACCEPT} onFile={openFile} onPick={native ? pick : undefined} onSample={() => { setSplit(0.5); setSelLook(0); void studio.openUrl(`${import.meta.env.BASE_URL}samples/${SAMPLE.file}`, SAMPLE.file); }} busy={s.busy} />}
            {s.phase !== "empty" && pill && (
              <div className="pill" role="status"><span className="pill__dot" aria-hidden="true" />{pill}</div>
            )}
            {selectActive && (
              <div className="select-bar" role="status">
                <span>{s.subjectTracking !== null ? `Following it through the clip… ${Math.round(s.subjectTracking * 100)}%` : s.subjectNote ?? "Tap a subject to leave it out or add it"}</span>
                <button type="button" className="link-btn" onClick={closeAdv}>Done</button>
              </div>
            )}
          </Stage>
          {wide && bar}
        </section>

        {s.phase !== "empty" && (
          <aside className="controls" aria-label="Tools">
            {!wide && (
              <button
                type="button"
                className="dock__grab"
                aria-expanded={dockOpen}
                aria-controls="tool-panel"
                aria-label={dockOpen ? "Hide tool controls" : "Show tool controls"}
                onClick={(e) => {
                  // A drag already set the state; the click that follows it must not undo it.
                  if (e.currentTarget.dataset.dragged) { delete e.currentTarget.dataset.dragged; return; }
                  if (advOpen) setAdvOpen(false);
                  else setDockOpen(!dockOpen);
                }}
                onPointerDown={(e) => {
                  const y0 = e.clientY;
                  const el = e.currentTarget;
                  el.setPointerCapture(e.pointerId);
                  const move = (ev: PointerEvent) => {
                    const dy = ev.clientY - y0;
                    if (Math.abs(dy) > 24) {
                      el.dataset.dragged = "1";
                      // Down closes Advanced first, then the dock.
                      if (dy > 0 && advRef.current) setAdvOpen(false);
                      else setDockOpen(dy < 0);
                      up();
                    }
                  };
                  const up = () => {
                    el.removeEventListener("pointermove", move);
                    el.removeEventListener("pointerup", up);
                    el.removeEventListener("pointercancel", up);
                  };
                  el.addEventListener("pointermove", move);
                  el.addEventListener("pointerup", up);
                  el.addEventListener("pointercancel", up);
                }}
              >
                <span className="dock__handle" aria-hidden="true" />
              </button>
            )}
            {!wide && bar}
            <div className="controls__panel" id="tool-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} hidden={!wide && !dockOpen}>
              {s.kind === "video" && s.footage.note && (
                <p className="panel__note footage-note" role="note">
                  {s.footage.note}
                  <button type="button" className="link-btn" onClick={() => { setTab("colour"); openAdv(); }} disabled={exporting}>Change</button>
                </p>
              )}
              <ToolPanel tool={tab} tools={tab === "colour" ? panelTools : tools} setTools={tab === "colour" ? setPanelTools : setTools} scope={tab === "colour" ? segScope : null} stab={s.stab} info={s.info} colourProfiled={s.colourProfiled} photo={photo} camera={s.camera} disabled={exporting || !ready}
                advanced={
                  <AdvancedDrawer open={advOpen && (wide || dockOpen)} onToggle={() => (advOpen ? setAdvOpen(false) : openAdv())} onClose={closeAdv} disabled={exporting || !ready} id="adv-section"
                    label={`${TOOL_LABEL[tab]} advanced settings${tab === "colour" && segNum ? `, segment ${segNum.index} of ${segNum.count}` : ""}`}>
                    <AdvancedControls tool={tab} tools={tab === "colour" ? panelTools : tools} setTools={tab === "colour" ? setPanelTools : setTools} stab={s.stab} onMotionLog={s.kind === "video" ? (f) => studio.setMotionLog(f) : undefined}
                      subjects={{ corrections: s.subjectOverrides.length, onReset: () => studio.setSubjectOverrides([]) }} />
                    {tab === "colour" && s.kind === "video" && <FootageField footage={s.footage} onChange={(c) => studio.setFootage(c)} disabled={exporting} />}
                  </AdvancedDrawer>
                } />
            </div>
            <div className="tabs" role="tablist" aria-label="Tool">
              {tabs.map((id) => {
                const Icon = TOOL_ICON[id];
                return (
                  <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="tool-panel" className={`tab${tab === id ? " is-on" : ""}${tools[id].enabled ? " is-enabled" : ""}`} onClick={() => selectTab(id)}>
                    <span className="tab__icon" aria-hidden="true"><Icon size={16} /></span>
                    <span className="tab__label">{TOOL_LABEL[id]}</span>
                    <span className="tab__dot" aria-hidden="true" />
                    <span className="sr-only">{tools[id].enabled ? ", on" : ", off"}</span>
                  </button>
                );
              })}
            </div>
            {wide && (
              <section className="chain" aria-label="Processing order">
                <h2 className="chain__label">Processing order</h2>
                <ol>
                  {(["dewarp", "stabilise", "colour"] as ToolId[]).filter((id) => !photo || id !== "stabilise").map((id) => {
                    const Icon = TOOL_ICON[id];
                    const on = tools[id].enabled;
                    const note = !on ? "Off"
                      : id === "stabilise" ? (s.stab.state === "ready" ? "Ready" : s.stab.state === "error" ? "Failed" : s.stab.state === "off" ? "Waiting" : `${Math.round(s.stab.progress * 100)}%`)
                      : id === "colour" ? (photo ? "On" : s.colourProfiled ? "Scene-locked" : "Analysing") : "On";
                    return (
                      <li key={id} className={on ? "is-on" : ""}>
                        <button type="button" onClick={() => setTab(id)} className={tab === id ? "is-current" : ""}>
                          <span className="chain__icon" aria-hidden="true"><Icon size={16} /></span>
                          <span className="chain__name">{TOOL_LABEL[id]}</span>
                          <span className="chain__note">{note}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
            <button type="button" className="btn btn--primary export-btn" onClick={() => { studio.pause(); setExportOpen(true); }} disabled={!ready || !s.canExport}>
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

      <video ref={videoRef} className="source-video" muted playsInline aria-hidden="true" />
      <input ref={fileInputRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openFile(f); }} />

      <ExportSheet open={exportOpen} onClose={() => { setExportOpen(false); if (s.exp.state === "done" || s.exp.state === "error") studio.dismissExport(); }} studio={studio} snap={s} tools={tools} />

      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title={BRAND.name}>
        <div className="about">
          <div className="adv__field">
            <span className="adv__label" id="appearance-label">Appearance</span>
            <Segmented label="Appearance" items={THEMES} value={theme} onChange={setTheme} />
          </div>
          <p>{BRAND.tagline} Everything runs on this device: nothing is uploaded.</p>
          <ul className="about__list">
            <li><b>Colour</b> physically based underwater correction (backscatter removal, range-adaptive white balance), locked per scene across the clip.</li>
            <li><b>Stabilise</b> feature tracking with an L1-optimal camera path and wobble suppression.</li>
            <li><b>Dewarp</b> calibrated fisheye lens profiles (Gyroflow, CC0) to straight lines.</li>
            <li><b>Photos</b> JPEG, PNG and HEIC (where the browser reads it) get Colour and Dewarp, saved as a full-resolution JPEG that keeps the original's date, location and camera details.</li>
            <li><b>10-bit, HDR and log</b> HLG / PQ (iPhone, GoPro, Osmo HDR), DJI D-Log M and Apple Log are converted to standard Rec.709 before the tools run; exports are 8-bit SDR.</li>
          </ul>
          <p className="about__fine">
            {s.engine === "webgpu" ? "WebGPU" : s.engine === "webgl2" ? "WebGL2" : s.engine === "failed" ? "No GPU" : "GPU starting"}
            {" · "}
            {s.exportMode === "realtime" ? "real-time export (plays the clip through once)" : s.exportMode === "native" ? "native hardware encoder" : "WebCodecs export"}
          </p>
          <div className="about__credit">
            <h3>Sample clip</h3>
            <p>
              <a href={SAMPLE.url} target="_blank" rel="noreferrer">{SAMPLE.title}</a> by {SAMPLE.author}, {SAMPLE.licence.name === "CC0" ? "" : "licensed under "}
              <a href={SAMPLE.licence.url} target="_blank" rel="noreferrer">{SAMPLE.licence.name}</a>. {SAMPLE.note}
            </p>
          </div>
          <p className="about__fine">
            Classic tools: <a href="../aqua-fix/">Aqua Fix</a> · <a href="../motion-fix/">Motion Fix</a> · <a href="../dewarp/">Dewarp</a>
          </p>
        </div>
      </Sheet>
    </div>
  );
}
