// AI subject detection (beta) for Subject pop: the per-device toggle, the lazy model, the clip's background session
// (session.ts in the worker: its own decoder, so it runs while the clip plays) and the overlay the colour engine reads
// per frame. The engine's own subject masks stay the default and the
// fallback: with the toggle off, before a pass, outside it, while unsure, or when the model can't load or runs
// too slowly, the overlay is null (or eases to nothing) and the grade is exactly the engine's.
import type { SegOverlay } from "../../../../aqua-fix/src/engine/seg-overlay.ts";
import type { SubjectOverride, SubjectSelection } from "../../../../aqua-fix/src/engine/animals.ts";
import type { PersonBox } from "../../../../aqua-fix/src/engine/person-gate.ts";
import { segLog, WorkerSegModel, type SessionEvent } from "./model.ts";
import { bbox, promptFromMask, resize, smoothstep } from "./mask.ts";
import { maskSize, SEG, type SegObject } from "./track.ts";
import type { SessionFrameOut } from "./session.ts";

const PREF_KEY = "deepfix.subjectPop.ai";
export type SegPhase = "off" | "download" | "starting" | "ready" | "tracking" | "unavailable";
export type SegStatus = { on: boolean; phase: SegPhase; progress: number | null; note: string | null };

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


/** The inline status under the toggle (null: the default hint). */
export function segStatusText(s: SegStatus): string | null {
  if (!s.on) return null;
  const pc = s.progress !== null ? ` ${Math.round(s.progress * 100)}%` : "";
  switch (s.phase) {
    case "download": return `Downloading the model…${pc}`;
    case "starting": return "Starting the model…";
    case "tracking": return `AI subjects${pc}`;
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

/** Outline id of the ML subject in outlineSelection. */
export const ML_OUTLINE_ID = 65000;

/**
 * The selection the tap outlines draw with AI on: what the ML mask pops (alpha > 0.5 where it rules) as one solid
 * subject, over the engine's other animals (still dashed, tappable), on the overlay's grid. Without an overlay:
 * the engine's selection unchanged.
 */
export function outlineSelection(o: SegOverlay | null, engine: SubjectSelection | null): SubjectSelection | null {
  if (!o) return engine;
  const { width: w, height: h } = o, ids = new Uint16Array(w * h);
  let ml = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (o.near[i] > 0.3) {
      // Where the ML is trusted its answer is the outline, "not the subject" included (an excluded fin).
      if (o.alpha[i] > 0.5) { ids[i] = ML_OUTLINE_ID; ml++; }
      continue;
    }
    if (engine) ids[i] = engine.ids[Math.min(engine.height - 1, Math.floor(((y + 0.5) / h) * engine.height)) * engine.width + Math.min(engine.width - 1, Math.floor(((x + 0.5) / w) * engine.width))];
  }
  const animals = (engine?.animals ?? []).filter((a) => ids.includes(a.id));
  if (ml) animals.push({ id: ML_OUTLINE_ID, strength: 1 });
  return { width: w, height: h, ids, animals };
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
export class SegLive {
  readonly mw: number;
  readonly mh: number;
  readonly i0: number;
  readonly n: number;
  private frames: (SessionFrameOut | undefined)[];
  private conf: { t: number; conf: number }[] = [];
  filled = 0;
  constructor(info: { mw: number; mh: number; i0: number; n: number }) {
    this.mw = info.mw;
    this.mh = info.mh;
    this.i0 = info.i0;
    this.n = info.n;
    this.frames = new Array(info.n);
  }

  put(items: SessionFrameOut[]): void {
    for (const f of items) {
      if (f.i < 0 || f.i >= this.n) continue;
      if (!this.frames[f.i]) this.filled++;
      this.frames[f.i] = f;
    }
  }

  setConf(c: { t: number; conf: number }[]): void {
    this.conf = c;
  }

  /** Bytes held (memory note). */
  get bytes(): number {
    return this.frames.reduce((s, f) => s + (f ? f.alpha.byteLength + f.nearQ.byteLength + f.depQ.byteLength + (f.excQ?.byteLength ?? 0) : 0), 0);
  }

  /** Keyframe confidences eased over time (as track.ts SegTrack.weightAt). */
  private weightAt(t: number): number {
    let num = 0, den = 0;
    const K = this.conf;
    for (let i = 0; i < K.length; i++) {
      const d = Math.abs(K[i].t - t);
      if (d > SEG.easeS) continue;
      let c = K[i].conf;
      for (let j = i - 1; j >= 0 && K[i].t - K[j].t <= SEG.erodeS + 1e-6; j--) c = Math.min(c, K[j].conf);
      for (let j = i + 1; j < K.length && K[j].t - K[i].t <= SEG.erodeS + 1e-6; j++) c = Math.min(c, K[j].conf);
      const wk = 0.5 + 0.5 * Math.cos((Math.PI * d) / SEG.easeS);
      num += wk * c; den += wk;
    }
    return den > 0 ? num / den : 0;
  }

  /** The overlay at clip time t, or null where nothing is filled near t. */
  at(t: number): SegOverlay | null {
    const i = Math.round(t * SEG.sampleHz) - this.i0;
    const f = i >= 0 && i < this.n ? this.frames[i] : undefined;
    if (!f) return null;
    // Hand-over: the weight eases out over HAND frames toward unfilled frames.
    const HAND = Math.round(0.3 * SEG.sampleHz);
    let gap = HAND;
    for (let d = 1; d <= HAND; d++) {
      const a = i - d, b = i + d;
      if ((a >= 0 && !this.frames[a]) || (b < this.n && !this.frames[b])) { gap = d - 1; break; }
    }
    const w = this.weightAt(t) * smoothstep(0, HAND, gap);
    const { mw, mh } = this, qw = Math.ceil(mw / 4), qh = Math.ceil(mh / 4);
    const up = (q: Uint8Array) => resize(Float32Array.from(q, (x) => x / 255), qw, qh, mw, mh);
    const near = up(f.nearQ);
    for (let k = 0; k < near.length; k++) near[k] *= w;
    return { width: mw, height: mh, alpha: Float32Array.from(f.alpha, (x) => x / 255), exclude: f.excQ ? up(f.excQ) : null, near, depart: up(f.depQ) };
  }

  /** Share of the grid filled (0..1). */
  get coverage(): number {
    return this.n ? this.filled / this.n : 0;
  }
}

type UndoOp = { kind: "added"; id: number } | { kind: "removed"; id: number };

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

  constructor(onChange: () => void) {
    this.onChange = onChange;
    const on = readPref();
    this.status = { on, phase: on ? "ready" : "off", progress: null, note: null };
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
    this.set({ on, phase: on ? (this.model ? "ready" : "download") : "off", progress: null, note: null });
    if (on) void this.ensureModel();
  }

  ensureModel(): Promise<WorkerSegModel | null> {
    if (this.model) return Promise.resolve(this.model);
    if (this.loading) return this.loading;
    this.set({ phase: "download", progress: 0 });
    this.loading = (async () => {
      const m = new WorkerSegModel();
      try {
        await m.load((p) => this.set({ phase: p < 1 ? "download" : "starting", progress: p }));
        m.onEvent = (e) => this.onEvent(e);
        this.model = m;
        this.set({ phase: "ready", progress: null });
        return m;
      } catch (e) {
        m.dispose();
        segLog("model failed to load; using the engine's masks", e);
        this.set({ phase: "unavailable", progress: null, note: "Not available on this device; using standard detection" });
        return null;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  private onEvent(e: SessionEvent): void {
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
      this.set({ phase: "tracking", progress: e.total ? e.done / e.total : null });
    } else if (e.ev === "rejected") {
      segLog(`tap ${e.id} came out as the background; dropped`);
      this.onRejected?.();
    } else if (e.ev === "idle") {
      this.busy = false;
      segLog(`session idle: ${live.filled}/${live.n} frames filled, ${(live.bytes / 1e6).toFixed(1)} MB`);
      this.set({ phase: "ready", progress: null });
      const w = this.idleWaiters;
      this.idleWaiters = [];
      for (const r of w) r();
    }
  }

  /** Called when a tapped include was dropped (the tap was on the water). */
  onRejected: (() => void) | null = null;

  /** Called when new frames arrive (the studio repaints a paused frame). */
  onFrames: (() => void) | null = null;

  /**
   * Opens the clip's background session (once per clip): the worker decodes the file itself, so the pass runs while
   * the clip plays. Resolves to the live masks, or null (AI off, no model).
   */
  start(file: File, duration: number): Promise<SegLive | null> {
    if (!this.on) return Promise.resolve(null);
    if (this.file === file && (this.live || this.opening)) return this.opening ?? Promise.resolve(this.live);
    this.file = file;
    this.opening = (async () => {
      const model = await this.ensureModel();
      if (!model || this.file !== file) return null;
      try {
        const info = await model.sessionOpen(file, 0, Math.max(0, duration));
        if (this.file !== file) return null;
        this.live = new SegLive(info);
        segLog(`session open: ${info.width}×${info.height}, masks ${info.mw}×${info.mh}, ${info.n} frames`);
        return this.live;
      } catch (e) {
        segLog("session failed to open; using the engine's masks", e);
        this.set({ phase: "unavailable", note: "This clip can't be decoded for AI detection; using standard detection" });
        return null;
      } finally {
        this.opening = null;
      }
    })();
    return this.opening;
  }

  /** Seeds the engine's own subjects (once per clip). */
  async seedAutos(objs: SegObject[]): Promise<void> {
    if (this.autos || !objs.length || !this.live || !this.model) return;
    this.autos = objs;
    for (const o of objs) await this.model.sessionAdd({ ...o, id: this.nextId++ });
    segLog(`seeded ${objs.length} automatic subject(s)`);
  }

  /** A tap that adds what is missing: a new include object at (t, u, v), followed both ways from the tap. */
  async include(t: number, u: number, v: number, boxes: readonly PersonBox[]): Promise<void> {
    if (!this.live || !this.model) return;
    const id = this.nextId++;
    await this.model.sessionAdd({ id, kind: "include", t, prompt: promptFor({ u, v }, boxes) });
    this.undoOps.push({ kind: "added", id });
    this.onChange();
  }

  /** A tap on what the ML pops: removes that subject (most of it under the tap) or just the tapped part. */
  async exclude(t: number, u: number, v: number): Promise<"removed" | "part" | "exclude" | null> {
    if (!this.live || !this.model) return null;
    const id = this.nextId++;
    const r = await this.model.sessionExclude(id, t, u, v);
    this.undoOps.push(r.action === "removed" ? { kind: "removed", id: r.removed } : { kind: "added", id });
    segLog(`exclude tap at ${t.toFixed(2)} s: ${r.action}`);
    this.onChange();
    return r.action;
  }

  get canUndo(): boolean {
    return this.undoOps.length > 0;
  }

  /** Undoes the last AI tap (an added object goes, a removed one comes back). */
  async undo(): Promise<boolean> {
    const op = this.undoOps.pop();
    if (!op || !this.model) return false;
    if (op.kind === "added") await this.model.sessionRemove(op.id);
    else await this.model.sessionRestore(op.id);
    this.onChange();
    return true;
  }

  /** A new clip (or no clip): the session closes. */
  reset(): void {
    this.file = null;
    this.live = null;
    this.opening = null;
    this.cache = null;
    this.autos = null;
    this.undoOps = [];
    this.busy = false;
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
    if (!this.live || !this.model) return "engine";
    let last = -1, lastAt = performance.now();
    for (;;) {
      if (o.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      if (!(await this.model.sessionBusy())) { this.busy = false; break; }
      const wait = new Promise<void>((r) => this.idleWaiters.push(r));
      await Promise.race([wait, new Promise((r) => setTimeout(r, 500))]);
      const p = this.status.progress;
      o.onProgress(p ?? null);
      if (p !== null && p !== undefined && p > last + 1e-6) { last = p; lastAt = performance.now(); }
      if (performance.now() - lastAt > o.stallMs) { segLog(`export: the AI pass made no progress for ${Math.round(o.stallMs / 1000)} s; exporting with the engine's masks`); return "engine"; }
    }
    return this.live.filled > 0 ? "ai" : "engine";
  }

  /** Resolves when the session has nothing left to do (an export waits for it: the same masks as the preview). */
  get pending(): Promise<void> | null {
    if (!this.live || !this.busy) return null;
    return new Promise((r) => this.idleWaiters.push(r));
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
