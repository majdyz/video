// Analysis pass: decode every frame with WebCodecs (via mediabunny), shrink
// it to the analysis size and feed the tracker. Runs inside the analysis
// worker; falls back to the main thread when a browser lacks WebCodecs in
// workers. Uses mediabunny directly rather than the shared index so the
// worker bundle does not drag React along.

import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { homographyFromSimilarity, rescaleH } from "./homography.ts";
import { HOMOGRAPHY_STATE, MODEL_CODE, type MotionAnalysis } from "./stabilize.ts";
import { MotionTracker, analysisSize } from "./tracker.ts";

export type AnalysisProgress = (fraction: number, frames: number) => void;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function analyzeVideoFile(file: File, onProgress: AnalysisProgress, signal?: AbortSignal): Promise<MotionAnalysis> {
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
    const duration = await input.computeDuration();
    const { width: aw, height: ah } = analysisSize(width, height);
    const canvas = new OffscreenCanvas(aw, ah);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";

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
    let lastProgress = 0;

    const sink = new VideoSampleSink(track);
    for await (const sample of sink.samples()) {
      // Every sample is closed inside the loop: the sink decodes a few
      // frames ahead and anything we hold is memory the decoder can't reuse.
      try {
        throwIfAborted(signal);
        // sample.draw applies the container rotation, so portrait phone clips
        // are tracked the way they are displayed.
        sample.draw(ctx, 0, 0, aw, ah);
        const img = ctx.getImageData(0, 0, aw, ah);
        const t0 = performance.now();
        const m = tracker.step(img.data);
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
        times.push(sample.timestamp);
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
          onProgress(Math.min(1, Math.max(0, sample.timestamp / duration)), times.length);
        }
      } finally {
        sample.close();
      }
    }
    throwIfAborted(signal);
    const n = times.length;
    if (n === 0) throw new Error("Decoder produced no frames");
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
