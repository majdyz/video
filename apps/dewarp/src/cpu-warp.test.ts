import { describe, expect, it } from "vitest";
import { bicubic, catmullRom, renderCpu, tap, type Rgba } from "./cpu-warp";
import { lensDiagonalFov, warpUniforms } from "./fisheye";
import { cropLens, FROM_FILE, PROFILES, resolveProfile } from "./profiles";
import { WARP_WGSL } from "./warp-shader";
import { WARP_GLSL_FS } from "./webgl";

function image(w: number, h: number, f: (x: number, y: number) => number): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y), i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

describe("Catmull-Rom resampling", () => {
  it("has weights that sum to one and interpolate the sample points", () => {
    for (const f of [0, 0.1, 0.37, 0.5, 0.9]) {
      const w = catmullRom(f);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
    expect(catmullRom(0).map(v => v + 0)).toEqual([0, 1, 0, 0]);
  });

  it("reproduces a linear ramp exactly between pixel centres, like bilinear", () => {
    const img = image(32, 8, x => x * 8);
    const out = new Float64Array(4);
    for (const sx of [8.5, 9.25, 10.8, 15.5]) {
      bicubic(img, sx, 4, out);
      expect(out[0]! * 255).toBeCloseTo((sx - 0.5) * 8, 6);
    }
  });

  it("keeps an edge sharper than bilinear when magnifying", () => {
    // A hard step magnified 4x: bicubic has a steeper transition than bilinear.
    const img = image(16, 4, x => (x < 8 ? 40 : 220));
    const out = new Float64Array(4);
    const slope = (sample: (x: number) => number) => sample(8.25) - sample(7.75);
    const bic = slope(x => { bicubic(img, x, 2, out); return out[0]!; });
    const bil = slope(x => { tap(img, x / 16, 2 / 4, out); return out[0]!; });
    expect(bic).toBeGreaterThan(bil * 1.1);
  });
});

describe("CPU warp", () => {
  const lens = PROFILES["osmo-action-wide"].lens!;
  const W = 192, H = 108;
  const u = (quality: number, zoom = 1) => warpUniforms({ srcWidth: W, srcHeight: H, fovDeg: lensDiagonalFov(lens, W, H), k1: 0, strength: 0, projection: "rectilinear", zoom, lens, quality });

  it("is the identity at strength 0 with both filters", () => {
    const img = image(W, H, (x, y) => (x * 7 + y * 13) & 255);
    for (const q of [0, 1]) {
      const out = renderCpu(img, u(q));
      let maxDiff = 0;
      for (let i = 0; i < out.length; i += 4) maxDiff = Math.max(maxDiff, Math.abs(out[i]! - img.data[i]!));
      expect(maxDiff).toBeLessThanOrEqual(1);
    }
  });

  it("box filters when zoomed out far enough to shrink, which removes a fine checkerboard's aliasing", () => {
    const img = image(W, H, (x, y) => ((x + y) & 1 ? 255 : 0));
    const out = renderCpu(img, u(1, 0.4));
    const outBil = renderCpu(img, u(0, 0.4));
    const spread = (o: Uint8ClampedArray) => {
      let lo = 255, hi = 0;
      // Inside the source only (zoomed out, the border is black).
      for (let y = 40; y < 68; y++) for (let x = 80; x < 112; x++) { const v = o[(y * W + x) * 4]!; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      return hi - lo;
    };
    expect(spread(out)).toBeLessThan(spread(outBil));
  });
});

describe("profiles", () => {
  it("crops a calibration about the frame centre for HyperSmooth", () => {
    const l = PROFILES["gopro-wide-16x9"].lens!;
    const c = cropLens(l, 0.928);
    expect(c.fx).toBeCloseTo(l.fx / 0.928, 6);
    expect(c.cx - 1920).toBeCloseTo((l.cx - 1920) / 0.928, 6);
    expect(cropLens(l, 1)).toBe(l);
  });

  it("applies the HyperSmooth crop only to GoPro profiles on GoPro clips", () => {
    const gopro = { brand: "GoPro", stabilizationCrop: 0.928, evidence: [] };
    expect(resolveProfile("gopro-wide-16x9", gopro).lens!.fx).toBeCloseTo(PROFILES["gopro-wide-16x9"].lens!.fx / 0.928, 3);
    expect(resolveProfile("osmo-action-wide", gopro).lens).toBe(PROFILES["osmo-action-wide"].lens);
    expect(resolveProfile("gopro-wide-16x9", { evidence: [] }).lens).toBe(PROFILES["gopro-wide-16x9"].lens);
  });

  it("uses the clip's own lens for the from-file option and falls back without one", () => {
    const lens = { width: 1920, height: 1080, fx: 650, fy: 650, cx: 960, cy: 540, k: [0.18, -0.15, 0.08, -0.01] as [number, number, number, number] };
    const p = resolveProfile(FROM_FILE, { brand: "GoPro", model: "HERO12 Black", lens, evidence: [] });
    expect(p.lens).toBe(lens);
    expect(p.label).toContain("HERO12 Black");
    expect(resolveProfile(FROM_FILE, { evidence: [] })).toBe(PROFILES["osmo-action-wide"]);
  });

  it("every calibrated profile has a sane diagonal field of view at its own size", () => {
    for (const [id, p] of Object.entries(PROFILES)) {
      if (!p.lens) continue;
      const fov = lensDiagonalFov(p.lens, p.lens.width, p.lens.height);
      expect(fov, id).toBeGreaterThan(110);
      expect(fov, id).toBeLessThan(178);
    }
  });
});

describe("shader parity", () => {
  const glsl = WARP_GLSL_FS;
  // The arithmetic lines must match between WGSL and GLSL once the type keywords are dropped.
  const norm = (s: string) => s.replace(/\b(let|var|vec2<f32>|vec4<f32>|vec2|vec4|float|int)\b/g, "").replace(/\s+/g, "");
  for (const line of [
    "let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));",
    "let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);",
    "let w2 = f * (0.5 + f * (2.0 - 1.5 * f));",
    "let w3 = f * f * (-0.5 + 0.5 * f);",
    "let thetaD = theta * (1.0 + t2 * (params.k.x + t2 * (params.k.y + t2 * (params.k.z + t2 * params.k.w))));",
  ]) {
    it(`both shaders compute: ${line.slice(0, 40)}…`, () => {
      expect(norm(WARP_WGSL)).toContain(norm(line));
      expect(norm(glsl)).toContain(norm(line.replace(/params\./g, "")));
    });
  }
  it("both switch to the footprint filter at the same thresholds", () => {
    expect(WARP_WGSL).toContain("m > 1.25");
    expect(glsl).toContain("m > 1.25");
    expect(WARP_WGSL).toContain("m > 2.25");
    expect(glsl).toContain("m > 2.25");
  });
});
