import { describe, expect, it } from "vitest";
import { ExportProfile } from "../src/export-profile";

describe("ExportProfile", () => {
  it("sums stages, shares of the wall time, largest first", async () => {
    const p = new ExportProfile();
    p.add("render", 30);
    p.add("decode", 10);
    p.add("render", 30);
    p.add("encode", -5); // ignored
    p.time("geometry", () => undefined);
    await p.time("ui", () => new Promise<void>((r) => setTimeout(r, 5)));
    expect(p.ms.render).toBe(60);
    expect(p.ms.decode).toBe(10);
    expect(p.ms.encode).toBe(0);
    expect(p.ms.ui).toBeGreaterThan(0);
    p.frames = 20;
    p.end();
    const s = p.summary();
    expect(s.indexOf("render")).toBeLessThan(s.indexOf("decode"));
    expect(s).toMatch(/fps \(20 frames/);
    expect(p.table().render).toBe(60);
  });

  it("leaves paused time out of the wall clock", () => {
    const p = new ExportProfile();
    p.end();
    const wall = p.wallMs();
    p.pausedMs = 1e9;
    expect(p.wallMs()).toBe(1);
    p.pausedMs = 0;
    expect(p.wallMs()).toBe(wall);
  });
});
