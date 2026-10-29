// Subject pop tap logic (pure): what a tap does to the clip's corrections.
//   node --experimental-strip-types apps/studio/test/subjects.test.ts
import assert from "node:assert/strict";
import { subjectAt, toggleOverride } from "../src/pipeline/subjects.ts";
import type { SubjectOverride, SubjectSelection } from "../../aqua-fix/src/engine/animals.ts";

const W = 160, H = 90;
/** A selection with one animal (id 1) covering x 40..80, y 30..60 of the map grid. */
const sel = (animal: SubjectSelection["animals"][number]): SubjectSelection => {
  const ids = new Uint16Array(W * H);
  for (let y = 30; y < 60; y++) for (let x = 40; x < 80; x++) ids[y * W + x] = animal.id;
  return { width: W, height: H, ids, animals: [animal] };
};
const inside = { u: 60 / W, v: 45 / H };

// Hit test: under the finger, or the nearest within reach (a fingertip is coarse); nothing far away.
{
  const s = sel({ id: 1, strength: 1, auto: 1 });
  assert.equal(subjectAt(s, inside.u, inside.v), 1);
  assert.equal(subjectAt(s, 82 / W, 45 / H), 1, "just outside the outline still hits");
  assert.equal(subjectAt(s, 120 / W, 45 / H), 0, "open water hits nothing");
}

// A toned animal: the tap excludes it, and the new correction is followed through the clip.
{
  const r = toggleOverride([], sel({ id: 1, strength: 1, auto: 1 }), inside.u, inside.v, 2);
  assert.equal(r.id, 1);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].action, "exclude");
  assert.equal(r.list[0].t, 2);
  assert.equal(r.follow, 0, "a new correction needs its track pass");
}

// An animal the automatic choice left alone (or one still fading in, strength ≤ 0.5): the tap includes it.
{
  const r = toggleOverride([], sel({ id: 1, strength: 0.2, auto: 0 }), inside.u, inside.v, 1);
  assert.equal(r.list[0].action, "include");
}

// A tap on water: an include seed (no animal), followed like any other.
{
  const r = toggleOverride([], sel({ id: 1, strength: 1, auto: 1 }), 130 / W, 20 / H, 3);
  assert.equal(r.id, 0);
  assert.equal(r.list[0].action, "include");
  assert.equal(r.follow, 0);
}

// Second tap on a corrected animal: back to the automatic choice when that is what the tap asks for (no pile of
// corrections), else the correction flips and keeps the path it was followed along.
{
  const path = [{ t: 1, u: 0.4, v: 0.5, a: 0.05 }, { t: 2, u: 0.45, v: 0.5, a: 0.05 }];
  const ex: SubjectOverride = { t: 1.5, u: inside.u, v: inside.v, action: "exclude", path };
  // Auto-toned animal excluded by the user: the next tap removes the exclusion.
  const undo = toggleOverride([ex], sel({ id: 1, strength: 0, auto: 1, override: "exclude", overrideIndex: 0 }), inside.u, inside.v, 1.6);
  assert.deepEqual(undo.list, [], "undo restores the automatic choice");
  assert.equal(undo.follow, -1);
  // Animal the automatic choice leaves alone, excluded anyway (no-op), then tapped: flips to include, path kept.
  const flip = toggleOverride([ex], sel({ id: 1, strength: 0, auto: 0, override: "exclude", overrideIndex: 0 }), inside.u, inside.v, 1.6);
  assert.equal(flip.list.length, 1);
  assert.equal(flip.list[0].action, "include");
  assert.equal(flip.list[0].path, path, "the followed path is kept");
  assert.equal(flip.follow, -1, "no new pass needed");
  // An included animal (auto off): the next tap undoes the include.
  const inc: SubjectOverride = { ...ex, action: "include" };
  const undoInc = toggleOverride([inc], sel({ id: 1, strength: 1, auto: 0, override: "include", overrideIndex: 0 }), inside.u, inside.v, 1.6);
  assert.deepEqual(undoInc.list, []);
}

// No selection yet (Subject pop just switched on): a tap is a seed, never a crash.
{
  const r = toggleOverride([], null, 0.5, 0.5, 0);
  assert.equal(r.list[0].action, "include");
  assert.equal(r.id, 0);
}
console.log("ok  subjects");
