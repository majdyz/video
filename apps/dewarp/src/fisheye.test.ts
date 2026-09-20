import { describe, expect, it } from "vitest";
import { packUniforms, samplePoint, warpUniforms } from "./fisheye";

const base = { srcWidth: 3840, srcHeight: 2160, fovDeg: 155, k1: 0, zoom: 1, projection: "rectilinear" as const };

describe("fisheye inverse map", () => {
  it("leaves every pixel where it is at strength 0", () => {
    const u = warpUniforms({ ...base, strength: 0 });
    for (const [x, y] of [[0, 0], [1920, 1080], [3839, 2159], [100, 2000]]) {
      const [sx, sy] = samplePoint(u, x, y);
      expect(sx).toBeCloseTo(x, 6);
      expect(sy).toBeCloseTo(y, 6);
    }
  });

  it("keeps the centre fixed and pulls the corners inward at full strength", () => {
    const u = warpUniforms({ ...base, strength: 1 });
    expect(samplePoint(u, 1920, 1080)).toEqual([1920, 1080]);
    const [sx, sy] = samplePoint(u, 0, 0);
    expect(sx).toBeGreaterThan(0);
    expect(sy).toBeGreaterThan(0);
    expect(sx).toBeLessThan(1920);
  });

  it("is radially symmetric", () => {
    const u = warpUniforms({ ...base, strength: 0.7 });
    const [ax, ay] = samplePoint(u, 300, 400);
    const [bx, by] = samplePoint(u, 3840 - 300, 2160 - 400);
    expect(bx).toBeCloseTo(3840 - ax, 6);
    expect(by).toBeCloseTo(2160 - ay, 6);
  });

  it("keeps the center magnification at full strength, so the frame edge samples inside the source", () => {
    const u = warpUniforms({ ...base, strength: 1 });
    // Near the center a pixel step maps to a pixel step.
    const [ax] = samplePoint(u, 1920 + 10, 1080);
    expect(ax - 1920).toBeCloseTo(10, 1);
    // The right edge of the output shows content from inside the source: the fisheye's outer view is cropped, not stretched.
    const [sx] = samplePoint(u, 3840, 1080);
    expect(sx).toBeLessThan(3840);
    expect(sx).toBeGreaterThan(1920);
  });

  it("zoom crops toward the centre", () => {
    const wide = warpUniforms({ ...base, strength: 1, zoom: 1 });
    const tight = warpUniforms({ ...base, strength: 1, zoom: 1.3 });
    expect(samplePoint(tight, 0, 0)[0]).toBeGreaterThan(samplePoint(wide, 0, 0)[0]);
  });

  it("stereographic keeps the centre and pulls the corner in less than straight lines do", () => {
    const straight = warpUniforms({ ...base, strength: 1 });
    const natural = warpUniforms({ ...base, strength: 1, projection: "stereographic" });
    expect(samplePoint(natural, 1920, 1080)).toEqual([1920, 1080]);
    const [sxS] = samplePoint(straight, 0, 1080);
    const [sxN] = samplePoint(natural, 0, 1080);
    expect(sxN).toBeGreaterThan(0);
    expect(sxN).toBeLessThan(sxS);
  });

  it("negative strength samples outward, adding barrel instead of removing it", () => {
    const u = warpUniforms({ ...base, strength: -0.5 });
    const [sx] = samplePoint(u, 0, 1080);
    expect(sx).toBeLessThan(0);
  });

  it("packs eight floats in shader order", () => {
    const u = warpUniforms({ ...base, strength: 0.5 });
    const f = packUniforms(u);
    expect(f.length).toBe(8);
    expect(Array.from(f.slice(0, 2))).toEqual([3840, 2160]);
    expect(f[5]).toBeCloseTo(0.5);
  });
});
