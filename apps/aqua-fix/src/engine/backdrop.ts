// Backdrop model: open water is smooth. In a frame that is mostly water (a
// pelagic shark, a diver in blue water, a fish over green murk) the water's
// colour varies only slowly across the frame — a vertical gradient, a
// vignette — so a low-order surface fitted robustly to the frame predicts
// what "just water" looks like at every pixel. Whatever departs from that
// surface in lightness or colour is a subject, even when it shares the
// water's hue (a blue-grey shark under a blue cast, which the hue test calls
// water). The analysis raises its object confidence there, so the subject
// takes the object path and separates from the water. Frames the surface
// does not explain (a reef filling the frame) get no backdrop at all.

export const BACKDROP = {
  /** Oklab ΔE from the fitted water at which a pixel starts / is fully a subject. */
  devLo: 0.035,
  devHi: 0.085,
  /** The per-pixel veto (backdropSubject) ramps over a wider range: a hard cut would draw the subject/water boundary as a line across a blue-grey flank. */
  vetoLo: 0.015,
  vetoHi: 0.1,
  /** The veto / whole-animal growth count a darker-than-water departure this much (more than the subject seeds
   * do, darkWeight): in clear blue water a dark back or fin is part of the animal, not haze. */
  vetoDark: 0.9,
  /** Lenient ramp trimming the whole-animal map for the subject tone: a dim, far animal departs from the water only
   * a little, yet must get the same tone as a near one (the dilated map already confines it to the animal). */
  subjLo: 0.02,
  subjHi: 0.05,
  /** Map strength above which a pixel counts as inside the animal (only plain water, departure below coreLo..coreHi,
   * is still cut there: a map that spilled onto the water around an animal leaves no grey patch). */
  coreIn: 0.85,
  coreLo: 0.012,
  coreHi: 0.03,
  /** Deep inside a tracked animal (animals.ts interior hold) only water the surface predicts (departure below
   * holdLo..holdHi) is still left out: a stretch of body lit like the water is toned with the rest. */
  holdLo: 0.004,
  holdHi: 0.01,
  /** Chroma distance counts this much relative to lightness. */
  abWeight: 1.5,
  /** A pixel darker than the water counts this much of its lightness gap: a faint
   * shape in the haze (far reef) is not a subject to pull out of the water. */
  darkWeight: 0.4,
  /** Share of the frame the surface explains (inliers) for the model to hold. */
  inlierLo: 0.6,
  inlierHi: 0.8,
  /** Robust residual scale of the fit: a backdrop noisier than this is not smooth water. */
  rmsLo: 0.02,
  rmsHi: 0.04,
  /** Inlier: residual below this many robust scales (and below devLo). */
  inlierK: 2.5,
  /** Edge evidence: deviation gradient (ΔE per thumbnail pixel) within edgeRadius pixels that makes a subject. */
  edgeLo: 0.006,
  edgeHi: 0.014,
  edgeRadius: 10,
  /** The shaders reach this far (map texels, 160×90 map) around a pixel for the subject map: a moving
   * subject that has left the (lagging) map is still found there and trimmed to its outline per pixel.
   * Kept short: a wide reach tones lit water beside a fast tail (the per-pixel trim cannot tell it from the
   * animal); following motion is the temporal prior's job (temporal.ts). */
  ringR: 2,
  /** A user seed (tap) marks pixels within this radius (thumbnail pixels) of it. */
  seedR: 2,
  /** Closing radius (thumbnail pixels) of the whole-animal map. */
  closeR: 4,
  /** A closed region that bridges this many separate animals is a school, toned not at all (bridged, the water
   * between them would be toned too). */
  schoolN: 3,
  /** Share of a subject's outline that borders far-hue pixels (lo..hi) at which it is a colourful fish, left alone. */
  farShareLo: 0.15,
  farShareHi: 0.3,
  /** Solidity: share of a closed subject (lo..hi) that departs from the water strongly (veto-ramped departure ≥ solidDev).
   * A near animal is mostly solid; a hazy, far group the flood joined through lit water is mostly faint and
   * would tone as a grey cloud with the water in it. */
  solidDev: 0.8,
  /** Share of a subject's own strong departure (its 90th percentile) a pixel needs to stay in it. */
  relKeep: 0.3,
  solidLo: 0.2,
  solidHi: 0.26,
  /** Share of the frame width (lo..hi) a region spans along the bottom edge at which it is the seabed, a reef or
   * something held from below (a spear gun), never an animal: in open water a swimming animal does not rest its
   * whole length on the bottom edge (its texture alone does not tell a coral from a shark at this resolution). */
  bottomLo: 0.04,
  bottomHi: 0.08,
  /** Margin (thumbnail pixels) around far-hue pixels that the whole-animal flood never enters. */
  farMargin: 2,
  /** Whole-animal growth (growSubjects): seed threshold (share of validity), the veto-ramped departure a
   * pixel needs to join a subject, and the subject size (share of the frame) below which it is a small fish. */
  seedFrac: 0.5,
  growDev: 0.06,
  minArea: 0.008,
  /** An unseeded region joins when its veto-ramped departure has an outline this steep (per thumbnail pixel). */
  /** A subject is toned only when this share of it (lo..hi) is lighter than the water by lightDL (Oklab L). */
  lightDL: 0.03,
  lightShareLo: 0.12,
  lightShareHi: 0.25,
  growEdgeLo: 0.08,
  growEdgeHi: 0.16,
  /** Bubble columns (bubbleLike): interior texture (Oklab L per thumbnail pixel) below lo..hi, chroma kept (share of
   * the water's, lo..hi), lighter than the water (Oklab L, lo..hi), taller than wide (height / width, lo..hi). */
  bubbleTexLo: 0.015,
  bubbleTexHi: 0.019,
  bubbleCrLo: 0.84,
  bubbleCrHi: 0.88,
  bubbleDLLo: 0.025,
  bubbleDLHi: 0.04,
  bubbleTallLo: 0.9,
  bubbleTallHi: 1.1,
  /** Veil B/G ratio over which a frame counts as clear blue water (the model runs only there; murk is left to the hue test). */
  blueLo: 1.3,
  blueHi: 1.7,
  /** Grid step (thumbnail pixels) of the fit samples. */
  step: 4,
  iterations: 3,
};

/** Diagnostics of growSubjects' regions (harness only; null = off). */
export let GROW_DEBUG: Record<string, number>[] | null = null;
export function setGrowDebug(on: boolean): void { GROW_DEBUG = on ? [] : null; }

const TERMS = 6; // 1, x, y, x², xy, y²

/** Solves the TERMS×TERMS system A·c = b (Gaussian elimination, partial pivoting); A and b are clobbered. */
function solve(A: Float64Array, b: Float64Array, x: Float64Array): boolean {
  const n = TERMS;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r * n + col]) > Math.abs(A[piv * n + col])) piv = r;
    if (Math.abs(A[piv * n + col]) < 1e-12) return false;
    if (piv !== col) {
      for (let k = 0; k < n; k++) { const t = A[col * n + k]; A[col * n + k] = A[piv * n + k]; A[piv * n + k] = t; }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / A[col * n + col];
      if (f === 0) continue;
      for (let k = col; k < n; k++) A[r * n + k] -= f * A[col * n + k];
      b[r] -= f * b[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    x[r] = s / A[r * n + r];
  }
  return true;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const AB2 = BACKDROP.abWeight * BACKDROP.abWeight;
const evalAt3 = (f: ArrayLike<number>, x: number, y: number) => f[0] + f[1] * x + f[2] * y + f[3] * x * x + f[4] * x * y + f[5] * y * y;
const evalAt = (c: Float64Array, x: number, y: number) => c[0] + c[1] * x + c[2] * y + c[3] * x * x + c[4] * x * y + c[5] * y * y;

/**
 * Subject confidence from departure from the fitted water backdrop, written
 * to `out` (0..1 per thumbnail pixel). `L`, `A`, `B` are the thumbnail's
 * Oklab planes; `waterW` (0..1) weights each pixel's vote for the surface
 * (pixels whose hue is far from the veil's cannot be water). Returns the
 * model's validity (0 → `out` is all zero).
 */
export function backdropObjectness(L: Float32Array, A: Float32Array, B: Float32Array, waterW: Float32Array, w: number, h: number, out: Float32Array, fitOut?: Float32Array, devOut?: Float32Array): number {
  const n = w * h;
  out.fill(0, 0, n);
  fitOut?.fill(0);
  devOut?.fill(1, 0, n);
  const st = BACKDROP.step;
  const gw = Math.ceil(w / st), gh = Math.ceil(h / st), m = gw * gh;
  const sx = new Float32Array(m), sy = new Float32Array(m), sl = new Float32Array(m), sa = new Float32Array(m), sb = new Float32Array(m), sw = new Float32Array(m);
  let wSum = 0;
  for (let gy = 0, k = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++, k++) {
    const x = Math.min(w - 1, gx * st), y = Math.min(h - 1, gy * st), i = y * w + x;
    sx[k] = (x + 0.5) / w - 0.5; sy[k] = (y + 0.5) / h - 0.5;
    sl[k] = L[i]; sa[k] = A[i]; sb[k] = B[i]; sw[k] = waterW[i]; wSum += sw[k];
  }
  if (wSum < m * 0.3) return 0;
  const rob = new Float32Array(m).fill(1);
  const dev = new Float32Array(m);
  const N = new Float64Array(TERMS * TERMS), M = new Float64Array(TERMS * TERMS);
  const bL = new Float64Array(TERMS), bA = new Float64Array(TERMS), bB = new Float64Array(TERMS), tb = new Float64Array(TERMS);
  const cL = new Float64Array(TERMS), cA = new Float64Array(TERMS), cB = new Float64Array(TERMS);
  const phi = new Float64Array(TERMS);
  const hist = new Uint32Array(256);
  let scale = 0.05;
  for (let it = 0; it < BACKDROP.iterations; it++) {
    N.fill(0); bL.fill(0); bA.fill(0); bB.fill(0);
    for (let k = 0; k < m; k++) {
      const wk = sw[k] * rob[k];
      if (wk <= 1e-6) continue;
      const x = sx[k], y = sy[k];
      phi[0] = 1; phi[1] = x; phi[2] = y; phi[3] = x * x; phi[4] = x * y; phi[5] = y * y;
      for (let r = 0; r < TERMS; r++) {
        const pr = phi[r] * wk;
        for (let c = r; c < TERMS; c++) N[r * TERMS + c] += pr * phi[c];
        bL[r] += pr * sl[k]; bA[r] += pr * sa[k]; bB[r] += pr * sb[k];
      }
    }
    for (let r = 0; r < TERMS; r++) for (let c = 0; c < r; c++) N[r * TERMS + c] = N[c * TERMS + r];
    M.set(N); tb.set(bL); if (!solve(M, tb, cL)) return 0;
    M.set(N); tb.set(bA); if (!solve(M, tb, cA)) return 0;
    M.set(N); tb.set(bB); if (!solve(M, tb, cB)) return 0;
    // Robust scale: median residual of the water-weighted samples (histogram, 0..0.256 in 0.001 steps).
    hist.fill(0);
    let cnt = 0;
    for (let k = 0; k < m; k++) {
      const x = sx[k], y = sy[k];
      const el = sl[k] - evalAt(cL, x, y), ea = sa[k] - evalAt(cA, x, y), eb = sb[k] - evalAt(cB, x, y);
      const d = Math.sqrt(el * el + AB2 * (ea * ea + eb * eb));
      dev[k] = d;
      if (sw[k] > 0.5) { hist[Math.min(255, (d * 1000) | 0)]++; cnt++; }
    }
    if (cnt < 50) return 0;
    let acc = 0, med = 0;
    for (; med < 256; med++) { acc += hist[med]; if (acc * 2 >= cnt) break; }
    scale = Math.max(0.004, 1.4826 * (med + 0.5) / 1000);
    for (let k = 0; k < m; k++) { const u = dev[k] / (2.5 * scale); rob[k] = 1 / (1 + u * u); }
  }
  // How much of the frame the surface explains.
  const lim = Math.min(BACKDROP.devLo, BACKDROP.inlierK * scale);
  let inl = 0;
  for (let k = 0; k < m; k++) if (dev[k] < lim) inl++;
  const validity = smoothstep(BACKDROP.inlierLo, BACKDROP.inlierHi, inl / m) * (1 - smoothstep(BACKDROP.rmsLo, BACKDROP.rmsHi, scale));
  if (validity <= 0) return 0;
  if (fitOut) for (let r = 0; r < TERMS; r++) { fitOut[r] = cL[r]; fitOut[TERMS + r] = cA[r]; fitOut[2 * TERMS + r] = cB[r]; }
  // Deviation field, written to `out` first.
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / h - 0.5;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / w - 0.5, i = y * w + x;
      const dl = L[i] - evalAt(cL, fx, fy);
      const el = dl > 0 ? dl : dl * BACKDROP.darkWeight, ea = A[i] - evalAt(cA, fx, fy), eb = B[i] - evalAt(cB, fx, fy);
      const ab2 = AB2 * (ea * ea + eb * eb);
      out[i] = Math.sqrt(el * el + ab2);
      if (devOut) { const ev = dl > 0 ? dl : dl * BACKDROP.vetoDark; devOut[i] = smoothstep(BACKDROP.vetoLo, BACKDROP.vetoHi, Math.sqrt(ev * ev + ab2)); }
    }
  }
  // A subject has an outline; a sun glow near the surface or a light shaft
  // departs from the surface just as far but only gradually. Edge evidence =
  // the strongest deviation gradient within edgeRadius (separable max).
  const grad = new Float32Array(n), mx = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = out[i + 1] - out[i - 1], gy = out[i + w] - out[i - w];
    grad[i] = 0.5 * Math.sqrt(gx * gx + gy * gy);
  }
  maxFilter(grad, mx, w, h, BACKDROP.edgeRadius);
  // Plain departure from the surface (no outline test, veto ramp): 0 = this pixel is the water the surface predicts.
  // The interior of a large, flat subject is far from its outline: every
  // connected departure region takes the strongest edge evidence found
  // along it (a glow has none anywhere).
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (label[s] >= 0 || out[s] < BACKDROP.devLo) continue;
    let top = 0, best = 0;
    stack[top++] = s; label[s] = s;
    while (top > 0) {
      const i = stack[--top];
      if (mx[i] > best) best = mx[i];
      const x = i % w;
      if (x > 0 && label[i - 1] < 0 && out[i - 1] >= BACKDROP.devLo) { label[i - 1] = s; stack[top++] = i - 1; }
      if (x < w - 1 && label[i + 1] < 0 && out[i + 1] >= BACKDROP.devLo) { label[i + 1] = s; stack[top++] = i + 1; }
      if (i >= w && label[i - w] < 0 && out[i - w] >= BACKDROP.devLo) { label[i - w] = s; stack[top++] = i - w; }
      if (i < n - w && label[i + w] < 0 && out[i + w] >= BACKDROP.devLo) { label[i + w] = s; stack[top++] = i + w; }
    }
    grad[s] = best; // the seed's slot holds the region's evidence (seeds are visited once)
  }
  for (let i = 0; i < n; i++) {
    const e = label[i] >= 0 ? Math.max(mx[i], grad[label[i]]) : mx[i];
    out[i] = validity * smoothstep(BACKDROP.devLo, BACKDROP.devHi, out[i]) * smoothstep(BACKDROP.edgeLo, BACKDROP.edgeHi, e);
  }
  return validity;
}

/** Separable (2r+1)² max filter, van Herk / Gil-Werman (O(n) per pass). */
export function maxFilter(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(w * h);
  const pass = (inp: Float32Array, out: Float32Array, len: number, count: number, stride: number, step: number) => {
    const k = 2 * r + 1;
    const g = new Float32Array(len + k), hh = new Float32Array(len + k);
    for (let c = 0; c < count; c++) {
      const base = c * stride;
      // padded line: index j ↔ position j − r, clamped outside by 0 (grad ≥ 0)
      const at = (j: number) => { const p = j - r; return p < 0 || p >= len ? 0 : inp[base + p * step]; };
      const L = len + 2 * r;
      for (let j = 0; j < L; j++) g[j] = j % k === 0 ? at(j) : Math.max(g[j - 1], at(j));
      for (let j = L - 1; j >= 0; j--) hh[j] = j === L - 1 || (j + 1) % k === 0 ? at(j) : Math.max(hh[j + 1], at(j));
      for (let p = 0; p < len; p++) out[base + p * step] = Math.max(hh[p], g[p + 2 * r]);
    }
  };
  pass(src, tmp, w, h, w, 1);
  pass(tmp, dst, h, w, 1, w);
}

/**
 * Per-pixel subject test against a fitted backdrop (`fit` = the 18 surface
 * coefficients L, a, b; see backdropObjectness): 0 = the pixel is the water
 * the surface predicts at upright (u, v), 1 = it departs from it like a
 * subject. No outline test (the shaders run it per pixel at frame rate, so
 * it can only veto a lagging map's verdict, never create one). Mirrored in
 * the shaders (grade-shader.ts backdropSubject).
 */
export function backdropSubject(L: number, a: number, b: number, u: number, v: number, fit: ArrayLike<number>, lo: number = BACKDROP.vetoLo, hi: number = BACKDROP.vetoHi): number {
  return smoothstep(lo, hi, backdropDev(L, a, b, u, v, fit));
}

/** Raw departure of a pixel from the backdrop surface (see backdropSubject; mirrored in the shaders' backdropDev). */
export function backdropDev(L: number, a: number, b: number, u: number, v: number, fit: ArrayLike<number>): number {
  const x = u - 0.5, y = v - 0.5;
  const at = (o: number) => fit[o] + fit[o + 1] * x + fit[o + 2] * y + fit[o + 3] * x * x + fit[o + 4] * x * y + fit[o + 5] * y * y;
  const dl = L - at(0);
  const el = dl > 0 ? dl : dl * BACKDROP.vetoDark, ea = a - at(TERMS), eb = b - at(2 * TERMS);
  return Math.sqrt(el * el + AB2 * (ea * ea + eb * eb));
}

/**
 * Whole-animal subject map: from confident subject seeds (objectness ≥
 * seedFrac of the frame's validity) a flood fills every connected pixel that
 * departs from the water surface at all (dev ≥ growDev, the veto ramp), so a
 * dark back, fins and a thin tail join the bright flank they belong to. Each
 * connected subject is weighted by its size (minArea..2·minArea of the
 * frame): small fish keep the normal grade and their own colour. `dev` is the
 * veto-ramped departure (backdropObjectness devOut). Output 0..1 in `out`.
 */
export function growSubjects(objectness: Float32Array, dev: Float32Array, validity: number, w: number, h: number, out: Float32Array, L?: Float32Array, fit?: ArrayLike<number>, waterW?: Float32Array, seeds?: readonly { u: number; v: number }[], A?: Float32Array, B?: Float32Array, notAnimal?: Float32Array): number {
  const n = w * h;
  out.fill(0, 0, n);
  if (validity <= 0) return 0;
  // User seeds (a tap asking for a subject there, animals.ts): pixels near each start a flood that is accepted
  // whatever the automatic tests say (size, solidity, edges), as long as it departs from the water at all.
  const userSeed = new Uint8Array(n);
  for (const sd of seeds ?? []) {
    const cx = Math.round(sd.u * w - 0.5), cy = Math.round(sd.v * h - 0.5), r = BACKDROP.seedR;
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) userSeed[y * w + x] = 1;
  }
  // Pixels whose hue cannot be water (a yellow fish), and a small margin
  // around them (their blur halo), belong to another object: the flood never
  // enters them, so a fish touching the shark is neither toned nor merged.
  let block: Float32Array | null = null;
  if (waterW) {
    const far = new Float32Array(n);
    for (let i = 0; i < n; i++) far[i] = waterW[i] < 0.5 ? 1 : 0;
    block = new Float32Array(n);
    maxFilter(far, block, w, h, BACKDROP.farMargin);
  }
  let litAny = 0;
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const members = new Int32Array(n);
  const accepted = new Uint8Array(n);
  const seed = BACKDROP.seedFrac * validity;
  const grad = (i: number) => {
    const x = i % w;
    const gx = (x < w - 1 ? dev[i + 1] : dev[i]) - (x > 0 ? dev[i - 1] : dev[i]);
    const gy = (i < n - w ? dev[i + w] : dev[i]) - (i >= w ? dev[i - w] : dev[i]);
    return 0.5 * Math.sqrt(gx * gx + gy * gy);
  };
  for (let s = 0; s < n; s++) {
    if (label[s] >= 0 || (block && block[s] > 0) || (objectness[s] < seed && dev[s] < BACKDROP.growDev)) continue;
    let top = 0, cnt = 0, seeded = false, edge = 0, light = 0, user = false;
    stack[top++] = s; label[s] = s;
    while (top > 0) {
      const i = stack[--top];
      members[cnt++] = i;
      if (objectness[i] >= seed) seeded = true;
      if (userSeed[i]) user = true;
      if (L && fit) { const fx = ((i % w) + 0.5) / w - 0.5, fy = (Math.floor(i / w) + 0.5) / h - 0.5; if (L[i] - evalAt3(fit, fx, fy) > BACKDROP.lightDL) light++; }
      const g = grad(i);
      if (g > edge) edge = g;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
      for (const j of nb) if (j >= 0 && label[j] < 0 && !(block && block[j] > 0) && (dev[j] >= BACKDROP.growDev || objectness[j] >= seed)) { label[j] = s; stack[top++] = j; }
    }
    // A region with no confident seed still counts when it has an outline
    // (a dim, far animal); a sun glow departs just as far but has none.
    let accept = seeded ? 1 : smoothstep(BACKDROP.growEdgeLo, BACKDROP.growEdgeHi, edge);
    {
      let bottom = 0;
      for (let m = 0; m < cnt; m++) if (members[m] >= n - w) bottom++;
      accept *= 1 - smoothstep(BACKDROP.bottomLo, BACKDROP.bottomHi, bottom / w);
    }
    // A subject much of whose outline borders far-hue pixels is a colourful fish (a blue body with a yellow
    // tail): toned, it would turn half grey; it keeps its colour.
    if (block) {
      let bTot = 0, bFar = 0;
      for (let m = 0; m < cnt; m++) {
        const i = members[m], x = i % w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
        for (const j of nb) if (j >= 0 && label[j] !== s) { bTot++; if (block[j] > 0) bFar++; }
      }
      accept *= 1 - smoothstep(BACKDROP.farShareLo, BACKDROP.farShareHi, bFar / Math.max(1, bTot));
    }
    // A column of bubbles (a diver's exhaust rising to the surface) departs from the water like a subject but is
    // no animal: Subject pop would turn it a beige-grey streak. Bubbles are lighter than the water, keep the water's
    // hue and most of its chroma (translucent), have no texture of their own at this scale, and rise in tall columns;
    // an animal is darker or carries its own markings, or is wider than tall. Reported per pixel in `notAnimal`
    // (the animal labels drop it); the subject map itself, which the base grade reads too, is unchanged.
    const st = L && fit && A && B ? regionStats(members, cnt, label, s, w, h, L, A, B, fit, dev) : null;
    if (st && notAnimal) { const b = bubbleLike(st); if (b > 0) for (let m = 0; m < cnt; m++) notAnimal[members[m]] = b; }
    // Does the frame hold an animal with a lit side (a shark's flank and
    // belly)? Clip-locked, this decides whether subjects are toned at all: a
    // diver in a black suit or a dim far silhouette alone would read as a
    // beige-grey cut-out, while in a clip with a lit animal its dim, far
    // frames (the same shark turning away) keep the same tone.
    const lit = L && fit ? smoothstep(BACKDROP.lightShareLo, BACKDROP.lightShareHi, light / cnt) : 1;
    litAny = Math.max(litAny, lit * accept * smoothstep(BACKDROP.minArea, 2 * BACKDROP.minArea, cnt / n));
    if (GROW_DEBUG && cnt / n > 0.004 && st) GROW_DEBUG.push({ ...st, area: cnt / n, seeded: seeded ? 1 : 0, edge, accept, lit });
    // Steep size ramp: a subject is toned whole or not at all (the engine eases the change over time).
    const sizeW = user ? (cnt / n >= 0.25 * BACKDROP.minArea ? 1 : 0) : accept * smoothstep(1.5 * BACKDROP.minArea, 2 * BACKDROP.minArea, cnt / n);
    if (sizeW <= 0) continue;
    accepted[s] = user ? 2 : 1;
    // The whole region gets one strength (no internal seams); the shaders feather it at the true outline.
    // Relative hysteresis: lit water the flood crept into around a bright animal departs only weakly next to the
    // animal's own body; it is left out (a dim, far animal, weak everywhere, keeps all of itself). The closing
    // below re-joins short gaps inside the body.
    const ds = new Float32Array(cnt);
    for (let m = 0; m < cnt; m++) ds[m] = dev[members[m]];
    ds.sort();
    const keepDev = BACKDROP.relKeep * ds[Math.min(cnt - 1, Math.floor(0.9 * cnt))];
    for (let m = 0; m < cnt; m++) if (dev[members[m]] >= keepDev || objectness[members[m]] >= seed) out[members[m]] = sizeW;
  }
  // Closing (max then min filter): a narrow stretch of the body that happens
  // to match the water (a tail stock lit like the water) joins the parts on
  // either side instead of leaving a blue seam.
  const tmp = new Float32Array(n);
  maxFilter(out, tmp, w, h, BACKDROP.closeR);
  for (let i = 0; i < n; i++) tmp[i] = 1 - tmp[i];
  maxFilter(tmp, out, w, h, BACKDROP.closeR);
  for (let i = 0; i < n; i++) out[i] = 1 - out[i];
  // A closed region bridging several animals is a school: none of it is toned.
  const comp = new Uint8Array(n);
  for (let s0 = 0; s0 < n; s0++) {
    if (comp[s0] || out[s0] <= 0) continue;
    let top = 0, cnt = 0, solid = 0;
    const regions = new Set<number>();
    stack[top++] = s0; comp[s0] = 1;
    while (top > 0) {
      const i = stack[--top];
      members[cnt++] = i;
      if (label[i] >= 0 && accepted[label[i]]) regions.add(label[i]);
      if (dev[i] >= BACKDROP.solidDev) solid++;
      const x = i % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, j = i + dy * w + dx;
        if ((dx | dy) === 0 || xx < 0 || xx >= w || j < 0 || j >= n || comp[j] || out[j] <= 0) continue;
        comp[j] = 1; stack[top++] = j;
      }
    }
    // Whole or not at all: a school, or a mostly faint region (a hazy group joined through lit water), is dropped;
    // solidity is judged over the joined animal, so a dim far body keeps the tone its tail earns.
    let userRegion = false;
    for (const r of regions) if (accepted[r] === 2) userRegion = true;
    const keep = userRegion ? 1 : regions.size >= BACKDROP.schoolN ? 0 : smoothstep(BACKDROP.solidLo, BACKDROP.solidHi, solid / cnt);
    if (keep < 1) for (let m = 0; m < cnt; m++) out[members[m]] *= keep;
  }
  return litAny;
}

type RegionStats = { tex: number; dL: number; cr: number; aspect: number; sharp: number; cx: number; cy: number };

/** Appearance of one flood region (members[0..cnt) labelled `id`) against the fitted water (see growSubjects). */
function regionStats(members: Int32Array, cnt: number, label: Int32Array, id: number, w: number, h: number, L: Float32Array, A: Float32Array, B: Float32Array, fit: ArrayLike<number>, dev: Float32Array): RegionStats {
  const n = w * h;
  let tex = 0, tn = 0, dLs = 0, cr = 0, sharp = 0, per = 0, mx = 0, my = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let m = 0; m < cnt; m++) {
    const i = members[m], x = i % w, y = (i - x) / w;
    mx += x; my += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    const fx = (x + 0.5) / w - 0.5, fy = (y + 0.5) / h - 0.5;
    const wa = fit[6] + fit[7] * fx + fit[8] * fy + fit[9] * fx * fx + fit[10] * fx * fy + fit[11] * fy * fy;
    const wb = fit[12] + fit[13] * fx + fit[14] * fy + fit[15] * fx * fx + fit[16] * fx * fy + fit[17] * fy * fy;
    dLs += L[i] - evalAt3(fit, fx, fy);
    cr += Math.hypot(A[i], B[i]) / Math.max(1e-3, Math.hypot(wa, wb));
    const inner = x > 0 && y > 0 && x < w - 1 && y < h - 1;
    if (inner && label[i - 1] === id && label[i + 1] === id && label[i - w] === id && label[i + w] === id) {
      tex += Math.hypot(L[i + 1] - L[i - 1], L[i + w] - L[i - w]) * 0.5; tn++;
    } else if (inner) {
      let g = 0;
      for (let d = 1; d <= 2; d++) for (const j of [i - d, i + d, i - d * w, i + d * w]) if (j >= 0 && j < n) g = Math.max(g, Math.abs(dev[i] - dev[j]) / d);
      sharp += g; per++;
    }
  }
  return { tex: tn ? tex / tn : 0, dL: dLs / cnt, cr: cr / cnt, aspect: (y1 - y0 + 1) / (x1 - x0 + 1), sharp: per ? sharp / per : 0, cx: mx / cnt, cy: my / cnt };
}

/** How much a region looks like a bubble column rather than an animal (0..1; see growSubjects). */
export function bubbleLike(st: { tex: number; dL: number; cr: number; aspect: number }): number {
  return (1 - smoothstep(BACKDROP.bubbleTexLo, BACKDROP.bubbleTexHi, st.tex)) * smoothstep(BACKDROP.bubbleCrLo, BACKDROP.bubbleCrHi, st.cr)
    * smoothstep(BACKDROP.bubbleDLLo, BACKDROP.bubbleDLHi, st.dL) * smoothstep(BACKDROP.bubbleTallLo, BACKDROP.bubbleTallHi, st.aspect);
}
