// Runtime that ties the pieces together for the app:
//   backend (WebGPU → WebGL2) · worker analysis every ANALYSIS_INTERVAL_MS ·
//   temporal smoothing of the estimated grade with scene-cut reset ·
//   uniform packing · render / export frames.
//
// Global parameters ease in with a ~0.6 s time constant (log domain for the
// gains) so nothing pulses; the spatial fields follow the frame faster
// (0.15 s) since they describe where the water is *now*. A hard cut snaps.

import { WebGL2Backend } from "./backend-webgl2.ts";
import { WebGPUBackend } from "./backend-webgpu.ts";
import { ANALYSIS_H, ANALYSIS_W } from "./analyze.ts";
import type { AnalysisPacket, AnalysisRequest } from "./analysis-worker.ts";
import type { GpuBackend, Rotation, SourceInput } from "./backend.ts";
import {
  CLAHE_BINS,
  CLAHE_TILES_X,
  CLAHE_TILES_Y,
  DEFAULT_SETTINGS,
  IDENTITY_PARAMS,
  lerpParams,
  packUniforms,
  type ClaheLuts,
  type DepthMap,
  type GradeParams,
  type UserSettings,
  type Vec3,
} from "./params.ts";

export const ANALYSIS_INTERVAL_MS = 120;
const TAU_PARAMS_S = 0.6;
const TAU_FIELDS_S = 0.15;
const SCENE_CUT_MEAN_DIFF = 0.16;

type Packed = { width: number; height: number; data: Float32Array };
/** Analysis packet with the CLAHE LUTs re-shaped to a (bins × tiles) texture. */
type GpuPacket = Omit<AnalysisPacket, "clahe"> & { clahe: Packed };
function toGpuPacket(raw: AnalysisPacket): GpuPacket {
  return { ...raw, clahe: { width: raw.clahe.bins, height: raw.clahe.tilesX * raw.clahe.tilesY, data: raw.clahe.data } };
}

export type EngineStats = { backend: "webgpu" | "webgl2"; analysisMs: number; analyses: number; sceneCuts: number };

export class GradeEngine {
  readonly backend: GpuBackend;
  settings: UserSettings = { ...DEFAULT_SETTINGS };
  /** Compare-wipe split, 0..1 (pixels left of it show the source). */
  split = 0;
  private worker: Worker | null = null;
  private inflight = false;
  private reqId = 0;
  private lastAnalysisAt = -Infinity;
  private current: GradeParams = IDENTITY_PARAMS;
  private target: GradeParams | null = null;
  private fields: Packed | null = null;
  private fieldsTarget: Packed | null = null;
  private guide: Packed | null = null;
  private clahe: Packed | null = null;
  private claheTarget: Packed | null = null;
  private lastMean: Vec3 | null = null;
  private lastTickSec = 0;
  private hasAnalysis = false;
  private dirtyData = false;
  private stats: EngineStats;
  private resolveWaiters: ((p: AnalysisPacket) => void)[] = [];
  private onError: (e: Error) => void;

  private constructor(backend: GpuBackend, onError: (e: Error) => void) {
    this.backend = backend;
    this.onError = onError;
    this.stats = { backend: backend.kind, analysisMs: 0, analyses: 0, sceneCuts: 0 };
    // Placeholder data textures so the first render is valid.
    const fw = 2, fh = 2;
    this.fields = { width: fw, height: fh, data: new Float32Array(fw * fh * 4) };
    this.guide = { width: fw, height: fh, data: new Float32Array(fw * fh * 4) };
    const bins = CLAHE_BINS, tiles = CLAHE_TILES_X * CLAHE_TILES_Y;
    const cl = new Float32Array(bins * tiles * 4);
    for (let t = 0; t < tiles; t++) for (let b = 0; b < bins; b++) cl[(t * bins + b) * 4] = (b + 1) / bins;
    this.clahe = { width: bins, height: tiles, data: cl };
    this.pushData();
  }

  static async create(canvas: HTMLCanvasElement, onError: (e: Error) => void, preferWebGPU = true): Promise<GradeEngine> {
    let backend: GpuBackend | null = null;
    if (preferWebGPU) {
      try {
        backend = await WebGPUBackend.create(canvas);
      } catch (e) {
        console.warn("WebGPU unavailable, using WebGL2:", (e as Error).message);
      }
    }
    if (!backend) backend = new WebGL2Backend(canvas);
    return new GradeEngine(backend, onError);
  }

  getStats(): EngineStats {
    return { ...this.stats };
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<AnalysisPacket>) => this.onPacket(e.data);
    w.onerror = (e) => {
      this.inflight = false;
      this.onError(new Error("Analysis worker failed: " + e.message));
    };
    this.worker = w;
    return w;
  }

  /** Uploads a frame. Call before render / analyze. */
  upload(src: SourceInput, width: number, height: number, rotation: Rotation): void {
    this.backend.upload(src, width, height, rotation);
  }

  /**
   * Advances the smoother to `timeSec` (media time) and, when due, starts a
   * new analysis of the current source. Returns true when an analysis was
   * kicked off.
   */
  tick(timeSec: number, force = false): boolean {
    const dt = Math.max(0, Math.min(0.5, timeSec - this.lastTickSec));
    this.lastTickSec = timeSec;
    this.smooth(dt);
    const nowMs = performance.now();
    if (!this.inflight && (force || nowMs - this.lastAnalysisAt >= ANALYSIS_INTERVAL_MS)) {
      void this.startAnalysis();
      return true;
    }
    return false;
  }

  /** Runs one analysis and waits for it (photos, export keyframes). */
  async analyzeNow(snap: boolean): Promise<void> {
    if (this.inflight) await new Promise<AnalysisPacket>((r) => this.resolveWaiters.push(r));
    const p = new Promise<AnalysisPacket>((r) => this.resolveWaiters.push(r));
    await this.startAnalysis();
    const packet = await p;
    if (snap && packet.id === this.reqId) this.snapTo(toGpuPacket(packet));
  }

  private async startAnalysis(): Promise<void> {
    if (this.inflight) return;
    this.inflight = true;
    this.lastAnalysisAt = performance.now();
    try {
      const rgba = await this.backend.analyze(ANALYSIS_W, ANALYSIS_H);
      const req: AnalysisRequest = { id: ++this.reqId, rgba: rgba.buffer as ArrayBuffer, width: ANALYSIS_W, height: ANALYSIS_H };
      this.ensureWorker().postMessage(req, [req.rgba]);
    } catch (e) {
      this.inflight = false;
      this.onError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private onPacket(raw: AnalysisPacket): void {
    this.inflight = false;
    if (raw.id !== this.reqId) return; // stale (file changed)
    const packet = toGpuPacket(raw);
    this.stats.analyses++;
    this.stats.analysisMs = packet.ms;
    const cut = this.lastMean !== null && meanDiff(this.lastMean, packet.mean) > SCENE_CUT_MEAN_DIFF;
    this.lastMean = packet.mean;
    if (!this.hasAnalysis || cut) {
      if (cut) this.stats.sceneCuts++;
      this.snapTo(packet);
    } else {
      this.target = packet.params;
      this.fieldsTarget = packet.fields;
      this.claheTarget = packet.clahe;
      this.guide = packet.guide; // follows the frame immediately
      this.dirtyData = true;
    }
    const w = this.resolveWaiters;
    this.resolveWaiters = [];
    for (const r of w) r(raw);
  }

  private snapTo(packet: GpuPacket): void {
    this.current = packet.params;
    this.target = packet.params;
    this.fields = packet.fields;
    this.fieldsTarget = packet.fields;
    this.guide = packet.guide;
    this.clahe = packet.clahe;
    this.claheTarget = packet.clahe;
    this.hasAnalysis = true;
    this.dirtyData = true;
  }

  private smooth(dt: number): void {
    if (!this.target || dt <= 0) return;
    const a = 1 - Math.exp(-dt / TAU_PARAMS_S);
    this.current = lerpParams(this.current, this.target, a);
    const af = 1 - Math.exp(-dt / TAU_FIELDS_S);
    if (this.fieldsTarget && this.fields) {
      if (this.fields.width !== this.fieldsTarget.width || this.fields.height !== this.fieldsTarget.height || this.fields === this.fieldsTarget) {
        this.fields = this.fieldsTarget;
      } else {
        lerpInto(this.fields.data, this.fieldsTarget.data, af);
      }
    }
    if (this.claheTarget && this.clahe) {
      if (this.clahe.data.length !== this.claheTarget.data.length || this.clahe === this.claheTarget) this.clahe = this.claheTarget;
      else lerpInto(this.clahe.data, this.claheTarget.data, a);
    }
    this.dirtyData = true;
  }

  private pushData(): void {
    if (!this.fields || !this.guide || !this.clahe) return;
    this.backend.setData(0, this.fields);
    this.backend.setData(1, this.clahe);
    this.backend.setData(2, this.guide);
    this.dirtyData = false;
  }

  /** Reset temporal state for a new file. */
  reset(): void {
    this.reqId++;
    this.inflight = false;
    this.hasAnalysis = false;
    this.target = null;
    this.current = IDENTITY_PARAMS;
    this.lastMean = null;
    this.lastAnalysisAt = -Infinity;
    this.lastTickSec = 0;
    const w = this.resolveWaiters;
    this.resolveWaiters = [];
    for (const r of w) r({ id: -1 } as AnalysisPacket);
  }

  private pack(): Float32Array {
    const depth: DepthMap = { width: this.fields!.width, height: this.fields!.height, fields: new Float32Array(0), guide: new Float32Array(0) };
    const clahe: ClaheLuts = { tilesX: CLAHE_TILES_X, tilesY: CLAHE_TILES_Y, bins: CLAHE_BINS, data: new Float32Array(0) };
    const settings = this.hasAnalysis ? this.settings : { ...this.settings, strength: 0 };
    return packUniforms(this.current, settings, depth, clahe, 0, this.split);
  }

  /** Renders the current source with the current grade into the canvas. */
  render(rotation: Rotation = 0): void {
    if (this.dirtyData) this.pushData();
    const u = this.pack();
    u[0] = rotation;
    this.backend.setUniforms(u);
    this.backend.render();
  }

  /** Renders and wraps the result as a VideoFrame for the exporter. */
  async renderToFrame(rotation: Rotation, timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    if (this.dirtyData) this.pushData();
    const u = this.pack();
    u[0] = rotation;
    u[1] = 0; // never bake the compare wipe into an export
    this.backend.setUniforms(u);
    return this.backend.renderToFrame(timestampUs, durationUs);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.backend.dispose();
  }
}

function meanDiff(a: Vec3, b: Vec3): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function lerpInto(dst: Float32Array, src: Float32Array, t: number): void {
  for (let i = 0; i < dst.length; i++) dst[i] += (src[i] - dst[i]) * t;
}
