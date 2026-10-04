// Real-time export: play the clip through, record the graded canvas with the
// browser's own MediaRecorder, then remux the recording with the original
// audio packets (lossless) into an MP4.
//
// Why this exists next to the offline WebCodecs exporter: on Safari every
// canvas → VideoFrame copy costs 60–80 ms (WebGPU and WebGL2 alike), which
// pins the offline path to ~10 fps. MediaRecorder reads the canvas natively
// and encodes with the hardware H.264 encoder, so the export takes exactly
// the clip's length. The trade-off is MediaRecorder's own frame timing
// (duplicated / dropped frames when the renderer can't keep up).

import {
  ALL_FORMATS,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  type StreamTargetChunk,
} from "mediabunny";
import { openOutputSink, type OutputSink } from "./output-sink";

type CanvasWithCapture = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

/** Average frame rate of the file's primary video track (falls back to 30). */
export async function probeFrameRate(file: File): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    const stats = track ? await track.computePacketStats(200).catch(() => null) : null;
    const r = stats?.averagePacketRate;
    return r && Number.isFinite(r) && r > 1 ? r : 30;
  } catch {
    return 30;
  } finally {
    input.dispose();
  }
}

/** True when the browser can record a canvas (MediaRecorder + captureStream). */
export function isRealtimeExportSupported(canvas: HTMLCanvasElement): boolean {
  return typeof MediaRecorder !== "undefined" && typeof (canvas as CanvasWithCapture).captureStream === "function";
}

/** WebKit (Safari, every iOS browser): the only engine where the offline path is capture-bound. */
export function isWebKit(): boolean {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|CriOS|Chromium|Edg|Android/.test(ua);
}

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.640028",
  "video/mp4;codecs=avc1.4d0028",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=h264",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickRealtimeMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // ignore
    }
  }
  return null;
}

export type RealtimeExportOptions = {
  /** Target video bitrate in bits per second. */
  bitrate: number;
  /** Storage prefix for the temporary output file. */
  opfsPrefix: string;
  /** Capture rate for the canvas stream (the renderer should keep up with it). */
  fps?: number;
  signal?: AbortSignal;
  onProgress: (p: number) => void;
  log?: (line: string) => void;
  /**
   * Called when playback starts: start rendering the video element into the
   * canvas on every frame, calling `onFrame(video.currentTime)` after each
   * render. Returns a stop function (called when playback ends or the export
   * is aborted).
   */
  startRendering: (onFrame: (timeSec: number) => void) => () => void;
};

export type RealtimeExportResult = {
  blob: Blob;
  audioIncluded: boolean;
  codec: string;
  recordedMs: number;
  remuxMs: number;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

/**
 * Plays `video` (already loaded with `file`) from the start while recording
 * `canvas`, then remuxes the recording with the file's original audio.
 */
export async function exportRealtime(
  file: File,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  opts: RealtimeExportOptions,
): Promise<RealtimeExportResult> {
  const { bitrate, signal, onProgress, log = () => undefined } = opts;
  throwIfAborted(signal);
  const mime = pickRealtimeMime();
  if (!mime) throw new Error("This browser can't record a canvas (MediaRecorder)");
  const fps = opts.fps ?? 30;
  const stream = (canvas as CanvasWithCapture).captureStream!(fps);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  log(`realtime capture → ${mime}, ${Math.round(bitrate / 1e6)} Mbps, ${fps} fps`);

  // Playback setup: silent (audio comes from the file), from the start.
  const wasMuted = video.muted;
  const wasRate = video.playbackRate;
  video.muted = true;
  video.playbackRate = 1;
  video.loop = false;
  const t0 = performance.now();
  let stopRender: (() => void) | null = null;
  // The recording's timeline starts at the first captured frame, which is
  // some way into the clip (decoder spin-up); the audio is shifted to match.
  let firstFrameSec: number | null = null;
  const onFrame = (t: number) => { if (firstFrameSec === null) firstFrameSec = t; };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (ev) => reject((ev as unknown as { error?: Error }).error ?? new Error("MediaRecorder failed"));
  });
  const finish = () => {
    stopRender?.();
    stopRender = null;
    if (recorder.state !== "inactive") recorder.stop();
  };
  const onAbort = () => {
    video.pause();
    finish();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const onTime = () => {
    if (video.duration > 0) onProgress(Math.min(0.98, video.currentTime / video.duration));
  };
  video.addEventListener("timeupdate", onTime);
  // Backgrounded (tab switch, phone lock): pause playback and the recorder
  // together so the output has no frozen stretch, resume both on return.
  const onVisibility = () => {
    if (recorder.state === "inactive") return;
    if (document.hidden) {
      video.pause();
      if (recorder.state === "recording") recorder.pause();
    } else {
      if (recorder.state === "paused") recorder.resume();
      void video.play().catch(() => undefined);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  const ended = new Promise<void>((resolve) => video.addEventListener("ended", () => resolve(), { once: true }));
  // An abort (user cancel, or the app restarting at a smaller size) must
  // interrupt the wait for "ended" — the paused video never ends.
  const aborted = new Promise<never>((_, reject) => {
    if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", () => reject(new Error("Video failed to seek")), { once: true });
      try { video.currentTime = 0; } catch (e) { reject(e as Error); }
      if (video.currentTime === 0 && video.readyState >= 1) { video.removeEventListener("seeked", onSeeked); resolve(); }
    });
    stopRender = opts.startRendering(onFrame);
    recorder.start(1000);
    await video.play();
    await Promise.race([ended, aborted]);
    throwIfAborted(signal);
    finish();
    await stopped;
  } catch (e) {
    finish();
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    video.removeEventListener("timeupdate", onTime);
    document.removeEventListener("visibilitychange", onVisibility);
    video.muted = wasMuted;
    video.playbackRate = wasRate;
    for (const t of stream.getTracks()) t.stop();
  }
  throwIfAborted(signal);
  const recordedMs = performance.now() - t0;
  const recorded = new Blob(chunks, { type: mime.split(";")[0] });
  if (recorded.size < 1024) throw new Error("The recorder produced no video (canvas capture unsupported here)");
  log(`recorded ${(recorded.size / 1048576).toFixed(1)} MB in ${(recordedMs / 1000).toFixed(1)} s`);

  // Remux: recorded video packets + original audio packets → MP4 (or WebM
  // when the recorded codec can't live in MP4).
  const r0 = performance.now();
  log(`first rendered frame at ${(firstFrameSec ?? 0).toFixed(3)} s`);
  const { blob, audioIncluded, codec } = await remux(recorded, file, firstFrameSec ?? 0, opts.opfsPrefix, signal, log);
  onProgress(1);
  return { blob, audioIncluded, codec, recordedMs, remuxMs: performance.now() - r0 };
}

async function remux(
  recorded: Blob,
  original: File,
  audioOffsetSec: number,
  opfsPrefix: string,
  signal: AbortSignal | undefined,
  log: (line: string) => void,
): Promise<{ blob: Blob; audioIncluded: boolean; codec: string }> {
  const recIn = new Input({ formats: ALL_FORMATS, source: new BlobSource(recorded) });
  const origIn = new Input({ formats: ALL_FORMATS, source: new BlobSource(original) });
  let sink: OutputSink | null = null;
  let output: Output | null = null;
  try {
    const vTrack = await recIn.getPrimaryVideoTrack();
    if (!vTrack) throw new Error("Recording has no video track");
    const vCodec = await vTrack.getCodec();
    if (!vCodec) throw new Error("Recording video codec unknown");
    const mp4 = new Mp4OutputFormat({ fastStart: false });
    const useMp4 = mp4.getSupportedVideoCodecs().includes(vCodec);
    const format = useMp4 ? mp4 : new WebMOutputFormat();
    sink = await openOutputSink(opfsPrefix);
    const writable = new WritableStream<StreamTargetChunk>({ write: (chunk) => sink!.write(chunk.data, chunk.position) });
    output = new Output({ format, target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }) });
    const vSource = new EncodedVideoPacketSource(vCodec);
    const vStats = await vTrack.computePacketStats(100).catch(() => null);
    output.addVideoTrack(vSource, { frameRate: vStats?.averagePacketRate ?? 30, rotation: await vTrack.getRotation() });

    const aTrack = await origIn.getPrimaryAudioTrack();
    let aSource: EncodedAudioPacketSource | null = null;
    let aCodecName = "";
    if (aTrack) {
      const aCodec = await aTrack.getCodec();
      const decoderConfig = await aTrack.getDecoderConfig();
      if (aCodec && decoderConfig && format.getSupportedAudioCodecs().includes(aCodec)) {
        aSource = new EncodedAudioPacketSource(aCodec);
        output.addAudioTrack(aSource);
        aCodecName = aCodec;
      }
      log(`audio ${aCodec ?? "?"} → ${aSource ? "passthrough" : "dropped"}`);
    }
    await output.start();

    const vDecoderConfig = await vTrack.getDecoderConfig();
    const vSink = new EncodedPacketSink(vTrack);
    const vt0 = await vTrack.getFirstTimestamp();
    let first = true;
    for await (const packet of vSink.packets()) {
      throwIfAborted(signal);
      const vts = packet.timestamp - vt0;
      const shifted = vts === packet.timestamp && vts >= 0 ? packet : new EncodedPacket(packet.data, packet.type, Math.max(0, vts), packet.duration, packet.sequenceNumber);
      await vSource.add(shifted, first && vDecoderConfig ? { decoderConfig: vDecoderConfig } : undefined);
      first = false;
    }
    vSource.close();

    if (aSource && aTrack) {
      const decoderConfig = await aTrack.getDecoderConfig();
      const aSink = new EncodedPacketSink(aTrack);
      const vOrig = await origIn.getPrimaryVideoTrack();
      const at0 = (vOrig ? await vOrig.getFirstTimestamp() : 0) + audioOffsetSec;
      let firstA = true;
      for await (const packet of aSink.packets()) {
        throwIfAborted(signal);
        const ts = packet.timestamp - at0;
        if (ts + packet.duration <= 0) continue;
        const shifted = ts === packet.timestamp && ts >= 0 ? packet : new EncodedPacket(packet.data, packet.type, Math.max(0, ts), packet.duration, packet.sequenceNumber);
        await aSource.add(shifted, firstA && decoderConfig ? { decoderConfig } : undefined);
        firstA = false;
      }
      aSource.close();
    }
    await output.finalize();
    const blob = await sink.finish(useMp4 ? "video/mp4" : "video/webm");
    log(`remuxed ${vCodec}${aCodecName ? " + " + aCodecName : ""} → ${useMp4 ? "mp4" : "webm"}`);
    return { blob, audioIncluded: !aTrack || aSource !== null, codec: vCodec };
  } catch (e) {
    if (output && output.state === "started") await output.cancel().catch(() => undefined);
    await sink?.discard().catch(() => undefined);
    throw e;
  } finally {
    recIn.dispose();
    origIn.dispose();
  }
}
