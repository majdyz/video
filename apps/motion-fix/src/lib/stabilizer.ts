// Similarity-transform video stabilizer.
//
// Pipeline:
//   1. Play the source muted at 2x and capture each decoded frame via
//      requestVideoFrameCallback. Downsample to a 256x144 grayscale thumbnail.
//   2. Track a 5x4 grid of points across consecutive thumbnails using 21x21
//      patch block-matching with sub-pixel parabolic refinement.
//   3. Drop ambiguous / low-texture patches via SAD-landscape confidence.
//   4. RANSAC: random 2-point similarity hypotheses → count inliers within
//      a tight pixel threshold → refit on inliers → final transform.
//   5. Per-frame sanity clamp: any frame-to-frame transform that claims more
//      than ~5 degrees of rotation or 5% scale (almost certainly an
//      estimation error from a fish/caustic/scene cut) gets snapped toward
//      identity. Underwater clips have moving content that fools the tracker;
//      clamping bad frames keeps the cumulative path honest.
//   6. Compose per-frame transforms into a cumulative camera path.
//   7. Smoothing: median pre-filter, L1 path optimisation (ADMM), then a
//      light Gaussian to absorb residual high-frequency estimation noise.
//
// Inspired by Grundmann-Kwatra-Essa (2011), with simplifications for the
// browser. Heavier outlier handling than the paper because underwater scenes
// have a *lot* of independently-moving content.

const THUMB_W = 256;
const THUMB_H = 144;
const MAX_SHIFT = 20;
const PATCH_R = 10; // 21x21 patches
const GRID_X = 5;
const GRID_Y = 4;
const RANSAC_ITERS = 60;
const RANSAC_THRESH = 1.5; // pixels in thumb space
const MAX_FRAME_ROT = 0.09; // ~5 degrees per frame max believable rotation
const MAX_FRAME_SCALE = 0.06; // ~6% per frame max believable scale change

export type SimilarityTransform = {
  a: number;
  b: number;
  tx: number;
  ty: number;
};

export type AnalysisResult = {
  cumA: Float32Array;
  cumB: Float32Array;
  cumTX: Float32Array;
  cumTY: Float32Array;
  // Source media time (seconds) of each captured frame. Looked up at
  // render time via binary search instead of multiplying by an averaged
  // frame rate — that previous approach was off whenever the analyser's
  // captured-frame count didn't match the source's true frame count
  // (browser-dependent rVFC behaviour at playbackRate=2 was the most
  // common cause), and the wrong-frame-index bug applied a different
  // moment's residual transform to the rendered pixels — the user-
  // visible result was output that looked *more* shaky than the input.
  times: Float32Array;
  frameCount: number;
  frameRate: number;
};

type RvfcMetadata = { mediaTime?: number; presentedFrames?: number };
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: RvfcMetadata) => void) => number;
};

export async function analyzeVideo(
  video: HTMLVideoElement,
  onProgress: (p: number) => void,
): Promise<AnalysisResult> {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video has no usable duration");
  }
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) throw new Error("Video has no usable size");

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = THUMB_H;
  const thumbCtx = thumbCanvas.getContext("2d", { willReadFrequently: true });
  if (!thumbCtx) throw new Error("2D canvas unavailable");
  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = "high";

  if (video.readyState < 2) {
    // Wait for `loadeddata` (readyState >= 2 = HAVE_CURRENT_DATA) — that's
    // exactly what the analyser checks for, vs the previous `canplay`
    // listener (HAVE_FUTURE_DATA, stricter). The browser sometimes takes
    // a while to buffer enough for canplay even when the file decodes
    // fine. Also nudge the decoder by setting preload + calling load(),
    // which forces immediate buffering instead of waiting for play().
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
      // Generous timeout — large 4K files on slow devices can take a
      // while to demux + decode the first frame. The error message
      // points at network/format because at 30s the file is almost
      // certainly broken or unsupported, not slow.
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
    // Was previously 2 to halve analysis time, but on compute-bound
    // decoders (4K phone footage) the decoder can't deliver 2× source
    // frames per wallclock second — so rVFC fired with mediaTime
    // gaps of ~0.067s, capturing only 1 of every 4 source frames.
    // Adjacent captured samples then had large residual deltas that
    // showed up as visible kicks in the rendered output. Drop to 1×
    // so the analyser sees every source frame the decoder can deliver.
    video.playbackRate = 1;
  } catch {
    // ignore
  }
  if (video.currentTime > 0.05) {
    await seekToStart(video);
  }

  const scaleX = srcW / THUMB_W;
  const scaleY = srcH / THUMB_H;

  const features: { x: number; y: number }[] = [];
  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      features.push({
        x: Math.round(((gx + 1) * THUMB_W) / (GRID_X + 1)),
        y: Math.round(((gy + 1) * THUMB_H) / (GRID_Y + 1)),
      });
    }
  }

  const cumAArr: number[] = [1];
  const cumBArr: number[] = [0];
  const cumTXArr: number[] = [0];
  const cumTYArr: number[] = [0];
  const timesArr: number[] = [0];
  let lastMediaTime = -1;
  let cumA = 1, cumB = 0, cumTX = 0, cumTY = 0;
  let prevThumb: Uint8Array | null = null;

  const v = video as VideoWithRVFC;

  return new Promise<AnalysisResult>((resolve, reject) => {
    let finished = false;
    let lastWatchdogTime = 0;
    let watchdog: number | null = null;

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
      restore();
      onProgress(1);
      // Detected frame rate is now informational only — the render path
      // does time→idx via binary search over the captured `times` array,
      // not by `Math.round(time * frameRate)`. Kept on the result for
      // any external consumers / debug.
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
      if (watchdog !== null) clearInterval(watchdog);
      restore();
      reject(err);
    };

    const processFrame = (mediaTime: number) => {
      if (video.readyState < 2) return;
      try {
        thumbCtx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
        const img = thumbCtx.getImageData(0, 0, THUMB_W, THUMB_H);
        const gray = toGray(img.data, THUMB_W, THUMB_H);

        if (prevThumb) {
          const t = trackAndFit(prevThumb, gray, features, scaleX, scaleY);
          const newA = t.a * cumA - t.b * cumB;
          const newB = t.b * cumA + t.a * cumB;
          const newTX = t.a * cumTX - t.b * cumTY + t.tx;
          const newTY = t.b * cumTX + t.a * cumTY + t.ty;
          cumA = newA;
          cumB = newB;
          cumTX = newTX;
          cumTY = newTY;
        }
        cumAArr.push(cumA);
        cumBArr.push(cumB);
        cumTXArr.push(cumTX);
        cumTYArr.push(cumTY);
        timesArr.push(mediaTime);
        prevThumb = gray;
      } catch {
        cumAArr.push(cumA);
        cumBArr.push(cumB);
        cumTXArr.push(cumTX);
        cumTYArr.push(cumTY);
        timesArr.push(mediaTime);
      }
      onProgress(Math.min(1, video.currentTime / duration));
    };

    const useRvfc = typeof v.requestVideoFrameCallback === "function";
    if (useRvfc) {
      const onFrame = (_now: number, meta: RvfcMetadata) => {
        if (finished) return;
        // Use the source media time (not wall-clock) so playbackRate=2
        // doesn't double our sample rate, and so we can dedupe re-
        // presented frames if the decoder hands us the same one twice.
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
        watchdog = window.setInterval(() => {
          if (finished) return;
          // Don't trip the stall detector if the tab is backgrounded —
          // Safari/iOS pause decode while not visible, which previously
          // surfaced as a misleading 'Video decoder stalled' error.
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
      })
      .catch((e) =>
        fail(new Error("Couldn't play video for analysis: " + (e instanceof Error ? e.message : String(e)))),
      );
  });
}

async function seekToStart(video: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const onSeeked = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    try {
      video.currentTime = 0;
    } catch {
      done = true;
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }
    setTimeout(() => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }, 2000);
  });
}

function toGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return out;
}

// Patch SAD with stride-2 sampling for speed. The patch is 21x21 = 441 pixels;
// stride-2 evaluates ~110 of them, still enough for a clear minimum.
function patchSad(
  prev: Uint8Array,
  curr: Uint8Array,
  cx: number,
  cy: number,
  w: number,
  sx: number,
  sy: number,
): number {
  const r = PATCH_R;
  let sum = 0;
  for (let dy = -r; dy <= r; dy += 2) {
    const py = cy + dy;
    const cyy = py + sy;
    const prevRow = py * w;
    const currRow = cyy * w;
    for (let dx = -r; dx <= r; dx += 2) {
      const d = prev[prevRow + cx + dx] - curr[currRow + cx + dx + sx];
      sum += d < 0 ? -d : d;
    }
  }
  return sum;
}

function matchPatch(
  prev: Uint8Array,
  curr: Uint8Array,
  cx: number,
  cy: number,
  w: number,
  h: number,
): { dx: number; dy: number; conf: number } | null {
  const r = PATCH_R;
  if (cx - r - MAX_SHIFT < 0 || cx + r + MAX_SHIFT >= w) return null;
  if (cy - r - MAX_SHIFT < 0 || cy + r + MAX_SHIFT >= h) return null;

  let bestSad = Number.POSITIVE_INFINITY;
  let secondSad = Number.POSITIVE_INFINITY;
  let bestX = 0;
  let bestY = 0;
  for (let sy = -MAX_SHIFT; sy <= MAX_SHIFT; sy++) {
    for (let sx = -MAX_SHIFT; sx <= MAX_SHIFT; sx++) {
      const s = patchSad(prev, curr, cx, cy, w, sx, sy);
      if (s < bestSad) {
        secondSad = bestSad;
        bestSad = s;
        bestX = sx;
        bestY = sy;
      } else if (s < secondSad) {
        secondSad = s;
      }
    }
  }

  // Sub-pixel parabolic refine.
  let refX = bestX;
  let refY = bestY;
  if (bestX > -MAX_SHIFT && bestX < MAX_SHIFT) {
    const sm = patchSad(prev, curr, cx, cy, w, bestX - 1, bestY);
    const sp = patchSad(prev, curr, cx, cy, w, bestX + 1, bestY);
    const denom = sm - 2 * bestSad + sp;
    if (denom > 1e-6) {
      const off = (0.5 * (sm - sp)) / denom;
      if (Math.abs(off) < 1) refX = bestX + off;
    }
  }
  if (bestY > -MAX_SHIFT && bestY < MAX_SHIFT) {
    const sm = patchSad(prev, curr, cx, cy, w, bestX, bestY - 1);
    const sp = patchSad(prev, curr, cx, cy, w, bestX, bestY + 1);
    const denom = sm - 2 * bestSad + sp;
    if (denom > 1e-6) {
      const off = (0.5 * (sm - sp)) / denom;
      if (Math.abs(off) < 1) refY = bestY + off;
    }
  }

  // Confidence: how much better is the best vs the second-best minimum?
  // For ambiguous/low-texture patches the SAD landscape is flat and the
  // ratio tends toward 1; we want it well above 1.
  const conf = secondSad / (bestSad + 1);
  return { dx: refX, dy: refY, conf };
}

type Match = { px: number; py: number; qx: number; qy: number };

function trackAndFit(
  prev: Uint8Array,
  curr: Uint8Array,
  features: { x: number; y: number }[],
  scaleX: number,
  scaleY: number,
): SimilarityTransform {
  const matches: Match[] = [];
  for (const f of features) {
    const m = matchPatch(prev, curr, f.x, f.y, THUMB_W, THUMB_H);
    if (!m) continue;
    // Stricter than before (was 1.05). On low-texture underwater frames
    // — clear water columns, uniform sand — block-matching can find a
    // 'best' match that's barely better than chance, then RANSAC fits a
    // similarity through that noise. The smoother passes the noise into
    // the residual transform, and the rendered output ends up MORE
    // shaky than the input. 1.20 keeps confident matches and drops the
    // noisy ones; the smoother handles the resulting frames-with-no-
    // motion gracefully (residual stays at identity).
    if (m.conf < 1.2) continue;
    matches.push({ px: f.x, py: f.y, qx: f.x + m.dx, qy: f.y + m.dy });
  }

  // Need at least 6 (was 4) confident matches to even attempt a fit —
  // a similarity has 4 DoF and we want comfortable over-determination.
  if (matches.length < 6) return { a: 1, b: 0, tx: 0, ty: 0 };

  // RANSAC: random 2-point similarity hypotheses.
  let bestInliers: Match[] = [];
  for (let iter = 0; iter < RANSAC_ITERS; iter++) {
    const i = Math.floor(Math.random() * matches.length);
    let j = Math.floor(Math.random() * matches.length);
    if (j === i) j = (j + 1) % matches.length;
    const m1 = matches[i];
    const m2 = matches[j];
    const fit = fitSimilarityFromTwo(m1, m2);
    if (!fit) continue;
    const inliers: Match[] = [];
    for (const m of matches) {
      const ex = fit.a * m.px - fit.b * m.py + fit.tx - m.qx;
      const ey = fit.b * m.px + fit.a * m.py + fit.ty - m.qy;
      if (ex * ex + ey * ey <= RANSAC_THRESH * RANSAC_THRESH) inliers.push(m);
    }
    if (inliers.length > bestInliers.length) bestInliers = inliers;
    // Early out if we already have a near-consensus.
    if (bestInliers.length >= matches.length * 0.9) break;
  }

  // Need at least 5 (was 3) inliers to trust the result; otherwise
  // return identity. Better to skip a frame than apply a wrong
  // correction that the smoother will then propagate as noise.
  if (bestInliers.length < 5) return { a: 1, b: 0, tx: 0, ty: 0 };

  // Refit on the inlier set via least squares.
  let fit = fitSimilarity(bestInliers);
  if (!fit) return { a: 1, b: 0, tx: 0, ty: 0 };

  // Sanity clamp: per-frame transforms shouldn't claim more than a few
  // degrees of rotation or % of scale change. If they do, the tracker
  // found a spurious match (independently-moving content, motion blur,
  // scene cut) and we should disregard it. Refit translation only on
  // the inliers — the previous fit's tx/ty was computed *under* the
  // spurious rotation, so it's in the wrong frame and would accumulate
  // phantom translation across rotated clips.
  const rotMag = Math.abs(Math.atan2(fit.b, fit.a));
  const scaleMag = Math.abs(Math.sqrt(fit.a * fit.a + fit.b * fit.b) - 1);
  if (rotMag > MAX_FRAME_ROT || scaleMag > MAX_FRAME_SCALE) {
    let sumDx = 0;
    let sumDy = 0;
    for (const m of bestInliers) {
      sumDx += m.qx - m.px;
      sumDy += m.qy - m.py;
    }
    const n = bestInliers.length;
    fit = { a: 1, b: 0, tx: sumDx / n, ty: sumDy / n };
  }
  // Same idea for translation: clamp per-frame translation to a fraction
  // of the thumbnail size. Anything beyond ~25% of the thumb in one frame
  // is a tracker failure.
  const maxTrans = THUMB_W * 0.25;
  if (Math.abs(fit.tx) > maxTrans || Math.abs(fit.ty) > maxTrans) {
    return { a: 1, b: 0, tx: 0, ty: 0 };
  }

  // Convert thumb-space to source-space.
  const avgScale = (scaleX + scaleY) * 0.5;
  return {
    a: fit.a,
    b: fit.b,
    tx: fit.tx * avgScale,
    ty: fit.ty * avgScale,
  };
}

// Closed-form similarity from exactly two correspondences.
function fitSimilarityFromTwo(m1: Match, m2: Match): SimilarityTransform | null {
  const dpx = m2.px - m1.px;
  const dpy = m2.py - m1.py;
  const dqx = m2.qx - m1.qx;
  const dqy = m2.qy - m1.qy;
  const denom = dpx * dpx + dpy * dpy;
  if (denom < 1e-3) return null;
  const a = (dpx * dqx + dpy * dqy) / denom;
  const b = (dpx * dqy - dpy * dqx) / denom;
  const tx = m1.qx - (a * m1.px - b * m1.py);
  const ty = m1.qy - (b * m1.px + a * m1.py);
  return { a, b, tx, ty };
}

function fitSimilarity(matches: Match[]): SimilarityTransform | null {
  const n = matches.length;
  if (n < 2) return null;
  let pcx = 0, pcy = 0, qcx = 0, qcy = 0;
  for (const m of matches) {
    pcx += m.px;
    pcy += m.py;
    qcx += m.qx;
    qcy += m.qy;
  }
  pcx /= n; pcy /= n; qcx /= n; qcy /= n;
  let sumP2 = 0;
  let crossA = 0;
  let crossB = 0;
  for (const m of matches) {
    const dpx = m.px - pcx;
    const dpy = m.py - pcy;
    const dqx = m.qx - qcx;
    const dqy = m.qy - qcy;
    sumP2 += dpx * dpx + dpy * dpy;
    crossA += dpx * dqx + dpy * dqy;
    crossB += dpx * dqy - dpy * dqx;
  }
  if (sumP2 < 1e-6) return null;
  const a = crossA / sumP2;
  const b = crossB / sumP2;
  const tx = qcx - (a * pcx - b * pcy);
  const ty = qcy - (b * pcx + a * pcy);
  return { a, b, tx, ty };
}

export function medianFilter(arr: Float32Array, radius: number): Float32Array {
  if (radius < 1) return arr.slice();
  const n = arr.length;
  const out = new Float32Array(n);
  const buf = new Float32Array(radius * 2 + 1);
  for (let i = 0; i < n; i++) {
    let count = 0;
    for (let k = -radius; k <= radius; k++) {
      let idx = i + k;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * (n - 1) - idx;
      if (idx < 0) idx = 0;
      buf[count++] = arr[idx];
    }
    const view = buf.subarray(0, count);
    view.sort();
    out[i] = view[count >> 1];
  }
  return out;
}

export function gaussianSmooth(arr: Float32Array, sigma: number): Float32Array {
  const n = arr.length;
  if (n === 0 || sigma <= 0) return arr.slice();
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  const denom = 2 * sigma * sigma;
  let kSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / denom);
    kernel[i + radius] = v;
    kSum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= kSum;

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      let idx = i + k;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * (n - 1) - idx;
      if (idx < 0) idx = 0;
      acc += arr[idx] * kernel[k + radius];
    }
    out[i] = acc;
  }
  return out;
}

// L1 path optimisation via ADMM, minus the LP solver.
//   min w * |p - c|^2 + lambda1 |D1 p|_1 + lambda2 |D2 p|_1
//   s.t. |p - c|_inf <= box
//
// `w` (devWeight) is new: scaling the deviation cost down lets the
// smoother actually saturate the box constraint at high lambdas. Without
// it, the unweighted ||p-c||² term dominated and the L1 path stayed
// glued to raw — heavy lambdas only flattened the second derivative,
// not the velocity, so the rendered output still showed the camera
// pan as residual motion.
function l1Smooth(
  c: Float32Array,
  lambda1: number,
  lambda2: number,
  box: number,
  iterations = 200,
  devWeight = 1,
): Float32Array {
  const n = c.length;
  if (n < 3) return c.slice();

  const p = new Float32Array(c);
  const z1 = new Float32Array(n - 1);
  const u1 = new Float32Array(n - 1);
  const z2 = new Float32Array(Math.max(0, n - 2));
  const u2 = new Float32Array(Math.max(0, n - 2));
  const rho1 = 1.0;
  const rho2 = 1.0;

  const d0 = new Float32Array(n);
  const d1 = new Float32Array(n - 1);
  const d2 = new Float32Array(n - 2);
  for (let i = 0; i < n; i++) {
    let dd0 = devWeight;
    if (i === 0 || i === n - 1) dd0 += rho1; else dd0 += 2 * rho1;
    if (i === 0 || i === n - 1) dd0 += rho2;
    else if (i === 1 || i === n - 2) dd0 += 5 * rho2;
    else dd0 += 6 * rho2;
    d0[i] = dd0;
  }
  for (let i = 0; i < n - 1; i++) {
    d1[i] = -rho1;
    if (i === 0 || i === n - 2) d1[i] += -2 * rho2;
    else d1[i] += -4 * rho2;
  }
  for (let i = 0; i < n - 2; i++) d2[i] = rho2;

  const L1 = new Float32Array(n - 1);
  const L2 = new Float32Array(n - 2);
  const D = new Float32Array(n);
  factorPentadiag(d0, d1, d2, L1, L2, D);

  const rhs = new Float32Array(n);
  const tmp = new Float32Array(n);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) rhs[i] = devWeight * c[i];
    for (let i = 0; i < n - 1; i++) {
      const v = rho1 * (z1[i] - u1[i]);
      rhs[i] -= v;
      rhs[i + 1] += v;
    }
    for (let i = 0; i < n - 2; i++) {
      const v = rho2 * (z2[i] - u2[i]);
      rhs[i] += v;
      rhs[i + 1] -= 2 * v;
      rhs[i + 2] += v;
    }
    solvePentadiag(L1, L2, D, rhs, p, tmp);

    if (box > 0 && Number.isFinite(box)) {
      for (let i = 0; i < n; i++) {
        const diff = p[i] - c[i];
        if (diff > box) p[i] = c[i] + box;
        else if (diff < -box) p[i] = c[i] - box;
      }
    }

    const t1 = lambda1 / rho1;
    for (let i = 0; i < n - 1; i++) {
      const v = (p[i + 1] - p[i]) + u1[i];
      z1[i] = v > t1 ? v - t1 : v < -t1 ? v + t1 : 0;
      u1[i] += (p[i + 1] - p[i]) - z1[i];
    }
    const t2 = lambda2 / rho2;
    for (let i = 0; i < n - 2; i++) {
      const v = (p[i + 2] - 2 * p[i + 1] + p[i]) + u2[i];
      z2[i] = v > t2 ? v - t2 : v < -t2 ? v + t2 : 0;
      u2[i] += (p[i + 2] - 2 * p[i + 1] + p[i]) - z2[i];
    }
  }

  return p;
}

function factorPentadiag(
  d0: Float32Array,
  d1: Float32Array,
  d2: Float32Array,
  L1: Float32Array,
  L2: Float32Array,
  D: Float32Array,
): void {
  const n = d0.length;
  for (let i = 0; i < n; i++) {
    let di = d0[i];
    if (i >= 1) di -= L1[i - 1] * L1[i - 1] * D[i - 1];
    if (i >= 2) di -= L2[i - 2] * L2[i - 2] * D[i - 2];
    D[i] = di;
    if (i + 1 < n) {
      let v = d1[i];
      if (i >= 1) v -= L2[i - 1] * L1[i - 1] * D[i - 1];
      L1[i] = v / di;
    }
    if (i + 2 < n) L2[i] = d2[i] / di;
  }
}

function solvePentadiag(
  L1: Float32Array,
  L2: Float32Array,
  D: Float32Array,
  rhs: Float32Array,
  out: Float32Array,
  tmp: Float32Array,
): void {
  const n = D.length;
  for (let i = 0; i < n; i++) {
    let v = rhs[i];
    if (i >= 1) v -= L1[i - 1] * tmp[i - 1];
    if (i >= 2) v -= L2[i - 2] * tmp[i - 2];
    tmp[i] = v;
  }
  for (let i = 0; i < n; i++) tmp[i] /= D[i];
  for (let i = n - 1; i >= 0; i--) {
    let v = tmp[i];
    if (i + 1 < n) v -= L1[i] * out[i + 1];
    if (i + 2 < n) v -= L2[i] * out[i + 2];
    out[i] = v;
  }
}

export type SmoothPath = {
  smoothA: Float32Array;
  smoothB: Float32Array;
  smoothTX: Float32Array;
  smoothTY: Float32Array;
  // Per-frame zoom factor used by the renderer. Pre-computed by sweeping
  // the residual transforms and Gaussian-smoothing the required zoom over
  // ~2 seconds, so the camera "tracks" motion (zooms in for shaky segments,
  // zooms out for steady ones) instead of jerking between frames.
  zoom: Float32Array;
};

export function smoothPath(
  result: AnalysisResult,
  smoothing: number,
  crop: number = 0.1,
  width: number = 1920,
  height: number = 1080,
): SmoothPath {
  const w = penaltiesForSmoothing(smoothing);
  const medRadius = w.medianRadius;
  const aMed = medianFilter(result.cumA, medRadius);
  const bMed = medianFilter(result.cumB, medRadius);
  const txMed = medianFilter(result.cumTX, medRadius);
  const tyMed = medianFilter(result.cumTY, medRadius);

  const txBox = Math.max(1, width * crop);
  const tyBox = Math.max(1, height * crop);
  const abBox = 0.04;

  // At high smoothing, scale the deviation cost down so the L1 path
  // can deviate further from raw and saturate the box constraint.
  // Without this the smoother kept ||p−c||² close to zero (path
  // tracked raw within ~22 px) regardless of how high lambda went.
  const s = Math.max(0, Math.min(1, smoothing));
  const devWeight = Math.max(0.001, 1 - Math.pow(s, 4));

  const aL1 = l1Smooth(aMed, w.lambda1Rs, w.lambda2Rs, abBox, 200, 1);
  const bL1 = l1Smooth(bMed, w.lambda1Rs, w.lambda2Rs, abBox, 200, 1);
  const txL1 = l1Smooth(txMed, w.lambda1T, w.lambda2T, txBox, 200, devWeight);
  const tyL1 = l1Smooth(tyMed, w.lambda1T, w.lambda2T, tyBox, 200, devWeight);

  const gSigma = w.gaussianSigma;
  const smoothA = gaussianSmooth(aL1, gSigma);
  const smoothB = gaussianSmooth(bL1, gSigma);
  const smoothTX = gaussianSmooth(txL1, gSigma);
  const smoothTY = gaussianSmooth(tyL1, gSigma);

  // Compute the per-frame "needed zoom" by sweeping residuals, then
  // smooth it with a wide Gaussian (~2 seconds) so the renderer's zoom
  // moves like a slow-cinema crash zoom rather than jerking each frame.
  // Capped at the user's max zoom; clamping happens in the renderer.
  const maxZoom = 1 / Math.max(0.0001, 1 - 2 * crop);
  const requiredPerFrame = computeRequiredZoomPerFrame(
    result, smoothA, smoothB, smoothTX, smoothTY, width, height,
  );
  // Clamp to a sane range first so a single-frame estimation outlier
  // doesn't push the smoothed zoom up.
  for (let i = 0; i < requiredPerFrame.length; i++) {
    if (requiredPerFrame[i] > maxZoom * 1.5) requiredPerFrame[i] = maxZoom * 1.5;
    if (requiredPerFrame[i] < 1) requiredPerFrame[i] = 1;
  }
  // Heavy median pre-pass + wide Gaussian. Roughly 1s median window, 2s
  // Gaussian window — gives the camera time to pre-zoom before bumps.
  const zoomMed = medianFilter(requiredPerFrame, 15);
  const zoomSmooth = gaussianSmooth(zoomMed, 60);
  // Clamp final zoom to user's max — overflow becomes the renderer's job
  // to handle via residual clamping.
  for (let i = 0; i < zoomSmooth.length; i++) {
    if (zoomSmooth[i] > maxZoom) zoomSmooth[i] = maxZoom;
    if (zoomSmooth[i] < 1) zoomSmooth[i] = 1;
  }

  return { smoothA, smoothB, smoothTX, smoothTY, zoom: zoomSmooth };
}

function computeRequiredZoomPerFrame(
  result: AnalysisResult,
  smoothA: Float32Array,
  smoothB: Float32Array,
  smoothTX: Float32Array,
  smoothTY: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const n = result.frameCount;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ra = result.cumA[i];
    const rb = result.cumB[i];
    const rtx = result.cumTX[i];
    const rty = result.cumTY[i];
    const sa = smoothA[i];
    const sb = smoothB[i];
    const stx = smoothTX[i];
    const sty = smoothTY[i];
    const denom = ra * ra + rb * rb;
    if (denom < 1e-9) { out[i] = 1; continue; }
    const ia = ra / denom;
    const ib = -rb / denom;
    const itx = -(ia * rtx - ib * rty);
    const ity = -(ib * rtx + ia * rty);
    const a = sa * ia - sb * ib;
    const b = sa * ib + sb * ia;
    const tx = sa * itx - sb * ity + stx;
    const ty = sb * itx + sa * ity + sty;
    out[i] = requiredScaleUpForResidual(a, b, tx, ty, width, height);
  }
  return out;
}

function requiredScaleUpForResidual(
  a: number, b: number, tx: number, ty: number,
  w: number, h: number,
): number {
  const r = a * a + b * b;
  if (r < 1e-9) return 1e6;
  const aInv = a / r;
  const bInv = b / r;
  const txInv = -(a * tx + b * ty) / r;
  const tyInv = (b * tx - a * ty) / r;
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  let s = 1;
  for (const cx of [-halfW, halfW]) {
    for (const cy of [-halfH, halfH]) {
      const numX = aInv * cx + bInv * cy;
      const numY = -bInv * cx + aInv * cy;
      const upperX = halfW - txInv;
      const lowerX = -halfW - txInv;
      const upperY = halfH - tyInv;
      const lowerY = -halfH - tyInv;
      if (numX > 0) {
        if (upperX <= 0) return 1e6;
        s = Math.max(s, numX / upperX);
      } else if (numX < 0) {
        if (lowerX >= 0) return 1e6;
        s = Math.max(s, numX / lowerX);
      }
      if (numY > 0) {
        if (upperY <= 0) return 1e6;
        s = Math.max(s, numY / upperY);
      } else if (numY < 0) {
        if (lowerY >= 0) return 1e6;
        s = Math.max(s, numY / lowerY);
      }
    }
  }
  return s;
}

function penaltiesForSmoothing(smoothing: number): {
  lambda1T: number;
  lambda2T: number;
  lambda1Rs: number;
  lambda2Rs: number;
  medianRadius: number;
  gaussianSigma: number;
} {
  const s = Math.max(0, Math.min(1, smoothing));
  // Sextic-in-s ramp: low/mid slider positions stay gentle (typical
  // 'a little less wobble' use), the high end goes hard. The L1 cost
  // function balances ||p-c||² (deviation from raw) against
  // λ·||D¹p||₁ (path velocity). At our previous k_max ≈ 5000 the
  // smoother still chose deviation < ~100 px because deviation-cost
  // dominated past that. Bumping to k_max ≈ 100 000 lets the smoother
  // actually saturate the user's crop budget — the box constraint
  // becomes the binding term, which is what 'maximum stabilisation'
  // intuitively means. Wider Gaussian + larger median window absorb
  // any L1 piecewise-linear corners that remain.
  const k = 0.05 + Math.pow(s, 6) * 100000;
  return {
    lambda1T: k * 4,
    lambda2T: k * 60,
    lambda1Rs: k * 0.005,
    lambda2Rs: k * 0.08,
    medianRadius: Math.min(21, 2 + Math.floor(s * 32)),
    gaussianSigma: 1 + s * 45,
  };
}

export function frameIndexForTime(result: AnalysisResult, time: number): number {
  // Binary-search the captured `times` array for the closest sample.
  // The previous Math.round(time * frameRate) approach produced wrong
  // indices whenever cumArrayLength / duration didn't equal the true
  // source frame rate — most commonly because the analyser ran the
  // video at playbackRate=2 and rVFC's per-callback frequency depends
  // on the browser. The wrong-index lookup caused the rendered output
  // to receive a different frame's residual transform, which the user
  // experienced as 'output is shakier than the input'.
  const t = result.times;
  if (!t || t.length === 0) {
    return Math.max(0, Math.min(result.frameCount - 1, Math.round(time * result.frameRate)));
  }
  if (time <= t[0]) return 0;
  const last = t.length - 1;
  if (time >= t[last]) return last;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first index with times[lo] >= time. Pick whichever of lo
  // and lo-1 is closer.
  if (lo > 0 && time - t[lo - 1] < t[lo] - time) return lo - 1;
  return lo;
}

export function residualTransform(
  result: AnalysisResult,
  smooth: SmoothPath,
  frame: number,
): SimilarityTransform {
  const ra = result.cumA[frame];
  const rb = result.cumB[frame];
  const rtx = result.cumTX[frame];
  const rty = result.cumTY[frame];
  const sa = smooth.smoothA[frame];
  const sb = smooth.smoothB[frame];
  const stx = smooth.smoothTX[frame];
  const sty = smooth.smoothTY[frame];
  const denom = ra * ra + rb * rb;
  if (denom < 1e-9) return { a: 1, b: 0, tx: 0, ty: 0 };
  const ia = ra / denom;
  const ib = -rb / denom;
  const itx = -(ia * rtx - ib * rty);
  const ity = -(ib * rtx + ia * rty);
  const a = sa * ia - sb * ib;
  const b = sa * ib + sb * ia;
  const tx = sa * itx - sb * ity + stx;
  const ty = sb * itx + sa * ity + sty;
  return { a, b, tx, ty };
}

// Interpolate the residual transform between two adjacent captured
// samples. The analyser captures one sample per decoded frame; on
// compute-bound 4K decoders that's only a fraction of the source
// frames. Without interpolation, the residual jumps discretely between
// captured samples — every ~33 ms (or worse) the rendered output
// snaps to a new transform, which the eye reads as added shake.
// Lerping (a, b, tx, ty) linearly is fine for the small rotation
// deltas between adjacent samples.
export function residualTransformAtTime(
  result: AnalysisResult,
  smooth: SmoothPath,
  time: number,
): SimilarityTransform {
  const t = result.times;
  const n = result.frameCount;
  if (!t || t.length === 0 || n < 2) {
    return residualTransform(result, smooth, frameIndexForTime(result, time));
  }
  if (time <= t[0]) return residualTransform(result, smooth, 0);
  if (time >= t[n - 1]) return residualTransform(result, smooth, n - 1);
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  const i0 = Math.max(0, lo - 1);
  const i1 = lo;
  if (i0 === i1) return residualTransform(result, smooth, i0);
  const dt = t[i1] - t[i0];
  if (dt <= 0) return residualTransform(result, smooth, i0);
  const f = (time - t[i0]) / dt;
  const r0 = residualTransform(result, smooth, i0);
  const r1 = residualTransform(result, smooth, i1);
  return {
    a: r0.a + (r1.a - r0.a) * f,
    b: r0.b + (r1.b - r0.b) * f,
    tx: r0.tx + (r1.tx - r0.tx) * f,
    ty: r0.ty + (r1.ty - r0.ty) * f,
  };
}
