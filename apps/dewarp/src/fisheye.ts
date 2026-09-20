/**
 * Inverse mapping from a rectilinear output pixel to the fisheye source pixel.
 * The source is modelled as an equidistant fisheye (r = f * theta) with one
 * extra radial term, which is what the shader evaluates per pixel. Kept pure
 * so the tests and the uniform packing share one definition.
 */
export type Projection = "rectilinear" | "stereographic";

export type WarpParams = {
  srcWidth: number;
  srcHeight: number;
  fovDeg: number;
  k1: number;
  /** 0 leaves the picture untouched, 1 is the full correction, below 0 adds barrel instead. */
  strength: number;
  /** Straight lines everywhere, or natural shapes with a little bend left in the lines. */
  projection: Projection;
  /** 1 keeps the full frame, above 1 crops into the middle. */
  zoom: number;
};

export type WarpUniforms = {
  srcSize: [number, number];
  fFish: number;
  fOut: number;
  k1: number;
  strength: number;
  zoom: number;
  /** 0 rectilinear, 1 stereographic, as the shader reads it. */
  projection: number;
};

export function warpUniforms(p: WarpParams): WarpUniforms {
  const halfDiag = Math.hypot(p.srcWidth, p.srcHeight) / 2;
  const halfFov = (p.fovDeg * Math.PI) / 360;
  const fFish = halfDiag / halfFov;
  // The output keeps the center magnification, like the camera's own Standard mode: straight
  // lines, the edges of the fisheye view fall outside the frame instead of being stretched into it.
  const fOut = fFish;
  return {
    srcSize: [p.srcWidth, p.srcHeight],
    fFish,
    fOut,
    k1: p.k1,
    strength: p.strength,
    zoom: p.zoom,
    projection: p.projection === "stereographic" ? 1 : 0,
  };
}

/** Same arithmetic as the WGSL, for tests. Input and output are pixel coordinates. */
export function samplePoint(u: WarpUniforms, outX: number, outY: number): [number, number] {
  const cx = u.srcSize[0] / 2;
  const cy = u.srcSize[1] / 2;
  const px = (outX - cx) / u.zoom;
  const py = (outY - cy) / u.zoom;
  const r = Math.hypot(px, py);
  if (r === 0) return [cx, cy];
  // Stereographic keeps local shapes, so a face at the edge stays a face, at the cost of a little bend in the lines.
  const theta = u.projection === 1 ? 2 * Math.atan(r / (2 * u.fOut)) : Math.atan(r / u.fOut);
  const thetaD = theta * (1 + u.k1 * theta * theta);
  const rFish = u.fFish * thetaD;
  const rs = r + (rFish - r) * u.strength;
  return [cx + (px / r) * rs, cy + (py / r) * rs];
}

/** Float32 layout the shader reads: srcSize.xy, fFish, fOut, k1, strength, zoom, projection. */
export function packUniforms(u: WarpUniforms): Float32Array {
  return new Float32Array([u.srcSize[0], u.srcSize[1], u.fFish, u.fOut, u.k1, u.strength, u.zoom, u.projection]);
}
