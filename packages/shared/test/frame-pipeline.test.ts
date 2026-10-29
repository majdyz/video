import { describe, expect, it } from "vitest";
import { PauseGate, runFramePipeline } from "../src/frame-pipeline";

type In = { id: number; closed: number };
type Out = { id: number; closed: number };

function harness(n: number, opts: { renderDelay?: (i: number) => number; encodeDelay?: number } = {}) {
  const inputs: In[] = [];
  const outputs: Out[] = [];
  let live = 0, peakLive = 0, peakInflight = 0;
  const order: number[] = [];
  async function* source() {
    for (let i = 0; i < n; i++) {
      const x = { id: i, closed: 0 };
      inputs.push(x);
      live++;
      peakLive = Math.max(peakLive, live);
      yield x;
    }
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const hooks = {
    depth: 3,
    render: async (x: In) => {
      await sleep(opts.renderDelay?.(x.id) ?? 1);
      const o = { id: x.id, closed: 0 };
      outputs.push(o);
      return o;
    },
    encode: async (o: Out) => {
      await sleep(opts.encodeDelay ?? 0);
      order.push(o.id);
    },
    releaseInput: (x: In) => {
      x.closed++;
      live--;
    },
    releaseFrame: (o: Out) => {
      o.closed++;
    },
    onInflight: (k: number) => {
      peakInflight = Math.max(peakInflight, k);
    },
  };
  return { inputs, outputs, order, source, hooks, peak: () => ({ peakLive, peakInflight }) };
}

describe("runFramePipeline", () => {
  it("keeps at most `depth` frames in flight, encodes in order, releases everything once", async () => {
    const h = harness(50, { renderDelay: (i) => (i % 3 === 0 ? 6 : 1) });
    const n = await runFramePipeline(h.source(), h.hooks);
    expect(n).toBe(50);
    expect(h.order).toEqual([...Array(50).keys()]);
    expect(h.peak().peakInflight).toBeLessThanOrEqual(3);
    // Decoded inputs alive never exceed the depth: the source is not pulled ahead of the encoder.
    expect(h.peak().peakLive).toBeLessThanOrEqual(3);
    expect(h.inputs.every((x) => x.closed === 1)).toBe(true);
    expect(h.outputs.every((o) => o.closed === 1)).toBe(true);
  });

  it("memory stays flat with clip length (peak live frames independent of N)", async () => {
    const short = harness(10);
    await runFramePipeline(short.source(), short.hooks);
    const long = harness(400);
    await runFramePipeline(long.source(), long.hooks);
    expect(long.peak().peakLive).toBe(short.peak().peakLive);
  });

  it("a slow encoder holds the source back (backpressure)", async () => {
    const h = harness(20, { encodeDelay: 5 });
    let pulledAhead = 0;
    const hooks = { ...h.hooks, encode: async (o: Out, x: In) => {
      pulledAhead = Math.max(pulledAhead, h.inputs.length - 1 - x.id);
      await h.hooks.encode(o);
    } };
    await runFramePipeline(h.source(), hooks);
    expect(pulledAhead).toBeLessThanOrEqual(2);
  });

  it("releases every input and rendered frame when a render fails", async () => {
    const h = harness(30);
    const hooks = { ...h.hooks, render: async (x: In) => {
      if (x.id === 7) throw new Error("gpu lost");
      return h.hooks.render(x);
    } };
    await expect(runFramePipeline(h.source(), hooks)).rejects.toThrow("gpu lost");
    expect(h.inputs.every((x) => x.closed === 1)).toBe(true);
    expect(h.outputs.every((o) => o.closed === 1)).toBe(true);
  });

  it("releases everything when the encoder fails", async () => {
    const h = harness(30);
    const hooks = { ...h.hooks, encode: async (o: Out) => {
      if (o.id === 12) throw new Error("EncodingError");
    } };
    await expect(runFramePipeline(h.source(), hooks)).rejects.toThrow("EncodingError");
    expect(h.inputs.every((x) => x.closed === 1)).toBe(true);
    expect(h.outputs.every((o) => o.closed === 1)).toBe(true);
  });

  it("releases everything when the decoder (source) fails", async () => {
    const inputs: In[] = [];
    const outputs: Out[] = [];
    async function* src() {
      for (let i = 0; i < 10; i++) {
        const x = { id: i, closed: 0 };
        inputs.push(x);
        yield x;
      }
      throw new Error("decode error");
    }
    await expect(runFramePipeline(src(), {
      depth: 4,
      render: (x: In) => {
        const o = { id: x.id, closed: 0 };
        outputs.push(o);
        return o;
      },
      encode: () => undefined,
      releaseInput: (x) => x.closed++,
      releaseFrame: (o) => o.closed++,
    })).rejects.toThrow("decode error");
    expect(inputs.every((x) => x.closed === 1)).toBe(true);
    expect(outputs.every((o) => o.closed === 1)).toBe(true);
  });

  it("skips rejected inputs without rendering them", async () => {
    const h = harness(10);
    const rendered: number[] = [];
    const n = await runFramePipeline(h.source(), { ...h.hooks, accept: (x) => x.id % 2 === 0, render: async (x: In) => {
      rendered.push(x.id);
      return h.hooks.render(x);
    } });
    expect(n).toBe(5);
    expect(rendered).toEqual([0, 2, 4, 6, 8]);
    expect(h.inputs.every((x) => x.closed === 1)).toBe(true);
  });

  it("aborts (also while paused) and releases what is in flight", async () => {
    const h = harness(1000);
    const ctrl = new AbortController();
    const gate = new PauseGate();
    const hooks = { ...h.hooks, signal: ctrl.signal, gate: gate.wait, encode: async (o: Out) => {
      if (o.id === 20) gate.pause();
      if (o.id === 20) setTimeout(() => ctrl.abort(), 10);
    } };
    await expect(runFramePipeline(h.source(), hooks)).rejects.toThrow(/Abort/);
    expect(h.inputs.length).toBeLessThan(30);
    expect(h.inputs.every((x) => x.closed === 1)).toBe(true);
    expect(h.outputs.every((o) => o.closed === 1)).toBe(true);
  });

  it("holds at the gate while paused and carries on after resume", async () => {
    const h = harness(40);
    const gate = new PauseGate();
    let pausedAtCount = -1;
    const hooks = { ...h.hooks, gate: gate.wait, encode: async (o: Out) => {
      if (o.id === 10) {
        gate.pause();
        setTimeout(() => {
          pausedAtCount = h.inputs.length;
          gate.resume();
        }, 30);
      }
    } };
    const n = await runFramePipeline(h.source(), hooks);
    expect(n).toBe(40);
    // Nothing more was decoded while paused (only what was already in flight).
    expect(pausedAtCount).toBeLessThanOrEqual(14);
    expect(gate.pausedMs).toBeGreaterThan(20);
  });
});

describe("PauseGate", () => {
  it("counts paused time", () => {
    let t = 0;
    const g = new PauseGate(() => t);
    g.pause();
    t = 100;
    expect(g.pausedMs).toBe(100);
    g.resume();
    t = 500;
    expect(g.pausedMs).toBe(100);
    expect(g.wait()).toBeUndefined();
  });
});
