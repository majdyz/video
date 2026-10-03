// CPU reference of the grade shader. One pixel at a time, same stages and
// constants as GLSL/WGSL in grade-shader.ts — used by the Node harness and
// the unit tests, never in the render path.

import { compressToGamut, linearToOklab, linearToSrgb, luminance, oklabToLinear, srgbToLinear } from "./color.ts";
import { ULAP, type ClaheLuts, type DepthMap, type GradeParams, type UserSettings } from "./params.ts";

export type ApplyContext = {
  params: GradeParams;
  settings: UserSettings;
  depth: DepthMap;
  clahe: ClaheLuts;
};

/**
 * Joint bilateral upsample of the (z, conf, dSmooth) fields at upright uv:
 * the four bilinear neighbours are re-weighted by how much the full-res
 * pixel colour resembles each neighbour's guide colour. Smooth inside a
 * region, sharp at edges, no halos.
 */
export const JBU_SIGMA = 0.14;
function sampleFields(d: DepthMap, u: number, v: number, r: number, g: number, b: number): [number, number, number] {
  const fx = Math.min(Math.max(u * d.width - 0.5, 0), d.width - 1);
  const fy = Math.min(Math.max(v * d.height - 0.5, 0), d.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, d.width - 1), y1 = Math.min(y0 + 1, d.height - 1);
  const tx = fx - x0, ty = fy - y0;
  const cn = Math.hypot(r, g, b) + 0.02;
  let sz = 0, sc = 0, sd = 0, sw = 0;
  let bz = 0, bc = 0, bd = 0;
  const taps: [number, number, number][] = [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]];
  for (const [x, y, ws] of taps) {
    const i = y * d.width + x;
    const gr = d.guide[i * 3], gg = d.guide[i * 3 + 1], gb = d.guide[i * 3 + 2];
    const diff = Math.hypot(r - gr, g - gg, b - gb) / (cn + Math.hypot(gr, gg, gb));
    const wr = Math.exp(-(diff * diff) / (2 * JBU_SIGMA * JBU_SIGMA));
    const wgt = ws * wr;
    sz += wgt * d.fields[i * 3]; sc += wgt * d.fields[i * 3 + 1]; sd += wgt * d.fields[i * 3 + 2]; sw += wgt;
    bz += ws * d.fields[i * 3]; bc += ws * d.fields[i * 3 + 1]; bd += ws * d.fields[i * 3 + 2];
  }
  // Mix toward plain bilinear when no neighbour resembles the pixel.
  const k = Math.min(1, sw / 0.05);
  if (sw < 1e-6) return [bz, bc, bd];
  return [sz / sw * k + bz * (1 - k), sc / sw * k + bc * (1 - k), sd / sw * k + bd * (1 - k)];
}

/**
 * CLAHE lookup. LUT entry b is the CDF at the upper edge of bin b, so the
 * value axis maps to fb = value·bins − 1; below the first edge the curve
 * ramps from 0. Bilinear across the four nearest tiles.
 */
function sampleClahe(c: ClaheLuts, u: number, v: number, value: number): number {
  const fb = value * c.bins - 1;
  const lutAt = (tile: number) => {
    const base = tile * c.bins;
    if (fb < 0) return c.data[base] * (fb + 1);
    const b0 = Math.min(c.bins - 1, Math.floor(fb));
    const b1 = Math.min(c.bins - 1, b0 + 1);
    const tb = Math.min(1, Math.max(0, fb - b0));
    return c.data[base + b0] + (c.data[base + b1] - c.data[base + b0]) * tb;
  };
  const fx = Math.min(Math.max(u * c.tilesX - 0.5, 0), c.tilesX - 1);
  const fy = Math.min(Math.max(v * c.tilesY - 0.5, 0), c.tilesY - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, c.tilesX - 1), y1 = Math.min(y0 + 1, c.tilesY - 1);
  const tx = fx - x0, ty = fy - y0;
  const top = lutAt(y0 * c.tilesX + x0) * (1 - tx) + lutAt(y0 * c.tilesX + x1) * tx;
  const bot = lutAt(y1 * c.tilesX + x0) * (1 - tx) + lutAt(y1 * c.tilesX + x1) * tx;
  return top * (1 - ty) + bot * ty;
}

/** Grades one sRGB pixel (0..1) at upright uv. Returns sRGB 0..1. */
export function gradePixel(ctx: ApplyContext, sr: number, sg: number, sb: number, u: number, v: number): [number, number, number] {
  const { params: p, settings: s } = ctx;
  const r0 = srgbToLinear(sr), g0 = srgbToLinear(sg), b0 = srgbToLinear(sb);

  // Range proxy: coarse map plus guided per-pixel detail from the prior.
  const dPix = ULAP.mu0 + ULAP.mu1 * Math.max(sg, sb) + ULAP.mu2 * sr;
  const [zc, confMap, dc] = sampleFields(ctx.depth, u, v, r0, g0, b0);
  const zRange = Math.max(0.02, p.zHi - p.zLo);
  const z = clamp(zc + clamp((p.depthGuide * (dPix - dc)) / zRange, -0.25, 0.25), 0, 1.15);

  // De-scatter, compensate, white-balance. Veil-dominated pixels (low
  // signal confidence) take a toned-down copy of the input instead.
  const src = [r0, g0, b0];
  const full = [0, 0, 0];
  let dl = 0;
  for (let c = 0; c < 3; c++) {
    const I = src[c];
    const B = s.veil * p.binf[c] * (1 - Math.exp(-(p.betaB[c] * z + p.cB[c])));
    const D = Math.max(I - B, I * p.floorFrac);
    dl += D * (c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722);
    const rangeGain = Math.min(p.gainCap, Math.max(1 / p.gainCap, Math.exp(p.attn[c] * (z - p.zMean))));
    full[c] = D * rangeGain * p.wb[c];
  }
  void dl;
  const conf = clamp(confMap, 0, 1);
  const out = [0, 0, 0];
  const ew = Math.pow(p.exposure, p.waterExposure);
  for (let c = 0; c < 3; c++) {
    const water = src[c] * p.waterWb[c] * ew;
    out[c] = water + (full[c] * p.exposure - water) * conf;
  }

  // Levels on luminance, ratio-preserving.
  let Y = luminance(out[0], out[1], out[2]);
  const Ylv = Y + ((Y - p.black) / (p.white - p.black) - Y) * p.levelsMix;
  let ratio = Y > 1e-5 ? Math.max(0, Ylv) / Y : 1;
  for (let c = 0; c < 3; c++) out[c] *= ratio;
  Y = Math.max(0, Ylv);

  // Local contrast on encoded luminance (CLAHE), mixed by clarity.
  if (s.clarity > 0) {
    const encY = linearToSrgb(clamp(Y, 0, 1));
    const eq = sampleClahe(ctx.clahe, u, v, encY);
    const encNew = encY + (eq - encY) * s.clarity;
    const Ynew = srgbToLinear(clamp(encNew, 0, 1));
    ratio = Y > 1e-5 ? Ynew / Y : 1;
    for (let c = 0; c < 3; c++) out[c] *= ratio;
  }

  // Chroma control in Oklab: ceiling relative to the source chroma, then
  // the saturation control.
  const [, a0, bb0] = linearToOklab(r0, g0, b0);
  const cSrc = Math.hypot(a0, bb0);
  const [L, a, b] = linearToOklab(Math.max(0, out[0]), Math.max(0, out[1]), Math.max(0, out[2]));
  let C = Math.hypot(a, b);
  const cMax = p.chromaK * cSrc + p.chromaC0;
  let scale = C > cMax ? cMax / C : 1;
  scale *= s.saturation;
  const [r1, g1, b1] = oklabToLinear(L, a * scale, b * scale);
  void C;

  const [r2, g2, b2] = compressToGamut(r1, g1, b1);
  const rs = linearToSrgb(r2), gs = linearToSrgb(g2), bs = linearToSrgb(b2);
  return [
    sr + (rs - sr) * s.strength,
    sg + (gs - sg) * s.strength,
    sb + (bs - sb) * s.strength,
  ];
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}


/** Grades a whole RGBA8 image (upright). */
export function applyGrade(ctx: ApplyContext, rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = gradePixel(ctx, rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255, (x + 0.5) / w, v);
      out[i] = r * 255 + 0.5;
      out[i + 1] = g * 255 + 0.5;
      out[i + 2] = b * 255 + 0.5;
      out[i + 3] = 255;
    }
  }
  return out;
}
