// Browser capability checks the first-load bundle needs. They mirror
// packages/shared (codec-export.ts, realtime-export.ts) but live here so the
// main chunk doesn't share a module, and with it mediabunny, with the lazy
// media chunk.

export function isWebCodecsSupported(): boolean {
  return typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

/** True when the browser can record a canvas (MediaRecorder + captureStream). */
export function isRealtimeExportSupported(canvas: HTMLCanvasElement): boolean {
  return typeof MediaRecorder !== "undefined" && typeof (canvas as HTMLCanvasElement & { captureStream?: unknown }).captureStream === "function";
}

/** WebKit (Safari, every iOS browser): the only engine where the offline path is capture-bound. */
export function isWebKit(): boolean {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|CriOS|Chromium|Edg|Android/.test(ua);
}
