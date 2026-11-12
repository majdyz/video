// AI subject detection, a school of small subjects: where the model is asked to look (the engine's regions:
// seg/seeds.ts blobCandidates), that the same subject is not followed twice and keeps its track (assignSlots, the
// session's carry-over), and when the session looks again for subjects that came into the picture (topUpAt).
//   node --experimental-strip-types apps/studio/test/seg-seeds.test.ts
import assert from "node:assert/strict";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../../aqua-fix/src/engine/analyze.ts";
import { animalTarget } from "../../aqua-fix/src/engine/animals.ts";
import type { SubjectBlob } from "../../aqua-fix/src/engine/backdrop.ts";
import type { EdgeTam } from "../src/pipeline/seg/edgetam.ts";
import { assignSlots, blobCandidates, blobRank, edgeShare, inCorner, overlap, SEEDS, topUpAt, type SeedCandidate, type SlotItem } from "../src/pipeline/seg/seeds.ts";
import { AUTO, SegSession, type SessionEvents, type SessionFrames, type SessionOptions } from "../src/pipeline/seg/session.ts";
import { seedObjects, seedRegions } from "../src/pipeline/seg/studio-seg.ts";
import { SEG, type SegObject } from "../src/pipeline/seg/track.ts";
import { rleDecode } from "../src/pipeline/seg/mask.ts";

// ---------------------------------------------------------------- the proposal: synthetic regions

const blob = (o: Partial<SubjectBlob> & { u: number; v: number; area: number }): SubjectBlob => {
  const hw = Math.sqrt(o.area) * 0.9, hh = Math.sqrt(o.area) * 0.3;
  return { pts: [[o.u, o.v]], x0: o.u - hw, y0: o.v - hh, x1: o.u + hw, y1: o.v + hh, dev: 0.3, accept: 1, seeded: true, bubble: 0, ...o };
};

{
  const blobs: SubjectBlob[] = [
    blob({ u: 0.2, v: 0.3, area: 0.003, dev: 0.25 }), // a far shark
    blob({ u: 0.7, v: 0.6, area: 0.02, dev: 0.6 }), // a near one: larger and clearer, first
    blob({ u: 0.5, v: 0.5, area: 0.0004, dev: 0.5 }), // a speck
    blob({ u: 0.4, v: 0.8, area: 0.004, dev: 0.05 }), // haze: hardly off the water
    { ...blob({ u: 0.5, v: 0.003, area: 0.007, dev: 0.7 }), x0: 0, x1: 1 }, // a dark line along the top edge
    blob({ u: 0.9, v: 0.2, area: 0.005, dev: 0.4, bubble: 0.9 }), // a bubble column
    blob({ u: 0.5, v: 0.5, area: 0.45, dev: 0.5 }), // the background
    blob({ u: 0.1, v: 0.7, area: 0.003, dev: 0.25, accept: 0 }), // no outline of its own: after its twin
  ];
  const c = blobCandidates(blobs);
  assert.deepEqual(c.map((x) => x.points[0]), [[0.7, 0.6], [0.2, 0.3], [0.1, 0.7]], "by contrast and size; specks, haze, lines, bubbles and the background are left out");
  assert.ok(c[0].rank > c[1].rank && c[1].rank > c[2].rank);
  assert.equal(c[1].rank, blobRank(blobs[0]));
  assert.equal(c[2].rank, c[1].rank / 2, "a region the engine's own tests did not accept ranks half");
  assert.ok(c[0].box.x0 < 0.7 && c[0].box.x1 > 0.7 && c[0].area === 0.02, "its box and size go along");
  // Regions inside an animal the engine's own seeds cover are not asked about again.
  assert.deepEqual(blobCandidates(blobs, (u) => u > 0.5).map((x) => x.points[0]), [[0.2, 0.3], [0.1, 0.7]]);
  // At most `max`, the most promising.
  assert.deepEqual(blobCandidates(blobs, null, 1).map((x) => x.points[0]), [[0.7, 0.6]]);
  const many = Array.from({ length: 30 }, (_, i) => blob({ u: 0.03 * (i + 1), v: 0.5, area: 0.002 + 0.0001 * i }));
  assert.equal(blobCandidates(many).length, SEEDS.probes, "a school: the probes are bounded");
  // Equal regions: top to bottom, left to right (the same order whenever the frame is analysed).
  const twins = [blob({ u: 0.6, v: 0.5, area: 0.003 }), blob({ u: 0.2, v: 0.5, area: 0.003 }), blob({ u: 0.4, v: 0.2, area: 0.003 })];
  assert.deepEqual(blobCandidates(twins).map((x) => x.points[0][0]), [0.4, 0.2, 0.6]);
  assert.deepEqual(blobCandidates(twins.slice().reverse()).map((x) => x.points[0][0]), [0.4, 0.2, 0.6]);
  assert.deepEqual(blobCandidates(null), []);
  // The candidate's points are its own copy.
  c[0].points[0][0] = 9;
  assert.equal(blobs[1].pts[0][0], 0.7);
  console.log("seeds: the engine's regions as candidates, by contrast and size: ok");
}

// ---------------------------------------------------------------- the proposal: a synthetic frame through the engine

{
  // Blue water, lighter toward the top, with a school of six small, pale sharks (each 0.2–0.5% of the frame: under
  // the size the engine tones an animal from) and a dark line along the top edge (the owner's hammerhead clip).
  const w = ANALYSIS_W, h = ANALYSIS_H, px = new Uint8ClampedArray(w * h * 4);
  const sharks = [[0.2, 0.25, 0.045, 0.03], [0.55, 0.3, 0.05, 0.035], [0.8, 0.45, 0.04, 0.03], [0.3, 0.6, 0.055, 0.035], [0.65, 0.7, 0.04, 0.028], [0.15, 0.82, 0.035, 0.025]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h, k = (y * w + x) * 4;
    let r = 18 - 6 * v, g = 120 - 30 * v, b = 205 - 35 * v;
    for (const [cx, cy, rx, ry] of sharks) {
      const d = ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2;
      if (d < 1) { const a = 0.55 * Math.min(1, 3 * (1 - d)); r += a * (150 - r); g += a * (190 - g); b += a * (200 - b); }
    }
    if (y === 0) { r *= 0.3; g *= 0.3; b *= 0.3; }
    px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = 255;
  }
  const a = analyzeThumbnail(px, w, h);
  assert.ok((a.params.backdrop ?? 0) > 0.5, `open water (backdrop ${a.params.backdrop})`);
  const blobs = a.depth.blobs!;
  assert.ok(blobs.length >= sharks.length);
  // The engine itself follows none of them (too small to be toned as animals)...
  const am = a.depth.animals ?? null;
  assert.equal(seedObjects(am, 0, []).length, 0, `no animal seeds (${(am?.list ?? []).map((x) => `${(100 * x.area).toFixed(2)}%/${animalTarget(x).toFixed(2)}`).join(" ")})`);
  // ...but each is a region, with a point inside it, and the line along the top is not.
  const c = seedRegions(blobs, am);
  const inShark = ([u, v]: [number, number]) => sharks.findIndex(([cx, cy, rx, ry]) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 < 1);
  const hit = c.map((x) => inShark(x.points[0]));
  assert.deepEqual([...new Set(hit)].sort(), [0, 1, 2, 3, 4, 5], `one candidate per shark (${JSON.stringify(c.map((x) => x.points[0].map((n) => +n.toFixed(2))))})`);
  assert.equal(c.length, 6, "and nothing else: not the line along the top edge, not the water");
  for (const x of c) for (const p of x.points) assert.ok(inShark(p) >= 0, "every prompt point lies in its shark");
  for (const x of c) assert.ok(x.area > 0.001 && x.area < 0.008, `a small subject (${x.area})`);
  // The largest, clearest first.
  assert.equal(hit[0], 3);
  // The same frame gives the same candidates.
  assert.deepEqual(seedRegions(analyzeThumbnail(px, w, h).depth.blobs!, null), c);
  console.log("seeds: a school of small sharks on a synthetic frame → one candidate each, none for the engine's animals: ok");
}

// ---------------------------------------------------------------- masks: overlap, the frame's edge

{
  const w = 20, h = 10;
  const rect = (x0: number, y0: number, x1: number, y1: number) => { const m = new Float32Array(w * h); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1; return m; };
  const a = rect(2, 2, 10, 6), b = rect(6, 2, 14, 6), part = rect(2, 2, 5, 6);
  assert.deepEqual(overlap(a, a), { iou: 1, share: 1 });
  assert.deepEqual(overlap(a, b), { iou: 16 / 48, share: 0.5 });
  assert.deepEqual(overlap(a, part), { iou: 12 / 32, share: 1 });
  assert.deepEqual(overlap(a, rect(12, 7, 14, 9)), { iou: 0, share: 0 });
  assert.deepEqual(overlap(a, new Float32Array(w * h)), { iou: 0, share: 0 });
  assert.equal(edgeShare(a, w, h), 0);
  assert.equal(edgeShare(rect(0, 0, 9, 4), w, h), 0.45, "a head in the corner: 45% of the top side");
  assert.equal(edgeShare(rect(0, 4, 3, 6), w, h), 0.2, "a fin over the left side");
  assert.equal(edgeShare(rect(17, 0, 20, 10), w, h), 1);
  assert.equal(inCorner(rect(0, 0, 4, 2), w, h), true, "a patch in the top-left corner (under the edge limit on both sides)");
  assert.ok(edgeShare(rect(0, 0, 4, 2), w, h) <= 0.25);
  assert.equal(inCorner(rect(16, 8, 20, 10), w, h), true);
  assert.equal(inCorner(rect(0, 4, 3, 6), w, h), false, "one side only");
  assert.equal(inCorner(rect(5, 0, 9, 3), w, h), false);
  assert.equal(inCorner(a, w, h), false);
  console.log("seeds: mask overlap and the share of the frame's edge: ok");
}

// ---------------------------------------------------------------- who is followed: dedup, id stability, the cap

{
  // Overlaps by name: "a~b" → [iou, share].
  const rels: Record<string, [number, number]> = {};
  const rel = (o: SlotItem, n: SlotItem) => { const r = rels[`${o.id}~${n.id}`] ?? rels[`${n.id}~${o.id}`] ?? [0, 0]; return { iou: r[0], share: r[1] }; };
  const it = (id: number, area: number): SlotItem => ({ id, area });
  // A look that finds the two sharks followed already and a third: the two keep their tracks, the third starts.
  rels["1~11"] = [0.8, 0.9]; rels["2~12"] = [0.55, 0.8];
  let s = assignSlots([it(1, 400), it(2, 300)], [it(11, 420), it(12, 310), it(13, 200)], rel, rel, 4);
  assert.deepEqual(s, { keep: [1, 2], take: [13], ended: [], dup: [11, 12], over: [] }, "the same subject is not followed twice: the track followed so far stays");
  // A track that shrank to a part of its subject (the find holds it, the extents differ) is replaced by the find...
  rels["3~14"] = [0.2, 1];
  s = assignSlots([it(3, 80)], [it(14, 400)], rel, rel, 4);
  assert.deepEqual(s, { keep: [], take: [14], ended: [3], dup: [], over: [] });
  // ...and so is one that ran past its subject (the find lies inside it).
  rels["4~15"] = [0.25, 0.95];
  s = assignSlots([it(4, 1600)], [it(15, 400)], rel, rel, 4);
  assert.deepEqual(s, { keep: [], take: [15], ended: [4], dup: [], over: [] });
  // Two finds on one subject (two regions on one shark): the first one given stands for both.
  rels["16~17"] = [0.3, 0.7];
  s = assignSlots([], [it(16, 300), it(17, 150), it(18, 100)], rel, rel, 4);
  assert.deepEqual(s, { keep: [], take: [16, 18], ended: [], dup: [17], over: [] });
  // The cap. No room: the followed stay, a find of about their size waits...
  s = assignSlots([it(1, 400), it(2, 300)], [it(13, 500)], rel, rel, 2);
  assert.deepEqual(s, { keep: [1, 2], take: [], ended: [], dup: [], over: [13] }, "who is followed does not change at every look");
  // ...one more than SEEDS.displace times a followed one's size takes the smallest one's place...
  s = assignSlots([it(1, 400), it(2, 300)], [it(13, 300 * SEEDS.displace + 1)], rel, rel, 2);
  assert.deepEqual(s, { keep: [1], take: [13], ended: [2], dup: [], over: [] }, "a big shark swimming in takes a far one's slot");
  // ...and with room, everything is followed, in the order given.
  s = assignSlots([it(2, 300), it(1, 400)], [it(13, 10), it(19, 900)], rel, rel, 4);
  assert.deepEqual(s, { keep: [2, 1], take: [13, 19], ended: [], dup: [], over: [] });
  // A find that replaced a track does not also count as that track's duplicate; the freed slot is its own.
  s = assignSlots([it(3, 80), it(1, 400)], [it(14, 400)], rel, rel, 2);
  assert.deepEqual(s, { keep: [1], take: [14], ended: [3], dup: [], over: [] });
  // Among finds alone, the largest get the slots (ties: the earlier find).
  s = assignSlots([], [it(21, 100), it(22, 300), it(23, 100), it(24, 200)], rel, rel, 3);
  assert.deepEqual(s, { keep: [], take: [21, 22, 24], ended: [], dup: [], over: [23] });
  // No cap (a desktop).
  s = assignSlots([it(1, 1)], [it(21, 1), it(22, 1)], rel, rel, Infinity);
  assert.deepEqual(s.take, [21, 22]);
  console.log("seeds: no subject followed twice, a followed subject keeps its track, the cap: ok");
}

// ---------------------------------------------------------------- the re-seed cadence

{
  const every = SEG.topUpS, margin = SEG.reacquireS / 2;
  assert.equal(SEG.topUpS, 4);
  assert.equal(topUpAt(0, 1, 3, 8, every, margin), 4, "room left: the next look comes topUpS later");
  assert.equal(topUpAt(4, 2, 3, 8, every, margin), null, "not on top of the next regular start");
  assert.equal(topUpAt(8, 2, 3, 16, every, margin), 12);
  assert.equal(topUpAt(0, 3, 3, 8, every, margin), null, "every slot taken: a look could only add tracker steps");
  assert.equal(topUpAt(0, 4, 3, 8, every, margin), null);
  assert.equal(topUpAt(0, 0, 3, 8, every, margin), null, "nothing followed: the session's own re-acquire schedule, not this one");
  assert.equal(topUpAt(46, 1, 3, 50, every, margin), null, "nor within a second of the range's end");
  assert.equal(topUpAt(40, 1, 3, 50, every, margin), 44);
  assert.equal(topUpAt(0, 1, 3, 8, 0, margin), null);
  console.log("seeds: the look for new subjects every 4 s while there is room: ok");
}

// ---------------------------------------------------------------- the session on a fake school

/** A subject of the fake clip: a bright box (u, v centre; half sizes), on screen between two clip times. */
/** jump: from that clip time on it is `du` further right (no flow follows it). fat: from that clip time on the
 * model's mask of it is that many times as wide as it is (the water beside it). hide: the model sees nothing of it
 * between those two clip times. */
type Sub = { name: string; u: number; v: number; hu: number; hv: number; from: number; to: number; ghost?: boolean; jump?: [number, number]; fat?: [number, number]; hide?: [number, number] };
let school: Sub[] = [];
const on = (s: Sub, t: number) => t >= s.from - 1e-6 && t <= s.to + 1e-6;
const inside = (s: Sub, u: number, v: number, t = 0, wide = 1) => Math.abs(u - s.u - (s.jump && t >= s.jump[0] ? s.jump[1] : 0)) < s.hu * wide && Math.abs(v - s.v) < s.hv;

class FakeCanvas {
  width: number;
  height: number;
  private t = 0;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() {
    const c = this;
    return {
      setTransform() {}, translate() {}, rotate() {},
      drawImage(src: { t: number }) { c.t = src.t; },
      getImageData(_x: number, _y: number, W: number, H: number) {
        const data = new Uint8ClampedArray(W * H * 4), t = c.t;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H, k = (y * W + x) * 4;
          // Water with a faint texture; a subject is pale against it, a "ghost" is the water's own colour.
          let s = 70 + 3 * Math.sin(u * 40) * Math.cos(v * 30);
          for (const sub of school) if (!sub.ghost && on(sub, t) && inside(sub, u, v, t)) s = 190;
          data[k] = s * 0.3; data[k + 1] = s * 0.8; data[k + 2] = s; data[k + 3] = 255;
        }
        data[0] = Math.round(t * 100) % 256; data[1] = Math.floor(Math.round(t * 100) / 256);
        return { data };
      },
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeCanvas;

type Fake = { model: EdgeTam; frames: SessionFrames; encodes: number; probes: [number, number][][]; stepped: { key: string; t: number; sub: string | null }[]; bound: Map<string, Sub | null> };

/** A model that masks the subject its first positive point lies in (the whole frame, "the water", when in none),
 * and rates every mask `iou` (the lite model on pale, far sharks: 0.5). */
function fake(iou = 0.5): Fake {
  const f: Fake = { model: null as unknown as EdgeTam, frames: null as unknown as SessionFrames, encodes: 0, probes: [], stepped: [], bound: new Map() };
  let encT = 0;
  const lw = 160, lh = 20;
  const mask = (sub: Sub | null | undefined, t: number) => {
    const logits = new Float32Array(lw * lh);
    const shown = sub === undefined || (sub !== null && on(sub, t) && !(sub.hide && t >= sub.hide[0] && t < sub.hide[1]));
    const wide = sub?.fat && t >= sub.fat[0] ? sub.fat[1] : 1;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) logits[y * lw + x] = sub === undefined || (shown && inside(sub!, (x + 0.5) / lw, (y + 0.5) / lh, t, wide)) ? 10 : -10;
    return { logits, lw, lh, score: shown ? 20 : -5, iou: sub === undefined ? 0.98 : iou };
  };
  const at = (pts: [number, number][], t: number) => school.find((s) => on(s, t) && inside(s, pts[0][0] / 1024, pts[0][1] / 1024, t));
  f.model = {
    lite: false,
    timing: { encode: 0, encodes: 0, attend: 0, decoder: 0, memEnc: 0, steps: 0 },
    async encode(rgba: Uint8ClampedArray) { f.encodes++; encT = (rgba[0] + 256 * rgba[1]) / 100; },
    async step(key: string, _frame: number, pts: [number, number][] | null) {
      if (pts && !f.bound.has(key)) f.bound.set(key, at(pts, encT) ?? null);
      const sub = f.bound.get(key) ?? null;
      f.stepped.push({ key, t: encT, sub: sub?.name ?? null });
      return mask(sub, encT);
    },
    async probe(pts: [number, number][]) { f.probes.push(pts); return mask(at(pts, encT), encT); },
    drop() {},
  } as unknown as EdgeTam;
  f.frames = { width: 1920, height: 240, rotation: 0, async at(t: number) { return { t } as unknown as CanvasImageSource; }, dispose() {} };
  return f;
}

const region = (s: Sub): SeedCandidate => ({ points: [[s.u, s.v]], box: { x0: s.u - s.hu, y0: s.v - s.hv, x1: s.u + s.hu, y1: s.v + s.hv }, area: 4 * s.hu * s.hv, rank: 4 * s.hu * s.hv });

/** The fake engine reports no region before this clip time (its looks find nothing there). */
let blindUntil = 0;

type Run = { s: SegSession; looks: { t: number; search: boolean; found: number }[]; errors: string[]; done: Promise<void> };

/**
 * A session whose "main thread" does what studio.ts seedSegmentCanonical does at every look: the engine's regions of
 * the frame (here: every subject on screen, plus `extra`) go to the model's search, and what it finds is seeded.
 * `handed(t)`: seeds handed over without the search (the engine's own animals).
 */
function run(f: Fake, end: number, opts: SessionOptions, handed: (t: number) => SegObject[] = () => [], extra: Sub[] = []): Run {
  let ids = 1, finish: () => void = () => undefined;
  const r: Run = { s: null as unknown as SegSession, looks: [], errors: [], done: new Promise<void>((res) => { finish = res; }) };
  const look = async (t: number, search: boolean) => {
    const regions = [...school.filter((s) => on(s, t) && t >= blindUntil - 1e-6), ...extra].sort((a, b) => b.hu * b.hv - a.hu * a.hv).map(region);
    const found = await r.s.autoSeeds(t, regions, false);
    r.looks.push({ t, search, found: found.length });
    r.s.seeds(t, [...handed(t), ...found].map((o) => ({ ...o, id: ids++ })));
  };
  const ev: SessionEvents = {
    frames: () => undefined, keys: () => undefined, progress: () => undefined, trace: () => undefined, peek: () => undefined, rejected: () => undefined,
    idle: () => finish(),
    // (From another task, as the worker's message to the main thread is: the session's loop is still inside this call.)
    needSeeds: (_k, t, search) => { setTimeout(() => void look(t, search), 0); },
    error: (msg) => { r.errors.push(msg); finish(); },
  };
  r.s = new SegSession(f.model, f.frames, { start: 0, end }, ev, { fps: 2, ...opts });
  void look(0, true);
  return r;
}

/** The ids that followed subject `name` for more than their first step, and each one's first and last keyframe. */
const tracks = (f: Fake, name: string) => {
  const by = new Map<string, number[]>();
  for (const x of f.stepped) if (x.sub === name && x.key.endsWith("f")) by.set(x.key, [...(by.get(x.key) ?? []), x.t]);
  return [...by].filter(([, ts]) => ts.length > 1).map(([key, ts]) => ({ key, from: Math.min(...ts), to: Math.max(...ts) }));
};
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => { const info = console.info; if (!process.env.SEG_LOG) console.info = () => undefined; try { return await fn(); } finally { console.info = info; } };

const A: Sub = { name: "A", u: 0.15, v: 0.5, hu: 0.06, hv: 0.3, from: 0, to: 99 };
const B: Sub = { name: "B", u: 0.45, v: 0.5, hu: 0.05, hv: 0.3, from: 0, to: 99 };
const C: Sub = { name: "C", u: 0.75, v: 0.5, hu: 0.04, hv: 0.3, from: 0, to: 99 };

// The search: the engine's regions are subjects where the blind grid's rule refuses every one of them.
await quiet(async () => {
  school = [A, B, C];
  const ghost: Sub = { name: "ghost", u: 0.9, v: 0.5, hu: 0.03, hv: 0.3, from: 0, to: 99, ghost: true };
  const water: Sub = { name: "water", u: 0.3, v: 0.1, hu: 0.02, hv: 0.05, from: 0, to: -1 }; // nothing there: the model answers with the whole frame
  const f = fake(0.5);
  const s = new SegSession(f.model, f.frames, { start: 0, end: 4 }, { frames() {}, keys() {}, progress() {}, trace() {}, peek() {}, rejected() {}, idle() {}, needSeeds() {}, error() {} } as unknown as SessionEvents, { fps: 2 });
  // The grid: every probe that lands on a subject is refused (the model's estimate is under AUTO.iou).
  assert.ok(0.5 < AUTO.iou && 0.5 >= AUTO.blobIou);
  assert.equal((await s.autoSeeds(0)).length, 0, "the blind grid finds nothing in a school of pale sharks");
  assert.equal(f.probes.length, AUTO.cols * AUTO.rows);
  f.probes.length = 0;
  school = [A, B, C, ghost];
  const found = await s.autoSeeds(0, [A, B, C, ghost, water].map(region), true);
  assert.equal(f.probes.length, 5, "one probe per region, and no grid when regions are subjects");
  assert.deepEqual(found.map((o) => o.prompt.points), [[[A.u, A.v]], [[B.u, B.v]], [[C.u, C.v]]], "the three sharks, largest first; the water-coloured region and the patch of plain water are refused");
  for (const o of found) { assert.deepEqual(o.prompt.labels, [1]); assert.equal(o.prompt.box, undefined, "followed from the region's own points, no box"); assert.equal(o.kind, "include"); }
  // A mask several times the size of what the engine saw there (the subject and the water around it) is refused.
  assert.equal((await s.autoSeeds(0, [{ ...region(A), area: region(A).area / 3 }], false)).length, 0, "3 × the region: over AUTO.blobGrow");
  assert.equal((await s.autoSeeds(0, [{ ...region(A), area: region(A).area / 2 }], false)).length, 1, "2 × the region: the engine sees the bright flank, the model the animal");
  // Twice the same region: one subject.
  assert.equal((await s.autoSeeds(0, [region(A), { ...region(A), points: [[A.u + 0.02, A.v]] }], false)).length, 1);
  // No region is a subject and no grid asked for: nothing, at the cost of the regions' probes alone.
  f.probes.length = 0;
  assert.equal((await s.autoSeeds(0, [region(ghost), region(water)], false)).length, 0);
  assert.equal(f.probes.length, 2);
  // The frame was encoded once for all of these looks.
  assert.equal(f.encodes, 1);
  // A subject the frame cuts through, lying along a side (a diver's head in a selfie shot): not started on, by a
  // region or by the grid.
  const head: Sub = { name: "head", u: 0.05, v: 0.5, hu: 0.1, hv: 0.3, from: 0, to: 99 };
  school = [head];
  const f2 = fake(0.95);
  const s2 = new SegSession(f2.model, f2.frames, { start: 0, end: 4 }, { frames() {}, keys() {}, progress() {}, trace() {}, peek() {}, rejected() {}, idle() {}, needSeeds() {}, error() {} } as unknown as SessionEvents, { fps: 2 });
  assert.equal((await s2.autoSeeds(0, [region(head)], true)).length, 0, "along 60% of the left side: refused");
  assert.ok(f2.probes.length > 1, "the grid was tried too");
  // (Another frame: the session keeps a frame's pixels.)
  school = [{ ...head, u: 0.2 }];
  assert.equal((await s2.autoSeeds(1, [region(school[0])], false)).length, 1, "the same subject inside the picture is one");
});
console.log("session: the engine's regions are found where the grid finds nothing; water, haze and the frame's edge are refused: ok");

// The cap and id stability: three sharks, room for two.
await quiet(async () => {
  school = [A, { ...B, to: 9.9 }, C];
  const f = fake(0.5);
  const r = run(f, 20, { autoCap: 2 });
  await r.done;
  assert.deepEqual(r.errors, []);
  // Every slot is taken: the regular starts only (0, 8, 16 s), and one look a second after a slot is given up.
  assert.deepEqual(r.looks.map((x) => x.t), [0, 8, 12.5, 16]);
  assert.deepEqual(r.looks.map((x) => x.search), [true, true, false, true]);
  assert.deepEqual(r.looks.map((x) => x.found), [2, 0, 1, 0], "0 s: the two largest; 8 s: all three are regions again, two followed already and no room for the third; 12.5 s: B has left, C comes in");
  // A is followed by one track from the first keyframe to the last; B until it has shown nothing for SEG.goneS; C
  // from the look a second after that.
  assert.deepEqual(tracks(f, "A"), [{ key: "1f", from: 0, to: 20 }], "one id, one memory, all through");
  assert.deepEqual(tracks(f, "B").map((x) => x.key), ["2f"]);
  assert.equal(Math.max(...f.stepped.filter((x) => x.key === "2f").map((x) => x.t)), 11.5, "B left at 9.9 s (last seen 9.5 s): its track is let go after 2 s of nothing, not stepped on to the next start");
  assert.deepEqual(tracks(f, "C"), [{ key: "3f", from: 12.5, to: 20 }]);
  // No seed was started only to be let go (the search leaves out what is followed and what there is no room for)...
  assert.deepEqual([...new Set(f.stepped.map((x) => x.key))].sort(), ["1f", "2f", "3f"]);
  // ...and never more than two subjects are followed on from a look.
  for (const t of [0.5, 8.5, 13, 16.5]) assert.ok(f.stepped.filter((x) => x.t === t && x.key.endsWith("f")).length <= 2, `at most the cap (${t} s)`);
});
console.log("session: a school with room for two → the same two tracks all through, the third when one leaves: ok");

// The cadence: with room left the session looks again every 4 s, and a subject that swims in is picked up there.
await quiet(async () => {
  school = [A, B, { ...C, from: 1.5 }];
  const f = fake(0.5);
  const r = run(f, 20, { autoCap: 3 });
  await r.done;
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.looks.map((x) => x.t), [0, 4, 8, 16], "room for a third: a look at 4 s; full from there: the regular starts only");
  assert.deepEqual(r.looks.map((x) => x.search), [true, false, true, true], "the extra look asks about the engine's regions only (no grid)");
  assert.deepEqual(r.looks.map((x) => x.found), [2, 1, 0, 0]);
  assert.deepEqual(tracks(f, "A"), [{ key: "1f", from: 0, to: 20 }]);
  assert.deepEqual(tracks(f, "B"), [{ key: "2f", from: 0, to: 20 }]);
  assert.deepEqual(tracks(f, "C"), [{ key: "3f", from: 4, to: 20 }], "C came in at 1.5 s: followed from the look at 4 s, not from the next regular start at 8 s");
  // A lone subject with room to spare: a look every 4 s all through (each finds it followed already).
  school = [A];
  const f1 = fake(0.5);
  const r1 = run(f1, 20, { autoCap: 3 });
  await r1.done;
  assert.deepEqual(r1.looks.map((x) => x.t), [0, 4, 8, 12, 16]);
  assert.deepEqual(r1.looks.map((x) => x.found), [1, 0, 0, 0, 0]);
  assert.deepEqual(tracks(f1, "A"), [{ key: "1f", from: 0, to: 20 }]);
  // The looks after the first run on the frame the pass has encoded already: one encode per keyframe, no more.
  assert.equal(f1.encodes, 41, "41 keyframes (2 a second over 20 s), each encoded once");
  assert.equal(f1.probes.length, 5, "one probe per look");
});
console.log("session: a look every 4 s while there is room, on the pass's own encode: ok");

// Seeds handed over without the search (the engine's own animals) on a subject that is followed already.
await quiet(async () => {
  school = [A, B];
  const f = fake(0.5);
  // At 4 s the engine's animals are A again (a seed with its own points) and nothing else; the regions find B's twin too.
  const r = run(f, 12, { autoCap: 3 }, (t) => t === 4 ? [{ kind: "include", t, prompt: { points: [[A.u + 0.01, A.v]], labels: [1] } }] : []);
  await r.done;
  assert.deepEqual(r.errors, []);
  assert.deepEqual(tracks(f, "A"), [{ key: "1f", from: 0, to: 12 }], "A keeps its first track");
  assert.deepEqual(tracks(f, "B"), [{ key: "2f", from: 0, to: 12 }]);
  const dup = f.stepped.filter((x) => x.key === "3f");
  assert.deepEqual(dup.map((x) => x.t), [4], "the second seed on A has its first mask and is let go: the shark is not followed twice");
});
console.log("session: a seed on a subject followed already is let go at its first mask: ok");

// A mask that grows onto the water around its subject, each step under the runaway limits, is not kept.
await quiet(async () => {
  const areas = (r: Run, id: number) => {
    const o = (r.s as unknown as { objs: Map<number, { keys: Map<number, Uint8Array> }> }).objs.get(id)!;
    return [...o.keys].sort((a, b) => a[0] - b[0]).map(([t, k]) => ({ t, a: rleDecode(k, 320 * 40).reduce((n, x) => n + (x > 127 ? 1 : 0), 0) }));
  };
  assert.ok(2.4 > SEG.bloat && 2.4 < SEG.runawayGrow, "under the old limit (2.5 × the flow-carried mask), over the new one");
  school = [A, { ...B, fat: [3, 2.4] }];
  const f = fake(0.5);
  const r = run(f, 8, { autoCap: 3 });
  await r.done;
  assert.deepEqual(r.errors, []);
  const b = areas(r, 2), seed = b[0].a;
  assert.ok(seed > 0 && b.filter((x) => x.t < 3).every((x) => x.a === seed), "B's own size until 3 s");
  assert.ok(b.filter((x) => x.t >= 3).length > 0 && b.every((x) => x.a <= SEG.bloat * seed), `no mask of B over ${SEG.bloat} × its size (${b.map((x) => (x.a / seed).toFixed(1)).join(" ")})`);
  const a = areas(r, 1);
  assert.ok(a.length === 17 && a.every((x) => x.a === a[0].a), "A beside it is followed as ever");
  // Back after keyframes without a mask, three times the size it was last seen at: not kept either (a far shark's
  // track that came back as a diver's face).
  const D: Sub = { name: "D", u: 0.6, v: 0.5, hu: 0.02, hv: 0.2, from: 0, to: 99, hide: [2, 4], fat: [4, 3] };
  school = [D];
  const f2 = fake(0.5);
  const r2 = run(f2, 8, { autoCap: 3 });
  await r2.done;
  const d = areas(r2, 1);
  assert.ok(d.some((x) => x.t < 2 && x.a > 0) && d.filter((x) => x.t >= 2).every((x) => x.a <= d[0].a), `nothing larger than D after it was lost (${d.map((x) => (x.a / d[0].a).toFixed(1)).join(" ")})`);
});
console.log("session: a mask grown onto the water around its subject, or back far larger than it was, is not kept: ok");

// Adaptive keyframes, each subject for itself: the one with a hard step goes on the fine grid, the others do not.
await quiet(async () => {
  school = [A, { ...B, jump: [2.1, 0.25] }];
  const f = fake(0.5);
  const r = run(f, 6, { autoCap: 3, adapt: true });
  await r.done;
  assert.deepEqual(r.errors, []);
  const off = (key: string) => f.stepped.filter((x) => x.key === key && Math.abs(x.t * 2 - Math.round(x.t * 2)) > 1e-6).map((x) => x.t);
  assert.ok(off("2f").length >= 2 && Math.min(...off("2f")) > 2.5, `B, which jumped at 2.1 s, is on the fine grid after its hard step at 2.5 s (${off("2f").join(" ")})`);
  assert.deepEqual(off("1f"), [], "A beside it keeps to 2 keyframes a second");
});
console.log("session: extra keyframes for the subject with a hard step only: ok");

// Back-fills wait for the end of the forward pass: the decoder reads the clip through once, then turns.
await quiet(async () => {
  // Both sharks are in the picture from 0 s; the first look that finds them is the one at 6 s (both are followed
  // back to 0 s). A leaves at 9 s and is let go at 11 s, with B in mid-pass.
  school = [{ ...A, to: 9.1 }, B];
  blindUntil = 5;
  const f = fake(0.5);
  const r = run(f, 20, { autoCap: 3 });
  await r.done;
  blindUntil = 0;
  assert.deepEqual(r.errors, []);
  const back = f.stepped.map((x, i) => ({ ...x, i })).filter((x) => x.key.endsWith("b") && x.t < 6 - 1e-6);
  const lastFwd = f.stepped.findLastIndex((x) => x.key.endsWith("f"));
  assert.ok(back.length >= 2 * 12, `both are followed back (${back.length} steps)`);
  assert.ok(back.every((x) => x.i > lastFwd), "no back-fill step before the last forward step of the pass");
  let turns = 0;
  for (let i = 1; i < f.stepped.length; i++) if (f.stepped[i].t < f.stepped[i - 1].t - 1e-6 && f.stepped[i - 1].key.endsWith("f")) turns++;
  assert.equal(turns, 1, "the pass turns back once");
  assert.equal(Math.max(...f.stepped.filter((x) => x.key.endsWith("f")).map((x) => x.t)), 20);
});
console.log("session: back-fills run after the forward pass (one turn of the decoder): ok");

console.log("seg-seeds tests passed");
