// EdgeTAM video tracker on onnxruntime-web (runs in seg-worker.ts). Four graphs (vision encoder, mask decoder,
// memory attention, memory encoder; fp16 weights, fp32 maths) and the memory bank (bank.ts) per session.
import type * as OrtNS from "onnxruntime-web";
import { assembleMemory, HIDDEN, isEmpty, MEM_DIM, MEM_TOKENS, newBank, pruneBank, storeMemory, type ObjectBank } from "./bank.ts";

type Ort = typeof OrtNS;
type Sess = OrtNS.InferenceSession;
type T = OrtNS.Tensor;

export const GRAPHS = ["vision_encoder", "mask_decoder", "memory_attention", "memory_encoder"] as const;
export type GraphName = (typeof GRAPHS)[number];
export type BankParams = { no_memory_embedding: number[]; memory_temporal_positional_encoding: number[][] };

const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

export class EdgeTam {
  private feats: { f0: T; f1: T; f2: T; p2: T } | null = null;
  private banks = new Map<string, ObjectBank>();
  private noMem: Float32Array;
  private tpos: Float32Array;
  private pixels = new Float32Array(3 * 1024 * 1024);
  /** Time spent per stage (ms) and counts, for the pass profile (session.ts). */
  readonly timing = { encode: 0, encodes: 0, attend: 0, decoder: 0, memEnc: 0, steps: 0 };

  private ort: Ort;
  private s: Record<GraphName, Sess>;
  readonly ep: string;

  private constructor(ort: Ort, s: Record<GraphName, Sess>, bank: BankParams, ep: string) {
    this.ort = ort;
    this.s = s;
    this.ep = ep;
    this.noMem = Float32Array.from(bank.no_memory_embedding);
    this.tpos = Float32Array.from(bank.memory_temporal_positional_encoding.flat());
  }

  /** Tries the execution providers in order (WebGPU first when the device has it); `failed` records why one was skipped. */
  static async create(ort: Ort, models: Record<GraphName, Uint8Array>, bank: BankParams, eps: string[], failed: string[] = []): Promise<EdgeTam> {
    let lastErr: unknown = null;
    for (const ep of eps) {
      try {
        const s = {} as Record<GraphName, Sess>;
        for (const g of GRAPHS) s[g] = await ort.InferenceSession.create(models[g], { executionProviders: [ep], graphOptimizationLevel: "all" });
        return new EdgeTam(ort, s, bank, ep);
      } catch (e) {
        lastErr = e;
        failed.push(`${ep}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
      }
    }
    throw lastErr ?? new Error("no execution provider");
  }

  /** RGBA 1024×1024 (the upright frame stretched) → features of the frame the next steps run on. */
  async encode(rgba: Uint8ClampedArray): Promise<void> {
    const n = 1024 * 1024, px = this.pixels;
    for (let i = 0; i < n; i++) {
      px[i] = (rgba[i * 4] / 255 - MEAN[0]) / STD[0];
      px[n + i] = (rgba[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
      px[2 * n + i] = (rgba[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
    }
    this.dispose();
    const t0 = performance.now();
    const o = await this.s.vision_encoder.run({ pixel_values: new this.ort.Tensor("float32", px, [1, 3, 1024, 1024]) });
    this.timing.encode += performance.now() - t0;
    this.timing.encodes++;
    this.feats = { f0: o.feats0, f1: o.feats1, f2: o.feats2, p2: o.pos2 };
    o.pos0?.dispose?.();
    o.pos1?.dispose?.();
  }

  private dispose(): void {
    if (!this.feats) return;
    for (const t of Object.values(this.feats)) t.dispose?.();
    this.feats = null;
  }

  drop(key: string): void {
    this.banks.delete(key);
  }

  /**
   * One step of session `key` at frame index `frame` on the encoded frame. Points in 1024² space. The first
   * prompted step of an empty session is its conditioning frame; later prompts (the flow guard) are
   * non-conditioning, as in transformers' streaming.
   */
  async step(key: string, frame: number, points: [number, number][] | null, labels: number[] | null, reverse: boolean): Promise<{ logits: Float32Array; lw: number; lh: number; score: number; iou: number }> {
    const F = this.feats;
    if (!F) throw new Error("encode first");
    const ort = this.ort;
    let bank = this.banks.get(key);
    if (!bank) this.banks.set(key, (bank = newBank()));
    const init = !!points && isEmpty(bank);
    const f2 = await F.f2.getData() as Float32Array;
    let pix: Float32Array;
    const ta = performance.now();
    if (init) {
      pix = new Float32Array(f2.length);
      for (let c = 0; c < HIDDEN; c++) for (let i = 0; i < 4096; i++) pix[c * 4096 + i] = f2[c * 4096 + i] + this.noMem[c];
    } else {
      const m = assembleMemory(bank, frame, reverse, this.tpos);
      if (!m) throw new Error("no conditioning frame");
      pix = await this.attend(f2, await F.p2.getData() as Float32Array, m);
    }
    const tb = performance.now();
    this.timing.attend += tb - ta;
    const P = points ?? [[0, 0]], L = labels ?? [-1];
    const dec = await this.s.mask_decoder.run({
      feats0: F.f0, feats1: F.f1, feats2: new ort.Tensor("float32", pix, [1, 256, 64, 64]),
      input_points: new ort.Tensor("float32", Float32Array.from(P.flat()), [1, 1, P.length, 2]),
      input_labels: new ort.Tensor("int32", Int32Array.from(L), [1, 1, L.length]),
    });
    const tc = performance.now();
    this.timing.decoder += tc - tb;
    const men = await this.s.memory_encoder.run({
      vision_features: F.f2, pred_masks_high_res: dec.high_res_masks.reshape([1, 1, 1024, 1024]),
      is_mask_from_pts: new ort.Tensor("bool", Uint8Array.from([points ? 1 : 0]), [1]),
    });
    this.timing.memEnc += performance.now() - tc;
    this.timing.steps++;
    const score = (await dec.object_score_logits.getData() as Float32Array)[0];
    const ious = await dec.iou_scores.getData() as Float32Array;
    storeMemory(bank, frame, {
      mem: (await men.memory_tokens.getData() as Float32Array).slice(),
      pos: (await men.memory_pos_enc.getData() as Float32Array).slice(),
      ptr: (await dec.object_pointer.getData() as Float32Array).slice(),
      score,
    }, init);
    pruneBank(bank, frame, reverse);
    const d = dec.pred_masks.dims;
    const logits = (await dec.pred_masks.getData() as Float32Array).slice(0, d[d.length - 1] * d[d.length - 2]);
    for (const t of [...Object.values(dec), ...Object.values(men)]) t.dispose?.();
    return { logits, lw: d[d.length - 1], lh: d[d.length - 2], score, iou: Math.max(...ious) };
  }

  private async attend(f2: Float32Array, p2: Float32Array, m: { spatial: Float32Array; spatialPos: Float32Array; spatialLen: number; pointer: Float32Array; pointerPos: Float32Array; pointerLen: number }): Promise<Float32Array> {
    const ort = this.ort;
    // (1, 256, 64, 64) → (4096, 1, 256)
    const tr = (src: Float32Array) => {
      const o = new Float32Array(4096 * 256);
      for (let c = 0; c < 256; c++) for (let i = 0; i < 4096; i++) o[i * 256 + c] = src[c * 4096 + i];
      return o;
    };
    const out = await this.s.memory_attention.run({
      current_vision_features: new ort.Tensor("float32", tr(f2), [4096, 1, 256]),
      current_vision_position_embeddings: new ort.Tensor("float32", tr(p2), [4096, 1, 256]),
      spatial_memory: new ort.Tensor("float32", m.spatial, [m.spatialLen, 1, MEM_DIM]),
      spatial_memory_position_embeddings: new ort.Tensor("float32", m.spatialPos, [m.spatialLen, 1, MEM_DIM]),
      pointer_memory: new ort.Tensor("float32", m.pointer, [m.pointerLen, 1, MEM_DIM]),
      pointer_memory_position_embeddings: new ort.Tensor("float32", m.pointerPos, [m.pointerLen, 1, MEM_DIM]),
    });
    const c = await out.conditioned_features.getData() as Float32Array; // (1, 1, 4096, 256)
    out.conditioned_features.dispose?.();
    const pix = new Float32Array(256 * 4096);
    for (let i = 0; i < 4096; i++) for (let k = 0; k < 256; k++) pix[k * 4096 + i] = c[i * 256 + k];
    return pix;
  }
}

export { MEM_TOKENS };
