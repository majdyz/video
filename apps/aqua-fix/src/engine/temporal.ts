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
// stabilised / current and uses the tracked mask as subject prior.
//
// Noise reduction (NR in params.ts; CPU reference: apply.ts nrRefine / nrLevel / nrBlend) adds three passes
// between the flow and the grade, and the grade then reads its source from the last one:
//   4. refine — per low-resolution texel, the block flow taken to whole pixels of the working frame by
//               matching a few of the block's pixels against the denoised history; what difference is left,
//               against the previous frame's noise level, is the block's motion confidence
//   5. level  — a bins × 1 target: the frame's noise level per luminance bin (soft minimum over its flat tiles
//               of the source-vs-history difference)
//   6. nr     — at the canvas size: the source blended with the history at the refined displacement, weighted
//               per pixel by the level and two motion tests; next frame's history, and the grade's source
// While the gate is shut in every bin the WebGL2 backend idles (NR.idleEvery): passes 4-6 are skipped and the
// grade reads the source, except for one one-tap copy and one measurement every idleEvery frames. The WebGPU
// backend (opt-in) runs the passes on every frame.
//
// Texture-space convention: every temporal texture is rendered with the same
// full-screen triangle as the grade, so in WebGL2 its rows run bottom-up
// (texture v = 1 − upright v) and in WebGPU top-down (texture v = upright v);
// flow vectors live in texture space, so warps are consistent per API.
import { GRADE_GLSL, GRADE_WGSL } from "./grade-shader.ts";
import { NR, TEMPORAL } from "./params.ts";

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
`;
const constsWgsl = (glsl: string) => glsl.replace(/const int (\w+) = ([^;]+);/g, "const $1: i32 = $2;").replace(/const float (\w+) = ([^;]+);/g, "const $1: f32 = $2;");
export const TP_CONSTS_WGSL = constsWgsl(TP_CONSTS_GLSL);

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
layout(std140) uniform Params { vec4 p[27]; };`;

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
struct Params { p: array<vec4<f32>, 27> };
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
uniform sampler2D u_data3;
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
struct Params { p: array<vec4<f32>, 27> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
@group(0) @binding(10) var u_data3: texture_2d<f32>;
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

// ------------------------------------------------------- noise reduction
/** Constants of the NR passes (GLSL). */
export const NR_CONSTS_GLSL = `
const int NR_RT = ${NR.refineTaps};
const int NR_RSTEP = ${NR.refineStep};
const float NR_RBIAS = ${f(NR.refineBias)};
const float NR_BLK_LO = ${f(NR.blockLo)};
const float NR_BLK_HI = ${f(NR.blockHi)};
const int NR_TX = ${NR.tilesX};
const int NR_TY = ${NR.tilesY};
const int NR_T = ${NR.tileTaps};
const float NR_TEX_LO = ${f(NR.texLo)};
const float NR_TEX_HI = ${f(NR.texHi)};
const float NR_TILES_MIN = ${f(NR.tilesMin)};
const float NR_EPS = ${f(NR.eps)};
const float NR_LUM_LO = ${f(NR.lumLo)};
const float NR_LUM_HI = ${f(NR.lumHi)};
const float NR_DEAD = ${f(NR.dead)};
const int NR_BINS = ${NR.bins};
const float NR_BIN_MIN = ${f(NR.binMin)};
const float NR_BIN_MAX = ${f(NR.binMax)};
const float NR_EMAX = ${f(NR.eMax)};
const float NR_C0_LO = ${f(NR.c0Lo)};
const float NR_C0_HI = ${f(NR.c0Hi)};
const float NR_L_LO = ${f(NR.lLo)};
const float NR_L_HI = ${f(NR.lHi)};
const float NR_A_W = ${f(NR.auto.w)};
const float NR_A_LO = ${f(NR.auto.gateLo)};
const float NR_A_HI = ${f(NR.auto.gateHi)};
const float NR_S_W = ${f(NR.strong.w)};
const float NR_S_LO = ${f(NR.strong.gateLo)};
const float NR_S_HI = ${f(NR.strong.gateHi)};
`;
export const NR_CONSTS_WGSL = constsWgsl(NR_CONSTS_GLSL);

// The NR targets are drawn with the same full-screen triangle as every temporal texture, so texel (x, y) of a
// target is fragment (x, y) of the pass: in WebGL2 its rows run bottom-up (nrUp flips to the upright uv the
// source is sampled with), in WebGPU top-down.
const NR_SRC_GLSL = `
vec2 nrUp(vec2 t) { return vec2(t.x, 1.0 - t.y); }
vec3 nrSrc(vec2 t) { return textureLod(u_source, rotateUV(nrUp(t), int(p[0].x + 0.5)), 0.0).rgb; }`;
const NR_SRC_WGSL = `
fn nrSrc(t: vec2<f32>) -> vec3<f32> { return textureSampleLevel(u_source, samp, rotateUV(t, u32(params.p[0].x + 0.5)), 0.0).rgb; }`;

// One pixel against the history (apply.ts nrProbe): the refined flow at the pixel, rounded to whole pixels, gives
// the history texel; m0 = the largest channel difference of the pixel, ml = of the 3×3 tent averages (four
// bilinear taps half a pixel out on the diagonals), lum = the luminance of the source's average.
const NR_PROBE_GLSL = `
struct NrProbe { vec3 c; vec3 h; float m0; float ml; float inside; float conf; float lum; };
NrProbe nrProbe(ivec2 x) {
  ivec2 sz = textureSize(u_nrPrev, 0);
  vec2 size = vec2(sz);
  vec2 t = (vec2(x) + 0.5) / size;
  vec4 fl = textureLod(u_nrFlow, t, 0.0);
  ivec2 q = x + ivec2(floor(fl.xy + 0.5));
  NrProbe r;
  r.inside = (q.x >= 0 && q.y >= 0 && q.x < sz.x && q.y < sz.y) ? 1.0 : 0.0;
  q = clamp(q, ivec2(0), sz - 1);
  r.conf = fl.z;
  r.c = nrSrc(t);
  r.h = texelFetch(u_nrPrev, q, 0).rgb;
  vec2 hp = 0.5 / size;
  vec3 sl = 0.25 * (nrSrc(t + vec2(-hp.x, -hp.y)) + nrSrc(t + vec2(hp.x, -hp.y)) + nrSrc(t + vec2(-hp.x, hp.y)) + nrSrc(t + vec2(hp.x, hp.y)));
  vec2 tq = (vec2(q) + 0.5) / size;
  vec3 hl = 0.25 * (textureLod(u_nrPrev, tq + vec2(-hp.x, -hp.y), 0.0).rgb + textureLod(u_nrPrev, tq + vec2(hp.x, -hp.y), 0.0).rgb + textureLod(u_nrPrev, tq + vec2(-hp.x, hp.y), 0.0).rgb + textureLod(u_nrPrev, tq + vec2(hp.x, hp.y), 0.0).rgb);
  vec3 d0 = abs(r.c - r.h);
  vec3 dl = abs(sl - hl);
  r.m0 = max(d0.x, max(d0.y, d0.z));
  r.ml = max(dl.x, max(dl.y, dl.z));
  r.lum = dot(sl, vec3(0.2126, 0.7152, 0.0722));
  return r;
}`;
const NR_PROBE_WGSL = `
struct NrProbe { c: vec3<f32>, h: vec3<f32>, m0: f32, ml: f32, inside: f32, conf: f32, lum: f32 };
fn nrProbe(x: vec2<i32>) -> NrProbe {
  let sz = vec2<i32>(textureDimensions(u_nrPrev));
  let size = vec2<f32>(sz);
  let t = (vec2<f32>(x) + 0.5) / size;
  let fl = textureSampleLevel(u_nrFlow, samp, t, 0.0);
  let q0 = x + vec2<i32>(floor(fl.xy + 0.5));
  var r: NrProbe;
  r.inside = select(0.0, 1.0, q0.x >= 0 && q0.y >= 0 && q0.x < sz.x && q0.y < sz.y);
  let q = clamp(q0, vec2<i32>(0), sz - 1);
  r.conf = fl.z;
  r.c = nrSrc(t);
  r.h = textureLoad(u_nrPrev, q, 0).rgb;
  let hp = 0.5 / size;
  let sl = 0.25 * (nrSrc(t + vec2<f32>(-hp.x, -hp.y)) + nrSrc(t + vec2<f32>(hp.x, -hp.y)) + nrSrc(t + vec2<f32>(-hp.x, hp.y)) + nrSrc(t + vec2<f32>(hp.x, hp.y)));
  let tq = (vec2<f32>(q) + 0.5) / size;
  let hl = 0.25 * (textureSampleLevel(u_nrPrev, samp, tq + vec2<f32>(-hp.x, -hp.y), 0.0).rgb + textureSampleLevel(u_nrPrev, samp, tq + vec2<f32>(hp.x, -hp.y), 0.0).rgb + textureSampleLevel(u_nrPrev, samp, tq + vec2<f32>(-hp.x, hp.y), 0.0).rgb + textureSampleLevel(u_nrPrev, samp, tq + vec2<f32>(hp.x, hp.y), 0.0).rgb);
  let d0 = abs(r.c - r.h);
  let dl = abs(sl - hl);
  r.m0 = max(d0.x, max(d0.y, d0.z));
  r.ml = max(dl.x, max(dl.y, dl.z));
  r.lum = dot(sl, vec3<f32>(0.2126, 0.7152, 0.0722));
  return r;
}`;

// ------------------------------------------------------------- pass 4: refine
// p26.y = the NR history is valid (set by the backend): without it the block flow passes through in pixels.
export const GLSL_NR_REFINE = `${HEAD_GLSL}
uniform sampler2D u_source;
uniform sampler2D u_tpFlow;
uniform sampler2D u_nrPrev;
uniform sampler2D u_nrLevel;
out vec4 o_color;
${ROTATE_GLSL}
${NR_CONSTS_GLSL}
${NR_SRC_GLSL}
void main() {
  ivec2 lx = ivec2(gl_FragCoord.xy);
  vec2 ls = vec2(textureSize(u_tpFlow, 0));
  ivec2 sz = textureSize(u_nrPrev, 0);
  vec2 size = vec2(sz);
  vec4 fl = texelFetch(u_tpFlow, lx, 0);
  ivec2 b = ivec2(floor(fl.xy * size / ls + 0.5));
  ivec2 off = ivec2(0);
  float conf = fl.z;
  if (p[26].y > 0.5) {
    vec3 c[${NR.refineTaps * NR.refineTaps}];
    ivec2 q[${NR.refineTaps * NR.refineTaps}];
    vec3 mean = vec3(0.0);
    for (int j = 0; j < NR_RT; j++) for (int i = 0; i < NR_RT; i++) {
      ivec2 x = clamp(ivec2(floor((vec2(lx) + (vec2(float(i), float(j)) + 0.5) / float(NR_RT)) / ls * size)), ivec2(0), sz - 1);
      q[j * NR_RT + i] = x;
      c[j * NR_RT + i] = nrSrc((vec2(x) + 0.5) / size);
      mean += c[j * NR_RT + i] / float(NR_RT * NR_RT);
    }
    float best = 1e9;
    // Round 0: the block's own displacement; round 1: the 5×5 offsets of step NR_RSTEP; round 2: the 3×3 of step 1 around the best.
    for (int r = 0; r < 3; r++) {
      ivec2 ctr = off;
      int stp = r == 1 ? NR_RSTEP : 1;
      int reach = r == 1 ? 2 : min(r, 1);
      for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        bool centre = i == 0 && j == 0;
        if ((r == 0 ? !centre : centre) || abs(i) > reach || abs(j) > reach) continue;
        ivec2 d = ctr + ivec2(i, j) * stp;
        float s = 0.0;
        for (int k = 0; k < NR_RT * NR_RT; k++) {
          vec3 a = abs(c[k] - texelFetch(u_nrPrev, clamp(q[k] + b + d, ivec2(0), sz - 1), 0).rgb);
          s += a.x + a.y + a.z;
        }
        s = s / float(NR_RT * NR_RT * 3) + NR_RBIAS * float(abs(d.x) + abs(d.y));
        if (s < best) { best = s; off = d; }
      }
    }
    // The block's own confidence: its remaining difference against the noise level (the previous frame's) at its luminance.
    float e0 = max(textureLod(u_nrLevel, vec2((clamp(dot(mean, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0) * float(NR_BINS - 1) + 0.5) / float(NR_BINS), 0.5), 0.0).x, 1e-6);
    conf *= 1.0 - smoothstep(NR_BLK_LO * e0, NR_BLK_HI * e0, best - NR_RBIAS * float(abs(off.x) + abs(off.y)));
  }
  o_color = vec4(vec2(b + off), conf, 1.0);
}`;
export const WGSL_NR_REFINE = `
struct Params { p: array<vec4<f32>, 27> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(6) var u_tpFlow: texture_2d<f32>;
@group(0) @binding(7) var u_nrPrev: texture_2d<f32>;
@group(0) @binding(8) var u_nrLevel: texture_2d<f32>;
${VS_WGSL}
${ROTATE_WGSL}
${NR_CONSTS_WGSL}
${NR_SRC_WGSL}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let lx = vec2<i32>(in.pos.xy);
  let ls = vec2<f32>(textureDimensions(u_tpFlow));
  let sz = vec2<i32>(textureDimensions(u_nrPrev));
  let size = vec2<f32>(sz);
  let fl = textureLoad(u_tpFlow, lx, 0);
  let b = vec2<i32>(floor(fl.xy * size / ls + 0.5));
  var off = vec2<i32>(0);
  var conf = fl.z;
  if (params.p[26].y > 0.5) {
    var c: array<vec3<f32>, ${NR.refineTaps * NR.refineTaps}>;
    var q: array<vec2<i32>, ${NR.refineTaps * NR.refineTaps}>;
    var mean = vec3<f32>(0.0);
    for (var j = 0; j < NR_RT; j++) { for (var i = 0; i < NR_RT; i++) {
      let x = clamp(vec2<i32>(floor((vec2<f32>(lx) + (vec2<f32>(f32(i), f32(j)) + 0.5) / f32(NR_RT)) / ls * size)), vec2<i32>(0), sz - 1);
      q[j * NR_RT + i] = x;
      c[j * NR_RT + i] = nrSrc((vec2<f32>(x) + 0.5) / size);
      mean += c[j * NR_RT + i] / f32(NR_RT * NR_RT);
    } }
    var best = 1e9;
    for (var r = 0; r < 3; r++) {
      let ctr = off;
      let stp = select(1, NR_RSTEP, r == 1);
      let reach = select(min(r, 1), 2, r == 1);
      for (var j = -2; j <= 2; j++) { for (var i = -2; i <= 2; i++) {
        let centre = i == 0 && j == 0;
        if ((r == 0 && !centre) || (r != 0 && centre) || abs(i) > reach || abs(j) > reach) { continue; }
        let d = ctr + vec2<i32>(i, j) * stp;
        var s = 0.0;
        for (var k = 0; k < NR_RT * NR_RT; k++) {
          let a = abs(c[k] - textureLoad(u_nrPrev, clamp(q[k] + b + d, vec2<i32>(0), sz - 1), 0).rgb);
          s += a.x + a.y + a.z;
        }
        s = s / f32(NR_RT * NR_RT * 3) + NR_RBIAS * f32(abs(d.x) + abs(d.y));
        if (s < best) { best = s; off = d; }
      } }
    }
    let e0 = max(textureSampleLevel(u_nrLevel, samp, vec2<f32>((clamp(dot(mean, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0) * f32(NR_BINS - 1) + 0.5) / f32(NR_BINS), 0.5), 0.0).x, 1e-6);
    conf *= 1.0 - smoothstep(NR_BLK_LO * e0, NR_BLK_HI * e0, best - NR_RBIAS * f32(abs(off.x) + abs(off.y)));
  }
  return vec4(vec2<f32>(b + off), conf, 1.0);
}`;

// -------------------------------------------------------------- pass 5: level
// One fragment per luminance bin; each walks every tile (apply.ts nrLevel).
export const GLSL_NR_LEVEL = `${HEAD_GLSL}
uniform sampler2D u_source;
uniform sampler2D u_nrFlow;
uniform sampler2D u_nrPrev;
uniform sampler2D u_tpLum;
out vec4 o_color;
${ROTATE_GLSL}
${NR_CONSTS_GLSL}
${NR_SRC_GLSL}
${NR_PROBE_GLSL}
float nrSoft(float S, float n) { return max(0.0, NR_EPS / sqrt(sqrt(S / n)) - NR_EPS); }
float nrLum(ivec2 l, ivec2 hi) { return texelFetch(u_tpLum, clamp(l, ivec2(0), hi), 0).a; }
void main() {
  float bin = floor(gl_FragCoord.x);
  ivec2 sz = textureSize(u_nrPrev, 0);
  vec2 size = vec2(sz);
  ivec2 lsz = textureSize(u_tpLum, 0);
  float S0 = 0.0, Sl = 0.0, N = 0.0, G0 = 0.0, Gl = 0.0, GN = 0.0;
  if (p[26].y > 0.5) {
    for (int ty = 0; ty < NR_TY; ty++) for (int tx = 0; tx < NR_TX; tx++) {
      float a0 = 0.0, al = 0.0, lum = 0.0, tex = 0.0, n = 0.0;
      for (int j = 0; j < NR_T; j++) for (int i = 0; i < NR_T; i++) {
        vec2 u = (vec2(float(tx), float(ty)) + (vec2(float(i), float(j)) + 0.5) / float(NR_T)) / vec2(float(NR_TX), float(NR_TY));
        ivec2 x = min(sz - 1, ivec2(floor(u * size)));
        NrProbe r = nrProbe(x);
        // Texture: the low-resolution luminance's largest step to its four neighbours.
        ivec2 l = ivec2(floor((vec2(x) + 0.5) / size * vec2(lsz)));
        float yc = nrLum(l, lsz - 1);
        float tx4 = max(max(abs(yc - nrLum(l + ivec2(-1, 0), lsz - 1)), abs(yc - nrLum(l + ivec2(1, 0), lsz - 1))), max(abs(yc - nrLum(l + ivec2(0, -1), lsz - 1)), abs(yc - nrLum(l + ivec2(0, 1), lsz - 1))));
        a0 += r.m0 * r.inside; al += r.ml * r.inside; lum += r.lum * r.inside; tex += tx4 * r.inside; n += r.inside;
      }
      if (n * 2.0 < float(NR_T * NR_T) || lum < NR_LUM_LO * n || lum > NR_LUM_HI * n || a0 < NR_DEAD * n) continue;
      float flatW = 1.0 - smoothstep(NR_TEX_LO, NR_TEX_HI, tex / n);
      float r0 = (a0 / n + NR_EPS) / NR_EPS, rl = (al / n + NR_EPS) / NR_EPS;
      float q0 = flatW / (r0 * r0 * r0 * r0), ql = flatW / (rl * rl * rl * rl);
      float wt = flatW * max(0.0, 1.0 - abs(lum / n * float(NR_BINS - 1) - bin));
      G0 += q0; Gl += ql; GN += flatW;
      S0 += wt * q0; Sl += wt * ql; N += wt;
    }
  }
  vec2 e = vec2(0.0);
  if (GN >= NR_TILES_MIN) {
    vec2 g = vec2(nrSoft(G0, GN), nrSoft(Gl, GN));
    vec2 bb = N > 0.0 ? min(vec2(nrSoft(S0, N), nrSoft(Sl, N)), NR_BIN_MAX * g) : g;
    e = min(vec2(NR_EMAX), mix(g, bb, clamp(N / NR_BIN_MIN, 0.0, 1.0)));
  }
  o_color = vec4(e, 0.0, 1.0);
}`;
export const WGSL_NR_LEVEL = `
struct Params { p: array<vec4<f32>, 27> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(6) var u_nrFlow: texture_2d<f32>;
@group(0) @binding(7) var u_nrPrev: texture_2d<f32>;
@group(0) @binding(8) var u_tpLum: texture_2d<f32>;
${VS_WGSL}
${ROTATE_WGSL}
${NR_CONSTS_WGSL}
${NR_SRC_WGSL}
${NR_PROBE_WGSL}
fn nrSoft(S: f32, n: f32) -> f32 { return max(0.0, NR_EPS / sqrt(sqrt(S / n)) - NR_EPS); }
fn nrLum(l: vec2<i32>, hi: vec2<i32>) -> f32 { return textureLoad(u_tpLum, clamp(l, vec2<i32>(0), hi), 0).a; }
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let bin = floor(in.pos.x);
  let sz = vec2<i32>(textureDimensions(u_nrPrev));
  let size = vec2<f32>(sz);
  let lsz = vec2<i32>(textureDimensions(u_tpLum));
  var S0 = 0.0; var Sl = 0.0; var N = 0.0; var G0 = 0.0; var Gl = 0.0; var GN = 0.0;
  if (params.p[26].y > 0.5) {
    for (var ty = 0; ty < NR_TY; ty++) { for (var tx = 0; tx < NR_TX; tx++) {
      var a0 = 0.0; var al = 0.0; var lum = 0.0; var tex = 0.0; var n = 0.0;
      for (var j = 0; j < NR_T; j++) { for (var i = 0; i < NR_T; i++) {
        let u = (vec2<f32>(f32(tx), f32(ty)) + (vec2<f32>(f32(i), f32(j)) + 0.5) / f32(NR_T)) / vec2<f32>(f32(NR_TX), f32(NR_TY));
        let x = min(sz - 1, vec2<i32>(floor(u * size)));
        let r = nrProbe(x);
        let l = vec2<i32>(floor((vec2<f32>(x) + 0.5) / size * vec2<f32>(lsz)));
        let yc = nrLum(l, lsz - 1);
        let tx4 = max(max(abs(yc - nrLum(l + vec2<i32>(-1, 0), lsz - 1)), abs(yc - nrLum(l + vec2<i32>(1, 0), lsz - 1))), max(abs(yc - nrLum(l + vec2<i32>(0, -1), lsz - 1)), abs(yc - nrLum(l + vec2<i32>(0, 1), lsz - 1))));
        a0 += r.m0 * r.inside; al += r.ml * r.inside; lum += r.lum * r.inside; tex += tx4 * r.inside; n += r.inside;
      } }
      if (n * 2.0 < f32(NR_T * NR_T) || lum < NR_LUM_LO * n || lum > NR_LUM_HI * n || a0 < NR_DEAD * n) { continue; }
      let flatW = 1.0 - smoothstep(NR_TEX_LO, NR_TEX_HI, tex / n);
      let r0 = (a0 / n + NR_EPS) / NR_EPS;
      let rl = (al / n + NR_EPS) / NR_EPS;
      let q0 = flatW / (r0 * r0 * r0 * r0);
      let ql = flatW / (rl * rl * rl * rl);
      let wt = flatW * max(0.0, 1.0 - abs(lum / n * f32(NR_BINS - 1) - bin));
      G0 += q0; Gl += ql; GN += flatW;
      S0 += wt * q0; Sl += wt * ql; N += wt;
    } }
  }
  var e = vec2<f32>(0.0);
  if (GN >= NR_TILES_MIN) {
    let g = vec2<f32>(nrSoft(G0, GN), nrSoft(Gl, GN));
    var bb = g;
    if (N > 0.0) { bb = min(vec2<f32>(nrSoft(S0, N), nrSoft(Sl, N)), NR_BIN_MAX * g); }
    e = min(vec2<f32>(NR_EMAX), mix(g, bb, clamp(N / NR_BIN_MIN, 0.0, 1.0)));
  }
  return vec4(e, 0.0, 1.0);
}`;

// ----------------------------------------------------------------- pass 6: nr
// p26.x = Noise reduction level (1 auto, 2 strong), p26.y = history valid.
export const GLSL_NR = `${HEAD_GLSL}
uniform sampler2D u_source;
uniform sampler2D u_nrFlow;
uniform sampler2D u_nrPrev;
uniform sampler2D u_nrLevel;
out vec4 o_color;
${ROTATE_GLSL}
${NR_CONSTS_GLSL}
${NR_SRC_GLSL}
${NR_PROBE_GLSL}
void main() {
  // No history (a first frame, or the idle copy): the source as it is, one tap.
  if (p[26].y < 0.5) { o_color = vec4(nrSrc(gl_FragCoord.xy / vec2(textureSize(u_nrPrev, 0))), 1.0); return; }
  NrProbe r = nrProbe(ivec2(gl_FragCoord.xy));
  float w = 0.0;
  if (p[26].y > 0.5 && p[26].x > 0.5) {
    vec2 e = textureLod(u_nrLevel, vec2((clamp(r.lum, 0.0, 1.0) * float(NR_BINS - 1) + 0.5) / float(NR_BINS), 0.5), 0.0).xy;
    bool strong = p[26].x > 1.5;
    float k = (strong ? NR_S_W : NR_A_W) * smoothstep(strong ? NR_S_LO : NR_A_LO, strong ? NR_S_HI : NR_A_HI, e.x);
    float a = max(e.x, 1e-6), b = max(e.y, 1e-6);
    w = k * r.conf * r.inside * (1.0 - smoothstep(NR_C0_LO * a, NR_C0_HI * a, r.m0)) * (1.0 - smoothstep(NR_L_LO * b, NR_L_HI * b, r.ml));
  }
  o_color = vec4(mix(r.c, r.h, w), 1.0);
}`;
export const WGSL_NR = `
struct Params { p: array<vec4<f32>, 27> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(6) var u_nrFlow: texture_2d<f32>;
@group(0) @binding(7) var u_nrPrev: texture_2d<f32>;
@group(0) @binding(8) var u_nrLevel: texture_2d<f32>;
${VS_WGSL}
${ROTATE_WGSL}
${NR_CONSTS_WGSL}
${NR_SRC_WGSL}
${NR_PROBE_WGSL}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  if (params.p[26].y < 0.5) { return vec4(nrSrc(in.pos.xy / vec2<f32>(textureDimensions(u_nrPrev))), 1.0); }
  let r = nrProbe(vec2<i32>(in.pos.xy));
  var w = 0.0;
  if (params.p[26].y > 0.5 && params.p[26].x > 0.5) {
    let e = textureSampleLevel(u_nrLevel, samp, vec2<f32>((clamp(r.lum, 0.0, 1.0) * f32(NR_BINS - 1) + 0.5) / f32(NR_BINS), 0.5), 0.0).xy;
    let strong = params.p[26].x > 1.5;
    let k = select(NR_A_W, NR_S_W, strong) * smoothstep(select(NR_A_LO, NR_S_LO, strong), select(NR_A_HI, NR_S_HI, strong), e.x);
    let a = max(e.x, 1e-6);
    let b = max(e.y, 1e-6);
    w = k * r.conf * r.inside * (1.0 - smoothstep(NR_C0_LO * a, NR_C0_HI * a, r.m0)) * (1.0 - smoothstep(NR_L_LO * b, NR_L_HI * b, r.ml));
  }
  return vec4(mix(r.c, r.h, vec3<f32>(w)), 1.0);
}`;

// ------------------------------------------------ final-grade temporal stage
/**
 * Appended to the full-resolution grade: `temporalStage(col, uv)` (after gradeD, which read g_subjPrior from the
 * tracked mask) applies the anti-crawl correction.
 */
export const TP_FINAL_GLSL = `
${TP_CONSTS_GLSL}
vec2 tpUV(vec2 uv) { return vec2(uv.x, 1.0 - uv.y); }
vec3 temporalStage(vec3 col, vec2 uv) {
  vec3 kk = clamp(texture(u_tpF1, tpUV(uv)).rgb, vec3(TP_KMIN), vec3(TP_KMAX));
  return linearToSrgb(srgbToLinear(col) * kk);
}`;
export const TP_FINAL_WGSL = `
${TP_CONSTS_WGSL}
fn tpUV(uv: vec2<f32>) -> vec2<f32> { return uv; }
fn temporalStage(col: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let kk = clamp(textureSampleLevel(u_tpF1, samp, tpUV(uv), 0.0).rgb, vec3<f32>(TP_KMIN), vec3<f32>(TP_KMAX));
  return linearToSrgb(srgbToLinear(col) * kk);
}`;

/** WGSL variant reading the source through an external texture (VideoFrames). */
export function tpExternal(code: string): string {
  return code
    .replace("var u_source: texture_2d<f32>;", "var u_source: texture_external;")
    .replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g, "textureSampleBaseClampToEdge(u_source, samp, $1)");
}
