// Browser side of the picture check: decode short windows of the clip
// (WebCodecs via mediabunny), track them at 480 px and hand the point pairs
// to checkMedium(). A few hundred milliseconds of video, not the whole clip
// (motion logs get more and longer windows: their clock is synced from them).

import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { FrameReader } from "../frame-gray.ts";
import { analysisSize } from "../tracker.ts";
import { checkAndCalibrate, checkWindowsFor, PairCollector } from "./medium.ts";
import type { CameraMotion, MediumCheck } from "./telemetry.ts";

export async function checkPicture(file: File, motion: CameraMotion, signal?: AbortSignal): Promise<MediumCheck | null> {
  if (typeof VideoDecoder === "undefined") return null;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    // The lens lives in coded orientation; decoded frames are drawn upright, so a
    // rotated clip is tracked upright and its pairs carried back to the coded frame.
    const rot = motion.video.rotation;
    const swap = rot === 90 || rot === 270;
    const cw = motion.lens.width, ch = motion.lens.height;
    const { width: aw0, height: ah0 } = analysisSize(cw, ch, 480);
    const aw = swap ? ah0 : aw0, ah = swap ? aw0 : ah0;
    // A few hundred frames at most: read on this thread (one reader for all windows).
    const reader = new FrameReader(aw, ah);
    const gray = new Float32Array(aw * ah);
    const collector = new PairCollector(aw, ah, cw / aw0, rot, cw, ch);
    const sink = new VideoSampleSink(track);
    const first = await track.getFirstTimestamp();
    for (const [w0, w1] of checkWindowsFor(motion)) {
      collector.reset();
      for await (const sample of sink.samples(first + w0, first + w1)) {
        try {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          await reader.read(sample, gray);
          collector.push(sample.timestamp, gray);
        } finally {
          sample.close();
        }
      }
    }
    // Raw-gyro GoPros, CAMM and motion logs also get their timing and focal fitted to the picture (mutates motion).
    return checkAndCalibrate(motion, collector.pairs);
  } finally {
    input.dispose();
  }
}
