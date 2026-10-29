// Runs analyzeThumbnail off the main thread. The page posts the RGBA8
// thumbnail (buffer transferred); the reply carries the grade parameters and
// the three data textures already packed for the GPU (buffers transferred).
import { analyzeThumbnail } from "./analyze.ts";
import { claheTexture, fieldsTexture, guideTexture, type GradeParams, type Vec3 } from "./params.ts";
import type { AnimalMap } from "./animals.ts";
import { anchorCorrection, type AnchorResult } from "./anchor.ts";
import { lockParams } from "./lock.ts";

/** `lock`: the clip-locked estimate in force (the material anchor is solved under it; anchor.ts). */
export type AnalysisRequest = { id: number; rgba: ArrayBuffer; width: number; height: number; lock?: GradeParams };

export type AnalysisPacket = {
  id: number;
  params: GradeParams;
  mean: Vec3;
  fields: { width: number; height: number; data: Float32Array };
  guide: { width: number; height: number; data: Float32Array };
  clahe: { tilesX: number; tilesY: number; bins: number; data: Float32Array };
  /** Open water: the subject map's animals (animals.ts). */
  animals?: AnimalMap;
  /** Material anchor correction under the request's lock (null without a lock or without enough anchor). */
  anchor: AnchorResult | null;
  /** Milliseconds spent in analyzeThumbnail (and the anchor). */
  ms: number;
};

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, rgba, width, height, lock } = e.data;
  const t0 = performance.now();
  const px = new Uint8ClampedArray(rgba);
  const a = analyzeThumbnail(px, width, height);
  const anchor = lock ? anchorCorrection(px, width, height, lockParams(lock, a.params), a.depth, a.clahe) : null;
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
    animals: a.depth.animals,
    anchor,
    ms: performance.now() - t0,
  };
  const transfer: Transferable[] = [fields.buffer, guide.buffer, clahe.buffer];
  if (a.depth.animals) transfer.push(a.depth.animals.labels.buffer);
  (self as unknown as Worker).postMessage(packet, transfer);
};
