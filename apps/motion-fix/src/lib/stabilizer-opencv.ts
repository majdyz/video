// OpenCV.js-powered analyser. Drop-in replacement for the built-in
// block-matching analyser, sharing the AnalysisResult shape and the same
// downstream smoother + render pipeline.
//
// Uses cv.goodFeaturesToTrack (Shi-Tomasi corners) + cv.calcOpticalFlowPyrLK
// (pyramidal Lucas-Kanade) + cv.estimateAffine2D (RANSAC affine,
// projected to the nearest similarity). This is the same recipe used by Premiere Warp Stabilizer's
// 'Subspace' fallback and most academic vision-only stabilisers.
//
// Versus our built-in tracker, the win is feature-based vs grid-based:
// goodFeaturesToTrack chooses high-information points (real corners), LK
// follows them across pyramid levels (handles large motion), and OpenCV's
// RANSAC is iteratively-reweighted for genuine robustness against
// independently-moving content.
//
// Tracking hygiene on top of the basic recipe:
//   - Forward-backward validation: every LK track is re-tracked from the
//     new frame back to the old one; tracks whose round trip lands more
//     than 1 px from where they started are drift/occlusion errors and
//     get rejected before the RANSAC fit ever sees them.
//   - Grid-bucketed feature detection: detected corners are capped per
//     cell of an 8×6 grid so the feature set can't cluster on one
//     high-contrast fish and out-vote the static background.

import type { AnalysisResult, PairwiseTracker, SimilarityTransform } from "./stabilizer";

const ANALYSIS_W = 640;
const MAX_FEATURES = 220;
const REPLENISH_BELOW = 100;
const FEATURE_QUALITY = 0.01;
const MIN_FEATURE_DISTANCE = 8;
const RANSAC_THRESHOLD_PX = 1.5;
const MAX_FRAME_ROT = 0.09;
const MAX_FRAME_SCALE = 0.06;
// Forward-backward LK round-trip rejection, in analysis pixels. The
// floor applies to slow scenes; for fast motion the tolerance scales
// with the track's own displacement — pyramid-interpolation error grows
// with motion magnitude, and a fixed 1 px gate annihilates virtually
// every valid track on a hard 30–50 px/frame shake (measured: 150+ LK
// tracks reduced to 0–5 survivors, which forced identity transforms
// and disabled stabilization entirely).
const FB_BASE_ERROR_PX = 1.5;
const FB_RELATIVE_ERROR = 0.06; // + 6% of the forward displacement
// Feature-detection bucketing grid: cap corners per cell so they spread
// across the frame instead of clustering on one textured subject.
const BUCKET_COLS = 8;
const BUCKET_ROWS = 6;
// Homography-as-validator: a cheap parallax/foreground detector. After
// the similarity fit, an 8-DoF homography is fitted to the same tracks;
// if its implied motion at the frame corners disagrees with the
// similarity's by more than a few % of frame width, the scene contains
// two motion layers (strong parallax / large foreground subject) and the
// loose RANSAC threshold is averaging them. Re-running the similarity
// fit with a tight threshold locks onto the dominant rigid plane. The
// homography itself is never propagated downstream — smoothing and
// rendering stay similarity-based.
const HOMOGRAPHY_RANSAC_PX = 3.0;
const PARALLAX_CORNER_DISAGREE_FRAC = 0.03;
const PARALLAX_TIGHT_RANSAC_PX = 1.0;

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
  estimateAffine2D: (
    src: CvMat, dst: CvMat, inliers: CvMat, method: number,
    ransacReprojThreshold: number,
  ) => CvMat;
  findHomography: (
    src: CvMat, dst: CvMat, method: number, ransacReprojThreshold: number,
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

// Mean Euclidean disagreement between a homography's and a similarity's
// implied motion at the four frame corners. Returns 0 (no parallax
// signal) when the homography is degenerate — a near-zero projective
// denominator means the H fit itself failed and can't be trusted as a
// detector.
function meanCornerDisagreement(
  hm: Float64Array,
  a: number, b: number, tx: number, ty: number,
  w: number, h: number,
): number {
  let sum = 0;
  for (const x of [0, w]) {
    for (const y of [0, h]) {
      const den = hm[6] * x + hm[7] * y + hm[8];
      if (Math.abs(den) < 1e-9) return 0;
      const hx = (hm[0] * x + hm[1] * y + hm[2]) / den;
      const hy = (hm[3] * x + hm[4] * y + hm[5]) / den;
      const sx = a * x - b * y + tx;
      const sy = b * x + a * y + ty;
      sum += Math.hypot(hx - sx, hy - sy);
    }
  }
  return sum / 4;
}

// Stateful frame-pair estimator used by both the playback analyser below
// and the WebCodecs pipeline (codec-pipeline.ts). Holds the previous gray
// frame + feature set; step() returns the source-space similarity for the
// latest frame pair.
export function createOpenCVTracker(srcW: number, srcH: number): PairwiseTracker {
  const cv = window.cv as unknown as CV;
  if (!cv || !cv.Mat) throw new Error("OpenCV.js is not initialised");

  // Run the tracker at 640px wide. OpenCV's pyramid + LK is fast enough
  // that we don't need to go as small as the block-matching analyser.
  const aw = Math.min(ANALYSIS_W, srcW);
  const ah = Math.max(1, Math.round((srcH * aw) / srcW));
  const scaleBack = srcW / aw;

  // Hoisted once per tracker instead of allocated per frame — OpenCV.js
  // wraps each `new cv.Size`/`cv.TermCriteria` as a wasm heap entry that
  // doesn't auto-free, so per-frame alloc leaks thousands of entries on
  // long clips.
  const winSize = new cv.Size(15, 15);
  const lkCriteria = new cv.TermCriteria(
    cv.TermCriteria_EPS | cv.TermCriteria_COUNT, 10, 0.03,
  );
  // Persistent RGBA Mat sized once. matFromImageData allocates a fresh
  // wasm-heap buffer per frame (~aw*ah*4 bytes), which churns gigabytes
  // through GC on long clips.
  const rgba = new cv.Mat(ah, aw, 24 /* CV_8UC4 */);
  const rgbaData = rgba as unknown as { data: Uint8Array };

  let prevGray: CvMat | null = null;
  let prevPts: CvMat | null = null;
  let mask: CvMat | null = null;

  const detectFeatures = (gray: CvMat): CvMat => {
    const corners = new cv.Mat();
    if (!mask) mask = new cv.Mat();
    cv.goodFeaturesToTrack(
      gray, corners, MAX_FEATURES, FEATURE_QUALITY, MIN_FEATURE_DISTANCE,
      mask, 3,
    );
    // Bucket the corners into an 8×6 grid and cap each cell.
    // goodFeaturesToTrack returns corners strongest-first, so keeping
    // the first N per cell keeps the best ones.
    const capPerCell = Math.ceil(MAX_FEATURES / (BUCKET_COLS * BUCKET_ROWS));
    const counts = new Uint8Array(BUCKET_COLS * BUCKET_ROWS);
    const kept: number[] = [];
    for (let i = 0; i < corners.rows; i++) {
      const x = corners.data32F[i * 2];
      const y = corners.data32F[i * 2 + 1];
      const col = Math.min(BUCKET_COLS - 1, Math.floor((x / aw) * BUCKET_COLS));
      const row = Math.min(BUCKET_ROWS - 1, Math.floor((y / ah) * BUCKET_ROWS));
      const cell = row * BUCKET_COLS + col;
      if (counts[cell] >= capPerCell) continue;
      counts[cell]++;
      kept.push(x, y);
    }
    corners.delete();
    if (kept.length === 0) return new cv.Mat();
    return cv.matFromArray(kept.length / 2, 1, cv.CV_32FC2, kept);
  };

  const step = (frame: ImageData): SimilarityTransform => {
    let currGray: CvMat | null = null;
    let nextPts: CvMat | null = null;
    let status: CvMat | null = null;
    let err: CvMat | null = null;
    let backPts: CvMat | null = null;
    let backStatus: CvMat | null = null;
    let backErr: CvMat | null = null;
    let M: CvMat | null = null;
    let srcMat: CvMat | null = null;
    let dstMat: CvMat | null = null;
    let inliers: CvMat | null = null;
    let homog: CvMat | null = null;
    let tightInliers: CvMat | null = null;
    let frameA = 1, frameB = 0, frameTX = 0, frameTY = 0;
    try {
      rgbaData.data.set(frame.data);
      currGray = new cv.Mat();
      cv.cvtColor(rgba, currGray, cv.COLOR_RGBA2GRAY);

      let trackedCount = 0;
      const srcPts: number[] = [];
      const dstPts: number[] = [];

      if (prevGray && prevPts && prevPts.rows > 0) {
        nextPts = new cv.Mat();
        status = new cv.Mat();
        err = new cv.Mat();
        cv.calcOpticalFlowPyrLK(
          prevGray, currGray, prevPts, nextPts, status, err,
          winSize, 3, lkCriteria,
        );
        // Forward-backward validation: re-track the new positions back
        // to the previous frame and reject any track whose round trip
        // misses its starting point by more than 1 px.
        backPts = new cv.Mat();
        backStatus = new cv.Mat();
        backErr = new cv.Mat();
        cv.calcOpticalFlowPyrLK(
          currGray, prevGray, nextPts, backPts, backStatus, backErr,
          winSize, 3, lkCriteria,
        );

        const n = prevPts.rows;
        // Tracks that pass plain LK (status=1 both ways) but fail the
        // round-trip gate. Kept as a fallback pool: feeding RANSAC
        // unvalidated tracks beats inserting a false "no motion" sample
        // that the smoother would treat as truth.
        const looseSrc: number[] = [];
        const looseDst: number[] = [];
        for (let i = 0; i < n; i++) {
          if (status.data[i] !== 1 || backStatus.data[i] !== 1) continue;
          const px = prevPts.data32F[i * 2];
          const py = prevPts.data32F[i * 2 + 1];
          const nx = nextPts.data32F[i * 2];
          const ny = nextPts.data32F[i * 2 + 1];
          const bx = backPts.data32F[i * 2];
          const by = backPts.data32F[i * 2 + 1];
          looseSrc.push(px, py);
          looseDst.push(nx, ny);
          const moved = Math.hypot(nx - px, ny - py);
          const tol = FB_BASE_ERROR_PX + FB_RELATIVE_ERROR * moved;
          const fbErr = (bx - px) * (bx - px) + (by - py) * (by - py);
          if (fbErr > tol * tol) continue;
          srcPts.push(px, py);
          dstPts.push(nx, ny);
        }
        trackedCount = srcPts.length / 2;
        if (trackedCount < 6 && looseSrc.length / 2 >= 6) {
          srcPts.length = 0;
          dstPts.length = 0;
          for (let i = 0; i < looseSrc.length; i++) {
            srcPts.push(looseSrc[i]);
            dstPts.push(looseDst[i]);
          }
          trackedCount = srcPts.length / 2;
        }

        // Was 4 — bumped to 6 so a noisy LK match on a low-texture
        // underwater frame doesn't fit a similarity through 4
        // tracking errors and produce a false motion that propagates
        // to the smoother as shake.
        if (trackedCount >= 6) {
          srcMat = cv.matFromArray(trackedCount, 1, cv.CV_32FC2, srcPts);
          dstMat = cv.matFromArray(trackedCount, 1, cv.CV_32FC2, dstPts);
          inliers = new cv.Mat();
          // The @techstark/opencv-js build ships estimateAffine2D (6-DoF
          // full affine, RANSAC) but NOT estimateAffinePartial2D — the
          // original code called the latter, threw on every frame, and
          // the playback analyser's per-frame catch silently turned every
          // transform into identity, which disabled Better-mode
          // stabilization entirely. Fit the full affine instead and
          // project it to the nearest similarity (Frobenius): that also
          // strips shear noise the 6-DoF fit picks up from parallax.
          M = cv.estimateAffine2D(
            srcMat, dstMat, inliers, cv.RANSAC, RANSAC_THRESHOLD_PX,
          );
          // Parallax/foreground detector — see the constant block above.
          // findHomography needs ≥ 4 correspondences; trackedCount ≥ 6
          // here, but keep the explicit guard in case thresholds change.
          if (M && !M.empty() && trackedCount >= 4) {
            homog = cv.findHomography(
              srcMat, dstMat, cv.RANSAC, HOMOGRAPHY_RANSAC_PX,
            );
            if (homog && !homog.empty()) {
              const simA = (M.data64F[0] + M.data64F[4]) / 2;
              const simB = (M.data64F[3] - M.data64F[1]) / 2;
              const disagree = meanCornerDisagreement(
                homog.data64F, simA, simB, M.data64F[2], M.data64F[5], aw, ah,
              );
              if (disagree > PARALLAX_CORNER_DISAGREE_FRAC * aw) {
                tightInliers = new cv.Mat();
                const tightM = cv.estimateAffine2D(
                  srcMat, dstMat, tightInliers, cv.RANSAC, PARALLAX_TIGHT_RANSAC_PX,
                );
                if (tightM && !tightM.empty()) {
                  // Adopt the tight fit (and its inlier mask, which the
                  // translation-only refit below reads).
                  M.delete();
                  M = tightM;
                  inliers.delete();
                  inliers = tightInliers;
                  tightInliers = null;
                } else {
                  try { tightM?.delete(); } catch { /* */ }
                }
              }
            }
          }
          if (M && !M.empty()) {
            // Affine layout [m00 m01 tx; m10 m11 ty]. Nearest similarity:
            // a = (m00+m11)/2, b = (m10-m01)/2.
            const a = (M.data64F[0] + M.data64F[4]) / 2;
            const b = (M.data64F[3] - M.data64F[1]) / 2;
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

      // Re-detect or carry forward the (round-trip-validated) feature set
      if (prevPts) prevPts.delete();
      if (trackedCount < REPLENISH_BELOW) {
        prevPts = detectFeatures(currGray);
      } else {
        prevPts = cv.matFromArray(trackedCount, 1, cv.CV_32FC2, dstPts);
      }

      if (prevGray) prevGray.delete();
      prevGray = currGray.clone();
    } finally {
      try { currGray?.delete(); } catch { /* */ }
      try { nextPts?.delete(); } catch { /* */ }
      try { status?.delete(); } catch { /* */ }
      try { err?.delete(); } catch { /* */ }
      try { backPts?.delete(); } catch { /* */ }
      try { backStatus?.delete(); } catch { /* */ }
      try { backErr?.delete(); } catch { /* */ }
      try { M?.delete(); } catch { /* */ }
      try { srcMat?.delete(); } catch { /* */ }
      try { dstMat?.delete(); } catch { /* */ }
      try { inliers?.delete(); } catch { /* */ }
      try { homog?.delete(); } catch { /* */ }
      try { tightInliers?.delete(); } catch { /* */ }
    }
    return { a: frameA, b: frameB, tx: frameTX, ty: frameTY };
  };

  const dispose = () => {
    try { prevGray?.delete(); } catch { /* */ }
    try { prevPts?.delete(); } catch { /* */ }
    try { mask?.delete(); } catch { /* */ }
    try { rgba.delete(); } catch { /* */ }
    try { (winSize as unknown as { delete?: () => void }).delete?.(); } catch { /* */ }
    try { (lkCriteria as unknown as { delete?: () => void }).delete?.(); } catch { /* */ }
    prevGray = null;
    prevPts = null;
    mask = null;
  };

  return { width: aw, height: ah, step, dispose };
}

export async function analyzeVideoOpenCV(
  video: HTMLVideoElement,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video has no usable duration");
  }
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) throw new Error("Video has no usable size");

  const tracker = createOpenCVTracker(srcW, srcH);
  const aw = tracker.width;
  const ah = tracker.height;

  const canvas = document.createElement("canvas");
  canvas.width = aw;
  canvas.height = ah;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    tracker.dispose();
    throw new Error("2D canvas unavailable");
  }
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
    }).catch((e) => {
      tracker.dispose();
      throw e;
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
      tracker.dispose();
      try { video.pause(); } catch { /* */ }
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    const finish = () => {
      if (finished) return;
      finished = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      if (watchdog !== null) clearInterval(watchdog);
      tracker.dispose();
      restore();
      onProgress(1);
      const detectedRate = duration > 0 ? cumAArr.length / duration : 30;
      resolve({
        cumA: Float32Array.from(cumAArr),
        cumB: Float32Array.from(cumBArr),
        cumTX: Float32Array.from(cumTXArr),
        cumTY: Float32Array.from(cumTYArr),
        times: Float64Array.from(timesArr),
        frameCount: cumAArr.length,
        frameRate: detectedRate,
      });
    };

    const fail = (err: Error) => {
      if (finished) return;
      finished = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      if (watchdog !== null) clearInterval(watchdog);
      tracker.dispose();
      restore();
      reject(err);
    };

    const processFrame = (mediaTime: number) => {
      if (video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, aw, ah);
        const imageData = ctx.getImageData(0, 0, aw, ah);
        const t = tracker.step(imageData);

        // Compose: cum_new = T · cum_old (LEFT multiplication; the per-frame
        // transform maps prev → curr, cum tracks world → frame-N).
        const newA = t.a * cA - t.b * cB;
        const newB = t.b * cA + t.a * cB;
        const newTX = t.a * cTX - t.b * cTY + t.tx;
        const newTY = t.b * cTX + t.a * cTY + t.ty;
        cA = newA; cB = newB; cTX = newTX; cTY = newTY;
      } catch {
        // Swallow — still push the cumulative so frame indexing stays consistent
      } finally {
        cumAArr.push(cA);
        cumBArr.push(cB);
        cumTXArr.push(cTX);
        cumTYArr.push(cTY);
        timesArr.push(mediaTime);
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
