// Synthetic shaky sequences for the unit tests: a textured world image is
// re-sampled through a known per-frame similarity, so the tracker's output
// can be compared with ground truth to the sub-pixel.
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
