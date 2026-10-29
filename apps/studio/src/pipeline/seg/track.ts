// AI subject detection, the track pass and the mask at any clip time (Subject pop, `seg`).
//
// Pass (runPass): every prompted subject is followed by the EdgeTAM memory tracker over keyframes 6 per clip second
// (frame index = 30 Hz frame number, see bank.ts), forward and back from its prompt. Between two keyframes of one
// direction a flow guard compares the tracker's mask with the previous keyframe's mask carried along optical flow:
// a tracker that dropped a subject the flow still sees (< 25% of the carried area) is re-prompted on that frame from
// the carried mask (points inside, negatives on a ring outside). Each keyframe keeps the union of the includes and
// of the excludes (edge-snapped by a guided filter on the keyframe's luma), the luma itself (for flow) and a
// confidence (object score, agreement with the carried mask, re-prompts).
//
// Fill: every frame between two keyframes (a 30 Hz grid of clip time) is read too (luma only) and the keyframe masks
// are carried to it along per-frame optical flow, forward from the keyframe before and backward from the one after,
// and cross-faded by time (the prototype's bidirectional fill); the result is edge-snapped by a guided filter on
// that frame's own luma and kept as 8-bit masks. Per-frame flow follows the real motion (camera bob, a turning
// animal), which a straight line between keyframes does not.
//
// Mask at clip time t (SegTrack.at): a lookup of the filled frames, so preview and export read the same pure function
// of the clip and the prompts (the export stays deterministic). The forgiving look: the alpha is feathered by 2–4%
// of the subject's size, a "near" map says where the ML mask replaces the engine's, and the ML weight follows a
// confidence curve that eases down and back up over ~0.4 s around any doubtful keyframe (symmetric: the pass has
// seen the future).

import { assembleMemory, frameIndex, isEmpty, newBank, pruneBank, storeMemory, type MemEntry, type MemoryInputs, type ObjectBank } from "./bank.ts";
import { denseFlow, warp, type Flow, type Gray } from "./flow.ts";
import { area, bbox, boxMean, feather, guidedFilter, iou, promptFromMask, resize, smoothstep } from "./mask.ts";

export const SEG = {
  /** Keyframes per clip second. */
  fps: 6,
  /** Mask grid: longest side (px). */
  maskLong: 320,
  /** Follow a subject at most this far either side of its prompt (s). */
  reachS: 20,
  /** Flow guard: re-prompt when the tracker keeps less than this share of the carried mask... */
  guardShare: 0.25,
  /** ...of a carried mask at least this share of the frame. */
  guardMinArea: 0.001,
  /** Probability remap before the guided filter: drop sub-threshold haze, keep the 0.5 contour. */
  remapLo: 0.15,
  remapSpan: 0.7,
  /** Guided filter radius (px at 640; scaled) and epsilon. */
  guidedR: 4,
  guidedEps: 2e-3,
  /** Feather: share of the subject's bounding-box diagonal, clamped to minPx (mask px). */
  featherShare: 0.03,
  featherMinPx: 1.5,
  /** The ML mask replaces the engine's within this many feather radii of the subject. */
  nearK: 3,
  /** Confidence curve: dips widen over ±erodeS, then a raised-cosine average over ±easeS (ease down and up). */
  erodeS: 0.2,
  easeS: 0.4,
  /** Beyond the first / last keyframe the ML weight fades out over this long (s). */
  edgeFadeS: 0.25,
  /** Filled frames per clip second (the mask grid in time). */
  sampleHz: 30,
  /** The fill's per-frame flow runs at this share of the mask grid. */
  fillFlowScale: 0.5,
  /** Share of an ML step one filled frame counts for in the progress. */
  fillCost: 0.25,
};

export type SegPrompt = { points: [number, number][]; labels: number[]; box?: { x0: number; y0: number; x1: number; y1: number } };
/** A subject to follow: include (pop it) or exclude (never pop it); prompt in upright uv (0..1) at clip time t. */
export type SegObject = { kind: "include" | "exclude"; t: number; prompt: SegPrompt };

export type StepResult = { logits: Float32Array; lw: number; lh: number; score: number; iou: number };
/** The model side (a worker in the app, the same worker in the eval page). */
export interface SegModel {
  /** Encodes the frame for the following steps (RGBA 1024×1024, stretched from the upright frame). */
  encode(rgba: Uint8ClampedArray): Promise<void>;
  /** One tracker step of session `key` on the encoded frame. Points in 1024² model space, labels 1/0/2/3. */
  step(key: string, frame: number, points: [number, number][] | null, labels: number[] | null, reverse: boolean): Promise<StepResult>;
  drop(key: string): Promise<void>;
}

/** One frame for the pass: the model input (not needed for a filled frame) and the luma on the mask grid. */
export type PassFrame = { rgba1024?: Uint8ClampedArray; luma: Uint8Array };
export type FrameSource = (t: number, lumaOnly?: boolean) => Promise<PassFrame>;

/** A keyframe: the tracker's probabilities (union of includes / excludes), its luma and its confidence. */
export type Keyframe = {
  t: number;
  inc: Float32Array;
  exc: Float32Array | null;
  luma: Float32Array;
  conf: number;
  /** Diagnostics */
  reprompts: number;
  score: number;
};

export function maskSize(width: number, height: number, long = SEG.maskLong): [number, number] {
  const s = long / Math.max(width, height);
  return [Math.max(8, Math.round(width * s)), Math.max(8, Math.round(height * s))];
}

/** Keyframe times inside [start, end] (k / fps) plus the prompt times, sorted, unique. */
export function keyTimes(start: number, end: number, extra: number[] = [], fps = SEG.fps): number[] {
  const out = new Set<number>();
  for (let k = Math.ceil(start * fps - 1e-6); k / fps <= end + 1e-6; k++) out.add(+(k / fps).toFixed(6));
  for (const t of extra) if (t >= start - 1e-6 && t <= end + 1e-6) out.add(+t.toFixed(6));
  return [...out].sort((a, b) => a - b);
}

function sigmoidResize(lg: Float32Array, lw: number, lh: number, w: number, h: number): Float32Array {
  const r = resize(lg, lw, lh, w, h);
  for (let i = 0; i < r.length; i++) r[i] = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, r[i]))));
  return r;
}

function toModel(p: [number, number][]): [number, number][] {
  return p.map(([u, v]) => [u * 1024, v * 1024]);
}

export type PassOptions = {
  objects: SegObject[];
  start: number;
  end: number;
  width: number;
  height: number;
  source: FrameSource;
  model: SegModel;
  onProgress?: (done: number, total: number) => void;
  /** Stop early (a newer pass, an export, a closed clip). */
  cancelled?: () => boolean;
  /** Per-step timing callback (seconds), for the "too slow" fallback and the speed report. */
  onTiming?: (s: { encodeMs: number; stepMs: number }) => void;
  reachS?: number;
  /** The tracked keyframes before the fill (evals keep them to re-fill corrupted copies). */
  onKeyframes?: (K: Keyframe[]) => void;
};

type PerKey = { inc: Float32Array | null; exc: Float32Array | null; luma: Float32Array; conf: number; reprompts: number; score: number };

/** Runs the pass; resolves to the keyframes (null when cancelled). */
export async function runPass(o: PassOptions): Promise<SegTrack | null> {
  const [mw, mh] = maskSize(o.width, o.height);
  const reach = o.reachS ?? SEG.reachS;
  const keys = keyTimes(o.start, o.end, o.objects.map((x) => x.t));
  const per = new Map<number, PerKey>();
  // Subjects prompted at the same time and direction share each keyframe's encode (the expensive part).
  type Member = { ob: SegObject; key: string; prev: { m: Float32Array; luma: Float32Array } | null };
  const groups = new Map<string, { list: number[]; reverse: boolean; members: Member[] }>();
  o.objects.forEach((ob, i) => {
    const near = keys.filter((t) => Math.abs(t - ob.t) <= reach + 1e-6);
    for (const reverse of [false, true]) {
      const list = reverse ? near.filter((t) => t <= ob.t + 1e-6).reverse() : near.filter((t) => t >= ob.t - 1e-6);
      if (!list.length) continue;
      const gk = `${reverse ? "b" : "f"}|${ob.t}`;
      const g = groups.get(gk) ?? { list, reverse, members: [] };
      g.members.push({ ob, key: `${i}${reverse ? "b" : "f"}`, prev: null });
      groups.set(gk, g);
    }
  });
  const span = sampleRange(Math.min(...keys), Math.max(...keys));
  const total = [...groups.values()].reduce((s, g) => s + g.list.length * g.members.length, 0) + SEG.fillCost * (span.n + 1);
  let done = 0;
  let lastEncoded = NaN;
  const lumaCache = new Map<number, Float32Array>();
  const dropAll = async () => { for (const g of groups.values()) for (const mb of g.members) await o.model.drop(mb.key); };
  for (const g of groups.values()) {
    const { list, reverse } = g;
    for (const t of list) {
      if (o.cancelled?.()) { await dropAll(); return null; }
      const t0 = performance.now();
      let luma = lumaCache.get(t);
      if (t !== lastEncoded || !luma) {
        const fr = await o.source(t);
        if (!fr.rgba1024) throw new Error("frame source returned no model input");
        await o.model.encode(fr.rgba1024);
        lastEncoded = t;
        luma = Float32Array.from(fr.luma, (x) => x / 255);
        lumaCache.set(t, luma);
      }
      let encodeMs = performance.now() - t0;
      const fi = frameIndex(t);
      const first = t === list[0];
      for (const mb of g.members) {
        const t1 = performance.now();
        let pts: [number, number][] | null = null, labels: number[] | null = null;
        if (first) {
          const p = mb.ob.prompt;
          pts = toModel(p.points);
          labels = p.labels.slice();
          // Box as two corner points (labels 2, 3), ahead of the points (SAM 2 order).
          if (p.box) { pts = [...toModel([[p.box.x0, p.box.y0], [p.box.x1, p.box.y1]]), ...pts]; labels = [2, 3, ...labels]; }
        }
        let r = await o.model.step(mb.key, fi, pts, labels, reverse);
        let m = sigmoidResize(r.logits, r.lw, r.lh, mw, mh);
        let reprompts = 0, agree = 1;
        if (!first && mb.prev) {
          const fl = denseFlow(gray(luma, mw, mh), gray(mb.prev.luma, mw, mh));
          const carried = warp(mb.prev.m, fl);
          const ca = area(carried);
          if (ca > SEG.guardMinArea * mw * mh) {
            if (area(m) < SEG.guardShare * ca) {
              const pr = promptFromMask(carried, mw, mh, mw / 640);
              if (pr) {
                const P: [number, number][] = [...pr.pos, ...pr.neg].map(([x, y]) => [((x + 0.5) / mw) * 1024, ((y + 0.5) / mh) * 1024]);
                r = await o.model.step(mb.key, fi, P, [...pr.pos.map(() => 1), ...pr.neg.map(() => 0)], reverse);
                m = sigmoidResize(r.logits, r.lw, r.lh, mw, mh);
                reprompts = 1;
              }
            }
            agree = iou(m, carried);
          }
        }
        o.onTiming?.({ encodeMs, stepMs: performance.now() - t1 });
        encodeMs = 0;
        mb.prev = { m, luma };
        const conf = reprompts ? 0.5 : (r.score > 0 ? smoothstep(-1, 2, r.score) : 0) * (agree < 1 ? smoothstep(0.3, 0.7, agree) : 1);
        const e = per.get(t) ?? { inc: null, exc: null, luma, conf: 1, reprompts: 0, score: Infinity };
        const visible = area(m) > 0;
        if (mb.ob.kind === "include") {
          e.inc = e.inc ? max(e.inc, m) : m;
          if (visible) { e.conf = Math.min(e.conf, conf); e.score = Math.min(e.score, r.score); }
        } else {
          e.exc = e.exc ? max(e.exc, m) : m;
        }
        e.reprompts += reprompts;
        per.set(t, e);
        o.onProgress?.(++done, total);
      }
    }
    for (const mb of g.members) await o.model.drop(mb.key);
  }
  const K: Keyframe[] = [...per.keys()].sort((a, b) => a - b).map((t) => {
    const e = per.get(t)!;
    return { t, inc: e.inc ?? new Float32Array(mw * mh), exc: e.exc, luma: e.luma, conf: e.conf, reprompts: e.reprompts, score: e.score };
  });
  o.onKeyframes?.(K);
  const base = done;
  return fillTrack(K, mw, mh, o.source, { cancelled: o.cancelled, onProgress: (d) => o.onProgress?.(base + d, total) });
}

/**
 * The fill (see header): reads every grid frame between the first and last keyframe (luma only) and carries the
 * keyframe masks onto it. `onProgress` gets the fill's own progress in ML-step units (SEG.fillCost per frame).
 */
export async function fillTrack(K: Keyframe[], mw: number, mh: number, source: FrameSource, opts: { cancelled?: () => boolean; onProgress?: (done: number) => void } = {}): Promise<SegTrack | null> {
  if (!K.length) return new SegTrack(mw, mh, [], 0, [], []);
  const grid = sampleRange(K[0].t, K[K.length - 1].t);
  const inc: Uint8Array[] = new Array(grid.n), exc: (Uint8Array | null)[] = new Array(grid.n).fill(null);
  const anyExc = K.some((k) => k.exc);
  const gr = Math.max(1, Math.round(SEG.guidedR * mw / 640));
  let done = 0;
  for (let k = 0; k < K.length; k++) {
    const a = K[k], b = K[k + 1] ?? null;
    // Grid samples in [a, b) (the last keyframe's own sample too).
    const idx: number[] = [];
    for (let i = 0; i < grid.n; i++) {
      const t = grid.time(i);
      if (t >= a.t - 1e-6 && (b ? t < b.t - 1e-6 : t <= a.t + 1e-6)) idx.push(i);
    }
    if (!idx.length) continue;
    const lumas: Float32Array[] = [];
    for (const i of idx) {
      if (opts.cancelled?.()) return null;
      const t = grid.time(i);
      if (Math.abs(t - a.t) < 1e-6) lumas.push(a.luma);
      else lumas.push(Float32Array.from((await source(t, true)).luma, (x) => x / 255));
      opts.onProgress?.(done += SEG.fillCost);
    }
    const times = idx.map((i) => grid.time(i));
    const filled = fillInterval(a, b, times, lumas, mw, mh, anyExc);
    idx.forEach((i, j) => {
      inc[i] = toU8(guidedFilter(lumas[j], remap(filled[j].inc), mw, mh, gr, SEG.guidedEps));
      const e = filled[j].exc;
      if (e) exc[i] = toU8(guidedFilter(lumas[j], remap(e), mw, mh, gr, SEG.guidedEps));
    });
  }
  // The keyframes' masks live in the filled frames now; the track keeps their times and confidences.
  const keys = K.map((k) => ({ ...k, inc: new Float32Array(0), exc: null, luma: new Float32Array(0) }));
  return new SegTrack(mw, mh, keys, grid.i0, inc, exc);
}

/** Per-frame flow for the fill, estimated at SEG.fillFlowScale of the mask grid (motion between frames is small). */
function fillFlow(a: Float32Array, b: Float32Array, w: number, h: number): Flow {
  const k = SEG.fillFlowScale;
  if (k >= 1) return denseFlow({ width: w, height: h, data: a }, { width: w, height: h, data: b });
  const sw = Math.max(16, Math.round(w * k)), sh = Math.max(16, Math.round(h * k));
  const f = denseFlow({ width: sw, height: sh, data: resize(a, w, h, sw, sh) }, { width: sw, height: sh, data: resize(b, w, h, sw, sh) });
  const u = new Float32Array(sw * sh), v = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) { u[i] = f.data[i * 2] * (w / sw); v[i] = f.data[i * 2 + 1] * (h / sh); }
  const U = resize(u, sw, sh, w, h), V = resize(v, sw, sh, w, h), d = new Float32Array(w * h * 2);
  for (let i = 0; i < w * h; i++) { d[i * 2] = U[i]; d[i * 2 + 1] = V[i]; }
  return { width: w, height: h, data: d };
}

/** The 30 Hz grid of clip time covering [t0, t1]: sample i is at (i0 + i) / sampleHz. */
export function sampleRange(t0: number, t1: number): { i0: number; n: number; time: (i: number) => number } {
  const hz = SEG.sampleHz, i0 = Math.ceil(t0 * hz - 1e-6), i1 = Math.floor(t1 * hz + 1e-6);
  return { i0, n: Math.max(0, i1 - i0 + 1), time: (i: number) => +((i0 + i) / hz).toFixed(6) };
}

function remap(p: Float32Array): Float32Array {
  const q = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) q[i] = Math.min(1, Math.max(0, (p[i] - SEG.remapLo) / SEG.remapSpan));
  return q;
}

function toU8(m: Float32Array): Uint8Array {
  const o = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) o[i] = Math.round(255 * Math.min(1, Math.max(0, m[i])));
  return o;
}

/**
 * The frames from keyframe `a` up to (not including) keyframe `b` (times[j], lumas[j]; times[0] may be a itself):
 * a's mask carried forward along per-frame flow, b's carried backward, cross-faded by time. Without b (the last
 * keyframe) a's mask is carried forward alone. Probabilities in, probabilities out.
 */
export function fillInterval(a: Keyframe, b: Keyframe | null, times: number[], lumas: Float32Array[], w: number, h: number, withExc: boolean): { inc: Float32Array; exc: Float32Array | null }[] {
  const n = times.length, z = () => new Float32Array(w * h);
  // Forward chain: frame j from frame j-1 (or from a's own frame when a is off the grid).
  const fwd: { inc: Float32Array; exc: Float32Array | null }[] = [];
  let prevL = a.luma, cur = { inc: a.inc, exc: withExc ? a.exc ?? z() : null };
  for (let j = 0; j < n; j++) {
    if (lumas[j] !== prevL) {
      const f = fillFlow(lumas[j], prevL, w, h);
      cur = { inc: warp(cur.inc, f), exc: cur.exc ? warp(cur.exc, f) : null };
      prevL = lumas[j];
    }
    fwd.push(cur);
  }
  if (!b) return fwd;
  // Backward chain from b.
  const bwd: { inc: Float32Array; exc: Float32Array | null }[] = new Array(n);
  let nextL = b.luma, cb = { inc: b.inc, exc: withExc ? b.exc ?? z() : null };
  for (let j = n - 1; j >= 0; j--) {
    if (lumas[j] !== nextL) {
      const f = fillFlow(lumas[j], nextL, w, h);
      cb = { inc: warp(cb.inc, f), exc: cb.exc ? warp(cb.exc, f) : null };
      nextL = lumas[j];
    }
    bwd[j] = cb;
  }
  return fwd.map((F, j) => {
    const wt = (times[j] - a.t) / (b.t - a.t);
    const mix = (p: Float32Array | null, q: Float32Array | null) => {
      if (!p || !q) return null;
      const o = new Float32Array(p.length);
      for (let i = 0; i < o.length; i++) o[i] = (1 - wt) * p[i] + wt * q[i];
      return o;
    };
    return { inc: mix(F.inc, bwd[j].inc)!, exc: mix(F.exc, bwd[j].exc) };
  });
}

function max(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] > b[i] ? a[i] : b[i];
  return o;
}

function gray(l: Float32Array, w: number, h: number): Gray {
  return { width: w, height: h, data: l };
}

export type SegMask = {
  width: number;
  height: number;
  /** Pop alpha (includes minus excludes), feathered, 0..1. */
  alpha: Float32Array;
  /** Excluded subjects, feathered (cuts the engine's own selection too). */
  exclude: Float32Array | null;
  /** Where the ML alpha replaces the engine's subject weight (0..1), times the confidence weight. */
  near: Float32Array;
  /** Confidence weight at this time (0..1). */
  weight: number;
};

/** The pass result: filled 8-bit masks on the 30 Hz grid and the mask at any clip time (pure; deterministic). */
export class SegTrack {
  readonly width: number;
  readonly height: number;
  /** Keyframe times and confidences (their masks live in the filled frames). */
  readonly keys: Keyframe[];
  readonly i0: number;
  readonly inc: Uint8Array[];
  readonly exc: (Uint8Array | null)[];
  constructor(width: number, height: number, keys: Keyframe[], i0: number, inc: Uint8Array[], exc: (Uint8Array | null)[]) {
    this.width = width;
    this.height = height;
    this.keys = keys;
    this.i0 = i0;
    this.inc = inc;
    this.exc = exc;
  }

  get start(): number { return this.keys.length ? this.keys[0].t : 0; }
  get end(): number { return this.keys.length ? this.keys[this.keys.length - 1].t : 0; }
  /** Bytes held (for the memory note in the report). */
  get bytes(): number { return this.inc.reduce((s, m) => s + m.byteLength, 0) + this.exc.reduce((s, m) => s + (m?.byteLength ?? 0), 0); }

  /** Confidence weight at t: keyframe confidences, dips widened (±erodeS) then eased (raised cosine ±easeS). */
  weightAt(t: number): number {
    const K = this.keys;
    if (!K.length) return 0;
    const edge = Math.min(1, Math.max(0, 1 - Math.max(this.start - t, t - this.end, 0) / SEG.edgeFadeS));
    if (edge <= 0) return 0;
    let num = 0, den = 0;
    for (let i = 0; i < K.length; i++) {
      const d = Math.abs(K[i].t - t);
      if (d > SEG.easeS) continue;
      let c = K[i].conf;
      for (let j = i - 1; j >= 0 && K[i].t - K[j].t <= SEG.erodeS + 1e-6; j--) c = Math.min(c, K[j].conf);
      for (let j = i + 1; j < K.length && K[j].t - K[i].t <= SEG.erodeS + 1e-6; j++) c = Math.min(c, K[j].conf);
      const wk = 0.5 + 0.5 * Math.cos((Math.PI * d) / SEG.easeS);
      num += wk * c; den += wk;
    }
    return edge * (den > 0 ? num / den : K[nearestKey(K, t)].conf);
  }

  /** Raw (unfeathered) include / exclude maps at t: the filled frames around t (linear between two samples). */
  rawAt(t: number): { inc: Float32Array; exc: Float32Array | null } | null {
    const n = this.inc.length;
    if (!n) return null;
    const s = Math.min(n - 1, Math.max(0, t * SEG.sampleHz - this.i0));
    const i = Math.min(n - 1, Math.floor(s + 1e-6)), f = s - i;
    const lerp = (A: (Uint8Array | null)[]): Float32Array | null => {
      const p = A[i], q = A[Math.min(n - 1, i + 1)];
      if (!p && !q) return null;
      const o = new Float32Array(this.width * this.height);
      for (let k = 0; k < o.length; k++) o[k] = ((p ? p[k] : 0) * (1 - f) + (q ? q[k] : 0) * f) / 255;
      return o;
    };
    return { inc: lerp(this.inc)!, exc: lerp(this.exc) };
  }

  /** The forgiving mask at clip time t (see header), or null outside the pass. */
  at(t: number): SegMask | null {
    const weight = this.weightAt(t);
    const raw = this.rawAt(t);
    if (!raw) return null;
    const { width: w, height: h } = this;
    const bb = bbox(raw.inc, w, h);
    const diag = bb ? Math.hypot(bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1) : 0;
    const r = Math.max(SEG.featherMinPx, SEG.featherShare * diag);
    const inc = feather(raw.inc, w, h, r);
    const exc = raw.exc ? feather(raw.exc, w, h, r) : null;
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = inc[i] * (exc ? 1 - exc[i] : 1);
    // Near: the include region grown and softened by a wide blur (the engine keeps everything farther out).
    const nr = Math.max(2, Math.round(SEG.nearK * r));
    const near = boxMean(boxMean(raw.inc, w, h, nr), w, h, nr);
    for (let i = 0; i < near.length; i++) near[i] = Math.min(1, near[i] * 4) * weight;
    return { width: w, height: h, alpha, exclude: exc, near, weight };
  }
}

function nearestKey(K: Keyframe[], t: number): number {
  let b = 0;
  for (let i = 1; i < K.length; i++) if (Math.abs(K[i].t - t) < Math.abs(K[b].t - t)) b = i;
  return b;
}

export type { MemEntry, MemoryInputs, ObjectBank };
export { assembleMemory, isEmpty, newBank, pruneBank, storeMemory };
