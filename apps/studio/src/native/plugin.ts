// Contract of the `DiveNative` Capacitor plugin implemented by the native
// shells in apps/mobile (iOS: ios/App/App/DiveNativePlugin.swift + the
// DiveExport Swift package; Android: android/app/src/main/java/app/deepfix/dive/
// export/). See apps/mobile/MOBILE.md for the design.
//
// Frames never cross the Capacitor bridge (JSON / base64): the plugin runs a
// loopback HTTP endpoint (127.0.0.1, random port, per-launch token) and the
// web side POSTs raw pixels to it. Control calls (start / finish / cancel,
// picking, saving) use the bridge.

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** Pixel layouts the native encoders accept: 8-bit, 4 bytes per pixel, tightly packed rows, top row first. */
export type PixelFormat = "RGBA" | "RGBX" | "BGRA" | "BGRX";

export type NativeFile = {
  /** Absolute filesystem path inside the app sandbox. */
  path: string;
  name: string;
  mime: string;
  size: number;
};

export type NativeInfo = {
  platform: "ios" | "android";
  osVersion: string;
  /** Hardware encoders available for the output codecs. */
  encoders: { avc: boolean; hevc: boolean };
  /**
   * What keeps an export alive when the app is backgrounded:
   * iOS 26+ BGContinuedProcessingTask (with or without background GPU),
   * the ~30 s UIApplication background task on older iOS, or an Android
   * foreground service.
   */
  background: "continued-processing-gpu" | "continued-processing" | "background-task" | "foreground-service";
  frameFormats: PixelFormat[];
  /** Loopback endpoint for frame and file uploads, e.g. http://127.0.0.1:53123 */
  endpoint: string;
  token: string;
};

export type StartExportOptions = {
  /** Output (display) size; odd sizes are rounded down to even by the encoder. */
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: "avc" | "hevc";
  /** Seconds between key frames. */
  keyFrameIntervalSec?: number;
  /** Clip length, for progress (native side derives progress from frame timestamps). */
  durationSec: number;
  /**
   * Audio passthrough: the source file the native muxer copies the audio
   * track from (packets as they are, no re-encode). `shiftSec` is the source
   * time of the first video frame: frame timestamps posted to the encoder are
   * relative to it, and the audio is shifted by the same amount.
   */
  audio: { path: string; shiftSec: number } | null;
  /** Shown in the iOS Live Activity / Android notification. */
  title: string;
  subtitle?: string;
  /** File name of the output (in the app's cache / exports folder). */
  outputName: string;
};

export type StartExportResult = {
  id: string;
  /** POST frames to `${endpoint}/export/${id}/frame?...` (see NativeFrameSink). */
  endpoint: string;
  token: string;
  /** Frames the web side may have in flight (1: one POST at a time keeps order on one connection). */
  maxInFlight: number;
};

export type ExportOutput = NativeFile & {
  frames: number;
  durationSec: number;
  audioIncluded: boolean;
  elapsedMs: number;
};

export type ExportStateEvent = {
  id: string;
  /**
   * background-granted: iOS started the continued-processing task (Live Activity shown) or the
   *   Android foreground service is up.
   * background-expired: the system (or the user, from the Live Activity) stopped it; the web side
   *   should cancel or wait for the app to return.
   * paused / resumed: the app left / returned to the foreground while an export ran.
   */
  state: "background-granted" | "background-denied" | "background-expired" | "paused" | "resumed" | "cancelled-by-user";
  message?: string;
};

export type ExportProgressEvent = { id: string; frames: number; progress: number };

export interface DiveNativePlugin {
  getInfo(): Promise<NativeInfo>;
  /** Photos (PHPicker / Android Photo Picker, originals, no transcode) or Files. Resolves with no files when dismissed. */
  pickMedia(options: { source: "photos" | "files"; kinds?: ("video" | "image")[] }): Promise<{ files: NativeFile[] }>;
  startExport(options: StartExportOptions): Promise<StartExportResult>;
  /**
   * Bridge fallback for one frame (pixels base64 in JSON). Several times
   * slower than the loopback POST; used only when the page can't reach the
   * endpoint (e.g. if a WebView treats it as blocked mixed content).
   */
  appendFrame(options: { id: string; seq: number; pts: number; dur: number; fmt: PixelFormat; w: number; h: number; data: string }): Promise<void>;
  /** Flushes the encoder, waits for the audio copy, closes the file. */
  finishExport(options: { id: string }): Promise<ExportOutput>;
  cancelExport(options: { id: string }): Promise<void>;
  /** Optional status text for the Live Activity / notification (e.g. "Profiling colour"). */
  setExportStatus(options: { id: string; subtitle?: string; progress?: number }): Promise<void>;
  /** Adds a video or photo file to the Photos library / gallery (album = the app name). */
  saveToGallery(options: { path: string; kind: "video" | "photo"; album?: string }): Promise<{ saved: boolean }>;
  /** Writes a small file from base64 (fallback for blobToNativeFile when the loopback endpoint is unreachable). */
  writeFile(options: { name: string; mime: string; data: string }): Promise<NativeFile>;
  /** Deletes a file this app wrote (imports, exports). */
  removeFile(options: { path: string }): Promise<void>;
  addListener(event: "exportState", fn: (e: ExportStateEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: "exportProgress", fn: (e: ExportProgressEvent) => void): Promise<PluginListenerHandle>;
}

export const DiveNative = registerPlugin<DiveNativePlugin>("DiveNative");
