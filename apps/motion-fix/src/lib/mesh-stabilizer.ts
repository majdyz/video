// MeshFlow-based stabiliser. Tracks features (Shi-Tomasi + LK) like the
// existing OpenCV path, but instead of fitting a single global 2D
// similarity per frame, bins the LK feature flows into a per-vertex
// grid (VERT_W × VERT_H) and computes a robust median motion vector
// per vertex. Spatial median across neighbours suppresses outliers
// (fish, divers, caustics moving against the dominant scene flow).
// Temporal L1 smoothing per vertex flattens the per-vertex trajectory.
//
// Compared to the global similarity tracker:
//   - Handles parallax (foreground vs background moving differently)
//   - Handles local wobble (jellyfish wobbling vs reef being still)
//   - Captures rolling-shutter pan-skew naturally as a vertical
//     gradient in the per-vertex motion (no separate RS pass needed
//     for the most common case — pan-induced skew)
//
// Reference: Liu, Yuan, Fang, Sun. 'MeshFlow: Minimum Latency Online
// Video Stabilization.' ECCV 2016. — adapted for offline (full-clip)
// processing in the browser.

import { GRID_W, GRID_H, VERT_W, VERT_H, VERT_COUNT } from "./mesh-renderer";

export type MeshAnalysis = {
  // Per-frame per-vertex motion vector, in source pixel units.
  // Layout: motionX[frame * VERT_COUNT + vy * VERT_W + vx] = horizontal
  // motion at vertex (vx, vy) from frame f-1 to frame f. NaN = no
  // confident estimate (gets in-painted from neighbours during
  // smoothMeshPath — the per-frame deltas remain immutable here).
  motionX: Float32Array;
  motionY: Float32Array;
  // Cumulative path per (frame, vertex) — populated by smoothMeshPath
  // so subsequent calls (slider drag re-runs) read this rather than
  // re-cumming. Without this, re-running smoothMeshPath would compute
  // cum-of-cum and shift every UV further per pass.
  cumX: Float32Array | null;
  cumY: Float32Array | null;
  times: Float32Array;
  frameCount: number;
  frameRate: number;
  width: number;  // source video width
  height: number; // source video height
};

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
  COLOR_RGBA2GRAY: number;
  CV_32FC2: number;
  CV_8UC4: number;
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
  delete: () => void;
};

type RvfcMetadata = { mediaTime?: number };
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: RvfcMetadata) => void) => number;
};

// Track ~3 features per cell, generously, so each vertex has nearby
// observations. 16x9 grid * 3 = ~430.
const MAX_FEATURES = 480;
const FEATURE_QUALITY = 0.005;
const MIN_FEATURE_DISTANCE = 12;
// Per-vertex local search radius in source pixels — a vertex aggregates
// LK tracks within this radius for its median motion estimate.
const VERTEX_RADIUS_FRAC = 1.2; // multiple of cell width

export async function analyzeVideoMesh(
  video: HTMLVideoElement,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<MeshAnalysis> {
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

  // Analyse at 720px-wide proxy — full 4K would saturate the decoder
  // and slow the analysis to a crawl. The mesh model uses normalised
  // coordinates so the proxy resolution doesn't change the result
  // beyond sub-pixel rounding.
  const aw = Math.min(720, srcW);
  const ah = Math.max(1, Math.round((srcH * aw) / srcW));

  const canvas = document.createElement("canvas");
  canvas.width = aw;
  canvas.height = ah;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Wait until the video can supply frames.
  if (video.readyState < 2) {
    try { video.preload = "auto"; video.load(); } catch { /* ignore */ }
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onErr = () => { cleanup(); reject(new Error("Video decoder rejected the file")); };
      const cleanup = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onErr);
        clearTimeout(t);
      };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("error", onErr);
      const t = setTimeout(() => { cleanup(); reject(new Error("Video took too long to load")); }, 30000);
    });
  }

  const wasPaused = video.paused;
  const resumeAt = video.currentTime;
  const wasMuted = video.muted;
  const wasLoop = video.loop;
  const wasRate = video.playbackRate;
  video.muted = true;
  video.loop = false;
  try { video.playbackRate = 1; } catch { /* ignore */ }
  if (video.currentTime > 0.05) {
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      try { video.currentTime = 0; } catch { resolve(); }
      setTimeout(resolve, 2000);
    });
  }

  let prevGray: CvMat | null = null;
  let prevPts: CvMat | null = null;
  let mask: CvMat | null = null;
  const winSize = new cv.Size(15, 15);
  const lkCriteria = new cv.TermCriteria(
    cv.TermCriteria_EPS | cv.TermCriteria_COUNT, 10, 0.03,
  );
  const persistentRgba = new cv.Mat(ah, aw, 24 /* CV_8UC4 */);

  // Aggregating buffers — pushed per processed frame.
  const motionXFrames: Float32Array[] = [];
  const motionYFrames: Float32Array[] = [];
  const times: number[] = [];
  // Pre-allocated track scratch — reused per frame to avoid GC churn.
  // MAX_FEATURES caps how many can be live at once.
  const trackSx = new Float32Array(MAX_FEATURES);
  const trackSy = new Float32Array(MAX_FEATURES);
  const trackDx = new Float32Array(MAX_FEATURES);
  const trackDy = new Float32Array(MAX_FEATURES);
  // Per-vertex sample collection scratch — sized to hold all tracks
  // worst-case (every track within a vertex's neighbourhood).
  const sampleXs = new Float64Array(MAX_FEATURES);
  const sampleYs = new Float64Array(MAX_FEATURES);
  // First frame: zero motion (no previous to compare). Time is set on
  // the first processFrame call to the actual mediaTime — leaving it
  // at 0 here would create a fake (0, 0)→(realT0, m0) interpolation
  // segment if the first decoded frame's mediaTime > 0 (common —
  // streams often start at non-zero PTS).
  motionXFrames.push(new Float32Array(VERT_COUNT));
  motionYFrames.push(new Float32Array(VERT_COUNT));
  times.push(NaN);

  const cellWaw = aw / GRID_W;
  const cellHah = ah / GRID_H;
  // Elliptical radius — cells can be very non-square (e.g. portrait
  // 720×960 proxy: 45×96 px), so a single circular radius would
  // sample horizontally-narrow neighbourhoods. Use cell-aspect-aware
  // ellipse instead.
  const rxBase = VERTEX_RADIUS_FRAC * cellWaw;
  const ryBase = VERTEX_RADIUS_FRAC * cellHah;
  const scaleBackX = srcW / aw;
  const scaleBackY = srcH / ah;

  return new Promise<MeshAnalysis>((resolve, reject) => {
    let finished = false;
    let watchdog: number | null = null;
    let lastWatchdogTime = 0;
    let lastMediaTime = -1;

    const cleanup = () => {
      try { prevGray?.delete(); } catch { /* */ }
      try { prevPts?.delete(); } catch { /* */ }
      try { mask?.delete(); } catch { /* */ }
      try { persistentRgba?.delete(); } catch { /* */ }
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

    const onAbort = () => fail(new DOMException("Aborted", "AbortError"));
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    const finish = () => {
      if (finished) return;
      finished = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      if (watchdog !== null) clearInterval(watchdog);
      cleanup();
      restore();
      onProgress(1);
      const n = motionXFrames.length;
      // Reject if no real frames decoded — only the placeholder
      // entry exists, with NaN time and zero motion. Returning that
      // would leave NaN UVs everywhere (black frame).
      if (n <= 1 || Number.isNaN(times[0])) {
        reject(new Error("Mesh analysis: no frames could be decoded"));
        return;
      }
      const flatX = new Float32Array(n * VERT_COUNT);
      const flatY = new Float32Array(n * VERT_COUNT);
      for (let i = 0; i < n; i++) {
        flatX.set(motionXFrames[i], i * VERT_COUNT);
        flatY.set(motionYFrames[i], i * VERT_COUNT);
      }
      // Derive fps from the actual sampled mediaTime span — duration
      // overestimates if a watchdog or `ended` cut analysis early.
      const span = times[n - 1] - times[0];
      const detectedRate = span > 0 ? (n - 1) / span : (duration > 0 ? n / duration : 30);
      resolve({
        motionX: flatX,
        motionY: flatY,
        cumX: null,
        cumY: null,
        times: Float32Array.from(times),
        frameCount: n,
        frameRate: detectedRate,
        width: srcW,
        height: srcH,
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
      // Backfill the placeholder time[0] with the first observed
      // mediaTime so the boundary lookup in meshUVsAtTime returns a
      // sensible value for time < first sample.
      if (Number.isNaN(times[0])) times[0] = mediaTime;
      if (video.readyState < 2) return;
      let currGray: CvMat | null = null;
      let nextPts: CvMat | null = null;
      let status: CvMat | null = null;
      let err: CvMat | null = null;
      const motionX = new Float32Array(VERT_COUNT);
      const motionY = new Float32Array(VERT_COUNT);
      try {
        ctx.drawImage(video, 0, 0, aw, ah);
        const imageData = ctx.getImageData(0, 0, aw, ah);
        persistentRgba.data.set(imageData.data);
        currGray = new cv.Mat();
        cv.cvtColor(persistentRgba, currGray, cv.COLOR_RGBA2GRAY);

        if (prevGray && prevPts && prevPts.rows > 0) {
          nextPts = new cv.Mat();
          status = new cv.Mat();
          err = new cv.Mat();
          cv.calcOpticalFlowPyrLK(
            prevGray, currGray, prevPts, nextPts, status, err,
            winSize, 3, lkCriteria,
          );
          // Collect inlier tracks into preallocated typed scratch
          // (avoids per-frame Array<{sx,sy,dx,dy}> allocations — was
          // ~3000 small object allocations per analysis run).
          let trackCount = 0;
          const nPrev = prevPts.rows;
          for (let i = 0; i < nPrev; i++) {
            if (status.data[i] !== 1) continue;
            if (trackCount >= MAX_FEATURES) break;
            const sx = prevPts.data32F[i * 2];
            const sy = prevPts.data32F[i * 2 + 1];
            const ex = nextPts.data32F[i * 2];
            const ey = nextPts.data32F[i * 2 + 1];
            const dx = ex - sx;
            const dy = ey - sy;
            if (Math.abs(dx) > aw * 0.25 || Math.abs(dy) > ah * 0.25) continue;
            trackSx[trackCount] = sx;
            trackSy[trackCount] = sy;
            trackDx[trackCount] = dx;
            trackDy[trackCount] = dy;
            trackCount++;
          }

          for (let vy = 0; vy < VERT_H; vy++) {
            for (let vx = 0; vx < VERT_W; vx++) {
              const px = vx * cellWaw;
              const py = vy * cellHah;
              const onLeft = vx === 0;
              const onRight = vx === VERT_W - 1;
              const onTop = vy === 0;
              const onBottom = vy === VERT_H - 1;
              const rx = (onLeft || onRight) ? rxBase * 1.6 : rxBase;
              const ry = (onTop || onBottom) ? ryBase * 1.6 : ryBase;
              const minSamples = (onLeft || onRight || onTop || onBottom) ? 2 : 3;
              let cnt = 0;
              for (let k = 0; k < trackCount; k++) {
                const ddx = (trackSx[k] - px) / rx;
                const ddy = (trackSy[k] - py) / ry;
                if (ddx * ddx + ddy * ddy <= 1) {
                  sampleXs[cnt] = trackDx[k];
                  sampleYs[cnt] = trackDy[k];
                  cnt++;
                }
              }
              const idx = vy * VERT_W + vx;
              if (cnt < minSamples) {
                motionX[idx] = NaN;
                motionY[idx] = NaN;
              } else {
                // In-place sort via Float64Array view of the prefix.
                const xView = sampleXs.subarray(0, cnt);
                const yView = sampleYs.subarray(0, cnt);
                xView.sort();
                yView.sort();
                const mid = cnt >> 1;
                motionX[idx] = xView[mid] * scaleBackX;
                motionY[idx] = yView[mid] * scaleBackY;
              }
            }
          }
        }

        // Re-detect features when too few survived. Count inliers
        // in-place — Array.from(status.data).filter allocated a full
        // Array copy of the wasm-heap status buffer every frame.
        let inlierCount = 0;
        if (status && nextPts) {
          for (let i = 0; i < status.data.length; i++) {
            if (status.data[i] === 1) inlierCount++;
          }
        }
        if (prevPts) prevPts.delete();
        // Threshold scales with MAX_FEATURES — was hardcoded 200 which
        // forced re-detection every frame on low-texture footage where
        // tracker only ever has ~150 confident corners.
        const refreshBelow = Math.max(60, Math.floor(MAX_FEATURES * 0.4));
        if (inlierCount < refreshBelow || !nextPts || !status) {
          prevPts = detectFeatures(currGray);
        } else {
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
        }

        if (prevGray) prevGray.delete();
        prevGray = currGray;
        currGray = null;
      } catch {
        // Push zero motion to keep frame indexing aligned
      } finally {
        motionXFrames.push(motionX);
        motionYFrames.push(motionY);
        times.push(mediaTime);
        try { currGray?.delete(); } catch { /* */ }
        try { nextPts?.delete(); } catch { /* */ }
        try { status?.delete(); } catch { /* */ }
        try { err?.delete(); } catch { /* */ }
      }
      onProgress(Math.min(1, video.currentTime / duration));
    };

    const v = video as VideoWithRVFC;
    const useRvfc = typeof v.requestVideoFrameCallback === "function";
    if (useRvfc) {
      const onFrame = (_now: number, meta: RvfcMetadata) => {
        if (finished) return;
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

    video.play().then(() => {
      lastWatchdogTime = video.currentTime;
      watchdog = window.setInterval(() => {
        if (finished) return;
        if (document.visibilityState !== "visible") {
          lastWatchdogTime = video.currentTime;
          return;
        }
        if (video.currentTime <= lastWatchdogTime + 0.05) {
          fail(new Error("Video decoder stalled during analysis"));
          return;
        }
        lastWatchdogTime = video.currentTime;
      }, 5000);
    }).catch((e) => {
      fail(new Error("Couldn't play video for analysis: " + (e instanceof Error ? e.message : String(e))));
    });
  });
}

// ----- Smoothing & rendering helpers -----

export type MeshSmoothPath = {
  // smoothed displacement per (frame, vertex) in source pixels
  // smoothX[frame * VERT_COUNT + idx]
  smoothX: Float32Array;
  smoothY: Float32Array;
};

// Spatially in-paint NaN entries from neighbours, then temporally
// L1-smooth each vertex's path. The cumulative path (sum of motions
// from frame 0) is what gets smoothed; the per-frame motion is
// cum[i] - cum[i-1].
export function smoothMeshPath(
  analysis: MeshAnalysis,
  smoothing: number,
  crop: number,
): MeshSmoothPath {
  const n = analysis.frameCount;

  // Build (or reuse) the cumulative-path arrays. We cache them on the
  // analysis result so a second call (slider drag) doesn't re-cum
  // already-cum data — the prior version mutated motionX in place
  // which made every re-smooth shift the path further.
  let cumX = analysis.cumX;
  let cumY = analysis.cumY;
  const needCum = !cumX || !cumY;
  if (needCum) {
    // Step 1: spatial in-paint per frame on a working copy of the
    // per-frame deltas. The original motionX/Y stays immutable so we
    // can rebuild cum if the analysis is ever invalidated.
    const motionX = new Float32Array(analysis.motionX);
    const motionY = new Float32Array(analysis.motionY);
    // Iterate spatial in-paint to fill holes, breaking early per
    // frame once it's NaN-free. Most frames converge in 1-2 passes;
    // capping at 12 lets a long contiguous NaN strip still resolve
    // worst-case while not paying the full cost on healthy frames.
    // Track the previous frame's per-vertex motion so a frame whose
    // entire mesh stayed NaN can carry-forward (constant velocity)
    // instead of falling to 0 — zero-fill on a whole frame would drop
    // that frame's true camera motion and lag the cum permanently.
    const prevFrameMotionX = new Float32Array(VERT_COUNT);
    const prevFrameMotionY = new Float32Array(VERT_COUNT);
    for (let f = 0; f < n; f++) {
      const off = f * VERT_COUNT;
      for (let pass = 0; pass < 12; pass++) {
        let dirty = false;
        for (let vy = 0; vy < VERT_H; vy++) {
          for (let vx = 0; vx < VERT_W; vx++) {
            const idx = vy * VERT_W + vx;
            if (!Number.isNaN(motionX[off + idx])) continue;
            let sumX = 0, sumY = 0, cnt = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = vx + dx;
                const ny = vy + dy;
                if (nx < 0 || nx >= VERT_W || ny < 0 || ny >= VERT_H) continue;
                const nIdx = ny * VERT_W + nx;
                const mx = motionX[off + nIdx];
                if (!Number.isNaN(mx)) {
                  sumX += mx;
                  sumY += motionY[off + nIdx];
                  cnt++;
                }
              }
            }
            if (cnt > 0) {
              motionX[off + idx] = sumX / cnt;
              motionY[off + idx] = sumY / cnt;
              dirty = true;
            }
          }
        }
        if (!dirty) break;
      }
    }
    // For each frame, anything still NaN gets the previous frame's
    // per-vertex motion. This carries the cum forward at the last-
    // known velocity instead of resetting to 0 (which would drop
    // the frame's camera motion and shift every subsequent cum).
    for (let f = 0; f < n; f++) {
      const off = f * VERT_COUNT;
      for (let v = 0; v < VERT_COUNT; v++) {
        if (Number.isNaN(motionX[off + v])) {
          motionX[off + v] = prevFrameMotionX[v];
        } else {
          prevFrameMotionX[v] = motionX[off + v];
        }
        if (Number.isNaN(motionY[off + v])) {
          motionY[off + v] = prevFrameMotionY[v];
        } else {
          prevFrameMotionY[v] = motionY[off + v];
        }
      }
    }

    // Step 2: build cumulative path per vertex.
    const cX = new Float32Array(n * VERT_COUNT);
    const cY = new Float32Array(n * VERT_COUNT);
    for (let v = 0; v < VERT_COUNT; v++) {
      let cx = 0, cy = 0;
      cX[v] = 0;
      cY[v] = 0;
      for (let f = 1; f < n; f++) {
        cx += motionX[f * VERT_COUNT + v];
        cy += motionY[f * VERT_COUNT + v];
        cX[f * VERT_COUNT + v] = cx;
        cY[f * VERT_COUNT + v] = cy;
      }
    }
    cumX = cX;
    cumY = cY;
    analysis.cumX = cX;
    analysis.cumY = cY;
  }

  // Step 3: temporally smooth each vertex's cum path using a wide
  // Gaussian. Lambda-style L1 would be ideal but ~170 vertices ×
  // 1000 frames × 200 ADMM iterations is too much for the browser
  // main thread. Gaussian + median gives most of the benefit at
  // a fraction of the cost.
  const s = Math.max(0, Math.min(1, smoothing));
  // Cap sigma + medRadius at n/4. Without this, on short clips a wide
  // Gaussian collapses every output sample to ~the mean (mirror-pad
  // reflects the same few samples back), so the smoothed path becomes
  // constant → residual = raw_cum at every frame → mesh saturates the
  // box clamp constantly → output is just zoomed-cropped raw with no
  // benefit from the smoother.
  const sigmaMax = Math.max(2, Math.floor(n / 4));
  const medMax = Math.max(2, Math.floor(n / 8));
  const sigma = Math.min(sigmaMax, 4 + s * 60);
  const medRadius = Math.min(medMax, Math.min(15, 2 + Math.floor(s * 24)));

  const smoothX = new Float32Array(n * VERT_COUNT);
  const smoothY = new Float32Array(n * VERT_COUNT);
  const tmpRaw = new Float32Array(n);
  const tmpOut = new Float32Array(n);

  // Box constraint per vertex. Halved relative to the global
  // stabiliser's budget — applied per vertex, the full `width * crop`
  // would let two adjacent vertices independently deviate in opposite
  // directions, producing inter-vertex shear of 2 × budget. That much
  // local deformation tears the mesh visibly. Half-budget caps the
  // maximum shear at one full crop budget.
  const boxX = analysis.width * crop * 0.5;
  const boxY = analysis.height * crop * 0.5;

  for (let v = 0; v < VERT_COUNT; v++) {
    // X axis
    for (let f = 0; f < n; f++) tmpRaw[f] = cumX![f * VERT_COUNT + v];
    medianAndGaussianAndClamp(tmpRaw, tmpOut, sigma, medRadius, boxX);
    for (let f = 0; f < n; f++) smoothX[f * VERT_COUNT + v] = tmpOut[f];
    // Y axis
    for (let f = 0; f < n; f++) tmpRaw[f] = cumY![f * VERT_COUNT + v];
    medianAndGaussianAndClamp(tmpRaw, tmpOut, sigma, medRadius, boxY);
    for (let f = 0; f < n; f++) smoothY[f * VERT_COUNT + v] = tmpOut[f];
  }

  // Step 4: spatial smoothing per frame on the smoothed paths. Without
  // this, adjacent vertices' smoothers can converge to per-vertex
  // residuals that differ by up to boxX between neighbours, producing
  // wavy distortion within each cell. A 1-pass 3×3 average over each
  // frame's smooth grid keeps inter-vertex motion coherent (the eye
  // is sensitive to *relative* deformation between nearby pixels far
  // more than to absolute camera motion).
  const spatialBuf = new Float32Array(VERT_COUNT);
  for (let f = 0; f < n; f++) {
    const off = f * VERT_COUNT;
    // X axis
    for (let vy = 0; vy < VERT_H; vy++) {
      for (let vx = 0; vx < VERT_W; vx++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = vx + dx;
            const ny = vy + dy;
            if (nx < 0 || nx >= VERT_W || ny < 0 || ny >= VERT_H) continue;
            sum += smoothX[off + ny * VERT_W + nx];
            cnt++;
          }
        }
        spatialBuf[vy * VERT_W + vx] = sum / cnt;
      }
    }
    smoothX.set(spatialBuf, off);
    // Y axis
    for (let vy = 0; vy < VERT_H; vy++) {
      for (let vx = 0; vx < VERT_W; vx++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = vx + dx;
            const ny = vy + dy;
            if (nx < 0 || nx >= VERT_W || ny < 0 || ny >= VERT_H) continue;
            sum += smoothY[off + ny * VERT_W + nx];
            cnt++;
          }
        }
        spatialBuf[vy * VERT_W + vx] = sum / cnt;
      }
    }
    smoothY.set(spatialBuf, off);
  }

  // Re-clamp post-spatial. The 3×3 average mixes a vertex's clamped
  // smoothCum with neighbours' clamped smoothCums; for vertices where
  // neighbours' raw cumX differs (parallax), the spatial average drifts
  // back outside ±box of THIS vertex's cumX. Without this re-clamp,
  // crop=0 (box=0) would still produce non-zero residuals after the
  // spatial pass and the renderer would push UVs out of [0,1] → black
  // bars. Forcing |smoothX - cumX| ≤ box at the end guarantees the
  // residual stays inside the user's chosen crop budget per vertex,
  // and crop=0 produces identity output as expected.
  for (let f = 0; f < n; f++) {
    const off = f * VERT_COUNT;
    for (let i = 0; i < VERT_COUNT; i++) {
      const rx = cumX![off + i];
      const dx = smoothX[off + i] - rx;
      if (dx > boxX) smoothX[off + i] = rx + boxX;
      else if (dx < -boxX) smoothX[off + i] = rx - boxX;
      const ry = cumY![off + i];
      const dy = smoothY[off + i] - ry;
      if (dy > boxY) smoothY[off + i] = ry + boxY;
      else if (dy < -boxY) smoothY[off + i] = ry - boxY;
    }
  }

  return { smoothX, smoothY };
}

function medianAndGaussianAndClamp(
  raw: Float32Array,
  out: Float32Array,
  sigma: number,
  medRadius: number,
  box: number,
) {
  const n = raw.length;
  // Median pre-pass
  const med = new Float32Array(n);
  const buf: number[] = [];
  for (let i = 0; i < n; i++) {
    buf.length = 0;
    for (let k = -medRadius; k <= medRadius; k++) {
      let idx = i + k;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * (n - 1) - idx;
      if (idx < 0) idx = 0;
      buf.push(raw[idx]);
    }
    buf.sort((a, b) => a - b);
    med[i] = buf[buf.length >> 1];
  }
  // Gaussian smooth
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const denom = 2 * sigma * sigma;
  const kernel = new Float32Array(radius * 2 + 1);
  let kSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const v = Math.exp(-(k * k) / denom);
    kernel[k + radius] = v;
    kSum += v;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= kSum;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      let idx = i + k;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * (n - 1) - idx;
      if (idx < 0) idx = 0;
      acc += med[idx] * kernel[k + radius];
    }
    out[i] = acc;
  }
  // Box constraint vs raw
  for (let i = 0; i < n; i++) {
    const diff = out[i] - raw[i];
    if (diff > box) out[i] = raw[i] + box;
    else if (diff < -box) out[i] = raw[i] - box;
  }
}

// Compute per-vertex source UVs for the renderer at a given playback
// time. The vertex POSITIONS are static (fixed identity grid in NDC);
// each vertex's UV says "this OUTPUT pixel should sample THIS source
// pixel".
//
// Math (per vertex):
//   output_uv     = (vx / GRID_W, vy / GRID_H)   — fixed: where the
//                                                  vertex lives on the
//                                                  output canvas, in
//                                                  [0, 1]
//   zoomed_uv     = 0.5 + (output_uv - 0.5) / scaleUp
//                                                — pull toward centre
//                                                  to crop in by
//                                                  `scaleUp` (gives the
//                                                  smoother room to
//                                                  cancel motion)
//   residual      = rawCum - smoothCum           — how far the actual
//                                                  camera drifted from
//                                                  the smoothed
//                                                  virtual camera, in
//                                                  source pixels
//   source_uv     = zoomed_uv + residual / sourceSize
//                                                — shift the sample
//                                                  point so the OUTPUT
//                                                  shows what the
//                                                  smoothed camera
//                                                  would have seen
//
// Sign of the residual: if raw moved +100 px right (rawCum=100) and
// smooth stayed at 0 (smoothCum=0), residual = +100 — the actual frame
// is showing world content shifted +100 in source. To put the same
// world point at OUTPUT centre, we sample from source at a UV that's
// to the right of centre. That matches `+ residual / sourceSize`.
export function meshUVsAtTime(
  analysis: MeshAnalysis,
  smooth: MeshSmoothPath,
  time: number,
  scaleUp: number,
  out: Float32Array,                 // VERT_COUNT*2 — written in place
): void {
  const t = analysis.times;
  const n = analysis.frameCount;
  let f0 = 0, f1 = 0, frac = 0;
  if (n < 2 || time <= t[0]) {
    f0 = f1 = 0;
  } else if (time >= t[n - 1]) {
    f0 = f1 = n - 1;
  } else {
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    f1 = lo;
    f0 = Math.max(0, lo - 1);
    const dt = t[f1] - t[f0];
    frac = dt > 0 ? (time - t[f0]) / dt : 0;
  }

  const w = analysis.width;
  const h = analysis.height;
  const invScaleUp = 1 / Math.max(1e-6, scaleUp);

  // RAW must be the cumulative path (cumX/cumY), not the per-frame
  // delta (motionX/motionY). The smoother stores its output as a
  // smoothed CUMULATIVE path; subtracting a per-frame delta from it
  // produces a residual dominated by -smoothCum (in the 1000s of px),
  // which divided by source width pushes UVs to ±1 and beyond — the
  // out-of-range UVs render as black bars and the visible region
  // becomes a jagged silhouette of whichever vertices happened to be
  // in range. Cumulative minus cumulative is bounded by the smoother's
  // box clamp (≤ width × crop × 0.5), keeping all UVs inside [0, 1].
  // Fallback to identity zoomed UV if cumX hasn't been built yet
  // (smoothMeshPath populates it; we shouldn't render before then,
  // but defensively avoid NaN UVs which fall through the fragment
  // shader's range check and also render as black).
  const cumXSrc = analysis.cumX;
  const cumYSrc = analysis.cumY;
  if (!cumXSrc || !cumYSrc) {
    for (let vy = 0; vy < VERT_H; vy++) {
      for (let vx = 0; vx < VERT_W; vx++) {
        const idx = vy * VERT_W + vx;
        out[idx * 2] = 0.5 + (vx / GRID_W - 0.5) * invScaleUp;
        out[idx * 2 + 1] = 0.5 + (vy / GRID_H - 0.5) * invScaleUp;
      }
    }
    return;
  }

  for (let vy = 0; vy < VERT_H; vy++) {
    for (let vx = 0; vx < VERT_W; vx++) {
      const idx = vy * VERT_W + vx;
      const off0 = f0 * VERT_COUNT + idx;
      const off1 = f1 * VERT_COUNT + idx;
      const rawX = cumXSrc[off0] * (1 - frac) + cumXSrc[off1] * frac;
      const rawY = cumYSrc[off0] * (1 - frac) + cumYSrc[off1] * frac;
      const sX = smooth.smoothX[off0] * (1 - frac) + smooth.smoothX[off1] * frac;
      const sY = smooth.smoothY[off0] * (1 - frac) + smooth.smoothY[off1] * frac;
      const residualX = rawX - sX;
      const residualY = rawY - sY;
      const outputU = vx / GRID_W;
      const outputV = vy / GRID_H;
      const zoomedU = 0.5 + (outputU - 0.5) * invScaleUp;
      const zoomedV = 0.5 + (outputV - 0.5) * invScaleUp;
      out[idx * 2] = zoomedU + residualX / w;
      out[idx * 2 + 1] = zoomedV + residualY / h;
    }
  }
}
