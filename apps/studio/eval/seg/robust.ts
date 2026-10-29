// Seg eval, render half: the real colour engine (GradeEngine, Subject pop on) grades frames with the engine's own
// masks, with the ML masks, and with deliberately corrupted ML masks (keyframes shifted 10 px, two keyframes dropped,
// a 20% leak onto the water), and measures how far each corrupted render departs from the clean one (CIE76 ΔE) and
// whether the departure has a hard edge (its spatial step, ΔE per pixel). Frames for the board go back as PNGs.
import { GradeEngine } from "../../../aqua-fix/src/engine/engine.ts";
import { DEFAULT_SETTINGS } from "../../../aqua-fix/src/engine/params.ts";
import { fillTrack, SEG, type FrameSource, type Keyframe, type SegTrack } from "../../src/pipeline/seg/track.ts";
import { bbox } from "../../src/pipeline/seg/mask.ts";

type Variant = { name: string; track: SegTrack; hard?: boolean };

function shifted(K: Keyframe[], mw: number, mh: number, dx: number): Keyframe[] {
  return K.map((k) => {
    const inc = new Float32Array(mw * mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const sx = x - dx; if (sx >= 0 && sx < mw) inc[y * mw + x] = k.inc[y * mw + sx]; }
    return { ...k, inc };
  });
}

/** A disk of water touching the subject, 20% of its area, on the side with more room. */
function leaked(K: Keyframe[], mw: number, mh: number, share: number): Keyframe[] {
  return K.map((k) => {
    const b = bbox(k.inc, mw, mh);
    if (!b) return k;
    let a = 0;
    for (let i = 0; i < k.inc.length; i++) if (k.inc[i] > 0.5) a++;
    const r = Math.sqrt((share * a) / Math.PI);
    const right = mw - b.x1 > b.x0;
    const cx = right ? b.x1 + r * 0.6 : b.x0 - r * 0.6, cy = (b.y0 + b.y1) / 2;
    const inc = k.inc.slice();
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) inc[y * mw + x] = Math.max(inc[y * mw + x], 0.95);
    return { ...k, inc };
  });
}

function lab(r8: number, g8: number, b8: number): [number, number, number] {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function deltaE(a: Uint8ClampedArray, b: Uint8ClampedArray, n: number): Float32Array {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = lab(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]), q = lab(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]);
    d[i] = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return d;
}

function stats(d: Float32Array, w: number, h: number) {
  const s = Float32Array.from(d).sort();
  let step = 0;
  const steps: number[] = [];
  for (let y = 0; y + 1 < h; y++) for (let x = 0; x + 1 < w; x++) {
    const i = y * w + x, g = Math.max(Math.abs(d[i + 1] - d[i]), Math.abs(d[i + w] - d[i]));
    steps.push(g);
    if (g > step) step = g;
  }
  steps.sort((p, q) => p - q);
  let sum = 0;
  for (const v of d) sum += v;
  return { mean: sum / d.length, p99: s[Math.floor(0.99 * (s.length - 1))], max: s[s.length - 1], stepP999: steps[Math.floor(0.999 * (steps.length - 1))], stepMax: step };
}

/**
 * "Fake look" guard on the subject region (mask > 0.6): a render's L standard deviation, high-pass energy (mean
 * |L - 3×3 mean|) and chroma spread (std of a, b) as ratios to the source's. Flattening shows as L / high-pass ratios
 * below 1, a pasted single colour as a chroma ratio near 0.
 */
function guard(src: Uint8ClampedArray, px: Uint8ClampedArray, mask: Float32Array, W: number, H: number) {
  const stats1 = (p: Uint8ClampedArray) => {
    const L = new Float32Array(W * H), A = new Float32Array(W * H), B = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { const l = lab(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]); L[i] = l[0]; A[i] = l[1]; B[i] = l[2]; }
    let n = 0, sl = 0, sll = 0, sa = 0, saa = 0, sb = 0, sbb = 0, hp = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (mask[i] <= 0.6) continue;
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += L[i + dy * W + dx];
      hp += Math.abs(L[i] - m / 9);
      n++; sl += L[i]; sll += L[i] * L[i]; sa += A[i]; saa += A[i] * A[i]; sb += B[i]; sbb += B[i] * B[i];
    }
    if (n < 50) return null;
    const v = (s1: number, s2: number) => Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2));
    return { lStd: v(sl, sll), hp: hp / n, cStd: Math.hypot(v(sa, saa), v(sb, sbb)), n };
  };
  const a = stats1(src), b = stats1(px);
  if (!a || !b) return null;
  return { lStdRatio: b.lStd / a.lStd, hpRatio: b.hp / a.hp, cStdRatio: b.cStd / Math.max(1e-6, a.cStd) };
}

export async function robustness(o: {
  clip: string; W: number; H: number; T: number; mw: number; mh: number; K: Keyframe[]; clean: SegTrack; source: FrameSource;
  frame: (i: number) => Promise<HTMLCanvasElement>; post: (name: string, body: Blob | Uint8Array) => Promise<void>; log: (s: string) => void;
}): Promise<object> {
  const { W, H, mw, mh, K } = o;
  const mid = Math.floor(K.length / 2);
  const variants: Variant[] = [
    { name: "ml", track: o.clean },
    { name: "shift10", track: (await fillTrack(shifted(K, mw, mh, Math.round((10 * mw) / 640)), mw, mh, o.source))! },
    { name: "drop2", track: (await fillTrack(K.filter((_, i) => i !== mid && i !== mid + 1), mw, mh, o.source))! },
    { name: "leak20", track: (await fillTrack(leaked(K, mw, mh, 0.2), mw, mh, o.source))! },
    { name: "hard-shift10", track: (await fillTrack(shifted(K, mw, mh, Math.round((10 * mw) / 640)), mw, mh, o.source))!, hard: true },
  ];
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const engine = await GradeEngine.create(canvas, (e) => o.log("engine error " + e.message), false);
  engine.settings = { ...DEFAULT_SETTINGS, subjectPop: true };
  const read = document.createElement("canvas"); read.width = W; read.height = H;
  const rctx = read.getContext("2d", { willReadFrequently: true })!;
  const render = async (t: number, ov: ReturnType<SegTrack["at"]> | null): Promise<Uint8ClampedArray> => {
    engine.setSegOverlay(ov ? { width: ov.width, height: ov.height, alpha: ov.alpha, exclude: ov.exclude, near: ov.near, depart: ov.depart } : null);
    const vf = await engine.renderToFrame(0, Math.round(t * 1e6), 33_333);
    rctx.drawImage(vf, 0, 0, W, H);
    vf.close();
    return rctx.getImageData(0, 0, W, H).data;
  };
  const hardAt = (tr: SegTrack, t: number) => {
    const fs = SEG.featherShare, fm = SEG.featherMinPx;
    SEG.featherShare = 0; SEG.featherMinPx = 0;
    try {
      const m = tr.at(t);
      // A hard mask also replaces the engine everywhere it reaches, at full weight.
      if (m) for (let i = 0; i < m.near.length; i++) { m.alpha[i] = m.alpha[i] > 0.5 ? 1 : 0; m.near[i] = m.alpha[i] > 0 || m.near[i] > 0 ? 1 : 0; }
      return m;
    } finally { SEG.featherShare = fs; SEG.featherMinPx = fm; }
  };
  const board = (new URLSearchParams(location.search).get("boardf") ?? "6,90,165").split(",").map(Number);
  const frames = [...Array.from({ length: 30 }, (_, j) => 60 + j), ...board].filter((f, i, a) => f < o.T && a.indexOf(f) === i);
  const acc: Record<string, ReturnType<typeof stats>[]> = {};
  const guards: Record<string, ({ f: number } & NonNullable<ReturnType<typeof guard>>)[]> = {};
  const boardFrame = 75;
  for (const f of frames) {
    const t = f / 30;
    const src = await o.frame(f);
    engine.upload(src, W, H, 0);
    engine.setTime(t);
    await engine.analyzeNow(true);
    const base = await render(t, null);
    const clean = await render(t, o.clean.at(t));
    const save = f === boardFrame || board.includes(f);
    const png = async (name: string, px: Uint8ClampedArray) => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), W, H), 0, 0);
      await o.post(`${name}_${f}`, await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png")));
    };
    if (save) {
      const sc = src.getContext("2d")!.getImageData(0, 0, W, H).data;
      await png("src", sc); await png("engine", base); await png("ml", clean);
      // The same grade with Subject pop off: what the pop itself changes.
      engine.settings = { ...DEFAULT_SETTINGS, subjectPop: false };
      await png("nopop", await render(t, null));
      engine.settings = { ...DEFAULT_SETTINGS, subjectPop: true };
      const m = o.clean.at(t);
      if (m) {
        // The subject region on the frame grid (the mask, nearest).
        const mk = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mk[y * W + x] = m.alpha[Math.min(m.height - 1, Math.floor((y / H) * m.height)) * m.width + Math.min(m.width - 1, Math.floor((x / W) * m.width))];
        for (const [name, px] of [["engine", base], ["ml", clean]] as const) {
          const g = guard(sc, px, mk, W, H);
          if (g) (guards[name] ??= []).push({ f, ...g });
        }
      }
    }
    (acc["ml-vs-engine"] ??= []).push(stats(deltaE(clean, base, W * H), W, H));
    for (const v of variants.slice(1)) {
      const px = await render(t, v.hard ? hardAt(v.track, t) : v.track.at(t));
      const d = deltaE(px, clean, W * H);
      (acc[v.name] ??= []).push(stats(d, W, H));
      if (f === boardFrame) {
        await png(v.name, px);
        const heat = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < W * H; i++) { const x = Math.min(255, d[i] * 25); heat[i * 4] = x; heat[i * 4 + 1] = x * 0.6; heat[i * 4 + 2] = 255 - x; heat[i * 4 + 3] = 255; }
        await png(`de-${v.name}`, heat);
      }
    }
  }
  const out: Record<string, object> = {};
  for (const [k, list] of Object.entries(acc)) {
    const m = (f: (s: ReturnType<typeof stats>) => number) => list.reduce((s, x) => s + f(x), 0) / list.length;
    out[k] = { meanDE: m((s) => s.mean), p99DE: m((s) => s.p99), maxDE: Math.max(...list.map((s) => s.max)), stepP999: m((s) => s.stepP999), stepMax: Math.max(...list.map((s) => s.stepMax)) };
  }
  for (const [k, list] of Object.entries(guards)) {
    const m = (f: (g: (typeof list)[number]) => number) => list.reduce((s, x) => s + f(x), 0) / list.length;
    out[`guard-${k}`] = { lStdRatio: m((g) => g.lStdRatio), hpRatio: m((g) => g.hpRatio), cStdRatio: m((g) => g.cStdRatio), minLStdRatio: Math.min(...list.map((g) => g.lStdRatio)), minHpRatio: Math.min(...list.map((g) => g.hpRatio)), minCStdRatio: Math.min(...list.map((g) => g.cStdRatio)), frames: list.length };
  }
  engine.dispose();
  return out;
}
