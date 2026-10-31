// AI subject detection, background session (runs in seg-worker.ts, next to the model). It owns an independent
// decoder over the clip (openSampleReader: WebCodecs, never the playing <video>), the per-object keyframe masks and
// the per-frame fill, so the AI pass runs while the clip plays and the main thread only looks finished masks up.
//
// - The engine's own subjects ("autos") come in segments: the main thread seeds segment k on its canonical frame
//   (studio.ts seedSegment: the export range's start + k × SEG.segmentS, analysed alone), the session asks for the
//   next segment's seeds when its tracking reaches it and waits for them, so every run of the clip (preview or
//   export, started whenever) tracks the same objects. Autos are tracked forward through their segment in lockstep
//   (every auto due at a keyframe steps on one encode). At the next segment's start an auto the new seeds do not
//   cover carries on (its memory bank and all), so a subject the engine misses there is still followed.
// - Taps (include, exclude) are tracked outward from their keyframe, both ways, within SEG.reachS, ahead of the
//   autos, with their intervals filled right away (the outline updates within a few steps).
// - Tracking uses the EdgeTAM memory tracker on the SEG.fps keyframe grid with the flow guard of the batch pass.
// - Intervals between keyframes are filled (track.ts fillInterval: per-frame flow both ways, guided filter on each
//   frame's luma) once both their keyframes are final, and every filled frame is posted as overlay-ready 8-bit maps
//   (feathered alpha, "near", excludes, water departure), run-length coded (a few KB a frame: a long clip stays
//   small). Keyframe masks are kept run-length coded too.
// - An exclude tap on an ML subject removes the subject when the tap's own mask is most of it (cleanly, restorable
//   for undo), else it is followed as an exclude object (only the tapped part comes out).
import type { EdgeTam } from "./edgetam.ts";
import { frameIndex } from "./bank.ts";
import { cellLab, nearMap, departFromCells, sdfFeather, area, bbox, guidedFilter, iou, promptFromMask, rleDecode, rleEncode } from "./mask.ts";
import { denseFlow, warp, type Gray } from "./flow.ts";
import { fillInterval, keyTimes, maskSize, remap, SEG, sigmoidResize, toU8, type Keyframe, type SegObject } from "./track.ts";

/** Reads one frame (as a VideoFrame-like source) at clip time t; the session draws it on its own canvases. */
export type SessionFrames = {
  width: number;
  height: number;
  /** Clockwise degrees the coded frame turns to be upright. */
  rotation: number;
  /** The frame covering clip time t (the caller closes nothing: the source owns the frame until the next call). */
  at(t: number): Promise<CanvasImageSource & { displayWidth?: number }>;
  dispose(): void;
};

export type SessionObjectInfo = { id: number; kind: "include" | "exclude"; t: number };
/** One filled frame's maps, run-length coded (mask.ts rleEncode): alpha on the mask grid, the rest at quarter size. */
export type SessionFrameOut = { i: number; alpha: Uint8Array; nearQ: Uint8Array; excQ: Uint8Array | null; depQ: Uint8Array };
export type SessionProfile = Record<string, number>;
export type SessionEvents = {
  frames(items: SessionFrameOut[]): void;
  keys(conf: { t: number; conf: number }[]): void;
  progress(done: number, total: number): void;
  idle(profile: SessionProfile): void;
  /** A tapped include that came out as the background (the tap missed the animal): dropped. */
  rejected(id: number): void;
  /** Segment k's seeds are needed (its canonical frame t): tracking waits for session.seeds(k, ...). */
  needSeeds(k: number, t: number): void;
};

type ObjState = {
  o: SegObject & { id: number };
  /** An auto (segment seed or its carry-over): tracked forward in lockstep with the other autos. */
  auto: boolean;
  /** The segment an auto is in now (carry-over moves it on). */
  seg: number;
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
};

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

export class SegSession {
  readonly mw: number;
  readonly mh: number;
  readonly grid: { i0: number; n: number };
  readonly keys: number[];
  private objs = new Map<number, ObjState>();
  private trash = new Map<number, ObjState>();
  private lumaCache = new Map<number, Uint8Array>();
  private cellCache = new Map<number, Float32Array>();
  private dirty = new Set<number>(); // interval start indices (into keys) to fill again
  /** Intervals a remove / restore (a tap or its undo) changed: filled before the next tracker step, nearest first. */
  private urgent: number[] = [];
  private small: OffscreenCanvas;
  private big: OffscreenCanvas;
  private running = false;
  private closed = false;
  /** Segment starts (keyframe times; segStarts[0] = the first seeds' frame), seeds received, the one asked for. */
  private segStarts: number[] = [];
  private seeded = new Set<number>();
  private asked = -1;
  /** Steps done (for the progress). */
  private stepsDone = 0;
  private prof: SessionProfile = { decodeMs: 0, decodes: 0, guardMs: 0, fillMs: 0, filledFrames: 0, productMs: 0, frames: 0, waitSeedsMs: 0 };
  private waitSince = 0;

  private model: EdgeTam;
  private frames: SessionFrames;
  private ev: SessionEvents;

  constructor(model: EdgeTam, frames: SessionFrames, span: { start: number; end: number }, ev: SessionEvents) {
    this.model = model;
    this.frames = frames;
    this.ev = ev;
    [this.mw, this.mh] = maskSize(frames.width, frames.height);
    const i0 = Math.ceil(span.start * SEG.sampleHz - 1e-6), i1 = Math.floor(span.end * SEG.sampleHz + 1e-6);
    this.grid = { i0, n: Math.max(0, i1 - i0 + 1) };
    this.keys = keyTimes(span.start, span.end);
    this.small = new OffscreenCanvas(this.mw, this.mh);
    this.big = new OffscreenCanvas(1024, 1024);
  }

  /** The keyframe on the grid nearest to t (prompts snap to it: every object shares the keyframes). */
  snap(t: number): number {
    let b = this.keys[0] ?? t;
    for (const k of this.keys) if (Math.abs(k - t) < Math.abs(b - t)) b = k;
    return b;
  }

  /** Canonical frame of segment k (k = 0: the first seeds' frame; then every SEG.segmentS, snapped). */
  segmentStart(k: number): number | null {
    return this.segStarts[k] ?? null;
  }

  /** A tap's object (include / exclude): tracked both ways within SEG.reachS, ahead of the autos. */
  add(o: SegObject & { id: number }): void {
    const t = this.snap(o.t), reach = SEG.reachS;
    const near = this.keys.filter((k) => Math.abs(k - t) <= reach + 1e-6);
    this.objs.set(o.id, {
      o: { ...o, t }, auto: false, seg: -1, keys: new Map(), shown: new Set(), conf: new Map(), fi: 0, bi: 0, prevF: null, prevB: null,
      fwd: near.filter((k) => k >= t - 1e-6), bwd: near.filter((k) => k <= t + 1e-6).reverse(),
    });
    void this.run();
  }

  /**
   * Segment k's seeds (the engine's own subjects on its canonical frame t; may be none). Segment 0 also fixes the
   * segment grid: its frame, then every SEG.segmentS to the end of the clip.
   */
  seeds(k: number, t: number, objs: (SegObject & { id: number })[]): void {
    if (this.seeded.has(k)) return;
    if (k === 0) {
      const t0 = this.snap(t), end = this.keys[this.keys.length - 1] ?? t0;
      this.segStarts = [];
      for (let s = t0; s <= end + 1e-6; s += SEG.segmentS) this.segStarts.push(this.snap(s));
      this.segStarts = this.segStarts.filter((s, i, a) => i === 0 || s > a[i - 1] + 1e-6);
    }
    const t0 = this.segStarts[k];
    if (t0 === undefined) return;
    this.seeded.add(k);
    if (this.waitSince) { this.prof.waitSeedsMs += performance.now() - this.waitSince; this.waitSince = 0; }
    const t1 = this.segStarts[k + 1] ?? this.keys[this.keys.length - 1];
    const span = this.keys.filter((x) => x >= t0 - 1e-6 && x <= t1 + 1e-6);
    for (const o of objs) {
      this.objs.set(o.id, { o: { ...o, t: t0 }, auto: true, seg: k, keys: new Map(), shown: new Set(), conf: new Map(), fi: 0, bi: 0, prevF: null, prevB: null, fwd: span, bwd: [] });
    }
    // Nothing seeded and nothing tracked into this segment: look again a little later (re-acquire).
    if (!objs.length && ![...this.objs.values()].some((s) => s.auto && this.nextOf(s) !== null)) this.reacquire(k);
    void this.run();
  }

  /**
   * Segment k has no subject: a new segment start SEG.reacquireS later (canonical: a function of the grid alone), so
   * the main thread looks for the engine's subjects again before the next regular start.
   */
  private reacquire(k: number): void {
    const t = this.segStarts[k], next = this.segStarts[k + 1] ?? Infinity;
    const r = this.snap(t + SEG.reacquireS);
    if (r > t + 1e-6 && r < next - SEG.reacquireS / 2) this.segStarts.splice(k + 1, 0, r);
  }

  /** Takes an object out (its masks kept for restore); every interval it touched is filled again. */
  remove(id: number): void {
    const s = this.objs.get(id);
    if (!s) return;
    this.objs.delete(id);
    this.trash.set(id, s);
    this.markObject(s);
    void this.run();
  }

  restore(id: number): void {
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

  /** The include object whose mask covers (u, v) at the keyframe nearest t, if any. */
  objectAt(t: number, u: number, v: number): ObjState | null {
    const k = this.snap(t), x = Math.min(this.mw - 1, Math.floor(u * this.mw)), y = Math.min(this.mh - 1, Math.floor(v * this.mh));
    let best: ObjState | null = null, bp = 127;
    for (const s of this.objs.values()) {
      if (s.o.kind !== "include") continue;
      const m = this.key(s, k);
      if (m && m[y * this.mw + x] > bp) { bp = m[y * this.mw + x]; best = s; }
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
    return new Promise((resolve, reject) => {
      this.ops.push(() => this.excludeNow(id, t, u, v).then(resolve, reject));
      void this.run();
    });
  }

  private ops: (() => Promise<void>)[] = [];

  private async excludeNow(id: number, t: number, u: number, v: number): Promise<{ action: "removed"; removed: number } | { action: "part" | "exclude" }> {
    const o = this.objectAt(t, u, v);
    if (!o) {
      this.add({ id, kind: "exclude", t, prompt: { points: [[u, v]], labels: [1] } });
      return { action: "exclude" };
    }
    const k = this.snap(t);
    const m = await this.oneShot(k, [[u, v]]);
    const om = this.key(o, k)!;
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

  /** Waiting for the main thread's seeds of segment `asked`. */
  private get waiting(): boolean {
    return this.asked >= 0 && !this.seeded.has(this.asked);
  }

  close(): void {
    this.closed = true;
    this.frames.dispose();
  }

  // ------------------------------------------------------------------ frames

  private async pixels(t: number, need1024: boolean): Promise<{ luma: Float32Array; rgba1024?: Uint8ClampedArray }> {
    const i = Math.round(t * SEG.sampleHz) - this.grid.i0;
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
    this.lumaCache.set(i, luma);
    this.cellCache.set(i, cellLab(s, this.mw, this.mh));
    // A bounded cache (~70 KB a frame): the oldest frames go first, a refill decodes them again.
    while (this.lumaCache.size > SEG.frameCache) { const first = this.lumaCache.keys().next().value!; this.lumaCache.delete(first); this.cellCache.delete(first); }
    const big = need1024 ? draw(this.big) : undefined;
    this.prof.decodeMs += performance.now() - t0;
    this.prof.decodes++;
    return { luma: Float32Array.from(luma, (x) => x / 255), rgba1024: big };
  }

  /** A single prompted frame on a throwaway bank (the exclude tap's own mask). */
  private async oneShot(k: number, pts: [number, number][]): Promise<Float32Array> {
    const { rgba1024 } = await this.pixels(k, true);
    await this.model.encode(rgba1024!);
    const r = await this.model.step("oneshot", frameIndex(k, SEG.fps), pts.map(([u, v]) => [u * 1024, v * 1024]), pts.map(() => 1), false);
    this.model.drop("oneshot");
    this.lastEncoded = NaN;
    return sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
  }

  // ------------------------------------------------------------------ the loop

  private lastEncoded = NaN;

  /** Tracker steps done and to do: the current objects' plus, for segments not seeded yet, as many as the last one. */
  private progress(): [number, number] {
    let left = 0, autosNow = 0;
    for (const s of this.objs.values()) { left += s.fwd.length - s.fi + s.bwd.length - s.bi; if (s.auto) autosNow++; }
    const per = Math.max(1, autosNow) * Math.max(1, Math.round(SEG.segmentS * SEG.fps));
    for (let k = 0; k < this.segStarts.length; k++) if (!this.seeded.has(k)) left += per;
    if (!this.segStarts.length) left += per;
    return [this.stepsDone, this.stepsDone + left];
  }

  private nextOf(s: ObjState): number | null {
    if (s.fi < s.fwd.length && (s.bi >= s.bwd.length || s.fi <= s.bi)) return s.fwd[s.fi];
    return s.bi < s.bwd.length ? s.bwd[s.bi] : null;
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.closed) {
        const op = this.ops.shift();
        if (op) { await op(); await yieldNow(); continue; }
        const uk = this.urgent.shift();
        if (uk !== undefined) { await this.fill(uk); await yieldNow(); continue; }
        // Taps first, newest first.
        const tap = [...this.objs.values()].filter((s) => !s.auto && this.nextOf(s) !== null).sort((a, b) => b.o.id - a.o.id)[0];
        if (tap) {
          await this.stepObject(tap);
          const ki = this.keys.indexOf(this.lastStepT);
          await this.fillNow(ki);
          this.postKeys();
          this.ev.progress(...this.progress());
          await yieldNow();
          continue;
        }
        // Autos in lockstep: the earliest keyframe any auto is due at; past a segment start, its seeds first.
        const autos = [...this.objs.values()].filter((s) => s.auto && this.nextOf(s) !== null);
        const t = autos.length ? Math.min(...autos.map((s) => this.nextOf(s)!)) : Infinity;
        const k = this.nextSegment(t);
        if (k !== null) {
          if (!this.seeded.has(k)) {
            if (this.asked !== k) { this.asked = k; this.waitSince = performance.now(); this.ev.needSeeds(k, this.segStarts[k]); }
            break;
          }
          await yieldNow();
          continue;
        }
        if (autos.length) {
          // Newer first: at a segment start the new seeds step before the autos they may replace.
          const batch = autos.filter((s) => Math.abs(this.nextOf(s)! - t) < 1e-6).sort((a, b) => b.o.id - a.o.id);
          for (const s of batch) await this.stepObject(s);
          this.carryOver(t, batch);
          const ki = this.keys.indexOf(t);
          if (ki > 0) this.dirty.add(ki - 1);
          if (ki >= 0) this.dirty.add(ki);
          await this.fillReady();
          this.postKeys();
          this.ev.progress(...this.progress());
        } else if (this.dirty.size) {
          const ki = [...this.dirty].sort((a, b) => a - b)[0];
          this.dirty.delete(ki);
          await this.fill(ki);
        } else break;
        await yieldNow();
      }
    } finally {
      this.running = false;
      if (!this.closed && !this.waiting) this.ev.idle(this.profile());
    }
  }

  /**
   * The segment whose seeds tracking needs before going on: the first unseeded segment starting at or before t
   * (the next auto keyframe), or, with no autos left, the next unseeded one. Null when tracking can go on.
   */
  private nextSegment(t: number): number | null {
    if (!this.segStarts.length) return null;
    for (let k = 0; k < this.segStarts.length; k++) {
      if (this.seeded.has(k)) continue;
      if (this.segStarts[k] <= t + 1e-6) return k;
      return t === Infinity ? k : null;
    }
    return null;
  }

  /**
   * At a segment start: an auto of an earlier segment that ended here carries on through this segment when the new
   * seeds do not cover it (less than SEG.carryCover of its mask under theirs); else it stops.
   */
  private carryOver(t: number, batch: ObjState[]): void {
    const k = this.segStarts.findIndex((s) => Math.abs(s - t) < 1e-6);
    if (k <= 0) return;
    const seeds = batch.filter((s) => s.seg === k && s.fi === 1);
    const n = this.mw * this.mh, cover = new Uint8Array(n);
    for (const s of seeds) { const m = this.key(s, t); if (m) for (let i = 0; i < n; i++) if (m[i] > 127) cover[i] = 1; }
    const t1 = this.segStarts[k + 1] ?? this.keys[this.keys.length - 1];
    for (const s of batch) {
      if (s.seg >= k || s.fi < s.fwd.length) continue;
      const m = this.key(s, t);
      let a = 0, c = 0;
      if (m) for (let i = 0; i < n; i++) if (m[i] > 127) { a++; if (cover[i]) c++; }
      if (a > SEG.guardMinArea * n && c < SEG.carryCover * a) {
        s.fwd = [...s.fwd, ...this.keys.filter((x) => x > t + 1e-6 && x <= t1 + 1e-6)];
        s.seg = k;
      } else this.model.drop(`${s.o.id}f`);
    }
    if (![...this.objs.values()].some((s) => s.auto && s.seg === k && this.nextOf(s) !== null)) this.reacquire(k);
  }

  private lastStepT = NaN;

  private async stepObject(s: ObjState): Promise<void> {
    // Alternate forward and backward (the prompt keyframe is the forward list's first; backward starts after it).
    const goFwd = s.fi < s.fwd.length && (s.bi >= s.bwd.length || s.fi <= s.bi);
    const list = goFwd ? s.fwd : s.bwd, idx = goFwd ? s.fi : s.bi, t = list[idx];
    this.lastStepT = t;
    const reverse = !goFwd, key = `${s.o.id}${goFwd ? "f" : "b"}`;
    const { luma, rgba1024 } = await this.pixels(t, t !== this.lastEncoded);
    if (t !== this.lastEncoded) { await this.model.encode(rgba1024!); this.lastEncoded = t; }
    // Each direction's bank starts with the prompted keyframe (its conditioning frame), as in the batch pass.
    const first = idx === 0;
    let pts: [number, number][] | null = null, labels: number[] | null = null;
    if (first) {
      const p = s.o.prompt;
      pts = p.points.map(([u, v]) => [u * 1024, v * 1024]);
      labels = p.labels.slice();
      if (p.box) { pts = [[p.box.x0 * 1024, p.box.y0 * 1024], [p.box.x1 * 1024, p.box.y1 * 1024], ...pts]; labels = [2, 3, ...labels]; }
    }
    let r = await this.model.step(key, frameIndex(t, SEG.fps), pts, labels, reverse);
    let m = sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
    this.stepsDone++;
    if (first && !s.auto && s.o.kind === "include" && area(m) > SEG.maxTapArea * this.mw * this.mh) {
      // A tap on open water: the model's mask is the background. Drop the object (nothing was filled from it yet).
      this.objs.delete(s.o.id);
      this.model.drop(`${s.o.id}f`);
      this.model.drop(`${s.o.id}b`);
      this.ev.rejected(s.o.id);
      return;
    }
    const prev = goFwd ? s.prevF : s.prevB;
    let reprompts = 0, agree = 1;
    if (prev && !first) {
      const tg = performance.now();
      const fl = denseFlow(gray(luma, this.mw, this.mh), gray(prev.luma, this.mw, this.mh));
      const carried = warp(prev.m, fl);
      this.prof.guardMs += performance.now() - tg;
      const ca = area(carried);
      if (ca > SEG.guardMinArea * this.mw * this.mh) {
        if (area(m) < SEG.guardShare * ca) {
          const pr = promptFromMask(carried, this.mw, this.mh, this.mw / 640);
          if (pr) {
            const P: [number, number][] = [...pr.pos, ...pr.neg].map(([x, y]) => [((x + 0.5) / this.mw) * 1024, ((y + 0.5) / this.mh) * 1024]);
            r = await this.model.step(key, frameIndex(t, SEG.fps), P, [...pr.pos.map(() => 1), ...pr.neg.map(() => 0)], reverse);
            m = sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
            reprompts = 1;
          }
        }
        agree = iou(m, carried);
      }
    }
    if (goFwd) { s.prevF = { m, luma }; s.fi++; } else { s.prevB = { m, luma }; s.bi++; }
    const conf = reprompts ? 0.5 : (r.score > 0 ? Math.min(1, Math.max(0, (r.score + 1) / 3)) : 0) * (agree < 1 ? Math.min(1, Math.max(0, (agree - 0.3) / 0.4)) : 1);
    const mu = toU8(m);
    s.keys.set(t, rleEncode(mu));
    if (area(mu, 127) > 0) s.shown.add(t); else s.shown.delete(t);
    s.conf.set(t, conf);
    if (!s.auto && (goFwd ? s.fi >= s.fwd.length : s.bi >= s.bwd.length)) this.model.drop(key);
    // Taps: the intervals on either side of t are filled right away (the caller); autos: once both ends are final.
    const ki = this.keys.indexOf(t);
    if (ki > 0) this.dirty.add(ki - 1);
    if (ki >= 0) this.dirty.add(ki);
  }

  /** Fills the intervals around keyframe ki right away (the rest wait in `dirty`). */
  private async fillNow(ki: number): Promise<void> {
    for (const k of [ki, ki - 1]) if (k >= 0 && this.dirty.has(k)) { this.dirty.delete(k); await this.fill(k); }
  }

  /** Fills every dirty interval no object will step at either end any more (each is filled once, with final keys). */
  private async fillReady(): Promise<void> {
    const pending = new Set<number>();
    for (const s of this.objs.values()) {
      for (let i = s.fi; i < s.fwd.length; i++) pending.add(this.keys.indexOf(s.fwd[i]));
      for (let i = s.bi; i < s.bwd.length; i++) pending.add(this.keys.indexOf(s.bwd[i]));
    }
    for (const k of [...this.dirty].sort((a, b) => a - b)) {
      if (pending.has(k) || pending.has(k + 1)) continue;
      this.dirty.delete(k);
      await this.fill(k);
    }
  }

  private markObject(s: ObjState): void {
    const ts = [...s.keys.keys()];
    if (!ts.length) return;
    const lo = this.keys.indexOf(Math.min(...ts)), hi = this.keys.indexOf(Math.max(...ts));
    const ks: number[] = [];
    for (let k = Math.max(0, lo - 1); k <= hi; k++) { this.dirty.delete(k); ks.push(k); }
    const at = this.keys.indexOf(s.o.t);
    ks.sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
    this.urgent = [...ks, ...this.urgent.filter((k) => !ks.includes(k))];
  }

  private union(t: number): { inc: Float32Array; exc: Float32Array | null; any: boolean } {
    const n = this.mw * this.mh, inc = new Float32Array(n);
    let exc: Float32Array | null = null, any = false;
    for (const s of this.objs.values()) {
      const m = this.key(s, t);
      if (!m) continue;
      any = true;
      if (s.o.kind === "include") { for (let i = 0; i < n; i++) inc[i] = Math.max(inc[i], m[i] / 255); }
      else { exc ??= new Float32Array(n); for (let i = 0; i < n; i++) exc[i] = Math.max(exc[i], m[i] / 255); }
    }
    return { inc, exc, any };
  }

  /** Fills interval ki (keys[ki] up to keys[ki + 1]) and posts its frames. */
  private async fill(ki: number): Promise<void> {
    const ta = this.keys[ki], tb = this.keys[ki + 1];
    if (ta === undefined) return;
    const A = this.union(ta), B = tb !== undefined ? this.union(tb) : null;
    const idx: number[] = [];
    for (let i = 0; i < this.grid.n; i++) {
      const t = (this.grid.i0 + i) / SEG.sampleHz;
      // The last keyframe holds (flow-carried) to the end of the clip.
      if (t >= ta - 1e-6 && (tb === undefined || t < tb - 1e-6)) idx.push(i);
    }
    if (!idx.length) return;
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
      out.push(this.product(i, inc, e));
    });
    this.prof.fillMs += t1 - t0;
    this.prof.productMs += performance.now() - t1;
    this.prof.filledFrames += idx.length;
    this.ev.frames(out);
  }

  /** The overlay-ready maps of one frame (feather, near, exclude, water departure; see track.ts SegTrack.at). */
  private product(i: number, incRaw: Float32Array, excRaw: Float32Array | null): SessionFrameOut {
    const { mw: w, mh: h } = this;
    const bb = bbox(incRaw, w, h);
    if (!bb && !excRaw) {
      // Nothing here: an empty frame (coded in a few bytes; the overlay is then the engine's alone).
      const z = new Uint8Array(w * h), zq = new Uint8Array(qsize(w) * qsize(h));
      return { i, alpha: rleEncode(z), nearQ: rleEncode(zq), excQ: null, depQ: rleEncode(zq.fill(255)) };
    }
    const diag = bb ? Math.hypot(bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1) : 0;
    const r = Math.max(SEG.featherMinPx, SEG.featherShare * diag);
    const inc = sdfFeather(incRaw, w, h, SEG.alphaR), exc = excRaw ? sdfFeather(excRaw, w, h, SEG.alphaR) : null;
    const alpha = new Uint8Array(w * h);
    for (let k = 0; k < alpha.length; k++) alpha[k] = Math.round(255 * Math.min(1, Math.max(0, inc[k] * (exc ? 1 - exc[k] : 1))));
    const nr = Math.max(2, Math.round(SEG.nearK * r));
    const near = nearMap(incRaw, w, h, nr);
    const cells = this.cellCache.get(i);
    const depQ = cells ? departFromCells(cells, toU8(incRaw), w, h).data : new Uint8Array(qsize(w) * qsize(h)).fill(255);
    return { i, alpha: rleEncode(alpha), nearQ: rleEncode(quarter(near, w, h, 4)), excQ: exc ? rleEncode(quarter(exc, w, h, 1)) : null, depQ: rleEncode(depQ) };
  }

  private postKeys(): void {
    const out: { t: number; conf: number }[] = [];
    // Area-weighted over the shown subjects (the overlay is their union): a small fish leaving the frame with a low
    // confidence must not dim the big animal's pop (the minimum did, and the pop blinked with it).
    const n = this.mw * this.mh;
    for (const t of this.keys) {
      let num = 0, den = 0;
      for (const s of this.objs.values()) {
        if (s.o.kind !== "include" || !s.shown.has(t)) continue;
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
    return { ...this.prof, encodeMs: m.encode, encodes: m.encodes, attendMs: m.attend, decoderMs: m.decoder, memEncMs: m.memEnc, steps: m.steps, keyframes: this.keys.length };
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
