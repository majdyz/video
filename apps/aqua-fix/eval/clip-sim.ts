// CPU replay of GradeEngine's temporal state machine (engine.ts) for the eval
// harness: clip profile + lock, analysis cadence, scene-cut snaps and the
// easing of params / maps. Kept deliberately close to engine.ts; Subject pop
// and person segmentation are off (their defaults for a clip without people).
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { inCutWindow, noteCut, segmentAt, type LockSegment } from "../src/engine/lock.ts";
import { analysisSlot, lockParams } from "../src/engine/lock.ts";
import { BalanceFollow, FOLLOW, sceneTrust, shotTarget } from "../src/engine/follow.ts";
// Tuning experiments: SIM_TAU / SIM_WINDOW override the follow's ease and median span.
if (process.env.SIM_TAU) FOLLOW.tau = parseFloat(process.env.SIM_TAU);
if (process.env.SIM_WINDOW) FOLLOW.window = parseInt(process.env.SIM_WINDOW);
import { anchorCorrection, type AnchorResult } from "../src/engine/anchor.ts";
import { profileTimes, segmentProfile, type ProfileSample } from "../src/engine/profile.ts";
import { lerpParams, type ClaheLuts, type DepthMap, type FrameAnalysis, type GradeParams, type Vec3 } from "../src/engine/params.ts";

export type SimMode = "export" | "preview" | "unlocked";
type Analysed = FrameAnalysis & { anchor: AnchorResult | null; sentLock: GradeParams | null };

const TAU_PARAMS_S = 0.6;
const TAU_MAPS_S = 0.4;
const TAU_CLAHE_S = 0.7;
const TAU_CONF_OPEN_S = 0.05;
const SCENE_CUT_MEAN_DIFF = 0.16;

export class ClipSim {
  locked: LockSegment[] | null = null;
  cutSeen = new Map<number, number>();
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
  follow = new BalanceFollow();
  /** Anchor target per locked segment (follow.ts shotTarget). */
  targets: ([number, number] | null)[] = [];
  lastPacketTick = 0;
  /** Ablations (options, else env): SIM_NOFOLLOW=1 drops the balance follow, SIM_SNAPSEG=1 snaps every segment switch (the old engine). */
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
    this.locked = segmentProfile(samples, SCENE_CUT_MEAN_DIFF);
    // Anchor targets per segment from the profile's own thumbnails (engine.requestTargets → worker shotTarget).
    const segs = this.locked;
    this.targets = !segs || this.noFollow ? [] : segs.map((s, i) => {
      const lo = i === 0 ? -Infinity : s.from, hi = i + 1 < segs.length ? segs[i + 1].from : Infinity;
      const px = samples.filter((x) => x.t >= lo && x.t < hi).map((x) => thumbs[Math.min(thumbs.length - 1, Math.round(x.t * this.fps))]);
      return shotTarget(px, ANALYSIS_W, ANALYSIS_H, s.params);
    });
    const tg = this.targets.map((t) => (t ? `${t[0].toFixed(3)},${t[1].toFixed(3)}` : "none")).join(" | ");
    return `${samples.length} samples → ${this.locked ? `${this.locked.length} segment(s) at ${this.locked.map((s) => s.from.toFixed(2)).join(", ")}` : "no lock"}; sample wb_r ${samples.map((s) => s.params.wb[0].toFixed(2)).join(" ")}; anchor targets ${tg || "-"}`;
  }

  private lockedAt(t: number): GradeParams | null {
    return this.locked ? segmentAt(this.locked, this.cutSeen, t).params : null;
  }
  private applyLock(p: GradeParams): GradeParams {
    const l = this.lockedAt(this.lastTick);
    if (!l) return p;
    const q = lockParams(l, p, process.env.SIM_LOCKZ === "1");
    return this.noFollow ? q : this.follow.apply(q);
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
    if (!this.locked) return -1;
    return this.locked.indexOf(segmentAt(this.locked, this.cutSeen, this.lastTick));
  }

  private analyse(f: number, thumbs: Uint8ClampedArray[]): Analysed {
    const a0 = this.analyzeFrame(f, thumbs);
    // The engine sends the lock in force with the request; the worker solves the anchor under it.
    const seg = this.locked ? segmentAt(this.locked, this.cutSeen, f / this.fps) : null;
    const target = seg ? this.targets[this.locked!.indexOf(seg)] ?? null : null;
    const l = seg && target ? seg.params : null;
    const a: Analysed = { ...a0, sentLock: l, anchor: l && target && !this.noFollow && sceneTrust(a0.params) > 0 ? anchorCorrection(thumbs[f], ANALYSIS_W, ANALYSIS_H, lockParams(l, a0.params), a0.depth, a0.clahe, target) : null };
    const p = a.params;
    this.paramLog.push([f, (f / this.fps).toFixed(3), "analysis", p.wb[0], p.wb[2], p.exposure, p.black, p.white, p.zLo, p.zHi, p.zMean, ...p.binf, p.calm ?? 0, p.calmTone ?? 0, p.haze, p.backdrop ?? 0].map((x) => (typeof x === "number" ? +x.toFixed(4) : x)).join(",") + "," + (this.current ? [this.current.wb[0], this.current.wb[2], this.current.exposure, this.current.zLo, this.current.zHi].map((x) => x.toFixed(4)).join(",") : ",,,,"));
    this.paramLog[this.paramLog.length - 1] += "," + (a.anchor ? [a.anchor.frac, ...a.anchor.log, ...a.anchor.before, ...a.anchor.after].map((x) => x.toFixed(4)).join(",") : ",,,,,,") + "," + this.follow.log.map((x) => x.toFixed(4)).join(",");
    return a;
  }

  private onPacket(a: Analysed): void {
    const m = a.mean;
    const cut = this.lastMean !== null && Math.abs(this.lastMean[0] - m[0]) + Math.abs(this.lastMean[1] - m[1]) + Math.abs(this.lastMean[2] - m[2]) > SCENE_CUT_MEAN_DIFF;
    this.lastMean = m;
    if (cut) {
      this.cuts.push(this.lastTick);
      if (this.locked) noteCut(this.locked, this.cutSeen, this.lastTick);
    }
    const l = this.lockedAt(this.lastTick);
    if (!this.current || cut) this.follow.reset();
    if (l) {
      let anchor = a.anchor;
      if (anchor && a.sentLock && a.sentLock !== l) anchor = { ...anchor, log: [anchor.log[0] + Math.log(a.sentLock.wb[0] / l.wb[0]), anchor.log[1] + Math.log(a.sentLock.wb[2] / l.wb[2])] };
      this.follow.update(anchor, a.params, this.current && !cut ? this.lastTick - this.lastPacketTick : 0);
    }
    this.lastPacketTick = this.lastTick;
    if (!this.current || cut) this.snapTo(a);
    else {
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
    const prev = this.lockedAt(this.lastTick);
    this.lastTick = t;
    const next = this.lockedAt(t);
    if (prev !== next && next && prev && this.current) {
      const seg = segmentAt(this.locked!, this.cutSeen, t);
      const fol = (q: GradeParams) => (this.noFollow ? q : this.follow.apply(q));
      if (!seg.window || this.cutSeen.has(this.locked!.indexOf(seg)) || this.snapSeg) {
        // A cut: snap the globals to the new estimate.
        this.current = fol(lockParams(next, this.current));
        if (this.target) this.target = fol(lockParams(next, this.target));
      } else {
        // Same shot, the profile just saw it change: ease over.
        this.follow.rebase(prev, next);
        const base = this.target ?? this.current;
        this.target = this.noFollow ? lockParams(next, base) : this.follow.apply(lockParams(next, base));
      }
    }
    if (dt <= 0 || !this.current) return;
    if (this.target) this.current = lerpParams(this.current, this.target, 1 - Math.exp(-dt / TAU_PARAMS_S));
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
      const snap = f === 0 || (this.locked ? inCutWindow(this.locked, this.cutSeen, t) : false);
      if (snap || slot !== this.lastSlot) {
        this.lastSlot = slot;
        const a = this.analyse(f, thumbs);
        this.onPacket(a);
        if (snap) this.snapTo(a);
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

  state(): { params: GradeParams; depth: DepthMap; clahe: ClaheLuts; segment: number } {
    const w = this.mapW, h = this.mapH;
    const guide3 = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { guide3[i * 3] = this.guide![i * 4]; guide3[i * 3 + 1] = this.guide![i * 4 + 1]; guide3[i * 3 + 2] = this.guide![i * 4 + 2]; }
    return {
      params: this.current!,
      depth: { width: w, height: h, fields: this.fields!, guide: guide3 },
      clahe: { ...this.claheShape!, data: this.clahe! },
      segment: this.segmentIndex(),
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
