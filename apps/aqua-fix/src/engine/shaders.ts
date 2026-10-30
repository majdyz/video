// Shader sources for both backends. The grading maths lives in GRADE_GLSL /
// GRADE_WGSL (see grade-shader.ts); this file holds the plumbing: full-screen
// triangle, source rotation, and the analysis downscale pass.
import { DETAIL_GLSL, DETAIL_WGSL, GRADE_GLSL, GRADE_WGSL } from "./grade-shader.ts";
import { TP_FINAL_GLSL, TP_FINAL_WGSL } from "./temporal.ts";

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

// Full-screen triangle for every WebGL2 pass (backend-webgl2.ts).
export const GLSL_VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = vec2(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
}`;

export const GLSL_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[25]; };
uniform sampler2D u_source;
uniform sampler2D u_data0;
uniform sampler2D u_data1;
uniform sampler2D u_data2;
uniform sampler2D u_data3;
uniform sampler2D u_tpF0;
uniform sampler2D u_tpF1;
uniform sampler2D u_tpFlow;
uniform sampler2D u_tpPrev;
in vec2 v_uv;
out vec4 o_color;
${ROTATE_GLSL}
${GRADE_GLSL}
${DETAIL_GLSL}
${TP_FINAL_GLSL}
void main() {
  int rot = int(p[0].x + 0.5);
  vec2 suv = rotateUV(v_uv, rot);
  vec3 src = texture(u_source, suv).rgb;
  // Temporal layer (temporal.ts): tracked subject mask as prior, then the
  // anti-crawl correction and the dark-flat-water denoise.
  bool tp = p[23].x > 0.5 && p[23].y > 0.5;
  g_subjPrior = tp ? texture(u_tpF0, tpUV(v_uv)).a : 0.0;
  vec3 base = detailBase(suv, src);
  vec3 col = gradeD(src, base, v_uv);
  if (tp) col = temporalStage(col, src, base, v_uv);
  o_color = vec4(col, 1.0);
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
uniform vec4 u_rect; // sub-rectangle of the upright frame (x, y, w, h in 0..1)
in vec2 v_uv;
out vec4 o_color;
${ROTATE_GLSL}
void main() {
  // readPixels returns rows bottom-up; flip here so the readback is top-down.
  vec2 v_uv = u_rect.xy + vec2(v_uv.x, 1.0 - v_uv.y) * u_rect.zw;
  vec2 upright = (u_rotation == 1 || u_rotation == 3) ? u_srcSize.yx : u_srcSize;
  vec2 texel = u_rect.zw / u_outSize;
  // Taps per axis: enough to cover the source footprint, capped at 8.
  float ratio = max(upright.x * u_rect.z / u_outSize.x, upright.y * u_rect.w / u_outSize.y);
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
struct Params { p: array<vec4<f32>, 25> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
@group(0) @binding(10) var u_data3: texture_2d<f32>;
@group(0) @binding(6) var u_tpF0: texture_2d<f32>;
@group(0) @binding(7) var u_tpF1: texture_2d<f32>;
@group(0) @binding(8) var u_tpFlow: texture_2d<f32>;
@group(0) @binding(9) var u_tpPrev: texture_2d<f32>;
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
${DETAIL_WGSL}
${TP_FINAL_WGSL}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let rot = u32(params.p[0].x + 0.5);
  let suv = rotateUV(in.uv, rot);
  let src = textureSampleLevel(u_source, samp, suv, 0.0).rgb;
  let tp = params.p[23].x > 0.5 && params.p[23].y > 0.5;
  let prior = textureSampleLevel(u_tpF0, samp, tpUV(in.uv), 0.0).a;
  g_subjPrior = select(0.0, prior, tp);
  let base = detailBase(suv, src);
  var col = gradeD(src, base, in.uv);
  let tcol = temporalStage(col, src, base, in.uv);
  if (tp) { col = tcol; }
  return vec4(col, 1.0);
}`;

export const WGSL_DOWNSCALE = `
struct DownParams { srcSize: vec2<f32>, outSize: vec2<f32>, rotation: f32, pad0: f32, pad1: f32, pad2: f32, rect: vec4<f32> };
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
  let base = dp.rect.xy + in.uv * dp.rect.zw;
  let texel = dp.rect.zw / dp.outSize;
  let ratio = max(upright.x * dp.rect.z / dp.outSize.x, upright.y * dp.rect.w / dp.outSize.y);
  let n = i32(clamp(ceil(ratio * 0.5), 1.0, 8.0));
  var acc = vec3<f32>(0.0);
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      let off = (vec2(f32(i), f32(j)) + 0.5) / f32(n) - 0.5;
      let uv = base + off * texel;
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

// Compare wipe. The grade never applies it (the temporal layer's history must
// hold the whole graded frame, or the old line lingers after the wipe moves):
// while the wipe is on, the backends grade into a texture and this pass draws
// the screen from it, showing the "before" picture left of the split. Moving
// the split while paused only re-runs this pass. u_before / u_source is the
// grade's source (rotated like the grade) or a separate upright picture (the
// studio's raw frame when a geometry pass feeds the engine).
export const GLSL_COMPOSITE = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_before;
uniform sampler2D u_graded;
uniform float u_split;
uniform int u_rot;
in vec2 v_uv;
out vec4 o_color;
${ROTATE_GLSL}
void main() {
  if (v_uv.x < u_split) o_color = vec4(texture(u_before, rotateUV(v_uv, u_rot)).rgb, 1.0);
  else o_color = vec4(texelFetch(u_graded, ivec2(gl_FragCoord.xy), 0).rgb, 1.0);
}`;

export const WGSL_COMPOSITE = `
struct CompParams { split: f32, rot: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> cp: CompParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(3) var u_graded: texture_2d<f32>;
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
  let orig = textureSampleLevel(u_source, samp, rotateUV(in.uv, u32(cp.rot + 0.5)), 0.0).rgb;
  let graded = textureLoad(u_graded, vec2<i32>(in.pos.xy), 0).rgb;
  return vec4(select(graded, orig, in.uv.x < cp.split), 1.0);
}`;
export const WGSL_COMPOSITE_EXT = externalVariant(WGSL_COMPOSITE);
