// The export's one progress bar. An export is several stages, each with a progress of its own that starts at 0 (the
// AI subject pass, the motion analysis, the render; and the render starts over when it changes mode: offline handing
// over to the real-time recorder, the recorder restarting at a slower speed, or back to offline). Shown raw, the bar
// went back to 0 at every one of them, which reads as the export failing and retrying. Here each stage gets a share
// of what is left of the bar, and the bar never goes backwards. Pure (tested in test/export-policy.test.ts).

/** Shares of what is left of the bar when the stage begins (the render takes the rest). */
/** subjectsWait: an AI pass that is about to finish when the export starts is given a few seconds (seg/export-use.ts). */
export const EXPORT_SHARE = { water: 0.05, subjects: 0.3, subjectsWait: 0.05, motion: 0.05 };

const clamp = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export class ExportBar {
  private shown = 0;
  private lo = 0;
  private hi = 1;
  /** The stage's own progress at its first report: a stage joined part-way (a pass already at 80%, a resumed
   * render) fills its share with the work that is left. */
  private from: number | null = null;

  /** What the bar shows (0..1). */
  get value(): number {
    return this.shown;
  }

  /** A new stage: `share` of what is left of the bar (1: all of it). Its own progress starts over; the bar stays. */
  stage(share = 1): void {
    this.lo = this.shown;
    this.hi = this.shown + clamp(share) * (1 - this.shown);
    this.from = null;
  }

  /** The current stage's own progress (0..1) → the bar. */
  at(p: number): number {
    const q = clamp(p);
    // (A stage whose progress drops below where it began, its total having grown, has that much more left.)
    if (this.from === null || q < this.from) this.from = q;
    const f = this.from < 1 ? (q - this.from) / (1 - this.from) : 1;
    this.shown = Math.max(this.shown, this.lo + clamp(f) * (this.hi - this.lo));
    return this.shown;
  }

  /** The current stage is over: the bar is at the end of its share. */
  done(): number {
    this.shown = Math.max(this.shown, this.hi);
    return this.shown;
  }
}
