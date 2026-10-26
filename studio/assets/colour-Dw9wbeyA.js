import{C as e,D as t,E as n,O as r,S as i,T as a,_ as o,a as s,b as c,c as l,d as u,f as d,g as f,h as p,i as m,l as h,m as g,o as _,p as v,s as y,u as b,v as x,w as S,x as ee,y as te}from"./index-A5MSwDq9.js";var C={devLo:.035,devHi:.085,vetoLo:.015,vetoHi:.1,vetoDark:.9,subjLo:.02,subjHi:.05,coreIn:.85,abWeight:1.5,darkWeight:.4,inlierLo:.6,inlierHi:.8,rmsLo:.02,rmsHi:.04,inlierK:2.5,edgeLo:.006,edgeHi:.014,edgeRadius:10,ringR:2,closeR:4,schoolN:3,farShareLo:.15,farShareHi:.3,solidDev:.8,relKeep:.3,solidLo:.2,solidHi:.26,farMargin:2,seedFrac:.5,growDev:.06,minArea:.008,lightDL:.03,lightShareLo:.12,lightShareHi:.25,growEdgeLo:.08,growEdgeHi:.16,blueLo:1.3,blueHi:1.7,step:4,iterations:3};C.abWeight*C.abWeight;var w=`
const float CONF_BRIGHT_LO = ${m.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${m.hi.toFixed(4)};
const float PERSON_LUM_LO = ${v.lo.toFixed(4)};
const float PERSON_LUM_HI = ${v.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${_.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${_.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${h.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${h.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${h.farKeep.toFixed(4)};
const float VIVID_C_LO = ${f.cLo.toFixed(4)};
const float VIVID_C_HI = ${f.cHi.toFixed(4)};
const float VIVID_KEEP = ${f.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${e.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${i.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${ee.toFixed(4)};
const float LOOK_GAMMA = ${u.gamma.toFixed(4)};
const float LOOK_WATER_DIM = ${u.waterDim.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${u.hazeChroma.toFixed(4)};
const float LOOK_OBJ_CHROMA = ${u.objChroma.toFixed(4)};
const float LOOK_WARM_HAZE = ${u.warmHaze.toFixed(4)};
const float LOOK_DARK_HAZE = ${u.darkHaze.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${u.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${u.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${u.neutralHi.toFixed(4)};
const float LOOK_NEUTRAL_L_LO = ${u.neutralLLo.toFixed(4)};
const float LOOK_NEUTRAL_L_HI = ${u.neutralLHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${u.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${u.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${u.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${u.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${u.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${u.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${u.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${u.darkHi.toFixed(4)};
const float LOOK_FAR_LO = ${u.farLo.toFixed(6)};
const float LOOK_FAR_HI = ${u.farHi.toFixed(6)};
const float LOOK_FAR_KEEP = ${u.farKeep.toFixed(4)};
const float LOOK_BRIGHT_LO = ${u.brightLo.toFixed(4)};
const float LOOK_BRIGHT_HI = ${u.brightHi.toFixed(4)};
const float LOOK_KEEP_LO = ${u.keepLo.toFixed(4)};
const float LOOK_KEEP_HI = ${u.keepHi.toFixed(4)};
const float LOOK_C0 = ${u.c0.toFixed(4)};
const float LOOK_C1 = ${u.c1.toFixed(4)};
const float LOOK_MIX = ${u.mix.toFixed(4)};
const float SKIN_HUE = ${g.hue.toFixed(6)};
const float SKIN_BAND_HUE = ${g.bandHue.toFixed(6)};
const float SKIN_BAND_IN = ${g.bandIn.toFixed(6)};
const float SKIN_BAND_OUT = ${g.bandOut.toFixed(6)};
const float SKIN_ACHROMA = ${g.achroma.toFixed(4)};
const float SKIN_L_LO = ${g.lLo.toFixed(4)};
const float SKIN_L_HI = ${g.lHi.toFixed(4)};
const float SKIN_C_LO = ${g.cLo.toFixed(4)};
const float SKIN_C_HI = ${g.cHi.toFixed(4)};
const float SKIN_MIX = ${g.mix.toFixed(4)};
const float SKIN_W_LO = ${g.wLo.toFixed(4)};
const float SKIN_W_HI = ${g.wHi.toFixed(4)};
const float SKIN_C_MIN = ${g.cMin.toFixed(4)};
const float DG_K = ${y.k.toFixed(4)};
const float DG_EPS = ${y.eps.toFixed(5)};
const float DG_R_MIN = ${y.rMin.toFixed(4)};
const float DG_R_MAX = ${y.rMax.toFixed(4)};
const float ON_COS = ${Math.cos(d.hue).toFixed(6)};
const float ON_SIN = ${Math.sin(d.hue).toFixed(6)};
const float ON_COS_OUT = ${Math.cos(d.bandOut).toFixed(6)};
const float ON_COS_IN = ${Math.cos(d.bandIn).toFixed(6)};
const float ON_R_LO = ${d.rLo.toFixed(4)};
const float ON_R_HI = ${d.rHi.toFixed(4)};
const float ON_L_LO = ${d.lLo.toFixed(4)};
const float ON_L_HI = ${d.lHi.toFixed(4)};
const float ON_MIX = ${d.mix.toFixed(4)};
const float ON_FAR_LO = ${d.farLo.toFixed(6)};
const float ON_FAR_HI = ${d.farHi.toFixed(6)};
const float ON_LIFT = ${d.lift.toFixed(4)};
const float ON_SILVER = ${d.silver.toFixed(4)};
const float BD_VETO_LO = ${C.vetoLo.toFixed(4)};
const float BD_VETO_HI = ${C.vetoHi.toFixed(4)};
const float BD_RING_R = ${C.ringR.toFixed(1)};
const float BD_CORE_IN = ${C.coreIn.toFixed(4)};
const float BD_SUBJ_LO = ${C.subjLo.toFixed(4)};
const float BD_SUBJ_HI = ${C.subjHi.toFixed(4)};
const float BD_DARK = ${C.vetoDark.toFixed(4)};
const float BD_AB2 = ${(C.abWeight*C.abWeight).toFixed(4)};
const float ON_CONF_LO = ${d.confLo.toFixed(4)};
const float ON_CONF_HI = ${d.confHi.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(d.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(d.warmHue).toFixed(6)};
const float ON_WARM_LO = ${d.warmLo.toFixed(4)};
const float ON_WARM_HI = ${d.warmHi.toFixed(4)};
`,ne=w.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),T=`${w}
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
bool inGamut(vec3 c) { return all(greaterThanEqual(c, vec3(0.0))) && all(lessThanEqual(c, vec3(1.0))); }
// Largest in-gamut Oklab chroma at this lightness along this hue (bisection).
float gamutChroma(float L, vec2 h) {
  float lo = 0.0, hi = 0.4;
  for (int i = 0; i < 10; i++) {
    float mid = 0.5 * (lo + hi);
    if (inGamut(oklabToLinear(vec3(L, h * mid)))) lo = mid; else hi = mid;
  }
  return lo;
}
// Chroma knee short of the gamut edge (see color.ts capChroma).
vec3 capChroma(vec3 lab, float cSrc) {
  float C = length(lab.yz);
  if (C < 1e-5) return lab;
  vec2 h = lab.yz / C;
  float cMax = gamutChroma(lab.x, h);
  float knee = GAMUT_CHROMA_KNEE * cMax;
  if (C <= knee || cMax <= 1e-5) return lab;
  float room = GAMUT_CHROMA_EDGE * cMax - knee;
  float c2 = max(min(min(C, cSrc), GAMUT_CHROMA_EDGE * cMax), knee + room * (1.0 - exp(-(C - knee) / room)));
  return vec3(lab.x, h * c2);
}
// Constant-luminance gamut compression (see color.ts).
vec3 fitToGamut(vec3 c);
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
// Over-range: scale first (keeps hue/saturation, up to GAMUT_SCALE_MIN darker), then compress (see color.ts).
vec3 fitToGamut(vec3 c) {
  float m = max(c.r, max(c.g, c.b));
  if (m > 1.0) c *= max(GAMUT_SCALE_MIN, 1.0 / m);
  return compressToGamut(c);
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
// Haze-lift ratio at value y for subtraction t: smooth max((y − t)/((1 − t)·y), floor), unbiased at 1 (see params.ts hazeLiftRatio).
float hazeLiftRatio(float y, float t) {
  if (t <= 0.0) return 1.0;
  float q = (y - t) / ((1.0 - t) * max(y, 1e-6));
  float d = q - HAZE_LIFT_FLOOR;
  float d1 = 1.0 - HAZE_LIFT_FLOOR;
  float s2 = HAZE_LIFT_SOFT * HAZE_LIFT_SOFT;
  return 0.5 * (q + HAZE_LIFT_FLOOR + sqrt(d * d + s2)) - 0.5 * (sqrt(d1 * d1 + s2) - d1);
}
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
vec3 deepBlueLook(vec3 lab, float look, float water, float hazeW, float deep) {
  if (look <= 0.0) return lab;
  float C = length(lab.yz);
  float h = atan(lab.z, lab.y);
  float vivid = smoothstepf(LOOK_KEEP_LO, LOOK_KEEP_HI, C);
  float dw = h - LOOK_WARM_HUE; dw -= 6.2831853 * round(dw / 6.2831853);
  float warm = (1.0 - smoothstepf(LOOK_WARM_IN, LOOK_WARM_OUT, abs(dw))) * smoothstepf(LOOK_WARM_LO + LOOK_WARM_HAZE * hazeW, LOOK_WARM_HI + LOOK_WARM_HAZE * hazeW, C);
  float df = h - LOOK_TARGET_HUE; df -= 6.2831853 * round(df / 6.2831853);
  float far = smoothstepf(LOOK_FAR_LO, LOOK_FAR_HI, abs(df));
  float darkHi = LOOK_DARK_LO + (LOOK_DARK_HI - LOOK_DARK_LO) * (1.0 - LOOK_DARK_HAZE * hazeW);
  float wTint = (1.0 - vivid) * (1.0 - warm) * (1.0 - smoothstepf(LOOK_BRIGHT_LO, LOOK_BRIGHT_HI, lab.x)) * smoothstepf(LOOK_DARK_LO, darkHi, lab.x) * (1.0 - LOOK_FAR_KEEP * (1.0 - hazeW) * far);
  float w = wTint * look * LOOK_MIX;
  float L2 = pow(max(lab.x, 0.0), 1.0 + LOOK_GAMMA * look) * (1.0 - LOOK_WATER_DIM * look * water * (1.0 - hazeW));
  float keep = max(C, LOOK_C0 + LOOK_C1 * L2);
  float ctWater = max(C, (LOOK_C0 + LOOK_C1 * L2) * (1.0 + LOOK_HAZE_CHROMA * hazeW));
  float ctObj = keep + (LOOK_OBJ_CHROMA - keep) * hazeW;
  float Ct = ctObj + (ctWater - ctObj) * max(water, deep);
  vec2 t = Ct * vec2(cos(LOOK_TARGET_HUE), sin(LOOK_TARGET_HUE));
  float ds = 1.0 - look * LOOK_NEUTRAL_DESAT * (1.0 - smoothstepf(LOOK_NEUTRAL_LO, LOOK_NEUTRAL_HI, C)) * smoothstepf(LOOK_NEUTRAL_L_LO, LOOK_NEUTRAL_L_HI, lab.x);
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

// Object neutral tone (see OBJECT_NEUTRAL in params.ts; mirrors apply.ts objectNeutral).
float objectNeutral(float L, vec2 ab, vec3 lin, float srcFar, float conf, float strength) {
  if (strength <= 0.0 || conf <= 0.0) return 0.0;
  float C = length(ab);
  if (C < 1e-5) return 0.0;
  float cosang = (ab.x * ON_COS + ab.y * ON_SIN) / C;
  float band = smoothstepf(ON_COS_OUT, ON_COS_IN, cosang);
  float redDef = 1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)));
  float light = smoothstepf(ON_L_LO, ON_L_HI, L);
  return strength * ON_MIX * conf * (band + (1.0 - band) * redDef) * redDef * light * (1.0 - srcFar);
}
// Per-pixel departure from the backdrop surface in p18–p22 (backdrop.ts backdropSubject before its ramp).
float backdropDev(vec3 lab, vec2 uv) {
  float x = uv.x - 0.5, y = uv.y - 0.5;
  vec4 q = vec4(1.0, x, y, x * x);
  float xy = x * y, yy = y * y;
  float eL = dot(p[18], q) + p[19].x * xy + p[19].y * yy;
  float eA = p[19].z + p[19].w * x + dot(p[20], vec4(y, x * x, xy, yy));
  float eB = dot(p[21], q) + p[22].x * xy + p[22].y * yy;
  float dl = lab.x - eL;
  float el = dl > 0.0 ? dl : dl * BD_DARK;
  float ea = lab.y - eA, eb = lab.z - eB;
  return sqrt(el * el + BD_AB2 * (ea * ea + eb * eb));
}
// Open-water subject weight (mirrors apply.ts subjectWeight / mapConfAt).
float mapConf(vec2 uv) {
  ivec2 size = textureSize(u_data0, 0);
  vec2 f = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size) - 1.0);
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, size - 1);
  vec2 t = f - vec2(i0);
  float a = mix(texelFetch(u_data0, i0, 0).y, texelFetch(u_data0, ivec2(i1.x, i0.y), 0).y, t.x);
  float b = mix(texelFetch(u_data0, ivec2(i0.x, i1.y), 0).y, texelFetch(u_data0, i1, 0).y, t.x);
  return mix(a, b, t.y);
}
float subjectWeight(vec2 uv, float coreJbu, float dev) {
  vec2 r = BD_RING_R / vec2(textureSize(u_data0, 0));
  float core = clamp(coreJbu, 0.0, 1.0);
  float ring = 0.0;
  ring = max(ring, mapConf(uv + vec2(r.x, 0.0)));
  ring = max(ring, mapConf(uv - vec2(r.x, 0.0)));
  ring = max(ring, mapConf(uv + vec2(0.0, r.y)));
  ring = max(ring, mapConf(uv - vec2(0.0, r.y)));
  ring = max(ring, mapConf(uv + 0.7071 * vec2(r.x, r.y)));
  ring = max(ring, mapConf(uv + 0.7071 * vec2(-r.x, r.y)));
  ring = max(ring, mapConf(uv + 0.7071 * vec2(r.x, -r.y)));
  ring = max(ring, mapConf(uv - 0.7071 * vec2(r.x, r.y)));
  float trim = smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, dev);
  return max(core * mix(smoothstepf(BD_CORE_IN, 1.0, core), 1.0, trim), min(min(1.0, ring), trim));
}
// Object weight and warm clamp (see apply.ts objectWeight / warmClamp).
float objectWeight(float conf) { return smoothstepf(ON_CONF_LO, ON_CONF_HI, conf); }
float warmClamp(vec2 ab, vec3 lin, float srcFar, float person, float strength) {
  if (strength <= 0.0) return 1.0;
  float C = length(ab);
  if (C < 1e-5) return 1.0;
  float cosw = (ab.x * ON_WARM_COS + ab.y * ON_WARM_SIN) / C;
  float redDef = 1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)));
  return 1.0 - strength * redDef * smoothstepf(ON_WARM_LO, ON_WARM_HI, cosw) * (1.0 - srcFar) * (1.0 - clamp(person, 0.0, 1.0));
}
// Object lift (see OBJECT_NEUTRAL.lift; mirrors apply.ts objectLift).
float objectLift(float L, float conf, float strength) {
  if (strength <= 0.0 || conf <= 0.0) return 0.0;
  return ON_LIFT * strength * conf * smoothstepf(ON_L_LO - 0.1, ON_L_HI - 0.1, L) * (1.0 - smoothstepf(0.82, 0.95, L));
}
// Artifact guard: the source pixel's luminance against its base's (see DETAIL_GUARD; apply.ts detailRatio).
float detailRatio(vec3 src, vec3 baseLin) {
  float ys = lum(srgbToLinear(src));
  return clamp((ys + DG_EPS) / (lum(baseLin) + DG_EPS), DG_R_MIN, DG_R_MAX);
}
// Temporal layer hooks (temporal.ts): subject prior in, raw subject mask out.
float g_subjPrior = 0.0;
float g_subjOut = 0.0;
vec3 gradeD(vec3 src, vec3 base, vec2 uv) {
  g_subjOut = 0.0;
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

  // The grade runs on the artifact guard's base (see DETAIL_GUARD).
  vec3 lin = srgbToLinear(base);
  // Range proxy: joint-bilateral fields where the map still matches the
  // pixel, the per-pixel prior where it doesn't.
  float dPix = mu.x + mu.y * max(base.g, base.b) + mu.z * base.r;
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
  // Open water: the backdrop test replaces the hue test and vetoes the lagging map (see apply.ts).
  float bdev = p[16].w > 0.0 ? backdropDev(lab0, uv) : 1.0;
  float bsub = smoothstepf(BD_VETO_LO, BD_VETO_HI, bdev);
  float veto = mix(1.0, bsub, p[16].w);
  float confPix = min(confSignal, max(hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma) * veto, confBright));
  // Whatever the map says, a pixel the veil model would nearly erase
  // (tiny D) must take the water path — the physics path would crush it
  // to black, which is the dark ghost on moving content.
  // Open blue water: no source red → the water path's colour (see apply.ts).
  float conf = max(mix(confPix, min(clamp(fld.y, 0.0, 1.0), veto), k), person * smoothstepf(PERSON_LUM_LO, PERSON_LUM_HI, lumI)) * confSignal * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  // Raw subject mask (before the tone gate) is also the temporal tracker's output; the warped
  // previous mask (g_subjPrior, kept near the map by the temporal layer) holds where the pixel departs like a subject.
  float subjRaw = p[16].w > 0.0 ? max(subjectWeight(uv, clamp(fld.y, 0.0, 1.0) * k, bdev), g_subjPrior * smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev)) : 0.0;
  g_subjOut = subjRaw;
  float subj = subjRaw * p[16].w * p[22].z;
  if (p[0].w > 0.5) return vec3(k, confPix, clamp(fld.y, 0.0, 1.0));
  vec3 rangeGain = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  vec3 full = D * rangeGain * wb;
  float ew = pow(exposure, waterExposure);
  vec3 water = lin * waterWb * ew * (1.0 - dehaze * min(0.9, lumBs / lumI) * smoothstepf(DEHAZE_LUM_LO, DEHAZE_LUM_HI, lumI));
  vec3 o = water + (full * exposure - water) * conf;
  // Haze lift removal (see apply.ts): per channel, soft toe.
  vec3 tc = p[17].xyz;
  float hf = 1.0;
  if (tc.r + tc.g + tc.b > 0.0) {
    float y0 = lum(o);
    // Far-hue pixels take the hue-preserving luminance ratio (see apply.ts).
    vec3 rc = vec3(hazeLiftRatio(o.r, tc.r), hazeLiftRatio(o.g, tc.g), hazeLiftRatio(o.b, tc.b));
    o *= mix(rc, vec3(hazeLiftRatio(y0, p[17].w * (1.0 - HAZE_LIFT_FAR_KEEP))), hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma));
    hf = y0 > 1e-6 ? lum(o) / y0 : 1.0;
  }
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
    float yt = max(yo, sf * lumI * ew * hf);
    if (yt > knee) yt = knee + (1.0 - knee) * (1.0 - exp(-(yt - knee) / (1.0 - knee)));
    // A pixel levels clipped to nothing is rebuilt from the source at the floor (see apply.ts).
    if (yo > 1e-6) o *= yt / yo; else o = lin * (yt / lumI);
  }

  // Chroma ceiling relative to the source, then saturation.
  float cSrc = length(lab0.yz);
  vec3 lab = linearToOklab(max(o, vec3(0.0)));
  float C = length(lab.yz);
  float cMax = chromaK * cSrc + chromaC0;
  float scale = (C > cMax ? cMax / C : 1.0);
  float vividW = smoothstepf(VIVID_C_LO, VIVID_C_HI, cSrc) * hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma);
  float cMin = VIVID_KEEP * cSrc * vividW;
  if (C > 1e-6 && C * scale < cMin) scale = cMin / C;
  scale *= saturation;
  float onFar = hueFar(lab0.yz, veilHue, ON_FAR_LO, ON_FAR_HI, achroma);
  float tN = objectNeutral(lab.x, lab.yz, lin, onFar, objectWeight(subj), p[16].w);
  float personS = person * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  scale *= warmClamp(lab.yz, lin, onFar, personS, p[16].w);
  vec2 nab = mix(lab.yz * scale, veilHue * ON_SILVER, tN);
  float Ls = lab.x + objectLift(lab.x, objectWeight(subj), p[16].w);
  vec3 o1 = oklabToLinear(capChroma(deepBlueLook(vec3(Ls, skinTone(Ls, nab, personS)), look, 1.0 - hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma), p[16].x, p[16].y), cSrc));
  vec3 o2 = fitToGamut(o1 * detailRatio(src, lin));
  vec3 outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}
vec3 grade(vec3 src, vec2 uv) { return gradeD(src, src, uv); }`,E=`${ne}
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
fn inGamut(c: vec3<f32>) -> bool { return all(c >= vec3(0.0)) && all(c <= vec3(1.0)); }
fn gamutChroma(L: f32, h: vec2<f32>) -> f32 {
  var lo = 0.0;
  var hi = 0.4;
  for (var i = 0; i < 10; i++) {
    let mid = 0.5 * (lo + hi);
    if (inGamut(oklabToLinear(vec3(L, h * mid)))) { lo = mid; } else { hi = mid; }
  }
  return lo;
}
fn capChroma(lab: vec3<f32>, cSrc: f32) -> vec3<f32> {
  let C = length(lab.yz);
  if (C < 1e-5) { return lab; }
  let h = lab.yz / C;
  let cMax = gamutChroma(lab.x, h);
  let knee = GAMUT_CHROMA_KNEE * cMax;
  if (C <= knee || cMax <= 1e-5) { return lab; }
  let room = GAMUT_CHROMA_EDGE * cMax - knee;
  let c2 = max(min(min(C, cSrc), GAMUT_CHROMA_EDGE * cMax), knee + room * (1.0 - exp(-(C - knee) / room)));
  return vec3(lab.x, h * c2);
}
fn fitToGamut(cIn: vec3<f32>) -> vec3<f32> {
  var c = cIn;
  let m = max(c.r, max(c.g, c.b));
  if (m > 1.0) { c *= max(GAMUT_SCALE_MIN, 1.0 / m); }
  return compressToGamut(c);
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
fn hazeLiftRatio(y: f32, t: f32) -> f32 {
  if (t <= 0.0) { return 1.0; }
  let q = (y - t) / ((1.0 - t) * max(y, 1e-6));
  let d = q - HAZE_LIFT_FLOOR;
  let d1 = 1.0 - HAZE_LIFT_FLOOR;
  let s2 = HAZE_LIFT_SOFT * HAZE_LIFT_SOFT;
  return 0.5 * (q + HAZE_LIFT_FLOOR + sqrt(d * d + s2)) - 0.5 * (sqrt(d1 * d1 + s2) - d1);
}
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
fn deepBlueLook(lab: vec3<f32>, look: f32, water: f32, hazeW: f32, deep: f32) -> vec3<f32> {
  if (look <= 0.0) { return lab; }
  let C = length(lab.yz);
  let h = atan2(lab.z, lab.y);
  let vivid = smoothstepf(LOOK_KEEP_LO, LOOK_KEEP_HI, C);
  var dw = h - LOOK_WARM_HUE; dw -= 6.2831853 * round(dw / 6.2831853);
  let warm = (1.0 - smoothstepf(LOOK_WARM_IN, LOOK_WARM_OUT, abs(dw))) * smoothstepf(LOOK_WARM_LO + LOOK_WARM_HAZE * hazeW, LOOK_WARM_HI + LOOK_WARM_HAZE * hazeW, C);
  var df = h - LOOK_TARGET_HUE; df -= 6.2831853 * round(df / 6.2831853);
  let far = smoothstepf(LOOK_FAR_LO, LOOK_FAR_HI, abs(df));
  let darkHi = LOOK_DARK_LO + (LOOK_DARK_HI - LOOK_DARK_LO) * (1.0 - LOOK_DARK_HAZE * hazeW);
  let wTint = (1.0 - vivid) * (1.0 - warm) * (1.0 - smoothstepf(LOOK_BRIGHT_LO, LOOK_BRIGHT_HI, lab.x)) * smoothstepf(LOOK_DARK_LO, darkHi, lab.x) * (1.0 - LOOK_FAR_KEEP * (1.0 - hazeW) * far);
  let w = wTint * look * LOOK_MIX;
  let L2 = pow(max(lab.x, 0.0), 1.0 + LOOK_GAMMA * look) * (1.0 - LOOK_WATER_DIM * look * water * (1.0 - hazeW));
  let keep = max(C, LOOK_C0 + LOOK_C1 * L2);
  let ctWater = max(C, (LOOK_C0 + LOOK_C1 * L2) * (1.0 + LOOK_HAZE_CHROMA * hazeW));
  let ctObj = keep + (LOOK_OBJ_CHROMA - keep) * hazeW;
  let Ct = ctObj + (ctWater - ctObj) * max(water, deep);
  let t = Ct * vec2(cos(LOOK_TARGET_HUE), sin(LOOK_TARGET_HUE));
  let ds = 1.0 - look * LOOK_NEUTRAL_DESAT * (1.0 - smoothstepf(LOOK_NEUTRAL_LO, LOOK_NEUTRAL_HI, C)) * smoothstepf(LOOK_NEUTRAL_L_LO, LOOK_NEUTRAL_L_HI, lab.x);
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

fn objectNeutral(L: f32, ab: vec2<f32>, lin: vec3<f32>, srcFar: f32, conf: f32, strength: f32) -> f32 {
  if (strength <= 0.0 || conf <= 0.0) { return 0.0; }
  let C = length(ab);
  if (C < 1e-5) { return 0.0; }
  let cosang = (ab.x * ON_COS + ab.y * ON_SIN) / C;
  let band = smoothstepf(ON_COS_OUT, ON_COS_IN, cosang);
  let redDef = 1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)));
  let light = smoothstepf(ON_L_LO, ON_L_HI, L);
  return strength * ON_MIX * conf * (band + (1.0 - band) * redDef) * redDef * light * (1.0 - srcFar);
}
fn backdropDev(lab: vec3<f32>, uv: vec2<f32>) -> f32 {
  let p = params.p;
  let x = uv.x - 0.5; let y = uv.y - 0.5;
  let q = vec4<f32>(1.0, x, y, x * x);
  let xy = x * y; let yy = y * y;
  let eL = dot(p[18], q) + p[19].x * xy + p[19].y * yy;
  let eA = p[19].z + p[19].w * x + dot(p[20], vec4<f32>(y, x * x, xy, yy));
  let eB = dot(p[21], q) + p[22].x * xy + p[22].y * yy;
  let dl = lab.x - eL;
  let el = select(dl * BD_DARK, dl, dl > 0.0);
  let ea = lab.y - eA; let eb = lab.z - eB;
  return sqrt(el * el + BD_AB2 * (ea * ea + eb * eb));
}
fn mapConf(uv: vec2<f32>) -> f32 {
  let size = vec2<i32>(textureDimensions(u_data0, 0));
  let f = clamp(uv * vec2<f32>(size) - 0.5, vec2(0.0), vec2<f32>(size) - 1.0);
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, size - 1);
  let t = f - vec2<f32>(i0);
  let a = mix(textureLoad(u_data0, i0, 0).y, textureLoad(u_data0, vec2<i32>(i1.x, i0.y), 0).y, t.x);
  let b = mix(textureLoad(u_data0, vec2<i32>(i0.x, i1.y), 0).y, textureLoad(u_data0, i1, 0).y, t.x);
  return mix(a, b, t.y);
}
fn subjectWeight(uv: vec2<f32>, coreJbu: f32, dev: f32) -> f32 {
  let r = BD_RING_R / vec2<f32>(textureDimensions(u_data0, 0));
  let core = clamp(coreJbu, 0.0, 1.0);
  var ring = 0.0;
  ring = max(ring, mapConf(uv + vec2<f32>(r.x, 0.0)));
  ring = max(ring, mapConf(uv - vec2<f32>(r.x, 0.0)));
  ring = max(ring, mapConf(uv + vec2<f32>(0.0, r.y)));
  ring = max(ring, mapConf(uv - vec2<f32>(0.0, r.y)));
  ring = max(ring, mapConf(uv + 0.7071 * vec2<f32>(r.x, r.y)));
  ring = max(ring, mapConf(uv + 0.7071 * vec2<f32>(-r.x, r.y)));
  ring = max(ring, mapConf(uv + 0.7071 * vec2<f32>(r.x, -r.y)));
  ring = max(ring, mapConf(uv - 0.7071 * vec2<f32>(r.x, r.y)));
  let trim = smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, dev);
  return max(core * mix(smoothstepf(BD_CORE_IN, 1.0, core), 1.0, trim), min(min(1.0, ring), trim));
}
fn objectWeight(conf: f32) -> f32 { return smoothstepf(ON_CONF_LO, ON_CONF_HI, conf); }
fn warmClamp(ab: vec2<f32>, lin: vec3<f32>, srcFar: f32, person: f32, strength: f32) -> f32 {
  if (strength <= 0.0) { return 1.0; }
  let C = length(ab);
  if (C < 1e-5) { return 1.0; }
  let cosw = (ab.x * ON_WARM_COS + ab.y * ON_WARM_SIN) / C;
  let redDef = 1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)));
  return 1.0 - strength * redDef * smoothstepf(ON_WARM_LO, ON_WARM_HI, cosw) * (1.0 - srcFar) * (1.0 - clamp(person, 0.0, 1.0));
}
fn objectLift(L: f32, conf: f32, strength: f32) -> f32 {
  if (strength <= 0.0 || conf <= 0.0) { return 0.0; }
  return ON_LIFT * strength * conf * smoothstepf(ON_L_LO - 0.1, ON_L_HI - 0.1, L) * (1.0 - smoothstepf(0.82, 0.95, L));
}
fn detailRatio(src: vec3<f32>, baseLin: vec3<f32>) -> f32 {
  let ys = lum(srgbToLinear(src));
  return clamp((ys + DG_EPS) / (lum(baseLin) + DG_EPS), DG_R_MIN, DG_R_MAX);
}
fn grade(src: vec3<f32>, uv: vec2<f32>) -> vec3<f32> { return gradeD(src, src, uv); }
var<private> g_subjPrior: f32 = 0.0;
var<private> g_subjOut: f32 = 0.0;
fn gradeD(src: vec3<f32>, base: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  g_subjOut = 0.0;
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

  let lin = srgbToLinear(base);
  let dPix = mu.x + mu.y * max(base.g, base.b) + mu.z * base.r;
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
  let bdev = select(1.0, backdropDev(lab0, uv), p[16].w > 0.0);
  let bsub = smoothstepf(BD_VETO_LO, BD_VETO_HI, bdev);
  let veto = mix(1.0, bsub, p[16].w);
  let confPix = min(confSignal, max(hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma) * veto, confBright));
  let conf = max(mix(confPix, min(clamp(fld.y, 0.0, 1.0), veto), k), person * smoothstepf(PERSON_LUM_LO, PERSON_LUM_HI, lumI)) * confSignal * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  let subjRaw = select(0.0, max(subjectWeight(uv, clamp(fld.y, 0.0, 1.0) * k, bdev), g_subjPrior * smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev)), p[16].w > 0.0);
  g_subjOut = subjRaw;
  let subj = subjRaw * p[16].w * p[22].z;
  if (p[0].w > 0.5) { return vec3(k, confPix, clamp(fld.y, 0.0, 1.0)); }
  let rangeGain = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  let full = D * rangeGain * wb;
  let ew = pow(exposure, waterExposure);
  let water = lin * waterWb * ew * (1.0 - dehaze * min(0.9, lumBs / lumI) * smoothstepf(DEHAZE_LUM_LO, DEHAZE_LUM_HI, lumI));
  var o = water + (full * exposure - water) * conf;
  let tc = p[17].xyz;
  var hf = 1.0;
  if (tc.r + tc.g + tc.b > 0.0) {
    let y0 = lum(o);
    let rc = vec3(hazeLiftRatio(o.r, tc.r), hazeLiftRatio(o.g, tc.g), hazeLiftRatio(o.b, tc.b));
    o *= mix(rc, vec3(hazeLiftRatio(y0, p[17].w * (1.0 - HAZE_LIFT_FAR_KEEP))), hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma));
    hf = select(1.0, lum(o) / y0, y0 > 1e-6);
  }
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
    var yt = max(yo, sf * lumI * ew * hf);
    if (yt > knee) { yt = knee + (1.0 - knee) * (1.0 - exp(-(yt - knee) / (1.0 - knee))); }
    if (yo > 1e-6) { o *= yt / yo; } else { o = lin * (yt / lumI); }
  }
  let cSrc = length(lab0.yz);
  let lab = linearToOklab(max(o, vec3(0.0)));
  let C = length(lab.yz);
  let cMax = chromaK * cSrc + chromaC0;
  var scale = select(1.0, cMax / C, C > cMax);
  let vividW = smoothstepf(VIVID_C_LO, VIVID_C_HI, cSrc) * hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma);
  let cMin = VIVID_KEEP * cSrc * vividW;
  if (C > 1e-6 && C * scale < cMin) { scale = cMin / C; }
  scale *= saturation;
  let onFar = hueFar(lab0.yz, veilHue, ON_FAR_LO, ON_FAR_HI, achroma);
  let tN = objectNeutral(lab.x, lab.yz, lin, onFar, objectWeight(subj), p[16].w);
  let personS = person * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  scale *= warmClamp(lab.yz, lin, onFar, personS, p[16].w);
  let nab = mix(lab.yz * scale, veilHue * ON_SILVER, tN);
  let Ls = lab.x + objectLift(lab.x, objectWeight(subj), p[16].w);
  let o1 = oklabToLinear(capChroma(deepBlueLook(vec3(Ls, skinTone(Ls, nab, personS)), look, 1.0 - hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma), p[16].x, p[16].y), cSrc));
  let o2 = fitToGamut(o1 * detailRatio(src, lin));
  let outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}`,re=l.map(([e,t,n])=>`  dgTap(suv + vec2(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk, acc, sw);`).join(`
`),ie=l.map(([e,t,n])=>`  acc += dgTap(suv + vec2<f32>(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk);`).join(`
`),ae=`
void dgTap(vec2 uv, vec3 src, float ws, float kk, inout vec3 acc, inout float sw) {
  vec3 c = textureLod(u_source, uv, 0.0).rgb;
  vec3 d = c - src;
  float w = ws * exp(-dot(d, d) * kk);
  acc += w * c;
  sw += w;
}
vec3 detailBase(vec2 suv, vec3 src) {
  float guard = p[16].z;
  if (guard <= 0.0) return src;
  vec2 tx = 1.0 / vec2(textureSize(u_source, 0));
  float kk = DG_K / (guard * guard);
  vec3 acc = src;
  float sw = 1.0;
${re}
  return acc / sw;
}`,D=`
fn dgTap(uv: vec2<f32>, src: vec3<f32>, ws: f32, kk: f32) -> vec4<f32> {
  let c = textureSampleLevel(u_source, samp, uv, 0.0).rgb;
  let d = c - src;
  let w = ws * exp(-dot(d, d) * kk);
  return vec4<f32>(c * w, w);
}
fn detailBase(suv: vec2<f32>, src: vec3<f32>) -> vec3<f32> {
  let guard = params.p[16].z;
  if (guard <= 0.0) { return src; }
  let tx = 1.0 / vec2<f32>(textureDimensions(u_source));
  let kk = DG_K / (guard * guard);
  var acc = vec4<f32>(src, 1.0);
${ie}
  return acc.xyz / acc.w;
}`,O=`
vec2 rotateUV(vec2 uv, int r) {
  if (r == 1) return vec2(uv.y, 1.0 - uv.x);
  if (r == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (r == 3) return vec2(1.0 - uv.y, uv.x);
  return uv;
}`,k=`
fn rotateUV(uv: vec2<f32>, r: u32) -> vec2<f32> {
  if (r == 1u) { return vec2(uv.y, 1.0 - uv.x); }
  if (r == 2u) { return vec2(1.0 - uv.x, 1.0 - uv.y); }
  if (r == 3u) { return vec2(1.0 - uv.y, uv.x); }
  return uv;
}`,A=e=>e.toFixed(6),j=`
const int TP_R = ${p.flowR};
const float TP_LAMBDA = ${A(p.lambda)};
const float TP_SAD_LO = ${A(p.sadLo)};
const float TP_SAD_HI = ${A(p.sadHi)};
const float TP_BETA = ${A(p.betaMax)};
const float TP_BDIFF = ${A(p.betaDiff)};
const float TP_KMIN = ${A(p.kMin)};
const float TP_KMAX = ${A(p.kMax)};
const float TP_DECAY = ${A(p.decay)};
const float TP_SUP_R = ${A(p.supportR)};
const float TP_SUP_LO = ${A(p.supportLo)};
const float TP_SUP_HI = ${A(p.supportHi)};
const float TP_DENOISE = ${A(p.denoise)};
const float TP_TAU = ${A(p.tau)};
const float TP_FLAT_LO = ${A(p.flatLo)};
const float TP_FLAT_HI = ${A(p.flatHi)};
const float TP_DARK_LO = ${A(p.darkLo)};
const float TP_DARK_HI = ${A(p.darkHi)};
`,M=j.replace(`const int TP_R = `,`const TP_R: i32 = `).replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),N=`
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}`,P=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[24]; };`,oe=`${P}
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 o_color;
${O}
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
}`,F=`
struct Params { p: array<vec4<f32>, 24> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
${N}
${k}
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
}`,se=`${P}
uniform sampler2D u_lum;
uniform sampler2D u_lumPrev;
out vec4 o_color;
${j}
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
}`,ce=`
@group(0) @binding(0) var u_lum: texture_2d<f32>;
@group(0) @binding(1) var u_lumPrev: texture_2d<f32>;
${N}
${M}
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
}`,le=`${P}
uniform sampler2D u_data0;
uniform sampler2D u_data1;
uniform sampler2D u_data2;
uniform sampler2D u_lum;
uniform sampler2D u_flow;
uniform sampler2D u_histf;
in vec2 v_uv;
layout(location = 0) out vec4 o_f0;
layout(location = 1) out vec4 o_f1;
${j}
${T}
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
}`,ue=`
struct Params { p: array<vec4<f32>, 24> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
@group(0) @binding(6) var u_lum: texture_2d<f32>;
@group(0) @binding(7) var u_flow: texture_2d<f32>;
@group(0) @binding(8) var u_histf: texture_2d<f32>;
struct FieldOut { @location(0) f0: vec4<f32>, @location(1) f1: vec4<f32> };
${N}
${M}
${E}
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
}`,de=`
${j}
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
}`,fe=`
${M}
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
}`;function pe(e){return e.replace(`var u_source: texture_2d<f32>;`,`var u_source: texture_external;`).replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g,`textureSampleBaseClampToEdge(u_source, samp, $1)`)}var I=`
vec2 rotateUV(vec2 uv, int r) {
  if (r == 1) return vec2(uv.y, 1.0 - uv.x);
  if (r == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (r == 3) return vec2(1.0 - uv.y, uv.x);
  return uv;
}`,L=`
fn rotateUV(uv: vec2<f32>, r: u32) -> vec2<f32> {
  if (r == 1u) { return vec2(uv.y, 1.0 - uv.x); }
  if (r == 2u) { return vec2(1.0 - uv.x, 1.0 - uv.y); }
  if (r == 3u) { return vec2(1.0 - uv.y, uv.x); }
  return uv;
}`,R=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[24]; };
uniform sampler2D u_source;
uniform sampler2D u_data0;
uniform sampler2D u_data1;
uniform sampler2D u_data2;
uniform sampler2D u_tpF0;
uniform sampler2D u_tpF1;
uniform sampler2D u_tpFlow;
uniform sampler2D u_tpPrev;
in vec2 v_uv;
out vec4 o_color;
${I}
${T}
${ae}
${de}
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
}`,z=`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform int u_rotation;
uniform vec2 u_srcSize;
uniform vec2 u_outSize;
uniform vec4 u_rect; // sub-rectangle of the upright frame (x, y, w, h in 0..1)
in vec2 v_uv;
out vec4 o_color;
${I}
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
}`,B=`
struct Params { p: array<vec4<f32>, 24> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
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
${L}
${E}
${D}
${fe}
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
}`,V=`
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
${L}
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
}`;function H(e){return e.replace(`var u_source: texture_2d<f32>;`,`var u_source: texture_external;`).replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g,`textureSampleBaseClampToEdge(u_source, samp, $1)`)}var me=H(B),he=H(V),U=`#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = vec2(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
}`,ge=class{kind=`webgl2`;canvas;outputWidth=0;outputHeight=0;lastDrawMs=0;lastCaptureMs=0;gl;grade;down;vao;source;data=[];uniformBuf;uniforms=new Float32Array(96);rotation=0;srcW=0;srcH=0;srcKind=``;viaCanvas=!1;scratch=null;analysisFbo=null;analysisTex=null;analysisW=0;analysisH=0;pbo=null;readbackInFlight=!1;previewScale=1;tpOn=!1;tpValid=!1;tpLum;tpFlow;tpField;tpLowW=0;tpLowH=0;tpOutW=0;tpOutH=0;tpIdx=0;tpTex=null;tpFbo=null;constructor(e){this.canvas=e;let t=e.getContext(`webgl2`,{alpha:!1,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0,powerPreference:`high-performance`});if(!t)throw Error(`WebGL2 not supported`);this.gl=t;let n=!!t.getExtension(`EXT_color_buffer_float`);this.grade=this.link(U,R,[`u_source`,`u_data0`,`u_data1`,`u_data2`,`u_tpF0`,`u_tpF1`,`u_tpFlow`,`u_tpPrev`]),this.down=this.link(U,z,[`u_source`,`u_rotation`,`u_srcSize`,`u_outSize`,`u_rect`]),this.vao=t.createVertexArray(),this.source=this.makeTexture(t.LINEAR);for(let e=0;e<3;e++){let e=this.makeTexture(t.NEAREST);t.bindTexture(t.TEXTURE_2D,e),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,1,1,0,t.RGBA,t.FLOAT,new Float32Array([0,0,0,0])),this.data.push(e)}this.uniformBuf=t.createBuffer(),t.bindBuffer(t.UNIFORM_BUFFER,this.uniformBuf),t.bufferData(t.UNIFORM_BUFFER,this.uniforms.byteLength,t.DYNAMIC_DRAW);let r=t.getUniformBlockIndex(this.grade.prog,`Params`);if(t.uniformBlockBinding(this.grade.prog,r,0),t.bindBufferBase(t.UNIFORM_BUFFER,0,this.uniformBuf),n)try{this.tpLum=this.link(U,oe,[`u_source`]),this.tpFlow=this.link(U,se,[`u_lum`,`u_lumPrev`]),this.tpField=this.link(U,le,[`u_data0`,`u_data1`,`u_data2`,`u_lum`,`u_flow`,`u_histf`]);for(let e of[this.tpLum,this.tpField])t.uniformBlockBinding(e.prog,t.getUniformBlockIndex(e.prog,`Params`),0);this.tpOn=!0}catch(e){console.warn(`temporal layer unavailable:`,e.message)}}resetTemporal(){this.tpValid=!1}tpTarget(e,t,n){let r=this.gl,i=this.makeTexture(r.LINEAR);return n===`half`?r.texImage2D(r.TEXTURE_2D,0,r.RGBA16F,e,t,0,r.RGBA,r.HALF_FLOAT,null):r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,t,0,r.RGBA,r.UNSIGNED_BYTE,null),i}tpFramebuffer(...e){let t=this.gl,n=t.createFramebuffer();return t.bindFramebuffer(t.FRAMEBUFFER,n),e.forEach((e,n)=>t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0+n,t.TEXTURE_2D,e,0)),t.bindFramebuffer(t.FRAMEBUFFER,null),n}tpRelease(){let e=this.gl;if(this.tpTex){let t=this.tpTex;for(let n of[...t.lum,...t.f0,t.f1,t.flow,...t.out])e.deleteTexture(n)}if(this.tpFbo){let t=this.tpFbo;for(let n of[...t.lum,...t.field,t.flow,...t.out])e.deleteFramebuffer(n)}this.tpTex=null,this.tpFbo=null}tpEnsure(){if(!this.tpOn||!this.outputWidth)return!1;let e=Math.max(1,Math.ceil(this.outputWidth/p.scale)),t=Math.max(1,Math.ceil(this.outputHeight/p.scale)),n=this.canvas.width,r=this.canvas.height;if(this.tpTex&&e===this.tpLowW&&t===this.tpLowH&&n===this.tpOutW&&r===this.tpOutH)return!0;this.tpRelease();let i=(e,t)=>this.tpTarget(e,t,`half`),a={lum:[i(e,t),i(e,t)],f0:[i(e,t),i(e,t)],f1:i(e,t),flow:i(e,t),out:[this.tpTarget(n,r,`rgba8`),this.tpTarget(n,r,`rgba8`)]};return this.tpTex=a,this.tpFbo={lum:a.lum.map(e=>this.tpFramebuffer(e)),field:a.f0.map(e=>this.tpFramebuffer(e,a.f1)),flow:this.tpFramebuffer(a.flow),out:a.out.map(e=>this.tpFramebuffer(e))},this.tpLowW=e,this.tpLowH=t,this.tpOutW=n,this.tpOutH=r,this.tpValid=!1,!0}bindTex(e,t,n,r){let i=this.gl;i.activeTexture(i.TEXTURE0+e),i.bindTexture(i.TEXTURE_2D,t),i.uniform1i(n.loc.get(r),e)}tpPasses(){let e=this.gl,t=this.tpTex,n=this.tpFbo,r=this.tpIdx,i=1-r;this.uniforms[92]=+!!this.tpValid,e.bindBuffer(e.UNIFORM_BUFFER,this.uniformBuf),e.bufferSubData(e.UNIFORM_BUFFER,368,this.uniforms.subarray(92,93)),e.bindBufferBase(e.UNIFORM_BUFFER,0,this.uniformBuf),e.bindVertexArray(this.vao),e.viewport(0,0,this.tpLowW,this.tpLowH),e.bindFramebuffer(e.FRAMEBUFFER,n.lum[r]),e.useProgram(this.tpLum.prog),this.bindTex(0,this.source,this.tpLum,`u_source`),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,n.flow),e.useProgram(this.tpFlow.prog),this.bindTex(4,t.lum[r],this.tpFlow,`u_lum`),this.bindTex(5,t.lum[i],this.tpFlow,`u_lumPrev`),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,n.field[r]),e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),e.useProgram(this.tpField.prog);for(let e=0;e<3;e++)this.bindTex(1+e,this.data[e],this.tpField,`u_data${e}`);this.bindTex(4,t.lum[r],this.tpField,`u_lum`),this.bindTex(5,t.flow,this.tpField,`u_flow`),this.bindTex(6,t.f0[i],this.tpField,`u_histf`),e.drawArrays(e.TRIANGLES,0,3),e.drawBuffers([e.COLOR_ATTACHMENT0])}makeTexture(e){let t=this.gl,n=t.createTexture();return t.bindTexture(t.TEXTURE_2D,n),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,e),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,e),n}link(e,t,n){let r=this.gl,i=(e,t)=>{let n=r.createShader(e);if(r.shaderSource(n,t),r.compileShader(n),!r.getShaderParameter(n,r.COMPILE_STATUS)){let e=r.getShaderInfoLog(n);throw r.deleteShader(n),Error(`Shader compile failed: `+e)}return n},a=i(r.VERTEX_SHADER,e),o=i(r.FRAGMENT_SHADER,t),s=r.createProgram();if(r.attachShader(s,a),r.attachShader(s,o),r.linkProgram(s),r.deleteShader(a),r.deleteShader(o),!r.getProgramParameter(s,r.LINK_STATUS))throw Error(`Link failed: `+r.getProgramInfoLog(s));let c=new Map;for(let e of n)c.set(e,r.getUniformLocation(s,e));return{prog:s,loc:c}}upload(e,n,i,a){let o=this.gl;this.rotation=a;let[s,c]=r(n,i,a);this.outputWidth=s,this.outputHeight=c,this.sizeCanvas(this.previewScale),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,this.source),o.pixelStorei(o.UNPACK_FLIP_Y_WEBGL,0),o.pixelStorei(o.UNPACK_COLORSPACE_CONVERSION_WEBGL,o.NONE);let l=t(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`,u=n!==this.srcW||i!==this.srcH||l!==this.srcKind,d=e;if(!u&&this.viaCanvas&&(d=this.throughCanvas(e,n,i)),u){for(;o.getError()!==o.NO_ERROR;);o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,n,i,0,o.RGBA,o.UNSIGNED_BYTE,d),o.texSubImage2D(o.TEXTURE_2D,0,0,0,n,i,o.RGBA,o.UNSIGNED_BYTE,d);let t=o.getError();this.viaCanvas=t!==o.NO_ERROR,this.viaCanvas&&(console.warn(`WebGL direct upload of ${l} at ${n}x${i} failed (0x${t.toString(16)}); resampling through a canvas`),d=this.throughCanvas(e,n,i),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,n,i,0,o.RGBA,o.UNSIGNED_BYTE,d)),this.srcW=n,this.srcH=i,this.srcKind=l}else o.texSubImage2D(o.TEXTURE_2D,0,0,0,n,i,o.RGBA,o.UNSIGNED_BYTE,d)}throughCanvas(e,t,n){return(!this.scratch||this.scratch.width!==t||this.scratch.height!==n)&&(this.scratch=new OffscreenCanvas(t,n)),this.scratch.getContext(`2d`).drawImage(e,0,0,t,n),this.scratch}setPreviewScale(e){this.previewScale=Math.min(1,Math.max(.05,e)),this.outputWidth&&this.sizeCanvas(this.previewScale)}sizeCanvas(e){let t=Math.max(1,Math.round(this.outputWidth*e)),n=Math.max(1,Math.round(this.outputHeight*e));(this.canvas.width!==t||this.canvas.height!==n)&&(this.canvas.width=t,this.canvas.height=n)}setUniforms(e){if(e.length!==96)throw Error(`uniform block must have 96 floats`);this.uniforms.set(e);let t=this.gl;t.bindBuffer(t.UNIFORM_BUFFER,this.uniformBuf),t.bufferSubData(t.UNIFORM_BUFFER,0,this.uniforms)}setData(e,t){let n=this.gl;if(t.data.length!==t.width*t.height*4)throw Error(`data texture size mismatch`);n.activeTexture(n.TEXTURE1+e),n.bindTexture(n.TEXTURE_2D,this.data[e]),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,0),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,t.width,t.height,0,n.RGBA,n.FLOAT,t.data)}bindCommon(e){let t=this.gl;t.useProgram(e.prog),t.bindVertexArray(this.vao),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.source),t.uniform1i(e.loc.get(`u_source`),0)}render(){let e=this.gl,t=this.uniforms[93]>.5&&this.tpEnsure();t||(this.tpValid=!1),t?this.tpPasses():this.uniforms[92]!==0&&(this.uniforms[92]=0,e.bindBuffer(e.UNIFORM_BUFFER,this.uniformBuf),e.bufferSubData(e.UNIFORM_BUFFER,368,this.uniforms.subarray(92,93)));let n=this.tpIdx;e.bindFramebuffer(e.FRAMEBUFFER,t?this.tpFbo.out[n]:null),e.viewport(0,0,this.canvas.width,this.canvas.height),this.bindCommon(this.grade);for(let t=0;t<3;t++)e.activeTexture(e.TEXTURE1+t),e.bindTexture(e.TEXTURE_2D,this.data[t]),e.uniform1i(this.grade.loc.get(`u_data${t}`),1+t);if(t){let e=this.tpTex;this.bindTex(4,e.f0[n],this.grade,`u_tpF0`),this.bindTex(5,e.f1,this.grade,`u_tpF1`),this.bindTex(6,e.flow,this.grade,`u_tpFlow`),this.bindTex(7,e.out[1-n],this.grade,`u_tpPrev`)}else for(let[e,t]of[[4,`u_tpF0`],[5,`u_tpF1`],[6,`u_tpFlow`],[7,`u_tpPrev`]])this.bindTex(e,this.data[0],this.grade,t);if(e.bindBufferBase(e.UNIFORM_BUFFER,0,this.uniformBuf),e.drawArrays(e.TRIANGLES,0,3),t){let t=this.canvas.width,r=this.canvas.height;e.bindFramebuffer(e.READ_FRAMEBUFFER,this.tpFbo.out[n]),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.blitFramebuffer(0,0,t,r,0,0,t,r,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,null),this.tpIdx=1-n,this.tpValid=!0}}async renderToFrame(e,t){this.sizeCanvas(1);let n=performance.now();this.render();let r=performance.now(),i=new VideoFrame(this.canvas,{timestamp:e,duration:t});return this.lastDrawMs=r-n,this.lastCaptureMs=performance.now()-r,i}ensureAnalysisTargets(e,t){let n=this.gl;this.analysisTex&&this.analysisW===e&&this.analysisH===t||(this.analysisTex&&n.deleteTexture(this.analysisTex),this.analysisFbo&&n.deleteFramebuffer(this.analysisFbo),this.pbo&&n.deleteBuffer(this.pbo),this.analysisTex=this.makeTexture(n.NEAREST),n.bindTexture(n.TEXTURE_2D,this.analysisTex),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,e,t,0,n.RGBA,n.UNSIGNED_BYTE,null),this.analysisFbo=n.createFramebuffer(),n.bindFramebuffer(n.FRAMEBUFFER,this.analysisFbo),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,this.analysisTex,0),n.bindFramebuffer(n.FRAMEBUFFER,null),this.pbo=n.createBuffer(),n.bindBuffer(n.PIXEL_PACK_BUFFER,this.pbo),n.bufferData(n.PIXEL_PACK_BUFFER,e*t*4,n.STREAM_READ),n.bindBuffer(n.PIXEL_PACK_BUFFER,null),this.analysisW=e,this.analysisH=t)}async analyze(e,t,r=n){let i=this.gl;if(this.readbackInFlight)throw Error(`analysis readback already in flight`);this.readbackInFlight=!0;try{this.ensureAnalysisTargets(e,t),i.bindFramebuffer(i.FRAMEBUFFER,this.analysisFbo),i.viewport(0,0,e,t),this.bindCommon(this.down),i.uniform1i(this.down.loc.get(`u_rotation`),this.rotation),i.uniform2f(this.down.loc.get(`u_srcSize`),this.srcW,this.srcH),i.uniform2f(this.down.loc.get(`u_outSize`),e,t),i.uniform4f(this.down.loc.get(`u_rect`),r.x,r.y,r.w,r.h),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,this.pbo),i.readPixels(0,0,e,t,i.RGBA,i.UNSIGNED_BYTE,0);let n=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0);i.flush(),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),await new Promise((e,t)=>{let r=0,a=()=>{let o=i.clientWaitSync(n,0,0);if(o===i.ALREADY_SIGNALED||o===i.CONDITION_SATISFIED)return e();if(o===i.WAIT_FAILED||++r>15e3)return t(Error(`GPU readback timed out`));setTimeout(a,2)};a()}),i.deleteSync(n);let a=new Uint8ClampedArray(e*t*4);return i.bindBuffer(i.PIXEL_PACK_BUFFER,this.pbo),i.getBufferSubData(i.PIXEL_PACK_BUFFER,0,a),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),a}finally{this.readbackInFlight=!1}}dispose(){let e=this.gl;e.deleteProgram(this.grade.prog),e.deleteProgram(this.down.prog),this.tpRelease(),e.deleteTexture(this.source);for(let t of this.data)e.deleteTexture(t);e.deleteBuffer(this.uniformBuf),this.analysisTex&&e.deleteTexture(this.analysisTex),this.analysisFbo&&e.deleteFramebuffer(this.analysisFbo),this.pbo&&e.deleteBuffer(this.pbo)}};function W(e){let t=new OffscreenCanvas(16,16).getContext(`2d`);if(!t)return!0;t.drawImage(e,0,0,16,16);let n=t.getImageData(0,0,16,16).data;for(let e=0;e<n.length;e+=4)if(n[e]>8||n[e+1]>8||n[e+2]>8)return!0;return!1}var _e=class e{kind=`webgpu`;canvas;outputWidth=0;outputHeight=0;lastDrawMs=0;lastCaptureMs=0;device;ctx;format;gradePipeline;downPipeline;gradePipelineExt;downPipelineExt;extSource=null;externalOk=void 0;sampler;uniformBuf;downParamsBuf;uniforms=new Float32Array(96);source=null;srcW=0;srcH=0;rotation=0;data=[];gradeBindGroup=null;bindGroupDirty=!0;scratch=null;directUpload={frame:void 0,video:void 0,image:void 0};analysisTex=null;analysisBuf=null;analysisW=0;analysisH=0;analysisBytesPerRow=0;readbackInFlight=!1;previewScale=1;exportTex=null;exportCanvas=null;exportCtx=null;tpLumPipe;tpLumPipeExt;tpFlowPipe;tpFieldPipe;tpValid=!1;tpIdx=0;tpLowW=0;tpLowH=0;tpOutW=0;tpOutH=0;tpTex=null;tpDummyHalf;tpDummyOut;constructor(e,t){this.canvas=e,this.device=t;let n=e.getContext(`webgpu`);if(!n)throw Error(`WebGPU canvas context unavailable`);this.ctx=n,this.format=navigator.gpu.getPreferredCanvasFormat(),n.configure({device:t,format:this.format,alphaMode:`opaque`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});let r=(e,t=`float`)=>({binding:e,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:t,viewDimension:`2d`}}),i=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:`filtering`}},r(2),r(3,`unfilterable-float`),r(4,`unfilterable-float`),r(5,`unfilterable-float`),r(6),r(7),r(8),r(9)]}),a=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:`filtering`}},r(2)]}),o={binding:2,visibility:GPUShaderStage.FRAGMENT,externalTexture:{}},s=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:`filtering`}},o,r(3,`unfilterable-float`),r(4,`unfilterable-float`),r(5,`unfilterable-float`),r(6),r(7),r(8),r(9)]}),c=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:`filtering`}},o]}),l=(e,n,r)=>t.createRenderPipeline({layout:t.createPipelineLayout({bindGroupLayouts:[r]}),vertex:{module:t.createShaderModule({code:e}),entryPoint:`vs`},fragment:{module:t.createShaderModule({code:e}),entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`}});this.gradePipeline=l(B,this.format,i),this.downPipeline=l(V,`rgba8unorm`,a),this.gradePipelineExt=l(me,this.format,s),this.downPipelineExt=l(he,`rgba8unorm`,c),this.tpLumPipe=l(F,`rgba16float`,a),this.tpLumPipeExt=l(pe(F),`rgba16float`,c);let u=t.createBindGroupLayout({entries:[r(0,`unfilterable-float`),r(1,`unfilterable-float`)]});this.tpFlowPipe=l(ce,`rgba16float`,u);let d=t.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},r(3,`unfilterable-float`),r(4,`unfilterable-float`),r(5,`unfilterable-float`),r(6,`unfilterable-float`),r(7,`unfilterable-float`),r(8,`unfilterable-float`)]}),f=t.createShaderModule({code:ue});this.tpFieldPipe=t.createRenderPipeline({layout:t.createPipelineLayout({bindGroupLayouts:[d]}),vertex:{module:f,entryPoint:`vs`},fragment:{module:f,entryPoint:`fs`,targets:[{format:`rgba16float`},{format:`rgba16float`}]},primitive:{topology:`triangle-list`}}),this.tpDummyHalf=t.createTexture({size:[1,1],format:`rgba16float`,usage:GPUTextureUsage.TEXTURE_BINDING}),this.tpDummyOut=t.createTexture({size:[1,1],format:this.format,usage:GPUTextureUsage.TEXTURE_BINDING}),this.sampler=t.createSampler({magFilter:`linear`,minFilter:`linear`,addressModeU:`clamp-to-edge`,addressModeV:`clamp-to-edge`}),this.uniformBuf=t.createBuffer({size:384,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.downParamsBuf=t.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});for(let e=0;e<3;e++)this.data.push(this.makeDataTexture(1,1,new Float32Array(4)))}static async create(t){if(!(`gpu`in navigator))throw Error(`WebGPU not supported`);let n=await navigator.gpu.requestAdapter({powerPreference:`high-performance`});if(!n)throw Error(`WebGPU adapter unavailable`);let r=await n.requestDevice();return r.addEventListener(`uncapturederror`,e=>{console.error(`WebGPU:`,e.error.message)}),new e(t,r)}makeDataTexture(e,t,n){let r=this.device.createTexture({size:[e,t],format:`rgba32float`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:r},n,{bytesPerRow:e*16,rowsPerImage:t},[e,t]),r}upload(e,n,i,a){this.rotation=a;let[o,s]=r(n,i,a);if(this.outputWidth=o,this.outputHeight=s,this.sizeCanvas(this.previewScale),(!this.source||this.srcW!==n||this.srcH!==i)&&(this.source?.destroy(),this.source=this.device.createTexture({size:[n,i],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),this.srcW=n,this.srcH=i,this.bindGroupDirty=!0),this.extSource=null,t(e)&&this.externalOk!==!1&&(this.srcW=n,this.srcH=i,this.externalOk===void 0&&this.probeExternal(e),this.externalOk)){this.extSource=e,this.bindGroupDirty=!0;return}let c=t(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`;if(this.directUpload[c]!==!1){let t=e,r=this.directUpload[c]===void 0;r&&this.device.pushErrorScope(`validation`);try{if(this.device.queue.copyExternalImageToTexture({source:t,flipY:!1},{texture:this.source,colorSpace:`srgb`,premultipliedAlpha:!1},[n,i]),!r)return}catch{this.directUpload[c]=!1}if(r){this.directUpload[c]=!0,this.device.popErrorScope().then(e=>{e&&(console.warn(`WebGPU direct upload of ${c} unsupported, using canvas copy:`,e.message),this.directUpload[c]=!1)});return}}(!this.scratch||this.scratch.width!==n||this.scratch.height!==i)&&(this.scratch=new OffscreenCanvas(n,i)),this.scratch.getContext(`2d`).drawImage(e,0,0,n,i),this.device.queue.copyExternalImageToTexture({source:this.scratch},{texture:this.source},[n,i])}setPreviewScale(e){this.previewScale=Math.min(1,Math.max(.05,e)),this.outputWidth&&this.sizeCanvas(this.previewScale)}sizeCanvas(e){let t=Math.max(1,Math.round(this.outputWidth*e)),n=Math.max(1,Math.round(this.outputHeight*e));(this.canvas.width!==t||this.canvas.height!==n)&&(this.canvas.width=t,this.canvas.height=n)}setUniforms(e){if(e.length!==96)throw Error(`uniform block must have 96 floats`);this.uniforms.set(e),this.device.queue.writeBuffer(this.uniformBuf,0,this.uniforms)}setData(e,t){if(t.data.length!==t.width*t.height*4)throw Error(`data texture size mismatch`);let n=this.data[e];n.width!==t.width||n.height!==t.height?(n.destroy(),this.data[e]=this.makeDataTexture(t.width,t.height,t.data),this.bindGroupDirty=!0):this.device.queue.writeTexture({texture:n},t.data,{bytesPerRow:t.width*16,rowsPerImage:t.height},[t.width,t.height])}gradeGroup(e){if(this.extSource)return this.device.createBindGroup({layout:this.gradePipelineExt.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:e},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},...this.tpGradeEntries()]});if(this.tpTex&&(this.bindGroupDirty=!0),this.gradeBindGroup&&!this.bindGroupDirty)return this.gradeBindGroup;if(!this.source)throw Error(`no source uploaded`);return this.gradeBindGroup=this.device.createBindGroup({layout:this.gradePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:this.source.createView()},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},...this.tpGradeEntries()]}),this.bindGroupDirty=!1,this.gradeBindGroup}resetTemporal(){this.tpValid=!1}tpGradeEntries(){let e=this.tpTex;if(!e)return[6,7,8].map(e=>({binding:e,resource:this.tpDummyHalf.createView()})).concat([{binding:9,resource:this.tpDummyOut.createView()}]);let t=this.tpIdx;return[{binding:6,resource:e.f0[t].createView()},{binding:7,resource:e.f1.createView()},{binding:8,resource:e.flow.createView()},{binding:9,resource:e.out[1-t].createView()}]}tpEnsure(e,t){let n=Math.max(1,Math.ceil(this.outputWidth/p.scale)),r=Math.max(1,Math.ceil(this.outputHeight/p.scale));if(this.tpTex&&n===this.tpLowW&&r===this.tpLowH&&e===this.tpOutW&&t===this.tpOutH)return;this.tpRelease();let i=GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,a=()=>this.device.createTexture({size:[n,r],format:`rgba16float`,usage:i}),o=()=>this.device.createTexture({size:[e,t],format:this.format,usage:i|GPUTextureUsage.COPY_SRC});this.tpTex={lum:[a(),a()],f0:[a(),a()],f1:a(),flow:a(),out:[o(),o()]},this.tpLowW=n,this.tpLowH=r,this.tpOutW=e,this.tpOutH=t,this.tpValid=!1,this.bindGroupDirty=!0}tpRelease(){let e=this.tpTex;if(e)for(let t of[...e.lum,...e.f0,e.f1,e.flow,...e.out])t.destroy();this.tpTex=null}draw(e){let t=this.device.createCommandEncoder(),n=this.outputWidth>0&&this.uniforms[93]>.5;n||(this.tpValid=!1,this.uniforms[92]!==0&&(this.uniforms[92]=0,this.device.queue.writeBuffer(this.uniformBuf,368,this.uniforms,92,1)));let r=this.extSource?this.device.importExternalTexture({source:this.extSource}):null;if(n){this.tpEnsure(e.width,e.height);let n=this.tpTex,i=this.tpIdx,a=1-i;this.uniforms[92]=+!!this.tpValid,this.device.queue.writeBuffer(this.uniformBuf,368,this.uniforms,92,1);let o=(e,n,r)=>{let i=t.beginRenderPass({colorAttachments:e.map(e=>({view:e,loadOp:`clear`,storeOp:`store`}))});i.setPipeline(n),i.setBindGroup(0,r),i.draw(3),i.end()},s=r?this.tpLumPipeExt:this.tpLumPipe;o([n.lum[i].createView()],s,this.device.createBindGroup({layout:s.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:r??this.source.createView()}]})),o([n.flow.createView()],this.tpFlowPipe,this.device.createBindGroup({layout:this.tpFlowPipe.getBindGroupLayout(0),entries:[{binding:0,resource:n.lum[i].createView()},{binding:1,resource:n.lum[a].createView()}]})),o([n.f0[i].createView(),n.f1.createView()],this.tpFieldPipe,this.device.createBindGroup({layout:this.tpFieldPipe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},{binding:6,resource:n.lum[i].createView()},{binding:7,resource:n.flow.createView()},{binding:8,resource:n.f0[a].createView()}]}))}let i=n?this.tpTex.out[this.tpIdx]:e,a=t.beginRenderPass({colorAttachments:[{view:i.createView(),loadOp:`clear`,storeOp:`store`}]});a.setPipeline(this.extSource?this.gradePipelineExt:this.gradePipeline),a.setBindGroup(0,this.gradeGroup(r)),a.draw(3),a.end(),n&&(t.copyTextureToTexture({texture:i},{texture:e},[e.width,e.height]),this.tpIdx=1-this.tpIdx,this.tpValid=!0),this.device.queue.submit([t.finish()])}downGroup(){let e=this.extSource?{binding:2,resource:this.device.importExternalTexture({source:this.extSource})}:{binding:2,resource:this.source.createView()};return this.device.createBindGroup({layout:(this.extSource?this.downPipelineExt:this.downPipeline).getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.downParamsBuf}},{binding:1,resource:this.sampler},e]})}async probeExternal(e){this.externalOk=!1;let t=this.device.createTexture({size:[32,18],format:`rgba8unorm`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),n=this.device.createBuffer({size:256*18,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{this.device.pushErrorScope(`validation`),this.device.queue.writeBuffer(this.downParamsBuf,0,new Float32Array([e.displayWidth,e.displayHeight,32,18,0,0,0,0,0,0,1,1]));let r=this.device.createBindGroup({layout:this.downPipelineExt.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.downParamsBuf}},{binding:1,resource:this.sampler},{binding:2,resource:this.device.importExternalTexture({source:e})}]}),i=this.device.createCommandEncoder(),a=i.beginRenderPass({colorAttachments:[{view:t.createView(),loadOp:`clear`,storeOp:`store`}]});a.setPipeline(this.downPipelineExt),a.setBindGroup(0,r),a.draw(3),a.end(),i.copyTextureToBuffer({texture:t},{buffer:n,bytesPerRow:256},[32,18]),this.device.queue.submit([i.finish()]);let o=await this.device.popErrorScope();if(o)throw Error(o.message);await n.mapAsync(GPUMapMode.READ);let s=new Uint8Array(n.getMappedRange()),c=!1;for(let e=0;e<18&&!c;e++)for(let t=0;t<128;t+=4)if(s[e*256+t]>8||s[e*256+t+1]>8||s[e*256+t+2]>8){c=!0;break}n.unmap(),this.externalOk=c,console.info(`WebGPU external video import: ${c?`ok`:`renders black, using copy path`}`)}catch(e){console.warn(`WebGPU external video import unavailable:`,e.message),this.externalOk=!1}finally{t.destroy(),n.destroy()}}render(){this.draw(this.ctx.getCurrentTexture())}capture=null;forceCapture=null;setCaptureMode(e){this.forceCapture=e===`auto`?null:e,this.capture=null}readbackRing=[];async renderToFrame(e,t){let n=this.outputWidth,r=this.outputHeight;if(!this.exportCanvas||this.exportCanvas.width!==n||this.exportCanvas.height!==r){this.exportCanvas=new OffscreenCanvas(n,r),this.exportCtx=this.exportCanvas.getContext(`webgpu`),this.exportCtx.configure({device:this.device,format:this.format,alphaMode:`opaque`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST}),this.exportTex?.destroy(),this.exportTex=this.device.createTexture({size:[n,r],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});for(let e of this.readbackRing)e.buffer.destroy();this.readbackRing=[]}if(this.capture===null){let n=this.forceCapture??new URLSearchParams(location.search).get(`capture`);n===`canvas`||n===`bitmap`||n===`readback`?(this.capture=n,this.captureBench=`forced ${n}`):await this.benchmarkCapture(e,t)}return this.captureAs(this.capture??`readback`,e,t)}captureBench=``;async benchmarkCapture(e,t){let n=this.extSource;n&&(this.extSource=null,this.externalOk=!1,this.upload(n,this.srcW,this.srcH,this.rotation),this.externalOk=!0);let r=[],i=null;for(let n of[`canvas`,`bitmap`,`readback`])try{let a=!1,o=performance.now();if(n===`readback`){let r=[];for(let i=0;i<4;i++)if(r.push(this.captureAs(n,e,t)),r.length>=3){let e=await r.shift();a||=W(e),e.close()}for(let e of r){let t=await e;a||=W(t),t.close()}}else for(let r=0;r<4;r++){let r=await this.captureAs(n,e,t);a||=W(r),r.close()}let s=(performance.now()-o)/4;r.push(`${n} ${s.toFixed(1)} ms${a?``:` (black)`}`),a&&(!i||s<i.ms)&&(i={mode:n,ms:s})}catch(e){r.push(`${n} failed (${e.message.split(`
`)[0].slice(0,50)})`)}this.capture=i?.mode??`readback`,this.captureBench=r.join(`, `),console.info(`WebGPU capture bench: ${r.join(`, `)} → ${this.capture}`),n&&(this.extSource=n)}async captureAs(e,t,n){let r=this.outputWidth,i=this.outputHeight,a=performance.now();if(e===`canvas`||e===`bitmap`){this.draw(this.exportCtx.getCurrentTexture());let r=performance.now();try{if(e===`canvas`)return new VideoFrame(this.exportCanvas,{timestamp:t,duration:n});let r=this.exportCanvas.transferToImageBitmap();try{return new VideoFrame(r,{timestamp:t,duration:n})}finally{r.close()}}finally{this.lastDrawMs=r-a,this.lastCaptureMs=performance.now()-r}}let o=Math.ceil(r*4/256)*256;this.readbackRing.length===0&&(this.readbackRing=Array.from({length:3},()=>({buffer:this.device.createBuffer({size:o*i,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),busy:!1})));let s=this.readbackRing.find(e=>!e.busy);if(!s)for(await new Promise(e=>setTimeout(e,1));!(s=this.readbackRing.find(e=>!e.busy));)await new Promise(e=>setTimeout(e,1));s.busy=!0;try{this.draw(this.exportTex);let e=this.device.createCommandEncoder();e.copyTextureToBuffer({texture:this.exportTex},{buffer:s.buffer,bytesPerRow:o},[r,i]),this.device.queue.submit([e.finish()]);let c=performance.now();this.lastDrawMs=c-a,await s.buffer.mapAsync(GPUMapMode.READ),this.lastCaptureMs=performance.now()-c;try{let e=new Uint8Array(s.buffer.getMappedRange()),a;if(o===r*4)a=new Uint8Array(e);else{a=new Uint8Array(r*4*i);for(let t=0;t<i;t++)a.set(e.subarray(t*o,t*o+r*4),t*r*4)}return new VideoFrame(a,{format:this.format===`bgra8unorm`?`BGRX`:`RGBX`,codedWidth:r,codedHeight:i,timestamp:t,duration:n})}finally{s.buffer.unmap()}}finally{s.busy=!1}}async analyze(e,t,r=n){if(this.readbackInFlight)throw Error(`analysis readback already in flight`);if(!this.source&&!this.extSource)throw Error(`no source uploaded`);this.readbackInFlight=!0;try{(!this.analysisTex||this.analysisW!==e||this.analysisH!==t)&&(this.analysisTex?.destroy(),this.analysisBuf?.destroy(),this.analysisTex=this.device.createTexture({size:[e,t],format:`rgba8unorm`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.analysisBytesPerRow=Math.ceil(e*4/256)*256,this.analysisBuf=this.device.createBuffer({size:this.analysisBytesPerRow*t,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),this.analysisW=e,this.analysisH=t),this.device.queue.writeBuffer(this.downParamsBuf,0,new Float32Array([this.srcW,this.srcH,e,t,this.rotation,0,0,0,r.x,r.y,r.w,r.h]));let n=this.downGroup(),i=this.device.createCommandEncoder(),a=i.beginRenderPass({colorAttachments:[{view:this.analysisTex.createView(),loadOp:`clear`,storeOp:`store`}]});a.setPipeline(this.extSource?this.downPipelineExt:this.downPipeline),a.setBindGroup(0,n),a.draw(3),a.end(),i.copyTextureToBuffer({texture:this.analysisTex},{buffer:this.analysisBuf,bytesPerRow:this.analysisBytesPerRow},[e,t]),this.device.queue.submit([i.finish()]),await this.analysisBuf.mapAsync(GPUMapMode.READ);try{let n=new Uint8Array(this.analysisBuf.getMappedRange()),r=new Uint8ClampedArray(e*t*4),i=e*4;for(let e=0;e<t;e++)r.set(n.subarray(e*this.analysisBytesPerRow,e*this.analysisBytesPerRow+i),e*i);return r}finally{this.analysisBuf.unmap()}}finally{this.readbackInFlight=!1}}dispose(){this.source?.destroy();for(let e of this.data)e.destroy();this.uniformBuf.destroy(),this.downParamsBuf.destroy(),this.analysisTex?.destroy(),this.analysisBuf?.destroy(),this.exportTex?.destroy();for(let e of this.readbackRing)e.buffer.destroy();this.tpRelease(),this.device.destroy()}};10*Math.PI/180,26*Math.PI/180,60*Math.PI/180,110*Math.PI/180,30*Math.PI/180,60*Math.PI/180;var G=4096,ve=new Float32Array(G+1);for(let e=0;e<=G;e++)ve[e]=a(e/G);75*Math.PI/180;var ye=.3,be=.15,xe=.3;function Se(e,t,n,r=ye,i=be){let a=new Float32Array(t*n);for(let o of e){let e=o.x-o.w*r,s=o.x+o.w*(1+r),c=o.y-o.h*r,l=o.y+o.h*(1+r),u=Math.max(.001,o.w*i),d=Math.max(.001,o.h*i);for(let r=0;r<n;r++){let i=(r+.5)/n,o=Math.max(c-i,i-l,0),f=Math.max(0,1-o/d);if(!(f<=0))for(let n=0;n<t;n++){let i=(n+.5)/t,o=Math.max(e-i,i-s,0),c=f*Math.max(0,1-o/u),l=r*t+n;c>a[l]&&(a[l]=c)}}}return a}function Ce(e,t,n){let r=n.get(t);return r===void 0?e.window?e.window[1]:e.from:r}function we(e,t,n){let r=e[0];return e.forEach((e,i)=>{n>=Ce(e,i,t)&&(r=e)}),r}function Te(e,t,n){return e.some((e,r)=>e.window!==void 0&&!t.has(r)&&n>=e.window[0]&&n<e.window[1])}function Ee(e,t,n){e.forEach((e,r)=>{e.window&&!t.has(r)&&n>=e.window[0]&&n<=e.window[1]&&t.set(r,n)})}var K={on:.5,shift:3,iouLo:.45,iouHi:.7,covLo:.55,covHi:.8,minArea:.003,tauDown:.5,tauUp:1};function De(e,t,n){let r=t>>1,i=n>>1,a=new Uint8Array(r*i),o=0;for(let n=0;n<i;n++)for(let i=0;i<r;i++){let s=(2*n*t+2*i)*4+1;(e[s]+e[s+4]+e[s+t*4]+e[s+t*4+4])*.25>=K.on&&(a[n*r+i]=1,o++)}return{m:a,w:r,h:i,area:o/(r*i)}}function Oe(e,t,n,r){let i=K.shift,a=0;for(let o=-i;o<=i;o++)for(let s=-i;s<=i;s++){let i=0,c=0;for(let a=0;a<r;a++){let l=a+o;for(let o=0;o<n;o++){let u=o+s,d=e[a*n+o],f=l>=0&&l<r&&u>=0&&u<n?t[l*n+u]:0;i+=d&f,c+=d|f}}c>0&&i/c>a&&(a=i/c)}return a}function q(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function ke(e,t){if(!e)return 0;if(t.area<K.minArea&&e.area<K.minArea)return 1;let n=Math.min(t.area,e.area)/Math.max(t.area,e.area,1e-6),r=Oe(e.m,t.m,t.w,t.h);return q(K.iouLo,K.iouHi,r)*q(K.covLo,K.covHi,n)}var Ae=70,je=.6,Me=.4,Ne=.7,Pe=.05,Fe=.16,Ie=2,Le=16,Re=.95,J=.2,Y=.3,ze=Math.cos(15*Math.PI/180),Be=.02,Ve=3,He=8,X=[n,{x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}];function Z(e){return{...e,clahe:{width:e.clahe.bins,height:e.clahe.tilesX*e.clahe.tilesY,data:e.clahe.data}}}var Ue=class e{backend;settings={...s};split=0;worker=null;inflight=!1;reqId=0;analysisIntervalMs=70;personEvery=Ie;personEnabled=!0;temporalEnabled=!0;lastRenderSec=-1;popGate=0;popTarget=0;popMask=null;personWorker=null;personInflight=!1;personReqId=0;personFailed=!1;personCount=0;person=null;personTarget=null;personFull=null;personTiles=null;personRectIdx=0;personRectInflight=n;personBoxes=null;personBoxesAt=-1/0;personPasses=0;personDetectInflight=!1;personDetectWarned=!1;personWaiters=[];lastAnalysisAt=-1/0;current=b;target=null;fields=null;guide=null;clahe=null;fieldsTarget=null;guideTarget=null;claheTarget=null;lastMean=null;lastTickSec=0;hasAnalysis=!1;dirtyData=!1;stats;locked=null;cutSeen=new Map;resolveWaiters=[];rejectWaiters=[];onError;constructor(e,t){this.backend=e,this.onError=t,this.stats={backend:e.kind,analysisMs:0,analyses:0,sceneCuts:0,person:`off`,personMs:0,personCoverage:0,personBoxes:-1,personDetectMs:0},this.fields={width:2,height:2,data:new Float32Array(16)},this.guide={width:2,height:2,data:new Float32Array(16)};let n=new Float32Array(1536*4);for(let e=0;e<48;e++)for(let t=0;t<32;t++)n[(e*32+t)*4]=(t+1)/32;this.clahe={width:32,height:48,data:n},this.pushData()}static async create(t,n,r=!0){let i=null;if(r)try{i=await _e.create(t)}catch(e){console.warn(`WebGPU unavailable, using WebGL2:`,e.message)}return i||=new ge(t),new e(i,n)}getStats(){return{...this.stats}}lockGlobals(e){this.locked=e&&e.length>0?[...e].sort((e,t)=>e.from-t.from):null,this.cutSeen.clear(),this.locked&&(this.current=this.applyLock(this.current),this.target&&=this.applyLock(this.target))}get isLocked(){return this.locked!==null}get lockSegments(){return this.locked?.length??0}lockedParamsAt(e){return this.lockedAt(e)}lockedAt(e){return this.locked?we(this.locked,this.cutSeen,e).params:null}inCutWindow(e){return this.locked?Te(this.locked,this.cutSeen,e):!1}noteSceneCut(e){this.locked&&Ee(this.locked,this.cutSeen,e)}lockRange=!1;applyLock(e){let t=this.lockedAt(this.lastTickSec);if(!t)return e;let n=e.backdropFit??t.backdropFit;return this.lockRange?{...t,backdropFit:n}:{...t,zLo:e.zLo,zHi:e.zHi,backdropFit:n}}async analyzeRaw(e=1e4){let t=new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)});this.inflight&&await t.catch(()=>void 0);let n=new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)});await this.startAnalysis();let r=await new Promise((t,r)=>{let i=setTimeout(()=>r(Error(`Frame analysis timed out`)),e);n.then(e=>{clearTimeout(i),t(e)},e=>{clearTimeout(i),r(e)})});return{params:r.params,mean:r.mean}}getPersonMap(){return!this.person||!this.fields?null:{width:this.fields.width,height:this.fields.height,data:this.person}}ensureWorker(){if(this.worker)return this.worker;let e=new Worker(new URL(`/video/studio/assets/analysis-worker-CHC5uoST.js`,``+import.meta.url),{type:`module`});return e.onmessage=e=>this.onPacket(e.data),e.onerror=e=>{this.inflight=!1;let t=Error(`Analysis worker failed: `+e.message);this.settle(null,t),this.onError(t)},this.worker=e,e}ensurePersonWorker(){if(this.personWorker)return this.personWorker;let e=new Worker(new URL(`/video/studio/assets/person-worker-PK8s94hj.js`,``+import.meta.url),{type:`module`});return e.onmessage=e=>this.onPersonPacket(e.data),e.onerror=e=>{this.personInflight=!1,this.personFailed=!0,this.stats.person=`failed`,console.warn(`Person segmentation worker failed:`,e.message),this.settlePerson()},this.personWorker=e,this.stats.person=`loading`,e}settlePerson(){let e=this.personWaiters;this.personWaiters=[];for(let t of e)t()}waitPerson(){return this.personInflight?new Promise(e=>this.personWaiters.push(e)):Promise.resolve()}onPersonPacket(e){if(this.personInflight=!1,this.settlePerson(),e.id!==this.personReqId)return;if(this.personDetectInflight){this.personDetectInflight=!1,e.boxes===void 0?(e.error&&!this.personDetectWarned&&console.warn(`Person detector unavailable:`,e.error),this.personDetectWarned=!0,this.personBoxes=[{x:0,y:0,w:1,h:1,score:1}]):this.personBoxes=e.boxes.filter(e=>e.score>=xe),this.personBoxesAt=this.lastTickSec,this.stats.personBoxes=this.personBoxes.length,this.stats.personDetectMs=e.ms,console.info(`[person] verdict ${this.personBoxes.length} box(es) in ${e.ms.toFixed(0)} ms at t=${this.lastTickSec.toFixed(2)}s`),this.rebuildPerson();return}if(!e.mask){e.error&&!this.personFailed&&console.warn(`Person segmentation unavailable:`,e.error),this.personFailed=!0,this.stats.person=`failed`;return}this.stats.person=`on`,this.stats.personMs=e.ms;let t=this.fields?.width??0,r=this.fields?.height??0;if(t<4||r<4)return;let i=this.personRectInflight;if((!this.personFull||this.personFull.length!==t*r)&&(this.personFull=new Float32Array(t*r),this.personTiles=new Float32Array(t*r)),i===n)this.personFull=Q(e.mask,e.width,e.height,t,r);else{let n=Math.round(i.x*t),a=Math.round(i.y*r),o=Math.round(i.w*t),s=Math.round(i.h*r),c=Q(e.mask,e.width,e.height,o,s);for(let e=0;e<s;e++)for(let r=0;r<o;r++)this.personTiles[(a+e)*t+n+r]=c[e*o+r]}this.rebuildPerson()}rebuildPerson(){let e=this.fields?.width??0,t=this.fields?.height??0;if(e<4||t<4||!this.personFull||!this.personTiles||this.personFull.length!==e*t)return;let n=this.lastTickSec-this.personBoxesAt<=He,r=this.personBoxes&&n?Se(this.personBoxes,e,t):null,i=new Float32Array(e*t);if(r)for(let e=0;e<i.length;e++)i[e]=Math.max(this.personFull[e],this.personTiles[e])*r[e];let a=We(i,e,t,this.guide?.data??null,this.fields?.data??null,this.current.veilColor),o=0;for(let e=0;e<a.length;e++)o+=a[e];this.stats.personCoverage=o/a.length;let s=0;if(this.person&&this.person.length===a.length)for(let e=0;e<a.length;e++)s+=this.person[e];!this.person||this.person.length!==a.length||s<1e-6&&o>0?(o>0&&console.info(`[person] mask snapped in at t=${this.lastTickSec.toFixed(2)}s (${(o/a.length*100).toFixed(0)}% coverage)`),this.person=a,this.personTarget=null,this.dirtyData=!0):this.personTarget=a}setPreviewScale(e){this.backend.setPreviewScale(e)}upload(e,t,n,r){this.backend.upload(e,t,n,r)}tick(e,t=!1){let n=Math.max(0,Math.min(.5,e-this.lastTickSec)),r=this.lockedAt(this.lastTickSec);this.lastTickSec=e;let i=this.lockedAt(e);r!==i&&i&&(this.current={...i,zLo:this.current.zLo,zHi:this.current.zHi},this.target&&={...i,zLo:this.target.zLo,zHi:this.target.zHi}),this.smooth(n);let a=performance.now();return!this.inflight&&(t||a-this.lastAnalysisAt>=this.analysisIntervalMs)?(this.startAnalysis(),!0):!1}analyzeSoon(){this.inflight||this.startAnalysis()}async analyzeNow(e,t=1e4){let n=()=>new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)}),r=e=>new Promise((n,r)=>{let i=setTimeout(()=>r(Error(`Frame analysis timed out`)),t);e.then(e=>{clearTimeout(i),n(e)},e=>{clearTimeout(i),r(e)})});this.inflight&&await r(n()).catch(()=>void 0);let i=n();await this.startAnalysis();let a=await r(i);e&&(await r(this.waitPerson()).catch(()=>void 0),this.personTarget&&=(this.person=this.personTarget,null)),e&&a.id===this.reqId&&this.snapTo(Z(a))}settle(e,t){let n=this.resolveWaiters,r=this.rejectWaiters;if(this.resolveWaiters=[],this.rejectWaiters=[],e)for(let t of n)t(e);else if(t)for(let e of r)e(t)}async startAnalysis(){if(!this.inflight){this.inflight=!0,this.lastAnalysisAt=performance.now();try{let e=await this.backend.analyze(256,144),t=this.personEnabled&&!this.personFailed&&!this.personInflight&&this.personCount++%this.personEvery===0,r=t&&this.personPasses++%Ve===0,i=r?n:X[this.personRectIdx%X.length],a=t?i===n?e.slice():await this.backend.analyze(256,144,i):null,o={id:++this.reqId,rgba:e.buffer,width:256,height:144};if(this.ensureWorker().postMessage(o,[o.rgba]),a){r||this.personRectIdx++;let e={id:++this.personReqId,rgba:a.buffer,width:256,height:144,timestampMs:Math.round(this.lastTickSec*1e3),detect:r};this.personInflight=!0,this.personDetectInflight=r,this.personRectInflight=i,this.ensurePersonWorker().postMessage(e,[e.rgba])}}catch(e){this.inflight=!1;let t=e instanceof Error?e:Error(String(e));this.settle(null,t),/timed out/i.test(t.message)?console.warn(`Analysis skipped:`,t.message):this.onError(t)}}}onPacket(e){if(this.inflight=!1,e.id!==this.reqId)return;let t=Z(e);this.stats.analyses++,this.stats.analysisMs=t.ms;let n=this.lastMean!==null&&Ke(this.lastMean,t.mean)>.16;if(this.lastMean=t.mean,this.settings.subjectPop&&(t.params.backdrop??0)>0){let e=t.fields,r=De(e.data,e.width,e.height);this.popTarget=n?0:ke(this.popMask,r),this.popMask=r}else this.popTarget=0,this.popMask=null;n&&(this.popGate=0),!this.hasAnalysis||n?(n&&(this.stats.sceneCuts++,this.noteSceneCut(this.lastTickSec),this.backend.resetTemporal?.(),this.personBoxes=null,this.personPasses=0,this.personFull?.fill(0),this.personTiles?.fill(0),this.stats.personBoxes=-1),this.snapTo(t)):(this.target=this.applyLock(t.params),this.fieldsTarget=t.fields,this.guideTarget=t.guide,this.claheTarget=t.clahe),this.settle(e,null)}snapTo(e){this.current=this.applyLock(e.params),this.target=this.current,this.fields=e.fields,this.guide=e.guide,this.clahe=e.clahe,this.fieldsTarget=null,this.guideTarget=null,this.claheTarget=null,this.hasAnalysis=!0,this.dirtyData=!0}smooth(e){if(e<=0)return;{let t=this.popTarget<this.popGate?K.tauDown:K.tauUp;this.popGate+=(this.popTarget-this.popGate)*(1-Math.exp(-e/t))}if(this.target){let t=1-Math.exp(-e/je);this.current=o(this.current,this.target,t)}let t=1-Math.exp(-e/Me),n=1-Math.exp(-e/Ne),r=(e,n,r=t,i=r)=>{if(!n)return e;if(!e||e.width!==n.width||e.height!==n.height||e.data.length!==n.data.length)return n;let a=e===this.lastEased.get(n)?e:{...e,data:new Float32Array(e.data)};return i===r?$(a.data,n.data,r):Ge(a.data,n.data,r,i),this.lastEased.set(n,a),a},i=Math.min(1,Math.max(0,this.current.backdrop??0)),a=t+(1-Math.exp(-e/Pe)-t)*i,s=r(this.fields,this.fieldsTarget,t,a),c=r(this.guide,this.guideTarget,this.settings.subjectPop?a:t),l=r(this.clahe,this.claheTarget,n);(s!==this.fields||c!==this.guide||l!==this.clahe)&&(this.dirtyData=!0),this.person&&this.personTarget&&this.personTarget.length===this.person.length&&($(this.person,this.personTarget,t),this.dirtyData=!0),this.fields=s,this.guide=c,this.clahe=l}lastEased=new WeakMap;guideMerged=null;pushData(){if(!this.fields||!this.guide||!this.clahe)return;this.backend.setData(0,this.fields),this.backend.setData(1,this.clahe);let e=this.guide;if(this.person&&this.person.length*4===e.data.length){let t=this.guideMerged&&this.guideMerged.length===e.data.length?this.guideMerged:new Float32Array(e.data.length);t.set(e.data);let n=1-c(this.current);for(let e=0;e<this.person.length;e++)t[e*4+3]=this.person[e]*n;this.guideMerged=t,this.backend.setData(2,{width:e.width,height:e.height,data:t})}else this.backend.setData(2,e);this.dirtyData=!1}reset(e={}){let t=e.keepPerson?this.personBoxes:null;this.reqId++,this.inflight=!1,this.hasAnalysis=!1,this.target=null,this.fieldsTarget=null,this.guideTarget=null,this.claheTarget=null,this.current=b,this.lastMean=null,this.lastAnalysisAt=-1/0,this.lastTickSec=0,this.cutSeen.clear(),this.settle({id:-1},null),this.personReqId++,this.personInflight=!1,this.person=null,this.personTarget=null,this.personFull=null,this.personTiles=null,this.personRectIdx=0,this.personCount=0,this.personBoxes=t,this.personBoxesAt=t?0:-1/0,this.personPasses=+!!t,this.personDetectInflight=!1,this.stats.personCoverage=0,this.stats.personBoxes=t?t.length:-1,this.settlePerson(),this.lastRenderSec=-1,this.backend.resetTemporal?.(),e.keepPerson||(this.popGate=0,this.popTarget=0,this.popMask=null)}pack(){let e={width:this.fields.width,height:this.fields.height,fields:new Float32Array,guide:new Float32Array},t={tilesX:8,tilesY:6,bins:32,data:new Float32Array},n=this.hasAnalysis?this.settings:{...this.settings,intensity:0},r=te(this.current,n,e,t,0,this.split);r[93]=+!!this.temporalEnabled,r[90]*=this.popGate;let i=this.lastTickSec;return this.lastRenderSec>=0&&(i<this.lastRenderSec-.001||i-this.lastRenderSec>.3)&&this.backend.resetTemporal?.(),this.lastRenderSec=i,r}render(e=0){this.dirtyData&&this.pushData();let t=this.pack();t[0]=e,this.backend.setUniforms(t),this.backend.render()}async renderToFrame(e,t,n){this.dirtyData&&this.pushData();let r=this.pack();return r[0]=e,r[1]=0,this.backend.setUniforms(r),this.backend.renderToFrame(t,n)}dispose(){this.worker?.terminate(),this.worker=null,this.personWorker?.terminate(),this.personWorker=null,this.backend.dispose()}};function Q(e,t,n,r,i){let a=new Float32Array(r*i);for(let o=0;o<i;o++){let s=Math.floor(o*n/i),c=Math.max(s+1,Math.floor((o+1)*n/i));for(let n=0;n<r;n++){let i=Math.floor(n*t/r),l=Math.max(i+1,Math.floor((n+1)*t/r)),u=0,d=0;for(let n=s;n<c;n++)for(let r=i;r<l;r++)u+=e[n*t+r],d++;a[o*r+n]=Math.min(1,Math.max(0,u/d))}}return a}function We(e,t,n,r,i,a){let o=new Float32Array(e),[,s,c]=S(a[0],a[1],a[2]),l=Math.hypot(s,c)||1,u=new Uint8Array(t*n);for(let e=0;e<t*n;e++){let t=r&&r.length>=e*4+3?.2126*r[e*4]+.7152*r[e*4+1]+.0722*r[e*4+2]:1,n=i&&i.length>=e*4+2?i[e*4+1]:1,a=!1;if(r&&r.length>=e*4+3){let[,t,n]=S(r[e*4],r[e*4+1],r[e*4+2]),i=Math.hypot(t,n);a=i>Be&&(t*s+n*c)/(i*l)>ze}u[e]=+(t>J&&n>Y&&!a);let d=o[e],f=Math.min(1,Math.max(0,(d-.45)/.3));o[e]=a&&t>J?0:f*f*(3-2*f)}let d=o;for(let e=0;e<Le;e++){let e=new Float32Array(d);for(let r=0;r<n;r++)for(let i=0;i<t;i++){let a=r*t+i;if(!u[a])continue;let o=0;for(let e=-1;e<=1;e++){let a=r+e;if(!(a<0||a>=n))for(let e=-1;e<=1;e++){let n=i+e;n<0||n>=t||(o=Math.max(o,d[a*t+n]))}}e[a]=Math.max(d[a],Re*o)}d=e}return d}function $(e,t,n){for(let r=0;r<e.length;r++)e[r]+=(t[r]-e[r])*n}function Ge(e,t,n,r){for(let i=0;i<e.length;i++)e[i]+=(t[i]-e[i])*((i&3)==1?r:n)}function Ke(e,t){return Math.abs(e[0]-t[0])+Math.abs(e[1]-t[1])+Math.abs(e[2]-t[2])}function qe(e){if(!Number.isFinite(e)||e<.5)return[];let t=Math.min(12,Math.max(4,Math.round(e)));return Array.from({length:t},(n,r)=>Math.min(e-.05,.15+(e-.3)*(r+.5)/t))}function Je(e,t){if(e.length<3)return null;let n=[{from:0,items:[e[0]]}];for(let r=1;r<e.length;r++){let i=e[r-1].mean,a=e[r].mean,o=Math.abs(i[0]-a[0])+Math.abs(i[1]-a[1])+Math.abs(i[2]-a[2]),s=e[r-1].params.wb,c=e[r].params.wb,l=Math.max(Math.abs(Math.log(s[0]/c[0])),Math.abs(Math.log(s[2]/c[2])));(o>2*t||o>t&&l>.2)&&n.push({from:(e[r-1].t+e[r].t)/2,window:[e[r-1].t,e[r].t],items:[]}),n[n.length-1].items.push(e[r])}for(let e=n.length-1;e>0;e--)n[e].items.length<2&&(n[e-1].items.push(...n[e].items),n.splice(e,1));return n.map(e=>({from:e.from,window:e.window,params:x(e.items.map(e=>e.params))}))}export{Ae as ANALYSIS_INTERVAL_MS,Ue as GradeEngine,Fe as SCENE_CUT_MEAN_DIFF,x as medianParams,qe as profileTimes,Je as segmentProfile};