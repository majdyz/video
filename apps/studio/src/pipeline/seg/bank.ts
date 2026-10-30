// EdgeTAM memory bank (Subject pop, AI subject detection). The video graphs (jax-image-tools/edgetam-video-onnx)
// stop at memory attention / memory encoder; which memories a frame attends to is plain bookkeeping on frame indices
// and lives here. It mirrors transformers' EdgeTamVideoModel streaming exactly (checked end to end against it:
// worst keyframe mask IoU 1.0, max logit difference 2e-4; ~/video-data/sam/scripts and seg eval):
// - spatial memories: every conditioning frame (the prompted one, temporal slot 0), then the non-conditioning
//   frames at index t-6 … t-1 (t+6 … t+1 when tracking backwards); a missing index is skipped. Each memory is
//   512 tokens of 64; its position encoding gets the learned temporal encoding of its slot added.
// - object pointers: the conditioning frames at or before t (at or after, backwards), then the non-conditioning
//   frames t-1 … t-15; each 256-d pointer is 4 tokens of 64, position encoding zero (EdgeTAM has no temporal
//   encoding for pointers).
// Frame indices are 30 Hz frame numbers of clip time; keyframes every 5 (6 per second) therefore see the
// conditioning frame plus the keyframe before as spatial memory, and three keyframes of pointers, as in the
// prototype the report measured (0.83 IoU).

export const NUM_MASKMEM = 7;
export const MAX_POINTERS = 16;
export const MEM_TOKENS = 512;
export const MEM_DIM = 64;
export const HIDDEN = 256;

export type MemEntry = {
  /** memory_tokens (512 × 64) */
  mem: Float32Array;
  /** memory_pos_enc (512 × 64) */
  pos: Float32Array;
  /** object pointer (256) */
  ptr: Float32Array;
  /** object score logit (> 0: the object is visible) */
  score: number;
};

export type ObjectBank = { cond: Map<number, MemEntry>; noncond: Map<number, MemEntry> };

export function newBank(): ObjectBank {
  return { cond: new Map(), noncond: new Map() };
}

/** True when the next prompted step on this bank is the initial conditioning frame (no memory yet). */
export function isEmpty(bank: ObjectBank): boolean {
  return bank.cond.size === 0 && bank.noncond.size === 0;
}

export type MemoryInputs = {
  spatial: Float32Array;
  spatialPos: Float32Array;
  spatialLen: number;
  pointer: Float32Array;
  pointerPos: Float32Array;
  pointerLen: number;
  /** Frame indices used (diagnostics / tests): spatial in order, then pointers. */
  spatialFrames: number[];
  pointerFrames: number[];
};

/**
 * The memory attention inputs for frame `t`. `tpos` is memory_temporal_positional_encoding (7 × 64, row-major).
 * Null when the bank has no conditioning frame (nothing to attend to).
 */
export function assembleMemory(bank: ObjectBank, t: number, reverse: boolean, tpos: Float32Array): MemoryInputs | null {
  if (bank.cond.size === 0) return null;
  const spatial: { e: MemEntry; slot: number; f: number }[] = [];
  for (const [f, e] of bank.cond) spatial.push({ e, slot: 0, f });
  for (let off = NUM_MASKMEM - 1; off > 0; off--) {
    const f = reverse ? t + off : t - off;
    const e = bank.noncond.get(f);
    if (e) spatial.push({ e, slot: off, f });
  }
  const n = spatial.length * MEM_TOKENS * MEM_DIM;
  const sm = new Float32Array(n), sp = new Float32Array(n);
  spatial.forEach(({ e, slot }, i) => {
    const o = i * MEM_TOKENS * MEM_DIM;
    sm.set(e.mem, o);
    // transformers indexes the temporal encoding by slot - 1 (slot 0, a conditioning frame, wraps to the last row).
    const row = ((slot - 1) % NUM_MASKMEM + NUM_MASKMEM) % NUM_MASKMEM;
    for (let k = 0; k < MEM_TOKENS; k++) {
      const b = o + k * MEM_DIM;
      for (let c = 0; c < MEM_DIM; c++) sp[b + c] = e.pos[k * MEM_DIM + c] + tpos[row * MEM_DIM + c];
    }
  });
  const ptrs: { e: MemEntry; f: number }[] = [];
  for (const [f, e] of bank.cond) if (reverse ? f >= t : f <= t) ptrs.push({ e, f });
  for (let d = 1; d < MAX_POINTERS; d++) {
    const f = reverse ? t + d : t - d;
    if (f < 0) break;
    const e = bank.noncond.get(f);
    if (e) ptrs.push({ e, f });
  }
  // Each 256-d pointer becomes 4 consecutive 64-d tokens (its 4 chunks in order).
  const pm = new Float32Array(ptrs.length * HIDDEN);
  ptrs.forEach(({ e }, i) => pm.set(e.ptr, i * HIDDEN));
  return {
    spatial: sm, spatialPos: sp, spatialLen: spatial.length * MEM_TOKENS,
    pointer: pm, pointerPos: new Float32Array(pm.length), pointerLen: ptrs.length * (HIDDEN / MEM_DIM),
    spatialFrames: spatial.map((s) => s.f), pointerFrames: ptrs.map((p) => p.f),
  };
}

/** Stores a step's memory: the initial prompted frame is a conditioning frame, every later one non-conditioning. */
export function storeMemory(bank: ObjectBank, t: number, e: MemEntry, conditioning: boolean): void {
  (conditioning ? bank.cond : bank.noncond).set(t, e);
}

/** Drops non-conditioning memories no later frame can reach (further than MAX_POINTERS behind `t`). */
export function pruneBank(bank: ObjectBank, t: number, reverse: boolean): void {
  for (const f of [...bank.noncond.keys()]) if (reverse ? f - t >= MAX_POINTERS : t - f >= MAX_POINTERS) bank.noncond.delete(f);
}

/** 30 Hz frame index of clip time `t` (the bank's clock; see the header). */
export function frameIndex(t: number, fps = 6): number {
  // The keyframe's ordinal on its grid × 5: at 6 Hz this is the 30 Hz frame number; on a sparser grid the memory
  // window (t-6 … t-1) still holds the keyframe before, as the tracker was measured with.
  return Math.round(t * fps) * 5;
}
