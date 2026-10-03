// Synthetic shaky sequences for the unit tests: a textured world image is
// re-sampled through a known per-frame similarity, so the tracker's output
// can be compared with ground truth to the sub-pixel.
import { applyH, invertH, type Homography } from "../src/lib/homography.ts";
import { GRID_H, GRID_W, type WarpFn } from "../src/lib/mesh-renderer.ts";
import { compose, invert, type Similarity } from "../src/lib/tracker.ts";

export type World = { w: number; h: number; img: Float32Array };

/** Deterministic xorshift so failures are reproducible. */
export function makeRng(seed = 12345): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Reef-like texture: band-limited noise (so bilinear interpolation is close
 * to the true continuous image) plus a few blobs and edges for corners, on a
 * gentle gradient that imitates the blue-water falloff.
 */
export function makeWorld(w: number, h: number, rng: () => number): World {
  const img = new Float32Array(w * h);
  // Low-frequency base.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img[y * w + x] = 90 + 30 * Math.sin(x * 0.011) * Math.cos(y * 0.013);
  // Blobs with sharp-ish edges at random positions and sizes.
  for (let k = 0; k < 900; k++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = 2 + rng() * 14;
    const amp = (rng() - 0.5) * 120;
    const x0 = Math.max(0, Math.floor(cx - r - 2));
    const x1 = Math.min(w - 1, Math.ceil(cx + r + 2));
    const y0 = Math.max(0, Math.floor(cy - r - 2));
    const y1 = Math.min(h - 1, Math.ceil(cy + r + 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const v = 1 / (1 + Math.exp((d - r) * 2));
        img[y * w + x] += amp * v;
      }
    }
  }
  // Mild blurred noise for micro-texture.
  const noise = new Float32Array(w * h);
  for (let i = 0; i < noise.length; i++) noise[i] = (rng() - 0.5) * 40;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += noise[(y + j) * w + x + i];
      img[y * w + x] += s / 9;
    }
  }
  for (let i = 0; i < img.length; i++) img[i] = Math.max(0, Math.min(255, img[i]));
  return { w, h, img };
}

function sampleBilinear(world: World, x: number, y: number): number {
  const { w, h, img } = world;
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  const i = y0 * w + x0;
  return (img[i] * (1 - fx) + img[i + 1] * fx) * (1 - fy) + (img[i + w] * (1 - fx) + img[i + w + 1] * fx) * fy;
}

/**
 * Renders a (fw x fh) frame whose centred pixel q shows world point
 * cam^-1(q) + worldCentre, i.e. `cam` maps world (centred) to frame (centred).
 */
export function renderFrame(world: World, cam: Similarity, fw: number, fh: number, out: Float32Array, noise = 0, rng?: () => number): void {
  const inv = invert(cam);
  const wcx = world.w * 0.5;
  const wcy = world.h * 0.5;
  for (let y = 0; y < fh; y++) {
    const qy = y - fh * 0.5;
    for (let x = 0; x < fw; x++) {
      const qx = x - fw * 0.5;
      const wx = inv.a * qx - inv.b * qy + inv.tx + wcx;
      const wy = inv.b * qx + inv.a * qy + inv.ty + wcy;
      let v = sampleBilinear(world, wx, wy);
      if (noise > 0 && rng) v += (rng() - 0.5) * noise;
      out[y * fw + x] = Math.max(0, Math.min(255, v));
    }
  }
}

/**
 * Same as renderFrame for a plane-projective camera: `cam` is a homography
 * mapping world (centred) to frame (centred).
 */
export function renderFrameH(world: World, cam: Homography, fw: number, fh: number, out: Float32Array, noise = 0, rng?: () => number): void {
  const inv = invertH(cam);
  const wcx = world.w * 0.5;
  const wcy = world.h * 0.5;
  for (let y = 0; y < fh; y++) {
    const qy = y - fh * 0.5;
    for (let x = 0; x < fw; x++) {
      const [wx, wy] = applyH(inv, x - fw * 0.5, qy);
      let v = sampleBilinear(world, wx + wcx, wy + wcy);
      if (noise > 0 && rng) v += (rng() - 0.5) * noise;
      out[y * fw + x] = Math.max(0, Math.min(255, v));
    }
  }
}

/**
 * Homography of a camera with focal length `f` (px) rotated by `tiltXDeg`
 * about its x axis and `tiltYDeg` about its y axis, looking at a fronto-
 * parallel plane: K · R · K⁻¹ in centred pixel coordinates.
 */
export function tiltHomography(tiltXDeg: number, tiltYDeg: number, f: number): Homography {
  const ax = (tiltXDeg * Math.PI) / 180;
  const ay = (tiltYDeg * Math.PI) / 180;
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  // R = Rx · Ry
  const r = [cy, 0, sy, sx * sy, cx, -sx * cy, -cx * sy, sx, cx * cy];
  const h = new Float64Array([
    r[0], r[1], r[2] * f,
    r[3], r[4], r[5] * f,
    r[6] / f, r[7] / f, r[8],
  ]);
  for (let i = 0; i < 9; i++) h[i] /= h[8];
  return h;
}

/**
 * CPU twin of the WebGL mesh renderer: the warp is evaluated at the 33x19
 * grid vertices only and bilinearly interpolated inside each cell, so the
 * tests exercise the same approximation the GPU draws.
 */
export function renderThroughMesh(src: Float32Array, fw: number, fh: number, warp: WarpFn, out: Float32Array): void {
  const vw = GRID_W + 1;
  const vh = GRID_H + 1;
  const ux = new Float64Array(vw * vh);
  const uy = new Float64Array(vw * vh);
  for (let vy = 0; vy < vh; vy++) {
    for (let vx = 0; vx < vw; vx++) {
      const [sx, sy] = warp((vx / GRID_W - 0.5) * fw, (vy / GRID_H - 0.5) * fh);
      // Texel centres sit at i + 0.5, like the GPU's samplers.
      ux[vy * vw + vx] = sx + fw * 0.5 - 0.5;
      uy[vy * vw + vx] = sy + fh * 0.5 - 0.5;
    }
  }
  const view: World = { w: fw, h: fh, img: src };
  for (let y = 0; y < fh; y++) {
    const gy = ((y + 0.5) / fh) * GRID_H;
    const cy = Math.min(GRID_H - 1, Math.floor(gy));
    const fy = gy - cy;
    for (let x = 0; x < fw; x++) {
      const gx = ((x + 0.5) / fw) * GRID_W;
      const cx = Math.min(GRID_W - 1, Math.floor(gx));
      const fx = gx - cx;
      const i = cy * vw + cx;
      const sx = (ux[i] * (1 - fx) + ux[i + 1] * fx) * (1 - fy) + (ux[i + vw] * (1 - fx) + ux[i + vw + 1] * fx) * fy;
      const sy = (uy[i] * (1 - fx) + uy[i + 1] * fx) * (1 - fy) + (uy[i + vw] * (1 - fx) + uy[i + vw + 1] * fx) * fy;
      out[y * fw + x] = sx < 0 || sy < 0 || sx > fw - 1 || sy > fh - 1 ? 0 : sampleBilinear(view, sx, sy);
    }
  }
}

export function similarityFrom(angleDeg: number, scale: number, tx: number, ty: number): Similarity {
  const r = (angleDeg * Math.PI) / 180;
  return { a: scale * Math.cos(r), b: scale * Math.sin(r), tx, ty };
}

/** Frame-to-frame motion implied by two absolute camera poses. */
export function relativeMotion(prev: Similarity, cur: Similarity): Similarity {
  return compose(cur, invert(prev));
}

export function angleDeg(s: Similarity): number {
  return (Math.atan2(s.b, s.a) * 180) / Math.PI;
}

export function scaleOf(s: Similarity): number {
  return Math.hypot(s.a, s.b);
}
