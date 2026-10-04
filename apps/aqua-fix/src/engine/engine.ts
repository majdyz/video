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
import type { PersonPacket, PersonRequest } from "./person-worker.ts";
import { FULL_RECT, type GpuBackend, type Rect, type Rotation, type SourceInput } from "./backend.ts";
import { linearToOklab } from "./color.ts";
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
// Person segmentation runs on every Nth analysis (it costs ~25–40 ms of
// worker CPU on the same thumbnail the analysis uses).
const PERSON_EVERY = 2;
// Mask growth through bright cells (see resampleMask).
const PERSON_GROW_PASSES = 16;
const PERSON_GROW_DECAY = 0.95;
const PERSON_GROW_LUM = 0.2;
const PERSON_GROW_CONF = 0.3;
// … and never through water-coloured cells: hue within this angle of the
// veil's with some chroma (sunlit water is bright and passes the signal test).
const PERSON_GROW_WATER_COS = Math.cos((15 * Math.PI) / 180);
const PERSON_GROW_WATER_CHROMA = 0.02;
// Person requests cycle: full frame, then the four quadrants at 2× detail
// (small / far divers vanish at the full-frame thumbnail scale).
const PERSON_RECTS: Rect[] = [
  FULL_RECT,
  { x: 0, y: 0, w: 0.5, h: 0.5 },
  { x: 0.5, y: 0, w: 0.5, h: 0.5 },
  { x: 0, y: 0.5, w: 0.5, h: 0.5 },
  { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
];

type Packed = { width: number; height: number; data: Float32Array };
/** Analysis packet with the CLAHE LUTs re-shaped to a (bins × tiles) texture. */
type GpuPacket = Omit<AnalysisPacket, "clahe"> & { clahe: Packed };
function toGpuPacket(raw: AnalysisPacket): GpuPacket {
  return { ...raw, clahe: { width: raw.clahe.bins, height: raw.clahe.tilesX * raw.clahe.tilesY, data: raw.clahe.data } };
}

export type PersonState = "off" | "loading" | "on" | "failed";
/** One locked estimate, valid from `from` seconds until the next segment. */
export type LockSegment = { from: number; params: GradeParams };
export { SCENE_CUT_MEAN_DIFF };
export type EngineStats = {
  backend: "webgpu" | "webgl2";
  analysisMs: number;
  analyses: number;
  sceneCuts: number;
  /** Person segmentation: worker state, last cost, and the mask's coverage (0..1). */
  person: PersonState;
  personMs: number;
  personCoverage: number;
};

export class GradeEngine {
  readonly backend: GpuBackend;
  settings: UserSettings = { ...DEFAULT_SETTINGS };
  /** Compare-wipe split, 0..1 (pixels left of it show the source). */
  split = 0;
  private worker: Worker | null = null;
  private inflight = false;
  private reqId = 0;
  /** Analysis cadence (ms) and how many analyses per person pass; the real-time export relaxes both. */
  analysisIntervalMs = ANALYSIS_INTERVAL_MS;
  personEvery = PERSON_EVERY;
  private personWorker: Worker | null = null;
  private personInflight = false;
  private personReqId = 0;
  private personFailed = false;
  private personCount = 0;
  /** Eased person map at the fields' resolution, written into the guide's alpha. */
  private person: Float32Array | null = null;
  private personTarget: Float32Array | null = null;
  /** Raw (un-grown) detections: full frame and the quadrant tiles, fields grid. */
  private personFull: Float32Array | null = null;
  private personTiles: Float32Array | null = null;
  private personRectIdx = 0;
  private personRectInflight: Rect = FULL_RECT;
  private personWaiters: (() => void)[] = [];
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
  /**
   * Locked global parameters per time segment (a clip cut from several
   * dives gets one estimate per segment); when set, per-frame packets keep
   * only their maps and range normalisation.
   */
  private locked: LockSegment[] | null = null;
  private resolveWaiters: ((p: AnalysisPacket) => void)[] = [];
  private rejectWaiters: ((e: Error) => void)[] = [];
  private onError: (e: Error) => void;

  private constructor(backend: GpuBackend, onError: (e: Error) => void) {
    this.backend = backend;
    this.onError = onError;
    this.stats = { backend: backend.kind, analysisMs: 0, analyses: 0, sceneCuts: 0, person: "off", personMs: 0, personCoverage: 0 };
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

  /**
   * Locks the global correction (balance, veil, exposure, levels …) to the
   * median of `samples` for the rest of the clip; null unlocks. Maps stay
   * per frame.
   */
  lockGlobals(segments: LockSegment[] | null): void {
    this.locked = segments && segments.length > 0 ? [...segments].sort((a, b) => a.from - b.from) : null;
    if (this.locked) {
      this.current = this.applyLock(this.current);
      if (this.target) this.target = this.applyLock(this.target);
    }
  }

  get isLocked(): boolean {
    return this.locked !== null;
  }

  /** Number of locked segments (0 when unlocked) — diagnostics. */
  get lockSegments(): number {
    return this.locked?.length ?? 0;
  }

  /** The locked estimate in force at `timeSec` (null when unlocked) — tests/diagnostics. */
  lockedParamsAt(timeSec: number): GradeParams | null {
    return this.lockedAt(timeSec);
  }

  private lockedAt(timeSec: number): GradeParams | null {
    if (!this.locked) return null;
    let seg = this.locked[0];
    for (const s of this.locked) if (timeSec >= s.from) seg = s;
    return seg.params;
  }

  /** Debug (?lockz=1): also lock the range normalisation (zLo/zHi) — A/B for flicker. */
  lockRange = false;

  private applyLock(p: GradeParams): GradeParams {
    const l = this.lockedAt(this.lastTickSec);
    if (!l) return p;
    return this.lockRange ? { ...l } : { ...l, zLo: p.zLo, zHi: p.zHi };
  }

  /** Runs one analysis of the current source and returns its raw parameters and mean colour (clip profiling). */
  async analyzeRaw(timeoutMs = 10_000): Promise<{ params: GradeParams; mean: Vec3 }> {
    const p = new Promise<AnalysisPacket>((resolve, reject) => {
      this.resolveWaiters.push(resolve);
      this.rejectWaiters.push(reject);
    });
    if (this.inflight) await p.catch(() => undefined);
    const q = new Promise<AnalysisPacket>((resolve, reject) => {
      this.resolveWaiters.push(resolve);
      this.rejectWaiters.push(reject);
    });
    await this.startAnalysis();
    const packet = await new Promise<AnalysisPacket>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Frame analysis timed out")), timeoutMs);
      q.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
    return { params: packet.params, mean: packet.mean };
  }

  /** Current (eased) person map at the fields' resolution — diagnostics. */
  getPersonMap(): { width: number; height: number; data: Float32Array } | null {
    if (!this.person || !this.fields) return null;
    return { width: this.fields.width, height: this.fields.height, data: this.person };
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

  private ensurePersonWorker(): Worker {
    if (this.personWorker) return this.personWorker;
    const w = new Worker(new URL("./person-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<PersonPacket>) => this.onPersonPacket(e.data);
    w.onerror = (e) => {
      this.personInflight = false;
      this.personFailed = true;
      this.stats.person = "failed";
      console.warn("Person segmentation worker failed:", e.message);
      this.settlePerson();
    };
    this.personWorker = w;
    this.stats.person = "loading";
    return w;
  }

  private settlePerson(): void {
    const ws = this.personWaiters;
    this.personWaiters = [];
    for (const r of ws) r();
  }

  /** Resolves when the person request in flight (if any) has answered. */
  private waitPerson(): Promise<void> {
    if (!this.personInflight) return Promise.resolve();
    return new Promise((resolve) => this.personWaiters.push(resolve));
  }

  private onPersonPacket(p: PersonPacket): void {
    this.personInflight = false;
    this.settlePerson();
    if (p.id !== this.personReqId) return;
    if (!p.mask) {
      if (p.error && !this.personFailed) console.warn("Person segmentation unavailable:", p.error);
      this.personFailed = true;
      this.stats.person = "failed";
      return;
    }
    this.stats.person = "on";
    this.stats.personMs = p.ms;
    const fw = this.fields?.width ?? 0, fh = this.fields?.height ?? 0;
    if (fw < 4 || fh < 4) return;
    const rect = this.personRectInflight;
    if (!this.personFull || this.personFull.length !== fw * fh) { this.personFull = new Float32Array(fw * fh); this.personTiles = new Float32Array(fw * fh); }
    if (rect === FULL_RECT) {
      this.personFull = resampleMask(p.mask, p.width, p.height, fw, fh);
    } else {
      // Box-resample the tile into its quadrant of the tile layer.
      const x0 = Math.round(rect.x * fw), y0 = Math.round(rect.y * fh);
      const tw = Math.round(rect.w * fw), th = Math.round(rect.h * fh);
      const sub = resampleMask(p.mask, p.width, p.height, tw, th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) this.personTiles![(y0 + y) * fw + x0 + x] = sub[y * tw + x];
    }
    const raw = new Float32Array(fw * fh);
    for (let i = 0; i < raw.length; i++) raw[i] = Math.max(this.personFull[i], this.personTiles![i]);
    const map = growMask(raw, fw, fh, this.guide?.data ?? null, this.fields?.data ?? null, this.current.veilColor);
    let cov = 0;
    for (let i = 0; i < map.length; i++) cov += map[i];
    this.stats.personCoverage = cov / map.length;
    if (!this.person || this.person.length !== map.length) {
      this.person = map;
      this.personTarget = null;
      this.dirtyData = true;
    } else {
      this.personTarget = map;
    }
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
    const prevLock = this.lockedAt(this.lastTickSec);
    this.lastTickSec = timeSec;
    const nextLock = this.lockedAt(timeSec);
    if (prevLock !== nextLock && nextLock) {
      // Crossed a segment boundary (a cut): snap the globals to the new estimate.
      this.current = { ...nextLock, zLo: this.current.zLo, zHi: this.current.zHi };
      if (this.target) this.target = { ...nextLock, zLo: this.target.zLo, zHi: this.target.zHi };
    }
    this.smooth(dt);
    const nowMs = performance.now();
    if (!this.inflight && (force || nowMs - this.lastAnalysisAt >= this.analysisIntervalMs)) {
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
    if (snap) {
      // First frame of an export / a photo: let the person mask land too so
      // the snap carries it (bounded by the same timeout; failure is fine).
      await withTimeout(this.waitPerson()).catch(() => undefined);
      if (this.personTarget) { this.person = this.personTarget; this.personTarget = null; }
    }
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
      // Person segmentation: a copy of this thumbnail (full frame) or a
      // quadrant at 2× detail, cycling through PERSON_RECTS. Both readbacks
      // finish before anything is posted: once the analysis reply lands,
      // `inflight` clears and the next tick may start a new readback.
      const wantPerson = !this.personFailed && !this.personInflight && this.personCount++ % this.personEvery === 0;
      const rect = PERSON_RECTS[this.personRectIdx % PERSON_RECTS.length];
      const px = !wantPerson ? null : rect === FULL_RECT ? rgba.slice() : await this.backend.analyze(ANALYSIS_W, ANALYSIS_H, rect);
      const req: AnalysisRequest = { id: ++this.reqId, rgba: rgba.buffer as ArrayBuffer, width: ANALYSIS_W, height: ANALYSIS_H };
      this.ensureWorker().postMessage(req, [req.rgba]);
      if (px) {
        this.personRectIdx++;
        const preq: PersonRequest = { id: ++this.personReqId, rgba: px.buffer as ArrayBuffer, width: ANALYSIS_W, height: ANALYSIS_H, timestampMs: Math.round(this.lastTickSec * 1000) };
        this.personInflight = true;
        this.personRectInflight = rect;
        this.ensurePersonWorker().postMessage(preq, [preq.rgba]);
      }
    } catch (e) {
      this.inflight = false;
      const err = e instanceof Error ? e : new Error(String(e));
      this.settle(null, err);
      // A readback that merely timed out (a starved GPU on a busy device)
      // is not worth alarming the user over: the next tick simply retries.
      if (/timed out/i.test(err.message)) console.warn("Analysis skipped:", err.message);
      else this.onError(err);
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
      this.target = this.applyLock(packet.params);
      this.fieldsTarget = packet.fields;
      this.guideTarget = packet.guide;
      this.claheTarget = packet.clahe;
    }
    this.settle(raw, null);
  }

  private snapTo(packet: GpuPacket): void {
    this.current = this.applyLock(packet.params);
    this.target = this.current;
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
    if (this.person && this.personTarget && this.personTarget.length === this.person.length) {
      lerpInto(this.person, this.personTarget, am);
      this.dirtyData = true;
    }
    this.fields = f;
    this.guide = g;
    this.clahe = c;
  }
  private lastEased = new WeakMap<Packed, Packed>();
  private guideMerged: Float32Array | null = null;

  private pushData(): void {
    if (!this.fields || !this.guide || !this.clahe) return;
    this.backend.setData(0, this.fields);
    this.backend.setData(1, this.clahe);
    const g = this.guide;
    if (this.person && this.person.length * 4 === g.data.length) {
      // The guide's alpha carries the person mask (the analysis leaves it 0).
      const merged = this.guideMerged && this.guideMerged.length === g.data.length ? this.guideMerged : new Float32Array(g.data.length);
      merged.set(g.data);
      for (let i = 0; i < this.person.length; i++) merged[i * 4 + 3] = this.person[i];
      this.guideMerged = merged;
      this.backend.setData(2, { width: g.width, height: g.height, data: merged });
    } else {
      this.backend.setData(2, g);
    }
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
    this.personReqId++;
    this.personInflight = false;
    this.person = null;
    this.personTarget = null;
    this.personFull = null;
    this.personTiles = null;
    this.personRectIdx = 0;
    this.personCount = 0;
    this.stats.personCoverage = 0;
    this.settlePerson();
  }

  private pack(): Float32Array {
    const depth: DepthMap = { width: this.fields!.width, height: this.fields!.height, fields: new Float32Array(0), guide: new Float32Array(0) };
    const clahe: ClaheLuts = { tilesX: CLAHE_TILES_X, tilesY: CLAHE_TILES_Y, bins: CLAHE_BINS, data: new Float32Array(0) };
    const settings = this.hasAnalysis ? this.settings : { ...this.settings, intensity: 0 };
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
    this.personWorker?.terminate();
    this.personWorker = null;
    this.backend.dispose();
  }
}

/** Box-resamples a mask (mw×mh) to a grid (fw×fh), clamped to 0..1. */
function resampleMask(mask: Float32Array, mw: number, mh: number, fw: number, fh: number): Float32Array {
  const out = new Float32Array(fw * fh);
  for (let ty = 0; ty < fh; ty++) {
    const y0 = Math.floor((ty * mh) / fh);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * mh) / fh));
    for (let tx = 0; tx < fw; tx++) {
      const x0 = Math.floor((tx * mw) / fw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * mw) / fw));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += mask[y * mw + x]; n++; }
      out[ty * fw + tx] = Math.min(1, Math.max(0, sum / n));
    }
  }
  return out;
}

/** Seeds from confident detections and grows them through bright object cells (see PERSON_GROW_*). */
function growMask(raw: Float32Array, fw: number, fh: number, guide: Float32Array | null, fields: Float32Array | null, veil: Vec3): Float32Array {
  const out = new Float32Array(raw);
  const [, va, vb] = linearToOklab(veil[0], veil[1], veil[2]);
  const vn = Math.hypot(va, vb) || 1;
  // The selfie model finds the torso (wetsuit) but stops short of bare limbs
  // under a cast. Grow the mask a few cells through cells that are bright
  // (skin is far lighter than reef around a diver) and that the analysis
  // already calls an object (open water next to a diver must not join).
  const bright = new Uint8Array(fw * fh);
  for (let i = 0; i < fw * fh; i++) {
    const lum = guide && guide.length >= i * 4 + 3 ? 0.2126 * guide[i * 4] + 0.7152 * guide[i * 4 + 1] + 0.0722 * guide[i * 4 + 2] : 1;
    const conf = fields && fields.length >= i * 4 + 2 ? fields[i * 4 + 1] : 1;
    let waterHued = false;
    if (guide && guide.length >= i * 4 + 3) {
      const [, a, b] = linearToOklab(guide[i * 4], guide[i * 4 + 1], guide[i * 4 + 2]);
      const c = Math.hypot(a, b);
      waterHued = c > PERSON_GROW_WATER_CHROMA && (a * va + b * vb) / (c * vn) > PERSON_GROW_WATER_COS;
    }
    bright[i] = lum > PERSON_GROW_LUM && conf > PERSON_GROW_CONF && !waterHued ? 1 : 0;
    // Seed only where the model is confident: it smears a soft halo well
    // beyond the person (into open water and reef). Limbs it is unsure
    // about are reached by the growth below. Water-coloured cells are never
    // a person, however sure the model is (the quadrant passes in particular
    // bleed into open water next to a diver).
    const v = out[i];
    const t = Math.min(1, Math.max(0, (v - 0.45) / 0.3));
    // (Dark water-hued cells stay: a wetsuit under a cast is tinted too.)
    out[i] = waterHued && lum > PERSON_GROW_LUM ? 0 : t * t * (3 - 2 * t);
  }
  let cur = out;
  for (let pass = 0; pass < PERSON_GROW_PASSES; pass++) {
    const next = new Float32Array(cur);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const i = y * fw + x;
        if (!bright[i]) continue;
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= fh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= fw) continue;
            m = Math.max(m, cur[yy * fw + xx]);
          }
        }
        next[i] = Math.max(cur[i], PERSON_GROW_DECAY * m);
      }
    }
    cur = next;
  }
  return cur;
}

function lerpInto(dst: Float32Array, src: Float32Array, t: number): void {
  for (let i = 0; i < dst.length; i++) dst[i] += (src[i] - dst[i]) * t;
}

function meanDiff(a: Vec3, b: Vec3): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}
