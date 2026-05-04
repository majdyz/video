// Scene-cut detection so EMA-tracked color stats can reset instantly
// instead of lagging ~3 s through the smoothing window after a hard cut.
//
// Approach: build a coarse luminance histogram per frame, compare with
// the previous frame using a normalised chi-square distance, and
// threshold. Chi-square is the standard cheap-and-good histogram
// distance for shot-boundary detection — see e.g. Lienhart 1999
// "Comparison of Automatic Shot Boundary Detection Algorithms" SPIE
// Storage and Retrieval for Image and Video Databases VII.

// Y'601 luminance histogram in [0, bins). We use 64 bins by default —
// plenty of resolution for cut detection while keeping the per-frame
// loop tight.
export function computeLuminanceHistogram(
  rgba: Uint8ClampedArray,
  bins = 64,
): Uint32Array {
  const hist = new Uint32Array(bins);
  const scale = bins / 256;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    // Y' = 0.299 R + 0.587 G + 0.114 B (BT.601). Integer math via
    // approximate weights to avoid float per pixel.
    const y = (r * 77 + g * 150 + b * 29) >> 8;
    let bin = (y * scale) | 0;
    if (bin >= bins) bin = bins - 1;
    hist[bin]++;
  }
  return hist;
}

// Symmetric chi-square distance between two histograms, normalised to
// [0,1] by total pixel count so the threshold is resolution-independent.
//
// d = sum_i (a_i - b_i)^2 / (a_i + b_i + eps)  / (2 * N)
//
// 0 = identical, 1 = fully disjoint. A normal cut gives ~0.4–0.7, a
// slow pan stays under ~0.15. Default threshold of 0.35 is the
// midpoint — calibrate against your footage if needed.
export function detectSceneCut(
  prevHistogram: Uint32Array,
  currHistogram: Uint32Array,
  threshold = 0.35,
): boolean {
  if (prevHistogram.length !== currHistogram.length) {
    throw new Error("scene-cut: histogram length mismatch");
  }

  let total = 0;
  for (let i = 0; i < currHistogram.length; i++) total += currHistogram[i];
  if (total === 0) return false;

  let chi = 0;
  const eps = 1;
  for (let i = 0; i < currHistogram.length; i++) {
    const a = prevHistogram[i];
    const b = currHistogram[i];
    const diff = a - b;
    chi += (diff * diff) / (a + b + eps);
  }
  const normalized = chi / (2 * total);
  return normalized > threshold;
}

// Convenience wrapper for callers that want to keep a rolling previous
// histogram and just ask "did the scene cut?" each frame. Returns the
// new histogram so the caller can store it for the next call.
export function detectSceneCutFromFrame(
  prevHistogram: Uint32Array | null,
  rgba: Uint8ClampedArray,
  bins = 64,
  threshold = 0.35,
): { cut: boolean; histogram: Uint32Array } {
  const histogram = computeLuminanceHistogram(rgba, bins);
  if (!prevHistogram) return { cut: false, histogram };
  const cut = detectSceneCut(prevHistogram, histogram, threshold);
  return { cut, histogram };
}
