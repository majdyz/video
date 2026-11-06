// Batch: several photos and videos opened at once, exported strictly one at a
// time with the same settings (each file still gets its own colour analysis)
// and saved together: one share sheet per group where the browser shares files
// (iPhone: "Save N Images"), else a ZIP download (or file by file when large).

import { isPhotoFile } from "./photo.ts";
import { crc32Blob, zipStore } from "./zip.ts";

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|mts|insv|lrv)$/i;

/** A multi-select / drop split into what a batch takes (photos and videos, in order) and what it leaves out. */
export function splitBatch(files: readonly File[]): { media: File[]; skipped: number } {
  const media = files.filter((f) => isPhotoFile(f) || f.type.startsWith("video/") || VIDEO_EXT.test(f.name));
  return { media, skipped: files.length - media.length };
}

/** Output names made unique ("a.jpg", "a (2).jpg"): two cameras can both write IMG_0001. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    if (k === 1) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)} (${k})${n.slice(dot)}` : `${n} (${k})`;
  });
}

/**
 * Groups for the share sheet: at most `maxFiles` photos and `maxBytes` per
 * call (iOS shares 10 at a time reliably; a call over ~100 MB can fail to
 * open). A single photo over the byte cap gets a group of its own.
 */
export function shareGroups<T extends { size: number }>(items: readonly T[], maxFiles = 10, maxBytes = 90e6): T[][] {
  const out: T[][] = [];
  let cur: T[] = [], bytes = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= maxFiles || bytes + it.size > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(it);
    bytes += it.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

export type BatchKind = "photo" | "video";

/** A finished file of a batch: in page memory (web), or in the app sandbox (native video export). */
export type BatchOutput = { name: string; kind: BatchKind; blob: Blob | null; native: unknown; size: number; mime: string; width: number; height: number };

/** ZIP of the outputs (CRCs streamed: a video is never read into memory whole). */
export async function batchZip(outputs: readonly BatchOutput[]): Promise<Blob> {
  const withBlob = outputs.filter((o): o is BatchOutput & { blob: Blob } => !!o.blob);
  const names = uniqueNames(withBlob.map((o) => o.name));
  const entries = [];
  for (let i = 0; i < withBlob.length; i++) entries.push({ name: names[i], data: withBlob[i].blob, crc: await crc32Blob(withBlob[i].blob) });
  return zipStore(entries);
}

/** Largest ZIP offered (a stored ZIP is the files' size; browsers hold a few GB of file-backed Blobs, not more). */
export const ZIP_MAX_BYTES = 2e9;

/** Files for navigator.share, with unique names. */
export function batchFiles(outputs: readonly BatchOutput[]): File[] {
  const names = uniqueNames(outputs.map((o) => o.name));
  return outputs.flatMap((o, i) => (o.blob ? [new File([o.blob], names[i], { type: o.mime })] : []));
}

/** Photo or video (what the batch opens it as). */
export function kindOf(f: File): BatchKind {
  return isPhotoFile(f) ? "photo" : "video";
}

/** Whether this browser's share sheet takes several JPEG files (iPhone / Android; not most desktops). */
export function canShareJpegs(): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    const f = () => new File([new Blob()], "x.jpg", { type: "image/jpeg" });
    return typeof nav.share === "function" && !!nav.canShare?.({ files: [f(), f()] });
  } catch {
    return false;
  }
}
