// Analyse-first lookahead windows (pure: a fake reader).
//   node --experimental-strip-types apps/studio/test/lookahead.test.ts
import assert from "node:assert/strict";
import { AnalysisLookahead } from "../src/pipeline/lookahead.ts";

const FPS = 30;
function fakeReader(frames: number, t0 = 0) {
  const open = new Set<number>();
  let started: number | null = null;
  let disposed = false;
  return {
    open,
    get started() { return started; },
    get disposed() { return disposed; },
    reader: {
      rotation: 0 as const,
      displayWidth: 16,
      displayHeight: 9,
      t0,
      async *samples(fromSec: number, toSec?: number) {
        started = fromSec;
        for (let i = 0; i < frames; i++) {
          const timeSec = i / FPS;
          if (timeSec < fromSec - 0.5 / FPS) continue;
          if (toSec !== undefined && timeSec >= toSec) return;
          open.add(i);
          yield { sample: { close: () => open.delete(i) }, timeSec, timestamp: timeSec + t0 };
        }
      },
      dispose: () => { disposed = true; },
    },
  };
}

// Windows: analyses run ahead in windows, each frame is offered once in order, every sample is closed.
{
  const f = fakeReader(300);
  const seen: number[] = [];
  const done: number[] = [];
  const look = new AnalysisLookahead({
    reader: f.reader as never,
    clock: "clip",
    windowSec: 2,
    leadSec: 1,
    want: (t, prev) => { seen.push(t); return prev === null || Math.floor(t / 0.15 + 1e-6) !== Math.floor(prev / 0.15 + 1e-6); },
    analyse: async (_s, t) => { done.push(t); },
  });
  await look.ensure(0);
  // First window: [0, 2).
  assert.equal(seen.length, 60);
  assert.ok(done.every((t) => t < 2));
  // Inside the window and outside the lead: nothing new.
  await look.ensure(0.5);
  assert.equal(seen.length, 60);
  // Within the lead of the horizon: the next window [2, 4).
  await look.ensure(1.2);
  assert.equal(seen.length, 120);
  for (let t = 1.2; t < 10.1; t += 1 / FPS) await look.ensure(t);
  assert.equal(seen.length, 300, "every frame offered once");
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], "in order");
  assert.equal(f.open.size, 0, "every sample closed");
  // One analysis per 0.15 s slot (the first frame of each).
  assert.equal(done.length, new Set(done.map((t) => Math.floor(t / 0.15 + 1e-6))).size);
  assert.equal(look.analysed, done.length);
  look.dispose();
  assert.ok(f.disposed);
}

// Container clock: times are the reader's timestamps; the decoder starts at the matching clip time.
{
  const f = fakeReader(90, 1.5);
  const done: number[] = [];
  const look = new AnalysisLookahead({ reader: f.reader as never, clock: "container", windowSec: 5, want: () => true, analyse: async (_s, t) => { done.push(t); } });
  await look.ensure(1.5 + 1);
  assert.ok(Math.abs((f.started ?? -1) - 1) < 1e-9);
  assert.ok(Math.abs(done[0] - 2.5) < 1e-9);
  look.dispose();
  assert.equal(f.open.size, 0);
}

// A failing analysis is skipped (the render analyses that frame live) and its sample closed; an abort stops it.
{
  const f = fakeReader(60);
  const look = new AnalysisLookahead({ reader: f.reader as never, clock: "clip", windowSec: 0.5, want: () => true, analyse: async (_s, t) => { if (t > 0.2) throw new Error("boom"); } });
  const warn = console.warn;
  console.warn = () => undefined;
  await look.ensure(0);
  console.warn = warn;
  assert.equal(look.analysed, 7);
  assert.equal(look.failures, 8);
  look.dispose();
  assert.equal(f.open.size, 0);
  const a = fakeReader(60);
  const lookA = new AnalysisLookahead({ reader: a.reader as never, clock: "clip", windowSec: 0.5, want: () => true, analyse: async () => { throw new DOMException("Aborted", "AbortError"); } });
  await assert.rejects(lookA.ensure(0), /Aborted/);
  lookA.dispose();
  assert.equal(a.open.size, 0);
  const g = fakeReader(60);
  const look2 = new AnalysisLookahead({ reader: g.reader as never, clock: "clip", windowSec: 0.5, want: () => false, analyse: async () => undefined });
  await look2.ensure(0);
  assert.equal(g.open.size, 1, "the first frame past the window waits for the next one");
  look2.dispose();
  assert.equal(g.open.size, 0);
}

console.log("lookahead tests passed");
