// The Studio session: owns the clip (or photo), the render graph and the
// exporters, and publishes a snapshot the React shell renders
// (useSyncExternalStore).
//
// Render graph (see ARCHITECTURE.md):
//
//   source ─┬─▶ GeometryRenderer (dewarp + stabilise, one WebGL2 pass) ─┬─▶ [geo canvas]   colour off
//           │                                                         └─▶ GradeEngine ─▶ [colour canvas]
//           └─▶ GradeEngine directly (no geometry tool on: zero extra copies)
//
// The colour engine is Aqua Fix's (apps/aqua-fix/src/engine), the motion
// analysis/path solver Motion Fix's, the lens model Dewarp's: imported, not
// forked, and each loaded as its own chunk the first time it is needed
// (colour right after first paint, mediabunny when a clip opens, motion when
// Stabilise is switched on, the lens maths when Dewarp is).

import { isRealtimeExportSupported, isWebCodecsSupported, isWebKit } from "./env.ts";
import { bitrateFromSource, pickBitrate } from "@dive-tools/shared/recorder.ts";
import { touchFile, validateUploadedFile } from "@dive-tools/shared/file-validate.ts";
import type { Rotation } from "../../../aqua-fix/src/engine/backend.ts";
import { pickAnimal, type SubjectOverride, type SubjectPathPoint, type SubjectSelection } from "../../../aqua-fix/src/engine/animals.ts";
import { toggleOverride } from "./subjects.ts";
import { autoObjects, outlineSelection, segPopsAt, SubjectSeg, type SegStatus } from "./seg/studio-seg.ts";
import type { SegOverlay } from "../../../aqua-fix/src/engine/seg-overlay.ts";
import type { WarpUniforms } from "../../../dewarp/src/fisheye.ts";
import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";
import { GeometryRenderer, type GeometryRenderOptions, type GeometrySource } from "./geometry.ts";
import { GpuGeometryRenderer } from "./geometry-gpu.ts";
import type { GeometryParams, QuarterTurns } from "./geometry-math.ts";
import type { ClipInfo } from "./probe.ts";
import { colourSettings, DEFAULT_TOOLS, exportSuffix, solveParams, type ColourLook, type ToolsState } from "./tools.ts";
import { activeCuts, lockWithCuts, lookIndexAt, topUpTimes, visibleSegments, type Segments } from "./segments.ts";
import { bobbingNote, stabInfo, stabSummary, type StabInfo } from "./stab-info.ts";
import { seekVideo, waitForEvent, waitForFirstFrame, type VideoWithRVFC } from "./video.ts";
import { decodePhoto, encodeJpeg, isPhotoFile, photoLimits } from "./photo.ts";
import { readExif, withExif } from "./photo-exif.ts";
import { canvasFrameFix } from "@dive-tools/shared/frame-orientation.ts";
import { releaseExportBlob } from "@dive-tools/shared/output-sink.ts";
import { exportSettingsKey } from "./export-key.ts";
import { ExportProfile } from "@dive-tools/shared/export-profile.ts";
import { AnalysisLookahead } from "./lookahead.ts";
import { PROFILE_SAMPLE_BUDGETS_MS, withRetries } from "./profile-retry.ts";
import { detectFootage, FOOTAGE_LABEL, FOOTAGE_MODE, isHdrProfile, parseCodec, resolveFootage, type FootageChoice, type FootageInfo, type FootageProfile } from "./footage.ts";
import type { CalibKind, SignalCalibration } from "./signal-probe.ts";
import { isNativeShell, nativeFileOf, type NativeFileRef } from "../native/registry.ts";
import { analysisSpan, clampToRange, effectiveTrim, filmstripTimes, loopTarget, outputLength, rangeTimes, spanServes, type TrimRange } from "./trim.ts";

type ColourMod = typeof import("./colour.ts");
type MediaMod = typeof import("./media.ts");
type MotionMod = typeof import("./motion.ts");
type DewarpMod = typeof import("./dewarp.ts");
type Engine = import("./colour.ts").GradeEngine;
type AnalysisResult = import("./motion.ts").AnalysisResult;
type Plan = import("./motion.ts").Plan;
type AnalysisClient = import("./motion.ts").AnalysisClient;

const loadColour = (): Promise<ColourMod> => import("./colour.ts");
const loadMedia = (): Promise<MediaMod> => import("./media.ts");
const loadMotion = (): Promise<MotionMod> => import("./motion.ts");
const loadDewarp = (): Promise<DewarpMod> => import("./dewarp.ts");
type NativeMod = typeof import("../native/bridge.ts");
/** The Capacitor bridge helpers: only ever loaded inside the native app (apps/mobile). */
const loadNative = (): Promise<NativeMod> => import("../native/bridge.ts");

/** Preview renders at the stage's device-pixel size, capped; never at 4K unless zoomed in. */
const PREVIEW_MAX_PX = 1600;
const PREVIEW_ZOOM_MAX_PX = 4096;
const PHOTO_PREVIEW_PX = 2048;
const OPFS_PREFIX = "studio-export-";
/** Live export frames for the stage / sheet: a few a second. */
const LIVE_EVERY_MS = 250;
/** Filmstrip under the trim handles: this many thumbnails, this tall (px), decoded once per clip. */
const FILMSTRIP_COUNT = 10;
const FILMSTRIP_PX = 80;
/** A committed trim change waits this long before analysis re-runs (another drag may follow). */
const TRIM_SETTLE_MS = 500;
/** Subject pop track pass: one analysis every this many clip seconds, at most this far either side of the tap. */
const SUBJECT_STEP_S = 0.25;
const SUBJECT_REACH_S = 20;
/** A paused seek re-analyses its frame once the seeking settles (ms). */
const PAUSED_ANALYSIS_MS = 120;

export type MediaKind = "video" | "photo";
/**
 * offline: WebCodecs decode → render → encode in the page; realtime: WebKit
 * canvas recorder; native: decode + render in the page, encode in the app
 * (AVAssetWriter / MediaCodec, apps/mobile); photo: one JPEG.
 */
export type ExportMode = "offline" | "realtime" | "native" | "photo";

export type StabStatus = {
  state: "off" | "analysing" | "solving" | "ready" | "error";
  progress: number;
  summary: string | null;
  message: string | null;
  /** Which path ran (gyro / visual), why, and what the Advanced sheet can offer. */
  info: StabInfo | null;
  /** The bobbing (hybrid) pass on gyro clips: tracks the picture after the gyro result is shown. */
  refine: "idle" | "running" | "done" | "unavailable";
  refineProgress: number;
  /** Short line for the panel: progress, result, or why the clip stayed gyro-only. */
  bobbing: string | null;
  /** File name of the motion log (.gcsv / Sensor Logger CSV) added for this clip, if any. */
  motionLog: string | null;
};
export type ExportStatus = {
  state: "idle" | "preparing" | "running" | "done" | "error";
  progress: number;
  frames: number;
  fps: number;
  etaSec: number | null;
  detail: string;
  message: string | null;
  result: ExportResult | null;
  /** Why the output differs from the source (downscaled for this device's encoder), or that it resumed. */
  note: string | null;
  /** Held while the page is in the background (resumes when it is back). */
  paused: boolean;
  /** Per-stage timing line of the running / last offline export (shown with ?debug=1). */
  profile: string | null;
};

/** Export options from the sheet's fallbacks. */
export type ExportRequest = { maxLongEdge?: number };

export type ExportResult = {
  /** The file in page memory (web exports); null when the native encoder wrote it. */
  blob: Blob | null;
  /** The file in the app sandbox (native exports, or a web export once saved/shared in the app). */
  native: NativeFileRef | null;
  bytes: number;
  mime: string;
  name: string;
  /** Object URL (web) or WebView URL of the sandbox file (native). */
  url: string;
  frames: number;
  elapsedMs: number;
  audioIncluded: boolean;
  width: number;
  height: number;
};

export type Snapshot = {
  engine: "starting" | "webgpu" | "webgl2" | "failed";
  phase: "empty" | "loading" | "ready";
  kind: MediaKind | null;
  fileName: string | null;
  info: ClipInfo | null;
  duration: number;
  currentTime: number;
  playing: boolean;
  /** Short status for the stage pill ("Reading clip…", "Profiling colour…"). */
  busy: string | null;
  colourProfiled: boolean;
  stab: StabStatus;
  visible: "colour" | "geo";
  error: string | null;
  exp: ExportStatus;
  canExport: boolean;
  /** How the next export runs: offline WebCodecs (Chrome, Android), real-time recorder (WebKit), or a JPEG. */
  exportMode: ExportMode;
  /** Photo export was scaled to the browser's canvas limit (original px). */
  photoLimited: { w: number; h: number } | null;
  /** Camera / lens the clip's metadata names (Dewarp's detector); null until read, or for photos. */
  camera: CameraInfo | null;
  /** Footage profile: what the clip is (detected), what the user chose, what runs. */
  footage: FootageStatus;
  /** The in/out selection (clip seconds); null = the whole clip. Export, analysis and the preview loop use it. */
  trim: TrimRange | null;
  /** Filmstrip thumbnails (object URLs, "" for a frame that didn't decode); null until decoded or unavailable. */
  thumbs: string[] | null;
  /**
   * Split points (clip seconds) and each region's colour settings (segments.ts).
   * No cuts = one segment that uses tools.colour, exactly as before splits existed.
   */
  segments: Segments<ColourLook>;
  /**
   * Subject pop corrections for this clip (tap to include / exclude an animal; animals.ts SubjectOverride),
   * kept with the clip like trim and splits and used in preview and every export.
   */
  subjectOverrides: SubjectOverride[];
  /** Subject pop track pass in progress (a tapped subject followed through the clip), 0..1; null when idle. */
  subjectTracking: number | null;
  /** A short note about the latest tap (e.g. nothing to follow there); null when none. */
  subjectNote: string | null;
  /** AI subject detection (beta, Subject pop): toggle, model download and ML track pass (seg/studio-seg.ts). */
  seg: SegStatus;
  /** Subject taps that can be undone (newest last). */
  subjectUndo: number;
};

const NO_SEGMENTS: Segments<ColourLook> = { cuts: [], looks: [] };

export type FootageStatus = {
  choice: FootageChoice;
  info: FootageInfo | null;
  /** The conversion in effect (after the choice; "standard" = none). */
  active: FootageProfile;
  /** One line for the UI, e.g. "DJI D-Log M → Rec.709"; null for plain SDR. */
  note: string | null;
};
const FOOTAGE_NONE: FootageStatus = { choice: "auto", info: null, active: "standard", note: null };

/** `?footage=dlogm|hlg|…` forces a profile (headless checks). */
function initialFootage(): FootageChoice {
  const q = new URLSearchParams(location.search).get("footage");
  return q && (q === "auto" || q in FOOTAGE_MODE) ? (q as FootageChoice) : "auto";
}

/** Plain-language reason a clip can't be decoded here, from its codec string (null: nothing specific to say). */
export function codecHelp(codecString: string | null | undefined): string | null {
  const c = parseCodec(codecString);
  if (c.family === "hevc") {
    return `This clip is ${c.label} (H.265${c.bitDepth > 8 ? `, ${c.bitDepth}-bit` : ""}) and this browser can't decode it. HEVC plays in Safari on Mac, iPhone and iPad, and in Chrome or Edge on Mac, Windows and Android with hardware decoding (not on Linux). Open it there, or set the camera to H.264.`;
  }
  if (c.family === "prores") return "ProRes (e.g. iPhone Apple Log) only decodes in Safari on a Mac. Export it as HEVC or H.264 from Photos or an editor first.";
  if (c.family === "avc" && c.bitDepth > 8) return "10-bit H.264 (High 10) isn't decoded by browsers. Re-encode it as HEVC or 8-bit H.264.";
  if (c.family === "av1" || c.family === "vp9") return `This ${c.label} clip needs a newer browser to decode.`;
  return null;
}

const IDLE_EXPORT: ExportStatus = { state: "idle", progress: 0, frames: 0, fps: 0, etaSec: null, detail: "", message: null, result: null, note: null, paused: false, profile: null };
const STAB_OFF: StabStatus = { state: "off", progress: 0, summary: null, message: null, info: null, refine: "idle", refineProgress: 0, bobbing: null, motionLog: null };

/** Real-time recorder default: WebKit (offline capture is ~10 fps there); `?rt=1` / `?rt=0` force it. */
function wantRealtime(): boolean | null {
  const q = new URLSearchParams(location.search).get("rt");
  if (q === "1") return true;
  if (q === "0") return false;
  return null;
}

export class Studio {
  private snap: Snapshot = {
    engine: "starting",
    phase: "empty",
    kind: null,
    fileName: null,
    info: null,
    duration: 0,
    currentTime: 0,
    playing: false,
    busy: null,
    colourProfiled: false,
    stab: STAB_OFF,
    visible: "colour",
    error: null,
    exp: IDLE_EXPORT,
    canExport: false,
    exportMode: "offline",
    photoLimited: null,
    camera: null,
    footage: FOOTAGE_NONE,
    trim: null,
    thumbs: null,
    segments: NO_SEGMENTS,
    subjectOverrides: [],
    subjectTracking: null,
    subjectNote: null,
    seg: { on: false, phase: "off", progress: null, note: null },
    subjectUndo: 0,
  };
  private listeners = new Set<() => void>();
  private frameListeners = new Set<(b: ImageBitmap) => void>();

  private colour: ColourMod | null = null;
  private motion: MotionMod | null = null;
  private dewarpMod: DewarpMod | null = null;
  private engine: Engine | null = null;
  private enginePromise: Promise<Engine | null> | null = null;
  private geo: GeometryRenderer | null = null;
  /** The geometry pass in the colour engine's own GL context (WebGL2 backend): draws straight into its source. */
  /** Bumped whenever the profile samples go stale (a framing change): a profile run in flight retakes them. */
  private profileEpoch = 0;
  private geoShared: { geo: GeometryRenderer; gl: WebGL2RenderingContext } | null = null;
  /** The geometry pass on the colour engine's WebGPU device (geometry-gpu.ts): renders into its source. */
  private geoGpu: { geo: GpuGeometryRenderer; device: GPUDevice } | null = null;
  private video: HTMLVideoElement | null = null;
  private stabClient: AnalysisClient | null = null;
  private analysis: AnalysisResult | null = null;
  private path: Plan | null = null;
  private stabAbort: AbortController | null = null;
  private refineAbort: AbortController | null = null;
  private solveSeq = 0;
  private solveTimer = 0;

  private tools: ToolsState = DEFAULT_TOOLS;
  private dewarpU: WarpUniforms | null = null;
  private split: number | null = null;
  /** Pending split repaint (one per frame) and whether the engine holds the raw frame as its "before" picture. */
  private splitRaf = 0;
  private beforeSet = false;
  private file: File | null = null;
  /** Sidecar motion log for the open clip (Stabilise › Advanced), used instead of the clip's own telemetry. */
  private motionLog: File | null = null;
  private photo: ImageBitmap | null = null;
  /** The photo at ≤ PHOTO_PREVIEW_PX: what the preview and the analysis use (full size only when zoomed in or exporting). */
  private photoPreview: ImageBitmap | null = null;
  private sourceUrl: string | null = null;
  private gen = 0;
  private still: ImageBitmap | null = null;
  private previewOn = false;
  private exporting = false;
  private exportAbort: AbortController | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private stage = { w: 0, h: 0, dpr: 1 };
  private zoom = 1;
  private profiling: Promise<void> | null = null;
  private lastTimeEmit = 0;
  private photoAnalyseTimer = 0;
  private footageChoice: FootageChoice = initialFootage();
  /** How this browser hands this clip kind's signal to WebGL (signal-probe.ts); null = not measured (assume raw). */
  private signal: SignalCalibration | null = null;
  /** createImageBitmap(<video>) converts this clip's colour differently from a texture upload: don't paint paused stills. */
  private stillsUnsafe = false;
  /** Effective trim (null = whole clip); mirrored in the snapshot. */
  private trim: TrimRange | null = null;
  private trimTimer = 0;
  /** What the loaded motion analysis / colour profile were computed over (null = the whole clip). */
  private analysedSpan: TrimRange | null = null;
  private profiledSpan: TrimRange | null = null;
  /** Span of the motion analysis in flight. */
  private pendingSpan: TrimRange | null = null;
  private thumbAbort: AbortController | null = null;
  /** Split points and per-region looks; mirrored in the snapshot. */
  private segs: Segments<ColourLook> = NO_SEGMENTS;
  /** Profile samples already taken for this clip and colour input (a new split only samples what it lacks). */
  private sampleCache: import("./colour.ts").ProfileSample[] = [];
  /** The automatic scene lock of the last profile (before the user's cuts are forced in) and its samples. */
  private autoLock: { lock: Parameters<Engine["lockGlobals"]>[0]; samples: import("./colour.ts").ProfileSample[] } | null = null;
  /** Region index of the last frame drawn (preview) / encoded (export): a change forces a fresh analysis. */
  private lastLook = -1;

  // ------------------------------------------------------------ store

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): Snapshot => this.snap;
  private set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }
  private setExp(patch: Partial<ExportStatus>): void {
    this.set({ exp: { ...this.snap.exp, ...patch } });
  }
  private setStab(patch: Partial<StabStatus>): void {
    this.set({ stab: { ...this.snap.stab, ...patch } });
  }
  /**
   * Live export frames (bitmaps of what is being encoded), for the stage and
   * the export sheet. Listeners draw synchronously; the bitmap is closed after.
   */
  onExportFrame(fn: (b: ImageBitmap) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }
  private async emitFrame(src: VideoFrame | HTMLCanvasElement): Promise<void> {
    if (!this.frameListeners.size) return;
    const w = Math.round(Math.max(480, Math.min(1280, this.stage.w * this.stage.dpr)));
    const bmp = await createImageBitmap(src, { resizeWidth: w, resizeQuality: "low" }).catch(() => null);
    if (!bmp) return;
    for (const l of this.frameListeners) l(bmp);
    bmp.close();
  }

  // ------------------------------------------------------------ lifecycle

  async attach(colourCanvas: HTMLCanvasElement, geoCanvas: HTMLCanvasElement, video: HTMLVideoElement): Promise<void> {
    this.video = video;
    try {
      this.geo = new GeometryRenderer(geoCanvas);
    } catch (e) {
      this.fail(e);
    }
    video.addEventListener("play", () => this.set({ playing: true }));
    video.addEventListener("pause", () => {
      this.set({ playing: false });
      void this.captureStill();
      // Subject pop: the outlines (and the next tap) must match the paused frame, not the last analysis in play.
      if (this.tools.colour.subjectPop) this.schedulePausedAnalysis();
    });
    video.addEventListener("seeked", () => {
      if (this.snap.kind !== "video") return;
      this.set({ currentTime: video.currentTime });
      if (!this.exporting && this.snap.phase === "ready") {
        this.dropStill();
        this.drawLive(video.currentTime, false);
        if (video.paused) {
          void this.captureStill();
          this.schedulePausedAnalysis();
        }
      }
    });
    this.enginePromise = this.startEngine(colourCanvas);
    await this.enginePromise;
  }

  private async startEngine(canvas: HTMLCanvasElement): Promise<Engine | null> {
    const q = new URLSearchParams(location.search);
    try {
      const mod = await loadColour();
      this.colour = mod;
      // WebGL2 by default: the WebGPU path rendered black on iPhone Safari (29 Oct) and can't be checked on the
      // devbox. `?webgpu=1` opts back in while it's being fixed.
      const engine = await mod.GradeEngine.create(canvas, (e) => this.set({ error: e.message }), q.get("webgpu") === "1");
      engine.settings = this.colourFor(this.tools.colour);
      engine.setSubjectOverrides(this.snap.subjectOverrides);
      engine.personEnabled = q.get("person") !== "0";
      engine.temporalEnabled = q.get("temporal") !== "0";
      engine.followEnabled = q.get("follow") !== "0";
      this.engine = engine;
      this.set({ engine: engine.backend.kind });
      return engine;
    } catch (e) {
      this.set({ engine: "failed" });
      this.fail(e, "GPU init failed");
      return null;
    }
  }

  dispose(): void {
    this.teardown();
    this.stabClient?.dispose();
    this.geoShared?.geo.dispose();
    this.geoShared = null;
    this.geoGpu?.geo.dispose();
    this.geoGpu = null;
    this.engine?.dispose();
    this.geo?.dispose();
  }

  private fail(e: unknown, prefix?: string): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.set({ error: prefix ? `${prefix}: ${msg}` : msg });
  }

  clearError(): void {
    this.set({ error: null });
  }

  /**
   * Waits for the engine's in-flight analysis (its GPU readback) to land.
   * `GradeEngine.reset()` forgets the flag but not the readback, so a reset
   * while one is pending makes the next analysis fail ("analysis readback
   * already in flight"). Call with the frame loop stopped.
   */
  private async settleEngine(): Promise<void> {
    await this.engine?.analyzeNow(false, 4000).catch(() => undefined);
  }

  // ------------------------------------------------------------ stage size

  /** CSS size of the picture box and the device pixel ratio; sets the preview resolution. */
  setStageSize(w: number, h: number, dpr: number): void {
    this.stage = { w, h, dpr: Math.min(3, dpr || 1) };
    if (!this.exporting) this.repaint();
  }

  /** Pinch zoom on the stage: the preview renders sharper while zoomed in. */
  setZoom(z: number): void {
    const next = Math.max(1, Math.min(8, z));
    if (Math.abs(next - this.zoom) < 0.01) return;
    this.zoom = next;
    if (!this.exporting) this.repaint();
  }

  private previewSize(): [number, number] {
    const info = this.snap.info;
    if (!info) return [2, 2];
    const cap = this.zoom > 1.01 ? PREVIEW_ZOOM_MAX_PX : PREVIEW_MAX_PX;
    const z = this.zoom;
    const want = Math.min(cap / Math.max(info.displayW, info.displayH), (this.stage.w * this.stage.dpr * z) / info.displayW, (this.stage.h * this.stage.dpr * z) / info.displayH);
    const s = Math.min(1, want > 0 ? want : 1);
    return [Math.max(2, Math.round(info.displayW * s)), Math.max(2, Math.round(info.displayH * s))];
  }

  // ------------------------------------------------------------ tools

  // ------------------------------------------------------------ subject pop corrections

  /** The tracked animals at the current frame (ids per map texel + state) for outlines and hit tests; null when off. */
  subjectSelection(): SubjectSelection | null {
    return this.engine?.subjectSelection() ?? null;
  }

  /** What the tap outlines draw: with AI on, the ML mask at the paused frame over the engine's other animals. */
  outlineSelection(): SubjectSelection | null {
    const t = this.snap.kind === "video" ? this.video?.currentTime ?? 0 : 0;
    return outlineSelection(this.segOverlay(t), this.subjectSelection());
  }

  /**
   * A tap at upright frame position (u, v) (0..1): toggles the animal there out of / into the Subject pop selection,
   * or (on anything the engine did not pick out) asks for a new subject grown from the tap. Playback pauses first
   * and the frame is re-analysed, so the tap acts on what is on screen. A new correction is then followed through
   * the clip (track pass) so it holds wherever the clip is played or exported from. Resolves to the tapped animal's
   * id (0 = none: a seed).
   */
  async toggleSubjectAt(u: number, v: number): Promise<number> {
    if (this.snap.subjectTracking !== null || this.exporting) return 0;
    if (!this.paused()) {
      this.pause();
      await this.refreshSubjects();
    }
    const t = this.snap.kind === "video" ? this.video?.currentTime ?? 0 : 0;
    const before = this.snap.subjectOverrides;
    const { list, follow, id } = toggleOverride(before, this.subjectSelection(), u, v, t);
    this.subjectUndo.push({ overrides: before, ai: false });
    // AI on (video): the tap goes to the background session (session.ts), followed both ways from this frame.
    if (this.snap.kind === "video" && this.seg.live) {
      // The ML decides, whatever the engine's own map says there: a tap on what it pops takes that out, a tap
      // anywhere else (a missed fin inside the engine's animal, a second animal) adds it.
      const pops = segPopsAt(this.segOverlay(t), u, v);
      const action = pops ? "exclude" : "include";
      if (action === "exclude" && follow >= 0 && list[follow].action === "include") list[follow] = { ...list[follow], action: "exclude" };
      this.subjectUndo[this.subjectUndo.length - 1].ai = true;
      this.set({ subjectNote: null, subjectUndo: this.subjectUndo.length });
      // An include leaves the engine's own corrections alone (its toggle there would have taken the animal out).
      if (action === "exclude") this.setSubjectOverrides(list);
      if (action === "include") {
        await this.seg.include(t, u, v, this.engine?.personBoxesNow() ?? []);
        this.set({ subjectNote: "Adding it: AI is following it both ways from here" });
      } else {
        const r = await this.seg.exclude(t, u, v);
        this.set({ subjectNote: r === "removed" ? "Taken out" : "Taking that part out" });
        // A whole subject out: the engine's own selection drops the animal along its path too (else it would tone
        // it where the ML no longer covers it). A part out leaves the engine's animal in.
        if (r !== "removed") this.setSubjectOverrides(before);
        else if (follow >= 0) {
          const run = this.followSubject(follow).finally(() => { if (this.tracking === run) this.tracking = null; });
          this.tracking = run;
        }
      }
      return id;
    }
    this.set({ subjectNote: null, subjectUndo: this.subjectUndo.length });
    this.setSubjectOverrides(list);
    if (follow >= 0) {
      if (this.snap.kind === "video") {
        const run = this.followSubject(follow).finally(() => { if (this.tracking === run) this.tracking = null; });
        this.tracking = run;
      }
      else if (!id) {
        // A photo: the seed grows (or not) in this one analysis.
        await this.refreshSubjects();
        if (!this.subjectSelection()?.animals.some((a) => a.overrideIndex === follow)) {
          this.setSubjectOverrides(this.snap.subjectOverrides.filter((_, i) => i !== follow));
          this.set({ subjectNote: this.openWater ? "Nothing to follow there" : "Subject pop works in open blue water" });
        }
      }
    }
    return id;
  }

  /** Taps so far (oldest first): the corrections before each, and whether it went to the AI session. */
  private subjectUndo: { overrides: SubjectOverride[]; ai: boolean }[] = [];

  /** Undoes the last subject tap: the corrections go back, and the AI session drops (or restores) what it changed. */
  async undoSubjectTap(): Promise<void> {
    const last = this.subjectUndo.pop();
    if (!last) return;
    this.setSubjectOverrides(last.overrides);
    // The bar updates now; the session (busy on a step) takes the undo when it can.
    this.set({ subjectNote: "Undone", subjectUndo: this.subjectUndo.length });
    if (last.ai) await this.seg.undo();
    if (this.paused()) void this.refreshSubjects();
  }

  /**
   * Track pass: follows correction `index` through the clip (inside the trim) forward and back from its tap, one
   * analysis every SUBJECT_STEP_S, and stores the path with it (animals.ts SubjectOverride). An include on nothing
   * the analysis can grow is dropped with a note.
   */
  private async followSubject(index: number): Promise<void> {
    const v = this.video, e = this.engine, o0 = this.snap.subjectOverrides[index];
    if (!v || !e || !o0 || this.snap.kind !== "video") return;
    const gen = this.gen;
    const span = this.trim ?? { start: 0, end: v.duration || 0 };
    const include = o0.action === "include";
    const wasPreview = this.previewOn;
    this.previewOn = false;
    const sample = async (t: number, seed: { u: number; v: number }) => {
      await seekVideo(v, t);
      this.uploadToEngine(v, t, false);
      const r = await e.analyzeRaw(10_000, undefined, include ? [seed] : []);
      if (t === o0.t) this.openWater = (r.params.backdrop ?? 0) > 0;
      return (r.params.backdrop ?? 0) > 0 ? r.animals ?? null : null;
    };
    const total = Math.max(1, Math.ceil((span.end - span.start) / SUBJECT_STEP_S));
    let done = 0;
    this.set({ subjectTracking: 0 });
    let path: SubjectPathPoint[] = [];
    try {
      const am0 = await sample(o0.t, { u: o0.u, v: o0.v }).catch(() => null);
      const start = am0 ? pickAnimal(am0, o0.u, o0.v) : null;
      if (start) {
        path.push({ ...start, t: o0.t });
        for (const dir of [1, -1]) {
          let prev = path[0], vu = 0, vv = 0, misses = 0;
          for (let t = o0.t + dir * SUBJECT_STEP_S; t >= span.start - 1e-3 && t <= span.end + 1e-3 && Math.abs(t - o0.t) <= SUBJECT_REACH_S; t += dir * SUBJECT_STEP_S) {
            if (gen !== this.gen || this.exporting) return;
            this.set({ subjectTracking: Math.min(0.99, ++done / total) });
            const pu = Math.min(1, Math.max(0, prev.u + vu)), pv = Math.min(1, Math.max(0, prev.v + vv));
            const am = await sample(Math.min(span.end, Math.max(span.start, t)), { u: pu, v: pv }).catch(() => null);
            const reach = Math.max(4, Math.round(0.5 * Math.sqrt(prev.a * (am?.width ?? 0) * (am?.height ?? 0))));
            const p = am ? pickAnimal(am, pu, pv, reach, prev.a) : null;
            if (!p) {
              if (++misses >= 2) break;
              continue;
            }
            misses = 0;
            vu = 0.5 * vu + 0.5 * (p.u - prev.u);
            vv = 0.5 * vv + 0.5 * (p.v - prev.v);
            prev = { ...p, t };
            path.push(prev);
          }
        }
        path = path.sort((a, b) => a.t - b.t);
      }
    } finally {
      if (gen === this.gen) {
        const list = this.snap.subjectOverrides.slice();
        const i = list.indexOf(o0);
        if (i >= 0) {
          if (path.length) list[i] = { ...o0, path };
          // AI on: the ML follows it even where the engine finds nothing to grow (a close-up, a blue-on-blue animal).
          else if (include && !this.seg.on) list.splice(i, 1);
        }
        this.set({ subjectTracking: null, subjectNote: !path.length && include && !this.seg.on ? (this.openWater ? "Nothing to follow there" : "Subject pop works in open blue water") : null });
        console.info(`[subjects] ${o0.action} at ${o0.t.toFixed(2)} s: followed ${path.length ? `${path[0].t.toFixed(2)}–${path[path.length - 1].t.toFixed(2)} s (${path.length} samples)` : "nothing"}`);
        this.engine?.setSubjectOverrides(list);
        this.set({ subjectOverrides: list });
        if (!this.exporting) {
          await seekVideo(v, o0.t).catch(() => undefined);
          if (wasPreview) this.startPreview();
          await this.refreshSubjects();
        }
      }
    }
  }

  /** AI subject detection toggle (per device; `?seg=ml` forces it on). The model downloads the first time. */
  setSegEnabled(on: boolean): void {
    this.seg.setOn(on);
    // Paused: the frame is analysed afresh first (refreshSubjects starts the pass), so the engine's own choice the
    // ML follows is this frame's.
    if (on) { if (this.paused() && this.snap.kind === "video") void this.refreshSubjects(); else this.runSeg(); }
    else this.repaint();
  }

  /**
   * AI subject detection: opens the clip's background session (seg/session.ts: the worker decodes the file itself,
   * so it runs while the clip plays) and seeds the engine's own subjects once there are some. Cheap to call often.
   */
  private runSeg(): void {
    const v = this.video, file = this.file;
    if (!this.seg.on || !v || !file || this.snap.kind !== "video" || this.exporting) return;
    void this.seg.start(file, v.duration || this.snap.duration).then((live) => {
      if (!live || this.seg.autos || this.file !== file) return;
      const a = autoObjects(this.subjectSelection(), v.currentTime, this.engine?.personBoxesNow() ?? []);
      if (a.length) void this.seg.seedAutos(a);
    });
  }
  private segKick = 0;

  /** The ML overlay for the frame at clip time t (null: the engine's own subject masks). */
  private segOverlay(t: number): SegOverlay | null {
    const o = this.tools.colour.subjectPop && this.snap.kind === "video" ? this.seg.overlayAt(t) : null;
    return o && this.geometryActive() ? this.mapSegOverlay(o, t) : o;
  }

  private segGeo: { r: GeometryRenderer; src: HTMLCanvasElement; read: CanvasRenderingContext2D; t: number; o: SegOverlay; out: SegOverlay } | null = null;
  /**
   * The AI masks are made on the upright source frame; with Stabilise / Dewarp on the engine grades the frame after
   * the geometry pass, so the masks go through the same warp (a small second geometry renderer at mask size).
   */
  private mapSegOverlay(o: SegOverlay, t: number): SegOverlay {
    const info = this.snap.info;
    if (!info) return o;
    try {
      if (!this.segGeo) {
        const c = document.createElement("canvas"), src = document.createElement("canvas"), rd = document.createElement("canvas");
        this.segGeo = { r: new GeometryRenderer(c), src, read: rd.getContext("2d", { willReadFrequently: true })!, t: NaN, o, out: o };
      }
      const g = this.segGeo;
      if (g.o === o && g.t === t) return g.out;
      const w = o.width, h = o.height;
      g.src.width = w; g.src.height = h;
      g.r.resize(w, h);
      g.read.canvas.width = w; g.read.canvas.height = h;
      const pass = (r: Float32Array, gch: Float32Array | null, b: Float32Array | null): Uint8ClampedArray => {
        const img = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) { img.data[i * 4] = r[i] * 255; img.data[i * 4 + 1] = gch ? gch[i] * 255 : 0; img.data[i * 4 + 2] = b ? b[i] * 255 : 0; img.data[i * 4 + 3] = 255; }
        g.src.getContext("2d")!.putImageData(img, 0, 0);
        g.r.render(g.src, this.geoParams(t, info.rot), { texCoded: false, split: null, footage: 0, highPrecision: false });
        g.read.drawImage(g.r.canvas, 0, 0);
        return g.read.getImageData(0, 0, w, h).data;
      };
      const a = pass(o.alpha, o.near, o.depart ?? null);
      const ex = o.exclude ? pass(o.exclude, null, null) : null;
      const ch = (d: Uint8ClampedArray, c: number) => { const f = new Float32Array(w * h); for (let i = 0; i < w * h; i++) f[i] = d[i * 4 + c] / 255; return f; };
      const out: SegOverlay = { width: w, height: h, alpha: ch(a, 0), near: ch(a, 1), depart: o.depart ? ch(a, 2) : null, exclude: ex ? ch(ex, 0) : null };
      Object.assign(g, { t, o, out });
      return out;
    } catch {
      return o;
    }
  }

  /**
   * Re-analyses the paused frame and snaps the maps and the animals to it (a paused frame has nothing to ease
   * from), so the picture, the outlines and the next tap all match what is on screen.
   */
  async refreshSubjects(): Promise<void> {
    const e = this.engine;
    if (!e || !this.paused() || this.exporting || this.snap.phase !== "ready" || !this.tools.colour.enabled) return;
    const t = this.snap.kind === "video" ? this.video?.currentTime ?? 0 : 0;
    e.setTime(t);
    if (this.snap.kind === "video" && this.video) this.uploadToEngine(this.still ?? this.video, t, true);
    await e.analyzeNow(true).catch(() => undefined);
    this.openWater = e.openWater();
    this.repaint();
    if (this.snap.kind === "video" && this.seg.on) this.runSeg();
  }

  private pausedTimer = 0;
  /** The latest Subject pop analysis of a tapped frame found open blue water (for the tap's note). */
  private openWater = true;
  /** The running Subject pop track pass (an export waits for it). */
  private tracking: Promise<void> | null = null;
  /** AI subject detection (beta): the ML segmenter's toggle, model and pass; null overlay = the engine's masks. */
  private seg = (() => {
    const s = new SubjectSeg(() => this.set({ seg: this.seg.status }));
    // New AI frames: a paused frame shows them (and its outlines) right away.
    let last = 0;
    s.onRejected = () => this.set({ subjectNote: "Nothing found there: tap right on the animal" });
    s.onFrames = () => { const now = performance.now(); if (now - last > 250 && this.paused()) { last = now; this.repaint(); } };
    return s;
  })();
  /**
   * A seek while paused shows a frame the maps were not made for (the last analysis is of another frame: a stale
   * subject map draws a ghost shape): once the seeking settles, the frame is analysed and snapped to.
   */
  private schedulePausedAnalysis(): void {
    clearTimeout(this.pausedTimer);
    this.pausedTimer = window.setTimeout(() => {
      if (this.profiling || this.snap.subjectTracking !== null || this.exporting || !this.paused()) return;
      void this.refreshSubjects();
    }, PAUSED_ANALYSIS_MS);
  }

  /** Replaces the clip's Subject pop corrections (undo; [] = back to the automatic selection). */
  setSubjectOverrides(list: SubjectOverride[]): void {
    this.set({ subjectOverrides: list });
    this.engine?.setSubjectOverrides(list);
    if (!this.tracking) this.runSeg();
    this.animateSubjects();
  }

  private paused(): boolean {
    return this.snap.kind === "photo" || !this.video || this.video.paused;
  }

  private subjectAnim = 0;
  /** A paused frame has no clip time to ease on: eases the animals' strengths on wall time and repaints. */
  private animateSubjects(): void {
    const e = this.engine;
    if (!e || !this.paused()) return;
    cancelAnimationFrame(this.subjectAnim);
    const t0 = performance.now();
    let last = t0;
    const step = (now: number) => {
      const easing = e.stepSubjects(Math.min(0.1, (now - last) / 1000));
      last = now;
      this.repaint();
      if (easing && now - t0 < 2500 && this.paused()) this.subjectAnim = requestAnimationFrame(step);
    };
    this.subjectAnim = requestAnimationFrame(step);
  }

  /** Engine settings for the colour tool (debug `?pop=1` forces Subject pop on for headless checks). */
  private colourFor(c: Parameters<typeof colourSettings>[0]) {
    const s = colourSettings(c);
    if (new URLSearchParams(location.search).get("pop") === "1") s.subjectPop = true;
    return s;
  }

  setTools(next: ToolsState): void {
    const prev = this.tools;
    this.tools = next;
    const e = this.engine;
    if (e) e.settings = this.settingsAt(this.video?.currentTime ?? 0);
    // The profile samples what the colour engine is fed: a new framing makes them stale for later top-ups.
    if (next.dewarp !== prev.dewarp || next.stabilise.enabled !== prev.stabilise.enabled) { this.sampleCache = []; this.profileEpoch++; this.engine?.forgetProfile(); }
    const info = this.snap.info;
    if (info && (next.dewarp !== prev.dewarp || !this.dewarpU)) void this.updateDewarp();
    const video = this.snap.kind === "video";
    if (this.snap.phase === "ready" && video) {
      if (next.colour.enabled && !this.snap.colourProfiled && !this.profiling) void this.profileColour();
      // Cuts placed while Colour was off: their locks are built now.
      else if (next.colour.enabled && !prev.colour.enabled && this.segs.cuts.length) this.relock();
      if (next.stabilise.enabled && !this.analysis && !this.stabAbort) void this.analyseMotion();
      const a = next.stabilise, b = prev.stabilise;
      if (a.visual !== b.visual && (this.analysis || this.stabAbort)) {
        // Gyro data ↔ visual tracking: a different analysis, not just a re-solve.
        this.stabAbort?.abort();
        this.stabAbort = null;
        this.cancelRefine();
        this.analysis = null;
        this.path = null;
        if (a.enabled) void this.analyseMotion();
      } else if (a.enabled && this.analysis) {
        const outputChanged = this.analysis.mode === "gyro" && next.dewarp.enabled !== prev.dewarp.enabled;
        if (a.strength !== b.strength || a.maxCrop !== b.maxCrop || a.keepLevel !== b.keepLevel || a.lens !== b.lens || a.bobbing !== b.bobbing || outputChanged) this.scheduleSolve();
        if (a.bobbing !== false && b.bobbing === false) this.maybeRefine();
      }
    }
    this.set({ visible: next.colour.enabled ? "colour" : "geo" });
    // A photo has no frame loop: a framing change needs a fresh analysis.
    if (this.snap.kind === "photo" && (next.dewarp !== prev.dewarp || next.colour.enabled !== prev.colour.enabled || !!next.colour.subjectPop !== !!prev.colour.subjectPop)) this.schedulePhotoAnalysis();
    // Subject pop switched on a paused frame: its animals are found now (the frame loop is not running).
    else if (this.snap.kind === "video" && !!next.colour.subjectPop !== !!prev.colour.subjectPop) this.schedulePausedAnalysis();
    this.repaint();
  }

  private async updateDewarp(): Promise<void> {
    const info = this.snap.info;
    if (!info) return;
    if (!this.tools.dewarp.enabled) {
      this.dewarpU = null;
      return;
    }
    const gen = this.gen;
    const mod = this.dewarpMod ?? (this.dewarpMod = await loadDewarp());
    if (gen !== this.gen || !this.snap.info) return;
    const t = this.tools.dewarp;
    this.dewarpU = t.enabled ? mod.dewarpUniforms(t, this.snap.info.codedW, this.snap.info.codedH, this.snap.camera) : null;
    if (this.snap.kind === "photo") this.schedulePhotoAnalysis();
    this.repaint();
  }

  setSplit(split: number | null): void {
    this.split = split;
    // One paint per frame however fast the pointer moves. A paused frame only
    // re-composites the wipe over the last graded frame: no upload, geometry,
    // temporal pass or grade.
    if (this.splitRaf) return;
    this.splitRaf = requestAnimationFrame(() => {
      this.splitRaf = 0;
      if (!this.recompositeSplit()) this.repaint();
    });
  }

  private recompositeSplit(): boolean {
    const e = this.engine;
    if (!e || !this.tools.colour.enabled || this.exporting || this.snap.phase !== "ready") return false;
    if (this.snap.kind === "video" && !this.video?.paused) return false;
    // Behind a geometry pass the raw frame is handed to the engine only while the wipe is on.
    if (this.geometryActive() && this.split !== null && !this.beforeSet) return false;
    return e.recomposite(this.split ?? 0);
  }

  // ------------------------------------------------------------ open

  async openUrl(url: string, name: string): Promise<void> {
    try {
      this.set({ busy: "Downloading sample…", error: null });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`sample unavailable (${res.status})`);
      const blob = await res.blob();
      await this.open(new File([blob], name, { type: blob.type || "video/mp4" }));
    } catch (e) {
      this.set({ busy: null });
      this.fail(e, "Could not load the sample");
    }
  }

  async open(file: File): Promise<void> {
    const v = this.video;
    if (!v) return;
    const check = validateUploadedFile(file, isPhotoFile(file) ? "any" : "video");
    if (!check.ok) {
      this.set({ error: check.message });
      return;
    }
    this.set({ busy: "Starting the GPU…", error: null });
    const e = this.engine ?? (await this.enginePromise);
    if (!e) {
      this.set({ busy: null, error: "The GPU engine couldn't start on this device." });
      return;
    }
    // Stop the frame loop and let its last analysis land before the engine is reset.
    this.previewOn = false;
    v.pause();
    if (this.snap.phase === "ready") await this.settleEngine();
    if (isPhotoFile(file)) return this.openPhoto(file, e);
    this.teardown();
    const gen = ++this.gen;
    this.file = file;
    this.set({ phase: "loading", kind: "video", busy: "Reading clip…", error: null, fileName: file.name, colourProfiled: false, exp: IDLE_EXPORT, stab: STAB_OFF, photoLimited: null, camera: null, footage: { ...FOOTAGE_NONE, choice: this.footageChoice }, trim: null, thumbs: null, segments: NO_SEGMENTS, subjectOverrides: [] });
    try {
      await touchFile(file);
      const media = await loadMedia();
      const info = await media.probeClip(file);
      if (gen !== this.gen) return;
      // Which camera / lens (for Dewarp's preselection); only reads the moov box and two samples.
      const cameraP = media.detectClipCamera(file, info?.codedW ?? 0, info?.codedH ?? 0).then((camera) => {
        if (gen !== this.gen) return camera;
        console.info(`[camera] ${camera.brand ? [camera.brand, camera.model, camera.lensMode].filter(Boolean).join(" ") : "unknown"} -> ${camera.profileId ?? "default"} (${camera.evidence.join("; ")})`);
        this.set({ camera });
        void this.updateDewarp();
        return camera;
      });
      // Footage profile (log / HDR / wide gamut): needs the camera brand for log curves cameras tag as Rec.709.
      const camera = await Promise.race([cameraP, new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      if (gen !== this.gen) return;
      const vendorText = await media.readColourModeHints(file).catch(() => null);
      const fInfo = info ? detectFootage({ codec: info.codecString ?? null, tags: info.colorTags ?? null, brand: camera?.brand, model: camera?.model, vendorText }) : null;
      this.signal = null;
      this.stillsUnsafe = false;
      this.setFootageStatus(fInfo);
      if (fInfo) console.info(`[footage] ${fInfo.detected} (${fInfo.evidence.join("; ")})${this.footageChoice !== "auto" ? `, forced ${this.footageChoice}` : ""}`);
      const url = URL.createObjectURL(file);
      this.sourceUrl = url;
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = "auto";
      try {
        await waitForEvent(v, ["loadedmetadata"], ["error"], 20_000, "Could not read this video");
      } catch (err) {
        throw new Error(playerHelp(info) ?? (err as Error).message);
      }
      if (gen !== this.gen) return;
      // iOS only decodes once playback starts: play muted and wait for a frame.
      await v.play().catch(() => undefined);
      await waitForFirstFrame(v, 15_000);
      if (gen !== this.gen) return;
      if (!v.videoWidth) throw new Error(playerHelp(info) ?? "This video has no decodable picture (unsupported codec?)");
      // HDR / wide-gamut tags: learn how this browser hands the signal over before the first frame is drawn.
      const kind = calibKindOf(info?.colorTags);
      if (kind && this.geo) {
        v.pause();
        this.signal = await media.calibrateSignal(kind, parseCodec(info?.codecString).family, this.geo).catch(() => null);
        if (gen !== this.gen) return;
        console.info(`[footage] signal: <video> ${this.signal?.video ?? "?"}, VideoFrame ${this.signal?.frame ?? "?"}${this.signal ? `\n  ${this.signal.log.join("\n  ")}` : ""}`);
        this.stillsUnsafe = await this.stillDiffers(v);
        this.setFootageStatus(this.snap.footage.info);
        await v.play().catch(() => undefined);
      }
      const fallback: ClipInfo = { rot: 0, displayW: v.videoWidth, displayH: v.videoHeight, codedW: v.videoWidth, codedH: v.videoHeight, fps: 30, duration: v.duration, codec: null, hasAudio: false };
      const clip = info ?? fallback;
      e.lockGlobals(null);
      const mode = this.pickExportMode(e, file);
      // The offline exporter decodes with WebCodecs; a clip the <video> element plays may still be beyond it.
      const decodable = isWebCodecsSupported() && clip.canDecode !== false;
      const canExport = mode === "realtime" || ((mode === "native" || mode === "offline") && decodable);
      if (mode !== "realtime" && clip.canDecode === false) console.info("[export] WebCodecs can't decode this clip here; export disabled");
      this.set({ info: clip, duration: v.duration || clip.duration, phase: "ready", currentTime: 0, exportMode: mode, canExport });
      await this.updateDewarp();
      // First frame graded before anything shows, so the clip never flashes uncorrected.
      this.uploadToEngine(v, v.currentTime, false);
      await e.analyzeNow(true).catch((err: unknown) => this.fail(err, "Analysis failed"));
      if (gen !== this.gen) return;
      this.set({ busy: null });
      this.startPreview();
      if (this.tools.colour.enabled) void this.profileColour();
      if (this.tools.stabilise.enabled && !this.stabAbort && !this.analysis) void this.analyseMotion();
      this.buildFilmstrip(media, file, gen);
    } catch (err) {
      if (gen !== this.gen) return;
      this.set({ busy: null, phase: "empty", kind: null, fileName: null, info: null, footage: FOOTAGE_NONE });
      this.fail(err);
    }
  }

  // ------------------------------------------------------------ footage profile

  /** Manual "Footage profile" override ("auto" = detected). Re-profiles the colour (its input changed). */
  setFootage(choice: FootageChoice): void {
    if (choice === this.footageChoice) return;
    this.footageChoice = choice;
    this.setFootageStatus(this.snap.footage.info);
    if (this.snap.kind !== "video" || this.snap.phase !== "ready") return;
    this.dropStill();
    this.sampleCache = [];
    this.profileEpoch++;
    this.engine?.forgetProfile();
    if (this.tools.colour.enabled && this.engine && !this.exporting) {
      this.engine.lockGlobals(null);
      this.set({ colourProfiled: false });
      if (!this.profiling) void this.profileColour();
    }
    this.repaint();
  }

  private setFootageStatus(info: FootageInfo | null): void {
    const choice = this.footageChoice;
    const active = this.snap.kind === "photo" ? "standard" : resolveFootage(choice, info);
    let note: string | null = null;
    if (active !== "standard") {
      note = `${FOOTAGE_LABEL[active]} → Rec.709`;
      const s = this.signal;
      if (isHdrProfile(active) || active === "wide") {
        if (s?.video === "browser") note += " · preview tone-mapped by the browser";
        if (s?.frame === "browser") note += " · export tone-mapped by the browser";
      }
    } else if (info && info.bitDepth > 8) note = `${info.codecLabel ?? "10-bit"} · Rec.709`;
    this.set({ footage: { choice, info, active, note } });
  }

  /**
   * Shader mode of the footage transform for a source path. A path the
   * browser already converts to SDR (signal-probe.ts) gets none for the
   * transfers it handled (HDR, BT.2020); log curves always need it.
   */
  private footageMode(path: "video" | "frame"): number {
    const active = this.snap.footage.active;
    if (active === "standard") return 0;
    const sig = path === "video" ? this.signal?.video : this.signal?.frame;
    if (sig === "browser" && (isHdrProfile(active) || active === "wide") && calibKindOf(this.snap.info?.colorTags)) return 0;
    return FOOTAGE_MODE[active];
  }

  private footageActive(): boolean {
    return this.snap.kind === "video" && (this.footageMode("video") !== 0 || this.footageMode("frame") !== 0);
  }

  /** Half-float upload for 10-bit sources whose signal the transform stretches. */
  private highPrecision(mode: number): boolean {
    return mode !== 0 && (this.snap.footage.info?.bitDepth ?? 8) > 8;
  }

  /** True when a still grabbed from the <video> reads differently from the element itself (colour conversion). */
  private async stillDiffers(v: HTMLVideoElement): Promise<boolean> {
    const geo = this.geo;
    if (!geo || !v.videoWidth) return false;
    try {
      const pts: [number, number][] = [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [0.5, 0.25], [0.25, 0.75]];
      const w = 64, h = 36;
      const a = geo.sample(v, w, h, false, pts);
      const bmp = await createImageBitmap(v);
      const b = geo.sample(bmp, w, h, false, pts);
      bmp.close();
      const d = Math.max(...a.flatMap((p, i) => p.map((x, c) => Math.abs(x - b[i][c]))));
      if (d > 0.04) console.info(`[footage] paused stills read ${d.toFixed(2)} off the video element: drawing from the element`);
      return d > 0.04;
    } catch {
      return false;
    }
  }

  private pickExportMode(e: Engine, file: File): ExportMode {
    // In the app, a clip picked natively is encoded natively (decode still
    // runs in the page). `?native=0` keeps the web paths for comparison.
    if (isNativeShell() && nativeFileOf(file) && typeof VideoDecoder !== "undefined" && new URLSearchParams(location.search).get("native") !== "0") return "native";
    const forced = wantRealtime();
    const canRt = isRealtimeExportSupported(e.backend.canvas);
    if (forced !== null) return forced && canRt ? "realtime" : "offline";
    if (isWebKit() && canRt) return "realtime";
    return isWebCodecsSupported() || !canRt ? "offline" : "realtime";
  }

  private async openPhoto(file: File, e: Engine): Promise<void> {
    this.teardown();
    const gen = ++this.gen;
    this.file = file;
    this.signal = null;
    this.set({ phase: "loading", kind: "photo", busy: "Reading photo…", error: null, fileName: file.name, colourProfiled: false, exp: IDLE_EXPORT, stab: STAB_OFF, playing: false, currentTime: 0, duration: 0, camera: null, footage: { ...FOOTAGE_NONE, choice: this.footageChoice }, trim: null, thumbs: null, segments: NO_SEGMENTS, subjectOverrides: [] });
    try {
      await touchFile(file);
      const { bitmap, original } = await decodePhoto(file, photoLimits(isWebKit(), e.backend.kind));
      if (gen !== this.gen) return bitmap.close();
      this.photo = bitmap;
      const ps = Math.min(1, PHOTO_PREVIEW_PX / Math.max(bitmap.width, bitmap.height));
      this.photoPreview = ps < 1
        ? await createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * ps), resizeHeight: Math.round(bitmap.height * ps), resizeQuality: "high" })
        : bitmap;
      if (gen !== this.gen) return;
      const info: ClipInfo = { rot: 0, displayW: bitmap.width, displayH: bitmap.height, codedW: bitmap.width, codedH: bitmap.height, fps: 0, duration: 0, codec: null, hasAudio: false };
      e.lockGlobals(null);
      e.reset();
      const limited = original.w !== bitmap.width || original.h !== bitmap.height ? original : null;
      this.set({ info, phase: "ready", exportMode: "photo", canExport: true, photoLimited: limited });
      await this.updateDewarp();
      if (gen !== this.gen) return;
      await this.analysePhoto();
      if (gen !== this.gen) return;
      this.set({ busy: null, colourProfiled: true });
    } catch (err) {
      if (gen !== this.gen) return;
      this.set({ busy: null, phase: "empty", kind: null, fileName: null, info: null });
      const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
      this.fail(heic ? new Error("This browser can't decode HEIC photos. Open it in Safari, or export it from Photos as JPEG.") : err, heic ? undefined : "Could not open this photo");
    }
  }

  /** One analysis of the (geometry-corrected) photo, snapped: there is no frame loop to ease into it. */
  /** The photo analysis in flight (an export waits for it). */
  private photoAnalysing: Promise<void> | null = null;

  private analysePhoto(): Promise<void> {
    const p = this.analysePhotoNow().finally(() => {
      if (this.photoAnalysing === p) this.photoAnalysing = null;
    });
    this.photoAnalysing = p;
    return p;
  }

  private async analysePhotoNow(): Promise<void> {
    const e = this.engine, bmp = this.photoPreview;
    if (!e || !bmp) return;
    await this.settleEngine();
    if (bmp !== this.photoPreview) return;
    e.reset({ keepPerson: true });
    this.uploadToEngine(bmp, 0, false);
    await e.analyzeNow(true).catch((err: unknown) => this.fail(err, "Analysis failed"));
    this.repaint();
  }

  private schedulePhotoAnalysis(): void {
    clearTimeout(this.photoAnalyseTimer);
    this.photoAnalyseTimer = window.setTimeout(() => {
      this.photoAnalyseTimer = 0;
      if (this.snap.kind === "photo" && !this.exporting) void this.analysePhoto();
    }, 150);
  }

  /** Back to the empty state. */
  close(): void {
    this.teardown();
    this.set({ phase: "empty", kind: null, fileName: null, info: null, duration: 0, currentTime: 0, playing: false, busy: null, colourProfiled: false, exp: IDLE_EXPORT, stab: STAB_OFF, trim: null, thumbs: null, segments: NO_SEGMENTS, subjectOverrides: [] });
  }

  private teardown(): void {
    this.gen++;
    this.seg.reset();
    this.subjectUndo = [];
    this.snap = { ...this.snap, subjectUndo: 0 };
    this.previewOn = false;
    this.exportAbort?.abort();
    this.stabAbort?.abort();
    this.stabAbort = null;
    this.cancelRefine();
    this.analysis = null;
    this.path = null;
    this.motionLog = null;
    this.profiling = null;
    clearTimeout(this.photoAnalyseTimer);
    clearTimeout(this.trimTimer);
    this.trimTimer = 0;
    this.trim = null;
    this.segs = NO_SEGMENTS;
    this.sampleCache = [];
    this.profileEpoch++;
    this.engine?.forgetProfile();
    this.autoLock = null;
    this.lastLook = -1;
    this.analysedSpan = null;
    this.profiledSpan = null;
    this.pendingSpan = null;
    this.thumbAbort?.abort();
    this.thumbAbort = null;
    for (const u of this.snap.thumbs ?? []) if (u) URL.revokeObjectURL(u);
    const v = this.video;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl);
    this.sourceUrl = null;
    if (this.photoPreview && this.photoPreview !== this.photo) this.photoPreview.close();
    this.photo?.close();
    this.photo = null;
    this.photoPreview = null;
    const r = this.snap.exp.result;
    if (r) URL.revokeObjectURL(r.url);
    this.dropStill();
    this.engine?.reset();
    this.engine?.lockGlobals(null);
  }

  // ------------------------------------------------------------ drawing

  private stabActive(): boolean {
    return this.snap.kind === "video" && this.tools.stabilise.enabled && !!this.path && !!this.analysis && !!this.motion;
  }

  private geometryActive(): boolean {
    return this.stabActive() || (this.tools.dewarp.enabled && !!this.dewarpU) || this.footageActive();
  }

  /** Geometry-pass options for an upright source (the <video>, a still from it, a photo). */
  private uprightOpts(split: number | null) {
    const footage = this.snap.kind === "video" ? this.footageMode("video") : 0;
    return { texCoded: false, split, footage, highPrecision: this.highPrecision(footage) };
  }

  /** Gyro path active and rendering straight lines itself (Dewarp on). */
  private gyroRectilinear(): boolean {
    return this.stabActive() && this.path?.kind === "gyro" && this.path.plan.output === "rectilinear";
  }

  /** The stabiliser's output projection: straight lines when Dewarp is on (gyro path only). */
  private stabOutput(): "lens" | "rectilinear" {
    return this.tools.dewarp.enabled ? "rectilinear" : "lens";
  }

  private geoParams(t: number, rot: QuarterTurns): GeometryParams {
    const info = this.snap.info!;
    return {
      rot,
      displayW: info.displayW,
      displayH: info.displayH,
      stab: this.stabActive() ? this.motion!.planWarpFn(this.analysis!, this.path!, t, info.displayW, info.displayH) : null,
      // With gyro data and Dewarp on, the gyro warp renders rectilinear through the clip's own
      // lens model (rotation-exact): the separate lens pass would undo the lens twice.
      dewarp: this.tools.dewarp.enabled && !this.gyroRectilinear() ? this.dewarpU : null,
    };
  }

  /**
   * Feeds an upright source (the <video> element, a still from it, or the
   * photo) to the colour engine, through the geometry stage when a geometry
   * tool is on. `size` overrides the preview size (exports).
   */
  private uploadToEngine(src: GeometrySource, t: number, withSplit: boolean, size?: [number, number]): void {
    const e = this.engine, info = this.snap.info;
    if (!e || !info) return;
    const split = withSplit ? this.split : null;
    e.split = split ?? 0;
    const sw = (src as HTMLVideoElement).videoWidth || (src as ImageBitmap).width || info.displayW;
    const sh = (src as HTMLVideoElement).videoHeight || (src as ImageBitmap).height || info.displayH;
    this.beforeSet = false;
    if (this.geometryActive() && this.geo) {
      const [w, h] = size ?? this.previewSize();
      // The engine draws the compare wipe itself (its temporal history must
      // never see it): the geometry renders the whole frame and the raw frame
      // goes along as the "before" picture.
      this.geometryToEngine(e, src, this.geoParams(t, info.rot), this.uprightOpts(null), w, h);
      e.setBefore(split !== null ? src : null, sw, sh);
      this.beforeSet = split !== null;
      e.setPreviewScale(1);
    } else {
      const w = sw, h = sh;
      e.setBefore(null, 0, 0);
      e.upload(src, w, h, 0);
      if (size) e.setPreviewScale(Math.min(1, size[0] / w));
      else e.setPreviewScale(Math.min(1, this.previewSize()[0] / w));
    }
  }

  /**
   * The geometry pass that renders straight into the colour engine's source
   * (no geometry canvas, no copy into the engine): in the engine's own GL
   * context on WebGL2 (bit-identical to the canvas route), in WGSL on its
   * device on WebGPU (opt-in, `?geoshare=gpu`). Null otherwise, or with
   * `?geoshare=0` (A/B: the geometry canvas uploaded into the engine).
   */
  private sharedGeometry(e: Engine): SharedGeometry | null {
    const flag = new URLSearchParams(location.search).get("geoshare");
    if (flag === "0") return null;
    const gl = e.backend as unknown as Partial<SourceDrawBackend>;
    if (typeof gl.beginSourceDraw === "function" && gl.context) {
      if (this.geoShared?.gl !== gl.context) {
        this.geoShared?.geo.dispose();
        this.geoShared = null;
        try {
          this.geoShared = { geo: GeometryRenderer.inContext(gl.context), gl: gl.context };
        } catch (err) {
          console.warn("geometry: can't share the colour engine's context:", err instanceof Error ? err.message : err);
          return null;
        }
      }
      return { kind: "gl", geo: this.geoShared.geo, b: gl as SourceDrawBackend };
    }
    // WebGPU: the pass in WGSL on the engine's device (not bit-identical to the WebGL pass; ?geoshare=gl keeps that one).
    const gpu = e.backend as unknown as Partial<GpuSourceDrawBackend>;
    if ((flag === "gpu" || (GPU_GEOMETRY_DEFAULT && flag !== "gl")) && typeof gpu.beginSourceDraw === "function" && gpu.gpuDevice) {
      if (this.geoGpu?.device !== gpu.gpuDevice) {
        this.geoGpu?.geo.dispose();
        this.geoGpu = null;
        try {
          this.geoGpu = { geo: new GpuGeometryRenderer(gpu.gpuDevice), device: gpu.gpuDevice };
        } catch (err) {
          console.warn("geometry: no WebGPU geometry pass:", err instanceof Error ? err.message : err);
          return null;
        }
      }
      return { kind: "gpu", geo: this.geoGpu.geo, b: gpu as GpuSourceDrawBackend };
    }
    return null;
  }

  /**
   * The geometry pass of `src` at w×h as the colour engine's (upright)
   * source: drawn in the engine's context when it can share it, else drawn
   * into the geometry canvas and uploaded. `prof` times the two halves.
   */
  private geometryToEngine(e: Engine, src: GeometrySource, p: GeometryParams, opts: GeometryRenderOptions, w: number, h: number, prof?: ExportProfile, shared = this.sharedGeometry(e)): void {
    let tp = prof ? performance.now() : 0;
    if (shared?.kind === "gpu" && GpuGeometryRenderer.supports(opts) && shared.geo.render(shared.b.beginSourceDraw(w, h), src, p, opts)) {
      if (prof) {
        const now = performance.now();
        prof.add("geometry", now - tp);
        tp = now;
      }
      shared.b.endSourceDraw(w, h, 0);
    } else if (shared?.kind === "gl") {
      shared.b.beginSourceDraw(w, h);
      shared.geo.resize(w, h);
      shared.geo.render(src, p, opts);
      shared.b.syncIfProfiling();
      if (prof) {
        const now = performance.now();
        prof.add("geometry", now - tp);
        tp = now;
      }
      shared.b.endSourceDraw(w, h, 0);
    } else {
      const geo = this.geo!;
      geo.resize(w, h);
      geo.render(src, p, opts);
      if (prof) {
        const now = performance.now();
        prof.add("geometry", now - tp);
        tp = now;
      }
      e.upload(geo.canvas, w, h, 0);
    }
    prof?.add("upload", performance.now() - tp);
  }

  /** Draws `src` at media time `t` into the visible canvas. */
  private draw(src: GeometrySource, t: number, advance: boolean): void {
    const info = this.snap.info;
    if (!info) return;
    if (this.tools.colour.enabled && this.engine) {
      this.uploadToEngine(src, t, true);
      // Crossing into another segment while playing: analyse this frame now (the lock snaps in tick).
      const changed = this.applyLook(t);
      if (advance) this.engine.tick(t, changed);
      else this.engine.setTime(t);
      // AI on: the session opens (and seeds the engine's own subjects) whether playing or paused.
      if (this.seg.on && !this.seg.autos && this.tools.colour.subjectPop && performance.now() - this.segKick > 1000) { this.segKick = performance.now(); this.runSeg(); }
      this.engine.setSegOverlay(this.segOverlay(t));
      this.engine.render();
    } else if (this.geo) {
      const [w, h] = this.previewSize();
      this.geo.resize(w, h);
      this.geo.render(src, this.geoParams(t, info.rot), this.uprightOpts(this.split));
    }
  }

  private drawLive(t: number, advance: boolean): void {
    const v = this.video;
    if (!v || v.readyState < 2) return;
    this.draw(v, t, advance);
  }

  /** Repaints the current frame (paused, photo, or after a control change). */
  repaint(): void {
    if (this.exporting || this.snap.phase !== "ready") return;
    if (this.snap.kind === "photo") {
      const src = this.zoom > 1.01 ? this.photo : this.photoPreview;
      if (src) this.draw(src, 0, false);
      return;
    }
    const v = this.video;
    if (!v || v.readyState < 2) return;
    if (!v.paused) return; // the frame loop paints the next frame anyway
    if (this.still) this.draw(this.still, v.currentTime, false);
    else this.draw(v, v.currentTime, false);
  }

  private async captureStill(): Promise<void> {
    const v = this.video;
    if (!v || !v.paused || v.readyState < 2 || this.snap.phase !== "ready" || this.snap.kind !== "video" || this.exporting || this.stillsUnsafe) return;
    const gen = this.gen;
    try {
      const bmp = await createImageBitmap(v);
      if (gen !== this.gen || !v.paused) return bmp.close();
      this.still?.close();
      this.still = bmp;
    } catch {
      // keep painting from the element
    }
  }

  private dropStill(): void {
    this.still?.close();
    this.still = null;
  }

  private startPreview(): void {
    const v = this.video as VideoWithRVFC | null;
    if (!v) return;
    this.previewOn = true;
    const gen = this.gen;
    const frame = (_now: number, meta?: { mediaTime?: number }) => {
      if (!this.previewOn || this.exporting || gen !== this.gen) return;
      const vv = this.video!;
      const t = meta?.mediaTime ?? vv.currentTime;
      // Playback loops inside the trim.
      const loop = vv.paused ? null : loopTarget(t, this.trim, this.snap.info?.fps || 30);
      if (loop !== null) {
        try { vv.currentTime = loop; } catch { /* ignore */ }
      }
      this.dropStill();
      this.drawLive(t, true);
      const now = performance.now();
      if (now - this.lastTimeEmit > 66) {
        this.lastTimeEmit = now;
        this.set({ currentTime: vv.currentTime });
      }
      if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(frame);
      else requestAnimationFrame((n) => frame(n));
    };
    if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(frame);
    else requestAnimationFrame((n) => frame(n));
  }

  // ------------------------------------------------------------ playback

  togglePlay(): void {
    const v = this.video;
    if (!v || this.exporting || this.snap.phase !== "ready" || this.snap.kind !== "video") return;
    if (v.paused) {
      const r = this.trim;
      if (r && (v.currentTime < r.start || v.currentTime >= r.end - 0.02)) {
        try { v.currentTime = r.start; } catch { /* ignore */ }
      }
      void v.play().catch(() => undefined);
    } else v.pause();
  }

  pause(): void {
    this.video?.pause();
  }

  /** The playhead right now (the snapshot's currentTime lags playback by up to ~70 ms). */
  playhead(): number {
    const v = this.video;
    return v && this.snap.kind === "video" ? v.currentTime : this.snap.currentTime;
  }

  seek(t: number): void {
    const v = this.video;
    if (!v || this.exporting || this.snap.phase !== "ready" || this.snap.kind !== "video") return;
    try {
      v.currentTime = clampToRange(t, this.trim, v.duration || 0);
    } catch {
      // ignore
    }
    this.set({ currentTime: v.currentTime });
  }

  // ------------------------------------------------------------ segments

  /** The engine settings for the frame at clip time `t`: its segment's look when the clip is split. */
  private settingsAt(t: number): ReturnType<typeof colourSettings> {
    const s = this.segs;
    if (this.snap.kind !== "video" || !s.cuts.length) return this.colourFor(this.tools.colour);
    const i = lookIndexAt(s.cuts, t, this.trim, this.snap.duration, this.snap.info?.fps || 30);
    return this.colourFor(s.looks[i] ?? this.tools.colour);
  }

  /** Puts the segment's settings on the engine for the frame at `t`; true when the segment changed since the last frame. */
  private applyLook(t: number): boolean {
    const e = this.engine;
    if (!e) return false;
    e.settings = this.settingsAt(t);
    const s = this.segs;
    const look = this.snap.kind === "video" && s.cuts.length ? lookIndexAt(s.cuts, t, this.trim, this.snap.duration, this.snap.info?.fps || 30) : 0;
    const changed = this.lastLook >= 0 && look !== this.lastLook;
    this.lastLook = look;
    return changed;
  }

  /**
   * Split points and per-region looks (segments.ts builds them). Cheap on
   * every call (the preview follows at once); with `commit` (a split, a
   * removed or released divider) the scene lock is rebuilt with a new lock
   * at every cut, sampling the segments that lack frames of their own.
   */
  setSegments(next: Segments<ColourLook>, commit: boolean): void {
    if (this.snap.kind !== "video" || this.exporting) return;
    const cutsChanged = next.cuts.length !== this.segs.cuts.length || next.cuts.some((c, i) => c !== this.segs.cuts[i]);
    this.segs = next.cuts.length ? next : NO_SEGMENTS;
    this.set({ segments: this.segs });
    if (commit && cutsChanged) this.relock();
    this.repaint();
  }

  /** Cut times in force (inside the trim). */
  private boundaries(): number[] {
    return activeCuts(this.segs.cuts, this.trim, this.snap.duration).map((i) => this.segs.cuts[i]);
  }

  /** Re-applies the scene lock for the current cuts: from the profile in hand, or a top-up profile when a segment has no samples. */
  private relock(): void {
    const e = this.engine, mod = this.colour;
    if (!e || !mod || !this.tools.colour.enabled || this.snap.phase !== "ready") return;
    if (this.profiling) {
      // The profile in flight reads the cuts when it finishes; run again if it sampled for older ones.
      void this.profiling.then(() => this.relock());
      return;
    }
    if (!this.snap.colourProfiled || !this.autoLock) return;
    const segs = visibleSegments(this.segs.cuts, this.trim, this.snap.duration);
    const missing = topUpTimes(this.autoLock.samples.map((x) => x.t), segs).filter((t) => !this.cachedSample(t));
    if (missing.length) {
      void this.profileColour();
      return;
    }
    const samples = [...this.autoLock.samples, ...topUpTimes(this.autoLock.samples.map((x) => x.t), segs).map((t) => this.cachedSample(t)!)];
    this.lockFrom(this.autoLock.lock, samples);
  }

  private cachedSample(t: number) {
    return this.sampleCache.find((x) => Math.abs(x.t - t) < 1e-3) ?? null;
  }

  /** Locks the engine: the automatic lock with a new locked estimate forced in at every cut. */
  private lockFrom(auto: Parameters<Engine["lockGlobals"]>[0], samples: import("./colour.ts").ProfileSample[]): void {
    const e = this.engine, mod = this.colour;
    if (!e || !mod) return;
    const bounds = this.boundaries();
    const lock = lockWithCuts(auto, [...samples].sort((a, b) => a.t - b.t), bounds, mod.medianParams, this.snap.info?.fps || 30);
    e.lockGlobals(lock);
    this.lastLook = -1;
    if (bounds.length) console.info(`[segments] ${bounds.length + 1} segments (cuts at ${bounds.map((b) => b.toFixed(2)).join(", ")} s): ${lock ? `${lock.length} locked estimate(s)` : "unlocked"}`);
  }

  // ------------------------------------------------------------ trim

  /**
   * The in/out selection. Cheap on every call (the preview loop and seeks
   * follow it at once); with `commit` (handle released, a key press, Reset)
   * the analyses that depend on the range re-run after a short settle.
   */
  setTrim(range: TrimRange | null, commit: boolean): void {
    if (this.snap.kind !== "video" || this.exporting) return;
    const next = effectiveTrim(range, this.snap.duration);
    const a = next, b = this.trim;
    const same = a === b || (!!a && !!b && Math.abs(a.start - b.start) < 1e-4 && Math.abs(a.end - b.end) < 1e-4);
    if (!same) {
      this.trim = next;
      this.set({ trim: next });
    }
    if (commit) {
      clearTimeout(this.trimTimer);
      this.trimTimer = window.setTimeout(() => this.applyTrim(), TRIM_SETTLE_MS);
    }
  }

  /** Motion analysis span for the current trim: the range plus a margin (null = the whole clip). */
  private motionSpan(): TrimRange | null {
    return analysisSpan(this.trim, this.snap.duration);
  }

  /** Re-runs what the trim invalidated: the colour profile, and the motion analysis (or only its solve). */
  private applyTrim(): void {
    clearTimeout(this.trimTimer);
    this.trimTimer = 0;
    if (this.snap.kind !== "video" || this.snap.phase !== "ready" || this.exporting) return;
    const duration = this.snap.duration;
    if (this.tools.colour.enabled && this.engine && (this.snap.colourProfiled || this.profiling)) {
      const again = () => {
        if (this.exporting || this.snap.phase !== "ready" || spanServes(this.profiledSpan, this.trim, duration)) return;
        this.engine?.lockGlobals(null);
        this.set({ colourProfiled: false });
        void this.profileColour();
      };
      if (this.profiling) void this.profiling.then(again);
      else again();
    }
    // The trim decides which cuts are in force: their locks follow (after any re-profile above).
    if (this.segs.cuts.length) this.relock();
    if (this.tools.stabilise.enabled && (this.analysis || this.stabAbort)) {
      const want = this.motionSpan();
      if (this.stabAbort) {
        // In flight for another span: restart unless it covers this one too.
        if (!spanServes(this.pendingSpan, want, duration)) void this.analyseMotion();
      } else if (this.analysis && spanServes(this.analysedSpan, want, duration)) {
        // Gyro: the solve takes the span (the telemetry covers the clip); visual: the tracked span still covers it.
        if (this.analysis.mode === "gyro") this.scheduleSolve(0);
      } else {
        // The old result stays on screen until the new one lands.
        void this.analyseMotion();
      }
    }
  }

  /** Decodes the filmstrip thumbnails once the clip is on screen (idle time; skipped where WebCodecs is missing). */
  private buildFilmstrip(media: MediaMod, file: File, gen: number): void {
    this.thumbAbort?.abort();
    const ctrl = new AbortController();
    this.thumbAbort = ctrl;
    const run = () => {
      if (gen !== this.gen || ctrl.signal.aborted) return;
      const t0 = performance.now();
      media.filmstrip(file, filmstripTimes(this.snap.duration, FILMSTRIP_COUNT), FILMSTRIP_PX, ctrl.signal)
        .then((urls) => {
          if (gen !== this.gen || ctrl.signal.aborted) {
            for (const u of urls) if (u) URL.revokeObjectURL(u);
            return;
          }
          console.info(`[timeline] filmstrip: ${urls.filter(Boolean).length}/${urls.length} thumbnails in ${Math.round(performance.now() - t0)} ms`);
          if (urls.some(Boolean)) this.set({ thumbs: urls });
        })
        .catch((e: unknown) => console.info("[timeline] no filmstrip:", e instanceof Error ? e.message : e));
    };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    window.setTimeout(() => (ric ? ric(run, { timeout: 2000 }) : run()), 600);
  }

  // ------------------------------------------------------------ colour profile

  /**
   * Clip profile (Aqua Fix): analyse ~a dozen frames spread over the clip and
   * lock the global correction per scene, so a subject passing through can't
   * swing the balance mid-video.
   */
  private profileColour(): Promise<void> {
    if (this.profiling) return this.profiling;
    const run = async () => {
      const v = this.video, e = this.engine, mod = this.colour;
      if (!v || !e || !mod) return;
      const gen = this.gen;
      // Trimmed: the samples (and so the scene lock) come from the selection only.
      const span = this.trim;
      const times = rangeTimes(mod.profileTimes, span, v.duration);
      // Nothing to profile (?lock=0, no sample times): the per-frame analysis is all there is, and Export needn't wait.
      if (!times.length || new URLSearchParams(location.search).get("lock") === "0") {
        this.set({ colourProfiled: true });
        return;
      }
      // Split: every segment gets frames of its own for its lock (the base spacing may miss a short one).
      const extra = topUpTimes(times, visibleSegments(this.segs.cuts, span, v.duration));
      const all = [...times, ...extra];
      const wasPaused = v.paused;
      const resumeAt = v.currentTime;
      this.previewOn = false;
      v.pause();
      this.set({ busy: "Profiling colour…" });
      try {
        // Rounds: a framing change (Dewarp / Stabilise toggled) empties the cache mid-run; the samples it threw away
        // are taken again with the new framing, so the lock never comes from fewer frames than planned.
        for (let round = 0; round < 3; round++) {
          const needed = all.filter((t) => !this.cachedSample(t));
          if (!needed.length) break;
          for (const t of needed) {
            // An export started meanwhile waits for this profile (exportVideo): stopping here would export without the lock.
            if (gen !== this.gen) return;
            const epoch = this.profileEpoch;
            // A sample that fails or runs out of time (a loaded device) is retried with a longer budget
            // (profile-retry.ts): dropping it could leave the clip without a scene lock.
            const r = await withRetries(async (budget) => {
              await seekVideo(v, t);
              this.uploadToEngine(v, t, false);
              return e.analyzeRaw(budget, t);
            }, PROFILE_SAMPLE_BUDGETS_MS, () => gen === this.gen, (n, err) => console.info(`[profile] sample at ${t.toFixed(2)} s: retry ${n} (${err instanceof Error ? err.message : err})`));
            // A sample taken before a framing change is stale: dropped (the next round takes it again).
            if (r && epoch === this.profileEpoch) this.sampleCache.push({ t, params: r.params, mean: r.mean });
          }
        }
        if (gen !== this.gen) return;
        const samples = times.map((t) => this.cachedSample(t)).filter((x) => x !== null);
        const lock = mod.segmentProfile(samples, mod.SCENE_CUT_MEAN_DIFF);
        this.autoLock = { lock, samples };
        // The user's cuts force a new lock each (segments.ts lockWithCuts); unsplit, this is the automatic lock.
        if (lock) this.lockFrom(lock, [...samples, ...extra.map((t) => this.cachedSample(t)).filter((x) => x !== null)]);
        console.info(`[profile] ${lock ? `locked ${lock.length} segment(s)` : "skipped"}: ${samples.length}/${times.length} samples${extra.length ? ` (+${extra.length} for short segments)` : ""}${span ? ` in ${span.start.toFixed(2)}–${span.end.toFixed(2)} s` : ""}`);
        this.profiledSpan = span;
        this.set({ colourProfiled: true });
      } finally {
        if (gen === this.gen) {
          this.set({ busy: null });
          if (!this.exporting) {
            await seekVideo(v, clampToRange(resumeAt, this.trim, v.duration)).catch(() => undefined);
            this.drawLive(v.currentTime, false);
            if (!wasPaused) await v.play().catch(() => undefined);
            this.startPreview();
          }
        }
      }
    };
    this.profiling = run().finally(() => {
      this.profiling = null;
    });
    return this.profiling;
  }

  // ------------------------------------------------------------ stabilise

  private async analyseMotion(): Promise<void> {
    const file = this.file;
    if (!file || this.snap.kind !== "video") return;
    const gen = this.gen;
    // A second start (tool switched on while the clip was still opening) replaces the first quietly.
    this.stabAbort?.abort();
    this.cancelRefine();
    const ctrl = new AbortController();
    this.stabAbort = ctrl;
    // Trimmed: only the selection plus a margin is decoded and tracked.
    const span = this.motionSpan();
    this.pendingSpan = span;
    this.setStab({ state: "analysing", progress: 0, message: null });
    try {
      const mod = this.motion ?? (this.motion = await loadMotion());
      const client = this.stabClient ?? (this.stabClient = new mod.AnalysisClient());
      let last = 0;
      const started = performance.now();
      const analysis = await client.analyze(file, (fraction) => {
        const now = performance.now();
        if (now - last > 150) {
          last = now;
          this.setStab({ progress: fraction });
        }
      }, ctrl.signal, this.tools.stabilise.visual, false, this.motionLog, span);
      if (gen !== this.gen || ctrl.signal.aborted) return;
      this.analysis = analysis;
      this.analysedSpan = span;
      const info = stabInfo(analysis);
      console.info(`[stabilise] ${info.badge}${info.warning ? ` (${info.warning})` : ""}, analysed ${span ? `${span.start.toFixed(2)}–${span.end.toFixed(2)} s` : "the whole clip"} in ${((performance.now() - started) / 1000).toFixed(1)} s${analysis.mode === "gyro" && analysis.motion.notes.length ? ` · ${analysis.motion.notes.join("; ")}` : ""}`);
      this.setStab({ state: "solving", progress: 1, info });
      const path = await client.solve(this.solveFor(analysis.mode));
      if (gen !== this.gen || ctrl.signal.aborted) return;
      this.path = path;
      this.setStab({ state: "ready", summary: this.stabSummary(), bobbing: this.bobbingText() });
      this.repaint();
      this.maybeRefine();
    } catch (e) {
      if (gen !== this.gen || ctrl.signal.aborted) return;
      console.warn("[stabilise] analysis failed", e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : e);
      this.setStab({ state: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (this.stabAbort === ctrl) this.stabAbort = null;
    }
  }

  /** Solve parameters for the current tools and trim (the gyro solve covers only the analysis span). */
  private solveFor(mode: AnalysisResult["mode"]) {
    return { ...solveParams(this.tools.stabilise, mode, this.stabOutput()), span: this.motionSpan() };
  }

  /**
   * Adds (or with null, removes) a motion log recorded next to the clip — a
   * Gyroflow .gcsv or Sensor Logger's Gyroscope.csv — and re-runs the motion
   * analysis with it in place of the clip's own telemetry.
   */
  setMotionLog(file: File | null): void {
    if (this.snap.kind !== "video") return;
    this.motionLog = file;
    this.setStab({ motionLog: file?.name ?? null, summary: null, info: null });
    this.stabAbort?.abort();
    this.stabAbort = null;
    this.cancelRefine();
    this.analysis = null;
    this.analysedSpan = null;
    this.path = null;
    if (this.tools.stabilise.enabled && this.snap.phase === "ready") void this.analyseMotion();
    this.repaint();
  }

  private bobbingText(): string | null {
    if (!this.tools.stabilise.bobbing || this.analysis?.mode !== "gyro") return null;
    return bobbingNote(this.path, this.snap.stab.refine, this.snap.stab.refineProgress);
  }

  /**
   * The bobbing pass (Motion Fix hybrid): with the gyro result already on
   * screen, the worker decodes and tracks the clip; when the measurements
   * land the plan is re-solved with them. A failure or fallback keeps the
   * gyro result and only changes the note.
   */
  private maybeRefine(): void {
    const client = this.stabClient;
    const st = this.snap.stab;
    if (!client || this.analysis?.mode !== "gyro" || !st.info?.canBobbing || !this.tools.stabilise.bobbing) return;
    if (st.refine === "running" || st.refine === "done" || st.refine === "unavailable") return;
    const gen = this.gen;
    const analysis = this.analysis;
    const ctrl = new AbortController();
    this.refineAbort = ctrl;
    this.setStab({ refine: "running", refineProgress: 0 });
    this.setStab({ bobbing: this.bobbingText() });
    let last = 0;
    client
      .refine((fraction) => {
        const now = performance.now();
        if (now - last > 200) {
          last = now;
          this.setStab({ refineProgress: fraction });
          this.setStab({ bobbing: this.bobbingText() });
        }
      }, ctrl.signal, this.analysedSpan)
      .then((ok) => {
        if (gen !== this.gen || ctrl.signal.aborted || analysis !== this.analysis) return;
        console.info(`[stabilise] bobbing pass ${ok ? "done" : "unavailable (gyro only)"}`);
        this.setStab({ refine: ok ? "done" : "unavailable" });
        this.setStab({ bobbing: this.bobbingText() });
        if (ok) this.scheduleSolve(0);
      })
      .catch((e: unknown) => {
        if (gen !== this.gen || ctrl.signal.aborted) return;
        console.warn("[stabilise] bobbing pass failed, keeping the gyro result", e);
        this.setStab({ refine: "unavailable" });
        this.setStab({ bobbing: this.bobbingText() });
      })
      .finally(() => {
        if (this.refineAbort === ctrl) this.refineAbort = null;
      });
  }

  private cancelRefine(): void {
    this.refineAbort?.abort();
    this.refineAbort = null;
    if (this.snap.stab.refine !== "idle") this.setStab({ refine: "idle", refineProgress: 0, bobbing: null });
  }

  private stabSummary(): string | null {
    return this.analysis && this.path ? stabSummary(this.analysis, this.path) : null;
  }

  private scheduleSolve(delay = 120): void {
    clearTimeout(this.solveTimer);
    const seq = ++this.solveSeq;
    this.solveTimer = window.setTimeout(async () => {
      const client = this.stabClient;
      const analysis = this.analysis;
      // A new analysis in flight (the trim moved past the analysed span) solves with the current settings itself.
      if (!client || !analysis || this.stabAbort) return;
      try {
        const path = await client.solve(this.solveFor(analysis.mode));
        if (analysis !== this.analysis) return;
        if (seq !== this.solveSeq) return;
        this.path = path;
        this.setStab({ state: "ready", summary: this.stabSummary() });
        this.setStab({ bobbing: this.bobbingText() });
        this.repaint();
      } catch (e) {
        this.setStab({ state: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }, delay);
  }

  /** Resolves once the motion path is ready (or rejects if analysis failed). */
  private async waitForPath(): Promise<void> {
    if (!this.tools.stabilise.enabled) return;
    if (!this.path && !this.stabAbort && !this.analysis) void this.analyseMotion();
    // A re-analysis for a new trim must land before the export uses the path.
    while (!this.path || this.stabAbort) {
      if (this.snap.stab.state === "error") throw new Error("Motion analysis failed: " + (this.snap.stab.message ?? ""));
      if (this.exportAbort?.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const pct = Math.round(this.snap.stab.progress * 100);
      this.setExp({ detail: `Analysing motion ${pct}%` });
      await new Promise((r) => setTimeout(r, 200));
    }
    // The export must use the refined plan: wait for the bobbing pass and the re-solve it triggers.
    while (this.tools.stabilise.bobbing && (this.snap.stab.refine === "running" || this.refinedSolvePending())) {
      if (this.exportAbort?.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (this.snap.stab.state === "error") break;
      this.setExp({ detail: `Measuring bobbing ${Math.round(this.snap.stab.refineProgress * 100)}%` });
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** The bobbing measurements are in but the plan on screen was solved without them. */
  private refinedSolvePending(): boolean {
    return this.snap.stab.refine === "done" && this.path?.kind === "gyro" && !this.path.plan.hybrid;
  }

  // ------------------------------------------------------------ export

  private outName(ext: string): string {
    const base = (this.snap.fileName ?? "clip").replace(/\.[^.]+$/, "");
    const trimmed = this.snap.kind === "video" && this.trim ? "-trimmed" : "";
    return `${base}-${exportSuffix({ ...this.tools, stabilise: { ...this.tools.stabilise, enabled: this.tools.stabilise.enabled && this.snap.kind === "video" } })}${trimmed}.${ext}`;
  }

  private beginExport(): AbortController {
    const old = this.snap.exp.result;
    if (old?.blob) {
      URL.revokeObjectURL(old.url);
      void releaseExportBlob(old.blob);
    }
    this.exporting = true;
    this.previewOn = false;
    this.video?.pause();
    const ctrl = new AbortController();
    this.exportAbort = ctrl;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    wl?.request("screen").then((l) => { this.wakeLock = l; }).catch(() => undefined);
    this.set({ exp: { ...IDLE_EXPORT, state: "preparing", detail: "Preparing…" } });
    return ctrl;
  }

  private finishExport(err: unknown): void {
    if (err) {
      if (err instanceof DOMException && err.name === "AbortError") this.set({ exp: IDLE_EXPORT });
      else this.setExp({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
    this.exporting = false;
    this.exportAbort = null;
    this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  /** A colour engine is running (without one Colour can't apply, and nothing waits for its analysis). */
  get hasColourEngine(): boolean {
    return !!this.engine;
  }

  /** The open clip (the export sheet looks up a resumable export of it). */
  get clipFile(): File | null {
    return this.file;
  }

  /** Settings key of the next export (export journal: same clip + same key = resumable). */
  exportKey(): string {
    const seg = this.tools.colour.subjectPop ? this.seg.exportKey() : "";
    return exportSettingsKey(this.tools, this.snap) + (seg ? `|${seg}` : "");
  }

  async exportVideo(req: ExportRequest = {}): Promise<void> {
    if (this.snap.kind === "photo") return this.exportPhoto();
    const e = this.engine, file = this.file, v = this.video, info = this.snap.info;
    if (!file || !v || !info || this.exporting) return;
    // A tapped subject still being followed: the export waits for its path (it seeks the same video element).
    if (this.tracking) await this.tracking.catch(() => undefined);
    if (this.seg.pending) await this.seg.pending.catch(() => undefined);
    if (!this.snap.canExport) {
      this.setExp({ state: "error", message: "Saving video isn't supported in this browser: update to the latest Safari or Chrome." });
      return;
    }
    // A trim change still settling: its re-analysis starts now, and the export waits for it below.
    if (this.trimTimer) this.applyTrim();
    const ctrl = this.beginExport();
    const colourOn = this.tools.colour.enabled && !!e;
    const trim = this.trim;
    let failure: unknown = null;
    try {
      const media = await loadMedia();
      // The clip's scene lock must be in before the first frame: a profile still to run starts now, and the export waits.
      if (colourOn && !this.snap.colourProfiled && !this.profiling) void this.profileColour();
      if (this.profiling) {
        this.setExp({ detail: "Reading the water…" });
        await this.profiling;
      }
      await this.waitForPath();
      if (this.stabActive() && this.path?.kind === "gyro") {
        const h = this.path.plan.hybrid;
        console.info(`[export] stabilise: gyro${h ? (h.applied ? " + bobbing removed" : ` (bobbing: ${h.reason})`) : " only"}`);
      }
      // The profile restarts the preview when it finishes; stop it again.
      this.previewOn = false;
      v.pause();
      if ((this.geometryActive() || !colourOn) && !this.geo) throw new Error("WebGL2 is unavailable");
      const clipLen = this.snap.duration || info.duration;
      // The source's bitrate comes from the whole file; the output (and the progress) is the trimmed length.
      const bitrate = bitrateFromSource(file.size, clipLen) ?? pickBitrate(info.displayW, info.displayH, info.fps);
      const total = outputLength(trim, clipLen);
      if (trim) console.info(`[export] trim ${trim.start.toFixed(2)}–${trim.end.toFixed(2)} s (${total.toFixed(2)} of ${clipLen.toFixed(2)} s)`);
      this.dropStill();
      const mode = this.snap.exportMode;
      if (mode === "native") {
        const res = await this.runNative(media, file, info, bitrate, total, colourOn, ctrl, trim);
        console.info(`[export] done: ${res.frames} frames in ${(res.elapsedMs / 1000).toFixed(1)} s (native), audio ${res.audioIncluded ? "kept" : "dropped"}`);
        this.setExp({ state: "done", progress: 1, etaSec: 0, frames: res.frames, detail: "", result: res });
      } else {
        const res = mode === "realtime"
          ? await this.runRealtime(media, file, v, info, bitrate, total, colourOn, ctrl, trim)
          : await this.runOffline(media, file, bitrate, total, colourOn, ctrl, trim, req);
        console.info(`[export] done: ${res.frames} frames in ${(res.elapsedMs / 1000).toFixed(1)} s (${mode}), ${res.blob.type}, audio ${res.audioIncluded ? "kept" : "dropped"}`);
        this.setExp({
          state: "done",
          progress: 1,
          etaSec: 0,
          frames: res.frames,
          detail: "",
          result: { ...res, native: null, bytes: res.blob.size, mime: res.blob.type, name: this.outName(res.blob.type === "video/webm" ? "webm" : "mp4"), url: URL.createObjectURL(res.blob), width: "width" in res ? (res.width as number) : info.displayW, height: "height" in res ? (res.height as number) : info.displayH },
        });
      }
    } catch (err) {
      const help = err instanceof Error && /not decodable/i.test(err.message) ? codecHelp(info.codecString) : null;
      failure = help ? new Error(help) : err;
    } finally {
      this.finishExport(failure);
      if (e && this.colour) {
        // The export's last analysis may still be reading back.
        await this.settleEngine();
        e.clearPrecomputed(true);
        const clocks = this.backendClocks();
        if (clocks) clocks.syncProfile = false;
        if (this.geo) this.geo.syncProfile = false;
        e.analysisIntervalMs = this.colour.ANALYSIS_INTERVAL_MS;
        e.personEvery = 2;
        e.reset();
      }
      v.loop = true;
      if (this.file === file && this.snap.phase === "ready") {
        const t0 = this.trim?.start ?? 0;
        if (t0 > 0) await seekVideo(v, t0).catch(() => undefined);
        else try { v.currentTime = 0; } catch { /* ignore */ }
        this.uploadToEngine(v, t0, false);
        await e?.analyzeNow(true).catch(() => undefined);
        this.drawLive(t0, false);
        await v.play().catch(() => undefined);
        this.startPreview();
      }
    }
  }

  /** Lighter per-frame analysis load while exporting (globals are locked per clip anyway). */
  private async engineForExport(): Promise<void> {
    const e = this.engine;
    if (!e) return;
    await this.settleEngine();
    e.reset({ keepPerson: true });
    e.split = 0;
    this.lastLook = -1;
    e.analysisIntervalMs = 150;
    e.personEvery = 4;
  }

  /**
   * Analyse-first lookahead for an export with Colour on (lookahead.ts): a
   * second decoder runs ahead and precomputes the colour analyses of the
   * frames the render will analyse, in the engine's worker pool. Frames go
   * through exactly the render's preparation (re-tag, square pixels, the
   * geometry pass, the same engine upload), so the thumbnails are the
   * render's own. `clock` is the time the export loop passes to analyzeDue.
   * `?ahead=0` turns it off, `?pool=N` sizes the pool, `?precheck=1` checks
   * every thumbnail against a live readback.
   */
  private async lookaheadFor(media: MediaMod, file: File, clock: "clip" | "container", o: { geoOn: boolean; footage: number; hp: boolean; retag: boolean; prof: ExportProfile; signal: AbortSignal; endSec?: number }): Promise<AnalysisLookahead | null> {
    const e = this.engine, geo = this.geo;
    const q = new URLSearchParams(location.search);
    if (!e || q.get("ahead") === "0" || (o.geoOn && !geo)) return null;
    const reader = await media.openSampleReader(file).catch(() => null);
    if (!reader) return null;
    const pool = Number(q.get("pool"));
    e.analysisPoolSize = Number.isFinite(pool) && pool >= 1 ? Math.min(4, Math.floor(pool)) : 2;
    e.verifyPrecomputed = q.get("precheck") === "1";
    Object.assign(e.precomputeStats, { hits: 0, misses: 0, mismatches: 0, personHits: 0, personMisses: 0 });
    const fps = this.snap.info?.fps || 30;
    const lookAt = (t: number) => (this.segs.cuts.length ? lookIndexAt(this.segs.cuts, t, this.trim, this.snap.duration, fps) : 0);
    // Superset of the frames analyzeDue analyses: the first, each slot's first, every frame in a profiled cut
    // window, a segment's first, and the frame after any of those snap frames (a snap re-arms the slot).
    let prevSnap = false;
    // Person passes ride along (?personahead=0 turns them off): which person pass an analysis runs depends on
    // how many analyses came before it, so the frames analyzeDue analyses are replayed exactly (its rule:
    // a snap always analyses and re-arms the slot of the frame before; otherwise a new slot does). A profiled
    // cut window makes that depend on what the analysis sees: from there on the render runs its passes live.
    const personAhead = q.get("personahead") !== "0" && e.personEnabled;
    let simSlot = Number.NaN, simFirst = true, simPrev = 0, simCount = 0, simKnown = personAhead;
    const ordinals = new Map<number, number>();
    const replay = (t: number, prev: number | null): void => {
      if (!simKnown) return;
      if (e.inAnyCutWindow(t)) {
        simKnown = false;
        return;
      }
      const snap = simFirst || (prev !== null && lookAt(t) !== lookAt(prev));
      const slot = e.analysisSlotAt(t);
      if (snap || slot !== simSlot) {
        ordinals.set(t, simCount++);
        simSlot = snap ? e.analysisSlotAt(simFirst ? 0 : simPrev) : slot;
      }
      simFirst = false;
      simPrev = t;
    };
    const want = (t: number, prev: number | null): boolean => {
      replay(t, prev);
      const snap = prev === null || e.inAnyCutWindow(t) || lookAt(t) !== lookAt(prev);
      const r = snap || prevSnap || e.analysisSlotAt(t) !== e.analysisSlotAt(prev!);
      prevSnap = snap;
      return r;
    };
    const rot = ((reader.rotation / 90) % 4) as Rotation;
    const dw = reader.displayWidth, dh = reader.displayHeight;
    return new AnalysisLookahead({
      reader,
      clock,
      endSec: o.endSec,
      signal: o.signal,
      want,
      analyse: async (sample, t, prev) => {
        let decoded = (sample as unknown as { toVideoFrame(): VideoFrame }).toVideoFrame();
        if (o.retag) {
          const raw = await media.retagFrame(decoded).catch(() => null);
          if (raw) {
            decoded.close();
            decoded = raw;
          }
        }
        const frame = media.squarePixels(decoded);
        try {
          if (o.geoOn) {
            const shared = this.sharedGeometry(e);
            if (shared?.kind === "gpu") await shared.geo.probe(frame);
            this.geometryToEngine(e, frame, this.geoParams(t, rot as QuarterTurns), { texCoded: true, split: null, footage: o.footage as never, highPrecision: o.hp }, dw, dh, undefined, shared);
          } else {
            e.upload(frame, frame.displayWidth, frame.displayHeight, rot);
          }
          const ordinal = ordinals.get(t);
          ordinals.delete(t);
          await e.precompute(t, prev ?? 0, ordinal);
        } finally {
          frame.close();
        }
      },
    });
  }

  /**
   * Offline WebCodecs export (Chrome, Android, desktop Safari fallback):
   * every frame decoded, rendered once, encoded with its own timestamp.
   * The stage shows bitmaps of the encoded frames (never the full-size
   * render canvas, see ARCHITECTURE.md).
   */
  private async runOffline(media: MediaMod, file: File, bitrate: number, total: number, colourOn: boolean, ctrl: AbortController, trim: TrimRange | null, req: ExportRequest = {}) {
    const e = this.engine, geo = this.geo;
    const geoOn = this.geometryActive();
    // Geometry drawn in the colour engine's context (no canvas copy), when it can share it.
    const shared = colourOn && geoOn && e ? this.sharedGeometry(e) : null;
    const footage = this.footageMode("frame");
    const hp = this.highPrecision(footage);
    // The browser converts (and clips) HDR frames on upload but passes a re-tagged copy through raw (signal-probe.ts).
    const retag = footage !== 0 && this.signal?.frame === "retag";
    if (footage) console.info(`[export] footage ${this.snap.footage.active} (mode ${footage}${retag ? ", frames re-tagged" : ""}${hp ? ", half-float" : ""})`);
    // Playwright's WebKit encodes canvas-wrapped frames upside down (frame-orientation.ts measures it end to end).
    const fixFrame = await canvasFrameFix((line) => console.info("[export]", line));
    await this.engineForExport();
    this.setExp({ state: "running", detail: "Rendering" });
    const prof = this.startProfile();
    const worker0 = e ? { ...e.workerMs } : null;
    const workerTimes = () => {
      if (!e || !worker0) return;
      prof.ms.analysisWorker = e.workerMs.analysis - worker0.analysis;
      prof.ms.person = e.workerMs.person - worker0.person;
      prof.analyses = e.workerMs.analyses - worker0.analyses;
      prof.thumbReadbackMs = e.workerMs.readback - worker0.readback;
      prof.extra = { poolWait: e.workerMs.poolWait - worker0.poolWait, personWait: e.workerMs.personWait - worker0.personWait };
    };
    const look = colourOn ? await this.lookaheadFor(media, file, "clip", { geoOn, footage, hp, retag, prof, signal: ctrl.signal, endSec: trim?.end }) : null;
    // ?framehash=1 (determinism checks): a hash of every encoded frame's pixels, before the encoder.
    const hashes: string[] | null = new URLSearchParams(location.search).get("framehash") === "1" ? [] : null;
    const started = performance.now();
    let frames = 0;
    let lastUi = 0, lastLive = 0;
    // ETA from the work done in this run: a resumed export starts part-way, and paused time doesn't count.
    let startProgress = 0, pausedMs = 0, pausedAt = 0;
    // One frame at a time whenever a canvas is shared between stages (the
    // geometry canvas, or the engine's canvas/bitmap capture paths); the
    // engine's readback path keeps several in flight.
    let gate: Promise<unknown> = Promise.resolve();
    // The engine's part of a frame (upload → analysis → tick → render submit) runs one frame at a
    // time in frame order even when readbacks overlap: an upload of the next frame landing while
    // this frame's analysis reads back would grade from the wrong frame (and timing-dependent).
    let engineGate: Promise<unknown> = Promise.resolve();
    let engineFrames = 0;
    const result = await media.exportWithCodec(
      file,
      async (sample, fi) => {
        const capture = (e?.backend as unknown as { capture?: string | null } | undefined)?.capture;
        const serial = geoOn || !colourOn || capture !== "readback";
        if (serial) await gate;
        const job = (async (): Promise<VideoFrame> => {
          // One frame at a time: nothing else uses the geometry canvas or the engine's source now.
          if (look && serial) await prof.time("prepass", () => look.ensure(fi.timeSec));
          let tp = performance.now();
          let decoded = sample.toVideoFrame();
          if (retag) {
            const raw = await media.retagFrame(decoded).catch(() => null);
            if (raw) {
              decoded.close();
              decoded = raw;
            }
          }
          const frame = media.squarePixels(decoded);
          prof.add("decode", performance.now() - tp);
          try {
            const rot = ((fi.rotation / 90) % 4) as Rotation;
            // Output clock (0 at the trim's first frame); the warp and the grade read source time.
            const ts = Math.round(fi.outTimeSec * 1e6);
            const dur = frame.duration ?? undefined;
            let out: VideoFrame;
            const geoOpts: GeometryRenderOptions = { texCoded: true, split: null, footage, highPrecision: hp };
            if (!colourOn || (geoOn && !shared)) {
              tp = performance.now();
              geo!.resize(fi.displayWidth, fi.displayHeight);
              geo!.render(frame, this.geoParams(fi.timeSec, rot as QuarterTurns), geoOpts);
              prof.add("geometry", performance.now() - tp);
            }
            if (!colourOn) {
              tp = performance.now();
              out = new VideoFrame(geo!.canvas, { timestamp: ts, duration: dur });
              prof.add("readback", performance.now() - tp);
            } else {
              const eng = e!;
              const prevEngine = engineGate;
              let release!: () => void;
              engineGate = new Promise<void>((r) => (release = r));
              let pending: Promise<VideoFrame>;
              try {
                await prevEngine;
                await eng.exportReady();
                // Frames in flight are past their upload: the lookahead may use the engine's source now.
                if (look && !serial) await prof.time("prepass", () => look.ensure(fi.timeSec));
                let rotE: Rotation = rot;
                // A WebGPU pass proves it can import this kind of frame before the first one (else the WebGL pass runs).
                if (shared?.kind === "gpu") await shared.geo.probe(frame);
                if (shared) {
                  // Geometry and "upload" (the copy into the engine's source) are timed inside.
                  this.geometryToEngine(eng, frame, this.geoParams(fi.timeSec, rot as QuarterTurns), geoOpts, fi.displayWidth, fi.displayHeight, prof, shared);
                  rotE = 0;
                }
                tp = performance.now();
                if (shared) {
                  // Drawn into the engine's source above.
                } else if (geoOn) {
                  eng.upload(geo!.canvas, fi.displayWidth, fi.displayHeight, 0);
                  rotE = 0;
                } else {
                  eng.upload(frame, frame.displayWidth, frame.displayHeight, rot);
                }
                // First frame waits for its analysis and snaps; near a profiled
                // cut the exact frame matters, and the first frame of a split
                // segment starts its lock fresh. Analyses run on clip time and are
                // awaited: the grade of a frame depends on the clip alone.
                const segStart = this.applyLook(fi.timeSec);
                const ta = performance.now();
                prof.add("upload", ta - tp);
                await eng.analyzeDue(fi.timeSec, engineFrames++ === 0 || segStart || eng.inCutWindow(fi.timeSec)).catch(() => undefined);
                eng.dropPrecomputedBefore(fi.timeSec);
                tp = performance.now();
                prof.add("analysisWait", tp - ta);
                eng.settings = this.settingsAt(fi.timeSec);
                eng.tick(fi.timeSec);
                eng.setSegOverlay(this.segOverlay(fi.timeSec));
                pending = eng.renderToFrame(rotE, ts, dur);
                prof.add("render", performance.now() - tp);
              } finally {
                release();
              }
              tp = performance.now();
              out = await pending;
              prof.add("readback", performance.now() - tp);
            }
            tp = performance.now();
            // Frames wrapped from a canvas (not the WebGPU backend's buffer readback).
            if (fixFrame && (!colourOn || e?.backend.kind === "webgl2" || (e?.backend as unknown as { capture?: string | null }).capture !== "readback")) out = await fixFrame(out);
            out = media.evenFrame(out);
            prof.add("readback", performance.now() - tp);
            if (hashes && !fi.prime) hashes.push(await frameHash(out));
            frames++;
            const now = performance.now();
            if (now - lastLive > LIVE_EVERY_MS) {
              lastLive = now;
              await prof.time("ui", () => this.emitFrame(out));
            }
            if (now - lastUi > 250 && !fi.prime) {
              lastUi = now;
              const secs = Math.max(1e-3, (now - started - pausedMs) / 1000);
              const fps = frames / secs;
              const progress = total > 0 ? Math.min(1, fi.outTimeSec / total) : 0;
              const done = progress - startProgress;
              const eta = done > 0.02 ? (secs / done) * (1 - progress) : null;
              workerTimes();
              prof.pausedMs = pausedMs;
              this.setExp({ frames, fps, progress, etaSec: eta, detail: `${fi.displayWidth}×${fi.displayHeight} · ${fps.toFixed(1)} fps`, profile: prof.summary() });
            }
            return out;
          } finally {
            frame.close();
          }
        })();
        gate = job.catch(() => undefined);
        return job;
      },
      {
        bitrate,
        opfsPrefix: OPFS_PREFIX,
        pipelineDepth: geoOn || !colourOn ? 1 : 3,
        signal: ctrl.signal,
        log: (line) => console.info("[export]", line),
        onProgress: (p) => this.setExp({ progress: p }),
        profile: prof,
        range: trim,
        resumeKey: this.exportKey(),
        maxLongEdge: req.maxLongEdge,
        onPlan: (plan, resume) => {
          startProgress = resume?.progress ?? 0;
          const notes = [plan.note, resume ? `Resumed at ${Math.round(resume.progress * 100)}%.` : null].filter(Boolean);
          this.setExp({ note: notes.length ? notes.join(" ") : null, progress: startProgress });
        },
        onPause: (paused) => {
          const now = performance.now();
          if (paused) pausedAt = now;
          else if (pausedAt) pausedMs += now - pausedAt;
          this.setExp({ paused });
        },
      },
    ).finally(() => look?.dispose());
    prof.end();
    prof.pausedMs = pausedMs;
    workerTimes();
    this.reportProfile(prof, look);
    if (hashes) {
      (window as unknown as { exportFrameHashes?: string[] }).exportFrameHashes = hashes;
      console.info(`[export] frame hashes: ${hashes.length} frames, first ${hashes[0]}, last ${hashes[hashes.length - 1]}`);
    }
    return { blob: result.blob, frames: result.frames, elapsedMs: performance.now() - started, audioIncluded: result.audioIncluded, width: result.width, height: result.height };
  }

  /** The colour backend's own stage clocks (WebGL2: upload / temporal / grade / capture; see syncProfile). */
  private backendClocks(): BackendClocks | null {
    const b = this.engine?.backend as unknown as Partial<BackendClocks> | undefined;
    return b?.stageMs && b.syncProfile !== undefined ? (b as BackendClocks) : null;
  }
  private clocks0: BackendClocks["stageMs"] | null = null;

  /** A new export profile; `?profile=sync` also has the backend finish the GPU per stage (exact, a little slower). */
  private startProfile(): ExportProfile {
    const c = this.backendClocks();
    const sync = new URLSearchParams(location.search).get("profile") === "sync";
    if (c) {
      c.syncProfile = sync;
      this.clocks0 = { ...c.stageMs };
    }
    // The geometry canvas too, so its GPU time is the geometry stage's, not the upload's that reads it.
    if (this.geo) this.geo.syncProfile = sync;
    return new ExportProfile();
  }

  /** Logs the export's per-stage timing and puts its line on the export sheet (?debug=1). */
  private reportProfile(prof: ExportProfile, look: AnalysisLookahead | null): void {
    const e = this.engine;
    const c = this.backendClocks();
    if (c?.syncProfile && this.clocks0) {
      // The grade call holds the temporal passes and the canvas capture: split them out.
      const temporal = c.stageMs.temporal - this.clocks0.temporal;
      const capture = c.stageMs.capture - this.clocks0.capture;
      prof.ms.temporal = temporal;
      prof.ms.render = Math.max(0, prof.ms.render - temporal - capture);
      prof.ms.readback += capture;
      c.syncProfile = false;
    }
    const line = prof.summary();
    const ps = e?.precomputeStats;
    const ahead = look ? ` · analyse-first ${look.analysed} thumbnails, ${ps?.hits ?? 0} used, ${ps?.misses ?? 0} live${ps?.mismatches ? `, ${ps.mismatches} mismatched` : ""}${ps && ps.personHits + ps.personMisses ? `; person ${ps.personHits} ahead, ${ps.personMisses} live` : ""}` : "";
    console.info(`[export] profile: ${line}${ahead}`);
    console.info(`[export] profile ms: ${JSON.stringify(prof.table())}`);
    this.setExp({ profile: line + ahead });
  }

  /**
   * Native export (apps/mobile): the page decodes (WebCodecs via mediabunny)
   * and renders exactly as the offline path does, then hands each rendered
   * frame's pixels to the app's hardware encoder (AVAssetWriter on iOS,
   * MediaCodec + MediaMuxer on Android) over a loopback connection; the app
   * copies the audio track from the source file itself. No canvas →
   * VideoFrame → VideoEncoder hop in WebKit, and the app can keep the export
   * alive in the background (iOS 26 continued-processing task, Android
   * foreground service). See apps/mobile/MOBILE.md.
   */
  private async runNative(media: MediaMod, file: File, info: ClipInfo, bitrate: number, total: number, colourOn: boolean, ctrl: AbortController, trim: TrimRange | null): Promise<ExportResult> {
    const e = this.engine, geo = this.geo;
    const src = nativeFileOf(file);
    if (!src) throw new Error("This clip was not opened from the app's picker");
    const nat = await loadNative();
    const caps = await nat.nativeInfo();
    const geoOn = this.geometryActive();
    const shared = colourOn && geoOn && e ? this.sharedGeometry(e) : null;
    // Footage profile, as on the offline path (decoded frames re-tagged when the browser would convert them).
    const footage = this.footageMode("frame");
    const hp = this.highPrecision(footage);
    const retag = footage !== 0 && this.signal?.frame === "retag";
    await this.engineForExport();
    const prof = this.startProfile();
    const w0 = e ? { ...e.workerMs } : null;
    const workerTimes = () => {
      if (!e || !w0) return;
      prof.ms.analysisWorker = e.workerMs.analysis - w0.analysis;
      prof.ms.person = e.workerMs.person - w0.person;
      prof.analyses = e.workerMs.analyses - w0.analyses;
      prof.thumbReadbackMs = e.workerMs.readback - w0.readback;
      prof.extra = { poolWait: e.workerMs.poolWait - w0.poolWait, personWait: e.workerMs.personWait - w0.personWait };
    };
    // decodeFrames reports container time, and so does everything below (analyzeDue, the warp, the looks).
    const look = colourOn ? await this.lookaheadFor(media, file, "container", { geoOn, footage, hp, retag, prof, signal: ctrl.signal, endSec: trim?.end }) : null;
    const outName = this.outName("mp4");
    let session: Awaited<ReturnType<typeof nat.DiveNative.startExport>> | null = null;
    let sink: InstanceType<typeof nat.NativeFrameSink> | null = null;
    let t0: number | null = null;
    let width = info.displayW, height = info.displayH;
    const started = performance.now();
    let frames = 0, lastUi = 0, lastLive = 0;
    const onAbort = () => { if (session) void nat.DiveNative.cancelExport({ id: session.id }).catch(() => undefined); };
    ctrl.signal.addEventListener("abort", onAbort, { once: true });
    // The user can stop the export from the iOS Live Activity; the system can expire it.
    const stateSub = await nat.DiveNative.addListener("exportState", (ev) => {
      if (!session || ev.id !== session.id) return;
      console.info(`[export] native state: ${ev.state}${ev.message ? ` (${ev.message})` : ""}`);
      if (ev.state === "cancelled-by-user" || ev.state === "background-expired") ctrl.abort();
    });
    // Trimmed: only the selection is decoded; the first kept frame's source time aligns the audio (shiftSec).
    const frameIter = media.decodeFrames(file, ctrl.signal, trim)[Symbol.asyncIterator]();
    try {
      this.setExp({ state: "running", detail: "Rendering" });
      for (;;) {
        let tp = performance.now();
        const nextFrame = await frameIter.next();
        if (nextFrame.done) break;
        const { sample, info: fi } = nextFrame.value;
        if (look) {
          prof.add("decode", performance.now() - tp);
          try {
            await prof.time("prepass", () => look.ensure(fi.timeSec));
          } catch (err) {
            sample.close();
            throw err;
          }
          tp = performance.now();
        }
        let decoded = sample.toVideoFrame();
        sample.close();
        if (retag) {
          const raw = await media.retagFrame(decoded).catch(() => null);
          if (raw) {
            decoded.close();
            decoded = raw;
          }
        }
        const frame = media.squarePixels(decoded);
        prof.add("decode", performance.now() - tp);
        try {
          if (t0 === null) {
            t0 = fi.timeSec;
            width = fi.displayWidth;
            height = fi.displayHeight;
            session = await nat.DiveNative.startExport({
              width,
              height,
              fps: info.fps || 30,
              bitrate: Math.round(bitrate),
              codec: caps.encoders.avc ? "avc" : "hevc",
              keyFrameIntervalSec: 2,
              durationSec: total,
              audio: info.hasAudio ? { path: src.path, shiftSec: Math.max(0, t0) } : null,
              title: `Exporting ${this.snap.fileName ?? "clip"}`,
              subtitle: `${width}×${height}`,
              outputName: outName,
            });
            sink = new nat.NativeFrameSink(session, (await nat.loopbackReachable()) ? "loopback" : "bridge");
            console.info(`[export] native encoder ${caps.platform} ${width}×${height}, frames via ${sink.transport}, background: ${caps.background}`);
          }
          const timeSec = Math.max(0, fi.timeSec - t0);
          const rot = ((fi.rotation / 90) % 4) as Rotation;
          const ts = Math.round(timeSec * 1e6);
          const dur = frame.duration ?? undefined;
          let out: VideoFrame;
          const geoOpts: GeometryRenderOptions = { texCoded: true, split: null, footage, highPrecision: hp };
          if (!colourOn || (geoOn && !shared)) {
            tp = performance.now();
            geo!.resize(fi.displayWidth, fi.displayHeight);
            geo!.render(frame, this.geoParams(fi.timeSec, rot as QuarterTurns), geoOpts);
            prof.add("geometry", performance.now() - tp);
          }
          if (shared?.kind === "gpu") await shared.geo.probe(frame);
          if (shared) this.geometryToEngine(e!, frame, this.geoParams(fi.timeSec, rot as QuarterTurns), geoOpts, fi.displayWidth, fi.displayHeight, prof, shared);
          tp = performance.now();
          if (!colourOn) {
            out = new VideoFrame(geo!.canvas, { timestamp: ts, duration: dur });
          } else {
            const eng = e!;
            let rotE: Rotation = rot;
            if (shared) {
              rotE = 0;
            } else if (geoOn) {
              eng.upload(geo!.canvas, fi.displayWidth, fi.displayHeight, 0);
              rotE = 0;
            } else {
              eng.upload(frame, frame.displayWidth, frame.displayHeight, rot);
            }
            const segStart = this.applyLook(fi.timeSec);
            const ta = performance.now();
            prof.add("upload", ta - tp);
            await eng.analyzeDue(fi.timeSec, frames === 0 || segStart || eng.inCutWindow(fi.timeSec)).catch(() => undefined);
            eng.dropPrecomputedBefore(fi.timeSec);
            tp = performance.now();
            prof.add("analysisWait", tp - ta);
            eng.settings = this.settingsAt(fi.timeSec);
            eng.tick(fi.timeSec);
            eng.setSegOverlay(this.segOverlay(fi.timeSec));
            out = await eng.renderToFrame(rotE, ts, dur);
          }
          prof.add("readback", performance.now() - tp);
          try {
            await prof.time("encode", () => sink!.push(out, ts, dur));
            frames++;
            prof.frames = frames;
            const now = performance.now();
            if (now - lastLive > LIVE_EVERY_MS) {
              lastLive = now;
              await prof.time("ui", () => this.emitFrame(out));
            }
            if (now - lastUi > 250) {
              lastUi = now;
              const secs = (now - started) / 1000;
              const fps = frames / secs;
              const progress = total > 0 ? Math.min(1, timeSec / total) : 0;
              const eta = progress > 0.02 ? (secs / progress) * (1 - progress) : null;
              workerTimes();
              this.setExp({ frames, fps, progress, etaSec: eta, detail: `${width}×${height} · ${fps.toFixed(1)} fps · native encoder`, profile: prof.summary() });
            }
          } finally {
            out.close();
          }
        } finally {
          frame.close();
        }
      }
      if (!session || !sink) throw new Error("Decoder produced no frames");
      await prof.time("encode", () => sink!.flush());
      this.setExp({ detail: "Finishing file", progress: 1 });
      const outFile = await prof.time("mux", () => nat.DiveNative.finishExport({ id: session!.id }));
      prof.end();
      workerTimes();
      this.reportProfile(prof, look);
      return {
        blob: null,
        native: { path: outFile.path, name: outFile.name, mime: outFile.mime, size: outFile.size },
        bytes: outFile.size,
        mime: outFile.mime,
        name: outFile.name,
        url: nat.webPathOf(outFile.path),
        frames,
        elapsedMs: performance.now() - started,
        audioIncluded: outFile.audioIncluded,
        width,
        height,
      };
    } catch (err) {
      if (session) await nat.DiveNative.cancelExport({ id: session.id }).catch(() => undefined);
      throw ctrl.signal.aborted ? new DOMException("Aborted", "AbortError") : err;
    } finally {
      look?.dispose();
      await frameIter.return?.(undefined).catch(() => undefined);
      ctrl.signal.removeEventListener("abort", onAbort);
      void stateSub.remove();
    }
  }

  /**
   * Real-time export (WebKit): play the clip through, render every presented
   * frame into the visible canvas at full size, record it with MediaRecorder
   * and remux the original audio. If the renderer can't hold the clip's
   * frame rate, restart with the clip slowed down (every frame still lands
   * in the file, re-timed), then at half size.
   */
  private async runRealtime(media: MediaMod, file: File, v: HTMLVideoElement, info: ClipInfo, bitrate: number, total: number, colourOn: boolean, ctrl: AbortController, trim: TrimRange | null) {
    const e = this.engine, geo = this.geo!;
    const canvas = colourOn ? e!.backend.canvas : geo.canvas;
    const STEPS: { scale: number; rate: number }[] = [
      { scale: 1, rate: 1 }, { scale: 1, rate: 0.5 }, { scale: 1, rate: 0.25 }, { scale: 0.5, rate: 0.25 },
    ];
    const srcFps = Math.min(60, Math.max(24, Math.round(info.fps || (await media.probeFrameRate(file)))));
    const started = performance.now();
    for (let si = 0; si < STEPS.length; si++) {
      const { scale, rate } = STEPS[si];
      const canRetry = si < STEPS.length - 1;
      const need = srcFps * rate;
      const W = Math.max(2, Math.round(info.displayW * scale)), H = Math.max(2, Math.round(info.displayH * scale));
      const tag = `${rate < 1 ? ` · ${rate === 0.5 ? "½" : "¼"} speed` : ""}${scale < 1 ? ` · ${Math.round(scale * 100)}% size` : ""}`;
      // Grade the first frame before recording starts so the file never opens uncorrected.
      await this.engineForExport();
      this.setExp({ state: "preparing", detail: `Preparing${tag}` });
      const from = trim?.start ?? 0;
      await seekVideo(v, from).catch(() => undefined);
      if (colourOn && e) {
        this.uploadToEngine(v, from, false, [W, H]);
        await e.analyzeNow(true).catch(() => undefined);
      }
      let rendered = 0;
      let slow = false;
      let lastLive = 0;
      const rtStart = performance.now();
      const rtCtrl = new AbortController();
      const onOuterAbort = () => rtCtrl.abort();
      ctrl.signal.addEventListener("abort", onOuterAbort, { once: true });
      this.setExp({ state: "running", detail: `Real time${tag}` });
      try {
        const result = await media.exportRealtime(file, v, canvas, {
          bitrate,
          opfsPrefix: OPFS_PREFIX,
          fps: srcFps,
          rate,
          range: trim,
          signal: rtCtrl.signal,
          log: (line) => console.info("[export]", line),
          onProgress: (p) => {
            const secs = (performance.now() - rtStart) / 1000;
            const fps = secs > 0.5 ? rendered / secs : 0;
            const remain = Math.max(0, total * (1 - p)) / rate;
            this.setExp({ progress: p, frames: rendered, fps, etaSec: p > 0.01 ? remain : null, detail: `Real time · ${W}×${H}${tag}` });
            // Judged against what this step needs; a miss restarts at the next step.
            if (canRetry && secs > 2.5 && fps < need * 0.9 && !slow) {
              slow = true;
              console.info(`[export] ${fps.toFixed(1)} fps rendered, needed ${need.toFixed(0)} (×${rate}, ${scale}× size): restarting slower`);
              rtCtrl.abort();
            }
          },
          startRendering: (onFrame) => {
            let active = true;
            const vv = v as VideoWithRVFC;
            const step = (_n?: number, meta?: { mediaTime?: number }) => {
              if (!active || !this.exporting) return;
              if (v.readyState >= 2) {
                const t = meta?.mediaTime ?? v.currentTime;
                if (colourOn && e) {
                  this.uploadToEngine(v, t, false, [W, H]);
                  // Real time can't wait for an analysis: a new segment asks for one at once and the lock snaps in tick.
                  const segStart = this.applyLook(t);
                  e.tick(t, segStart);
                  e.render();
                } else {
                  geo.resize(W, H);
                  geo.render(v, this.geoParams(t, info.rot), this.uprightOpts(null));
                }
                onFrame(t);
                rendered++;
                const now = performance.now();
                if (now - lastLive > 1000) {
                  lastLive = now;
                  void this.emitFrame(canvas);
                }
              }
              if (typeof vv.requestVideoFrameCallback === "function") vv.requestVideoFrameCallback(step);
              else requestAnimationFrame(() => step());
            };
            step();
            return () => { active = false; };
          },
        });
        return { blob: result.blob, frames: rendered, elapsedMs: performance.now() - started, audioIncluded: result.audioIncluded };
      } catch (err) {
        if (slow && !ctrl.signal.aborted) continue;
        throw err;
      } finally {
        ctrl.signal.removeEventListener("abort", onOuterAbort);
      }
    }
    throw new Error("Real-time export could not keep up on this device");
  }

  /** Photo: render once at full resolution and encode a JPEG. */
  private async exportPhoto(): Promise<void> {
    const e = this.engine, bmp = this.photo, info = this.snap.info;
    if (!bmp || !info || this.exporting) return;
    // A settings change still waiting to re-analyse the photo, or its analysis in flight: the export takes its result.
    if (this.photoAnalyseTimer && this.tools.colour.enabled && e) {
      clearTimeout(this.photoAnalyseTimer);
      this.photoAnalyseTimer = 0;
      void this.analysePhoto();
    }
    const analysing = this.photoAnalysing;
    this.beginExport();
    const started = performance.now();
    let failure: unknown = null;
    try {
      const W = info.displayW, H = info.displayH;
      const colourOn = this.tools.colour.enabled && !!e;
      if (colourOn && analysing) {
        this.setExp({ detail: "Reading the water…" });
        await analysing;
      }
      this.setExp({ state: "running", detail: `${W}×${H}`, progress: 0.2 });
      let src: VideoFrame | HTMLCanvasElement;
      if (colourOn) {
        e!.split = 0;
        this.uploadToEngine(bmp, 0, false, [W, H]);
        e!.setPreviewScale(1);
        src = await e!.renderToFrame(0, 0, undefined);
        // WebGL2 backend: draw the canvas itself (it holds the full-size render); WebKit draws
        // a VideoFrame wrapped from a WebGL canvas upside down.
        if (e!.backend.kind === "webgl2") {
          src.close();
          src = e!.backend.canvas;
        }
      } else {
        const geo = this.geo!;
        geo.resize(W, H);
        geo.render(bmp, this.geoParams(0, 0), { texCoded: false, split: null });
        src = geo.canvas;
      }
      this.setExp({ progress: 0.6 });
      await this.emitFrame(src);
      const encoded = await encodeJpeg(src, W, H);
      // The browser's encoder writes no EXIF: carry the original's over (date, GPS, camera), orientation baked in.
      const exif = this.file ? readExif(new Uint8Array(await this.file.arrayBuffer())) : null;
      const blob = exif ? new Blob([withExif(new Uint8Array(await encoded.arrayBuffer()), exif, { width: W, height: H }) as BlobPart], { type: "image/jpeg" }) : encoded;
      console.info(`[export] photo ${W}x${H}, EXIF ${exif ? "kept" : "none in source"}`);
      if (typeof VideoFrame !== "undefined" && src instanceof VideoFrame) src.close();
      this.setExp({
        state: "done",
        progress: 1,
        etaSec: 0,
        frames: 1,
        detail: "",
        result: { blob, native: null, bytes: blob.size, mime: blob.type || "image/jpeg", name: this.outName("jpg"), url: URL.createObjectURL(blob), frames: 1, elapsedMs: performance.now() - started, audioIncluded: true, width: W, height: H },
      });
    } catch (err) {
      failure = err;
    } finally {
      this.finishExport(failure);
      this.repaint();
    }
  }

  cancelExport(): void {
    this.exportAbort?.abort();
  }

  dismissExport(): void {
    if (this.exporting) return;
    const r = this.snap.exp.result;
    if (r?.blob) {
      URL.revokeObjectURL(r.url);
      // The file behind the Blob lives in private storage until released (a 4K export can be gigabytes).
      void releaseExportBlob(r.blob);
    }
    this.set({ exp: IDLE_EXPORT });
  }
}

/**
 * Why the <video> element couldn't show a clip: the codec when this browser
 * can't decode it at all; otherwise (WebCodecs decodes it but the player
 * refuses the file, e.g. a container or audio track it can't handle) say so.
 */
/** FNV-1a of a frame's RGBX pixels (determinism checks only: copies the frame out). */
async function frameHash(f: VideoFrame): Promise<string> {
  const r = f.visibleRect;
  const w = r?.width ?? f.codedWidth, h = r?.height ?? f.codedHeight;
  const buf = new Uint8Array(w * h * 4);
  await f.copyTo(buf, { format: "RGBX", rect: { x: r?.x ?? 0, y: r?.y ?? 0, width: w, height: h } } as VideoFrameCopyToOptions);
  let a = 0x811c9dc5;
  const u32 = new Uint32Array(buf.buffer);
  for (let i = 0; i < u32.length; i++) a = Math.imul(a ^ (u32[i] & 0xffffff), 0x01000193);
  return (a >>> 0).toString(16).padStart(8, "0");
}

type BackendClocks = { stageMs: { upload: number; temporal: number; grade: number; capture: number }; syncProfile: boolean };
/** A WebGPU colour backend another stage can render the source into (backend-webgpu.ts). */
type GpuSourceDrawBackend = {
  readonly gpuDevice: GPUDevice;
  beginSourceDraw(width: number, height: number): GPUTexture;
  endSourceDraw(width: number, height: number, rotation: Rotation): void;
};
type SharedGeometry = { kind: "gl"; geo: GeometryRenderer; b: SourceDrawBackend } | { kind: "gpu"; geo: GpuGeometryRenderer; b: GpuSourceDrawBackend };
/**
 * The WebGPU geometry pass is opt-in (?geoshare=gpu): it is not bit-identical to the WebGL pass and has not been
 * measured on a device with a real GPU yet (headless SwiftShader can't import video frames). ?geoshare=0 turns
 * both shared passes off.
 */
const GPU_GEOMETRY_DEFAULT = false;
/** A colour backend another stage can draw the source in (backend-webgl2.ts). */
type SourceDrawBackend = {
  readonly context: WebGL2RenderingContext;
  beginSourceDraw(width: number, height: number): void;
  endSourceDraw(width: number, height: number, rotation: Rotation): void;
  syncIfProfiling(): void;
};

function playerHelp(info: ClipInfo | null): string | null {
  if (!info) return null;
  if (info.canDecode) return `This browser decodes the video (${parseCodec(info.codecString).label ?? "codec"}) but its player can't open this file. Try re-saving it as MP4 (e.g. export from Photos), or open it in Safari or Chrome.`;
  return codecHelp(info.codecString);
}

/** Calibration clip for a clip's colour tags (null: plain Rec.709, nothing to measure). */
function calibKindOf(tags: ClipInfo["colorTags"]): CalibKind | null {
  if (!tags) return null;
  if (tags.transfer === "hlg") return "hlg";
  if (tags.transfer === "pq") return "pq";
  if (tags.primaries === "bt2020") return "wide";
  return null;
}

