import { Eta } from "./pipeline/eta.ts";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Studio } from "./pipeline/studio.ts";
import { segStatusText, subjectChip } from "./pipeline/seg/studio-seg.ts";
import { DEFAULT_TOOLS, NEUTRAL_HINT, TOOL_LABEL, TOOL_ORDER, detectedProfile, enabledTools, initialStyle, lookOf, neutralFor, profileDefaults, savedVivid, styleFlags, styleOf, subjectPopVisible, type ColourState, type ToolId, type ToolsState } from "./pipeline/tools.ts";
import { BRAND, SAMPLE, donateUrl } from "./brand.ts";
import { Stage } from "./ui/stage";
import { Timeline } from "./ui/timeline";
import { AdvancedControls, SubjectsPanel, TOOL_ICON, ToolPanel, toolStatus } from "./ui/panels";
import { ToolDock } from "./ui/tool-dock";
import { lastAiProfile, lastCrash, sessionCrumbs } from "./pipeline/crumbs.ts";
import { deviceFacts, isWeakDevice } from "./pipeline/device.ts";
import type { FeedbackContext } from "./pipeline/feedback.ts";
import { SubjectOutlines } from "./ui/subjects";
import { NeutralMark } from "./ui/neutral";
import { ExportSheet } from "./ui/export-sheet";
import { analyticsOptedOut, setAnalyticsOptOut } from "./pipeline/analytics.ts";
import { BatchSheet, BatchStrip, makeThumb, type BatchItem } from "./ui/batch";
import { kindOf, splitBatch } from "./pipeline/batch.ts";
import { EmptyState } from "./ui/empty";
import { Sheet } from "./ui/sheet";
import { IntroSheet, introDue, markIntroSeen } from "./ui/intro";
import { FeedbackSheet } from "./ui/feedback";
import { IconButton, Segmented } from "./ui/controls";
import { IconClose, IconCompare, IconExpand, IconExport, IconMore, IconPlus, IconShrink, IconSpark, IconWarning } from "./ui/icons";
import { useMedia, useViewport } from "./ui/use-media";
import { phoneLayout } from "./ui/layout.ts";
import { FootageField } from "./ui/footage";
import { isNativeShell } from "./native/registry.ts";
import { formatTimecode, trimAt } from "./pipeline/trim.ts";
import { lookAfterRemove, removeCut, segmentAtTime, segmentNumber, splitAt, visibleSegments } from "./pipeline/segments.ts";

declare const __BUILD_ID__: string;

type Theme = "abyss" | "light";
const THEMES: { id: Theme; label: string }[] = [
  { id: "abyss", label: "Dark" },
  { id: "light", label: "Light" },
];

/** Same breakpoint as the CSS: wide screens get the sidebar layout (a phone on its side has its own: ui/layout.ts). */
const WIDE_QUERY = "(min-width: 960px)";
const ACCEPT = "video/*,image/*,.mov,.mp4,.m4v,.heic,.heif";

function initialTools(): ToolsState {
  // Headless/debug presets: ?tools=colour,stabilise,dewarp&profile=…
  const q = new URLSearchParams(location.search);
  // Style: ?style=natural|vivid|blue or ?vivid=0|1, else the user's saved choice, else Vivid.
  const style = styleFlags(initialStyle(location.search, savedVivid()));
  const list = q.get("tools");
  // ?tool=stabilise|dewarp|colour (the old single-tool URLs land here): that tool on, its pane open.
  const one = q.get("tool") as ToolId | null;
  if (!list) {
    const t: ToolsState = { ...DEFAULT_TOOLS, colour: { ...DEFAULT_TOOLS.colour, ...style } };
    return one && TOOL_ORDER.includes(one) ? ({ ...t, [one]: { ...t[one], enabled: true } } as ToolsState) : t;
  }
  const on = new Set(list.split(","));
  const t: ToolsState = {
    colour: { ...DEFAULT_TOOLS.colour, enabled: on.has("colour"), ...style },
    stabilise: { ...DEFAULT_TOOLS.stabilise, enabled: on.has("stabilise") },
    dewarp: { ...DEFAULT_TOOLS.dewarp, enabled: on.has("dewarp") },
  };
  return t;
}

/** A tool's controls, or Subjects (Subject pop and its selection: the ✨ button on the picture). */
type Pane = ToolId | "subjects";
const PANE_LABEL: Record<Pane, string> = { ...TOOL_LABEL, subjects: "Subjects" };
const PANE_ICON: Record<Pane, (p: { size?: number }) => React.ReactNode> = { ...TOOL_ICON, subjects: IconSpark };

/** `?sheet=colour|…` (screenshots) or `?tool=…` (the old single-tool URLs): the phone's tool sheet open on that pane. */
function initialSheet(): boolean {
  const q = new URLSearchParams(location.search);
  return !!(q.get("sheet") || q.get("tool"));
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
  const [pane, setPane] = useState<Pane>(() => { const q = new URLSearchParams(location.search); return (q.get("sheet") || q.get("tab") || q.get("tool") || "colour") as Pane; });
  /** The tool the panels edit (Subjects belongs to Colour). */
  const tab: ToolId = pane === "subjects" ? "colour" : pane;
  const [split, setSplit] = useState<number | null>(0.5);
  /** Selected timeline segment (its region index, segments.ts): what the Colour panel edits once the clip is split. */
  const [selLook, setSelLook] = useState(0);
  const [holding, setHolding] = useState(false);
  /** Phone: the open tool sheet (pane's controls; the picture above stays live). */
  const [sheetOpen, setSheetOpen] = useState(initialSheet);
  /** Full screen: the picture alone (the Fullscreen API where there is one, else the page's own chrome hidden). */
  const [immersive, setImmersive] = useState(false);
  const [tapPulse, setTapPulse] = useState<{ u: number; v: number; t: number } | null>(null);
  /** Tap-to-neutral: the picture is waiting for a tap on something white or grey (Colour → White point). */
  const [picking, setPicking] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [analyticsOff, setAnalyticsOff] = useState(analyticsOptedOut);
  /** Several photos opened at once (ui/batch.tsx): the strip under the picture, Export all. Null for one clip / photo. */
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  /** Bumped per new batch: restarts its thumbnails. */
  const [batchKey, setBatchKey] = useState(0);
  const [batchOpen, setBatchOpen] = useState(false);
  const batchOpenRef = useRef(false);
  batchOpenRef.current = batchOpen;
  const [notice, setNotice] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** First visit: the three-step intro (ui/intro.tsx); About reopens it. */
  const [introOpen, setIntroOpen] = useState(introDue);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  /** The last session crashed (crumbs.ts): its steps, offered once at start-up and kept in About. */
  const crash = useMemo(() => lastCrash(), []);
  const [crashToast, setCrashToast] = useState(!!crash);
  /** The last AI pass's profile (crumbs.ts), read when About opens. */
  const aiPass = useMemo(() => (aboutOpen ? lastAiProfile() : null), [aboutOpen]);
  const [hasLive, setHasLive] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "abyss"));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const motionLogRef = useRef<HTMLInputElement>(null);
  const wide = useMedia(WIDE_QUERY);
  const viewport = useViewport();

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
  const inBatchRef = useRef(false);
  // A minimised export that finishes (or fails) brings its sheet back: the file to save, or what went wrong.
  const expState = s.exp.state;
  useEffect(() => {
    if ((expState === "done" || expState === "error") && !inBatchRef.current) setExportOpen(true);
  }, [expState]);
  const ready = s.phase === "ready";
  // Colour on and its analysis (the clip's scene lock, the photo's balance) not in yet: an export now would come out
  // without it, so Export waits (the panel says "Reading the water…").
  // (Export stays on while this is pending (Fable review, 13 Nov: a greyed Export for the first 10–30 s was the first
  // impression): an export started meanwhile waits for the colour ("Reading the water…", studio.ts exportVideo).)
  const colourPending = ready && tools.colour.enabled && !s.colourProfiled && studio.hasColourEngine;
  const photo = s.kind === "photo";

  // ---- before/after reveal: while the colour is being read the line waits at the right edge (all original);
  // once the grade is in it sweeps to where the user left it, so the result wipes in instead of jumping.
  const [splitAnim, setSplitAnim] = useState<number | null>(null);
  const revealRaf = useRef(0);
  const wasPending = useRef(false);
  const splitNow = useRef(split);
  splitNow.current = split;
  useEffect(() => {
    const was = wasPending.current;
    wasPending.current = colourPending;
    cancelAnimationFrame(revealRaf.current);
    if (colourPending) { setSplitAnim(1); return; }
    const target = splitNow.current;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!was || target === null || reduce) { setSplitAnim(null); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      const e = 1 - (1 - p) ** 3;
      setSplitAnim(p < 1 ? 1 + (target - 1) * e : null);
      if (p < 1) revealRaf.current = requestAnimationFrame(step);
    };
    revealRaf.current = requestAnimationFrame(step);
  }, [colourPending]);
  useEffect(() => () => cancelAnimationFrame(revealRaf.current), []);
  const splitShown = split === null ? null : splitAnim ?? split;
  const moveSplit = useCallback((v: number) => {
    cancelAnimationFrame(revealRaf.current);
    setSplitAnim(null);
    setSplit(v);
  }, []);

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
    // Photos: a 0.5× shot (EXIF) turns on Phone 0.5×; anything else leaves the user's pick (a batch mixes lenses).
    if (studio.getSnapshot().kind === "photo") {
      if (s.camera?.profileId === "phone-ultra-wide" && !batchOpenRef.current && !studio.phoneFixOff) {
        setToolsState((t) => (t.dewarp.enabled && t.dewarp.profile === "phone-ultra-wide" ? t : { ...t, dewarp: { ...t.dewarp, ...profileDefaults("phone-ultra-wide"), enabled: true } }));
      }
      return;
    }
    const id = detectedProfile(s.camera);
    if (id) setToolsState((t) => (t.dewarp.profile === id ? t : { ...t, dewarp: { ...t.dewarp, ...profileDefaults(id) } }));
  }, [s.camera, studio]);

  const tabs: Pane[] = [...(photo ? TOOL_ORDER.filter((id) => id !== "stabilise") : TOOL_ORDER), ...(subjectPopVisible() ? ["subjects" as const] : [])];
  useEffect(() => {
    if (photo && pane === "stabilise") setPane("colour");
  }, [photo, pane]);

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

  const openOne = (f: File) => {
    setSplit(0.5);
    setSelLook(0);
    return studio.open(f);
  };
  const openFile = (f: File) => {
    setBatch(null);
    void openOne(f);
  };
  /** A pick or drop of several files: the photos and videos become a batch (the strip; Export exports them all). */
  const openFiles = (list: FileList | File[] | null | undefined) => {
    const files = [...(list ?? [])];
    if (files.length <= 1) {
      if (files[0]) openFile(files[0]);
      return;
    }
    const { media, skipped } = splitBatch(files);
    setNotice(skipped ? `${skipped} file${skipped > 1 ? "s" : ""} left out: not a photo or video.` : null);
    if (media.length <= 1) {
      if (media[0]) openFile(media[0]);
      return;
    }
    setBatch(media.map((file) => ({ file, kind: kindOf(file), thumb: null })));
    setBatchKey((k) => k + 1);
    void openOne(media[0]);
  };
  // Batch thumbnails, one decode at a time; their URLs go with the batch.
  const batchRef = useRef(batch);
  batchRef.current = batch;
  useEffect(() => {
    const items = batchRef.current;
    if (!items) return;
    let live = true;
    const urls: string[] = [];
    void (async () => {
      for (const it of items) {
        if (!live) break;
        if (it.thumb) continue;
        const url = await makeThumb(it.file);
        if (!url) continue;
        if (!live) { URL.revokeObjectURL(url); break; }
        urls.push(url);
        setBatch((b) => b && b.map((x) => (x.file === it.file ? { ...x, thumb: url } : x)));
      }
    })();
    return () => {
      live = false;
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [batchKey]);
  const inBatch = !!batch && batch.length > 1 && s.phase !== "empty";
  inBatchRef.current = inBatch;
  const openSample = () => {
    setSplit(0.5);
    setSelLook(0);
    void studio.openUrl(`${import.meta.env.BASE_URL}samples/${SAMPLE.file}`, SAMPLE.file);
  };
  const closeIntro = () => {
    markIntroSeen();
    setIntroOpen(false);
  };
  /** What Send feedback attaches, read when it opens (the clip, the tools and the steps as they are then). */
  const toolsRef = useRef(tools);
  toolsRef.current = tools;
  const feedbackContext = useCallback((): FeedbackContext => {
    const snap = studio.getSnapshot(), t = toolsRef.current, f = deviceFacts();
    const standalone = matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
    const on = enabledTools(t);
    return {
      build: __BUILD_ID__,
      device: [
        `Browser: ${f.ua}`,
        `Screen: ${screen.width}×${screen.height} @${devicePixelRatio}x, window ${innerWidth}×${innerHeight}${standalone ? ", home-screen app" : ""}`,
        `Memory ${f.memory ?? "?"} GB · ${f.cores || "?"} cores · cross-origin isolated ${f.coi ? "yes" : "no"} · weak device ${isWeakDevice() ? "yes" : "no"}`,
        `GPU ${snap.engine} · export ${snap.exportMode} · AI ${snap.seg.on ? `on (${snap.seg.phase})` : "off"}${snap.seg.note ? ` · ${snap.seg.note}` : ""}`,
        snap.info ? `Clip: ${snap.kind} ${snap.info.displayW}×${snap.info.displayH}${snap.kind === "video" ? `, ${snap.duration.toFixed(1)} s` : ""}` : "Clip: none open",
        `Tools: ${on.length ? on.map((id) => (id === "colour" ? `colour (${styleOf(t.colour)}${t.colour.subjectPop ? ", subject pop" : ""})` : id)).join(", ") : "none"}`,
      ],
      steps: sessionCrumbs(),
      crash,
    };
  }, [studio, crash]);
  const openFeedback = () => {
    setAboutOpen(false);
    setFeedbackOpen(true);
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
  // The preview's AI pass: a rough time left once it has shown its pace (reset when it stops tracking).
  const segEta = useRef(new Eta()).current;
  if (s.seg.phase !== "tracking") segEta.reset();
  const segEtaShort = s.seg.phase === "tracking" ? segEta.short(s.seg.progress) : null;
  const pill = s.busy ?? (tools.stabilise.enabled && !photo && !exporting && (s.stab.state === "analysing" || s.stab.state === "solving")
    ? (s.stab.state === "solving" ? "Planning a smooth path…" : `Analysing motion ${Math.round(s.stab.progress * 100)}%`)
    : null);
  // Subject pop on a clip: one chip says what the frame on screen is graded with (its AI mask, the search still
  // running, or the basic detection), in place of the old "AI subjects 73% · about a minute left" pill that wrapped.
  const chip = !pill && ready && s.subjectFrame && s.seg.on && !exporting && !immersive ? subjectChip(s.subjectFrame.ai, s.seg, segEtaShort, s.subjectFrame.peek ?? null, s.segFollow) : null;
  // Follow mode off while the pass runs: the chip offers it ("watch it work").
  const canFollow = !!chip && s.seg.on && s.seg.phase === "tracking" && !s.segFollow;

  const closeSheet = useCallback(() => setSheetOpen(false), []);
  // Phone layout (ui/layout.ts): a landscape clip in portrait leaves letterbox bars, and the chip, the tools and the
  // dock go there ("stacked": nothing on the picture); a phone on its side gets the picture full-bleed with the rail
  // in the pillarbox and the dock along the bottom; a tall clip keeps the controls floating on it.
  const phone = wide || s.phase === "empty" || immersive ? null : phoneLayout(viewport.w, viewport.h, aspect);
  const stacked = phone === "stacked", landscape = phone === "landscape";
  // The rail as slim unlabelled discs: wherever it has to sit on or beside the picture in little room.
  const folded = !wide && !immersive && (landscape || (sheetOpen && !stacked));
  // Colour → Style: three pictures of the frame on screen, due again when that frame or a colour setting changes.
  const paintThumbs = useCallback((targets: Parameters<Studio["paintStyleThumbs"]>[0]) => studio.paintStyleThumbs(targets), [studio]);
  const lookKey = useMemo(() => { const { vivid: _v, blue: _b, ...rest } = panelTools.colour; return JSON.stringify(rest); }, [panelTools.colour]);
  const styleThumbs = useMemo(() => ({
    paint: paintThumbs,
    key: `${s.fileName}|${s.info?.displayW}x${s.info?.displayH}|${s.playing ? "playing" : s.currentTime.toFixed(2)}|${s.colourProfiled}|${lookKey}|${tools.dewarp.enabled}|${tools.stabilise.enabled}|${phone}`,
    playing: s.playing,
  }), [paintThumbs, s.fileName, s.info?.displayW, s.info?.displayH, s.playing, s.currentTime, s.colourProfiled, lookKey, tools.dewarp.enabled, tools.stabilise.enabled, phone]);
  const popOn = !!panelTools.colour.subjectPop || new URLSearchParams(location.search).get("pop") === "1";
  const paneOpen = wide || sheetOpen;
  /**
   * Selecting subjects (Subject pop): while Subjects is open with Subject pop on, the subjects it found are outlined
   * over the preview and a tap on the picture includes / excludes the one under the finger; the before / after line
   * steps aside so the whole picture is the result.
   */
  const selectActive = pane === "subjects" && paneOpen && popOn && ready && !exporting && tools.colour.enabled;
  useEffect(() => {
    // The outlines must match the paused frame, not the last analysis taken while playing.
    if (selectActive) void studio.refreshSubjects();
  }, [studio, selectActive]);
  /**
   * Tap-to-neutral: while on (from Colour → White point), a tap on the picture picks the point that should be white
   * or grey; the before / after line steps aside so the whole picture shows the result. Leaving Colour, closing the
   * sheet or starting an export ends it.
   */
  const pickActive = picking && pane === "colour" && paneOpen && ready && !exporting && tools.colour.enabled;
  useEffect(() => {
    if (picking && !pickActive) setPicking(false);
    if (!pickActive) studio.clearNeutralNote();
  }, [studio, picking, pickActive]);
  // A change to the colour look made in the studio (a tap, the debug API) goes through the panels' state.
  const patchColourRef = useRef<(patch: Partial<ColourState>) => void>(() => undefined);
  patchColourRef.current = (patch) => setPanelTools((t) => ({ ...t, colour: { ...t.colour, ...patch } }));
  useEffect(() => {
    studio.onColourPatch = (patch) => patchColourRef.current(patch);
    return () => { studio.onColourPatch = null; };
  }, [studio]);
  /** The pick in force on this clip (a pick made on another file is ignored, see tools.ts NeutralPick). */
  const neutralPick = neutralFor(panelTools.colour, studio.clipKey);
  const neutralControls = { active: pickActive, pick: neutralPick, onToggle: () => setPicking((v) => !v), onReset: () => studio.clearNeutral() };
  // The mark sits where the tap was: on a clip, only around the frame it was made on (the scene moves on).
  const neutralMark = neutralPick && (photo || Math.abs(s.currentTime - neutralPick.t) < 0.25) ? neutralPick : null;
  useEffect(() => studio.setSplit(holding ? 1 : selectActive || pickActive ? null : splitShown), [studio, splitShown, holding, selectActive, pickActive]);
  const getSelection = useCallback(() => studio.outlineSelection(), [studio]);
  const openPane = (id: Pane) => {
    setPane(id);
    setSheetOpen(true);
    setImmersive(false);
  };
  /** The ✨ button on the picture: Subjects open, Subject pop (and Colour) on. */
  const openSubjects = () => {
    openPane("subjects");
    if (!panelTools.colour.subjectPop || !tools.colour.enabled) setPanelTools((t) => ({ ...t, colour: { ...t.colour, subjectPop: true, enabled: true } }));
  };

  // Full screen: the real one where the browser has it for the page (not iPhone Safari: the page's chrome hides instead).
  const toggleImmersive = () => {
    const next = !immersive;
    setImmersive(next);
    if (next) setSheetOpen(false);
    try {
      if (next && document.fullscreenEnabled && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
      else if (!next && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch { /* not supported */ }
  };
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (!immersive && !(sheetOpen && !wide)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".sheet-layer")) return;
      if (immersive) setImmersive(false);
      else setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive, sheetOpen, wide]);

  // Photos have no timeline: name and size instead.
  const bar = s.phase !== "empty" && (
    <>
    {inBatch && <BatchStrip items={batch!} active={studio.clipFile} onSelect={(f) => void openOne(f)} disabled={exporting || batchOpen} />}
    {!(inBatch && photo) && <div className={`viewer__bar${photo ? "" : " viewer__bar--video"}`}>
      {photo ? (
        <div className="photo-meta">
          <span className="photo-meta__name">{s.fileName}</span>
          <span className="photo-meta__size">{s.info ? `${s.info.displayW} × ${s.info.displayH}` : ""}</span>
        </div>
      ) : (
        <Timeline time={s.currentTime} duration={s.duration} playing={s.playing} disabled={!ready || exporting} trim={s.trim} thumbs={s.thumbs} onToggle={() => studio.togglePlay()} onSeek={(t) => studio.seek(t)} onTrim={(r, commit) => studio.setTrim(r, commit)}
          cuts={segs.cuts} selected={editLook} canSplit={canSplit} onSplit={doSplit}
          onSelect={setSelLook}
          onCuts={(cuts, commit) => studio.setSegments({ cuts, looks: studio.getSnapshot().segments.looks }, commit)}
          onRemoveCut={removeSplit} />
      )}
    </div>}
    </>
  );

  const exportBtn = (
    <button type="button" className={`btn btn--primary export-btn${exporting && !exportOpen && !inBatch ? " is-running" : ""}`} onClick={() => { studio.pause(); if (inBatch) setBatchOpen(true); else setExportOpen(true); }} disabled={!ready || !s.canExport}>
      <IconExport size={18} />
      {/* A running export minimised (the sheet closed while it runs): the button is its progress, a tap brings it back. */}
      <span>{inBatch ? (wide ? `Export all ${batch!.length}` : `Export ${batch!.length}`) : exporting && !exportOpen ? `${Math.round(s.exp.progress * 100)}%` : "Export"}</span>
    </button>
  );
  const subjectsOn = !!panelTools.colour.subjectPop && tools.colour.enabled;
  const paneOn = (id: Pane) => (id === "subjects" ? subjectsOn : tools[id].enabled);
  // On the picture (Instagram-style): before / after, Subjects, full screen; in full screen only the way out.
  const rail = s.phase !== "empty" && (
    <div className="canvas-rail" onClick={(e) => e.stopPropagation()}>
      {!immersive && !wide && tabs.map((id) => {
        // Phone: the tools live on the rail too (no tool bar over the picture); the open one is white.
        const Icon = PANE_ICON[id];
        const open = sheetOpen && pane === id;
        return (
          <button key={id} type="button" className={`rail-btn rail-btn--tool${open ? " is-on" : ""}${paneOn(id) ? " is-enabled" : ""}`} aria-pressed={open}
            onClick={() => (open ? closeSheet() : id === "subjects" ? openSubjects() : openPane(id))} disabled={!ready}>
            <Icon size={20} /><span>{PANE_LABEL[id]}</span>
          </button>
        );
      })}
      {!immersive && !wide && <span className="rail-sep" aria-hidden="true" />}
      {!immersive && (
        <>
          <button type="button" className={`rail-btn${split !== null ? " is-on" : ""}`} aria-pressed={split !== null} onClick={() => setSplit((v) => (v === null ? 0.5 : null))} disabled={!ready || exporting || selectActive || pickActive}>
            <IconCompare size={20} /><span>Compare</span>
          </button>
          {subjectPopVisible() && wide && (
            <button type="button" className={`rail-btn${subjectsOn ? " is-on" : ""}${selectActive ? " is-active" : ""}`} aria-pressed={selectActive} onClick={() => (selectActive ? closeSheet() : openSubjects())} disabled={!ready || exporting}>
              <IconSpark size={20} /><span>{s.seg.on && subjectsOn && !photo ? "AI subjects" : "Subjects"}</span>
            </button>
          )}
        </>
      )}
      <button type="button" className="rail-btn" onClick={toggleImmersive} aria-label={immersive ? "Exit full screen" : "Full screen"} disabled={s.phase !== "ready"}>
        {immersive ? <IconShrink size={20} /> : <IconExpand size={20} />}{!immersive && <span>Full screen</span>}
      </button>
    </div>
  );
  const subjectControls = { corrections: s.subjectOverrides.length, onReset: () => studio.setSubjectOverrides([]), ai: s.kind === "video" ? { on: s.seg.on, status: segStatusText(s.seg), onToggle: (on: boolean) => studio.setSegEnabled(on) } : undefined };
  const paneBody = pane === "subjects" ? (
    <SubjectsPanel tools={panelTools} setTools={setPanelTools} colourOn={tools.colour.enabled} disabled={exporting || !ready} photo={photo} subjects={subjectControls} />
  ) : (
    <ToolPanel tool={tab} tools={tab === "colour" ? panelTools : tools} setTools={tab === "colour" ? setPanelTools : setTools} scope={tab === "colour" ? segScope : null} stab={s.stab} info={s.info} colourProfiled={s.colourProfiled} photo={photo} camera={s.camera} disabled={exporting || !ready}
      advanced={
        <section className="finetune" aria-label={`${TOOL_LABEL[tab]} fine-tuning${tab === "colour" && segNum ? `, segment ${segNum.index} of ${segNum.count}` : ""}`}>
          <h4 className="finetune__title">Fine-tune</h4>
          <AdvancedControls tool={tab} tools={tab === "colour" ? panelTools : tools} setTools={tab === "colour" ? setPanelTools : setTools} stab={s.stab} onMotionLog={s.kind === "video" ? (f) => studio.setMotionLog(f) : undefined} neutral={neutralControls} />
          {tab === "colour" && s.kind === "video" && <FootageField footage={s.footage} onChange={(c) => studio.setFootage(c)} disabled={exporting} />}
        </section>
      } />
  );
  const footageNote = s.kind === "video" && s.footage.note && (
    <p className="panel__note footage-note" role="note">
      {s.footage.note}
      <button type="button" className="link-btn" onClick={() => openPane("colour")} disabled={exporting}>Change</button>
    </p>
  );

  return (
    <div className={`app phase-${s.phase}${wide ? " is-wide" : " is-narrow"}${stacked ? " is-stacked" : ""}${landscape ? " is-landscape" : ""}${folded ? " is-folded" : ""}${!wide && sheetOpen ? " sheet-open" : ""}${immersive ? " is-immersive" : ""}${pickActive ? " is-picking" : ""}`} style={aspect ? ({ ["--clip-ar" as string]: aspect.toFixed(4) }) : undefined} data-stab={s.stab.state} data-export={s.exp.state} data-kind={s.kind ?? "none"}>
      <header className="topbar">
        <div className="brand">
          <h1 className="wordmark">{BRAND.name}</h1>
          {BRAND.beta && <span className="brand__beta">Beta</span>}
        </div>
        <div className="topbar__actions">
          {s.phase !== "empty" && (
            <IconButton label="Open another clip or photo" onClick={() => pick()} disabled={exporting}>
              <IconPlus size={18} />
            </IconButton>
          )}
          <IconButton label="About, help and feedback" onClick={() => setAboutOpen(true)}>
            <IconMore size={18} />
          </IconButton>
          {!wide && s.phase !== "empty" && exportBtn}
        </div>
      </header>

      <main className="workspace">
        <section className="viewer" aria-label="Preview">
          <Stage
            aspect={s.phase === "empty" ? null : aspect}
            nativeWidth={s.info?.displayW ?? 0}
            colourRef={colourRef}
            geoRef={geoRef}
            liveRef={liveRef}
            liveOn={liveOn}
            visible={s.visible}
            split={ready && !exporting && !selectActive && !pickActive ? splitShown : null}
            holding={holding}
            onSplit={moveSplit}
            onHold={ready && !exporting ? setHolding : undefined}
            onTap={selectActive || pickActive || photo ? undefined : () => studio.togglePlay()}
            onTapAt={pickActive ? (u, v) => void studio.tapNeutral(u, v) : selectActive ? (u, v) => { void studio.toggleSubjectAt(u, v); setTapPulse({ u, v, t: performance.now() }); } : undefined}
            tapHint={pickActive ? "tap something that should be white or grey to balance the colour to it" : undefined}
            overlay={pickActive ? <NeutralMark pick={neutralMark} /> : selectActive ? <SubjectOutlines getSelection={getSelection} pulse={tapPulse} /> : undefined}
            onZoom={onZoom}
            interactive={ready && !exporting}
            onFrameSize={onFrameSize}
            paused={!s.playing}
            showPlayHint={ready && !photo && !s.busy && !exporting && !selectActive && !pickActive}
            resetKey={`${s.fileName}:${s.info?.displayW}x${s.info?.displayH}`}
            grow={!wide}
          >
            {s.phase === "empty" && <EmptyState accept={ACCEPT} onFiles={openFiles} onPick={native ? pick : undefined} onSample={openSample} busy={s.busy} />}
            {s.phase !== "empty" && pill && !selectActive && !pickActive && (
              <div className="pill" role="status"><span className="pill__dot" aria-hidden="true" />{pill}</div>
            )}
            {chip && !pickActive && (
              <div className={`pill pill--subject is-${chip.tone}${selectActive ? " is-under-bar" : ""}${!selectActive && popOn ? " is-tappable" : ""}`} role="status" data-subject-chip={chip.tone}
                // A tap on the chip shows what it is about: Subjects opens with the AI's outlines on this frame, where a
                // tap on the picture adds or removes a subject ("what does the check mark mean": owner, 13 Nov).
                onClick={!selectActive && popOn ? () => openPane("subjects") : undefined}
                title={!selectActive && popOn ? "Show the outline" : undefined}>
                {chip.tone === "busy" && <span className="pill__dot" aria-hidden="true" />}
                <span className="pill__lines"><span>{chip.line}</span>{chip.sub && <small>{chip.sub}</small>}</span>
                {canFollow && <button type="button" className="pill__action" data-follow-ai onClick={(e) => { e.stopPropagation(); studio.setSegFollow(true); }}>Follow AI</button>}
              </div>
            )}
            {rail}
            {pickActive && (
              <div className="select-bar" role="status" onClick={(e) => e.stopPropagation()}>
                <span>{s.neutralNote ?? NEUTRAL_HINT}</span>
                {neutralPick && <button type="button" className="link-btn" onClick={() => studio.clearNeutral()}>Reset</button>}
                <button type="button" className="link-btn" onClick={() => setPicking(false)}>Done</button>
              </div>
            )}
            {selectActive && (
              // Its buttons are never a click "outside" (Undo can re-render away under the click before it bubbles).
              <div className="select-bar" role="status" onClick={(e) => e.stopPropagation()}>
                {/* AI progress is in the dock's status line: here only what a tap does. */}
                <span>{s.subjectTracking !== null ? `Following ${Math.round(s.subjectTracking * 100)}%` : s.subjectNote ?? "Tap to add or remove"}</span>
                {s.subjectUndo > 0 && <button type="button" className="link-btn" onClick={() => void studio.undoSubjectTap()}>Undo</button>}
                <button type="button" className="link-btn" onClick={() => (wide ? setPane("colour") : closeSheet())}>Done</button>
              </div>
            )}
          </Stage>
          {wide && bar}
        </section>

        {s.phase !== "empty" && !wide && (
          // Phone: everything floats on the full-screen picture (a soft scrim, no panel): the open tool's options
          // (ToolDock) or the timeline, over the tool bar.
          <aside className="controls" aria-label="Tools" onClick={(e) => e.stopPropagation()}>
            {sheetOpen ? (
              <ToolDock pane={pane} tools={tab === "colour" ? panelTools : tools} setTools={tab === "colour" ? setPanelTools : setTools} stab={s.stab} camera={s.camera} photo={photo} disabled={exporting || !ready}
                footage={s.kind === "video" ? s.footage : null} onFootage={s.kind === "video" ? (c) => studio.setFootage(c) : null}
                onMotionLog={s.kind === "video" ? () => motionLogRef.current?.click() : null}
                subjects={subjectControls} neutral={neutralControls} onClose={closeSheet}
                styleThumbs={ready && !exporting ? styleThumbs : null}
                // On its side the open tool's row takes the timeline's place: play / pause moves into the row.
                playback={landscape && !photo ? { playing: s.playing, toggle: () => studio.togglePlay() } : null}
                status={pane === "subjects" ? (s.kind === "video" && (s.seg.on || s.seg.phase === "unavailable" || s.seg.weak || s.seg.crashed) ? segStatusText(s.seg) : null) : <>{segScope && tab === "colour" ? `${segScope} · ` : ""}{toolStatus({ tool: tab, tools: tab === "colour" ? panelTools : tools, stab: s.stab, info: s.info, colourProfiled: s.colourProfiled, photo, camera: s.camera })}</>} />
            ) : null}
            {/* The timeline (play / pause, scrub) stays while a tool is open: a change is checked across the clip.
                (Not on a phone on its side: there is no height for both, the row has its own play button.) */}
            {!(landscape && sheetOpen) && bar}
          </aside>
        )}

        {s.phase !== "empty" && wide && (
          <aside className="controls" aria-label="Tools">
            <div className="controls__panel" id="tool-panel" role="tabpanel" aria-labelledby={`tab-${pane}`}>
              {footageNote}
              {paneBody}
            </div>
            <div className="tabs" role="tablist" aria-label="Tool">
              {tabs.map((id) => {
                const Icon = PANE_ICON[id];
                return (
                  <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={pane === id} aria-controls="tool-panel" className={`tab${pane === id ? " is-on" : ""}${paneOn(id) ? " is-enabled" : ""}`} onClick={() => setPane(id)}>
                    <span className="tab__icon" aria-hidden="true"><Icon size={16} /></span>
                    <span className="tab__label">{PANE_LABEL[id]}</span>
                    <span className="tab__dot" aria-hidden="true" />
                    <span className="sr-only">{paneOn(id) ? ", on" : ", off"}</span>
                  </button>
                );
              })}
            </div>
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
                      <button type="button" onClick={() => setPane(id)} className={pane === id ? "is-current" : ""}>
                        <span className="chain__icon" aria-hidden="true"><Icon size={16} /></span>
                        <span className="chain__name">{TOOL_LABEL[id]}</span>
                        <span className="chain__note">{note}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
            {exportBtn}
          </aside>
        )}
      </main>

      {notice && !s.error && (
        <div className="toast" role="status">
          <IconWarning size={18} />
          <span>{notice}</span>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Dismiss" onClick={() => setNotice(null)}><IconClose size={16} /></button>
        </div>
      )}
      {crashToast && !s.error && !notice && (
        <div className="toast" role="status">
          <IconWarning size={18} />
          <span>The page crashed last time.</span>
          <button type="button" className="link-btn" onClick={() => { setCrashToast(false); setAboutOpen(true); }}>Details</button>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Dismiss" onClick={() => setCrashToast(false)}><IconClose size={16} /></button>
        </div>
      )}
      {s.error && (
        <div className="toast" role="alert">
          <IconWarning size={18} />
          <span>{s.error}</span>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Dismiss" onClick={() => studio.clearError()}><IconClose size={16} /></button>
        </div>
      )}

      <video ref={videoRef} className="source-video" muted playsInline aria-hidden="true" />
      <input ref={motionLogRef} type="file" accept=".gcsv,.csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) studio.setMotionLog(f); }} />
      <input ref={fileInputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; openFiles(files); }} />

      {batch && (
        <BatchSheet open={batchOpen} onClose={() => setBatchOpen(false)} onSingle={() => { setBatchOpen(false); setExportOpen(true); }}
          studio={studio} snap={s} items={batch} setItems={(fn) => setBatch((b) => (b ? fn(b) : b))} tools={tools} openItem={openOne} />
      )}
      <ExportSheet open={exportOpen} onClose={() => { setExportOpen(false); if (s.exp.state === "done" || s.exp.state === "error") studio.dismissExport(); }} studio={studio} snap={s} tools={tools} />

      <IntroSheet open={introOpen} onClose={closeIntro}
        onSample={s.phase === "empty" ? () => { closeIntro(); openSample(); } : null}
        onOpen={s.phase === "empty" ? () => { closeIntro(); pick(); } : null} />
      <FeedbackSheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} context={feedbackContext} />

      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title={BRAND.name}>
        <div className="about">
          <div className="about__actions">
            <button type="button" className="btn btn--ghost" onClick={openFeedback}>Send feedback</button>
            <button type="button" className="btn btn--ghost" onClick={() => { setAboutOpen(false); setIntroOpen(true); }}>How it works</button>
          </div>
          {donateUrl() && (
            <p className="about__support">
              DiveGrade is free. If it saved a dive, you can{" "}
              <a href={donateUrl()} target="_blank" rel="noopener noreferrer">buy the developer a coffee ☕</a>.
            </p>
          )}
          <div className="adv__field">
            <span className="adv__label" id="appearance-label">Appearance</span>
            <Segmented label="Appearance" items={THEMES} value={theme} onChange={setTheme} />
          </div>
          <p>{BRAND.tagline} Everything runs on this device: nothing is uploaded.{BRAND.beta ? " It is in beta: some things will break, and Send feedback tells us which." : ""}</p>
          <ul className="about__list">
            <li><b>Colour</b> physically based underwater correction (backscatter removal, range-adaptive white balance), locked per scene across the clip.</li>
            <li><b>Stabilise</b> feature tracking with an L1-optimal camera path and wobble suppression.</li>
            <li><b>Dewarp</b> calibrated fisheye lens profiles (Gyroflow, CC0) to straight lines.</li>
            <li><b>Photos</b> JPEG, PNG and HEIC (where the browser reads it) get Colour and Dewarp, saved as a full-resolution JPEG that keeps the original's date, location and camera details.</li>
            <li><b>Phone 0.5×</b> ultra-wide shots from an iPhone or Android phone: Dewarp un-stretches people and things at the edges and keeps vertical lines straight (on by itself when the photo says it was taken at 0.5×).</li>
            <li><b>Batch</b> pick several photos and videos at once: tweak any of them, then Export all (each one still gets its own colour balance), saved together to Photos on a phone or as one ZIP.</li>
            <li><b>10-bit, HDR and log</b> HLG / PQ (iPhone, GoPro, Osmo HDR), DJI D-Log M and Apple Log are converted to standard Rec.709 before the tools run; exports are 8-bit SDR.</li>
          </ul>
          <p className="about__fine">
            Your photos and videos never leave this device. The app counts anonymous usage (page opens, exports, AI on) to improve it: no files, names or locations.{" "}
            <button type="button" className="link-btn" onClick={() => { setAnalyticsOptOut(!analyticsOff); setAnalyticsOff(!analyticsOff); }}>{analyticsOff ? "Turn usage counts back on" : "Turn off usage counts"}</button>
          </p>
          <p className="about__fine">
            {s.engine === "webgpu" ? "WebGPU" : s.engine === "webgl2" ? "WebGL2" : s.engine === "failed" ? "No GPU" : "GPU starting"}
            {" · "}
            {s.exportMode === "realtime" ? "real-time export (plays the clip through once)" : s.exportMode === "native" ? "native hardware encoder" : "WebCodecs export"}
            {" · "}{BRAND.beta ? "beta " : ""}{"build "}{__BUILD_ID__}
          </p>
          {aiPass && (
            <div className="about__credit">
              <h3>Last AI subject pass</h3>
              <p>Where its time went on this device (send it to the developer):</p>
              <pre className="crash-log" data-testid="ai-profile">{aiPass.split(" · ").join("\n")}</pre>
              <div className="about__actions">
                <button type="button" className="btn btn--quiet" onClick={() => void navigator.clipboard?.writeText(aiPass).catch(() => undefined)}>Copy</button>
              </div>
            </div>
          )}
          {crash && (
            <div className="about__credit">
              <h3>Last session crashed</h3>
              <p>Its last steps (send them to the developer):</p>
              <pre className="crash-log">{crash.join("\n")}</pre>
              <div className="about__actions">
                <button type="button" className="btn btn--ghost" onClick={openFeedback}>Send report</button>
                <button type="button" className="btn btn--quiet" onClick={() => void navigator.clipboard?.writeText(crash.join("\n")).catch(() => undefined)}>Copy</button>
              </div>
            </div>
          )}
          <div className="about__credit">
            <h3>Sample clip</h3>
            <p>
              <a href={SAMPLE.url} target="_blank" rel="noreferrer">{SAMPLE.title}</a> by {SAMPLE.author}, {SAMPLE.licence.name === "CC0" ? "" : "licensed under "}
              <a href={SAMPLE.licence.url} target="_blank" rel="noreferrer">{SAMPLE.licence.name}</a>. {SAMPLE.note}
            </p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
