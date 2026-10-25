// Pure maths of the geometry stage (stabilise + dewarp), mirrored exactly by
// the GLSL in geometry.ts so the tests can check the mapping on the CPU.
//
// Coordinate frames (all normalised 0..1, y down):
//   display  upright picture as the viewer sees it (the <video> element's
//            orientation, the output's orientation)
//   coded    the sensor / stored orientation of the decoded frame; the lens
//            model lives here (a portrait phone clip from an action cam is a
//            landscape sensor frame with rotation metadata)
//
// Per output pixel:
//   out (display) ──stabilise warp──▶ mid (display, dewarped picture)
//                 ──to coded──▶ c ──dewarp: rectilinear → fisheye──▶ c'
//                 ──to the texture's frame──▶ uv
// The stabilise warp is a similarity (plus a small homography residual) and
// is evaluated per mesh vertex; the dewarp is non-linear and is evaluated
// per fragment, so the composition stays exact.

import { samplePoint, type WarpUniforms } from "../../../dewarp/src/fisheye.ts";

/** Clockwise quarter turns from coded to display orientation (container rotation / 90). */
export type QuarterTurns = 0 | 1 | 2 | 3;

export function turnsOf(rotationDeg: number): QuarterTurns {
  const r = ((Math.round(rotationDeg / 90) % 4) + 4) % 4;
  return r as QuarterTurns;
}

/** Display-normalised point → coded-normalised point (same formula as the motion-fix mesh renderer). */
export function displayToCoded(x: number, y: number, rot: QuarterTurns): [number, number] {
  switch (rot) {
    case 1: return [y, 1 - x];
    case 2: return [1 - x, 1 - y];
    case 3: return [1 - y, x];
    default: return [x, y];
  }
}

/** Inverse of displayToCoded. */
export function codedToDisplay(x: number, y: number, rot: QuarterTurns): [number, number] {
  switch (rot) {
    case 1: return [1 - y, x];
    case 2: return [1 - x, 1 - y];
    case 3: return [y, 1 - x];
    default: return [x, y];
  }
}

/** Upright size of a frame stored at codedW×codedH. */
export function displaySize(codedW: number, codedH: number, rot: QuarterTurns): [number, number] {
  return rot % 2 === 1 ? [codedH, codedW] : [codedW, codedH];
}

/** Output pixel (centred, display px) → source pixel (centred, display px); motion-fix's WarpFn. */
export type StabWarp = (x: number, y: number) => readonly [number, number];

export type GeometryParams = {
  rot: QuarterTurns;
  /** Display size of the source in pixels (the stabilise path is in these units). */
  displayW: number;
  displayH: number;
  stab: StabWarp | null;
  /** Dewarp uniforms built for the CODED size, or null when dewarp is off. */
  dewarp: WarpUniforms | null;
};

/** The intermediate (dewarped, display) point a mesh vertex samples; the vertex shader's input. */
export function stabilisedPoint(nx: number, ny: number, p: GeometryParams): [number, number] {
  if (!p.stab) return [nx, ny];
  const [sx, sy] = p.stab((nx - 0.5) * p.displayW, (ny - 0.5) * p.displayH);
  return [sx / p.displayW + 0.5, sy / p.displayH + 0.5];
}

/**
 * Where output pixel (nx, ny) samples the source, as a coded-normalised
 * point; null when it falls outside the picture (rendered black).
 */
export function sourcePoint(nx: number, ny: number, p: GeometryParams): [number, number] | null {
  const [mx, my] = stabilisedPoint(nx, ny, p);
  let [cx, cy] = displayToCoded(mx, my, p.rot);
  if (p.dewarp) {
    const [w, h] = p.dewarp.srcSize;
    const [sx, sy] = samplePoint(p.dewarp, cx * w, cy * h);
    cx = sx / w;
    cy = sy / h;
  }
  if (cx < 0 || cy < 0 || cx > 1 || cy > 1) return null;
  return [cx, cy];
}
