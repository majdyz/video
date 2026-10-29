// Highlight scoring (feature 9a): pick the best moments of a dive clip for a
// 30 / 60 / 90 s reel. Plain logic over arrays, no DOM, so node tests run it.
//
// Two layers:
//
// 1. Feature extraction from downscaled frames (any RGBA ImageData-like
//    {data, width, height}; 160×90 is plenty):
//      frameFeatures(frame, prev?)       → {sharpness, colour, motion, change, luma, hist}
//        sharpness: variance of the 4-neighbour Laplacian of luma (0..1 luma units, ×1000)
//        colour:    Hasler & Süsstrunk colourfulness (σ_rgyb + 0.3·μ_rgyb) / 255
//        motion:    global shift vs prev from a coarse SAD search, fraction of width per frame
//        change:    colour-histogram distance vs prev (0..1, 4×4×4 RGB bins), for scene cuts
//      windowFeatures(frames, {windowS, sourceS, subject?, calm?}) → HighlightWindow[]
//        aggregates per window (median sharpness, mean colour, motion → calm)
//      detectCuts(frames, {threshold?, minGapS?}) → cut times (s)
//
// 2. Selection:
//      pickHighlights(windows, {targetS, sourceS, cuts?, …}) → HighlightReel
//    * windows below the sharpness gate are never used (blurry);
//    * score = weighted mix of robustly normalised sharpness, subject cover,
//      colour richness and camera calm (missing features drop out of the mix);
//    * candidate clips live inside one shot (between scene cuts) and start on
//      the cut when one is near, so a pick never straddles a cut;
//    * greedy choice with a proximity penalty spreads picks across the dive,
//      no overlaps, then lengths are trimmed so the reel is exactly targetS
//      (±1 ms) whenever the source has enough usable footage;
//    * picks come back in source order.

// ------------------------------------------------------------------ features

export type FrameLike = { data: ArrayLike<number>; width: number; height: number };

export type FrameFeatures = {
  /** Variance of the luma Laplacian ×1000 (luma 0..1). Blur drives it toward 0. */
  sharpness: number;
  /** Colourfulness, roughly 0 (grey) .. 0.5 (very vivid). */
  colour: number;
  /** Global shift vs the previous frame, fraction of the frame width (0 without prev). */
  motion: number;
  /** Histogram distance vs the previous frame, 0..1 (0 without prev). */
  change: number;
  /** Mean luma 0..1. */
  luma: number;
  /** 64-bin (4×4×4) RGB histogram, normalised to sum 1. */
  hist: number[];
  /** Luma plane at half size (for the next frame's motion search). */
  small: { w: number; h: number; y: Float32Array };
};

const HIST_BINS = 64;

function lumaPlane(f: FrameLike): Float32Array {
  const n = f.width * f.height;
  const y = new Float32Array(n);
  const d = f.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) y[i] = (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255;
  return y;
}

function halve(y: Float32Array, w: number, h: number): { w: number; h: number; y: Float32Array } {
  const W = w >> 1, H = h >> 1;
  const o = new Float32Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = 2 * r * w + 2 * c;
    o[r * W + c] = (y[i] + y[i + 1] + y[i + w] + y[i + w + 1]) / 4;
  }
  return { w: W, h: H, y: o };
}

/** Best integer shift (dx, dy) within ±R minimising the mean absolute difference; returns the shift and its residual. */
function globalShift(a: { w: number; h: number; y: Float32Array }, b: { w: number; h: number; y: Float32Array }, R: number) {
  let best = { dx: 0, dy: 0, sad: Infinity };
  const { w, h } = a;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 48));
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    let s = 0, n = 0;
    for (let r = R; r < h - R; r += step) for (let c = R; c < w - R; c += step) {
      s += Math.abs(a.y[r * w + c] - b.y[(r + dy) * w + c + dx]);
      n++;
    }
    const sad = n ? s / n : Infinity;
    // Prefer the smaller shift on near-ties (flat water has many equal matches).
    if (sad < best.sad - 1e-6 || (Math.abs(sad - best.sad) <= 1e-6 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { dx, dy, sad };
  }
  return best;
}

export function frameFeatures(f: FrameLike, prev?: FrameFeatures | null): FrameFeatures {
  const { width: w, height: h } = f;
  const y = lumaPlane(f);
  // Laplacian variance.
  let sum = 0, sum2 = 0, n = 0;
  for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) {
    const i = r * w + c;
    const l = 4 * y[i] - y[i - 1] - y[i + 1] - y[i - w] - y[i + w];
    sum += l;
    sum2 += l * l;
    n++;
  }
  const sharpness = n ? (sum2 / n - (sum / n) ** 2) * 1000 : 0;
  // Colourfulness (Hasler & Süsstrunk 2003).
  const d = f.data;
  let mrg = 0, myb = 0, srg = 0, syb = 0, ly = 0;
  const N = w * h;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const rg = d[j] - d[j + 1];
    const yb = 0.5 * (d[j] + d[j + 1]) - d[j + 2];
    mrg += rg;
    myb += yb;
    srg += rg * rg;
    syb += yb * yb;
    ly += y[i];
  }
  mrg /= N;
  myb /= N;
  const sdrg = Math.sqrt(Math.max(0, srg / N - mrg * mrg));
  const sdyb = Math.sqrt(Math.max(0, syb / N - myb * myb));
  const colour = (Math.hypot(sdrg, sdyb) + 0.3 * Math.hypot(mrg, myb)) / 255;
  // Histogram.
  const hist = new Array(HIST_BINS).fill(0);
  for (let j = 0; j < 4 * N; j += 4) hist[((d[j] >> 6) << 4) | ((d[j + 1] >> 6) << 2) | (d[j + 2] >> 6)]++;
  for (let k = 0; k < HIST_BINS; k++) hist[k] /= N;
  const small = halve(y, w, h);
  let motion = 0, change = 0;
  if (prev && prev.small.w === small.w && prev.small.h === small.h) {
    const R = Math.max(2, Math.round(small.w / 16));
    const s = globalShift(prev.small, small, R);
    motion = (Math.hypot(s.dx, s.dy) * 2) / w;
    // Chi-square-like distance in 0..1.
    let c = 0;
    for (let k = 0; k < HIST_BINS; k++) {
      const a = hist[k], b = prev.hist[k];
      if (a + b > 0) c += ((a - b) * (a - b)) / (a + b);
    }
    change = c / 2;
  }
  return { sharpness, colour, motion, change, luma: ly / N, hist, small };
}

/** Per-frame features with their time (s). */
export type TimedFeatures = { t: number; f: FrameFeatures };

/**
 * Scene cuts from histogram changes: a frame whose change is above `threshold`
 * and at least 4× the median change of its neighbourhood. Cuts closer than
 * `minGapS` keep the stronger one.
 */
export function detectCuts(frames: TimedFeatures[], opts: { threshold?: number; minGapS?: number } = {}): number[] {
  const thr = opts.threshold ?? 0.25;
  const gap = opts.minGapS ?? 1;
  const cand: { t: number; c: number }[] = [];
  for (let i = 1; i < frames.length; i++) {
    const c = frames[i].f.change;
    if (c < thr) continue;
    const nb: number[] = [];
    for (let k = Math.max(1, i - 5); k <= Math.min(frames.length - 1, i + 5); k++) if (k !== i) nb.push(frames[k].f.change);
    nb.sort((a, b) => a - b);
    const med = nb.length ? nb[nb.length >> 1] : 0;
    if (c >= 4 * med) cand.push({ t: (frames[i - 1].t + frames[i].t) / 2, c });
  }
  const out: { t: number; c: number }[] = [];
  for (const k of cand) {
    const last = out[out.length - 1];
    if (last && k.t - last.t < gap) {
      if (k.c > last.c) out[out.length - 1] = k;
    } else out.push(k);
  }
  return out.map((k) => k.t);
}

export type HighlightWindow = {
  t0: number;
  t1: number;
  /** Median frame sharpness in the window (frameFeatures units). */
  sharpness: number;
  /** Subject-pop mask cover 0..1, when known. */
  subject?: number;
  /** Colourfulness (frameFeatures units). */
  colour?: number;
  /** Camera calm 0..1 (1 = steady), from the stabiliser analysis or from frame motion. */
  calm?: number;
};

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Aggregate per-frame features into fixed windows over [0, sourceS).
 * `subject(t0, t1)` and `calm(t0, t1)` (e.g. from the stab analysis' jitter)
 * override / add per-window values; without `calm`, calm comes from frame
 * motion: exp(-meanMotion / motionScale), motionScale 0.01 of the width per frame.
 */
export function windowFeatures(
  frames: TimedFeatures[],
  opts: { windowS?: number; sourceS: number; subject?: (t0: number, t1: number) => number | undefined; calm?: (t0: number, t1: number) => number | undefined; motionScale?: number },
): HighlightWindow[] {
  const W = opts.windowS ?? 1;
  const out: HighlightWindow[] = [];
  const nW = Math.max(1, Math.ceil(opts.sourceS / W - 1e-9));
  let fi = 0;
  for (let k = 0; k < nW; k++) {
    const t0 = k * W, t1 = Math.min(opts.sourceS, (k + 1) * W);
    const inWin: FrameFeatures[] = [];
    while (fi < frames.length && frames[fi].t < t0) fi++;
    for (let j = fi; j < frames.length && frames[j].t < t1; j++) inWin.push(frames[j].f);
    if (!inWin.length) continue;
    const win: HighlightWindow = { t0, t1, sharpness: median(inWin.map((f) => f.sharpness)), colour: inWin.reduce((s, f) => s + f.colour, 0) / inWin.length };
    const calm = opts.calm?.(t0, t1);
    win.calm = calm ?? Math.exp(-(inWin.reduce((s, f) => s + f.motion, 0) / inWin.length) / (opts.motionScale ?? 0.01));
    const subj = opts.subject?.(t0, t1);
    if (subj !== undefined) win.subject = subj;
    out.push(win);
  }
  return out;
}

// ------------------------------------------------------------------ selection

export type HighlightWeights = { sharpness: number; subject: number; colour: number; calm: number };
export const DEFAULT_WEIGHTS: HighlightWeights = { sharpness: 0.3, subject: 0.3, colour: 0.2, calm: 0.2 };

export type HighlightOptions = {
  /** Reel length, s (30 / 60 / 90 are the presets). */
  targetS: number;
  /** Source duration, s. */
  sourceS: number;
  /** Scene-cut times, s. */
  cuts?: number[];
  /** Preferred clip length, s (default target/12 clamped to 2.5..6). */
  clipS?: number;
  /** Shortest clip kept, s (default 1.5). */
  minClipS?: number;
  /** Absolute sharpness gate; windows below it are never used. */
  minSharpness?: number;
  /** Relative gate when minSharpness is not set: this fraction of the source's median sharpness (default 0.5). */
  relSharpness?: number;
  /** Clip starts snap to a cut within this distance, s (default 1). */
  snapS?: number;
  /** Strength of the spread-across-the-dive penalty, 0..1 (default 0.5). */
  variety?: number;
  /** Minimum gap between picks, s (default 1). */
  gapS?: number;
  weights?: Partial<HighlightWeights>;
};

export type HighlightPick = { t0: number; t1: number; score: number };

export type HighlightReel = {
  picks: HighlightPick[];
  /** Sum of pick lengths, s. */
  totalS: number;
  /** True when the source had too little usable footage for the target. */
  short: boolean;
  /** Sharpness gate actually used. */
  sharpnessGate: number;
  /** Windows dropped as blurry. */
  blurryWindows: number;
};

/** Robust 0..1 normalisation: (x - p10) / (p90 - p10), clamped. */
function normaliser(vals: number[]): (x: number) => number {
  if (!vals.length) return () => 0.5;
  const s = [...vals].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  const lo = q(0.1), hi = q(0.9);
  if (hi - lo < 1e-9) return () => 0.5;
  return (x) => Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
}

type Cand = { t0: number; t1: number; score: number };

export function pickHighlights(windows: HighlightWindow[], opts: HighlightOptions): HighlightReel {
  const src = Math.max(0, opts.sourceS);
  const target = Math.max(0, Math.min(opts.targetS, src));
  const minClip = opts.minClipS ?? 1.5;
  const clipS = Math.max(minClip, opts.clipS ?? Math.min(6, Math.max(2.5, opts.targetS / 12)));
  const snap = opts.snapS ?? 1;
  const gapS = opts.gapS ?? 1;
  const variety = opts.variety ?? 0.5;
  const wts = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const wins = windows.filter((w) => w.t1 > w.t0 && w.t0 < src && w.t1 > 0).map((w) => ({ ...w, t0: Math.max(0, w.t0), t1: Math.min(src, w.t1) })).sort((a, b) => a.t0 - b.t0);
  const gate = opts.minSharpness ?? (opts.relSharpness ?? 0.5) * median(wins.map((w) => w.sharpness));
  const nS = normaliser(wins.map((w) => w.sharpness));
  const nC = normaliser(wins.filter((w) => w.colour !== undefined).map((w) => w.colour!));
  const hasSubj = wins.some((w) => w.subject !== undefined), hasCol = wins.some((w) => w.colour !== undefined), hasCalm = wins.some((w) => w.calm !== undefined);
  const scoreOf = (w: HighlightWindow) => {
    let s = wts.sharpness * nS(w.sharpness), tw = wts.sharpness;
    if (hasSubj) { s += wts.subject * (w.subject ?? 0); tw += wts.subject; }
    if (hasCol) { s += wts.colour * (w.colour === undefined ? 0.5 : nC(w.colour)); tw += wts.colour; }
    if (hasCalm) { s += wts.calm * Math.min(1, Math.max(0, w.calm ?? 0.5)); tw += wts.calm; }
    return tw > 0 ? s / tw : 0;
  };
  const usable = wins.map((w) => ({ t0: w.t0, t1: w.t1, ok: w.sharpness >= gate, score: scoreOf(w) }));
  const blurryWindows = usable.filter((u) => !u.ok).length;

  // Usable runs: maximal stretches of sharp windows, split at scene cuts.
  const cuts = [...(opts.cuts ?? [])].filter((c) => c > 0 && c < src).sort((a, b) => a - b);
  const runs: { t0: number; t1: number }[] = [];
  for (const u of usable) {
    if (!u.ok) continue;
    const last = runs[runs.length - 1];
    if (last && Math.abs(last.t1 - u.t0) < 1e-6) last.t1 = u.t1;
    else runs.push({ t0: u.t0, t1: u.t1 });
  }
  const shots: { t0: number; t1: number }[] = [];
  for (const r of runs) {
    let a = r.t0;
    for (const c of cuts) {
      if (c <= a || c >= r.t1) continue;
      shots.push({ t0: a, t1: c });
      a = c;
    }
    shots.push({ t0: a, t1: r.t1 });
  }

  // Mean window score over [t0, t1] (overlap-weighted); usable windows only cover runs, so this is exact.
  const scoreSpan = (t0: number, t1: number) => {
    let s = 0, wsum = 0;
    let lo = 0, hi = usable.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (usable[m].t1 <= t0) lo = m + 1;
      else hi = m;
    }
    for (let i = lo; i < usable.length; i++) {
      const u = usable[i];
      if (u.t1 <= t0) continue;
      if (u.t0 >= t1) break;
      const o = Math.min(t1, u.t1) - Math.max(t0, u.t0);
      s += u.score * o;
      wsum += o;
    }
    return wsum > 0 ? s / wsum : 0;
  };

  // Candidates: clips of clipS inside each shot, stride 0.5 s; the first starts on the
  // shot start (a cut or the end of blur), and starts within `snap` of a cut move onto it.
  const cands: Cand[] = [];
  for (const sh of shots) {
    const len = sh.t1 - sh.t0;
    if (len < minClip - 1e-9) continue;
    const L = Math.min(clipS, len);
    const starts = new Set<number>();
    for (let s = sh.t0; s + L <= sh.t1 + 1e-9; s += 0.5) {
      let st = s;
      for (const c of cuts) if (Math.abs(c - s) <= snap && c >= sh.t0 && c + L <= sh.t1 + 1e-9) st = c;
      starts.add(Math.round(st * 1000) / 1000);
    }
    for (const st of starts) cands.push({ t0: st, t1: Math.min(sh.t1, st + L), score: scoreSpan(st, st + L) });
  }

  // Greedy pick with a proximity penalty (spread across the dive), no overlaps.
  const picks: Cand[] = [];
  // Penalty: 1 next to a pick, falling linearly to 0 at the spacing of an even spread of target/clipS picks.
  const spacing = Math.max(clipS, src / Math.max(1, target / clipS));
  let total = 0;
  const free = (c: Cand) => picks.every((p) => c.t1 + gapS <= p.t0 || c.t0 >= p.t1 + gapS);
  // Density cap: at most 2 picks per `spacing` of source (relaxed only when nothing else is left).
  const crowded = (c: Cand) => {
    const mid = (c.t0 + c.t1) / 2;
    let n = 0;
    for (const p of picks) if (Math.abs((p.t0 + p.t1) / 2 - mid) < spacing / 2) n++;
    return n >= 2;
  };
  let relax = false;
  while (total < target - 1e-9) {
    let best: Cand | null = null, bestEff = -Infinity;
    for (const c of cands) {
      if (!free(c) || (!relax && crowded(c))) continue;
      let prox = 0;
      for (const p of picks) {
        const d = Math.max(0, Math.max(p.t0 - c.t1, c.t0 - p.t1));
        prox = Math.max(prox, 1 - d / spacing);
      }
      const eff = c.score - variety * prox;
      if (eff > bestEff) { bestEff = eff; best = c; }
    }
    if (!best) {
      if (relax) break;
      relax = true;
      continue;
    }
    picks.push(best);
    total += best.t1 - best.t0;
  }

  // Exact length: trim the overshoot from the weakest picks (end side, never below minClip).
  let over = total - target;
  if (over > 1e-9) {
    for (const p of [...picks].sort((a, b) => a.score - b.score)) {
      if (over <= 1e-9) break;
      const room = p.t1 - p.t0 - minClip;
      const cut = Math.min(room, over);
      if (cut > 0) { p.t1 -= cut; over -= cut; }
    }
    // Still over (every pick at minClip): drop the weakest whole pick and re-trim.
    while (over > 1e-9 && picks.length > 1) {
      picks.sort((a, b) => a.score - b.score);
      const dropped = picks.shift()!;
      over -= dropped.t1 - dropped.t0;
    }
    if (over < -1e-9) {
      // Dropping went under: give the time back to the strongest pick that has room in its shot.
      for (const p of [...picks].sort((a, b) => b.score - a.score)) {
        const sh = shots.find((s) => p.t0 >= s.t0 - 1e-9 && p.t1 <= s.t1 + 1e-9)!;
        const nextStart = Math.min(sh.t1, ...picks.filter((q) => q.t0 > p.t0).map((q) => q.t0 - gapS));
        const room = Math.max(0, nextStart - p.t1);
        const add = Math.min(room, -over);
        p.t1 += add;
        over += add;
        if (over >= -1e-9) break;
      }
    }
  }
  const out = picks.map((p) => ({ t0: round3(p.t0), t1: round3(p.t1), score: p.score })).sort((a, b) => a.t0 - b.t0);
  const sum = out.reduce((s, p) => s + p.t1 - p.t0, 0);
  return { picks: out, totalS: round3(sum), short: sum < target - 0.5, sharpnessGate: gate, blurryWindows };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
