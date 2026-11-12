// AI subjects and the export (studio.ts exportVideo). An export never waits for the AI pass: it starts at once and
// every frame is graded with what the AI has for it then, its mask where the pass has been, the engine's own subject
// detection where it has not (the preview's fallback: studio-seg.ts SegLive.at is null there, and the mask's weight
// eases out over 0.3 s toward frames that are not filled). The pass goes on next to the render for as long as it
// needs nothing from the main thread's engine (its next look is held until the export is over: studio.ts holdSeeds).
//
// Why not wait where the export's head catches up with the pass: a keyframe of the pass is seconds (18–28 s of
// work per clip second on a desktop's WASM with the lite model, about a fifth of that on an iPhone's WebGPU), a
// rendered frame is tens of milliseconds. The export is ahead of the pass within the first seconds and stays
// there, so a wait at the head either lasts as long as the rest of the pass (the old behaviour) or buys a second
// of clip. The one wait that pays is a pass that is nearly through when the export starts: it is given
// SEG_EXPORT.waitS to finish, when its own estimate says it will (exportWaitS). Pure; tested in
// test/seg-export.test.ts.

export const SEG_EXPORT = {
  /** An export waits at most this long (s) for a pass that says it is about to finish; never for any other. */
  waitS: 15,
  /** A frame counts as graded with the AI's mask from this share of the mask's hand-over weight (SegLive.hand). */
  minHand: 0.5,
};

/**
 * How long (s) an export starting now waits for the AI pass: SEG_EXPORT.waitS when the pass's own estimate of its
 * time left (`etaS`; null: none yet) is within it, else 0 (it starts at once, with the frames the pass has done).
 */
export function exportWaitS(etaS: number | null, maxS = SEG_EXPORT.waitS): number {
  return etaS !== null && Number.isFinite(etaS) && etaS >= 0 && etaS <= maxS ? maxS : 0;
}

/** What the export's frames were graded with: counted as they are rendered. */
export class SegExportUse {
  ai = 0;
  total = 0;
  /** One rendered frame; `ai`: the AI had it (its mask, or its answer that no subject is on it). */
  add(ai: boolean): void {
    this.total++;
    if (ai) this.ai++;
  }
  /** Share of the frames rendered with the AI's masks (0..1; 0 with no frame). */
  get share(): number {
    return this.total ? this.ai / this.total : 0;
  }
}

/** The line shown while an export renders with the pass unfinished. */
export const SEG_EXPORT_RUNNING = "AI subjects are still being found: frames they haven't reached yet use standard subject detection.";
export const SEG_EXPORT_UNAVAILABLE = "AI subject detection wasn't available for this export: standard subject detection was used.";

/**
 * What the export sheet says about the AI subjects once the export is done: nothing when every frame had them (the
 * pass was through), else the share of the frames that did, honestly ("AI subjects on 82% of frames"), or that none
 * did. `resumed`: the export picked up an interrupted one, so the count is of the frames rendered now.
 */
export function segCoverageNote(use: { ai: number; total: number }, o: { complete: boolean; available: boolean; resumed?: boolean }): string | null {
  if (!o.available) return SEG_EXPORT_UNAVAILABLE;
  if (!use.total) return null;
  if (use.ai >= use.total) return o.complete ? null : `AI subjects on all ${o.resumed ? "frames rendered now" : "frames"}.`;
  if (use.ai <= 0) return "AI subjects weren't ready for this export: standard subject detection was used. Export again once the AI is through to have them.";
  // (Never "100%" or "0%" for a share that is not: the count above says all or none.)
  const pc = Math.min(99, Math.max(1, Math.round((100 * use.ai) / use.total)));
  const said = `AI subjects on ${pc}% of ${o.resumed ? "the frames rendered now" : "frames"}; standard subject detection on the rest`;
  return o.complete ? `${said}.` : `${said} (the AI was still working). Export again once it is through to have them everywhere.`;
}

/**
 * The AI's part of the export's settings key (the export journal resumes an interrupted export of the same clip
 * with the same key): the taps alone. It used to carry the number of filled frames and of seeded segments, which
 * only stood still once the pass was through; an export that starts while the pass runs must keep its key to be
 * resumable at all. `taps`: the session's inputs that are the user's (adds, removes, restores), in order.
 */
export function segExportKey(taps: readonly unknown[]): string {
  const s = JSON.stringify(taps);
  // FNV-1a over the JSON: a short, stable name for the set of taps.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `seg:ai:${taps.length}:${h.toString(36)}`;
}

/**
 * Follow mode ("watch it work", studio.ts followStep): the newest frame the preview can show with its AI mask at
 * full weight, i.e. the last grid frame that is filled and has `hand` filled frames either side of it (the edges of
 * the range count as filled). `filled(i)`: frame i of n is filled. −1: none.
 */
export function followFrame(n: number, filled: (i: number) => boolean, hand: number): number {
  let run = 0;
  // From the end: the first frame with `hand` filled frames after it (or the range's end) and before it.
  for (let i = n - 1; i >= 0; i--) {
    if (!filled(i)) { run = 0; continue; }
    run++;
    const after = Math.min(hand, n - 1 - i);
    if (run <= after) continue;
    let ok = true;
    for (let d = 1; d <= hand && i - d >= 0; d++) if (!filled(i - d)) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}
