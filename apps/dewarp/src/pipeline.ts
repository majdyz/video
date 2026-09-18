import { createFile, DataStream, Endianness, type ISOFile, type Movie, type Sample } from "mp4box";
import { Muxer, StreamTarget } from "mp4-muxer";
import type { WarpUniforms } from "./fisheye";
import type { Warper } from "./gpu";

export type ExportProgress = { frames: number; totalFrames: number; elapsedMs: number };

export type ExportOptions = {
  file: File;
  warper: Warper;
  uniforms: WarpUniforms;
  /** Skip the GPU and re-encode the decoded frames as they are. */
  passthrough?: boolean;
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
const MAX_PENDING_FRAMES = 4;

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
  // Skip the 8 byte box header, the decoder wants the payload only, and only the written bytes.
  return new Uint8Array(stream.buffer.slice(8, stream.byteLength));
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

type BoxRange = { type: string; start: number; size: number; headerLen: number };

/** Top-level box table, read from the headers only. Cameras put moov after a multi-gigabyte mdat. */
async function indexTopLevelBoxes(file: File): Promise<BoxRange[]> {
  const boxes: BoxRange[] = [];
  let offset = 0;
  while (offset + 8 <= file.size) {
    const head = new DataView(await file.slice(offset, Math.min(offset + 16, file.size)).arrayBuffer());
    let size = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    let headerLen = 8;
    if (size === 1 && head.byteLength >= 16) {
      size = Number(head.getBigUint64(8));
      headerLen = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }
    if (size < headerLen) throw new Error(`Corrupt box "${type}" at ${offset}.`);
    boxes.push({ type, start: offset, size, headerLen });
    offset += size;
  }
  if (!boxes.some(b => b.type === "moov")) throw new Error(`No moov box found, is this an MP4? Boxes: ${describeBoxes(boxes)}`);
  return boxes;
}

function describeBoxes(boxes: BoxRange[]): string {
  return boxes.map(b => `${b.type}@${b.start}+${b.size}${b.headerLen === 16 ? "L" : ""}`).join(" ");
}

/**
 * mp4box parses boxes in file order and skips an mdat once it has seen its header, so the
 * headers go in with the other boxes first (which lets a trailing moov parse without the media),
 * and the mdat bodies follow in file order only when the media is wanted. The header slice is
 * exactly the box header: a sample that straddles two appended buffers is never served.
 */
function feedOrder(boxes: BoxRange[], withMedia: boolean): BoxRange[] {
  const skeleton = boxes.map(b => (b.type === "mdat" ? { ...b, size: b.headerLen } : b));
  if (!withMedia) return skeleton;
  const bodies = boxes
    .filter(b => b.type === "mdat" && b.size > b.headerLen)
    .map(b => ({ ...b, start: b.start + b.headerLen, size: b.size - b.headerLen }));
  return [...skeleton, ...bodies];
}

/** Reads the box table and the moov box and reports what the clip is. */
export async function probe(file: File, log: (line: string) => void = () => {}): Promise<ProbeResult> {
  const boxes = await indexTopLevelBoxes(file);
  log(`boxes: ${describeBoxes(boxes)}`);
  const mp4 = createFile();
  let ready = false;
  const info = await new Promise<Movie>((resolve, reject) => {
    mp4.onError = (module: string, message: string) => reject(new Error(`${module}: ${message}`));
    mp4.onReady = (m: Movie) => { ready = true; resolve(m); };
    void feed(file, feedOrder(boxes, false), mp4, () => true, () => Promise.resolve(), () => ready)
      .then(() => { if (!ready) reject(new Error(`The moov box could not be parsed. Boxes: ${describeBoxes(boxes)}`)); })
      .catch(reject);
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
 * Streams the given byte ranges into mp4box in slices, pausing while `hasRoom` is false so the
 * decoder and encoder queues stay short. `stop` ends the read early (probe, cancel).
 */
async function feed(
  file: File,
  ranges: BoxRange[],
  mp4: ISOFile,
  hasRoom: () => boolean,
  waitForRoom: () => Promise<void>,
  stop: () => boolean
): Promise<void> {
  for (const range of ranges) {
    let offset = range.start;
    const end = range.start + range.size;
    while (offset < end && !stop()) {
      while (!hasRoom() && !stop()) await waitForRoom();
      if (stop()) return;
      const buf = (await file.slice(offset, Math.min(offset + READ_CHUNK, end)).arrayBuffer()) as ArrayBuffer & { fileStart: number };
      buf.fileStart = offset;
      offset += buf.byteLength;
      mp4.appendBuffer(buf);
    }
    if (stop()) return;
  }
  mp4.flush();
}

/** First config the browser accepts. Chrome answers false to prefer-hardware when it has no hardware codec, so a plain config follows each. */
async function firstSupported<C>(configs: C[], check: (c: C) => Promise<{ supported?: boolean }>): Promise<C | undefined> {
  for (const c of configs) {
    if ((await check(c)).supported) return c;
  }
  return undefined;
}

async function pickEncoderConfig(width: number, height: number, fps: number): Promise<{ config: VideoEncoderConfig; muxCodec: "hevc" | "avc" }> {
  // About 0.09 bits per pixel per frame, so 4K60 lands near 45 Mbps and 1080p30 near 6 Mbps.
  const bitrate = Math.min(60_000_000, Math.max(6_000_000, Math.round(width * height * fps * 0.09)));
  const candidates: { codec: string; muxCodec: "hevc" | "avc" }[] = [
    { codec: "hvc1.1.6.L153.B0", muxCodec: "hevc" },
    { codec: "avc1.640034", muxCodec: "avc" },
  ];
  for (const c of candidates) {
    const config = await firstSupported<VideoEncoderConfig>(
      ["prefer-hardware", "no-preference"].map(hardwareAcceleration => ({
        codec: c.codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: hardwareAcceleration as HardwareAcceleration,
        latencyMode: "quality",
      })),
      cfg => VideoEncoder.isConfigSupported(cfg)
    );
    if (config) return { config, muxCodec: c.muxCodec };
  }
  throw new Error("This browser cannot encode HEVC or H.264 at this size.");
}

const PREVIEW_MAX_SAMPLES = 240;

/**
 * Decodes the frame at (or just before) `seconds` without touching the rest of the file: the
 * sample table says which sync sample to start from, and only that stretch of mdat is read.
 * Replaces the <video> element for previews, which iOS never fills without playback.
 */
export async function decodeFrameAt(file: File, seconds: number, log: (line: string) => void = () => {}): Promise<VideoFrame> {
  const boxes = await indexTopLevelBoxes(file);
  const mp4 = createFile();
  const wantedUs = Math.max(0, seconds) * 1e6;
  let best: VideoFrame | undefined;
  let decoder: VideoDecoder | undefined;
  let failure: Error | undefined;
  let samplesSeen = 0;
  let reachedTarget = false;
  let startOffset = 0;
  let ready = false;

  const fail = (e: unknown) => { failure ??= e instanceof Error ? e : new Error(String(e)); };
  const take = (frame: VideoFrame) => {
    if (frame.timestamp <= wantedUs + 1 || !best) {
      best?.close();
      best = frame;
    } else {
      frame.close();
    }
  };

  const readyPromise = new Promise<void>((resolve, reject) => {
    mp4.onError = (module: string, message: string) => reject(new Error(`${module}: ${message}`));
    mp4.onReady = async (info: Movie) => {
      try {
        const vt = videoTrack(info);
        const description = codecDescription(sampleEntry(mp4, vt.id));
        const config = await firstSupported<VideoDecoderConfig>(
          ["prefer-hardware", "no-preference"].map(hardwareAcceleration => ({
            codec: vt.codec,
            codedWidth: vt.track_width,
            codedHeight: vt.track_height,
            ...(description ? { description } : {}),
            hardwareAcceleration: hardwareAcceleration as HardwareAcceleration,
          })),
          c => VideoDecoder.isConfigSupported(c)
        );
        if (!config) throw new Error(`This browser cannot decode ${vt.codec}.`);
        decoder = new VideoDecoder({ output: take, error: fail });
        decoder.configure(config);
        mp4.setExtractionOptions(vt.id, "video", { nbSamples: 1 });
        const seek = mp4.seek(Math.max(0, seconds), true);
        startOffset = seek.offset;
        mp4.start();
        ready = true;
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
  });
  mp4.onSamples = (_id: number, _user: unknown, samples: Array<Sample>) => {
    for (const s of samples) {
      if (!s.data || reachedTarget || failure) continue;
      const timestamp = Math.round((s.cts * 1e6) / s.timescale);
      try {
        decoder!.decode(new EncodedVideoChunk({ type: s.is_sync ? "key" : "delta", timestamp, duration: Math.round((s.duration * 1e6) / s.timescale), data: s.data }));
      } catch (e) {
        fail(e);
      }
      samplesSeen += 1;
      if (timestamp >= wantedUs || samplesSeen >= PREVIEW_MAX_SAMPLES) reachedTarget = true;
    }
  };

  try {
    await feed(file, feedOrder(boxes, false), mp4, () => true, () => Promise.resolve(), () => ready);
    await readyPromise;
    // Read the media from the seek point onward, in file order, until the target sample went in.
    const bodies = feedOrder(boxes, true).filter(b => b.type === "mdat");
    const fromSeek = bodies
      .filter(b => b.start + b.size > startOffset)
      .map(b => (b.start < startOffset ? { ...b, start: startOffset, size: b.start + b.size - startOffset } : b));
    await feed(file, fromSeek, mp4, () => true, () => Promise.resolve(), () => reachedTarget || failure !== undefined);
    if (failure) throw failure;
    if (!decoder) throw new Error("The clip ended before its codec was set up.");
    await decoder.flush();
    if (failure) throw failure;
    if (!best) throw new Error(`No frame decoded near ${seconds.toFixed(1)} s (${samplesSeen} samples read).`);
    log(`preview frame at ${(best.timestamp / 1e6).toFixed(2)} s from ${samplesSeen} samples`);
    return best;
  } catch (e) {
    best?.close();
    throw e;
  } finally {
    if (decoder && decoder.state !== "closed") decoder.close();
  }
}

/** Full export: demux, decode, warp on the GPU, encode, mux. Resolves with the finished MP4. */
export async function exportClip(opts: ExportOptions): Promise<Blob> {
  const { file, warper, uniforms, passthrough = false, onProgress, signal } = opts;
  const started = performance.now();
  const parts: { position: number; data: Uint8Array<ArrayBuffer> }[] = [];
  const boxes = await indexTopLevelBoxes(file);
  const mp4 = createFile();

  let decoder: VideoDecoder | undefined;
  let encoder: VideoEncoder | undefined;
  let muxer: Muxer<StreamTarget> | undefined;
  let totalFrames = 0;
  let encodedFrames = 0;
  let decodedFrames = 0;
  let pendingAudioConfig: { codec: string; description?: Uint8Array; numberOfChannels: number; sampleRate: number } | undefined;
  let failure: Error | undefined;
  let roomWaiters: (() => void)[] = [];
  // The reader pauses while the codecs are being configured, so no sample arrives before its decoder exists.
  let configuring = false;

  const fail = (e: unknown) => {
    failure ??= e instanceof Error ? e : new Error(String(e));
    wakeRoom();
  };
  const wakeRoom = () => {
    const w = roomWaiters;
    roomWaiters = [];
    for (const r of w) r();
  };
  // Decoded frames wait here and are warped one at a time, in order, since a readback is async.
  const pending: VideoFrame[] = [];
  let pumping = false;
  let drainWaiters: (() => void)[] = [];
  const hasRoom = () =>
    !configuring &&
    pending.length < MAX_PENDING_FRAMES &&
    (decoder?.decodeQueueSize ?? 0) < MAX_DECODE_QUEUE &&
    (encoder?.encodeQueueSize ?? 0) < MAX_ENCODE_QUEUE;
  const waitForRoom = () => new Promise<void>(resolve => { roomWaiters.push(resolve); });
  const stop = () => failure !== undefined || signal.aborted;
  signal.addEventListener("abort", wakeRoom);

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (pending.length > 0) {
        const frame = pending.shift()!;
        if (stop()) { frame.close(); continue; }
        try {
          if (passthrough) {
            encoder!.encode(frame, { keyFrame: decodedFrames % 120 === 0 });
            frame.close();
          } else {
            const warped = await warper.renderToFrame(frame, uniforms, frame.timestamp, frame.duration ?? undefined);
            frame.close();
            encoder!.encode(warped, { keyFrame: decodedFrames % 120 === 0 });
            warped.close();
          }
          decodedFrames += 1;
        } catch (e) {
          frame.close();
          fail(e);
        }
        wakeRoom();
      }
    } finally {
      pumping = false;
      const w = drainWaiters;
      drainWaiters = [];
      for (const r of w) r();
    }
  };
  const drained = () => (pumping || pending.length > 0 ? new Promise<void>(resolve => { drainWaiters.push(resolve); }) : Promise.resolve());

  mp4.onError = (module: string, message: string) => fail(new Error(`${module}: ${message}`));

  mp4.onReady = async (info: Movie) => {
      configuring = true;
      try {
        const vt = videoTrack(info);
        totalFrames = vt.nb_samples;
        const fps = vt.nb_samples / (vt.duration / vt.timescale);
        const entry = sampleEntry(mp4, vt.id);

        const description = codecDescription(entry);
        const decoderConfig = await firstSupported<VideoDecoderConfig>(
          ["prefer-hardware", "no-preference"].map(hardwareAcceleration => ({
            codec: vt.codec,
            codedWidth: vt.track_width,
            codedHeight: vt.track_height,
            ...(description ? { description } : {}),
            hardwareAcceleration: hardwareAcceleration as HardwareAcceleration,
          })),
          c => VideoDecoder.isConfigSupported(c)
        );
        if (!decoderConfig) throw new Error(`This browser cannot decode ${vt.codec}.`);

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
            // No frameRate: mp4-muxer would use it as the track timescale, and 59.94 has no whole number. Its default 57600 rounds each frame from the absolute timestamp, so nothing drifts.
            rotation: rotationFromMatrix((vt as unknown as { matrix?: ArrayLike<number> }).matrix),
          },
          audio: audio ? { codec: "aac", numberOfChannels: audio.channel_count, sampleRate: audio.sample_rate } : undefined,
          fastStart: false,
          firstTimestampBehavior: "offset",
        });

        warper.prepareOutput(vt.track_width, vt.track_height);

        encoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer!.addVideoChunk(chunk, meta);
            encodedFrames += 1;
            onProgress({ frames: encodedFrames, totalFrames, elapsedMs: performance.now() - started });
          },
          error: fail,
        });
        encoder.configure(encoderConfig);
        encoder.addEventListener("dequeue", wakeRoom);

        decoder = new VideoDecoder({
          output: frame => {
            if (stop()) { frame.close(); return; }
            pending.push(frame);
            void pump();
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
      } finally {
        configuring = false;
        wakeRoom();
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
      }
  };

  try {
    await feed(file, feedOrder(boxes, true), mp4, hasRoom, waitForRoom, stop);
    if (stop()) throw failure ?? new DOMException("Export cancelled", "AbortError");
    if (!decoder || !encoder || !muxer) throw new Error("The clip ended before its codecs were set up.");
    await decoder.flush();
    await drained();
    await encoder.flush();
    if (failure) throw failure;
    if (encodedFrames === 0) throw new Error(`No frames came out of the encoder (decoded ${decodedFrames} of ${totalFrames}, encoder ${encoder.state}).`);
    muxer.finalize();
  } finally {
    signal.removeEventListener("abort", wakeRoom);
    if (decoder?.state !== "closed") decoder?.close();
    if (encoder?.state !== "closed") encoder?.close();
  }

  parts.sort((a, b) => a.position - b.position);
  return new Blob(parts.map(p => p.data), { type: "video/mp4" });
}
