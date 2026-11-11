// Material consistency within a shot (anchor.ts, follow.ts) on a synthetic
// version of the user's 27 Oct clip: a tilt from an all-sand seabed to a frame
// half open blue water, with the camera's auto white balance warming as the
// water fills the frame. The same sand must keep its colour across the shot
// (the clip lock alone let it drift), and a hard cut must still re-lock fast.
//   node --experimental-strip-types apps/aqua-fix/test/drift.test.ts
import assert from "node:assert/strict";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { linearToSrgb } from "../src/engine/color.ts";
import { curveAt, shotCurve, SHOT, type ShotSample } from "../src/engine/follow.ts";
import { DEFAULT_SETTINGS } from "../src/engine/params.ts";
import { ClipSim } from "../eval/clip-sim.ts";
import { analysisSlot } from "../src/engine/lock.ts";
import { deltaE00, srgb8ToLab } from "../eval/colour-metrics.ts";

const W = ANALYSIS_W, H = ANALYSIS_H, FPS = 10;
const DEBUG = process.env.DRIFT_DEBUG === "1";
function hash(x: number, y: number, s: number): number { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }

type Scene = { trans: number[]; veil: number[]; water: number[]; sand: number[]; weed: number[] };
const BLUE: Scene = { trans: [0.22, 0.7, 0.8], veil: [0.015, 0.16, 0.3], water: [0.02, 0.2, 0.42], sand: [0.6, 0.56, 0.48], weed: [0.14, 0.15, 0.05] };
const GREEN: Scene = { trans: [0.3, 0.75, 0.45], veil: [0.03, 0.22, 0.12], water: [0.04, 0.26, 0.15], sand: [0.6, 0.56, 0.48], weed: [0.14, 0.15, 0.05] };

/**
 * One upright thumbnail: seabed below a horizon at `horizon` (share of the
 * height that is open water), texture scrolling with the tilt, the camera's
 * white-balance gain `cam` on everything. Returns the frame and its sand mask.
 */
function frame(sc: Scene, horizon: number, scroll: number, cam: number[]): { px: Uint8ClampedArray; sand: Uint8Array } {
  const px = new Uint8ClampedArray(W * H * 4);
  const sand = new Uint8Array(W * H);
  const hy = horizon * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c: number[];
      if (y < hy) {
        // Open water: smooth, brighter toward the surface.
        const k = 1 + 0.25 * (1 - y / Math.max(1, hy));
        c = sc.water.map((v) => v * k);
      } else {
        // Seabed: range grows toward the horizon; sand grain + weed patches.
        const d = (y - hy) / Math.max(1, H - hy);
        const z = 0.4 + 1.6 * (1 - d);
        const sy = Math.floor(y + scroll);
        const weed = hash(Math.floor(x / 14), Math.floor(sy / 14), 3) < 0.22;
        const grain = 0.82 + 0.36 * hash(x, sy, 1);
        const m = (weed ? sc.weed : sc.sand).map((v) => v * grain);
        c = m.map((v, ch) => v * Math.pow(sc.trans[ch], z) + sc.veil[ch] * (1 - Math.exp(-0.9 * z)));
        if (!weed && d > 0.35) sand[i] = 1;
      }
      for (let ch = 0; ch < 3; ch++) px[i * 4 + ch] = Math.round(linearToSrgb(Math.min(1, Math.max(0, c[ch] * cam[ch]))) * 255);
      px[i * 4 + 3] = 255;
    }
  }
  return { px, sand };
}

/** The shot: 0 → 55 % open water over 4 s, camera warming (R up, B down) with the water share; then a cut to green water. */
function clip(withCut: boolean) {
  const frames: { px: Uint8ClampedArray; sand: Uint8Array }[] = [];
  const shot = 4 * FPS;
  for (let f = 0; f < shot; f++) {
    const s = Math.min(1, f / (shot - 1));
    const horizon = 0.05 + 0.5 * s;
    const cam = [1 + 0.3 * s, 1, 1 - 0.15 * s];
    frames.push(frame(BLUE, horizon, f * 1.5, cam));
  }
  if (withCut) for (let f = 0; f < 2 * FPS; f++) frames.push(frame(GREEN, 0.1, f * 1.5, [1, 1, 1]));
  return { frames, shot };
}

function sandColours(sim: ClipSim, frames: { px: Uint8ClampedArray; sand: Uint8Array }[], every = 3, from = 0) {
  const out: { f: number; lab: [number, number, number] }[] = [];
  for (let f = 0; f < frames.length; f++) {
    sim.step(f, frames.map((x) => x.px));
    if (f < from || f % every) continue;
    const st = sim.state();
    const g = applyGrade({ params: st.params, settings: DEFAULT_SETTINGS, depth: st.depth, clahe: st.clahe }, frames[f].px, W, H);
    let r = 0, gg = 0, b = 0, n = 0;
    const m = frames[f].sand;
    for (let i = 0; i < m.length; i++) if (m[i]) { r += g[i * 4]; gg += g[i * 4 + 1]; b += g[i * 4 + 2]; n++; }
    out.push({ f, lab: srgb8ToLab(r / n, gg / n, b / n) });
  }
  return out;
}

/** Colour-only ΔE00 (lightness equalised): the camera's exposure is not what this guards. */
const dAb = (a: number[], b: number[]) => deltaE00(a, [a[0], b[1], b[2]]);

// 1. Within the shot the sand keeps its colour; the plain clip lock lets the camera's drift through.
{
  const { frames, shot } = clip(false);
  const run = (follow: boolean) => {
    process.env.SIM_NOFOLLOW = follow ? "" : "1";
    const sim = new ClipSim("export", FPS, 1);
    sim.profile(frames.map((x) => x.px));
    const s = sandColours(sim, frames.slice(0, shot));
    let max = 0;
    for (const x of s) max = Math.max(max, dAb(s[0].lab, x.lab));
    if (DEBUG) {
      console.log(`follow=${follow}`, s.map((x) => `${x.f}:${x.lab.map((v) => v.toFixed(1)).join("/")}`).join(" "));
      console.log(sim.paramLog.filter((_, i) => i % 6 === 1 || i === 0).join("\n"));
    }
    return { max, s };
  };
  const old = run(false);
  const now = run(true);
  console.log(`sand colour drift over the tilt: lock only ${old.max.toFixed(2)} ΔE00, with the anchor ${now.max.toFixed(2)} ΔE00`);
  assert.ok(old.max > 4, `the synthetic camera drift must show with the lock alone (got ${old.max.toFixed(2)})`);
  // What is left is the near/far spread of the sand changing with the framing (one balance cannot hold both); the
  // camera drift itself is gone. Lock alone: ~11 ΔE00 here; anchored: ~3.7.
  assert.ok(now.max <= 4 && now.max <= 0.4 * old.max, `sand drifted ${now.max.toFixed(2)} ΔE00 within one shot (lock alone ${old.max.toFixed(2)})`);
  // No pulse: between samples 0.3 s apart the sand moves less than a just-noticeable step.
  for (let i = 1; i < now.s.length; i++) {
    const d = dAb(now.s[i - 1].lab, now.s[i].lab);
    assert.ok(d <= 1.2, `sand stepped ${d.toFixed(2)} ΔE00 in 0.3 s at frame ${now.s[i].f}`);
  }
  // Neutral-ish sand, never pink: Lab a* small, b* a touch warm at most.
  for (const x of now.s) {
    assert.ok(Math.abs(x.lab[1]) < 6, `sand a* ${x.lab[1].toFixed(1)}`);
    assert.ok(x.lab[2] > -8 && x.lab[2] < 12, `sand b* ${x.lab[2].toFixed(1)}`);
  }
  console.log("ok  sand holds its colour through the tilt");
}

// 2. A hard cut still re-locks quickly: the first frames after the cut sit near where the new scene settles.
{
  process.env.SIM_NOFOLLOW = "";
  const { frames, shot } = clip(true);
  const sim = new ClipSim("export", FPS, 1);
  const info = sim.profile(frames.map((x) => x.px));
  const s = sandColours(sim, frames, 1, shot);
  assert.ok(sim.cuts.some((t) => Math.abs(t - shot / FPS) < 0.15), `the cut at ${(shot / FPS).toFixed(2)} s was not seen (${sim.cuts.join(", ")}; ${info})`);
  const after = s.filter((x) => x.f >= shot);
  const settled = after[after.length - 1].lab;
  const early = after.filter((x) => x.f <= shot + Math.round(0.2 * FPS));
  for (const x of early) {
    const d = dAb(settled, x.lab);
    assert.ok(d <= 3, `0.2 s after the cut the sand is still ${d.toFixed(2)} ΔE00 from where it settles`);
  }
  console.log("ok  a hard cut re-locks within 0.2 s");
}

// 3. The shot's balance is frozen unless its frames move one way (follow.ts shotCurve).
{
  const S = (rows: [number, number, number, number?][]): ShotSample[] => rows.map(([t, r, b, w]) => ({ t, log: [r, b], w: w ?? 1 }));
  const swing = (c: ReturnType<typeof shotCurve>) => { let lo = Infinity, hi = -Infinity; for (let t = 0; t <= 8; t += 0.05) { const v = curveAt(c, t)[0]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
  assert.equal(shotCurve([]), null, "no trusted frame: the plain lock");
  assert.deepEqual(curveAt(null, 3), [0, 0]);
  // Estimator noise around one value: one constant, the weighted median; an untrusted outlier counts for nothing.
  const noise = shotCurve(S([[0.5, 0.05, -0.02], [1.5, -0.03, 0.01], [2.5, 0.04, 0], [3.5, -0.02, 0.02], [4.5, 0.03, -0.01], [5.5, 0.45, -0.4, 0], [6.5, 0.0, 0.01]]));
  assert.equal(noise!.t.length, 1, "noise must freeze the shot");
  assert.equal(swing(noise), 0);
  assert.ok(Math.abs(curveAt(noise, 0)[0]) < 0.05);
  // The review's whale shark: the follow went +0.47 → −0.47 → ~0 within 8 s. Frames that disagree are no evidence: frozen, near the plain lock.
  const shark = shotCurve(S([[0.6, 0.4, 0.04], [1.6, -0.4, 0.24], [2.6, -0.42, 0.29], [3.5, -0.4, 0.26], [4.5, -0.02, 0.01], [5.4, 0.01, 0.03], [6.4, -0.27, 0.13], [7.4, -0.13, 0.06]]));
  assert.equal(swing(shark), 0, "a balance that swings both ways is noise");
  assert.ok(Math.abs(curveAt(shark, 4)[0]) < 0.15, `disagreeing frames back the offset off toward the lock (${curveAt(shark, 4)[0].toFixed(2)})`);
  // A step (a diver swims up to the lens): a change of subject, not of the light. Frozen.
  const step = shotCurve(S([[0.6, -0.25, 0.2], [1.6, -0.21, 0.24], [2.6, -0.19, 0.15], [3.5, 0.26, -0.14], [4.5, 0.23, -0.2], [5.5, 0.24, -0.2]]));
  assert.equal(swing(step), 0, "a step is not a trend");
  // A real change (the camera warming through a tilt): one way, slowly, never back.
  const tilt = shotCurve(S([[0.5, -0.14, 0.07], [1.5, -0.06, 0.03], [2.5, 0.01, 0.0], [3.5, -0.02, 0.01], [4.5, 0.08, -0.04], [5.5, 0.15, -0.08], [6.5, 0.14, -0.08]]));
  assert.ok(tilt!.t.length > 1, "a one-way change must be followed");
  let prev = curveAt(tilt, 0)[0];
  for (let t = 0.05; t <= 8; t += 0.05) {
    const v = curveAt(tilt, t)[0];
    assert.ok(v >= prev - 1e-9, "the curve never swings back");
    assert.ok(v - prev <= SHOT.maxRate * 0.05 + 1e-9, `the curve moves at most ${SHOT.maxRate} log/s`);
    prev = v;
  }
  assert.ok(swing(tilt) > 0.2 && swing(tilt) < 0.32);
  // Too small to move for, too few well-anchored frames, or frames that barely hold the anchor: frozen.
  assert.equal(swing(shotCurve(S([[0.5, 0], [1.5, 0.02], [2.5, 0.04], [3.5, 0.06], [4.5, 0.08]].map((x) => [x[0], x[1], 0] as [number, number, number])))), 0);
  assert.equal(swing(shotCurve(S([[0.5, -0.2, 0], [2.5, 0, 0], [4.5, 0.2, 0]]))), 0);
  assert.equal(swing(shotCurve(S([[0.5, -0.2, 0, 0.3], [1.5, -0.1, 0, 0.3], [2.5, 0, 0, 0.3], [3.5, 0.1, 0, 0.3], [4.5, 0.2, 0, 0.3]]))), 0);
  // A function of clip time alone: any order of asking gives the same answer.
  assert.deepEqual(curveAt(tilt, 3.3), curveAt(tilt, 3.3));
  console.log("ok  shot balance: frozen on noise, steps and disagreement; slow and one-way on a real change");
}

// 4. Determinism on clip time: the export analyses one frame per analysis slot of the clip and waits for it, so
// how fast the worker runs cannot change the grade (two exports of one clip used to differ by up to 8.7 ΔE00), and
// the preview analyses the same frames.
{
  process.env.SIM_NOFOLLOW = "";
  assert.equal(analysisSlot(0), 0);
  assert.equal(analysisSlot(0.0999), 0);
  assert.equal(analysisSlot(0.1), 1);
  assert.equal(analysisSlot(3 * (1 / 30)), 1, "frame 3 of a 30 fps clip opens slot 1 (float time)");
  const fps = 30, n = 45;
  const px = Array.from({ length: n }, (_, f) => frame(BLUE, 0.05 + 0.3 * (f / n), f * 1.5, [1 + 0.2 * (f / n), 1, 1]).px);
  const run = (mode: "export" | "preview", latency: number) => {
    const sim = new ClipSim(mode, fps, latency);
    sim.profile(px);
    const wb: string[] = [];
    for (let f = 0; f < n; f++) { sim.step(f, px); wb.push(sim.state().params.wb.map((x) => x.toFixed(6)).join(",")); }
    return { wb, analysed: sim.paramLog.slice(1).map((r) => +r.split(",")[0]) };
  };
  const a = run("export", 1), b = run("export", 4);
  assert.deepEqual(a.wb, b.wb, "the export grade depends on the worker's speed");
  const p = run("preview", 1);
  assert.deepEqual(p.analysed, a.analysed, "preview and export analyse different frames");
  console.log(`ok  clip-time analysis: ${a.analysed.length} analyses on the same frames in preview and export; export independent of worker speed`);
}
