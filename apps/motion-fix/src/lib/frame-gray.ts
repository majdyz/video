// Decoded frame -> green channel at the analysis size, for the tracker.
//
// The obvious route (draw the VideoFrame onto a small 2D canvas, then
// getImageData) is a YUV->RGB conversion plus a filtered scale inside the
// canvas. On machines without GPU raster (headless, VMs, some Android and
// Linux setups) Chromium does that on the CPU at ~200 ms per 720p frame,
// which made a 6 s clip take most of a minute to analyse. Copying the
// planes out (VideoFrame.copyTo: a memcpy for software-decoded frames) and
// area-filtering them to the analysis size in JS costs a fraction of that
// (a few ms on a desktop, 15-40 ms on the same VM).
//
// Neither route wins everywhere (with GPU raster and 4K GPU-backed frames
// the canvas can be the cheaper one), so FrameReader times both on the first
// few frames and keeps the planes unless the canvas is clearly faster (and
// leaves the canvas if it slows down later). It also compares their output and keeps
// the canvas when they disagree, so an unusual colour matrix or layout can
// only cost speed, never tracking quality.

import type { PreparedFrame, PrepOptions } from "./tracker.ts";

/** What FrameReader needs from a decoded frame (mediabunny's VideoSample has all of it). */
export type FrameSource = {
  readonly format: string | null;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly visibleRect: { left: number; top: number; width: number; height: number };
  readonly rotation: number;
  readonly colorSpace?: { matrix?: string | null; fullRange?: boolean | null } | null;
  allocationSize(): number;
  copyTo(destination: ArrayBuffer | ArrayBufferView): Promise<{ offset: number; stride: number }[]>;
  draw(context: OffscreenCanvasRenderingContext2D, dx: number, dy: number, dWidth?: number, dHeight?: number): void;
};

type PlaneFormat = {
  /** "rgb": one interleaved RGBA/BGRA plane; "nv12": Y + interleaved UV; "planar": Y, U, V. */
  kind: "rgb" | "nv12" | "planar";
  /** Chroma subsampling (1 or 2) per axis. */
  sx: number;
  sy: number;
  /** Bits per sample (8, 10, 12); >8 means 16-bit little-endian samples. */
  bits: number;
};

/** Pixel formats the plane route understands (all of WebCodecs' current list). */
export function planeFormat(format: string | null): PlaneFormat | null {
  if (!format) return null;
  if (format === "RGBA" || format === "RGBX" || format === "BGRA" || format === "BGRX") return { kind: "rgb", sx: 1, sy: 1, bits: 8 };
  if (format === "NV12") return { kind: "nv12", sx: 2, sy: 2, bits: 8 };
  const m = /^I4(20|22|44)A?(?:P(10|12))?$/.exec(format);
  if (!m) return null;
  const sub = m[1];
  return { kind: "planar", sx: sub === "44" ? 1 : 2, sy: sub === "20" ? 2 : 1, bits: m[2] ? Number(m[2]) : 8 };
}

/**
 * Area-weighted resampling along one axis as a flat list of (source,
 * output, weight) triples sorted by source: output sample o covers source
 * [o·s, (o+1)·s) with s = srcLen / outLen, and each overlapped source sample
 * weighs its share of the overlap. Down- and upscaling alike; an integer
 * ratio has exactly one triple per source sample.
 */
type Axis = {
  src: Int32Array;
  dst: Int32Array;
  w: Float32Array;
  n: number;
  /** Integer downscale factor (plain box), else 0. */
  k: number;
  /** The same filter per output sample as `taps` weights from `start` (zero-padded, kept inside the source). */
  taps: number;
  start: Int32Array;
  tw: Float32Array;
};

function makeAxis(srcLen: number, outLen: number): Axis {
  const s = srcLen / outLen;
  const src: number[] = [];
  const dst: number[] = [];
  const w: number[] = [];
  for (let o = 0; o < outLen; o++) {
    const a = o * s;
    const b = Math.min(srcLen, (o + 1) * s);
    const i1 = Math.min(srcLen - 1, Math.ceil(b - 1e-9) - 1);
    for (let i = Math.floor(a + 1e-9); i <= i1; i++) {
      const overlap = Math.min(b, i + 1) - Math.max(a, i);
      if (overlap <= 1e-9) continue;
      src.push(i);
      dst.push(o);
      w.push(overlap / (b - a));
    }
  }
  const k = Math.round(s);
  let taps = 1;
  for (let i = 0, run = 0; i < dst.length; i++) {
    run = i > 0 && dst[i] === dst[i - 1] ? run + 1 : 1;
    if (run > taps) taps = run;
  }
  taps = Math.min(taps, srcLen);
  const start = new Int32Array(outLen);
  const tw = new Float32Array(outLen * taps);
  for (let i = 0; i < dst.length; i++) {
    const o = dst[i];
    if (i === 0 || dst[i - 1] !== o) start[o] = Math.max(0, Math.min(src[i], srcLen - taps));
    tw[o * taps + (src[i] - start[o])] = w[i];
  }
  return { src: Int32Array.from(src), dst: Int32Array.from(dst), w: Float32Array.from(w), n: src.length, k: k >= 1 && Math.abs(s - k) < 1e-9 ? k : 0, taps, start, tw };
}

/**
 * Large reductions (2.7K/4K to the analysis size) read every m-th sample
 * only: once an output sample spans 4+ source samples per axis, half of
 * them per axis still average away the aliasing the tracker would see, at
 * a quarter (or less) of the memory traffic.
 */
type Sampling = { ax: Axis; ay: Axis; mx: number; my: number; ox: number; oy: number };

function decimation(srcLen: number, outLen: number): number {
  const s = srcLen / outLen;
  return s >= 4 ? Math.floor(s / 2) : 1;
}

function makeSampling(w: number, h: number, ow: number, oh: number): Sampling {
  const mx = decimation(w, ow);
  const my = decimation(h, oh);
  // Start near the centre of each m-block so the kept grid is centred on the full one.
  const ox = (mx - 1) >> 1;
  const oy = (my - 1) >> 1;
  return { ax: makeAxis(Math.floor((w - ox - 1) / mx) + 1, ow), ay: makeAxis(Math.floor((h - oy - 1) / my) + 1, oh), mx, my, ox, oy };
}

/** One plane of samples: element offset, row stride and pixel step (elements). */
type Plane = { data: Uint8Array | Uint16Array; offset: number; stride: number; step: number };

/**
 * Resamples a plane (from its top-left) to ow x oh with the area filter:
 * each source row is filtered horizontally once into `row`, then added to
 * the output rows it overlaps. `row` must hold ow floats.
 */
function resamplePlane(p: Plane, ow: number, ax: Axis, ay: Axis, row: Float32Array, out: Float32Array): void {
  const { data, offset, stride, step } = p;
  const xs = ax.src;
  const xd = ax.dst;
  const xw = ax.w;
  const xn = ax.n;
  const kx = ax.k;
  const taps = ax.taps;
  const xs0 = ax.start;
  const tw = ax.tw;
  out.fill(0);
  let current = -1;
  for (let q = 0; q < ay.n; q++) {
    const sy = ay.src[q];
    if (sy !== current) {
      current = sy;
      const base = offset + sy * stride;
      if (kx === 1) {
        for (let x = 0, i = base; x < ow; x++, i += step) row[x] = data[i];
      } else if (kx === 2) {
        for (let x = 0, i = base; x < ow; x++, i += 2 * step) row[x] = (data[i] + data[i + step]) * 0.5;
      } else if (kx > 0) {
        const inv = 1 / kx;
        for (let x = 0, i = base; x < ow; x++) {
          let acc = 0;
          for (let j = 0; j < kx; j++, i += step) acc += data[i];
          row[x] = acc * inv;
        }
      } else if (taps === 2) {
        for (let x = 0; x < ow; x++) {
          const i = base + xs0[x] * step;
          row[x] = data[i] * tw[2 * x] + data[i + step] * tw[2 * x + 1];
        }
      } else if (taps === 3) {
        for (let x = 0; x < ow; x++) {
          const i = base + xs0[x] * step;
          const t = 3 * x;
          row[x] = data[i] * tw[t] + data[i + step] * tw[t + 1] + data[i + 2 * step] * tw[t + 2];
        }
      } else if (taps === 4) {
        for (let x = 0; x < ow; x++) {
          const i = base + xs0[x] * step;
          const t = 4 * x;
          row[x] = data[i] * tw[t] + data[i + step] * tw[t + 1] + data[i + 2 * step] * tw[t + 2] + data[i + 3 * step] * tw[t + 3];
        }
      } else {
        row.fill(0);
        for (let k = 0; k < xn; k++) row[xd[k]] += data[base + xs[k] * step] * xw[k];
      }
    }
    const wgt = ay.w[q];
    const o = ay.dst[q] * ow;
    for (let x = 0; x < ow; x++) out[o + x] += row[x] * wgt;
  }
}

/** Y'CbCr -> G' coefficients: G = gy·(Y − y0) + gu·(U − c0) + gv·(V − c0), all in 8-bit units. */
export function greenCoefficients(matrix: string | null | undefined, fullRange: boolean, height: number): { gy: number; gu: number; gv: number; y0: number; c0: number } {
  // Kr, Kb per matrix; unspecified follows the browser's own guess (HD -> 709, SD -> 601).
  const m = matrix ?? (height >= 720 ? "bt709" : "smpte170m");
  const [kr, kb] = m === "bt709" ? [0.2126, 0.0722] : m === "bt2020-ncl" ? [0.2627, 0.0593] : m === "rgb" ? [0, 0] : [0.299, 0.114];
  const kg = 1 - kr - kb;
  const yScale = fullRange ? 1 : 255 / 219;
  const cScale = fullRange ? 1 : 255 / 224;
  // G = Y − (2·Kb(1−Kb)/Kg)·Cb − (2·Kr(1−Kr)/Kg)·Cr
  return { gy: yScale, gu: kg > 0 ? (-2 * kb * (1 - kb) * cScale) / kg : 0, gv: kg > 0 ? (-2 * kr * (1 - kr) * cScale) / kg : 0, y0: fullRange ? 0 : 16, c0: 128 };
}

/**
 * Turns a frame's planes (as VideoFrame.copyTo lays them out) into the green
 * channel at outW x outH in display orientation (rotation applied, like
 * sample.draw). Pure; exported for tests.
 */
export class PlaneConverter {
  private readonly outW: number;
  private readonly outH: number;
  private key = "";
  private cw = 0;
  private ch = 0;
  private luma: Sampling | null = null;
  private chroma: Sampling | null = null;
  private row = new Float32Array(0);
  private y = new Float32Array(0);
  private u = new Float32Array(0);
  private v = new Float32Array(0);

  constructor(outW: number, outH: number) {
    this.outW = outW;
    this.outH = outH;
  }

  convert(
    buffer: ArrayBuffer,
    layout: { offset: number; stride: number }[],
    format: PlaneFormat,
    rect: { left: number; top: number; width: number; height: number },
    rotation: number,
    colorSpace: { matrix?: string | null; fullRange?: boolean | null } | null | undefined,
    out: Float32Array,
  ): void {
    const swap = rotation === 90 || rotation === 270;
    // Size in coded orientation; rotated into place at the end.
    const cw = swap ? this.outH : this.outW;
    const ch = swap ? this.outW : this.outH;
    const key = `${format.kind}${format.sx}${format.sy}|${rect.width}x${rect.height}|${rotation}`;
    if (key !== this.key) {
      this.key = key;
      this.cw = cw;
      this.ch = ch;
      this.luma = makeSampling(rect.width, rect.height, cw, ch);
      this.chroma = format.kind === "rgb" ? null : makeSampling(Math.ceil(rect.width / format.sx), Math.ceil(rect.height / format.sy), cw, ch);
      this.row = new Float32Array(cw);
      this.y = new Float32Array(cw * ch);
      this.u = new Float32Array(cw * ch);
      this.v = new Float32Array(cw * ch);
    }
    const wide = format.bits > 8;
    const data = wide ? new Uint16Array(buffer) : new Uint8Array(buffer);
    const unit = wide ? 2 : 1;
    const norm = wide ? 1 / (1 << (format.bits - 8)) : 1;
    const n = cw * ch;
    const g = this.y;
    // copyTo copies just the visible rectangle, so every plane starts at its corner.
    const sample = (i: number, step: number, sm: Sampling, shift: number, dst: Float32Array): void => {
      const stride = layout[i].stride / unit;
      const offset = layout[i].offset / unit + shift + sm.oy * stride + sm.ox * step;
      resamplePlane({ data, offset, stride: stride * sm.my, step: step * sm.mx }, cw, sm.ax, sm.ay, this.row, dst);
    };
    const luma = this.luma!;
    if (format.kind === "rgb") {
      // Green is byte 1 in all four RGB layouts.
      sample(0, 4, luma, 1, g);
    } else {
      const chroma = this.chroma!;
      sample(0, 1, luma, 0, g);
      if (format.kind === "nv12") {
        sample(1, 2, chroma, 0, this.u);
        sample(1, 2, chroma, 1, this.v);
      } else {
        sample(1, 1, chroma, 0, this.u);
        sample(2, 1, chroma, 0, this.v);
      }
      const k = greenCoefficients(colorSpace?.matrix, colorSpace?.fullRange ?? false, rect.height);
      const { u, v } = this;
      const gy = k.gy * norm;
      const gu = k.gu * norm;
      const gv = k.gv * norm;
      const bias = -k.gy * k.y0 - (k.gu + k.gv) * k.c0;
      for (let i = 0; i < n; i++) {
        const val = gy * g[i] + gu * u[i] + gv * v[i] + bias;
        g[i] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
    }
    rotateInto(g, this.cw, this.ch, rotation, out);
  }
}

/** Copies a coded-orientation image (w x h) into `out` rotated clockwise by `rotation` degrees. */
export function rotateInto(src: Float32Array, w: number, h: number, rotation: number, out: Float32Array): void {
  if (rotation === 0) {
    out.set(src.subarray(0, w * h));
    return;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x];
      // Clockwise: 90 -> (h−1−y, x) in an h-wide image; 180 -> (w−1−x, h−1−y); 270 -> (y, w−1−x).
      if (rotation === 90) out[x * h + (h - 1 - y)] = v;
      else if (rotation === 180) out[(h - 1 - y) * w + (w - 1 - x)] = v;
      else out[(w - 1 - x) * h + y] = v;
    }
  }
}

/** Frames read both ways before picking a route (the first only warms up). */
const CALIBRATION_FRAMES = 5;

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

export type FrameReaderStats = {
  route: "planes" | "canvas" | "undecided";
  /** Calibration medians per route (ms per frame) and their largest mean output difference (0..255). */
  planesMs: number;
  canvasMs: number;
  meanDiff: number;
  /** Frames read and the time spent on them. */
  frames: number;
  readMs: number;
  /** Of readMs: VideoFrame.copyTo on the plane route. */
  copyMs: number;
};

/**
 * Green channel of each decoded frame at the analysis size (display
 * orientation), by whichever of the two routes is faster here (see top).
 */
export class FrameReader {
  readonly width: number;
  readonly height: number;
  private readonly converter: PlaneConverter;
  private readonly ctx: OffscreenCanvasRenderingContext2D | null;
  private buffer = new ArrayBuffer(0);
  private route: "planes" | "canvas" | "undecided" = "undecided";
  private readonly scratch: Float32Array;
  readonly stats: FrameReaderStats = { route: "undecided", planesMs: 0, canvasMs: 0, meanDiff: 0, frames: 0, readMs: 0, copyMs: 0 };
  private calibrated = 0;
  private canvasAvg = 0;
  private canvasRuns = 0;
  private readonly planesTimes: number[] = [];
  private readonly canvasTimes: number[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.converter = new PlaneConverter(width, height);
    this.scratch = new Float32Array(width * height);
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    if (typeof OffscreenCanvas !== "undefined") {
      ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
      }
    }
    this.ctx = ctx;
  }

  /** Fills `out` (width x height, 0..255) from `frame`. */
  async read(frame: FrameSource, out: Float32Array): Promise<void> {
    const t0 = performance.now();
    const route = this.route;
    await this.readFrame(frame, out);
    const dt = performance.now() - t0;
    this.stats.frames++;
    this.stats.readMs += dt;
    // The canvas can time well on a few frames and then stall (seen headless:
    // ~200 ms while calibrating, ~1 s per frame after). Watch it, and move to
    // the planes once it runs well behind their calibrated time.
    if (route === "canvas" && this.stats.planesMs > 0) {
      this.canvasAvg = this.canvasAvg ? 0.8 * this.canvasAvg + 0.2 * dt : dt;
      if (++this.canvasRuns >= 8 && this.canvasAvg > 1.5 * this.stats.planesMs) {
        console.info(`[motion] canvas frame reads slowed to ${this.canvasAvg.toFixed(0)} ms; reading planes (${this.stats.planesMs.toFixed(0)} ms) instead`);
        this.decide("planes");
      }
    }
  }

  private async readFrame(frame: FrameSource, out: Float32Array): Promise<void> {
    const format = planeFormat(frame.format);
    if (!format) {
      if (!this.ctx) throw new Error(`Cannot read ${frame.format ?? "opaque"} frames here`);
      return this.viaCanvas(frame, out);
    }
    if (this.route === "canvas" && this.ctx) return this.viaCanvas(frame, out);
    if (this.route === "planes" || !this.ctx) return this.viaPlanes(frame, out, format);
    // Calibration: both routes on the first frames (the first one only warms
    // them up, JIT and canvas setup), then the faster by median time.
    try {
      let t = performance.now();
      await this.viaPlanes(frame, out, format);
      const planesMs = performance.now() - t;
      t = performance.now();
      this.viaCanvas(frame, this.scratch);
      const canvasMs = performance.now() - t;
      let diff = 0;
      for (let i = 0; i < out.length; i++) diff += Math.abs(out[i] - this.scratch[i]);
      diff /= out.length;
      this.stats.meanDiff = Math.max(this.stats.meanDiff, diff);
      if (this.calibrated++ > 0) {
        this.planesTimes.push(planesMs);
        this.canvasTimes.push(canvasMs);
      }
    } catch (e) {
      console.warn("[motion] reading frame planes failed, using the canvas", e);
      this.decide("canvas");
      return this.viaCanvas(frame, out);
    }
    // The two filters differ a little (area vs the canvas's bilinear/mip); a
    // gross difference means the plane route misread this frame's layout.
    if (this.stats.meanDiff >= 6) {
      this.decide("canvas");
      out.set(this.scratch);
      return;
    }
    if (this.calibrated >= CALIBRATION_FRAMES) {
      this.stats.planesMs = median(this.planesTimes);
      this.stats.canvasMs = median(this.canvasTimes);
      // The canvas only when clearly faster (GPU raster): its own timing is the less steady one.
      this.decide(this.stats.canvasMs < 0.6 * this.stats.planesMs ? "canvas" : "planes");
    }
  }

  private decide(route: "planes" | "canvas"): void {
    this.route = route;
    this.stats.route = route;
  }

  private async viaPlanes(frame: FrameSource, out: Float32Array, format: PlaneFormat): Promise<void> {
    const size = frame.allocationSize();
    // Even length so 16-bit formats can be viewed as Uint16Array.
    if (this.buffer.byteLength < size) this.buffer = new ArrayBuffer(size + (size & 1));
    const view = new Uint8Array(this.buffer, 0, size);
    const t0 = performance.now();
    const layout = await frame.copyTo(view);
    this.stats.copyMs += performance.now() - t0;
    this.converter.convert(this.buffer, layout, format, frame.visibleRect, frame.rotation, frame.colorSpace, out);
  }

  private viaCanvas(frame: FrameSource, out: Float32Array): void {
    const ctx = this.ctx!;
    frame.draw(ctx, 0, 0, this.width, this.height);
    const rgba = ctx.getImageData(0, 0, this.width, this.height).data;
    for (let i = 0, j = 1; i < out.length; i++, j += 4) out[i] = rgba[j];
  }
}

// ---------------------------------------------------------------------------
// Reading on frame workers

export type FramePipeRequest =
  /** `prep`: also prepare each frame for a tracker with these options (see PreparedFrame). */
  | { type: "init"; width: number; height: number; prep?: PrepOptions }
  | { type: "frame"; id: number; frame: VideoFrame; rotation: number; timestamp: number }
  /** Hands buffers back for reuse. */
  | { type: "recycle"; gray: Float32Array; prepared?: PreparedFrame };

export type FramePipeResponse =
  | { type: "gray"; id: number; gray: Float32Array; prepared?: PreparedFrame; stats: FrameReaderStats }
  | { type: "error"; id: number; message: string };

/** The buffers of a prepared frame, for a transfer list. */
export function preparedBuffers(p: PreparedFrame): ArrayBuffer[] {
  const out: ArrayBuffer[] = [p.response.buffer as ArrayBuffer];
  for (const l of p.levels) out.push(l.img.buffer as ArrayBuffer, l.gx.buffer as ArrayBuffer, l.gy.buffer as ArrayBuffer);
  return out;
}

/** A decoded frame as mediabunny's sinks hand them out. */
export type DecodedSample = FrameSource & { readonly timestamp: number; toVideoFrame(): VideoFrame; close(): void };

type PipeResult = { gray: Float32Array; prepared?: PreparedFrame };

/** A frame worker (frame-worker.ts): a VideoFrame in, its gray (and prepared) frame back, in order. */
class FramePipe {
  private readonly worker: Worker;
  private readonly pending = new Map<number, { resolve: (r: PipeResult) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  stats: FrameReaderStats | null = null;

  private constructor(worker: Worker, width: number, height: number, prep: PrepOptions | undefined) {
    this.worker = worker;
    worker.onmessage = (e: MessageEvent<FramePipeResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === "gray") {
        this.stats = msg.stats;
        p.resolve({ gray: msg.gray, prepared: msg.prepared });
      } else p.reject(new Error(msg.message));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      this.failAll(new Error(e.message || "frame worker failed"));
    };
    worker.postMessage({ type: "init", width, height, prep } satisfies FramePipeRequest);
  }

  static create(width: number, height: number, prep: PrepOptions | undefined): FramePipe | null {
    if (typeof Worker === "undefined" || typeof VideoFrame === "undefined") return null;
    try {
      return new FramePipe(new Worker(new URL("./frame-worker.ts", import.meta.url), { type: "module" }), width, height, prep);
    } catch {
      return null;
    }
  }

  /** Sends a copy of the frame (the sample stays open: the caller closes it). */
  submit(sample: DecodedSample): Promise<PipeResult> {
    const frame = sample.toVideoFrame();
    const id = this.nextId++;
    const p = new Promise<PipeResult>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    try {
      this.worker.postMessage({ type: "frame", id, frame, rotation: sample.rotation, timestamp: sample.timestamp } satisfies FramePipeRequest, [frame as unknown as Transferable]);
    } catch (e) {
      frame.close();
      this.pending.delete(id);
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    return p;
  }

  recycle(r: PipeResult): void {
    this.worker.postMessage({ type: "recycle", gray: r.gray, prepared: r.prepared } satisfies FramePipeRequest, [r.gray.buffer, ...(r.prepared ? preparedBuffers(r.prepared) : [])]);
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  dispose(): void {
    this.worker.terminate();
    this.failAll(new DOMException("Aborted", "AbortError"));
  }
}

/**
 * A frame for the tracker: always the gray frame; `prepared` when a frame
 * worker prepared it (pass to MotionTracker.stepPrepared, else stepGray).
 */
export type GrayFrame = { gray: Float32Array; timestamp: number; prepared?: PreparedFrame };

export type GrayFrameStats = FrameReaderStats & { threaded: boolean };

/** Frame workers: two where the device has the cores (reading a 2.7K/4K frame can outlast tracking it). */
function pipeCount(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return cores >= 4 ? 2 : 1;
}

/** Frames in flight per frame worker, ahead of the one being tracked. */
const PIPE_DEPTH = 2;

export type GrayFrameOptions = {
  stats?: GrayFrameStats;
  /** Also prepare frames (on the workers) for a tracker with these options. */
  prep?: PrepOptions;
};

/**
 * The clip's frames as gray frames at width x height (display orientation),
 * in decode order. Reading (and preparing, with `prep`) runs on frame
 * workers when the browser allows (VideoFrames are transferable),
 * overlapping the caller's tracking; else (or if a worker fails) on this
 * thread, without `prepared`. A frame's `gray` is valid until the next
 * iteration, its `prepared` until the one after (a tracker keeps reading
 * it as the previous frame). Every sample is closed.
 */
export async function* grayFrames(samples: AsyncIterable<DecodedSample>, width: number, height: number, options: GrayFrameOptions = {}): AsyncGenerator<GrayFrame> {
  const { stats, prep } = options;
  let pipes: FramePipe[] = [];
  for (let i = 0; i < pipeCount(); i++) {
    const pipe = FramePipe.create(width, height, prep);
    if (pipe) pipes.push(pipe);
  }
  let local: FrameReader | null = null;
  let localGray: Float32Array | null = null;
  let seq = 0;
  const inflight: { sample: DecodedSample; pipe: FramePipe | null; p: Promise<PipeResult> | null }[] = [];
  /** Worker results the caller may still read (the last one is its tracker's previous frame). */
  let held: { pipe: FramePipe; r: PipeResult } | null = null;
  const readHere = async (s: DecodedSample): Promise<Float32Array> => {
    local ??= new FrameReader(width, height);
    localGray ??= new Float32Array(width * height);
    await local.read(s, localGray);
    return localGray;
  };
  const dropPipes = (why: unknown): void => {
    console.warn("[motion] frame worker unavailable, reading frames on this thread", why);
    for (const pipe of pipes) pipe.dispose();
    pipes = [];
    held = null;
    for (const item of inflight) item.p = null;
  };
  const submit = (sample: DecodedSample): void => {
    const pipe = pipes.length ? pipes[seq++ % pipes.length] : null;
    let p: Promise<PipeResult> | null = null;
    if (pipe) {
      p = pipe.submit(sample);
      p.catch(() => undefined); // awaited later; no unhandled rejection meanwhile
    }
    inflight.push({ sample, pipe, p });
  };
  const report = (threaded: boolean): void => {
    if (!stats) return;
    const all = threaded ? pipes.map((p) => p.stats).filter((x): x is FrameReaderStats => !!x) : local ? [local.stats] : [];
    if (!all.length) return;
    Object.assign(stats, all[0], {
      frames: all.reduce((n, x) => n + x.frames, 0),
      readMs: all.reduce((n, x) => n + x.readMs, 0),
      copyMs: all.reduce((n, x) => n + x.copyMs, 0),
      threaded,
    });
  };
  async function* emit(): AsyncGenerator<GrayFrame> {
    const item = inflight.shift()!;
    let result: PipeResult | null = null;
    let gray: Float32Array;
    const timestamp = item.sample.timestamp;
    try {
      if (item.p) {
        try {
          result = await item.p;
          gray = result.gray;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") throw e;
          dropPipes(e);
          gray = await readHere(item.sample);
        }
      } else gray = await readHere(item.sample);
    } finally {
      item.sample.close();
    }
    report(!!result);
    yield { gray, timestamp, prepared: result?.prepared };
    // The caller is done with this frame's gray and with the previous frame altogether.
    if (held && pipes.includes(held.pipe)) held.pipe.recycle(held.r);
    held = result && item.pipe ? { pipe: item.pipe, r: result } : null;
  }
  try {
    for await (const sample of samples) {
      submit(sample);
      if (inflight.length >= (pipes.length ? PIPE_DEPTH * pipes.length : 1)) yield* emit();
    }
    while (inflight.length) yield* emit();
  } finally {
    for (const item of inflight) item.sample.close();
    inflight.length = 0;
    for (const pipe of pipes) pipe.dispose();
  }
}
