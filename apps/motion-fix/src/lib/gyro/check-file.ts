// Browser side of the picture check: decode four short windows of the clip
// (WebCodecs via mediabunny), track them at 480 px and hand the point pairs
// to checkMedium(). A few hundred milliseconds of video, not the whole clip.

import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { FrameReader } from "../frame-gray.ts";
import { analysisSize } from "../tracker.ts";
import { checkAndCalibrate, checkWindows, PairCollector } from "./medium.ts";
import type { CameraMotion, MediumCheck } from "./telemetry.ts";

export async function checkPicture(file: File, motion: CameraMotion, signal?: AbortSignal): Promise<MediumCheck | null> {
  if (typeof VideoDecoder === "undefined") return null;
  // The lens lives in coded orientation; the decoded frames are drawn upright.
  if (motion.video.rotation !== 0) return null;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const { width: aw, height: ah } = analysisSize(motion.lens.width, motion.lens.height, 480);
    // A few hundred frames at most: read on this thread (one reader for all windows).
    const reader = new FrameReader(aw, ah);
    const gray = new Float32Array(aw * ah);
    const collector = new PairCollector(aw, ah, motion.lens.width / aw);
    const sink = new VideoSampleSink(track);
    const first = await track.getFirstTimestamp();
    for (const [w0, w1] of checkWindows(motion.video.duration)) {
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
    // Raw-gyro GoPros also get their time offset and focal fitted to the picture (mutates motion).
    return checkAndCalibrate(motion, collector.pairs);
  } finally {
    input.dispose();
  }
}
