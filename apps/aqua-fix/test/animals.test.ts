// Per-animal Subject pop (labelling, whole-or-nothing, tracking, lead).
//   node --experimental-strip-types apps/aqua-fix/test/animals.test.ts
import assert from "node:assert/strict";
import { ANIMALS, AnimalTracker, labelAnimals, stillStrength } from "../src/engine/animals.ts";

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
  for (let i = 0; i < 6; i++) tr.step(1 / 30);
  const s1 = at(tr.strength(0.3), cx + 3, cy);
  assert.ok(s1 > 0.05 && s1 < 0.5, `fades in (${s1})`);
  for (let i = 0; i < 90; i++) tr.step(1 / 30);
  assert.ok(at(tr.strength(0.3), cx + 3, cy) > 0.9, "fully toned after a while");
  // Gone: fades out over tauDown.
  tr.update(labelAnimals(new Float32Array(W * H), new Float32Array(W * H), W, H, MW, MH), 0.4);
  tr.step(0.1);
  const s2 = at(tr.strength(0.5), cx + 3, cy);
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
console.log("ok  animals");
