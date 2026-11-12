// AI subject detection, the background session (seg/session.ts) on a fake model and fake frames: what it does when
// the model throws, and that its masks are a function of its inputs alone.
//   node --experimental-strip-types apps/studio/test/seg-session.test.ts
import assert from "node:assert/strict";
import type { EdgeTam } from "../src/pipeline/seg/edgetam.ts";
import { frameKey, SegSession, type SessionEvents, type SessionFrameOut, type SessionFrames, type SessionOptions } from "../src/pipeline/seg/session.ts";
import type { SegObject } from "../src/pipeline/seg/track.ts";
import { rleDecode } from "../src/pipeline/seg/mask.ts";

/** Frames whose alpha pops something (the fake clip's mask grid is 320×40). */
const popped = (frames: Map<number, SessionFrameOut>) => [...frames.values()].filter((x) => rleDecode(x.alpha, 320 * 40).some((a) => a > 127)).length;

// ---------------------------------------------------------------- fakes

/** A frame of the fake clip: a soft texture with a bright square (the subject) at x0 (share of the width). */
type FakeFrame = { t: number };
/** The subject jumps 0.3 of the width at this clip time (no flow can follow it: a hard step for the tracker). */
let jumpAt = Infinity;
const subjectX = (t: number) => 0.3 + 0.02 * t + (t >= jumpAt ? 0.3 : 0);
const inSubject = (u: number, v: number, t: number) => Math.abs(u - subjectX(t)) < 0.1 && Math.abs(v - 0.5) < 0.2;

/** OffscreenCanvas as the session uses it: drawImage of a FakeFrame, read back as RGBA. */
class FakeCanvas {
  width: number;
  height: number;
  private src: FakeFrame = { t: 0 };
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() {
    const c = this;
    return {
      setTransform() {}, translate() {}, rotate() {},
      drawImage(src: FakeFrame) { c.src = src; },
      getImageData(_x: number, _y: number, W: number, H: number) {
        const data = new Uint8ClampedArray(W * H * 4), t = c.src.t;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H, k = (y * W + x) * 4;
          const tex = 60 + 30 * Math.sin(u * 40) * Math.cos(v * 30);
          const s = inSubject(u, v, t) ? 200 : tex;
          data[k] = s * 0.6; data[k + 1] = s * 0.8; data[k + 2] = s; data[k + 3] = 255;
          // The frame's time in the first pixel (the model fake reads it back: which frame was encoded).
        }
        data[0] = Math.round(t * 100) % 256; data[1] = Math.floor(Math.round(t * 100) / 256);
        return { data };
      },
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeCanvas;

type Fake = {
  model: EdgeTam;
  frames: SessionFrames;
  /** Clip times the frame source was asked for, in order. */
  reads: number[];
  /** Encodes so far; the encode numbered failAt (1-based) throws. */
  encodes: number;
  /** Tracker steps so far. */
  steps: number;
  /** The clip times encoded, in order, and each tracker step's bank key and frame. */
  encoded: number[];
  stepped: { key: string; t: number }[];
  failAt: number;
  /** The subject is on screen between these clip times (the model finds nothing outside them). */
  visible: [number, number];
  /** And not inside this stretch (the subject leaves and comes back). */
  gone: [number, number] | null;
  disposed: boolean;
};

function fake(opts: Partial<Pick<Fake, "failAt" | "visible" | "gone">> & { lite?: boolean } = {}): Fake {
  const f: Fake = { model: null as unknown as EdgeTam, frames: null as unknown as SessionFrames, reads: [], encodes: 0, steps: 0, encoded: [], stepped: [], failAt: opts.failAt ?? Infinity, visible: opts.visible ?? [-Infinity, Infinity], gone: opts.gone ?? null, disposed: false };
  let encT = 0;
  const lw = 64, lh = 36;
  const mask = (t: number) => {
    const logits = new Float32Array(lw * lh), on = t >= f.visible[0] - 1e-6 && t <= f.visible[1] + 1e-6 && !(f.gone && t > f.gone[0] + 1e-6 && t < f.gone[1] - 1e-6);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) logits[y * lw + x] = on && inSubject((x + 0.5) / lw, (y + 0.5) / lh, t) ? 10 : -10;
    return { logits, lw, lh, score: on ? 5 : -5, iou: 0.95 };
  };
  f.model = {
    lite: !!opts.lite,
    timing: { encode: 0, encodes: 0, attend: 0, decoder: 0, memEnc: 0, steps: 0 },
    async encode(rgba: Uint8ClampedArray) {
      if (++f.encodes === f.failAt) throw new Error("failed to allocate a buffer of size 67108864");
      encT = (rgba[0] + 256 * rgba[1]) / 100;
      f.encoded.push(encT);
    },
    async step(key: string) { f.steps++; f.stepped.push({ key, t: encT }); return mask(encT); },
    async probe() { return mask(encT); },
    drop() {},
  } as unknown as EdgeTam;
  f.frames = {
    // A wide strip (mask grid 320×40): the session's per-frame work is by the pixel, and the tests are about its logic.
    width: 1920, height: 240, rotation: 0,
    async at(t: number) { f.reads.push(t); return { t } as unknown as CanvasImageSource; },
    dispose() { f.disposed = true; },
  };
  return f;
}

type Run = {
  s: SegSession;
  frames: Map<number, SessionFrameOut>;
  asked: { k: number; t: number; search: boolean }[];
  /** The seeds this run's "main thread" answered with, in order (what a replay hands over). */
  log: { t: number; objs: (SegObject & { id: number })[] }[];
  errors: string[];
  idles: number;
  traces: string[];
  /** Called on every progress event (taps: tapped objects still being followed). */
  onProgress: ((done: number, total: number, taps: number) => void) | null;
  onPeek?: (k0: number, state: string) => void;
  /** Resolves at the next idle or error. */
  settled(): Promise<void>;
};

/** A session whose "main thread" answers every request for seeds with `seedsFor(t)` (null: leaves it unanswered). */
function open(f: Fake, span: { start: number; end: number }, seedsFor: (t: number) => (SegObject & { id: number })[] | null, opts: SessionOptions = {}): Run {
  let wake: (() => void) | null = null;
  const done = () => { const w = wake; wake = null; w?.(); };
  const r: Run = {
    s: null as unknown as SegSession, frames: new Map(), asked: [], log: [], errors: [], idles: 0, traces: [], onProgress: null,
    settled: () => new Promise<void>((res) => { wake = res; }),
  };
  const ev: SessionEvents = {
    frames: (items) => { for (const x of items) r.frames.set(x.i, x); },
    keys: () => undefined,
    progress: (d, t, taps) => r.onProgress?.(d, t, taps),
    trace: (msg) => { r.traces.push(msg); },
    peek: (k0, state) => r.onPeek?.(k0, state),
    idle: () => { r.idles++; done(); },
    rejected: () => undefined,
    needSeeds: (k, t, search) => {
      r.asked.push({ k, t, search });
      const objs = seedsFor(t);
      if (objs) setTimeout(() => { r.log.push({ t, objs }); r.s.seeds(t, objs); }, 0);
    },
    error: (msg) => { r.errors.push(msg); done(); },
  };
  r.s = new SegSession(f.model, f.frames, span, ev, opts);
  return r;
}

let ids = 100;
const subject = (t: number): SegObject & { id: number } => ({ id: ids++, kind: "include", t, prompt: { points: [[subjectX(t), 0.5]], labels: [1] } });

// ---------------------------------------------------------------- a throw in the pass is reported, not swallowed

{
  const f = fake({ failAt: 3 });
  const r = open(f, { start: 0, end: 2 }, () => []);
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.equal(r.errors.length, 1, "one error event");
  assert.match(r.errors[0], /failed to allocate/);
  assert.equal(r.idles, 0, "a failed pass is not reported as finished");
  assert.equal(r.s.busy, false);
  assert.match(r.s.failed ?? "", /failed to allocate/);
  assert.equal(f.disposed, true, "the decoder is released");
  // Later requests fail at once (the main thread has been told; nothing hangs).
  await assert.rejects(r.s.autoSeeds(0.5));
  await assert.rejects(r.s.excludeAt(1000, 0.5, 0.5, 0.5));
  const before = f.encodes;
  r.s.add(subject(1));
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(f.encodes, before, "a failed session does no more work");
  assert.equal(r.errors.length, 1);
  console.log("session: a throw in the pass → error event, no idle: ok");
}

// A healthy pass still ends idle with the clip filled.
{
  const f = fake();
  const r = open(f, { start: 0, end: 2 }, () => []);
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.equal(r.errors.length, 0);
  assert.equal(r.idles, 1);
  assert.equal(r.frames.size, r.s.grid.n, "every grid frame filled");
  // Keyframes are 4 a second, the fill grid 30: the keyframe at 0.25 s lies between grid frames 7 and 8. Each has its
  // own pixels (the keyframe used to share grid frame 8's cache slot, so frame 8 was filled from the keyframe's).
  const read = (t: number) => f.reads.some((x) => Math.abs(x - t) < 1e-9);
  assert.ok(read(0.25), "the keyframe at 0.25 s is decoded");
  assert.ok(read(8 / 30), "grid frame 8 is decoded itself");
  assert.ok(read(0.75) && read(23 / 30), "and the next pair");
  // The frames between two keyframes are read on the way to the second, so the fill of that stretch (right after
  // the step) has them: the decoder is never asked for a frame behind its position (each was a restart).
  assert.equal(f.reads.filter((t, i) => i > 0 && t < f.reads[i - 1] - 1e-6).length, 0, "the pass reads the clip in time order");
  assert.equal(new Set(f.reads.map(frameKey)).size, f.reads.length, "and each frame once");
  assert.equal(frameKey(0.5), frameKey(15 / 30), "a keyframe on the grid shares its grid frame's entry");
  assert.notEqual(frameKey(0.25), frameKey(8 / 30));
  for (let i = 1; i < 300; i++) assert.notEqual(frameKey(i / 30), frameKey((i - 1) / 30));
  // Every frame with the subject carries its contrast against the water around it (bright on a darker texture here):
  // the clip's one pop direction comes from their mean (SegLive.pop), not from what the engine happened to draw.
  const pops = [...r.frames.values()].map((x) => x.pop).filter((p): p is number => typeof p === "number");
  assert.equal(pops.length, r.frames.size, "a measure on every frame");
  assert.ok(pops.every((p) => p > 1 && p < 4), `the subject is lighter than the water (${Math.min(...pops).toFixed(2)}..${Math.max(...pops).toFixed(2)})`);
  console.log("session: healthy pass → idle, all frames, each frame its own pixels: ok");
}

// The model's own search (a queued request) failing fails the session too, and its caller is answered.
{
  const f = fake({ failAt: 1 });
  const r = open(f, { start: 0, end: 1 }, () => []);
  const end = r.settled();
  await assert.rejects(r.s.autoSeeds(0), /failed to allocate/);
  await end;
  assert.equal(r.errors.length, 1);
  assert.equal(r.idles, 0);
  console.log("session: a failed queued request → error event: ok");
}

// ---------------------------------------------------------------- replay after a hibernation

const sameFrames = (a: Map<number, SessionFrameOut>, b: Map<number, SessionFrameOut>, what: string) => {
  assert.equal(b.size, a.size, `${what}: as many frames filled`);
  const eq = (x: Uint8Array | null, y: Uint8Array | null) => (x === null || y === null ? x === y : x.length === y.length && x.every((v, i) => v === y[i]));
  for (const [i, x] of a) {
    const y = b.get(i);
    assert.ok(y, `${what}: frame ${i} filled`);
    assert.ok(eq(x.alpha, y.alpha) && eq(x.nearQ, y.nearQ) && eq(x.depQ, y.depQ) && eq(x.excQ, y.excQ), `${what}: frame ${i} identical`);
    assert.equal(y.pop, x.pop, `${what}: frame ${i} measures the same subject / water contrast`);
  }
};

// A clip whose subject only shows up at 3 s: the first segments find nothing, so the session inserts extra segment
// starts (2 s, then 4 s later: 6 s) between the regular ones (0 s, 8 s) as it tracks. A replay hands every seed over up front, before
// any tracking, when those extra starts do not exist yet: with seeds matched by index they landed on the wrong
// frames or were dropped, and the session then waited for ever for a segment the main thread had already answered.
{
  const visible: [number, number] = [3, 9];
  const seedsFor = (t: number) => (t >= visible[0] && t <= visible[1] ? [subject(t)] : []);
  const f1 = fake({ visible });
  const a = open(f1, { start: 0, end: 10 }, seedsFor);
  let end = a.settled();
  a.log.push({ t: 0, objs: seedsFor(0) });
  a.s.seeds(0, a.log[0].objs);
  await end;
  assert.equal(a.errors.length, 0);
  assert.deepEqual(a.log.map((l) => l.t), [0, 2, 6, 8], "segment starts as tracking met them (two inserted, the wait doubling)");
  assert.deepEqual(a.asked.map((x) => x.search), [true, true, true], "extra starts keep the model's search until SEG.reacquireSearches (3) empty ones in a row");
  assert.deepEqual(a.log.map((l) => l.objs.length), [0, 0, 1, 1]);
  assert.ok(a.frames.size > 0);

  // The replay: a fresh session, the same seeds all at once (the first seeds first: they fix the grid; the rest in
  // any order, repeats ignored), and a main thread that answers nothing more.
  const f2 = fake({ visible });
  const b = open(f2, { start: 0, end: 10 }, () => null);
  end = b.settled();
  for (const l of a.log) b.s.seeds(l.t, l.objs);
  for (const l of [...a.log].reverse()) b.s.seeds(l.t, []);
  const timeout = new Promise<"hung">((res) => setTimeout(() => res("hung"), 60000).unref());
  assert.equal(await Promise.race([end.then(() => "done"), timeout]), "done", "the replay finishes");
  assert.equal(b.errors.length, 0);
  assert.equal(b.idles, 1);
  assert.deepEqual(b.asked, [], "the replay asks for nothing it was already given");
  assert.equal(b.s.busy, false);
  sameFrames(a.frames, b.frames, "replay");
  console.log("session: replay with inserted segment starts → same masks, no hang: ok");
}

// An exclude tap replays as what it came to. Its outcome depends on the masks tracked when the tap came, so the
// session used to stay awake for good after one (no hibernation, no release for the export). Logged as its outcome
// (studio-seg.ts excludeOutcome), a fresh session given the log before any tracking ends with the same masks.
{
  const { excludeOutcome } = await import("../src/pipeline/seg/studio-seg.ts");
  const s0 = subject(0);
  const f1 = fake();
  const a = open(f1, { start: 0, end: 2 }, () => []);
  let end = a.settled();
  a.s.seeds(0, [s0]);
  await end;
  const shown = popped(a.frames);
  assert.ok(shown > 30, "the subject is popped before the tap");
  // The tap on the subject, after the pass: most of it under the tap's own mask → the subject goes, whole.
  end = a.settled();
  const r = await a.s.excludeAt(900, 1, subjectX(1), 0.5);
  assert.deepEqual(r, { action: "removed", removed: s0.id });
  await end;
  assert.equal(popped(a.frames), 0, "nothing is popped after it");
  const entry = excludeOutcome(r, 900, 1, subjectX(1), 0.5);
  assert.deepEqual(entry, { op: "remove", id: s0.id });

  // Replay: seeds and the removal up front (the subject's object does not exist yet when it is removed).
  const f2 = fake();
  const b = open(f2, { start: 0, end: 2 }, () => []);
  end = b.settled();
  b.s.seeds(0, [s0]);
  b.s.remove(s0.id);
  await end;
  sameFrames(a.frames, b.frames, "replayed removal");

  // Undo (restore) brings the subject back, as a pass that never lost it.
  end = b.settled();
  b.s.restore(s0.id);
  await end;
  assert.equal(popped(b.frames), shown, "restored");

  // A tap on nothing the ML pops is an exclude object; its log entry is the object the session added.
  const f3 = fake();
  const c = open(f3, { start: 0, end: 1 }, () => []);
  end = c.settled();
  c.s.seeds(0, []);
  const r2 = await c.s.excludeAt(901, 0.5, 0.9, 0.5);
  assert.deepEqual(r2, { action: "exclude" });
  assert.deepEqual(excludeOutcome(r2, 901, 0.5, 0.9, 0.5), { op: "add", object: { id: 901, kind: "exclude", t: 0.5, prompt: { points: [[0.9, 0.5]], labels: [1] } } });
  await end;
  console.log("session: exclude taps replay as their outcome: ok");
}

// ---------------------------------------------------------------- the session tracks the trim only

{
  const { segSpan, scopeServes, logForSpan } = await import("../src/pipeline/seg/studio-seg.ts");
  // The selection plus a margin each side, inside the clip; untrimmed: the whole clip.
  assert.deepEqual(segSpan(null, 60), { start: 0, end: 60 });
  assert.deepEqual(segSpan({ start: 20, end: 30 }, 60), { start: 19.5, end: 30.5 });
  assert.deepEqual(segSpan({ start: 0.2, end: 59.9 }, 60), { start: 0, end: 60 });
  // The same selection is served; another one only by a finished pass that contains it.
  assert.equal(scopeServes(null, null, false), true);
  assert.equal(scopeServes({ start: 20, end: 30 }, { start: 20, end: 30 }, false), true);
  assert.equal(scopeServes(null, { start: 20, end: 30 }, false), false, "a whole-clip pass still running is restarted on the selection");
  assert.equal(scopeServes(null, { start: 20, end: 30 }, true), true, "a finished whole-clip pass has the selection's masks");
  assert.equal(scopeServes({ start: 20, end: 30 }, { start: 22, end: 28 }, true), true);
  assert.equal(scopeServes({ start: 20, end: 30 }, { start: 18, end: 28 }, true), false, "the selection grew past the pass");
  assert.equal(scopeServes({ start: 20, end: 30 }, null, true), false, "the trim was cleared");
  // A re-scoped session keeps the taps inside its range (and what was done to them), not the engine's seeds.
  const tap = (id: number, t: number) => ({ op: "add" as const, object: { ...subject(t), id } });
  const log = [{ op: "seeds" as const, t: 0, objects: [{ ...subject(0), id: 1 }] }, tap(2, 5), tap(3, 25), { op: "remove" as const, id: 1 }, { op: "remove" as const, id: 3 }, { op: "restore" as const, id: 3 }, { op: "remove" as const, id: 2 }];
  assert.deepEqual(logForSpan(log, { start: 19.5, end: 30.5 }).map((l) => `${l.op}:${l.op === "add" ? l.object.id : l.op === "seeds" ? "s" : l.id}`), ["add:3", "remove:3", "restore:3"]);

  // A session over 20–22 s of a longer clip: its grid, its keyframes and every frame it decodes lie inside the range,
  // and the pass ends there (the export waits for the selection, not the clip).
  const f = fake();
  const r = open(f, segSpan({ start: 20.5, end: 21.5 }, 60), () => []);
  const end = r.settled();
  r.s.seeds(20.5, [subject(20.5)]);
  await end;
  assert.equal(r.errors.length, 0);
  assert.equal(r.s.grid.i0, 600);
  assert.equal(r.s.grid.n, 61);
  assert.ok(f.reads.every((t) => t >= 20 - 1e-6 && t <= 22 + 1e-6), "nothing outside the range is decoded");
  assert.ok(Math.min(...r.frames.keys()) <= 15 && Math.max(...r.frames.keys()) === 60, "filled from the selection's start to the range's end");
  // stop(): closes and waits for the loop (the next session never shares the model with a step under way).
  const g = fake();
  const q = open(g, { start: 0, end: 4 }, () => []);
  q.s.seeds(0, [subject(0)]);
  await new Promise((res) => setTimeout(res, 5));
  await q.s.stop();
  const n = g.encodes;
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(g.encodes, n, "a stopped session has left the model");
  assert.equal(q.idles, 0);
  console.log("session: tracks the trim only; re-scope keeps the taps: ok");
}

// ---------------------------------------------------------------- adaptive keyframes (the lite model)

{
  const pass = async (f: Fake, end: number, opts: SessionOptions = {}) => {
    const r = open(f, { start: 0, end }, () => [], opts);
    const done = r.settled();
    r.s.seeds(0, [subject(0)]);
    await done;
    assert.equal(r.errors.length, 0);
    assert.equal(r.frames.size, r.s.grid.n, "every grid frame filled");
    return r;
  };
  // A calm clip: the lite model steps twice a second (half the model runs of the full one's four), nothing extra.
  const full = fake(), lite = fake({ lite: true });
  await pass(full, 4);
  const calm = await pass(lite, 4);
  assert.equal(full.encodes, 17);
  assert.equal(lite.encodes, 9);
  assert.equal(calm.s.profile().extraKeys, 0);
  assert.equal(lite.reads.filter((t, i) => i > 0 && t < lite.reads[i - 1] - 1e-6).length, 0, "read in time order");
  assert.equal(popped(calm.frames), calm.s.grid.n, "the subject is popped on every frame");
  // `?segfps=N` fixes the rate (no extra keyframes), on either model.
  const fixed = fake({ lite: true });
  await pass(fixed, 4, { fps: 4 });
  assert.equal(fixed.encodes, 17);
  const slow = fake();
  await pass(slow, 4, { fps: 2 });
  assert.equal(slow.encodes, 9);

  // The subject jumps at 1.1 s: the step at 1.5 s disagrees with what the flow carried, and the next second is
  // tracked on the fine grid (1.75 s and 2.25 s on top of the regular 2 s and 2.5 s), then twice a second again.
  jumpAt = 1.1;
  const hard = fake({ lite: true });
  const a = await pass(hard, 4);
  assert.equal(a.s.profile().extraKeys, 2);
  assert.deepEqual(a.s.keys, [0, 0.5, 1, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4]);
  assert.equal(hard.encodes, 11);

  // A tap whose keyframe (0.75 s) the autos do not have, and the autos' extra keyframes the tap may not have: every
  // object is in every keyframe's mask (carried there along the flow), whichever was tracked first. Tap after the
  // pass, and tap and seeds up front (a replay), end with the same frames, the subject popped on all of them.
  const auto = subject(0), tap = { ...subject(0.8), id: 5000 };
  const f1 = fake({ lite: true });
  const one = open(f1, { start: 0, end: 4 }, () => []);
  let end = one.settled();
  one.s.seeds(0, [auto]);
  await end;
  end = one.settled();
  one.s.add(tap);
  await end;
  assert.ok(one.s.keys.includes(0.75), "the tap's own keyframe");
  assert.ok(one.s.profile().carried > 0, "objects without a keyframe there are carried to it");
  assert.equal(popped(one.frames), one.s.grid.n, "no object drops out at another's keyframe");
  const f2 = fake({ lite: true });
  const two = open(f2, { start: 0, end: 4 }, () => []);
  end = two.settled();
  two.s.add(tap);
  two.s.seeds(0, [auto]);
  await end;
  assert.deepEqual(two.s.keys, one.s.keys);
  sameFrames(one.frames, two.frames, "tap before / after the pass");
  jumpAt = Infinity;
  console.log("session: lite model → 2 keyframes a second, extra ones where the flow disagrees; order-independent: ok");
}

// ---------------------------------------------------------------- a clip with nothing to follow

{
  // 30 s, no subject anywhere: looked through at 0, 2, 6 s, then every 4 s (SEG.reacquireMaxS) where it used to be
  // every 2 s (15 looks, now 9); the model's search is left out of extra starts after three empty ones in a row.
  const f = fake({ visible: [100, 200] });
  const r = open(f, { start: 0, end: 30 }, () => []);
  const end = r.settled();
  r.s.seeds(0, []);
  await end;
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.asked.map((x) => x.t), [2, 6, 8, 12, 16, 20, 24, 28]);
  assert.deepEqual(r.asked.map((x) => x.search), [true, true, true, false, true, false, true, false]);
  assert.equal(f.encodes, 0, "no model run without a subject");
  console.log("session: empty clip → the looks back off (2, 4, 4 s): ok");
}

// ---------------------------------------------------------------- the lite model follows two automatic subjects

{
  const four = () => [subject(0), subject(0), subject(0), subject(0)];
  const run = async (lite: boolean) => {
    const f = fake({ lite });
    const r = open(f, { start: 0, end: 2 }, () => [], { fps: 2 });
    let end = r.settled();
    r.s.seeds(0, four());
    await end;
    const autos = f.steps;
    // A tap is followed whatever the autos are (forward and back from its keyframe: 5 keyframes + the prompt again).
    end = r.settled();
    r.s.add({ ...subject(1), id: 7000 });
    await end;
    assert.equal(r.errors.length, 0);
    return { autos, tap: f.steps - autos };
  };
  assert.deepEqual(await run(false), { autos: 20, tap: 6 });
  assert.deepEqual(await run(true), { autos: 10, tap: 6 }, "the first two seeds only; the tap as ever");
  console.log("session: lite model → at most two automatic subjects, taps kept: ok");
}

// ---------------------------------------------------------------- the pass profile line (breadcrumbs, About)

{
  const { profileLine } = await import("../src/pipeline/seg/studio-seg.ts");
  const f = fake({ lite: true });
  const r = open(f, { start: 0, end: 2 }, () => []);
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  const p = r.s.profile();
  assert.equal(p.objects, 1);
  assert.equal(p.keyframes, 5);
  assert.equal(p.restarts, 0);
  assert.ok(p.runMs > 0 && p.clipS > 2);
  const line = profileLine({ ...p, encodeMs: 9000, encodes: 5, attendMs: 500, decoderMs: 250, memEncMs: 1000, steps: 5, heapMB: 612 }, "wasm lite, 1 thr");
  assert.match(line, /^ai: profile wasm lite, 1 thr · encode 1800ms×5 · attn 100 dec 50 mem 200ms×5 steps · keys 5 \(2\/s \+0 extra\) objs 1 · decode /);
  assert.match(line, /\(0 restarts\) · guard .* fill .*×61 maps .* seeds .* · total [0-9.]+s for 2\.0s · heap 612 MB$/);
  // Nothing measured (an old worker, a field missing): zeros, never NaN.
  assert.doesNotMatch(profileLine({}), /NaN|undefined/);
  console.log("pass profile line: ok");
}

// ---------------------------------------------------------------- a subject that leaves and comes back

// Gone from 5.5 s; segments start every 8 s. Every frame of the range ends up filled (empty where there is nothing
// to follow), and the subject is followed again as soon as it is back:
//  - back at 8 s, the look at the 8 s start sees it: followed from 8 s;
//  - back at 8.2 s and no look ever sees it (the engine is blind there): the object that lost it is followed on past
//    the start (SEG.lostS) and knows it again at its next keyframe. At 2 keyframes a second it was dropped at 8 s;
//  - back at 11.3 s (too long gone to follow on), seen by the look at 12 s: the stretch 8.5–11.5 s, which no step
//    touched, was never filled at all (90 frames; the engine's masks, but "not done" to everything that counts).
for (const [gone, sees, from, lite] of [
  [[5.5, 8], true, 8.1, true], [[5.5, 8], true, 8.1, false],
  [[5.5, 8.2], false, 8.6, true],
  [[5.5, 11.3], true, 12.1, true],
] as [[number, number], boolean, number, boolean][]) {
  const there = (t: number) => !(t > gone[0] + 1e-6 && t < gone[1] - 1e-6);
  const f = fake({ lite, gone });
  const r = open(f, { start: 0, end: 14 }, (t) => (sees && there(t) ? [subject(t)] : []));
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.equal(r.errors.length, 0);
  const missing: number[] = [];
  for (let i = 0; i < r.s.grid.n; i++) if (!r.frames.has(i)) missing.push(i);
  assert.deepEqual(missing, [], `back at ${gone[1]} s: every frame of the range is filled`);
  const on = (t: number) => rleDecode(r.frames.get(Math.round(t * 30))!.alpha, 320 * 40).some((a) => a > 127);
  assert.ok(on(5) && !on(6.5) && !on(7.5), "popped while there, empty while gone");
  assert.ok(on(from) && on(13.9), `back at ${gone[1]} s: followed again from ${from} s`);
  assert.equal(r.asked[0].t, 8, "the regular start at 8 s");
}
console.log("session: a subject that leaves and comes back → every frame filled, followed again when back: ok");

// Before any subject and in a clip without one, the frames are filled too (empty), without a model run or a decode.
{
  const f = fake({ lite: true, visible: [100, 200] });
  const r = open(f, { start: 0.1, end: 6 }, () => []);
  const end = r.settled();
  r.s.seeds(0.1, []);
  await end;
  assert.equal(r.frames.size, r.s.grid.n, "every frame filled");
  assert.equal(popped(r.frames), 0);
  assert.equal(f.encodes, 0);
  assert.equal(f.reads.length, 0, "nothing decoded for empty frames");
  console.log("session: nothing to follow → empty frames for the whole range: ok");
}


// ---------------------------------------------------------------- a tap: forward to the end, then backward in chunks

/** Decoder restarts the reads would cost (frames.ts: a read behind the decoder's position, or over 2 s ahead). */
const restarts = (reads: number[]) => reads.filter((t, i) => i > 0 && (t < reads[i - 1] - 1e-3 || t - reads[i - 1] > 2)).length;

{
  const f = fake();
  const r = open(f, { start: 0, end: 8 }, (t) => [subject(t)]);
  let end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  const e0 = f.encoded.length, r0 = f.reads.length, t0 = r.traces.length;
  end = r.settled();
  r.s.add({ ...subject(4), id: 9000 });
  await end;
  assert.equal(r.errors.length, 0);
  const enc = f.encoded.slice(e0);
  // The tapped keyframe, then forward to the end of the clip, then back to its start: one turn, where the two
  // directions used to alternate (every other step a decoder restart, and its fill another).
  assert.equal(enc[0], 4);
  const turn = enc.indexOf(Math.max(...enc));
  assert.equal(enc[turn], 8, "forward to the end of the reach");
  for (let i = 1; i <= turn; i++) assert.ok(enc[i] > enc[i - 1], `forward step ${i} is later than the one before`);
  for (let i = turn + 1; i < enc.length; i++) assert.ok(enc[i] < enc[i - 1], `backward step ${i} is earlier than the one before`);
  assert.equal(enc[enc.length - 1], 0, "back to the start");
  const steps = f.stepped.filter((x) => x.key.startsWith("9000"));
  assert.deepEqual(steps.slice(0, 3).map((x) => `${x.key}@${x.t}`), ["9000f@4", "9000b@4", "9000f@4.25"], "both banks start on the tapped frame, on one encode");
  assert.equal(enc.filter((t) => t === 4).length, 1);
  assert.equal(enc[turn + 1], 3.75, "the backward list goes on from the tapped keyframe");
  // Backward, the frames come a chunk (SEG.backChunkS) at a time in one read in time order: a restart a chunk (four
  // seconds back: four), plus the jump to the tap. Step by step it was two a keyframe (32).
  const n = restarts(f.reads.slice(r0 - 1));
  assert.ok(n <= 6, `${n} decoder restarts for the tap`);
  // Every frame read for the tap is read once (the backward chunk's frames serve its steps and its fills).
  const mine = f.reads.slice(r0).map(frameKey);
  assert.equal(new Set(mine).size, mine.length, "no frame decoded twice for the tap");
  assert.equal(r.frames.size, r.s.grid.n);
  assert.equal(popped(r.frames), r.s.grid.n);
  // The breadcrumbs start over with the tap: its first encodes and its turn are in a crash log.
  const tr = r.traces.slice(t0);
  assert.match(tr[0], /^tap 9000 include 4\.00s: 17 fwd, 17 back$/);
  assert.equal(tr.filter((x) => x.startsWith("encode ")).length, 3);
  assert.ok(tr.some((x) => /^back 3\.00-4\.00s \(4 keys\)$/.test(x)), tr.join(" | "));
  // One breadcrumb when the tap's job starts and one when it ends, numbered (a crash log shows what was alive).
  const jobs = tr.filter((x) => x.startsWith("job "));
  assert.match(jobs[0], /^job \d+ tap 9000 start$/);
  assert.match(tr[tr.length - 1], /^job \d+ tap 9000 end: followed, \d+ steps, /);
  assert.equal(jobs.length, 2, jobs.join(" | "));
  console.log(`session: a tap → forward to the end, then backward in chunks (${n} decoder restarts): ok`);
}

// The auto pass stands still while a tap is followed, and the result is the same as with the tap up front.
{
  const tap = { ...subject(3), id: 9100 };
  const f = fake({ lite: true });
  const r = open(f, { start: 0, end: 6 }, (t) => [subject(t)]);
  let end = r.settled(), added = -1;
  const taps: number[] = [];
  r.onProgress = (_d, _t, n) => {
    taps.push(n);
    if (added < 0 && f.encodes >= 3) { added = f.stepped.length; r.s.add(tap); }
  };
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.ok(added > 0, "the tap came in mid-pass");
  const after = f.stepped.slice(added).map((x) => x.key.startsWith("9100"));
  const last = after.lastIndexOf(true);
  assert.ok(last > 0 && after.slice(0, last + 1).every(Boolean), "no auto step until the tap is followed through");
  assert.ok(after.length > last + 1, "then the pass goes on");
  // The main thread's sign that a tap is being followed (it holds its own heavy work back until it reads 0).
  assert.ok(taps.includes(1), "progress says a tap is being followed");
  assert.equal(taps[taps.length - 1], 0);
  assert.equal(taps.lastIndexOf(1) - taps.indexOf(1) + 1, taps.filter((x) => x === 1).length, "in one stretch");
  const g = fake({ lite: true });
  const q = open(g, { start: 0, end: 6 }, (t) => [subject(t)]);
  end = q.settled();
  q.s.add(tap);
  q.s.seeds(0, [subject(0)]);
  await end;
  sameFrames(q.frames, r.frames, "tap mid-pass / up front");
  console.log("session: the auto pass waits for a tap; same masks whenever it came: ok");
}

// ---------------------------------------------------------------- playhead first

{
  // 14 s on the phone model; the user is paused at 9.1 s when the pass has just begun.
  const at = 9.1, gi = Math.round(at * 30);
  const plain = fake({ lite: true });
  const p = open(plain, { start: 0, end: 14 }, (t) => [subject(t)]);
  let end = p.settled();
  p.s.seeds(0, [subject(0)]);
  await end;

  const f = fake({ lite: true });
  const r = open(f, { start: 0, end: 14 }, (t) => [subject(t)]);
  assert.equal(r.s.focus(at, [subject(at)]), false, "not before the pass has its first seeds");
  let asked = false, shownAt = -1, taken = false, near = true, again = true, margin = -1;
  const on = () => { const x = r.frames.get(gi); return !!x && rleDecode(x.alpha, 320 * 40).some((a) => a > 127); };
  const peeks: string[] = [];
  r.onPeek = (k0, state) => peeks.push(`${k0} ${state}`);
  r.onProgress = () => {
    if (!asked) {
      asked = true;
      // Where the pass is about to be anyway: nothing to do.
      near = r.s.focus(1.2, [subject(1.2)]);
      taken = r.s.focus(at, [subject(at)]);
      again = r.s.focus(at + 0.05, [subject(at)]);
    }
    if (shownAt < 0 && on()) shownAt = f.encodes;
    // Once the peek's forward step has come (the pass itself is seconds of clip away): how far behind the playhead
    // the frames are filled.
    if (margin < 0 && f.encoded.includes(9.5) && !f.encoded.includes(1.5)) { let i = gi; while (r.frames.has(i - 1)) i--; margin = gi - i; }
  };
  end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.equal(r.errors.length, 0);
  assert.deepEqual(peeks, ["9 looking", "9 following"], "the look says when it is taken up and that it has a subject");
  // The overlay's weight eases to nothing over 9 frames (0.3 s) toward unfilled frames: the playhead's frame, 3
  // frames after its keyframe, had a mask too weak to be popped. Now the peek fills at least that far behind it.
  assert.ok(margin >= 9, `the frames are filled ${margin} frames behind the playhead`);
  assert.equal(near, false, "no peek where the pass is within SEG.peekSkipS");
  assert.equal(taken, true);
  assert.equal(again, false, "the same keyframe is looked at once");
  // The paused frame has its mask after the peek's first steps (keyframes 9 and 9.5 s), not after the 18 keyframes
  // the pass needs to get there.
  assert.ok(shownAt > 0 && shownAt <= 4, `the playhead's frame was popped after ${shownAt} encodes`);
  const order = f.encoded.slice(0, 6);
  // (9, the keyframe before it for the margin behind the playhead, then ahead.)
  assert.deepEqual(order.slice(1, 5), [9, 8.5, 9.5, 10], `the peek's keyframes right after the pass's first (${order})`);
  assert.ok(f.stepped.some((x) => x.key === "-1f"), "followed as a provisional object");
  // Provisional: the finished pass is the pass without it (keyframes, every frame's maps), so an export is too.
  assert.deepEqual(r.s.keys, p.s.keys, "the peek adds no keyframe");
  sameFrames(p.frames, r.frames, "with / without a look at the playhead");
  assert.equal(r.s.profile().objects, p.s.profile().objects, "no peek object is left");
  assert.equal(r.s.focus(12, [subject(12)]), false, "nothing to look at once the pass is through");
  assert.equal(r.s.busy, false);

  // A keyframe just after the playhead: the one before it is stepped too (the playhead's interval gets both ends),
  // and with no subjects from the engine the model looks itself.
  const g = fake({ lite: true });
  const q = open(g, { start: 0, end: 14 }, (t) => [subject(t)]);
  let did = false, seen = -1;
  const gj = Math.round(8.8 * 30);
  q.onProgress = () => {
    if (!did) { did = true; assert.equal(q.s.focus(8.8, [], true), true); }
    const x = q.frames.get(gj);
    if (seen < 0 && x && rleDecode(x.alpha, 320 * 40).some((a) => a > 127)) seen = g.encodes;
  };
  end = q.settled();
  q.s.seeds(0, [subject(0)]);
  await end;
  assert.deepEqual(g.encoded.slice(1, 5), [9, 8.5, 9.5, 10], `${g.encoded.slice(0, 6)}`);
  // The look's own search is the short one: it ends at its first find (the full one probes all 12 points here).
  assert.equal(q.traces.filter((x) => x.startsWith("auto: probe ")).length, 1, "one probe, not twelve");
  assert.equal(g.encoded.filter((x) => x === 9).length, 2, "the searched frame is not encoded again for the peek's first step (once more by the pass)");
  assert.ok(seen > 0 && seen <= 3, `popped after ${seen} encodes`);
  sameFrames(p.frames, q.frames, "with / without a look just before a keyframe");

  // A tap on what a peek pops is no "remove the subject" (the peek is in no log and goes): an exclude object.
  const h = fake({ lite: true });
  const w = open(h, { start: 0, end: 14 }, (t) => [subject(t)]);
  let ex: Promise<{ action: string }> | null = null, did2 = false;
  w.onProgress = () => {
    if (!did2) { did2 = true; w.s.focus(at, [subject(at)]); }
    if (!ex && w.frames.has(gi)) ex = w.s.excludeAt(9500, at, subjectX(at), 0.5);
  };
  end = w.settled();
  w.s.seeds(0, [subject(0)]);
  await end;
  assert.ok(ex);
  assert.equal((await ex).action, "exclude");
  console.log(`session: playhead first → the paused frame popped after ${shownAt} encodes; the finished pass unchanged: ok`);
}

// ---------------------------------------------------------------- one model job at a time (iPhone crash, 12 Nov)
//
// The crash: mid-pass the session asked for the seeds of its next segment; the user tapped; the main thread, which
// had found no subject of its own on the seed frame, asked for the model's search of that frame, and the session ran
// it between two of the tap's steps (queued requests went ahead of everything). Now: a tap's track, the search, the
// peek and the pass are jobs that take turns; a search waits for the taps, and one under way gives way to a tap.

/** Everything the session did, in order: its breadcrumbs and every model call; and the most model calls at once. */
type Timeline = { log: string[]; peak: number };
function watch(f: Fake, r: Run, onCall?: (what: string) => void): Timeline {
  const tl: Timeline = { log: [], peak: 0 };
  const m = f.model as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  let active = 0;
  for (const k of ["encode", "step", "probe"]) {
    const fn = m[k].bind(m);
    m[k] = async (...a: unknown[]) => {
      active++;
      tl.peak = Math.max(tl.peak, active);
      tl.log.push(`model ${k}${k === "step" ? ` ${a[0]}` : ""}`);
      onCall?.(k);
      // (A real graph run takes a while: whatever could run next to it gets the chance to.)
      await new Promise((res) => setTimeout(res, 0));
      try { return await fn(...a); } finally { active--; }
    };
  }
  const push = r.traces.push.bind(r.traces);
  r.traces.push = (...x: string[]) => { tl.log.push(...x); return push(...x); };
  return tl;
}

type Job = { id: number; name: string; how: string; inside: string[] };

/** The jobs of a timeline, checked: they start and end in turn (never two alive), numbered upward, and every model
 * call is inside one. Returns them in order with what happened inside each. */
function jobsOf(tl: Timeline): Job[] {
  const out: Job[] = [];
  let cur: Job | null = null;
  for (const x of tl.log) {
    const st = /^job (\d+) (.+) start$/.exec(x), en = /^job (\d+) (.+) end: ([^,]+),/.exec(x);
    if (st) {
      assert.equal(cur, null, `job ${st[1]} starts while job ${cur?.id} is alive`);
      assert.ok(+st[1] > (out[out.length - 1]?.id ?? 0), "numbered upward");
      cur = { id: +st[1], name: st[2], how: "", inside: [] };
    } else if (en) {
      assert.ok(cur && cur.id === +en[1] && cur.name === en[2], `job ${en[1]} ends, alive: ${cur?.id}`);
      cur.how = en[3];
      out.push(cur);
      cur = null;
    } else if (x.startsWith("model ")) {
      assert.ok(cur, `${x} outside any job`);
      cur.inside.push(x);
    } else cur?.inside.push(x);
  }
  assert.equal(cur, null, "every job ended");
  assert.equal(tl.peak, 1, "one model call at a time");
  return out;
}

{
  const tap = { ...subject(4.65), id: 9200 };
  // A clip whose segments after the first get no subject from the "engine": the main thread then asks for the
  // model's own search of the seed frame and seeds the segment with what it finds (studio.ts seedSegmentCanonical).
  type Opts = { tapAt: "asked" | "probe" | "front"; delayMs?: number };
  const run = async (o: Opts) => {
    const f = fake({ lite: true });
    let searchIds = 5000, tapped = false;
    const found: { t: number; n: number }[] = [];
    const r = open(f, { start: 0, end: 12 }, (t) => (t < 1 ? [subject(t)] : null));
    const tl = watch(f, r, (k) => {
      // The tap lands while the search is on its probes.
      if (o.tapAt === "probe" && k === "probe" && !tapped) { tapped = true; r.s.add(tap); }
    });
    const asked = r.asked.push.bind(r.asked);
    r.asked.push = (...a) => {
      for (const { t } of a) {
        if (t < 1) continue;
        // The tap lands as the session asks for the next segment's seeds; the main thread's own look at the seed
        // frame takes a moment, then it asks for the model's search: while the tap is being followed.
        if (o.tapAt === "asked" && !tapped) { tapped = true; r.s.add(tap); }
        setTimeout(() => {
          void r.s.autoSeeds(t).then((objs) => {
            found.push({ t, n: objs.length });
            r.s.seeds(t, objs.map((x) => ({ ...x, id: searchIds++ })));
          });
        }, o.delayMs ?? 0);
      }
      return asked(...a);
    };
    const end = r.settled();
    if (o.tapAt === "front") r.s.add(tap);
    r.s.seeds(0, [subject(0)]);
    await end;
    assert.equal(r.errors.length, 0, r.errors.join());
    assert.equal(r.frames.size, r.s.grid.n);
    return { f, r, tl, jobs: jobsOf(tl), found };
  };
  const line = (jobs: Job[]) => jobs.map((j) => `${j.name}: ${j.how}`).join(" | ");

  // The reference: the tap first, the searches undisturbed.
  const ref = await run({ tapAt: "front" });
  assert.deepEqual(ref.found, [{ t: 8, n: 1 }], "the search finds the subject on the seed frame");
  assert.deepEqual(ref.jobs.map((j) => j.name.split(" ")[0]), ["tap", "pass", "search", "pass"], line(ref.jobs));

  // 1. The crash's order of events: the search is asked for while the tap is followed.
  for (const delayMs of [0, 3, 10]) {
    const a = await run({ tapAt: "asked", delayMs });
    const ti = a.jobs.findIndex((j) => j.name === "tap 9200"), si = a.jobs.findIndex((j) => j.name === "search 8.00s");
    assert.ok(ti >= 0 && si > ti, `the search starts after the tap's job has ended (${line(a.jobs)})`);
    assert.equal(a.jobs[ti].how, "followed");
    assert.ok(a.jobs[ti].inside.every((x) => x !== "model probe" && !x.startsWith("auto:")), "nothing of the search inside the tap's job");
    assert.ok(a.jobs[ti].inside.filter((x) => x.startsWith("model step")).every((x) => x.startsWith("model step 9200")), "and no step of the pass");
    assert.equal(a.jobs.filter((j) => j.name === "tap 9200").length, 1, "the tap is followed in one go");
    assert.equal(a.jobs.filter((j) => j.name.startsWith("search")).length, 1, "the search runs once");
    assert.deepEqual(a.found, ref.found);
    sameFrames(ref.r.frames, a.r.frames, `a search asked for during a tap (${delayMs} ms later)`);
  }

  // 2. The tap comes while the search is on its probes: the search stops there, the tap is followed, the search
  //    starts over and gives the same seeds.
  const b = await run({ tapAt: "probe" });
  const s1 = b.jobs.findIndex((j) => j.name === "search 8.00s");
  assert.equal(b.jobs[s1].how, "pre-empted", line(b.jobs));
  assert.equal(b.jobs[s1].inside.filter((x) => x === "model probe").length, 1, "it stops at the probe after the tap");
  assert.equal(b.jobs[s1 + 1].name, "tap 9200");
  assert.equal(b.jobs[s1 + 1].how, "followed");
  assert.equal(b.jobs[s1 + 2].name, "search 8.00s");
  assert.equal(b.jobs[s1 + 2].how, "1 found");
  assert.equal(b.jobs[s1 + 2].inside.filter((x) => x === "model probe").length, 12, "the whole search again");
  assert.deepEqual(b.found, ref.found, "answered once, with the same seeds");
  sameFrames(ref.r.frames, b.r.frames, "a tap during a search");
  console.log("session: tap during the pass + the model's search → one job at a time, the tap first, same masks: ok");
}

// An exclude tap that takes a subject out ends without a tracker step after it: the session still says that no tap
// is left (a progress event), also when it then waits for seeds (the main thread holds the seed frame back for it).
{
  const f = fake();
  const r = open(f, { start: 0, end: 12 }, (t) => (t < 1 ? [subject(t)] : null));
  const tl = watch(f, r);
  r.s.seeds(0, [subject(0)]);
  const nap = () => new Promise((res) => setTimeout(res, 5));
  for (let i = 0; i < 4000 && !r.asked.some((a) => a.t === 8); i++) await nap();
  await nap();
  assert.equal(r.s.busy, true, "waiting for the seeds of 8 s");
  const taps: number[] = [];
  r.onProgress = (_d, _t, n) => taps.push(n);
  const x = await r.s.excludeAt(9300, 1, subjectX(1), 0.5);
  assert.equal(x.action, "removed");
  for (let i = 0; i < 4000 && !taps.length; i++) await nap();
  assert.equal(taps[taps.length - 1], 0, "no tap left, said after the tap's own step");
  assert.equal(r.idles, 0, "still waiting for seeds");
  const jobs = jobsOf(tl);
  assert.equal(jobs[jobs.length - 1].name, "exclude 9300");
  r.s.close();
  console.log("session: an exclude tap that removes a subject → progress without a tap left: ok");
}

// A phone short of memory keeps fewer decoded frames; the masks are the same.
{
  const mk = async (weak: boolean) => {
    const f = fake({ lite: true });
    const r = open(f, { start: 0, end: 6 }, (t) => [subject(t)], { weak });
    const end = r.settled();
    r.s.add({ ...subject(3), id: 9400 });
    r.s.seeds(0, [subject(0)]);
    await end;
    assert.equal(r.errors.length, 0);
    const held = (r.s as unknown as { lumaCache: Map<number, Uint8Array> }).lumaCache.size;
    return { r, held };
  };
  const strong = await mk(false), weak = await mk(true);
  assert.ok(weak.held <= 96 && strong.held > 96, `frames kept: ${weak.held} (weak) / ${strong.held}`);
  sameFrames(strong.r.frames, weak.r.frames, "weak device");
  console.log(`session: a weak phone keeps ${weak.held} decoded frames (not ${strong.held}); same masks: ok`);
}

// The session's memory banks leave the model when it stops (they stayed for the worker's life).
{
  const f = fake();
  let resets = 0;
  (f.model as unknown as { reset: () => Promise<void> }).reset = async () => { resets++; };
  const r = open(f, { start: 0, end: 2 }, () => []);
  r.s.seeds(0, [subject(0)]);
  await new Promise((res) => setTimeout(res, 5));
  await r.s.stop();
  assert.equal(resets, 1);
  assert.equal(f.disposed, true);
  await assert.rejects(r.s.autoSeeds(0.5), /session closed/);
  console.log("session: stop → the model is reset: ok");
}
