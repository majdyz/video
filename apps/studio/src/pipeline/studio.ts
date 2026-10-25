// The Studio session: owns the clip, the render graph and the exporter, and
// publishes a snapshot the React shell renders (useSyncExternalStore).
//
// Render graph (see ARCHITECTURE.md):
//
//   source ─┬─▶ GeometryRenderer (dewarp + stabilise, one WebGL2 pass) ─┬─▶ [geo canvas]   colour off
//           │                                                         └─▶ GradeEngine ─▶ [colour canvas]
//           └─▶ GradeEngine directly (no geometry tool on: zero extra copies)
//
// The colour engine is Aqua Fix's (apps/aqua-fix/src/engine), the motion
// analysis/path solver Motion Fix's, the lens model Dewarp's: imported, not
// forked.

import {
  bitrateFromSource,
  exportWithCodec,
  isWebCodecsSupported,
  pickBitrate,
  squarePixels,
  touchFile,
  validateUploadedFile,
} from "@dive-tools/shared";
import { ANALYSIS_INTERVAL_MS, GradeEngine, SCENE_CUT_MEAN_DIFF } from "../../../aqua-fix/src/engine/engine.ts";
import type { Rotation } from "../../../aqua-fix/src/engine/backend.ts";
import { profileTimes, segmentProfile, type ProfileSample } from "../../../aqua-fix/src/engine/profile.ts";
import { AnalysisClient } from "../../../motion-fix/src/lib/analysis-client.ts";
import { rawMotion, residualMotion, warpFnAtTime, type MotionAnalysis, type StabilizedPath } from "../../../motion-fix/src/lib/stabilize.ts";
import type { WarpUniforms } from "../../../dewarp/src/fisheye.ts";
import { GeometryRenderer, type GeometrySource } from "./geometry.ts";
import type { GeometryParams, QuarterTurns } from "./geometry-math.ts";
import { probeClip, type ClipInfo } from "./probe.ts";
import { colourSettings, DEFAULT_TOOLS, dewarpUniforms, exportSuffix, stabiliseParams, type ToolsState } from "./tools.ts";
import { seekVideo, waitForEvent, waitForFirstFrame, type VideoWithRVFC } from "./video.ts";

/** Preview renders at the stage's device-pixel size, capped; never at 4K. */
const PREVIEW_MAX_PX = 1600;
const OPFS_PREFIX = "studio-export-";

export type StabStatus = { state: "off" | "analysing" | "solving" | "ready" | "error"; progress: number; summary: string | null; message: string | null };
export type ExportStatus = {
  state: "idle" | "preparing" | "running" | "done" | "error";
  progress: number;
  frames: number;
  fps: number;
  etaSec: number | null;
  detail: string;
  message: string | null;
  result: { blob: Blob; name: string; url: string; frames: number; elapsedMs: number; audioIncluded: boolean } | null;
};

export type Snapshot = {
  engine: "starting" | "webgpu" | "webgl2" | "failed";
  phase: "empty" | "loading" | "ready";
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
};

const IDLE_EXPORT: ExportStatus = { state: "idle", progress: 0, frames: 0, fps: 0, etaSec: null, detail: "", message: null, result: null };

export class Studio {
  private snap: Snapshot = {
    engine: "starting",
    phase: "empty",
    fileName: null,
    info: null,
    duration: 0,
    currentTime: 0,
    playing: false,
    busy: null,
    colourProfiled: false,
    stab: { state: "off", progress: 0, summary: null, message: null },
    visible: "colour",
    error: null,
    exp: IDLE_EXPORT,
    canExport: isWebCodecsSupported(),
  };
  private listeners = new Set<() => void>();
  private thumbListeners = new Set<(b: ImageBitmap) => void>();

  private engine: GradeEngine | null = null;
  private geo: GeometryRenderer | null = null;
  private video: HTMLVideoElement | null = null;
  private stabClient: AnalysisClient | null = null;
  private analysis: MotionAnalysis | null = null;
  private path: StabilizedPath | null = null;
  private stabAbort: AbortController | null = null;
  private solveSeq = 0;
  private solveTimer = 0;

  private tools: ToolsState = DEFAULT_TOOLS;
  private dewarpU: WarpUniforms | null = null;
  private split: number | null = null;
  private file: File | null = null;
  private sourceUrl: string | null = null;
  private gen = 0;
  private still: ImageBitmap | null = null;
  private previewOn = false;
  private exporting = false;
  private exportAbort: AbortController | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private stage = { w: 0, h: 0, dpr: 1 };
  private profiling: Promise<void> | null = null;
  private lastTimeEmit = 0;

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
  /** Live export frames (small bitmaps), for the export sheet. */
  onThumb(fn: (b: ImageBitmap) => void): () => void {
    this.thumbListeners.add(fn);
    return () => this.thumbListeners.delete(fn);
  }

  // ------------------------------------------------------------ lifecycle

  async attach(colourCanvas: HTMLCanvasElement, geoCanvas: HTMLCanvasElement, video: HTMLVideoElement): Promise<void> {
    this.video = video;
    try {
      this.geo = new GeometryRenderer(geoCanvas);
    } catch (e) {
      this.fail(e);
    }
    this.stabClient = new AnalysisClient();
    video.addEventListener("play", () => this.set({ playing: true }));
    video.addEventListener("pause", () => {
      this.set({ playing: false });
      void this.captureStill();
    });
    video.addEventListener("seeked", () => {
      this.set({ currentTime: video.currentTime });
      if (!this.exporting && this.snap.phase === "ready") {
        this.dropStill();
        this.drawLive(video.currentTime, false);
        if (video.paused) void this.captureStill();
      }
    });
    const q = new URLSearchParams(location.search);
    try {
      const engine = await GradeEngine.create(colourCanvas, (e) => this.set({ error: e.message }), !q.has("webgl2"));
      engine.settings = colourSettings(this.tools.colour);
      engine.personEnabled = q.get("person") !== "0";
      this.engine = engine;
      this.set({ engine: engine.backend.kind });
    } catch (e) {
      this.set({ engine: "failed" });
      this.fail(e, "GPU init failed");
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

  // ------------------------------------------------------------ stage size

  /** CSS size of the picture box and the device pixel ratio; sets the preview resolution. */
  setStageSize(w: number, h: number, dpr: number): void {
    this.stage = { w, h, dpr: Math.min(3, dpr || 1) };
    if (!this.exporting) this.repaint();
  }

  private previewSize(): [number, number] {
    const info = this.snap.info;
    if (!info) return [2, 2];
    const want = Math.min(PREVIEW_MAX_PX / info.displayW, (this.stage.w * this.stage.dpr) / info.displayW, (this.stage.h * this.stage.dpr) / info.displayH);
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
    if (info && (next.dewarp !== prev.dewarp || !this.dewarpU)) this.dewarpU = next.dewarp.enabled ? dewarpUniforms(next.dewarp, info.codedW, info.codedH) : null;
    if (this.snap.phase === "ready") {
      if (next.colour.enabled && !this.snap.colourProfiled && !this.profiling) void this.profileColour();
      if (next.stabilise.enabled && !this.analysis && !this.stabAbort) void this.analyseMotion();
      if (next.stabilise.enabled && this.analysis && (next.stabilise.strength !== prev.stabilise.strength || next.stabilise.maxCrop !== prev.stabilise.maxCrop)) this.scheduleSolve();
      if (!next.stabilise.enabled && this.snap.stab.state !== "off" && this.snap.stab.state !== "error") {
        // Analysis keeps running in the background if it was started; just show the source path.
      }
    }
    this.set({ visible: next.colour.enabled ? "colour" : "geo" });
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
    const v = this.video, e = this.engine;
    if (!v) return;
    if (!e) {
      this.set({ error: "The GPU engine isn't ready yet. Try again in a moment." });
      return;
    }
    const check = validateUploadedFile(file, "video");
    if (!check.ok) {
      this.set({ error: check.message });
      return;
    }
    this.teardown();
    const gen = ++this.gen;
    this.file = file;
    this.set({ phase: "loading", busy: "Reading clip…", error: null, fileName: file.name, colourProfiled: false, exp: IDLE_EXPORT, stab: { state: "off", progress: 0, summary: null, message: null } });
    try {
      await touchFile(file);
      const info = await probeClip(file);
      if (gen !== this.gen) return;
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
      this.set({ info: clip, duration: v.duration || clip.duration, phase: "ready", currentTime: 0 });
      this.dewarpU = this.tools.dewarp.enabled ? dewarpUniforms(this.tools.dewarp, clip.codedW, clip.codedH) : null;
      // First frame graded before anything shows, so the clip never flashes uncorrected.
      this.uploadToEngine(v, v.currentTime, false);
      await e.analyzeNow(true).catch((err) => this.fail(err, "Analysis failed"));
      if (gen !== this.gen) return;
      this.set({ busy: null });
      this.startPreview();
      if (this.tools.colour.enabled) void this.profileColour();
      if (this.tools.stabilise.enabled) void this.analyseMotion();
    } catch (err) {
      if (gen !== this.gen) return;
      this.set({ busy: null, phase: "empty", fileName: null, info: null });
      this.fail(err);
    }
  }

  /** Back to the empty state. */
  close(): void {
    this.teardown();
    this.set({ phase: "empty", fileName: null, info: null, duration: 0, currentTime: 0, playing: false, busy: null, colourProfiled: false, exp: IDLE_EXPORT, stab: { state: "off", progress: 0, summary: null, message: null } });
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
    const v = this.video;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl);
    this.sourceUrl = null;
    const r = this.snap.exp.result;
    if (r) URL.revokeObjectURL(r.url);
    this.dropStill();
    this.engine?.reset();
    this.engine?.lockGlobals(null);
  }

  // ------------------------------------------------------------ drawing

  private geometryActive(): boolean {
    return (this.tools.stabilise.enabled && !!this.path) || (this.tools.dewarp.enabled && !!this.dewarpU);
  }

  private geoParams(t: number, rot: QuarterTurns): GeometryParams {
    const info = this.snap.info!;
    return {
      rot,
      displayW: info.displayW,
      displayH: info.displayH,
      stab: this.tools.stabilise.enabled && this.path ? warpFnAtTime(this.path, t) : null,
      dewarp: this.tools.dewarp.enabled ? this.dewarpU : null,
    };
  }

  /**
   * Feeds an upright source (the <video> element or a still from it) to the
   * colour engine, through the geometry stage when a geometry tool is on.
   */
  private uploadToEngine(src: GeometrySource, t: number, withSplit: boolean): void {
    const e = this.engine, info = this.snap.info;
    if (!e || !info) return;
    const split = withSplit ? this.split : null;
    e.split = split ?? 0;
    if (this.geometryActive() && this.geo) {
      const [w, h] = this.previewSize();
      this.geo.resize(w, h);
      this.geo.render(src, this.geoParams(t, info.rot), { texCoded: false, split });
      e.upload(this.geo.canvas, w, h, 0);
      e.setPreviewScale(1);
    } else {
      const w = (src as HTMLVideoElement).videoWidth || (src as ImageBitmap).width || info.displayW;
      const h = (src as HTMLVideoElement).videoHeight || (src as ImageBitmap).height || info.displayH;
      e.upload(src, w, h, 0);
      const [pw] = this.previewSize();
      e.setPreviewScale(Math.min(1, pw / w));
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

  /** Repaints the current frame (paused, or after a control change). */
  repaint(): void {
    if (this.exporting || this.snap.phase !== "ready") return;
    const v = this.video;
    if (!v || v.readyState < 2) return;
    if (!v.paused) return; // the frame loop paints the next frame anyway
    if (this.still) this.draw(this.still, v.currentTime, false);
    else this.draw(v, v.currentTime, false);
  }

  private async captureStill(): Promise<void> {
    const v = this.video;
    if (!v || !v.paused || v.readyState < 2 || this.snap.phase !== "ready" || this.exporting) return;
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
    if (!v || this.exporting || this.snap.phase !== "ready") return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }

  seek(t: number): void {
    const v = this.video;
    if (!v || this.exporting || this.snap.phase !== "ready") return;
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
      const v = this.video, e = this.engine;
      if (!v || !e || new URLSearchParams(location.search).get("lock") === "0") return;
      const gen = this.gen;
      const times = profileTimes(v.duration);
      if (!times.length) return;
      const wasPaused = v.paused;
      const resumeAt = v.currentTime;
      this.previewOn = false;
      v.pause();
      this.set({ busy: "Profiling colour…" });
      const samples: ProfileSample[] = [];
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
        const lock = segmentProfile(samples, SCENE_CUT_MEAN_DIFF);
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
    const client = this.stabClient, file = this.file;
    if (!client || !file) return;
    const gen = this.gen;
    const ctrl = new AbortController();
    this.stabAbort = ctrl;
    this.setStab({ state: "analysing", progress: 0, message: null });
    try {
      let last = 0;
      const analysis = await client.analyze(file, (fraction) => {
        const now = performance.now();
        if (now - last > 150) {
          last = now;
          this.setStab({ progress: fraction });
        }
      }, ctrl.signal);
      if (gen !== this.gen) return;
      this.analysis = analysis;
      this.setStab({ state: "solving", progress: 1 });
      const path = await client.solve(stabiliseParams(this.tools.stabilise));
      if (gen !== this.gen) return;
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
    if (!this.analysis || !this.path) return null;
    const before = rawMotion(this.analysis).jitterRms;
    const after = residualMotion(this.analysis, this.path).jitterRms;
    const pct = before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;
    return `Shake −${pct}% · crop ${Math.round((this.path.stats.maxUsedZoom - 1) * 100)}%`;
  }

  private scheduleSolve(): void {
    clearTimeout(this.solveTimer);
    const seq = ++this.solveSeq;
    this.solveTimer = window.setTimeout(async () => {
      const client = this.stabClient;
      if (!client || !this.analysis) return;
      try {
        const path = await client.solve(stabiliseParams(this.tools.stabilise));
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

  async exportVideo(): Promise<void> {
    const e = this.engine, file = this.file, v = this.video, info = this.snap.info;
    if (!file || !v || !info || this.exporting) return;
    if (!this.snap.canExport) {
      this.setExp({ state: "error", message: "Saving video needs WebCodecs: update to the latest Safari or Chrome." });
      return;
    }
    const old = this.snap.exp.result;
    if (old) URL.revokeObjectURL(old.url);
    this.exporting = true;
    this.previewOn = false;
    v.pause();
    const ctrl = new AbortController();
    this.exportAbort = ctrl;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    wl?.request("screen").then((l) => { this.wakeLock = l; }).catch(() => undefined);
    this.set({ exp: { ...IDLE_EXPORT, state: "preparing", detail: "Preparing…" } });
    const colourOn = this.tools.colour.enabled && !!e;
    const started = performance.now();
    let frames = 0;
    let lastUi = 0, lastShown = 0, lastThumb = 0;
    try {
      if (this.profiling) {
        this.setExp({ detail: "Profiling colour…" });
        await this.profiling;
      }
      await this.waitForPath();
      // The profile restarts the preview when it finishes; stop it again.
      this.previewOn = false;
      v.pause();
      const geoOn = this.geometryActive();
      const geo = this.geo;
      if ((geoOn || !colourOn) && !geo) throw new Error("WebGL2 is unavailable");
      const total = this.snap.duration || info.duration;
      const bitrate = bitrateFromSource(file.size, total) ?? pickBitrate(info.displayW, info.displayH, info.fps);
      if (e) {
        e.reset({ keepPerson: true });
        e.split = 0;
        e.analysisIntervalMs = 150;
        e.personEvery = 4;
        // Export frames render at full size; the stage keeps showing them at the preview's size.
        const [pw] = this.previewSize();
        e.setPreviewScale(Math.min(1, pw / info.displayW));
      }
      this.dropStill();
      this.setExp({ state: "running", detail: "Rendering" });
      // One frame at a time whenever a canvas is shared between stages (the
      // geometry canvas, or the engine's canvas/bitmap capture paths); the
      // engine's readback path keeps several in flight.
      let gate: Promise<unknown> = Promise.resolve();
      const result = await exportWithCodec(
        file,
        async (sample, fi) => {
          const capture = (e?.backend as unknown as { capture?: string | null } | undefined)?.capture;
          const serial = geoOn || !colourOn || capture !== "readback";
          if (serial) await gate;
          const job = (async (): Promise<VideoFrame> => {
            const frame = squarePixels(sample.toVideoFrame());
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
                const now = performance.now();
                if (now - lastShown > 80) {
                  lastShown = now;
                  eng.render(rotE);
                }
              }
              frames++;
              const now = performance.now();
              if (now - lastThumb > 300 && this.thumbListeners.size) {
                lastThumb = now;
                const bmp = await createImageBitmap(out, { resizeWidth: 480, resizeQuality: "low" }).catch(() => null);
                if (bmp) for (const l of this.thumbListeners) l(bmp);
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
      const base = (this.snap.fileName ?? "clip").replace(/\.[^.]+$/, "");
      const name = `${base}-${exportSuffix(this.tools)}.mp4`;
      const elapsedMs = performance.now() - started;
      console.info(`[export] done: ${result.frames} frames in ${(elapsedMs / 1000).toFixed(1)} s, ${result.codec}, audio ${result.audioIncluded ? "kept" : "dropped"}`);
      this.setExp({
        state: "done",
        progress: 1,
        etaSec: 0,
        frames: result.frames,
        detail: "",
        result: { blob: result.blob, name, url: URL.createObjectURL(result.blob), frames: result.frames, elapsedMs, audioIncluded: result.audioIncluded },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") this.set({ exp: IDLE_EXPORT });
      else this.setExp({ state: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      this.exporting = false;
      this.exportAbort = null;
      this.wakeLock?.release().catch(() => undefined);
      this.wakeLock = null;
      if (e) {
        e.analysisIntervalMs = ANALYSIS_INTERVAL_MS;
        e.personEvery = 2;
        e.reset();
      }
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

  cancelExport(): void {
    this.exportAbort?.abort();
  }

  dismissExport(): void {
    if (this.exporting) return;
    const r = this.snap.exp.result;
    if (r) URL.revokeObjectURL(r.url);
    this.set({ exp: IDLE_EXPORT });
  }
}
