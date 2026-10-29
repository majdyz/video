// Per-stage timing of an export, for a debug line in the export sheet
// (?debug=1) and the console, so a slow export on a phone can be reported
// with numbers. Stages overlap (renders and readbacks are pipelined, workers
// run beside the main thread), so the shares are of the wall time and need
// not add up to 100 %.

export type ExportStage =
  | "prepass"
  | "decode"
  | "geometry"
  | "analysisWait"
  | "analysisWorker"
  | "person"
  | "upload"
  | "temporal"
  | "render"
  | "readback"
  | "encode"
  | "storage"
  | "mux"
  | "ui";

const LABELS: Record<ExportStage, string> = {
  prepass: "analyse-first",
  decode: "decode",
  geometry: "geometry",
  analysisWait: "analysis wait",
  analysisWorker: "analysis worker",
  person: "person worker",
  upload: "upload",
  temporal: "temporal",
  render: "render",
  readback: "readback",
  encode: "encode",
  storage: "storage",
  mux: "mux",
  ui: "ui",
};

export class ExportProfile {
  readonly ms: Record<ExportStage, number> = { prepass: 0, decode: 0, geometry: 0, analysisWait: 0, analysisWorker: 0, person: 0, upload: 0, temporal: 0, render: 0, readback: 0, encode: 0, storage: 0, mux: 0, ui: 0 };
  frames = 0;
  analyses = 0;
  /** Of the analysis wait and the analyse-first pass: reading analysis thumbnails back from the GPU (ms). */
  thumbReadbackMs = 0;
  /** Finer timings for the log (ms), e.g. the parts of the analysis wait. */
  extra: Record<string, number> = {};
  private started = performance.now();
  private endedAt: number | null = null;
  pausedMs = 0;

  /** Restarts the wall clock (the export loop proper starts after its preparations). */
  start(): void {
    this.started = performance.now();
    this.endedAt = null;
  }

  end(): void {
    this.endedAt = performance.now();
  }

  add(stage: ExportStage, ms: number): void {
    if (ms > 0) this.ms[stage] += ms;
  }

  /** Times a synchronous or async step into `stage`. */
  time<T>(stage: ExportStage, f: () => T): T {
    const t0 = performance.now();
    const r = f();
    if (r instanceof Promise) return r.finally(() => this.add(stage, performance.now() - t0)) as T;
    this.add(stage, performance.now() - t0);
    return r;
  }

  wallMs(): number {
    return Math.max(1, (this.endedAt ?? performance.now()) - this.started - this.pausedMs);
  }

  fps(): number {
    return this.frames / (this.wallMs() / 1000);
  }

  /** "decode 12% · analysis wait 41% · …, 4.3 fps" (stages under 0.5 % left out). */
  summary(): string {
    const wall = this.wallMs();
    const parts = (Object.keys(this.ms) as ExportStage[])
      .filter((k) => this.ms[k] / wall >= 0.005)
      .sort((a, b) => this.ms[b] - this.ms[a])
      .map((k) => `${LABELS[k]} ${Math.round((this.ms[k] / wall) * 100)}%`);
    return `${parts.join(" · ")}, ${this.fps().toFixed(2)} fps (${this.frames} frames, ${this.analyses} analyses, ${(wall / 1000).toFixed(1)} s)`;
  }

  /** Milliseconds per stage, for logs and tests. */
  table(): Record<string, number> {
    const out: Record<string, number> = { wall: Math.round(this.wallMs()) };
    for (const k of Object.keys(this.ms) as ExportStage[]) out[k] = Math.round(this.ms[k]);
    if (this.thumbReadbackMs) out.thumbReadback = Math.round(this.thumbReadbackMs);
    for (const [k, v] of Object.entries(this.extra)) out[k] = Math.round(v);
    return out;
  }
}
