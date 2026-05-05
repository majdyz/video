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
  // confident estimate (gets in-painted from neighbours / temporal
  // priors during smoothing).
  motionX: Float32Array;
  motionY: Float32Array;
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
): Promise<MeshAnalysis> {
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
  // First frame: zero motion (no previous to compare).
  motionXFrames.push(new Float32Array(VERT_COUNT));
  motionYFrames.push(new Float32Array(VERT_COUNT));
  times.push(0);

  const cellWaw = aw / GRID_W;
  const cellHah = ah / GRID_H;
  const radius = VERTEX_RADIUS_FRAC * cellWaw;
  const radius2 = radius * radius;
  const scaleBackX = srcW / aw;
  const scaleBackY = srcH / ah;
  const sampleScratch: number[] = [];

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

    const finish = () => {
      if (finished) return;
      finished = true;
      if (watchdog !== null) clearInterval(watchdog);
      cleanup();
      restore();
      onProgress(1);
      const n = motionXFrames.length;
      const flatX = new Float32Array(n * VERT_COUNT);
      const flatY = new Float32Array(n * VERT_COUNT);
      for (let i = 0; i < n; i++) {
        flatX.set(motionXFrames[i], i * VERT_COUNT);
        flatY.set(motionYFrames[i], i * VERT_COUNT);
      }
      const detectedRate = duration > 0 ? n / duration : 30;
      resolve({
        motionX: flatX,
        motionY: flatY,
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
          // Collect inlier tracks: (sx, sy, dx, dy)
          const tracks: { sx: number; sy: number; dx: number; dy: number }[] = [];
          const n = prevPts.rows;
          for (let i = 0; i < n; i++) {
            if (status.data[i] !== 1) continue;
            const sx = prevPts.data32F[i * 2];
            const sy = prevPts.data32F[i * 2 + 1];
            const ex = nextPts.data32F[i * 2];
            const ey = nextPts.data32F[i * 2 + 1];
            const dx = ex - sx;
            const dy = ey - sy;
            // Drop wild tracks (>25% of frame in one step → tracker fail)
            if (Math.abs(dx) > aw * 0.25 || Math.abs(dy) > ah * 0.25) continue;
            tracks.push({ sx, sy, dx, dy });
          }

          // For each vertex, gather tracks within radius and take
          // median dx, median dy. Vertices with fewer than 3 nearby
          // tracks get NaN (filled in by temporal smoother / spatial
          // median later).
          for (let vy = 0; vy < VERT_H; vy++) {
            for (let vx = 0; vx < VERT_W; vx++) {
              const px = vx * cellWaw;
              const py = vy * cellHah;
              sampleScratch.length = 0;
              for (let k = 0; k < tracks.length; k++) {
                const t = tracks[k];
                const ddx = t.sx - px;
                const ddy = t.sy - py;
                if (ddx * ddx + ddy * ddy <= radius2) {
                  sampleScratch.push(k);
                }
              }
              const idx = vy * VERT_W + vx;
              if (sampleScratch.length < 3) {
                motionX[idx] = NaN;
                motionY[idx] = NaN;
              } else {
                const xs: number[] = [];
                const ys: number[] = [];
                for (const k of sampleScratch) {
                  xs.push(tracks[k].dx);
                  ys.push(tracks[k].dy);
                }
                xs.sort((a, b) => a - b);
                ys.sort((a, b) => a - b);
                const mid = xs.length >> 1;
                // Convert from analyser-resolution back to source pixels
                motionX[idx] = xs[mid] * scaleBackX;
                motionY[idx] = ys[mid] * scaleBackY;
              }
            }
          }
        }

        // Re-detect features when too few survived.
        const inlierCount = (status && nextPts)
          ? Array.from(status.data).filter((s) => s === 1).length
          : 0;
        if (prevPts) prevPts.delete();
        if (inlierCount < 200 || !nextPts || !status) {
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

  // Step 1: spatial in-paint per frame. Replace NaN at vertex v with
  // average of non-NaN neighbours within a 1-cell radius. Iterate up
  // to 4 times to fill in larger gaps.
  const motionX = new Float32Array(analysis.motionX);
  const motionY = new Float32Array(analysis.motionY);
  for (let pass = 0; pass < 4; pass++) {
    for (let f = 0; f < n; f++) {
      const off = f * VERT_COUNT;
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
          }
        }
      }
    }
  }
  // Anything still NaN becomes 0 (no motion estimate at all).
  for (let i = 0; i < motionX.length; i++) {
    if (Number.isNaN(motionX[i])) motionX[i] = 0;
    if (Number.isNaN(motionY[i])) motionY[i] = 0;
  }

  // Step 2: build cumulative path per vertex.
  const cumX = new Float32Array(n * VERT_COUNT);
  const cumY = new Float32Array(n * VERT_COUNT);
  for (let v = 0; v < VERT_COUNT; v++) {
    let cx = 0, cy = 0;
    cumX[v] = 0;
    cumY[v] = 0;
    for (let f = 1; f < n; f++) {
      cx += motionX[f * VERT_COUNT + v];
      cy += motionY[f * VERT_COUNT + v];
      cumX[f * VERT_COUNT + v] = cx;
      cumY[f * VERT_COUNT + v] = cy;
    }
  }

  // Step 3: temporally smooth each vertex's cum path using a wide
  // Gaussian. Lambda-style L1 would be ideal but ~170 vertices ×
  // 1000 frames × 200 ADMM iterations is too much for the browser
  // main thread. Gaussian + median gives most of the benefit at
  // a fraction of the cost.
  const s = Math.max(0, Math.min(1, smoothing));
  const sigma = 4 + s * 60; // up to ~60 samples wide gaussian
  const medRadius = Math.min(15, 2 + Math.floor(s * 24));

  const smoothX = new Float32Array(n * VERT_COUNT);
  const smoothY = new Float32Array(n * VERT_COUNT);
  const tmpRaw = new Float32Array(n);
  const tmpOut = new Float32Array(n);

  // Box constraint per vertex — the smoothed path can deviate up to
  // `crop * width` from raw. Same intuition as the global stabiliser.
  const boxX = analysis.width * crop;
  const boxY = analysis.height * crop;

  for (let v = 0; v < VERT_COUNT; v++) {
    // X axis
    for (let f = 0; f < n; f++) tmpRaw[f] = cumX[f * VERT_COUNT + v];
    medianAndGaussianAndClamp(tmpRaw, tmpOut, sigma, medRadius, boxX);
    for (let f = 0; f < n; f++) smoothX[f * VERT_COUNT + v] = tmpOut[f];
    // Y axis
    for (let f = 0; f < n; f++) tmpRaw[f] = cumY[f * VERT_COUNT + v];
    medianAndGaussianAndClamp(tmpRaw, tmpOut, sigma, medRadius, boxY);
    for (let f = 0; f < n; f++) smoothY[f * VERT_COUNT + v] = tmpOut[f];
  }

  // Step 4: store the cumulative raw path back into the analysis
  // result by overwriting motionX/Y with cum (we no longer need the
  // per-frame deltas after smoothing).
  analysis.motionX = cumX;
  analysis.motionY = cumY;

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

  for (let vy = 0; vy < VERT_H; vy++) {
    for (let vx = 0; vx < VERT_W; vx++) {
      const idx = vy * VERT_W + vx;
      const off0 = f0 * VERT_COUNT + idx;
      const off1 = f1 * VERT_COUNT + idx;
      const rawX = analysis.motionX[off0] * (1 - frac) + analysis.motionX[off1] * frac;
      const rawY = analysis.motionY[off0] * (1 - frac) + analysis.motionY[off1] * frac;
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
