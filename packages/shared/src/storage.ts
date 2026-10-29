// Storage checks for exports: is there room for the output before the export
// starts, and keep the site's storage from being evicted mid-export.

/** Largest output the page may hold in memory when on-device storage fails or is missing (bytes). */
export const MEMORY_FALLBACK_BYTES = 256 * 1024 * 1024;

export class StorageSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageSpaceError";
  }
}

export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(n / 1e6))} MB`;
}

/** Output size estimate: video + audio bitrate over the length, plus 2% container overhead. */
export function estimateOutputBytes(videoBitrate: number, durationSec: number, audioBitrate = 256_000): number {
  return Math.ceil(((videoBitrate + audioBitrate) * Math.max(0, durationSec)) / 8 * 1.02 + 1_000_000);
}

export type StorageEstimate = { quota?: number; usage?: number };

export type StorageVerdict = {
  /** "storage": enough room on disk; "memory": not enough, but small enough for the page; "short": neither. */
  verdict: "storage" | "memory" | "short";
  freeBytes: number | null;
  neededBytes: number;
  message: string | null;
};

/**
 * Decides whether an export of `neededBytes` fits. `estimate` is
 * navigator.storage.estimate() (injectable for tests); an unknown quota
 * counts as enough (Safari before 17 has no estimate).
 */
export async function checkStorage(
  neededBytes: number,
  estimate: (() => Promise<StorageEstimate>) | null = typeof navigator !== "undefined" && navigator.storage?.estimate ? () => navigator.storage.estimate() : null,
  memoryLimit = MEMORY_FALLBACK_BYTES,
): Promise<StorageVerdict> {
  let free: number | null = null;
  try {
    const e = estimate ? await estimate() : null;
    if (e && typeof e.quota === "number" && e.quota > 0) free = Math.max(0, e.quota - (e.usage ?? 0));
  } catch {
    free = null;
  }
  // 10% + 50 MB headroom: the moov box, the file system's own overhead, other writes meanwhile.
  const want = neededBytes * 1.1 + 50e6;
  if (free === null || free >= want) return { verdict: "storage", freeBytes: free, neededBytes, message: null };
  if (neededBytes <= memoryLimit) return { verdict: "memory", freeBytes: free, neededBytes, message: null };
  return {
    verdict: "short",
    freeBytes: free,
    neededBytes,
    message: `Not enough free space to save this video: it needs about ${formatBytes(want)} and this browser can use ${formatBytes(free)} on this device. Free up some space (or export a shorter part, or at 1080p) and try again.`,
  };
}

let persistAsked = false;

/** Asks once per page for persistent storage, so the browser doesn't evict a half-written export under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    if (persistAsked) return false;
    persistAsked = true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
