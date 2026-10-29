/**
 * The warp per output pixel: output pixel → ray (rectilinear or stereographic) → fisheye source
 * position through the OpenCV-fisheye lens → resample. Mirrored line for line by the GLSL in
 * webgl.ts and by samplePoint() / cpu-warp.ts for tests.
 *
 * Resampling (params.quality > 0.5): the source footprint of one output pixel comes from the screen
 * space derivatives of the sample position. Where the warp magnifies or keeps scale (almost the whole
 * frame when straightening a fisheye) a Catmull-Rom bicubic built from nine bilinear taps keeps edges
 * crisp instead of the soft single-tap bilinear; where it shrinks (zoomed out past 1:1 at the centre)
 * the footprint is box-filtered with 2×2 or 3×3 bilinear taps so fine detail does not alias.
 * params.quality = 0 is the old single bilinear tap.
 */
export const WARP_WGSL = /* wgsl */ `
struct Params {
  srcSize: vec2<f32>,
  fFish: f32,
  fOut: f32,
  k: vec4<f32>,
  strength: f32,
  zoom: f32,
  projection: f32,
  fy: f32,
  center: vec2<f32>,
  thetaMax: f32,
  quality: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var src: texture_external;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  // One triangle covering the clip space, uv in [0,1] with y down like the picture.
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}

fn tap(uv: vec2<f32>) -> vec4<f32> {
  return textureSampleBaseClampToEdge(src, samp, uv);
}

// Source pixel position for an output position (both in source pixels).
fn warpPoint(o: vec2<f32>) -> vec2<f32> {
  let c = params.srcSize * 0.5;
  let p = (o - c) / params.zoom;
  // Branch free at the centre: the limit of p / r * f * thetaD there is the principal point.
  let r = max(length(p), 1e-4);
  let theta0 = select(atan(r / params.fOut), 2.0 * atan(r / (2.0 * params.fOut)), params.projection > 0.5);
  let theta = min(theta0, params.thetaMax);
  let t2 = theta * theta;
  let thetaD = theta * (1.0 + t2 * (params.k.x + t2 * (params.k.y + t2 * (params.k.z + t2 * params.k.w))));
  let fish = params.center + p / r * vec2(params.fFish, params.fy) * thetaD;
  return mix(c + p, fish, params.strength);
}

// Catmull-Rom from nine bilinear taps (the 4x4 kernel folded onto the hardware filter).
fn bicubic(s: vec2<f32>) -> vec4<f32> {
  let size = params.srcSize;
  let t1 = floor(s - 0.5) + 0.5;
  let f = s - t1;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let a = (t1 - 1.0) / size;
  let b = (t1 + w2 / w12) / size;
  let d = (t1 + 2.0) / size;
  var col = tap(vec2(a.x, a.y)) * (w0.x * w0.y) + tap(vec2(b.x, a.y)) * (w12.x * w0.y) + tap(vec2(d.x, a.y)) * (w3.x * w0.y);
  col += tap(vec2(a.x, b.y)) * (w0.x * w12.y) + tap(vec2(b.x, b.y)) * (w12.x * w12.y) + tap(vec2(d.x, b.y)) * (w3.x * w12.y);
  col += tap(vec2(a.x, d.y)) * (w0.x * w3.y) + tap(vec2(b.x, d.y)) * (w12.x * w3.y) + tap(vec2(d.x, d.y)) * (w3.x * w3.y);
  return clamp(col, vec4(0.0), vec4(1.0));
}

// Box filter over the pixel's source footprint (spanned by dx, dy) with n x n bilinear taps.
fn footprint(s: vec2<f32>, dx: vec2<f32>, dy: vec2<f32>, n: i32) -> vec4<f32> {
  var acc = vec4(0.0);
  let inv = 1.0 / f32(n);
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      let o = (vec2(f32(i), f32(j)) + 0.5) * inv - 0.5;
      acc += tap((s + dx * o.x + dy * o.y) / params.srcSize);
    }
  }
  return acc * (inv * inv);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let s = warpPoint(in.uv * params.srcSize);
  // Derivatives first, in uniform control flow: how far the source moves per output pixel.
  let dx = dpdx(s);
  let dy = dpdy(s);
  let suv = s / params.srcSize;
  if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) {
    return vec4(0.0, 0.0, 0.0, 1.0);
  }
  if (params.quality < 0.5) {
    return tap(suv);
  }
  let m = max(length(dx), length(dy));
  if (m > 1.25) {
    return footprint(s, dx, dy, select(2, 3, m > 2.25));
  }
  return bicubic(s);
}
`;

/** WARP_WGSL reading a plain 2D texture instead of an external one (the copy pipeline in gpu.ts). */
export function warpCopyVariant(code: string): string {
  return code.replace("var src: texture_external;", "var src: texture_2d<f32>;").replaceAll(
    /textureSampleBaseClampToEdge\(src, samp, ([^)]*)\)/g,
    "textureSampleLevel(src, samp, $1, 0.0)"
  );
}
