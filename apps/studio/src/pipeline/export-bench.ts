// A first export has no speed on file for this device (studio.ts EXPORT_SPEED_KEY is written after one), and the
// first export is when "how long will this take?" matters most. So when the export sheet opens without one, a short
// test (well under a second on a phone's GPU) grades the frame on screen again, captures it and encodes it with the
// device's own H.264 encoder, a few times over, at up to 720p. That is most of an export's work per frame but not
// all of it (no decode, no analysis), so the estimate takes a share of the measured pace and stays inside sane
// bounds; the sheet labels it a first guess, and the real speed replaces it after the first export.
// (An encode-only test missed by 12x on the devbox, where the software GPU's grade is 95% of an export: the grade
// has to be in the measurement.)

/** Share of the grade + capture + encode pace an export keeps once decoding and analysis are added. */
export const BENCH_SHARE = 0.7;
/** Megapixel-frames a second assumed when the test cannot run (no WebCodecs encoder): about 7 fps at 1080p on a phone. */
export const DEFAULT_MPXS = { mobile: 14, desktop: 36 } as const;
const MIN_MPXS = 0.5, MAX_MPXS = 150;

/**
 * The export speed to assume before this device has exported anything, megapixel-frames a second: a share of what
 * the test measured, or a cautious default by kind of device.
 */
export function firstExportSpeed(benchMpxs: number | null, mobile: boolean): number {
  if (benchMpxs === null || !(benchMpxs > 0) || !Number.isFinite(benchMpxs)) return mobile ? DEFAULT_MPXS.mobile : DEFAULT_MPXS.desktop;
  return Math.min(MAX_MPXS, Math.max(MIN_MPXS, benchMpxs * BENCH_SHARE));
}

/** "about 25 s" / "about 3 min": a duration for the export sheet, rounded the way a guess should be. */
export function aboutDuration(sec: number): string {
  return sec < 90 ? `about ${Math.max(5, Math.round(sec / 5) * 5)} s` : `about ${Math.round(sec / 60)} min`;
}

/**
 * Per frame: `render()` (the engine grades the frame it holds into `src`, the preview canvas, again), then `src` is
 * captured and encoded at up to 720p. Megapixel-frames a second, or null where it cannot run (no VideoEncoder, no
 * supported H.264 config, an encoder error, `alive()` false: an export started). The grade runs at the preview's
 * size and is charged to the (never larger) encoded size, so the pace errs on the slow side. Stops after `budgetMs`.
 */
export async function benchExport(src: CanvasImageSource, srcW: number, srcH: number, render: () => void, alive: () => boolean, budgetMs = 700): Promise<number | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined" || !(srcW > 0 && srcH > 0)) return null;
  const k = Math.min(1, 1280 / Math.max(srcW, srcH));
  const w = Math.max(64, Math.round((srcW * k) / 2) * 2), h = Math.max(64, Math.round((srcH * k) / 2) * 2);
  const config: VideoEncoderConfig = { codec: "avc1.42001f", width: w, height: h, bitrate: 6_000_000, framerate: 30 };
  let enc: VideoEncoder | null = null;
  try {
    if (!(await VideoEncoder.isConfigSupported(config)).supported) return null;
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const g = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!g) return null;
    let failed = false;
    enc = new VideoEncoder({ output: () => undefined, error: () => { failed = true; } });
    enc.configure(config);
    const frame = async (i: number) => {
      if (!alive()) { failed = true; return; }
      render();
      g.drawImage(src, 0, 0, w, h);
      // A strip that moves, so no frame is a copy of the last (an encoder skips those for free).
      g.fillStyle = `rgb(${(i * 37) % 255}, 90, 120)`;
      g.fillRect((i * 53) % w, 0, 24, h);
      const f = new VideoFrame(canvas as unknown as CanvasImageSource, { timestamp: i * 33_333 });
      enc!.encode(f, { keyFrame: i === 0 });
      f.close();
      await enc!.flush();
    };
    await frame(0); // the encoder starting up is not the pace
    if (failed) return null;
    const t0 = performance.now();
    let n = 0;
    while (n < 8 && performance.now() - t0 < budgetMs && !failed) { await frame(n + 1); if (!failed) n++; }
    const ms = performance.now() - t0;
    if (failed || n === 0 || !(ms > 0)) return null;
    return (n * w * h) / 1e6 / (ms / 1000);
  } catch {
    return null;
  } finally {
    try { enc?.close(); } catch { /* already closed */ }
  }
}
