import { describe, expect, it } from "vitest";
import { lensDiagonalFov, packUniforms, samplePoint, scaleLens, thetaD, thetaMaxOf, warpUniforms, type Lens } from "./fisheye";
import { PROFILES } from "./profiles";

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

  it("packs sixteen floats in shader order", () => {
    const u = warpUniforms({ ...base, strength: 0.5 });
    const f = packUniforms(u);
    expect(f.length).toBe(16);
    expect(Array.from(f.slice(0, 2))).toEqual([3840, 2160]);
    expect(f[4]).toBeCloseTo(0);
    expect(f[8]).toBeCloseTo(0.5);
    expect(Array.from(f.slice(12, 14))).toEqual([1920, 1080]);
  });
});

/** OpenCV fisheye::projectPoints, written independently of the shader maths. */
function opencvFisheyeProject(l: Lens, X: number, Y: number, Z: number): [number, number] {
  const a = X / Z, b = Y / Z;
  const r = Math.hypot(a, b);
  if (r === 0) return [l.cx, l.cy];
  const theta = Math.atan(r);
  const t2 = theta * theta;
  const td = theta * (1 + l.k[0] * t2 + l.k[1] * t2 ** 2 + l.k[2] * t2 ** 3 + l.k[3] * t2 ** 4);
  const xd = (td / r) * a, yd = (td / r) * b;
  return [l.fx * xd + l.cx, l.fy * yd + l.cy];
}

describe("calibrated lens", () => {
  const lens = PROFILES["osmo-action-wide"].lens!;
  const calib = { ...base, strength: 1, fovDeg: lensDiagonalFov(lens, 3840, 2160), lens };

  it("matches the OpenCV fisheye projection at full strength", () => {
    const u = warpUniforms(calib);
    for (const [x, y] of [[1920, 1080], [2500, 1300], [600, 200], [3700, 2100], [100, 1080]]) {
      // The output pixel is a rectilinear view with focal fOut: its ray is ((x-cx)/fOut, (y-cy)/fOut, 1).
      const [ex, ey] = opencvFisheyeProject(lens, (x - 1920) / u.fOut, (y - 1080) / u.fOut, 1);
      const [sx, sy] = samplePoint(u, x, y);
      expect(sx).toBeCloseTo(ex, 3);
      expect(sy).toBeCloseTo(ey, 3);
    }
  });

  it("maps the output centre to the principal point at full strength and leaves it alone at zero", () => {
    expect(samplePoint(warpUniforms(calib), 1920, 1080)).toEqual([lens.cx, lens.cy]);
    expect(samplePoint(warpUniforms({ ...calib, strength: 0 }), 1920, 1080)).toEqual([1920, 1080]);
  });

  it("scales the calibration to the clip size by width", () => {
    const small = scaleLens(lens, 1920, 1080);
    expect(small.fx).toBeCloseTo(lens.fx / 2);
    expect(small.cx).toBeCloseTo(lens.cx / 2);
    const u = warpUniforms({ ...calib, srcWidth: 1920, srcHeight: 1080, fovDeg: lensDiagonalFov(lens, 1920, 1080) });
    const [sx] = samplePoint(u, 1500, 540);
    const [bx] = samplePoint(warpUniforms(calib), 3000, 1080);
    expect(sx * 2).toBeCloseTo(bx, 2);
  });

  it("derives a plausible diagonal field of view and the FOV slider only trims it", () => {
    const fov = lensDiagonalFov(lens, 3840, 2160);
    expect(fov).toBeGreaterThan(130);
    expect(fov).toBeLessThan(165);
    const wider = warpUniforms({ ...calib, fovDeg: fov + 10 });
    expect(wider.fFish).toBeLessThan(warpUniforms(calib).fFish);
  });

  it("holds the fisheye radius where the polynomial turns over", () => {
    const k = [0.2862, -0.0827, 0.0743, -0.0587];
    const tMax = thetaMaxOf(k);
    expect(tMax).toBeGreaterThan(1.0);
    expect(tMax).toBeLessThan(1.5);
    expect(thetaD(tMax + 0.05, k)).toBeLessThan(thetaD(tMax, k));
    const u = warpUniforms({ ...calib, projection: "stereographic", lens: { ...lens, k: k as Lens["k"] } });
    // A stereographic corner reaches past tMax; the sample must not fold back toward the centre.
    const [cornerX] = samplePoint(u, 0, 0);
    const [nearX] = samplePoint(u, 200, 112);
    expect(cornerX).toBeLessThanOrEqual(nearX);
  });

  it("straightens a line that the calibrated lens bent", () => {
    // Points on a straight line in the scene, projected through the lens: curved in the source.
    const u = warpUniforms(calib);
    const src = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map(t => opencvFisheyeProject(lens, t, 0.5, 1));
    const sag = (pts: [number, number][]) => {
      const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      return Math.max(...pts.map(([x, y]) => Math.abs((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)) / len));
    };
    expect(sag(src)).toBeGreaterThan(50);
    // Invert the warp numerically: find the output pixel that samples each source point.
    const out = src.map(([sx, sy]) => {
      let bx = 0, by = 0, best = Infinity;
      for (let y = 0; y <= 2160; y += 4) for (let x = 0; x <= 3840; x += 4) {
        const [px, py] = samplePoint(u, x, y);
        const d = (px - sx) ** 2 + (py - sy) ** 2;
        if (d < best) { best = d; bx = x; by = y; }
      }
      return [bx, by] as [number, number];
    });
    expect(sag(out)).toBeLessThan(6);
  });
});
