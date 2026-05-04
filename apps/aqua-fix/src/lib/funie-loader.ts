// Lazy loader for FUnIE-GAN ONNX (underwater image enhancement, Islam et al.
// 2020 RAL — https://arxiv.org/abs/1903.09766). Mirrors opencv-loader: fetch
// with progress, build an ort session once, cache for the rest of the
// session. The onnxruntime-web import is dynamic so the ~25 MB wasm only
// downloads when the user actually enables AI mode.

import type * as ortType from "onnxruntime-web";

export const FUNIE_SIZE_MB = 16.9;
const FUNIE_URL = `${import.meta.env.BASE_URL}funie.onnx`;

let session: ortType.InferenceSession | null = null;
let loadingPromise: Promise<ortType.InferenceSession> | null = null;

export function isFunieReady(): boolean {
  return session !== null;
}

export function getFunieSession(): ortType.InferenceSession {
  if (!session) throw new Error("FUnIE session not loaded — call loadFunie first");
  return session;
}

export async function loadFunie(
  onProgress?: (pct: number) => void,
): Promise<ortType.InferenceSession> {
  if (session) return session;
  if (loadingPromise) return loadingPromise;
  loadingPromise = doLoad(onProgress);
  return loadingPromise;
}

const MODEL_CACHE = "aqua-fix-models-v1";

async function buildSession(
  ort: typeof ortType,
  bytes: Uint8Array,
): Promise<ortType.InferenceSession> {
  // Try WebGPU first (fast), fall back to WASM.
  try {
    return await ort.InferenceSession.create(bytes, {
      executionProviders: ["webgpu", "wasm"],
    });
  } catch {
    return await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
  }
}

async function doLoad(onProgress?: (pct: number) => void): Promise<ortType.InferenceSession> {
  const ort = await import("onnxruntime-web");

  // Cache-first: a 17 MB model shouldn't re-download on every page load.
  // The site-wide service worker is network-first to avoid stale JS, so
  // we manage this big asset ourselves via the Cache API. Survives page
  // refreshes and works offline once cached.
  let cache: Cache | null = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const cached = await cache.match(FUNIE_URL);
    if (cached && cached.ok) {
      const buf = await cached.arrayBuffer();
      const bytes = new Uint8Array(buf);
      session = await buildSession(ort, bytes);
      if (onProgress) onProgress(1);
      return session;
    }
  } catch {
    // Cache API unavailable (private mode, old browser) — fall through
    // to the network path. Every visit will re-download but the app
    // still works.
    cache = null;
  }

  const res = await fetch(FUNIE_URL);
  if (!res.ok) throw new Error(`Failed to fetch FUnIE model: HTTP ${res.status}`);
  // GitHub Pages serves the ONNX gzip-compressed in transit, so
  // Content-Length is the *compressed* wire size — but each chunk we
  // receive is already decoded. That makes received/total exceed 1.
  // Use the known model size as an authoritative ceiling, and clamp
  // the displayed progress to [0, 1] in either case.
  const knownBytes = Math.round(FUNIE_SIZE_MB * 1024 * 1024);
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
  const total2 = chunks.reduce((n, c) => n + c.length, 0);
  const bytes = new Uint8Array(total2);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }

  // Stash the downloaded bytes in the cache for the next visit. Build a
  // fresh Response from the bytes (the original res.body is already
  // consumed by the streaming reader above).
  if (cache) {
    try {
      const arr = new Uint8Array(bytes);
      const stored = new Response(arr, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(arr.length),
        },
      });
      await cache.put(FUNIE_URL, stored);
    } catch {
      // Quota or any other write failure — non-fatal, the user just
      // re-downloads next time.
    }
  }

  session = await buildSession(ort, bytes);
  if (onProgress) onProgress(1);
  return session;
}
