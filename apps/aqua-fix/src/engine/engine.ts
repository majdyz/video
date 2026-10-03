// Runtime that ties the pieces together for the app:
//   backend (WebGPU → WebGL2) · worker analysis every ANALYSIS_INTERVAL_MS ·
//   temporal smoothing of the estimated grade with scene-cut reset ·
//   uniform packing · render / export frames.
//
// Global parameters ease in with a ~0.6 s time constant (log domain for the
// gains), the spatial maps over ~0.25 s (see TAU_MAPS_S). A hard cut snaps
// everything.

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

export const ANALYSIS_INTERVAL_MS = 70;
const TAU_PARAMS_S = 0.6;
// Spatial maps ease over a short window: snapping them pulsed brightness and
// local contrast on every analysis; easing is safe now because a pixel that
// no longer matches the map's guide colour is classified on its own in the
// shader, so a lagging map can't ghost moved content.
const TAU_MAPS_S = 0.4;
// Local-contrast tiles describe tone, not geometry: they can lag longer.
const TAU_CLAHE_S = 0.7;
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
  private guide: Packed | null = null;
  private clahe: Packed | null = null;
  private fieldsTarget: Packed | null = null;
  private guideTarget: Packed | null = null;
  private claheTarget: Packed | null = null;
  private lastMean: Vec3 | null = null;
  private lastTickSec = 0;
  private hasAnalysis = false;
  private dirtyData = false;
  private stats: EngineStats;
  private resolveWaiters: ((p: AnalysisPacket) => void)[] = [];
  private rejectWaiters: ((e: Error) => void)[] = [];
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
      const err = new Error("Analysis worker failed: " + e.message);
      this.settle(null, err);
      this.onError(err);
    };
    this.worker = w;
    return w;
  }

  /** On-screen canvas scale relative to the source (exports ignore it). */
  setPreviewScale(scale: number): void {
    this.backend.setPreviewScale(scale);
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

  /** Starts an analysis of the current source if none is in flight (export loop). */
  analyzeSoon(): void {
    if (!this.inflight) void this.startAnalysis();
  }

  /**
   * Runs one analysis and waits for it (photos, export keyframes). Rejects
   * on a GPU/worker failure or after `timeoutMs`, so callers can carry on
   * with the ungraded frame instead of hanging.
   */
  async analyzeNow(snap: boolean, timeoutMs = 10_000): Promise<void> {
    const wait = () =>
      new Promise<AnalysisPacket>((resolve, reject) => {
        this.resolveWaiters.push(resolve);
        this.rejectWaiters.push(reject);
      });
    const withTimeout = <T>(p: Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Frame analysis timed out")), timeoutMs);
        p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
      });
    if (this.inflight) await withTimeout(wait()).catch(() => undefined);
    const p = wait();
    await this.startAnalysis();
    const packet = await withTimeout(p);
    if (snap && packet.id === this.reqId) this.snapTo(toGpuPacket(packet));
  }

  private settle(packet: AnalysisPacket | null, error: Error | null): void {
    const res = this.resolveWaiters;
    const rej = this.rejectWaiters;
    this.resolveWaiters = [];
    this.rejectWaiters = [];
    if (packet) for (const r of res) r(packet);
    else if (error) for (const r of rej) r(error);
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
      const err = e instanceof Error ? e : new Error(String(e));
      this.settle(null, err);
      this.onError(err);
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
      this.guideTarget = packet.guide;
      this.claheTarget = packet.clahe;
    }
    this.settle(raw, null);
  }

  private snapTo(packet: GpuPacket): void {
    this.current = packet.params;
    this.target = packet.params;
    this.fields = packet.fields;
    this.guide = packet.guide;
    this.clahe = packet.clahe;
    this.fieldsTarget = null;
    this.guideTarget = null;
    this.claheTarget = null;
    this.hasAnalysis = true;
    this.dirtyData = true;
  }

  private smooth(dt: number): void {
    if (dt <= 0) return;
    if (this.target) {
      const a = 1 - Math.exp(-dt / TAU_PARAMS_S);
      this.current = lerpParams(this.current, this.target, a);
    }
    const am = 1 - Math.exp(-dt / TAU_MAPS_S);
    const ac = 1 - Math.exp(-dt / TAU_CLAHE_S);
    const ease = (cur: Packed | null, tgt: Packed | null, rate = am): Packed | null => {
      if (!tgt) return cur;
      if (!cur || cur.width !== tgt.width || cur.height !== tgt.height || cur.data.length !== tgt.data.length) return tgt;
      // Blend into a private copy so the packet's buffer stays pristine.
      const out = cur === this.lastEased.get(tgt) ? cur : { ...cur, data: new Float32Array(cur.data) };
      lerpInto(out.data, tgt.data, rate);
      this.lastEased.set(tgt, out);
      return out;
    };
    const f = ease(this.fields, this.fieldsTarget);
    const g = ease(this.guide, this.guideTarget);
    const c = ease(this.clahe, this.claheTarget, ac);
    if (f !== this.fields || g !== this.guide || c !== this.clahe) this.dirtyData = true;
    this.fields = f;
    this.guide = g;
    this.clahe = c;
  }
  private lastEased = new WeakMap<Packed, Packed>();

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
    this.fieldsTarget = null;
    this.guideTarget = null;
    this.claheTarget = null;
    this.current = IDENTITY_PARAMS;
    this.lastMean = null;
    this.lastAnalysisAt = -Infinity;
    this.lastTickSec = 0;
    this.settle({ id: -1 } as AnalysisPacket, null);
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

function lerpInto(dst: Float32Array, src: Float32Array, t: number): void {
  for (let i = 0; i < dst.length; i++) dst[i] += (src[i] - dst[i]) * t;
}

function meanDiff(a: Vec3, b: Vec3): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}
