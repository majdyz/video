// AI subject detection: where the model is asked to look, and which subjects get followed.
//
// - blobCandidates: the engine's own "something in the water" regions (aqua-fix backdrop.ts SubjectBlob: every region
//   that departs from the fitted water, whatever its size) as prompt candidates, ranked by contrast and size. A
//   school of small, pale sharks is under the size the engine tones an animal from, and the model's blind point grid
//   passes between them (a 6 × 6 grid on a 480-px frame is 80 px apart, a far hammerhead 60 × 15 px); the engine's
//   regions sit on them. The session probes each candidate and keeps what the model and the water test agree is a
//   subject (session.ts autoSeeds): a blob of plain water is refused there.
// - assignSlots: which of the subjects followed so far and of the new finds are followed from a look on (the cap on
//   subjects followed at a time): the same subject is not followed twice, a subject already followed keeps its
//   track (and its memory) rather than being started over, and a new one comes in while there is room.
// - topUpAt: when to look again for subjects that have come into the picture.
//
// Pure functions (no model, no frames): unit-tested in test/seg-seeds.test.ts.
import type { SubjectBlob } from "../../../../aqua-fix/src/engine/backdrop.ts";

export const SEEDS = {
  /** A region under this share of the frame is a speck (a 480 × 854 frame: 410 px, a shark 45 × 9 px; the model's
   * own mask there must reach session.ts AUTO.areaSmall: the engine sees the bright flank, the model the animal)... */
  minArea: 0.001,
  /** ...and one over this is the background, not a subject (session.ts AUTO.areaHi). */
  maxArea: 0.3,
  /** Mean departure from the water (0..1) under which a region is haze: far sharks measure 0.10–0.3, near ones
   * 0.4–0.8, the faint patches the flood also reports 0.06–0.08 (owner's hammerhead clip). */
  minDev: 0.09,
  /** A region spanning more than this share of the frame's width or height is no animal (a dark line along the
   * frame's top edge, the surface, the seabed). */
  span: 0.9,
  /** A region that looks this much like a column of bubbles is left out. */
  bubble: 0.5,
  /** Under this much of the engine's confidence that the frame is open water (engine waterValidity: 0.9–1 on a
   * school in the blue, 0.45–0.67 with big sharks close up, 0.0–0.6 on a clip over the seabed), a region is only a
   * candidate when the engine itself took it for a subject (a confident seed in it, an outline, not the bottom),
   * and the model must be surer of it (session.ts AUTO.strictIou / strictContrast): over a seabed the regions are
   * dark patches and shadows (owner's ray clip, 20 s: three of them seeded, ΔE 2.3–5.7, IoU 0.33–0.69). */
  openWater: 0.8,
  /** Candidates handed to the model at a look, most promising first: each is one decoder run (~0.3 s on a desktop's
   * WASM, the lite model), against the blind grid's 12 + 36. */
  probes: 8,
  /** Two masks are the same subject when they overlap by this much (IoU): the one followed so far stays. */
  sameIoU: 0.4,
  /** One mask holding this share of the other (of the smaller one) without being the same extent: the track has
   * shrunk to a part of its subject, or grown past it; the fresh find takes its place. */
  partShare: 0.5,
  /** With no room left, a new find takes a followed subject's place only when it is this many times its size (a
   * big shark swimming in, over a far one): otherwise who is followed would change at every look. */
  displace: 2,
};

/** A place the model is asked about: positive points inside it (upright uv), its box and size, and how promising it is. */
export type SeedCandidate = {
  points: [number, number][];
  box: { x0: number; y0: number; x1: number; y1: number };
  /** Share of the frame. */
  area: number;
  /** Contrast × size (blobRank): candidates are probed in this order. */
  rank: number;
  /** The frame is not surely open water (SEEDS.openWater): the model's mask must pass the stricter bar. */
  strict?: boolean;
};

/** How promising a region is: its contrast against the water times its linear size (a big faint shark and a small
 * clear one rank alike), halved when the engine's own tests (an outline, not the seabed) did not accept it. */
export function blobRank(b: SubjectBlob): number {
  return b.dev * Math.sqrt(b.area) * (b.accept >= 0.5 ? 1 : 0.5);
}

/**
 * The engine's regions as prompt candidates, most promising first, at most `max`. Left out: specks, the background,
 * haze, frame-wide lines, bubbles, and regions `taken` already (a point of theirs lies in an animal the engine's own
 * seeds cover). Deterministic for the frame (ties go top to bottom, left to right).
 * `validity`: the engine's confidence that the frame is open water (SEEDS.openWater: under it only regions the
 * engine itself accepted, with a confident seed, and marked `strict`).
 */
export function blobCandidates(blobs: readonly SubjectBlob[] | null | undefined, taken: ((u: number, v: number) => boolean) | null = null, max = SEEDS.probes, validity = 1): SeedCandidate[] {
  if (!blobs) return [];
  const strict = validity < SEEDS.openWater;
  const out: (SeedCandidate & { u: number; v: number })[] = [];
  for (const b of blobs) {
    if (b.area < SEEDS.minArea || b.area > SEEDS.maxArea || b.dev < SEEDS.minDev || b.bubble > SEEDS.bubble) continue;
    if (b.x1 - b.x0 > SEEDS.span || b.y1 - b.y0 > SEEDS.span) continue;
    if (taken && b.pts.some(([u, v]) => taken(u, v))) continue;
    if (strict && !(b.seeded && b.accept >= 0.5)) continue;
    out.push({ ...(strict ? { strict } : {}), points: b.pts.map(([u, v]) => [u, v] as [number, number]), box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, area: b.area, rank: blobRank(b), u: b.u, v: b.v });
  }
  out.sort((a, b) => b.rank - a.rank || a.v - b.v || a.u - b.u);
  return out.slice(0, max).map(({ u: _u, v: _v, ...c }) => c);
}

/**
 * The largest share of one side of the frame that a mask lies along (0..1): the mask's texels on the frame's
 * outermost row or column, over that side's length. A subject the frame cuts through (a diver's head in a selfie
 * shot), the surface or the seabed lie along a side; a subject in the picture touches it by a fin at most.
 */
export function edgeShare(m: ArrayLike<number>, w: number, h: number, thr = 0.5): number {
  let top = 0, bottom = 0, left = 0, right = 0;
  for (let x = 0; x < w; x++) { if (m[x] > thr) top++; if (m[(h - 1) * w + x] > thr) bottom++; }
  for (let y = 0; y < h; y++) { if (m[y * w] > thr) left++; if (m[y * w + w - 1] > thr) right++; }
  return Math.max(top / w, bottom / w, left / h, right / h);
}

/**
 * A mask that sits in a corner of the frame: it lies along two adjacent sides, each over `min` of the side's length.
 * What the frame cuts off at a corner (a diver's hair in a selfie shot: a patch of it was seeded there) is not a
 * subject to start on; an animal swimming in is found at the next look, once it is in the picture.
 */
export function inCorner(m: ArrayLike<number>, w: number, h: number, min = 0.05, thr = 0.5): boolean {
  let top = 0, bottom = 0, left = 0, right = 0;
  for (let x = 0; x < w; x++) { if (m[x] > thr) top++; if (m[(h - 1) * w + x] > thr) bottom++; }
  for (let y = 0; y < h; y++) { if (m[y * w] > thr) left++; if (m[y * w + w - 1] > thr) right++; }
  const T = top > min * w, B = bottom > min * w, L = left > min * h, R = right > min * h;
  return (T || B) && (L || R);
}

/** A subject at a look: one followed so far (its mask now) or a new find (its first mask). */
export type SlotItem = { id: number; area: number };
/** How two masks overlap: their IoU, and the share of the smaller one under the other. */
export type Overlap = { iou: number; share: number };

/** Overlap of two masks on the same grid (values over `thr` count). */
export function overlap(a: ArrayLike<number>, b: ArrayLike<number>, thr = 0.5): Overlap {
  let i = 0, na = 0, nb = 0;
  for (let k = 0; k < a.length; k++) {
    const x = a[k] > thr, y = b[k] > thr;
    if (x) na++;
    if (y) nb++;
    if (x && y) i++;
  }
  const u = na + nb - i, lo = Math.min(na, nb);
  return { iou: u ? i / u : 0, share: lo ? i / lo : 0 };
}

/**
 * Who is followed from a look on. `olds`: the subjects followed up to it (any order); `news`: the look's finds, most
 * important first; `rel(old, new)` / `relNew(a, b)`: how their masks overlap; `cap`: subjects followed at a time.
 *
 * - A find that is the subject of a track (same extent: IoU ≥ SEEDS.sameIoU) is a duplicate: the track goes on
 *   under its own id, with its memory (`dup`).
 * - A find that holds much of a track, or lies mostly inside one, without being the same extent replaces it: the
 *   track had shrunk to a part of the subject or run past it (`ended`).
 * - A find that overlaps an earlier find of the same look is a duplicate too.
 * - With more subjects than `cap`, the largest stay; a followed one counts SEEDS.displace times its size.
 *
 * Returns ids: `keep` (olds that go on), `take` (news that start), `ended` (olds that stop: replaced or out of
 * room), `dup` (news that are already followed or found twice), `over` (news left out for want of room).
 */
export function assignSlots<O extends SlotItem, N extends SlotItem>(olds: readonly O[], news: readonly N[], rel: (o: O, n: N) => Overlap, relNew: (a: N, b: N) => Overlap, cap: number): { keep: number[]; take: number[]; ended: number[]; dup: number[]; over: number[] } {
  const alive = new Set(olds.map((o) => o.id));
  const ended: number[] = [], dup: number[] = [], over: number[] = [];
  const fresh: N[] = [];
  for (const n of news) {
    let isDup = false;
    const replaced: number[] = [];
    for (const o of olds) {
      if (!alive.has(o.id)) continue;
      const r = rel(o, n);
      if (r.iou >= SEEDS.sameIoU) { isDup = true; break; }
      if (r.share >= SEEDS.partShare) replaced.push(o.id);
    }
    if (!isDup) for (const f of fresh) { const r = relNew(f, n); if (r.iou >= SEEDS.sameIoU || r.share >= SEEDS.partShare) { isDup = true; break; } }
    if (isDup) { dup.push(n.id); continue; }
    for (const id of replaced) { alive.delete(id); ended.push(id); }
    fresh.push(n);
  }
  const pool = [
    ...olds.filter((o) => alive.has(o.id)).map((o) => ({ it: o, old: true, w: o.area * SEEDS.displace })),
    ...fresh.map((n, i) => ({ it: n, old: false, w: n.area, i })),
  ];
  // Largest first; equal: a followed subject before a find, then the lower id / the earlier find.
  pool.sort((a, b) => b.w - a.w || Number(b.old) - Number(a.old) || a.it.id - b.it.id);
  const keep: number[] = [], take: number[] = [];
  pool.forEach((p, i) => {
    if (i < cap) (p.old ? keep : take).push(p.it.id);
    else (p.old ? ended : over).push(p.it.id);
  });
  // (In the order they were given: the caller's order is the order of importance.)
  const order = (ids: number[], src: readonly SlotItem[]) => src.filter((s) => ids.includes(s.id)).map((s) => s.id);
  return { keep: order(keep, olds), take: order(take, news), ended, dup, over };
}

/**
 * When to look for subjects again after the look at `t` (seconds of clip; null: at the next regular start).
 * `followed`: subjects followed from t on; `cap`: how many can be; `next`: the next regular start (or the range's
 * end); `every`: the cadence (track.ts SEG.topUpS); `margin`: no look this close before `next`.
 * With room left, subjects that swim into the picture are picked up at the next look rather than at the next regular
 * start (SEG.segmentS later). With every slot taken a look could only add tracker steps, so none is made (the
 * session looks again when a slot is given up: SEG.goneS). With nothing followed at all the session's own
 * re-acquire schedule applies (session.ts reacquire), not this one.
 */
export function topUpAt(t: number, followed: number, cap: number, next: number, every: number, margin: number): number | null {
  if (followed <= 0 || followed >= cap || !(every > 0)) return null;
  const r = t + every;
  return r < next - margin ? r : null;
}
