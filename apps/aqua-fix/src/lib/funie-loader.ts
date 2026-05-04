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

async function doLoad(onProgress?: (pct: number) => void): Promise<ortType.InferenceSession> {
  const ort = await import("onnxruntime-web");

  const res = await fetch(FUNIE_URL);
  if (!res.ok) throw new Error(`Failed to fetch FUnIE model: HTTP ${res.status}`);
  const total = parseInt(res.headers.get("Content-Length") || "0", 10);
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
      if (onProgress) {
        if (total > 0) onProgress(received / total);
        else onProgress(Math.min(0.95, received / (FUNIE_SIZE_MB * 1024 * 1024)));
      }
    }
  }
  const total2 = chunks.reduce((n, c) => n + c.length, 0);
  const bytes = new Uint8Array(total2);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }

  // Try WebGPU first (fast), fall back to WASM.
  try {
    session = await ort.InferenceSession.create(bytes, {
      executionProviders: ["webgpu", "wasm"],
    });
  } catch {
    session = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
  }
  if (onProgress) onProgress(1);
  return session;
}
