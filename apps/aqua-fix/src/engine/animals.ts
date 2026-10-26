// Per-animal Subject pop: the analysis labels each animal of the whole-animal
// subject map (backdrop.ts growSubjects) and predicts how much of it the
// shaders will tone; the engine tracks the animals over time (overlap
// matching), decides the tone strength per animal (whole or nothing: an
// animal the shaders would tone only in part is faded out as a whole), eases
// it, and moves each animal's map along its own motion so the map leads a
// fast animal instead of trailing it. The grade reads the per-animal strength
// from data texture 3 (one value per map texel).
//
// CPU only; no GPU readback. Mirrored for stills by `stillStrength` (apply.ts).

export const ANIMALS = {
  /** Subject-map value (0..1) that makes an analysis pixel part of an animal. */
  thr: 0.25,
  /** Smallest animal kept as a label (share of the frame). */
  minArea: 0.004,
  /** Whole or nothing: predicted share of the animal the shaders tone (lo..hi) for the full tone. */
  covLo: 0.6,
  covHi: 0.75,
  /** Subject-map weight (backdrop.ts growSubjects: size, solidity, acceptance) for the full tone (lo..hi). */
  weightLo: 0.5,
  weightHi: 0.8,
  /** Predicted per-pixel test (veto-ramped backdrop departure, backdrop.ts): inside the map's core (value >= core)
   * a pixel is toned from 0..coreDev (the shaders' core trim); elsewhere it must pass the lenient trim, lo..hi. */
  core: 0.85,
  coreDev: 0.08,
  trimLo: 0.2,
  trimHi: 0.4,
  /** Interior hold: texels this far inside an animal are toned whole regardless of the per-pixel test. */
  erode: 2,
  /** Enclosed holes up to this share of an animal's size become part of it (a lit wing the flood skipped). */
  holeMax: 0.3,
  /** Overlap (IoU) with an animal's predicted previous mask that makes it the same animal. */
  matchIoU: 0.2,
  /** Shape stability (IoU with the predicted previous mask, lo..hi) for the full tone. */
  stabLo: 0.4,
  stabHi: 0.6,
  /** Tone strength easing (s): in over tauUp, out over tauDown (never a snap). */
  tauUp: 1.0,
  tauDown: 0.5,
  /** Forward prediction: at most this long (s) and this many map texels ahead of the last analysis. */
  leadMaxS: 0.4,
  leadMaxCells: 12,
  /** The strength map reaches this many texels past the animal (the outline comes from the per-pixel test). */
  dilate: 2,
};

export type Animal = {
  /** Centroid in map texels. */
  cx: number;
  cy: number;
  /** Share of the frame. */
  area: number;
  /** Subject-map weight (size / acceptance) of the animal. */
  weight: number;
  /** Predicted share of the animal the shaders tone. */
  coverage: number;
};
/** Labels per map texel (0 = none, k = list[k − 1]). */
export type AnimalMap = { width: number; height: number; labels: Uint8Array; list: Animal[] };

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Labels the animals of the subject map `map` (w×h, analysis resolution) on
 * the mw×mh map grid. `devV` is the veto-ramped backdrop departure per pixel;
 * an animal's coverage is the mean of its pixels' departure ramp, i.e. the
 * share the shaders' per-pixel test keeps.
 */
export function labelAnimals(map: Float32Array, devV: Float32Array, w: number, h: number, mw: number, mh: number): AnimalMap {
  const n = w * h;
  const lab = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const comps: { area: number; sx: number; sy: number; weight: number; cov: number; px: number }[] = [];
  for (let s = 0; s < n; s++) {
    if (lab[s] >= 0 || map[s] < ANIMALS.thr) continue;
    const id = comps.length;
    let top = 0, cnt = 0, sx = 0, sy = 0, wmax = 0, cov = 0;
    stack[top++] = s; lab[s] = id;
    while (top > 0) {
      const i = stack[--top];
      const x = i % w, y = (i - x) / w;
      cnt++; sx += x; sy += y;
      if (map[i] > wmax) wmax = map[i];
      cov += map[i] >= ANIMALS.core ? smoothstep(0, ANIMALS.coreDev, devV[i]) : smoothstep(ANIMALS.trimLo, ANIMALS.trimHi, devV[i]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((dx | dy) === 0 || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (lab[j] < 0 && map[j] >= ANIMALS.thr) { lab[j] = id; stack[top++] = j; }
      }
    }
    comps.push({ area: cnt / n, sx, sy, weight: wmax, cov: cov / cnt, px: cnt });
  }
  // Keep the largest (at most 255) animals above the minimum size.
  const order = comps.map((_, i) => i).filter((i) => comps[i].area >= ANIMALS.minArea).sort((a, b) => comps[b].area - comps[a].area).slice(0, 255);
  const slot = new Int32Array(comps.length).fill(0);
  const list: Animal[] = [];
  for (const i of order) {
    const c = comps[i];
    list.push({ cx: ((c.sx / c.px + 0.5) * mw) / w - 0.5, cy: ((c.sy / c.px + 0.5) * mh) / h - 0.5, area: c.area, weight: c.weight, coverage: c.cov });
    slot[i] = list.length;
  }
  const labels = new Uint8Array(mw * mh);
  for (let ty = 0; ty < mh; ty++) {
    const y = Math.min(h - 1, Math.floor(((ty + 0.5) * h) / mh));
    for (let tx = 0; tx < mw; tx++) {
      const x = Math.min(w - 1, Math.floor(((tx + 0.5) * w) / mw));
      const l = lab[y * w + x];
      labels[ty * mw + tx] = l >= 0 ? slot[l] : 0;
    }
  }
  fillHoles(labels, mw, mh, list.length);
  return { width: mw, height: mh, labels, list };
}

/**
 * Fills each animal's enclosed holes on the label grid (a lit flank or wing the flood skipped): label-free texels
 * the frame border cannot reach without crossing the animal, up to holeMax of the animal's own size.
 */
function fillHoles(labels: Uint8Array, w: number, h: number, count: number): void {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  for (let k = 1; k <= count; k++) {
    let area = 0;
    for (let i = 0; i < n; i++) if (labels[i] === k) area++;
    if (!area) continue;
    seen.fill(0);
    let top = 0;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (labels[i] !== k && !seen[i]) { seen[i] = 1; stack[top++] = i; } }
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (labels[i] !== k && !seen[i]) { seen[i] = 1; stack[top++] = i; } }
    while (top > 0) {
      const i = stack[--top], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1]) {
        if (j >= 0 && !seen[j] && labels[j] !== k) { seen[j] = 1; stack[top++] = j; }
      }
    }
    // Unreached texels are holes; fill each hole component that is small and free of other animals.
    for (let s = 0; s < n; s++) {
      if (seen[s] || labels[s] === k) continue;
      const members: number[] = [];
      let clean = true;
      seen[s] = 1; stack[top++] = s;
      while (top > 0) {
        const i = stack[--top], x = i % w;
        members.push(i);
        if (labels[i] !== 0) clean = false;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1]) {
          if (j >= 0 && !seen[j] && labels[j] !== k) { seen[j] = 1; stack[top++] = j; }
        }
      }
      if (clean && members.length <= ANIMALS.holeMax * area) for (const i of members) labels[i] = k;
    }
  }
}

/** Target tone strength of an animal from its analysis alone: whole or nothing by its map weight (a half-accepted
 * region is not an animal) and by its predicted coverage. */
export function animalTarget(a: Animal): number {
  return smoothstep(ANIMALS.weightLo, ANIMALS.weightHi, a.weight) * smoothstep(ANIMALS.covLo, ANIMALS.covHi, a.coverage);
}

function dilateMax(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) m = Math.max(m, src[y * w + xx]); }
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) m = Math.max(m, tmp[yy * w + x]); }
    out[y * w + x] = m;
  }
  return out;
}

/**
 * RGBA32F strength texture from a per-texel strength field: R = the animal's strength, dilated past it (the
 * outline comes from the shaders' per-pixel test); G = 1 deep inside an animal (the field eroded by `erode` texels),
 * where the whole animal is toned regardless of the per-pixel test, so a toned animal has no holes.
 */
function strengthTexture(s: Float32Array, w: number, h: number): { width: number; height: number; data: Float32Array } {
  const d = dilateMax(s, w, h, ANIMALS.dilate);
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    data[i * 4] = d[i];
    let core = s[i] > 0 ? 1 : 0;
    const r = ANIMALS.erode;
    for (let dy = -r; dy <= r && core; dy++) for (let dx = -r; dx <= r && core; dx++) {
      const xx = x + dx, yy = y + dy;
      // The frame edge does not end an animal (one swimming out of frame keeps its interior).
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && s[yy * w + xx] <= 0) core = 0;
    }
    data[i * 4 + 1] = core;
  }
  return { width: w, height: h, data };
}

/** Strength texture for a still (no tracking: each animal at its analysis target). */
export function stillStrength(am: AnimalMap): { width: number; height: number; data: Float32Array } {
  const s = new Float32Array(am.width * am.height);
  const t = am.list.map(animalTarget);
  for (let i = 0; i < s.length; i++) if (am.labels[i]) s[i] = t[am.labels[i] - 1];
  return strengthTexture(s, am.width, am.height);
}

type Track = {
  id: number;
  /** Map texels of the animal at its last analysis. */
  cells: Int32Array;
  /** Analysis time (clip seconds) of `cells`, centroid (texels) and velocity (texels / s). */
  t: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  target: number;
  /** Target from the latest analysis alone (before the stability check). */
  base: number;
  /** Has a velocity estimate (two analyses). */
  moved: boolean;
  s: number;
};

/**
 * Tracks the animals across analyses (overlap matching against each animal's
 * mask moved along its own motion), eases a tone strength per animal, and
 * moves each animal's subject map along its motion between analyses.
 */
export class AnimalTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private w = 0;
  private h = 0;
  /** Clip time of the latest analysis. */
  private lastT = -1;

  reset(): void {
    this.tracks = [];
  }

  get count(): number {
    return this.tracks.length;
  }

  private offset(tr: Track, t: number): [number, number] {
    const dt = Math.min(ANIMALS.leadMaxS, Math.max(0, t - tr.t));
    let dx = tr.vx * dt, dy = tr.vy * dt;
    const m = Math.hypot(dx, dy);
    if (m > ANIMALS.leadMaxCells) { dx *= ANIMALS.leadMaxCells / m; dy *= ANIMALS.leadMaxCells / m; }
    return [Math.round(dx), Math.round(dy)];
  }

  private shifted(tr: Track, t: number): Set<number> {
    const [dx, dy] = this.offset(tr, t);
    const out = new Set<number>();
    for (const c of tr.cells) {
      const x = (c % this.w) + dx, y = Math.floor(c / this.w) + dy;
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) out.add(y * this.w + x);
    }
    return out;
  }

  /** A new analysis (captured at clip time `t`). */
  update(am: AnimalMap, t: number): void {
    if (am.width !== this.w || am.height !== this.h) { this.tracks = []; this.w = am.width; this.h = am.height; }
    this.lastT = t;
    const cellsOf: number[][] = am.list.map(() => []);
    for (let i = 0; i < am.labels.length; i++) if (am.labels[i]) cellsOf[am.labels[i] - 1].push(i);
    const pred = this.tracks.map((tr) => this.shifted(tr, t));
    const pairs: { i: number; k: number; iou: number }[] = [];
    for (let i = 0; i < am.list.length; i++) {
      for (let k = 0; k < this.tracks.length; k++) {
        let inter = 0;
        for (const c of cellsOf[i]) if (pred[k].has(c)) inter++;
        if (!inter) continue;
        const iou = inter / (cellsOf[i].length + pred[k].size - inter);
        if (iou >= ANIMALS.matchIoU) pairs.push({ i, k, iou });
      }
    }
    pairs.sort((a, b) => b.iou - a.iou);
    const takenI = new Set<number>(), takenK = new Set<number>();
    const next: Track[] = [];
    for (const p of pairs) {
      if (takenI.has(p.i) || takenK.has(p.k)) continue;
      takenI.add(p.i); takenK.add(p.k);
      const tr = this.tracks[p.k], a = am.list[p.i];
      const dt = t - tr.t;
      if (dt > 1e-3) {
        // Velocity from the last two analyses (lightly smoothed against centroid jitter).
        const vx = (a.cx - tr.cx) / dt, vy = (a.cy - tr.cy) / dt;
        const k = tr.moved ? 0.5 : 1;
        tr.vx += (vx - tr.vx) * k;
        tr.vy += (vy - tr.vy) * k;
        tr.moved = true;
      }
      tr.cells = Int32Array.from(cellsOf[p.i]);
      tr.t = t; tr.cx = a.cx; tr.cy = a.cy;
      tr.base = animalTarget(a);
      tr.target = tr.base * smoothstep(ANIMALS.stabLo, ANIMALS.stabHi, p.iou);
      next.push(tr);
    }
    // New animals: tracked, but toned only once a second analysis agrees.
    for (let i = 0; i < am.list.length; i++) {
      if (takenI.has(i)) continue;
      const a = am.list[i];
      next.push({ id: this.nextId++, cells: Int32Array.from(cellsOf[i]), t, cx: a.cx, cy: a.cy, vx: 0, vy: 0, target: 0, base: animalTarget(a), moved: false, s: 0 });
    }
    // Animals not found again fade out where they are heading.
    for (let k = 0; k < this.tracks.length; k++) {
      if (takenK.has(k)) continue;
      const tr = this.tracks[k];
      tr.target = 0;
      if (tr.s > 0.005) next.push(tr);
    }
    this.tracks = next;
  }

  /**
   * A snapped frame (a still, the first frame of an export, a scene cut): every animal of the latest analysis
   * takes its own target at once; there is no earlier frame to agree with or fade from.
   */
  snap(): void {
    for (const tr of this.tracks) {
      if (tr.t !== this.lastT) continue;
      tr.target = tr.base;
      tr.s = tr.target;
    }
  }

  /** Eases every animal's strength toward its target over `dt` seconds. */
  step(dt: number): void {
    if (dt <= 0) return;
    for (const tr of this.tracks) {
      const tau = tr.target < tr.s ? ANIMALS.tauDown : ANIMALS.tauUp;
      tr.s += (tr.target - tr.s) * (1 - Math.exp(-dt / tau));
    }
    // Animals of the latest analysis stay (a first sighting waits for its confirmation); the rest go once faded.
    this.tracks = this.tracks.filter((tr) => tr.t === this.lastT || tr.target > 0 || tr.s > 0.005);
  }

  /** Strength texture at clip time `t` (each animal at its predicted place). */
  strength(t: number): { width: number; height: number; data: Float32Array } {
    if (!this.w) return { width: 1, height: 1, data: new Float32Array(4) };
    const s = new Float32Array(this.w * this.h);
    for (const tr of this.tracks) {
      if (tr.s <= 0) continue;
      for (const c of this.shifted(tr, t)) if (tr.s > s[c]) s[c] = tr.s;
    }
    return strengthTexture(s, this.w, this.h);
  }

  /**
   * The subject map led along each animal's motion: the conf channel (fields
   * .y) and guide colour of the animal's texels move by its predicted
   * displacement since its analysis; the texels it left take the water's
   * colour (`water(x, y)`, linear RGB) and no subject. Null when nothing moves.
   */
  lead(fields: Float32Array, guide: Float32Array, t: number, water: (x: number, y: number) => [number, number, number]): { fields: Float32Array; guide: Float32Array } | null {
    // Only animals of the latest analysis: the map being led is that analysis's.
    const moving = this.tracks.filter((tr) => { if (tr.t !== this.lastT) return false; const [dx, dy] = this.offset(tr, t); return dx !== 0 || dy !== 0; });
    if (!moving.length) return null;
    const f = new Float32Array(fields), g = new Float32Array(guide);
    for (const tr of moving) {
      for (const c of tr.cells) {
        const x = c % this.w, y = (c - x) / this.w;
        f[c * 4 + 1] = 0;
        const wc = water(x, y);
        g[c * 4] = wc[0]; g[c * 4 + 1] = wc[1]; g[c * 4 + 2] = wc[2];
      }
    }
    for (const tr of moving) {
      const [dx, dy] = this.offset(tr, t);
      for (const c of tr.cells) {
        const x = (c % this.w) + dx, y = Math.floor(c / this.w) + dy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const d = y * this.w + x;
        f[d * 4 + 1] = Math.max(f[d * 4 + 1], fields[c * 4 + 1]);
        g[d * 4] = guide[c * 4]; g[d * 4 + 1] = guide[c * 4 + 1]; g[d * 4 + 2] = guide[c * 4 + 2];
      }
    }
    return { fields: f, guide: g };
  }
}
