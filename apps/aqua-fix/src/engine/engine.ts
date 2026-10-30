// Runtime that ties the pieces together for the app:
//   backend (WebGPU → WebGL2) · worker analysis once per clip-time slot (ANALYSIS_SLOT_S; awaited in offline export) ·
//   temporal smoothing of the estimated grade with scene-cut reset ·
//   uniform packing · render / export frames.
//
// Global parameters ease in with a ~0.6 s time constant (log domain for the
// gains), the spatial maps over ~0.25 s (see TAU_MAPS_S). A hard cut snaps
// everything.

import { WebGL2Backend } from "./backend-webgl2.ts";
import { WebGPUBackend } from "./backend-webgpu.ts";
import { ANALYSIS_H, ANALYSIS_W } from "./analyze.ts";
import type { AnalysisPacket, AnalysisRequest, TargetsReply, TargetsRequest } from "./analysis-worker.ts";
import type { PersonPacket, PersonRequest } from "./person-worker.ts";
import { boxGate, PERSON_BOX_MIN_SCORE, type PersonBox } from "./person-gate.ts";
import { ANALYSIS_SLOT_S, analysisSlot, inCutWindow as lockInCutWindow, lockParams, noteCut as lockNoteCut, segmentAt, type LockSegment } from "./lock.ts";
import { FULL_RECT, type GpuBackend, type Rect, type Rotation, type SourceInput } from "./backend.ts";
import { linearToOklab, oklabToLinear } from "./color.ts";
import { calmToneOf } from "./calm.ts";
import { BalanceFollow } from "./follow.ts";
import { AnimalTracker, type AnimalMap, type SubjectOverride, type SubjectSelection } from "./animals.ts";
import { composeSegStrength, popContrast, popDirection, type SegOverlay } from "./seg-overlay.ts";
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

/** Lower bound on the analysis slot (ms); the slot itself is clip time (ANALYSIS_SLOT_S, see tick). */
export const ANALYSIS_INTERVAL_MS = 70;
const TAU_PARAMS_S = 0.6;
// Spatial maps ease over a short window: snapping them pulsed brightness and
// local contrast on every analysis; easing is safe now because a pixel that
// no longer matches the map's guide colour is classified on its own in the
// shader, so a lagging map can't ghost moved content.
const TAU_MAPS_S = 0.4;
// Local-contrast tiles describe tone, not geometry: they can lag longer.
const TAU_CLAHE_S = 0.7;
// In open water the object channel is the whole-animal subject map: it must
// follow a swimming animal (a lagging map leaves a toned ghost where it was
// and untoned parts where it went); the shaders trim it per pixel.
const TAU_CONF_OPEN_S = 0.05;
const SCENE_CUT_MEAN_DIFF = 0.16;
export { ANALYSIS_SLOT_S, analysisSlot };
// Media-time gap between two analyses beyond which the balance follow starts afresh (a seek).
const FOLLOW_SEEK_S = 1;
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
// Every Nth person pass asks the detector (EfficientDet, ~300 ms on a slow
// CPU) whether anybody is there at all; the selfie mask counts only inside
// its boxes. A verdict older than this is dropped (a starved worker must not
// keep a stale person alive).
const PERSON_DETECT_EVERY = 3;
const PERSON_BOX_HOLD_S = 8;
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
export type { LockSegment };
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
  /** Person detector: boxes in force (−1 = no verdict yet) and its last cost. */
  personBoxes: number;
  personDetectMs: number;
};

export class GradeEngine {
  readonly backend: GpuBackend;
  settings: UserSettings = { ...DEFAULT_SETTINGS };
  /** Compare-wipe split, 0..1 (pixels left of it show the source). */
  split = 0;
  /** Cumulative worker time (ms) of the analyses and person passes answered (export profiling). */
  readonly workerMs = { analysis: 0, person: 0, analyses: 0, readback: 0, poolWait: 0, personWait: 0 };
  /** Analyse-first workers (precompute): analyses run on this many workers beside the engine's own. */
  analysisPoolSize = 2;
  /** Debug: read every precomputed thumbnail back again at render time and use the live one on a mismatch. */
  verifyPrecomputed = false;
  /** Analyse-first: render-time analyses served from the cache / analysed live; thumbnails that differed (verifyPrecomputed). */
  readonly precomputeStats = { hits: 0, misses: 0, mismatches: 0 };
  private worker: Worker | null = null;
  private inflight = false;
  private reqId = 0;
  /** Analysis cadence (ms) and how many analyses per person pass; the real-time export relaxes both. */
  analysisIntervalMs = ANALYSIS_INTERVAL_MS;
  personEvery = PERSON_EVERY;
  /** Person segmentation on/off (debug `?person=0`). */
  personEnabled = true;
  /** Temporal layer on/off (debug `?temporal=0`). */
  temporalEnabled = true;
  /** Material-anchored balance follow under the clip lock on/off (debug `?follow=0`; follow.ts, anchor.ts). */
  followEnabled = true;
  private follow = new BalanceFollow();
  /** Media time of the last analysis packet (the follow's time step). */
  private lastPacketSec = 0;
  /** The lock sent with the analysis in flight (its anchor is relative to it). */
  private reqLock: GradeParams | null = null;
  /** Profile thumbnails by clip time (analyzeRaw with a time): the anchor targets are measured on them. */
  private profileThumbs = new Map<number, Uint8ClampedArray>();
  private keepThumbAt: number | null = null;
  /** Anchor target per locked segment (null: none measurable, that shot keeps the plain lock); request id. */
  private anchorTargets: ([number, number] | null)[] = [];
  private targetsReq = 0;
  private lastRenderSec = -1;
  /** The in-flight analysis is a raw sample (startAnalysis). */
  private rawReq = false;
  /** Subject pop: per-animal tracking, strength and map lead (animals.ts). */
  private animals = new AnimalTracker();
  /** The latest analysis's subject map and guide (what the animal lead moves). */
  private leadBase: { fields: Packed; guide: Packed } | null = null;
  /** Clip time of the frame the in-flight analysis was captured from. */
  private reqTimeSec = 0;
  private strengthOn = false;
  /** AI subject detection overlay (Studio seg/) for the frame being drawn; null = the engine's masks alone. */
  private seg: SegOverlay | null = null;
  /** Subject pop lift direction (uniform p24.x, seg-overlay.ts popDirection): +1 lifts the ML subject, −1 deepens
   * it (a subject darker than the water around it). Decided from the subject/water contrast averaged over the clip
   * (popC), so the subject keeps one look as it swims off; reset with the clip. */
  private popDir = 1;
  private popC = { sum: 0, n: 0 };
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
  /** Detector verdict: null until the first reply (gate closed), boxes thereafter; when it was given. */
  private personBoxes: PersonBox[] | null = null;
  private personBoxesAt = -Infinity;
  private personPasses = 0;
  private personDetectInflight = false;
  private personDetectWarned = false;
  private personWaiters: (() => void)[] = [];
  /** Clip-time analysis slot of the last analysis started by tick / analyzeDue. */
  private lastSlot = Number.NaN;
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
  /** Media time at which the cut of each windowed segment was actually observed (by segment index). */
  private cutSeen = new Map<number, number>();
  private pool: Worker[] = [];
  private poolLoad: number[] = [];
  private preId = 0;
  private preWaiters = new Map<number, { resolve: (a: AnalysisPacket | null) => void; worker: number }>();
  /** Analyse-first cache: clip time → the thumbnail read back there, the lock / anchor target it was analysed under, and the analysis (pending in the pool). */
  private pre = new Map<number, Precomputed>();
  private resolveWaiters: ((p: AnalysisPacket) => void)[] = [];
  private rejectWaiters: ((e: Error) => void)[] = [];
  private onError: (e: Error) => void;

  private constructor(backend: GpuBackend, onError: (e: Error) => void) {
    this.backend = backend;
    this.onError = onError;
    this.stats = { backend: backend.kind, analysisMs: 0, analyses: 0, sceneCuts: 0, person: "off", personMs: 0, personCoverage: 0, personBoxes: -1, personDetectMs: 0 };
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
    this.cutSeen.clear();
    this.follow.reset();
    this.anchorTargets = [];
    this.targetsReq++;
    if (this.locked) {
      this.current = this.applyLock(this.current);
      if (this.target) this.target = this.applyLock(this.target);
      this.requestTargets();
    }
  }

  /** Forgets the profile thumbnails (a new clip, or a new colour input for the same clip). */
  forgetProfile(): void {
    this.profileThumbs.clear();
  }

  /** Asks the worker for each locked segment's anchor target, measured on the profile thumbnails inside it. */
  private requestTargets(): void {
    const segs = this.locked;
    if (!segs || !this.followEnabled || this.profileThumbs.size === 0) return;
    const shots = segs.map((s, i) => {
      const lo = i === 0 ? -Infinity : s.from, hi = i + 1 < segs.length ? segs[i + 1].from : Infinity;
      const thumbs = [...this.profileThumbs].filter(([t]) => t >= lo && t < hi).map(([, px]) => px.slice().buffer as ArrayBuffer);
      return { lock: s.params, thumbs };
    });
    const req: TargetsRequest = { kind: "targets", id: this.targetsReq, width: ANALYSIS_W, height: ANALYSIS_H, shots };
    this.ensureWorker().postMessage(req, shots.flatMap((s) => s.thumbs));
  }

  private onTargets(r: TargetsReply): void {
    if (r.id !== this.targetsReq) return;
    this.anchorTargets = r.targets;
    console.info(`[anchor] targets for ${r.targets.length} segment(s): ${r.targets.map((t) => (t ? `${t[0].toFixed(3)},${t[1].toFixed(3)}` : "none")).join(" | ")}`);
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
    return segmentAt(this.locked, this.cutSeen, timeSec).params;
  }

  /** True while `timeSec` lies inside a segment's cut window whose cut hasn't been seen yet (callers may analyse every frame there). */
  inCutWindow(timeSec: number): boolean {
    return this.locked ? lockInCutWindow(this.locked, this.cutSeen, timeSec) : false;
  }

  /** Records that the per-frame analysis saw a scene cut at `timeSec`; a windowed segment waiting for it switches there. */
  noteSceneCut(timeSec: number): void {
    if (this.locked) lockNoteCut(this.locked, this.cutSeen, timeSec);
  }

  /** Debug (?lockz=1): also lock the range normalisation (zLo/zHi) — A/B for flicker. */
  lockRange = false;

  private applyLock(p: GradeParams): GradeParams {
    const l = this.lockedAt(this.lastTickSec);
    if (!l) return p;
    return this.withFollow(lockParams(l, p, this.lockRange));
  }

  private withFollow(p: GradeParams): GradeParams {
    return this.followEnabled ? this.follow.apply(p) : p;
  }

  /** Runs one analysis of the current source and returns its raw parameters and mean colour (clip profiling). */
  async analyzeRaw(timeoutMs = 10_000, timeSec?: number, seeds?: { u: number; v: number }[]): Promise<{ params: GradeParams; mean: Vec3; animals?: AnimalMap }> {
    const p = new Promise<AnalysisPacket>((resolve, reject) => {
      this.resolveWaiters.push(resolve);
      this.rejectWaiters.push(reject);
    });
    if (this.inflight) await p.catch(() => undefined);
    const q = new Promise<AnalysisPacket>((resolve, reject) => {
      this.resolveWaiters.push(resolve);
      this.rejectWaiters.push(reject);
    });
    // With a clip time the thumbnail is kept for the anchor targets (see requestTargets).
    this.keepThumbAt = timeSec ?? null;
    await this.startAnalysis({ raw: true, seeds });
    const packet = await new Promise<AnalysisPacket>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Frame analysis timed out")), timeoutMs);
      q.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
    return { params: packet.params, mean: packet.mean, animals: packet.animals };
  }

  /** Current (eased) person map at the fields' resolution — diagnostics. */
  getPersonMap(): { width: number; height: number; data: Float32Array } | null {
    if (!this.person || !this.fields) return null;
    return { width: this.fields.width, height: this.fields.height, data: this.person };
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<AnalysisPacket | TargetsReply>) => {
      if (e.data.kind === "targets") this.onTargets(e.data);
      else this.onPacket(e.data);
    };
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
    this.workerMs.person += p.ms;
    this.settlePerson();
    if (p.id !== this.personReqId) return;
    if (this.personDetectInflight) {
      this.personDetectInflight = false;
      if (p.boxes === undefined) {
        // No detector (download failed, …): the gate stays open rather than losing the feature.
        if (p.error && !this.personDetectWarned) console.warn("Person detector unavailable:", p.error);
        this.personDetectWarned = true;
        this.personBoxes = [{ x: 0, y: 0, w: 1, h: 1, score: 1 }];
      } else {
        this.personBoxes = p.boxes.filter((b) => b.score >= PERSON_BOX_MIN_SCORE);
      }
      this.personBoxesAt = this.lastTickSec;
      this.stats.personBoxes = this.personBoxes.length;
      this.stats.personDetectMs = p.ms;
      console.info(`[person] verdict ${this.personBoxes.length} box(es) in ${p.ms.toFixed(0)} ms at t=${this.lastTickSec.toFixed(2)}s`);
      this.rebuildPerson();
      return;
    }
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
    this.rebuildPerson();
  }

  /** Recomputes the eased person target from the raw detections, gated by the detector's boxes. */
  private rebuildPerson(): void {
    const fw = this.fields?.width ?? 0, fh = this.fields?.height ?? 0;
    if (fw < 4 || fh < 4 || !this.personFull || !this.personTiles || this.personFull.length !== fw * fh) return;
    const fresh = this.lastTickSec - this.personBoxesAt <= PERSON_BOX_HOLD_S;
    const gate = this.personBoxes && fresh ? boxGate(this.personBoxes, fw, fh) : null;
    const raw = new Float32Array(fw * fh);
    if (gate) for (let i = 0; i < raw.length; i++) raw[i] = Math.max(this.personFull[i], this.personTiles[i]) * gate[i];
    const map = growMask(raw, fw, fh, this.guide?.data ?? null, this.fields?.data ?? null, this.current.veilColor);
    let cov = 0;
    for (let i = 0; i < map.length; i++) cov += map[i];
    this.stats.personCoverage = cov / map.length;
    // A person appearing where there was none (the clip's first verdict, a
    // diver entering) snaps in rather than easing over TAU_MAPS: the ramp
    // left skin neutral for the first ~10 frames of every export.
    let prevCov = 0;
    if (this.person && this.person.length === map.length) for (let i = 0; i < map.length; i++) prevCov += this.person[i];
    if (!this.person || this.person.length !== map.length || (prevCov < 1e-6 && cov > 0)) {
      if (cov > 0) console.info(`[person] mask snapped in at t=${this.lastTickSec.toFixed(2)}s (${(cov / map.length * 100).toFixed(0)}% coverage)`);
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
    if (prevLock !== nextLock && nextLock && prevLock && this.locked) {
      const seg = segmentAt(this.locked, this.cutSeen, timeSec);
      if (!seg.window || this.cutSeen.has(this.locked.indexOf(seg))) {
        // Crossed a segment boundary at a cut (the analysis saw it, or the user split there): snap the
        // globals to the new estimate. (The cut's packet already restarted the follow.)
        this.current = this.withFollow(lockParams(nextLock, this.current, this.lockRange));
        if (this.target) this.target = this.withFollow(lockParams(nextLock, this.target, this.lockRange));
      } else {
        // The profile split here but no cut was seen: the same shot changed (a pan into open water).
        // Snapping would step the colour mid-shot; ease to the new estimate instead.
        this.follow.rebase(prevLock, nextLock);
        const base = this.target ?? this.current;
        this.target = this.withFollow(lockParams(nextLock, base, this.lockRange));
      }
    }
    this.smooth(dt);
    // Analyses follow clip time, not the wall clock: one per analysis slot of
    // the clip (analysisSlot), the same frames the export analyses, so preview
    // and export grade a frame alike (wall-clock cadence made two exports of
    // one clip differ by up to 8.7 ΔE00). A slot the worker was too busy for
    // is taken up at the next tick inside it.
    const slot = analysisSlot(timeSec, this.slotSec());
    if (!this.inflight && (force || slot !== this.lastSlot)) {
      this.lastSlot = slot;
      void this.startAnalysis();
      return true;
    }
    return false;
  }

  /** Clip-time analysis slot length (s): ANALYSIS_SLOT_S, or longer when analysisIntervalMs asks for less work. */
  private slotSec(): number {
    return Math.max(ANALYSIS_SLOT_S, this.analysisIntervalMs / 1000);
  }

  /**
   * Offline export: analyses the uploaded frame at clip time `timeSec` when
   * it opens a new analysis slot, and waits for it (and for a person pass it
   * started), so every frame's grade depends on the clip alone, never on how
   * fast the worker happened to be. `snap` (first frame, a cut window, a new
   * segment) always analyses and snaps to the result. Call before tick(timeSec).
   */
  async analyzeDue(timeSec: number, snap = false, timeoutMs = 10_000): Promise<void> {
    const slot = analysisSlot(timeSec, this.slotSec());
    if (!snap && slot === this.lastSlot && this.hasAnalysis) return;
    this.lastSlot = slot;
    await this.analyzeNow(snap, timeoutMs, timeSec);
    const tp = performance.now();
    if (!snap) await Promise.race([this.waitPerson(), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
    this.workerMs.personWait += performance.now() - tp;
  }

  /** Starts an analysis of the current source if none is in flight (real-time export loop). */
  analyzeSoon(): void {
    if (!this.inflight) void this.startAnalysis();
  }

  /**
   * Runs one analysis and waits for it (photos, export keyframes). Rejects
   * on a GPU/worker failure or after `timeoutMs`, so callers can carry on
   * with the ungraded frame instead of hanging.
   */
  async analyzeNow(snap: boolean, timeoutMs = 10_000, dueSec?: number): Promise<void> {
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
    await this.startAnalysis({ dueSec });
    const packet = await withTimeout(p);
    if (snap) {
      // First frame of an export / a photo: let the person mask land too so
      // the snap carries it (bounded by the same timeout; failure is fine).
      await withTimeout(this.waitPerson()).catch(() => undefined);
      if (this.personTarget) { this.person = this.personTarget; this.personTarget = null; }
    }
    if (snap && packet.id === this.reqId) this.snapTo(toGpuPacket(packet));
    // A snap (clip load, export start) covers the current slot: the next tick doesn't analyse it again.
    if (snap) this.lastSlot = analysisSlot(this.lastTickSec, this.slotSec());
  }

  private settle(packet: AnalysisPacket | null, error: Error | null): void {
    const res = this.resolveWaiters;
    const rej = this.rejectWaiters;
    this.resolveWaiters = [];
    this.rejectWaiters = [];
    if (packet) for (const r of res) r(packet);
    else if (error) for (const r of rej) r(error);
  }

  /**
   * `raw`: a sample taken out of playback order (clip profile, Subject pop track pass) — it does not feed the
   * animal tracker; `seeds` replaces the corrections' own seeds.
   */
  private async startAnalysis(opts: { raw?: boolean; seeds?: { u: number; v: number }[]; dueSec?: number } = {}): Promise<void> {
    if (this.inflight) return;
    this.inflight = true;
    try {
      // Analyse-first (precompute): the thumbnail of this clip time was read back ahead, from the same
      // upload of the same frame, and its analysis is running or done in the pool.
      let cached = opts.dueSec !== undefined && !opts.raw ? this.takePrecomputed(opts.dueSec) : undefined;
      const tr = performance.now();
      let rgba = cached?.rgba ?? await this.readback(ANALYSIS_W, ANALYSIS_H);
      if (cached && this.verifyPrecomputed) {
        const live = await this.readback(ANALYSIS_W, ANALYSIS_H);
        if (!sameBytes(live, cached.rgba)) {
          this.precomputeStats.mismatches++;
          console.warn(`[engine] precomputed thumbnail differs at t=${opts.dueSec!.toFixed(3)}s: using the live one`);
          rgba = live;
          cached = undefined;
        }
      }
      this.workerMs.readback += performance.now() - tr;
      if (this.keepThumbAt !== null) {
        this.profileThumbs.set(this.keepThumbAt, rgba.slice());
        this.keepThumbAt = null;
      }
      // Person segmentation: a copy of this thumbnail (full frame) or a
      // quadrant at 2× detail, cycling through PERSON_RECTS. Both readbacks
      // finish before anything is posted: once the analysis reply lands,
      // `inflight` clears and the next tick may start a new readback.
      const wantPerson = this.personEnabled && !this.personFailed && !this.personInflight && this.personCount++ % this.personEvery === 0;
      // The first pass (and every PERSON_DETECT_EVERY-th) is a detection on the full frame.
      const detect = wantPerson && this.personPasses++ % PERSON_DETECT_EVERY === 0;
      const rect = detect ? FULL_RECT : PERSON_RECTS[this.personRectIdx % PERSON_RECTS.length];
      const px = !wantPerson ? null : rect === FULL_RECT ? rgba.slice() : await this.readback(ANALYSIS_W, ANALYSIS_H, rect);
      // The anchor (follow.ts) needs the lock in force and its shot's target.
      const { lock, target } = this.anchorAt(this.lastTickSec);
      this.reqLock = lock;
      const seeds = opts.seeds ?? (this.settings.subjectPop && !opts.raw ? this.animals.seeds(this.lastTickSec) : []);
      // The pool analysed this thumbnail under the lock and target in force now (and without seeds, which
      // change the analysis): its packet is the one the engine's worker would send. Otherwise it runs there.
      const tw = performance.now();
      const done = cached && cached.lock === lock && cached.target === target && !seeds.length
        ? await Promise.race([cached.packet, new Promise<null>((r) => setTimeout(() => r(null), 10_000))])
        : null;
      this.workerMs.poolWait += performance.now() - tw;
      if (opts.dueSec !== undefined && this.pool.length > 0) this.precomputeStats[done ? "hits" : "misses"]++;
      this.rawReq = !!opts.raw;
      const req: AnalysisRequest = { id: ++this.reqId, rgba: rgba.buffer as ArrayBuffer, width: ANALYSIS_W, height: ANALYSIS_H, ...(lock && target ? { lock, target } : {}), ...(seeds.length ? { seeds } : {}) };
      this.reqTimeSec = this.lastTickSec;
      if (done) {
        const id = req.id;
        // Delivered as the worker's reply would be (after this request is fully issued).
        queueMicrotask(() => this.onPacket({ ...done, id }));
      } else {
        this.ensureWorker().postMessage(req, [req.rgba]);
      }
      if (px) {
        if (!detect) this.personRectIdx++;
        const preq: PersonRequest = { id: ++this.personReqId, rgba: px.buffer as ArrayBuffer, width: ANALYSIS_W, height: ANALYSIS_H, timestampMs: Math.round(this.lastTickSec * 1000), detect };
        this.personInflight = true;
        this.personDetectInflight = detect;
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
    this.workerMs.analysis += packet.ms;
    this.workerMs.analyses++;
    const cut = this.lastMean !== null && meanDiff(this.lastMean, packet.mean) > SCENE_CUT_MEAN_DIFF;
    this.lastMean = packet.mean;
    // Subject pop: per-animal tracking, stability and fades (animals.ts); a cut starts over.
    // A sample out of playback order (profile, track pass) says nothing about the animals on screen.
    if (!this.rawReq) {
      if (cut) this.animals.reset();
      if (this.settings.subjectPop && (packet.params.backdrop ?? 0) > 0 && raw.animals) this.animals.update(raw.animals, this.reqTimeSec, packet.fields.data, packet.guide.data);
      // No longer open water (or Subject pop off): the animals fade out where they are, never snap.
      else this.animals.fadeAll();
    }
    this.leadBase = { fields: packet.fields, guide: packet.guide };
    // Material-anchored balance (follow.ts): a cut, a fresh start or a seek forgets the shot's offset.
    const jumped = Math.abs(this.lastTickSec - this.lastPacketSec) > FOLLOW_SEEK_S;
    if (!this.hasAnalysis || cut || jumped) this.follow.reset();
    // A cut inside a profiled cut window switches the lock here (before the follow reads it).
    if (cut) this.noteSceneCut(this.lastTickSec);
    const lockNow = this.lockedAt(this.lastTickSec);
    if (lockNow && this.followEnabled) {
      // The anchor was solved under the lock sent with the request: re-express it against the lock now in force.
      let anchor = raw.anchor ?? null;
      const sent = this.reqLock;
      if (anchor && sent && sent !== lockNow) anchor = { ...anchor, log: [anchor.log[0] + Math.log(sent.wb[0] / lockNow.wb[0]), anchor.log[1] + Math.log(sent.wb[2] / lockNow.wb[2])] };
      this.follow.update(anchor, packet.params, this.hasAnalysis && !cut && !jumped ? this.lastTickSec - this.lastPacketSec : 0);
    }
    this.lastPacketSec = this.lastTickSec;
    if (!this.hasAnalysis || cut) {
      if (cut) {
        this.stats.sceneCuts++;
        this.backend.resetTemporal?.();
        // New scene: the detector must speak again before any mask counts.
        this.personBoxes = null;
        this.personPasses = 0;
        this.personFull?.fill(0);
        this.personTiles?.fill(0);
        this.stats.personBoxes = -1;
      }
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
    this.animals.snap();
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
      const fit0 = this.current.backdropFit;
      this.current = lerpParams(this.current, this.target, a);
      // Subject pop: the water surface the subject test measures against follows the frame as fast as the subject
      // map does; a lagging surface makes the water beside a moving animal "depart" and tone as a grey patch.
      const ft = this.target.backdropFit;
      if (this.settings.subjectPop && fit0 && ft && fit0.length === ft.length) {
        const af = 1 - Math.exp(-dt / TAU_CONF_OPEN_S);
        this.current = { ...this.current, backdropFit: fit0.map((x, i) => x + (ft[i] - x) * af) };
      }
    }
    const am = 1 - Math.exp(-dt / TAU_MAPS_S);
    const ac = 1 - Math.exp(-dt / TAU_CLAHE_S);
    const ease = (cur: Packed | null, tgt: Packed | null, rate = am, rate1 = rate): Packed | null => {
      if (!tgt) return cur;
      if (!cur || cur.width !== tgt.width || cur.height !== tgt.height || cur.data.length !== tgt.data.length) return tgt;
      // Blend into a private copy so the packet's buffer stays pristine.
      const out = cur === this.lastEased.get(tgt) ? cur : { ...cur, data: new Float32Array(cur.data) };
      if (rate1 === rate) lerpInto(out.data, tgt.data, rate);
      else lerpInto4(out.data, tgt.data, rate, rate1);
      this.lastEased.set(tgt, out);
      return out;
    };
    const open = Math.min(1, Math.max(0, this.current.backdrop ?? 0));
    const aConf = am + (1 - Math.exp(-dt / TAU_CONF_OPEN_S) - am) * open;
    if (this.settings.subjectPop) {
      this.animals.step(dt);
      this.leadAnimals();
    }
    const f = ease(this.fields, this.fieldsTarget, am, aConf);
    // Subject pop: the guide that steers the subject map's joint-bilateral upsampling follows as fast as the map
    // itself, or a lagging guide steers the map onto the water where the animal (a fast tail) just was.
    const g = ease(this.guide, this.guideTarget, this.settings.subjectPop ? aConf : am);
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
      // Topside / no-cast frames (calm.ts) keep their skin as recorded.
      const pk = 1 - calmToneOf(this.current);
      for (let i = 0; i < this.person.length; i++) merged[i * 4 + 3] = this.person[i] * pk;
      this.guideMerged = merged;
      this.backend.setData(2, { width: g.width, height: g.height, data: merged });
    } else {
      this.backend.setData(2, g);
    }
    // Per-animal Subject pop strength (data texture 3); none without Subject pop.
    if (this.settings.subjectPop) {
      const st = this.animals.strength(this.lastTickSec);
      this.backend.setData(3, this.seg ? composeSegStrength(st, this.seg, (this.current.backdrop ?? 0) <= 0) : st);
      const c = this.seg ? popContrast(g, this.seg) : null;
      if (c !== null) { this.popC.sum += c; this.popC.n++; }
      this.popDir = this.popC.n ? popDirection(this.popC.sum / this.popC.n) : 1;
      this.strengthOn = true;
    } else if (this.strengthOn) {
      this.backend.setData(3, { width: 1, height: 1, data: new Float32Array(4) });
      this.strengthOn = false;
    }
    this.dirtyData = false;
  }

  /**
   * Moves each animal's part of the subject map (and the guide that steers it) along the animal's own motion
   * since its analysis, so the map leads a fast animal; the texels it left take the water's colour.
   */
  private leadAnimals(): void {
    const base = this.leadBase;
    if (!base || !this.hasAnalysis) return;
    const fit = this.current.backdropFit;
    const w = base.fields.width, h = base.fields.height;
    const water = (x: number, y: number): [number, number, number] => {
      if (!fit || fit.length !== 18) return [0, 0, 0];
      const u = (x + 0.5) / w - 0.5, v = (y + 0.5) / h - 0.5;
      const at = (o: number) => fit[o] + fit[o + 1] * u + fit[o + 2] * v + fit[o + 3] * u * u + fit[o + 4] * u * v + fit[o + 5] * v * v;
      return oklabToLinear(at(0), at(6), at(12));
    };
    const led = this.animals.lead(base.fields.data, base.guide.data, this.lastTickSec, water);
    this.fieldsTarget = led ? { ...base.fields, data: led.fields } : base.fields;
    this.guideTarget = led ? { ...base.guide, data: led.guide } : base.guide;
    // The strength map follows the animals every frame.
    if (this.animals.count) this.dirtyData = true;
  }

  /**
   * Subject pop corrections for this clip (tap to include / exclude; see animals.ts SubjectOverride). Stored by the
   * app with the clip state and set before preview and every export.
   */
  setSubjectOverrides(list: readonly SubjectOverride[]): void {
    this.animals.setOverrides(list);
    this.dirtyData = true;
  }

  /**
   * Eases the animals' strengths by `dtSec` of wall time (a paused frame has no clip time to ease on, so the UI
   * animates a correction with this) and marks the maps for upload. True while still easing.
   */
  stepSubjects(dtSec: number): boolean {
    this.animals.step(dtSec);
    this.dirtyData = true;
    return this.animals.easing;
  }

  /**
   * A paused frame at clip time `timeSec` (a seek while paused): the clock moves without easing anything, so the
   * next analysis is stamped with this frame's time (corrections bind by time) and a jump drops stale tracks.
   */
  setTime(timeSec: number): void {
    this.lastTickSec = timeSec;
    this.checkJump();
  }

  /** A seek (or a jump back) breaks the motion history: the temporal layer and the animal tracks start over. */
  private checkJump(): void {
    const t = this.lastTickSec;
    if (this.lastRenderSec >= 0 && (t < this.lastRenderSec - 1e-3 || t - this.lastRenderSec > 0.3)) {
      this.backend.resetTemporal?.();
      this.animals.reset();
    }
    this.lastRenderSec = t;
  }

  /**
   * AI subject detection (Studio seg/): the ML subject mask for the frame about to be drawn (upright, any size), or
   * null for the engine's own subject masks. Set before render / renderToFrame, per frame.
   */
  setSegOverlay(o: SegOverlay | null): void {
    if (o === this.seg) return;
    this.seg = o;
    this.dirtyData = true;
  }

  /** The current source, upright, resized to w×h (RGBA8): the frame the ML segmenter sees is the frame graded. */
  async readUpright(w: number, h: number): Promise<Uint8ClampedArray> {
    return this.readback(w, h);
  }

  private readbackChain: Promise<unknown> = Promise.resolve();
  /**
   * Every analysis readback goes through here, one at a time: the backends allow one in flight, and the analysis
   * loop, the person detector, the export lookahead and the AI subject detection pass all read back.
   */
  private readback(w: number, h: number, rect?: Rect): Promise<Uint8ClampedArray> {
    const run = this.readbackChain.then(() => this.backend.analyze(w, h, rect));
    this.readbackChain = run.catch(() => undefined);
    return run;
  }

  /** The person detector's current boxes (upright 0..1), for prompting the ML segmenter with a diver's box. */
  personBoxesNow(): readonly PersonBox[] {
    return this.personBoxes ?? [];
  }

  /** The latest analysis found open blue water (Subject pop has something to work on). */
  openWater(): boolean {
    return (this.target?.backdrop ?? this.current.backdrop ?? 0) > 0;
  }

  /** The tracked animals now (ids per map texel + state), for drawing outlines and hit-testing taps. */
  subjectSelection(): SubjectSelection | null {
    return this.settings.subjectPop ? this.animals.selection(this.lastTickSec) : null;
  }

  /** Reset temporal state for a new file. */
  /**
   * Forgets all temporal state. `keepPerson` (an export of the clip that was
   * just previewed) keeps the detector's verdict so the first person pass is
   * a mask, not a detection: without it skin tone arrived ~10 frames late.
   */
  reset(opts: { keepPerson?: boolean } = {}): void {
    const verdict = opts.keepPerson ? this.personBoxes : null;
    this.clearPrecomputed();
    this.reqId++;
    this.inflight = false;
    this.hasAnalysis = false;
    this.target = null;
    this.fieldsTarget = null;
    this.guideTarget = null;
    this.claheTarget = null;
    this.current = IDENTITY_PARAMS;
    this.lastMean = null;
    this.lastSlot = Number.NaN;
    this.lastTickSec = 0;
    this.cutSeen.clear();
    this.follow.reset();
    this.lastPacketSec = 0;
    this.settle({ id: -1 } as AnalysisPacket, null);
    this.personReqId++;
    this.personInflight = false;
    this.person = null;
    this.personTarget = null;
    this.personFull = null;
    this.personTiles = null;
    this.personRectIdx = 0;
    this.personCount = 0;
    this.personBoxes = verdict;
    this.personBoxesAt = verdict ? 0 : -Infinity;
    // With a verdict in hand the first pass segments; detection follows on the third.
    this.personPasses = verdict ? 1 : 0;
    this.personDetectInflight = false;
    this.stats.personCoverage = 0;
    this.stats.personBoxes = verdict ? verdict.length : -1;
    this.settlePerson();
    this.lastRenderSec = -1;
    this.backend.resetTemporal?.();
    this.animals.reset();
    this.leadBase = null;
    this.popC = { sum: 0, n: 0 };
    this.popDir = 1;
  }

  private pack(): Float32Array {
    const depth: DepthMap = { width: this.fields!.width, height: this.fields!.height, fields: new Float32Array(0), guide: new Float32Array(0) };
    const clahe: ClaheLuts = { tilesX: CLAHE_TILES_X, tilesY: CLAHE_TILES_Y, bins: CLAHE_BINS, data: new Float32Array(0) };
    const settings = this.hasAnalysis ? this.settings : { ...this.settings, intensity: 0 };
    const u = packUniforms(this.current, settings, depth, clahe, 0, this.split);
    u[93] = this.temporalEnabled ? 1 : 0;
    u[96] = this.popDir;
    u[97] = this.seg && this.settings.subjectPop ? 1 : 0;
    this.checkJump();
    return u;
  }

  /** Renders the current source with the current grade into the canvas. */
  render(rotation: Rotation = 0): void {
    if (this.dirtyData) this.pushData();
    const u = this.pack();
    u[0] = rotation;
    this.backend.setUniforms(u);
    this.backend.render();
  }

  /**
   * Moves the compare split without grading again: redraws the canvas from
   * the last rendered frame (the temporal history is left alone). False when
   * the backend has no reusable frame; call render() then.
   */
  recomposite(split: number): boolean {
    this.split = split;
    return this.backend.recomposite?.(split) ?? false;
  }

  /** The picture shown left of the compare split when the source is not the original (see GpuBackend.setBefore). */
  setBefore(src: SourceInput | null, width: number, height: number): void {
    this.backend.setBefore?.(src, width, height);
  }

  // ---------------------------------------------------------- analyse-first

  /** The analysis slot of a clip time under the current slot length (export lookahead). */
  analysisSlotAt(timeSec: number): number {
    return analysisSlot(timeSec, this.slotSec());
  }

  /** True when `timeSec` lies in any profiled cut window (seen or not): an export may analyse every frame there. */
  inAnyCutWindow(timeSec: number): boolean {
    return !!this.locked?.some((s) => s.window !== undefined && timeSec >= s.window[0] && timeSec < s.window[1]);
  }

  /**
   * Analyse-first (offline export): reads the thumbnail of the frame just
   * uploaded (clip time `timeSec`) and starts its analysis in the pool,
   * without waiting for it, under the lock / anchor target the render will
   * have in force there (`prevSec`: the clip time of the frame rendered
   * before it, which is the engine's clock when that frame is analysed).
   * The analyzeDue of that clip time later takes this thumbnail and packet:
   * the same pixels through the same worker code under the same lock, so the
   * same grade, without the render waiting for a worker. A lock that changed
   * meanwhile (a cut seen in a cut window) sends it to the engine's worker.
   */
  async precompute(timeSec: number, prevSec: number): Promise<void> {
    if (this.pre.has(timeSec)) return;
    const tr = performance.now();
    const rgba = await this.readback(ANALYSIS_W, ANALYSIS_H);
    this.workerMs.readback += performance.now() - tr;
    const { lock, target } = this.anchorAt(prevSec);
    const w = this.poolWorker();
    const id = ++this.preId;
    const copy = rgba.slice();
    // Every pool worker failed: the thumbnail is still reused, the analysis runs in the engine's worker.
    if (this.poolLoad[w] === Infinity) {
      this.pre.set(timeSec, { rgba, lock, target, packet: Promise.resolve(null) });
      return;
    }
    const packet = new Promise<AnalysisPacket | null>((resolve) => this.preWaiters.set(id, { resolve, worker: w }));
    this.poolLoad[w]++;
    const req: AnalysisRequest = { id, rgba: copy.buffer as ArrayBuffer, width: ANALYSIS_W, height: ANALYSIS_H, ...(lock && target ? { lock, target } : {}) };
    this.pool[w].postMessage(req, [req.rgba]);
    this.pre.set(timeSec, { rgba, lock, target, packet });
  }

  /** The anchor's inputs at engine clock `timeSec`: the lock in force and its shot's target (both null without). */
  private anchorAt(timeSec: number): { lock: GradeParams | null; target: [number, number] | null } {
    const seg = this.followEnabled && this.locked ? segmentAt(this.locked, this.cutSeen, timeSec) : null;
    const target = seg ? this.anchorTargets[this.locked!.indexOf(seg)] ?? null : null;
    return target ? { lock: seg!.params, target } : { lock: null, target: null };
  }

  /** Forgets precomputed analyses before `timeSec` (the render has passed them). */
  dropPrecomputedBefore(timeSec: number): void {
    for (const t of this.pre.keys()) if (t < timeSec) this.pre.delete(t);
  }

  /** Drops the analyse-first cache; `terminate` also stops the pool (end of an export). */
  clearPrecomputed(terminate = false): void {
    this.pre.clear();
    for (const { resolve } of this.preWaiters.values()) resolve(null);
    this.preWaiters.clear();
    if (terminate) {
      for (const w of this.pool) w.terminate();
      this.pool = [];
      this.poolLoad = [];
    }
  }

  private takePrecomputed(timeSec: number): Precomputed | undefined {
    const c = this.pre.get(timeSec);
    if (c) this.pre.delete(timeSec);
    return c;
  }

  /** The least loaded pool worker (started on first use). */
  private poolWorker(): number {
    const n = Math.max(1, this.analysisPoolSize);
    while (this.pool.length < n) {
      const i = this.pool.length;
      const w = new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<AnalysisPacket>) => {
        const r = e.data;
        const waiter = this.preWaiters.get(r.id);
        this.poolLoad[i] = Math.max(0, this.poolLoad[i] - 1);
        if (!waiter) return;
        this.preWaiters.delete(r.id);
        waiter.resolve(r);
      };
      w.onerror = (e) => {
        // A failed pool worker: its pending analyses fall back to the engine's own worker.
        console.warn("Analysis pool worker failed:", e.message);
        for (const [id, wt] of this.preWaiters) if (wt.worker === i) { wt.resolve(null); this.preWaiters.delete(id); }
        this.poolLoad[i] = Infinity;
      };
      this.pool.push(w);
      this.poolLoad.push(0);
    }
    let best = 0;
    for (let i = 1; i < this.pool.length; i++) if (this.poolLoad[i] < this.poolLoad[best]) best = i;
    return best;
  }

  /** Export with frames in flight: resolves when the next renderToFrame will draw without waiting (see backend-webgpu readbackSlotFree). */
  async exportReady(): Promise<void> {
    await (this.backend as unknown as { readbackSlotFree?: () => Promise<void> }).readbackSlotFree?.();
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
    this.clearPrecomputed(true);
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

/** lerpInto on RGBA texels, channel 1 (the object channel) at its own rate. */
function lerpInto4(dst: Float32Array, src: Float32Array, t: number, t1: number): void {
  for (let i = 0; i < dst.length; i++) dst[i] += (src[i] - dst[i]) * ((i & 3) === 1 ? t1 : t);
}

function meanDiff(a: Vec3, b: Vec3): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

type Precomputed = { rgba: Uint8ClampedArray; lock: GradeParams | null; target: [number, number] | null; packet: Promise<AnalysisPacket | null> };

function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
