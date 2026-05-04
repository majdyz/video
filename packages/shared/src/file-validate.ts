// Validate a File object that came from a file-input pick. Catches the
// most common upload failures we've seen on iOS — specifically items
// from "Photos > Collections > Recently Saved" that haven't been
// downloaded from iCloud yet, which arrive as 0-byte placeholders.

export type FileValidation = { ok: true } | { ok: false; message: string };

const MIN_VIDEO_BYTES = 8 * 1024;  // ~8 KB; smaller is almost certainly a placeholder
const MIN_IMAGE_BYTES = 1024;

export function validateUploadedFile(file: File, kind: "image" | "video" | "any"): FileValidation {
  if (file.size === 0) {
    return {
      ok: false,
      message:
        "This file is empty — likely an iCloud item that hasn't been downloaded to this device yet. " +
        "Open it in Photos first to cache it locally, then try again.",
    };
  }
  if (kind === "video" && file.size < MIN_VIDEO_BYTES) {
    return {
      ok: false,
      message:
        "Video file is suspiciously small (" + file.size + " bytes). It may be an iCloud " +
        "placeholder — open it in Photos first to download the full file.",
    };
  }
  if (kind === "image" && file.size < MIN_IMAGE_BYTES) {
    return {
      ok: false,
      message:
        "Image file is suspiciously small. If it's an iCloud item, open it in Photos first to " +
        "download the full file.",
    };
  }
  return { ok: true };
}

// Touch the first byte of the file to coax iCloud into downloading it.
// Doesn't read the whole thing (would blow memory on 4K video); just
// enough to ensure subsequent <video>.src reads aren't waiting on the
// network. Failures are non-fatal — the caller's main load path will
// still surface real errors.
export async function touchFile(file: File): Promise<void> {
  try {
    await file.slice(0, 1).arrayBuffer();
  } catch {
    // ignore — iOS Photos sometimes throws on placeholder reads
  }
}
