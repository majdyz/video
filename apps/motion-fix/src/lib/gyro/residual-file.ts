// Browser side of the hybrid pass: decode the whole clip (WebCodecs via
// mediabunny), track it at 480 px and derotate every pair with the gyro
// (hybrid.ts). Runs after the gyro analysis, so the gyro result is on
// screen while this refines it.

import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { grayFrames, type GrayFrameStats } from "../frame-gray.ts";
import { analysisSize } from "../tracker.ts";
import { WATER_INDEX } from "./gyro-stabilize.ts";
import { ResidualCollector, type ResidualMotion } from "./hybrid.ts";
import type { CameraMotion } from "./telemetry.ts";
import type { TimeSpan } from "../analyze.ts";

/** Analysis long edge of the hybrid pass (the picture check uses the same). */
export const RESIDUAL_LONG_EDGE = 480;

export async function trackResidual(file: File, motion: CameraMotion, onProgress: (fraction: number, frames: number) => void, signal?: AbortSignal, span?: TimeSpan | null): Promise<ResidualMotion | null> {
  if (typeof VideoDecoder === "undefined") return null;
  // Lens and telemetry live in coded orientation; decoded frames are drawn upright.
  if (motion.video.rotation !== 0) return null;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const { width: aw, height: ah } = analysisSize(motion.lens.width, motion.lens.height, RESIDUAL_LONG_EDGE);
    const collector = new ResidualCollector(motion, aw, ah, WATER_INDEX);
    // Trimmed: only the span is decoded; frames outside it keep the gyro-only result.
    const first = span ? await track.getFirstTimestamp() : 0;
    const from = span ? first + span.start : 0;
    const duration = span ? Math.max(1e-3, span.end - span.start) : motion.video.duration;
    let frames = 0;
    let last = 0;
    const t0 = performance.now();
    const st: GrayFrameStats = { route: "undecided", planesMs: 0, canvasMs: 0, meanDiff: 0, frames: 0, readMs: 0, copyMs: 0, threaded: false };
    // Frames are read on a second thread while this one tracks (frame-gray.ts).
    for await (const { gray, timestamp, prepared } of grayFrames(span ? new VideoSampleSink(track).samples(from, first + span.end) : new VideoSampleSink(track).samples(), aw, ah, { stats: st, prep: collector.prepOptions })) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      collector.push(timestamp, gray, prepared);
      frames++;
      const now = performance.now();
      if (now - last > 100 && duration > 0) {
        last = now;
        onProgress(Math.min(1, Math.max(0, (timestamp - from) / duration)), frames);
      }
    }
    if (frames < 8) return null;
    onProgress(1, frames);
    const result = collector.finish();
    console.info(`[motion] bobbing pass: ${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)} s at ${aw}x${ah}, tracking ${result.trackMsPerFrame.toFixed(1)} ms/frame, reading ${(st.readMs / Math.max(1, st.frames)).toFixed(1)} ms/frame (copy ${(st.copyMs / Math.max(1, st.frames)).toFixed(1)}) via ${st.route}${st.threaded ? " on the frame worker" : ""}`);
    return result;
  } finally {
    input.dispose();
  }
}
