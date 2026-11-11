// CIELAB (D65) from 8-bit sRGB and CIEDE2000 — eval harness metrics.
import { srgbToLinear } from "../src/engine/color.ts";

export function srgb8ToLab(r8: number, g8: number, b8: number): [number, number, number] {
  const r = srgbToLinear(r8 / 255), g = srgbToLinear(g8 / 255), b = srgbToLinear(b8 / 255);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE00(l1: readonly number[], l2: readonly number[]): number {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b: number, a: number) => { if (a === 0 && b === 0) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? hbp + 360 : hbp - 360; hbp /= 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ---------- distribution statistics (eval/score.ts, eval/fit-look.ts) ----------

export type Lab = Float64Array; // L, a, b interleaved
export function labOf(rgba: Uint8ClampedArray | Buffer, n: number): Lab {
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [l, a, b] = srgb8ToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    out[i * 3] = l; out[i * 3 + 1] = a; out[i * 3 + 2] = b;
  }
  return out;
}
/** Linear-interpolated quantile of a sorted array. */
export function quantile(sorted: Float64Array, q: number): number {
  const x = q * (sorted.length - 1), i = Math.floor(x), j = Math.min(sorted.length - 1, i + 1);
  return sorted[i] + (sorted[j] - sorted[i]) * (x - i);
}
// 64 fixed unit directions (seeded), 200 quantiles: the review's lookgap2.py measure.
const DIRS: [number, number, number][] = (() => {
  let s = 0x9e3779b9;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return Array.from({ length: 64 }, () => { const v = [gauss(), gauss(), gauss()], n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n] as [number, number, number]; });
})();
const QN = 200;
/** Sliced Wasserstein distance between two CIELAB point sets (units of ΔE*ab). */
export function swd(x: Lab, y: Lab): number {
  const proj = (p: Lab, d: [number, number, number]) => { const n = p.length / 3, o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = p[i * 3] * d[0] + p[i * 3 + 1] * d[1] + p[i * 3 + 2] * d[2]; return o.sort(); };
  let sum = 0;
  for (const d of DIRS) {
    const a = proj(x, d), b = proj(y, d);
    let s = 0;
    for (let k = 0; k < QN; k++) { const q = 0.005 + (0.99 * k) / (QN - 1); s += Math.abs(quantile(a, q) - quantile(b, q)); }
    sum += s / QN;
  }
  return (sum / DIRS.length) * Math.sqrt(3);
}
export type Region = { waterHue: number | null; L50: number; L5: number; warmC: number | null };
/** Region statistics of one image: water = chroma > 10 and CIELAB hue 170–310°; sand/skin = the other pixels above L* 45. */
export function regionStats(p: Lab): Region {
  const n = p.length / 3, L = new Float64Array(n);
  let sx = 0, sy = 0, cool = 0, wc = 0, wn = 0;
  for (let i = 0; i < n; i++) {
    const l = p[i * 3], a = p[i * 3 + 1], b = p[i * 3 + 2], c = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    L[i] = l;
    if (c > 10 && h > 170 && h < 310) { cool++; sx += a / c; sy += b / c; } else if (l > 45) { wc += c; wn++; }
  }
  L.sort();
  return { waterHue: cool > 0.02 * n ? ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360 : null, L50: quantile(L, 0.5), L5: quantile(L, 0.05), warmC: wn > 0.02 * n ? wc / wn : null };
}
export const hueDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** 2×2 box downsample of RGBA8 (encoded values, as an area resize does). */
export function halve(img: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const ow = w >> 1, oh = h >> 1, out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) for (let c = 0; c < 4; c++) {
    const i = (y * 2 * w + x * 2) * 4 + c;
    out[(y * ow + x) * 4 + c] = (img[i] + img[i + 4] + img[i + w * 4] + img[i + w * 4 + 4] + 2) >> 2;
  }
  return out;
}
