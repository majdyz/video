// Runs analyzeThumbnail off the main thread. The page posts the RGBA8
// thumbnail (buffer transferred); the reply carries the grade parameters and
// the three data textures already packed for the GPU (buffers transferred).
// A second message kind computes the material anchor's target per locked
// shot from the profile's thumbnails (follow.ts shotTarget).
import { analyzeThumbnail } from "./analyze.ts";
import { claheTexture, fieldsTexture, guideTexture, type GradeParams, type Vec3 } from "./params.ts";
import type { AnimalMap } from "./animals.ts";
import { anchorCorrection, type AnchorResult } from "./anchor.ts";
import { lockParams } from "./lock.ts";
import { sceneTrust, shotTarget } from "./follow.ts";

/**
 * `lock` + `target`: the clip-locked estimate in force and its shot's anchor
 * target; with both, the material anchor is solved under the lock (anchor.ts).
 */
export type AnalysisRequest = { kind?: "analyse"; id: number; rgba: ArrayBuffer; width: number; height: number; lock?: GradeParams; target?: [number, number]; /** Subject pop: points (upright uv) to start a subject from (a user's tap). */ seeds?: { u: number; v: number }[] };
/** Anchor targets for locked shots: each shot's lock and the profile thumbnails that fall in it. */
export type TargetsRequest = { kind: "targets"; id: number; width: number; height: number; shots: { lock: GradeParams; thumbs: ArrayBuffer[] }[] };
export type TargetsReply = { kind: "targets"; id: number; targets: ([number, number] | null)[] };

export type AnalysisPacket = {
  kind?: "analyse";
  id: number;
  params: GradeParams;
  mean: Vec3;
  fields: { width: number; height: number; data: Float32Array };
  guide: { width: number; height: number; data: Float32Array };
  clahe: { tilesX: number; tilesY: number; bins: number; data: Float32Array };
  /** Open water: the subject map's animals (animals.ts). */
  animals?: AnimalMap;
  /** Material anchor correction under the request's lock (null without a lock / target or without enough anchor). */
  anchor: AnchorResult | null;
  /** Milliseconds spent in analyzeThumbnail (and the anchor). */
  ms: number;
};

self.onmessage = (e: MessageEvent<AnalysisRequest | TargetsRequest>) => {
  if (e.data.kind === "targets") {
    const { id, width, height, shots } = e.data;
    const targets = shots.map((s) => shotTarget(s.thumbs.map((b) => new Uint8ClampedArray(b)), width, height, s.lock));
    const reply: TargetsReply = { kind: "targets", id, targets };
    (self as unknown as Worker).postMessage(reply);
    return;
  }
  const { id, rgba, width, height, lock, target, seeds } = e.data;
  const t0 = performance.now();
  const px = new Uint8ClampedArray(rgba);
  const a = analyzeThumbnail(px, width, height, { seeds });
  const anchor = lock && target && sceneTrust(a.params) > 0 ? anchorCorrection(px, width, height, lockParams(lock, a.params), a.depth, a.clahe, target) : null;
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
