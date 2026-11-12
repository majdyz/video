// AI subject detection, the track pass and the mask at any clip time (Subject pop, `seg`).
//
// Pass (runPass): every prompted subject is followed by the EdgeTAM memory tracker over keyframes SEG.fps (4) per clip second
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
// of the clip and the prompts (the export stays deterministic). The alpha is the mask's signed distance (SEG.alphaR;
// the grade keeps the tone inside the contour), a "near" map says where the ML mask replaces the engine's, and the ML weight follows a
// confidence curve that eases down and back up over ~0.4 s around any doubtful keyframe (symmetric: the pass has
// seen the future).

import { assembleMemory, frameIndex, isEmpty, newBank, pruneBank, storeMemory, type MemEntry, type MemoryInputs, type ObjectBank } from "./bank.ts";
import { denseFlow, warp, type Flow, type Gray } from "./flow.ts";
import { area, bbox, bigParts, centroid, DEPART_STEP, departMap, guidedFilter, iou, nearMap, promptFromMask, resize, sdfFeather, shiftMap, smoothstep } from "./mask.ts";

export const SEG = {
  /** Keyframes per clip second. */
  fps: 4,
  /** The same on the lite (phone) model, where a keyframe takes seconds: half as many, with extra ones in between
   * (back to `fps`) where the tracker and the flow-carried mask disagree (session.ts refine). */
  liteFps: 2,
  /** A step whose mask overlaps the flow-carried one by less than this (IoU; the level the confidence starts to
   * fall at) is a hard one, as is a re-prompted or a runaway step... */
  adaptAgree: 0.7,
  /** ...and the object's next this many steps are on the fine grid (1 s at twice liteFps). */
  adaptHold: 4,
  /** Mask grid: longest side (px). */
  maskLong: 320,
  /** Follow a tapped subject at most this far either side of its prompt (s). */
  reachS: 20,
  /** The engine's own subjects are seeded again every this long (s): a long clip is covered in segments. */
  segmentS: 8,
  /** The session tracks the trim plus this much either side (s; studio-seg.ts segSpan). */
  scopeMarginS: 0.5,
  /** A segment start that finds no subject (and none carried in) looks again this much later (s); each further
   * start in a row that finds none doubles the wait, up to reacquireMaxS (2, 4, 4 s: every look is a seek, an
   * analysis and, when the engine sees nothing, the model's own search; 8 s lost a returning subject for ~3 s on
   * blue-20s)... */
  reacquireS: 2,
  reacquireMaxS: 4,
  /** ...and from this many empty starts in a row, the extra starts leave the model's search out (the engine's look
   * only; the regular starts, every segmentS, still search). */
  reacquireSearches: 3,
  /** At a segment start that leaves nothing to follow, a subject last seen within this long (s) is followed on to
   * the next look (session.ts carryOver): the tracker knows it again when it comes back, a look may not. */
  lostS: 3,
  /** The lite model, and any model on a phone (SessionOptions.autoCap), follows at most this many of the engine's
   * own subjects at a time (every one is a tracker step per keyframe); taps are always followed. */
  liteAutos: 2,
  /** A tap's backward steps are read a chunk this long (s) at a time, in one sequential decode (session.ts readBack). */
  backChunkS: 1,
  /** Playhead first (session.ts focus): the playhead's subjects are followed this far ahead of it (s)... */
  peekS: 1,
  /** ...and this far behind it (s): the hand-over of the overlay's weight toward unfilled frames (studio-seg.ts
   * frameWeight, 0.3 s) must lie behind the playhead's frame, not on it... */
  peekBackS: 0.3,
  /** ...unless the pass is within this long (s) of getting there itself. */
  peekSkipS: 2,
  /** At a segment start, an earlier subject carries on unless the new seeds cover this share of it. */
  carryCover: 0.5,
  /** Decoded frames the background session keeps (luma + colour cells, ~70 KB each). */
  frameCache: 240,
  /** The same on a phone short of memory (SessionOptions.weak): three seconds of frames (a tap's backward chunk is
   * one, an interval's fill half of one), 7 MB instead of 17. */
  weakFrameCache: 96,
  /** Flow guard: re-prompt when the tracker keeps less than this share of the carried mask... */
  guardShare: 0.25,
  /** The same for the lite encoder (vision_encoder_lite). */
  guardShareLite: 0.6,
  /** ...of a carried mask at least this share of the frame. */
  guardMinArea: 0.001,
  /** A tapped subject whose prompted mask covers more than this share of the frame is the water, not a subject. */
  maxTapArea: 0.45,
  /** A tracked mask over this share of the frame, or growing past runawayGrow × the flow-carried one, is dropped. */
  runawayArea: 0.3,
  runawayGrow: 2.5,
  /** Probability remap before the guided filter: drop sub-threshold haze, keep the 0.5 contour. */
  remapLo: 0.15,
  remapSpan: 0.7,
  /** Guided filter radius (px at 640; scaled) and epsilon. */
  guidedR: 4,
  guidedEps: 2e-3,
  /** Feather radius for the near map: share of the subject's bounding-box diagonal, clamped to minPx (mask px). */
  featherShare: 0.03,
  featherMinPx: 1.5,
  /** The alpha is the mask's signed distance: 0.5 on the contour, linear to 1 / 0 this many mask px in / out (the
   * grade reads the distance back: aqua-fix grade-shader SEG_TONE.alphaR, the same number). */
  alphaR: 6,
  /** The ML mask replaces the engine's within this many feather radii of the subject. */
  nearK: 3,
  /** Confidence curve (confWeight): a raised-cosine average of the keyframe confidences over ±easeS, mapped through
   * confLo..confHi. Long and gentle on purpose: keyframe confidences of a good track wander (0.3-0.7), and a weight
   * that follows them frame to frame makes the pop breathe and blink; only a track that is really lost (low
   * confidence for about a second) fades out, slowly. */
  easeS: 1.0,
  confLo: 0.12,
  confHi: 0.3,
  /** Beyond the first / last keyframe the ML weight fades out over this long (s). */
  edgeFadeS: 0.25,
  /** Filled frames per clip second (the mask grid in time). */
  sampleHz: 30,
  /** The fill's per-frame flow runs at this share of the mask grid. */
  fillFlowScale: 0.5,
  /** Share of an ML step one filled frame counts for in the progress. */
  fillCost: 0.25,
  /** The fill's fallback where the flow cannot follow the subject (fillInterval; a far ray on plain water while the
   * camera pans: nothing for the flow to hold on to): a single subject that moved at least fillMovePx mask px
   * between its two keyframes, and that the flow carried less than fillCarried of the way (or lost more than half
   * of), is moved along the straight line between its two keyframe positions instead. */
  fillMovePx: 1.5,
  fillCarried: 0.65,
  /** ...and only between two masks of about one size (the smaller at least this share of the larger). */
  fillSameSize: 0.4,
};

/**
 * Hysteresis of a track (lockStep). A subject followed with a keyframe confidence of at least lockConf for lockSteps
 * keyframes in a row is locked. A locked subject the model still sees (object score > 0) at about its size (areaLo..
 * areaHi × the size it was locked at, eased) keeps a confidence of at least `floor` (over SEG.confHi: full weight)
 * on keyframes where the raw confidence dips: on a far, low-contrast subject the flow the confidence is checked
 * against has nothing to hold on to, and the raw value fell to 0 while the mask was fine ("AI unsure, not applied").
 * The lock is given up after missS seconds of keyframes without a sure one. While it holds, a keyframe that is not
 * sure, or whose mask shrank under dropShare of the locked size, asks for a re-check (the session re-prompts from
 * the last good mask's box): on the first such keyframe and every recheckEvery-th after.
 */
export const HOLD = { lockConf: 0.6, lockSteps: 3, floor: 0.35, areaLo: 0.4, areaHi: 2.5, dropShare: 0.6, missS: 2, recheckEvery: 4, ease: 0.3 };

/** A track's lock (one per object and direction). area: the locked subject's size (mask px, eased over its sure keyframes). */
export type Lock = { good: number; locked: boolean; miss: number; area: number };

export function newLock(): Lock {
  return { good: 0, locked: false, miss: 0, area: 0 };
}

/**
 * One keyframe of a track through its lock (HOLD). `conf`: the keyframe's raw confidence (object score × agreement
 * with the flow-carried mask), `score`: the model's object score logit, `area`: the mask's size (mask px), `fps`:
 * keyframes a second (for missS). Returns the confidence to use and whether to re-check the mask. Mutates `L`.
 * Never raises the confidence of a keyframe the model itself calls empty (score ≤ 0 or no mask): what is not there
 * is not held.
 */
export function lockStep(L: Lock, o: { conf: number; score: number; area: number }, fps: number): { conf: number; recheck: boolean; held: boolean } {
  const H = HOLD, present = o.score > 0 && o.area > 0;
  const sized = !L.locked || (o.area >= H.dropShare * L.area && o.area <= H.areaHi * L.area);
  if (present && o.conf >= H.lockConf && sized) {
    L.good++;
    L.miss = 0;
    L.area = L.area > 0 ? L.area + H.ease * (o.area - L.area) : o.area;
    if (L.good >= H.lockSteps) L.locked = true;
    return { conf: o.conf, recheck: false, held: false };
  }
  L.good = 0;
  if (!L.locked) return { conf: o.conf, recheck: false, held: false };
  L.miss++;
  const recheck = (L.miss - 1) % H.recheckEvery === 0;
  if (L.miss > Math.max(1, Math.round(H.missS * fps))) {
    L.locked = false;
    L.miss = 0;
    L.area = 0;
    return { conf: o.conf, recheck: false, held: false };
  }
  const hold = present && o.area >= H.areaLo * L.area && o.area <= H.areaHi * L.area;
  // A held keyframe whose mask is about the locked size: the size follows it slowly (a subject swimming away). Not
  // one that lost part of the body: the locked size is what the re-check measures its answer against.
  if (hold && sized) L.area += 0.5 * H.ease * (o.area - L.area);
  return { conf: hold ? Math.max(o.conf, H.floor) : o.conf, recheck, held: hold };
}

export type SegPrompt = { points: [number, number][]; labels: number[]; box?: { x0: number; y0: number; x1: number; y1: number } };
/** A subject to follow: include (pop it) or exclude (never pop it); prompt in upright uv (0..1) at clip time t. */
export type SegObject = { kind: "include" | "exclude"; t: number; prompt: SegPrompt };

/**
 * A prompt carried into another uv space by `f` (the studio: from the stabilised / dewarped picture the user taps
 * and the engine analyses to the upright source frame the session tracks on). Points map one by one; the box
 * becomes the bounds of its outline's image (corners and edge midpoints: the warp bends straight edges).
 */
export function mapPrompt(p: SegPrompt, f: (u: number, v: number) => [number, number]): SegPrompt {
  const out: SegPrompt = { points: p.points.map(([u, v]) => f(u, v)), labels: p.labels.slice() };
  if (p.box) {
    const { x0, y0, x1, y1 } = p.box, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const q = [[x0, y0], [xm, y0], [x1, y0], [x1, ym], [x1, y1], [xm, y1], [x0, y1], [x0, ym]].map(([u, v]) => f(u, v));
    out.box = { x0: Math.min(...q.map((c) => c[0])), y0: Math.min(...q.map((c) => c[1])), x1: Math.max(...q.map((c) => c[0])), y1: Math.max(...q.map((c) => c[1])) };
  }
  return out;
}

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
/** `rgb`: the frame on the mask grid (RGBA), for the water-departure map (a close-up's leak cap). */
export type PassFrame = { rgba1024?: Uint8ClampedArray; luma: Uint8Array; rgb?: Uint8ClampedArray };
export type FrameSource = (t: number, lumaOnly?: boolean) => Promise<PassFrame>;

/** A keyframe: the tracker's probabilities (union of includes / excludes), its luma and its confidence. */
export type Keyframe = {
  t: number;
  inc: Float32Array;
  exc: Float32Array | null;
  luma: Float32Array;
  /** The frame on the mask grid (RGBA), when the source gave it. */
  rgb?: Uint8ClampedArray;
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

export function sigmoidResize(lg: Float32Array, lw: number, lh: number, w: number, h: number): Float32Array {
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

type PerKey = { inc: Float32Array | null; exc: Float32Array | null; luma: Float32Array; rgb?: Uint8ClampedArray; conf: number; reprompts: number; score: number };

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
  const rgbCache = new Map<number, Uint8ClampedArray>();
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
        if (fr.rgb) rgbCache.set(t, fr.rgb);
      }
      let encodeMs = performance.now() - t0;
      const fi = frameIndex(t, SEG.fps);
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
        const e = per.get(t) ?? { inc: null, exc: null, luma, rgb: rgbCache.get(t), conf: 1, reprompts: 0, score: Infinity };
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
    return { t, inc: e.inc ?? new Float32Array(mw * mh), exc: e.exc, luma: e.luma, rgb: e.rgb, conf: e.conf, reprompts: e.reprompts, score: e.score };
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
  const dep: (Uint8Array | null)[] = new Array(grid.n).fill(null);
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
    const lumas: Float32Array[] = [], rgbs: (Uint8ClampedArray | undefined)[] = [];
    for (const i of idx) {
      if (opts.cancelled?.()) return null;
      const t = grid.time(i);
      if (Math.abs(t - a.t) < 1e-6) { lumas.push(a.luma); rgbs.push(a.rgb); }
      else { const f = await source(t, true); lumas.push(Float32Array.from(f.luma, (x) => x / 255)); rgbs.push(f.rgb); }
      opts.onProgress?.(done += SEG.fillCost);
    }
    const times = idx.map((i) => grid.time(i));
    const filled = fillInterval(a, b, times, lumas, mw, mh, anyExc);
    idx.forEach((i, j) => {
      inc[i] = toU8(guidedFilter(lumas[j], remap(filled[j].inc), mw, mh, gr, SEG.guidedEps));
      const e = filled[j].exc;
      if (e) exc[i] = toU8(guidedFilter(lumas[j], remap(e), mw, mh, gr, SEG.guidedEps));
      const rgb = rgbs[j];
      if (rgb) dep[i] = departMap(rgb, inc[i], mw, mh).data;
    });
  }
  // The keyframes' masks live in the filled frames now; the track keeps their times and confidences.
  const keys = K.map((k) => ({ ...k, inc: new Float32Array(0), exc: null, luma: new Float32Array(0), rgb: undefined }));
  return new SegTrack(mw, mh, keys, grid.i0, inc, exc, dep);
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

export function remap(p: Float32Array): Float32Array {
  const q = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) q[i] = Math.min(1, Math.max(0, (p[i] - SEG.remapLo) / SEG.remapSpan));
  return q;
}

export function toU8(m: Float32Array): Uint8Array {
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
  // Where the flow could not follow the subject, it is moved along the line between its keyframe positions.
  const line = straightCarry(a.inc, b.inc, fwd[n - 1].inc, bwd[0].inc, (times[n - 1] - a.t) / (b.t - a.t), (times[0] - a.t) / (b.t - a.t), w, h);
  return fwd.map((F, j) => {
    const wt = (times[j] - a.t) / (b.t - a.t);
    const mix = (p: Float32Array | null, q: Float32Array | null) => {
      if (!p || !q) return null;
      const o = new Float32Array(p.length);
      for (let i = 0; i < o.length; i++) o[i] = (1 - wt) * p[i] + wt * q[i];
      return o;
    };
    const fi = line?.fwd ? shiftMap(a.inc, w, h, wt * line.dx, wt * line.dy) : F.inc;
    const bi = line?.bwd ? shiftMap(b.inc, w, h, -(1 - wt) * line.dx, -(1 - wt) * line.dy) : bwd[j].inc;
    return { inc: mix(fi, bi)!, exc: mix(F.exc, bwd[j].exc) };
  });
}

/**
 * The fill's fallback (SEG.fillMovePx / fillCarried): whether keyframe a's include mask, and b's, are to be moved
 * along the straight line from a's subject to b's instead of along the flow, and that line (dx, dy: b's centre less
 * a's, mask px). `fLast`: a's mask as the flow carried it to the interval's last frame (at share `wLast` of the way
 * to b), `bFirst`: b's carried back to the first frame (at share `wFirst`). A chain is replaced when its subject
 * ended up less than fillCarried of the way it had to go, or with less than half the area it should have there. Null: nothing
 * to do (no subject at one end, more than one subject: which is which is not known here, or hardly any motion).
 */
export function straightCarry(a: Float32Array, b: Float32Array, fLast: Float32Array, bFirst: Float32Array, wLast: number, wFirst: number, w: number, h: number): { dx: number; dy: number; fwd: boolean; bwd: boolean } | null {
  const ca = centroid(a, w, h), cb = centroid(b, w, h);
  if (!ca || !cb) return null;
  const dx = cb.x - ca.x, dy = cb.y - ca.y, D = Math.hypot(dx, dy);
  if (D < SEG.fillMovePx || bigParts(a, w, h) !== 1 || bigParts(b, w, h) !== 1) return null;
  // Not the same subject at both ends (one mask several times the other): nothing is moved onto it.
  if (Math.min(ca.n, cb.n) < SEG.fillSameSize * Math.max(ca.n, cb.n)) return null;
  // How far along the line (as a share of it) a chain's subject got, from its own keyframe.
  // (Its area against what it should be there: a subject leaving the frame shrinks between its keyframes.)
  const failed = (m: Float32Array, from: { x: number; y: number; n: number }, to: { n: number }, sign: number, share: number): boolean => {
    if (share * D < SEG.fillMovePx) return false;
    const c = centroid(m, w, h);
    if (!c || c.n < 0.5 * (from.n + share * (to.n - from.n))) return true;
    const along = (sign * ((c.x - from.x) * dx + (c.y - from.y) * dy)) / (D * D);
    return along < SEG.fillCarried * share;
  };
  const fwd = failed(fLast, ca, cb, 1, wLast), bwd = failed(bFirst, cb, ca, -1, 1 - wFirst);
  return fwd || bwd ? { dx, dy, fwd, bwd } : null;
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
  /** How far each pixel departs from the water around it (0..1, mask grid), or null (no colour in the pass). */
  depart: Float32Array | null;
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
  /** Water departure per filled frame, at 1/DEPART_STEP of the grid (null: no colour). */
  readonly dep: (Uint8Array | null)[];
  constructor(width: number, height: number, keys: Keyframe[], i0: number, inc: Uint8Array[], exc: (Uint8Array | null)[], dep: (Uint8Array | null)[] = []) {
    this.width = width;
    this.height = height;
    this.keys = keys;
    this.i0 = i0;
    this.inc = inc;
    this.exc = exc;
    this.dep = dep;
  }

  get start(): number { return this.keys.length ? this.keys[0].t : 0; }
  get end(): number { return this.keys.length ? this.keys[this.keys.length - 1].t : 0; }
  /** Bytes held (for the memory note in the report). */
  get bytes(): number { return this.inc.reduce((s, m) => s + m.byteLength, 0) + this.exc.reduce((s, m) => s + (m?.byteLength ?? 0), 0); }

  /** Confidence weight at t (confWeight), faded out past the first / last keyframe. */
  weightAt(t: number): number {
    const K = this.keys;
    if (!K.length) return 0;
    const edge = Math.min(1, Math.max(0, 1 - Math.max(this.start - t, t - this.end, 0) / SEG.edgeFadeS));
    if (edge <= 0) return 0;
    return edge * confWeight(K, t);
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
    const inc = sdfFeather(raw.inc, w, h, SEG.alphaR);
    const exc = raw.exc ? sdfFeather(raw.exc, w, h, SEG.alphaR) : null;
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = inc[i] * (exc ? 1 - exc[i] : 1);
    // Near: the include region grown and softened by a wide blur (the engine keeps everything farther out).
    const nr = Math.max(2, Math.round(SEG.nearK * r));
    const near = nearMap(raw.inc, w, h, nr);
    for (let i = 0; i < near.length; i++) near[i] *= weight;
    return { width: w, height: h, alpha, exclude: exc, near, weight, depart: this.departAt(t) };
  }

  /** The water departure map of the filled frame at t, on the mask grid (null when the pass had no colour). */
  departAt(t: number): Float32Array | null {
    const n = this.inc.length;
    if (!n) return null;
    const i = Math.min(n - 1, Math.max(0, Math.round(t * SEG.sampleHz - this.i0)));
    const d = this.dep[i];
    if (!d) return null;
    const qw = Math.ceil(this.width / DEPART_STEP), qh = Math.ceil(this.height / DEPART_STEP);
    const f = resize(Float32Array.from(d, (x) => x / 255), qw, qh, this.width, this.height);
    return f;
  }
}

/** The ML weight at t from keyframe confidences (see SEG.easeS): raised-cosine average over ±easeS, confLo..confHi. */
export function confWeight(K: readonly { t: number; conf: number }[], t: number): number {
  if (!K.length) return 0;
  let num = 0, den = 0;
  for (const k of K) {
    const d = Math.abs(k.t - t);
    if (d > SEG.easeS) continue;
    const wk = 0.5 + 0.5 * Math.cos((Math.PI * d) / SEG.easeS);
    num += wk * k.conf; den += wk;
  }
  const c = den > 0 ? num / den : K[nearestKey(K, t)].conf;
  return smoothstep(SEG.confLo, SEG.confHi, c);
}

function nearestKey(K: readonly { t: number }[], t: number): number {
  let b = 0;
  for (let i = 1; i < K.length; i++) if (Math.abs(K[i].t - t) < Math.abs(K[b].t - t)) b = i;
  return b;
}

export type { MemEntry, MemoryInputs, ObjectBank };
export { assembleMemory, isEmpty, newBank, pruneBank, storeMemory };
