// Offline WebCodecs export shared by the apps, built on mediabunny.
//
// Replaces canvas.captureStream + MediaRecorder (realtime only, duplicates and
// drops frames, re-encodes audio) with a decode → render → encode loop that
// keeps every source frame and its exact timestamp, copies the original audio
// packets through, and streams everything through private on-device storage
// so a long 4K clip never has to fit in page memory.
//
// Shape of an export (see ARCHITECTURE notes in each step):
//   1. plan the encoder (encoder-plan.ts): the source size and frame rate when
//      the browser can encode them, else the largest size it can, with a note;
//   2. check the storage space (storage.ts);
//   3. encode ~10 s chunks into a journal (export-journal.ts), each starting
//      with a key frame; work in flight is capped (renders, encodeQueueSize,
//      bytes waiting for storage) and every VideoFrame is closed as soon as
//      it is encoded. A crash, reload or a codec lost in the background costs
//      at most one chunk: the next run resumes after the last committed chunk,
//      re-priming the renderer's temporal state on ~1 s of frames first;
//   4. mux the chunks + the source audio into the MP4 (output-sink.ts).

import "./videoframe-colorspace";
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSample,
  VideoSampleSink,
  canEncodeAudio,
  type InputAudioTrack,
  type Rotation,
  type StreamTargetChunk,
  type VideoCodec,
} from "mediabunny";
import { FallbackSink, openOutputSink, type OutputSink } from "./output-sink";
import { encoderConfig, planEncoder, type EncoderCodec, type EncoderPlan } from "./encoder-plan";
import { checkStorage, estimateOutputBytes, MEMORY_FALLBACK_BYTES, StorageSpaceError } from "./storage";
import {
  ChunkWriter,
  journalKey,
  loadDecoderConfig,
  MemoryChunkStore,
  OpfsChunkStore,
  sameDecoderConfig,
  storeDecoderConfig,
  type ChunkStore,
  type JournalPlan,
  type PacketEntry,
  type StoredDecoderConfig,
} from "./export-journal";
import { PauseGate, runFramePipeline } from "./frame-pipeline";

export function isWebCodecsSupported(): boolean {
  return typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/**
 * Decoded frames of anamorphic sources (a sample aspect ratio other than 1:1,
 * e.g. a 1280×720 picture meant to show as 1280×960) keep their coded pixel
 * grid: `displayWidth/Height` differ from `visibleRect`, and uploading such
 * a frame into a texture allocated at the display size fails silently — the
 * export then repeats its first picture. This resamples the frame to the
 * display size through a canvas when (and only when) the two differ; the
 * returned frame replaces the input, which is closed.
 */
export function squarePixels(frame: VideoFrame): VideoFrame {
  const vw = frame.visibleRect?.width ?? frame.codedWidth;
  const vh = frame.visibleRect?.height ?? frame.codedHeight;
  const dw = frame.displayWidth, dh = frame.displayHeight;
  if (!dw || !dh || (vw === dw && vh === dh)) return frame;
  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d");
  if (!ctx) return frame;
  ctx.drawImage(frame, 0, 0, dw, dh);
  const out = new VideoFrame(canvas, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
  frame.close();
  return out;
}

/**
 * H.264/HEVC encoders reject odd frame sizes (4:2:0 chroma), and sources such
 * as a 1438-wide clip with a non-square sample aspect come out at 1439 after
 * `squarePixels`. Crops the last column/row off odd-sized frames (no copy:
 * a narrower visibleRect); even frames pass through untouched.
 */
export function evenFrame(frame: VideoFrame): VideoFrame {
  const r = frame.visibleRect;
  const w = r ? r.width : frame.codedWidth, h = r ? r.height : frame.codedHeight;
  if (w % 2 === 0 && h % 2 === 0) return frame;
  const out = new VideoFrame(frame, {
    visibleRect: { x: r ? r.x : 0, y: r ? r.y : 0, width: Math.max(2, w & ~1), height: Math.max(2, h & ~1) },
    displayWidth: Math.max(2, w & ~1),
    displayHeight: Math.max(2, h & ~1),
  });
  frame.close();
  return out;
}

export type ExportFrameInfo = {
  /** Presentation time in seconds (clip time: 0 = the first video frame; a trimmed export keeps the source's clock here). */
  timeSec: number;
  /** Time of this frame in the output file (timeSec minus the first exported frame's time). */
  outTimeSec: number;
  /** Rotation metadata of the source track (0/90/180/270). `sample.draw` applies it; a GPU path must. */
  rotation: Rotation;
  /** Upright (display) size, i.e. after rotation. */
  displayWidth: number;
  displayHeight: number;
  index: number;
  /**
   * True for the frames rendered only to re-prime temporal state (colour
   * easing, drift) before a resumed chunk: the result is not encoded, so a
   * renderer may skip its UI work for them.
   */
  prime?: boolean;
};

/**
 * Renders one decoded frame. Return a canvas / ImageBitmap / VideoFrame, or a
 * VideoSample the exporter will own and close. The returned size defines the
 * output size and must not change between frames.
 */
export type FrameRenderer = (
  sample: VideoSample,
  info: ExportFrameInfo,
) => CanvasImageSource | VideoSample | Promise<CanvasImageSource | VideoSample>;

export type ResumeInfo = { fromSec: number; progress: number; chunks: number };

export type CodecExportOptions = {
  /** Target video bitrate in bits per second. */
  bitrate: number;
  /** Storage prefix for the temporary output file. */
  opfsPrefix: string;
  signal?: AbortSignal;
  onProgress: (p: number) => void;
  log?: (line: string) => void;
  /** Preferred codecs in order (avc / hevc); default: HEVC first above 1080p or for HEVC sources. */
  codecs?: VideoCodec[];
  /**
   * Frames whose render may be in flight at once (default 2): the next
   * frame's draw is issued while the previous frame's capture/encode
   * completes. Renderers that keep per-frame GPU state must tolerate this.
   */
  pipelineDepth?: number;
  /**
   * Trim: only frames starting in [start, end) (clip seconds, half a frame
   * of tolerance) are exported, and the audio packets overlapping it; the
   * output starts at 0 with both tracks shifted by the same amount.
   */
  range?: TimeRange | null;
  /**
   * The export settings (look, tools, trim, build) as a string. With it the
   * export is journaled on the device and an interrupted one with the same
   * clip and settings resumes; without it, chunks are temporary.
   */
  resumeKey?: string | null;
  /** Cap the output's long edge (the "Export at 1080p" fallback). */
  maxLongEdge?: number;
  /** The encoder chosen (size, codec; `note` says why it isn't the source size) and where a resume starts. */
  onPlan?: (plan: EncoderPlan, resume: ResumeInfo | null) => void;
  /** Hold the export while the page is hidden instead of failing (default: phones and tablets). */
  pauseInBackground?: boolean;
  onPause?: (paused: boolean) => void;
  /** Chunk length (s, default 10) and the frames re-rendered before a resumed chunk (s, default 1). */
  chunkSec?: number;
  primeSec?: number;
};

/** A time range in clip seconds (0 = the first video frame). */
export type TimeRange = { start: number; end: number };

/** Half-frame-tolerant membership of a frame starting at `t` (same rule as the Studio's trim maths). */
function inRange(t: number, r: TimeRange | null | undefined, fps: number): boolean {
  if (!r) return true;
  const half = 0.5 / (fps > 0 ? fps : 30);
  return t >= r.start - half && t < r.end - half;
}

/**
 * Clip time of the first frame a trimmed export keeps: the last packet
 * starting at or before start + half a frame (a packet lookup, no decode).
 */
async function firstKeptTime(track: import("mediabunny").InputVideoTrack, r: TimeRange, t0: number, fps: number): Promise<number> {
  const half = 0.5 / (fps > 0 ? fps : 30);
  const pkt = await new EncodedPacketSink(track).getPacket(t0 + r.start + half).catch(() => null);
  const t = pkt ? pkt.timestamp - t0 : r.start;
  return t >= r.start - half ? t : r.start;
}

export type CodecExportResult = {
  blob: Blob;
  /** False when the source has audio but neither passthrough nor AAC re-encode was possible. */
  audioIncluded: boolean;
  codec: VideoCodec;
  frames: number;
  elapsedMs: number;
  /** Output size (smaller than the source only when the device couldn't encode the source size). */
  width: number;
  height: number;
  plan: EncoderPlan;
  /** Output time the export resumed from (null: it ran from the start). */
  resumedFromSec: number | null;
};

/** Encoder frames queued at once (each a full-size frame in GPU / shared memory). */
const MAX_ENCODE_QUEUE = 3;
/** Encoded bytes allowed to wait for storage before the encode loop waits. */
const MAX_STORAGE_BACKLOG = 48 * 1024 * 1024;
/** Key frame at least this often (s) inside a chunk, for seeking. */
const KEY_INTERVAL_SEC = 2;
/** A pass that fails with a codec error (e.g. reclaimed while the page was hidden) restarts from its last chunk this often. */
const MAX_PASS_RETRIES = 3;

class ParamSetChanged extends Error {}

/** WebCodecs failures a fresh encoder/decoder may get past (lost in the background, reclaimed, GPU reset). */
function isCodecFailure(e: unknown): boolean {
  if (e instanceof StorageSpaceError || isAbort(e)) return false;
  const name = (e as { name?: string })?.name ?? "";
  const msg = String((e as { message?: string })?.message ?? e);
  return /EncodingError|OperationError|QuotaExceededError|InvalidStateError|NotReadableError/.test(name)
    || /codec|reclaim|encod|decod|closed|context lost|device lost/i.test(msg);
}

async function waitUnlessAborted(p: Promise<void> | void, signal?: AbortSignal): Promise<void> {
  if (!p) return;
  if (!signal) return p;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
    p.then(resolve, resolve);
  });
}

function mobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/** Reads a chunk's packets through a sliding window (bounded memory for 100 MB chunks). */
class WindowReader {
  private start = 0;
  private buf = new Uint8Array(0);
  private readonly blob: Blob;
  private readonly window: number;
  constructor(blob: Blob, window = 16 * 1024 * 1024) {
    this.blob = blob;
    this.window = window;
  }
  async read(offset: number, size: number): Promise<Uint8Array> {
    if (offset < this.start || offset + size > this.start + this.buf.byteLength) {
      this.start = offset;
      this.buf = new Uint8Array(await this.blob.slice(offset, Math.min(this.blob.size, offset + Math.max(size, this.window))).arrayBuffer());
      if (this.buf.byteLength < size) throw new Error("export journal: chunk truncated");
    }
    return this.buf.subarray(offset - this.start, offset - this.start + size);
  }
}

/** Turns a renderer's output into the frame the encoder takes: plan size, even, stamped. */
class FrameAdapter {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private readonly width: number;
  private readonly height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  toFrame(r: CanvasImageSource | VideoSample, timestamp: number, duration: number | undefined): VideoFrame {
    let f: VideoFrame;
    if (r instanceof VideoSample) {
      const v = r.toVideoFrame();
      f = new VideoFrame(v, { timestamp, duration });
      v.close();
    } else if (typeof VideoFrame !== "undefined" && r instanceof VideoFrame) {
      f = new VideoFrame(r, { timestamp, duration });
    } else {
      f = new VideoFrame(r as CanvasImageSource, { timestamp, duration });
    }
    f = evenFrame(f);
    if (f.displayWidth === this.width && f.displayHeight === this.height) return f;
    // Downscaled plan (the device can't encode the source size), or a renderer a pixel off.
    if (!this.canvas) {
      this.canvas = new OffscreenCanvas(this.width, this.height);
      this.ctx = this.canvas.getContext("2d");
    }
    if (!this.ctx) {
      f.close();
      throw new Error("2D canvas unavailable for resizing");
    }
    this.ctx.drawImage(f, 0, 0, this.width, this.height);
    f.close();
    return new VideoFrame(this.canvas, { timestamp, duration });
  }
}

function releaseRendered(r: CanvasImageSource | VideoSample | undefined): void {
  if (!r) return;
  if (r instanceof VideoSample) r.close();
  else if (typeof VideoFrame !== "undefined" && r instanceof VideoFrame) r.close();
  else if (typeof ImageBitmap !== "undefined" && r instanceof ImageBitmap) r.close();
}

export async function exportWithCodec(
  file: File,
  render: FrameRenderer,
  opts: CodecExportOptions,
): Promise<CodecExportResult> {
  const { signal, onProgress, log = () => undefined } = opts;
  throwIfAborted(signal);
  const started = performance.now();
  const chunkSec = opts.chunkSec ?? 10;
  const primeSec = opts.primeSec ?? 1;

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let sink: OutputSink | null = null;
  let output: Output | null = null;
  let store: ChunkStore | null = null;
  // Pause while hidden (iOS suspends the page; Chrome reclaims idle codecs in background tabs).
  const gate = new PauseGate();
  const pauseInBackground = opts.pauseInBackground ?? mobileDevice();
  let hiddenDuringPass = false;
  const onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") {
      hiddenDuringPass = true;
      if (pauseInBackground && !gate.paused) {
        gate.pause();
        log("page hidden: export paused");
        opts.onPause?.(true);
      }
    } else if (gate.paused) {
      gate.resume();
      log("page visible: export resumed");
      opts.onPause?.(false);
    }
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  let keepJournal = false;
  let resumable = false;
  let keepChunks = true;
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track in file");
    if (!(await videoTrack.canDecode())) throw new Error("Video codec not decodable by this browser");
    const duration = await input.computeDuration();
    const rotation = await videoTrack.getRotation();
    const displayWidth = await videoTrack.getDisplayWidth();
    const displayHeight = await videoTrack.getDisplayHeight();
    const sourceCodec = await videoTrack.getCodec().catch(() => null);
    const packetStats = await videoTrack.computePacketStats(100).catch(() => null);
    const fps = packetStats?.averagePacketRate ?? 30;
    const half = 0.5 / (fps > 0 ? fps : 30);
    // Container timestamps can start before zero (edit lists, B-frame
    // reordering); the output starts at the first video frame and both
    // tracks shift by the same amount so sync is untouched.
    const t0 = await videoTrack.getFirstTimestamp();
    const range = opts.range ?? null;
    // Output clock: 0 at the first exported frame; audio shifts by the same amount.
    const offset = range ? await firstKeptTime(videoTrack, range, t0, fps) : 0;
    const span = range ? Math.max(1e-3, range.end - range.start) : duration;
    if (range) log(`trim ${range.start.toFixed(3)}–${range.end.toFixed(3)} s (first frame ${offset.toFixed(3)} s)`);

    // 1. Encoder plan.
    const codecs = opts.codecs?.filter((c): c is EncoderCodec => c === "avc" || c === "hevc");
    const plan = await planEncoder({ width: displayWidth, height: displayHeight, fps, bitrate: opts.bitrate, codecs: codecs?.length ? codecs : undefined, sourceCodec, maxLongEdge: opts.maxLongEdge });
    if (!plan) throw new Error(`This browser can't encode H.264 or HEVC video at ${displayWidth}×${displayHeight}, even scaled down`);
    log(`encoder ${plan.codecString} ${plan.width}x${plan.height} @ ${fps.toFixed(2)} fps, ${Math.round(plan.bitrate / 1e6)} Mbps${plan.note ? ` (${plan.note})` : ""}`);
    throwIfAborted(signal);

    // 2. Storage: the chunks, then the MP4 (chunks are dropped as they are muxed when space is tight).
    const expected = estimateOutputBytes(plan.bitrate, span);
    const chunkBytes = estimateOutputBytes(plan.bitrate, chunkSec);
    const verdict = await checkStorage(expected + chunkBytes);
    if (verdict.verdict === "short") throw new StorageSpaceError(verdict.message!);
    const memoryOnly = verdict.verdict === "memory";
    keepChunks = verdict.freeBytes === null || verdict.freeBytes > 2.2 * expected + 50e6;
    log(`storage: ~${Math.round(expected / 1e6)} MB needed, ${verdict.freeBytes === null ? "free space unknown" : `${Math.round(verdict.freeBytes / 1e6)} MB free`}${memoryOnly ? " → in memory" : ""}`);

    // 3. Journal: resumable with a settings key, temporary otherwise.
    const jp: JournalPlan = { codec: plan.codec, codecString: plan.codecString, width: plan.width, height: plan.height, bitrate: plan.bitrate, fps };
    resumable = !!opts.resumeKey && !memoryOnly;
    const key = resumable
      ? await journalKey(file, opts.resumeKey!, range, opts.maxLongEdge)
      : `tmp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (!memoryOnly) store = await OpfsChunkStore.open(key, file.name, jp, chunkSec, span, MEMORY_FALLBACK_BYTES);
    if (!store) {
      store = new MemoryChunkStore(key, file.name, jp, chunkSec, span);
      // Chunks in memory: free each one as soon as it is muxed.
      keepChunks = false;
      resumable = false;
    }
    const st: ChunkStore = store;
    const resumeOf = (): ResumeInfo | null => {
      const c = st.manifest.chunks;
      if (!c.length) return null;
      const fromSec = c[c.length - 1].lastUs / 1e6;
      return { fromSec, progress: Math.min(0.99, fromSec / span), chunks: c.length };
    };
    const resumeAtStart = resumeOf();
    if (resumeAtStart) log(`resuming after ${resumeAtStart.chunks} chunks (${resumeAtStart.fromSec.toFixed(2)} s, ${Math.round(resumeAtStart.progress * 100)}%)`);
    opts.onPlan?.(plan, resumeAtStart);

    const sampleSink = new VideoSampleSink(videoTrack);
    const depth = Math.max(1, opts.pipelineDepth ?? 2);
    const adapter = new FrameAdapter(plan.width, plan.height);
    const frameDurUs = Math.round(1e6 / (fps > 0 ? fps : 30));
    let lastProgressAt = 0;
    let renderIndex = 0;

    /** Encodes from after the last committed chunk to the end. */
    const encodePass = async (): Promise<void> => {
      const committed = st.manifest.chunks;
      const lastUs = committed.length ? committed[committed.length - 1].lastUs : -Infinity;
      const firstChunk = committed.length ? committed[committed.length - 1].index + 1 : 0;
      const resumeOut = committed.length ? lastUs / 1e6 : null;
      // Decode from 1 s before the resume point; those frames only re-prime the renderer.
      const fromOut = resumeOut === null ? 0 : Math.max(0, resumeOut - primeSec);
      const startClip = (range ? offset : 0) + fromOut;
      const endClip = range ? range.end : Infinity;

      let encError: unknown = null;
      let writer: ChunkWriter | null = null;
      let sessionConfig: StoredDecoderConfig | null = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig) sessionConfig = storeDecoderConfig(meta.decoderConfig);
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          if (!writer) {
            encError ??= new Error("encoder output outside a chunk");
            return;
          }
          writer.add(data, chunk.timestamp, chunk.duration ?? frameDurUs, chunk.type === "key");
        },
        error: (e) => {
          encError ??= e;
        },
      });
      encoder.configure(encoderConfig(plan));
      let lastKeyUs = -Infinity;
      const finishChunk = async (w: ChunkWriter) => {
        await encoder.flush();
        if (encError) throw encError;
        const blob = await w.close();
        if (st.manifest.decoderConfig && !sameDecoderConfig(st.manifest.decoderConfig, sessionConfig)) {
          // A resumed encoder produced different parameter sets: the chunks can't share one track.
          throw new ParamSetChanged("encoder parameter sets changed");
        }
        await st.commit(w, blob, sessionConfig);
      };
      const waitForEncoder = async () => {
        while (encoder.encodeQueueSize >= MAX_ENCODE_QUEUE && !encError) {
          await new Promise<void>((r) => {
            const t = setTimeout(r, 50);
            encoder.addEventListener("dequeue", () => {
              clearTimeout(t);
              r();
            }, { once: true });
          });
        }
        if (encError) throw encError;
      };

      type Job = { sample: VideoSample; timeSec: number; outTimeSec: number; tsUs: number; prime: boolean };
      const jobs = async function* (): AsyncGenerator<Job> {
        for await (const sample of sampleSink.samples(t0 + startClip, endClip === Infinity ? undefined : t0 + endClip)) {
          const timeSec = Math.max(0, sample.timestamp - t0);
          const outTimeSec = Math.max(0, timeSec - offset);
          const tsUs = Math.round(outTimeSec * 1e6);
          yield { sample, timeSec, outTimeSec, tsUs, prime: tsUs <= lastUs };
        }
      };
      try {
        await runFramePipeline<Job, CanvasImageSource | VideoSample>(jobs(), {
          depth,
          gate: gate.wait,
          signal,
          accept: (j) => inRange(j.timeSec, range, fps) && j.outTimeSec >= fromOut - half,
          render: async (j) => {
            const info: ExportFrameInfo = { timeSec: j.timeSec, outTimeSec: j.outTimeSec, rotation, displayWidth, displayHeight, index: renderIndex++, prime: j.prime };
            const r = await render(j.sample, info);
            // A canvas is reused by the next render: snapshot it now (prime frames are never encoded).
            if (j.prime || r instanceof VideoSample || r instanceof VideoFrame) return r;
            return new VideoFrame(r, { timestamp: j.tsUs });
          },
          encode: async (rendered, j) => {
            if (j.prime) return;
            const idx = Math.max(writer?.index ?? firstChunk, Math.floor((j.outTimeSec + half) / chunkSec));
            let keyFrame = false;
            if (!writer || idx > writer.index) {
              if (writer) {
                const w = writer;
                await finishChunk(w);
              }
              writer = await st.openChunk(idx);
              keyFrame = true;
            }
            if (j.tsUs - lastKeyUs >= KEY_INTERVAL_SEC * 1e6) keyFrame = true;
            await waitForEncoder();
            await writer.drainTo(MAX_STORAGE_BACKLOG);
            const frame = adapter.toFrame(rendered, j.tsUs, j.sample.duration ? Math.round(j.sample.duration * 1e6) : frameDurUs);
            try {
              encoder.encode(frame, { keyFrame });
            } finally {
              frame.close();
            }
            if (keyFrame) lastKeyUs = j.tsUs;
            writer.noteFrame(j.tsUs);
            const now = performance.now();
            if (span > 0 && now - lastProgressAt > 100) {
              lastProgressAt = now;
              onProgress(Math.min(0.97, Math.max(0, (j.outTimeSec / span) * 0.97)));
            }
          },
          releaseInput: (j) => j.sample.close(),
          releaseFrame: releaseRendered,
        });
        if (writer) await finishChunk(writer);
        writer = null;
      } catch (e) {
        await (writer as ChunkWriter | null)?.abort();
        throw e;
      } finally {
        if (encoder.state !== "closed") encoder.close();
      }
    };

    // Codec failures (lost in the background, reclaimed, a GPU reset) restart the pass from the last chunk.
    // The retry budget refills whenever a pass got further than the last one.
    for (let attempt = 0, resets = 0, lastChunks = -1; ; ) {
      hiddenDuringPass = false;
      try {
        await encodePass();
        break;
      } catch (e) {
        if (e instanceof ParamSetChanged && resets++ === 0) {
          log("encoder parameter sets differ from the journal: starting over");
          await st.reset(jp);
          continue;
        }
        if (isAbort(e) || signal?.aborted) throw e;
        if (st.manifest.chunks.length > lastChunks) attempt = 0;
        lastChunks = st.manifest.chunks.length;
        if ((isCodecFailure(e) || hiddenDuringPass) && attempt++ < MAX_PASS_RETRIES) {
          log(`pass failed (${(e as Error)?.message ?? e}); retrying from chunk ${st.manifest.chunks.length}`);
          await waitUnlessAborted(gate.wait(), signal);
          throwIfAborted(signal);
          continue;
        }
        throw e;
      }
    }
    throwIfAborted(signal);
    const chunks = st.manifest.chunks;
    const frames = chunks.reduce((n, c) => n + c.frames, 0);
    if (frames === 0) throw new Error("Decoder produced no frames");
    if (!st.manifest.decoderConfig) throw new Error("Encoder produced no decoder configuration");

    // 4. Mux: the chunks' packets + the source audio.
    keepJournal = resumable && keepChunks;
    sink = memoryOnly ? new FallbackSink(null) : await openOutputSink(opts.opfsPrefix, { expectedBytes: expected, log });
    log(`output → ${sink.kind === "file" ? "private on-device storage" : "memory"}`);
    const out = sink;
    const writable = new WritableStream<StreamTargetChunk>({
      write: (chunk) => out.write(chunk.data, chunk.position),
    });
    output = new Output({
      // moov at the end: sequential writes into storage, no in-memory buffering.
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
    });
    const videoSource = new EncodedVideoPacketSource(plan.codec);
    output.addVideoTrack(videoSource, { frameRate: fps });

    // Audio plan: copy the source packets verbatim (zero generation loss, no
    // decode cost); fall back to AAC re-encode for codecs mp4 can't carry;
    // otherwise ship video-only.
    const audioTrack = await input.getPrimaryAudioTrack();
    let audioMode: "passthrough" | "reencode" | null = null;
    let packetSource: EncodedAudioPacketSource | null = null;
    let audioSampleSource: AudioSampleSource | null = null;
    if (audioTrack) {
      const aCodec = await audioTrack.getCodec();
      const decoderConfig = await audioTrack.getDecoderConfig();
      if (aCodec && decoderConfig && output.format.getSupportedCodecs().includes(aCodec)) {
        packetSource = new EncodedAudioPacketSource(aCodec);
        output.addAudioTrack(packetSource);
        audioMode = "passthrough";
      } else if ((await audioTrack.canDecode()) && (await canEncodeAudio("aac"))) {
        audioSampleSource = new AudioSampleSource({ codec: "aac", bitrate: 192_000 });
        output.addAudioTrack(audioSampleSource);
        audioMode = "reencode";
      }
      log(`audio ${aCodec ?? "?"} → ${audioMode ?? "dropped"}`);
    }

    await output.start();

    // Audio first: packets are tiny next to 4K video frames, and the muxer
    // interleaves by timestamp at finalize anyway.
    if (audioMode === "passthrough" && packetSource && audioTrack) {
      const decoderConfig = await audioTrack.getDecoderConfig();
      const packetSink = new EncodedPacketSink(audioTrack);
      let first = true;
      // Trimmed: start reading at the packet covering the cut, stop past the end.
      const startPacket = range ? await packetSink.getPacket(t0 + range.start).catch(() => null) : null;
      for await (const packet of packetSink.packets(startPacket ?? undefined)) {
        throwIfAborted(signal);
        const clip = packet.timestamp - t0;
        if (range && clip >= range.end) break;
        if (range && clip + packet.duration <= range.start) continue;
        const ts = clip - offset;
        if (ts + packet.duration <= 0) continue;
        // iPhone .mov files carry audio priming: the first packet sits a few
        // ms before zero even when the video starts at 0 — always clamp.
        const shifted = ts === packet.timestamp && ts >= 0 ? packet : new EncodedPacket(packet.data, packet.type, Math.max(0, ts), packet.duration, packet.sequenceNumber);
        await packetSource.add(shifted, first && decoderConfig ? { decoderConfig } : undefined);
        first = false;
      }
      packetSource.close();
    } else if (audioMode === "reencode" && audioSampleSource && audioTrack) {
      await writeReencodedAudio(audioTrack, audioSampleSource, signal, range, t0, offset);
    }

    const decoderConfig = loadDecoderConfig(st.manifest.decoderConfig);
    let firstPacket = true;
    let muxed = 0;
    for (const rec of chunks) {
      throwIfAborted(signal);
      const { packets, data } = await st.readChunk(rec.index);
      const reader = new WindowReader(data);
      for (const [ts, dur, key, off, size] of packets as PacketEntry[]) {
        const bytes = await reader.read(off, size);
        await videoSource.add(new EncodedPacket(bytes, key ? "key" : "delta", ts / 1e6, dur / 1e6), firstPacket ? { decoderConfig } : undefined);
        firstPacket = false;
      }
      if (!keepChunks) await st.dropChunk(rec.index);
      muxed++;
      onProgress(0.97 + 0.03 * (muxed / chunks.length));
    }
    videoSource.close();
    throwIfAborted(signal);
    await output.finalize();
    const blob = await sink.finish("video/mp4");
    await st.destroy();
    store = null;
    onProgress(1);
    return {
      blob,
      audioIncluded: !audioTrack || audioMode !== null,
      codec: plan.codec,
      frames,
      elapsedMs: performance.now() - started,
      width: plan.width,
      height: plan.height,
      plan,
      resumedFromSec: resumeAtStart?.fromSec ?? null,
    };
  } catch (e) {
    if (output?.state === "started") await output.cancel().catch(() => undefined);
    await sink?.discard().catch(() => undefined);
    // Cancelled by the user, or not resumable: nothing to keep. A failure keeps the journal for "Resume".
    if (store && (isAbort(e) || !resumable || (output !== null && !keepJournal))) await store.destroy().catch(() => undefined);
    throw e;
  } finally {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    gate.resume();
    input.dispose();
  }
}

async function writeReencodedAudio(
  audioTrack: InputAudioTrack,
  source: AudioSampleSource,
  signal: AbortSignal | undefined,
  range: TimeRange | null,
  t0: number,
  offset: number,
): Promise<void> {
  const sink = new AudioSampleSink(audioTrack);
  for await (const sample of range ? sink.samples(t0 + range.start, t0 + range.end) : sink.samples()) {
    try {
      throwIfAborted(signal);
      if (range) {
        const ts = sample.timestamp - t0 - offset;
        if (ts + sample.duration <= 0) continue;
        sample.setTimestamp(Math.max(0, ts));
      }
      await source.add(sample);
    } finally {
      sample.close();
    }
  }
  source.close();
}

/**
 * Decodes every frame of a file in presentation order (analysis passes, the
 * native export). `timeSec` is the container timestamp; with `range` (clip
 * seconds, 0 = first frame) only the frames an export of it keeps are yielded.
 */
export async function* decodeFrames(
  file: File,
  signal?: AbortSignal,
  range?: TimeRange | null,
): AsyncGenerator<{ sample: VideoSample; info: ExportFrameInfo; duration: number }, void, unknown> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    if (!(await input.canRead())) throw new Error("Container format not supported by the codec pipeline");
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track in file");
    if (!(await track.canDecode())) throw new Error("Video codec not decodable by this browser");
    const rotation = await track.getRotation();
    const displayWidth = await track.getDisplayWidth();
    const displayHeight = await track.getDisplayHeight();
    const duration = await input.computeDuration();
    const sink = new VideoSampleSink(track);
    const t0 = range ? await track.getFirstTimestamp() : 0;
    const fps = range ? ((await track.computePacketStats(100).catch(() => null))?.averagePacketRate ?? 30) : 30;
    let index = 0;
    let first: number | null = null;
    for await (const sample of range ? sink.samples(t0 + range.start, t0 + range.end) : sink.samples()) {
      throwIfAborted(signal);
      if (range && !inRange(sample.timestamp - t0, range, fps)) {
        sample.close();
        continue;
      }
      if (first === null) first = sample.timestamp;
      yield { sample, info: { timeSec: sample.timestamp, outTimeSec: sample.timestamp - first, rotation, displayWidth, displayHeight, index: index++ }, duration };
    }
  } finally {
    input.dispose();
  }
}
