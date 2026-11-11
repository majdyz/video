// AI subject detection, the background session (seg/session.ts) on a fake model and fake frames: what it does when
// the model throws, and that its masks are a function of its inputs alone.
//   node --experimental-strip-types apps/studio/test/seg-session.test.ts
import assert from "node:assert/strict";
import type { EdgeTam } from "../src/pipeline/seg/edgetam.ts";
import { SegSession, type SessionEvents, type SessionFrameOut, type SessionFrames } from "../src/pipeline/seg/session.ts";
import type { SegObject } from "../src/pipeline/seg/track.ts";

// ---------------------------------------------------------------- fakes

/** A frame of the fake clip: a soft texture with a bright square (the subject) at x0 (share of the width). */
type FakeFrame = { t: number };
const subjectX = (t: number) => 0.3 + 0.02 * t;
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
        data[0] = Math.round(t * 10) % 256; data[1] = Math.floor((t * 10) / 256);
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
  failAt: number;
  /** The subject is on screen between these clip times (the model finds nothing outside them). */
  visible: [number, number];
  disposed: boolean;
};

function fake(opts: Partial<Pick<Fake, "failAt" | "visible">> = {}): Fake {
  const f: Fake = { model: null as unknown as EdgeTam, frames: null as unknown as SessionFrames, reads: [], encodes: 0, failAt: opts.failAt ?? Infinity, visible: opts.visible ?? [-Infinity, Infinity], disposed: false };
  let encT = 0;
  const lw = 64, lh = 36;
  const mask = (t: number) => {
    const logits = new Float32Array(lw * lh), on = t >= f.visible[0] - 1e-6 && t <= f.visible[1] + 1e-6;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) logits[y * lw + x] = on && inSubject((x + 0.5) / lw, (y + 0.5) / lh, t) ? 10 : -10;
    return { logits, lw, lh, score: on ? 5 : -5, iou: 0.95 };
  };
  f.model = {
    lite: false,
    timing: { encode: 0, encodes: 0, attend: 0, decoder: 0, memEnc: 0, steps: 0 },
    async encode(rgba: Uint8ClampedArray) {
      if (++f.encodes === f.failAt) throw new Error("failed to allocate a buffer of size 67108864");
      encT = (rgba[0] + 256 * rgba[1]) / 10;
    },
    async step() { return mask(encT); },
    async probe() { return mask(encT); },
    drop() {},
  } as unknown as EdgeTam;
  f.frames = {
    width: 1920, height: 1080, rotation: 0,
    async at(t: number) { f.reads.push(t); return { t } as unknown as CanvasImageSource; },
    dispose() { f.disposed = true; },
  };
  return f;
}

type Run = {
  s: SegSession;
  frames: Map<number, SessionFrameOut>;
  asked: { k: number; t: number }[];
  errors: string[];
  idles: number;
  /** Resolves at the next idle or error. */
  settled(): Promise<void>;
};

/** A session whose "main thread" answers every request for seeds with `seedsFor(t)` (null: leaves it unanswered). */
function open(f: Fake, span: { start: number; end: number }, seedsFor: (t: number) => (SegObject & { id: number })[] | null): Run {
  let wake: (() => void) | null = null;
  const done = () => { const w = wake; wake = null; w?.(); };
  const r: Run = {
    s: null as unknown as SegSession, frames: new Map(), asked: [], errors: [], idles: 0,
    settled: () => new Promise<void>((res) => { wake = res; }),
  };
  const ev: SessionEvents = {
    frames: (items) => { for (const x of items) r.frames.set(x.i, x); },
    keys: () => undefined,
    progress: () => undefined,
    idle: () => { r.idles++; done(); },
    rejected: () => undefined,
    needSeeds: (k, t) => {
      r.asked.push({ k, t });
      const objs = seedsFor(t);
      if (objs) setTimeout(() => r.s.seeds(k, t, objs), 0);
    },
    error: (msg) => { r.errors.push(msg); done(); },
  };
  r.s = new SegSession(f.model, f.frames, span, ev);
  return r;
}

let ids = 100;
const subject = (t: number): SegObject & { id: number } => ({ id: ids++, kind: "include", t, prompt: { points: [[subjectX(t), 0.5]], labels: [1] } });

// ---------------------------------------------------------------- a throw in the pass is reported, not swallowed

{
  const f = fake({ failAt: 3 });
  const r = open(f, { start: 0, end: 2 }, () => []);
  const end = r.settled();
  r.s.seeds(0, 0, [subject(0)]);
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
  r.s.seeds(0, 0, [subject(0)]);
  await end;
  assert.equal(r.errors.length, 0);
  assert.equal(r.idles, 1);
  assert.equal(r.frames.size, r.s.grid.n, "every grid frame filled");
  console.log("session: healthy pass → idle, all frames: ok");
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
