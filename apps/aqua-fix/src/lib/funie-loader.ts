// Lazy loader for FUnIE-GAN ONNX (Islam et al. 2020 RAL —
// https://arxiv.org/abs/1903.09766). Fetches via the shared cachedFetch
// helper so the ~17 MB model downloads once and lives in Cache API
// across page refreshes.

import type * as ortType from "onnxruntime-web";
import { cachedFetch, isInCache } from "@dive-tools/shared";

export const FUNIE_SIZE_MB = 16.9;
const FUNIE_URL = `${import.meta.env.BASE_URL}funie.onnx`;
const MODEL_CACHE = "aqua-fix-models-v1";

let session: ortType.InferenceSession | null = null;
let loadingPromise: Promise<ortType.InferenceSession> | null = null;

export function isFunieReady(): boolean {
  return session !== null;
}

export function getFunieSession(): ortType.InferenceSession {
  if (!session) throw new Error("FUnIE session not loaded — call loadFunie first");
  return session;
}

export function isFunieCached(): Promise<boolean> {
  return isInCache(MODEL_CACHE, FUNIE_URL);
}

export async function loadFunie(
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<ortType.InferenceSession> {
  if (session) return session;
  if (loadingPromise) return loadingPromise;
  loadingPromise = doLoad(onProgress, signal).catch((e) => {
    // Clear the in-flight promise on any failure (including abort) so a
    // subsequent click can start a fresh load instead of being handed
    // the same rejected promise.
    loadingPromise = null;
    throw e;
  });
  return loadingPromise;
}

async function doLoad(
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<ortType.InferenceSession> {
  const ort = await import("onnxruntime-web");
  const bytes = await cachedFetch(
    FUNIE_URL,
    Math.round(FUNIE_SIZE_MB * 1024 * 1024),
    MODEL_CACHE,
    onProgress,
    signal,
  );

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
