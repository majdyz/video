import { describe, expect, it } from "vitest";
import { packUniforms, samplePoint, warpUniforms } from "./fisheye";

const base = { srcWidth: 3840, srcHeight: 2160, fovDeg: 155, k1: 0, zoom: 1 };

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

  it("maps the edge of the frame to the edge of the source at full strength", () => {
    // The output keeps the source's horizontal angle, so the middle of the right edge lands on the source's right edge.
    const u = warpUniforms({ ...base, strength: 1 });
    const [sx] = samplePoint(u, 3840, 1080);
    expect(sx).toBeCloseTo(3840, 3);
  });

  it("zoom crops toward the centre", () => {
    const wide = warpUniforms({ ...base, strength: 1, zoom: 1 });
    const tight = warpUniforms({ ...base, strength: 1, zoom: 1.3 });
    expect(samplePoint(tight, 0, 0)[0]).toBeGreaterThan(samplePoint(wide, 0, 0)[0]);
  });

  it("packs eight floats in shader order", () => {
    const u = warpUniforms({ ...base, strength: 0.5 });
    const f = packUniforms(u);
    expect(f.length).toBe(8);
    expect(Array.from(f.slice(0, 2))).toEqual([3840, 2160]);
    expect(f[5]).toBeCloseTo(0.5);
  });
});
