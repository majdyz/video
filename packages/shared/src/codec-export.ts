// Offline WebCodecs export shared by the apps, built on mediabunny.
//
// Replaces canvas.captureStream + MediaRecorder (realtime only, duplicates and
// drops frames, re-encodes audio) with a decode → render → encode loop that
// keeps every source frame and its exact timestamp, copies the original audio
// packets through, and streams the muxed bytes into private on-device storage
// so a long 4K clip never has to fit in page memory.

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

export type ExportFrameInfo = {
  /** Presentation time in seconds. */
  timeSec: number;
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
};

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
      for await (const packet of packetSink.packets()) {
        throwIfAborted(signal);
        const ts = packet.timestamp - t0;
        if (ts + packet.duration <= 0) continue;
        const shifted = t0 === 0 ? packet : new EncodedPacket(packet.data, packet.type, Math.max(0, ts), packet.duration, packet.sequenceNumber);
        await packetSource.add(shifted, first && decoderConfig ? { decoderConfig } : undefined);
        first = false;
      }
      packetSource.close();
    } else if (audioMode === "reencode" && audioSampleSource && audioTrack) {
      await writeReencodedAudio(audioTrack, audioSampleSource, signal);
    }

    const sampleSink = new VideoSampleSink(videoTrack);
    let lastProgressAt = 0;
    for await (const sample of sampleSink.samples()) {
      try {
        throwIfAborted(signal);
        const timeSec = Math.max(0, sample.timestamp - t0);
        const info: ExportFrameInfo = { timeSec, rotation, displayWidth, displayHeight, index: frames };
        const rendered = await render(sample, info);
        if (rendered instanceof VideoSample) rendered.setTimestamp(timeSec);
        const out = rendered instanceof VideoSample
          ? rendered
          : new VideoSample(rendered, { timestamp: timeSec, duration: sample.duration });
        // Awaiting add() is the encoder backpressure: without it the decode
        // loop outruns the encoder and buffers raw 4K frames until the tab dies.
        try {
          await videoSource.add(out);
        } finally {
          out.close();
        }
        frames += 1;
        const now = performance.now();
        if (duration > 0 && now - lastProgressAt > 100) {
          lastProgressAt = now;
          onProgress(Math.min(1, sample.timestamp / duration));
        }
      } finally {
        sample.close();
      }
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
  signal?: AbortSignal,
): Promise<void> {
  const sink = new AudioSampleSink(audioTrack);
  for await (const sample of sink.samples()) {
    try {
      throwIfAborted(signal);
      await source.add(sample);
    } finally {
      sample.close();
    }
  }
  source.close();
}

/** Decodes every frame of a file in presentation order (analysis passes). */
export async function* decodeFrames(
  file: File,
  signal?: AbortSignal,
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
    let index = 0;
    for await (const sample of sink.samples()) {
      throwIfAborted(signal);
      yield { sample, info: { timeSec: sample.timestamp, rotation, displayWidth, displayHeight, index: index++ }, duration };
    }
  } finally {
    input.dispose();
  }
}
