/**
 * Inverse mapping from a rectilinear output pixel to the fisheye source pixel.
 * The source is modelled with the OpenCV fisheye (Kannala-Brandt) model that
 * lens calibrators such as Gyroflow produce: r = f * θd with
 * θd = θ (1 + k1 θ² + k2 θ⁴ + k3 θ⁶ + k4 θ⁸), separate x/y focal lengths and a
 * principal point. Without a calibrated lens the model degrades to the
 * equidistant guess from the stated field of view with one tweak term. Kept
 * pure so the tests, the shaders and the uniform packing share one definition.
 */
export type Projection = "rectilinear" | "stereographic";

/** A calibrated lens as the OpenCV fisheye model states it, at the calibration frame size. */
export type Lens = {
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  /** k1..k4 of θd = θ (1 + k1 θ² + k2 θ⁴ + k3 θ⁶ + k4 θ⁸). */
  k: [number, number, number, number];
};

export type WarpParams = {
  srcWidth: number;
  srcHeight: number;
  /** Diagonal field of view of the source. With a lens it only trims the focal length away from the calibrated one. */
  fovDeg: number;
  /** Extra radial term; with a lens it is added to the calibrated k1 as a tweak. */
  k1: number;
  /** 0 leaves the picture untouched, 1 is the full correction, below 0 adds barrel instead. */
  strength: number;
  /** Straight lines everywhere, or natural shapes with a little bend left in the lines. */
  projection: Projection;
  /** 1 keeps the full frame, above 1 crops into the middle. */
  zoom: number;
  /** Calibrated lens; scaled to the clip size by width. */
  lens?: Lens;
};

export type WarpUniforms = {
  srcSize: [number, number];
  fFish: number;
  fOut: number;
  k: [number, number, number, number];
  strength: number;
  zoom: number;
  /** 0 rectilinear, 1 stereographic, as the shader reads it. */
  projection: number;
  /** Vertical fisheye focal length (equal to fFish without a calibrated lens). */
  fy: number;
  /** Principal point in source pixels. */
  center: [number, number];
  /** Largest angle the polynomial is trusted for; beyond it the fisheye radius is held. */
  thetaMax: number;
};

/** Distorted angle of the Kannala-Brandt polynomial. */
export function thetaD(theta: number, k: readonly number[]): number {
  const t2 = theta * theta;
  return theta * (1 + t2 * (k[0] + t2 * (k[1] + t2 * (k[2] + t2 * (k[3] ?? 0)))));
}

/**
 * Where the polynomial stops increasing (calibrations rarely see the extreme
 * corners and the high-order terms can turn over there). Capped at 89°.
 */
export function thetaMaxOf(k: readonly number[]): number {
  const cap = (89 * Math.PI) / 180;
  let prev = 0;
  for (let t = 0.01; t <= cap; t += 0.01) {
    const v = thetaD(t, k);
    if (v < prev) return t - 0.01;
    prev = v;
  }
  return cap;
}

/** Scale a calibration to a clip of another size (same lens, same aspect). */
export function scaleLens(lens: Lens, width: number, height: number): Lens {
  const s = width / lens.width;
  const sy = height / lens.height;
  return { width, height, fx: lens.fx * s, fy: lens.fy * sy, cx: lens.cx * s, cy: lens.cy * sy, k: lens.k };
}

/** Diagonal field of view the calibration implies for a frame of the given size, degrees. */
export function lensDiagonalFov(lens: Lens, width: number, height: number): number {
  const l = scaleLens(lens, width, height);
  const halfDiag = Math.hypot(width, height) / 2;
  const tMax = thetaMaxOf(l.k);
  // Bisect r(θ) = fx θd(θ) = halfDiag on the monotone range; a corner past the range gets the range limit.
  let lo = 0, hi = tMax;
  if (l.fx * thetaD(tMax, l.k) < halfDiag) return (2 * tMax * 180) / Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (l.fx * thetaD(mid, l.k) < halfDiag) lo = mid; else hi = mid;
  }
  return ((lo + hi) * 180) / Math.PI;
}

export function warpUniforms(p: WarpParams): WarpUniforms {
  const halfDiag = Math.hypot(p.srcWidth, p.srcHeight) / 2;
  const halfFov = (p.fovDeg * Math.PI) / 360;
  let fFish = halfDiag / halfFov;
  let fy = fFish;
  let k: [number, number, number, number] = [p.k1, 0, 0, 0];
  let center: [number, number] = [p.srcWidth / 2, p.srcHeight / 2];
  if (p.lens) {
    const l = scaleLens(p.lens, p.srcWidth, p.srcHeight);
    // The FOV slider trims the calibrated focal length: a wider stated view means a shorter focal length.
    const calibFov = lensDiagonalFov(p.lens, p.srcWidth, p.srcHeight);
    const trim = calibFov / p.fovDeg;
    fFish = l.fx * trim;
    fy = l.fy * trim;
    k = [l.k[0] + p.k1, l.k[1], l.k[2], l.k[3]];
    center = [l.cx, l.cy];
  }
  // The output keeps the center magnification, like the camera's own Standard mode: straight
  // lines, the edges of the fisheye view fall outside the frame instead of being stretched into it.
  const fOut = fFish;
  return {
    srcSize: [p.srcWidth, p.srcHeight],
    fFish,
    fOut,
    k,
    strength: p.strength,
    zoom: p.zoom,
    projection: p.projection === "stereographic" ? 1 : 0,
    fy,
    center,
    thetaMax: thetaMaxOf(k),
  };
}

/** Same arithmetic as the WGSL, for tests. Input and output are pixel coordinates. */
export function samplePoint(u: WarpUniforms, outX: number, outY: number): [number, number] {
  const cx = u.srcSize[0] / 2;
  const cy = u.srcSize[1] / 2;
  const px = (outX - cx) / u.zoom;
  const py = (outY - cy) / u.zoom;
  const r = Math.hypot(px, py);
  if (r === 0) return [cx + (u.center[0] - cx) * u.strength, cy + (u.center[1] - cy) * u.strength];
  // Stereographic keeps local shapes, so a face at the edge stays a face, at the cost of a little bend in the lines.
  const theta0 = u.projection === 1 ? 2 * Math.atan(r / (2 * u.fOut)) : Math.atan(r / u.fOut);
  const theta = Math.min(theta0, u.thetaMax);
  const td = thetaD(theta, u.k);
  // Fisheye position around the principal point, with the calibrated x/y focal lengths.
  const fx = u.center[0] + (px / r) * u.fFish * td;
  const fy = u.center[1] + (py / r) * u.fy * td;
  // Strength blends between the untouched pixel and the fisheye sample.
  return [cx + px + (fx - (cx + px)) * u.strength, cy + py + (fy - (cy + py)) * u.strength];
}

/**
 * Float32 layout the shader reads (16 floats, 64 bytes):
 * srcSize.xy, fFish, fOut, k1..k4, strength, zoom, projection, fy, center.xy, thetaMax, pad.
 */
export const UNIFORM_FLOATS = 16;
export function packUniforms(u: WarpUniforms): Float32Array {
  return new Float32Array([
    u.srcSize[0], u.srcSize[1], u.fFish, u.fOut,
    u.k[0], u.k[1], u.k[2], u.k[3],
    u.strength, u.zoom, u.projection, u.fy,
    u.center[0], u.center[1], u.thetaMax, 0,
  ]);
}
