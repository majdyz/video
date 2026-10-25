/**
 * CPU mirror of the warp shader's resampling (warp-shader.ts / webgl.ts), for tests and offline
 * before/after boards. Slow (per pixel JS), exact enough to compare filters and lens models.
 */
import { samplePoint, type WarpUniforms } from "./fisheye";

export type Rgba = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

/** Bilinear tap at normalised uv with clamp-to-edge, like the GPU sampler (pixel centres at i + 0.5). */
export function tap(img: Rgba, u: number, v: number, out: Float64Array): void {
  const { width: w, height: h, data } = img;
  const x = Math.min(Math.max(u * w - 0.5, 0), w - 1);
  const y = Math.min(Math.max(v * h - 0.5, 0), h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = data[i00 + c]! + (data[i10 + c]! - data[i00 + c]!) * fx;
    const bot = data[i01 + c]! + (data[i11 + c]! - data[i01 + c]!) * fx;
    out[c] = (top + (bot - top) * fy) / 255;
  }
}

/** Catmull-Rom weights for the fractional offset f in [0, 1). They sum to 1. */
export function catmullRom(f: number): [number, number, number, number] {
  return [
    f * (-0.5 + f * (1 - 0.5 * f)),
    1 + f * f * (-2.5 + 1.5 * f),
    f * (0.5 + f * (2 - 1.5 * f)),
    f * f * (-0.5 + 0.5 * f),
  ];
}

const t = new Float64Array(4);

/** Nine-tap Catmull-Rom at source pixel position (sx, sy), as the shader's bicubic(). */
export function bicubic(img: Rgba, sx: number, sy: number, out: Float64Array): void {
  const { width: W, height: H } = img;
  const t1x = Math.floor(sx - 0.5) + 0.5, t1y = Math.floor(sy - 0.5) + 0.5;
  const wx = catmullRom(sx - t1x), wy = catmullRom(sy - t1y);
  const w12x = wx[1] + wx[2], w12y = wy[1] + wy[2];
  const xs = [(t1x - 1) / W, (t1x + wx[2] / w12x) / W, (t1x + 2) / W];
  const ys = [(t1y - 1) / H, (t1y + wy[2] / w12y) / H, (t1y + 2) / H];
  const cwx = [wx[0], w12x, wx[3]], cwy = [wy[0], w12y, wy[3]];
  out.fill(0);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    tap(img, xs[i]!, ys[j]!, t);
    const w = cwx[i]! * cwy[j]!;
    for (let c = 0; c < 4; c++) out[c]! += t[c]! * w;
  }
  for (let c = 0; c < 4; c++) out[c] = Math.min(1, Math.max(0, out[c]!));
}

/** Box filter over the footprint spanned by (dx, dy) with n×n bilinear taps, as the shader's footprint(). */
export function footprint(img: Rgba, sx: number, sy: number, dx: [number, number], dy: [number, number], n: number, out: Float64Array): void {
  out.fill(0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const ox = (i + 0.5) / n - 0.5, oy = (j + 0.5) / n - 0.5;
    tap(img, (sx + dx[0] * ox + dy[0] * oy) / img.width, (sy + dx[1] * ox + dy[1] * oy) / img.height, t);
    for (let c = 0; c < 4; c++) out[c]! += t[c]!;
  }
  for (let c = 0; c < 4; c++) out[c]! /= n * n;
}

/** The whole warp on the CPU, output the same size as the source. */
export function renderCpu(img: Rgba, u: WarpUniforms): Uint8ClampedArray {
  const { width: W, height: H } = img;
  const out = new Uint8ClampedArray(W * H * 4);
  const px = new Float64Array(4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [sx, sy] = samplePoint(u, x + 0.5, y + 0.5);
      const o = (y * W + x) * 4;
      if (sx < 0 || sy < 0 || sx > W || sy > H) { out[o + 3] = 255; continue; }
      if (u.quality < 0.5) tap(img, sx / W, sy / H, px);
      else {
        // Forward differences stand in for the GPU's quad derivatives.
        const [ax, ay] = samplePoint(u, x + 1.5, y + 0.5);
        const [bx, by] = samplePoint(u, x + 0.5, y + 1.5);
        const dx: [number, number] = [ax - sx, ay - sy], dy: [number, number] = [bx - sx, by - sy];
        const m = Math.max(Math.hypot(...dx), Math.hypot(...dy));
        if (m > 1.25) footprint(img, sx, sy, dx, dy, m > 2.25 ? 3 : 2, px);
        else bicubic(img, sx, sy, px);
      }
      out[o] = Math.round(px[0]! * 255);
      out[o + 1] = Math.round(px[1]! * 255);
      out[o + 2] = Math.round(px[2]! * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}
