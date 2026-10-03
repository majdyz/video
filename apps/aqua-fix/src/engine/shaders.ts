// Shader sources for both backends. The grading maths lives in GRADE_GLSL /
// GRADE_WGSL (see grade-shader.ts); this file holds the plumbing: full-screen
// triangle, source rotation, and the analysis downscale pass.
import { GRADE_GLSL, GRADE_WGSL } from "./grade-shader.ts";

// Upright uv → source uv for a clockwise quarter-turn count r (0..3).
// r=1: the source must be rotated 90° CW to appear upright, so upright
// (x, y) came from source (y, 1-x).
const ROTATE_GLSL = `
vec2 rotateUV(vec2 uv, int r) {
  if (r == 1) return vec2(uv.y, 1.0 - uv.x);
  if (r == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (r == 3) return vec2(1.0 - uv.y, uv.x);
  return uv;
}`;

const ROTATE_WGSL = `
fn rotateUV(uv: vec2<f32>, r: u32) -> vec2<f32> {
  if (r == 1u) { return vec2(uv.y, 1.0 - uv.x); }
  if (r == 2u) { return vec2(1.0 - uv.x, 1.0 - uv.y); }
  if (r == 3u) { return vec2(1.0 - uv.y, uv.x); }
  return uv;
}`;

export const GLSL_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[16]; };
uniform sampler2D u_source;
uniform sampler2D u_data0;
uniform sampler2D u_data1;
uniform sampler2D u_data2;
in vec2 v_uv;
out vec4 o_color;
${ROTATE_GLSL}
${GRADE_GLSL}
void main() {
  int rot = int(p[0].x + 0.5);
  vec2 suv = rotateUV(v_uv, rot);
  vec3 src = texture(u_source, suv).rgb;
  o_color = vec4(grade(src, v_uv), 1.0);
}`;

// Box-filtered downscale of the (rotated) source for CPU analysis. Taps a
// grid inside each output texel so a 4K→320px reduction still averages
// every source pixel it covers instead of point-sampling one in 144.
export const GLSL_DOWNSCALE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform int u_rotation;
uniform vec2 u_srcSize;
uniform vec2 u_outSize;
in vec2 v_uv;
out vec4 o_color;
${ROTATE_GLSL}
void main() {
  // readPixels returns rows bottom-up; flip here so the readback is top-down.
  vec2 v_uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 upright = (u_rotation == 1 || u_rotation == 3) ? u_srcSize.yx : u_srcSize;
  vec2 texel = 1.0 / u_outSize;
  // Taps per axis: enough to cover the source footprint, capped at 8.
  float ratio = max(upright.x / u_outSize.x, upright.y / u_outSize.y);
  int n = int(clamp(ceil(ratio * 0.5), 1.0, 8.0));
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 8; j++) {
    if (j >= n) break;
    for (int i = 0; i < 8; i++) {
      if (i >= n) break;
      vec2 off = (vec2(float(i), float(j)) + 0.5) / float(n) - 0.5;
      vec2 uv = v_uv + off * texel;
      acc += texture(u_source, rotateUV(uv, u_rotation)).rgb;
    }
  }
  o_color = vec4(acc / float(n * n), 1.0);
}`;

export const WGSL_GRADE = `
struct Params { p: array<vec4<f32>, 16> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}
${ROTATE_WGSL}
${GRADE_WGSL}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let rot = u32(params.p[0].x + 0.5);
  let suv = rotateUV(in.uv, rot);
  let src = textureSampleLevel(u_source, samp, suv, 0.0).rgb;
  return vec4(grade(src, in.uv), 1.0);
}`;

export const WGSL_DOWNSCALE = `
struct DownParams { srcSize: vec2<f32>, outSize: vec2<f32>, rotation: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(0) @binding(0) var<uniform> dp: DownParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}
${ROTATE_WGSL}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let rot = u32(dp.rotation + 0.5);
  let upright = select(dp.srcSize, dp.srcSize.yx, rot == 1u || rot == 3u);
  let texel = 1.0 / dp.outSize;
  let ratio = max(upright.x / dp.outSize.x, upright.y / dp.outSize.y);
  let n = i32(clamp(ceil(ratio * 0.5), 1.0, 8.0));
  var acc = vec3<f32>(0.0);
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      let off = (vec2(f32(i), f32(j)) + 0.5) / f32(n) - 0.5;
      let uv = in.uv + off * texel;
      acc += textureSampleLevel(u_source, samp, rotateUV(uv, rot), 0.0).rgb;
    }
  }
  return vec4(acc / f32(n * n), 1.0);
}`;

/** WGSL variants that read the source through a zero-copy external texture (VideoFrames). */
function externalVariant(code: string): string {
  return code
    .replace("var u_source: texture_2d<f32>;", "var u_source: texture_external;")
    .replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g, "textureSampleBaseClampToEdge(u_source, samp, $1)");
}
export const WGSL_GRADE_EXT = externalVariant(WGSL_GRADE);
export const WGSL_DOWNSCALE_EXT = externalVariant(WGSL_DOWNSCALE);
