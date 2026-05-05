// Shared loader for big lazy-fetched assets (ML models, OpenCV.js, etc.).
// One implementation, two use cases:
//   aqua-fix:  ~17 MB ONNX model      → bytes → ort.InferenceSession
//   motion-fix: ~9 MB opencv.js       → bytes → Blob → <script> tag
//
// Handles, in order:
//  1. Cache API lookup (per-asset cache name) so the bytes survive page
//     refreshes and aren't subject to GitHub Pages's 10-minute
//     Cache-Control: max-age=600.
//  2. Streaming fetch with onProgress, clamped to <=99% during streaming
//     (Content-Length is the gzip-wire size when the server compresses,
//     so naive received/total drifts past 1.0). Caller bumps to 1.0
//     after the post-download work (session build, script eval).
//  3. Cache.put() of the assembled bytes, so the next visit skips the
//     network entirely.

export type Progress = (pct: number) => void;

// Thrown when the caller's AbortSignal fires mid-download. Treated as
// non-fatal by the consumer (they hide the dialog and reset state).
export class LoadAbortedError extends Error {
  constructor() {
    super("Aborted");
    this.name = "LoadAbortedError";
  }
}

export async function isInCache(cacheName: string, url: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(url);
    return !!hit && hit.ok;
  } catch {
    return false;
  }
}

// Fetch `url` with Cache-API persistence + chunked progress. `knownBytes`
// is used as the progress denominator if larger than the response's
// Content-Length (which is suspect when the server gzips in transit).
// `signal` cancels the in-flight fetch and rejects with LoadAbortedError;
// any partial bytes are discarded (nothing is written to the cache).
// Returns the assembled Uint8Array.
export async function cachedFetch(
  url: string,
  knownBytes: number,
  cacheName: string,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (signal?.aborted) throw new LoadAbortedError();
  let cache: Cache | null = null;
  try {
    cache = await caches.open(cacheName);
    const cached = await cache.match(url);
    if (cached && cached.ok) {
      const buf = await cached.arrayBuffer();
      if (onProgress) onProgress(0.99);
      return new Uint8Array(buf);
    }
  } catch {
    cache = null;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  // Guard against a misconfigured CDN returning an HTML error page
  // with a 200 status — caching that would poison the cache and
  // every subsequent visit would feed garbage bytes to ORT / the
  // OpenCV blob loader. Accept only opaque/binary/script content.
  const contentType = (res.headers.get("Content-Type") || "").toLowerCase();
  const isExpected =
    contentType === "" ||
    contentType.includes("octet-stream") ||
    contentType.includes("javascript") ||
    contentType.includes("wasm") ||
    contentType.includes("onnx") ||
    contentType.includes("application/");
  if (!isExpected) {
    throw new Error(`Unexpected response Content-Type: ${contentType}`);
  }
  const headerTotal = parseInt(res.headers.get("Content-Length") || "0", 10);
  const total = Math.max(headerTotal, knownBytes);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming not supported");

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        try { await reader.cancel(); } catch { /* ignore */ }
        throw new LoadAbortedError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (onProgress) onProgress(Math.min(0.99, received / total));
      }
    }
  } catch (e) {
    // fetch's own AbortError surfaces as DOMException name='AbortError'
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new LoadAbortedError();
    }
    throw e;
  }

  let totalBytes = 0;
  for (const c of chunks) totalBytes += c.length;
  const bytes = new Uint8Array(totalBytes);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }

  if (cache) {
    try {
      const stored = new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytes.length),
        },
      });
      await cache.put(url, stored);
    } catch {
      // Quota or other write failure — non-fatal, the user just
      // re-downloads next visit.
    }
  }

  return bytes;
}
