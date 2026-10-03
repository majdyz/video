// Grading maths, once in GLSL ES 3.00 and once in WGSL — an exact mirror of
// apply.ts (gradePixel). Both define
//   grade(src: rgb in sRGB 0..1, uv: upright 0..1) -> rgb sRGB 0..1
// and read the uniform block `p` (16 × vec4, layout in params.ts) and the
// data textures: u_data0 = fields (z, conf, dSmooth), u_data1 = CLAHE LUTs
// (x = bin, y = tile), u_data2 = guide colour (linear rgb).

import { CONF_BRIGHT, LOOK, SKIN } from "./params.ts";

// Look constants shared by both shaders, emitted as literals.
const LOOK_CONSTS_GLSL = `
const float CONF_BRIGHT_LO = ${CONF_BRIGHT.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${CONF_BRIGHT.hi.toFixed(4)};
const float LOOK_GAMMA = ${LOOK.gamma.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${LOOK.hazeChroma.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${LOOK.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${LOOK.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${LOOK.neutralHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${LOOK.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${LOOK.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${LOOK.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${LOOK.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${LOOK.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${LOOK.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${LOOK.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${LOOK.darkHi.toFixed(4)};
const float LOOK_BRIGHT_LO = ${LOOK.brightLo.toFixed(4)};
const float LOOK_BRIGHT_HI = ${LOOK.brightHi.toFixed(4)};
const float LOOK_KEEP_LO = ${LOOK.keepLo.toFixed(4)};
const float LOOK_KEEP_HI = ${LOOK.keepHi.toFixed(4)};
const float LOOK_C0 = ${LOOK.c0.toFixed(4)};
const float LOOK_C1 = ${LOOK.c1.toFixed(4)};
const float LOOK_MIX = ${LOOK.mix.toFixed(4)};
const float SKIN_HUE = ${SKIN.hue.toFixed(6)};
const float SKIN_BAND_HUE = ${SKIN.bandHue.toFixed(6)};
const float SKIN_BAND_IN = ${SKIN.bandIn.toFixed(6)};
const float SKIN_BAND_OUT = ${SKIN.bandOut.toFixed(6)};
const float SKIN_ACHROMA = ${SKIN.achroma.toFixed(4)};
const float SKIN_L_LO = ${SKIN.lLo.toFixed(4)};
const float SKIN_L_HI = ${SKIN.lHi.toFixed(4)};
const float SKIN_C_LO = ${SKIN.cLo.toFixed(4)};
const float SKIN_C_HI = ${SKIN.cHi.toFixed(4)};
const float SKIN_MIX = ${SKIN.mix.toFixed(4)};
const float SKIN_W_LO = ${SKIN.wLo.toFixed(4)};
const float SKIN_W_HI = ${SKIN.wHi.toFixed(4)};
const float SKIN_C_MIN = ${SKIN.cMin.toFixed(4)};
`;
const LOOK_CONSTS_WGSL = LOOK_CONSTS_GLSL.replace(/const float (\w+) = ([^;]+);/g, "const $1: f32 = $2;");

export const GRADE_GLSL = `${LOOK_CONSTS_GLSL}
const float JBU_SIGMA = 0.12;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 linearToOklab(vec3 c) {
  float l = pow(max(0.0, 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), 1.0 / 3.0);
  float m = pow(max(0.0, 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), 1.0 / 3.0);
  float s = pow(max(0.0, 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklabToLinear(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
// Constant-luminance gamut compression (see color.ts).
vec3 compressToGamut(vec3 c) {
  float Y = clamp(lum(c), 0.0, 1.0);
  float t = 1.0;
  for (int i = 0; i < 3; i++) {
    float v = c[i];
    if (v > 1.0) t = min(t, (1.0 - Y) / (v - Y));
    else if (v < 0.0) t = min(t, (0.0 - Y) / (v - Y));
  }
  if (t >= 1.0) return c;
  t = max(0.0, t);
  return vec3(Y) + t * (c - vec3(Y));
}
// Joint bilateral upsample of (z, conf, d, veilScale) guided by the pixel's
// linear colour. kOut is the guide-match weight: 0 when no neighbour
// resembles the pixel (content moved since the map was made).
vec4 sampleFields(vec2 uv, vec3 c, out float kOut, out float personOut) {
  ivec2 size = textureSize(u_data0, 0);
  vec2 f = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size) - 1.0);
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, size - 1);
  vec2 t = f - vec2(i0);
  float cn = length(c) + 0.02;
  vec4 sum = vec4(0.0), bil = vec4(0.0);
  float sw = 0.0, sp = 0.0, bp = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 ij = ivec2(k == 1 || k == 3 ? i1.x : i0.x, k >= 2 ? i1.y : i0.y);
    float ws = (k == 1 || k == 3 ? t.x : 1.0 - t.x) * (k >= 2 ? t.y : 1.0 - t.y);
    vec4 fld = texelFetch(u_data0, ij, 0);
    vec4 gd = texelFetch(u_data2, ij, 0);
    vec3 g = gd.xyz;
    float diff = length(c - g) / (cn + length(g));
    float wr = exp(-(diff * diff) / (2.0 * JBU_SIGMA * JBU_SIGMA));
    sum += ws * wr * fld;
    sw += ws * wr;
    bil += ws * fld;
    sp += ws * wr * gd.w;
    bp += ws * gd.w;
  }
  kOut = min(1.0, sw / 0.08);
  if (sw < 1e-6) { kOut = 0.0; personOut = bp; return bil; }
  personOut = sp / sw;
  return sum / sw;
}
float smoothstepf(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
// 1 for objects, 0 for water: Oklab hue distance to the veil, achromatic → object.
// Skin memory colour on person pixels (see SKIN in params.ts; mirrors apply.ts).
vec2 skinTone(float L, vec2 ab, float person) {
  if (person <= 0.0) return ab;
  float C = length(ab);
  float h = atan(ab.y, ab.x);
  float d = h - SKIN_BAND_HUE; d -= 6.2831853 * round(d / 6.2831853);
  float inBand = max(1.0 - smoothstepf(SKIN_BAND_IN, SKIN_BAND_OUT, abs(d)), 1.0 - smoothstepf(SKIN_ACHROMA * 0.5, SKIN_ACHROMA, C));
  float w = smoothstepf(SKIN_W_LO, SKIN_W_HI, person) * inBand * smoothstepf(SKIN_L_LO, SKIN_L_HI, L) * (1.0 - smoothstepf(SKIN_C_LO, SKIN_C_HI, C));
  if (w <= 0.0) return ab;
  float dh = SKIN_HUE - h; dh -= 6.2831853 * round(dh / 6.2831853);
  float h2 = h + dh * SKIN_MIX * w;
  float C2 = C + max(0.0, SKIN_C_MIN - C) * w;
  return vec2(C2 * cos(h2), C2 * sin(h2));
}
// Deep-blue look in Oklab (see LOOK in params.ts; mirrors apply.ts).
vec3 deepBlueLook(vec3 lab, float look, float water, float hazeW) {
  if (look <= 0.0) return lab;
  float C = length(lab.yz);
  float h = atan(lab.z, lab.y);
  float vivid = smoothstepf(LOOK_KEEP_LO, LOOK_KEEP_HI, C);
  float dw = h - LOOK_WARM_HUE; dw -= 6.2831853 * round(dw / 6.2831853);
  float warm = (1.0 - smoothstepf(LOOK_WARM_IN, LOOK_WARM_OUT, abs(dw))) * smoothstepf(LOOK_WARM_LO, LOOK_WARM_HI, C);
  float wTint = (1.0 - vivid) * (1.0 - warm) * (1.0 - smoothstepf(LOOK_BRIGHT_LO, LOOK_BRIGHT_HI, lab.x)) * smoothstepf(LOOK_DARK_LO, LOOK_DARK_HI, lab.x);
  float w = wTint * look * LOOK_MIX;
  float L2 = pow(max(lab.x, 0.0), 1.0 + LOOK_GAMMA * look);
  float Ct = (LOOK_C0 + LOOK_C1 * L2) * (1.0 + LOOK_HAZE_CHROMA * hazeW);
  vec2 t = Ct * vec2(cos(LOOK_TARGET_HUE), sin(LOOK_TARGET_HUE));
  float ds = 1.0 - look * LOOK_NEUTRAL_DESAT * (1.0 - smoothstepf(LOOK_NEUTRAL_LO, LOOK_NEUTRAL_HI, C));
  return vec3(L2, (lab.yz + (t - lab.yz) * w) * ds);
}
float hueFar(vec2 ab, vec2 veilHue, float lo, float hi, float achroma) {
  float c = length(ab);
  if (c < achroma) return 0.0;
  float cosang = clamp(dot(ab / c, veilHue), -1.0, 1.0);
  float t = 1.0 - smoothstepf(cos(hi), cos(lo), cosang);
  return t * smoothstepf(achroma, achroma * 2.0, c);
}
float hueConf(vec2 ab, vec2 veilHue, float lo, float hi, float achroma) {
  float c = length(ab);
  if (c < achroma) return 1.0;
  float cosang = clamp(dot(ab / c, veilHue), -1.0, 1.0);
  float t = 1.0 - smoothstepf(cos(hi), cos(lo), cosang);
  float kk = smoothstepf(achroma, achroma * 2.0, c);
  return t + (1.0 - t) * (1.0 - kk);
}
// CLAHE: LUT entry b = CDF at the upper edge of bin b; linear in value,
// bilinear across the four nearest tiles.
float lutAt(int tile, float fb, int bins) {
  if (fb < 0.0) return texelFetch(u_data1, ivec2(0, tile), 0).x * (fb + 1.0);
  int b0 = min(bins - 1, int(fb));
  int b1 = min(bins - 1, b0 + 1);
  float v0 = texelFetch(u_data1, ivec2(b0, tile), 0).x;
  float v1 = texelFetch(u_data1, ivec2(b1, tile), 0).x;
  return mix(v0, v1, clamp(fb - float(b0), 0.0, 1.0));
}
float sampleClahe(vec2 uv, float value, int tilesX, int tilesY, int bins) {
  float fb = value * float(bins) - 1.0;
  vec2 f = clamp(uv * vec2(float(tilesX), float(tilesY)) - 0.5, vec2(0.0), vec2(float(tilesX - 1), float(tilesY - 1)));
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, ivec2(tilesX - 1, tilesY - 1));
  vec2 t = f - vec2(i0);
  float top = mix(lutAt(i0.y * tilesX + i0.x, fb, bins), lutAt(i0.y * tilesX + i1.x, fb, bins), t.x);
  float bot = mix(lutAt(i1.y * tilesX + i0.x, fb, bins), lutAt(i1.y * tilesX + i1.x, fb, bins), t.x);
  return mix(top, bot, t.y);
}

vec3 grade(vec3 src, vec2 uv) {
  float split = p[0].y;
  float strength = p[0].z;
  if (uv.x < split || strength <= 0.0) return src;
  vec3 binf = p[1].xyz; float veil = p[1].w;
  vec3 betaB = p[2].xyz; float look = p[2].w;
  vec3 cB = p[3].xyz; float dehaze = p[3].w;
  vec3 attn = p[4].xyz; float gainCap = p[4].w;
  vec3 wb = p[5].xyz; float exposure = p[5].w;
  float black = p[6].x, white = p[6].y, levelsMix = p[6].z, clarity = p[6].w;
  float saturation = p[7].x, chromaK = p[7].y, chromaC0 = p[7].z, depthGuide = p[7].w;
  int tilesX = int(p[8].z + 0.5), tilesY = int(p[8].w + 0.5), bins = int(p[9].x + 0.5);
  float floorFrac = p[9].y, zLo = p[9].z, zHi = p[9].w;
  vec3 mu = p[10].xyz; float shadowFloor = p[10].w;
  vec3 waterWb = p[11].xyz; float hueFarHi = p[11].w;
  float confLo = p[12].x, confHi = p[12].y, hueLo = p[12].z, hueHi = p[12].w;
  float knee = p[15].x, subLo = p[15].y, subHi = p[15].z, hueFarLo = p[15].w;
  float achroma = p[13].w;
  vec2 veilHue = p[14].xy;
  float waterExposure = p[14].z, zMean = p[14].w;

  vec3 lin = srgbToLinear(src);
  // Range proxy: joint-bilateral fields where the map still matches the
  // pixel, the per-pixel prior where it doesn't.
  float dPix = mu.x + mu.y * max(src.g, src.b) + mu.z * src.r;
  float k, personMap;
  vec4 fld = sampleFields(uv, lin, k, personMap);
  float person = clamp(personMap, 0.0, 1.0);
  float zRange = max(0.02, zHi - zLo);
  float zPix = clamp((dPix - zLo) / zRange, 0.0, 1.15);
  float zMap = clamp(fld.x + clamp(depthGuide * (dPix - fld.z) / zRange, -0.25, 0.25), 0.0, 1.15);
  float z = mix(zPix, zMap, k);
  float veilScale = mix(1.0, fld.w, k);

  // De-scatter: per channel where the signal is healthy, proportional
  // (hue-preserving) where it isn't; then compensate and white-balance.
  vec3 bf = veil * binf * (1.0 - exp(-(betaB * z + cB)));
  vec3 B = veilScale * bf;                 // classifies: is this water?
  vec3 Bs = min(1.0, veilScale) * bf;      // subtracted from objects
  float lumI = max(1e-5, lum(lin));
  float lumB = lum(B);
  float lumBs = lum(Bs);
  float sig = max(0.0, (lumI - lumB) / lumI);
  // A hue far from the veil's is a near object the global fit overstates:
  // proportional (hue-preserving) subtraction only (see apply.ts).
  vec3 lab0 = linearToOklab(lin);
  float wSub = smoothstepf(subLo, subHi, sig) * (1.0 - hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma));
  vec3 per = max(lin - Bs, lin * floorFrac);
  vec3 D = mix(lin * max(floorFrac, 1.0 - lumBs / lumI), per, wSub);
  // Water/object confidence: the map where it matches, else the pixel's own
  // hue + signal tests (the analysis runs the same on the thumbnail).
  float confSignal = smoothstepf(confLo, confHi, sig);
  float confBright = smoothstepf(CONF_BRIGHT_LO, CONF_BRIGHT_HI, sig);
  float confPix = min(confSignal, max(hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma), confBright));
  // Whatever the map says, a pixel the veil model would nearly erase
  // (tiny D) must take the water path — the physics path would crush it
  // to black, which is the dark ghost on moving content.
  float conf = max(mix(confPix, clamp(fld.y, 0.0, 1.0), k), person) * confSignal;
  if (p[0].w > 0.5) return vec3(k, confPix, clamp(fld.y, 0.0, 1.0));
  vec3 rangeGain = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  vec3 full = D * rangeGain * wb;
  float ew = pow(exposure, waterExposure);
  vec3 water = lin * waterWb * ew * (1.0 - dehaze * min(0.9, lumBs / lumI));
  vec3 o = water + (full * exposure - water) * conf;
  // Levels on luminance, ratio-preserving.
  float Y = lum(o);
  float Ylv = Y + ((Y - black) / (white - black) - Y) * levelsMix;
  float ratio = Y > 1e-5 ? max(0.0, Ylv) / Y : 1.0;
  o *= ratio;
  Y = max(0.0, Ylv);

  // Local contrast on encoded luminance.
  if (clarity > 0.0) {
    float encY = linearToSrgb(vec3(Y)).x;
    float eq = sampleClahe(uv, encY, tilesX, tilesY, bins);
    float encNew = clamp(encY + (eq - encY) * clarity, 0.0, 1.0);
    float Ynew = srgbToLinear(vec3(encNew)).x;
    ratio = Y > 1e-5 ? Ynew / Y : 1.0;
    o *= ratio;
  }

  // Shadow floor and highlight shoulder — last, so levels/CLAHE can't undo them.
  {
    float yo = lum(o);
    float sf = 0.97 + (shadowFloor - 0.97) * smoothstepf(0.02, 0.15, lumI);
    float yt = max(yo, sf * lumI * ew);
    if (yt > knee) yt = knee + (1.0 - knee) * (1.0 - exp(-(yt - knee) / (1.0 - knee)));
    if (yo > 1e-6) o *= yt / yo;
  }

  // Chroma ceiling relative to the source, then saturation.
  float cSrc = length(lab0.yz);
  vec3 lab = linearToOklab(max(o, vec3(0.0)));
  float C = length(lab.yz);
  float cMax = chromaK * cSrc + chromaC0;
  float scale = (C > cMax ? cMax / C : 1.0) * saturation;
  vec3 o1 = oklabToLinear(deepBlueLook(vec3(lab.x, skinTone(lab.x, lab.yz * scale, person)), look, 1.0 - conf, p[16].x));
  vec3 o2 = compressToGamut(o1);
  vec3 outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}`;

export const GRADE_WGSL = `${LOOK_CONSTS_WGSL}
const JBU_SIGMA: f32 = 0.12;

fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}
fn linearToSrgb(cIn: vec3<f32>) -> vec3<f32> {
  let c = clamp(cIn, vec3(0.0), vec3(1.0));
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
fn lum(c: vec3<f32>) -> f32 { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
fn cbrt(x: f32) -> f32 { return pow(max(0.0, x), 1.0 / 3.0); }
fn linearToOklab(c: vec3<f32>) -> vec3<f32> {
  let l = cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  let m = cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  let s = cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
fn oklabToLinear(lab: vec3<f32>) -> vec3<f32> {
  let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  let l = l_ * l_ * l_; let m = m_ * m_ * m_; let s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
fn compressToGamut(c: vec3<f32>) -> vec3<f32> {
  let Y = clamp(lum(c), 0.0, 1.0);
  var t = 1.0;
  for (var i = 0; i < 3; i++) {
    let v = c[i];
    if (v > 1.0) { t = min(t, (1.0 - Y) / (v - Y)); }
    else if (v < 0.0) { t = min(t, (0.0 - Y) / (v - Y)); }
  }
  if (t >= 1.0) { return c; }
  t = max(0.0, t);
  return vec3(Y) + t * (c - vec3(Y));
}
// Returns (z, conf, d, veilScale) and the guide-match weight k in .w of the second value.
fn sampleFields(uv: vec2<f32>, c: vec3<f32>) -> array<vec4<f32>, 2> {
  let size = vec2<i32>(textureDimensions(u_data0, 0));
  let f = clamp(uv * vec2<f32>(size) - 0.5, vec2(0.0), vec2<f32>(size) - 1.0);
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, size - 1);
  let t = f - vec2<f32>(i0);
  let cn = length(c) + 0.02;
  var sum = vec4(0.0); var bil = vec4(0.0); var sw = 0.0; var sp = 0.0; var bp = 0.0;
  for (var k = 0; k < 4; k++) {
    let right = (k == 1 || k == 3);
    let bottom = (k >= 2);
    let ij = vec2<i32>(select(i0.x, i1.x, right), select(i0.y, i1.y, bottom));
    let ws = select(1.0 - t.x, t.x, right) * select(1.0 - t.y, t.y, bottom);
    let fld = textureLoad(u_data0, ij, 0);
    let gd = textureLoad(u_data2, ij, 0);
    let g = gd.xyz;
    let diff = length(c - g) / (cn + length(g));
    let wr = exp(-(diff * diff) / (2.0 * JBU_SIGMA * JBU_SIGMA));
    sum += ws * wr * fld;
    sw += ws * wr;
    bil += ws * fld;
    sp += ws * wr * gd.w;
    bp += ws * gd.w;
  }
  // second vector: (person, 0, 0, k)
  if (sw < 1e-6) { return array<vec4<f32>, 2>(bil, vec4(bp, 0.0, 0.0, 0.0)); }
  return array<vec4<f32>, 2>(sum / sw, vec4(sp / sw, 0.0, 0.0, min(1.0, sw / 0.08)));
}
fn smoothstepf(e0: f32, e1: f32, x: f32) -> f32 { let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
fn skinTone(L: f32, ab: vec2<f32>, person: f32) -> vec2<f32> {
  if (person <= 0.0) { return ab; }
  let C = length(ab);
  let h = atan2(ab.y, ab.x);
  var d = h - SKIN_BAND_HUE; d -= 6.2831853 * round(d / 6.2831853);
  let inBand = max(1.0 - smoothstepf(SKIN_BAND_IN, SKIN_BAND_OUT, abs(d)), 1.0 - smoothstepf(SKIN_ACHROMA * 0.5, SKIN_ACHROMA, C));
  let w = smoothstepf(SKIN_W_LO, SKIN_W_HI, person) * inBand * smoothstepf(SKIN_L_LO, SKIN_L_HI, L) * (1.0 - smoothstepf(SKIN_C_LO, SKIN_C_HI, C));
  if (w <= 0.0) { return ab; }
  var dh = SKIN_HUE - h; dh -= 6.2831853 * round(dh / 6.2831853);
  let h2 = h + dh * SKIN_MIX * w;
  let C2 = C + max(0.0, SKIN_C_MIN - C) * w;
  return vec2(C2 * cos(h2), C2 * sin(h2));
}
fn deepBlueLook(lab: vec3<f32>, look: f32, water: f32, hazeW: f32) -> vec3<f32> {
  if (look <= 0.0) { return lab; }
  let C = length(lab.yz);
  let h = atan2(lab.z, lab.y);
  let vivid = smoothstepf(LOOK_KEEP_LO, LOOK_KEEP_HI, C);
  var dw = h - LOOK_WARM_HUE; dw -= 6.2831853 * round(dw / 6.2831853);
  let warm = (1.0 - smoothstepf(LOOK_WARM_IN, LOOK_WARM_OUT, abs(dw))) * smoothstepf(LOOK_WARM_LO, LOOK_WARM_HI, C);
  let wTint = (1.0 - vivid) * (1.0 - warm) * (1.0 - smoothstepf(LOOK_BRIGHT_LO, LOOK_BRIGHT_HI, lab.x)) * smoothstepf(LOOK_DARK_LO, LOOK_DARK_HI, lab.x);
  let w = wTint * look * LOOK_MIX;
  let L2 = pow(max(lab.x, 0.0), 1.0 + LOOK_GAMMA * look);
  let Ct = (LOOK_C0 + LOOK_C1 * L2) * (1.0 + LOOK_HAZE_CHROMA * hazeW);
  let t = Ct * vec2(cos(LOOK_TARGET_HUE), sin(LOOK_TARGET_HUE));
  let ds = 1.0 - look * LOOK_NEUTRAL_DESAT * (1.0 - smoothstepf(LOOK_NEUTRAL_LO, LOOK_NEUTRAL_HI, C));
  return vec3(L2, (lab.yz + (t - lab.yz) * w) * ds);
}
fn hueFar(ab: vec2<f32>, veilHue: vec2<f32>, lo: f32, hi: f32, achroma: f32) -> f32 {
  let c = length(ab);
  if (c < achroma) { return 0.0; }
  let cosang = clamp(dot(ab / c, veilHue), -1.0, 1.0);
  let t = 1.0 - smoothstepf(cos(hi), cos(lo), cosang);
  return t * smoothstepf(achroma, achroma * 2.0, c);
}
fn hueConf(ab: vec2<f32>, veilHue: vec2<f32>, lo: f32, hi: f32, achroma: f32) -> f32 {
  let c = length(ab);
  if (c < achroma) { return 1.0; }
  let cosang = clamp(dot(ab / c, veilHue), -1.0, 1.0);
  let t = 1.0 - smoothstepf(cos(hi), cos(lo), cosang);
  let kk = smoothstepf(achroma, achroma * 2.0, c);
  return t + (1.0 - t) * (1.0 - kk);
}
fn lutAt(tile: i32, fb: f32, bins: i32) -> f32 {
  if (fb < 0.0) { return textureLoad(u_data1, vec2<i32>(0, tile), 0).x * (fb + 1.0); }
  let b0 = min(bins - 1, i32(fb));
  let b1 = min(bins - 1, b0 + 1);
  let v0 = textureLoad(u_data1, vec2<i32>(b0, tile), 0).x;
  let v1 = textureLoad(u_data1, vec2<i32>(b1, tile), 0).x;
  return mix(v0, v1, clamp(fb - f32(b0), 0.0, 1.0));
}
fn sampleClahe(uv: vec2<f32>, value: f32, tilesX: i32, tilesY: i32, bins: i32) -> f32 {
  let fb = value * f32(bins) - 1.0;
  let f = clamp(uv * vec2(f32(tilesX), f32(tilesY)) - 0.5, vec2(0.0), vec2(f32(tilesX - 1), f32(tilesY - 1)));
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, vec2<i32>(tilesX - 1, tilesY - 1));
  let t = f - vec2<f32>(i0);
  let top = mix(lutAt(i0.y * tilesX + i0.x, fb, bins), lutAt(i0.y * tilesX + i1.x, fb, bins), t.x);
  let bot = mix(lutAt(i1.y * tilesX + i0.x, fb, bins), lutAt(i1.y * tilesX + i1.x, fb, bins), t.x);
  return mix(top, bot, t.y);
}

fn grade(src: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let p = params.p;
  let split = p[0].y;
  let strength = p[0].z;
  if (uv.x < split || strength <= 0.0) { return src; }
  let binf = p[1].xyz; let veil = p[1].w;
  let betaB = p[2].xyz; let look = p[2].w;
  let cB = p[3].xyz; let dehaze = p[3].w;
  let attn = p[4].xyz; let gainCap = p[4].w;
  let wb = p[5].xyz; let exposure = p[5].w;
  let black = p[6].x; let white = p[6].y; let levelsMix = p[6].z; let clarity = p[6].w;
  let saturation = p[7].x; let chromaK = p[7].y; let chromaC0 = p[7].z; let depthGuide = p[7].w;
  let tilesX = i32(p[8].z + 0.5); let tilesY = i32(p[8].w + 0.5); let bins = i32(p[9].x + 0.5);
  let floorFrac = p[9].y; let zLo = p[9].z; let zHi = p[9].w;
  let mu = p[10].xyz; let shadowFloor = p[10].w;
  let waterWb = p[11].xyz; let hueFarHi = p[11].w;
  let confLo = p[12].x; let confHi = p[12].y; let hueLo = p[12].z; let hueHi = p[12].w;
  let knee = p[15].x; let subLo = p[15].y; let subHi = p[15].z; let hueFarLo = p[15].w;
  let achroma = p[13].w;
  let veilHue = p[14].xy;
  let waterExposure = p[14].z; let zMean = p[14].w;

  let lin = srgbToLinear(src);
  let dPix = mu.x + mu.y * max(src.g, src.b) + mu.z * src.r;
  let sf = sampleFields(uv, lin);
  let fld = sf[0];
  let k = sf[1].w;
  let person = clamp(sf[1].x, 0.0, 1.0);
  let zRange = max(0.02, zHi - zLo);
  let zPix = clamp((dPix - zLo) / zRange, 0.0, 1.15);
  let zMap = clamp(fld.x + clamp(depthGuide * (dPix - fld.z) / zRange, -0.25, 0.25), 0.0, 1.15);
  let z = mix(zPix, zMap, k);
  let veilScale = mix(1.0, fld.w, k);

  let bf = veil * binf * (1.0 - exp(-(betaB * z + cB)));
  let B = veilScale * bf;
  let Bs = min(1.0, veilScale) * bf;
  let lumI = max(1e-5, lum(lin));
  let lumB = lum(B);
  let lumBs = lum(Bs);
  let sig = max(0.0, (lumI - lumB) / lumI);
  let lab0 = linearToOklab(lin);
  let wSub = smoothstepf(subLo, subHi, sig) * (1.0 - hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma));
  let per = max(lin - Bs, lin * floorFrac);
  let D = mix(lin * max(floorFrac, 1.0 - lumBs / lumI), per, vec3(wSub));
  let confSignal = smoothstepf(confLo, confHi, sig);
  let confBright = smoothstepf(CONF_BRIGHT_LO, CONF_BRIGHT_HI, sig);
  let confPix = min(confSignal, max(hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma), confBright));
  let conf = max(mix(confPix, clamp(fld.y, 0.0, 1.0), k), person) * confSignal;
  if (p[0].w > 0.5) { return vec3(k, confPix, clamp(fld.y, 0.0, 1.0)); }
  let rangeGain = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  let full = D * rangeGain * wb;
  let ew = pow(exposure, waterExposure);
  let water = lin * waterWb * ew * (1.0 - dehaze * min(0.9, lumBs / lumI));
  var o = water + (full * exposure - water) * conf;
  var Y = lum(o);
  let Ylv = Y + ((Y - black) / (white - black) - Y) * levelsMix;
  var ratio = select(1.0, max(0.0, Ylv) / Y, Y > 1e-5);
  o *= ratio;
  Y = max(0.0, Ylv);

  if (clarity > 0.0) {
    let encY = linearToSrgb(vec3(Y)).x;
    let eq = sampleClahe(uv, encY, tilesX, tilesY, bins);
    let encNew = clamp(encY + (eq - encY) * clarity, 0.0, 1.0);
    let Ynew = srgbToLinear(vec3(encNew)).x;
    ratio = select(1.0, Ynew / Y, Y > 1e-5);
    o *= ratio;
  }

  {
    let yo = lum(o);
    let sf = 0.97 + (shadowFloor - 0.97) * smoothstepf(0.02, 0.15, lumI);
    var yt = max(yo, sf * lumI * ew);
    if (yt > knee) { yt = knee + (1.0 - knee) * (1.0 - exp(-(yt - knee) / (1.0 - knee))); }
    if (yo > 1e-6) { o *= yt / yo; }
  }
  let cSrc = length(lab0.yz);
  let lab = linearToOklab(max(o, vec3(0.0)));
  let C = length(lab.yz);
  let cMax = chromaK * cSrc + chromaC0;
  let scale = select(1.0, cMax / C, C > cMax) * saturation;
  let o1 = oklabToLinear(deepBlueLook(vec3(lab.x, skinTone(lab.x, lab.yz * scale, person)), look, 1.0 - conf, p[16].x));
  let o2 = compressToGamut(o1);
  let outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}`;
