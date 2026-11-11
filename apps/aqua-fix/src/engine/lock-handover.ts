// From the first frame's grade to the clip lock without a visible step (pure; the engine owns one).
//
// A clip opens graded by its first frame's own estimate. The profile then reads frames from all over the clip
// (seconds on a phone) before the scene lock exists. Until this was in place the picture moved the whole time: every
// profile sample went through the engine like a frame of the preview and pulled the grade toward a different part of
// the clip, the unlocked per-frame estimate followed whatever played meanwhile, and the lock then arrived as a jump.
//
//  - hold: while the profile runs, the globals on screen when it started stay in force (the frame keeps its own range
//    and maps, exactly as under a lock: lock.ts lockParams). One provisional grade, steady. A new picture (a cut, the
//    first analysis after a reset) takes a new provisional once.
//  - hand over: when the lock arrives, the globals crossfade from what is on screen to the lock over LOCK_FADE_MS of
//    wall-clock time (a paused frame has no clip time to ease over), smoothstep-eased, by interpolating the
//    parameters (params.ts lerpParams). After it the lock is returned untouched, so nothing of the handover reaches
//    an export. A lock that changes under a running fade (the shots' balance lands a moment later) carries on from
//    what is on screen instead of stepping.
import { lerpParams, type GradeParams } from "./params.ts";

/** Crossfade from the provisional grade to the clip lock (ms, wall clock). */
export const LOCK_FADE_MS = 1000;
/** A change of the lock itself after the handover (the shots' balance arriving late) eases in over this long (ms), and a re-based fade never ends sooner. */
export const LOCK_REFADE_MS = 400;

export class LockHandover {
  private holding = false;
  private held: GradeParams | null = null;
  private from: GradeParams | null = null;
  private t0 = 0;
  private ms = 0;

  /** The profile starts: `shown` (the globals on screen; null before any analysis) stays in force until the lock. */
  hold(shown: GradeParams | null): void {
    this.holding = true;
    this.held = shown;
  }

  /** True between hold() and the lock (or release). */
  get isHolding(): boolean {
    return this.holding;
  }

  /** A new picture during the hold (`cut`), or the first estimate when there was none to hold: it becomes the provisional grade. */
  rehold(estimate: GradeParams, cut: boolean): void {
    if (this.holding && (cut || !this.held)) this.held = estimate;
  }

  /** The lock is in: crossfade to it from `shown` (null or `ms` ≤ 0: at once). Ends the hold. */
  handOver(shown: GradeParams | null, nowMs: number, ms = LOCK_FADE_MS): void {
    this.holding = false;
    this.held = null;
    this.from = ms > 0 ? shown : null;
    this.t0 = nowMs;
    this.ms = ms;
  }

  /**
   * The lock changed under the handover (the shots' balance): carry on from `shown`. A running fade keeps its end
   * time (at least LOCK_REFADE_MS from now); after it, a short fade of its own.
   */
  rebase(shown: GradeParams | null, nowMs: number): void {
    if (this.holding || !shown) return;
    const left = this.from ? this.t0 + this.ms - nowMs : 0;
    this.from = shown;
    this.t0 = nowMs;
    this.ms = Math.max(LOCK_REFADE_MS, left);
  }

  /** No lock after all (unlocked, a profile that found nothing to lock): the hold ends, nothing fades. */
  release(): void {
    this.holding = false;
    this.held = null;
    this.from = null;
  }

  /** Ends a running fade at once (an export starts, the engine resets): the lock is in force whole. A hold stays, without its estimate. */
  settle(): void {
    this.from = null;
    this.held = null;
  }

  /** Share of the lock in force at `nowMs`: 0 at the handover, 1 from LOCK_FADE_MS on (and whenever nothing fades). */
  weight(nowMs: number): number {
    if (!this.from) return 1;
    const x = Math.min(1, Math.max(0, (nowMs - this.t0) / this.ms));
    return x * x * (3 - 2 * x);
  }

  /** True until the lock has been shown whole: while a crossfade runs, and after it until `globals` was next asked (the last repaint lands on the lock itself). */
  get pending(): boolean {
    return this.from !== null;
  }

  /** True while a crossfade is running (the picture needs repainting although nothing else changes). */
  fading(nowMs: number): boolean {
    return this.from !== null && nowMs - this.t0 < this.ms;
  }

  /**
   * The globals in force at `nowMs`: the clip lock's (`locked`: the estimate at the clip time, null when unlocked)
   * through the crossfade; without a lock, the held provisional grade (null: none, the frame's own estimate rules).
   */
  globals(locked: GradeParams | null, nowMs: number): GradeParams | null {
    if (!locked) return this.holding ? this.held : null;
    if (!this.from) return locked;
    if (nowMs - this.t0 >= this.ms) {
      this.from = null;
      return locked;
    }
    return lerpParams(this.from, locked, this.weight(nowMs));
  }
}
