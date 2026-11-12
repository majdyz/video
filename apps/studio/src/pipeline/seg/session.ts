// AI subject detection, background session (runs in seg-worker.ts, next to the model). It owns an independent
// decoder over the clip (openSampleReader: WebCodecs, never the playing <video>), the per-object keyframe masks and
// the per-frame fill, so the AI pass runs while the clip plays and the main thread only looks finished masks up.
//
// - The engine's own subjects ("autos") come in segments: the main thread seeds segment k on its canonical frame
//   (studio.ts seedSegment: the export range's start + k × SEG.segmentS, analysed alone), the session asks for the
//   next segment's seeds when its tracking reaches it and waits for them, so every run of the clip (preview or
//   export, started whenever) tracks the same objects. Autos are tracked forward through their segment in lockstep
//   (every auto due at a keyframe steps on one encode). At the next segment's start the autos step on its frame
//   first, then the start's seeds are asked for: an auto goes on under its id (its memory bank and all) unless a
//   seed took its place (the track had shrunk to a part of its subject, or run past it) or there is no room for it
//   (autoCap), and a seed on a subject that is followed already is let go (carryOver, seeds.ts assignSlots): the
//   same shark of a school is not followed twice, nor started over at every look. While something is followed the
//   next look comes SEG.topUpS later (an extra start), so a subject that swims in is picked up soon. The seeds are
//   the engine's animals plus what the model finds on the engine's other regions (autoSeeds: small subjects of a
//   school, which the engine does not tone and the model's blind grid passes between). A subject
//   first found after a stretch nothing was followed in (the start of the clip, a gap) is also followed backward
//   through that stretch, once its forward track is through (backList): it was in the picture before the look that
//   found it. On the lite model the first looks often find nothing (owner's ray clip: no mask for the first 6 s).
// - Taps (include, exclude) are tracked outward from their keyframe within SEG.reachS, ahead of the autos (the auto
//   pass stands still meanwhile): forward to the end of their reach first, then backward in chunks read in one
//   sequential decode each (readBack), with the intervals behind each step filled right away. Forward and backward
//   used to alternate, and every backward step tore the decoder down and opened it again at a key frame (twice: the
//   step, then its fill): on a phone that was the memory peak a tap crashed the page at.
// - Playhead first (focus): where the user is paused ahead of the pass, the subjects of that frame are followed for
//   a few keyframes right away ("peek" objects, on regular keyframes only), so the frame on screen has its masks
//   within seconds. They are provisional: dropped when the pass gets there (or ends), so the finished pass, and an
//   export, are the same as without them. The peek reaches SEG.peekBackS behind the playhead as well as SEG.peekS
//   ahead of it (the overlay's weight eases to nothing toward unfilled frames, studio-seg.ts frameWeight: a playhead
//   at the edge of the peek had a mask too weak to be popped), and with no subject from the engine it looks itself
//   with a short search (autoSeedsNow quick: the first find, centre first; the full 24-point one is the pass's).
// - Tracking uses the EdgeTAM memory tracker on a keyframe grid with the flow guard of the batch pass: SEG.fps (4) a
//   second, or, on the lite (phone) model, SEG.liteFps (2) with extra keyframes in between wherever the tracker and
//   the flow-carried mask disagree (adaptive: a calm clip costs half the model runs, a hard stretch what it did).
//   An object without a keyframe at another object's extra one comes in there carried along the flow between its
//   own two (union), so every object is in every keyframe's mask.
// - Intervals between keyframes are filled (track.ts fillInterval: per-frame flow both ways, guided filter on each
//   frame's luma) once both their keyframes are final, and every filled frame is posted as overlay-ready 8-bit maps
//   (feathered alpha, "near", excludes, water departure), run-length coded (a few KB a frame: a long clip stays
//   small). Keyframe masks are kept run-length coded too.
// - An exclude tap on an ML subject removes the subject when the tap's own mask is most of it (cleanly, restorable
//   for undo), else it is followed as an exclude object (only the tapped part comes out).
// - One model job at a time, in one loop (work): an exclude tap's own step, a tap's track, the model's own search for
//   a segment's seeds (autoSeeds), the playhead's peek, the auto pass, in that order of precedence. A tap pre-empts:
//   the pass stands still until it is followed through, a search under way stops at its next probe and starts over
//   after the tap, and one asked for meanwhile waits (it used to run between two of the tap's steps: the decoder
//   jumped to the segment's frame and back, two restarts, with the main thread analysing that frame next to it; an
//   iPhone's page died there, 12 Nov). Every job leaves a breadcrumb when it starts and when it ends, with its
//   number, so a crash log shows what was alive.
import type { EdgeTam } from "./edgetam.ts";
import { cellLab, nearMap, departFromCells, framePop, sdfFeather, area, bbox, centroid, guidedFilter, iou, promptFromMask, rleDecode, rleEncode, shiftMap, waterContrast } from "./mask.ts";
import { denseFlow, warp, type Gray } from "./flow.ts";
import { fillInterval, HOLD, keyTimes, lockStep, maskSize, newLock, remap, SEG, sigmoidResize, toU8, type Keyframe, type Lock, type SegObject } from "./track.ts";
import { assignSlots, edgeShare, overlap, SEEDS, topUpAt, type SeedCandidate } from "./seeds.ts";

/** Reads one frame (as a VideoFrame-like source) at clip time t; the session draws it on its own canvases. */
export type SessionFrames = {
  width: number;
  height: number;
  /** Clockwise degrees the coded frame turns to be upright. */
  rotation: number;
  /** The frame covering clip time t (the caller closes nothing: the source owns the frame until the next call). */
  at(t: number): Promise<CanvasImageSource & { displayWidth?: number }>;
  /** Times the decoder started over at a key frame (a read behind its position or far ahead), for the profile. */
  restarts?(): number;
  dispose(): void;
};

/** autoSeeds: the point grid and what counts as a subject. */
/** peekMax: the playhead's peek (SegSession.focus) follows at most this many subjects. */
/** areaSmall / smallContrast: a candidate between areaSmall and areaLo of the frame (one fish of a school: a
 * hammerhead 60 × 15 px on a 480-px frame is 0.2%) counts when it stands off the water around it by this much (CIE76
 * ΔE, mask.ts waterContrast: pale sharks in blue-green water and a far ray measure 3–6, plain water and haze under
 * 1). Smaller than areaSmall is a speck. */
/** max: the search hands over at most this many subjects (the lite model and phones follow SEG.liteAutos of them:
 * every subject is a tracker step per keyframe, about as long as the frame's own encode). */
/** blobIou: the model's own IoU estimate a mask prompted on one of the engine's regions needs (seeds.ts
 * blobCandidates). Far lower than the blind grid's `iou`: the region is evidence of its own that something is there,
 * and the lite model rates its masks of pale, far sharks 0.4–0.75 however good they are (owner's hammerhead clip:
 * every shark the grid did land on was refused at 0.8). What keeps the water out there is the size test, the region
 * (blobGrow) and the water test (smallContrast / RECHECK.contrast), not the estimate.
 * blobGrow: such a mask may be at most this many times its region's box (else it is something else's: the water). */
/** edge: a find whose mask lies along more than this share of one side of the frame is not started on: a subject
 * the frame cuts through (a diver's head and hair in a selfie shot, with the water above it in the mask), the
 * surface, the seabed. Its next look finds it once it is in the picture. */
export const AUTO = { cols: 4, rows: 6, liteCols: 3, liteRows: 4, iou: 0.8, blobIou: 0.35, blobGrow: 8, edge: 0.25, areaLo: 0.004, areaSmall: 0.0015, smallContrast: 2.5, areaHi: 0.3, span: 0.9, contrast: 0.05, max: 4, peekMax: 2 };

/** How far a mask's colour stands out from a ring around it (mean cell-colour distance; cells: cellLab, 3 per px). */
function ringContrast(m: Float32Array, cells: Float32Array, w: number, h: number): number {
  const n = w * h, ch = cells.length / n;
  if (ch < 3 || !Number.isInteger(ch)) return 1;
  const inner = new Float64Array(3), ring = new Float64Array(3);
  let ni = 0, nr = 0;
  const R = Math.max(2, Math.round(w / 40));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (m[i] > 0.5) { for (let c = 0; c < 3; c++) inner[c] += cells[i * ch + c]; ni++; continue; }
    let near = false;
    for (let d = 1; d <= R && !near; d++) {
      if ((x >= d && m[i - d] > 0.5) || (x + d < w && m[i + d] > 0.5) || (y >= d && m[i - d * w] > 0.5) || (y + d < h && m[i + d * w] > 0.5)) near = true;
    }
    if (near) { for (let c = 0; c < 3; c++) ring[c] += cells[i * ch + c]; nr++; }
  }
  if (!ni || !nr) return 0;
  return Math.hypot(inner[0] / ni - ring[0] / nr, inner[1] / ni - ring[1] / nr, inner[2] / ni - ring[2] / nr);
}

/**
 * The re-check of a locked track (SegSession.recheck; track.ts HOLD): the mask a fresh prompt gives is taken when it
 * is a subject (object score > 0) that stands off the water around it by at least `contrast` (CIE76 ΔE of the mean
 * cell colours, mask.ts waterContrast: a far ray in haze measures 4–6, plain water under 1), holds at least `cover`
 * of the tracker's own mask, is at least `gain` × its size and within HOLD.areaLo..areaHi of the locked size. `box`:
 * the prompt's box is the expected subject's, grown by this share of its size each side.
 */
export const RECHECK = { contrast: 2, cover: 0.5, gain: 1.25, box: 0.15 };

/** A track's last sure keyframe (per direction): its mask, where it was and how fast it moved (mask px a second). */
type SureRef = { m: Float32Array; t: number; x: number; y: number; vx: number; vy: number };

export type SessionObjectInfo = { id: number; kind: "include" | "exclude"; t: number };
/** One filled frame's maps, run-length coded (mask.ts rleEncode): alpha on the mask grid, the rest at quarter size. */
/** pop: the frame's subject / water contrast (mask.ts framePop; null: nothing to measure), for the clip's one
 * Subject pop direction (studio-seg.ts SegLive.pop). */
export type SessionFrameOut = { i: number; alpha: Uint8Array; nearQ: Uint8Array; excQ: Uint8Array | null; depQ: Uint8Array; pop?: number | null };
export type SessionProfile = Record<string, number>;
export type SessionEvents = {
  frames(items: SessionFrameOut[]): void;
  keys(conf: { t: number; conf: number }[]): void;
  /** taps: tapped objects still being followed (the main thread holds its own heavy work back meanwhile). */
  progress(done: number, total: number, taps: number): void;
  idle(profile: SessionProfile): void;
  /** A tapped include that came out as the background (the tap missed the animal): dropped. */
  rejected(id: number): void;
  /** The seeds of the segment starting at t are needed (k: its index right now, for the logs only): tracking waits
   * for session.seeds(t, ...). search: false when the model's own search (autoSeeds) is not worth it there (an
   * extra start after SEG.reacquireSearches empty ones in a row): the engine's subjects only. */
  needSeeds(k: number, t: number, search: boolean): void;
  /** A step, a fill or a queued tap threw (out of memory in the runtime, an unreadable frame): the session has
   * stopped for good and is closed; no idle follows. The main thread tells the user and shuts the worker down. */
  error?(msg: string): void;
  /** Breadcrumbs of the heavy steps (the main thread keeps them: a phone that kills the page leaves no log). */
  trace?(msg: string): void;
  /** The playhead's peek at keyframe k0 (focus): "looking" when it is taken up (the model's search, the first
   * steps), "following" once it has subjects to follow, "none" when it found nothing there. */
  peek?(k0: number, state: "looking" | "following" | "none"): void;
};

type ObjState = {
  o: SegObject & { id: number };
  /** An auto (segment seed or its carry-over): tracked forward in lockstep with the other autos. */
  auto: boolean;
  /** The segment an auto is in now (carry-over moves it on). */
  seg: number;
  /** A provisional object at the playhead (focus): regular keyframes only, never refined, in no log, dropped when
   * the pass gets there. */
  peek: boolean;
  /** After the prompted frame, the backward list first (a peek whose keyframe is just after the playhead). */
  backFirst: boolean;
  /** An auto the user took out (remove): still tracked, so the pass stays the same whenever the tap came (it goes
   * on deciding carry-overs as before), but in no mask. A removed tap just leaves (it affects no other object). */
  hidden: boolean;
  /** Keyframe time → probability (0..255) on the mask grid, run-length coded. */
  keys: Map<number, Uint8Array>;
  /** Keyframes whose mask is not empty (the confidence curve only counts those). */
  shown: Set<number>;
  conf: Map<number, number>;
  fwd: number[];
  bwd: number[];
  fi: number;
  bi: number;
  prevF: { m: Float32Array; luma: Float32Array } | null;
  prevB: { m: Float32Array; luma: Float32Array } | null;
  /** The last step disagreed with the flow-carried mask (SEG.adaptAgree), was re-prompted or ran away. */
  hard: boolean;
  /** Adaptive keyframes: steps this object still takes on the fine grid, forward / backward (taps; autos share one). */
  fineF: number;
  fineB: number;
  /** Hysteresis (track.ts lockStep), forward / backward, and the last sure keyframe of each (the re-check's prompt). */
  lockF: Lock;
  lockB: Lock;
  sureF: SureRef | null;
  sureB: SureRef | null;
  /** An auto's backward steps in a row that found nothing (its back-fill stops after a second of them). */
  emptyB: number;
  /** Keyframes in a row whose mask was a runaway (forward / backward), and whether a mask of this object was ever
   * kept in that direction: an object that is nothing but runaways is let go (stepObject). */
  ranF: number;
  ranB: number;
  keptF: boolean;
  keptB: boolean;
};

/** fps: keyframes a second, fixed (no adaptive extra ones unless `adapt` says so). Default: by the model (see header). */
/** autoCap: at most this many of the engine's own subjects are followed at a time (a phone, whatever the model). */
/** weak: a phone short of memory (device.ts isWeakDevice): fewer decoded frames kept (SEG.weakFrameCache), half the
 * flow-carried masks, one subject for the playhead's peek. The masks are the same (what is not kept is read again). */
export type SessionOptions = { fps?: number; adapt?: boolean; autoCap?: number; weak?: boolean };

/** A model job of the session (work): the breadcrumbs name them. */
export type JobKind = "exclude" | "tap" | "search" | "peek" | "pass";

/** Thrown inside a search a tap pre-empted (autoSeedsNow): it is started over after the tap. */
const PREEMPT = Symbol("pre-empted");

/** The memory bank's frame index of an object's n-th step in a direction (bank.ts: 5 apart, as the tracker was
 * measured; the offset keeps a backward track's indices positive). */
const bankFrame = (n: number, reverse: boolean) => 1e6 + (reverse ? -5 : 5) * n;

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

/** The decoded-frame cache's key for clip time t (0.1 ms steps: grid frames and keyframes that coincide share one). */
export const frameKey = (t: number) => Math.round(t * 1e4);

export class SegSession {
  readonly mw: number;
  readonly mh: number;
  readonly grid: { i0: number; n: number };
  /** Keyframes a second every object steps at. */
  readonly fps: number;
  /** Extra keyframes (twice as dense) where a step disagrees with the flow. */
  readonly adapt: boolean;
  /** The keyframes in use, in time order: the regular ones, plus prompts' and extra ones as they come (activate). */
  readonly keys: number[];
  /** The regular keyframes (fps a second, and the range's last). */
  private base: number[];
  /** Every time a keyframe can be at (2 × fps when adaptive): prompts snap to these, extra keyframes are these. */
  private fine: number[];
  private objs = new Map<number, ObjState>();
  private trash = new Map<number, ObjState>();
  private lumaCache = new Map<number, Uint8Array>();
  private cellCache = new Map<number, Float32Array>();
  /** Intervals to fill (again), by their first keyframe's time (an interval runs to the next keyframe in `keys`). */
  private dirty = new Set<number>();
  /** Intervals a remove / restore (a tap or its undo) changed: filled before the next tracker step, nearest first. */
  private urgent: number[] = [];
  /** Intervals filled at least once (activate: one split by a new keyframe is filled again as two). */
  private filledIv = new Set<number>();
  /** Adaptive keyframes: lockstep steps the autos still take on the fine grid. */
  private autoFine = 0;
  private carriedCache = new Map<string, { inc: Float32Array; exc: Float32Array | null }>();
  private small: OffscreenCanvas;
  private big: OffscreenCanvas;
  private running = false;
  private closed = false;
  /** Why the session stopped (run() threw); null while it is healthy. */
  failed: string | null = null;
  /**
   * Segment starts (keyframe times; segStarts[0] = the first seeds' frame). Everything about a segment is keyed by
   * its start TIME, never its index: reacquire() splices new starts in as tracking goes, which shifts every later
   * index, and a replay after a hibernation hands the seeds over before any tracking has happened.
   */
  private segStarts: number[] = [];
  /** Start times whose seeds tracking has taken. */
  private seeded = new Set<number>();
  /** Seeds handed over (by start time), held until tracking reaches their segment. */
  private given = new Map<number, (SegObject & { id: number })[]>();
  /** The start time whose seeds were asked for (NaN: none). */
  private asked = NaN;
  /** Steps done (for the progress). */
  private stepsDone = 0;
  private prof: SessionProfile = { decodeMs: 0, decodes: 0, guardMs: 0, fillMs: 0, filledFrames: 0, productMs: 0, frames: 0, waitSeedsMs: 0, extraKeys: 0, carried: 0, runMs: 0, held: 0, rechecks: 0, recovered: 0 };
  private waitSince = 0;

  private model: EdgeTam;
  private frames: SessionFrames;
  private ev: SessionEvents;
  private traced = 0;
  /** Decoded frames kept (luma + colour cells), flow-carried masks kept, subjects a peek follows (SessionOptions.weak). */
  private frameCap: number;
  private carriedCap: number;
  private peekCap: number;

  // ------------------------------------------------------------------ jobs

  /** The model job under way (null: none). One slot: a job starts only once the one before has ended. */
  private job: { id: number; kind: JobKind; what: string; steps: number; t0: number } | null = null;
  private jobSeq = 0;

  /** The loop takes up model work of this kind (what: the tap's id, the search's frame): a breadcrumb when it is
   * not what it was doing (the job before ends there, "paused": a tap or a search got in ahead of it). */
  private enter(kind: JobKind, what: string): void {
    const j = this.job;
    if (j && j.kind === kind && j.what === what) return;
    if (j) this.leave("paused");
    this.job = { id: ++this.jobSeq, kind, what, steps: this.stepsDone, t0: performance.now() };
    this.ev.trace?.(`job ${this.job.id} ${kind}${what ? ` ${what}` : ""} start`);
  }

  /** The job under way has ended (how: done, followed, paused, pre-empted, waiting for seeds, failed, closed). */
  private leave(how = "done"): void {
    const j = this.job;
    if (!j) return;
    this.job = null;
    const banks = (this.model as { bankCount?: number }).bankCount;
    this.ev.trace?.(`job ${j.id} ${j.kind}${j.what ? ` ${j.what}` : ""} end: ${how}, ${this.stepsDone - j.steps} steps, ${((performance.now() - j.t0) / 1000).toFixed(1)}s${banks !== undefined ? `, ${banks} banks` : ""}`);
  }

  /** A tap is waiting (an exclude tap's own step, a tapped object with steps left): the model is the tap's next. */
  private tapWaiting(): boolean {
    return this.ops.length > 0 || this.tapsLeft() > 0;
  }

  constructor(model: EdgeTam, frames: SessionFrames, span: { start: number; end: number }, ev: SessionEvents, opts: SessionOptions = {}) {
    this.model = model;
    this.frames = frames;
    this.ev = ev;
    [this.mw, this.mh] = maskSize(frames.width, frames.height);
    const i0 = Math.ceil(span.start * SEG.sampleHz - 1e-6), i1 = Math.floor(span.end * SEG.sampleHz + 1e-6);
    this.grid = { i0, n: Math.max(0, i1 - i0 + 1) };
    const fixed = !!opts.fps && opts.fps > 0;
    this.fps = fixed ? opts.fps! : model.lite ? SEG.liteFps : SEG.fps;
    this.adapt = opts.adapt ?? (!fixed && !!model.lite);
    this.autoCap = opts.autoCap && opts.autoCap > 0 ? opts.autoCap : model.lite ? SEG.liteAutos : SEG.fullAutos;
    this.frameCap = opts.weak ? SEG.weakFrameCache : SEG.frameCache;
    this.carriedCap = opts.weak ? 4 : 8;
    this.peekCap = opts.weak ? 1 : AUTO.peekMax;
    this.fine = keyTimes(span.start, span.end, [], this.adapt ? 2 * this.fps : this.fps);
    const base = keyTimes(span.start, span.end, [], this.fps), last = this.fine[this.fine.length - 1];
    this.base = last !== undefined && base[base.length - 1] !== last ? [...base, last] : base;
    this.keys = this.base.slice();
    this.small = new OffscreenCanvas(this.mw, this.mh);
    this.big = new OffscreenCanvas(1024, 1024);
  }

  /** The keyframe time nearest to t (prompts snap to it). */
  snap(t: number): number {
    let b = this.fine[0] ?? t;
    for (const k of this.fine) if (Math.abs(k - t) < Math.abs(b - t)) b = k;
    return b;
  }

  /** Puts keyframe time t (one of `fine`) in use. An interval it splits that was filled as one is filled again. */
  private activate(t: number): void {
    const K = this.keys;
    let i = K.length;
    while (i > 0 && K[i - 1] > t) i--;
    if (i > 0 && K[i - 1] === t) return;
    K.splice(i, 0, t);
    const a = K[i - 1];
    if (a !== undefined && (this.dirty.has(a) || this.filledIv.has(a))) { this.dirty.add(a); this.dirty.add(t); }
  }

  /** The keyframes an object steps at between lo and hi: the regular ones, and `extra` (its prompt, a segment's ends). */
  private stepsBetween(lo: number, hi: number, extra: number[]): number[] {
    return [...new Set([...this.base, ...extra])].filter((k) => k >= lo - 1e-6 && k <= hi + 1e-6).sort((a, b) => a - b);
  }

  /**
   * An object stepped at keyframe t, coming from its keyframe `from` (the one it stepped at before in that direction;
   * none: its first). The intervals either side of t changed, and so did those around every keyframe in use between
   * the two (another object's: this object is now carried to them, union). Returns the intervals marked.
   */
  private touch(t: number, from: number = t): number[] {
    const lo = Math.min(t, from), hi = Math.max(t, from), out: number[] = [];
    this.keys.forEach((k, i) => {
      if (k < lo - 1e-6 || k > hi + 1e-6 || (k === from && k !== t)) return;
      if (i > 0) out.push(this.keys[i - 1]);
      out.push(k);
    });
    for (const k of out) this.dirty.add(k);
    return out;
  }

  private newObj(o: SegObject & { id: number }, auto: boolean, seg: number, hidden: boolean, fwd: number[], bwd: number[]): ObjState {
    return { o, auto, seg, hidden, peek: false, backFirst: false, keys: new Map(), shown: new Set(), conf: new Map(), fi: 0, bi: 0, prevF: null, prevB: null, fwd, bwd, hard: false, fineF: 0, fineB: 0, lockF: newLock(), lockB: newLock(), sureF: null, sureB: null, emptyB: 0, ranF: 0, ranB: 0, keptF: false, keptB: false };
  }

  /** Canonical frame of segment k (k = 0: the first seeds' frame; then every SEG.segmentS, snapped). */
  segmentStart(k: number): number | null {
    return this.segStarts[k] ?? null;
  }

  /** A tap's object (include / exclude): tracked both ways within SEG.reachS, ahead of the autos. */
  add(o: SegObject & { id: number }): void {
    const t = this.snap(o.t), reach = SEG.reachS;
    this.activate(t);
    const near = this.stepsBetween(t - reach, t + reach, [t]);
    const s = this.newObj({ ...o, t }, false, -1, false, near.filter((k) => k >= t - 1e-6), near.filter((k) => k <= t + 1e-6).reverse());
    this.objs.set(o.id, s);
    // The breadcrumbs start over with every tap (they stop after the first few encodes): a page that dies while a
    // tap is followed leaves the stage and the heap it died at.
    this.traced = 0;
    this.backTraced = 0;
    this.ev.trace?.(`tap ${o.id} ${o.kind} ${t.toFixed(2)}s: ${s.fwd.length} fwd, ${s.bwd.length} back`);
    void this.run();
  }

  // ------------------------------------------------------------------ playhead first

  /** A request to look at the playhead (focus), taken up between two steps. */
  private peekReq: { t: number; k0: number; objs: SegObject[]; search: boolean } | null = null;
  /** The regular keyframe the last peek was made at (NaN: none yet) and its earliest keyframe. */
  private peekKey = NaN;
  private peekFrom = Infinity;
  private peekIds = -1;

  /** Where the auto pass stands: the next keyframe an auto steps at, else the next segment start still to seed
   * (Infinity: the pass is through). */
  private front(): number {
    let f = Infinity;
    // (An auto's forward steps: its back-fill of an earlier gap, after them, is not where the pass stands.)
    for (const s of this.objs.values()) if (s.auto && s.fi < s.fwd.length && s.fwd[s.fi] < f) f = s.fwd[s.fi];
    if (f === Infinity) for (const s of this.segStarts) if (!this.seeded.has(s)) { f = s; break; }
    return f;
  }

  /**
   * The user is paused at clip time t, ahead of the pass: `objs` (the engine's subjects on that frame; none and
   * `search`: the model looks itself) are followed from the regular keyframe nearest t for SEG.peekS, ahead of the
   * autos, so that frame has its masks after a step or two instead of when the pass gets there. One place at a time
   * (a new one replaces the last). The objects are provisional (see the header): on regular keyframes only (they add
   * none of their own, so the pass's intervals are what they would be), dropped when the pass reaches them or ends.
   * False: nothing to do (the pass is there, or about to be: within SEG.peekSkipS; or that keyframe was looked at).
   */
  focus(t: number, objs: SegObject[], search = false): boolean {
    if (this.closed || !this.segStarts.length || !this.base.length) return false;
    const k0 = this.peekKeyOf(t);
    if (k0 === this.peekKey || k0 === this.peekReq?.k0 || !(k0 > this.front() + SEG.peekSkipS)) return false;
    this.peekReq = { t, k0, objs, search };
    void this.run();
    return true;
  }

  /** The regular keyframe a look at clip time t is made at (the nearest). */
  peekKeyOf(t: number): number {
    let k0 = this.base[0] ?? t;
    for (const k of this.base) if (Math.abs(k - t) < Math.abs(k0 - t)) k0 = k;
    return k0;
  }

  private async startPeek(): Promise<void> {
    const r = this.peekReq!;
    this.peekReq = null;
    if (!(r.k0 > this.front() + SEG.peekSkipS)) return;
    this.dropPeek();
    this.peekKey = r.k0;
    this.enter("peek", `${r.k0.toFixed(2)}s`);
    this.ev.peek?.(r.k0, "looking");
    let objs = r.objs;
    if (!objs.length && r.search) {
      try {
        // The short search (the first find, centre first): the full one is ~25 decoder runs before the first step,
        // half a minute on a phone or on WASM, and these objects are provisional anyway.
        objs = await this.autoSeedsNow(r.k0, true);
      } catch (e) {
        if (e !== PREEMPT) throw e;
        // A tap came in during the search: the look is taken up again after it (unless another place was asked for).
        this.peekReq ??= r;
        this.peekKey = NaN;
        this.leave("pre-empted");
        return;
      }
      // The model holds that frame's features: the peek's first step runs on them.
      this.lastEncoded = r.k0;
    }
    const i = this.base.indexOf(r.k0);
    const fwd = this.base.filter((k) => k >= r.k0 - 1e-6 && k <= r.k0 + SEG.peekS + 1e-6);
    // Backward first, to the regular keyframe at or before the playhead less SEG.peekBackS: the playhead's interval
    // gets both its ends (a keyframe just after the playhead), and the frames filled reach far enough behind the
    // playhead for its mask to count in full (the overlay's weight eases to nothing over 0.3 s toward unfilled
    // frames: a playhead just after its keyframe had a mask under the pop's threshold, "Finding subjects" for good).
    // Never back to where the pass is about to be.
    const lo = Math.max(r.t - SEG.peekBackS, this.front() + SEG.peekSkipS);
    const bwd = [r.k0];
    for (let j = i - 1; j >= 0 && bwd[bwd.length - 1] > lo + 1e-6 && this.base[j] > this.front() + 1e-6; j--) bwd.push(this.base[j]);
    const back = bwd.length > 1;
    this.peekFrom = bwd[bwd.length - 1];
    for (const o of objs.slice(0, Math.min(this.autoCap, this.peekCap))) {
      if (o.kind !== "include") continue;
      const s = this.newObj({ ...o, t: r.k0, id: this.peekIds-- }, false, -1, false, fwd.slice(), back ? bwd.slice() : []);
      s.peek = true;
      s.backFirst = back;
      this.objs.set(s.o.id, s);
    }
    const any = [...this.objs.values()].some((s) => s.peek);
    this.ev.peek?.(r.k0, any ? "following" : "none");
    if (!any) this.leave("nothing to follow");
  }

  /** Drops the peek objects; the intervals they were in are filled again without them (by the pass as it comes). */
  private dropPeek(): boolean {
    let any = false;
    for (const s of [...this.objs.values()]) {
      if (!s.peek) continue;
      any = true;
      this.objs.delete(s.o.id);
      this.model.drop(`${s.o.id}f`);
      this.model.drop(`${s.o.id}b`);
      const ts = [...s.keys.keys()];
      if (!ts.length) continue;
      const lo = this.keys.indexOf(Math.min(...ts)), hi = this.keys.indexOf(Math.max(...ts));
      for (let k = Math.max(0, lo - 1); k <= hi; k++) this.dirty.add(this.keys[k]);
    }
    this.peekFrom = Infinity;
    return any;
  }

  /**
   * The seeds of the segment starting at t (the engine's own subjects on its canonical frame; may be none). The
   * first seeds also fix the segment grid: their frame, then every SEG.segmentS to the end of the clip. The seeds
   * are held and taken when tracking reaches their segment (takeSeeds), so they may arrive in any order and ahead
   * of time (a replay hands them all over at once) and the pass is the same.
   */
  seeds(t: number, objs: (SegObject & { id: number })[]): void {
    if (this.closed) return;
    const t0 = this.snap(t);
    if (!this.segStarts.length) {
      const end = this.base[this.base.length - 1] ?? t0;
      for (let s = t0; s <= end + 1e-6; s += SEG.segmentS) this.segStarts.push(this.snap(s));
      this.segStarts = this.segStarts.filter((s, i, a) => i === 0 || s > a[i - 1] + 1e-6);
      for (const s of this.segStarts) this.activate(s);
    }
    if (this.seeded.has(t0) || this.given.has(t0)) return;
    this.given.set(t0, objs);
    void this.run();
  }

  /** Tracking has reached segment k: its seeds, if they were handed over, become objects. False: not here yet. */
  private takeSeeds(k: number): boolean {
    const t0 = this.segStarts[k], objs = this.given.get(t0);
    if (!objs) return false;
    this.given.delete(t0);
    this.seeded.add(t0);
    if (this.waitSince) { this.prof.waitSeedsMs += performance.now() - this.waitSince; this.waitSince = 0; }
    const t1 = this.segStarts[k + 1] ?? this.base[this.base.length - 1];
    const span = this.stepsBetween(t0, t1, [t0, t1]);
    // The seeds come most important first (the engine's largest animals, the model's best finds): the lite model
    // takes the first SEG.liteAutos.
    // (Before they are made: the stretch behind them nothing was followed in.)
    const back = this.backList(t0);
    for (const o of objs.slice(0, this.autoCap)) this.objs.set(o.id, this.newObj({ ...o, t: t0 }, true, k, this.gone.delete(o.id), span.slice(), o.kind === "include" && back.length > 1 ? back.slice() : []));
    if (objs.length && back.length > 1) {
      this.ev.trace?.(`back-fill ${back[back.length - 1].toFixed(2)}-${t0.toFixed(2)}s`);
      console.info(`[seg] back-fill: the subject(s) found at ${t0.toFixed(2)} s are followed back to ${back[back.length - 1].toFixed(2)} s (${back.length - 1} keyframes), after their forward track`);
    }
    // Seeds, and subjects that stepped on this frame ahead of the look (the loop): who goes on is decided once the
    // seeds have their first mask (carryOver), which comes next.
    if (objs.length) { this.emptyRun = 0; if (this.endedAt(t0).length) this.settling = t0; }
    // No seeds: decided now.
    else if (this.endedAt(t0).length) {
      this.carryOver(t0);
      this.refineAutos(t0, this.dueHard);
      this.dueHard = false;
    }
    // Nothing seeded and nothing tracked into this segment: look again a little later (re-acquire).
    else if (![...this.objs.values()].some((s) => s.auto && this.nextOf(s) !== null)) { this.emptyRun++; this.reacquire(k); }
    return true;
  }

  /**
   * The keyframes a subject first seen at segment start t0 is followed backward over (t0 first, then earlier): the
   * stretch before t0 in which no subject was shown, back to the last keyframe one was (not included), the start of
   * the range, or SEG.reachS. Just [t0] (or nothing) when a subject was shown right up to t0. The seeds of a look
   * are on screen before the look: without this the frames from the start of the clip (or from where the last
   * subject was lost) to the first look that finds something had no mask at all.
   */
  private backList(t0: number): number[] {
    let lo = -Infinity;
    for (const s of this.objs.values()) {
      if (s.o.kind !== "include" || s.peek) continue;
      for (const k of s.shown) if (k < t0 - 1e-6 && k > lo) lo = k;
    }
    return this.stepsBetween(Math.max(lo, t0 - SEG.reachS), t0, [t0]).filter((k) => k > lo + 1e-6).reverse();
  }

  /** The segment start whose seeds have still to take their first step before its carry-over is decided (NaN: none). */
  private settling = NaN;
  /** A step of the subjects followed up to a segment start, on its frame, was a hard one (refineAutos, once the start is settled). */
  private dueHard = false;
  /** Segment starts whose carry-over is decided (carryOver: once each). */
  private carriedAt = new Set<number>();

  /** The engine's own subjects of earlier segments whose forward track has ended on segment start t (they stepped on
   * it): carryOver decides which go on. */
  private endedAt(t: number): ObjState[] {
    const k = this.segStarts.findIndex((s) => Math.abs(s - t) < 1e-6);
    return [...this.objs.values()].filter((s) => s.auto && s.seg < k && s.fwd.length > 0 && s.fi >= s.fwd.length && Math.abs(s.fwd[s.fwd.length - 1] - t) < 1e-6);
  }

  /** The next unseeded segment start, when subjects followed up to it have stepped on it and wait for its seeds. */
  private pendingStart(): number | null {
    const k = this.segStarts.findIndex((s) => !this.seeded.has(s));
    return k >= 0 && this.endedAt(this.segStarts[k]).length ? k : null;
  }

  /** How many of the engine's own subjects are followed at a time (SEG.liteAutos on the lite model and on a phone:
   * every one is a tracker step, and its memory, per keyframe). */
  readonly autoCap: number;

  /** Segment starts in a row that found no subject (takeSeeds). */
  private emptyRun = 0;
  /** Extra starts (reacquire) that ask for the engine's subjects only (SEG.reacquireSearches). */
  private noSearch = new Set<number>();

  /**
   * Segment k has no subject: a new segment start a little later (canonical: a function of the grid and of what the
   * starts before found), so the main thread looks for subjects again before the next regular start. The wait
   * doubles with every empty start in a row (SEG.reacquireS, up to SEG.segmentS): a clip with nothing to follow was
   * looked through every 2 s, each look a seek, an analysis and the model's 12-point search.
   */
  private reacquire(k: number): number | null {
    // (Not within a second of the next start, or of the range's end: nothing is left to follow from there.)
    const wait = Math.min(SEG.reacquireMaxS, SEG.reacquireS * 2 ** Math.max(0, this.emptyRun - 1));
    return this.addStart(k, this.segStarts[k] + wait, this.emptyRun < SEG.reacquireSearches);
  }

  /** A segment start at r0 (snapped to a keyframe) after segment k's, when it lies between that and the next one
   * (not within a second of it, or of the range's end). search: false = without the model's grid search there. */
  private addStart(k: number, r0: number, search: boolean): number | null {
    const t = this.segStarts[k], next = this.segStarts[k + 1] ?? this.base[this.base.length - 1] ?? Infinity;
    const r = this.snap(r0);
    if (!(r > t + 1e-6 && r < next - SEG.reacquireS / 2)) return null;
    this.segStarts.splice(k + 1, 0, r);
    this.activate(r);
    if (!search) this.noSearch.add(r);
    return r;
  }

  /** Ids removed before their object exists (a replay removes an auto whose seeds are still held): hidden on arrival. */
  private gone = new Set<number>();

  /**
   * Takes an object out of the masks (restorable); every interval it touched is filled again. A tap's object
   * leaves the session; an auto stays and is tracked on, hidden (ObjState.hidden), so the result does not depend on
   * when in the pass it was removed: a replay that removes it before anything is tracked gives the same masks.
   */
  remove(id: number): void {
    const s = this.objs.get(id);
    if (!s) { if (!this.trash.has(id)) this.gone.add(id); return; }
    if (s.auto) {
      if (s.hidden) return;
      s.hidden = true;
    } else {
      this.objs.delete(id);
      this.trash.set(id, s);
    }
    this.markObject(s);
    void this.run();
  }

  restore(id: number): void {
    this.gone.delete(id);
    const h = this.objs.get(id);
    if (h) {
      if (!h.hidden) return;
      h.hidden = false;
      this.markObject(h);
      void this.run();
      return;
    }
    const s = this.trash.get(id);
    if (!s) return;
    this.trash.delete(id);
    this.objs.set(id, s);
    this.markObject(s);
    void this.run();
  }

  private key(s: ObjState, t: number): Uint8Array | null {
    const r = s.keys.get(t);
    return r ? rleDecode(r, this.mw * this.mh) : null;
  }

  /** The include object whose mask covers (u, v) at its keyframe nearest t (within a keyframe step), if any, and
   * that keyframe (objects do not all have the same ones: an extra keyframe is one object's). */
  objectAt(t: number, u: number, v: number): { s: ObjState; k: number } | null {
    const x = Math.min(this.mw - 1, Math.floor(u * this.mw)), y = Math.min(this.mh - 1, Math.floor(v * this.mh));
    let best: { s: ObjState; k: number } | null = null, bp = 127;
    for (const s of this.objs.values()) {
      // (Not a peek: it is in no log, and gone when the pass gets there. A tap on it becomes an exclude object.)
      if (s.o.kind !== "include" || s.hidden || s.peek) continue;
      let k = NaN;
      for (const kt of s.keys.keys()) if (!(Math.abs(kt - t) >= Math.abs(k - t))) k = kt;
      if (!(Math.abs(k - t) <= 1 / this.fps + 1e-6)) continue;
      const m = this.key(s, k);
      if (m && m[y * this.mw + x] > bp) { bp = m[y * this.mw + x]; best = { s, k }; }
    }
    return best;
  }

  /**
   * An exclude tap at (t, u, v): the tap's own mask (one prompted frame) against the ML subject under the finger.
   * Most of that subject → the subject is removed whole ("removed"); otherwise only the tapped part is followed
   * as an exclude ("part"). Nothing of the ML under the finger → a plain exclude object ("exclude").
   */
  excludeAt(id: number, t: number, u: number, v: number): Promise<{ action: "removed"; removed: number } | { action: "part" | "exclude" }> {
    // Runs between two tracker steps (the model is not re-entrant).
    return this.queue(`${id}`, () => this.excludeNow(id, t, u, v));
  }

  /** Exclude taps' own steps, in order: ahead of everything else (a tap). */
  private ops: { what: string; run: () => Promise<void>; fail: (e: Error) => void }[] = [];
  /** The model's own searches asked for (autoSeeds), in order: they wait for the taps. run resolves to how it ended,
   * null when a tap pre-empted it (it stays first in line and starts over). */
  private searches: { what: string; run: () => Promise<string | null>; fail: (e: Error) => void }[] = [];

  /** Runs fn between two tracker steps (the model is not re-entrant). Its failure fails the session (run's catch). */
  private queue<T>(what: string, fn: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error(this.failed ?? "session closed"));
    return new Promise<T>((resolve, reject) => {
      this.ops.push({ what, run: async () => { try { resolve(await fn()); } catch (e) { reject(e); throw e; } }, fail: reject });
      void this.run();
    });
  }

  private async excludeNow(id: number, t: number, u: number, v: number): Promise<{ action: "removed"; removed: number } | { action: "part" | "exclude" }> {
    const hit = this.objectAt(t, u, v);
    if (!hit) {
      this.add({ id, kind: "exclude", t, prompt: { points: [[u, v]], labels: [1] } });
      return { action: "exclude" };
    }
    // The tap's mask on the frame it was made on, against the subject's at its own keyframe nearest to it.
    const o = hit.s;
    const m = await this.oneShot(this.snap(t), [[u, v]]);
    const om = this.key(o, hit.k)!;
    let inter = 0, oa = 0;
    for (let i = 0; i < om.length; i++) { const a = om[i] > 127; if (a) { oa++; if (m[i] > 0.5) inter++; } }
    if (oa && inter / oa >= 0.5) {
      this.remove(o.o.id);
      return { action: "removed", removed: o.o.id };
    }
    this.add({ id, kind: "exclude", t, prompt: { points: [[u, v]], labels: [1] } });
    return { action: "part" };
  }

  /** Work left (a step, a fill, a queued tap, or seeds asked for): the export waits until this is false. */
  get busy(): boolean {
    return this.running || this.waiting;
  }

  /** Waiting for the main thread's seeds of the segment starting at `asked`. */
  private get waiting(): boolean {
    return !Number.isNaN(this.asked) && !this.seeded.has(this.asked) && !this.given.has(this.asked);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const op of [...this.ops.splice(0), ...this.searches.splice(0)]) op.fail(new Error("session closed"));
    this.frames.dispose();
  }

  // ------------------------------------------------------------------ frames

  private async pixels(t: number, need1024: boolean): Promise<{ luma: Float32Array; rgba1024?: Uint8ClampedArray }> {
    // By the frame's own time, not its slot on the 30 Hz fill grid: at 4 keyframes a second every other keyframe
    // (0.25 s, 0.75 s: "frame 7.5") lies between two grid frames, and rounded to a slot it shared the next grid
    // frame's entry. Whichever was read first then stood in for the other: a mask one frame stale twice a second,
    // and a refill (after a tap or an undo) that differed from the first fill with the cache's order.
    const i = frameKey(t);
    const hit = this.lumaCache.get(i);
    if (hit && !need1024) return { luma: Float32Array.from(hit, (x) => x / 255) };
    const t0 = performance.now();
    const src = await this.frames.at(t);
    const draw = (c: OffscreenCanvas) => {
      const g = c.getContext("2d", { willReadFrequently: true })!;
      const W = c.width, H = c.height, r = ((this.frames.rotation % 360) + 360) % 360;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (r === 90) { g.translate(W, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0, H, W); }
      else if (r === 180) { g.translate(W, H); g.rotate(Math.PI); g.drawImage(src, 0, 0, W, H); }
      else if (r === 270) { g.translate(0, H); g.rotate(-Math.PI / 2); g.drawImage(src, 0, 0, H, W); }
      else g.drawImage(src, 0, 0, W, H);
      return g.getImageData(0, 0, W, H).data;
    };
    const s = draw(this.small);
    const luma = new Uint8Array(this.mw * this.mh);
    for (let k = 0; k < luma.length; k++) luma[k] = Math.round(0.299 * s[k * 4] + 0.587 * s[k * 4 + 1] + 0.114 * s[k * 4 + 2]);
    // (Read again for the model's input: it is the newest entry again, not the next to go.)
    this.lumaCache.delete(i);
    this.lumaCache.set(i, luma);
    this.cellCache.delete(i);
    this.cellCache.set(i, cellLab(s, this.mw, this.mh));
    // A bounded cache (~70 KB a frame): the oldest frames go first, a refill decodes them again.
    while (this.lumaCache.size > this.frameCap) { const first = this.lumaCache.keys().next().value!; this.lumaCache.delete(first); this.cellCache.delete(first); }
    const big = need1024 ? draw(this.big) : undefined;
    this.prof.decodeMs += performance.now() - t0;
    this.prof.decodes++;
    return { luma: Float32Array.from(luma, (x) => x / 255), rgba1024: big };
  }

  /**
   * A forward step from keyframe `from` to t: the grid frames in between are read on the way (luma and colour cells
   * into the cache, in time order). The decoder used to skip them, and the fill of that stretch, which runs right
   * after the step, asked for them behind its position: a restart at the key frame before and the whole run decoded
   * again, at every keyframe.
   */
  private async readAhead(from: number, t: number): Promise<void> {
    const hz = SEG.sampleHz, i1 = this.grid.i0 + this.grid.n;
    for (let i = Math.max(this.grid.i0, Math.ceil(from * hz - 1e-6)); i < i1 && i / hz < t - 1e-6; i++) {
      if (!this.lumaCache.has(frameKey(i / hz))) await this.pixels(i / hz, false);
    }
  }

  /** A single prompted frame on a throwaway bank (the exclude tap's own mask). */
  private async oneShot(k: number, pts: [number, number][]): Promise<Float32Array> {
    const { rgba1024 } = await this.pixels(k, true);
    await this.model.encode(rgba1024!);
    const r = await this.model.step("oneshot", bankFrame(0, false), pts.map(([u, v]) => [u * 1024, v * 1024]), pts.map(() => 1), false);
    this.model.drop("oneshot");
    this.lastEncoded = NaN;
    return sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
  }

  /**
   * Subjects on frame t found by the model itself, for a segment the engine found none in (it only looks in open
   * blue water: a manta over a reef got nothing, and the AI then had nothing to follow). A grid of single points,
   * each decoded alone (no memory); a candidate is an object (object score > 0, the model's own IoU estimate over
   * AUTO.iou), neither speck nor background (AUTO.areaLo..Hi of the frame, not spanning it), and stands out from the
   * ring around it (AUTO.contrast in Oklab-ish cell colour). Duplicates merge; the best AUTO.max become prompts.
   * Deterministic for the frame (same seeds whenever and wherever the clip is seeded).
   *
   * `regions`: the engine's own regions of that frame (seeds.ts blobCandidates: everything that departs from the
   * water, most promising first) are asked first, each with its own points: a school of small, pale sharks lies
   * between the grid's points, and the engine sees every one of them. A region counts when the model sees an object
   * there (blobIou), of a subject's size, about where the region is (blobGrow), not along the frame's edge, and off
   * the water around it (the water test: a region of plain water is refused). The grid is only gone through when no
   * region is a subject, and `grid` says so (false: the engine's own seeds cover the frame, or the look is an extra
   * one). Finds that are followed already (the subjects' masks on this frame: seeds.ts assignSlots) are left out,
   * as are those there is no room for.
   */
  autoSeeds(t: number, regions: readonly SeedCandidate[] | null = null, grid = true): Promise<SegObject[]> {
    if (this.closed) return Promise.reject(new Error(this.failed ?? "session closed"));
    // Not between two steps of a tap, as it used to (see the header): after the taps, and a tap that comes while it
    // runs stops it (it starts over after the tap; the same frame gives the same seeds).
    return new Promise<SegObject[]>((resolve, reject) => {
      this.searches.push({
        what: `${this.snap(t).toFixed(2)}s`,
        run: async () => {
          try {
            const out = await this.autoSeedsNow(t, false, regions, grid);
            resolve(out);
            return `${out.length} found`;
          } catch (e) {
            if (e === PREEMPT) return null;
            reject(e);
            throw e;
          }
        },
        fail: reject,
      });
      void this.run();
    });
  }

  /**
   * Throws PREEMPT when a tap is waiting (checked before the frame is encoded and before every probe). quick (the
   * playhead's peek): the points nearest the centre first, and the first candidate ends the search (a few decoder
   * runs instead of every point's); not for a segment's seeds, which must be the same whenever they are made.
   */
  private async autoSeedsNow(t0: number, quick = false, regions: readonly SeedCandidate[] | null = null, grid = true): Promise<SegObject[]> {
    const t = this.snap(t0), A = AUTO, { mw: w, mh: h } = this, N = w * h;
    if (this.tapWaiting()) throw PREEMPT;
    // The model may hold this very frame already (at a segment start the subjects followed so far have just stepped
    // on it: the loop): it is not encoded a second time.
    const need = t !== this.lastEncoded;
    this.ev.trace?.("auto: decode");
    const { rgba1024 } = await this.pixels(t, need);
    const cells = this.cellCache.get(frameKey(t));
    if (this.tapWaiting()) throw PREEMPT;
    if (need) {
      this.ev.trace?.("auto: encode");
      await this.model.encode(rgba1024!);
    }
    this.ev.trace?.("auto: encoded; probing");
    // The model holds this frame's features from here on (a probe reads them and leaves them): the first step of the
    // seeds this search finds, on this same frame, runs on them. It used to encode the frame a second time (seconds
    // on a phone or on WASM, right when the pass could at last begin).
    this.lastEncoded = t;
    const cands: { m: Float32Array; q: number; prompt?: SegObject["prompt"] }[] = [];
    let stats: string[] = [];
    let probes = 0, total = 0;
    // The engine's regions first (not the playhead's quick look: it has the engine's subjects or the grid's centre).
    if (regions?.length && !quick) {
      total = regions.length;
      for (const c of regions) {
        if (this.tapWaiting()) throw PREEMPT;
        if (probes < 2) this.ev.trace?.(`auto: region ${probes + 1}/${total}`);
        const r = await this.model.probe(c.points.map(([u, v]) => [u * 1024, v * 1024]), c.points.map(() => 1));
        if (probes++ < 2) this.ev.trace?.("auto: probed");
        const m = sigmoidResize(r.logits, r.lw, r.lh, w, h);
        const a = area(m) / N;
        const dE = cells && a > 0 ? waterContrast(m, cells, w, h) : null;
        stats.push(`${r.score.toFixed(1)}/${r.iou.toFixed(2)}/${(a * 100).toFixed(2)}%/${dE === null ? "-" : dE.toFixed(1)}`);
        if (r.score <= 0 || r.iou < A.blobIou) continue;
        if (a < A.areaSmall || a > A.areaHi) continue;
        const b = bbox(m, w, h);
        if (!b || b.x1 - b.x0 > A.span * w || b.y1 - b.y0 > A.span * h) continue;
        // Something else's mask (the water's, a neighbour's): far larger than what the engine saw there.
        if (a > A.blobGrow * Math.max(c.area, (c.box.x1 - c.box.x0) * (c.box.y1 - c.box.y0))) continue;
        if (edgeShare(m, w, h) > A.edge) continue;
        // The water test, whatever the size: a region of haze or of plain water is not a subject.
        if (dE === null || dE < (a < A.areaLo ? A.smallContrast : RECHECK.contrast)) continue;
        // Followed from the region's own points: the same prompt gives the same mask on the track's first step (a
        // box would not: the lite model fills a box, water and all).
        cands.push({ m, q: dE * Math.sqrt(a), prompt: { points: c.points.map(([u, v]) => [u, v] as [number, number]), labels: c.points.map(() => 1) } });
      }
      console.info(`[seg] engine regions at ${t.toFixed(2)} s: ${cands.length} subject(s) of ${total} region(s) (score/iou/area/dE: ${stats.join(" ")})`);
    }
    const fromRegions = cands.length > 0;
    if (!fromRegions && (grid || quick)) {
    stats = [];
    probes = 0;
    total = 0;
    // The lite (phone) model probes a coarser grid first: each probe is a full decoder run. When that finds nothing
    // (a segment's seeds, not the playhead's quick look) it goes on to the full grid: 3 × 4 points 160 px apart on a
    // 480-px frame pass a ray at the frame's edge by (owner's clip: nothing found at 0 s and 2 s, the full model's
    // 4 × 6 grid found it at 0 s), and the looks that find nothing are the ones a subject is lost for seconds at.
    const grids: [number, number][] = this.model.lite ? (quick ? [[A.liteCols, A.liteRows]] : [[A.liteCols, A.liteRows], [A.cols, A.rows]]) : [[A.cols, A.rows]];
    const pts: [number, number][] = [];
    for (const [cols, rows] of grids) {
      if (cands.length) break;
      total += cols * rows;
      pts.length = 0;
      for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) pts.push([(gx + 0.5) / cols, (gy + 0.5) / rows]);
    // (A stable sort: points equally far from the centre keep their grid order.)
    if (quick) pts.sort((a, b) => Math.hypot(a[0] - 0.5, a[1] - 0.5) - Math.hypot(b[0] - 0.5, b[1] - 0.5));
    for (const [u, v] of pts) {
      if (quick && cands.length) break;
      if (this.tapWaiting()) throw PREEMPT;
      if (probes < 2) this.ev.trace?.(`auto: probe ${probes + 1}/${total}`);
      const r = await this.model.probe([[u * 1024, v * 1024]], [1]);
      if (probes++ < 2) this.ev.trace?.("auto: probed");
      const m = sigmoidResize(r.logits, r.lw, r.lh, w, h);
      const a = area(m) / N;
      stats.push(`${r.score.toFixed(1)}/${r.iou.toFixed(2)}/${(a * 100).toFixed(1)}%`);
      if (r.score <= 0 || r.iou < A.iou) continue;
      if (a < A.areaSmall || a > A.areaHi) continue;
      const b = bbox(m, w, h);
      if (!b || b.x1 - b.x0 > A.span * w || b.y1 - b.y0 > A.span * h) continue;
      // Along the frame's edge: a subject the frame cuts through, with the water next to it (AUTO.edge).
      if (edgeShare(m, w, h) > A.edge) continue;
      // A small one (a fish of a school) must stand off its water: a speck of haze does not.
      if (a < A.areaLo) { const dE = cells ? waterContrast(m, cells, w, h) : null; if (dE === null || dE < A.smallContrast) continue; }
      const c = cells ? ringContrast(m, cells, w, h) : A.contrast;
      if (c < A.contrast) continue;
      cands.push({ m, q: r.iou + c });
    }
    }
    console.info(`[seg] auto seeds at ${t.toFixed(2)} s${quick ? " (quick)" : ""}: ${cands.length} candidate(s) of ${quick ? `${probes} of ` : ""}${total} points (${stats.join(" ")})`);
    }
    cands.sort((x, y) => y.q - x.q);
    const found: typeof cands = [];
    for (const c of cands) {
      // (Two regions on one animal, or two grid points: the better one stands for both.)
      if (found.some((k) => { const o = overlap(k.m, c.m); return o.iou > 0.4 || (fromRegions && o.share >= SEEDS.partShare); })) continue;
      found.push(c);
    }
    // Not what is followed already, and no more than there is room for (the subjects followed so far have stepped on
    // this frame when the look is a segment start's: followedAt).
    const olds = quick ? [] : this.followedAt(t);
    const items = found.map((c, i) => ({ id: i, area: area(c.m), m: c.m }));
    const slots = assignSlots(olds, items, (o, n) => overlap(o.m, n.m), (a, b) => overlap(a.m, b.m), this.autoCap);
    const keep = slots.take.slice(0, quick ? A.peekMax : A.max).map((i) => found[i]);
    if (olds.length || fromRegions) console.info(`[seg] seeds at ${t.toFixed(2)} s: ${keep.length} new, ${slots.dup.length} followed already, ${found.length - slots.dup.length - keep.length} left out (${olds.length} followed, room for ${this.autoCap})`);
    const out: SegObject[] = [];
    for (const c of keep) {
      if (c.prompt) { out.push({ kind: "include", t, prompt: c.prompt }); continue; }
      const m = c.m;
      const pr = promptFromMask(m, w, h, w / 640);
      if (!pr) continue;
      const b = bbox(m, w, h)!;
      out.push({ kind: "include", t, prompt: {
        points: [...pr.pos, ...pr.neg].map(([x, y]) => [(x + 0.5) / w, (y + 0.5) / h] as [number, number]),
        labels: [...pr.pos.map(() => 1), ...pr.neg.map(() => 0)],
        box: { x0: b.x0 / w, y0: b.y0 / h, x1: (b.x1 + 1) / w, y1: (b.y1 + 1) / h },
      } });
    }
    return out;
  }

  /** The engine's own subjects that have a mask of some size on keyframe t (as 0 / 1), for the looks (autoSeedsNow, carryOver). */
  private followedAt(t: number): { id: number; area: number; m: Uint8Array; s: ObjState }[] {
    const n = this.mw * this.mh, out: { id: number; area: number; m: Uint8Array; s: ObjState }[] = [];
    for (const s of this.objs.values()) {
      if (!s.auto || s.peek || s.o.kind !== "include") continue;
      const k = this.key(s, t);
      if (!k) continue;
      const m = new Uint8Array(n);
      let a = 0;
      for (let i = 0; i < n; i++) if (k[i] > 127) { m[i] = 1; a++; }
      if (a > SEG.guardMinArea * n) out.push({ id: s.o.id, area: a, m, s });
    }
    return out;
  }

  // ------------------------------------------------------------------ the loop

  private lastEncoded = NaN;

  /** Tracker steps done and to do: the current objects' plus, for segments not seeded yet, as many as the last one. */
  private progress(): [number, number] {
    let left = 0, autosNow = 0;
    for (const s of this.objs.values()) { left += s.fwd.length - s.fi + s.bwd.length - s.bi; if (s.auto) autosNow++; }
    const per = Math.max(1, autosNow) * Math.max(1, Math.round(SEG.segmentS * this.fps));
    for (const s of this.segStarts) if (!this.seeded.has(s)) left += per;
    if (!this.segStarts.length) left += per;
    return [this.stepsDone, this.stepsDone + left];
  }

  /**
   * The direction of an object's next step (null: done). The prompted keyframe first, forward then backward on the
   * same encoded frame (each direction's bank starts there); then the forward list to its end, then the backward
   * one (a peek with backFirst: the other way round). Never alternating: every change of direction is a decoder
   * restart at a key frame (frames.ts).
   */
  private dirOf(s: ObjState): "f" | "b" | null {
    const f = s.fi < s.fwd.length, b = s.bi < s.bwd.length;
    if (f && s.fi === 0) return "f";
    if (b && s.bi === 0) return "b";
    if (s.backFirst && b) return "b";
    return f ? "f" : b ? "b" : null;
  }

  private nextOf(s: ObjState): number | null {
    const d = this.dirOf(s);
    return d === "f" ? s.fwd[s.fi] : d === "b" ? s.bwd[s.bi] : null;
  }

  /** Tapped objects still being followed. */
  private tapsLeft(): number {
    let n = 0;
    for (const s of this.objs.values()) if (!s.auto && !s.peek && this.nextOf(s) !== null) n++;
    return n;
  }

  private postProgress(): void {
    this.ev.progress(...this.progress(), this.tapsLeft());
  }

  private loop: Promise<void> = Promise.resolve();

  /** Starts the loop unless it is running. */
  private run(): Promise<void> {
    if (!this.running) this.loop = this.work();
    return this.loop;
  }

  /**
   * Closes the session and resolves once its loop has left the model: a step under way (seconds on a phone) ends
   * first, so the session opened next (another range, another clip) never runs the model at the same time.
   */
  async stop(): Promise<void> {
    this.close();
    await this.loop.catch(() => undefined);
    // Its memory banks and the encoded frame leave the model with it (EdgeTam.reset).
    try { await this.model.reset?.(); } catch { /* the runtime is gone */ }
  }

  private async work(): Promise<void> {
    this.running = true;
    const began = performance.now();
    try {
      while (!this.closed) {
        const op = this.ops.shift();
        if (op) {
          this.enter("exclude", op.what);
          await op.run();
          this.leave();
          await yieldNow();
          continue;
        }
        const uk = this.urgent.shift();
        if (uk !== undefined) { await this.fill(uk); await yieldNow(); continue; }
        // Taps first, newest first (the autos stand still until every tap is followed through); then the playhead's
        // peek objects, in lockstep (they share each keyframe's encode).
        const manual = [...this.objs.values()].filter((s) => !s.auto && this.nextOf(s) !== null);
        let tap = manual.filter((s) => !s.peek).sort((a, b) => b.o.id - a.o.id)[0];
        // The model's own search for a segment's seeds: once no tap is left, ahead of the peek and the pass.
        const search = tap ? undefined : this.searches[0];
        if (search) {
          this.enter("search", search.what);
          const how = await search.run();
          if (how !== null) this.searches.shift();
          this.leave(how ?? "pre-empted");
          await yieldNow();
          continue;
        }
        if (!tap && this.peekReq) { await this.startPeek(); await yieldNow(); continue; }
        tap ??= manual.sort((a, b) => a.fi + a.bi - (b.fi + b.bi) || b.o.id - a.o.id)[0];
        if (tap) {
          this.enter(tap.peek ? "peek" : "tap", tap.peek ? `${this.peekKey.toFixed(2)}s` : `${tap.o.id}`);
          const st = await this.stepObject(tap);
          // The interval ahead of the step waits when the object steps there next (that step fills it, with both
          // its ends): filled now it was drawn twice, and going backward it read frames behind the decoder.
          let hold: number | null = null;
          if (st && !st.first && this.dirOf(tap) === st.dir) hold = st.dir === "f" ? st.t : this.keys[this.keys.indexOf(st.t) - 1] ?? null;
          await this.fillNow(hold);
          this.postKeys();
          this.postProgress();
          if (this.dirOf(tap) !== "b") this.backRgba.clear();
          if (!tap.peek && (!st || this.nextOf(tap) === null)) this.leave(st ? "followed" : "dropped (the water)");
          await yieldNow();
          continue;
        }
        // Autos in lockstep: the earliest keyframe any auto is due at; past a segment start, its seeds first.
        const autos = [...this.objs.values()].filter((s) => s.auto && this.nextOf(s) !== null);
        // (A start the followed subjects have stepped on comes before anything else of theirs, its seeds' first step
        // included: a back-fill waiting behind a forward track that ended there runs once the track is through, not
        // in the middle of it.)
        const settling = !Number.isNaN(this.settling) && autos.some((s) => Math.abs(this.nextOf(s)! - this.settling) < 1e-6);
        const t = settling ? this.settling : autos.length ? Math.min(...autos.map((s) => this.nextOf(s)!)) : Infinity;
        const k = this.nextSegment(t) ?? this.pendingStart();
        // The pass has reached the playhead's peek (or is through): the peek goes, the pass's own masks come.
        if (this.peekFrom < Infinity && (t === Infinity ? k === null : t >= this.peekFrom - 1e-6)) {
          if (this.dropPeek()) this.postKeys();
          await yieldNow();
          continue;
        }
        if (k !== null) {
          const ts = this.segStarts[k];
          // The subjects followed so far step on the start's frame first: the look that follows knows where they
          // are on it (what is followed already is not found again: autoSeedsNow, carryOver) and runs on that encode.
          // (They used to step after the new seeds, which then took their place whenever they overlapped: a shark
          // of a school changed its track, and its memory, at every look.)
          const due = autos.filter((s) => s.seg < k && this.dirOf(s) === "f" && Math.abs(s.fwd[s.fi] - ts) < 1e-6).sort((a, b) => b.o.id - a.o.id);
          if (due.length) {
            this.enter("pass", "");
            for (const s of due) await this.stepObject(s);
            // (Its intervals are filled, and the fine grid decided, once the start's seeds have stepped too: carryOver.)
            this.dueHard = due.some((s) => s.hard);
            this.postProgress();
            await yieldNow();
            continue;
          }
          if (!this.takeSeeds(k)) {
            if (this.asked !== ts) { this.asked = ts; this.waitSince = performance.now(); this.ev.needSeeds(k, ts, !this.noSearch.has(ts)); }
            break;
          }
          await yieldNow();
          continue;
        }
        if (autos.length) {
          this.enter("pass", "");
          // (Newer first. At a segment start these are its new seeds: what was followed up to it has stepped on
          // its frame already, ahead of the look.)
          const batch = autos.filter((s) => Math.abs(this.nextOf(s)! - t) < 1e-6).sort((a, b) => b.o.id - a.o.id);
          // (Forward steps only decide the carry-over and the fine grid: a back-fill step is its object's alone.)
          const ahead: ObjState[] = [];
          for (const s of batch) { const d = this.dirOf(s); await this.stepObject(s); if (d === "f") ahead.push(s); }
          if (ahead.length) {
            const start = this.carryOver(t);
            this.refineAutos(t, ahead.some((s) => s.hard) || (start && this.dueHard));
            if (start) this.dueHard = false;
          }
          if (!autos.some((s) => this.dirOf(s) === "b")) this.backRgba.clear();
          await this.fillReady();
          this.postKeys();
          this.postProgress();
        } else if (this.dirty.size) {
          const ta = Math.min(...this.dirty);
          this.dirty.delete(ta);
          await this.fill(ta);
        } else if (this.segStarts.length) {
          // The pass is through. A stretch nothing was followed in (before the first subject, between a subject lost
          // and the next one found, a clip without any) was never touched by a step, so never filled: its frames
          // are posted too, empty (the engine's masks alone there), so every frame of the range has its answer.
          const ta = this.keys.find((k) => !this.filledIv.has(k));
          if (ta !== undefined) await this.fill(ta);
          else if (this.fillRest()) break;
        } else break;
        await yieldNow();
      }
    } catch (e) {
      // Nothing is left to trust after a throw in here (an allocation that failed leaves the runtime dead): the
      // session stops and says so, instead of looking like a finished pass.
      this.leave("failed");
      if (!this.closed) this.fail(e);
    } finally {
      this.running = false;
      this.leave(this.closed ? "closed" : this.waiting ? "waiting for seeds" : "done");
      // The loop's own time (it stops while it waits for seeds: waitSeedsMs, or for the user).
      this.prof.runMs += performance.now() - began;
      // No tap is left when the loop stops: said once more, for a tap that ended without a tracker step after it (an
      // exclude tap that took a subject out). The main thread holds the seed frames' analysis back until it hears.
      if (!this.closed) this.postProgress();
      if (!this.closed && !this.waiting) this.ev.idle(this.profile());
    }
  }

  private fail(e: unknown): void {
    const msg = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 160) || "unknown error";
    this.failed = msg;
    this.closed = true;
    const err = new Error(msg);
    for (const op of [...this.ops.splice(0), ...this.searches.splice(0)]) op.fail(err);
    try { this.frames.dispose(); } catch { /* already gone */ }
    this.ev.error?.(msg);
  }

  /**
   * The segment whose seeds tracking needs before going on: the first unseeded segment starting at or before t
   * (the next auto keyframe), or, with no autos left, the next unseeded one. Null when tracking can go on.
   */
  private nextSegment(t: number): number | null {
    if (!this.segStarts.length) return null;
    for (let k = 0; k < this.segStarts.length; k++) {
      if (this.seeded.has(this.segStarts[k])) continue;
      if (this.segStarts[k] <= t + 1e-6) return k;
      return t === Infinity ? k : null;
    }
    return null;
  }

  /**
   * At a segment start (false: t is not one, or its carry-over is decided): who is followed from here on (seeds.ts
   * assignSlots), once everything that was followed up to t and the start's seeds have a mask on its frame.
   * - A subject followed so far goes on, under its id and with its memory, unless a new seed took its place (the
   *   seed's mask holds much of it without being the same extent: the track had shrunk to a part of the subject, or
   *   run past it) or there is no room for it (autoCap: the largest stay, a followed one counting double).
   * - A seed on a subject that is followed already (the same extent) is let go: the same shark is not followed twice.
   * - While something is followed, the next look comes SEG.topUpS later rather than at the next regular start: a
   *   subject that swims into the picture (a school passing) is picked up then, and a track whose subject has left
   *   gives up its slot.
   */
  private carryOver(t: number): boolean {
    const k = this.segStarts.findIndex((s) => Math.abs(s - t) < 1e-6);
    if (k < 0 || this.carriedAt.has(t)) return false;
    this.carriedAt.add(t);
    if (Math.abs(this.settling - t) < 1e-6) this.settling = NaN;
    const n = this.mw * this.mh;
    const bin = (s: ObjState) => {
      const key = this.key(s, t), m = new Uint8Array(n);
      let a = 0;
      if (key) for (let i = 0; i < n; i++) if (key[i] > 127) { m[i] = 1; a++; }
      return { id: s.o.id, area: a, m, s };
    };
    // (A seed let go at its first mask, a runaway, is out already: stepObject.)
    const seeds = [...this.objs.values()].filter((s) => s.auto && s.seg === k && s.fi === 1 && s.fi < s.fwd.length && Math.abs(s.fwd[0] - t) < 1e-6).sort((a, b) => a.o.id - b.o.id).map(bin);
    const was = this.endedAt(t).map(bin);
    // A subject whose mask is next to nothing here has been lost (it may still be followed on: below).
    const olds = was.filter((o) => o.area > SEG.guardMinArea * n);
    const ended = was.filter((o) => o.area <= SEG.guardMinArea * n).map((o) => o.s);
    const rel = (a: { m: Uint8Array }, b: { m: Uint8Array }) => overlap(a.m, b.m);
    const slots = assignSlots(olds, seeds, rel, rel, this.autoCap);
    for (const o of olds) if (slots.ended.includes(o.id)) ended.push(o.s);
    for (const x of seeds) {
      const dup = slots.dup.includes(x.id);
      if (!dup && !slots.over.includes(x.id)) continue;
      // Its one mask goes with it (a duplicate's subject keeps its own track's).
      x.s.fwd.length = x.s.fi;
      x.s.bwd.length = x.s.bi;
      x.s.keys.delete(t);
      x.s.shown.delete(t);
      x.s.conf.delete(t);
      this.model.drop(`${x.s.o.id}f`);
      this.model.drop(`${x.s.o.id}b`);
      console.info(`[seg] seed ${x.s.o.id} at ${t.toFixed(2)} s ${dup ? "is a subject followed already" : `has no room (${this.autoCap} followed at a time)`}: let go`);
    }
    const t1 = this.segStarts[k + 1] ?? this.base[this.base.length - 1];
    const going = slots.keep.length + slots.take.length;
    // Something is followed: the next look comes soon (the engine's regions only, no grid search), and everything
    // is followed up to it.
    const r = topUpAt(t, going, t1, SEG.topUpS, SEG.reacquireS / 2);
    const to = (r !== null ? this.addStart(k, r, false) : null) ?? t1;
    const steps = this.stepsBetween(t, to, [to]).filter((x) => x > t + 1e-6);
    for (const o of olds) if (slots.keep.includes(o.id)) { o.s.fwd = [...o.s.fwd, ...steps]; o.s.seg = k; }
    if (to !== t1) for (const x of seeds) if (slots.take.includes(x.id)) x.s.fwd = [t, ...steps];
    if (k === 0) {
      // The first segment's seeds were all let go at their first mask (runaways: stepObject): look again soon, as when
      // the first look finds nothing.
      if (![...this.objs.values()].some((s) => s.auto && this.nextOf(s) !== null)) { this.emptyRun++; this.reacquire(0); }
    } else if (![...this.objs.values()].some((s) => s.auto && s.seg === k && this.nextOf(s) !== null)) {
      const r = this.reacquire(k);
      // Nothing to follow from here, but a subject was in the picture a moment ago (out of frame, behind a rock): the
      // one seen last is followed on to the next look (or the next start). Its tracker knows it again the keyframe it
      // is back, where a look only comes every few seconds and may not see it (the engine looks in open water only).
      // At 4 keyframes a second a subject back just before the start was still carried by its mask; at 2 it was
      // dropped here, and the stretch to the next look that found it had no mask at all.
      const seen = (s: ObjState) => Math.max(-Infinity, ...s.shown);
      const keep = ended.filter((s) => t - seen(s) <= SEG.lostS + 1e-6).sort((x, y) => seen(y) - seen(x) || x.o.id - y.o.id)[0];
      if (keep) {
        const to = r ?? t1;
        keep.fwd = [...keep.fwd, ...this.stepsBetween(t, to, [to]).filter((x) => x > t + 1e-6)];
        keep.seg = k;
        ended.splice(ended.indexOf(keep), 1);
      }
    }
    for (const s of ended) this.model.drop(`${s.o.id}f`);
    return true;
  }

  /** The intervals the last step changed (touch). */
  private lastTouched: number[] = [];

  /** One tracker step of s (dirOf). Returns what it was; null: the object was dropped (a tap on the water). */
  private async stepObject(s: ObjState): Promise<{ t: number; dir: "f" | "b"; first: boolean } | null> {
    const dir = this.dirOf(s)!, goFwd = dir === "f";
    const list = goFwd ? s.fwd : s.bwd, idx = goFwd ? s.fi : s.bi, t = list[idx];
    const reverse = !goFwd, key = `${s.o.id}${dir}`;
    this.lastTouched = [];
    if (goFwd && idx > 0) await this.readAhead(list[idx - 1], t);
    // A tap's first step fills the interval before its keyframe too: read on the way there, not behind it after.
    else if (goFwd && !s.auto) { const before = this.keys[this.keys.indexOf(t) - 1]; if (before !== undefined) await this.readAhead(before, t); }
    else if (!goFwd && idx > 0) await this.readBack(s, idx);
    const need = t !== this.lastEncoded, held = this.backRgba.get(frameKey(t));
    this.backRgba.delete(frameKey(t));
    const { luma, rgba1024 } = need && held ? { luma: (await this.pixels(t, false)).luma, rgba1024: held } : await this.pixels(t, need);
    if (need) {
      const tr = this.traced++ < 3;
      if (tr) this.ev.trace?.(`encode ${t.toFixed(2)}s`);
      await this.model.encode(rgba1024!);
      this.lastEncoded = t;
      if (tr) this.ev.trace?.("encoded");
    }
    // Each direction's bank starts with the prompted keyframe (its conditioning frame), as in the batch pass.
    const first = idx === 0;
    let pts: [number, number][] | null = null, labels: number[] | null = null;
    if (first) {
      const p = s.o.prompt;
      pts = p.points.map(([u, v]) => [u * 1024, v * 1024]);
      labels = p.labels.slice();
      if (p.box) { pts = [[p.box.x0 * 1024, p.box.y0 * 1024], [p.box.x1 * 1024, p.box.y1 * 1024], ...pts]; labels = [2, 3, ...labels]; }
    }
    // The bank's clock is the object's own step count (bank.ts frameIndex: the keyframe's ordinal), so the keyframe
    // before is its spatial memory whether it is a regular step back or an extra keyframe's half step.
    const frame = bankFrame(idx, reverse);
    let r = await this.model.step(key, frame, pts, labels, reverse);
    let m = sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
    this.stepsDone++;
    if (first && !s.auto && s.o.kind === "include" && area(m) > SEG.maxTapArea * this.mw * this.mh) {
      // A tap on open water: the model's mask is the background. Drop the object (nothing was filled from it yet).
      this.objs.delete(s.o.id);
      this.model.drop(`${s.o.id}f`);
      this.model.drop(`${s.o.id}b`);
      if (!s.peek) this.ev.rejected(s.o.id);
      return null;
    }
    const prev = goFwd ? s.prevF : s.prevB;
    let reprompts = 0, agree = 1, carriedArea = 0;
    let carried: Float32Array | null = null;
    if (prev && !first) {
      const tg = performance.now();
      const fl = denseFlow(gray(luma, this.mw, this.mh), gray(prev.luma, this.mw, this.mh));
      carried = warp(prev.m, fl);
      this.prof.guardMs += performance.now() - tg;
      const ca = area(carried);
      carriedArea = ca;
      if (ca > SEG.guardMinArea * this.mw * this.mh) {
        // The lite (512-px) encoder loses thin subjects more easily (a turning thresher): it re-prompts sooner.
        if (area(m) < (this.model.lite ? SEG.guardShareLite : SEG.guardShare) * ca) {
          const pr = promptFromMask(carried, this.mw, this.mh, this.mw / 640);
          if (pr) {
            const P: [number, number][] = [...pr.pos, ...pr.neg].map(([x, y]) => [((x + 0.5) / this.mw) * 1024, ((y + 0.5) / this.mh) * 1024]);
            r = await this.model.step(key, frame, P, [...pr.pos.map(() => 1), ...pr.neg.map(() => 0)], reverse);
            m = sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
            reprompts = 1;
          }
        }
        agree = iou(m, carried);
      }
    }
    // A runaway mask (the tracker slid onto the reef or the water: a big warm patch over the background): over
    // SEG.runawayArea of the frame, or SEG.runawayGrow × what the flow carried, is no subject: the frame shows none.
    // The same against the subject's size at its last keyframe and, for a locked track, its locked size (track.ts
    // HOLD), whatever the flow carried: a ray panned out of the frame leaves the flow nothing to carry, and the lite
    // tracker then drew 14–22% of the frame over open water at its next keyframe (owner's clip, 19.2 s; the fill
    // faded that in over half a second). And a mask that comes back from nothing in mid-track must stand off the
    // water around it (mask.ts waterContrast), like a re-check's.
    let ranAway = false;
    {
      const N = this.mw * this.mh, a = area(m), ca = carriedArea, pa = prev && !first ? area(prev.m) : 0;
      const lk = s.o.kind === "include" ? (goFwd ? s.lockF : s.lockB) : null;
      const grew = (ref: number, floor: number) => ref > SEG.guardMinArea * N && a > SEG.runawayGrow * ref && a > floor;
      const ranBefore = goFwd ? s.ranF : s.ranB, kept = goFwd ? s.keptF : s.keptB;
      let why = a > SEG.runawayArea * N ? "over the frame" : grew(ca, 0.05 * N) ? "outgrew the flow-carried mask" : grew(pa, 0.05 * N) ? "outgrew its last keyframe" : lk?.locked && grew(lk.area, SEG.guardMinArea * N) ? "outgrew its locked size" : "";
      if (!why && s.o.kind === "include" && prev && !first && pa === 0 && a > 0) {
        const cells = this.cellCache.get(frameKey(t));
        const dE = cells ? waterContrast(m, cells, this.mw, this.mh) : null;
        if (dE !== null && dE < RECHECK.contrast) why = "back from nothing on plain water";
      }
      // An object that has only ever run away (a seed on the bright water at the top of the frame: half the frame at
      // every keyframe) is no subject at the one keyframe where its mask happens to stay under the limit (owner's
      // clip, 19.25 s: 22% of the frame, between keyframes of 44% and 61%).
      if (!why && ranBefore > 0 && !kept && a > 0.05 * N) why = "after runaways only, never a subject";
      if (!why && s.o.kind === "include" && a > 0.1 * N) console.info(`[seg] large mask at ${t.toFixed(2)} s: object ${s.o.id}${dir} (${s.auto ? "auto" : s.peek ? "peek" : "tap"}) ${a} px (${(100 * a / N).toFixed(1)}% of the frame) kept: last keyframe ${pa} px, flow-carried ${ca} px, ${lk?.locked ? `locked at ${Math.round(lk.area)} px` : "not locked"}`);
      if (why) {
        console.info(`[seg] runaway at ${t.toFixed(2)} s: object ${s.o.id} ${a} px (${(100 * a / N).toFixed(1)}% of the frame) ${why}: dropped`);
        m = new Float32Array(N);
        agree = 0;
        ranAway = true;
      }
      if (goFwd) { s.ranF = ranAway ? s.ranF + 1 : 0; if (!ranAway && a > 0) s.keptF = true; }
      else { s.ranB = ranAway ? s.ranB + 1 : 0; if (!ranAway && a > 0) s.keptB = true; }
    }
    s.hard = !first && (reprompts > 0 || ranAway || agree < SEG.adaptAgree);
    // Hysteresis (track.ts HOLD): a locked subject the model still sees at about its size keeps its weight through a
    // keyframe whose raw confidence dips, and a keyframe that is not sure (or whose mask shrank) is re-checked.
    let conf = reprompts ? 0.5 : (r.score > 0 ? Math.min(1, Math.max(0, (r.score + 1) / 3)) : 0) * (agree < 1 ? Math.min(1, Math.max(0, (agree - 0.3) / 0.4)) : 1);
    if (s.o.kind === "include") {
      const lock = goFwd ? s.lockF : s.lockB;
      const st = lockStep(lock, { conf, score: ranAway ? -1 : r.score, area: area(m) }, this.fps);
      conf = st.conf;
      if (st.held) this.prof.held++;
      if (st.recheck && !first && !ranAway) {
        const fix = await this.recheck(s, key, frame, reverse, m, t, goFwd, carried);
        if (fix) {
          m = fix;
          reprompts++;
          s.hard = true;
          // As a guard re-prompt: sure enough to be popped in full, not sure enough to count toward the lock.
          conf = Math.max(conf, 0.5);
          // It worked: the next keyframe that needs it is re-checked too (a refused one waits HOLD.recheckEvery).
          lock.miss = 0;
        }
      }
      if (lock.miss === 0 && lock.good > 0) {
        const c = centroid(m, this.mw, this.mh), was = goFwd ? s.sureF : s.sureB;
        if (c) {
          const dt = was ? t - was.t : 0, moved = !!was && Math.abs(dt) > 1e-6 && Math.abs(dt) <= 2 / this.fps + 1e-6;
          const ref: SureRef = { m, t, x: c.x, y: c.y, vx: moved ? (c.x - was!.x) / dt : 0, vy: moved ? (c.y - was!.y) / dt : 0 };
          if (goFwd) s.sureF = ref; else s.sureB = ref;
        }
      }
    }
    if (goFwd) { s.prevF = { m, luma }; s.fi++; } else { s.prevB = { m, luma }; s.bi++; }
    const mu = toU8(m);
    s.keys.set(t, rleEncode(mu));
    if (area(mu, 127) > 0) s.shown.add(t); else s.shown.delete(t);
    s.conf.set(t, conf);
    // A runaway is let go, not dropped keyframe after keyframe (each is a tracker step: about a frame's encode): at
    // once when its very first, prompted mask is one (the seed was on the water or the background, not on a subject),
    // else after a second of them in a row (the tracker has slid off for good; a look at a later segment start finds
    // the subject again). Its masks so far stay.
    // (An object that was a subject before gets HOLD.missS, as long as its lock holds: the tracker may find it again.)
    if (ranAway && s.o.kind === "include" && (first || (goFwd ? s.ranF : s.ranB) >= Math.max(2, Math.round(this.fps * ((goFwd ? s.keptF : s.keptB) ? HOLD.missS : 1))))) {
      const left = first ? s.fwd.length - s.fi + s.bwd.length - s.bi : goFwd ? s.fwd.length - s.fi : s.bwd.length - s.bi;
      if (goFwd || first) s.fwd.length = s.fi;
      if (!goFwd || first) s.bwd.length = s.bi;
      this.model.drop(key);
      if (first) { this.model.drop(`${s.o.id}f`); this.model.drop(`${s.o.id}b`); }
      this.ev.trace?.(`released ${s.o.id}${dir} at ${t.toFixed(2)}s (runaway)`);
      console.info(`[seg] released at ${t.toFixed(2)} s: object ${s.o.id}${dir} ${first ? "was a runaway from its first mask" : `ran away for ${goFwd ? s.ranF : s.ranB} keyframes in a row`}: no longer followed (${left} step(s) saved)`);
    }
    if (s.auto && !goFwd) {
      // A back-fill that has found nothing for a second has left the subject behind (it came into the picture
      // there): it stops.
      s.emptyB = area(m) > 0 ? 0 : s.emptyB + 1;
      if (s.emptyB >= Math.max(2, Math.round(this.fps))) s.bwd.length = s.bi;
    }
    if ((!s.auto || !goFwd) && (goFwd ? s.fi >= s.fwd.length : s.bi >= s.bwd.length)) this.model.drop(key);
    // Taps: the intervals the step changed are filled right away (the caller); autos: once both ends are final.
    // (The backward list starts on the prompted keyframe again: the same frame, prompt and empty bank as the forward
    // one's first step just before it, so the same mask: nothing changed.)
    const again = !goFwd && first && s.fi > 0 && s.fwd[0] === t;
    this.lastTouched = again ? [] : this.touch(t, idx > 0 ? list[idx - 1] : t);
    if (!s.auto && !s.peek) this.refine(s, goFwd, t);
    return { t, dir, first };
  }

  /**
   * The re-check of a locked track at keyframe t (track.ts HOLD; RECHECK): the tracker's mask `m` is unsure or has
   * shrunk, so the frame is asked afresh where the subject should be: a box around the last sure mask moved on at
   * its last speed (or as the flow carried it, when that kept its size) and the tracker's own mask, with points
   * inside what the tracker still has (or inside the expected mask when it has nothing). The answer is first read
   * without touching the track's memory (probe); only one that passes the tests (a subject, off the water, the
   * tracker's own mask and more, about the locked size) is written into the track, as a prompted step. A subject
   * that is leaving the frame is left alone (its mask shrinks because it is going). Returns the new mask, or null
   * (the tracker's stays). Never fills plain water: a mask that has the colour of the water around it is refused.
   */
  private async recheck(s: ObjState, key: string, frame: number, reverse: boolean, m: Float32Array, t: number, goFwd: boolean, carried: Float32Array | null): Promise<Float32Array | null> {
    const ref = goFwd ? s.sureF : s.sureB, lock = goFwd ? s.lockF : s.lockB;
    const { mw: w, mh: h } = this, N = w * h;
    if (!ref || !(lock.area > 0)) return null;
    const cur = bbox(m, w, h), am = area(m);
    if (cur && (cur.x0 === 0 || cur.y0 === 0 || cur.x1 === w - 1 || cur.y1 === h - 1)) return null;
    this.prof.rechecks++;
    // Where the subject should be now.
    const flowOk = !!carried && area(carried) >= 0.7 * area(ref.m);
    const exp = flowOk ? carried! : shiftMap(ref.m, w, h, ref.vx * (t - ref.t), ref.vy * (t - ref.t));
    const eb = bbox(exp, w, h);
    if (!eb && !cur) return null;
    const x0 = Math.min(eb?.x0 ?? w, cur?.x0 ?? w), y0 = Math.min(eb?.y0 ?? h, cur?.y0 ?? h), x1 = Math.max(eb?.x1 ?? 0, cur?.x1 ?? 0) + 1, y1 = Math.max(eb?.y1 ?? 0, cur?.y1 ?? 0) + 1;
    const gx = RECHECK.box * (x1 - x0) + 1, gy = RECHECK.box * (y1 - y0) + 1;
    const pr = promptFromMask(am > 0 ? m : exp, w, h, w / 640, 3, 0);
    if (!pr) return null;
    const mp = (x: number, y: number): [number, number] => [(Math.min(w, Math.max(0, x)) / w) * 1024, (Math.min(h, Math.max(0, y)) / h) * 1024];
    const P: [number, number][] = [mp(x0 - gx, y0 - gy), mp(x1 + gx, y1 + gy), ...pr.pos.map(([x, y]) => mp(x + 0.5, y + 0.5))];
    const L = [2, 3, ...pr.pos.map(() => 1)];
    const ok = (q: { score: number }, c: Float32Array): boolean => {
      const a = area(c);
      if (!(q.score > 0) || a < RECHECK.gain * am || a < HOLD.areaLo * lock.area || a > HOLD.areaHi * lock.area || a > SEG.runawayArea * N) return false;
      if (am > 0) { let both = 0; for (let i = 0; i < N; i++) if (m[i] > 0.5 && c[i] > 0.5) both++; if (both < RECHECK.cover * am) return false; }
      const cells = this.cellCache.get(frameKey(t));
      const dE = cells ? waterContrast(c, cells, w, h) : null;
      return dE === null || dE >= RECHECK.contrast;
    };
    const p = await this.model.probe(P, L);
    const cand = sigmoidResize(p.logits, p.lw, p.lh, w, h);
    if (!ok(p, cand)) return null;
    // Into the track's memory: the same prompt as a (non-conditioning) step of this keyframe.
    const r = await this.model.step(key, frame, P, L, reverse);
    const out = sigmoidResize(r.logits, r.lw, r.lh, w, h);
    if (ok(r, out)) {
      this.prof.recovered++;
      console.info(`[seg] re-check at ${t.toFixed(2)} s: object ${s.o.id} ${am} → ${area(out)} px (locked at ${Math.round(lock.area)})`);
      return out;
    }
    // With the track's memory the prompt came out otherwise: the keyframe's own step again (its memory as it was).
    await this.model.step(key, frame, null, null, reverse);
    return null;
  }

  /** Model inputs (RGBA 1024²) of the keyframes of the backward chunk read last, by frameKey (readBack). */
  private backRgba = new Map<number, Uint8ClampedArray>();
  private backTraced = 0;

  /**
   * Backward steps, a chunk at a time: before the object's backward step number idx, the frames from its keyframe
   * SEG.backChunkS further back up to the last one stepped at are read in ONE pass in time order: every grid frame
   * (luma and cells into the cache, for the fills) and the model input of each keyframe in the chunk (kept until its
   * step: 4 MB each, a handful). One decoder restart a chunk, where every backward step used to be one, and its
   * fill another.
   */
  private async readBack(s: ObjState, idx: number): Promise<void> {
    const t = s.bwd[idx], from = s.bwd[idx - 1];
    if (this.backRgba.has(frameKey(t))) return;
    this.backRgba.clear();
    const chunk = s.bwd.slice(idx).filter((k) => k > t - SEG.backChunkS + 1e-6);
    const lo = chunk[chunk.length - 1];
    const want = new Map<number, number>(chunk.map((k) => [frameKey(k), k]));
    // The extra keyframes a hard step may ask for in here (refine).
    if (this.adapt) for (const k of this.fine) if (k > lo + 1e-6 && k < t - 1e-6) want.set(frameKey(k), k);
    // The object's last keyframe: the interval before it is filled after its step, so its frames are read as well.
    const ends = idx + chunk.length >= s.bwd.length, before = this.keys[this.keys.indexOf(lo) - 1];
    const gridLo = ends && before !== undefined ? before : lo;
    const times = new Map<number, number>(want);
    const hz = SEG.sampleHz, i1 = this.grid.i0 + this.grid.n;
    for (let i = Math.max(this.grid.i0, Math.ceil(gridLo * hz - 1e-6)); i < i1 && i / hz < from - 1e-6; i++) if (!times.has(frameKey(i / hz))) times.set(frameKey(i / hz), i / hz);
    if (this.backTraced++ < 2) this.ev.trace?.(`back ${gridLo.toFixed(2)}-${from.toFixed(2)}s (${want.size} keys)`);
    for (const [k, x] of [...times].sort((a, b) => a[1] - b[1])) {
      if (want.has(k)) this.backRgba.set(k, (await this.pixels(x, true)).rgba1024!);
      else if (!this.lumaCache.has(k)) await this.pixels(x, false);
    }
  }

  /** The keyframe time next to t on the fine grid (dir: +1 later, −1 earlier), when extra keyframes are on. */
  private extraKey(t: number, dir: 1 | -1): number | null {
    if (!this.adapt) return null;
    const i = this.fine.indexOf(t);
    return i >= 0 ? this.fine[i + dir] ?? null : null;
  }

  /**
   * Adaptive keyframes, a tap's object: a hard step (ObjState.hard) puts the object on the fine grid for its next
   * SEG.adaptHold steps in that direction: the fine keyframe next to t goes into its list ahead of its next regular
   * one. The stretch where the tracker and the flow part ways is tracked twice as densely, the rest at `fps`.
   */
  private refine(s: ObjState, goFwd: boolean, t: number): void {
    if (!this.adapt) return;
    if (s.hard) { if (goFwd) s.fineF = SEG.adaptHold; else s.fineB = SEG.adaptHold; }
    if ((goFwd ? s.fineF : s.fineB) <= 0) return;
    if (goFwd) s.fineF--; else s.fineB--;
    const list = goFwd ? s.fwd : s.bwd, i = goFwd ? s.fi : s.bi, next = list[i];
    const f = this.extraKey(t, goFwd ? 1 : -1);
    if (f === null || next === undefined || (goFwd ? next <= f + 1e-6 : next >= f - 1e-6)) return;
    list.splice(i, 0, f);
    this.activate(f);
    this.prof.extraKeys++;
  }

  /** The same for the autos, which step in lockstep: one hard step among them puts them all on the fine grid. */
  private refineAutos(t: number, hard: boolean): void {
    if (!this.adapt) return;
    if (hard) this.autoFine = SEG.adaptHold;
    if (this.autoFine <= 0) return;
    this.autoFine--;
    const f = this.extraKey(t, 1);
    if (f === null) return;
    let any = false;
    for (const s of this.objs.values()) {
      const next = s.auto ? s.fwd[s.fi] : undefined;
      if (next === undefined || next <= f + 1e-6) continue;
      s.fwd.splice(s.fi, 0, f);
      any = true;
    }
    if (any) { this.activate(f); this.prof.extraKeys++; }
  }

  /** Fills the intervals the last step changed right away (the rest wait in `dirty`, and so does `hold`), in time
   * order: the decoder reads forward. */
  private async fillNow(hold: number | null = null): Promise<void> {
    for (const k of [...new Set(this.lastTouched)].sort((a, b) => a - b)) if (k !== hold && this.dirty.has(k)) { this.dirty.delete(k); await this.fill(k); }
  }

  /** Fills every dirty interval no object will step at either end any more (each is filled once, with final keys). */
  private async fillReady(): Promise<void> {
    // Not final: a keyframe an object has still to step at, and any keyframe between that and where it stands (another
    // object's: this one is carried to it once it has stepped past).
    const open: [number, number][] = [];
    for (const s of this.objs.values()) {
      if (s.fi < s.fwd.length) open.push([s.fi > 0 ? s.fwd[s.fi - 1] + 1e-6 : s.fwd[0] - 1e-6, s.fwd[s.fwd.length - 1] + 1e-6]);
      if (s.bi < s.bwd.length) open.push([s.bwd[s.bwd.length - 1] - 1e-6, s.bi > 0 ? s.bwd[s.bi - 1] - 1e-6 : s.bwd[0] + 1e-6]);
    }
    const pending = { has: (k: number) => open.some(([lo, hi]) => k > lo && k < hi) };
    for (const a of [...this.dirty].sort((x, y) => x - y)) {
      const b = this.keys[this.keys.indexOf(a) + 1];
      if (pending.has(a) || (b !== undefined && pending.has(b))) continue;
      this.dirty.delete(a);
      await this.fill(a);
    }
  }

  private markObject(s: ObjState): void {
    const ts = [...s.keys.keys()];
    if (!ts.length) return;
    const lo = this.keys.indexOf(Math.min(...ts)), hi = this.keys.indexOf(Math.max(...ts));
    const ks: number[] = [];
    for (let k = Math.max(0, lo - 1); k <= hi; k++) { this.dirty.delete(this.keys[k]); ks.push(this.keys[k]); }
    const at = s.o.t;
    ks.sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
    this.urgent = [...ks, ...this.urgent.filter((k) => !ks.includes(k))];
  }

  /** The union of the given objects' own keyframe masks at t (probabilities; includes and excludes apart). */
  private own(objs: Iterable<ObjState>, t: number, missing?: ObjState[]): { inc: Float32Array; exc: Float32Array | null } {
    const n = this.mw * this.mh, inc = new Float32Array(n);
    let exc: Float32Array | null = null;
    for (const s of objs) {
      if (s.hidden) continue;
      const m = this.key(s, t);
      if (!m) { missing?.push(s); continue; }
      if (s.o.kind === "include") { for (let i = 0; i < n; i++) inc[i] = Math.max(inc[i], m[i] / 255); }
      else { exc ??= new Float32Array(n); for (let i = 0; i < n; i++) exc[i] = Math.max(exc[i], m[i] / 255); }
    }
    return { inc, exc };
  }

  /**
   * Every shown object's mask at keyframe t. An object with its own keyframe there gives that; one without (t is
   * another object's prompt or extra keyframe) but with keyframes either side is carried to t along the flow between
   * those two, as the fill would have drawn it there (carried). So a keyframe one object adds never drops the others
   * from the mask, and the result does not depend on which object was tracked first.
   */
  private async union(t: number): Promise<{ inc: Float32Array; exc: Float32Array | null }> {
    const missing: ObjState[] = [];
    const u = this.own(this.objs.values(), t, missing);
    const gaps = new Map<string, { a: number; b: number; objs: ObjState[] }>();
    for (const s of missing) {
      let a = -Infinity, b = Infinity;
      for (const k of s.keys.keys()) { if (k < t && k > a) a = k; else if (k > t && k < b) b = k; }
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const id = `${a}|${b}`, g = gaps.get(id) ?? { a, b, objs: [] };
      g.objs.push(s);
      gaps.set(id, g);
    }
    const n = this.mw * this.mh;
    for (const g of gaps.values()) {
      const c = await this.carried(g.objs, g.a, g.b, t);
      for (let i = 0; i < n; i++) if (c.inc[i] > u.inc[i]) u.inc[i] = c.inc[i];
      if (c.exc) { const e = (u.exc ??= new Float32Array(n)); for (let i = 0; i < n; i++) if (c.exc[i] > e[i]) e[i] = c.exc[i]; }
    }
    return u;
  }

  /** The masks of `objs` (which share the keyframes a < t < b and have none at t) at t: a's carried forward along the
   * frames' flow, b's backward, cross-faded by time (track.ts fillInterval). */
  private async carried(objs: ObjState[], a: number, b: number, t: number): Promise<{ inc: Float32Array; exc: Float32Array | null }> {
    const id = `${objs.map((s) => s.o.id).sort((x, y) => x - y).join(",")}|${a}|${b}|${t}`;
    const hit = this.carriedCache.get(id);
    if (hit) return hit;
    const A = this.own(objs, a), B = this.own(objs, b);
    const hz = SEG.sampleHz, times: number[] = [];
    for (let i = Math.floor(a * hz + 1e-6) + 1; i / hz < b - 1e-6; i++) if (Math.abs(i / hz - t) > 1e-6) times.push(i / hz);
    times.push(t);
    times.sort((x, y) => x - y);
    const lumas: Float32Array[] = [];
    for (const x of times) lumas.push((await this.pixels(x, false)).luma);
    const ka: Keyframe = { t: a, inc: A.inc, exc: A.exc, luma: (await this.pixels(a, false)).luma, conf: 1, reprompts: 0, score: 0 };
    const kb: Keyframe = { t: b, inc: B.inc, exc: B.exc, luma: (await this.pixels(b, false)).luma, conf: 1, reprompts: 0, score: 0 };
    const t0 = performance.now();
    const out = fillInterval(ka, kb, times, lumas, this.mw, this.mh, !!(A.exc || B.exc))[times.indexOf(t)];
    this.prof.fillMs += performance.now() - t0;
    this.prof.carried++;
    // Each is asked for twice (the intervals either side of t); a handful are kept (230 KB each at 320 × 180).
    if (this.carriedCache.size >= this.carriedCap) this.carriedCache.delete(this.carriedCache.keys().next().value!);
    this.carriedCache.set(id, out);
    return out;
  }

  /** Grid frames posted at least once. */
  private posted: Uint8Array | null = null;

  /** Posts the grid frames no interval covers (those before the first keyframe), empty. True: nothing was left. */
  private fillRest(): boolean {
    const p = (this.posted ??= new Uint8Array(this.grid.n)), out: SessionFrameOut[] = [];
    const z = new Float32Array(this.mw * this.mh);
    for (let i = 0; i < this.grid.n; i++) if (!p[i]) { p[i] = 1; out.push(this.product(i, z, null, z)); }
    if (!out.length) return true;
    this.prof.filledFrames += out.length;
    if (!this.closed) this.ev.frames(out);
    return false;
  }

  /** Fills the interval from keyframe ta to the next one in use and posts its frames. */
  private async fill(ta: number): Promise<void> {
    const ki = this.keys.indexOf(ta);
    if (ki < 0) return;
    const tb = this.keys[ki + 1];
    const A = await this.union(ta), B = tb !== undefined ? await this.union(tb) : null;
    const idx: number[] = [];
    for (let i = 0; i < this.grid.n; i++) {
      const t = (this.grid.i0 + i) / SEG.sampleHz;
      // The last keyframe holds (flow-carried) to the end of the clip.
      if (t >= ta - 1e-6 && (tb === undefined || t < tb - 1e-6)) idx.push(i);
    }
    this.filledIv.add(ta);
    if (!idx.length) return;
    const p = (this.posted ??= new Uint8Array(this.grid.n));
    for (const i of idx) p[i] = 1;
    // No mask at either end: empty frames, without decoding the stretch (what the fill of nothing comes to anyway).
    const none = (u: { inc: Float32Array; exc: Float32Array | null } | null) => !u || (!u.exc && !u.inc.some((x) => x > 0));
    if (none(A) && none(B)) {
      const z = new Float32Array(this.mw * this.mh);
      this.prof.filledFrames += idx.length;
      if (!this.closed) this.ev.frames(idx.map((i) => this.product(i, z, null, z)));
      return;
    }
    const lumas: Float32Array[] = [];
    for (const i of idx) lumas.push((await this.pixels((this.grid.i0 + i) / SEG.sampleHz, false)).luma);
    const lumaA = (await this.pixels(ta, false)).luma;
    const t0 = performance.now();
    const ka: Keyframe = { t: ta, inc: A.inc, exc: A.exc, luma: lumaA, conf: 1, reprompts: 0, score: 0 };
    const kb: Keyframe | null = B && tb !== undefined ? { t: tb, inc: B.inc, exc: B.exc, luma: (await this.pixels(tb, false)).luma, conf: 1, reprompts: 0, score: 0 } : null;
    const filled = fillInterval(ka, kb, idx.map((i) => (this.grid.i0 + i) / SEG.sampleHz), lumas, this.mw, this.mh, !!(A.exc || B?.exc));
    const gr = Math.max(1, Math.round(SEG.guidedR * this.mw / 640));
    const t1 = performance.now();
    const out: SessionFrameOut[] = [];
    idx.forEach((i, j) => {
      const inc = guidedFilter(lumas[j], remap(filled[j].inc), this.mw, this.mh, gr, SEG.guidedEps);
      const e = filled[j].exc ? guidedFilter(lumas[j], remap(filled[j].exc!), this.mw, this.mh, gr, SEG.guidedEps) : null;
      out.push(this.product(i, inc, e, lumas[j]));
    });
    this.prof.fillMs += t1 - t0;
    this.prof.productMs += performance.now() - t1;
    this.prof.filledFrames += idx.length;
    if (!this.closed) this.ev.frames(out);
  }

  /** The overlay-ready maps of one frame (feather, near, exclude, water departure; see track.ts SegTrack.at). */
  private product(i: number, incRaw: Float32Array, excRaw: Float32Array | null, luma: Float32Array): SessionFrameOut {
    const { mw: w, mh: h } = this;
    const bb = bbox(incRaw, w, h);
    if (!bb && !excRaw) {
      // Nothing here: an empty frame (coded in a few bytes; the overlay is then the engine's alone).
      const z = new Uint8Array(w * h), zq = new Uint8Array(qsize(w) * qsize(h));
      return { i, alpha: rleEncode(z), nearQ: rleEncode(zq), excQ: null, depQ: rleEncode(zq.fill(255)), pop: null };
    }
    const diag = bb ? Math.hypot(bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1) : 0;
    const r = Math.max(SEG.featherMinPx, SEG.featherShare * diag);
    const inc = sdfFeather(incRaw, w, h, SEG.alphaR), exc = excRaw ? sdfFeather(excRaw, w, h, SEG.alphaR) : null;
    const alpha = new Uint8Array(w * h);
    for (let k = 0; k < alpha.length; k++) alpha[k] = Math.round(255 * Math.min(1, Math.max(0, inc[k] * (exc ? 1 - exc[k] : 1))));
    const nr = Math.max(2, Math.round(SEG.nearK * r));
    const near = nearMap(incRaw, w, h, nr);
    const cells = this.cellCache.get(frameKey((this.grid.i0 + i) / SEG.sampleHz));
    const depQ = cells ? departFromCells(cells, toU8(incRaw), w, h).data : new Uint8Array(qsize(w) * qsize(h)).fill(255);
    // The subject against the water around it on this frame: the main thread averages it over the clip for the pop's
    // one lift direction (the engine used to average whatever frames had been rendered since its last reset).
    const pop = framePop(luma, alpha, near);
    return { i, alpha: rleEncode(alpha), nearQ: rleEncode(quarter(near, w, h, 4)), excQ: exc ? rleEncode(quarter(exc, w, h, 1)) : null, depQ: rleEncode(depQ), pop };
  }

  private postKeys(): void {
    const out: { t: number; conf: number }[] = [];
    // Area-weighted over the shown subjects (the overlay is their union): a small fish leaving the frame with a low
    // confidence must not dim the big animal's pop (the minimum did, and the pop blinked with it).
    const n = this.mw * this.mh;
    for (const t of this.keys) {
      let num = 0, den = 0;
      for (const s of this.objs.values()) {
        if (s.o.kind !== "include" || s.hidden || !s.shown.has(t)) continue;
        const k = s.keys.get(t);
        const a = k ? Math.max(1, area(rleDecode(k, n), 127)) : 1;
        num += a * (s.conf.get(t) ?? 1); den += a;
      }
      if (den > 0) out.push({ t, conf: num / den });
    }
    this.ev.keys(out);
  }

  /** Where the pass's time went (ms) and its counts. */
  profile(): SessionProfile {
    const m = this.model.timing;
    let objects = 0;
    for (const s of [...this.objs.values(), ...this.trash.values()]) if (s.keys.size) objects++;
    return { ...this.prof, objects, clipS: this.grid.n / SEG.sampleHz, encodeMs: m.encode, encodes: m.encodes, attendMs: m.attend, decoderMs: m.decoder, memEncMs: m.memEnc, steps: m.steps, keyframes: this.keys.length, fps: this.fps, restarts: this.frames.restarts?.() ?? 0 };
  }
}

function gray(l: Float32Array, w: number, h: number): Gray {
  return { width: w, height: h, data: l };
}

const qsize = (n: number) => Math.max(1, Math.ceil(n / 4));

/** 4×-downsampled 8-bit map (mean), scaled by k and clipped. */
function quarter(src: Float32Array, w: number, h: number, k: number): Uint8Array {
  const qw = qsize(w), qh = qsize(h), out = new Uint8Array(qw * qh);
  for (let qy = 0; qy < qh; qy++) for (let qx = 0; qx < qw; qx++) {
    let s = 0, c = 0;
    for (let y = qy * 4; y < Math.min(h, qy * 4 + 4); y++) for (let x = qx * 4; x < Math.min(w, qx * 4 + 4); x++) { s += src[y * w + x]; c++; }
    out[qy * qw + qx] = Math.round(255 * Math.min(1, (s / c) * k));
  }
  return out;
}
