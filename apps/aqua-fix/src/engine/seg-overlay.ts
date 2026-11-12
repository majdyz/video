// AI subject detection overlay (Studio seg/): with an overlay on the frame, the per-animal strength texture (data
// texture 3) the grade reads carries the ML subject in place of the engine's own per-animal strength
// (composeSegStrength; grade-shader toneWeight). Without an overlay it is the engine's alone (B = A = 0).
import { SEG_TONE } from "./grade-shader.ts";
import { linearToOklab } from "./color.ts";
import { SEG_RESTORE } from "./params.ts";

function sstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export type SegOverlay = {
  width: number;
  height: number;
  /** Pop alpha 0..1: the mask's signed distance (0.5 on its contour, linear to 1 / 0 at SEG_TONE.alphaR mask px in / out). */
  alpha: Float32Array;
  /** Excluded subjects 0..1 (feathered), or null. */
  exclude: Float32Array | null;
  /** ML weight per texel 0..1 (the confidence weight times the region near the ML subject). */
  near: Float32Array;
  /** How far each texel departs from the water around it (0..1), or null (studio seg/; the grade tells water from
   * the subject with composeSegStrength's own water field). */
  depart?: Float32Array | null;
  /** How far this frame's mask can be trusted as the whole animal (0..1, studio SegLive.qualityAt): scales the tone. */
  quality?: number;
  /**
   * The clip's subject / water contrast (ln ratio, as popContrast), measured by the caller over its whole pass
   * (studio SegLive.pop), or null when it found nothing to measure. When present, the lift direction is
   * popDirection of this and nothing else: a constant of the clip, the same in the preview and the export, whatever
   * was rendered before. Absent: the engine's own running mean over the frames it has drawn (clipPopDirection).
   */
  pop?: number | null;
};

/**
 * Whether the engine's own subject maps tone the frame: Subject pop on and no AI overlay on it. Only then does the
 * engine make its maps follow the picture at the subject's pace (the guide and the backdrop surface eased fast, the
 * animals' part of the map led along their motion: engine.ts smooth / leadAnimals). Those steps move every pixel a
 * little (the guide rebuilds the chroma, the backdrop surface decides water against object), so with an AI overlay,
 * where the AI's mask alone weights the pop, they are left out: outside the AI's mask the picture is the plain
 * grade's, to the code value (owner's proof run, 12 Nov: the AI export was ~0.4% greener all over the frame).
 */
export function engineSubjectMaps(subjectPop: boolean, aiOverlay: boolean): boolean {
  return subjectPop && !aiOverlay;
}

/**
 * Subject pop lift direction for a frame drawn with overlay `o`: the clip's own measure when the overlay carries one
 * (SegOverlay.pop; null there = no measure: lift), else from `running`, the mean popContrast of the frames drawn so
 * far (null: none yet: lift).
 */
export function clipPopDirection(o: SegOverlay | null, running: number | null): number {
  if (o && o.pop !== undefined) return o.pop === null ? 1 : popDirection(o.pop);
  return running === null ? 1 : popDirection(running);
}

/**
 * The ML subject's lightness against the water around it, from the analysis guide (linear RGB, RGBA) and the ML
 * overlay: ln(subject luminance / water luminance), the water being the ring the near map reaches outside the mask.
 * Null when either side is too small to tell. Averaged over the clip (popDirection of the mean), so the subject's
 * look is decided once, not frame by frame as it swims off into the haze. The studio measures the whole clip itself
 * and hands the mean over (SegOverlay.pop); this per-frame measure only feeds the engine's running mean for an
 * overlay that comes without one.
 */
export function popContrast(g: { width: number; height: number; data: Float32Array }, o: SegOverlay): number | null {
  let ls = 0, ns = 0, lr = 0, nr = 0;
  for (let y = 0; y < g.height; y++) {
    const oy = Math.min(o.height - 1, Math.floor(((y + 0.5) / g.height) * o.height));
    for (let x = 0; x < g.width; x++) {
      const i = oy * o.width + Math.min(o.width - 1, Math.floor(((x + 0.5) / g.width) * o.width));
      const k = (y * g.width + x) * 4, L = 0.2126 * g.data[k] + 0.7152 * g.data[k + 1] + 0.0722 * g.data[k + 2];
      if (o.alpha[i] > 0.6) { ls += L; ns++; } else if (o.alpha[i] < 0.05 && o.near[i] > 0.15) { lr += L; nr++; }
    }
  }
  if (ns < 4 || nr < 4 || lr <= 0) return null;
  return Math.log(Math.max(1e-6, ls / ns) / (lr / nr));
}

/**
 * Subject pop lift direction from the clip's mean popContrast: +1 lifts the subject (about as light as the water or
 * lighter), −1 deepens it (clearly darker: a close-up silhouette against bright water, where a lift would only bring
 * it closer to the water).
 */
export function popDirection(meanContrast: number): number {
  return 1 - 2 * sstep(POP_DARK.lo, POP_DARK.hi, -meanContrast);
}

/** popDirection: the subject turns from lifted to deepened as it gets this much darker than the water (−ln ratio). */
export const POP_DARK = { lo: 0.12, hi: 0.35 };

/** Separable box blur, radius r (texels), edges clamped. */
function blur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[y * W + Math.min(W - 1, Math.max(0, k))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / (2 * r + 1);
      acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

/**
 * The local water and the subject's regional evidence (waterField), on the analysis guide's grid.
 *   water   a normalised blur of the guide texels that are water: clear of the ML mask (alpha below alphaMax over
 *           the whole texel, excluded subjects too) and, within `nearBand` of the mask, not departing clearly from the
 *           frame's typical water (a part of the animal the mask missed lies there and must not pass for water), over
 *           `blur` of the guide's width, eased (where the subject hides the water that near) into one over `wide`.
 *   ev      a texel departs from that water like an animal (Oklab ΔE evLo..evHi: a low bar, a shaded belly counts).
 *   trust   the share of animal-like texels among the mask's own around each point (±`region` of the width) over
 *           trustLo..trustHi, smoothed again: ~1 all over an animal (a shaded part included), ~0 over a region of
 *           water the mask leaked onto. It scales the tone and varies only over ≥ 2·region (≈ 80 px at 1280): a
 *           leak is under-popped as a region, never as patches.
 *   rampK / rampLong / thickR  the tone's feather inside the contour (composeSegStrength): rampK × the part's
 *           half-width (the largest inside distance within thickR mask px), between SEG_TONE.rampIn and rampLong
 *           mask px. It was half the half-width, up to 28 px: half of an animal's body was a slow fade, its wing
 *           tips and edges kept the water's blue, and the correction read as "barely there" (user clip, 12 Nov).
 *           Now a feather: 2.5 mask px on a fish, up to 8 on a body that fills the frame, enough for no halo;
 *           the water a fat contour covers is held back by the per-pixel test instead (thin parts: most of them
 *           now) and by the regional trust.
 */
export const SEG_WATER = { blur: 1 / 20, wide: 1 / 5, alphaMax: 0.02, evLo: 0.012, evHi: 0.035, nearBand: 1 / 8, farLo: 0.05, farHi: 0.09, region: 1 / 32, trustLo: 0.15, trustHi: 0.45, rampK: 0.15, rampLong: 8, thickR: 28 };

type Guide = { width: number; height: number; data: Float32Array };

/** R value of composeSegStrength on thick parts (the grade skips its per-pixel water test above 2). */
export const SEG_THICK = 9;

/**
 * The R channel of the strength texture with an AI overlay: its value (the local water's L, −1 or SEG_THICK) and the
 * subject's closeness (0..1, in SEG_RESTORE.levels steps) in one float: R + pack × the step. The readers (grade-shader
 * animalStrength, apply.ts segSample) unpack each texel before they interpolate, so both come out bilinear. A
 * closeness of 0 leaves R as it was.
 */
export function packSegR(r: number, close: number): number {
  return r + SEG_RESTORE.pack * Math.round(Math.min(1, Math.max(0, close)) * SEG_RESTORE.levels);
}

/** packSegR back: [R, closeness]. */
export function unpackSegR(r: number): [number, number] {
  const n = Math.floor((r + 8) / SEG_RESTORE.pack);
  return [r - SEG_RESTORE.pack * n, n / SEG_RESTORE.levels];
}

/** Bilinear resize of a w × h map to W × H (pixel centres aligned). */
function resample(f: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, ((y + 0.5) / H) * h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, ((x + 0.5) / W) * w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = f[y0 * w + x0] + (f[y0 * w + x1] - f[y0 * w + x0]) * tx;
      const b = f[y1 * w + x0] + (f[y1 * w + x1] - f[y1 * w + x0]) * tx;
      out[y * W + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** Chamfer (3-4) distance in px from each set texel of `bin` to the nearest unset one (0 on unset texels). */
function chamfer(bin: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = bin[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? INF : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
  }
  for (let i = 0; i < w * h; i++) d[i] = d[i] >= INF ? 1e4 : d[i] / 3;
  return d;
}

/**
 * The local water's Oklab L and the regional trust (see SEG_WATER) on the overlay grid, from the
 * analysis guide (linear RGB, RGBA). Null when the frame shows no water clear of the mask (the subject fills it).
 */
export function waterField(g: Guide, o: SegOverlay): { L: Float32Array; trust: Float32Array; sep: { width: number; height: number; dE: Float32Array; inside: Float32Array } } | null {
  const gw = g.width, gh = g.height, W = o.width, H = o.height, n = gw * gh;
  const lab = new Float32Array(n * 3), clear = new Uint8Array(n), inside = new Float32Array(n);
  for (let y = 0; y < gh; y++) {
    const oy0 = Math.floor((y * H) / gh), oy1 = Math.min(H, Math.max(oy0 + 1, Math.ceil(((y + 1) * H) / gh)));
    for (let x = 0; x < gw; x++) {
      const ox0 = Math.floor((x * W) / gw), ox1 = Math.min(W, Math.max(ox0 + 1, Math.ceil(((x + 1) * W) / gw)));
      let m = 0, a = 0, c = 0;
      for (let oy = oy0; oy < oy1; oy++) for (let ox = ox0; ox < ox1; ox++) {
        const k = oy * W + ox;
        m = Math.max(m, o.alpha[k], o.exclude ? o.exclude[k] : 0);
        a += o.alpha[k];
        c++;
      }
      const i = y * gw + x, k = i * 4;
      const v = linearToOklab(Math.max(0, g.data[k]), Math.max(0, g.data[k + 1]), Math.max(0, g.data[k + 2]));
      lab[i * 3] = v[0]; lab[i * 3 + 1] = v[1]; lab[i * 3 + 2] = v[2];
      clear[i] = m < SEG_WATER.alphaMax ? 1 : 0;
      inside[i] = a / c > 0.5 ? 1 : 0;
    }
  }
  const r1 = Math.max(1, Math.round(SEG_WATER.blur * gw)), r2 = Math.max(1, Math.round(SEG_WATER.wide * gw));
  const estimate = (wt: Float32Array): Float32Array[] | null => {
    let sumW = 0;
    for (let i = 0; i < n; i++) sumW += wt[i];
    if (sumW < 1) return null;
    const w1 = blur(wt, gw, gh, r1), w2 = blur(wt, gw, gh, r2);
    return [0, 1, 2].map((q) => {
      const f = new Float32Array(n);
      let s = 0;
      for (let i = 0; i < n; i++) { f[i] = lab[i * 3 + q] * wt[i]; s += f[i]; }
      const a1 = blur(f, gw, gh, r1), a2 = blur(f, gw, gh, r2), out = new Float32Array(n), mean = s / sumW;
      for (let i = 0; i < n; i++) {
        const wide = w2[i] > 1e-3 ? a2[i] / w2[i] : mean;
        out[i] = w1[i] > 1e-4 ? wide + (a1[i] / w1[i] - wide) * Math.min(1, w1[i] / 0.15) : wide;
      }
      return out;
    });
  };
  const evOf = (water: Float32Array[], lo = SEG_WATER.evLo, hi = SEG_WATER.evHi) => {
    const ev = new Float32Array(n);
    for (let i = 0; i < n; i++) ev[i] = sstep(lo, hi, Math.hypot(lab[i * 3] - water[0][i], lab[i * 3 + 1] - water[1][i], lab[i * 3 + 2] - water[2][i]));
    return ev;
  };
  // A part of the animal the mask missed lies next to the mask and would pass for water there: the clear texels
  // within nearBand of the mask that depart clearly from the frame's typical water (the median of the clear texels,
  // ΔE farLo..farHi) are left out of the water. Farther out every clear texel is water (bright surface water too).
  const wt0 = Float32Array.from(clear);
  let sumW = 0;
  for (let i = 0; i < n; i++) sumW += wt0[i];
  if (sumW < 1) return null;
  const med = [0, 1, 2].map((q) => {
    const v: number[] = [];
    for (let i = 0; i < n; i++) if (clear[i]) v.push(lab[i * 3 + q]);
    v.sort((x, y) => x - y);
    return v[v.length >> 1];
  });
  const dMask = chamfer(clear, gw, gh);
  const near = Math.max(2, Math.round(SEG_WATER.nearBand * gw));
  const wt1 = Float32Array.from(wt0, (v, i) => {
    if (!v || dMask[i] > near) return v;
    const dev = Math.hypot(lab[i * 3] - med[0], lab[i * 3 + 1] - med[1], lab[i * 3 + 2] - med[2]);
    return 1 - sstep(SEG_WATER.farLo, SEG_WATER.farHi, dev);
  });
  const water = estimate(wt1) ?? estimate(wt0)!;
  const ev = evOf(water);
  // Trust: the share of animal-like texels among the mask's own around each point, smoothed again.
  const rr = Math.max(1, Math.round(SEG_WATER.region * gw));
  const evIn = Float32Array.from(ev, (v, i) => v * inside[i]);
  const num = blur(evIn, gw, gh, rr), den = blur(inside, gw, gh, rr);
  const share = Float32Array.from(num, (v, i) => (den[i] > 1e-3 ? v / den[i] : 1));
  const trust = blur(share.map((v) => sstep(SEG_WATER.trustLo, SEG_WATER.trustHi, v)), gw, gh, rr);
  // How far each guide texel stands off its local water (Oklab ΔE), for the subjects' closeness (subjectCloseness).
  const dE = new Float32Array(n);
  for (let i = 0; i < n; i++) dE[i] = Math.hypot(lab[i * 3] - water[0][i], lab[i * 3 + 1] - water[1][i], lab[i * 3 + 2] - water[2][i]);
  return { L: resample(water[0], gw, gh, W, H), trust: resample(trust, gw, gh, W, H), sep: { width: gw, height: gh, dE, inside } };
}

/**
 * How close each subject of the mask is, 0..1 per overlay texel (0 off the mask), for the colour share of the AI
 * subject restore (SEG_RESTORE veilLo..veilHi): water veils what is far away, so a subject that hardly stands out
 * from the water around it (the mean Oklab ΔE of its texels on the analysis guide against the local water) is far,
 * whatever its size, and keeps most of the water's colour; one that stands out clearly is close. One value per
 * connected part of the mask (alpha over 0.5): the whole animal gets the same share, no patches. A part too small
 * to cover a guide texel is not measured: 0 (it is thin anyway: the colour share never gets past farKeep there).
 * `sep` null (no guide, or no water to compare with): 1 everywhere on the mask.
 */
export function subjectCloseness(o: SegOverlay, sep: { width: number; height: number; dE: Float32Array; inside: Float32Array } | null): Float32Array {
  const W = o.width, H = o.height, out = new Float32Array(W * H);
  if (!sep) { for (let i = 0; i < W * H; i++) out[i] = o.alpha[i] > 0.5 ? 1 : 0; return out; }
  const lab = new Int32Array(W * H), stack: number[] = [];
  let parts = 0;
  for (let s = 0; s < W * H; s++) {
    if (!(o.alpha[s] > 0.5) || lab[s]) continue;
    lab[s] = ++parts; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % W;
      if (x > 0 && o.alpha[i - 1] > 0.5 && !lab[i - 1]) { lab[i - 1] = parts; stack.push(i - 1); }
      if (x < W - 1 && o.alpha[i + 1] > 0.5 && !lab[i + 1]) { lab[i + 1] = parts; stack.push(i + 1); }
      if (i >= W && o.alpha[i - W] > 0.5 && !lab[i - W]) { lab[i - W] = parts; stack.push(i - W); }
      if (i < W * H - W && o.alpha[i + W] > 0.5 && !lab[i + W]) { lab[i + W] = parts; stack.push(i + W); }
    }
  }
  if (!parts) return out;
  const sum = new Float64Array(parts + 1), cnt = new Float64Array(parts + 1);
  for (let y = 0; y < sep.height; y++) for (let x = 0; x < sep.width; x++) {
    const gi = y * sep.width + x;
    if (!sep.inside[gi]) continue;
    const l = lab[Math.min(H - 1, Math.floor(((y + 0.5) / sep.height) * H)) * W + Math.min(W - 1, Math.floor(((x + 0.5) / sep.width) * W))];
    if (l) { sum[l] += sep.dE[gi]; cnt[l]++; }
  }
  for (let i = 0; i < W * H; i++) if (lab[i] && cnt[lab[i]] > 0) out[i] = sstep(SEG_RESTORE.veilLo, SEG_RESTORE.veilHi, sum[lab[i]] / cnt[lab[i]]);
  return out;
}

/** Square max filter of radius r (separable). */
function maxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
    tmp[y * w + x] = m;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let m = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
    out[y * w + x] = m;
  }
  return out;
}

/**
 * Overlay (+ the analysis guide) → the RGBA texture the grade reads with an AI overlay on the frame (grade-shader
 * animalStrength / toneWeight, at the overlay's size):
 *   R  the local water's Oklab L (waterField; −1 without water to compare with, or without a guide), on thin parts
 *      (a short ramp-in, see B) only: thick parts carry SEG_THICK (no per-pixel water test); packed with the
 *      subject's closeness (packSegR; subjectCloseness: the AI restore's colour share, SEG_RESTORE.farKeep);
 *   G  the regional trust (waterField: a leak onto the water is under-popped as a region; 1 without a guide);
 *   B  the ML alpha as the mask's signed distance (0.5 on the contour, SEG_TONE.alphaR), its inside slope eased by
 *      the local thickness: the tone ramps in over rampK × the part's half-width, between SEG_TONE.rampIn and
 *      SEG_WATER.rampLong mask px. A thin tail or fin is toned nearly to its edge; a big body fades in over a
 *      little more, so its edge is a feather, never a step or a halo. No guess of which edge is which: nothing flips;
 *   A  the ML weight (near map).
 */
export function composeSegStrength(o: SegOverlay, guide: Guide | null = null): { width: number; height: number; data: Float32Array } {
  const W = o.width, H = o.height, R = SEG_TONE.alphaR;
  const out = new Float32Array(W * H * 4);
  const wf = guide ? waterField(guide, o) : null;
  const bin = Uint8Array.from(o.alpha, (a) => (a > 0.5 ? 1 : 0));
  const dIn = chamfer(bin, W, H);
  // Local half-width: the largest inside distance nearby (a body's spine), smoothed so the ramp length varies slowly.
  const thick = blur(maxFilter(Float32Array.from(dIn, (d, i) => (bin[i] ? d : 0)), W, H, SEG_WATER.thickR), W, H, Math.round(SEG_WATER.thickR / 2));
  // (Spread a little past the mask: the texels just outside the contour are read with it, bilinearly.)
  const close = maxFilter(subjectCloseness(o, wf ? wf.sep : null), W, H, 2);
  for (let i = 0; i < W * H; i++) {
    let a = o.alpha[i];
    const ramp = Math.min(SEG_WATER.rampLong, Math.max(SEG_TONE.rampIn, SEG_WATER.rampK * thick[i]));
    if (a > 0.5) {
      // The distance the shader reads back, shrunk so its ramp-in (rampIn) spans `ramp` here.
      a = Math.min(a, 0.5 + Math.min(R, Math.max(0, dIn[i] - 0.5) * (SEG_TONE.rampIn / ramp)) / (2 * R));
    }
    // Thick parts carry R = SEG_THICK (no per-pixel test: their ramp is long, the contour's water gets next to nothing).
    out[i * 4] = packSegR(!wf ? -1 : ramp > 1.5 * SEG_TONE.rampIn ? SEG_THICK : wf.L[i], close[i]);
    out[i * 4 + 1] = (wf ? wf.trust[i] : 1) * (o.quality ?? 1);
    out[i * 4 + 2] = a;
    out[i * 4 + 3] = o.near[i];
  }
  return { width: W, height: H, data: out };
}
