// Analysis pass: decode every frame with WebCodecs (via mediabunny), shrink
// it to the analysis size and feed the tracker. Runs inside the analysis
// worker; falls back to the main thread when a browser lacks WebCodecs in
// workers. Uses mediabunny directly rather than the shared index so the
// worker bundle does not drag React along.

// WebKit reports "unspecified" colour spaces mediabunny rejects; patch VideoFrame in this worker too.
import "@dive-tools/shared/videoframe-colorspace.ts";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { homographyFromSimilarity, rescaleH } from "./homography.ts";
import { HOMOGRAPHY_STATE, MODEL_CODE, type MotionAnalysis } from "./stabilize.ts";
import { grayFrames, type GrayFrameStats } from "./frame-gray.ts";
import { MotionTracker, analysisSize, prepOptions } from "./tracker.ts";

export type AnalysisProgress = (fraction: number, frames: number) => void;

/** A stretch of the clip to analyse, in clip seconds (0 = the first video frame); null = all of it. */
export type TimeSpan = { start: number; end: number };

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function analyzeVideoFile(file: File, onProgress: AnalysisProgress, signal?: AbortSignal, span?: TimeSpan | null): Promise<MotionAnalysis> {
  throwIfAborted(signal);
  if (typeof VideoDecoder === "undefined") throw new Error("WebCodecs (VideoDecoder) is not available here");
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    if (!(await input.canRead())) throw new Error("Container format not supported");
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track in file");
    if (!(await track.canDecode())) throw new Error("Video codec not decodable by this browser");
    // Display size: rotation and pixel aspect applied, matching the <video>
    // element and the render canvas.
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    if (!width || !height) throw new Error("Video has no usable size");
    // Trimmed: decode and track only the span (the path is solved on it alone).
    const first = span ? await track.getFirstTimestamp() : 0;
    const from = span ? first + span.start : 0;
    const duration = span ? Math.max(1e-3, span.end - span.start) : await input.computeDuration();
    // Analysis size: 640 px on the long edge, 480 px for high frame rates.
    // 60 fps clips have twice the frames; at 480 px the tracker costs about
    // half per frame with the same stabilisation quality on real clips
    // (jitter after: 0.87 → 0.86 px, 3.74 → 2.83 px; measured 7 Oct 2026).
    const stats = await track.computePacketStats(200).catch(() => null);
    const sourceFps = stats?.averagePacketRate ?? 30;
    const { width: aw, height: ah } = analysisSize(width, height, sourceFps >= 50 ? 480 : 640);
    const readStats: GrayFrameStats = { route: "undecided", planesMs: 0, canvasMs: 0, meanDiff: 0, frames: 0, readMs: 0, copyMs: 0, threaded: false };

    const tracker = new MotionTracker(aw, ah);
    const scale = width / aw; // analysis px -> source px
    const motion: number[] = [];
    const cumulative: number[] = [];
    const times: number[] = [];
    const inliers: number[] = [];
    const tracked: number[] = [];
    const rms: number[] = [];
    const model: number[] = [];
    const homography: number[] = [];
    const homographyState: number[] = [];
    let cA = 1;
    let cB = 0;
    let cTX = 0;
    let cTY = 0;
    let trackMs = 0;
    let readMs = 0;
    let lastProgress = 0;
    const tStart = performance.now();

    const sink = new VideoSampleSink(track);
    // Frames are read (decoded frame -> green at the analysis size, container
    // rotation applied so portrait phone clips are tracked the way they are
    // displayed) on a second thread while this one tracks.
    let tr = performance.now();
    for await (const { gray, timestamp, prepared } of grayFrames(span ? sink.samples(from, first + span.end) : sink.samples(), aw, ah, { stats: readStats, prep: prepOptions(tracker.opts) })) {
      throwIfAborted(signal);
      const t0 = performance.now();
      readMs += t0 - tr;
      const m = prepared ? tracker.stepPrepared(prepared) : tracker.stepGray(gray);
      trackMs += performance.now() - t0;
      const tx = m.tx * scale;
      const ty = m.ty * scale;
      motion.push(m.a, m.b, tx, ty);
      // C_t = M_t ∘ C_{t-1}
      const nA = m.a * cA - m.b * cB;
      const nB = m.b * cA + m.a * cB;
      const nTX = m.a * cTX - m.b * cTY + tx;
      const nTY = m.b * cTX + m.a * cTY + ty;
      cA = nA;
      cB = nB;
      cTX = nTX;
      cTY = nTY;
      cumulative.push(cA, cB, cTX, cTY);
      times.push(timestamp);
      inliers.push(m.inliers);
      tracked.push(m.tracked);
      rms.push(m.rms);
      model.push(MODEL_CODE[m.model]);
      // The homography is kept in source pixels like the translations;
      // a pair the similarity explains as well stores the similarity, so
      // chains can run straight through it.
      const h = m.homography ? rescaleH(m.homography, scale) : homographyFromSimilarity({ a: m.a, b: m.b, tx, ty });
      for (let i = 0; i < 9; i++) homography.push(h[i]);
      homographyState.push(HOMOGRAPHY_STATE[m.homographyState]);
      const now = performance.now();
      if (duration > 0 && now - lastProgress > 80) {
        lastProgress = now;
        onProgress(Math.min(1, Math.max(0, (timestamp - from) / duration)), times.length);
      }
      tr = performance.now();
    }
    throwIfAborted(signal);
    const n = times.length;
    if (n === 0) throw new Error("Decoder produced no frames");
    const st = readStats;
    console.info(`[motion] analysed ${n} frames in ${((performance.now() - tStart) / 1000).toFixed(1)} s at ${aw}x${ah}: tracking ${(trackMs / n).toFixed(1)} ms/frame, waiting for frames ${(readMs / n).toFixed(1)} ms/frame (reading ${(st.readMs / Math.max(1, st.frames)).toFixed(1)} ms/frame (copy ${(st.copyMs / Math.max(1, st.frames)).toFixed(1)}) via ${st.route}${st.threaded ? " on the frame worker" : ""}; calibration planes ${st.planesMs.toFixed(1)} vs canvas ${st.canvasMs.toFixed(1)} ms, diff ${st.meanDiff.toFixed(2)})`);
    onProgress(1, n);
    return {
      width,
      height,
      analysisWidth: aw,
      analysisHeight: ah,
      frameCount: n,
      frameRate: duration > 0 ? n / duration : 30,
      times: Float64Array.from(times),
      motion: Float64Array.from(motion),
      cumulative: Float64Array.from(cumulative),
      inliers: Uint16Array.from(inliers),
      tracked: Uint16Array.from(tracked),
      rms: Float32Array.from(rms),
      model: Uint8Array.from(model),
      homography: Float64Array.from(homography),
      homographyState: Uint8Array.from(homographyState),
      trackMsPerFrame: trackMs / n,
    };
  } finally {
    input.dispose();
  }
}
