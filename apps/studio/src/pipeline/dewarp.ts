// Dewarp maths for the Studio (lazy chunk): tool state → the lens uniforms
// the geometry pass reads. Loaded the first time Dewarp is switched on.

import { fitZoom, lensDiagonalFov, warpUniforms, type WarpParams, type WarpUniforms } from "../../../dewarp/src/fisheye.ts";
import { resolveProfile } from "../../../dewarp/src/profiles.ts";
import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";
import type { DewarpState } from "./tools.ts";

/** Dewarp parameters for a clip whose CODED size is w×h (the lens model's frame). */
export function dewarpParams(d: DewarpState, codedW: number, codedH: number, camera?: CameraInfo | null): WarpParams {
  // The clip's own lens for "From clip", a database profile otherwise (HyperSmooth-cropped when the file says so).
  const p = resolveProfile(d.profile, camera ?? undefined);
  const fovDeg = p.lens ? lensDiagonalFov(p.lens, codedW, codedH) : d.fovDeg;
  const base = { srcWidth: codedW, srcHeight: codedH, fovDeg, k1: p.k1, strength: Math.min(1, Math.max(0, d.strength / 100)), projection: d.projection, lens: p.lens };
  const zoom = d.autoZoom ? fitZoom(base, 0.5, 32, 2) : d.zoom;
  return { ...base, zoom };
}

export function dewarpUniforms(d: DewarpState, codedW: number, codedH: number, camera?: CameraInfo | null): WarpUniforms {
  return warpUniforms(dewarpParams(d, codedW, codedH, camera));
}
