// WebCodecs-based analysis + export pipeline, built on mediabunny.
//
// The playback-based analysers (stabilizer.ts / stabilizer-opencv.ts) drive
// a <video> element and sample whatever frames the decoder happens to
// present in real time — on compute-bound 4K clips that drops frames, and
// on VFR clips the assumed-constant frame rate is simply wrong. This
// pipeline demuxes the file directly and decodes EVERY frame in
// presentation order with its exact container timestamp, so the cumulative
// motion path has one entry per real source frame with no gaps.
//
// The export side replaces canvas.captureStream + MediaRecorder (realtime
// only, duplicates/drops frames, re-encodes audio) with an offline decode →
// warp → encode loop that preserves source timestamps exactly and copies
// the original audio packets without re-encoding.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  canEncodeAudio,
  canEncodeVideo,
  AudioSampleSink,
  AudioSampleSource,
  EncodedAudioPacketSource,
  type InputAudioTrack,
} from "mediabunny";
import type { AnalysisResult, PairwiseTracker } from "./stabilizer";

export function isWebCodecsSupported(): boolean {
  return typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function analyzeWithCodec(
  file: File,
  createTracker: (srcW: number, srcH: number) => PairwiseTracker,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  throwIfAborted(signal);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let tracker: PairwiseTracker | null = null;
  try {
    if (!(await input.canRead())) {
      throw new Error("Container format not supported by the codec pipeline");
    }
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track in file");
    if (!(await track.canDecode())) {
      throw new Error("Video codec not decodable by this browser");
    }
    // Display dimensions (rotation + pixel aspect applied) so the tracker
    // sees the same geometry as video.videoWidth/videoHeight and the
    // resulting transforms are valid for the render canvas.
    const srcW = await track.getDisplayWidth();
    const srcH = await track.getDisplayHeight();
    if (!srcW || !srcH) throw new Error("Video has no usable size");
    const duration = await input.computeDuration();

    tracker = createTracker(srcW, srcH);
    const canvas = new OffscreenCanvas(tracker.width, tracker.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const cumAArr: number[] = [];
    const cumBArr: number[] = [];
    const cumTXArr: number[] = [];
    const cumTYArr: number[] = [];
    const timesArr: number[] = [];
    let cA = 1, cB = 0, cTX = 0, cTY = 0;

    const sink = new VideoSampleSink(track);
    for await (const sample of sink.samples()) {
      // Close every sample inside the loop body — the sink pre-decodes
      // a couple of frames ahead, so any sample we hold is one the
      // decoder can't reclaim.
      try {
        throwIfAborted(signal);
        // sample.draw applies the container rotation metadata, so iPhone
        // portrait/landscape clips land the right way up.
        sample.draw(ctx, 0, 0, tracker.width, tracker.height);
        const img = ctx.getImageData(0, 0, tracker.width, tracker.height);
        const t = tracker.step(img);
        const newA = t.a * cA - t.b * cB;
        const newB = t.b * cA + t.a * cB;
        const newTX = t.a * cTX - t.b * cTY + t.tx;
        const newTY = t.b * cTX + t.a * cTY + t.ty;
        cA = newA; cB = newB; cTX = newTX; cTY = newTY;
        cumAArr.push(cA);
        cumBArr.push(cB);
        cumTXArr.push(cTX);
        cumTYArr.push(cTY);
        timesArr.push(sample.timestamp);
        if (duration > 0) onProgress(Math.min(1, sample.timestamp / duration));
      } finally {
        sample.close();
      }
    }
    throwIfAborted(signal);
    if (cumAArr.length === 0) throw new Error("Decoder produced no frames");

    onProgress(1);
    return {
      cumA: Float32Array.from(cumAArr),
      cumB: Float32Array.from(cumBArr),
      cumTX: Float32Array.from(cumTXArr),
      cumTY: Float32Array.from(cumTYArr),
      times: Float64Array.from(timesArr),
      frameCount: cumAArr.length,
      frameRate: duration > 0 ? cumAArr.length / duration : 30,
    };
  } finally {
    tracker?.dispose();
    input.dispose();
  }
}

export type CodecExportOptions = {
  // Target video bitrate in bits per second.
  bitrate: number;
  signal?: AbortSignal;
  onProgress: (p: number) => void;
};

export type CodecExportResult = {
  blob: Blob;
  // False when the source has audio but neither packet passthrough nor
  // AAC re-encode was possible — the export is then video-only.
  audioIncluded: boolean;
};

export async function exportWithCodec(
  file: File,
  canvas: HTMLCanvasElement,
  drawFrame: (frame: VideoSample, timestampSec: number) => void,
  opts: CodecExportOptions,
): Promise<CodecExportResult> {
  const { bitrate, signal, onProgress } = opts;
  throwIfAborted(signal);
  if (!(await canEncodeVideo("avc"))) {
    throw new Error("This browser can't encode H.264 via WebCodecs");
  }

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track in file");
    if (!(await videoTrack.canDecode())) {
      throw new Error("Video codec not decodable by this browser");
    }
    const duration = await input.computeDuration();

    const videoSource = new VideoSampleSource({ codec: "avc", bitrate });
    output.addVideoTrack(videoSource);

    // Audio plan: prefer copying the source packets verbatim (zero
    // generation loss, no decode cost); fall back to AAC re-encode for
    // codecs mp4 can't carry; otherwise ship video-only.
    const audioTrack = await input.getPrimaryAudioTrack();
    let audioMode: "passthrough" | "reencode" | null = null;
    let packetSource: EncodedAudioPacketSource | null = null;
    let audioSampleSource: AudioSampleSource | null = null;
    if (audioTrack) {
      const codec = await audioTrack.getCodec();
      const decoderConfig = await audioTrack.getDecoderConfig();
      if (codec && decoderConfig && output.format.getSupportedCodecs().includes(codec)) {
        packetSource = new EncodedAudioPacketSource(codec);
        output.addAudioTrack(packetSource);
        audioMode = "passthrough";
      } else if ((await audioTrack.canDecode()) && (await canEncodeAudio("aac"))) {
        audioSampleSource = new AudioSampleSource({ codec: "aac", bitrate: 192_000 });
        output.addAudioTrack(audioSampleSource);
        audioMode = "reencode";
      }
    }

    await output.start();

    // Audio first: packets are tiny next to 4K video frames, and the
    // muxer interleaves by timestamp at finalize anyway.
    if (audioMode === "passthrough" && packetSource && audioTrack) {
      const decoderConfig = await audioTrack.getDecoderConfig();
      const packetSink = new EncodedPacketSink(audioTrack);
      let first = true;
      for await (const packet of packetSink.packets()) {
        throwIfAborted(signal);
        await packetSource.add(
          packet,
          first && decoderConfig ? { decoderConfig } : undefined,
        );
        first = false;
      }
      packetSource.close();
    } else if (audioMode === "reencode" && audioSampleSource && audioTrack) {
      await writeReencodedAudio(audioTrack, audioSampleSource, signal);
    }

    const sampleSink = new VideoSampleSink(videoTrack);
    for await (const sample of sampleSink.samples()) {
      try {
        throwIfAborted(signal);
        drawFrame(sample, sample.timestamp);
        const rendered = new VideoSample(canvas, {
          timestamp: sample.timestamp,
          duration: sample.duration,
        });
        // close() in finally so a rejecting add() (encoder error) can't
        // leak this frame's backing buffer. Awaiting add() is the encoder
        // backpressure mechanism — without it the decode loop outruns the
        // encoder and buffers raw 4K frames until the tab dies.
        try {
          await videoSource.add(rendered);
        } finally {
          rendered.close();
        }
        if (duration > 0) onProgress(Math.min(1, sample.timestamp / duration));
      } finally {
        sample.close();
      }
    }
    videoSource.close();

    throwIfAborted(signal);
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Muxer produced no output");
    onProgress(1);
    return {
      blob: new Blob([buffer], { type: "video/mp4" }),
      audioIncluded: !audioTrack || audioMode !== null,
    };
  } catch (e) {
    if (output.state === "started") {
      await output.cancel().catch(() => undefined);
    }
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
