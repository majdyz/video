// The AI session's own frames (seg-worker): an independent WebCodecs decoder over the clip file (openSampleReader,
// the same clock as the export: clip time = sample timestamp − the first), never the <video> that plays. Reads in
// time order are sequential decodes; a jump back or far ahead restarts at the nearest key frame.
import { openSampleReader } from "@dive-tools/shared/codec-export.ts";
import type { SessionFrames } from "./session.ts";

type Item = { sample: { toVideoFrame(): VideoFrame; close(): void }; timeSec: number };

export async function openSessionFrames(file: File): Promise<SessionFrames> {
  const r = await openSampleReader(file);
  const rot = ((r.rotation % 360) + 360) % 360;
  const width = rot % 180 ? r.displayHeight : r.displayWidth;
  const height = rot % 180 ? r.displayWidth : r.displayHeight;
  let it: AsyncGenerator<Item, void, unknown> | null = null;
  let cur: Item | null = null, next: Item | null = null, frame: VideoFrame | null = null;
  const drop = (x: Item | null) => { try { x?.sample.close(); } catch { /* closed */ } };
  const reset = async (t: number) => {
    drop(cur); drop(next); cur = next = null;
    frame?.close(); frame = null;
    await it?.return(undefined).catch(() => undefined);
    it = r.samples(Math.max(0, t)) as AsyncGenerator<Item, void, unknown>;
    const first = await it.next();
    cur = first.done ? null : first.value;
  };
  return {
    width, height, rotation: rot,
    async at(t: number) {
      if (!it || !cur || t < cur.timeSec - 1e-3 || t - cur.timeSec > 2) await reset(t);
      for (;;) {
        if (!next) {
          const n = await it!.next();
          next = n.done ? null : n.value;
          if (!next) break;
        }
        if (next.timeSec <= t + 1e-3) {
          drop(cur); cur = next; next = null;
          frame?.close(); frame = null;
        } else break;
      }
      if (!cur) throw new Error(`no frame at ${t.toFixed(3)} s`);
      frame ??= cur.sample.toVideoFrame();
      return frame;
    },
    dispose() {
      frame?.close(); drop(cur); drop(next);
      void it?.return(undefined).catch(() => undefined);
      r.dispose();
    },
  };
}
