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
  private feats: { f0: T; f1: T; f2: T } | null = null;
  private banks = new Map<string, ObjectBank>();
  private noMem: Float32Array;
  private tpos: Float32Array;
  /** Reused buffers (a phone's JS heap lets garbage typed arrays pile up between collections): the encoder input
   * (sized for the encoder), the decoder's feats2 and the current frame's features in memory-attention order. */
  private pixels: Float32Array | null = null;
  private pix = new Float32Array(HIDDEN * 4096);
  private seqF2 = new Float32Array(HIDDEN * 4096);
  private seqP2 = new Float32Array(HIDDEN * 4096);
  /** seqF2 holds the encoded frame (filled on its first attend; several objects step on one encode). */
  private seqReady = false;
  /** seqP2 holds pos2, feats2's position encoding: the same for every frame, so the encoder hands it over once (each
   * output is a fresh 4 MB copy out of the WASM heap, and a phone's garbage collector lets them pile up). */
  private posReady = false;
  /** Called after each graph run (encode, init / attend, decoder, memory encoder): the worker's heap breadcrumbs. */
  onStage: ((stage: string) => void) | null = null;
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
  static async create(ort: Ort, models: Record<GraphName, Uint8Array>, bank: BankParams, eps: string[], failed: string[] = [], lite = false): Promise<EdgeTam> {
    let lastErr: unknown = null;
    for (const ep of eps) {
      try {
        const s = {} as Record<GraphName, Sess>;
        // No CPU arena / memory pattern: both keep each graph's peak activations reserved for good (the encoder's at
        // 1024² are hundreds of MB), and a phone tab that holds four graphs' peaks next to the video decoders is killed.
        for (const g of GRAPHS) s[g] = await ort.InferenceSession.create(models[g], { executionProviders: [ep], graphOptimizationLevel: "disabled", enableCpuMemArena: false, enableMemPattern: false });
        const m = new EdgeTam(ort, s, bank, ep);
        m.lite = lite;
        return m;
      } catch (e) {
        lastErr = e;
        failed.push(`${ep}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
      }
    }
    throw lastErr ?? new Error("no execution provider");
  }

  /** The 512-px encoder (vision_encoder_lite): the 1024 frame is averaged 2×2 first; its features come out at the 1024 shapes. */
  lite = false;

  /** The graph runs wait for one another (exclusive). */
  private lock: Promise<unknown> = Promise.resolve();

  /**
   * Runs fn once every call before it has ended. The model is not re-entrant (one set of encoded features, reused
   * buffers), and the session already calls it one step at a time; this makes it a property of the model instead
   * of its callers (two graphs running at once on a phone's GPU is also twice the memory).
   */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  /** RGBA 1024×1024 (the upright frame stretched) → features of the frame the next steps run on. */
  encode(rgba: Uint8ClampedArray): Promise<void> {
    return this.exclusive(() => this.encodeNow(rgba));
  }

  private async encodeNow(rgba: Uint8ClampedArray): Promise<void> {
    const S = this.lite ? 512 : 1024, n = S * S;
    if (this.pixels?.length !== 3 * n) this.pixels = new Float32Array(3 * n);
    const px = this.pixels;
    if (this.lite) {
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        const a = (2 * y * 1024 + 2 * x) * 4, b = a + 4, c = a + 4096, d = c + 4, i = y * 512 + x;
        for (let k = 0; k < 3; k++) px[k * n + i] = ((rgba[a + k] + rgba[b + k] + rgba[c + k] + rgba[d + k]) / 1020 - MEAN[k]) / STD[k];
      }
    } else for (let i = 0; i < n; i++) {
      px[i] = (rgba[i * 4] / 255 - MEAN[0]) / STD[0];
      px[n + i] = (rgba[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
      px[2 * n + i] = (rgba[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
    }
    this.dispose();
    const t0 = performance.now();
    const o = await this.s.vision_encoder.run({ pixel_values: new this.ort.Tensor("float32", px, [1, 3, S, S]) }, this.posReady ? ["feats0", "feats1", "feats2"] : ["feats0", "feats1", "feats2", "pos2"]);
    this.timing.encode += performance.now() - t0;
    this.timing.encodes++;
    this.onStage?.("encode");
    this.feats = { f0: o.feats0, f1: o.feats1, f2: o.feats2 };
    if (!this.posReady) {
      // (1, 256, 64, 64) → (4096, 1, 256)
      const p2 = await o.pos2.getData() as Float32Array;
      for (let c = 0; c < 256; c++) for (let i = 0; i < 4096; i++) this.seqP2[i * 256 + c] = p2[c * 4096 + i];
      o.pos2.dispose?.();
      this.posReady = true;
    }
  }

  private dispose(): void {
    if (!this.feats) return;
    for (const t of Object.values(this.feats)) t.dispose?.();
    this.feats = null;
    this.seqReady = false;
  }

  drop(key: string): void {
    this.banks.delete(key);
  }

  /**
   * One step of session `key` at frame index `frame` on the encoded frame. Points in 1024² space. The first
   * prompted step of an empty session is its conditioning frame; later prompts (the flow guard) are
   * non-conditioning, as in transformers' streaming.
   */
  step(key: string, frame: number, points: [number, number][] | null, labels: number[] | null, reverse: boolean): Promise<{ logits: Float32Array; lw: number; lh: number; score: number; iou: number }> {
    return this.exclusive(() => this.stepNow(key, frame, points, labels, reverse));
  }

  private async stepNow(key: string, frame: number, points: [number, number][] | null, labels: number[] | null, reverse: boolean): Promise<{ logits: Float32Array; lw: number; lh: number; score: number; iou: number }> {
    const F = this.feats;
    if (!F) throw new Error("encode first");
    const ort = this.ort;
    let bank = this.banks.get(key);
    if (!bank) this.banks.set(key, (bank = newBank()));
    const init = !!points && isEmpty(bank);
    const f2 = await F.f2.getData() as Float32Array;
    const pix = this.pix;
    const ta = performance.now();
    if (init) {
      this.noMemory(f2);
    } else {
      const m = assembleMemory(bank, frame, reverse, this.tpos);
      if (!m) throw new Error("no conditioning frame");
      await this.attend(f2, m);
    }
    const tb = performance.now();
    this.timing.attend += tb - ta;
    this.onStage?.(init ? "init" : "attend");
    const P = points ?? [[0, 0]], L = labels ?? [-1];
    const dec = await this.s.mask_decoder.run({
      feats0: F.f0, feats1: F.f1, feats2: new ort.Tensor("float32", pix, [1, 256, 64, 64]),
      input_points: new ort.Tensor("float32", Float32Array.from(P.flat()), [1, 1, P.length, 2]),
      input_labels: new ort.Tensor("int32", Int32Array.from(L), [1, 1, L.length]),
    });
    const tc = performance.now();
    this.timing.decoder += tc - tb;
    this.onStage?.("decoder");
    const men = await this.s.memory_encoder.run({
      vision_features: F.f2, pred_masks_high_res: dec.high_res_masks.reshape([1, 1, 1024, 1024]),
      is_mask_from_pts: new ort.Tensor("bool", Uint8Array.from([points ? 1 : 0]), [1]),
    });
    this.timing.memEnc += performance.now() - tc;
    this.timing.steps++;
    this.onStage?.("memory encoder");
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

  /**
   * The mask a prompt gives on the encoded frame alone (no memory read or written): the decoder only, for scoring
   * candidate points (SegSession.autoSeeds).
   */
  probe(points: [number, number][], labels: number[]): Promise<{ logits: Float32Array; lw: number; lh: number; score: number; iou: number }> {
    return this.exclusive(() => this.probeNow(points, labels));
  }

  private async probeNow(points: [number, number][], labels: number[]): Promise<{ logits: Float32Array; lw: number; lh: number; score: number; iou: number }> {
    const F = this.feats;
    if (!F) throw new Error("encode first");
    const ort = this.ort;
    const pix = this.noMemory(await F.f2.getData() as Float32Array);
    const dec = await this.s.mask_decoder.run({
      feats0: F.f0, feats1: F.f1, feats2: new ort.Tensor("float32", pix, [1, 256, 64, 64]),
      input_points: new ort.Tensor("float32", Float32Array.from(points.flat()), [1, 1, points.length, 2]),
      input_labels: new ort.Tensor("int32", Int32Array.from(labels), [1, 1, labels.length]),
    }, ["pred_masks", "iou_scores", "object_score_logits"]); // not the 1024² mask nor the pointer: copies for nothing
    const score = (await dec.object_score_logits.getData() as Float32Array)[0];
    const ious = await dec.iou_scores.getData() as Float32Array;
    const d = dec.pred_masks.dims;
    const logits = (await dec.pred_masks.getData() as Float32Array).slice(0, d[d.length - 1] * d[d.length - 2]);
    for (const t of Object.values(dec)) t.dispose?.();
    return { logits, lw: d[d.length - 1], lh: d[d.length - 2], score, iou: Math.max(...ious) };
  }

  /** feats2 with the no-memory embedding (a conditioning frame, a probe) into this.pix. */
  private noMemory(f2: Float32Array): Float32Array {
    const pix = this.pix;
    for (let c = 0; c < HIDDEN; c++) for (let i = 0; i < 4096; i++) pix[c * 4096 + i] = f2[c * 4096 + i] + this.noMem[c];
    return pix;
  }

  /** Memory attention on the encoded frame → the conditioned feats2 in this.pix. */
  private async attend(f2: Float32Array, m: { spatial: Float32Array; spatialPos: Float32Array; spatialLen: number; pointer: Float32Array; pointerPos: Float32Array; pointerLen: number }): Promise<void> {
    const ort = this.ort;
    if (!this.seqReady) {
      // (1, 256, 64, 64) → (4096, 1, 256), once per encoded frame
      const o = this.seqF2;
      for (let c = 0; c < 256; c++) for (let i = 0; i < 4096; i++) o[i * 256 + c] = f2[c * 4096 + i];
      this.seqReady = true;
    }
    const out = await this.s.memory_attention.run({
      current_vision_features: new ort.Tensor("float32", this.seqF2, [4096, 1, 256]),
      current_vision_position_embeddings: new ort.Tensor("float32", this.seqP2, [4096, 1, 256]),
      spatial_memory: new ort.Tensor("float32", m.spatial, [m.spatialLen, 1, MEM_DIM]),
      spatial_memory_position_embeddings: new ort.Tensor("float32", m.spatialPos, [m.spatialLen, 1, MEM_DIM]),
      pointer_memory: new ort.Tensor("float32", m.pointer, [m.pointerLen, 1, MEM_DIM]),
      pointer_memory_position_embeddings: new ort.Tensor("float32", m.pointerPos, [m.pointerLen, 1, MEM_DIM]),
    });
    const c = await out.conditioned_features.getData() as Float32Array; // (1, 1, 4096, 256)
    out.conditioned_features.dispose?.();
    const pix = this.pix;
    for (let i = 0; i < 4096; i++) for (let k = 0; k < 256; k++) pix[k * 4096 + i] = c[i * 256 + k];
  }
}

export { MEM_TOKENS };
