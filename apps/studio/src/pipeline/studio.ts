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
import type { WarpUniforms } from "../../../dewarp/src/fisheye.ts";
import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";
import { GeometryRenderer, type GeometrySource } from "./geometry.ts";
import type { GeometryParams, QuarterTurns } from "./geometry-math.ts";
import type { ClipInfo } from "./probe.ts";
import { colourSettings, DEFAULT_TOOLS, exportSuffix, solveParams, type ToolsState } from "./tools.ts";
import { stabInfo, stabSummary, type StabInfo } from "./stab-info.ts";
import { seekVideo, waitForEvent, waitForFirstFrame, type VideoWithRVFC } from "./video.ts";
import { decodePhoto, encodeJpeg, isPhotoFile, photoLimits } from "./photo.ts";
import { isNativeShell, nativeFileOf, type NativeFileRef } from "../native/registry.ts";

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
};

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
};

const IDLE_EXPORT: ExportStatus = { state: "idle", progress: 0, frames: 0, fps: 0, etaSec: null, detail: "", message: null, result: null };
const STAB_OFF: StabStatus = { state: "off", progress: 0, summary: null, message: null, info: null };

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
  };
  private listeners = new Set<() => void>();
  private frameListeners = new Set<(b: ImageBitmap) => void>();

  private colour: ColourMod | null = null;
  private motion: MotionMod | null = null;
  private dewarpMod: DewarpMod | null = null;
  private engine: Engine | null = null;
  private enginePromise: Promise<Engine | null> | null = null;
  private geo: GeometryRenderer | null = null;
  private video: HTMLVideoElement | null = null;
  private stabClient: AnalysisClient | null = null;
  private analysis: AnalysisResult | null = null;
  private path: Plan | null = null;
  private stabAbort: AbortController | null = null;
  private solveSeq = 0;
  private solveTimer = 0;

  private tools: ToolsState = DEFAULT_TOOLS;
  private dewarpU: WarpUniforms | null = null;
  private split: number | null = null;
  private file: File | null = null;
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
    });
    video.addEventListener("seeked", () => {
      if (this.snap.kind !== "video") return;
      this.set({ currentTime: video.currentTime });
      if (!this.exporting && this.snap.phase === "ready") {
        this.dropStill();
        this.drawLive(video.currentTime, false);
        if (video.paused) void this.captureStill();
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
      const engine = await mod.GradeEngine.create(canvas, (e) => this.set({ error: e.message }), !q.has("webgl2"));
      engine.settings = colourSettings(this.tools.colour);
      engine.personEnabled = q.get("person") !== "0";
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

  setTools(next: ToolsState): void {
    const prev = this.tools;
    this.tools = next;
    const e = this.engine;
    if (e) e.settings = colourSettings(next.colour);
    const info = this.snap.info;
    if (info && (next.dewarp !== prev.dewarp || !this.dewarpU)) void this.updateDewarp();
    const video = this.snap.kind === "video";
    if (this.snap.phase === "ready" && video) {
      if (next.colour.enabled && !this.snap.colourProfiled && !this.profiling) void this.profileColour();
      if (next.stabilise.enabled && !this.analysis && !this.stabAbort) void this.analyseMotion();
      const a = next.stabilise, b = prev.stabilise;
      if (a.visual !== b.visual && (this.analysis || this.stabAbort)) {
        // Gyro data ↔ visual tracking: a different analysis, not just a re-solve.
        this.stabAbort?.abort();
        this.stabAbort = null;
        this.analysis = null;
        this.path = null;
        if (a.enabled) void this.analyseMotion();
      } else if (a.enabled && this.analysis) {
        const outputChanged = this.analysis.mode === "gyro" && next.dewarp.enabled !== prev.dewarp.enabled;
        if (a.strength !== b.strength || a.maxCrop !== b.maxCrop || a.keepLevel !== b.keepLevel || a.lens !== b.lens || outputChanged) this.scheduleSolve();
      }
    }
    this.set({ visible: next.colour.enabled ? "colour" : "geo" });
    // A photo has no frame loop: a framing change needs a fresh analysis.
    if (this.snap.kind === "photo" && (next.dewarp !== prev.dewarp || next.colour.enabled !== prev.colour.enabled)) this.schedulePhotoAnalysis();
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
    this.repaint();
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
    this.set({ phase: "loading", kind: "video", busy: "Reading clip…", error: null, fileName: file.name, colourProfiled: false, exp: IDLE_EXPORT, stab: STAB_OFF, photoLimited: null, camera: null });
    try {
      await touchFile(file);
      const media = await loadMedia();
      const info = await media.probeClip(file);
      if (gen !== this.gen) return;
      // Which camera / lens (for Dewarp's preselection); only reads the moov box and two samples.
      void media.detectClipCamera(file, info?.codedW ?? 0, info?.codedH ?? 0).then((camera) => {
        if (gen !== this.gen) return;
        console.info(`[camera] ${camera.brand ? [camera.brand, camera.model, camera.lensMode].filter(Boolean).join(" ") : "unknown"} -> ${camera.profileId ?? "default"} (${camera.evidence.join("; ")})`);
        this.set({ camera });
        void this.updateDewarp();
      });
      const url = URL.createObjectURL(file);
      this.sourceUrl = url;
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = "auto";
      await waitForEvent(v, ["loadedmetadata"], ["error"], 20_000, "Could not read this video");
      if (gen !== this.gen) return;
      // iOS only decodes once playback starts: play muted and wait for a frame.
      await v.play().catch(() => undefined);
      await waitForFirstFrame(v, 15_000);
      if (gen !== this.gen) return;
      if (!v.videoWidth) throw new Error("This video has no decodable picture (unsupported codec?)");
      const fallback: ClipInfo = { rot: 0, displayW: v.videoWidth, displayH: v.videoHeight, codedW: v.videoWidth, codedH: v.videoHeight, fps: 30, duration: v.duration, codec: null, hasAudio: false };
      const clip = info ?? fallback;
      e.lockGlobals(null);
      const mode = this.pickExportMode(e, file);
      this.set({ info: clip, duration: v.duration || clip.duration, phase: "ready", currentTime: 0, exportMode: mode, canExport: mode === "realtime" || mode === "native" || isWebCodecsSupported() });
      await this.updateDewarp();
      // First frame graded before anything shows, so the clip never flashes uncorrected.
      this.uploadToEngine(v, v.currentTime, false);
      await e.analyzeNow(true).catch((err: unknown) => this.fail(err, "Analysis failed"));
      if (gen !== this.gen) return;
      this.set({ busy: null });
      this.startPreview();
      if (this.tools.colour.enabled) void this.profileColour();
      if (this.tools.stabilise.enabled) void this.analyseMotion();
    } catch (err) {
      if (gen !== this.gen) return;
      this.set({ busy: null, phase: "empty", kind: null, fileName: null, info: null });
      this.fail(err);
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
    this.set({ phase: "loading", kind: "photo", busy: "Reading photo…", error: null, fileName: file.name, colourProfiled: false, exp: IDLE_EXPORT, stab: STAB_OFF, playing: false, currentTime: 0, duration: 0, camera: null });
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
  private async analysePhoto(): Promise<void> {
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
      if (this.snap.kind === "photo" && !this.exporting) void this.analysePhoto();
    }, 150);
  }

  /** Back to the empty state. */
  close(): void {
    this.teardown();
    this.set({ phase: "empty", kind: null, fileName: null, info: null, duration: 0, currentTime: 0, playing: false, busy: null, colourProfiled: false, exp: IDLE_EXPORT, stab: STAB_OFF });
  }

  private teardown(): void {
    this.gen++;
    this.previewOn = false;
    this.exportAbort?.abort();
    this.stabAbort?.abort();
    this.stabAbort = null;
    this.analysis = null;
    this.path = null;
    this.profiling = null;
    clearTimeout(this.photoAnalyseTimer);
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
    return this.stabActive() || (this.tools.dewarp.enabled && !!this.dewarpU);
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
    if (this.geometryActive() && this.geo) {
      const [w, h] = size ?? this.previewSize();
      this.geo.resize(w, h);
      this.geo.render(src, this.geoParams(t, info.rot), { texCoded: false, split });
      e.upload(this.geo.canvas, w, h, 0);
      e.setPreviewScale(1);
    } else {
      const w = (src as HTMLVideoElement).videoWidth || (src as ImageBitmap).width || info.displayW;
      const h = (src as HTMLVideoElement).videoHeight || (src as ImageBitmap).height || info.displayH;
      e.upload(src, w, h, 0);
      if (size) e.setPreviewScale(Math.min(1, size[0] / w));
      else e.setPreviewScale(Math.min(1, this.previewSize()[0] / w));
    }
  }

  /** Draws `src` at media time `t` into the visible canvas. */
  private draw(src: GeometrySource, t: number, advance: boolean): void {
    const info = this.snap.info;
    if (!info) return;
    if (this.tools.colour.enabled && this.engine) {
      this.uploadToEngine(src, t, true);
      if (advance) this.engine.tick(t);
      this.engine.render();
    } else if (this.geo) {
      const [w, h] = this.previewSize();
      this.geo.resize(w, h);
      this.geo.render(src, this.geoParams(t, info.rot), { texCoded: false, split: this.split });
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
    if (!v || !v.paused || v.readyState < 2 || this.snap.phase !== "ready" || this.snap.kind !== "video" || this.exporting) return;
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
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }

  pause(): void {
    this.video?.pause();
  }

  seek(t: number): void {
    const v = this.video;
    if (!v || this.exporting || this.snap.phase !== "ready" || this.snap.kind !== "video") return;
    try {
      v.currentTime = Math.min(Math.max(0, t), v.duration || 0);
    } catch {
      // ignore
    }
    this.set({ currentTime: v.currentTime });
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
      if (!v || !e || !mod || new URLSearchParams(location.search).get("lock") === "0") return;
      const gen = this.gen;
      const times = mod.profileTimes(v.duration);
      if (!times.length) return;
      const wasPaused = v.paused;
      const resumeAt = v.currentTime;
      this.previewOn = false;
      v.pause();
      this.set({ busy: "Profiling colour…" });
      const samples: import("./colour.ts").ProfileSample[] = [];
      try {
        for (const t of times) {
          if (gen !== this.gen || this.exporting) return;
          await seekVideo(v, t);
          this.uploadToEngine(v, t, false);
          try {
            const r = await e.analyzeRaw();
            samples.push({ t, params: r.params, mean: r.mean });
          } catch {
            // a failed sample just doesn't vote
          }
        }
        if (gen !== this.gen) return;
        const lock = mod.segmentProfile(samples, mod.SCENE_CUT_MEAN_DIFF);
        if (lock) e.lockGlobals(lock);
        console.info(`[profile] ${lock ? `locked ${lock.length} segment(s)` : "skipped"}: ${samples.length}/${times.length} samples`);
        this.set({ colourProfiled: true });
      } finally {
        if (gen === this.gen) {
          this.set({ busy: null });
          if (!this.exporting) {
            await seekVideo(v, resumeAt).catch(() => undefined);
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
    const ctrl = new AbortController();
    this.stabAbort = ctrl;
    this.setStab({ state: "analysing", progress: 0, message: null });
    try {
      const mod = this.motion ?? (this.motion = await loadMotion());
      const client = this.stabClient ?? (this.stabClient = new mod.AnalysisClient());
      let last = 0;
      const analysis = await client.analyze(file, (fraction) => {
        const now = performance.now();
        if (now - last > 150) {
          last = now;
          this.setStab({ progress: fraction });
        }
      }, ctrl.signal, this.tools.stabilise.visual);
      if (gen !== this.gen || ctrl.signal.aborted) return;
      this.analysis = analysis;
      const info = stabInfo(analysis);
      console.info(`[stabilise] ${info.badge}${info.warning ? ` (${info.warning})` : ""}`);
      this.setStab({ state: "solving", progress: 1, info });
      const path = await client.solve(solveParams(this.tools.stabilise, analysis.mode, this.stabOutput()));
      if (gen !== this.gen || ctrl.signal.aborted) return;
      this.path = path;
      this.setStab({ state: "ready", summary: this.stabSummary() });
      this.repaint();
    } catch (e) {
      if (gen !== this.gen || ctrl.signal.aborted) return;
      this.setStab({ state: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (this.stabAbort === ctrl) this.stabAbort = null;
    }
  }

  private stabSummary(): string | null {
    return this.analysis && this.path ? stabSummary(this.analysis, this.path) : null;
  }

  private scheduleSolve(): void {
    clearTimeout(this.solveTimer);
    const seq = ++this.solveSeq;
    this.solveTimer = window.setTimeout(async () => {
      const client = this.stabClient;
      const analysis = this.analysis;
      if (!client || !analysis) return;
      try {
        const path = await client.solve(solveParams(this.tools.stabilise, analysis.mode, this.stabOutput()));
        if (analysis !== this.analysis) return;
        if (seq !== this.solveSeq) return;
        this.path = path;
        this.setStab({ state: "ready", summary: this.stabSummary() });
        this.repaint();
      } catch (e) {
        this.setStab({ state: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }, 120);
  }

  /** Resolves once the motion path is ready (or rejects if analysis failed). */
  private async waitForPath(): Promise<void> {
    if (!this.tools.stabilise.enabled || this.path) return;
    if (!this.stabAbort && !this.analysis) void this.analyseMotion();
    while (!this.path) {
      if (this.snap.stab.state === "error") throw new Error("Motion analysis failed: " + (this.snap.stab.message ?? ""));
      if (this.exportAbort?.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const pct = Math.round(this.snap.stab.progress * 100);
      this.setExp({ detail: `Analysing motion ${pct}%` });
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // ------------------------------------------------------------ export

  private outName(ext: string): string {
    const base = (this.snap.fileName ?? "clip").replace(/\.[^.]+$/, "");
    return `${base}-${exportSuffix({ ...this.tools, stabilise: { ...this.tools.stabilise, enabled: this.tools.stabilise.enabled && this.snap.kind === "video" } })}.${ext}`;
  }

  private beginExport(): AbortController {
    const old = this.snap.exp.result;
    if (old?.blob) URL.revokeObjectURL(old.url);
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

  async exportVideo(): Promise<void> {
    if (this.snap.kind === "photo") return this.exportPhoto();
    const e = this.engine, file = this.file, v = this.video, info = this.snap.info;
    if (!file || !v || !info || this.exporting) return;
    if (!this.snap.canExport) {
      this.setExp({ state: "error", message: "Saving video isn't supported in this browser: update to the latest Safari or Chrome." });
      return;
    }
    const ctrl = this.beginExport();
    const colourOn = this.tools.colour.enabled && !!e;
    let failure: unknown = null;
    try {
      const media = await loadMedia();
      if (this.profiling) {
        this.setExp({ detail: "Profiling colour…" });
        await this.profiling;
      }
      await this.waitForPath();
      // The profile restarts the preview when it finishes; stop it again.
      this.previewOn = false;
      v.pause();
      if ((this.geometryActive() || !colourOn) && !this.geo) throw new Error("WebGL2 is unavailable");
      const total = this.snap.duration || info.duration;
      const bitrate = bitrateFromSource(file.size, total) ?? pickBitrate(info.displayW, info.displayH, info.fps);
      this.dropStill();
      const mode = this.snap.exportMode;
      if (mode === "native") {
        const res = await this.runNative(media, file, info, bitrate, total, colourOn, ctrl);
        console.info(`[export] done: ${res.frames} frames in ${(res.elapsedMs / 1000).toFixed(1)} s (native), audio ${res.audioIncluded ? "kept" : "dropped"}`);
        this.setExp({ state: "done", progress: 1, etaSec: 0, frames: res.frames, detail: "", result: res });
      } else {
        const res = mode === "realtime"
          ? await this.runRealtime(media, file, v, info, bitrate, total, colourOn, ctrl)
          : await this.runOffline(media, file, bitrate, total, colourOn, ctrl);
        console.info(`[export] done: ${res.frames} frames in ${(res.elapsedMs / 1000).toFixed(1)} s (${mode}), ${res.blob.type}, audio ${res.audioIncluded ? "kept" : "dropped"}`);
        this.setExp({
          state: "done",
          progress: 1,
          etaSec: 0,
          frames: res.frames,
          detail: "",
          result: { ...res, native: null, bytes: res.blob.size, mime: res.blob.type, name: this.outName(res.blob.type === "video/webm" ? "webm" : "mp4"), url: URL.createObjectURL(res.blob), width: info.displayW, height: info.displayH },
        });
      }
    } catch (err) {
      failure = err;
    } finally {
      this.finishExport(failure);
      if (e && this.colour) {
        // The export's last analysis may still be reading back.
        await this.settleEngine();
        e.analysisIntervalMs = this.colour.ANALYSIS_INTERVAL_MS;
        e.personEvery = 2;
        e.reset();
      }
      v.loop = true;
      if (this.file === file && this.snap.phase === "ready") {
        try { v.currentTime = 0; } catch { /* ignore */ }
        this.uploadToEngine(v, 0, false);
        await e?.analyzeNow(true).catch(() => undefined);
        this.drawLive(0, false);
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
    e.analysisIntervalMs = 150;
    e.personEvery = 4;
  }

  /**
   * Offline WebCodecs export (Chrome, Android, desktop Safari fallback):
   * every frame decoded, rendered once, encoded with its own timestamp.
   * The stage shows bitmaps of the encoded frames (never the full-size
   * render canvas, see ARCHITECTURE.md).
   */
  private async runOffline(media: MediaMod, file: File, bitrate: number, total: number, colourOn: boolean, ctrl: AbortController) {
    const e = this.engine, geo = this.geo;
    const geoOn = this.geometryActive();
    await this.engineForExport();
    this.setExp({ state: "running", detail: "Rendering" });
    const started = performance.now();
    let frames = 0;
    let lastUi = 0, lastLive = 0;
    // One frame at a time whenever a canvas is shared between stages (the
    // geometry canvas, or the engine's canvas/bitmap capture paths); the
    // engine's readback path keeps several in flight.
    let gate: Promise<unknown> = Promise.resolve();
    const result = await media.exportWithCodec(
      file,
      async (sample, fi) => {
        const capture = (e?.backend as unknown as { capture?: string | null } | undefined)?.capture;
        const serial = geoOn || !colourOn || capture !== "readback";
        if (serial) await gate;
        const job = (async (): Promise<VideoFrame> => {
          const frame = media.squarePixels(sample.toVideoFrame());
          try {
            const rot = ((fi.rotation / 90) % 4) as Rotation;
            const ts = Math.round(fi.timeSec * 1e6);
            const dur = frame.duration ?? undefined;
            let out: VideoFrame;
            if (geoOn || !colourOn) {
              geo!.resize(fi.displayWidth, fi.displayHeight);
              geo!.render(frame, this.geoParams(fi.timeSec, rot as QuarterTurns), { texCoded: true, split: null });
            }
            if (!colourOn) {
              out = new VideoFrame(geo!.canvas, { timestamp: ts, duration: dur });
            } else {
              const eng = e!;
              let rotE: Rotation = rot;
              if (geoOn) {
                eng.upload(geo!.canvas, fi.displayWidth, fi.displayHeight, 0);
                rotE = 0;
              } else {
                eng.upload(frame, frame.displayWidth, frame.displayHeight, rot);
              }
              // First frame waits for its analysis and snaps; near a profiled
              // cut the exact frame matters; otherwise analysis runs alongside.
              if (frames === 0) await eng.analyzeNow(true).catch(() => undefined);
              else if (eng.inCutWindow(fi.timeSec)) await eng.analyzeNow(true).catch(() => undefined);
              else eng.analyzeSoon();
              eng.tick(fi.timeSec);
              out = await eng.renderToFrame(rotE, ts, dur);
            }
            frames++;
            const now = performance.now();
            if (now - lastLive > LIVE_EVERY_MS) {
              lastLive = now;
              await this.emitFrame(out);
            }
            if (now - lastUi > 250) {
              lastUi = now;
              const secs = (now - started) / 1000;
              const fps = frames / secs;
              const progress = total > 0 ? Math.min(1, fi.timeSec / total) : 0;
              const eta = progress > 0.02 ? (secs / progress) * (1 - progress) : null;
              this.setExp({ frames, fps, progress, etaSec: eta, detail: `${fi.displayWidth}×${fi.displayHeight} · ${fps.toFixed(1)} fps` });
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
      },
    );
    return { blob: result.blob, frames: result.frames, elapsedMs: performance.now() - started, audioIncluded: result.audioIncluded };
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
  private async runNative(media: MediaMod, file: File, info: ClipInfo, bitrate: number, total: number, colourOn: boolean, ctrl: AbortController): Promise<ExportResult> {
    const e = this.engine, geo = this.geo;
    const src = nativeFileOf(file);
    if (!src) throw new Error("This clip was not opened from the app's picker");
    const nat = await loadNative();
    const caps = await nat.nativeInfo();
    const geoOn = this.geometryActive();
    await this.engineForExport();
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
    try {
      this.setExp({ state: "running", detail: "Rendering" });
      for await (const { sample, info: fi } of media.decodeFrames(file, ctrl.signal)) {
        const frame = media.squarePixels(sample.toVideoFrame());
        sample.close();
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
          if (geoOn || !colourOn) {
            geo!.resize(fi.displayWidth, fi.displayHeight);
            geo!.render(frame, this.geoParams(fi.timeSec, rot as QuarterTurns), { texCoded: true, split: null });
          }
          if (!colourOn) {
            out = new VideoFrame(geo!.canvas, { timestamp: ts, duration: dur });
          } else {
            const eng = e!;
            let rotE: Rotation = rot;
            if (geoOn) {
              eng.upload(geo!.canvas, fi.displayWidth, fi.displayHeight, 0);
              rotE = 0;
            } else {
              eng.upload(frame, frame.displayWidth, frame.displayHeight, rot);
            }
            if (frames === 0 || eng.inCutWindow(fi.timeSec)) await eng.analyzeNow(true).catch(() => undefined);
            else eng.analyzeSoon();
            eng.tick(fi.timeSec);
            out = await eng.renderToFrame(rotE, ts, dur);
          }
          try {
            await sink!.push(out, ts, dur);
            frames++;
            const now = performance.now();
            if (now - lastLive > LIVE_EVERY_MS) {
              lastLive = now;
              await this.emitFrame(out);
            }
            if (now - lastUi > 250) {
              lastUi = now;
              const secs = (now - started) / 1000;
              const fps = frames / secs;
              const progress = total > 0 ? Math.min(1, timeSec / total) : 0;
              const eta = progress > 0.02 ? (secs / progress) * (1 - progress) : null;
              this.setExp({ frames, fps, progress, etaSec: eta, detail: `${width}×${height} · ${fps.toFixed(1)} fps · native encoder` });
            }
          } finally {
            out.close();
          }
        } finally {
          frame.close();
        }
      }
      if (!session || !sink) throw new Error("Decoder produced no frames");
      await sink.flush();
      this.setExp({ detail: "Finishing file", progress: 1 });
      const outFile = await nat.DiveNative.finishExport({ id: session.id });
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
  private async runRealtime(media: MediaMod, file: File, v: HTMLVideoElement, info: ClipInfo, bitrate: number, total: number, colourOn: boolean, ctrl: AbortController) {
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
      await seekVideo(v, 0).catch(() => undefined);
      if (colourOn && e) {
        this.uploadToEngine(v, 0, false, [W, H]);
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
                  e.tick(t);
                  e.render();
                } else {
                  geo.resize(W, H);
                  geo.render(v, this.geoParams(t, info.rot), { texCoded: false, split: null });
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
    this.beginExport();
    const started = performance.now();
    let failure: unknown = null;
    try {
      const W = info.displayW, H = info.displayH;
      const colourOn = this.tools.colour.enabled && !!e;
      this.setExp({ state: "running", detail: `${W}×${H}`, progress: 0.2 });
      let src: VideoFrame | HTMLCanvasElement;
      if (colourOn) {
        e!.split = 0;
        this.uploadToEngine(bmp, 0, false, [W, H]);
        e!.setPreviewScale(1);
        src = await e!.renderToFrame(0, 0, undefined);
      } else {
        const geo = this.geo!;
        geo.resize(W, H);
        geo.render(bmp, this.geoParams(0, 0), { texCoded: false, split: null });
        src = geo.canvas;
      }
      this.setExp({ progress: 0.6 });
      await this.emitFrame(src);
      const blob = await encodeJpeg(src, W, H);
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
    if (r?.blob) URL.revokeObjectURL(r.url);
    this.set({ exp: IDLE_EXPORT });
  }
}
