import { createFile, DataStream, Endianness, type ISOFile, type Movie, type Sample } from "mp4box";
import { Muxer, StreamTarget } from "mp4-muxer";
import type { WarpUniforms } from "./fisheye";
import type { Warper } from "./gpu";

export type ExportProgress = { frames: number; totalFrames: number; elapsedMs: number };

export type ExportOptions = {
  file: File;
  warper: Warper;
  uniforms: WarpUniforms;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
};

export type ProbeResult = {
  width: number;
  height: number;
  codec: string;
  fps: number;
  durationS: number;
  frames: number;
  tenBit: boolean;
  hasAudio: boolean;
  rotation: 0 | 90 | 180 | 270;
};

type Box = { write(stream: DataStream): void };
type SampleEntry = Record<string, unknown> & { avcC?: Box; hvcC?: Box; esds?: { esd?: { descs?: { descs?: { data?: Uint8Array }[] }[] } } };

const READ_CHUNK = 2 * 1024 * 1024;
const MAX_DECODE_QUEUE = 12;
const MAX_ENCODE_QUEUE = 8;

function videoTrack(info: Movie) {
  const t = info.videoTracks[0];
  if (!t) throw new Error("No video track in this file.");
  return t;
}

function sampleEntry(mp4: ISOFile, trackId: number): SampleEntry {
  const trak = mp4.getTrackById(trackId) as unknown as { mdia: { minf: { stbl: { stsd: { entries: SampleEntry[] } } } } };
  return trak.mdia.minf.stbl.stsd.entries[0];
}

function codecDescription(entry: SampleEntry): Uint8Array<ArrayBuffer> | undefined {
  const box = entry.avcC ?? entry.hvcC;
  if (!box) return undefined;
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  box.write(stream);
  // Skip the 8 byte box header, the decoder wants the payload only.
  return new Uint8Array(stream.buffer.slice(8));
}

function audioSpecificConfig(entry: SampleEntry): Uint8Array | undefined {
  return entry.esds?.esd?.descs?.[0]?.descs?.[0]?.data;
}

function rotationFromMatrix(matrix: ArrayLike<number> | undefined): 0 | 90 | 180 | 270 {
  if (!matrix || matrix.length < 9) return 0;
  // 16.16 fixed point a, b, c, d in the mp4 track matrix.
  const a = matrix[0] / 65536;
  const b = matrix[1] / 65536;
  if (a === 0 && b === 1) return 90;
  if (a === -1 && b === 0) return 180;
  if (a === 0 && b === -1) return 270;
  return 0;
}

/** Reads enough of the file for the moov box and reports what the clip is. */
export async function probe(file: File): Promise<ProbeResult> {
  const mp4 = createFile();
  const info = await new Promise<Movie>((resolve, reject) => {
    mp4.onError = (module: string, message: string) => reject(new Error(`${module}: ${message}`));
    mp4.onReady = resolve;
    void feed(file, mp4, () => true, () => Promise.resolve(), () => false).catch(reject);
  });
  const t = videoTrack(info);
  // HEVC Main 10 is "hvc1.2.4.…", H.264 High 10 is profile 0x6e.
  const tenBit = /^hvc1\.2\./.test(t.codec) || /^hev1\.2\./.test(t.codec) || /^avc1\.6e/i.test(t.codec);
  const durationS = t.duration / t.timescale;
  return {
    width: t.track_width,
    height: t.track_height,
    codec: t.codec,
    fps: t.nb_samples / durationS,
    durationS,
    frames: t.nb_samples,
    tenBit,
    hasAudio: info.audioTracks.length > 0,
    rotation: rotationFromMatrix((t as unknown as { matrix?: ArrayLike<number> }).matrix),
  };
}

/**
 * Streams the file into mp4box in slices, pausing while `hasRoom` is false so the
 * decoder and encoder queues stay short. `stop` ends the read early (probe, cancel).
 */
async function feed(
  file: File,
  mp4: ISOFile,
  hasRoom: () => boolean,
  waitForRoom: () => Promise<void>,
  stop: () => boolean
): Promise<void> {
  let offset = 0;
  while (offset < file.size && !stop()) {
    while (!hasRoom() && !stop()) await waitForRoom();
    if (stop()) break;
    const buf = (await file.slice(offset, offset + READ_CHUNK).arrayBuffer()) as ArrayBuffer & { fileStart: number };
    buf.fileStart = offset;
    offset += buf.byteLength;
    mp4.appendBuffer(buf);
  }
  if (!stop()) mp4.flush();
}

async function pickEncoderConfig(width: number, height: number, fps: number): Promise<{ config: VideoEncoderConfig; muxCodec: "hevc" | "avc" }> {
  // About 0.09 bits per pixel per frame, so 4K60 lands near 45 Mbps and 1080p30 near 6 Mbps.
  const bitrate = Math.min(60_000_000, Math.max(6_000_000, Math.round(width * height * fps * 0.09)));
  const candidates: { codec: string; muxCodec: "hevc" | "avc" }[] = [
    { codec: "hvc1.1.6.L153.B0", muxCodec: "hevc" },
    { codec: "avc1.640034", muxCodec: "avc" },
  ];
  for (const c of candidates) {
    const config: VideoEncoderConfig = {
      codec: c.codec,
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: "prefer-hardware",
      latencyMode: "quality",
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) return { config, muxCodec: c.muxCodec };
  }
  throw new Error("This browser cannot encode HEVC or H.264 at this size.");
}

/** Full export: demux, decode, warp on the GPU, encode, mux. Resolves with the finished MP4. */
export async function exportClip(opts: ExportOptions): Promise<Blob> {
  const { file, warper, uniforms, onProgress, signal } = opts;
  const started = performance.now();
  const parts: { position: number; data: Uint8Array<ArrayBuffer> }[] = [];
  const mp4 = createFile();

  let decoder: VideoDecoder | undefined;
  let encoder: VideoEncoder | undefined;
  let muxer: Muxer<StreamTarget> | undefined;
  let canvas: OffscreenCanvas | undefined;
  let ctx: GPUCanvasContext | undefined;
  let totalFrames = 0;
  let encodedFrames = 0;
  let decodedFrames = 0;
  let pendingAudioConfig: { codec: string; description?: Uint8Array; numberOfChannels: number; sampleRate: number } | undefined;
  let failure: Error | undefined;
  let roomWaiters: (() => void)[] = [];

  const fail = (e: unknown) => {
    failure ??= e instanceof Error ? e : new Error(String(e));
    wakeRoom();
  };
  const wakeRoom = () => {
    const w = roomWaiters;
    roomWaiters = [];
    for (const r of w) r();
  };
  const hasRoom = () =>
    (decoder?.decodeQueueSize ?? 0) < MAX_DECODE_QUEUE && (encoder?.encodeQueueSize ?? 0) < MAX_ENCODE_QUEUE;
  const waitForRoom = () => new Promise<void>(resolve => { roomWaiters.push(resolve); });
  const stop = () => failure !== undefined || signal.aborted;
  signal.addEventListener("abort", wakeRoom);

  const done = new Promise<void>((resolve, reject) => {
    mp4.onError = (module: string, message: string) => reject(new Error(`${module}: ${message}`));

    mp4.onReady = async (info: Movie) => {
      try {
        const vt = videoTrack(info);
        totalFrames = vt.nb_samples;
        const fps = vt.nb_samples / (vt.duration / vt.timescale);
        const entry = sampleEntry(mp4, vt.id);

        const description = codecDescription(entry);
        const decoderConfig: VideoDecoderConfig = {
          codec: vt.codec,
          codedWidth: vt.track_width,
          codedHeight: vt.track_height,
          ...(description ? { description } : {}),
          hardwareAcceleration: "prefer-hardware",
        };
        const decSupport = await VideoDecoder.isConfigSupported(decoderConfig);
        if (!decSupport.supported) throw new Error(`This browser cannot decode ${vt.codec}.`);

        const { config: encoderConfig, muxCodec } = await pickEncoderConfig(vt.track_width, vt.track_height, fps);

        const at = info.audioTracks[0];
        const audio = at?.audio && /mp4a/.test(at.codec) ? at.audio : undefined;
        if (at && audio) {
          const aEntry = sampleEntry(mp4, at.id);
          const asc = audioSpecificConfig(aEntry);
          pendingAudioConfig = {
            codec: at.codec,
            ...(asc ? { description: asc } : {}),
            numberOfChannels: audio.channel_count,
            sampleRate: audio.sample_rate,
          };
        }

        muxer = new Muxer({
          target: new StreamTarget({
            onData: (data, position) => { parts.push({ position, data: new Uint8Array(data) }); },
            chunked: true,
          }),
          video: {
            codec: muxCodec,
            width: vt.track_width,
            height: vt.track_height,
            frameRate: fps,
            rotation: rotationFromMatrix((vt as unknown as { matrix?: ArrayLike<number> }).matrix),
          },
          audio: audio ? { codec: "aac", numberOfChannels: audio.channel_count, sampleRate: audio.sample_rate } : undefined,
          fastStart: false,
          firstTimestampBehavior: "offset",
        });

        canvas = new OffscreenCanvas(vt.track_width, vt.track_height);
        ctx = warper.configureCanvas(canvas);

        encoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer!.addVideoChunk(chunk, meta);
            encodedFrames += 1;
            onProgress({ frames: encodedFrames, totalFrames, elapsedMs: performance.now() - started });
            if (encodedFrames === totalFrames) resolve();
          },
          error: fail,
        });
        encoder.configure(encoderConfig);
        encoder.addEventListener("dequeue", wakeRoom);

        decoder = new VideoDecoder({
          output: frame => {
            try {
              if (stop()) { frame.close(); return; }
              warper.render(ctx!, frame, uniforms);
              const warped = new VideoFrame(canvas!, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
              frame.close();
              encoder!.encode(warped, { keyFrame: decodedFrames % 120 === 0 });
              warped.close();
              decodedFrames += 1;
            } catch (e) {
              frame.close();
              fail(e);
            }
          },
          error: fail,
        });
        decoder.configure(decoderConfig);
        decoder.addEventListener("dequeue", wakeRoom);

        mp4.setExtractionOptions(vt.id, "video", { nbSamples: 30 });
        if (at && audio) mp4.setExtractionOptions(at.id, "audio", { nbSamples: 100 });
        mp4.start();
      } catch (e) {
        fail(e);
        reject(failure);
      }
    };

    mp4.onSamples = (_id: number, user: unknown, samples: Array<Sample>) => {
      if (stop()) return;
      try {
        for (const s of samples) {
          if (!s.data) continue;
          const timestamp = Math.round((s.cts * 1e6) / s.timescale);
          const duration = Math.round((s.duration * 1e6) / s.timescale);
          if (user === "video") {
            decoder!.decode(new EncodedVideoChunk({ type: s.is_sync ? "key" : "delta", timestamp, duration, data: s.data }));
          } else {
            const meta = pendingAudioConfig ? { decoderConfig: pendingAudioConfig } : undefined;
            pendingAudioConfig = undefined;
            muxer!.addAudioChunkRaw(s.data, s.is_sync ? "key" : "delta", timestamp, duration, meta);
          }
        }
      } catch (e) {
        fail(e);
        reject(failure);
      }
    };
  });

  try {
    await feed(file, mp4, hasRoom, waitForRoom, stop);
    if (stop()) throw failure ?? new DOMException("Export cancelled", "AbortError");
    await decoder!.flush();
    await encoder!.flush();
    if (encodedFrames < totalFrames) {
      // The encoder can drop the last frames under flush on some drivers, take what we have.
      totalFrames = encodedFrames;
    }
    if (failure) throw failure;
    muxer!.finalize();
  } finally {
    signal.removeEventListener("abort", wakeRoom);
    decoder?.close();
    encoder?.close();
  }

  await done.catch(() => undefined);
  parts.sort((a, b) => a.position - b.position);
  return new Blob(parts.map(p => p.data), { type: "video/mp4" });
}
