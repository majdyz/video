// OpenCV.js-powered analyser. Drop-in replacement for the built-in
// block-matching analyser, sharing the AnalysisResult shape and the same
// downstream smoother + render pipeline.
//
// Uses cv.goodFeaturesToTrack (Shi-Tomasi corners) + cv.calcOpticalFlowPyrLK
// (pyramidal Lucas-Kanade) + cv.estimateAffinePartial2D (RANSAC similarity
// transform). This is the same recipe used by Premiere Warp Stabilizer's
// 'Subspace' fallback and most academic vision-only stabilisers.
//
// Versus our built-in tracker, the win is feature-based vs grid-based:
// goodFeaturesToTrack chooses high-information points (real corners), LK
// follows them across pyramid levels (handles large motion), and OpenCV's
// RANSAC is iteratively-reweighted for genuine robustness against
// independently-moving content.

import type { AnalysisResult } from "./stabilizer";

const ANALYSIS_W = 640;
const MAX_FEATURES = 220;
const REPLENISH_BELOW = 100;
const FEATURE_QUALITY = 0.01;
const MIN_FEATURE_DISTANCE = 8;
const RANSAC_THRESHOLD_PX = 1.5;
const MAX_FRAME_ROT = 0.09;
const MAX_FRAME_SCALE = 0.06;

type CV = {
  Mat: new (rows?: number, cols?: number, type?: number) => CvMat;
  Size: new (w: number, h: number) => unknown;
  TermCriteria: new (type: number, maxIter: number, epsilon: number) => unknown;
  matFromImageData: (data: ImageData) => CvMat;
  matFromArray: (rows: number, cols: number, type: number, data: number[]) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  goodFeaturesToTrack: (
    gray: CvMat, corners: CvMat, maxCorners: number, qualityLevel: number,
    minDistance: number, mask: CvMat, blockSize: number,
  ) => void;
  calcOpticalFlowPyrLK: (
    prev: CvMat, next: CvMat, prevPts: CvMat, nextPts: CvMat,
    status: CvMat, err: CvMat, winSize: unknown, maxLevel: number,
    criteria: unknown,
  ) => void;
  estimateAffinePartial2D: (
    src: CvMat, dst: CvMat, inliers: CvMat, method: number,
    ransacReprojThreshold: number,
  ) => CvMat;
  COLOR_RGBA2GRAY: number;
  CV_32FC2: number;
  RANSAC: number;
  TermCriteria_EPS: number;
  TermCriteria_COUNT: number;
};

type CvMat = {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32F: Float32Array;
  data64F: Float64Array;
  empty: () => boolean;
  clone: () => CvMat;
  delete: () => void;
};

type RvfcMetadata = { mediaTime?: number; presentedFrames?: number };
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: RvfcMetadata) => void) => number;
};

export async function analyzeVideoOpenCV(
  video: HTMLVideoElement,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const cv = window.cv as unknown as CV;
  if (!cv || !cv.Mat) throw new Error("OpenCV.js is not initialised");

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video has no usable duration");
  }
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) throw new Error("Video has no usable size");

  // Run the tracker at 640px wide. OpenCV's pyramid + LK is fast enough
  // that we don't need to go as small as the block-matching analyser.
  const aw = Math.min(ANALYSIS_W, srcW);
  const ah = Math.max(1, Math.round((srcH * aw) / srcW));
  const scaleBack = srcW / aw;

  const canvas = document.createElement("canvas");
  canvas.width = aw;
  canvas.height = ah;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (video.readyState < 2) {
    try { video.preload = "auto"; video.load(); } catch { /* ignore */ }
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onErr);
        clearTimeout(t);
        resolve();
      };
      const onErr = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onErr);
        clearTimeout(t);
        reject(new Error("Video decoder rejected the file (unsupported format)"));
      };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("error", onErr);
      const t = setTimeout(() => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onErr);
        reject(new Error("Video took too long to load — check the file format and connection"));
      }, 30000);
    });
  }

  const wasPaused = video.paused;
  const resumeAt = video.currentTime;
  const wasMuted = video.muted;
  const wasLoop = video.loop;
  const wasRate = video.playbackRate;
  video.muted = true;
  video.loop = false;
  try {
    // 1× instead of 2× — the decoder bottleneck under 2× would skip
    // source frames and produce sparse, jumpy residuals. See the
    // matching comment in stabilizer.ts.
    video.playbackRate = 1;
  } catch {
    // ignore
  }
  if (video.currentTime > 0.05) {
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = 0;
      } catch {
        resolve();
      }
      setTimeout(resolve, 2000);
    });
  }

  let prevGray: CvMat | null = null;
  let prevPts: CvMat | null = null;
  let mask: CvMat | null = null;
  // Hoist these once per analyse-call instead of allocating per frame —
  // OpenCV.js wraps each `new cv.Size`/`cv.TermCriteria` as a wasm
  // heap entry that doesn't auto-free, so per-frame alloc leaks
  // thousands of entries on long clips.
  const winSize = new cv.Size(15, 15);
  const lkCriteria = new cv.TermCriteria(
    cv.TermCriteria_EPS | cv.TermCriteria_COUNT, 10, 0.03,
  );
  // Persistent RGBA Mat sized once. matFromImageData allocates a fresh
  // wasm-heap buffer per frame (~aw*ah*4 bytes) — at 60 fps × 2× speed
  // analysis on a 5-minute clip that's ~36 GB of churn through GC.
  const persistentRgba = new cv.Mat(ah, aw, 24 /* CV_8UC4 */);
  const cvImage = persistentRgba as unknown as { data: Uint8Array };

  const cumAArr: number[] = [1];
  const cumBArr: number[] = [0];
  const cumTXArr: number[] = [0];
  const cumTYArr: number[] = [0];
  const timesArr: number[] = [0];
  let lastMediaTime = -1;
  let cA = 1, cB = 0, cTX = 0, cTY = 0;

  return new Promise<AnalysisResult>((resolve, reject) => {
    let finished = false;
    let watchdog: number | null = null;
    let lastWatchdogTime = 0;

    const cleanup = () => {
      try { prevGray?.delete(); } catch { /* */ }
      try { prevPts?.delete(); } catch { /* */ }
      try { mask?.delete(); } catch { /* */ }
      try { persistentRgba?.delete(); } catch { /* */ }
      // Free the per-call OpenCV scratch objects too — OpenCV.js wraps
      // these in wasm-heap allocations that don't get GC'd by JS alone.
      try { (winSize as unknown as { delete?: () => void }).delete?.(); } catch { /* */ }
      try { (lkCriteria as unknown as { delete?: () => void }).delete?.(); } catch { /* */ }
    };

    const restore = () => {
      try { video.pause(); } catch { /* */ }
      video.muted = wasMuted;
      video.loop = wasLoop;
      try { video.playbackRate = wasRate; } catch { /* */ }
      try { video.currentTime = resumeAt; } catch { /* */ }
      if (!wasPaused) video.play().catch(() => undefined);
    };

    // Skip restore() on abort — see stabilizer.ts for rationale (the
    // restore's seek + play race with the next analyzer's setup).
    const onAbort = () => {
      if (finished) return;
      finished = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      if (watchdog !== null) clearInterval(watchdog);
      cleanup();
      try { video.pause(); } catch { /* */ }
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    const finish = () => {
      if (finished) return;
      finished = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      if (watchdog !== null) clearInterval(watchdog);
      cleanup();
      restore();
      onProgress(1);
      const detectedRate = duration > 0 ? cumAArr.length / duration : 30;
      resolve({
        cumA: Float32Array.from(cumAArr),
        cumB: Float32Array.from(cumBArr),
        cumTX: Float32Array.from(cumTXArr),
        cumTY: Float32Array.from(cumTYArr),
        times: Float32Array.from(timesArr),
        frameCount: cumAArr.length,
        frameRate: detectedRate,
      });
    };

    const fail = (err: Error) => {
      if (finished) return;
      finished = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      if (watchdog !== null) clearInterval(watchdog);
      cleanup();
      restore();
      reject(err);
    };

    const detectFeatures = (gray: CvMat): CvMat => {
      const corners = new cv.Mat();
      if (!mask) mask = new cv.Mat();
      cv.goodFeaturesToTrack(
        gray, corners, MAX_FEATURES, FEATURE_QUALITY, MIN_FEATURE_DISTANCE,
        mask, 3,
      );
      return corners;
    };

    const processFrame = (mediaTime: number) => {
      if (video.readyState < 2) return;
      let currGray: CvMat | null = null;
      let nextPts: CvMat | null = null;
      let status: CvMat | null = null;
      let err: CvMat | null = null;
      let M: CvMat | null = null;
      let srcMat: CvMat | null = null;
      let dstMat: CvMat | null = null;
      let inliers: CvMat | null = null;
      try {
        ctx.drawImage(video, 0, 0, aw, ah);
        const imageData = ctx.getImageData(0, 0, aw, ah);
        // Copy into the persistent Mat instead of allocating a fresh
        // wasm-heap buffer (matFromImageData) every frame.
        cvImage.data.set(imageData.data);
        currGray = new cv.Mat();
        cv.cvtColor(persistentRgba, currGray, cv.COLOR_RGBA2GRAY);

        let frameA = 1, frameB = 0, frameTX = 0, frameTY = 0;
        let inlierCount = 0;

        if (prevGray && prevPts && prevPts.rows > 0) {
          nextPts = new cv.Mat();
          status = new cv.Mat();
          err = new cv.Mat();
          cv.calcOpticalFlowPyrLK(
            prevGray, currGray, prevPts, nextPts, status, err,
            winSize, 3, lkCriteria,
          );

          const srcPts: number[] = [];
          const dstPts: number[] = [];
          const n = prevPts.rows;
          for (let i = 0; i < n; i++) {
            if (status.data[i] === 1) {
              srcPts.push(prevPts.data32F[i * 2], prevPts.data32F[i * 2 + 1]);
              dstPts.push(nextPts.data32F[i * 2], nextPts.data32F[i * 2 + 1]);
            }
          }
          inlierCount = srcPts.length / 2;

          // Was 4 — bumped to 6 so a noisy LK match on a low-texture
          // underwater frame doesn't fit a similarity through 4
          // tracking errors and produce a false motion that propagates
          // to the smoother as shake.
          if (inlierCount >= 6) {
            srcMat = cv.matFromArray(inlierCount, 1, cv.CV_32FC2, srcPts);
            dstMat = cv.matFromArray(inlierCount, 1, cv.CV_32FC2, dstPts);
            inliers = new cv.Mat();
            M = cv.estimateAffinePartial2D(
              srcMat, dstMat, inliers, cv.RANSAC, RANSAC_THRESHOLD_PX,
            );
            if (M && !M.empty()) {
              // OpenCV returns [a -b tx; b a ty] where a = cosθ·s, b = sinθ·s
              const a = M.data64F[0];
              const b = M.data64F[3];
              const tx = M.data64F[2];
              const ty = M.data64F[5];
              const rotMag = Math.abs(Math.atan2(b, a));
              const scaleMag = Math.abs(Math.sqrt(a * a + b * b) - 1);
              if (rotMag > MAX_FRAME_ROT || scaleMag > MAX_FRAME_SCALE) {
                // Spurious rotation/scale — refit translation-only on
                // RANSAC inliers. The original tx/ty was computed under
                // the spurious rotation, so it's in the wrong frame and
                // would accumulate phantom drift across rotated clips.
                let sumDx = 0;
                let sumDy = 0;
                let cnt = 0;
                for (let i = 0; i < inliers.rows; i++) {
                  if (inliers.data[i] !== 1) continue;
                  const sx = srcMat.data32F[i * 2];
                  const sy = srcMat.data32F[i * 2 + 1];
                  const dx = dstMat.data32F[i * 2];
                  const dy = dstMat.data32F[i * 2 + 1];
                  sumDx += dx - sx;
                  sumDy += dy - sy;
                  cnt++;
                }
                if (cnt > 0) {
                  const txOnly = sumDx / cnt;
                  const tyOnly = sumDy / cnt;
                  if (Math.abs(txOnly) > aw * 0.25 || Math.abs(tyOnly) > ah * 0.25) {
                    frameTX = 0;
                    frameTY = 0;
                  } else {
                    frameTX = txOnly * scaleBack;
                    frameTY = tyOnly * scaleBack;
                  }
                }
              } else {
                frameA = a;
                frameB = b;
                frameTX = tx * scaleBack;
                frameTY = ty * scaleBack;
              }
            }
          }
        }

        // Compose: cum_new = T · cum_old (LEFT multiplication; the per-frame
        // transform maps prev → curr, cum tracks world → frame-N).
        const newA = frameA * cA - frameB * cB;
        const newB = frameB * cA + frameA * cB;
        const newTX = frameA * cTX - frameB * cTY + frameTX;
        const newTY = frameB * cTX + frameA * cTY + frameTY;
        cA = newA; cB = newB; cTX = newTX; cTY = newTY;

        // Re-detect or carry forward feature set
        if (prevPts) prevPts.delete();
        if (inlierCount < REPLENISH_BELOW) {
          prevPts = detectFeatures(currGray);
        } else if (nextPts && status) {
          // Carry the inlier subset forward as the next prev
          const surviving = new cv.Mat(inlierCount, 1, cv.CV_32FC2);
          let j = 0;
          for (let i = 0; i < nextPts.rows; i++) {
            if (status.data[i] === 1) {
              surviving.data32F[j * 2] = nextPts.data32F[i * 2];
              surviving.data32F[j * 2 + 1] = nextPts.data32F[i * 2 + 1];
              j++;
            }
          }
          prevPts = surviving;
        } else {
          prevPts = detectFeatures(currGray);
        }

        if (prevGray) prevGray.delete();
        prevGray = currGray.clone();
      } catch {
        // Swallow — still push the cumulative so frame indexing stays consistent
      } finally {
        cumAArr.push(cA);
        cumBArr.push(cB);
        cumTXArr.push(cTX);
        cumTYArr.push(cTY);
        timesArr.push(mediaTime);
        try { currGray?.delete(); } catch { /* */ }
        try { nextPts?.delete(); } catch { /* */ }
        try { status?.delete(); } catch { /* */ }
        try { err?.delete(); } catch { /* */ }
        try { M?.delete(); } catch { /* */ }
        try { srcMat?.delete(); } catch { /* */ }
        try { dstMat?.delete(); } catch { /* */ }
        try { inliers?.delete(); } catch { /* */ }
      }
      onProgress(Math.min(1, video.currentTime / duration));
    };

    const v = video as VideoWithRVFC;
    const useRvfc = typeof v.requestVideoFrameCallback === "function";
    if (useRvfc) {
      const onFrame = (_now: number, meta: RvfcMetadata) => {
        if (finished) return;
        // Source media time, deduped — see stabilizer.ts for the full
        // explanation of why per-frame mediaTime matters more than
        // wall-clock counting at playbackRate=2.
        const t = typeof meta?.mediaTime === "number" ? meta.mediaTime : video.currentTime;
        if (t > lastMediaTime + 1e-4) {
          lastMediaTime = t;
          processFrame(t);
        }
        if (video.ended) finish();
        else v.requestVideoFrameCallback?.(onFrame);
      };
      v.requestVideoFrameCallback?.(onFrame);
    } else {
      const loop = () => {
        if (finished) return;
        if (!video.paused && video.readyState >= 2) {
          const t = video.currentTime;
          if (t > lastMediaTime + 1e-4) {
            lastMediaTime = t;
            processFrame(t);
          }
        }
        if (video.ended) finish();
        else requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    video.addEventListener("ended", finish, { once: true });

    video
      .play()
      .then(() => {
        lastWatchdogTime = video.currentTime;
        // 10 s × 0.1 s × 2 strikes — see stabilizer.ts.
        let stalledStrikes = 0;
        watchdog = window.setInterval(() => {
          if (finished) return;
          if (document.visibilityState !== "visible") {
            stalledStrikes = 0;
            lastWatchdogTime = video.currentTime;
            return;
          }
          if (video.currentTime <= lastWatchdogTime + 0.1) {
            stalledStrikes++;
            if (stalledStrikes >= 2) {
              fail(new Error("Video decoder stalled during analysis"));
              return;
            }
          } else {
            stalledStrikes = 0;
          }
          lastWatchdogTime = video.currentTime;
        }, 10000);
      })
      .catch((e) =>
        fail(new Error("Couldn't play video for analysis: " + (e instanceof Error ? e.message : String(e)))),
      );
  });
}
