// Browser side of the hybrid pass: decode the whole clip (WebCodecs via
// mediabunny), track it at 480 px and derotate every pair with the gyro
// (hybrid.ts). Runs after the gyro analysis, so the gyro result is on
// screen while this refines it.

import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { analysisSize, greenChannel } from "../tracker.ts";
import { WATER_INDEX } from "./gyro-stabilize.ts";
import { ResidualCollector, type ResidualMotion } from "./hybrid.ts";
import type { CameraMotion } from "./telemetry.ts";

/** Analysis long edge of the hybrid pass (the picture check uses the same). */
export const RESIDUAL_LONG_EDGE = 480;

export async function trackResidual(file: File, motion: CameraMotion, onProgress: (fraction: number, frames: number) => void, signal?: AbortSignal): Promise<ResidualMotion | null> {
  if (typeof VideoDecoder === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  // Lens and telemetry live in coded orientation; decoded frames are drawn upright.
  if (motion.video.rotation !== 0) return null;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const { width: aw, height: ah } = analysisSize(motion.lens.width, motion.lens.height, RESIDUAL_LONG_EDGE);
    const canvas = new OffscreenCanvas(aw, ah);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    const gray = new Float32Array(aw * ah);
    const collector = new ResidualCollector(motion, aw, ah, WATER_INDEX);
    const duration = motion.video.duration;
    let frames = 0;
    let last = 0;
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        sample.draw(ctx, 0, 0, aw, ah);
        greenChannel(ctx.getImageData(0, 0, aw, ah).data, gray);
        collector.push(sample.timestamp, gray);
        frames++;
        const now = performance.now();
        if (now - last > 100 && duration > 0) {
          last = now;
          onProgress(Math.min(1, Math.max(0, sample.timestamp / duration)), frames);
        }
      } finally {
        sample.close();
      }
    }
    if (frames < 8) return null;
    onProgress(1, frames);
    return collector.finish();
  } finally {
    input.dispose();
  }
}
