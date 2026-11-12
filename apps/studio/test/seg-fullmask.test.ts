// AI subject masks that are full, smooth-edged and steady (owner's ray clip, 12 Nov: "the marking is not marking the
// ray correctly ... on some frames and is not full"): the sub-pixel feather, the fill where the flow cannot follow,
// the track's hysteresis, the motion-compensated alpha average, the quality check at the frame's border and the
// re-check's water test.   node --experimental-strip-types apps/studio/test/seg-fullmask.test.ts
import assert from "node:assert/strict";
import { area, bigParts, cellLab, centroid, iou, rleEncode, sdfFeather, shiftMap, signedDistance, waterContrast } from "../src/pipeline/seg/mask.ts";
import { confWeight, fillInterval, HOLD, lockStep, newLock, remap, SEG, straightCarry, type Keyframe } from "../src/pipeline/seg/track.ts";
import { averageAlpha, maskStats, SegLive } from "../src/pipeline/seg/studio-seg.ts";

// ---------------------------------------------------------------- the feather follows the soft mask, not the grid's stairs
{
  // A soft mask with a slanted straight edge (the guided filter's output looks like this: a ramp a px wide).
  const w = 96, h = 64, nx = Math.cos(0.42), ny = Math.sin(0.42), m = new Float32Array(w * h), truth = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = (x - 48) * nx + (y - 32) * ny; // > 0 outside
    truth[y * w + x] = -d;
    m[y * w + x] = Math.min(1, Math.max(0, 0.5 - d / 1.5));
  }
  const rms = (ss: number) => {
    const s = signedDistance(m, w, h, ss);
    let e = 0, n = 0;
    for (let y = 8; y < h - 8; y++) for (let x = 8; x < w - 8; x++) if (Math.abs(truth[y * w + x]) < 3) { e += (s[y * w + x] - truth[y * w + x]) ** 2; n++; }
    return Math.sqrt(e / n);
  };
  const e1 = rms(1), e2 = rms(2);
  assert.ok(e2 < 0.6 * e1 && e2 < 0.2, `the distance to the soft contour: ${e2.toFixed(3)} mask px rms, the binary mask's ${e1.toFixed(3)}`);
  // The contour the grade reads back (bilinear between texels) wobbles less along the edge: the stairs are gone.
  const wobble = (ss: number) => {
    const a = sdfFeather(m, w, h, SEG.alphaR, ss);
    const pos: number[] = [];
    for (let y = 10; y < h - 10; y++) {
      for (let x = 1; x < w; x++) {
        const p = a[y * w + x - 1], q = a[y * w + x];
        if (p > 0.5 && q <= 0.5) { pos.push(x - 1 + (p - 0.5) / (p - q) - (48 - (y - 32) * ny / nx)); break; }
      }
    }
    const mean = pos.reduce((s, v) => s + v, 0) / pos.length;
    return Math.sqrt(pos.reduce((s, v) => s + (v - mean) ** 2, 0) / pos.length);
  };
  const w1 = wobble(1), w2 = wobble(2);
  assert.ok(w2 < 0.6 * w1, `the contour wobbles ${w2.toFixed(3)} px along a straight edge (stairs: ${w1.toFixed(3)})`);
  // A hard binary mask reads as before: half a px either side of the texel boundary.
  const hard = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 40; x < w; x++) hard[y * w + x] = 1;
  const sh = signedDistance(hard, w, h);
  assert.ok(Math.abs(sh[20 * w + 40] - 0.5) < 1e-6 && Math.abs(sh[20 * w + 39] + 0.5) < 1e-6 && Math.abs(sh[20 * w + 45] - 5.5) < 1e-6);
  console.log(`full masks: feather on the soft contour → ${e2.toFixed(3)} px rms (binary ${e1.toFixed(3)}), contour wobble ${w2.toFixed(3)} px (stairs ${w1.toFixed(3)}): ok`);
}

// ---------------------------------------------------------------- the fill where the flow has nothing to hold on to
const blob = (w: number, h: number, cx: number, cy: number, rx = 9, ry = 3) => {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m[y * w + x] = 1;
  return m;
};
{
  // A small subject on featureless water, 24 mask px further on at the next keyframe (a far ray while the camera
  // pans): the luma says nothing, so the flow carries each keyframe's mask nowhere.
  const w = 120, h = 60, flat = () => new Float32Array(w * h).fill(0.4);
  const key = (t: number, x: number): Keyframe => ({ t, inc: blob(w, h, x, 30), exc: null, luma: flat(), conf: 1, reprompts: 0, score: 5 });
  const a = key(0, 30), b = key(0.25, 54);
  const times = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => +(i / 30).toFixed(6));
  // Each frame its own luma array (as the session reads them), all flat.
  const lumas = times.map((t) => (t === 0 ? a.luma : flat()));
  const out = fillInterval(a, b, times, lumas, w, h, false);
  const A0 = area(a.inc);
  const areas = out.map((f) => area(remap(f.inc))), cs = out.map((f) => centroid(remap(f.inc), w, h)!);
  for (let j = 0; j < times.length; j++) {
    const want = 30 + 24 * (times[j] / 0.25);
    assert.ok(areas[j] > 0.85 * A0 && areas[j] < 1.15 * A0, `frame ${j}: the mask keeps its size (${areas[j]} of ${A0} px)`);
    assert.ok(Math.abs(cs[j].x - want) < 1 && Math.abs(cs[j].y - 30) < 0.5, `frame ${j}: on the line between the keyframes (${cs[j].x.toFixed(1)} vs ${want.toFixed(1)})`);
    assert.ok(iou(remap(out[j].inc), blob(w, h, want, 30)) > 0.7, `frame ${j}: the subject's own shape`);
  }
  // What the plain cross-fade of two masks left where they were comes to (the old fill): two half-weight ghosts.
  const mid = new Float32Array(w * h);
  for (let i = 0; i < mid.length; i++) mid[i] = 0.5 * a.inc[i] + 0.5 * b.inc[i];
  const ghost = area(remap(mid));
  assert.ok(ghost < 0.2 * A0, `the cross-fade alone leaves ${ghost} px of ${A0} halfway`);
  let pump = 0;
  for (let j = 1; j < areas.length; j++) pump = Math.max(pump, Math.abs(areas[j] - areas[j - 1]) / A0);
  assert.ok(pump < 0.1, `no size pumping between frames (max ${(pump * 100).toFixed(0)}%)`);
  // The decision itself.
  const far = straightCarry(a.inc, b.inc, a.inc, b.inc, 7 / 7.5, 0, w, h)!;
  assert.ok(far.fwd && far.bwd && Math.abs(far.dx - 24) < 0.01 && Math.abs(far.dy) < 0.01);
  // The flow did carry it (the masks arrive where the other keyframe has them): the flow's fill is kept.
  assert.equal(straightCarry(a.inc, b.inc, shiftMap(a.inc, w, h, 24, 0), shiftMap(b.inc, w, h, -24, 0), 1, 0, w, h), null);
  // Hardly any motion, no subject at one end, or two subjects (which is which is not known): the flow's fill.
  assert.equal(straightCarry(a.inc, shiftMap(a.inc, w, h, 1, 0), a.inc, a.inc, 1, 0, w, h), null);
  assert.equal(straightCarry(a.inc, new Float32Array(w * h), a.inc, a.inc, 1, 0, w, h), null);
  const two = blob(w, h, 30, 12);
  for (let i = 0; i < two.length; i++) two[i] = Math.max(two[i], blob(w, h, 80, 45)[i]);
  assert.equal(bigParts(two, w, h), 2);
  assert.equal(straightCarry(two, shiftMap(two, w, h, 20, 0), two, two, 1, 0, w, h), null);
  // A subject leaving the frame shrinks between its keyframes: the smaller mask the flow carried is no failure.
  const leaving = blob(w, h, 112, 30), gone = shiftMap(leaving, w, h, 12, 0);
  assert.equal(straightCarry(leaving, gone, gone, leaving, 1, 0, w, h), null);
  console.log(`full masks: fill without flow → mask ${Math.min(...areas)}..${Math.max(...areas)} px of ${A0} on the line (cross-fade alone: ${ghost} px halfway): ok`);
}

// ---------------------------------------------------------------- hysteresis: a locked track is held, and re-checked
{
  const fps = 4, L = newLock();
  const good = { conf: 0.9, score: 8, area: 400 };
  for (let k = 0; k < HOLD.lockSteps - 1; k++) { lockStep(L, good, fps); assert.equal(L.locked, false); }
  // Not locked yet: a dip is what it is.
  assert.deepEqual(lockStep(newLock(), { conf: 0.1, score: 8, area: 400 }, fps), { conf: 0.1, recheck: false, held: false });
  lockStep(L, good, fps);
  assert.equal(L.locked, true, `locked after ${HOLD.lockSteps} sure keyframes`);
  // The flow lost the far subject: the raw confidence is 0, the model still sees it at its size → held, re-checked once.
  const dip = { conf: 0, score: 6, area: 380 };
  const d1 = lockStep(L, dip, fps);
  assert.deepEqual(d1, { conf: HOLD.floor, recheck: true, held: true });
  assert.ok(HOLD.floor > SEG.confHi, "a held keyframe weighs in full");
  const d2 = lockStep(L, dip, fps);
  assert.deepEqual(d2, { conf: HOLD.floor, recheck: false, held: true }, "re-checks are spaced");
  // The weight over a held stretch stays 1 where the raw confidences would have faded it out.
  const K = (c: number[]) => c.map((conf, i) => ({ t: i / fps, conf }));
  assert.equal(confWeight(K([0.9, 0.9, 0.9, HOLD.floor, HOLD.floor, HOLD.floor, HOLD.floor, 0.9]), 1.25), 1);
  assert.ok(confWeight(K([0.9, 0.9, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9]), 1.5) < 0.2, "(unheld, the same dip turns the pop off)");
  // Sure again: the lock goes on, the next dip is re-checked at once.
  lockStep(L, good, fps);
  assert.equal(lockStep(L, dip, fps).recheck, true);
  // The model says nothing is there (score ≤ 0, or no mask): never held.
  assert.deepEqual(lockStep(L, { conf: 0, score: -3, area: 0 }, fps), { conf: 0, recheck: false, held: false });
  assert.equal(lockStep(L, { conf: 0, score: 4, area: 0 }, fps).held, false);
  // The mask shrank to a fragment (under areaLo of the locked size): not held, and re-checked when its turn comes.
  const L2 = newLock();
  for (let k = 0; k < HOLD.lockSteps; k++) lockStep(L2, good, fps);
  const frag = lockStep(L2, { conf: 0.9, score: 8, area: 100 }, fps);
  assert.deepEqual(frag, { conf: 0.9, recheck: true, held: false }, "a fragment with a fine score is still re-checked");
  // A mask that lost part of the body (under dropShare) with a good confidence: held at its own confidence, re-checked.
  const L3 = newLock();
  for (let k = 0; k < HOLD.lockSteps; k++) lockStep(L3, good, fps);
  assert.deepEqual(lockStep(L3, { conf: 0.9, score: 8, area: 200 }, fps), { conf: 0.9, recheck: true, held: true });
  // The lock is given up after missS without a sure keyframe: from then on the raw confidence again.
  const L4 = newLock();
  for (let k = 0; k < HOLD.lockSteps; k++) lockStep(L4, good, fps);
  let heldFor = 0, rechecks = 0;
  for (let k = 0; k < 20; k++) { const r = lockStep(L4, dip, fps); if (r.held) heldFor++; if (r.recheck) rechecks++; }
  assert.equal(heldFor, HOLD.missS * fps, `held for ${HOLD.missS} s, then let go`);
  assert.equal(L4.locked, false);
  assert.equal(rechecks, Math.ceil((HOLD.missS * fps) / HOLD.recheckEvery), "a re-check every few keyframes while held");
  // A subject swimming away shrinks steadily: the locked size follows, the lock holds.
  const L5 = newLock();
  let a5 = 400;
  for (let k = 0; k < 40; k++) { const r = lockStep(L5, { conf: 0.9, score: 8, area: a5 }, fps); assert.equal(r.recheck, false); a5 *= 0.95; }
  assert.ok(L5.locked && L5.area < 100);
  console.log("full masks: hysteresis → locked after 3 sure keyframes, held at full weight through a dip, re-checked, let go after 2 s, never held when the model sees nothing: ok");
}

// ---------------------------------------------------------------- the alpha average does not smear a moving subject
{
  const w = 120, h = 60, R = 2;
  const u8 = (m: Float32Array) => Uint8Array.from(sdfFeather(m, w, h, SEG.alphaR), (v) => Math.round(255 * v));
  // A far ray 6 px thick moving 4.7 mask px a frame, across its length and its thickness (the camera pans).
  const maps = [-2, -1, 0, 1, 2].map((d) => u8(blob(w, h, 60 + 4 * d, 30 + 2.5 * d, 12, 3)));
  const stats = maps.map((a) => maskStats(a, w, h));
  const own = maps[R], comp = averageAlpha(maps, stats, R, w, h), plain = averageAlpha(maps, [], R, w, h);
  const inside = (a: ArrayLike<number>, k = 1) => { let s = 0, n = 0; for (let i = 0; i < own.length; i++) if (own[i] > 127) { s += a[i] * k; n++; } return s / n; };
  const areaOf = (a: Float32Array) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] > 0.5) n++; return n; };
  const A = stats[R].area;
  assert.ok(Math.abs(inside(comp) - inside(own, 1 / 255)) < 0.03 && Math.abs(areaOf(comp) - A) < 0.08 * A, `moved onto the frame's subject first: the mask stays whole (${areaOf(comp)} of ${A} px, mean alpha ${inside(comp).toFixed(2)})`);
  assert.ok(areaOf(plain) < 0.8 * A && inside(plain) < inside(comp) - 0.05, `averaged where they lie, it thins out (${areaOf(plain)} px, mean alpha ${inside(plain).toFixed(2)})`);
  // A mask that moves as a whole by a px is taken as motion: the frame's own mask (what the average smooths is the
  // contour's frame-to-frame noise, which is left in place).
  const wob = [0, 1, 0, -1, 0].map((d) => u8(blob(w, h, 60, 30 + d, 12, 5)));
  const ws = wob.map((a) => maskStats(a, w, h));
  const avg = averageAlpha(wob, ws, R, w, h);
  let diff = 0;
  for (let i = 0; i < avg.length; i++) diff = Math.max(diff, Math.abs(avg[i] - wob[R][i] / 255));
  assert.ok(diff < 0.05, "moved as a whole: its own mask");
  // Another subject far off in a neighbour frame is not dragged onto this one.
  const other = [u8(blob(w, h, 20, 15)), u8(blob(w, h, 20, 15)), u8(blob(w, h, 95, 45)), u8(blob(w, h, 95, 45)), u8(blob(w, h, 95, 45))];
  const os = other.map((a) => maskStats(a, w, h));
  const ov = averageAlpha(other, os, R, w, h);
  assert.ok(ov[15 * w + 20] > 0.15, "a mask too far away stays where it is");
  // SegLive.at uses it.
  const qw = Math.ceil(w / 4), qh = Math.ceil(h / 4), n = 9;
  const live = new SegLive({ mw: w, mh: h, i0: 0, n });
  live.put(Array.from({ length: n }, (_, i) => ({ i, alpha: rleEncode(u8(blob(w, h, 44 + 4 * i, 20 + 2.5 * i, 12, 3))), nearQ: rleEncode(new Uint8Array(qw * qh).fill(255)), excQ: null, depQ: rleEncode(new Uint8Array(qw * qh).fill(255)) })));
  live.setConf([{ t: 0, conf: 1 }, { t: 0.3, conf: 1 }]);
  const o = live.at(4 / 30)!;
  const want = stats[R].area;
  assert.ok(Math.abs(areaOf(o.alpha) - want) < 0.08 * want, `the overlay of a moving subject is whole (${areaOf(o.alpha)} of ${want} px)`);
  console.log(`full masks: alpha average of a moving subject → ${areaOf(comp)} of ${A} px, mean alpha inside ${inside(comp).toFixed(2)} (was ${areaOf(plain)} px, ${inside(plain).toFixed(2)}): ok`);
}

// ---------------------------------------------------------------- a subject leaving the frame is not "unsure"
{
  const mw = 96, mh = 48, qw = 24, qh = 12, n = 90;
  const run = (y0: number, cut: (i: number) => number) => {
    const live = new SegLive({ mw, mh, i0: 0, n });
    live.put(Array.from({ length: n }, (_, i) => {
      const m = new Uint8Array(mw * mh);
      for (let y = y0; y < y0 + 10; y++) for (let x = cut(i); x < cut(i) + 40 && x < mw; x++) if (x >= 0) m[y * mw + x] = 255;
      return { i, alpha: rleEncode(m), nearQ: rleEncode(new Uint8Array(qw * qh).fill(255)), excQ: null, depQ: rleEncode(new Uint8Array(qw * qh).fill(255)) };
    }));
    return Array.from({ length: n }, (_, i) => live.qualityAt(i));
  };
  // Panned out of the frame to the right from frame 40 on, 3 px a frame: the frame cuts the mask.
  const out = run(20, (i) => 30 + 3 * Math.max(0, i - 40));
  let last = 0;
  for (let i = 0; i < n; i++) if (30 + 3 * Math.max(0, i - 40) < mw - 6) last = i;
  assert.ok(Math.min(...out.slice(0, last)) > 0.9, `leaving the frame: trusted to the end (min ${Math.min(...out.slice(0, last)).toFixed(2)})`);
  const st = maskStats(Uint8Array.from({ length: mw * mh }, (_, k) => (k % mw >= 90 ? 255 : 0)), mw, mh);
  assert.ok(st.edge && Math.abs(st.cx - 92.5) < 1e-9);
  assert.equal(maskStats(new Uint8Array(mw * mh), mw, mh).edge, false);
  // Two sharks, one of them lost mid-frame at frame 40 (the union's area halves): the other keeps its pop.
  {
    const live = new SegLive({ mw, mh, i0: 0, n });
    live.put(Array.from({ length: n }, (_, i) => {
      const m = new Uint8Array(mw * mh);
      for (let y = 8; y < 16; y++) for (let x = 10; x < 40; x++) m[y * mw + x] = 255;
      if (i < 40) for (let y = 30; y < 38; y++) for (let x = 50; x < 80; x++) m[y * mw + x] = 255;
      return { i, alpha: rleEncode(m), nearQ: rleEncode(new Uint8Array(qw * qh).fill(255)), excQ: null, depQ: rleEncode(new Uint8Array(qw * qh).fill(255)) };
    }));
    let qmin = 1;
    for (let i = 0; i < n; i++) qmin = Math.min(qmin, live.qualityAt(i));
    assert.ok(qmin > 0.95, `one of two subjects gone: the other is trusted (min ${qmin.toFixed(2)})`);
    // The alpha average does not drag the remaining shark toward where the pair's centre was.
    const o = live.at(40 / 30)!;
    assert.ok(o.alpha[12 * mw + 25] > 0.9 && o.alpha[12 * mw + 9] < 0.5 && o.alpha[12 * mw + 41] < 0.5, "the shark still there keeps its place");
  }
  console.log(`full masks: a subject panned out of the frame keeps its trust (min ${Math.min(...out.slice(0, last)).toFixed(2)}): ok`);
}

// ---------------------------------------------------------------- the re-check's water test
{
  const w = 120, h = 60, rgba = new Uint8ClampedArray(w * h * 4);
  // Water with a vertical gradient, and a ray a little darker than it (a far subject in haze).
  const ray = blob(w, h, 60, 30, 14, 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4, dim = ray[y * w + x] ? 0.82 : 1, g = 150 - y;
    rgba[k] = 10 * dim; rgba[k + 1] = g * dim; rgba[k + 2] = (g + 25) * dim; rgba[k + 3] = 255;
  }
  const cells = cellLab(rgba, w, h);
  const on = waterContrast(ray, cells, w, h)!, off = waterContrast(blob(w, h, 25, 30, 14, 4), cells, w, h)!;
  assert.ok(on > 2 && off < 1, `a far ray stands off its water (ΔE ${on.toFixed(1)}), a mask on plain water does not (${off.toFixed(1)})`);
  assert.equal(waterContrast(new Float32Array(w * h).fill(1), cells, w, h), null, "no ring: nothing to compare with");
  console.log(`full masks: water test → far ray ΔE ${on.toFixed(1)}, plain water ${off.toFixed(1)}: ok`);
}

console.log("seg full-mask tests passed");
