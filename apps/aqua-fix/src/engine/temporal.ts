// Temporal layer shaders (see TEMPORAL in params.ts). Three passes at 1/8 of
// the upright output size run before the full-resolution grade:
//   1. lum   — box-ish downscale of the source: rgb (sRGB) + luma in alpha
//   2. flow  — block matching of 3×3 luma patches against the previous
//              frame's lum texture: (dx, dy, confidence) in texels
//   3. field — the grade at low resolution with the warped previous subject
//              mask as prior; writes the stabilised correction (graded /
//              source per channel, blended in the log domain with the warped
//              history) + the tracked mask (target 0, next frame's history)
//              and stabilised / current + mask (target 1, read by the grade)
// The full-resolution grade (shaders.ts) then multiplies its output by
// stabilised / current, uses the tracked mask as subject prior, and blends
// dark flat water with the flow-warped previous output.
//
// Texture-space convention: every temporal texture is rendered with the same
// full-screen triangle as the grade, so in WebGL2 its rows run bottom-up
// (texture v = 1 − upright v) and in WebGPU top-down (texture v = upright v);
// flow vectors live in texture space, so warps are consistent per API.
import { GRADE_GLSL, GRADE_WGSL } from "./grade-shader.ts";
import { TEMPORAL } from "./params.ts";

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

const f = (x: number) => x.toFixed(6);
/** Constants shared by the temporal passes and the final grade (GLSL). */
export const TP_CONSTS_GLSL = `
const int TP_R = ${TEMPORAL.flowR};
const float TP_LAMBDA = ${f(TEMPORAL.lambda)};
const float TP_SAD_LO = ${f(TEMPORAL.sadLo)};
const float TP_SAD_HI = ${f(TEMPORAL.sadHi)};
const float TP_BETA = ${f(TEMPORAL.betaMax)};
const float TP_BDIFF = ${f(TEMPORAL.betaDiff)};
const float TP_KMIN = ${f(TEMPORAL.kMin)};
const float TP_KMAX = ${f(TEMPORAL.kMax)};
const float TP_DECAY = ${f(TEMPORAL.decay)};
const float TP_SUP_R = ${f(TEMPORAL.supportR)};
const float TP_SUP_LO = ${f(TEMPORAL.supportLo)};
const float TP_SUP_HI = ${f(TEMPORAL.supportHi)};
const float TP_DENOISE = ${f(TEMPORAL.denoise)};
const float TP_TAU = ${f(TEMPORAL.tau)};
const float TP_FLAT_LO = ${f(TEMPORAL.flatLo)};
const float TP_FLAT_HI = ${f(TEMPORAL.flatHi)};
const float TP_DARK_LO = ${f(TEMPORAL.darkLo)};
const float TP_DARK_HI = ${f(TEMPORAL.darkHi)};
`;
export const TP_CONSTS_WGSL = TP_CONSTS_GLSL.replace("const int TP_R = ", "const TP_R: i32 = ").replace(/const float (\w+) = ([^;]+);/g, "const $1: f32 = $2;");

const VS_WGSL = `
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}`;

const HEAD_GLSL = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[24]; };`;

// ---------------------------------------------------------------- pass 1: lum
export const GLSL_TP_LUM = `${HEAD_GLSL}
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 o_color;
${ROTATE_GLSL}
void main() {
  int rot = int(p[0].x + 0.5);
  vec2 ts = vec2(textureSize(u_source, 0));
  vec2 up = (rot == 1 || rot == 3) ? ts.yx : ts;
  vec2 o = 2.0 / up;
  vec3 c = texture(u_source, rotateUV(v_uv + vec2(-o.x, -o.y), rot)).rgb
         + texture(u_source, rotateUV(v_uv + vec2(o.x, -o.y), rot)).rgb
         + texture(u_source, rotateUV(v_uv + vec2(-o.x, o.y), rot)).rgb
         + texture(u_source, rotateUV(v_uv + vec2(o.x, o.y), rot)).rgb;
  c *= 0.25;
  o_color = vec4(c, dot(c, vec3(0.2126, 0.7152, 0.0722)));
}`;
export const WGSL_TP_LUM = `
struct Params { p: array<vec4<f32>, 24> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
${VS_WGSL}
${ROTATE_WGSL}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let rot = u32(params.p[0].x + 0.5);
  let ts = vec2<f32>(textureDimensions(u_source));
  let up = select(ts, ts.yx, rot == 1u || rot == 3u);
  let o = 2.0 / up;
  var c = textureSampleLevel(u_source, samp, rotateUV(in.uv + vec2(-o.x, -o.y), rot), 0.0).rgb;
  c += textureSampleLevel(u_source, samp, rotateUV(in.uv + vec2(o.x, -o.y), rot), 0.0).rgb;
  c += textureSampleLevel(u_source, samp, rotateUV(in.uv + vec2(-o.x, o.y), rot), 0.0).rgb;
  c += textureSampleLevel(u_source, samp, rotateUV(in.uv + vec2(o.x, o.y), rot), 0.0).rgb;
  c *= 0.25;
  return vec4(c, dot(c, vec3(0.2126, 0.7152, 0.0722)));
}`;

// --------------------------------------------------------------- pass 2: flow
export const GLSL_TP_FLOW = `${HEAD_GLSL}
uniform sampler2D u_lum;
uniform sampler2D u_lumPrev;
out vec4 o_color;
${TP_CONSTS_GLSL}
void main() {
  ivec2 x = ivec2(gl_FragCoord.xy);
  ivec2 hi = textureSize(u_lum, 0) - 1;
  float c[9];
  int k = 0;
  for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) { c[k] = texelFetch(u_lum, clamp(x + ivec2(ox, oy), ivec2(0), hi), 0).a; k++; }
  float best = 1e9;
  vec2 bd = vec2(0.0);
  for (int dy = -TP_R; dy <= TP_R; dy++) {
    for (int dx = -TP_R; dx <= TP_R; dx++) {
      float s = 0.0;
      int j = 0;
      for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
        s += abs(c[j] - texelFetch(u_lumPrev, clamp(x + ivec2(ox + dx, oy + dy), ivec2(0), hi), 0).a);
        j++;
      }
      s = s / 9.0 + TP_LAMBDA * length(vec2(float(dx), float(dy)));
      if (s < best) { best = s; bd = vec2(float(dx), float(dy)); }
    }
  }
  o_color = vec4(bd, 1.0 - smoothstep(TP_SAD_LO, TP_SAD_HI, best), 1.0);
}`;
export const WGSL_TP_FLOW = `
@group(0) @binding(0) var u_lum: texture_2d<f32>;
@group(0) @binding(1) var u_lumPrev: texture_2d<f32>;
${VS_WGSL}
${TP_CONSTS_WGSL}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let x = vec2<i32>(in.pos.xy);
  let hi = vec2<i32>(textureDimensions(u_lum)) - 1;
  var c: array<f32, 9>;
  var k = 0;
  for (var oy = -1; oy <= 1; oy++) { for (var ox = -1; ox <= 1; ox++) { c[k] = textureLoad(u_lum, clamp(x + vec2<i32>(ox, oy), vec2<i32>(0), hi), 0).a; k++; } }
  var best = 1e9;
  var bd = vec2<f32>(0.0);
  for (var dy = -TP_R; dy <= TP_R; dy++) {
    for (var dx = -TP_R; dx <= TP_R; dx++) {
      var s = 0.0;
      var j = 0;
      for (var oy = -1; oy <= 1; oy++) { for (var ox = -1; ox <= 1; ox++) {
        s += abs(c[j] - textureLoad(u_lumPrev, clamp(x + vec2<i32>(ox + dx, oy + dy), vec2<i32>(0), hi), 0).a);
        j++;
      } }
      s = s / 9.0 + TP_LAMBDA * length(vec2<f32>(f32(dx), f32(dy)));
      if (s < best) { best = s; bd = vec2<f32>(f32(dx), f32(dy)); }
    }
  }
  return vec4(bd, 1.0 - smoothstep(TP_SAD_LO, TP_SAD_HI, best), 1.0);
}`;

// -------------------------------------------------------------- pass 3: field
export const GLSL_TP_FIELD = `${HEAD_GLSL}
uniform sampler2D u_data0;
uniform sampler2D u_data1;
uniform sampler2D u_data2;
uniform sampler2D u_lum;
uniform sampler2D u_flow;
uniform sampler2D u_histf;
in vec2 v_uv;
layout(location = 0) out vec4 o_f0;
layout(location = 1) out vec4 o_f1;
${TP_CONSTS_GLSL}
${GRADE_GLSL}
void main() {
  ivec2 x = ivec2(gl_FragCoord.xy);
  ivec2 hi = textureSize(u_lum, 0) - 1;
  vec4 lm = texelFetch(u_lum, x, 0);
  vec4 fl = texelFetch(u_flow, x, 0);
  vec4 hist = texelFetch(u_histf, clamp(x + ivec2(round(fl.xy)), ivec2(0), hi), 0);
  float conf = fl.z * step(0.5, p[23].x);
  vec2 sr = TP_SUP_R / vec2(textureSize(u_data0, 0));
  float sup = mapConf(v_uv);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    sup = max(sup, mapConf(v_uv + vec2(cos(a), sin(a)) * sr));
  }
  g_subjPrior = hist.a * conf * TP_DECAY * smoothstepf(TP_SUP_LO, TP_SUP_HI, sup);
  vec3 g = gradeD(lm.rgb, lm.rgb, v_uv);
  vec3 cur = (srgbToLinear(g) + 0.003) / (srgbToLinear(lm.rgb) + 0.003);
  vec3 lc = log(cur);
  vec3 lp = log(max(hist.rgb, vec3(1e-4)));
  vec3 dd = abs(lc - lp);
  float d = max(dd.x, max(dd.y, dd.z));
  float beta = TP_BETA * conf * exp(-(d * d) / (TP_BDIFF * TP_BDIFF));
  vec3 stab = exp(mix(lc, lp, beta));
  o_f0 = vec4(stab, g_subjOut);
  o_f1 = vec4(stab / cur, g_subjOut);
}`;
export const WGSL_TP_FIELD = `
struct Params { p: array<vec4<f32>, 24> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
@group(0) @binding(6) var u_lum: texture_2d<f32>;
@group(0) @binding(7) var u_flow: texture_2d<f32>;
@group(0) @binding(8) var u_histf: texture_2d<f32>;
struct FieldOut { @location(0) f0: vec4<f32>, @location(1) f1: vec4<f32> };
${VS_WGSL}
${TP_CONSTS_WGSL}
${GRADE_WGSL}
@fragment fn fs(in: VSOut) -> FieldOut {
  let x = vec2<i32>(in.pos.xy);
  let hi = vec2<i32>(textureDimensions(u_lum)) - 1;
  let lm = textureLoad(u_lum, x, 0);
  let fl = textureLoad(u_flow, x, 0);
  let hist = textureLoad(u_histf, clamp(x + vec2<i32>(round(fl.xy)), vec2<i32>(0), hi), 0);
  let conf = fl.z * step(0.5, params.p[23].x);
  let sr = TP_SUP_R / vec2<f32>(textureDimensions(u_data0, 0));
  var sup = mapConf(in.uv);
  for (var i = 0; i < 8; i++) {
    let a = f32(i) * 0.7853982;
    sup = max(sup, mapConf(in.uv + vec2<f32>(cos(a), sin(a)) * sr));
  }
  g_subjPrior = hist.a * conf * TP_DECAY * smoothstepf(TP_SUP_LO, TP_SUP_HI, sup);
  let g = gradeD(lm.rgb, lm.rgb, in.uv);
  let cur = (srgbToLinear(g) + 0.003) / (srgbToLinear(lm.rgb) + 0.003);
  let lc = log(cur);
  let lp = log(max(hist.rgb, vec3<f32>(1e-4)));
  let dd = abs(lc - lp);
  let d = max(dd.x, max(dd.y, dd.z));
  let beta = TP_BETA * conf * exp(-(d * d) / (TP_BDIFF * TP_BDIFF));
  let stab = exp(mix(lc, lp, vec3<f32>(beta)));
  var o: FieldOut;
  o.f0 = vec4(stab, g_subjOut);
  o.f1 = vec4(stab / cur, g_subjOut);
  return o;
}`;

// ------------------------------------------------ final-grade temporal stage
/**
 * Appended to the full-resolution grade: `temporalStage(col, src, base, uv)`
 * (after gradeD, which read g_subjPrior from the tracked mask).
 */
export const TP_FINAL_GLSL = `
${TP_CONSTS_GLSL}
vec2 tpUV(vec2 uv) { return vec2(uv.x, 1.0 - uv.y); }
vec3 temporalStage(vec3 col, vec3 src, vec3 base, vec2 uv) {
  vec2 tuv = tpUV(uv);
  vec3 kk = clamp(texture(u_tpF1, tuv).rgb, vec3(TP_KMIN), vec3(TP_KMAX));
  col = linearToSrgb(srgbToLinear(col) * kk);
  vec4 fl = texture(u_tpFlow, tuv);
  vec3 prev = texture(u_tpPrev, tuv + fl.xy / vec2(textureSize(u_tpFlow, 0))).rgb;
  float flatness = 1.0 - smoothstep(TP_FLAT_LO, TP_FLAT_HI, abs(dot(src - base, vec3(0.2126, 0.7152, 0.0722))));
  float dark = 1.0 - smoothstep(TP_DARK_LO, TP_DARK_HI, dot(col, vec3(0.2126, 0.7152, 0.0722)));
  vec3 dv = col - prev;
  float w = TP_DENOISE * fl.z * flatness * dark * (1.0 - clamp(g_subjOut, 0.0, 1.0)) * exp(-dot(dv, dv) / (TP_TAU * TP_TAU));
  return mix(col, prev, w);
}`;
export const TP_FINAL_WGSL = `
${TP_CONSTS_WGSL}
fn tpUV(uv: vec2<f32>) -> vec2<f32> { return uv; }
fn temporalStage(colIn: vec3<f32>, src: vec3<f32>, base: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let tuv = tpUV(uv);
  let kk = clamp(textureSampleLevel(u_tpF1, samp, tuv, 0.0).rgb, vec3<f32>(TP_KMIN), vec3<f32>(TP_KMAX));
  let col = linearToSrgb(srgbToLinear(colIn) * kk);
  let fl = textureSampleLevel(u_tpFlow, samp, tuv, 0.0);
  let prev = textureSampleLevel(u_tpPrev, samp, tuv + fl.xy / vec2<f32>(textureDimensions(u_tpFlow)), 0.0).rgb;
  let flatness = 1.0 - smoothstep(TP_FLAT_LO, TP_FLAT_HI, abs(dot(src - base, vec3<f32>(0.2126, 0.7152, 0.0722))));
  let dark = 1.0 - smoothstep(TP_DARK_LO, TP_DARK_HI, dot(col, vec3<f32>(0.2126, 0.7152, 0.0722)));
  let dv = col - prev;
  let w = TP_DENOISE * fl.z * flatness * dark * (1.0 - clamp(g_subjOut, 0.0, 1.0)) * exp(-dot(dv, dv) / (TP_TAU * TP_TAU));
  return mix(col, prev, vec3<f32>(w));
}`;

/** WGSL variant reading the source through an external texture (VideoFrames). */
export function tpExternal(code: string): string {
  return code
    .replace("var u_source: texture_2d<f32>;", "var u_source: texture_external;")
    .replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g, "textureSampleBaseClampToEdge(u_source, samp, $1)");
}
