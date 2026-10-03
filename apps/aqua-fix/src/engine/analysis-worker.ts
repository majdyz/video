// Runs analyzeThumbnail off the main thread. The page posts the RGBA8
// thumbnail (buffer transferred); the reply carries the grade parameters and
// the three data textures already packed for the GPU (buffers transferred).
import { analyzeThumbnail } from "./analyze.ts";
import { claheTexture, fieldsTexture, guideTexture, type GradeParams, type Vec3 } from "./params.ts";

export type AnalysisRequest = { id: number; rgba: ArrayBuffer; width: number; height: number };

export type AnalysisPacket = {
  id: number;
  params: GradeParams;
  mean: Vec3;
  fields: { width: number; height: number; data: Float32Array };
  guide: { width: number; height: number; data: Float32Array };
  clahe: { tilesX: number; tilesY: number; bins: number; data: Float32Array };
  /** Milliseconds spent in analyzeThumbnail. */
  ms: number;
};

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, rgba, width, height } = e.data;
  const t0 = performance.now();
  const a = analyzeThumbnail(new Uint8ClampedArray(rgba), width, height);
  const fields = fieldsTexture(a.depth);
  const guide = guideTexture(a.depth);
  const clahe = claheTexture(a.clahe);
  const packet: AnalysisPacket = {
    id,
    params: a.params,
    mean: a.mean,
    fields: { width: a.depth.width, height: a.depth.height, data: fields },
    guide: { width: a.depth.width, height: a.depth.height, data: guide },
    clahe: { tilesX: a.clahe.tilesX, tilesY: a.clahe.tilesY, bins: a.clahe.bins, data: clahe },
    ms: performance.now() - t0,
  };
  (self as unknown as Worker).postMessage(packet, [fields.buffer, guide.buffer, clahe.buffer]);
};
