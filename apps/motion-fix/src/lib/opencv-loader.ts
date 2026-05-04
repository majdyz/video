// Lazy loader for OpenCV.js. Fetches the script via fetch() so we can show a
// download progress bar to the user (the alternative — appending a <script>
// tag — gives no progress info on most browsers).
//
// Caches in the browser HTTP cache + service worker after first download;
// subsequent loads are instant.

const OPENCV_URL =
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
export const OPENCV_SIZE_MB = 8.6;

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

export async function loadOpenCV(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (isOpenCVReady()) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = doLoad(onProgress);
  return loadingPromise;
}

async function doLoad(onProgress?: (pct: number) => void): Promise<void> {
  const res = await fetch(OPENCV_URL);
  if (!res.ok) throw new Error(`Failed to fetch OpenCV.js: HTTP ${res.status}`);
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
        else onProgress(Math.min(0.95, received / (OPENCV_SIZE_MB * 1024 * 1024)));
      }
    }
  }
  if (onProgress) onProgress(1);

  const blob = new Blob(chunks as BlobPart[], { type: "text/javascript" });
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
        resolve();
        return;
      }
      // Module not yet initialised — wait for runtime.
      let timer: number | null = null;
      const done = () => {
        if (timer !== null) clearInterval(timer);
        if (isOpenCVReady()) resolve();
        else reject(new Error("OpenCV.js failed to initialise"));
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
