// AI subject detection (beta) for Subject pop: the per-device toggle, the lazy model, the clip's background session
// (session.ts in the worker: its own decoder, so it runs while the clip plays) and the overlay the colour engine reads
// per frame. The engine's own subject masks stay the default and the
// fallback: with the toggle off, before a pass, outside it, while unsure, or when the model can't load or runs
// too slowly, the overlay is null (or eases to nothing) and the grade is exactly the engine's.
import type { SegOverlay } from "../../../../aqua-fix/src/engine/seg-overlay.ts";
import { animalTarget, type AnimalMap, type SubjectOverride, type SubjectSelection } from "../../../../aqua-fix/src/engine/animals.ts";
import type { PersonBox } from "../../../../aqua-fix/src/engine/person-gate.ts";
import { aiCrashedOn, aiProfile, aiWorking, crumb } from "../crumbs.ts";
import { deviceFacts, isMobile, isWeakDevice, segRuntime } from "../device.ts";
import { segFps, segLog, WorkerSegModel, type SessionEvent } from "./model.ts";
import { bbox, promptFromMask, resize, rleDecode, smoothstep } from "./mask.ts";
import { confWeight, mapPrompt, maskSize, SEG, type SegObject } from "./track.ts";
import { spanCovers, type TrimRange } from "../trim.ts";
import { SegTurns } from "./turns.ts";
import type { SessionFrameOut } from "./session.ts";

const PREF_KEY = "deepfix.subjectPop.ai";
export type SegPhase = "off" | "download" | "starting" | "ready" | "tracking" | "unavailable";
/** weak: a phone the model is a poor fit for (device.ts); AI is off there with a line saying why. crashed: the last
 * session died while the model worked (crumbs.ts aiCrashedLast), so AI was turned off for this one (until turned on). */
export type SegStatus = { on: boolean; phase: SegPhase; progress: number | null; note: string | null; weak?: boolean; crashed?: boolean };

export const WEAK_DEVICE_NOTE = "AI detection starts off on this phone: the model is slow here and can run out of memory. Turn it on to try it";
export const CRASHED_NOTE = "AI tracking crashed last time on this phone, so it's off; turn on to retry";

function readPref(): boolean {
  try {
    if (new URLSearchParams(location.search).get("seg") === "ml") return true; // dev override
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function writePref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch { /* private mode: this session only */ }
}

/** Per device: the page died with the model on WebGPU, so the model runs on WASM here (device.ts segRuntime). */
const FORCE_WASM_KEY = "deepfix.subjectPop.segForceWasm";
let forceWasmNow = false;

function readForceWasm(): boolean {
  try {
    return forceWasmNow || localStorage.getItem(FORCE_WASM_KEY) === "1";
  } catch {
    return forceWasmNow;
  }
}

function writeForceWasm(on: boolean): void {
  forceWasmNow = on;
  try {
    if (on) localStorage.setItem(FORCE_WASM_KEY, "1");
    else localStorage.removeItem(FORCE_WASM_KEY);
  } catch { /* private mode: this session only */ }
}

/**
 * What a session that died with the model at work (crumbs.ts aiCrashedOn) means for this one. On WebGPU: AI stays
 * as it was and the model moves to WASM for good (forceWasm); on WASM, or on WebGPU when it had already been moved
 * to WASM (it fell back there and died all the same): nothing is left to fall back to, AI turns off. Pure.
 */
export function crashOutcome(on: boolean, died: "webgpu" | "wasm" | null, forcedWasm: boolean): { on: boolean; crashed: boolean; forceWasm: boolean } {
  if (died === "webgpu" && !forcedWasm) return { on, crashed: false, forceWasm: true };
  return { on: on && !died, crashed: on && !!died, forceWasm: forcedWasm };
}


/** The inline status under the toggle (null: the default hint). */
export function segStatusText(s: SegStatus): string | null {
  if (!s.on) return s.crashed ? CRASHED_NOTE : s.weak ? WEAK_DEVICE_NOTE : null;
  const pc = s.progress !== null ? ` ${Math.round(s.progress * 100)}%` : "";
  switch (s.phase) {
    case "download": return `Downloading the model…${pc}`;
    case "starting": return "Starting the model…";
    case "tracking": return `Finding subjects${pc}`;
    case "unavailable": return s.note ?? "Not available here; using standard detection";
    default: return "On: tap a subject to follow it with AI";
  }
}

/**
 * The subjects the engine chose by itself (toned, no correction) at clip time t, as ML prompts: points spread inside
 * each animal's map region with negatives on a ring outside, plus its box when compact, or the person detector's box
 * when the animal is a diver. With AI on, the automatic choice gets ML masks too (the engine still chooses).
 */
export function autoObjects(sel: SubjectSelection | null, t: number, boxes: readonly PersonBox[]): SegObject[] {
  if (!sel) return [];
  const out: SegObject[] = [];
  const { width: w, height: h } = sel;
  for (const a of sel.animals) {
    if (a.override !== undefined || (a.auto ?? a.strength) <= 0.5) continue;
    const m = new Float32Array(w * h);
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < m.length; i++) if (sel.ids[i] === a.id) { m[i] = 1; n++; sx += i % w; sy += (i / w) | 0; }
    if (n < 4) continue;
    const pr = promptFromMask(m, w, h, w / 640);
    if (!pr) continue;
    const uv = ([x, y]: [number, number]): [number, number] => [(x + 0.5) / w, (y + 0.5) / h];
    const prompt: SegObject["prompt"] = { points: [...pr.pos.map(uv), ...pr.neg.map(uv)], labels: [...pr.pos.map(() => 1), ...pr.neg.map(() => 0)] };
    const person = promptFor({ u: (sx / n + 0.5) / w, v: (sy / n + 0.5) / h }, boxes).box;
    const b = bbox(m, w, h);
    if (person) prompt.box = person;
    else if (b && n / ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1)) > 0.35) {
      const px = 0.04 * (b.x1 - b.x0) + 1, py = 0.04 * (b.y1 - b.y0) + 1;
      prompt.box = { x0: Math.max(0, (b.x0 - px) / w), y0: Math.max(0, (b.y0 - py) / h), x1: Math.min(1, (b.x1 + 1 + px) / w), y1: Math.min(1, (b.y1 + 1 + py) / h) };
    }
    out.push({ kind: "include", t, prompt });
  }
  return out;
}

/** seedObjects: an animal of the seed frame's own map is followed when its verdict is at least this (animalTarget). */
export const SEED = { minTarget: 0.5, maxObjects: 4 };

/**
 * The subjects to follow, from one analysis of the seed frame (engine animalMap: deterministic for the frame), as ML
 * prompts: points spread inside each animal's region, no box and no negative points (a negative near
 * the animal lands on its own tail or fin when the engine's region covers only part of it, and the tracker then
 * keeps the head alone). Largest animals first, at most SEED.maxObjects.
 */
export function seedObjects(am: AnimalMap | null, t: number, boxes: readonly PersonBox[]): SegObject[] {
  if (!am) return [];
  const { width: w, height: h } = am, out: SegObject[] = [];
  const order = am.list.map((a, i) => ({ a, i })).filter(({ a }) => animalTarget(a) >= SEED.minTarget).sort((x, y) => y.a.area - x.a.area).slice(0, SEED.maxObjects);
  for (const { i } of order) {
    const m = new Float32Array(w * h);
    let n = 0;
    for (let k = 0; k < m.length; k++) if (am.labels[k] === i + 1) { m[k] = 1; n++; }
    if (n < 4) continue;
    const pr = promptFromMask(m, w, h, w / 640, 4, 0);
    if (!pr) continue;
    const uv = ([x, y]: [number, number]): [number, number] => [(x + 0.5) / w, (y + 0.5) / h];
    const prompt: SegObject["prompt"] = { points: pr.pos.map(uv), labels: pr.pos.map(() => 1) };
    // No box either: the engine's region may be the front of a long animal (a box there clips the tail), and the
    // person detector's box (it fires on sharks too) arrives asynchronously, so it would make the seeds depend on
    // timing. Points spread over the animal are enough for the tracker, a diver included.
    void boxes;
    out.push({ kind: "include", t, prompt });
  }
  return out;
}

/** Outline id of the ML subject in outlineSelection. */
export const ML_OUTLINE_ID = 65000;

/**
 * The selection the tap outlines draw: only what the frame on screen is graded with.
 *   `o`       the AI overlay of exactly that frame (SegLive.at of its clip time; centred on it, so it neither leads
 *             nor trails), or null when the AI has no mask for it. With it, the outline is what the ML mask pops
 *             (alpha > 0.5 where it rules), solid, and nothing else: the grade ignores the engine's own animals on
 *             such a frame (grade-shader toneWeight), so outlining them marked things that are not popped (a patch
 *             of seabed beside the ray, user clip 12 Nov).
 *   `engine`  the engine's own selection, and only when it was made from that same frame (`fresh`: the paused
 *             frame's analysis; in play the engine's map lags the picture, which is the outline that trailed the
 *             animal). With the AI on (`ai`) it is the fallback while the frame's mask is not there: drawn dashed
 *             and dim (`provisional`). With the AI off it is the detection in use, as before (picked solid, the
 *             other candidates dashed).
 * Null: nothing to draw (a mask from another frame is never drawn).
 */
export function outlineSelection(o: SegOverlay | null, engine: SubjectSelection | null, opts: { ai?: boolean; fresh?: boolean } = {}): SubjectSelection | null {
  if (!o) {
    if (!engine || opts.fresh === false) return null;
    return opts.ai ? { ...engine, provisional: true } : engine;
  }
  const { width: w, height: h } = o, ids = new Uint16Array(w * h);
  let ml = 0;
  for (let i = 0; i < w * h; i++) if (o.near[i] > 0.3 && o.alpha[i] > 0.5) { ids[i] = ML_OUTLINE_ID; ml++; }
  return { width: w, height: h, ids, animals: ml ? [{ id: ML_OUTLINE_ID, strength: 1 }] : [] };
}

/**
 * What the AI has for the frame on screen: its mask in use ("mask"), a mask that does not weigh enough to be popped
 * yet or any more ("weak": easing in beside frames the pass has not filled, or a track too unsure), its answer that
 * no subject is there ("none"), or nothing (null: the frame is not filled).
 */
export type SegFrameState = "mask" | "weak" | "none" | null;

/** The status chip on the preview (subjectChip): `tone` styles it, `line` is what is applied now, `sub` the small second line. */
export type SubjectChip = { tone: "ai" | "busy" | "basic"; line: string; sub: string | null };

/**
 * The one chip on the preview that says what the picture is graded with right now (Subject pop on a clip):
 *   "AI subject ✓"                    this frame's own AI mask is in use (while the pass still runs: how far it is);
 *   "AI: no subject here"             the AI has this frame and found nothing to pop on it ("AI unsure, not applied"
 *                                     when it has a mask it does not trust enough to pop);
 *   "Finding subjects 73%"            the pass is running and has not reached this frame (second line: time left),
 *                                     the picture shows the basic detection meanwhile;
 *   "Basic detection, AI not ready"   the fallback, with the reason below it (model loading, AI off, unavailable).
 * `eta` is the pass's time left in short form (eta.ts Eta.short), or null. Each line is short enough for one row at
 * 390 px (the chip never wraps).
 */
export function subjectChip(frame: SegFrameState, s: SegStatus, eta: string | null): SubjectChip {
  const pc = s.progress !== null ? ` ${Math.round(s.progress * 100)}%` : "";
  const tracking = s.on && s.phase === "tracking";
  if (s.on && frame === "mask") return { tone: "ai", line: "AI subject ✓", sub: tracking ? `Rest of clip${pc || "…"}` : null };
  if (s.on && frame === "none") return { tone: "ai", line: "AI: no subject here", sub: tracking ? `Rest of clip${pc || "…"}` : null };
  // A mask still easing in while the pass runs is the search, not an answer.
  if (tracking) return { tone: "busy", line: `Finding subjects${pc || "…"}`, sub: eta };
  if (s.on && frame === "weak") return { tone: "basic", line: "AI unsure, not applied", sub: null };
  const why = !s.on ? (s.crashed ? "AI is off (it crashed here)" : "AI detection is off")
    : s.phase === "download" ? `Loading AI model${pc || "…"}`
    : s.phase === "starting" ? "Starting AI model…"
    : s.phase === "unavailable" ? "AI not available here"
    : null;
  return { tone: s.on && (s.phase === "download" || s.phase === "starting") ? "busy" : "basic", line: "Basic detection, AI not ready", sub: why };
}

/**
 * The box (upright uv) of the region the ML overlay pops around (u, v): a tap that takes a popped subject out is
 * prompted with it, so the whole animal is excluded, not just the part a single point would select.
 */
export function popComponentBox(o: SegOverlay | null, u: number, v: number): PersonBox | null {
  if (!o) return null;
  const { width: w, height: h } = o, on = (i: number) => o.alpha[i] > 0.5 && o.near[i] > 0.3;
  const x0 = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y0 = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
  if (!on(y0 * w + x0)) return null;
  const seen = new Uint8Array(w * h), stack = [y0 * w + x0];
  seen[stack[0]] = 1;
  let minx = x0, maxx = x0, miny = y0, maxy = y0;
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i / w) | 0;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !seen[j] && on(j)) { seen[j] = 1; stack.push(j); }
    }
  }
  const px = 0.04 * (maxx - minx) + 1, py = 0.04 * (maxy - miny) + 1;
  const x = Math.max(0, (minx - px) / w), y = Math.max(0, (miny - py) / h);
  return { x, y, w: Math.min(1, (maxx + 1 + px) / w) - x, h: Math.min(1, (maxy + 1 + py) / h) - y, score: 1 };
}

/** True when the ML overlay pops the picture at upright (u, v): a tap there means "take it out". */
export function segPopsAt(o: SegOverlay | null, u: number, v: number): boolean {
  if (!o) return false;
  const x = Math.min(o.width - 1, Math.max(0, Math.floor(u * o.width))), y = Math.min(o.height - 1, Math.max(0, Math.floor(v * o.height)));
  const i = y * o.width + x;
  return o.alpha[i] > 0.5 && o.near[i] > 0.3;
}

/** The tapped subject's prompt: the tap, plus the person detector's box when the tap is on a diver. */
export function promptFor(o: Pick<SubjectOverride, "u" | "v">, boxes: readonly PersonBox[]): SegObject["prompt"] {
  const hit = boxes.filter((b) => o.u >= b.x && o.u <= b.x + b.w && o.v >= b.y && o.v <= b.y + b.h && b.w * b.h < 0.9)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
  const prompt: SegObject["prompt"] = { points: [[o.u, o.v]], labels: [1] };
  // A diver from a single tap is often only the wetsuit: the box makes it the whole diver.
  if (hit) prompt.box = { x0: hit.x, y0: hit.y, x1: hit.x + hit.w, y1: hit.y + hit.h };
  return prompt;
}

/**
 * The masks the background session has posted (session.ts), on the 30 Hz grid: per frame the feathered alpha (mask
 * grid) and quarter-size near / exclude / water-departure maps, plus the keyframe confidences. `at(t)` is the
 * engine overlay; frames not filled yet are null, and the ML weight eases to nothing over ~0.3 s toward them, so the
 * preview hands over to the engine's mask smoothly.
 */
/** SegLive.at: the alpha is averaged over ±alphaFrames filled frames. */
export const SEG_LIVE = { alphaFrames: 2 };

/** SegLive.stateAt: a frame's mask counts as in use from this ML weight (the grade's SEG_TONE.popLo: nothing is popped below it). */
export const SEG_FRAME = { minWeight: 0.2 };

/** SegLive.qualityAt: the mask consistency check (see there). */
export const SEG_QUALITY = { glitchS: 0.15, jumpS: 0.2, dropLo: 0.5, dropHi: 0.72, holdS: 2.0, recover: 0.85, partMin: 0.04, easeS: 0.5 };

/** A mask's area (alpha over 0.5, 0..255) and its significant parts (4-connected, at least partMin of the area). */
export function maskStats(alpha: Uint8Array, w: number, h: number): { area: number; parts: number } {
  const n = w * h, lab = new Int32Array(n), sizes: number[] = [];
  let area = 0;
  for (let i = 0; i < n; i++) if (alpha[i] > 127) area++;
  if (!area) return { area: 0, parts: 0 };
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (alpha[s] <= 127 || lab[s]) continue;
    let size = 0;
    lab[s] = 1; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % w;
      size++;
      if (x > 0 && alpha[i - 1] > 127 && !lab[i - 1]) { lab[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && alpha[i + 1] > 127 && !lab[i + 1]) { lab[i + 1] = 1; stack.push(i + 1); }
      if (i >= w && alpha[i - w] > 127 && !lab[i - w]) { lab[i - w] = 1; stack.push(i - w); }
      if (i < n - w && alpha[i + w] > 127 && !lab[i + w]) { lab[i + w] = 1; stack.push(i + w); }
    }
    sizes.push(size);
  }
  return { area, parts: sizes.filter((z) => z >= Math.max(20, SEG_QUALITY.partMin * area)).length };
}

export class SegLive {
  readonly mw: number;
  readonly mh: number;
  readonly i0: number;
  readonly n: number;
  private frames: (SessionFrameOut | undefined)[];
  /** Per filled frame: the mask's area (px over 0.5) and its significant parts (maskStats). */
  private stats: ({ area: number; parts: number } | undefined)[];
  private qCache = new Map<number, number>();
  private conf: { t: number; conf: number }[] = [];
  filled = 0;
  /** Quality check relaxed (lite encoder): only a near-total loss dims the pop. */
  lenient = false;
  constructor(info: { mw: number; mh: number; i0: number; n: number }) {
    this.mw = info.mw;
    this.mh = info.mh;
    this.i0 = info.i0;
    this.n = info.n;
    this.frames = new Array(info.n);
    this.stats = new Array(info.n);
  }

  put(items: SessionFrameOut[]): void {
    for (const f of items) {
      if (f.i < 0 || f.i >= this.n) continue;
      if (!this.frames[f.i]) this.filled++;
      this.frames[f.i] = f;
      this.stats[f.i] = maskStats(rleDecode(f.alpha, this.mw * this.mh), this.mw, this.mh);
    }
    this.qCache.clear();
    this.popMean = undefined;
  }

  private popMean: number | null | undefined = undefined;
  /**
   * The clip's subject / water contrast: the mean of every filled frame's own measure (session.ts product, mask.ts
   * framePop), or null when no frame has one. It decides whether Subject pop lifts or deepens the subject
   * (SegOverlay.pop → the engine's clipPopDirection). A function of the filled frames alone, so once the pass is
   * done it is one number for the clip: the preview shows the direction the export will have, whatever was played,
   * scrubbed or trimmed before (the engine used to average the frames it happened to draw).
   */
  get pop(): number | null {
    if (this.popMean === undefined) {
      let sum = 0, n = 0;
      for (const f of this.frames) if (f && typeof f.pop === "number") { sum += f.pop; n++; }
      this.popMean = n ? sum / n : null;
    }
    return this.popMean;
  }

  /**
   * How much the mask of frame i can be trusted as the whole animal (0..1, SEG_QUALITY), from sudden changes only (an
   * animal swimming closer or away changes its area steadily, and the pop must hold steady through that):
   *   a drop   the area falls to under dropLo..dropHi of its level jumpS earlier (the mask lost the body: the head
   *            alone); held until it recovers to `recover` of that level, at most holdS. The same backwards in time
   *            for a sudden gain (a fragment before the whole animal);
   * (The number of parts alone is no sign: a thresher's long thin tail parts from its body at the mask grid's
   * resolution for whole seconds, and penalising that dimmed a good mask. A head-only mask is a sudden area drop.)
   * The raw value is averaged over ±easeS (raised cosine): a fragment is popped less, as a whole and smoothly.
   */
  qualityAt(i: number): number {
    const hit = this.qCache.get(i);
    if (hit !== undefined) return hit;
    const Q = SEG_QUALITY, hz = SEG.sampleHz;
    const J = Math.max(1, Math.round(Q.jumpS * hz)), Hd = Math.round(Q.holdS * hz);
    // The area with single-frame glitches removed (a median over ±glitchS): a drop must last to count.
    const G = Math.max(1, Math.round(Q.glitchS * hz));
    const areaOf = (k: number): number => {
      if (k < 0 || k >= this.n || !this.stats[k]?.area) return 0;
      const v: number[] = [];
      for (let m = k - G; m <= k + G; m++) { const a = m >= 0 && m < this.n ? this.stats[m]?.area ?? 0 : 0; if (a) v.push(a); }
      v.sort((x, y) => x - y);
      return v[v.length >> 1];
    };
    // The level the area dropped from (looking `dir` = −1 back, +1 forward): the largest jump within holdS whose
    // level the mask has not recovered to since, as a ratio; 1 when none.
    const dropRatio = (j: number, dir: number): number => {
      const a = areaOf(j);
      if (!a) return 1;
      let worst = 1;
      for (let s = 1; s <= Hd; s++) {
        const k = j + dir * s, k0 = k + dir * J;
        const ak = areaOf(k), a0 = areaOf(k0);
        if (!ak || !a0) break;
        if (ak >= Q.recover * a0) continue;
        // A sudden drop between k0 and k (within jumpS): the frames from k to j stay under its level.
        const r = ak / a0;
        if (r < Q.dropHi) {
          let held = true;
          for (let m = j; m !== k; m += dir) if (areaOf(m) >= Q.recover * a0) { held = false; break; }
          if (held) worst = Math.min(worst, a / a0);
        }
      }
      return worst;
    };
    const raw = (j: number): number | null => {
      const st = this.stats[j];
      if (!st || st.area === 0) return null;
      const ra = Math.min(dropRatio(j, -1), dropRatio(j, 1));
      return this.lenient ? smoothstep(Q.dropLo * 0.4, Q.dropHi * 0.5, ra) : smoothstep(Q.dropLo, Q.dropHi, ra);
    };
    const A = Math.round(Q.easeS * hz);
    let num = 0, den = 0;
    for (let d = -A; d <= A; d++) {
      const j = i + d;
      if (j < 0 || j >= this.n) continue;
      const r = raw(j);
      if (r === null) continue;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (A + 1));
      num += w * r; den += w;
    }
    const q = den > 0 ? num / den : 1;
    this.qCache.set(i, q);
    return q;
  }


  setConf(c: { t: number; conf: number }[]): void {
    this.conf = c;
  }

  /** The frame at clip time t has its masks (or its answer that there are none). */
  has(t: number): boolean {
    const i = Math.round(t * SEG.sampleHz) - this.i0;
    return i >= 0 && i < this.n && !!this.frames[i];
  }

  /** Bytes held (the run-length coded maps). */
  get bytes(): number {
    return this.frames.reduce((s, f) => s + (f ? f.alpha.byteLength + f.nearQ.byteLength + f.depQ.byteLength + (f.excQ?.byteLength ?? 0) : 0), 0);
  }

  /** Keyframe confidences eased over time (track.ts confWeight, as SegTrack.weightAt). */
  private weightAt(t: number): number {
    return this.conf.length ? confWeight(this.conf, t) : 0;
  }

  /** The ML weight of filled frame i (clip time t): the eased confidence × the hand-over toward unfilled frames. */
  private frameWeight(i: number, t: number): number {
    // Hand-over: the weight eases out over HAND frames toward unfilled frames.
    const HAND = Math.round(0.3 * SEG.sampleHz);
    let gap = HAND;
    for (let d = 1; d <= HAND; d++) {
      const a = i - d, b = i + d;
      if ((a >= 0 && !this.frames[a]) || (b < this.n && !this.frames[b])) { gap = d - 1; break; }
    }
    return this.weightAt(t) * smoothstep(0, HAND, gap);
  }

  /**
   * What the frame at clip time t has: "mask" when its own mask is there and weighs enough to be popped (over
   * SEG_FRAME.minWeight: the grade pops nothing under SEG_TONE.popLo), "weak" when it does not (easing in beside
   * unfilled frames, or a track too unsure to pop), "none" when the frame is filled without a subject, null when
   * it is not filled.
   */
  stateAt(t: number): SegFrameState {
    const i = Math.round(t * SEG.sampleHz) - this.i0;
    if (i < 0 || i >= this.n || !this.frames[i]) return null;
    if (!((this.stats[i]?.area ?? 0) > 0)) return "none";
    return this.frameWeight(i, t) > SEG_FRAME.minWeight ? "mask" : "weak";
  }

  /** The overlay at clip time t, or null where nothing is filled near t. */
  at(t: number): SegOverlay | null {
    const i = Math.round(t * SEG.sampleHz) - this.i0;
    const f = i >= 0 && i < this.n ? this.frames[i] : undefined;
    if (!f) return null;
    const w = this.frameWeight(i, t);
    const { mw, mh } = this, qw = Math.ceil(mw / 4), qh = Math.ceil(mh / 4);
    // The maps arrive run-length coded (session.ts): decoded here, one frame at a time.
    const up = (q: Uint8Array) => resize(Float32Array.from(rleDecode(q, qw * qh), (x) => x / 255), qw, qh, mw, mh);
    const near = up(f.nearQ);
    for (let k = 0; k < near.length; k++) near[k] *= w;
    // The alpha averaged over ±SEG_LIVE.alphaFrames filled frames (triangular weights): a mask that wobbles by a few
    // pixels frame to frame (the tracker's own jitter) would make the pop's edge and ramp shimmer.
    const R = SEG_LIVE.alphaFrames, alpha = new Float32Array(mw * mh);
    let wsum = 0;
    for (let d = -R; d <= R; d++) {
      const g = this.frames[i + d];
      if (!g) continue;
      const wk = R + 1 - Math.abs(d), a = rleDecode(g.alpha, mw * mh);
      for (let k = 0; k < a.length; k++) alpha[k] += wk * a[k];
      wsum += wk;
    }
    for (let k = 0; k < alpha.length; k++) alpha[k] /= 255 * wsum;
    return { width: mw, height: mh, alpha, exclude: f.excQ ? up(f.excQ) : null, near, depart: up(f.depQ), quality: this.qualityAt(i), pop: this.pop };
  }

  /** Share of the grid filled (0..1). */
  get coverage(): number {
    return this.n ? this.filled / this.n : 0;
  }
}

type UndoOp = { kind: "added"; id: number } | { kind: "removed"; id: number };

/**
 * A segment's identity on the main thread: its start time in ms, or −1 for the clip's first seeds (asked for at the
 * trim start, which the session snaps to a keyframe). Never the session's segment index: the session splices new
 * starts into its grid as it tracks (session.ts reacquire), so an index names different segments over time.
 */
export function segKey(k: number, t: number): number {
  return k === 0 ? -1 : Math.round(t * 1000);
}

/** The session's inputs, in order: replayed into a fresh worker after a hibernation (SubjectSeg.wake). Seeds are
 * logged by their segment's start time (segKey; session.ts holds them until its tracking gets there). */
export type LogOp =
  | { op: "seeds"; t: number; objects: (SegObject & { id: number })[] }
  | { op: "add"; object: SegObject & { id: number } }
  | { op: "remove"; id: number }
  | { op: "restore"; id: number };

/**
 * What an exclude tap (id, at clip time t, upright uv) came to in the session (session.ts excludeNow), as the log
 * entry that reproduces it: the subject it removed, or the exclude object the session added for it.
 */
export function excludeOutcome(r: { action: "removed"; removed: number } | { action: "part" | "exclude" }, id: number, t: number, u: number, v: number): LogOp {
  return r.action === "removed" ? { op: "remove", id: r.removed } : { op: "add", object: { id, kind: "exclude", t, prompt: { points: [[u, v]], labels: [1] } } };
}

/**
 * The clip range the session tracks for a trim: the selection plus SEG.scopeMarginS each side (the frames at the
 * selection's edges round onto grid frames just outside it), inside the clip. Untrimmed: the whole clip.
 */
export function segSpan(trim: TrimRange | null, duration: number): TrimRange {
  const d = Math.max(0, duration);
  if (!trim) return { start: 0, end: d };
  return { start: Math.max(0, trim.start - SEG.scopeMarginS), end: Math.min(d, trim.end + SEG.scopeMarginS) };
}

/**
 * Whether a session opened for the trim `have` (null: the whole clip) serves the trim `want`: the same selection,
 * or a finished pass whose selection contains it (its masks are there already; one still running is restarted on
 * the smaller range instead, so the pass and an export waiting for it only do the selection).
 */
export function scopeServes(have: TrimRange | null, want: TrimRange | null, done: boolean): boolean {
  const same = have === want || (!!have && !!want && Math.abs(have.start - want.start) < 1e-3 && Math.abs(have.end - want.end) < 1e-3);
  return same || (done && spanCovers(have, want));
}

/**
 * The inputs a re-scoped session starts with: the taps inside the new range (and what was done to them). The
 * engine's own subjects are seeded again from the new start, so their seeds, and a removal of one of them, go.
 */
export function logForSpan(log: readonly LogOp[], span: TrimRange): LogOp[] {
  const kept = new Set<number>();
  for (const l of log) if (l.op === "add" && l.object.t >= span.start - 1e-6 && l.object.t <= span.end + 1e-6) kept.add(l.object.id);
  return log.filter((l) => (l.op === "add" ? kept.has(l.object.id) : l.op !== "seeds" && kept.has(l.id)));
}

/**
 * The pass profile (session.ts profile) as one line for the breadcrumbs and About: where a phone's time goes, per
 * model stage (ms a call), in the decoder, the flow guard and the fill, and the pass's own time against the clip's.
 */
export function profileLine(p: Record<string, number>, ep = ""): string {
  const n = (k: string) => (Number.isFinite(p[k]) ? p[k] : 0);
  const per = (ms: string, count: string) => (n(count) > 0 ? Math.round(n(ms) / n(count)) : 0);
  const s = (ms: string) => (n(ms) / 1000).toFixed(1);
  return [
    `ai: profile${ep ? ` ${ep}` : ""}`,
    `encode ${per("encodeMs", "encodes")}ms×${n("encodes")}`,
    `attn ${per("attendMs", "steps")} dec ${per("decoderMs", "steps")} mem ${per("memEncMs", "steps")}ms×${n("steps")} steps`,
    `keys ${n("keyframes")} (${n("fps")}/s +${n("extraKeys")} extra) objs ${n("objects")}`,
    `decode ${s("decodeMs")}s×${n("decodes")} (${n("restarts")} restarts)`,
    `guard ${s("guardMs")}s fill ${s("fillMs")}s×${n("filledFrames")} maps ${s("productMs")}s seeds ${s("waitSeedsMs")}s`,
    `total ${s("runMs")}s for ${n("clipS").toFixed(1)}s${n("heapMB") ? ` · heap ${n("heapMB")} MB` : ""}`,
  ].join(" · ");
}

/** The engine's own subjects followed at a time on a phone, whatever the model runs on (session.ts autoCap): each
 * is a tracker step, with its memory bank, per keyframe. Elsewhere the session's own default. */
function autoCap(): number | undefined {
  return isMobile(deviceFacts()) ? SEG.liteAutos : undefined;
}

/** A finished pass's worker (the model's ~800 MB of WASM heap) is shut down after this long idle (ms). */
export const SEG_HIBERNATE_MS = 15000;

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 120);
}

export class SubjectSeg {
  status: SegStatus;
  private model: WorkerSegModel | null = null;
  private loading: Promise<WorkerSegModel | null> | null = null;
  live: SegLive | null = null;
  private opening: Promise<SegLive | null> | null = null;
  private file: File | null = null;
  private nextId = 1;
  private undoOps: UndoOp[] = [];
  private idleWaiters: (() => void)[] = [];
  private busy = false;
  private cache: { t: number; o: SegOverlay | null } | null = null;
  /** The engine's automatic subjects, seeded once per clip (autoObjects); null = not yet. */
  autos: SegObject[] | null = null;
  private onChange: () => void;
  /** Everything the session was given, as what replays to the same masks (an exclude tap as its outcome). */
  private log: LogOp[] = [];
  /** Exclude taps the worker has not answered yet: their outcome is not in the log, so the worker stays up. */
  private inflight = 0;
  /** The trim the session was opened for (null: the whole clip) and the range it tracks (segSpan). */
  private scope: TrimRange | null = null;
  private span: TrimRange = { start: 0, end: 0 };
  /** The pass has run to its end (an idle since the last input): its masks are complete for its range. */
  private passDone = false;
  /** Counts the clip's sessions (a new clip, a new range): work begun for an earlier one is dropped (studio.ts). */
  generation = 0;
  /** The pass finished and its worker was shut down; the masks stay in `live`. */
  private hibernated = false;
  private hibTimer = 0;
  private waking: Promise<boolean> | null = null;
  /** Called when the worker is shut down (the studio drops its seed-frame video too). */
  onHibernate: (() => void) | null = null;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    let on = readPref();
    // The page died while the model worked last time (a phone out of memory): AI starts off, once; turning it on again
    // is the user's call (and a crash after that turns it off again).
    // On WebGPU: the model runs on WASM from now on instead, and AI stays on (only a crash on WASM turns it off).
    const out = crashOutcome(on, aiCrashedOn(), readForceWasm());
    const crashed = out.crashed;
    if (out.forceWasm && !readForceWasm()) {
      writeForceWasm(true);
      this.gpuDiedLast = true;
      crumb("ai: crashed on webgpu last time; wasm from now on");
    }
    if (crashed) {
      on = false;
      writePref(false);
      crumb("ai: off (crashed last time)");
    }
    this.status = { on, phase: on ? "ready" : "off", progress: null, note: null, weak: isWeakDevice(), crashed };
    queueMicrotask(() => this.onChange());
  }

  private set(p: Partial<SegStatus>): void {
    this.status = { ...this.status, ...p };
    this.onChange();
  }

  get on(): boolean {
    return this.status.on && this.status.phase !== "unavailable";
  }

  /** The toggle. Turning it on starts the model download (progress in status). */
  setOn(on: boolean): void {
    writePref(on);
    this.set({ on, phase: on ? (this.model ? "ready" : "download") : "off", progress: null, note: null, crashed: false });
    if (on && !this.hibernated) void this.ensureModel();
  }

  ensureModel(): Promise<WorkerSegModel | null> {
    if (this.model) return Promise.resolve(this.model);
    if (this.loading) return this.loading;
    this.set({ phase: "download", progress: 0 });
    // Where the model runs (device.ts segRuntime): WebGPU where there is one, on WebKit from Safari / iOS 26 and with
    // the lite encoder; else the worker with the plain WASM runtime (the WebGPU build's, twice the WebAssembly, was
    // the pass's memory peak at start-up: +130 MB in Chromium). `?seggpu=1` forces WebGPU (and forgets a crash on it
    // before), `?seggpu=0` WASM. Not right after a crash on WebGPU, though: the reload a phone does by itself has
    // the same address, and would crash again (the session after that one is forced again).
    const q = new URLSearchParams(location.search);
    const param = this.gpuDiedLast && q.get("seggpu") === "1" ? null : q.get("seggpu");
    if (param === "1") writeForceWasm(false);
    const rt = segRuntime({ ua: navigator.userAgent, gpu: "gpu" in navigator, param, avoidGpu: readForceWasm(), mobile: isMobile(deviceFacts()) });
    // `?seglite=1 | 0`: the lite / the full encoder whatever the device (to compare them on one).
    const lite = q.get("seglite") === "0" ? false : rt.lite || q.get("seglite") === "1";
    crumb(`ai: model load (${rt.wasm ? "wasm" : "webgpu"}${lite ? " lite" : ""}: ${rt.why})`);
    // "AI working" (crumbs.ts): set while the model loads, a clip opens, a request is out or the pass runs; cleared
    // when the session is idle, hibernated, failed or closed. A page that dies with it set starts with the model on
    // WASM when it was on WebGPU, else with AI off.
    aiWorking(true, rt.wasm ? "wasm" : "webgpu");
    this.loading = (async () => {
      const m = new WorkerSegModel(rt.wasm);
      try {
        await m.load((p) => this.set({ phase: p < 1 ? "download" : "starting", progress: p }), { prefer: rt.wasm ? "wasm" : "auto", lite });
        m.onEvent = (e) => this.onEvent(e);
        this.model = m;
        // What it got (WebGPU falls back to WASM in the worker when no adapter comes).
        aiWorking(true, m.info?.ep.startsWith("webgpu") ? "webgpu" : "wasm");
        crumb(`ai: model ready (${m.info?.ep ?? "?"}, ${m.info?.threads ?? "?"} threads, heap ${m.info?.heapMB ?? "?"} MB)`);
        this.set({ phase: "ready", progress: null });
        return m;
      } catch (e) {
        m.dispose();
        segLog("model failed to load; using the engine's masks", e);
        crumb(`ai: model failed: ${errText(e)}`);
        // The reason rides along (shown in Subjects): a phone can't be debugged from here otherwise.
        this.set({ phase: "unavailable", progress: null, note: `Not available on this device; using standard detection (${errText(e)})` });
        return null;
      } finally {
        this.loading = null;
        // Loaded and waiting (or failed): whoever asked for it marks its own work next (start, wake).
        aiWorking(false);
      }
    })();
    return this.loading;
  }

  /** The session before this one died with the model on WebGPU (the model was moved to WASM at start-up). */
  private gpuDiedLast = false;
  private crumbTens = -1;
  /** Model steps at the last profile written (onEvent idle). */
  private profiledSteps = -1;
  /** Last sign of the pass working (any session event, seeding): the export's stall clock (settle). */
  private lastActivity = 0;
  private onEvent(e: SessionEvent): void {
    this.lastActivity = performance.now();
    // Any sign of the clip's session at work keeps "AI working" set; its idle clears it (a session waiting for seeds
    // sends no idle: the main thread is then analysing the seed frame for it).
    if (e.ev === "idle") aiWorking(false);
    else if (e.ev !== "error" && this.live) aiWorking(true);
    if (e.ev === "trace") { crumb(`ai· ${e.msg}`); return; }
    if (e.ev === "error") { this.fail(e.msg, e.heapMB); return; }
    const live = this.live;
    if (!live) return;
    if (e.ev === "frames") {
      live.put(e.items);
      this.cache = null;
      this.onFrames?.();
    } else if (e.ev === "keys") {
      live.setConf(e.conf);
      this.cache = null;
    } else if (e.ev === "progress") {
      this.busy = e.done < e.total;
      if (!e.taps) this.tapDone();
      const tens = e.total ? Math.floor((10 * e.done) / e.total) : 0;
      if (tens !== this.crumbTens) { this.crumbTens = tens; crumb(`ai: pass ${tens * 10}% (${e.done}/${e.total}) · heap ${e.heapMB ?? "?"} MB`); }
      this.set({ phase: "tracking", progress: e.total ? e.done / e.total : null });
    } else if (e.ev === "seeds") {
      segLog(`segment ${e.k} seeds asked for (${e.t.toFixed(2)} s${e.search === false ? ", engine only" : ""})`);
      this.onNeedSeeds?.(e.k, e.t, e.search !== false);
    } else if (e.ev === "rejected") {
      segLog(`tap ${e.id} came out as the background; dropped`);
      // Out of the log too: a replay would track it to the same rejection and say so again.
      this.log = this.log.filter((l) => !(l.op === "add" && l.object.id === e.id));
      this.onRejected?.();
    } else if (e.ev === "idle") {
      this.busy = false;
      this.tapDone();
      this.passDone = this.autos !== null;
      segLog(`session idle: ${live.filled}/${live.n} frames filled, ${(live.bytes / 1e6).toFixed(1)} MB`);
      this.lastProfile = e.profile;
      segLog(`pass profile ${JSON.stringify(Object.fromEntries(Object.entries(e.profile).map(([k, v]) => [k, Math.round(v)])))}`);
      // Always (not only with ?debug=1): a phone has no console, and its numbers are the ones that matter. Once per
      // stretch of model work (an idle after a tap that tracked nothing new says nothing new).
      if (this.autos !== null && e.profile.steps !== this.profiledSteps) {
        this.profiledSteps = e.profile.steps;
        const line = profileLine(e.profile, this.model?.info ? `${this.model.info.ep}, ${this.model.info.threads} thr` : "");
        aiProfile(line);
        console.info(`[seg] ${line}`);
      }
      this.set({ phase: "ready", progress: null });
      this.scheduleHibernate();
      const w = this.idleWaiters;
      this.idleWaiters = [];
      for (const r of w) r();
    }
  }

  /**
   * A tap is with the session and not followed through yet (from the tap to the first progress without a tap left,
   * or the idle). The studio holds its own heavy work on the paused frame back meanwhile (the engine's analysis: on
   * a phone the tap's tracking and its decoder are all the page's memory can take), and catches up after (onTapDone).
   */
  tapBusy = false;
  onTapDone: (() => void) | null = null;
  private tapDone(): void {
    if (!this.tapBusy || this.inflight) return;
    this.tapBusy = false;
    this.turns.tapEnded();
    this.onTapDone?.();
  }

  /** A tap and a seed frame's analysis take turns (turns.ts). */
  private turns = new SegTurns({ tapActive: () => this.tapBusy || this.inflight > 0, log: crumb });

  /**
   * A seed frame's job on the main thread (studio.ts seedSegmentCanonical: the work <video>'s seek and the engine's
   * analysis of the frame): it starts once no tap is with the session, and a tap that comes while it runs waits for
   * it (turns.ts). Breadcrumbs at its start and end.
   */
  seedJob<T>(t: number, fn: () => Promise<T>): Promise<T> {
    return this.turns.seedJob(`${t.toFixed(2)}s`, fn);
  }

  /** The session is at work: the pass is running, or a tap is with it. */
  get working(): boolean {
    return this.busy || this.tapBusy || this.inflight > 0;
  }

  /**
   * Playhead first: the user is paused at clip time t where the pass has not been yet. `objs`: the engine's subjects
   * on that frame (the session's own search when none). The session follows them from there for a moment, ahead of
   * the pass (session.ts focus), so the frame on screen shows AI masks within seconds; they are provisional, and
   * the finished pass (what an export waits for) is the same with or without them. Not in the log: nothing to replay.
   */
  async focus(t: number, objs: SegObject[]): Promise<void> {
    const live = this.live, model = this.model;
    if (!this.wantsFocus(t) || !live || !model) return;
    const taken = await model.sessionFocus(t, objs, true).catch(() => false);
    if (!taken) return;
    crumb(`ai: peek ${t.toFixed(2)}s`);
    this.lastActivity = performance.now();
  }

  /** focus(t) would do something: a pass under way that has not filled the frame at t, and no tap in its way. */
  wantsFocus(t: number): boolean {
    if (!this.on || !this.live || !this.model || this.hibernated || this.waking || this.opening) return false;
    if (this.autos === null || this.passDone || this.tapBusy || this.inflight || this.turns.seedBusy) return false;
    return t >= this.span.start - 1e-6 && t <= this.span.end + 1e-6 && !this.live.has(t);
  }

  /** Called when the pass failed in the worker (fail): the studio tells the user and drops its seed-frame video. */
  onFailed: ((msg: string) => void) | null = null;
  /** "unavailable" because of this clip (its pass failed, or it can't be decoded): the next clip tries again. */
  private clipFailed = false;

  /**
   * The pass threw in the worker (session.ts fail: the runtime out of memory, a frame that can't be decoded) or the
   * worker itself died. It used to look like a finished pass. Now: a breadcrumb, a note under the toggle, the worker
   * shut down (after an abort it is dead anyway, and its memory is what a phone needs back), and the masks made so
   * far dropped, so the whole clip is graded with the engine's masks in the preview and the export alike (half a
   * clip of AI masks next to half of the engine's reads as a fault).
   */
  private fail(msg: string, heapMB?: number): void {
    if (!this.model) return;
    aiWorking(false);
    crumb(`ai: pass failed: ${errText(msg)}${heapMB !== undefined ? ` · heap ${heapMB} MB` : ""}`);
    segLog("pass failed; using the engine's masks", msg);
    clearTimeout(this.hibTimer);
    this.model.dispose();
    this.model = null;
    this.live = null;
    this.cache = null;
    this.busy = false;
    this.tapBusy = false;
    this.turns.tapEnded();
    this.hibernated = false;
    // The clip's session is gone with its worker: nothing of it is kept, so turning AI off and on again (or the
    // next clip) starts a clean one instead of a session that believes its seeds were already given.
    this.file = null;
    this.autos = null;
    this.seededSegs = new Set();
    this.log = [];
    this.undoOps = [];
    this.passDone = false;
    this.generation++;
    this.clipFailed = true;
    this.set({ phase: "unavailable", progress: null, note: `AI detection stopped on this clip; using standard detection (${errText(msg)})` });
    const w = this.idleWaiters;
    this.idleWaiters = [];
    for (const r of w) r();
    this.onFailed?.(msg);
  }

  /**
   * Phones kill a tab that holds too much: once the pass is done and nothing has asked the model for a while, the
   * worker goes (the masks are a few hundred KB on this side and keep popping). A later tap wakes it (wake).
   */
  private scheduleHibernate(): void {
    clearTimeout(this.hibTimer);
    if (!this.live) return;
    this.hibTimer = window.setTimeout(() => {
      if (this.busy || !this.model || !this.live || this.waking || this.inflight) return;
      crumb("ai: hibernate");
      aiWorking(false);
      segLog(`pass done: shutting the model down (masks kept, ${(this.live.bytes / 1e6).toFixed(1)} MB)`);
      this.model.dispose();
      this.model = null;
      this.hibernated = true;
      this.onHibernate?.();
    }, SEG_HIBERNATE_MS);
  }

  /**
   * An export is about to render with the pass done: on a phone the model goes now instead of 15 s later (the AI
   * worker's heap, ~1 GB in WebKit, plus a 4K export's frames were enough to get the tab reloaded). The masks stay;
   * a later tap wakes the model as after any hibernation. A pass still running (the user exported without waiting)
   * is left alone.
   */
  releaseForExport(): void {
    if (!isMobile(deviceFacts())) return;
    if (this.busy || !this.model || !this.live || this.waking || this.inflight) return;
    clearTimeout(this.hibTimer);
    crumb("ai: hibernate (export)");
    aiWorking(false);
    segLog("export starting: shutting the model down (masks kept)");
    this.model.dispose();
    this.model = null;
    this.hibernated = true;
    this.onHibernate?.();
  }

  /** After a hibernation: a fresh worker, the clip's session again and every input replayed (it re-tracks; the masks
   * it posts are the same, so the preview keeps popping meanwhile). False when the model can't come back. */
  private wake(): Promise<boolean> {
    clearTimeout(this.hibTimer);
    if (!this.hibernated) return Promise.resolve(!!this.model);
    if (this.waking) return this.waking;
    const file = this.file;
    this.waking = (async () => {
      const model = await this.ensureModel();
      if (!model || !file || this.file !== file) return false;
      // The replay re-tracks the clip: at work until its idle.
      aiWorking(true);
      const span = this.span;
      await model.sessionOpen(file, span.start, span.end, segFps(), autoCap(), isWeakDevice());
      if (this.file !== file || this.span !== span) return false;
      this.hibernated = false;
      for (const l of this.log) {
        if (l.op === "seeds") await model.sessionSeeds(l.t, l.objects);
        else if (l.op === "add") await model.sessionAdd(l.object);
        else if (l.op === "remove") await model.sessionRemove(l.id);
        else await model.sessionRestore(l.id);
      }
      segLog(`model back: ${this.log.length} input(s) replayed`);
      return true;
    })().catch((e) => { segLog("model failed to come back", e); return false; }).then((ok) => { if (!ok) aiWorking(false); return ok; }).finally(() => { this.waking = null; });
    return this.waking;
  }

  /** The session asks for segment k's seeds (the engine's own subjects on its canonical frame t): the studio answers
   * with seedSegment. search: false = without the model's own search (autoSeeds) when the engine finds none. */
  onNeedSeeds: ((k: number, t: number, search: boolean) => void) | null = null;
  /** The last pass's profile (where its time went; session.ts). */
  lastProfile: Record<string, number> | null = null;

  /** Called when a tapped include was dropped (the tap was on the water). */
  onRejected: (() => void) | null = null;

  /** Called when new frames arrive (the studio repaints a paused frame). */
  onFrames: (() => void) | null = null;

  /**
   * Opens the clip's background session (once per clip and range): the worker decodes the file itself, so the pass
   * runs while the clip plays. It tracks the trim only (segSpan); called again with another trim, a session that does
   * not serve it (scopeServes) is replaced by one over the new range, with the taps inside it replayed (the masks
   * made so far go: the engine's own subjects are seeded again from the new start). Resolves to the live masks, or
   * null (AI off, no model, or replaced meanwhile).
   */
  start(file: File, duration: number, trim: TrimRange | null = null): Promise<SegLive | null> {
    if (!this.on) return Promise.resolve(null);
    const again = this.file === file && (!!this.live || !!this.opening);
    if (again && scopeServes(this.scope, trim, this.passDone)) return this.opening ?? Promise.resolve(this.live);
    const span = segSpan(trim, duration);
    if (again) {
      crumb(`ai: range ${span.start.toFixed(1)}-${span.end.toFixed(1)}s`);
      segLog(`range changed: tracking ${span.start.toFixed(2)}–${span.end.toFixed(2)} s`);
      clearTimeout(this.hibTimer);
      this.generation++;
      this.log = logForSpan(this.log, span);
      const ids = new Set(this.log.map((l) => (l.op === "add" ? l.object.id : -1)));
      this.undoOps = this.undoOps.filter((u) => ids.has(u.id));
      this.live = null;
      this.cache = null;
      this.autos = null;
      this.seededSegs = new Set();
      this.busy = false;
      this.passDone = false;
      // A hibernated session's worker is gone: the new session starts a fresh one (ensureModel).
      this.hibernated = false;
      this.crumbTens = -1;
      const w = this.idleWaiters;
      this.idleWaiters = [];
      for (const r of w) r();
      this.set({ phase: this.model ? "ready" : "download", progress: null });
    }
    this.file = file;
    this.scope = trim ? { start: trim.start, end: trim.end } : null;
    this.span = span;
    const before = this.opening;
    const replay = again ? this.log.slice() : [];
    const me: { p: Promise<SegLive | null> | null } = { p: null };
    me.p = (async () => {
      // One open at a time in the worker (an earlier range's open finishes first; its result is dropped there).
      await before?.catch(() => undefined);
      const model = await this.ensureModel();
      if (!model || this.file !== file || this.span !== span) return null;
      try {
        crumb("ai: session open");
        aiWorking(true);
        const info = await model.sessionOpen(file, span.start, span.end, segFps(), autoCap(), isWeakDevice());
        crumb(`ai: session ${info.width}x${info.height}, ${info.n} frames`);
        if (this.file !== file || this.span !== span) return null;
        this.live = new SegLive(info);
        // The lite encoder drops thin parts (a thresher's tail) while the body stays right: a sudden area drop is no
        // sign of a lost subject there, and dimming the pop for it made the subject blink.
        this.live.lenient = !!model.info?.ep.endsWith("lite");
        segLog(`session open: ${info.width}×${info.height}, masks ${info.mw}×${info.mh}, ${info.n} frames (${span.start.toFixed(2)}–${span.end.toFixed(2)} s)`);
        // A worker that fails meanwhile says so itself (fail).
        for (const l of replay) {
          if (l.op === "add") await model.sessionAdd(l.object).catch(() => undefined);
          else if (l.op === "remove") await model.sessionRemove(l.id).catch(() => undefined);
          else if (l.op === "restore") await model.sessionRestore(l.id).catch(() => undefined);
        }
        return this.live;
      } catch (e) {
        if (this.file !== file || this.span !== span) return null;
        segLog("session failed to open; using the engine's masks", e);
        crumb(`ai: session failed: ${errText(e)}`);
        this.clipFailed = true;
        this.set({ phase: "unavailable", note: `This clip can't be decoded for AI detection; using standard detection (${errText(e)})` });
        return null;
      } finally {
        if (this.opening === me.p) {
          this.opening = null;
          // Open, nothing running yet (the seeds start the pass and mark it).
          if (!replay.length) aiWorking(false);
        }
      }
    })();
    this.opening = me.p;
    return me.p;
  }

  /**
   * The seeds of the segment starting at t: the engine's own subjects on its canonical frame (none is an answer
   * too). k = 0: the clip's first seeds (they fix the segment grid); otherwise the session's index for the segment
   * when it asked, which is only a label: segments are told apart by their start time (segKey), because the session
   * inserts new starts as it tracks and a later index then means another segment.
   */
  async seedSegment(k: number, t: number, objs: SegObject[]): Promise<void> {
    if (!this.live || this.hasSegment(k, t) || !(await this.wake()) || !this.model || this.hasSegment(k, t)) return;
    this.seededSegs.add(segKey(k, t));
    this.passDone = false;
    this.lastActivity = performance.now();
    if (k === 0) this.autos = objs;
    const objects = objs.map((o) => ({ ...o, id: this.nextId++ }));
    this.log.push({ op: "seeds", t, objects });
    aiWorking(true);
    // A worker that failed meanwhile rejects the call (fail has told the user): nothing to seed.
    if (!(await this.model.sessionSeeds(t, objects).then(() => true, () => false))) return;
    segLog(`seeded segment ${k} (${t.toFixed(2)} s): ${objs.length} automatic subject(s)`);
  }
  private seededSegs = new Set<number>();

  /** A tap that adds what is missing: a new include object at (t, u, v), followed both ways from the tap. (u, v)
   * and the boxes are on the picture as shown; toSource (Stabilise / Dewarp on) takes the prompt to the upright
   * source frame the session works on (track.ts mapPrompt). */
  async include(t: number, u: number, v: number, boxes: readonly PersonBox[], toSource: ((u: number, v: number) => [number, number]) | null = null): Promise<boolean> {
    if (!this.live || !(await this.wake()) || !this.model) return false;
    const id = this.nextId++;
    this.passDone = false;
    crumb(`ai: include ${t.toFixed(2)}s`);
    const shown = promptFor({ u, v }, boxes);
    const object: SegObject & { id: number } = { id, kind: "include", t, prompt: toSource ? mapPrompt(shown, toSource) : shown };
    this.log.push({ op: "add", object });
    aiWorking(true);
    this.tapBusy = true;
    this.inflight++;
    // A seed frame in the engine right now ends first (turns.ts): its analysis next to the tap's first steps was the
    // page's memory peak. (The next seed frame waits for this tap.)
    await this.turns.seedIdle();
    // False: the worker failed meanwhile (fail has told the user).
    const sent = this.model ? await this.model.sessionAdd(object).then(() => true, () => false) : false;
    this.inflight = Math.max(0, this.inflight - 1);
    if (!sent) { this.tapBusy = false; this.turns.tapEnded(); return false; }
    this.undoOps.push({ kind: "added", id });
    this.onChange();
    return true;
  }

  /** A tap on what the ML pops: removes that subject (most of it under the tap) or just the tapped part. (u, v) on
   * the upright source frame (the studio maps a tap on a stabilised / dewarped picture back first). */
  async exclude(t: number, u: number, v: number): Promise<"removed" | "part" | "exclude" | null> {
    if (!this.live || !(await this.wake()) || !this.model) return null;
    const id = this.nextId++;
    this.passDone = false;
    clearTimeout(this.hibTimer);
    crumb(`ai: exclude ${t.toFixed(2)}s`);
    this.inflight++;
    this.tapBusy = true;
    aiWorking(true);
    // As for an include: after the seed frame in the engine right now.
    await this.turns.seedIdle();
    const r = this.model ? await this.model.sessionExclude(id, t, u, v).catch(() => null) : null;
    this.inflight = Math.max(0, this.inflight - 1);
    // Null: the worker failed in or before the tap's own step (fail has told the user).
    if (!r) { this.tapBusy = false; this.turns.tapEnded(); return null; }
    // The tap's outcome depends on the masks tracked when it came, so the log keeps what it resolved to, not the tap:
    // a subject taken out, or an exclude object added (excludeOutcome). Replayed, either gives the same masks, so the
    // session can still hibernate and be released for an export (it used to stay awake for good after one exclude).
    this.log.push(excludeOutcome(r, id, t, u, v));
    crumb(`ai: exclude -> ${r.action}`);
    this.undoOps.push(r.action === "removed" ? { kind: "removed", id: r.removed } : { kind: "added", id });
    segLog(`exclude tap at ${t.toFixed(2)} s: ${r.action}`);
    this.onChange();
    return r.action;
  }

  /** Subjects the model finds by itself on frame t (for a segment the engine found none in); [] without a session. */
  async autoSeeds(t: number): Promise<SegObject[]> {
    if (!this.live || !(await this.wake()) || !this.model) return [];
    // Not next to a tap (the session holds it back too, session.ts autoSeeds: this keeps the breadcrumb honest).
    await this.turns.tapIdle();
    if (!this.live || !this.model) return [];
    crumb(`ai: auto seeds ${t.toFixed(2)}s`);
    aiWorking(true);
    this.lastActivity = performance.now();
    const objs = await this.model.sessionAutoSeeds(t).catch((e) => { segLog("auto seeds failed", e); return [] as SegObject[]; });
    crumb(`ai: auto seeds -> ${objs.length}`);
    this.lastActivity = performance.now();
    return objs;
  }

  /** The segment starting at t (k = 0: the clip's first) has had its seeds. */
  hasSegment(k: number, t: number): boolean {
    return this.seededSegs.has(segKey(k, t));
  }

  get canUndo(): boolean {
    return this.undoOps.length > 0;
  }

  /** Undoes the last AI tap (an added object goes, a removed one comes back). */
  async undo(): Promise<boolean> {
    const op = this.undoOps.pop();
    if (!op || !(await this.wake()) || !this.model) return false;
    this.passDone = false;
    this.log.push(op.kind === "added" ? { op: "remove", id: op.id } : { op: "restore", id: op.id });
    aiWorking(true);
    const ok = await (op.kind === "added" ? this.model.sessionRemove(op.id) : this.model.sessionRestore(op.id)).then(() => true, () => false);
    this.onChange();
    return ok;
  }

  /** A new clip (or no clip): the session closes. */
  reset(): void {
    this.file = null;
    this.live = null;
    this.opening = null;
    this.cache = null;
    this.autos = null;
    this.seededSegs = new Set();
    this.undoOps = [];
    this.busy = false;
    this.tapBusy = false;
    this.turns.tapEnded();
    this.log = [];
    this.hibernated = false;
    this.passDone = false;
    this.scope = null;
    this.generation++;
    clearTimeout(this.hibTimer);
    // The session closes with the clip (a model still loading keeps its mark until it is loaded).
    if (!this.loading) aiWorking(false);
    if (this.clipFailed) {
      // The last clip's pass failed (or it could not be decoded): this one gets its own try.
      this.clipFailed = false;
      if (this.status.phase === "unavailable") this.set({ phase: this.status.on ? (this.model ? "ready" : "download") : "off", progress: null, note: null });
    }
    void this.model?.sessionClose().catch(() => undefined);
    for (const r of this.idleWaiters) r();
    this.idleWaiters = [];
  }

  /**
   * Export: waits until the session has done all its work (every object followed through its range, every interval
   * filled), so an export started right after opening a clip grades with the same masks as one started later.
   * onProgress gets the pass's share done (or null while it is opening). Resolves "ai", or "engine" when the AI is
   * unavailable, the pass makes no progress for stallMs, or there is nothing for it to follow. Rejects on abort.
   */
  async settle(o: { signal: AbortSignal; stallMs: number; onProgress: (p: number | null) => void }): Promise<"ai" | "engine"> {
    // A hibernated session finished its pass: its masks are complete.
    if (this.hibernated && this.live) return this.live.filled > 0 ? "ai" : "engine";
    if (!this.live || !this.model) return "engine";
    let last = -1, lastAt = performance.now();
    for (;;) {
      if (o.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      // The pass failed while the export waited (fail): the engine's masks, as the preview now shows.
      if (!this.live || !this.model) return "engine";
      const busy = await this.model.sessionBusy().catch(() => null);
      if (busy === null) return "engine";
      if (!busy) { this.busy = false; break; }
      const wait = new Promise<void>((r) => this.idleWaiters.push(r));
      await Promise.race([wait, new Promise((r) => setTimeout(r, 500))]);
      const p = this.status.progress;
      o.onProgress(p ?? null);
      if (p !== null && p !== undefined && p > last + 1e-6) { last = p; lastAt = performance.now(); }
      // Seeding a segment (the engine's analysis, or the model's own search) shows no progress but is work.
      lastAt = Math.max(lastAt, this.lastActivity);
      if (performance.now() - lastAt > o.stallMs) { segLog(`export: the AI pass made no progress for ${Math.round(o.stallMs / 1000)} s; exporting with the engine's masks`); return "engine"; }
    }
    return this.live && this.live.filled > 0 ? "ai" : "engine";
  }

  /** The pass for this clip and trim has run to its end: an export has nothing to wait for (no share of its bar). */
  ready(file: File, trim: TrimRange | null): boolean {
    return this.file === file && !!this.live && !this.opening && this.passDone && scopeServes(this.scope, trim, true);
  }

  /** Resolves when the session has nothing left to do (an export waits for it: the same masks as the preview). */
  get pending(): Promise<void> | null {
    if (!this.live || !this.busy) return null;
    return new Promise((r) => this.idleWaiters.push(r));
  }

  /** What the AI has for the frame at clip time t (SegLive.stateAt); null also when the AI is off or has no session. */
  frameState(t: number): SegFrameState {
    return this.on && this.live ? this.live.stateAt(t) : null;
  }

  /** The overlay for the frame at clip time t (null: the engine's own masks). */
  overlayAt(t: number): SegOverlay | null {
    if (!this.on || !this.live) return null;
    if (this.cache && Math.abs(this.cache.t - t) < 1e-6) return this.cache.o;
    const o = this.live.at(t);
    this.cache = { t, o };
    return o;
  }

  /** Part of the export key: the ML masks change the output. */
  exportKey(): string {
    return this.on && this.live ? `seg:${this.nextId}:${this.undoOps.length}:${this.live.filled}` : "";
  }

  maskSize(width: number, height: number): [number, number] {
    return maskSize(width, height);
  }
}
