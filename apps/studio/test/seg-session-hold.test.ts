// AI subject detection, the background session (seg/session.ts) on a fake model: a subject found late is followed
// back to the start (the lite model's first looks often find nothing: no mask for the first 6 s of the owner's ray
// clip), the lite search goes on to the full grid when the coarse one finds nothing, and a locked track whose mask
// shrinks is re-checked (re-prompted from where the subject should be), never onto plain water.
//   node --experimental-strip-types apps/studio/test/seg-session-hold.test.ts
import assert from "node:assert/strict";
import type { EdgeTam } from "../src/pipeline/seg/edgetam.ts";
import { AUTO, SegSession, type SessionEvents, type SessionFrameOut, type SessionFrames, type SessionOptions } from "../src/pipeline/seg/session.ts";
import type { SegObject } from "../src/pipeline/seg/track.ts";
import { rleDecode } from "../src/pipeline/seg/mask.ts";

const MW = 320, MH = 40;
const subjectX = (t: number) => 0.3 + 0.02 * t;
const inSubject = (u: number, v: number, t: number) => Math.abs(u - subjectX(t)) < 0.1 && Math.abs(v - 0.5) < 0.2;

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
          // Water with a faint texture, and a bright subject.
          const s = inSubject(u, v, t) ? 200 : 60 + 10 * Math.sin(u * 40) * Math.cos(v * 30);
          data[k] = s * 0.6; data[k + 1] = s * 0.8; data[k + 2] = s; data[k + 3] = 255;
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
  /** boxed: a prompted step whose prompt has a box (a re-check's; the flow guard's has points only). */
  stepped: { key: string; t: number; prompted: boolean; boxed: boolean }[];
  probes: { t: number; n: number }[];
  /** The subject is in the picture from this clip time on. */
  from: number;
  /** In this stretch the tracker (a step without a prompt) gives the left half of the subject only... */
  half: [number, number] | null;
  /** ...or nothing at all (though it scores it as there), and a fresh prompt gives a patch of plain water. */
  blank: [number, number] | null;
  /** In this stretch the tracker (and any prompt) gives a fifth of the frame, over the water. */
  blow: [number, number] | null;
  /** In this stretch the mask of an object seeded on the water is a quarter of the frame (else: half of it). */
  small: [number, number] | null;
};

function fake(o: Partial<Pick<Fake, "from" | "half" | "blank" | "blow" | "small">> & { lite?: boolean } = {}): Fake {
  const f: Fake = { model: null as unknown as EdgeTam, frames: null as unknown as SessionFrames, stepped: [], probes: [], from: o.from ?? -Infinity, half: o.half ?? null, blank: o.blank ?? null, blow: o.blow ?? null, small: o.small ?? null };
  // An object whose first prompt is not on the subject (a seed on the water): half the frame at every keyframe,
  // except in the `small` stretch, where its mask happens to be smaller.
  const water = new Set<string>();
  const half = () => out((_u, v) => v < 0.5, 5);
  const big = () => out((u, v) => Math.abs(u - 0.65) < 0.3 && Math.abs(v - 0.5) < 0.2, 5);
  let encT = 0;
  const lw = 64, lh = 36;
  const within = (r: [number, number] | null, t: number) => !!r && t > r[0] - 1e-6 && t < r[1] + 1e-6;
  const out = (on: (u: number, v: number) => boolean, score: number) => {
    const logits = new Float32Array(lw * lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) logits[y * lw + x] = on((x + 0.5) / lw, (y + 0.5) / lh) ? 10 : -10;
    return { logits, lw, lh, score, iou: 0.95 };
  };
  const whole = (t: number) => out((u, v) => t >= f.from - 1e-6 && inSubject(u, v, t), t >= f.from - 1e-6 ? 5 : -5);
  f.model = {
    lite: !!o.lite,
    timing: { encode: 0, encodes: 0, attend: 0, decoder: 0, memEnc: 0, steps: 0 },
    async encode(rgba: Uint8ClampedArray) { encT = (rgba[0] + 256 * rgba[1]) / 100; },
    async step(key: string, _frame: number, points: [number, number][] | null, labels: number[] | null) {
      const boxed = !!labels && labels.includes(2);
      f.stepped.push({ key, t: encT, prompted: !!points, boxed });
      if (points && !boxed && !f.stepped.some((x, i) => x.key === key && i < f.stepped.length - 1) && !inSubject(points[0][0] / 1024, points[0][1] / 1024, encT)) water.add(key);
      if (water.has(key)) return within(f.small, encT) ? big() : half();
      if (within(f.blow, encT)) return big();
      if (!points && within(f.half, encT)) return out((u, v) => inSubject(u, v, encT) && u < subjectX(encT), 5);
      if (within(f.blank, encT)) return boxed ? out((u, v) => Math.abs(u - 0.85) < 0.1 && Math.abs(v - 0.5) < 0.2, 5) : out(() => false, 5);
      return whole(encT);
    },
    async probe(points: [number, number][]) {
      f.probes.push({ t: encT, n: points.length });
      // The search's single point: the subject when the point is on it, else the background (most of the frame).
      if (points.length === 1) {
        const [u, v] = [points[0][0] / 1024, points[0][1] / 1024];
        return encT >= f.from - 1e-6 && inSubject(u, v, encT) ? whole(encT) : out((uu, vv) => !inSubject(uu, vv, encT), 5);
      }
      // A re-check's prompt (box and points).
      if (within(f.blow, encT)) return big();
      if (within(f.blank, encT)) return out((u, v) => Math.abs(u - 0.85) < 0.1 && Math.abs(v - 0.5) < 0.2, 5);
      return whole(encT);
    },
    drop() {},
  } as unknown as EdgeTam;
  f.frames = { width: 1920, height: 240, rotation: 0, async at(t: number) { return { t } as unknown as CanvasImageSource; }, dispose() {} };
  return f;
}

type Run = { s: SegSession; frames: Map<number, SessionFrameOut>; asked: number[]; errors: string[]; settled(): Promise<void> };
function open(f: Fake, span: { start: number; end: number }, seedsFor: (t: number) => (SegObject & { id: number })[], opts: SessionOptions = {}): Run {
  let wake: (() => void) | null = null;
  const done = () => { const w = wake; wake = null; w?.(); };
  const r: Run = { s: null as unknown as SegSession, frames: new Map(), asked: [], errors: [], settled: () => new Promise<void>((res) => { wake = res; }) };
  const ev: SessionEvents = {
    frames: (items) => { for (const x of items) r.frames.set(x.i, x); },
    keys: () => undefined, progress: () => undefined, rejected: () => undefined,
    idle: () => done(),
    needSeeds: (_k, t) => { r.asked.push(t); const objs = seedsFor(t); setTimeout(() => r.s.seeds(t, objs), 0); },
    error: (msg) => { r.errors.push(msg); done(); },
  };
  r.s = new SegSession(f.model, f.frames, span, ev, opts);
  return r;
}
let ids = 100;
const subject = (t: number): SegObject & { id: number } => ({ id: ids++, kind: "include", t, prompt: { points: [[subjectX(t), 0.5]], labels: [1] } });
const alphaAt = (r: Run, t: number) => rleDecode(r.frames.get(Math.round(t * 30))!.alpha, MW * MH);
const areaAt = (r: Run, t: number) => alphaAt(r, t).reduce((n, a) => n + (a > 127 ? 1 : 0), 0);
const centreAt = (r: Run, t: number) => { const a = alphaAt(r, t); let sx = 0, n = 0; for (let i = 0; i < a.length; i++) if (a[i] > 127) { sx += i % MW; n++; } return (sx / n + 0.5) / MW; };
const FULL = 0.2 * 0.4 * MW * MH;

// ---------------------------------------------------------------- a subject found late is followed back
for (const lite of [true, false]) {
  // The ray is in the picture from the first frame; the looks at 0 s and 2 s find nothing, the one at 6 s does.
  const f = fake({ lite });
  const r = open(f, { start: 0, end: 9 }, (t) => (t > 5.9 ? [subject(t)] : []));
  const end = r.settled();
  r.s.seeds(0, []);
  await end;
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.asked.slice(0, 2), [2, 6], "the looks: 0 s (given), 2 s, 6 s");
  assert.equal(r.frames.size, r.s.grid.n, "every frame filled");
  for (const t of [0, 0.5, 2, 3.3, 5.9, 6, 8.9]) {
    assert.ok(areaAt(r, t) > 0.75 * FULL, `${lite ? "lite" : "full"} model: the subject found at 6 s has its mask at ${t} s too (${areaAt(r, t)} of ${FULL} px)`);
    assert.ok(Math.abs(centreAt(r, t) - subjectX(t)) < 0.02, `on the subject at ${t} s`);
  }
  const back = f.stepped.filter((x) => x.key.endsWith("b")), finder = back[0].key.slice(0, -1);
  assert.equal(back.length, 6 * r.s.fps + 1, "one backward step a keyframe, 6 s to 0 s");
  assert.ok(f.stepped.findIndex((x) => x.key.endsWith("b") && x.t < 5.9) > f.stepped.findLastIndex((x) => x.key === `${finder}f`), "the back-fill comes after its subject's forward track (the decoder turns once)");
  let turns = 0;
  for (let i = 1; i < back.length; i++) if (back[i].t > back[i - 1].t) turns++;
  assert.equal(turns, 0, "backward in order");
  console.log(`session: ${lite ? "lite" : "full"} model, first find at 6 s → followed back to 0 s (${back.length - 1} keyframes), every frame masked: ok`);
}

// The subject came into the picture at 4 s: the back-fill follows it there and stops a second after it loses it.
{
  const f = fake({ from: 4 });
  const r = open(f, { start: 0, end: 9 }, (t) => (t > 5.9 ? [subject(t)] : []));
  const end = r.settled();
  r.s.seeds(0, []);
  await end;
  assert.ok(areaAt(r, 4.5) > 0.75 * FULL && areaAt(r, 3) === 0 && areaAt(r, 1) === 0, "a mask from where the subject is, none before");
  const back = f.stepped.filter((x) => x.key.endsWith("b"));
  assert.ok(Math.min(...back.map((x) => x.t)) >= 4 - 1 - 1e-6 && back.length <= 2 * r.s.fps + r.s.fps + 4, `the back-fill stops a second after the subject is gone (${back.length} steps, back to ${Math.min(...back.map((x) => x.t))} s)`);
  assert.equal(r.frames.size, r.s.grid.n);
  console.log("session: back-fill of a subject that entered at 4 s → stops a second before it: ok");
}

// A subject followed from the start: nothing to follow back, at this or any later segment start.
{
  const f = fake();
  const r = open(f, { start: 0, end: 9 }, (t) => [subject(t)]);
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.equal(f.stepped.filter((x) => x.key.endsWith("b")).length, 0, "no backward step");
  assert.equal(f.probes.length, 0);
  console.log("session: a subject followed from the start → no back-fill: ok");
}

// ---------------------------------------------------------------- the lite search: the full grid when the coarse one finds nothing
{
  // At 0 s the subject (u 0.2–0.4) lies between the coarse grid's columns (1/6, 1/2, 5/6); the full grid's 0.375 is on it.
  const f = fake({ lite: true });
  const r = open(f, { start: 0, end: 4 }, () => []);
  const found = await r.s.autoSeeds(0);
  assert.equal(found.length, 1, "found on the full grid");
  assert.equal(f.probes.length, AUTO.liteCols * AUTO.liteRows + AUTO.cols * AUTO.rows, "the coarse grid first, then the full one");
  const b = found[0].prompt.box!;
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - subjectX(0)) < 0.03, "the subject's box");
  // Where the coarse grid finds it, the full one is not run (the phone's time).
  const f2 = fake({ lite: true });
  const r2 = open(f2, { start: 0, end: 12 }, () => []);
  assert.equal((await r2.s.autoSeeds(10)).length, 1); // u 0.4–0.6: the coarse grid's 0.5 is on it
  assert.equal(f2.probes.length, AUTO.liteCols * AUTO.liteRows, "found on the coarse grid: the full one is left out");
  // The full model's search is its one grid, as before.
  const f3 = fake();
  const r3 = open(f3, { start: 0, end: 4 }, () => []);
  assert.equal((await r3.s.autoSeeds(0)).length, 1);
  assert.equal(f3.probes.length, AUTO.cols * AUTO.rows);
  r.s.close(); r2.s.close(); r3.s.close();
  console.log("session: lite search → the full grid when the coarse one finds nothing: ok");
}

// ---------------------------------------------------------------- a locked track that shrinks is re-checked
{
  // From 2.1 s to 3.4 s the tracker keeps only half of the subject.
  const f = fake({ half: [2.1, 3.4] });
  const r = open(f, { start: 0, end: 6 }, (t) => [subject(t)]);
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.deepEqual(r.errors, []);
  const p = r.s.profile();
  assert.ok(p.recovered >= 4 && p.rechecks >= p.recovered, `re-checked and recovered (${p.recovered} of ${p.rechecks})`);
  let minA = Infinity;
  for (let t = 1.5; t <= 4.5; t += 1 / 30) minA = Math.min(minA, areaAt(r, +t.toFixed(4)));
  assert.ok(minA > 0.75 * FULL, `the mask stays whole through the stretch (min ${minA} of ${FULL} px; the tracker alone: half)`);
  assert.ok(f.stepped.some((x) => x.boxed && x.t > 2.2 && x.t < 3.4), "the recovered mask is written into the track's memory (a prompted step)");
  assert.equal(f.stepped.filter((x) => x.boxed && (x.t < 2.1 || x.t > 3.5)).length, 0, "no re-check outside the stretch");
  console.log(`session: tracker keeps half of a locked subject for 1.3 s → re-checked, mask whole (min ${minA} of ${FULL} px, ${p.recovered} recovered): ok`);
}

// The tracker loses the subject and a fresh prompt there gives a patch of plain water: refused (the water test).
{
  const f = fake({ blank: [2.1, 3.4] });
  const r = open(f, { start: 0, end: 6 }, (t) => [subject(t)]);
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  const p = r.s.profile();
  assert.ok(p.rechecks >= 1 && p.recovered === 0, `re-checked (${p.rechecks}), nothing taken`);
  assert.equal(areaAt(r, 2.75), 0, "no mask on the water");
  assert.equal(f.stepped.filter((x) => x.boxed).length, 0, "nothing written into the track's memory");
  assert.ok(areaAt(r, 4.5) > 0.75 * FULL, "followed again when the tracker has it back");
  console.log(`session: a re-check that lands on plain water is refused (${p.rechecks} re-checks, 0 taken): ok`);
}

// The subject leaves; half a second later the tracker draws a fifth of the frame over the water (the lite model
// on the owner's ray clip at 19.2 s, as the ray was panned out of the frame). The flow has nothing to carry by then,
// so the old test (against the flow-carried mask) let it through: nothing may grow into the water.
for (const lite of [true, false]) {
  const f = fake({ lite, blank: [2.1, 2.6], blow: [2.6, 3.4] });
  const r = open(f, { start: 0, end: 6 }, (t) => [subject(t)]);
  const end = r.settled();
  r.s.seeds(0, [subject(0)]);
  await end;
  assert.deepEqual(r.errors, []);
  let maxA = 0, maxStep = 0, prev = areaAt(r, 1.5);
  for (let i = 46; i <= 150; i++) { const a = areaAt(r, i / 30); maxA = Math.max(maxA, a); maxStep = Math.max(maxStep, a - prev); prev = a; }
  assert.ok(maxA < 1.2 * FULL, `${lite ? "lite" : "full"} model: no mask ever outgrows the subject (max ${maxA} px, the subject ${FULL}; the tracker drew ${0.6 * 0.4 * MW * MH})`);
  assert.equal(areaAt(r, 3), 0, "the water stays unmasked");
  assert.ok(areaAt(r, 4.5) > 0.75 * FULL, "the subject is followed again when the tracker has it back");
  assert.equal(r.s.profile().recovered, 0);
  console.log(`session: ${lite ? "lite" : "full"} model, the tracker runs away over the water after losing the subject → dropped (largest mask ${maxA} of ${FULL} px): ok`);
}

// A seed on the water (the engine's, on the bright surface at the top of the frame: owner's ray clip at 16 s): the
// model draws half the frame for it at every keyframe, and at one keyframe a mask just under the limit, which was
// kept (22% of the frame at 19.25 s). It is let go at its first mask; the subject next to it is followed as before.
{
  const f = fake({ small: [2.4, 2.6] });
  const seedOnWater = (t: number): SegObject & { id: number } => ({ id: ids++, kind: "include", t, prompt: { points: [[0.9, 0.1]], labels: [1] } });
  let wid = -1;
  const r = open(f, { start: 0, end: 6 }, () => []);
  const end = r.settled();
  const ws = seedOnWater(0);
  wid = ws.id;
  r.s.seeds(0, [subject(0), ws]);
  await end;
  assert.deepEqual(r.errors, []);
  const steps = f.stepped.filter((x) => x.key.startsWith(`${wid}`));
  assert.equal(steps.length, 1, `the seed on the water is stepped once and let go (${steps.length} steps; it was every keyframe)`);
  let maxA = 0;
  for (let i = 0; i < r.s.grid.n; i++) maxA = Math.max(maxA, areaAt(r, i / 30));
  assert.ok(maxA < 1.2 * FULL, `no mask but the subject's (largest ${maxA} of ${FULL} px)`);
  assert.ok(areaAt(r, 2.5) > 0.75 * FULL && areaAt(r, 5.5) > 0.75 * FULL, "the subject is followed throughout");
  console.log(`session: a seed on the water → let go at its first mask (1 step), largest mask ${maxA} of ${FULL} px: ok`);
}
// The same when its first mask happens to be under the limit (kept: it could be a subject) and the runaways come
// after: let go after HOLD.missS of them (an object that never had a mask kept: after one second).
{
  const f = fake({ small: [-1, 0.1] });
  const ws: SegObject & { id: number } = { id: ids++, kind: "include", t: 0, prompt: { points: [[0.9, 0.1]], labels: [1] } };
  const r = open(f, { start: 0, end: 6 }, () => []);
  const end = r.settled();
  r.s.seeds(0, [subject(0), ws]);
  await end;
  const steps = f.stepped.filter((x) => x.key.startsWith(`${ws.id}`));
  assert.ok(steps.length <= 1 + 2 * r.s.fps + 1, `let go after two seconds of runaways (${steps.length} steps; it was every keyframe: ${6 * r.s.fps + 1})`);
  assert.ok(Math.max(...steps.map((x) => x.t)) <= 2.01);
  let maxLate = 0;
  for (let i = 75; i < r.s.grid.n; i++) maxLate = Math.max(maxLate, areaAt(r, i / 30));
  assert.ok(maxLate < 1.2 * FULL, `nothing but the subject after it is let go (largest ${maxLate} px)`);
  console.log(`session: an object that runs away after its first mask → let go after two seconds (${steps.length} steps): ok`);
}

console.log("seg session hold tests passed");
