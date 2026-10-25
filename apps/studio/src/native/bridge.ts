// Native shell helpers (lazy chunk: only imported inside the Capacitor app).
//
// * pickNativeFile: originals from Photos / Files through the plugin (an
//   <input type=file> on iOS hands over a transcoded copy of Photos videos and
//   drops the GoPro/DJI telemetry tracks Stabilise needs).
// * NativeFrameSink: rendered frames -> native encoder over loopback HTTP.
// * saveOutput / shareOutput: Photos / gallery and the system share sheet.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { DiveNative, type ExportOutput, type NativeFile, type NativeInfo, type PixelFormat, type StartExportOptions, type StartExportResult } from "./plugin.ts";
import { rememberNativeFile } from "./registry.ts";

export { DiveNative };
export type { ExportOutput, NativeFile, NativeInfo, StartExportOptions };

let infoP: Promise<NativeInfo> | null = null;
export function nativeInfo(): Promise<NativeInfo> {
  infoP ??= DiveNative.getInfo();
  return infoP;
}

let reachP: Promise<boolean> | null = null;
/**
 * Whether the page may talk to the loopback endpoint. Android's
 * https://localhost may (127.0.0.1 is a trustworthy origin in Chromium,
 * verified headless); whether WKWebView treats capacitor://localhost →
 * http://127.0.0.1 as blocked mixed content is to be confirmed on a device
 * (desktop WebKit blocks it from https pages). If not, frames go over the
 * bridge (slow but working).
 */
export function loopbackReachable(): Promise<boolean> {
  reachP ??= (async () => {
    const info = await nativeInfo();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch(`${info.endpoint}/ping?token=${info.token}`, { signal: ctrl.signal, cache: "no-store" });
      return res.ok;
    } catch (e) {
      console.warn("[native] loopback endpoint unreachable, using the bridge for frames", e);
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();
  return reachP;
}

/** Base64 of a byte array, in chunks (String.fromCharCode has an argument limit). */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(bin);
}

/** URL the WebView can load a sandbox file from (capacitor://localhost/_capacitor_file_/… or https://localhost/_capacitor_file_/…). */
export function webPathOf(path: string): string {
  return Capacitor.convertFileSrc(path);
}

/**
 * Opens the native picker and returns the pick as a File the Studio can use
 * unchanged (mediabunny, <video>). The native path is remembered for the
 * native exporter's audio passthrough.
 *
 * Memory: the File is built from a fetch of the sandbox copy, which the
 * WebView may hold in memory (WebKit) or page to disk (Chromium blob store).
 * See MOBILE.md "Risks" for the streaming follow-up.
 */
export async function pickNativeFile(source: "photos" | "files"): Promise<File | null> {
  const { files } = await DiveNative.pickMedia({ source, kinds: ["video", "image"] });
  const f = files[0];
  if (!f) return null;
  const res = await fetch(webPathOf(f.path));
  if (!res.ok) throw new Error(`Could not read the picked file (${res.status})`);
  const blob = await res.blob();
  const file = new File([blob], f.name, { type: f.mime || blob.type, lastModified: Date.now() });
  rememberNativeFile(file, f);
  return file;
}

/** Uploads a Blob made on the web side (photo JPEG, web-path export) into the sandbox so it can be saved or shared. */
export async function blobToNativeFile(blob: Blob, name: string): Promise<NativeFile> {
  const info = await nativeInfo();
  if (!(await loopbackReachable())) {
    return DiveNative.writeFile({ name, mime: blob.type || "application/octet-stream", data: toBase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  const q = new URLSearchParams({ token: info.token, name, mime: blob.type || "application/octet-stream" });
  const res = await fetch(`${info.endpoint}/file?${q}`, { method: "POST", body: blob, headers: { "content-type": "text/plain" } });
  if (!res.ok) throw new Error(`Saving failed: ${await res.text().catch(() => res.status)}`);
  return (await res.json()) as NativeFile;
}

export async function saveOutput(file: NativeFile, kind: "video" | "photo", album: string): Promise<boolean> {
  const { saved } = await DiveNative.saveToGallery({ path: file.path, kind, album });
  return saved;
}

export async function shareOutput(file: NativeFile, title: string): Promise<void> {
  // Share takes file:// URLs; the plugin returns plain paths.
  const url = file.path.startsWith("file://") ? file.path : `file://${file.path}`;
  await Share.share({ title, files: [url] });
}

// ------------------------------------------------------------ frame sink

const NATIVE_FORMATS: readonly string[] = ["RGBA", "RGBX", "BGRA", "BGRX"];

type Pixels = { data: Uint8Array<ArrayBuffer>; format: PixelFormat; width: number; height: number };

/**
 * Reads a rendered frame's pixels as one of the formats the encoder takes.
 * Frames from the colour engine's readback path are already CPU-side
 * RGBX/BGRX (copyTo is a memcpy); canvas-backed frames are read back by the
 * browser here; anything else (YUV, unknown) goes through a 2D canvas.
 */
async function framePixels(frame: VideoFrame, reuse: Uint8Array<ArrayBuffer> | null): Promise<Pixels> {
  const rect = frame.visibleRect ?? { x: 0, y: 0, width: frame.codedWidth, height: frame.codedHeight };
  const width = rect.width, height = rect.height;
  const bytes = width * height * 4;
  const data = reuse && reuse.byteLength === bytes ? reuse : new Uint8Array(bytes);
  const layout = [{ offset: 0, stride: width * 4 }];
  const fmt = frame.format;
  if (fmt && NATIVE_FORMATS.includes(fmt)) {
    await frame.copyTo(data, { rect, layout });
    return { data, format: fmt as PixelFormat, width, height };
  }
  try {
    // WebCodecs RGB conversion on copy (Chromium 127+, not every WebKit).
    await frame.copyTo(data, { rect, layout, format: "RGBA" } as VideoFrameCopyToOptions);
    return { data, format: "RGBA", width, height };
  } catch {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("No 2D canvas for frame readback");
    ctx.drawImage(frame, 0, 0, width, height);
    data.set(ctx.getImageData(0, 0, width, height).data);
    return { data, format: "RGBA", width, height };
  }
}

/**
 * Streams frames to the native encoder. One POST in flight at a time (frames
 * arrive in order on one keep-alive connection) while the caller already
 * renders the next frame; the POST resolves once the encoder has taken the
 * frame, which is the backpressure.
 */
export class NativeFrameSink {
  private seq = 0;
  /** loopback: raw POSTs; bridge: base64 through Capacitor (fallback). */
  readonly transport: "loopback" | "bridge";
  private prev: Promise<void> = Promise.resolve();
  private error: unknown = null;
  private spare: Uint8Array<ArrayBuffer>[] = [];
  readonly session: StartExportResult;

  constructor(session: StartExportResult, transport: "loopback" | "bridge") {
    this.session = session;
    this.transport = transport;
  }

  /** Copies the frame's pixels (the caller may close it right after this resolves) and queues the upload. */
  async push(frame: VideoFrame, ptsUs: number, durationUs: number | undefined): Promise<void> {
    if (this.error) throw this.error;
    const px = await framePixels(frame, this.spare.pop() ?? null);
    const seq = this.seq++;
    const { endpoint, token, id } = this.session;
    const q = new URLSearchParams({ token, seq: String(seq), pts: String(Math.round(ptsUs)), dur: String(Math.round(durationUs ?? 0)), fmt: px.format, w: String(px.width), h: String(px.height) });
    const url = `${endpoint}/export/${encodeURIComponent(id)}/frame?${q}`;
    const before = this.prev;
    this.prev = (async () => {
      await before;
      if (this.error) return;
      try {
        if (this.transport === "bridge") {
          await DiveNative.appendFrame({ id, seq, pts: Math.round(ptsUs), dur: Math.round(durationUs ?? 0), fmt: px.format, w: px.width, h: px.height, data: toBase64(px.data) });
        } else {
          // A Blob body: Chromium uploads it ~10x faster than an ArrayBuffer
          // body (measured headless: 8 MB in 160 ms vs 1.6 s). text/plain
          // keeps it a CORS "simple request": no preflight per frame.
          const res = await fetch(url, { method: "POST", body: new Blob([px.data]), headers: { "content-type": "text/plain" } });
          if (!res.ok) throw new Error(`Native encoder: ${(await res.text().catch(() => "")) || res.status}`);
        }
      } catch (e) {
        this.error = e;
      } finally {
        if (this.spare.length < 2) this.spare.push(px.data);
      }
    })();
    // Let at most one upload wait behind the one in flight.
    await before;
    if (this.error) throw this.error;
  }

  async flush(): Promise<void> {
    await this.prev;
    if (this.error) throw this.error;
  }
}
