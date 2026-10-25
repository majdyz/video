// Timeline filmstrip (media chunk): a handful of small thumbnails decoded
// with WebCodecs (mediabunny's CanvasSink seeks to the key frame before each
// time and decodes forward), returned as JPEG object URLs. Runs once per clip,
// after the first frame is on screen; any failure just leaves the strip plain.

import "@dive-tools/shared/videoframe-colorspace.ts";
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";

export async function filmstrip(file: File, times: number[], height: number, signal: AbortSignal): Promise<string[]> {
  if (typeof VideoDecoder === "undefined" || !times.length) return [];
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const urls: string[] = [];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const w = await track.getDisplayWidth(), h = await track.getDisplayHeight();
    if (!w || !h) return [];
    const th = Math.max(16, Math.round(height));
    const tw = Math.max(16, Math.round((th * w) / h));
    const first = await track.getFirstTimestamp();
    const sink = new CanvasSink(track, { width: tw, height: th, fit: "fill", poolSize: 1 });
    for await (const wrapped of sink.canvasesAtTimestamps(times.map((t) => first + t))) {
      if (signal.aborted) break;
      if (!wrapped) {
        urls.push("");
        continue;
      }
      const c = wrapped.canvas;
      const blob = "convertToBlob" in c
        ? await c.convertToBlob({ type: "image/jpeg", quality: 0.72 })
        : await new Promise<Blob | null>((r) => (c as HTMLCanvasElement).toBlob(r, "image/jpeg", 0.72));
      urls.push(blob ? URL.createObjectURL(blob) : "");
    }
    if (signal.aborted) {
      for (const u of urls) if (u) URL.revokeObjectURL(u);
      return [];
    }
    return urls;
  } finally {
    input.dispose();
  }
}
