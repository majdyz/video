// CPU replay of GradeEngine's temporal state machine (engine.ts) for the eval
// harness: clip profile + lock, analysis cadence, scene-cut snaps and the
// easing of params / maps. Kept deliberately close to engine.ts; Subject pop
// and person segmentation are off (their defaults for a clip without people).
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { analysisSlot, lockParams } from "../src/engine/lock.ts";
import { LockTrack } from "../src/engine/lock-track.ts";
import { curveAt, shotBalance } from "../src/engine/follow.ts";
import { profileTimes, segmentProfile, type ProfileSample } from "../src/engine/profile.ts";
import { lerpParams, type ClaheLuts, type DepthMap, type FrameAnalysis, type GradeParams, type Vec3 } from "../src/engine/params.ts";

export type SimMode = "export" | "preview" | "unlocked";
type Analysed = FrameAnalysis;

const TAU_PARAMS_S = 0.6;
const TAU_MAPS_S = 0.4;
const TAU_CLAHE_S = 0.7;
const TAU_CONF_OPEN_S = 0.05;
const SCENE_CUT_MEAN_DIFF = 0.16;

export class ClipSim {
  /** The clip lock (lock-track.ts): one frozen estimate per shot, its balance curve, the cuts seen. */
  track: LockTrack | null = null;
  current: GradeParams | null = null;
  target: GradeParams | null = null;
  fields: Float32Array | null = null;
  guide: Float32Array | null = null;
  clahe: Float32Array | null = null;
  fieldsT: Float32Array | null = null;
  guideT: Float32Array | null = null;
  claheT: Float32Array | null = null;
  mapW = 0;
  mapH = 0;
  claheShape: Omit<ClaheLuts, "data"> | null = null;
  lastMean: Vec3 | null = null;
  lastTick = 0;
  lastSlot = Number.NaN;
  /** Analyses in flight: frame they were taken from and frame they land on. */
  pending: { at: number; lands: number; a: Analysed }[] = [];
  cuts: number[] = [];
  /** Anchor target per locked segment (follow.ts shotBalance; diagnostics). */
  targets: ([number, number] | null)[] = [];
  /** Ablations (options, else env): SIM_NOFOLLOW=1 drops the shots' balance curves (the plain lock), SIM_SNAPSEG=1 holds each estimate to the end of its window and snaps (the old engine). */
  private noFollow: boolean;
  private snapSeg: boolean;
  /** Per-frame analyses shared between simulations of the same clip (the analysis does not depend on the engine state). */
  private cache: Map<number, FrameAnalysis> | null;
  paramLog: string[] = ["frame,t,kind,wb_r,wb_b,exposure,black,white,zLo,zHi,zMean,binf_r,binf_g,binf_b,calm,calmTone,haze,backdrop,cur_wb_r,cur_wb_b,cur_exp,cur_zLo,cur_zHi,anchor_frac,anchor_logR,anchor_logB,anchor_before_a,anchor_before_b,anchor_after_a,anchor_after_b,follow_logR,follow_logB"];

  readonly mode: SimMode;
  readonly fps: number;
  readonly latency: number;
  constructor(mode: SimMode, fps: number, latency = 2, opts: { noFollow?: boolean; snapSeg?: boolean; cache?: Map<number, FrameAnalysis> } = {}) {
    this.mode = mode;
    this.fps = fps;
    this.latency = latency;
    this.noFollow = opts.noFollow ?? process.env.SIM_NOFOLLOW === "1";
    this.snapSeg = opts.snapSeg ?? process.env.SIM_SNAPSEG === "1";
    this.cache = opts.cache ?? null;
  }

  private analyzeFrame(f: number, thumbs: Uint8ClampedArray[]): FrameAnalysis {
    const hit = this.cache?.get(f);
    if (hit) return hit;
    const a = analyzeThumbnail(thumbs[f], ANALYSIS_W, ANALYSIS_H);
    this.cache?.set(f, a);
    return a;
  }

  profile(thumbs: Uint8ClampedArray[]): string {
    if (this.mode === "unlocked") return "unlocked";
    const dur = thumbs.length / this.fps;
    const samples: ProfileSample[] = [];
    for (const t of profileTimes(dur)) {
      const f = Math.min(thumbs.length - 1, Math.round(t * this.fps));
      const a = this.analyzeFrame(f, thumbs);
      samples.push({ t, params: a.params, mean: a.mean });
    }
    let segs = segmentProfile(samples, SCENE_CUT_MEAN_DIFF);
    if (segs && this.snapSeg) segs = segs.map((x) => ({ ...x, means: undefined }));
    this.track = segs ? new LockTrack(segs) : null;
    // Each shot's balance from the profile's own thumbnails of it (engine.requestBalance → worker shotBalance).
    const bal = !segs || this.noFollow ? [] : segs.map((x, i) => {
      const lo = i === 0 ? -Infinity : x.from, hi = i + 1 < segs.length ? segs[i + 1].from : Infinity;
      const inside = samples.filter((y) => y.t >= lo && y.t < hi);
      return shotBalance(inside.map((y) => thumbs[Math.min(thumbs.length - 1, Math.round(y.t * this.fps))]), inside.map((y) => y.t), ANALYSIS_W, ANALYSIS_H, x.params);
    });
    this.targets = bal.map((x) => x?.target ?? null);
    if (this.track) this.track.curves = bal.map((x) => x?.curve ?? null);
    const tg = bal.map((x) => (x ? `${x.target[0].toFixed(3)},${x.target[1].toFixed(3)} samples ${x.samples.map((y) => `${y.t.toFixed(1)}s:${y.log[0].toFixed(2)}/${y.log[1].toFixed(2)}(${y.w.toFixed(1)})`).join(" ")} curve ${x.curve ? x.curve.t.map((t, k) => `${t.toFixed(1)}s:${x.curve!.r[k].toFixed(2)}/${x.curve!.b[k].toFixed(2)}`).join(" ") : "-"}` : "none")).join(" | ");
    return `${samples.length} samples → ${segs ? `${segs.length} segment(s) at ${segs.map((x) => x.from.toFixed(2)).join(", ")}` : "no lock"}; sample wb_r ${samples.map((x) => x.params.wb[0].toFixed(2)).join(" ")}; shot balance ${tg || "-"}`;
  }

  /** The locked estimate in force at `t` (with its shot's balance curve), or null when unlocked. */
  private lockedAt(t: number): GradeParams | null {
    return this.track ? this.track.paramsAt(t, !this.noFollow) : null;
  }
  private applyLock(p: GradeParams): GradeParams {
    const l = this.lockedAt(this.lastTick);
    return l ? lockParams(l, p, process.env.SIM_LOCKZ === "1") : p;
  }
  /** Experiment: re-express a packet's z map in the locked range normalisation. */
  private remapZ(fields: Float32Array, p: GradeParams): Float32Array {
    const l = this.lockedAt(this.lastTick);
    if (!l || process.env.SIM_LOCKZ !== "1") return fields;
    const rf = Math.max(0.02, p.zHi - p.zLo), rl = Math.max(0.02, l.zHi - l.zLo);
    for (let i = 0; i < fields.length; i += 4) fields[i] = Math.min(1.15, Math.max(0, (fields[i] * rf + p.zLo - l.zLo) / rl));
    return fields;
  }
  segmentIndex(): number {
    return this.track ? this.track.index(this.lastTick) : -1;
  }

  private analyse(f: number, thumbs: Uint8ClampedArray[]): Analysed {
    const a = this.analyzeFrame(f, thumbs);
    const p = a.params;
    this.paramLog.push([f, (f / this.fps).toFixed(3), "analysis", p.wb[0], p.wb[2], p.exposure, p.black, p.white, p.zLo, p.zHi, p.zMean, ...p.binf, p.calm ?? 0, p.calmTone ?? 0, p.haze, p.backdrop ?? 0].map((x) => (typeof x === "number" ? +x.toFixed(4) : x)).join(",") + "," + (this.current ? [this.current.wb[0], this.current.wb[2], this.current.exposure, this.current.zLo, this.current.zHi].map((x) => x.toFixed(4)).join(",") : ",,,,"));
    // The per-frame anchor columns went with the per-frame follow (left empty); the last two are the shot's balance offset in force.
    const off = this.track && !this.noFollow ? curveAt(this.track.curves[this.track.index(f / this.fps)], f / this.fps) : [0, 0];
    this.paramLog[this.paramLog.length - 1] += ",,,,,,,," + off.map((x) => x.toFixed(4)).join(",");
    return a;
  }

  private onPacket(a: Analysed, snap = false): void {
    const m = a.mean;
    const cut = this.lastMean !== null && Math.abs(this.lastMean[0] - m[0]) + Math.abs(this.lastMean[1] - m[1]) + Math.abs(this.lastMean[2] - m[2]) > SCENE_CUT_MEAN_DIFF;
    this.lastMean = m;
    if (cut) {
      this.cuts.push(this.lastTick);
      this.track?.noteCut(this.lastTick);
    }
    this.track?.noteFrame(m, this.lastTick);
    if (!this.current || cut || snap) {
      this.track?.advance(this.lastTick, true);
      this.snapTo(a);
    } else {
      this.target = this.applyLock(a.params);
      this.fieldsT = this.remapZ(fieldsRGBA(a.depth), a.params);
      this.guideT = guideRGBA(a.depth);
      this.claheT = a.clahe.data;
    }
  }

  private snapTo(a: Analysed): void {
    this.current = this.applyLock(a.params);
    this.target = this.current;
    this.fields = this.remapZ(fieldsRGBA(a.depth), a.params);
    this.guide = guideRGBA(a.depth);
    this.clahe = new Float32Array(a.clahe.data);
    this.mapW = a.depth.width;
    this.mapH = a.depth.height;
    this.claheShape = { tilesX: a.clahe.tilesX, tilesY: a.clahe.tilesY, bins: a.clahe.bins };
    this.fieldsT = this.guideT = this.claheT = null;
  }

  private tick(t: number): void {
    const dt = Math.max(0, Math.min(0.5, t - this.lastTick));
    this.lastTick = t;
    this.track?.advance(t);
    // The lock's globals are a function of the clip time: imposed, never eased (only the frame's own range and maps ease).
    if (this.current) this.current = this.applyLock(this.current);
    if (dt <= 0 || !this.current) return;
    if (this.target) this.current = this.applyLock(lerpParams(this.current, this.target, 1 - Math.exp(-dt / TAU_PARAMS_S)));
    const am = 1 - Math.exp(-dt / TAU_MAPS_S);
    const ac = 1 - Math.exp(-dt / TAU_CLAHE_S);
    const open = Math.min(1, Math.max(0, this.current.backdrop ?? 0));
    const aConf = am + (1 - Math.exp(-dt / TAU_CONF_OPEN_S) - am) * open;
    if (this.fields && this.fieldsT) for (let i = 0; i < this.fields.length; i++) this.fields[i] += (this.fieldsT[i] - this.fields[i]) * ((i & 3) === 1 ? aConf : am);
    if (this.guide && this.guideT) for (let i = 0; i < this.guide.length; i++) this.guide[i] += (this.guideT[i] - this.guide[i]) * am;
    if (this.clahe && this.claheT) for (let i = 0; i < this.clahe.length; i++) this.clahe[i] += (this.claheT[i] - this.clahe[i]) * ac;
  }

  /** Advances to frame `f` the way the app does for this mode. */
  step(f: number, thumbs: Uint8ClampedArray[]): void {
    const t = f / this.fps;
    const slot = analysisSlot(t);
    // Packets that land on this frame (preview: the worker reply arrives `latency` frames later).
    while (this.pending.length && this.pending[0].lands <= f) this.onPacket(this.pending.shift()!.a);
    if (this.mode === "export") {
      // engine.analyzeDue: one analysis per clip-time slot, awaited before the frame is drawn
      // (snapping on the first frame and inside a profiled cut window). No timing enters.
      const snap = f === 0 || (this.track ? this.track.inCutWindow(t) : false);
      if (snap || slot !== this.lastSlot) {
        this.lastSlot = slot;
        this.onPacket(this.analyse(f, thumbs), snap);
      }
      this.tick(t);
    } else {
      // Loading a clip grades its first frame with analyzeNow(true).
      if (f === 0) { this.onPacket(this.analyse(f, thumbs)); this.lastSlot = slot; }
      this.tick(t);
      // engine.tick: a new clip-time slot starts an analysis when the worker is free.
      if (this.pending.length === 0 && slot !== this.lastSlot) {
        this.lastSlot = slot;
        this.pending.push({ at: f, lands: f + this.latency, a: this.analyse(f, thumbs) });
      }
    }
  }

  state(): { params: GradeParams; depth: DepthMap; clahe: ClaheLuts; segment: number; /** A dissolve between two shots is in progress (lock-track.ts blending). */ blending: boolean } {
    const w = this.mapW, h = this.mapH;
    const guide3 = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { guide3[i * 3] = this.guide![i * 4]; guide3[i * 3 + 1] = this.guide![i * 4 + 1]; guide3[i * 3 + 2] = this.guide![i * 4 + 2]; }
    return {
      params: this.current!,
      depth: { width: w, height: h, fields: this.fields!, guide: guide3 },
      clahe: { ...this.claheShape!, data: this.clahe! },
      segment: this.segmentIndex(),
      blending: this.track ? this.track.blending(this.lastTick) : false,
    };
  }
}

function fieldsRGBA(d: DepthMap): Float32Array {
  return new Float32Array(d.fields);
}
function guideRGBA(d: DepthMap): Float32Array {
  const out = new Float32Array(d.width * d.height * 4);
  for (let i = 0; i < d.width * d.height; i++) { out[i * 4] = d.guide[i * 3]; out[i * 4 + 1] = d.guide[i * 3 + 1]; out[i * 4 + 2] = d.guide[i * 3 + 2]; }
  return out;
}
