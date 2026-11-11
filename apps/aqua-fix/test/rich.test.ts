// Saturation by hue in the default look (RICH_LOOK; rides on the Vivid amount).
//   node --experimental-strip-types apps/aqua-fix/test/rich.test.ts
import assert from "node:assert/strict";
import { richLook } from "../src/engine/apply.ts";
import { RICH_LOOK } from "../src/engine/params.ts";

const D = Math.PI / 180, R = RICH_LOOK;
const ab = (C: number, hDeg: number): [number, number] => [C * Math.cos(hDeg * D), C * Math.sin(hDeg * D)];
const hueOf = (x: readonly number[]) => ((Math.atan2(x[1], x[0]) / D) % 360 + 360) % 360;
const chromaOf = (x: readonly number[]) => Math.hypot(x[0], x[1]);
const run = (L: number, C: number, h: number, v = 1) => richLook(L, ...ab(C, h), v);

// 1. Off without Vivid (Natural, and wherever Vivid's gate stands down: graded, topside, night).
{
  const x = ab(0.06, 200);
  assert.deepEqual(richLook(0.5, x[0], x[1], 0), x);
  console.log("ok  off without Vivid");
}

// 2. Neutrals stay neutral: whites, sand, silver (chroma under cLo) are untouched, faint casts hardly move, and the
//    deep shadows and the highlights take no gain.
{
  for (let h = 0; h < 360; h += 10) {
    const o = run(0.7, R.cLo * 0.99, h);
    assert.ok(Math.abs(chromaOf(o) - R.cLo * 0.99) < 1e-9, `neutral C at ${h}°`);
    assert.ok(chromaOf(run(0.7, 0.015, h)) < 0.015 * 1.2, `faint cast at ${h}° → ${chromaOf(run(0.7, 0.015, h))}`);
    assert.ok(chromaOf(run(R.lLo, 0.06, h)) <= 0.06 + 1e-9 && chromaOf(run(0.99, 0.06, h)) <= 0.06 + 1e-9, `shadow / highlight at ${h}°`);
  }
  console.log("ok  neutrals, deep shadows and highlights keep their chroma");
}

// 3. Richer, never duller, never neon: the gain is ≥ 1, about 1.3–1.7× on a mid chroma, fades as the colour is
//    already rich, and the chroma order is kept at every hue (monotone in C).
{
  const mid = chromaOf(run(0.45, 0.05, 140)) / 0.05, rich = chromaOf(run(0.45, 0.2, 140)) / 0.2, water = chromaOf(run(0.45, 0.05, 250)) / 0.05;
  assert.ok(mid > 1.2 && mid < 1.7, `mid green gain ${mid.toFixed(2)}`);
  assert.ok(rich < 1.2 && rich >= 1, `rich green gain ${rich.toFixed(2)}`);
  // Water hues take the smaller share (their chroma is the water-hue map's): blue-cast sand is not turned into blue speckle.
  assert.ok(water > 1.05 && water < 1 + (mid - 1) * 0.6, `water gain ${water.toFixed(2)} vs ${mid.toFixed(2)}`);
  for (let h = 0; h < 360; h += 5) for (const L of [0.25, 0.45, 0.7]) {
    let prev = 0;
    for (let C = 0.002; C < 0.3; C += 0.002) {
      const c = chromaOf(run(L, C, h));
      assert.ok(c >= C - 1e-12, `chroma fell at ${h}° C ${C}`);
      assert.ok(c > prev, `chroma order at ${h}° L ${L} C ${C.toFixed(3)}`);
      prev = c;
    }
  }
  console.log(`ok  gain ${mid.toFixed(2)}× mid, ${rich.toFixed(2)}× rich, monotone`);
}

// 4. Warm subjects take more than the rest (orange fish, jellyfish, coral, skin) and keep their hue: skin is richer,
//    not more orange. Magenta takes nothing (the look never adds pink), yellow-green vegetation only the base gain.
{
  const base = chromaOf(run(0.5, 0.06, 150)) / 0.06;
  for (const h of [45, 60, 75]) {
    const o = run(0.6, 0.06, h);
    assert.ok(chromaOf(o) / 0.06 > base + 0.1, `warm ${h}° gain ${(chromaOf(o) / 0.06).toFixed(2)} vs ${base.toFixed(2)}`);
    assert.ok(Math.abs(hueOf(o) - h) < 1e-6, `warm hue ${h}° moved`);
    assert.ok(chromaOf(o) < 0.12, `skin-level chroma 0.06 → ${chromaOf(o).toFixed(3)}`);
  }
  assert.ok(Math.abs(chromaOf(run(0.5, 0.08, 330)) - 0.08) < 1e-9, "magenta gained");
  assert.ok(Math.abs(chromaOf(run(0.5, 0.06, 125)) / 0.06 - base) < 0.02, "vegetation is not a warm subject");
  console.log("ok  warm subjects richer at their own hue; magenta none");
}

// 5. Hue is never touched: the look only scales the chroma.
{
  for (let h = 0; h < 360; h += 7) for (const C of [0.02, 0.06, 0.15]) assert.ok(Math.abs(((hueOf(run(0.45, C, h)) - h + 540) % 360) - 180) < 1e-6, `hue ${h}° moved`);
  console.log("ok  hue kept");
}

// 6. Smooth: neighbouring colours stay neighbours (bounded gain on a small chroma step anywhere), so noise is not
//    turned into speckle and no edge appears that the picture does not have.
{
  let worst = 0, s = 12345;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) | 0) >>> 0) / 4294967296;
  for (let i = 0; i < 40000; i++) {
    const L = 0.05 + 0.9 * rnd(), x = ab(0.2 * rnd(), 360 * rnd()), y: [number, number] = [x[0] + 0.002 * (rnd() - 0.5), x[1] + 0.002 * (rnd() - 0.5)];
    const p = richLook(L, x[0], x[1], 1), q = richLook(L, y[0], y[1], 1);
    worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1]) / Math.max(1e-9, Math.hypot(x[0] - y[0], x[1] - y[1])));
  }
  assert.ok(worst < 2.5, `chroma step gain ${worst.toFixed(2)}`);
  console.log(`ok  smooth (step gain ${worst.toFixed(2)}×)`);
}
