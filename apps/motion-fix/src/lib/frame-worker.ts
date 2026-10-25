// Frame worker: turns decoded VideoFrames into the tracker's input (the gray
// frame and, when asked, its prepared pyramid: CLAHE, gradients, corner
// response) on its own thread, so this work for the next frames overlaps
// tracking in the analysis worker. Protocol in frame-gray.ts (FramePipe).

// WebKit reports "unspecified" colour spaces mediabunny rejects; patch VideoFrame in this worker too.
import "@dive-tools/shared/videoframe-colorspace.ts";
import { VideoSample } from "mediabunny";
import { FrameReader, preparedBuffers, type FramePipeRequest, type FramePipeResponse } from "./frame-gray.ts";
import { FramePrep, type PreparedFrame } from "./tracker.ts";

const scope = self as unknown as { postMessage: (msg: FramePipeResponse, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<FramePipeRequest>) => void) | null };

let reader: FrameReader | null = null;
let prep: FramePrep | null = null;
const spareGray: Float32Array[] = [];
const sparePrepared: PreparedFrame[] = [];
// Frames are read one at a time, in arrival order (replies must keep it).
let queue = Promise.resolve();

scope.onmessage = (e: MessageEvent<FramePipeRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    reader = new FrameReader(msg.width, msg.height);
    prep = msg.prep ? new FramePrep(msg.width, msg.height, msg.prep) : null;
    return;
  }
  if (msg.type === "recycle") {
    spareGray.push(msg.gray);
    if (msg.prepared) sparePrepared.push(msg.prepared);
    return;
  }
  queue = queue.then(async () => {
    const sample = new VideoSample(msg.frame, { rotation: msg.rotation as 0 | 90 | 180 | 270, timestamp: msg.timestamp });
    try {
      if (!reader) throw new Error("frame worker not initialised");
      const gray = spareGray.pop() ?? new Float32Array(reader.width * reader.height);
      await reader.read(sample, gray);
      const prepared = prep ? prep.prepare(gray, sparePrepared.pop() ?? prep.allocate()) : undefined;
      scope.postMessage({ type: "gray", id: msg.id, gray, prepared, stats: reader.stats }, [gray.buffer, ...(prepared ? preparedBuffers(prepared) : [])]);
    } catch (err) {
      scope.postMessage({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
    } finally {
      sample.close();
      msg.frame.close();
    }
  });
};
