// Lazy loader for OpenCV.js. Fetches via the shared cachedFetch helper so
// the ~9 MB script downloads once and lives in Cache API across page
// refreshes (jsdelivr's HTTP cache headers vary; Cache API gives us a
// guaranteed sticky copy). After download the bytes are wrapped in a Blob
// + injected as a <script> so the global `cv` object becomes available.

import { cachedFetch, isInCache } from "@dive-tools/shared";

const OPENCV_URL =
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
export const OPENCV_SIZE_MB = 8.6;
const OPENCV_CACHE = "motion-fix-deps-v1";

declare global {
  interface Window {
    cv: unknown;
  }
}

let loadingPromise: Promise<void> | null = null;

type CvWithMat = { Mat?: unknown; onRuntimeInitialized?: () => void };

export function isOpenCVReady(): boolean {
  const cv = window.cv as CvWithMat | undefined;
  return !!cv && !!cv.Mat;
}

export function isOpenCVCached(): Promise<boolean> {
  return isInCache(OPENCV_CACHE, OPENCV_URL);
}

export async function loadOpenCV(
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (isOpenCVReady()) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = doLoad(onProgress, signal).catch((e) => {
    loadingPromise = null;
    throw e;
  });
  return loadingPromise;
}

async function doLoad(
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const bytes = await cachedFetch(
    OPENCV_URL,
    Math.round(OPENCV_SIZE_MB * 1024 * 1024),
    OPENCV_CACHE,
    onProgress,
    signal,
  );

  const blob = new Blob([bytes as BlobPart], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      const cv = window.cv as CvWithMat | undefined;
      if (!cv) {
        reject(new Error("OpenCV.js loaded but cv global is missing"));
        return;
      }
      if (cv.Mat) {
        if (onProgress) onProgress(1);
        resolve();
        return;
      }
      // Module not yet initialised — wait for runtime.
      let timer: number | null = null;
      const done = () => {
        if (timer !== null) clearInterval(timer);
        if (isOpenCVReady()) {
          if (onProgress) onProgress(1);
          resolve();
        } else {
          reject(new Error("OpenCV.js failed to initialise"));
        }
      };
      cv.onRuntimeInitialized = done;
      timer = window.setInterval(() => {
        if (isOpenCVReady()) done();
      }, 50);
      // Hard timeout so a broken load doesn't hang the UI forever.
      setTimeout(() => {
        if (!isOpenCVReady()) {
          if (timer !== null) clearInterval(timer);
          reject(new Error("OpenCV.js timed out initialising"));
        }
      }, 30_000);
    };
    script.onerror = () => reject(new Error("Failed to load OpenCV.js script"));
    document.head.appendChild(script);
  });
}
