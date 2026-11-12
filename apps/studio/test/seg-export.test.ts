// AI subjects and the export (seg/export-use.ts): the export never waits for the pass, counts the frames the AI
// had and says so honestly; its settings key stands still while the pass runs (resume); follow mode's frame; the
// chip in follow mode; a failure after the page was in the background.
//   node --experimental-strip-types apps/studio/test/seg-export.test.ts
import assert from "node:assert/strict";
import { exportWaitS, followFrame, SEG_EXPORT, SEG_EXPORT_UNAVAILABLE, segCoverageNote, segExportKey, SegExportUse } from "../src/pipeline/seg/export-use.ts";
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
