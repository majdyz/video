// AI subjects and the export (studio.ts exportVideo). An export never waits for the AI pass: it starts at once and
// every frame is graded with what the AI has for it then, its mask where the pass has been, the engine's own subject
// detection where it has not (the preview's fallback: studio-seg.ts SegLive.at is null there, and the mask's weight
// eases out over 0.3 s toward frames that are not filled). The pass goes on next to the render: its looks are made
// aside from the engine the export renders with (studio.ts seedAside), and the masks it makes meanwhile are used by
// every frame rendered after them. On a phone the model's worker is shut down for the render instead (memory).
//
// The export waits for the pass in two places only, both bounded:
//   - a pass whose own estimate says it is about to finish when the export starts is given SEG_EXPORT.waitS;
//   - where the render has caught up with the pass (the next frame is the pass's next one: headWait) it waits for
//     the pass's frames, SEG_EXPORT.headWaitS in all for the export, then goes on with the engine's detection.
// How much the second buys depends on the two speeds: 18–28 s of pass per clip second on a desktop's WASM with
// the lite model (about a fifth of that on an iPhone's WebGPU), against a render of tens of milliseconds a frame
// on a GPU, or 18 s per clip second in a headless browser without one (where the pass nearly keeps up).
// Pure; tested in test/seg-export.test.ts.

export const SEG_EXPORT = {
  /** An export waits at most this long (s) for a pass that says it is about to finish; never for any other. */
  waitS: 15,
  /** While it renders, an export that has caught up with the pass waits for the pass's next frames, this long (s)
   * in all (headWait); after that it goes on with the engine's detection where the pass has not been. Short on
   * purpose: 60 s bought a tenth of the owner's ray clip on a desktop's WASM. Who wants the AI everywhere takes
   * "Wait for AI, then export" (exportChoice). */
  headWaitS: 10,
  /** ...and only for a frame at most this far (s of clip) past the pass's newest finished frame: the pass is about
   * to get there. A frame further on (or one the pass left behind unfilled) is not waited for. */
  headReachS: 1,
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

/**
 * The pass is through: its first seeds were given and every frame of its range has its answer (the session posts
 * the frames nothing was found on too, once it is done). Not "an idle came after the seeds": the session's idle
 * after the model's own search of the first frame is posted before the seeds reach it, and arrives after the main
 * thread has noted them. An export that asked then was told "pass complete" with 2% of the frames filled (owner's
 * ray clip, 12 Nov: "AI subjects on 16 of 754 frames (2%), pass complete").
 */
export function passComplete(o: { seeded: boolean; filled: number; n: number }): boolean {
  return o.seeded && o.n > 0 && o.filled >= o.n;
}

/**
 * Whether an export's render waits for the AI pass before it grades the frame at clip time t (studio.ts segAwait).
 * The pass goes on while the export renders; where the render has caught up with it, the frame is the pass's next
 * one, and waiting a moment gives it its AI mask instead of the engine's detection.
 *   settled   the frame has its masks at full weight already: nothing to wait for;
 *   running   the pass is at work (not through, not shut down, not held up by a look it cannot make);
 *   frontT    the newest frame the pass has finished (SegLive.followT; null: none);
 *   leftMs    what is left of the export's wait in all (SEG_EXPORT.headWaitS).
 */
export function headWait(o: { t: number; settled: boolean; running: boolean; frontT: number | null; leftMs: number }, reachS = SEG_EXPORT.headReachS): boolean {
  if (o.settled || !o.running || o.leftMs <= 0 || o.frontT === null) return false;
  return o.t > o.frontT - 1e-6 && o.t <= o.frontT + reachS + 1e-6;
}

/**
 * The export sheet's two buttons while the AI pass is unfinished (Subject pop with AI on): the primary exports now
 * with what the pass has, and says how much that is; the secondary waits for the pass and exports when it is
 * through (studio.ts exportVideo({ waitAi: true })), with the pass's own estimate when it has one.
 * `coverage`: the share of the pass's frames that have their answer (0..1); `etaS`: the pass's time left (null:
 * no estimate yet).
 */
export function exportChoice(o: { coverage: number; etaS: number | null }): { now: string; note: string; wait: string } {
  const pc = Math.min(99, Math.max(0, Math.round(100 * (Number.isFinite(o.coverage) ? o.coverage : 0))));
  const note = pc > 0
    ? `AI subjects have reached about ${pc}% of the clip. Exporting now uses them there and standard subject detection on the rest.`
    : "AI subjects haven't reached this clip yet. Exporting now uses standard subject detection.";
  const eta = o.etaS !== null && Number.isFinite(o.etaS) && o.etaS >= 0 ? (o.etaS < 45 ? "under a minute" : `~${Math.max(1, Math.round(o.etaS / 60))} min`) : null;
  return { now: "Export now", note, wait: eta ? `Wait for AI, then export (${eta})` : "Wait for AI, then export" };
}
