// From the first frame's grade to the clip lock (lock-handover.ts; pure logic, no GPU).
// User report (11 Nov): "in first load we still see the color changing … we start calibrating the color the more
// video getting loaded". While the clip is profiled the grade must hold ONE provisional estimate, and the lock must
// then come in as one smooth crossfade of about a second, not a jump.
//   node --experimental-strip-types apps/aqua-fix/test/lock-handover.test.ts
import assert from "node:assert/strict";
import { LOCK_FADE_MS, LOCK_REFADE_MS, LockHandover } from "../src/engine/lock-handover.ts";
import { lockParams } from "../src/engine/lock.ts";
import { IDENTITY_PARAMS, type GradeParams } from "../src/engine/params.ts";

const P = (wbR: number, exposure: number, zLo = 0.1): GradeParams => ({ ...IDENTITY_PARAMS, wb: [wbR, 1, 1], exposure, zLo, zHi: zLo + 0.5 });
// Mirror of GradeEngine.applyLock: the globals in force (handover) over the frame's own range and maps.
const shown = (h: LockHandover, locked: GradeParams | null, frame: GradeParams, now: number) => { const l = h.globals(locked, now); return l ? lockParams(l, frame) : frame; };

const first = P(2.0, 1.4), lock = P(3.0, 1.0);

// 1. Hold: whatever the frames on screen estimate while the profile runs, the globals stay the first frame's;
//    the frame keeps its own range. Without a hold (and without a lock) the frame's estimate rules.
{
  const h = new LockHandover();
  assert.equal(h.globals(null, 0), null);
  assert.equal(shown(h, null, P(2.6, 1.1), 0).wb[0], 2.6);
  h.hold(first);
  assert.ok(h.isHolding);
  for (const [i, est] of [P(2.6, 1.1, 0.2), P(1.2, 2.0, 0.3), P(3.4, 0.8, 0.05)].entries()) {
    const s = shown(h, null, est, 500 + 3000 * i);
    assert.equal(s.wb[0], first.wb[0], "balance drifted during the hold");
    assert.equal(s.exposure, first.exposure, "exposure drifted during the hold");
    assert.equal(s.zLo, est.zLo, "the frame's own range must follow the frame");
    assert.equal(h.fading(500 + 3000 * i), false);
  }
  // A new picture (a cut) takes its own provisional once; a frame of the same picture does not.
  h.rehold(P(1.5, 1.2), false);
  assert.equal(shown(h, null, P(9, 9), 9000).wb[0], first.wb[0]);
  h.rehold(P(1.5, 1.2), true);
  assert.equal(shown(h, null, P(9, 9), 9000).wb[0], 1.5);
  // After a reset the hold has no estimate: the next one becomes it.
  h.settle();
  assert.ok(h.isHolding);
  assert.equal(h.globals(null, 9000), null);
  h.rehold(first, false);
  assert.equal(h.globals(null, 9000), first);
  console.log("ok  one provisional grade while profiling");
}

// 2. Hand over: one crossfade of LOCK_FADE_MS from the grade on screen to the lock — continuous at the start,
//    monotone, smooth (no step larger than a 60 fps frame's share), exactly the lock from the end on.
{
  const h = new LockHandover();
  h.hold(first);
  const T0 = 10_000;
  h.handOver(first, T0);
  assert.equal(h.isHolding, false);
  assert.equal(LOCK_FADE_MS, 1000);
  assert.equal(h.weight(T0), 0);
  assert.equal(shown(h, lock, first, T0).wb[0], first.wb[0], "the fade must start at the grade on screen");
  assert.ok(Math.abs(h.weight(T0 + LOCK_FADE_MS / 2) - 0.5) < 1e-9);
  let prev = first.wb[0], maxStep = 0;
  for (let t = T0; t <= T0 + LOCK_FADE_MS; t += 1000 / 60) {
    assert.ok(h.fading(t) || t >= T0 + LOCK_FADE_MS - 1e-6);
    const v = shown(h, lock, first, t).wb[0];
    assert.ok(v >= prev - 1e-12, "the crossfade went backwards");
    maxStep = Math.max(maxStep, v - prev);
    prev = v;
  }
  // Smoothstep's steepest frame moves 1.5× the linear share (gains blend in the log domain: a little more).
  assert.ok(maxStep < (lock.wb[0] - first.wb[0]) * 1.7 * (1000 / 60 / LOCK_FADE_MS), `largest step ${maxStep}`);
  // Half way the gain is the geometric mean (log-domain blend), exposure too.
  const mid = shown(h, lock, first, T0 + LOCK_FADE_MS / 2);
  assert.ok(Math.abs(mid.wb[0] - Math.sqrt(first.wb[0] * lock.wb[0])) < 1e-9);
  assert.ok(Math.abs(mid.exposure - Math.sqrt(first.exposure * lock.exposure)) < 1e-9);
  // From the end on: the lock itself (the same object: nothing of the handover reaches an export), and no fade.
  // Until the lock has been shown whole the picture still needs one repaint (a paused preview paints while `pending`).
  assert.ok(h.pending);
  assert.equal(h.globals(lock, T0 + LOCK_FADE_MS), lock);
  assert.equal(h.pending, false);
  assert.equal(h.fading(T0 + LOCK_FADE_MS), false);
  assert.equal(h.weight(T0 + 5 * LOCK_FADE_MS), 1);
  console.log(`ok  one ${LOCK_FADE_MS} ms crossfade to the lock (largest 60 fps step ${(100 * maxStep / (lock.wb[0] - first.wb[0])).toFixed(1)} % of the change)`);
}

// 3. An export (settle) ends a running fade at once; no fade was asked for (ms 0, or nothing on screen): the lock at once.
{
  const h = new LockHandover();
  h.handOver(first, 0);
  assert.notEqual(h.globals(lock, 300), lock);
  h.settle();
  assert.equal(h.globals(lock, 301), lock);
  assert.equal(h.fading(301), false);
  h.handOver(first, 1000, 0);
  assert.equal(h.globals(lock, 1000), lock);
  h.handOver(null, 2000);
  assert.equal(h.globals(lock, 2000), lock);
  console.log("ok  export and plain locks take the lock whole");
}

// 4. The lock changes under the handover (the shots' balance lands): no step. During the fade it carries on from
//    what is on screen and ends when it would have (never sooner than LOCK_REFADE_MS); after it, a short fade.
{
  const h = new LockHandover();
  h.handOver(first, 0);
  const lock2 = P(3.3, 1.0);
  const before = shown(h, lock, first, 600);
  h.rebase(before, 600);
  assert.ok(Math.abs(shown(h, lock2, first, 600).wb[0] - before.wb[0]) < 1e-12, "the balance stepped in");
  assert.ok(h.fading(999));
  assert.equal(h.globals(lock2, 1000), lock2);
  // Late in the fade: at least LOCK_REFADE_MS more.
  const g = new LockHandover();
  g.handOver(first, 0);
  g.rebase(shown(g, lock, first, 900), 900);
  assert.ok(g.fading(900 + LOCK_REFADE_MS - 1));
  assert.equal(g.globals(lock2, 900 + LOCK_REFADE_MS), lock2);
  // After the fade: a short one of its own, from the lock on screen.
  const k = new LockHandover();
  k.handOver(first, 0);
  assert.equal(k.globals(lock, 1500), lock);
  k.rebase(lock, 1500);
  assert.ok(Math.abs(shown(k, lock2, first, 1500).wb[0] - lock.wb[0]) < 1e-12);
  assert.ok(k.fading(1500 + LOCK_REFADE_MS - 1));
  assert.equal(k.globals(lock2, 1500 + LOCK_REFADE_MS), lock2);
  // During a hold there is nothing to re-base.
  const m = new LockHandover();
  m.hold(first);
  m.rebase(lock, 0);
  assert.equal(m.globals(null, 0), first);
  console.log("ok  a late balance eases in");
}

// 5. Unlocking (or a profile without a lock) ends the hold: the frame's own estimate again.
{
  const h = new LockHandover();
  h.hold(first);
  h.release();
  assert.equal(h.isHolding, false);
  assert.equal(h.globals(null, 0), null);
  console.log("ok  release");
}
