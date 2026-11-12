// AI subjects and the export (seg/export-use.ts): the export never waits for the pass, counts the frames the AI
// had and says so honestly; its settings key stands still while the pass runs (resume); follow mode's frame; the
// chip in follow mode; a failure after the page was in the background.
//   node --experimental-strip-types apps/studio/test/seg-export.test.ts
import assert from "node:assert/strict";
import { exportChoice, exportWaitS, followFrame, headWait, passComplete, SEG_EXPORT, SEG_EXPORT_UNAVAILABLE, segCoverageNote, segExportKey, SegExportUse } from "../src/pipeline/seg/export-use.ts";
import { backgroundFailure, SEG_HAND, SegLive, segStatusText, subjectChip, type SegStatus } from "../src/pipeline/seg/studio-seg.ts";
import { rleEncode } from "../src/pipeline/seg/mask.ts";
import type { SessionFrameOut } from "../src/pipeline/seg/session.ts";

// ---------------------------------------------------------------- the wait
{
  assert.equal(exportWaitS(null), 0, "no estimate yet: the export starts at once");
  assert.equal(exportWaitS(400), 0, "minutes left: the export starts at once");
  assert.equal(exportWaitS(SEG_EXPORT.waitS + 1), 0);
  assert.equal(exportWaitS(8), SEG_EXPORT.waitS, "about to finish: it is given the wait, and no longer");
  assert.equal(exportWaitS(0), SEG_EXPORT.waitS);
  assert.equal(exportWaitS(NaN), 0);
  assert.equal(exportWaitS(-3), 0);
  assert.ok(SEG_EXPORT.waitS <= 20, "the wait is seconds, not the pass");
  console.log("export: waits only for a pass that is about to finish, at most 15 s: ok");
}

// ---------------------------------------------------------------- the count and the note
{
  const u = new SegExportUse();
  assert.equal(u.share, 0);
  for (let i = 0; i < 100; i++) u.add(i < 82);
  assert.equal(u.ai, 82);
  assert.equal(u.total, 100);
  assert.equal(u.share, 0.82);
  const on = { complete: false, available: true };
  assert.match(segCoverageNote(u, on)!, /^AI subjects on 82% of frames; standard subject detection on the rest/);
  assert.match(segCoverageNote(u, { ...on, resumed: true })!, /82% of the frames rendered now/, "a resumed export counts the frames it rendered");
  assert.equal(segCoverageNote({ ai: 100, total: 100 }, { complete: true, available: true }), null, "the pass was through: nothing to say");
  assert.equal(segCoverageNote({ ai: 100, total: 100 }, on), "AI subjects on all frames.", "an unfinished pass that had every frame all the same");
  assert.match(segCoverageNote({ ai: 0, total: 100 }, on)!, /weren't ready for this export: standard subject detection was used/);
  assert.equal(segCoverageNote({ ai: 0, total: 100 }, { complete: false, available: false }), SEG_EXPORT_UNAVAILABLE);
  assert.equal(segCoverageNote({ ai: 0, total: 0 }, on), null, "no frame rendered: nothing to say");
  // Never a share that reads as all or none when it is not.
  assert.match(segCoverageNote({ ai: 999, total: 1000 }, on)!, /on 99% of frames/);
  assert.match(segCoverageNote({ ai: 1, total: 1000 }, on)!, /on 1% of frames/);
  // A complete pass with a frame outside its range (the trim's edge): said, not hidden.
  assert.equal(segCoverageNote({ ai: 97, total: 100 }, { complete: true, available: true }), "AI subjects on 97% of frames; standard subject detection on the rest.");
  console.log("export: the sheet's note says what was used (\"AI subjects on 82% of frames\"): ok");
}

// ---------------------------------------------------------------- the key (resume)
{
  const tap = { op: "add", object: { id: 7, kind: "include", t: 3.2, prompt: { points: [[0.4, 0.5]], labels: [1] } } };
  const a = segExportKey([]), b = segExportKey([tap]);
  assert.equal(a, segExportKey([]), "the same taps: the same key, however far the pass is");
  assert.notEqual(a, b, "a tap changes the output: another key");
  assert.equal(b, segExportKey([JSON.parse(JSON.stringify(tap))]));
  assert.notEqual(b, segExportKey([tap, { op: "remove", id: 7 }]), "an undo too");
  assert.match(a, /^seg:ai:0:/);
  console.log("export: the AI's part of the settings key is the taps alone (an export under way stays resumable): ok");
}

// ---------------------------------------------------------------- the frames the AI has, and follow mode's frame
{
  const mw = 32, mh = 18, n = 120;
  const frame = (i: number, on: boolean): SessionFrameOut => {
    const a = new Uint8Array(mw * mh);
    if (on) for (let k = 100; k < 160; k++) a[k] = 255;
    const q = new Uint8Array(Math.ceil(mw / 4) * Math.ceil(mh / 4));
    return { i, alpha: rleEncode(a), nearQ: rleEncode(q), excQ: null, depQ: rleEncode(q), pop: null };
  };
  const live = new SegLive({ mw, mh, i0: 0, n });
  assert.equal(live.followT(), null, "nothing filled: nothing to follow");
  assert.equal(live.covered(0), false);
  // The pass has filled the first 2 s (60 frames).
  live.put(Array.from({ length: 60 }, (_, i) => frame(i, true)));
  assert.equal(live.covered(0), true, "the range's start counts as filled beyond it");
  assert.equal(live.covered(1), true);
  assert.equal(live.covered(59 / 30), false, "the last filled frame is at the hand-over's foot: the engine's detection");
  assert.equal(live.covered(2.5), false, "not filled");
  assert.equal(live.covered(-1), false);
  // Half way into the hand-over (0.3 s, 9 frames) counts.
  const edge = [...Array(60).keys()].filter((i) => live.covered(i / 30)).pop()!;
  assert.ok(edge >= 60 - SEG_HAND && edge < 59, `covered up to frame ${edge} of 59`);
  assert.equal(live.followT(), (59 - SEG_HAND) / 30, "follow mode stands a hand-over behind the pass");
  // A peek's island further on does not pull the playhead off the pass's front... unless it is the newest full frame.
  live.put(Array.from({ length: 4 }, (_, k) => frame(90 + k, true)));
  assert.equal(live.followT(), (59 - SEG_HAND) / 30, "four frames alone have no frame at full weight");
  // The whole clip: the last frame (the range's end counts as filled).
  live.put(Array.from({ length: n }, (_, i) => frame(i, i < 100)));
  assert.equal(live.followT(), (n - 1) / 30);
  assert.equal(live.covered((n - 1) / 30), true, "a frame the AI found no subject on is the AI's answer too");

  assert.equal(followFrame(0, () => true, 9), -1);
  assert.equal(followFrame(5, () => true, 9), 4, "a range shorter than the hand-over");
  assert.equal(followFrame(40, (i) => i >= 10 && i < 30, 9), -1 + 30 - 9, "behind the front by the hand-over");
  assert.equal(followFrame(40, (i) => i >= 10 && i < 25, 9), -1, "an island narrower than two hand-overs has no full frame");
  console.log("export / follow: a frame counts as the AI's from half way into the hand-over; follow mode's frame is the newest at full weight: ok");
}

// ---------------------------------------------------------------- the chip and the panel line
{
  const st = (p: Partial<SegStatus>): SegStatus => ({ on: true, phase: "ready", progress: null, note: null, ...p });
  const tracking = st({ phase: "tracking", progress: 0.07 });
  assert.deepEqual(subjectChip("mask", tracking, "5 min left", null, true), { tone: "ai", line: "AI subject ✓", sub: "Following the AI 7%" });
  assert.deepEqual(subjectChip("none", tracking, null, null, true), { tone: "ai", line: "AI: no subject here", sub: "Following the AI 7%" });
  assert.deepEqual(subjectChip("mask", tracking, "5 min left", null, false), { tone: "ai", line: "AI subject ✓", sub: "Rest of clip 7%" });
  assert.deepEqual(subjectChip("mask", st({}), null, null, true), { tone: "ai", line: "AI subject ✓", sub: null }, "the pass is through: nothing to follow");
  // The panel's line under the toggle no longer repeats the chip's percentage.
  assert.doesNotMatch(segStatusText(tracking)!, /%|Finding subjects/);
  assert.match(segStatusText(tracking)!, /export any time/);
  assert.equal(segStatusText(st({ phase: "looking" })), segStatusText(tracking));
  assert.match(segStatusText(st({ phase: "download", progress: 0.4 }))!, /Downloading the model… 40%/, "the download's progress is the panel's own");
  console.log("chip: \"Following the AI 7%\" in follow mode; the panel no longer repeats the pass's progress: ok");
}

// ---------------------------------------------------------------- a failure after the page was in the background
{
  assert.equal(backgroundFailure(0, 0, 50_000, false), false, "never hidden: the clip's own failure");
  assert.equal(backgroundFailure(10_000, 0, 12_000, true), true, "failed while hidden");
  assert.equal(backgroundFailure(10_000, 40_000, 45_000, false), true, "failed 5 s after coming back");
  assert.equal(backgroundFailure(10_000, 40_000, 90_000, false), false, "failed long after: not the suspension's");
  console.log("background: a pass that fails while hidden or right after the return is started again, not ended: ok");
}

// ---------------------------------------------------------------- "pass complete" (owner's ray clip, 12 Nov)
{
  // The export at 106 s: the model's first search had ended (its idle), the first seeds had been given, the pass
  // was at 1% with 16 of 780 frames posted. It logged "pass complete" and then "AI subjects on 16 of 754 frames".
  assert.equal(passComplete({ seeded: true, filled: 16, n: 780 }), false, "an idle after the seeds were noted is not the pass's end");
  assert.equal(passComplete({ seeded: false, filled: 0, n: 780 }), false, "the idle before any seeds");
  assert.equal(passComplete({ seeded: true, filled: 779, n: 780 }), false);
  assert.equal(passComplete({ seeded: true, filled: 780, n: 780 }), true, "every frame has its answer: through");
  assert.equal(passComplete({ seeded: false, filled: 780, n: 780 }), false);
  assert.equal(passComplete({ seeded: true, filled: 0, n: 0 }), false);
  console.log("export: the pass is complete only when every frame has its answer (not at an idle after the seeds): ok");
}

// ---------------------------------------------------------------- the render and the pass side by side
{
  const base = { t: 2, settled: false, running: true, frontT: 1.7, leftMs: 60_000 };
  assert.equal(headWait(base), true, "the render has caught up with the pass: this frame is the pass's next");
  assert.equal(headWait({ ...base, settled: true }), false, "the frame has its mask");
  assert.equal(headWait({ ...base, running: false }), false, "no pass at work");
  assert.equal(headWait({ ...base, leftMs: 0 }), false, "the export's wait is used up: on with the engine's detection");
  assert.equal(headWait({ ...base, frontT: null }), false, "the pass has finished no frame yet");
  assert.equal(headWait({ ...base, t: 1.7 + SEG_EXPORT.headReachS + 0.5 }), false, "the pass is not about to get there");
  assert.equal(headWait({ ...base, t: 1.0 }), false, "a frame the pass left behind unfilled is not waited for");
  assert.ok(SEG_EXPORT.headWaitS <= 10, "\"Export now\" waits for the pass a few seconds at most");

  // A render next to a pass, as studio.ts runs them: the pass has the first 2 s when the export starts and makes
  // half a second of frames per tick it is given; the render takes a frame at a time, waits where headWait says
  // (a tick each time) within its budget, and counts what each frame was graded with.
  const mw = 32, mh = 18, n = 300, hz = 30;
  const frame = (i: number): SessionFrameOut => {
    const al = new Uint8Array(mw * mh).fill(255, 100, 160), q = new Uint8Array(Math.ceil(mw / 4) * Math.ceil(mh / 4));
    return { i, alpha: rleEncode(al), nearQ: rleEncode(q), excQ: null, depQ: rleEncode(q), pop: null };
  };
  const render = (budgetTicks: number, passTicksPerFrame: number) => {
    const live = new SegLive({ mw, mh, i0: 0, n });
    let made = 60, credit = 0;
    live.put(Array.from({ length: made }, (_, i) => frame(i)));
    const pass = () => { if (made >= n) return; const k = Math.min(n, made + 15); live.put(Array.from({ length: k - made }, (_, j) => frame(made + j))); made = k; };
    const use = new SegExportUse();
    let left = budgetTicks, waited = 0;
    for (let i = 0; i < n; i++) {
      const t = i / hz, settled = () => live.has(t) && live.hand(i) >= 1;
      // (The pass also works while frames render: `passTicksPerFrame` of a tick per rendered frame.)
      credit += passTicksPerFrame;
      while (credit >= 1) { credit--; pass(); }
      while (headWait({ t, settled: settled(), running: made < n, frontT: live.followT(), leftMs: left })) { pass(); left--; waited++; }
      use.add(live.covered(t));
    }
    return { use, waited, made };
  };
  // No wait at all, a pass that makes nothing meanwhile: the frames it had at the start, less the hand-over.
  const none = render(0, 0);
  assert.equal(none.waited, 0);
  assert.ok(none.use.ai >= 60 - SEG_HAND && none.use.ai < 60, `the masks that existed when the render began are used (${none.use.ai} of 60)`);
  // The same with a wait of 4 ticks: 2 s more of the pass's frames, made while the export rendered, are used too.
  const some = render(4, 0);
  assert.equal(some.waited, 4, "the wait is spent where the render caught up, and no more than the budget");
  assert.ok(some.use.ai >= 120 - SEG_HAND && some.use.ai < 120, `the masks made while rendering are used and counted (${some.use.ai} of 300)`);
  assert.equal(some.made, 120);
  // A pass as fast as the render stays ahead of it: every frame, and no wait.
  const fast = render(4, 1 / 15);
  assert.equal(fast.use.ai, n, "a pass that keeps ahead of the render gives every frame its mask");
  assert.equal(fast.waited, 0);
  // A pass a little slower than the render: the budget carries it part of the way, then the engine's detection.
  const slow = render(4, 1 / 30);
  assert.ok(slow.use.ai > some.use.ai && slow.use.ai < n, `a slower pass: more than the wait alone, not all (${slow.use.ai} of 300)`);
  assert.match(segCoverageNote(slow.use, { complete: false, available: true })!, /^AI subjects on \d+% of frames/);
  console.log(`export: masks made while the render runs are used and counted (none ${none.use.ai}, waited ${some.use.ai}, slower pass ${slow.use.ai}, pass ahead ${fast.use.ai} of 300): ok`);
}

// ---------------------------------------------------------------- the sheet's two buttons
{
  const c = exportChoice({ coverage: 0.06, etaS: 290 });
  assert.equal(c.now, "Export now");
  assert.match(c.note, /about 6% of the clip.*standard subject detection on the rest/);
  assert.equal(c.wait, "Wait for AI, then export (~5 min)");
  assert.equal(exportChoice({ coverage: 0.5, etaS: 30 }).wait, "Wait for AI, then export (under a minute)");
  assert.equal(exportChoice({ coverage: 0.5, etaS: 70 }).wait, "Wait for AI, then export (~1 min)");
  assert.equal(exportChoice({ coverage: 0.5, etaS: null }).wait, "Wait for AI, then export", "no estimate yet: no number");
  assert.match(exportChoice({ coverage: 0, etaS: null }).note, /haven't reached this clip yet.*standard subject detection/);
  assert.match(exportChoice({ coverage: 0.999, etaS: 5 }).note, /about 99%/, "never 100% while the pass is unfinished");
  assert.doesNotMatch(exportChoice({ coverage: NaN, etaS: NaN }).wait, /NaN/);
  console.log("export sheet: \"Export now\" with how much the AI has, \"Wait for AI, then export (~5 min)\": ok");
}
