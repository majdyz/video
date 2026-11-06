// Dewarp maths for the Studio (lazy chunk): tool state → the lens uniforms
// the geometry pass reads. Loaded the first time Dewarp is switched on.

import { fitZoom, fovFromF35, lensDiagonalFov, PHONE_UW_F35, warpUniforms, type WarpParams, type WarpUniforms } from "../../../dewarp/src/fisheye.ts";
import { resolveProfile } from "../../../dewarp/src/profiles.ts";
import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";
import type { DewarpState } from "./tools.ts";

/** Dewarp parameters for a clip whose CODED size is w×h (the lens model's frame). */
export function dewarpParams(d: DewarpState, codedW: number, codedH: number, camera?: CameraInfo | null, rotated = false): WarpParams {
  // The clip's own lens for "From clip", a database profile otherwise (HyperSmooth-cropped when the file says so).
  const p = resolveProfile(d.profile, camera ?? undefined);
  // Phone 0.5×: the photo's own 35 mm-equivalent focal length when its EXIF has one.
  const fovDeg = p.lens ? lensDiagonalFov(p.lens, codedW, codedH) : p.rectilinear ? (camera?.focal35 ? fovFromF35(camera.focal35) : fovFromF35(PHONE_UW_F35)) : d.fovDeg;
  const base: Omit<WarpParams, "zoom"> = {
    srcWidth: codedW, srcHeight: codedH, fovDeg, k1: p.k1, strength: Math.min(1, Math.max(0, d.strength / 100)), projection: d.projection, lens: p.lens,
    rectilinear: p.rectilinear, axisY: !!p.rectilinear && !!rotated,
  };
  const zoom = d.autoZoom ? fitZoom(base, 0.5, 32, 2) : d.zoom;
  return { ...base, zoom };
}

/** `rotated`: the clip is stored a quarter turn from upright (the stretch fix works along the picture's horizontal). */
export function dewarpUniforms(d: DewarpState, codedW: number, codedH: number, camera?: CameraInfo | null, rotated = false): WarpUniforms {
  return warpUniforms(dewarpParams(d, codedW, codedH, camera, rotated));
}
