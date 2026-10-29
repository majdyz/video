// Per-animal Subject pop (labelling, whole-or-nothing, tracking, lead).
//   node --experimental-strip-types apps/aqua-fix/test/animals.test.ts
import assert from "node:assert/strict";
import { ANIMALS, AnimalTracker, labelAnimals, overrideAt, pickAnimal, stillStrength, type SubjectOverride } from "../src/engine/animals.ts";

const W = 256, H = 144, MW = 160, MH = 90;
/** Subject map + veto-ramped departure with elliptical animals: [cx, cy, rx, ry, weight, departure]. */
const scene = (animals: [number, number, number, number, number, number][]) => {
  const map = new Float32Array(W * H), dev = new Float32Array(W * H);
  for (const [cx, cy, rx, ry, w, d] of animals) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) { map[y * W + x] = w; dev[y * W + x] = d; }
    }
  }
  return { map, dev };
};
const at = (s: { width: number; data: Float32Array }, x: number, y: number) => s.data[(y * s.width + x) * 4];

// Two animals: a solid one (toned whole) and one whose body the per-pixel test would mostly drop (faded whole).
{
  const { map, dev } = scene([[60, 50, 30, 12, 1, 1], [190, 90, 30, 12, 1, 0.02]]);
  const am = labelAnimals(map, dev, W, H, MW, MH);
  assert.equal(am.list.length, 2);
  const s = stillStrength(am);
  assert.ok(at(s, Math.round((60 * MW) / W), Math.round((50 * MH) / H)) > 0.99, "solid animal toned whole");
  assert.ok(at(s, Math.round((190 * MW) / W), Math.round((90 * MH) / H)) < 0.01, "a mostly uncovered animal fades whole");
}

// Tracking: toned only once two analyses agree, eased in over time; a vanished animal fades out, never snaps.
{
  const tr = new AnimalTracker();
  const a = scene([[60, 50, 30, 12, 1, 1]]);
  tr.update(labelAnimals(a.map, a.dev, W, H, MW, MH), 0);
  tr.step(1 / 30);
  const cx = Math.round((60 * MW) / W), cy = Math.round((50 * MH) / H);
  assert.equal(at(tr.strength(0), cx, cy), 0, "first sighting is not toned");
  const b = scene([[64, 50, 30, 12, 1, 1]]);
  tr.update(labelAnimals(b.map, b.dev, W, H, MW, MH), 0.1);
  for (let i = 0; i < 3; i++) tr.step(1 / 30);
  assert.ok(at(tr.strength(0.1), cx + 3, cy) < 0.01, "one agreeing analysis is not enough");
  // Analyses keep agreeing (~0.4 s): it fades in.
  for (let k = 2; k <= 5; k++) { tr.update(labelAnimals(b.map, b.dev, W, H, MW, MH), 0.1 * k); for (let i = 0; i < 3; i++) tr.step(1 / 30); }
  const s1 = at(tr.strength(0.5), cx + 3, cy);
  assert.ok(s1 > 0.05 && s1 < 0.6, `fades in (${s1})`);
  for (let i = 0; i < 90; i++) tr.step(1 / 30);
  assert.ok(at(tr.strength(0.3), cx + 3, cy) > 0.9, "fully toned after a while");
  // Gone: fades out over tauDown.
  tr.update(labelAnimals(new Float32Array(W * H), new Float32Array(W * H), W, H, MW, MH), 0.6);
  tr.step(0.1);
  const s2 = at(tr.strength(0.7), cx + 3, cy);
  assert.ok(s2 > 0.5 && s2 < 0.95, `fades out (${s2})`);
}

// Lead: between analyses the animal's map moves along its own motion.
{
  const tr = new AnimalTracker();
  const f = (cx: number) => scene([[cx, 72, 20, 10, 1, 1]]);
  const a = f(80), b = f(100);
  tr.update(labelAnimals(a.map, a.dev, W, H, MW, MH), 0);
  const amB = labelAnimals(b.map, b.dev, W, H, MW, MH);
  tr.update(amB, 0.1); // 20 px (12.5 texels) per 0.1 s
  const fields = new Float32Array(MW * MH * 4), guide = new Float32Array(MW * MH * 4);
  for (let i = 0; i < MW * MH; i++) if (amB.labels[i]) fields[i * 4 + 1] = 1;
  const led = tr.lead(fields, guide, 0.15, () => [0, 0, 0]);
  assert.ok(led, "a moving animal leads");
  const row = 45;
  const right = (arr: Float32Array) => { let m = -1; for (let x = 0; x < MW; x++) if (arr[(row * MW + x) * 4 + 1] > 0.5) m = x; return m; };
  const shift = right(led!.fields) - right(fields);
  assert.ok(shift >= 4 && shift <= ANIMALS.leadMaxCells, `map moved ahead by ${shift} texels`);
}
// User corrections without a path yet (the track pass is running): bound at the tap's own time to the animal there
// and followed; exclude fades it out, include tones an animal the coverage test would leave alone and keeps seeding
// a point inside it; an include on empty water is a seed near its own time only.
{
  const tr = new AnimalTracker();
  const two = (dx: number) => scene([[60 + dx, 50, 30, 12, 1, 1], [190 + dx, 100, 30, 12, 1, 0.02]]);
  tr.setOverrides([
    { t: 0.1, u: 60 / W, v: 50 / H, action: "exclude" },
    { t: 0.1, u: 190 / W, v: 100 / H, action: "include" },
    { t: 0.1, u: 0.5, v: 0.05, action: "include" },
  ]);
  assert.deepEqual(tr.seeds(0.1).length, 2, "both includes seed at their tap time");
  for (let k = 0; k < 6; k++) {
    const s = two(2 * k);
    tr.update(labelAnimals(s.map, s.dev, W, H, MW, MH), 0.1 * k);
    for (let i = 0; i < 3; i++) tr.step(1 / 30);
  }
  for (let i = 0; i < 90; i++) tr.step(1 / 30);
  const st = tr.strength(0.5);
  const sel = tr.selection(0.5)!;
  assert.ok(at(st, Math.round((70 * MW) / W), Math.round((50 * MH) / H)) < 0.05, "excluded animal faded out");
  assert.ok(at(st, Math.round((200 * MW) / W), Math.round((100 * MH) / H)) > 0.9, "included animal toned despite coverage");
  assert.equal(sel.animals.filter((a) => a.override).length, 2, "both corrections bound and followed");
  const seeds = tr.seeds(0.5);
  assert.equal(seeds.length, 1, "the water seed has expired; the bound include seeds inside its animal");
  assert.ok(Math.abs(seeds[0].u * W - 200) < 8 && Math.abs(seeds[0].v * H - 100) < 6, `seed inside the included animal (${seeds[0].u * W}, ${seeds[0].v * H})`);
}
// overrideAt: a path is interpolated and holds a little past its ends; without a path only near the tap.
{
  const path = [{ t: 1, u: 0.2, v: 0.5, a: 0.05 }, { t: 2, u: 0.4, v: 0.5, a: 0.07 }];
  const o = { t: 1.5, u: 0.3, v: 0.5, action: "exclude" as const, path };
  const mid = overrideAt(o, 1.5)!;
  assert.ok(Math.abs(mid.u - 0.3) < 1e-9 && Math.abs(mid.a - 0.06) < 1e-9, "interpolated");
  assert.ok(overrideAt(o, 2.2), "holds just past the end");
  assert.equal(overrideAt(o, 2.5), null, "not beyond");
  assert.equal(overrideAt(o, 0.5), null, "not before");
  const bare = { t: 1.5, u: 0.3, v: 0.5, action: "exclude" as const };
  assert.ok(overrideAt(bare, 1.6) && !overrideAt(bare, 3), "a bare tap binds near its own time only");
}
// pickAnimal: a point inside the animal (a C-shaped animal's centroid is water), size-checked during a track pass.
{
  const map = new Float32Array(W * H), dev = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x - 128, y - 72);
    if (r > 30 && r < 45 && x < 150) { map[y * W + x] = 1; dev[y * W + x] = 1; } // a ring open on the right
  }
  const am = labelAnimals(map, dev, W, H, MW, MH);
  const p = pickAnimal(am, 90 / W, 72 / H)!;
  assert.ok(p, "found");
  const x = Math.floor(p.u * MW), y = Math.floor(p.v * MH);
  assert.ok(am.labels[y * MW + x] > 0, "the returned point is on the animal");
  assert.equal(pickAnimal(am, 90 / W, 72 / H, 3, am.list[0].area * 5), null, "a much smaller animal is not the same one");
  assert.equal(pickAnimal(am, 128 / W, 72 / H, 2), null, "the empty middle is not the animal");
}
// A followed correction holds wherever playback starts: a run that begins after the tap (a seek, a trimmed export)
// binds by the path; an animal that later crosses the tap's spot after the path ended is left alone.
{
  const path = [0, 0.5, 1, 1.5, 2].map((t) => ({ t, u: (60 + 40 * t) / W, v: 50 / H, a: 0.06 }));
  const ex: SubjectOverride = { t: 0.5, u: 80 / W, v: 50 / H, action: "exclude", path };
  const run = (t0: number) => {
    const tr = new AnimalTracker();
    tr.setOverrides([ex]);
    const s = scene([[60 + 40 * t0, 50, 30, 12, 1, 1]]);
    tr.update(labelAnimals(s.map, s.dev, W, H, MW, MH), t0);
    tr.snap();
    return tr.selection(t0)!.animals[0];
  };
  assert.equal(run(0).override, "exclude", "bound from the start of the clip (before the tap)");
  assert.equal(run(1.8).override, "exclude", "bound after a seek past the tap");
  assert.equal(run(1.8).strength, 0, "snapped frame: excluded at once");
  // Another animal at the tap's spot at t = 4 (path over): automatic.
  const tr = new AnimalTracker();
  tr.setOverrides([ex]);
  const s = scene([[80, 50, 30, 12, 1, 1]]);
  tr.update(labelAnimals(s.map, s.dev, W, H, MW, MH), 4);
  tr.snap();
  assert.equal(tr.selection(4)!.animals[0].override, undefined, "outside its path a correction binds nothing");
  // An include with a path seeds along it.
  const inc = new AnimalTracker();
  inc.setOverrides([{ ...ex, action: "include" }]);
  const sd = inc.seeds(1);
  assert.equal(sd.length, 1);
  assert.ok(Math.abs(sd[0].u - 100 / W) < 1e-9, "seed on the path at t");
}
// No longer open water: the animals fade out, never snap off.
{
  const tr = new AnimalTracker();
  const s = scene([[60, 50, 30, 12, 1, 1]]);
  const am = labelAnimals(s.map, s.dev, W, H, MW, MH);
  tr.update(am, 0);
  tr.snap();
  tr.fadeAll();
  tr.step(1 / 30);
  const cx = Math.round((60 * MW) / W), cy = Math.round((50 * MH) / H);
  const v = at(tr.strength(0.03), cx, cy);
  assert.ok(v > 0.8 && v < 1, `fading, not gone (${v})`);
  for (let i = 0; i < 90; i++) tr.step(1 / 30);
  assert.ok(at(tr.strength(3), cx, cy) < 0.01, "faded out");
}
// Whole or nothing: every texel of an animal carries one strength (no half-toned animal), whatever its parts'
// departure; an animal the shaders would tone only in part is faded as a whole.
{
  const { map, dev } = scene([[80, 70, 50, 20, 1, 1]]);
  // Its rear half departs only weakly (a lit flank the per-pixel test would drop): coverage ~0.5.
  for (let y = 0; y < H; y++) for (let x = 80; x < W; x++) if (map[y * W + x]) dev[y * W + x] = 0.02;
  const am = labelAnimals(map, dev, W, H, MW, MH);
  const s = stillStrength(am);
  const vals = new Set<number>();
  for (let i = 0; i < MW * MH; i++) if (am.labels[i]) vals.add(+s.data[i * 4].toFixed(4));
  assert.equal(vals.size, 1, "one strength per animal");
  assert.ok([...vals][0] < 0.05, "half-covered animal is not toned at all");
  const tr = new AnimalTracker();
  const full = scene([[80, 70, 50, 20, 1, 1]]);
  const amF = labelAnimals(full.map, full.dev, W, H, MW, MH);
  tr.update(amF, 0); tr.update(amF, 0.1);
  for (let i = 0; i < 20; i++) tr.step(1 / 30);
  const st = tr.strength(0.1);
  const mid = new Set<number>();
  for (let i = 0; i < MW * MH; i++) if (amF.labels[i]) mid.add(+st.data[i * 4].toFixed(4));
  assert.equal(mid.size, 1, "while fading in, the whole animal fades together");
}
// Paused frame: a tap binds at once (no further analysis), a second tap reverses it, clearing restores the
// automatic choice.
{
  const tr = new AnimalTracker();
  const s = scene([[60, 50, 30, 12, 1, 1]]);
  const am = labelAnimals(s.map, s.dev, W, H, MW, MH);
  tr.update(am, 1.0);
  tr.update(am, 1.07);
  tr.snap();
  const cx = Math.round((60 * MW) / W), cy = Math.round((50 * MH) / H);
  const ease = () => { for (let i = 0; i < 150; i++) tr.step(1 / 30); };
  ease();
  assert.ok(at(tr.strength(1.07), cx, cy) > 0.9, "toned automatically");
  const ex = { t: 1.2, u: 60 / W, v: 50 / H, action: "exclude" as const };
  tr.setOverrides([ex]);
  ease();
  assert.ok(at(tr.strength(1.07), cx, cy) < 0.05, "a tap on the paused frame excludes at once");
  tr.setOverrides([ex, { ...ex, action: "include" }]);
  ease();
  assert.ok(at(tr.strength(1.07), cx, cy) > 0.9, "the next tap includes it again (latest wins)");
  tr.setOverrides([ex]);
  ease();
  tr.setOverrides([]);
  ease();
  assert.ok(at(tr.strength(1.07), cx, cy) > 0.9, "reset: back to the automatic choice");
}
// An animal swimming at the camera grows fast (low IoU between analyses): containment keeps it the same toned animal
// instead of a new one that fades out while its replacement waits to be confirmed (a ghost trail and a blue gap).
{
  const tr = new AnimalTracker();
  const grow = (r: number) => scene([[128, 72, r * 2, r, 1, 1]]);
  for (let k = 0; k < 8; k++) {
    const g = grow(10 + 4 * k);
    tr.update(labelAnimals(g.map, g.dev, W, H, MW, MH), 0.1 * k);
    if (k === 0) tr.snap();
    for (let i = 0; i < 3; i++) tr.step(1 / 30);
  }
  const sel = tr.selection(0.7)!;
  assert.equal(sel.animals.length, 1, "one animal, not a chain of new ones");
  assert.ok(sel.animals[0].strength > 0.9, `still toned (${sel.animals[0].strength})`);
}
console.log("ok  animals");
