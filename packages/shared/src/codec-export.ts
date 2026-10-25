// Offline WebCodecs export shared by the apps, built on mediabunny.
//
// Replaces canvas.captureStream + MediaRecorder (realtime only, duplicates and
// drops frames, re-encodes audio) with a decode → render → encode loop that
// keeps every source frame and its exact timestamp, copies the original audio
// packets through, and streams the muxed bytes into private on-device storage
// so a long 4K clip never has to fit in page memory.

import "./videoframe-colorspace";
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  canEncodeAudio,
  canEncodeVideo,
  type InputAudioTrack,
  type Rotation,
  type StreamTargetChunk,
  type VideoCodec,
} from "mediabunny";
import { openOutputSink, type OutputSink } from "./output-sink";

export function isWebCodecsSupported(): boolean {
  return typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

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

export type CodecExportOptions = {
  /** Target video bitrate in bits per second. */
  bitrate: number;
  /** Storage prefix for the temporary output file. */
  opfsPrefix: string;
  signal?: AbortSignal;
  onProgress: (p: number) => void;
  log?: (line: string) => void;
  /** Preferred codecs in order; the first one the browser can encode wins. */
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
};

export async function exportWithCodec(
  file: File,
  render: FrameRenderer,
  opts: CodecExportOptions,
): Promise<CodecExportResult> {
  const { bitrate, signal, onProgress, log = () => undefined } = opts;
  throwIfAborted(signal);
  const started = performance.now();
  let codec: VideoCodec | null = null;
  for (const c of opts.codecs ?? ["avc", "hevc"]) {
    if (await canEncodeVideo(c)) {
      codec = c;
      break;
    }
  }
  if (!codec) throw new Error("This browser can't encode H.264 or HEVC via WebCodecs");

  const sink: OutputSink = await openOutputSink(opts.opfsPrefix);
  log(`output → ${sink.kind === "file" ? "private on-device storage" : "memory"}, codec ${codec}, ${Math.round(bitrate / 1e6)} Mbps`);

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const writable = new WritableStream<StreamTargetChunk>({
    write: (chunk) => sink.write(chunk.data, chunk.position),
  });
  const output = new Output({
    // moov at the end: sequential writes into storage, no in-memory buffering.
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
  });
  let frames = 0;
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track in file");
    if (!(await videoTrack.canDecode())) throw new Error("Video codec not decodable by this browser");
    const duration = await input.computeDuration();
    const rotation = await videoTrack.getRotation();
    const displayWidth = await videoTrack.getDisplayWidth();
    const displayHeight = await videoTrack.getDisplayHeight();
    const packetStats = await videoTrack.computePacketStats(100).catch(() => null);
    const fps = packetStats?.averagePacketRate ?? 30;
    // Container timestamps can start before zero (edit lists, B-frame
    // reordering); the output starts at the first video frame and both
    // tracks shift by the same amount so sync is untouched.
    const t0 = await videoTrack.getFirstTimestamp();
    const range = opts.range ?? null;
    // Output clock: 0 at the first exported frame; audio shifts by the same amount.
    const offset = range ? await firstKeptTime(videoTrack, range, t0, fps) : 0;
    const span = range ? Math.max(1e-3, range.end - range.start) : duration;
    if (range) log(`trim ${range.start.toFixed(3)}–${range.end.toFixed(3)} s (first frame ${offset.toFixed(3)} s)`);

    const videoSource = new VideoSampleSource({
      codec,
      bitrate,
      keyFrameInterval: 2,
      onEncoderConfig: (c) => log(`encoder ${c.codec} ${c.width}x${c.height} ${c.hardwareAcceleration ?? ""}`),
    });
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

    const sampleSink = new VideoSampleSink(videoTrack);
    let lastProgressAt = 0;
    const depth = Math.max(1, opts.pipelineDepth ?? 2);
    // Renders in flight, oldest first; each resolves to the frame to encode.
    const inflight: { promise: Promise<VideoSample>; sample: VideoSample; timeSec: number }[] = [];
    const encodeOldest = async () => {
      const job = inflight.shift()!;
      let out: VideoSample | undefined;
      try {
        out = await job.promise;
        // Awaiting add() is the encoder backpressure: without it the decode
        // loop outruns the encoder and buffers raw 4K frames until the tab dies.
        await videoSource.add(out);
      } finally {
        out?.close();
        job.sample.close();
      }
      frames += 1;
      const now = performance.now();
      if (span > 0 && now - lastProgressAt > 100) {
        lastProgressAt = now;
        onProgress(Math.min(1, Math.max(0, (job.timeSec - (range ? range.start : 0)) / span)));
      }
    };
    try {
      for await (const sample of range ? sampleSink.samples(t0 + range.start, t0 + range.end) : sampleSink.samples()) {
        throwIfAborted(signal);
        const timeSec = Math.max(0, sample.timestamp - t0);
        if (!inRange(timeSec, range, fps)) {
          sample.close();
          continue;
        }
        const outTimeSec = Math.max(0, timeSec - offset);
        const info: ExportFrameInfo = { timeSec, outTimeSec, rotation, displayWidth, displayHeight, index: frames + inflight.length };
        const promise = Promise.resolve(render(sample, info)).then((rendered) => {
          if (rendered instanceof VideoSample) {
            rendered.setTimestamp(outTimeSec);
            return rendered;
          }
          return new VideoSample(rendered, { timestamp: outTimeSec, duration: sample.duration });
        });
        inflight.push({ promise, sample, timeSec });
        if (inflight.length >= depth) await encodeOldest();
      }
      while (inflight.length > 0) await encodeOldest();
    } catch (e) {
      // Drain what is in flight so no frame leaks, then rethrow.
      for (const job of inflight) {
        job.promise.then((f) => f.close(), () => undefined);
        job.sample.close();
      }
      inflight.length = 0;
      throw e;
    }
    videoSource.close();
    throwIfAborted(signal);
    if (frames === 0) throw new Error("Decoder produced no frames");
    await output.finalize();
    const blob = await sink.finish("video/mp4");
    onProgress(1);
    return {
      blob,
      audioIncluded: !audioTrack || audioMode !== null,
      codec,
      frames,
      elapsedMs: performance.now() - started,
    };
  } catch (e) {
    if (output.state === "started") await output.cancel().catch(() => undefined);
    await sink.discard().catch(() => undefined);
    throw e;
  } finally {
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
