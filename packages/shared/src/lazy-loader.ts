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
// Returns the assembled Uint8Array.
export async function cachedFetch(
  url: string,
  knownBytes: number,
  cacheName: string,
  onProgress?: Progress,
): Promise<Uint8Array> {
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

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const headerTotal = parseInt(res.headers.get("Content-Length") || "0", 10);
  const total = Math.max(headerTotal, knownBytes);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming not supported");

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress(Math.min(0.99, received / total));
    }
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
