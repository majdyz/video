// Runs analyzeThumbnail off the main thread. The page posts the RGBA8
// thumbnail (buffer transferred); the reply carries the grade parameters and
// the three data textures already packed for the GPU (buffers transferred).
// A second message kind measures each locked shot's balance (the material
// anchor's target and the offset curve that holds it) on the profile's
// thumbnails (follow.ts shotBalance). The per-frame analysis itself no longer
// depends on the lock.
import { analyzeThumbnail } from "./analyze.ts";
import { claheTexture, fieldsTexture, guideTexture, type GradeParams, type Vec3 } from "./params.ts";
import type { AnimalMap } from "./animals.ts";
import { shotBalance, type ShotCurve } from "./follow.ts";

export type AnalysisRequest = { kind?: "analyse"; id: number; rgba: ArrayBuffer; width: number; height: number; /** Subject pop: points (upright uv) to start a subject from (a user's tap). */ seeds?: { u: number; v: number }[] };
/** The balance of locked shots: each shot's lock and the profile thumbnails that fall in it, with their clip times. */
export type BalanceRequest = { kind: "balance"; id: number; width: number; height: number; shots: { lock: GradeParams; times: number[]; thumbs: ArrayBuffer[] }[] };
/** Per shot: the anchor's target colour and the balance offset over clip time; null = the shot keeps the plain lock. */
export type BalanceReply = { kind: "balance"; id: number; shots: ({ target: [number, number]; curve: ShotCurve | null } | null)[] };

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
  /** Milliseconds spent in analyzeThumbnail. */
  ms: number;
};

self.onmessage = (e: MessageEvent<AnalysisRequest | BalanceRequest>) => {
  if (e.data.kind === "balance") {
    const { id, width, height, shots } = e.data;
    const reply: BalanceReply = {
      kind: "balance",
      id,
      shots: shots.map((s) => {
        const r = shotBalance(s.thumbs.map((b) => new Uint8ClampedArray(b)), s.times, width, height, s.lock);
        return r ? { target: r.target, curve: r.curve } : null;
      }),
    };
    (self as unknown as Worker).postMessage(reply);
    return;
  }
  const { id, rgba, width, height, seeds } = e.data;
  const t0 = performance.now();
  const px = new Uint8ClampedArray(rgba);
  const a = analyzeThumbnail(px, width, height, { seeds });
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
    ms: performance.now() - t0,
  };
  const transfer: Transferable[] = [fields.buffer, guide.buffer, clahe.buffer];
  if (a.depth.animals) transfer.push(a.depth.animals.labels.buffer);
  (self as unknown as Worker).postMessage(packet, transfer);
};
