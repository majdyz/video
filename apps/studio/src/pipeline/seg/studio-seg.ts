// AI subject detection (beta) for Subject pop: the per-device toggle, the lazy model, the track pass over the clip
// and the overlay the colour engine reads per frame. The engine's own subject masks stay the default and the
// fallback: with the toggle off, before a pass, outside it, while unsure, or when the model can't load or runs
// too slowly, the overlay is null (or eases to nothing) and the grade is exactly the engine's.
import type { SegOverlay } from "../../../../aqua-fix/src/engine/seg-overlay.ts";
import type { SubjectOverride, SubjectSelection } from "../../../../aqua-fix/src/engine/animals.ts";
import type { PersonBox } from "../../../../aqua-fix/src/engine/person-gate.ts";
import { segDebug, segLog, WorkerSegModel } from "./model.ts";
import { bbox, promptFromMask } from "./mask.ts";
import { maskSize, runPass, type FrameSource, type SegModel, type SegObject, type SegTrack } from "./track.ts";

const PREF_KEY = "deepfix.subjectPop.ai";
/**
 * A pass projected to take longer than this (ms; median step time × the pass's steps, after the first few) is "too
 * slow": it stops and the engine's masks stay. `?segslow=<ms>` overrides it (tests on slow machines).
 */
const SLOW_MS = 15 * 60_000;

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

function slowLimit(): number {
  try {
    const q = Number(new URLSearchParams(location.search).get("segslow"));
    return q > 0 ? q : SLOW_MS;
  } catch {
    return SLOW_MS;
  }
}

/** The inline status under the toggle (null: the default hint). */
export function segStatusText(s: SegStatus): string | null {
  if (!s.on) return null;
  const pc = s.progress !== null ? ` ${Math.round(s.progress * 100)}%` : "";
  switch (s.phase) {
    case "download": return `Downloading the model…${pc}`;
    case "starting": return "Starting the model…";
    case "tracking": return `AI: following the subjects you tapped…${pc}`;
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
    if (o.alpha[i] > 0.5 && o.near[i] > 0.3) { ids[i] = ML_OUTLINE_ID; ml++; continue; }
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

export class SubjectSeg {
  status: SegStatus;
  private model: WorkerSegModel | null = null;
  private loading: Promise<WorkerSegModel | null> | null = null;
  private track: SegTrack | null = null;
  private trackKey = "";
  private gen = 0;
  private running: Promise<void> | null = null;
  private runningKey = "";
  private stoppedGen = -1;
  private cache: { t: number; o: SegOverlay | null } | null = null;
  /** The engine's automatic subjects as ML prompts, seeded once per clip (see autoObjects); null = not yet. */
  autos: SegObject[] | null = null;
  /** Person boxes at each tap (key: t:u:v), captured when the tap happened. */
  private boxes = new Map<string, PersonBox[]>();
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
    if (!on) this.cancel();
    else void this.ensureModel();
  }

  ensureModel(): Promise<WorkerSegModel | null> {
    if (this.model) return Promise.resolve(this.model);
    if (this.loading) return this.loading;
    this.set({ phase: "download", progress: 0 });
    this.loading = (async () => {
      const m = new WorkerSegModel();
      try {
        await m.load((p) => this.set({ phase: p < 1 ? "download" : "starting", progress: p }));
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

  /** Remembers the person boxes at a tap (they prompt the segmenter with the diver's box). */
  noteTap(o: Pick<SubjectOverride, "t" | "u" | "v">, boxes: readonly PersonBox[]): void {
    this.boxes.set(`${o.t}:${o.u}:${o.v}`, boxes.slice());
  }

  objectsFor(list: readonly SubjectOverride[]): SegObject[] {
    return list.map((o) => ({ kind: o.action, t: o.t, prompt: promptFor(o, this.boxes.get(`${o.t}:${o.u}:${o.v}`) ?? []) }));
  }

  /** A new clip (or no clip): forget the pass and the taps. */
  reset(): void {
    this.cancel();
    this.track = null;
    this.trackKey = "";
    this.cache = null;
    this.boxes.clear();
    this.autos = null;
  }

  private cancel(): void {
    this.gen++;
    this.runningKey = "";
  }

  /** Stops a running pass (playback took the video); the next run() starts it again. */
  stopPass(): void {
    if (!this.running) return;
    this.stoppedGen = this.gen;
    this.cancel();
    this.set({ phase: this.model ? "ready" : this.status.phase, progress: null });
  }

  /** The running pass (an export waits for it). */
  get pending(): Promise<void> | null {
    return this.running;
  }

  /**
   * Follows the corrections' subjects through the clip with the ML tracker (a no-op when the toggle is off, nothing
   * to follow, or the same prompts were already followed). `source(t)` seeks and returns the frame as the engine
   * sees it.
   */
  run(o: { list: readonly SubjectOverride[]; autos?: readonly SegObject[]; start: number; end: number; width: number; height: number; source: FrameSource; done?: () => void }): Promise<void> {
    if (!this.on) return Promise.resolve();
    const objects = [...(o.autos ?? []), ...this.objectsFor(o.list)];
    const key = JSON.stringify({ objects, s: o.start, e: o.end, w: o.width, h: o.height });
    if (!objects.length) {
      this.track = null;
      this.trackKey = key;
      this.cache = null;
      return Promise.resolve();
    }
    if (key === this.trackKey && this.track) return Promise.resolve();
    if (key === this.runningKey && this.running) return this.running;
    const gen = ++this.gen;
    this.runningKey = key;
    const run = (async () => {
      const model = await this.ensureModel();
      if (!model || gen !== this.gen) return;
      this.set({ phase: "tracking", progress: 0 });
      const times: number[] = [];
      let slow = false, steps = 0;
      const t0 = performance.now();
      try {
        const track = await runPass({
          objects, start: o.start, end: o.end, width: o.width, height: o.height, source: traced(o.source), model: segDebug() ? tracedModel(model) : model,
          cancelled: () => gen !== this.gen || slow,
          onProgress: (d, n) => { steps = n; if (gen === this.gen) this.set({ progress: d / n }); },
          onTiming: (s) => {
            times.push(s.encodeMs + s.stepMs);
            const med = [...times].sort((a, b) => a - b)[times.length >> 1];
            if (times.length >= 3 && med * steps > slowLimit()) slow = true;
          },
        });
        if (slow) {
          segLog(`too slow (median ${times.sort((a, b) => a - b)[times.length >> 1].toFixed(0)} ms per step, ${steps.toFixed(0)} steps); using the engine's masks`);
          this.set({ phase: "unavailable", progress: null, note: "Too slow on this device; using standard detection" });
          return;
        }
        if (!track || gen !== this.gen) return;
        this.track = track;
        this.trackKey = key;
        this.cache = null;
        segLog(`pass: ${track.keys.length} keyframes, ${(performance.now() - t0).toFixed(0)} ms, median ${[...times].sort((a, b) => a - b)[times.length >> 1]?.toFixed(0)} ms/keyframe, ${track.keys.reduce((s, k) => s + k.reprompts, 0)} re-prompts`);
        this.set({ phase: "ready", progress: null });
      } catch (e) {
        segLog("pass failed; using the engine's masks", e);
        if (gen === this.gen) this.set({ phase: "ready", progress: null });
      } finally {
        // A pass replaced by a newer one leaves the video to it; a finished or play-stopped pass hands it back.
        if (gen === this.gen || gen === this.stoppedGen) o.done?.();
      }
    })();
    const p = run.finally(() => { if (this.running === p) this.running = null; });
    this.running = p;
    return p;
  }

  /** The overlay for the frame at clip time t (pure function of the pass: preview and export agree). */
  overlayAt(t: number): SegOverlay | null {
    if (!this.on || !this.track) return null;
    if (this.cache && Math.abs(this.cache.t - t) < 1e-6) return this.cache.o;
    const m = this.track.at(t);
    const o = m && (m.weight > 0 || m.exclude) ? { width: m.width, height: m.height, alpha: m.alpha, exclude: m.exclude, near: m.near, depart: m.depart } : null;
    this.cache = { t, o };
    return o;
  }

  /** Part of the export key: the ML masks change the output. */
  exportKey(): string {
    return this.on && this.track ? `seg:${this.trackKey.length}:${hash(this.trackKey)}` : "";
  }

  maskSize(width: number, height: number): [number, number] {
    return maskSize(width, height);
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** `?debug=1`: every frame read and model call of a pass, with its time (a stuck pass shows where). */
function traced(src: FrameSource): FrameSource {
  if (!segDebug()) return src;
  return async (t, lumaOnly) => {
    const t0 = performance.now();
    segLog(`frame ${t.toFixed(3)}${lumaOnly ? " (luma)" : ""}…`);
    const f = await src(t, lumaOnly);
    segLog(`frame ${t.toFixed(3)} ${(performance.now() - t0).toFixed(0)} ms`);
    return f;
  };
}

function tracedModel(m: SegModel): SegModel {
  const time = async <T>(what: string, p: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    segLog(`${what}…`);
    const r = await p();
    segLog(`${what} ${(performance.now() - t0).toFixed(0)} ms`);
    return r;
  };
  return {
    encode: (rgba) => time("encode", () => m.encode(rgba)),
    step: (key, frame, points, labels, reverse) => time(`step ${key}@${frame}`, () => m.step(key, frame, points, labels, reverse)),
    drop: (key) => m.drop(key),
  };
}
