// AI subject detection, background session (runs in seg-worker.ts, next to the model). It owns an independent
// decoder over the clip (openSampleReader: WebCodecs, never the playing <video>), the per-object keyframe masks and
// the per-frame fill, so the AI pass runs while the clip plays and the main thread only looks finished masks up.
//
// - Objects (the engine's own subjects, include taps, exclude taps) are tracked by the EdgeTAM memory tracker on the
//   6 Hz keyframe grid, outward from their prompt keyframe (forward and backward alternately, so the frames near a
//   tap come first), with the flow guard of the batch pass (track.ts). The newest object runs first.
// - After every keyframe the two intervals around it are filled again from the current per-object keyframes (union
//   of includes, union of excludes; per-frame flow both ways, guided filter on each frame's luma: fillInterval) and
//   every filled frame is posted as overlay-ready 8-bit maps: the feathered alpha, the "near" region, the excludes
//   and the water-departure map (studio-seg.ts SegLive turns them into the engine's overlay).
// - An exclude tap on an ML subject removes the subject when the tap's own mask is most of it (cleanly, restorable
//   for undo), else it is followed as an exclude object (only the tapped part comes out).
import type { EdgeTam } from "./edgetam.ts";
import { frameIndex } from "./bank.ts";
import { cellLab, nearMap, departFromCells, sdfFeather, area, bbox, guidedFilter, iou, promptFromMask } from "./mask.ts";
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
export type SessionFrameOut = { i: number; alpha: Uint8Array; nearQ: Uint8Array; excQ: Uint8Array | null; depQ: Uint8Array };
export type SessionEvents = {
  frames(items: SessionFrameOut[]): void;
  keys(conf: { t: number; conf: number }[]): void;
  progress(done: number, total: number): void;
  idle(): void;
  /** A tapped include that came out as the background (the tap missed the animal): dropped. */
  rejected(id: number): void;
};

type ObjState = {
  o: SegObject & { id: number };
  /** Keyframe time → probability (0..255) on the mask grid. */
  keys: Map<number, Uint8Array>;
  conf: Map<number, number>;
  fwd: number[];
  bwd: number[];
  fi: number;
  bi: number;
  prevF: { m: Float32Array; luma: Float32Array } | null;
  prevB: { m: Float32Array; luma: Float32Array } | null;
  dropped: boolean;
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

  add(o: SegObject & { id: number }): void {
    const t = this.snap(o.t), reach = SEG.reachS;
    const near = this.keys.filter((k) => Math.abs(k - t) <= reach + 1e-6);
    this.objs.set(o.id, {
      o: { ...o, t }, keys: new Map(), conf: new Map(), fi: 0, bi: 0, prevF: null, prevB: null, dropped: false,
      fwd: near.filter((k) => k >= t - 1e-6), bwd: near.filter((k) => k <= t + 1e-6).reverse(),
    });
    void this.run();
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

  /** The include object whose mask covers (u, v) at the keyframe nearest t, if any. */
  objectAt(t: number, u: number, v: number): ObjState | null {
    const k = this.snap(t), x = Math.min(this.mw - 1, Math.floor(u * this.mw)), y = Math.min(this.mh - 1, Math.floor(v * this.mh));
    let best: ObjState | null = null, bp = 127;
    for (const s of this.objs.values()) {
      if (s.o.kind !== "include") continue;
      const m = s.keys.get(k);
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
    const om = o.keys.get(k)!;
    let inter = 0, oa = 0;
    for (let i = 0; i < om.length; i++) { const a = om[i] > 127; if (a) { oa++; if (m[i] > 0.5) inter++; } }
    if (oa && inter / oa >= 0.5) {
      this.remove(o.o.id);
      return { action: "removed", removed: o.o.id };
    }
    this.add({ id, kind: "exclude", t, prompt: { points: [[u, v]], labels: [1] } });
    return { action: "part" };
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
    // A bounded cache (~100 KB a frame): the oldest frames go first, a refill decodes them again.
    while (this.lumaCache.size > 480) { const first = this.lumaCache.keys().next().value!; this.lumaCache.delete(first); this.cellCache.delete(first); }
    return { luma: Float32Array.from(luma, (x) => x / 255), rgba1024: need1024 ? draw(this.big) : undefined };
  }

  /** A single prompted frame on a throwaway bank (the exclude tap's own mask). */
  private async oneShot(k: number, pts: [number, number][]): Promise<Float32Array> {
    const { rgba1024 } = await this.pixels(k, true);
    await this.model.encode(rgba1024!);
    const r = await this.model.step("oneshot", frameIndex(k), pts.map(([u, v]) => [u * 1024, v * 1024]), pts.map(() => 1), false);
    this.model.drop("oneshot");
    this.lastEncoded = NaN;
    return sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
  }

  // ------------------------------------------------------------------ the loop

  private lastEncoded = NaN;

  /** Tracker steps done and to do (all current objects). */
  private progress(): [number, number] {
    let d = 0, n = 0;
    for (const s of this.objs.values()) { d += s.fi + s.bi; n += s.fwd.length + s.bwd.length; }
    return [d, n];
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.closed) {
        // The newest object with keyframes left goes first (a tap preempts the background).
        const op = this.ops.shift();
        if (op) { await op(); await yieldNow(); continue; }
        const uk = this.urgent.shift();
        if (uk !== undefined) { await this.fill(uk); await yieldNow(); continue; }
        const job = [...this.objs.values()].filter((s) => s.fi < s.fwd.length || s.bi < s.bwd.length).sort((a, b) => b.o.id - a.o.id)[0];
        if (job) {
          await this.stepObject(job);
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
      if (!this.closed) this.ev.idle();
    }
  }

  private async stepObject(s: ObjState): Promise<void> {
    // Alternate forward and backward (the prompt keyframe is the forward list's first; backward starts after it).
    const goFwd = s.fi < s.fwd.length && (s.bi >= s.bwd.length || s.fi <= s.bi);
    const list = goFwd ? s.fwd : s.bwd, idx = goFwd ? s.fi : s.bi, t = list[idx];
    const reverse = !goFwd, key = `${s.o.id}${goFwd ? "f" : "b"}`;
    const { luma, rgba1024 } = await this.pixels(t, true);
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
    let r = await this.model.step(key, frameIndex(t), pts, labels, reverse);
    let m = sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
    if (first && s.o.kind === "include" && area(m) > SEG.maxTapArea * this.mw * this.mh) {
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
      const fl = denseFlow(gray(luma, this.mw, this.mh), gray(prev.luma, this.mw, this.mh));
      const carried = warp(prev.m, fl);
      const ca = area(carried);
      if (ca > SEG.guardMinArea * this.mw * this.mh) {
        if (area(m) < SEG.guardShare * ca) {
          const pr = promptFromMask(carried, this.mw, this.mh, this.mw / 640);
          if (pr) {
            const P: [number, number][] = [...pr.pos, ...pr.neg].map(([x, y]) => [((x + 0.5) / this.mw) * 1024, ((y + 0.5) / this.mh) * 1024]);
            r = await this.model.step(key, frameIndex(t), P, [...pr.pos.map(() => 1), ...pr.neg.map(() => 0)], reverse);
            m = sigmoidResize(r.logits, r.lw, r.lh, this.mw, this.mh);
            reprompts = 1;
          }
        }
        agree = iou(m, carried);
      }
    }
    if (goFwd) { s.prevF = { m, luma }; s.fi++; } else { s.prevB = { m, luma }; s.bi++; }
    const conf = reprompts ? 0.5 : (r.score > 0 ? Math.min(1, Math.max(0, (r.score + 1) / 3)) : 0) * (agree < 1 ? Math.min(1, Math.max(0, (agree - 0.3) / 0.4)) : 1);
    s.keys.set(t, toU8(m));
    s.conf.set(t, conf);
    if ((goFwd ? s.fi >= s.fwd.length : s.bi >= s.bwd.length)) this.model.drop(key);
    // The intervals on either side of t are filled again now (the frames near a tap update within a few steps).
    const ki = this.keys.indexOf(t);
    if (ki > 0) this.dirty.add(ki - 1);
    if (ki >= 0) this.dirty.add(ki);
    await this.fillNow(ki);
    this.postKeys();
  }

  /** Fills the intervals around keyframe ki right away (the rest wait in `dirty`). */
  private async fillNow(ki: number): Promise<void> {
    for (const k of [ki, ki - 1]) if (k >= 0 && this.dirty.has(k)) { this.dirty.delete(k); await this.fill(k); }
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
      const m = s.keys.get(t);
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
      if (t >= ta - 1e-6 && (tb !== undefined ? t < tb - 1e-6 : t <= ta + 1e-6)) idx.push(i);
    }
    if (!idx.length) return;
    const lumas: Float32Array[] = [];
    for (const i of idx) lumas.push((await this.pixels((this.grid.i0 + i) / SEG.sampleHz, false)).luma);
    const lumaA = (await this.pixels(ta, false)).luma;
    const ka: Keyframe = { t: ta, inc: A.inc, exc: A.exc, luma: lumaA, conf: 1, reprompts: 0, score: 0 };
    const kb: Keyframe | null = B && tb !== undefined ? { t: tb, inc: B.inc, exc: B.exc, luma: (await this.pixels(tb, false)).luma, conf: 1, reprompts: 0, score: 0 } : null;
    const filled = fillInterval(ka, kb, idx.map((i) => (this.grid.i0 + i) / SEG.sampleHz), lumas, this.mw, this.mh, !!(A.exc || B?.exc));
    const gr = Math.max(1, Math.round(SEG.guidedR * this.mw / 640));
    const out: SessionFrameOut[] = [];
    idx.forEach((i, j) => {
      const inc = guidedFilter(lumas[j], remap(filled[j].inc), this.mw, this.mh, gr, SEG.guidedEps);
      const e = filled[j].exc ? guidedFilter(lumas[j], remap(filled[j].exc!), this.mw, this.mh, gr, SEG.guidedEps) : null;
      out.push(this.product(i, inc, e));
    });
    this.ev.frames(out);
  }

  /** The overlay-ready maps of one frame (feather, near, exclude, water departure; see track.ts SegTrack.at). */
  private product(i: number, incRaw: Float32Array, excRaw: Float32Array | null): SessionFrameOut {
    const { mw: w, mh: h } = this;
    const bb = bbox(incRaw, w, h);
    const diag = bb ? Math.hypot(bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1) : 0;
    const r = Math.max(SEG.featherMinPx, SEG.featherShare * diag);
    const inc = sdfFeather(incRaw, w, h, r), exc = excRaw ? sdfFeather(excRaw, w, h, r) : null;
    const alpha = new Uint8Array(w * h);
    for (let k = 0; k < alpha.length; k++) alpha[k] = Math.round(255 * Math.min(1, Math.max(0, inc[k] * (exc ? 1 - exc[k] : 1))));
    const nr = Math.max(2, Math.round(SEG.nearK * r));
    const near = nearMap(incRaw, w, h, nr);
    const cells = this.cellCache.get(i);
    const depQ = cells ? departFromCells(cells, toU8(incRaw), w, h).data : new Uint8Array(qsize(w) * qsize(h)).fill(255);
    return { i, alpha, nearQ: quarter(near, w, h, 4), excQ: exc ? quarter(exc, w, h, 1) : null, depQ };
  }

  private postKeys(): void {
    const out: { t: number; conf: number }[] = [];
    for (const t of this.keys) {
      let c = 1, seen = false;
      for (const s of this.objs.values()) {
        if (s.o.kind !== "include") continue;
        const k = s.keys.get(t), cf = s.conf.get(t);
        if (k && cf !== undefined && area(k, 127) > 0) { c = Math.min(c, cf); seen = true; }
      }
      if (seen) out.push({ t, conf: c });
    }
    this.ev.keys(out);
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
