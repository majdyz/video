// Person pass plan (pure logic): the export's analyse-first pass predicts which person pass each analysis
// runs from the counters at the export's start; it must agree with the engine's live rule (startAnalysis).
//   node --experimental-strip-types apps/aqua-fix/test/person-plan.test.ts
import assert from "node:assert/strict";
import { PERSON_DETECT_EVERY, personCountersAt, personPassOf, samePersonCounters, type PersonCounters } from "../src/engine/person-plan.ts";

const RECTS = 5;

/** The engine's live rule, as startAnalysis runs it (counters bumped in place, the pass decided on the way). */
function liveRun(base: PersonCounters, n: number, every: number): { pass: string; before: PersonCounters }[] {
  let count = base.count, passes = base.passes, rectIdx = base.rectIdx;
  const out: { pass: string; before: PersonCounters }[] = [];
  for (let i = 0; i < n; i++) {
    const before = { count, passes, rectIdx };
    const want = count++ % every === 0;
    const detect = want && passes++ % PERSON_DETECT_EVERY === 0;
    const pass = !want ? "-" : detect ? "D" : `S${rectIdx % RECTS}`;
    if (want && !detect) rectIdx++;
    out.push({ pass, before });
  }
  return out;
}

for (const every of [2, 4]) {
  for (const base of [{ count: 0, passes: 0, rectIdx: 0 }, { count: 0, passes: 1, rectIdx: 0 }]) {
    const live = liveRun(base, 60, every);
    for (let n = 0; n < live.length; n++) {
      const c = personCountersAt(base, n, every);
      assert.ok(samePersonCounters(c, live[n].before), `counters before analysis ${n} (every ${every}, passes0 ${base.passes})`);
      const p = personPassOf(c, every);
      const pass = !p.want ? "-" : p.detect ? "D" : `S${c.rectIdx % RECTS}`;
      assert.equal(pass, live[n].pass, `pass of analysis ${n}`);
    }
    // Stepping on from an earlier plan gives the same counters as planning from the start.
    const mid = personCountersAt(base, 17, every);
    assert.ok(samePersonCounters(personCountersAt(mid, 23, every), personCountersAt(base, 40, every)));
  }
}

// An export that keeps the preview's verdict starts with passes = 1: its first pass segments, the detector speaks on the third.
{
  const seq = liveRun({ count: 0, passes: 1, rectIdx: 0 }, 12, 4).map((x) => x.pass).join(" ");
  assert.equal(seq, "S0 - - - S1 - - - D - - -");
}
console.log("person-plan: ok");
