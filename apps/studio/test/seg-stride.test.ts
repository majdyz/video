// AI subjects, the stride (seg/session.ts strideAt / carryStep; seeds.ts strideDue): a small, calm subject steps at
// every other regular keyframe and is carried along the flow at the one between; the flow guard and the runaway
// checks only ever compare against the tracker's own masks. Also the rule for the model's blind grid (gridWanted)
// and the maps made on the mask's own window (mask.ts).
//   node --experimental-strip-types apps/studio/test/seg-stride.test.ts
import assert from "node:assert/strict";
import type { EdgeTam } from "../src/pipeline/seg/edgetam.ts";
import { SegSession, type SessionEvents, type SessionFrameOut, type SessionFrames, type SessionOptions } from "../src/pipeline/seg/session.ts";
import type { SegObject } from "../src/pipeline/seg/track.ts";
import { dilate, dilateBin, guidedFilter, guidedFilterNear, maskWindows, nearMap, nearMapNear, rleDecode, sdfFeather, sdfFeatherNear } from "../src/pipeline/seg/mask.ts";
import { gridWanted, STRIDE, strideDue } from "../src/pipeline/seg/seeds.ts";
import { postFrames } from "./seg-post.ts";

// ---------------------------------------------------------------- the rule
{
  const ok = { index: 3, start: false, last: false, real: true, calm: true, area: 0.004 };
  assert.equal(strideDue(ok), true, "a small, calm subject at an odd regular keyframe is carried");
  assert.equal(strideDue({ ...ok, index: 2 }), false, "even keyframes are always stepped at");
  assert.equal(strideDue({ ...ok, index: -1 }), false, "an extra keyframe (not on the regular grid) is a real step");
  assert.equal(strideDue({ ...ok, start: true }), false, "a segment start is a real step (the looks compare masks there)");
  assert.equal(strideDue({ ...ok, last: true }), false, "the track ends on a mask of the tracker's own");
  assert.equal(strideDue({ ...ok, real: false }), false, "never two carried keyframes in a row");
  assert.equal(strideDue({ ...ok, calm: false }), false, "not after a re-prompt, a runaway or a hard step");
  assert.equal(strideDue({ ...ok, area: STRIDE.area }), false, "not from 1% of the frame on");
  assert.equal(strideDue({ ...ok, area: 0.03 }), false);
  assert.equal(strideDue({ ...ok, area: 0 }), false, "a lost subject is looked for at every keyframe");
  console.log("stride: the rule (odd regular keyframes, small, calm, after a real step, never a start or the last): ok");
}

// ---------------------------------------------------------------- the blind grid
{
  const g = { search: true, engineAnimals: 0, regionFinds: 0, followed: 0 };
  assert.equal(gridWanted(g), true, "nothing speaks for the frame: the grid");
  assert.equal(gridWanted({ ...g, engineAnimals: 2 }), false, "the engine has its own animals: no grid");
  assert.equal(gridWanted({ ...g, regionFinds: 1 }), false, "one of the engine's regions is a subject: no grid");
  assert.equal(gridWanted({ ...g, followed: 1 }), false, "a subject is followed surely on the frame: no grid");
  assert.equal(gridWanted({ ...g, search: false }), false, "an extra look never searches");
  console.log("seeds: the blind grid only where nothing else speaks for the frame: ok");
}

// ---------------------------------------------------------------- maps on the mask's window
{
  const w = 320, h = 180, n = w * h;
  const luma = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) luma[y * w + x] = 0.3 + 0.2 * Math.sin(x / 9) * Math.cos(y / 7);
  const shapes: [string, (x: number, y: number) => boolean][] = [
    ["a far subject", (x, y) => (x - 100) ** 2 / 400 + (y - 80) ** 2 / 60 < 1],
    ["two subjects", (x, y) => (x - 60) ** 2 / 200 + (y - 40) ** 2 / 50 < 1 || (x - 250) ** 2 / 300 + (y - 150) ** 2 / 80 < 1],
    ["a subject the frame cuts", (x, y) => x < 30 && y > 150],
    ["most of the frame", (x, y) => x > 20 && y > 10],
  ];
  for (const [name, on] of shapes) {
    const m = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) m[y * w + x] = 0.9;
    const diff = (a: Float32Array, b: Float32Array) => { let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };
    assert.ok(diff(sdfFeather(m, w, h, 6), sdfFeatherNear(m, w, h, 6)) < 1e-6, `${name}: the feathered alpha is the whole frame's`);
    for (const r of [3, 9]) assert.ok(diff(nearMap(m, w, h, r), nearMapNear(m, w, h, r)) < 1e-5, `${name}: the near map (r ${r}) is the whole frame's`);
    assert.ok(diff(guidedFilter(luma, m, w, h, 2, 2e-3), guidedFilterNear(luma, m, w, h, 2, 2e-3)) < 1e-4, `${name}: the guided filter is the whole frame's`);
  }
  assert.ok(sdfFeatherNear(new Float32Array(n), w, h, 6).every((x) => x === 0), "no mask: zeros");
  // A school: each far subject has its own window, not the frame between them; near ones share one.
  const school = new Float32Array(n);
  for (const [cx, cy] of [[40, 30], [160, 90], [290, 150], [170, 96]]) for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 10; x <= cx + 10; x++) school[y * w + x] = 1;
  const wins = maskWindows(school, w, h, 9, 0.5);
  assert.equal(wins.length, 3, "three windows for four subjects, two of them side by side");
  assert.ok(wins.reduce((a, b) => a + (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1), 0) < 0.1 * n, "a tenth of the frame at most");
  // The binary dilation by running counts is the max filter's.
  for (const r of [1, 4, 27]) {
    const a = dilate(school, w, h, r), b = dilateBin(school, w, h, r);
    assert.ok(a.every((x, i) => x === b[i]), `dilateBin r ${r}`);
  }
  console.log("maps: made on the mask's window, the same as on the whole frame: ok");
}

// ---------------------------------------------------------------- the session
const MW = 320, MH = 180;
type Shape = { hw: number; hh: number };
const SMALL: Shape = { hw: 0.05, hh: 0.04 }, LARGE: Shape = { hw: 0.1, hh: 0.2 };
const subjectX = (t: number) => 0.3 + 0.02 * t;
let shape = SMALL;
const inSubject = (u: number, v: number, t: number) => Math.abs(u - subjectX(t)) < shape.hw && Math.abs(v - 0.5) < shape.hh;

type FakeFrame = { t: number };
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
          // Still water with a faint texture; a bright subject with a texture of its own that moves with it.
          const s = inSubject(u, v, t) ? 190 + 40 * Math.sin((u - subjectX(t)) * 300) * Math.cos(v * 200) : 60 + 10 * Math.sin(u * 40) * Math.cos(v * 30);
          data[k] = s * 0.6; data[k + 1] = s * 0.8; data[k + 2] = s; data[k + 3] = 255;
        }
        data[0] = Math.round(t * 100) % 256; data[1] = Math.floor(Math.round(t * 100) / 256);
        return { data };
      },
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeCanvas;

type Step = { key: string; t: number; frame: number; prompted: boolean };
type Fake = { model: EdgeTam; frames: SessionFrames; stepped: Step[]; encoded: number[]; half: [number, number] | null };
function fake(half: [number, number] | null = null): Fake {
  const f: Fake = { model: null as unknown as EdgeTam, frames: null as unknown as SessionFrames, stepped: [], encoded: [], half };
  let encT = 0;
  const lw = 256, lh = 144;
  const out = (on: (u: number, v: number) => boolean, score: number) => {
    const logits = new Float32Array(lw * lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) logits[y * lw + x] = on((x + 0.5) / lw, (y + 0.5) / lh) ? 10 : -10;
    return { logits, lw, lh, score, iou: 0.95 };
  };
  f.model = {
    lite: true,
    timing: { encode: 0, encodes: 0, attend: 0, decoder: 0, memEnc: 0, steps: 0 },
    async encode(rgba: Uint8ClampedArray) { encT = (rgba[0] + 256 * rgba[1]) / 100; f.encoded.push(encT); },
    async step(key: string, frame: number, points: [number, number][] | null) {
      f.stepped.push({ key, t: encT, frame, prompted: !!points });
      // In the `half` stretch the tracker (no prompt) keeps the left third of the subject only.
      if (!points && f.half && encT > f.half[0] - 1e-6 && encT < f.half[1] + 1e-6) return out((u, v) => inSubject(u, v, encT) && u < subjectX(encT) - shape.hw / 3, 5);
      return out((u, v) => inSubject(u, v, encT), 5);
    },
    async probe() { return out(() => false, -5); },
    drop() {},
  } as unknown as EdgeTam;
  f.frames = { width: 1920, height: 1080, rotation: 0, async at(t: number) { return { t } as unknown as CanvasImageSource; }, dispose() {} };
  return f;
}

type Run = { s: SegSession; frames: Map<number, SessionFrameOut>; errors: string[]; done: Promise<void>; posts: { is: number[]; steps: number }[] };
let ids = 1;
async function run(f: Fake, opts: SessionOptions = {}): Promise<Run> {
  let finish!: () => void;
  const r: Run = { s: null as unknown as SegSession, frames: new Map(), errors: [], done: new Promise<void>((res) => { finish = res; }), posts: [] };
  const ev: SessionEvents = {
    // (Through the worker's transfer rules: seg-post.ts.)
    frames: (items) => { r.posts.push({ is: items.map((x) => x.i), steps: f.stepped.length }); for (const x of postFrames(items)) r.frames.set(x.i, x); },
    keys: () => undefined, progress: () => undefined, rejected: () => undefined,
    idle: () => finish(),
    // The later looks find nothing new (the subject is followed on).
    needSeeds: (_k, t) => { setTimeout(() => r.s.seeds(t, []), 0); },
    error: (msg) => { r.errors.push(msg); finish(); },
  };
  r.s = new SegSession(f.model, f.frames, { start: 0, end: 6 }, ev, opts);
  const seed: SegObject & { id: number } = { id: ids++, kind: "include", t: 0, prompt: { points: [[subjectX(0), 0.5]], labels: [1] } };
  r.s.seeds(0, [seed]);
  await r.done;
  assert.deepEqual(r.errors, []);
  return r;
}
const alphaAt = (r: Run, t: number) => rleDecode(r.frames.get(Math.round(t * 30))!.alpha, MW * MH);
const areaAt = (r: Run, t: number) => alphaAt(r, t).reduce((n, a) => n + (a > 127 ? 1 : 0), 0);
const centreAt = (r: Run, t: number) => { const a = alphaAt(r, t); let sx = 0, n = 0; for (let i = 0; i < a.length; i++) if (a[i] > 127) { sx += i % MW; n++; } return (sx / n + 0.5) / MW; };
const times = (f: Fake) => f.stepped.filter((x) => x.key.endsWith("f")).map((x) => x.t);
const full = () => 2 * shape.hw * 2 * shape.hh * MW * MH;

// A small, calm subject (0.8% of the frame): stepped at every other regular keyframe, carried at the one between.
{
  shape = SMALL;
  const f = fake(), r = await run(f);
  const p = r.s.profile();
  // Regular keyframes every 0.5 s (index 0..12); the look at 4 s is a segment start.
  assert.deepEqual(times(f), [0, 0.5, 1, 2, 3, 4, 5, 6], "real steps: the prompt, the keyframe after it, then every other one, the start at 4 s and the last");
  assert.equal(p.strided, 5, "carried at 1.5, 2.5, 3.5, 4.5 and 5.5 s");
  assert.deepEqual(f.encoded, [0, 0.5, 1, 2, 3, 4, 5, 6], "a keyframe every subject is carried over is not encoded");
  const fr = f.stepped.filter((x) => x.key.endsWith("f")).map((x) => x.frame);
  for (let i = 1; i < fr.length; i++) assert.equal(fr[i] - fr[i - 1], 5, "the memory bank's clock counts real steps only");
  assert.equal(f.stepped.filter((x) => x.prompted).length, 1, "no re-prompt: the guard's two-hop carry agrees with the tracker");
  assert.equal(r.frames.size, r.s.grid.n, "every frame filled");
  for (const t of [0, 0.5, 1.5, 1.75, 2.5, 3.5, 4.5, 5.5, 5.9]) {
    assert.ok(areaAt(r, t) > 0.6 * full() && areaAt(r, t) < 1.6 * full(), `the subject has its mask at ${t} s (${areaAt(r, t)} of ${full()} px)`);
    assert.ok(Math.abs(centreAt(r, t) - subjectX(t)) < 0.012, `on the subject at ${t} s (${centreAt(r, t).toFixed(3)} for ${subjectX(t).toFixed(3)})`);
  }
  // The first frame has its mask as soon as the seed has its first one: posted after one tracker step (with the
  // hand-over's frames after it, so it weighs in full), ahead of the first interval's fill.
  assert.equal(r.posts[0].steps, 1, "posted right after the seed's first step");
  assert.deepEqual(r.posts[0].is, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "the seed's frame and 0.33 s after it");
  assert.ok(r.posts[1].steps >= 2 && r.posts[1].is[0] === 0, "the fill replaces them once the interval's other keyframe is final");
  console.log(`stride: a subject of 0.8% of the frame → ${times(f).length} tracker steps for 13 keyframes, ${p.strided} carried, masks on the subject throughout: ok`);
}

// The same subject with the stride off, and a large subject with it on: a step at every keyframe.
{
  shape = SMALL;
  const f = fake(), r = await run(f, { stride: false });
  assert.equal(times(f).length, 13);
  assert.equal(r.s.profile().strided, 0);
  shape = LARGE;
  const g = fake(), q = await run(g);
  assert.equal(times(g).length, 13, "a subject of 8% of the frame is stepped at every keyframe");
  assert.equal(q.s.profile().strided, 0);
  console.log("stride: off, or a large subject → a step at every keyframe: ok");
}

// The guard is fed real keyframes: after a carried keyframe (2.5 s) the tracker's mask at 3 s has lost most of the
// subject. The last real mask (2 s), carried in two hops, says so: a re-prompt at 3 s, the whole subject again, and
// the next keyframe (3.5 s, an odd one) is a real step, not a carried one.
{
  shape = SMALL;
  const f = fake([2.9, 3.1]), r = await run(f);
  const at3 = f.stepped.filter((x) => Math.abs(x.t - 3) < 1e-6);
  assert.deepEqual(at3.map((x) => x.prompted), [false, true], "the tracker's step at 3 s, then the guard's re-prompt");
  assert.ok(times(f).includes(3.5), "the keyframe after a re-prompt is stepped at");
  assert.ok(!times(f).includes(2.5) && !times(f).includes(4.5), "the calm stretches before and after are carried over");
  assert.ok(areaAt(r, 3) > 0.6 * full(), `the mask at 3 s is the whole subject again (${areaAt(r, 3)} of ${full()} px)`);
  assert.ok(Math.abs(centreAt(r, 3) - subjectX(3)) < 0.012);
  console.log("stride: a mask that shrank at the step after a carried keyframe → re-prompted from the last real mask, then stepped every keyframe: ok");
}
