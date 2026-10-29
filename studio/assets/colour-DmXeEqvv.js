import{A as e,B as t,C as n,D as r,E as i,F as a,G as o,H as s,I as c,J as l,K as u,L as d,M as f,N as p,O as m,P as h,R as g,S as _,T as v,U as y,V as b,W as x,_ as ee,b as S,g as te,h as C,j as ne,k as w,v as T,w as E,x as re,y as ie,z as ae}from"./index-B-Z10-Fg.js";var D={devLo:.035,devHi:.085,vetoLo:.015,vetoHi:.1,vetoDark:.9,subjLo:.02,subjHi:.05,coreIn:.85,coreLo:.012,coreHi:.03,holdLo:.004,holdHi:.01,abWeight:1.5,darkWeight:.4,inlierLo:.6,inlierHi:.8,rmsLo:.02,rmsHi:.04,inlierK:2.5,edgeLo:.006,edgeHi:.014,edgeRadius:10,ringR:2,seedR:2,closeR:4,schoolN:3,farShareLo:.15,farShareHi:.3,solidDev:.8,relKeep:.3,solidLo:.2,solidHi:.26,bottomLo:.04,bottomHi:.08,farMargin:2,seedFrac:.5,growDev:.06,minArea:.008,lightDL:.03,lightShareLo:.12,lightShareHi:.25,growEdgeLo:.08,growEdgeHi:.16,bubbleTexLo:.015,bubbleTexHi:.019,bubbleCrLo:.84,bubbleCrHi:.88,bubbleDLLo:.025,bubbleDLHi:.04,bubbleTallLo:.9,bubbleTallHi:1.1,blueLo:1.3,blueHi:1.7,step:4,iterations:3};D.abWeight*D.abWeight;var O={waterFloor:.25,confLo:.5,confHi:.9,insideLo:.7,insideHi:.98,departLo:.02,departHi:.25,alphaLo:.3,alphaHi:.8},oe=`
const float CONF_BRIGHT_LO = ${C.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${C.hi.toFixed(4)};
const float PERSON_LUM_LO = ${v.lo.toFixed(4)};
const float PERSON_LUM_HI = ${v.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${ee.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${ee.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${S.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${S.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${S.farKeep.toFixed(4)};
const float VIVID_C_LO = ${w.cLo.toFixed(4)};
const float VIVID_C_HI = ${w.cHi.toFixed(4)};
const float VIVID_KEEP = ${w.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${t.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${ae.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${g.toFixed(4)};
const float LOOK_GAMMA = ${n.gamma.toFixed(4)};
const float LOOK_WATER_DIM = ${n.waterDim.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${n.hazeChroma.toFixed(4)};
const float LOOK_OBJ_CHROMA = ${n.objChroma.toFixed(4)};
const float LOOK_WARM_HAZE = ${n.warmHaze.toFixed(4)};
const float LOOK_DARK_HAZE = ${n.darkHaze.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${n.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${n.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${n.neutralHi.toFixed(4)};
const float LOOK_NEUTRAL_L_LO = ${n.neutralLLo.toFixed(4)};
const float LOOK_NEUTRAL_L_HI = ${n.neutralLHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${n.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${n.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${n.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${n.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${n.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${n.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${n.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${n.darkHi.toFixed(4)};
const float LOOK_FAR_LO = ${n.farLo.toFixed(6)};
const float LOOK_FAR_HI = ${n.farHi.toFixed(6)};
const float LOOK_FAR_KEEP = ${n.farKeep.toFixed(4)};
const float LOOK_BRIGHT_LO = ${n.brightLo.toFixed(4)};
const float LOOK_BRIGHT_HI = ${n.brightHi.toFixed(4)};
const float LOOK_KEEP_LO = ${n.keepLo.toFixed(4)};
const float LOOK_KEEP_HI = ${n.keepHi.toFixed(4)};
const float LOOK_C0 = ${n.c0.toFixed(4)};
const float LOOK_C1 = ${n.c1.toFixed(4)};
const float LOOK_MIX = ${n.mix.toFixed(4)};
const float SKIN_HUE = ${i.hue.toFixed(6)};
const float SKIN_BAND_HUE = ${i.bandHue.toFixed(6)};
const float SKIN_BAND_IN = ${i.bandIn.toFixed(6)};
const float SKIN_BAND_OUT = ${i.bandOut.toFixed(6)};
const float SKIN_ACHROMA = ${i.achroma.toFixed(4)};
const float SKIN_L_LO = ${i.lLo.toFixed(4)};
const float SKIN_L_HI = ${i.lHi.toFixed(4)};
const float SKIN_C_LO = ${i.cLo.toFixed(4)};
const float SKIN_C_HI = ${i.cHi.toFixed(4)};
const float SKIN_MIX = ${i.mix.toFixed(4)};
const float SKIN_W_LO = ${i.wLo.toFixed(4)};
const float SKIN_W_HI = ${i.wHi.toFixed(4)};
const float SKIN_C_MIN = ${i.cMin.toFixed(4)};
const float DG_K = ${T.k.toFixed(4)};
const float DG_EPS = ${T.eps.toFixed(5)};
const float DG_R_MIN = ${T.rMin.toFixed(4)};
const float DG_R_MAX = ${T.rMax.toFixed(4)};
const float ON_COS = ${Math.cos(E.hue).toFixed(6)};
const float ON_SIN = ${Math.sin(E.hue).toFixed(6)};
const float ON_COS_OUT = ${Math.cos(E.bandOut).toFixed(6)};
const float ON_COS_IN = ${Math.cos(E.bandIn).toFixed(6)};
const float ON_R_LO = ${E.rLo.toFixed(4)};
const float ON_R_HI = ${E.rHi.toFixed(4)};
const float ON_L_LO = ${E.lLo.toFixed(4)};
const float ON_L_HI = ${E.lHi.toFixed(4)};
const float ON_MIX = ${E.mix.toFixed(4)};
const float ON_FAR_LO = ${E.farLo.toFixed(6)};
const float ON_FAR_HI = ${E.farHi.toFixed(6)};
const float ON_LIFT = ${E.lift.toFixed(4)};
const float ON_SILVER = ${E.silver.toFixed(4)};
const float SC_K = ${r.k.toFixed(4)};
const float SC_CMAX = ${r.cMax.toFixed(4)};
const float SC_DESAT = ${r.desat.toFixed(4)};
const float SC_EDGE = ${r.edgeFloor.toFixed(4)};
const float BD_VETO_LO = ${D.vetoLo.toFixed(4)};
const float BD_VETO_HI = ${D.vetoHi.toFixed(4)};
const float BD_RING_R = ${D.ringR.toFixed(1)};
const float BD_CORE_IN = ${D.coreIn.toFixed(4)};
const float BD_CORE_LO = ${D.coreLo.toFixed(4)};
const float BD_CORE_HI = ${D.coreHi.toFixed(4)};
const float BD_HOLD_LO = ${D.holdLo.toFixed(4)};
const float BD_HOLD_HI = ${D.holdHi.toFixed(4)};
const float BD_SUBJ_LO = ${D.subjLo.toFixed(4)};
const float BD_SUBJ_HI = ${D.subjHi.toFixed(4)};
const float BD_DARK = ${D.vetoDark.toFixed(4)};
const float BD_AB2 = ${(D.abWeight*D.abWeight).toFixed(4)};
const float ON_CONF_LO = ${E.confLo.toFixed(4)};
const float ON_CONF_HI = ${E.confHi.toFixed(4)};
const float SEG_WATER_FLOOR = ${O.waterFloor.toFixed(4)};
const float SEG_CONF_LO = ${O.confLo.toFixed(4)};
const float SEG_CONF_HI = ${O.confHi.toFixed(4)};
const float SEG_IN_LO = ${O.insideLo.toFixed(4)};
const float SEG_IN_HI = ${O.insideHi.toFixed(4)};
const float SEG_DEP_LO = ${O.departLo.toFixed(4)};
const float SEG_DEP_HI = ${O.departHi.toFixed(4)};
const float SEG_A_LO = ${O.alphaLo.toFixed(4)};
const float SEG_A_HI = ${O.alphaHi.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(E.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(E.warmHue).toFixed(6)};
const float ON_WARM_LO = ${E.warmLo.toFixed(4)};
const float ON_WARM_HI = ${E.warmHi.toFixed(4)};
${Object.entries(e).map(([e,t])=>`const float VL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(re).map(([e,t])=>`const float HP_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
`,se=oe.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),ce=`${oe}
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
// Vivid look in Oklab (see VIVID_LOOK in params.ts; mirrors apply.ts vividLook).
vec3 vividLook(vec3 lab, float v, float g) {
  if (v <= 0.0) return lab;
  float C = length(lab.yz);
  float h = atan(lab.z, lab.y);
  float hh = h < 0.0 ? h + 6.2831853 : h;
  float d = h - VL_TARGET; d -= 6.2831853 * round(d / 6.2831853);
  float wC = smoothstepf(VL_C_LO, VL_C_HI, C) * smoothstepf(VL_L_LO, VL_L_HI, lab.x);
  float hiKeep = 1.0 - smoothstepf(VL_BAND_HI0, VL_BAND_HI1, hh);
  float band = smoothstepf(VL_BAND_LO0, VL_BAND_LO1, hh) * hiKeep * (1.0 - smoothstepf(VL_VIOLET_C_LO, VL_VIOLET_C_HI, C) * smoothstepf(VL_TARGET, VL_BAND_HI1, hh));
  float gLo = smoothstepf(VL_GREEN_LO0, VL_GREEN_LO1, hh);
  float gBand = gLo * (1.0 - smoothstepf(VL_GREEN_TOP0, VL_GREEN_TOP1, hh));
  float h2 = h + ((1.0 - g) * band * VL_PULL * -d + g * gBand * VL_GREEN_SHIFT) * wC * v;
  float water = (1.0 - g) * band + g * gLo * hiKeep;
  float cw = smoothstepf(VL_DARK_C_LO, VL_DARK_C_HI, C);
  float w = water * cw * cw * v;
  C *= 1.0 + VL_CHROMA * w * (1.0 - g);
  float L2 = lab.x * (1.0 - (VL_DARK + (VL_DARK_GREEN - VL_DARK) * g) * w * smoothstepf(VL_DARK_L_LO, VL_DARK_L_HI, lab.x));
  L2 *= 1.0 - VL_BLACK_K * v * (1.0 - smoothstepf(VL_BLACK_LO, VL_BLACK_HI, L2));
  float cD = VL_SHADOW_C0 + VL_SHADOW_C1 * smoothstepf(VL_SHADOW_L_LO, VL_SHADOW_L_HI, L2);
  if (C > cD) C -= (C - cD) * (1.0 - VL_SHADOW_KEEP) * v * (1.0 - smoothstepf(VL_SHADOW_FADE_LO, VL_SHADOW_FADE_HI, L2));
  float lw = v * (1.0 + (water - 1.0) * smoothstepf(0.0, VL_LIFT_NEUTRAL_C, C)) * smoothstepf(VL_LIFT_L_LO, 1.0, lab.x);
  L2 += VL_LIFT * lw * (1.0 - L2);
  C *= 1.0 - VL_HI_DESAT * lw;
  float wt = VL_WARM_C * lw;
  return vec3(L2, C * cos(h2) + wt * cos(VL_WARM_HUE), C * sin(h2) + wt * sin(VL_WARM_HUE));
}
// Near-white pink guard (see HIGHLIGHT_PINK; mirrors apply.ts highlightPink).
vec2 highlightPink(float L, vec2 ab) {
  float C = length(ab);
  if (C < 1e-6) return ab;
  float h = atan(ab.y, ab.x);
  float d = h - HP_HUE; d -= 6.2831853 * round(d / 6.2831853);
  float w = HP_MIX * smoothstepf(HP_L_LO, HP_L_HI, L) * (1.0 - smoothstepf(HP_C_LO, HP_C_HI, C)) * (1.0 - smoothstepf(HP_BAND_IN, HP_BAND_OUT, abs(d)));
  return ab * (1.0 - w);
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
// Subject clearing (SUBJECT_CLEAR; mirrors apply.ts clearCast): part of the water's cast out of the subject's chroma.
vec2 clearCast(vec2 ab, vec2 vh, float g) {
  float C = length(ab);
  if (g <= 0.0 || C < 1e-6) return ab;
  // The cast is the chroma along the water's hue: shrink the chroma by that share, bounded, without turning the hue.
  float pc = max(0.0, dot(ab, vh));
  float c1 = (C - g * min(SC_K * pc, SC_CMAX)) * (1.0 - g * SC_DESAT);
  return ab * (max(0.0, c1) / C);
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
  return max(core * mix(smoothstepf(BD_CORE_IN, 1.0, core) * smoothstepf(BD_CORE_LO, BD_CORE_HI, dev), 1.0, trim), min(min(1.0, ring), trim));
}
// Per-animal tone strength (animals.ts: whole-or-nothing, decided per tracked animal on the CPU; one value per
// map texel, dilated past the animal so the outline comes from the per-pixel test above). Mirrors apply.ts.
// B, A: AI subject detection (studio seg/): the ML alpha and where / how much it replaces the engine's subject
// weight (0 without it, so the grade is unchanged).
vec4 animalStrength(vec2 uv) {
  ivec2 size = textureSize(u_data3, 0);
  ivec2 i = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
  // The interior hold (G) and the ML channels are read bilinearly so their edges are soft.
  vec2 f = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size) - 1.0);
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, size - 1);
  vec2 t = f - vec2(i0);
  vec4 c = mix(mix(texelFetch(u_data3, i0, 0), texelFetch(u_data3, ivec2(i1.x, i0.y), 0), t.x),
               mix(texelFetch(u_data3, ivec2(i0.x, i1.y), 0), texelFetch(u_data3, i1, 0), t.x), t.y);
  return vec4(texelFetch(u_data3, i, 0).r, c.g, c.b, c.a);
}
// Object weight and warm clamp (see apply.ts objectWeight / warmClamp).
float objectWeight(float conf) { return smoothstepf(ON_CONF_LO, ON_CONF_HI, conf); }
// AI subject detection (SEG_TONE): how sure the ML is here (confident, stable over time); 0 without it.
float segSure(vec4 an) { return an.w > 0.0 ? smoothstepf(SEG_CONF_LO, SEG_CONF_HI, an.w) : 0.0; }
// The pop strength: the engine's open-water amount, or a sure ML subject's own (a close-up has no open water).
float popStrength(vec4 an) { return max(p[16].w, segSure(an)); }
// The subject weight the tone uses: the engine's, or the ML alpha. depart (0..1) is how far the pixel departs from
// the water; where it matches the water the ML tones at most SEG_TONE.waterFloor, so a leak only tints, unless the
// ML is sure and the pixel well inside its mask (a blue dolphin), where the cap relaxes toward full.
float toneWeight(float subj, vec4 an, float depart) {
  float ow = objectWeight(subj) * mix(SC_EDGE, 1.0, depart);
  if (an.w <= 0.0) return ow;
  float sure = segSure(an);
  float floorW = mix(SEG_WATER_FLOOR, 1.0, sure * smoothstepf(SEG_IN_LO, SEG_IN_HI, an.z) * smoothstepf(SEG_DEP_LO, SEG_DEP_HI, depart));
  float ml = smoothstepf(SEG_A_LO, SEG_A_HI, an.z) * mix(floorW, 1.0, depart) * max(p[22].z, sure);
  return mix(ow, ml, clamp(an.w, 0.0, 1.0));
}
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
${h}
// Temporal layer hooks (temporal.ts): subject prior in, raw subject mask out.
float g_subjPrior = 0.0;
float g_subjOut = 0.0;
vec3 gradeD(vec3 src, vec3 base, vec2 uv) {
  g_subjOut = 0.0;
  // The compare wipe (p0.y) is not applied here: the temporal layer grades
  // through this function and its history must never see the wipe. The
  // backends composite it over the finished frame (shaders.ts COMPOSITE).
  float strength = p[0].z;
  if (strength <= 0.0) return src;
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
  float wSub = smoothstepf(subLo, subHi, sig) * (1.0 - hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma)) * (1.0 - RED_GREEN_PROP * p[22].w);
  // Red restoration (red.ts): amplified channels rebuilt from the smoothed chroma; red gain by red SNR.
  vec3 rg3 = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  float snrR;
  vec3 linC = chromaRebuild(lin, guideSmooth(uv, lin), max(rg3 * wb, waterWb), B, snrR);
  float redS = redGainStrength(snrR);
  vec3 per = max(linC - Bs, linC * floorFrac);
  vec3 D = mix(linC * max(floorFrac, 1.0 - lumBs / lumI), per, wSub);
  // Water/object confidence: the map where it matches, else the pixel's own
  // hue + signal tests (the analysis runs the same on the thumbnail).
  float confSignal = smoothstepf(confLo, confHi, sig);
  float confBright = smoothstepf(CONF_BRIGHT_LO, CONF_BRIGHT_HI, sig);
  // Open water: the backdrop test replaces the hue test and vetoes the lagging map (see apply.ts).
  float bdev = p[16].w > 0.0 ? backdropDev(lab0, uv) : 1.0;
  float bsub = smoothstepf(BD_VETO_LO, BD_VETO_HI, bdev);
  float veto = mix(1.0, bsub, p[16].w);
  float confPix = min(confSignal, max(max(hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma) * veto, confBright), p[22].w * RED_GREEN_OBJ));
  // Whatever the map says, a pixel the veil model would nearly erase
  // (tiny D) must take the water path — the physics path would crush it
  // to black, which is the dark ghost on moving content.
  // Open blue water: no source red → the water path's colour (see apply.ts).
  float conf = max(mix(confPix, min(clamp(fld.y, 0.0, 1.0), veto), k), person * smoothstepf(PERSON_LUM_LO, PERSON_LUM_HI, lumI)) * confSignal * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  // Raw subject mask (before the tone gate) is also the temporal tracker's output; the warped
  // previous mask (g_subjPrior, kept near the map by the temporal layer) holds where the pixel departs like a subject.
  float subjRaw = p[16].w > 0.0 ? max(subjectWeight(uv, clamp(fld.y, 0.0, 1.0) * k, bdev), g_subjPrior * smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev)) : 0.0;
  g_subjOut = subjRaw;
  vec4 an = animalStrength(uv);
  float subj = max(subjRaw, p[16].w > 0.0 ? an.y * smoothstepf(BD_HOLD_LO, BD_HOLD_HI, bdev) : 0.0) * p[16].w * p[22].z * an.x;
  if (p[0].w > 0.5) return vec3(k, confPix, clamp(fld.y, 0.0, 1.0));
  vec3 rangeGain = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  vec3 gainV = rangeGain * wb;
  gainV.r = 1.0 + (gainV.r - 1.0) * redS;
  vec3 full = D * gainV;
  float ew = pow(exposure, waterExposure);
  vec3 water = linC * vec3(waterRedGain(waterWb.r, rg3.r * wb.r, snrR), waterWb.gb) * ew * (1.0 - dehaze * min(0.9, lumBs / lumI) * smoothstepf(DEHAZE_LUM_LO, DEHAZE_LUM_HI, lumI));
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
    yt = murkHold(yt, lumI, p[22].w * (1.0 - conf));
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
  lab.yz = greenNeutral(lab.x, lab.yz, p[22].w * (1.0 - RED_GN_OBJ_KEEP * conf));
  // Departure from the water: the backdrop test in open water; in a close-up (no backdrop) the ML alpha already
  // carries its water cap (seg-overlay.ts composeSegStrength, from the overlay's own water-departure map).
  float depart = p[16].w > 0.0 ? smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev) : 1.0;
  float ow = toneWeight(subj, an, depart);
  float popS = popStrength(an);
  float tN = objectNeutral(lab.x, lab.yz, lin, onFar, ow, popS);
  float personS = person * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  scale *= warmClamp(lab.yz, lin, onFar, personS, popS);
  vec2 nab = clearCast(lab.yz * scale, veilHue, tN / ON_MIX);
  float Ls = lab.x;
  vec3 lk = deepBlueLook(vec3(Ls, skinTone(Ls, nab, personS)), look, 1.0 - hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma), p[16].x, p[16].y);
  lk.yz = warmMaterial(lk.x, redGuard(lk.x, lk.yz, lab0.yz, person, onFar), p[22].w, onFar);
  // Vivid look (opt-in, p23.z), then the near-white pink guard (always).
  lk = vividLook(lk, p[23].z, p[22].w);
  lk.yz = highlightPink(lk.x, lk.yz);
  vec3 o1 = oklabToLinear(capChroma(lk, cSrc));
  vec3 o2 = fitToGamut(o1 * detailRatio(src, lin));
  vec3 outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}
vec3 grade(vec3 src, vec2 uv) { return gradeD(src, src, uv); }`,le=`${se}
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
// Vivid look (mirrors the GLSL / apply.ts vividLook).
fn vividLook(lab: vec3<f32>, v: f32, g: f32) -> vec3<f32> {
  if (v <= 0.0) { return lab; }
  var C = length(lab.yz);
  let h = atan2(lab.z, lab.y);
  let hh = select(h, h + 6.2831853, h < 0.0);
  var d = h - VL_TARGET; d -= 6.2831853 * round(d / 6.2831853);
  let wC = smoothstepf(VL_C_LO, VL_C_HI, C) * smoothstepf(VL_L_LO, VL_L_HI, lab.x);
  let hiKeep = 1.0 - smoothstepf(VL_BAND_HI0, VL_BAND_HI1, hh);
  let band = smoothstepf(VL_BAND_LO0, VL_BAND_LO1, hh) * hiKeep * (1.0 - smoothstepf(VL_VIOLET_C_LO, VL_VIOLET_C_HI, C) * smoothstepf(VL_TARGET, VL_BAND_HI1, hh));
  let gLo = smoothstepf(VL_GREEN_LO0, VL_GREEN_LO1, hh);
  let gBand = gLo * (1.0 - smoothstepf(VL_GREEN_TOP0, VL_GREEN_TOP1, hh));
  let h2 = h + ((1.0 - g) * band * VL_PULL * -d + g * gBand * VL_GREEN_SHIFT) * wC * v;
  let water = (1.0 - g) * band + g * gLo * hiKeep;
  let cw = smoothstepf(VL_DARK_C_LO, VL_DARK_C_HI, C);
  let w = water * cw * cw * v;
  C *= 1.0 + VL_CHROMA * w * (1.0 - g);
  var L2 = lab.x * (1.0 - (VL_DARK + (VL_DARK_GREEN - VL_DARK) * g) * w * smoothstepf(VL_DARK_L_LO, VL_DARK_L_HI, lab.x));
  L2 *= 1.0 - VL_BLACK_K * v * (1.0 - smoothstepf(VL_BLACK_LO, VL_BLACK_HI, L2));
  let cD = VL_SHADOW_C0 + VL_SHADOW_C1 * smoothstepf(VL_SHADOW_L_LO, VL_SHADOW_L_HI, L2);
  if (C > cD) { C -= (C - cD) * (1.0 - VL_SHADOW_KEEP) * v * (1.0 - smoothstepf(VL_SHADOW_FADE_LO, VL_SHADOW_FADE_HI, L2)); }
  let lw = v * (1.0 + (water - 1.0) * smoothstepf(0.0, VL_LIFT_NEUTRAL_C, C)) * smoothstepf(VL_LIFT_L_LO, 1.0, lab.x);
  L2 += VL_LIFT * lw * (1.0 - L2);
  C *= 1.0 - VL_HI_DESAT * lw;
  let wt = VL_WARM_C * lw;
  return vec3(L2, C * cos(h2) + wt * cos(VL_WARM_HUE), C * sin(h2) + wt * sin(VL_WARM_HUE));
}
fn highlightPink(L: f32, ab: vec2<f32>) -> vec2<f32> {
  let C = length(ab);
  if (C < 1e-6) { return ab; }
  let h = atan2(ab.y, ab.x);
  var d = h - HP_HUE; d -= 6.2831853 * round(d / 6.2831853);
  let w = HP_MIX * smoothstepf(HP_L_LO, HP_L_HI, L) * (1.0 - smoothstepf(HP_C_LO, HP_C_HI, C)) * (1.0 - smoothstepf(HP_BAND_IN, HP_BAND_OUT, abs(d)));
  return ab * (1.0 - w);
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
  return max(core * mix(smoothstepf(BD_CORE_IN, 1.0, core) * smoothstepf(BD_CORE_LO, BD_CORE_HI, dev), 1.0, trim), min(min(1.0, ring), trim));
}
fn animalStrength(uv: vec2<f32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(u_data3, 0));
  let i = clamp(vec2<i32>(uv * vec2<f32>(size)), vec2<i32>(0), size - 1);
  let f = clamp(uv * vec2<f32>(size) - 0.5, vec2<f32>(0.0), vec2<f32>(size) - 1.0);
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, size - 1);
  let t = f - vec2<f32>(i0);
  let c = mix(mix(textureLoad(u_data3, i0, 0), textureLoad(u_data3, vec2<i32>(i1.x, i0.y), 0), t.x),
              mix(textureLoad(u_data3, vec2<i32>(i0.x, i1.y), 0), textureLoad(u_data3, i1, 0), t.x), t.y);
  return vec4<f32>(textureLoad(u_data3, i, 0).r, c.g, c.b, c.a);
}
fn objectWeight(conf: f32) -> f32 { return smoothstepf(ON_CONF_LO, ON_CONF_HI, conf); }
fn segSure(an: vec4<f32>) -> f32 { return select(0.0, smoothstepf(SEG_CONF_LO, SEG_CONF_HI, an.w), an.w > 0.0); }
fn popStrength(an: vec4<f32>) -> f32 { return max(params.p[16].w, segSure(an)); }
fn clearCast(ab: vec2<f32>, vh: vec2<f32>, g: f32) -> vec2<f32> {
  let C = length(ab);
  if (g <= 0.0 || C < 1e-6) { return ab; }
  let pc = max(0.0, dot(ab, vh));
  let c1 = (C - g * min(SC_K * pc, SC_CMAX)) * (1.0 - g * SC_DESAT);
  return ab * (max(0.0, c1) / C);
}
fn toneWeight(subj: f32, an: vec4<f32>, depart: f32) -> f32 {
  let ow = objectWeight(subj) * mix(SC_EDGE, 1.0, depart);
  if (an.w <= 0.0) { return ow; }
  let sure = segSure(an);
  let floorW = mix(SEG_WATER_FLOOR, 1.0, sure * smoothstepf(SEG_IN_LO, SEG_IN_HI, an.z) * smoothstepf(SEG_DEP_LO, SEG_DEP_HI, depart));
  let ml = smoothstepf(SEG_A_LO, SEG_A_HI, an.z) * mix(floorW, 1.0, depart) * max(p[22].z, sure);
  return mix(ow, ml, clamp(an.w, 0.0, 1.0));
}
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
${a}
var<private> g_subjPrior: f32 = 0.0;
var<private> g_subjOut: f32 = 0.0;
fn gradeD(src: vec3<f32>, base: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  g_subjOut = 0.0;
  let p = params.p;
  // No compare wipe here (see gradeD in GLSL): the backends composite it.
  let strength = p[0].z;
  if (strength <= 0.0) { return src; }
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
  let wSub = smoothstepf(subLo, subHi, sig) * (1.0 - hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma)) * (1.0 - RED_GREEN_PROP * p[22].w);
  // Red restoration (red.ts): amplified channels rebuilt from the smoothed chroma; red gain by red SNR.
  let rg3 = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  let crb = chromaRebuild(lin, guideSmooth(uv, lin), max(rg3 * wb, waterWb), B);
  let linC = crb.xyz;
  let redS = redGainStrength(crb.w);
  let per = max(linC - Bs, linC * floorFrac);
  let D = mix(linC * max(floorFrac, 1.0 - lumBs / lumI), per, vec3(wSub));
  let confSignal = smoothstepf(confLo, confHi, sig);
  let confBright = smoothstepf(CONF_BRIGHT_LO, CONF_BRIGHT_HI, sig);
  let bdev = select(1.0, backdropDev(lab0, uv), p[16].w > 0.0);
  let bsub = smoothstepf(BD_VETO_LO, BD_VETO_HI, bdev);
  let veto = mix(1.0, bsub, p[16].w);
  let confPix = min(confSignal, max(max(hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma) * veto, confBright), p[22].w * RED_GREEN_OBJ));
  let conf = max(mix(confPix, min(clamp(fld.y, 0.0, 1.0), veto), k), person * smoothstepf(PERSON_LUM_LO, PERSON_LUM_HI, lumI)) * confSignal * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  let subjRaw = select(0.0, max(subjectWeight(uv, clamp(fld.y, 0.0, 1.0) * k, bdev), g_subjPrior * smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev)), p[16].w > 0.0);
  g_subjOut = subjRaw;
  let an = animalStrength(uv);
  let subj = max(subjRaw, select(0.0, an.y * smoothstepf(BD_HOLD_LO, BD_HOLD_HI, bdev), p[16].w > 0.0)) * p[16].w * p[22].z * an.x;
  if (p[0].w > 0.5) { return vec3(k, confPix, clamp(fld.y, 0.0, 1.0)); }
  let rangeGain = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  var gainV = rangeGain * wb;
  gainV.r = 1.0 + (gainV.r - 1.0) * redS;
  let full = D * gainV;
  let ew = pow(exposure, waterExposure);
  let water = linC * vec3(waterRedGain(waterWb.r, rg3.r * wb.r, crb.w), waterWb.gb) * ew * (1.0 - dehaze * min(0.9, lumBs / lumI) * smoothstepf(DEHAZE_LUM_LO, DEHAZE_LUM_HI, lumI));
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
    yt = murkHold(yt, lumI, p[22].w * (1.0 - conf));
    if (yt > knee) { yt = knee + (1.0 - knee) * (1.0 - exp(-(yt - knee) / (1.0 - knee))); }
    if (yo > 1e-6) { o *= yt / yo; } else { o = lin * (yt / lumI); }
  }
  let cSrc = length(lab0.yz);
  var lab = linearToOklab(max(o, vec3(0.0)));
  let C = length(lab.yz);
  let cMax = chromaK * cSrc + chromaC0;
  var scale = select(1.0, cMax / C, C > cMax);
  let vividW = smoothstepf(VIVID_C_LO, VIVID_C_HI, cSrc) * hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma);
  let cMin = VIVID_KEEP * cSrc * vividW;
  if (C > 1e-6 && C * scale < cMin) { scale = cMin / C; }
  scale *= saturation;
  let onFar = hueFar(lab0.yz, veilHue, ON_FAR_LO, ON_FAR_HI, achroma);
  let gnab = greenNeutral(lab.x, lab.yz, p[22].w * (1.0 - RED_GN_OBJ_KEEP * conf));
  lab = vec3(lab.x, gnab);
  let depart = select(1.0, smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev), p[16].w > 0.0);
  let ow = toneWeight(subj, an, depart);
  let popS = popStrength(an);
  let tN = objectNeutral(lab.x, lab.yz, lin, onFar, ow, popS);
  let personS = person * (1.0 - p[16].w * (1.0 - smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)))));
  scale *= warmClamp(lab.yz, lin, onFar, personS, popS);
  let nab = clearCast(lab.yz * scale, veilHue, tN / ON_MIX);
  let Ls = lab.x;
  var lk = deepBlueLook(vec3(Ls, skinTone(Ls, nab, personS)), look, 1.0 - hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma), p[16].x, p[16].y);
  let gab = warmMaterial(lk.x, redGuard(lk.x, lk.yz, lab0.yz, person, onFar), p[22].w, onFar);
  lk = vec3(lk.x, gab);
  lk = vividLook(lk, p[23].z, p[22].w);
  lk = vec3(lk.x, highlightPink(lk.x, lk.yz));
  let o1 = oklabToLinear(capChroma(lk, cSrc));
  let o2 = fitToGamut(o1 * detailRatio(src, lin));
  let outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}`,ue=ie.map(([e,t,n])=>`  dgTap(suv + vec2(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk, acc, sw);`).join(`
`),de=ie.map(([e,t,n])=>`  acc += dgTap(suv + vec2<f32>(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk);`).join(`
`),fe=`
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
${ue}
  return acc / sw;
}`,pe=`
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
${de}
  return acc.xyz / acc.w;
}`,me=`
vec2 rotateUV(vec2 uv, int r) {
  if (r == 1) return vec2(uv.y, 1.0 - uv.x);
  if (r == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (r == 3) return vec2(1.0 - uv.y, uv.x);
  return uv;
}`,he=`
fn rotateUV(uv: vec2<f32>, r: u32) -> vec2<f32> {
  if (r == 1u) { return vec2(uv.y, 1.0 - uv.x); }
  if (r == 2u) { return vec2(1.0 - uv.x, 1.0 - uv.y); }
  if (r == 3u) { return vec2(1.0 - uv.y, uv.x); }
  return uv;
}`,k=e=>e.toFixed(6),A=`
const int TP_R = ${m.flowR};
const float TP_LAMBDA = ${k(m.lambda)};
const float TP_SAD_LO = ${k(m.sadLo)};
const float TP_SAD_HI = ${k(m.sadHi)};
const float TP_BETA = ${k(m.betaMax)};
const float TP_BDIFF = ${k(m.betaDiff)};
const float TP_KMIN = ${k(m.kMin)};
const float TP_KMAX = ${k(m.kMax)};
const float TP_DECAY = ${k(m.decay)};
const float TP_SUP_R = ${k(m.supportR)};
const float TP_SUP_LO = ${k(m.supportLo)};
const float TP_SUP_HI = ${k(m.supportHi)};
const float TP_DENOISE = ${k(m.denoise)};
const float TP_TAU = ${k(m.tau)};
const float TP_FLAT_LO = ${k(m.flatLo)};
const float TP_FLAT_HI = ${k(m.flatHi)};
const float TP_DARK_LO = ${k(m.darkLo)};
const float TP_DARK_HI = ${k(m.darkHi)};
`,j=A.replace(`const int TP_R = `,`const TP_R: i32 = `).replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),M=`
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}`,N=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[24]; };`,ge=`${N}
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 o_color;
${me}
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
}`,P=`
struct Params { p: array<vec4<f32>, 24> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
${M}
${he}
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
}`,_e=`${N}
uniform sampler2D u_lum;
uniform sampler2D u_lumPrev;
out vec4 o_color;
${A}
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
}`,ve=`
@group(0) @binding(0) var u_lum: texture_2d<f32>;
@group(0) @binding(1) var u_lumPrev: texture_2d<f32>;
${M}
${j}
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
}`,ye=`${N}
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
${A}
${ce}
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
}`,be=`
struct Params { p: array<vec4<f32>, 24> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
@group(0) @binding(10) var u_data3: texture_2d<f32>;
@group(0) @binding(6) var u_lum: texture_2d<f32>;
@group(0) @binding(7) var u_flow: texture_2d<f32>;
@group(0) @binding(8) var u_histf: texture_2d<f32>;
struct FieldOut { @location(0) f0: vec4<f32>, @location(1) f1: vec4<f32> };
${M}
${j}
${le}
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
}`,xe=`
${A}
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
}`,Se=`
${j}
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
}`;function Ce(e){return e.replace(`var u_source: texture_2d<f32>;`,`var u_source: texture_external;`).replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g,`textureSampleBaseClampToEdge(u_source, samp, $1)`)}var F=`
vec2 rotateUV(vec2 uv, int r) {
  if (r == 1) return vec2(uv.y, 1.0 - uv.x);
  if (r == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (r == 3) return vec2(1.0 - uv.y, uv.x);
  return uv;
}`,I=`
fn rotateUV(uv: vec2<f32>, r: u32) -> vec2<f32> {
  if (r == 1u) { return vec2(uv.y, 1.0 - uv.x); }
  if (r == 2u) { return vec2(1.0 - uv.x, 1.0 - uv.y); }
  if (r == 3u) { return vec2(1.0 - uv.y, uv.x); }
  return uv;
}`,we=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[24]; };
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
${F}
${ce}
${fe}
${xe}
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
}`,Te=`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform int u_rotation;
uniform vec2 u_srcSize;
uniform vec2 u_outSize;
uniform vec4 u_rect; // sub-rectangle of the upright frame (x, y, w, h in 0..1)
in vec2 v_uv;
out vec4 o_color;
${F}
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
}`,L=`
struct Params { p: array<vec4<f32>, 24> };
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
${I}
${le}
${pe}
${Se}
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
}`,Ee=`
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
${I}
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
}`;function R(e){return e.replace(`var u_source: texture_2d<f32>;`,`var u_source: texture_external;`).replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g,`textureSampleBaseClampToEdge(u_source, samp, $1)`)}var De=R(L),Oe=R(Ee),ke=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_before;
uniform sampler2D u_graded;
uniform float u_split;
uniform int u_rot;
in vec2 v_uv;
out vec4 o_color;
${F}
void main() {
  if (v_uv.x < u_split) o_color = vec4(texture(u_before, rotateUV(v_uv, u_rot)).rgb, 1.0);
  else o_color = vec4(texelFetch(u_graded, ivec2(gl_FragCoord.xy), 0).rgb, 1.0);
}`,z=`
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
${I}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let orig = textureSampleLevel(u_source, samp, rotateUV(in.uv, u32(cp.rot + 0.5)), 0.0).rgb;
  let graded = textureLoad(u_graded, vec2<i32>(in.pos.xy), 0).rgb;
  return vec4(select(graded, orig, in.uv.x < cp.split), 1.0);
}`,Ae=R(z),B=`#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = vec2(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
}`,je=class{kind=`webgl2`;canvas;outputWidth=0;outputHeight=0;lastDrawMs=0;lastCaptureMs=0;gl;grade;down;comp;vao;source;data=[];uniformBuf;uniforms=new Float32Array(96);rotation=0;srcW=0;srcH=0;srcKind=``;viaCanvas=!1;scratch=null;analysisFbo=null;analysisTex=null;analysisW=0;analysisH=0;pbo=null;readbackInFlight=!1;previewScale=1;tpOn=!1;tpValid=!1;tpLum;tpFlow;tpField;tpLowW=0;tpLowH=0;tpOutW=0;tpOutH=0;tpIdx=0;tpTex=null;tpFbo=null;beforeTex=null;wipe=null;lastGraded=null;constructor(e){this.canvas=e;let t=e.getContext(`webgl2`,{alpha:!1,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0,powerPreference:`high-performance`});if(!t)throw Error(`WebGL2 not supported`);this.gl=t;let n=!!t.getExtension(`EXT_color_buffer_float`);this.grade=this.link(B,we,[`u_source`,`u_data0`,`u_data1`,`u_data2`,`u_data3`,`u_tpF0`,`u_tpF1`,`u_tpFlow`,`u_tpPrev`]),this.down=this.link(B,Te,[`u_source`,`u_rotation`,`u_srcSize`,`u_outSize`,`u_rect`]),this.comp=this.link(B,ke,[`u_before`,`u_graded`,`u_split`,`u_rot`]),this.vao=t.createVertexArray(),this.source=this.makeTexture(t.LINEAR);for(let e=0;e<4;e++){let e=this.makeTexture(t.NEAREST);t.bindTexture(t.TEXTURE_2D,e),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,1,1,0,t.RGBA,t.FLOAT,new Float32Array([0,0,0,0])),this.data.push(e)}this.uniformBuf=t.createBuffer(),t.bindBuffer(t.UNIFORM_BUFFER,this.uniformBuf),t.bufferData(t.UNIFORM_BUFFER,this.uniforms.byteLength,t.DYNAMIC_DRAW);let r=t.getUniformBlockIndex(this.grade.prog,`Params`);if(t.uniformBlockBinding(this.grade.prog,r,0),t.bindBufferBase(t.UNIFORM_BUFFER,0,this.uniformBuf),n)try{this.tpLum=this.link(B,ge,[`u_source`]),this.tpFlow=this.link(B,_e,[`u_lum`,`u_lumPrev`]),this.tpField=this.link(B,ye,[`u_data0`,`u_data1`,`u_data2`,`u_data3`,`u_lum`,`u_flow`,`u_histf`]);for(let e of[this.tpLum,this.tpField])t.uniformBlockBinding(e.prog,t.getUniformBlockIndex(e.prog,`Params`),0);this.tpOn=!0}catch(e){console.warn(`temporal layer unavailable:`,e.message)}}resetTemporal(){this.tpValid=!1}tpTarget(e,t,n){let r=this.gl,i=this.makeTexture(r.LINEAR);return n===`half`?r.texImage2D(r.TEXTURE_2D,0,r.RGBA16F,e,t,0,r.RGBA,r.HALF_FLOAT,null):r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,t,0,r.RGBA,r.UNSIGNED_BYTE,null),i}tpFramebuffer(...e){let t=this.gl,n=t.createFramebuffer();return t.bindFramebuffer(t.FRAMEBUFFER,n),e.forEach((e,n)=>t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0+n,t.TEXTURE_2D,e,0)),t.bindFramebuffer(t.FRAMEBUFFER,null),n}tpRelease(){let e=this.gl;if(this.lastGraded=null,this.tpTex){let t=this.tpTex;for(let n of[...t.lum,...t.f0,t.f1,t.flow,...t.out])e.deleteTexture(n)}if(this.tpFbo){let t=this.tpFbo;for(let n of[...t.lum,...t.field,t.flow,...t.out])e.deleteFramebuffer(n)}this.tpTex=null,this.tpFbo=null}tpEnsure(){if(!this.tpOn||!this.outputWidth)return!1;let e=Math.max(1,Math.ceil(this.outputWidth/m.scale)),t=Math.max(1,Math.ceil(this.outputHeight/m.scale)),n=this.canvas.width,r=this.canvas.height;if(this.tpTex&&e===this.tpLowW&&t===this.tpLowH&&n===this.tpOutW&&r===this.tpOutH)return!0;this.tpRelease();let i=(e,t)=>this.tpTarget(e,t,`half`),a={lum:[i(e,t),i(e,t)],f0:[i(e,t),i(e,t)],f1:i(e,t),flow:i(e,t),out:[this.tpTarget(n,r,`rgba8`),this.tpTarget(n,r,`rgba8`)]};return this.tpTex=a,this.tpFbo={lum:a.lum.map(e=>this.tpFramebuffer(e)),field:a.f0.map(e=>this.tpFramebuffer(e,a.f1)),flow:this.tpFramebuffer(a.flow),out:a.out.map(e=>this.tpFramebuffer(e))},this.tpLowW=e,this.tpLowH=t,this.tpOutW=n,this.tpOutH=r,this.tpValid=!1,!0}bindTex(e,t,n,r){let i=this.gl;i.activeTexture(i.TEXTURE0+e),i.bindTexture(i.TEXTURE_2D,t),i.uniform1i(n.loc.get(r),e)}tpPasses(){let e=this.gl,t=this.tpTex,n=this.tpFbo,r=this.tpIdx,i=1-r;this.uniforms[92]=+!!this.tpValid,e.bindBuffer(e.UNIFORM_BUFFER,this.uniformBuf),e.bufferSubData(e.UNIFORM_BUFFER,368,this.uniforms.subarray(92,93)),e.bindBufferBase(e.UNIFORM_BUFFER,0,this.uniformBuf),e.bindVertexArray(this.vao),e.viewport(0,0,this.tpLowW,this.tpLowH),e.bindFramebuffer(e.FRAMEBUFFER,n.lum[r]),e.useProgram(this.tpLum.prog),this.bindTex(0,this.source,this.tpLum,`u_source`),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,n.flow),e.useProgram(this.tpFlow.prog),this.bindTex(4,t.lum[r],this.tpFlow,`u_lum`),this.bindTex(5,t.lum[i],this.tpFlow,`u_lumPrev`),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,n.field[r]),e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),e.useProgram(this.tpField.prog);for(let e=0;e<4;e++)this.bindTex(V(e),this.data[e],this.tpField,`u_data${e}`);this.bindTex(4,t.lum[r],this.tpField,`u_lum`),this.bindTex(5,t.flow,this.tpField,`u_flow`),this.bindTex(6,t.f0[i],this.tpField,`u_histf`),e.drawArrays(e.TRIANGLES,0,3),e.drawBuffers([e.COLOR_ATTACHMENT0])}makeTexture(e){let t=this.gl,n=t.createTexture();return t.bindTexture(t.TEXTURE_2D,n),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,e),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,e),n}link(e,t,n){let r=this.gl,i=(e,t)=>{let n=r.createShader(e);if(r.shaderSource(n,t),r.compileShader(n),!r.getShaderParameter(n,r.COMPILE_STATUS)){let e=r.getShaderInfoLog(n);throw r.deleteShader(n),Error(`Shader compile failed: `+e)}return n},a=i(r.VERTEX_SHADER,e),o=i(r.FRAGMENT_SHADER,t),s=r.createProgram();if(r.attachShader(s,a),r.attachShader(s,o),r.linkProgram(s),r.deleteShader(a),r.deleteShader(o),!r.getProgramParameter(s,r.LINK_STATUS))throw Error(`Link failed: `+r.getProgramInfoLog(s));let c=new Map;for(let e of n)c.set(e,r.getUniformLocation(s,e));return{prog:s,loc:c}}syncProfile=!1;stageMs={upload:0,temporal:0,grade:0,capture:0};syncPx=new Uint8Array(4);gpuSync(){let e=this.gl,t=e.getParameter(e.READ_FRAMEBUFFER_BINDING);e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.readPixels(0,0,1,1,e.RGBA,e.UNSIGNED_BYTE,this.syncPx),e.bindFramebuffer(e.READ_FRAMEBUFFER,t)}upload(e,t,n,r){let i=this.syncProfile?performance.now():0;try{this.uploadNow(e,t,n,r)}finally{this.syncProfile&&(this.gpuSync(),this.stageMs.upload+=performance.now()-i)}}uploadNow(e,t,n,r){let i=this.gl;this.lastGraded=null,this.rotation=r;let[a,s]=u(t,n,r);this.outputWidth=a,this.outputHeight=s,this.sizeCanvas(this.previewScale),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,this.source),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,0),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.NONE);let c=o(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`,l=t!==this.srcW||n!==this.srcH||c!==this.srcKind,d=e;if(!l&&this.viaCanvas&&(d=this.throughCanvas(e,t,n)),l){for(;i.getError()!==i.NO_ERROR;);i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,t,n,0,i.RGBA,i.UNSIGNED_BYTE,d),i.texSubImage2D(i.TEXTURE_2D,0,0,0,t,n,i.RGBA,i.UNSIGNED_BYTE,d);let r=i.getError();this.viaCanvas=r!==i.NO_ERROR,this.viaCanvas&&(console.warn(`WebGL direct upload of ${c} at ${t}x${n} failed (0x${r.toString(16)}); resampling through a canvas`),d=this.throughCanvas(e,t,n),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,t,n,0,i.RGBA,i.UNSIGNED_BYTE,d)),this.srcW=t,this.srcH=n,this.srcKind=c}else i.texSubImage2D(i.TEXTURE_2D,0,0,0,t,n,i.RGBA,i.UNSIGNED_BYTE,d)}throughCanvas(e,t,n){return(!this.scratch||this.scratch.width!==t||this.scratch.height!==n)&&(this.scratch=new OffscreenCanvas(t,n)),this.scratch.getContext(`2d`).drawImage(e,0,0,t,n),this.scratch}setPreviewScale(e){this.previewScale=Math.min(1,Math.max(.05,e)),this.outputWidth&&this.sizeCanvas(this.previewScale)}sizeCanvas(e){let t=Math.max(1,Math.round(this.outputWidth*e)),n=Math.max(1,Math.round(this.outputHeight*e));(this.canvas.width!==t||this.canvas.height!==n)&&(this.lastGraded=null,this.canvas.width=t,this.canvas.height=n)}setUniforms(e){if(e.length!==96)throw Error(`uniform block must have 96 floats`);this.uniforms.set(e),this.lastGraded=null;let t=this.gl;t.bindBuffer(t.UNIFORM_BUFFER,this.uniformBuf),t.bufferSubData(t.UNIFORM_BUFFER,0,this.uniforms)}setData(e,t){let n=this.gl;if(t.data.length!==t.width*t.height*4)throw Error(`data texture size mismatch`);this.lastGraded=null,n.activeTexture(n.TEXTURE0+V(e)),n.bindTexture(n.TEXTURE_2D,this.data[e]),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,0),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,t.width,t.height,0,n.RGBA,n.FLOAT,t.data)}bindCommon(e){let t=this.gl;t.useProgram(e.prog),t.bindVertexArray(this.vao),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.source),t.uniform1i(e.loc.get(`u_source`),0)}render(){let e=this.gl,t=this.uniforms[93]>.5&&this.tpEnsure();t||(this.tpValid=!1);let n=this.syncProfile?performance.now():0;if(t&&this.tpPasses(),this.syncProfile){this.gpuSync();let e=performance.now();this.stageMs.temporal+=e-n,n=e}else this.uniforms[92]!==0&&(this.uniforms[92]=0,e.bindBuffer(e.UNIFORM_BUFFER,this.uniformBuf),e.bufferSubData(e.UNIFORM_BUFFER,368,this.uniforms.subarray(92,93)));let r=this.tpIdx,i=this.uniforms[1],a=null;if(t)e.bindFramebuffer(e.FRAMEBUFFER,this.tpFbo.out[r]),a=this.tpTex.out[r];else if(i>0){let t=this.wipeTarget();e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),a=t.tex}else e.bindFramebuffer(e.FRAMEBUFFER,null);e.viewport(0,0,this.canvas.width,this.canvas.height),this.bindCommon(this.grade);for(let e=0;e<4;e++)this.bindTex(V(e),this.data[e],this.grade,`u_data${e}`);if(t){let e=this.tpTex;this.bindTex(4,e.f0[r],this.grade,`u_tpF0`),this.bindTex(5,e.f1,this.grade,`u_tpF1`),this.bindTex(6,e.flow,this.grade,`u_tpFlow`),this.bindTex(7,e.out[1-r],this.grade,`u_tpPrev`)}else for(let[e,t]of[[4,`u_tpF0`],[5,`u_tpF1`],[6,`u_tpFlow`],[7,`u_tpPrev`]])this.bindTex(e,this.data[0],this.grade,t);if(e.bindBufferBase(e.UNIFORM_BUFFER,0,this.uniformBuf),e.drawArrays(e.TRIANGLES,0,3),i>0)this.composite(a,i);else if(t){let t=this.canvas.width,n=this.canvas.height;e.bindFramebuffer(e.READ_FRAMEBUFFER,this.tpFbo.out[r]),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.blitFramebuffer(0,0,t,n,0,0,t,n,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,null)}t&&(this.tpIdx=1-r,this.tpValid=!0),this.lastGraded=a,this.syncProfile&&(this.gpuSync(),this.stageMs.grade+=performance.now()-n)}wipeTarget(){let e=this.gl,t=this.canvas.width,n=this.canvas.height;if(this.wipe&&this.wipe.w===t&&this.wipe.h===n)return this.wipe;this.wipe&&(e.deleteTexture(this.wipe.tex),e.deleteFramebuffer(this.wipe.fbo));let r=this.tpTarget(t,n,`rgba8`);return this.wipe={tex:r,fbo:this.tpFramebuffer(r),w:t,h:n},this.wipe}composite(e,t){let n=this.gl;n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,this.canvas.width,this.canvas.height),n.useProgram(this.comp.prog),n.bindVertexArray(this.vao),this.bindTex(0,this.beforeTex??this.source,this.comp,`u_before`),this.bindTex(4,e,this.comp,`u_graded`),n.uniform1f(this.comp.loc.get(`u_split`),t),n.uniform1i(this.comp.loc.get(`u_rot`),this.beforeTex?0:this.rotation),n.drawArrays(n.TRIANGLES,0,3)}recomposite(e){return this.lastGraded?(this.uniforms[1]=e,this.composite(this.lastGraded,e),!0):!1}setBefore(e,t,n){let r=this.gl;if(this.lastGraded=null,!e){this.beforeTex&&r.deleteTexture(this.beforeTex),this.beforeTex=null;return}this.beforeTex||=this.makeTexture(r.LINEAR),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,this.beforeTex),r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,0),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,r.NONE);try{r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,r.RGBA,r.UNSIGNED_BYTE,e)}catch{r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,r.RGBA,r.UNSIGNED_BYTE,this.throughCanvas(e,t,n))}}async renderToFrame(e,t){this.sizeCanvas(1);let n=performance.now();this.render();let r=performance.now(),i=new VideoFrame(this.canvas,{timestamp:e,duration:t});return this.lastDrawMs=r-n,this.lastCaptureMs=performance.now()-r,this.stageMs.capture+=this.lastCaptureMs,i}ensureAnalysisTargets(e,t){let n=this.gl;this.analysisTex&&this.analysisW===e&&this.analysisH===t||(this.analysisTex&&n.deleteTexture(this.analysisTex),this.analysisFbo&&n.deleteFramebuffer(this.analysisFbo),this.pbo&&n.deleteBuffer(this.pbo),this.analysisTex=this.makeTexture(n.NEAREST),n.bindTexture(n.TEXTURE_2D,this.analysisTex),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,e,t,0,n.RGBA,n.UNSIGNED_BYTE,null),this.analysisFbo=n.createFramebuffer(),n.bindFramebuffer(n.FRAMEBUFFER,this.analysisFbo),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,this.analysisTex,0),n.bindFramebuffer(n.FRAMEBUFFER,null),this.pbo=n.createBuffer(),n.bindBuffer(n.PIXEL_PACK_BUFFER,this.pbo),n.bufferData(n.PIXEL_PACK_BUFFER,e*t*4,n.STREAM_READ),n.bindBuffer(n.PIXEL_PACK_BUFFER,null),this.analysisW=e,this.analysisH=t)}async analyze(e,t,n=x){let r=this.gl;if(this.readbackInFlight)throw Error(`analysis readback already in flight`);this.readbackInFlight=!0;try{this.ensureAnalysisTargets(e,t),r.bindFramebuffer(r.FRAMEBUFFER,this.analysisFbo),r.viewport(0,0,e,t),this.bindCommon(this.down),r.uniform1i(this.down.loc.get(`u_rotation`),this.rotation),r.uniform2f(this.down.loc.get(`u_srcSize`),this.srcW,this.srcH),r.uniform2f(this.down.loc.get(`u_outSize`),e,t),r.uniform4f(this.down.loc.get(`u_rect`),n.x,n.y,n.w,n.h),r.drawArrays(r.TRIANGLES,0,3),r.bindBuffer(r.PIXEL_PACK_BUFFER,this.pbo),r.readPixels(0,0,e,t,r.RGBA,r.UNSIGNED_BYTE,0);let i=r.fenceSync(r.SYNC_GPU_COMMANDS_COMPLETE,0);r.flush(),r.bindBuffer(r.PIXEL_PACK_BUFFER,null),r.bindFramebuffer(r.FRAMEBUFFER,null),await new Promise((e,t)=>{let n=0,a=()=>{let o=r.clientWaitSync(i,0,0);if(o===r.ALREADY_SIGNALED||o===r.CONDITION_SATISFIED)return e();if(o===r.WAIT_FAILED||++n>15e3)return t(Error(`GPU readback timed out`));setTimeout(a,2)};a()}),r.deleteSync(i);let a=new Uint8ClampedArray(e*t*4);return r.bindBuffer(r.PIXEL_PACK_BUFFER,this.pbo),r.getBufferSubData(r.PIXEL_PACK_BUFFER,0,a),r.bindBuffer(r.PIXEL_PACK_BUFFER,null),a}finally{this.readbackInFlight=!1}}dispose(){let e=this.gl;e.deleteProgram(this.grade.prog),e.deleteProgram(this.down.prog),e.deleteProgram(this.comp.prog),this.beforeTex&&e.deleteTexture(this.beforeTex),this.wipe&&(e.deleteTexture(this.wipe.tex),e.deleteFramebuffer(this.wipe.fbo)),this.tpRelease(),e.deleteTexture(this.source);for(let t of this.data)e.deleteTexture(t);e.deleteBuffer(this.uniformBuf),this.analysisTex&&e.deleteTexture(this.analysisTex),this.analysisFbo&&e.deleteFramebuffer(this.analysisFbo),this.pbo&&e.deleteBuffer(this.pbo)}};function V(e){return e<3?1+e:5+e}var H={3:`unfilterable`,4:`unfilterable`,5:`unfilterable`,10:`unfilterable`},U={6:`texture`,7:`texture`,8:`texture`,9:`texture`},W={grade:{0:`uniform`,1:`sampler`,2:`texture`,...H,...U},gradeExt:{0:`uniform`,1:`sampler`,2:`external`,...H,...U},down:{0:`uniform`,1:`sampler`,2:`texture`},downExt:{0:`uniform`,1:`sampler`,2:`external`},flow:{0:`unfilterable`,1:`unfilterable`},field:{0:`uniform`,...H,6:`unfilterable`,7:`unfilterable`,8:`unfilterable`},composite:{0:`uniform`,1:`sampler`,2:`texture`,3:`texture`},compositeExt:{0:`uniform`,1:`sampler`,2:`external`,3:`texture`}};function G(e){let t=new OffscreenCanvas(16,16).getContext(`2d`);if(!t)return!0;t.drawImage(e,0,0,16,16);let n=t.getImageData(0,0,16,16).data;for(let e=0;e<n.length;e+=4)if(n[e]>8||n[e+1]>8||n[e+2]>8)return!0;return!1}var Me=class e{kind=`webgpu`;canvas;outputWidth=0;outputHeight=0;lastDrawMs=0;lastCaptureMs=0;device;ctx;format;gradePipeline;downPipeline;gradePipelineExt;downPipelineExt;extSource=null;externalOk=void 0;sampler;uniformBuf;downParamsBuf;uniforms=new Float32Array(96);source=null;srcW=0;srcH=0;rotation=0;data=[];gradeBindGroup=null;bindGroupDirty=!0;scratch=null;directUpload={frame:void 0,video:void 0,image:void 0};analysisTex=null;analysisBuf=null;analysisW=0;analysisH=0;analysisBytesPerRow=0;readbackInFlight=!1;previewScale=1;exportTex=null;exportCanvas=null;exportCtx=null;tpLumPipe;tpLumPipeExt;tpFlowPipe;tpFieldPipe;tpValid=!1;tpIdx=0;tpLowW=0;tpLowH=0;tpOutW=0;tpOutH=0;tpTex=null;tpDummyHalf;tpDummyOut;compPipe;compPipeExt;compBuf;beforeTex=null;wipeTex=null;lastGraded=null;constructor(e,t){this.canvas=e,this.device=t;let n=e.getContext(`webgpu`);if(!n)throw Error(`WebGPU canvas context unavailable`);this.ctx=n,this.format=navigator.gpu.getPreferredCanvasFormat(),n.configure({device:t,format:this.format,alphaMode:`opaque`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});let r=(e,t)=>{let n=GPUShaderStage.FRAGMENT;switch(t){case`uniform`:return{binding:e,visibility:n,buffer:{type:`uniform`}};case`sampler`:return{binding:e,visibility:n,sampler:{type:`filtering`}};case`external`:return{binding:e,visibility:n,externalTexture:{}};case`unfilterable`:return{binding:e,visibility:n,texture:{sampleType:`unfilterable-float`,viewDimension:`2d`}};default:return{binding:e,visibility:n,texture:{sampleType:`float`,viewDimension:`2d`}}}},i=e=>t.createBindGroupLayout({entries:Object.entries(e).map(([e,t])=>r(Number(e),t))}),a=i(W.grade),o=i(W.down),s=i(W.gradeExt),c=i(W.downExt),l=(e,n,r)=>t.createRenderPipeline({layout:t.createPipelineLayout({bindGroupLayouts:[r]}),vertex:{module:t.createShaderModule({code:e}),entryPoint:`vs`},fragment:{module:t.createShaderModule({code:e}),entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`}});this.gradePipeline=l(L,this.format,a),this.downPipeline=l(Ee,`rgba8unorm`,o),this.gradePipelineExt=l(De,this.format,s),this.downPipelineExt=l(Oe,`rgba8unorm`,c),this.tpLumPipe=l(P,`rgba16float`,o),this.tpLumPipeExt=l(Ce(P),`rgba16float`,c);let u=i(W.flow);this.tpFlowPipe=l(ve,`rgba16float`,u),this.compPipe=l(z,this.format,i(W.composite)),this.compPipeExt=l(Ae,this.format,i(W.compositeExt)),this.compBuf=t.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let d=i(W.field),f=t.createShaderModule({code:be});this.tpFieldPipe=t.createRenderPipeline({layout:t.createPipelineLayout({bindGroupLayouts:[d]}),vertex:{module:f,entryPoint:`vs`},fragment:{module:f,entryPoint:`fs`,targets:[{format:`rgba16float`},{format:`rgba16float`}]},primitive:{topology:`triangle-list`}}),this.tpDummyHalf=t.createTexture({size:[1,1],format:`rgba16float`,usage:GPUTextureUsage.TEXTURE_BINDING}),this.tpDummyOut=t.createTexture({size:[1,1],format:this.format,usage:GPUTextureUsage.TEXTURE_BINDING}),this.sampler=t.createSampler({magFilter:`linear`,minFilter:`linear`,addressModeU:`clamp-to-edge`,addressModeV:`clamp-to-edge`}),this.uniformBuf=t.createBuffer({size:384,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.downParamsBuf=t.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});for(let e=0;e<4;e++)this.data.push(this.makeDataTexture(1,1,new Float32Array(4)))}static async create(t){if(!(`gpu`in navigator))throw Error(`WebGPU not supported`);let n=await navigator.gpu.requestAdapter({powerPreference:`high-performance`});if(!n)throw Error(`WebGPU adapter unavailable`);let r=await n.requestDevice();return r.addEventListener(`uncapturederror`,e=>{console.error(`WebGPU:`,e.error.message)}),new e(t,r)}makeDataTexture(e,t,n){let r=this.device.createTexture({size:[e,t],format:`rgba32float`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:r},n,{bytesPerRow:e*16,rowsPerImage:t},[e,t]),r}upload(e,t,n,r){this.lastGraded=null,this.rotation=r;let[i,a]=u(t,n,r);if(this.outputWidth=i,this.outputHeight=a,this.sizeCanvas(this.previewScale),(!this.source||this.srcW!==t||this.srcH!==n)&&(this.source?.destroy(),this.source=this.device.createTexture({size:[t,n],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),this.srcW=t,this.srcH=n,this.bindGroupDirty=!0),this.extSource=null,o(e)&&this.externalOk!==!1&&(this.srcW=t,this.srcH=n,this.externalOk===void 0&&this.probeExternal(e),this.externalOk)){this.extSource=e,this.bindGroupDirty=!0;return}let s=o(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`;if(this.directUpload[s]!==!1){let r=e,i=this.directUpload[s]===void 0;i&&this.device.pushErrorScope(`validation`);try{if(this.device.queue.copyExternalImageToTexture({source:r,flipY:!1},{texture:this.source,colorSpace:`srgb`,premultipliedAlpha:!1},[t,n]),!i)return}catch{this.directUpload[s]=!1}if(i){this.directUpload[s]=!0,this.device.popErrorScope().then(e=>{e&&(console.warn(`WebGPU direct upload of ${s} unsupported, using canvas copy:`,e.message),this.directUpload[s]=!1)});return}}(!this.scratch||this.scratch.width!==t||this.scratch.height!==n)&&(this.scratch=new OffscreenCanvas(t,n)),this.scratch.getContext(`2d`).drawImage(e,0,0,t,n),this.device.queue.copyExternalImageToTexture({source:this.scratch},{texture:this.source},[t,n])}setPreviewScale(e){this.previewScale=Math.min(1,Math.max(.05,e)),this.outputWidth&&this.sizeCanvas(this.previewScale)}sizeCanvas(e){let t=Math.max(1,Math.round(this.outputWidth*e)),n=Math.max(1,Math.round(this.outputHeight*e));(this.canvas.width!==t||this.canvas.height!==n)&&(this.lastGraded=null,this.canvas.width=t,this.canvas.height=n)}setUniforms(e){if(e.length!==96)throw Error(`uniform block must have 96 floats`);this.uniforms.set(e),this.lastGraded=null,this.device.queue.writeBuffer(this.uniformBuf,0,this.uniforms)}setData(e,t){if(t.data.length!==t.width*t.height*4)throw Error(`data texture size mismatch`);this.lastGraded=null;let n=this.data[e];n.width!==t.width||n.height!==t.height?(n.destroy(),this.data[e]=this.makeDataTexture(t.width,t.height,t.data),this.bindGroupDirty=!0):this.device.queue.writeTexture({texture:n},t.data,{bytesPerRow:t.width*16,rowsPerImage:t.height},[t.width,t.height])}gradeGroup(e){if(this.extSource)return this.device.createBindGroup({layout:this.gradePipelineExt.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:e},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},{binding:10,resource:this.data[3].createView()},...this.tpGradeEntries()]});if(this.tpTex&&(this.bindGroupDirty=!0),this.gradeBindGroup&&!this.bindGroupDirty)return this.gradeBindGroup;if(!this.source)throw Error(`no source uploaded`);return this.gradeBindGroup=this.device.createBindGroup({layout:this.gradePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:this.source.createView()},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},{binding:10,resource:this.data[3].createView()},...this.tpGradeEntries()]}),this.bindGroupDirty=!1,this.gradeBindGroup}resetTemporal(){this.tpValid=!1}tpGradeEntries(){let e=this.tpTex;if(!e)return[6,7,8].map(e=>({binding:e,resource:this.tpDummyHalf.createView()})).concat([{binding:9,resource:this.tpDummyOut.createView()}]);let t=this.tpIdx;return[{binding:6,resource:e.f0[t].createView()},{binding:7,resource:e.f1.createView()},{binding:8,resource:e.flow.createView()},{binding:9,resource:e.out[1-t].createView()}]}tpEnsure(e,t){let n=Math.max(1,Math.ceil(this.outputWidth/m.scale)),r=Math.max(1,Math.ceil(this.outputHeight/m.scale));if(this.tpTex&&n===this.tpLowW&&r===this.tpLowH&&e===this.tpOutW&&t===this.tpOutH)return;this.tpRelease();let i=GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,a=()=>this.device.createTexture({size:[n,r],format:`rgba16float`,usage:i}),o=()=>this.device.createTexture({size:[e,t],format:this.format,usage:i|GPUTextureUsage.COPY_SRC});this.tpTex={lum:[a(),a()],f0:[a(),a()],f1:a(),flow:a(),out:[o(),o()]},this.tpLowW=n,this.tpLowH=r,this.tpOutW=e,this.tpOutH=t,this.tpValid=!1,this.bindGroupDirty=!0}tpRelease(){this.lastGraded=null;let e=this.tpTex;if(e)for(let t of[...e.lum,...e.f0,e.f1,e.flow,...e.out])t.destroy();this.tpTex=null}draw(e){let t=this.device.createCommandEncoder(),n=this.outputWidth>0&&this.uniforms[93]>.5;n||(this.tpValid=!1,this.uniforms[92]!==0&&(this.uniforms[92]=0,this.device.queue.writeBuffer(this.uniformBuf,368,this.uniforms,92,1)));let r=this.extSource?this.device.importExternalTexture({source:this.extSource}):null;if(n){this.tpEnsure(e.width,e.height);let n=this.tpTex,i=this.tpIdx,a=1-i;this.uniforms[92]=+!!this.tpValid,this.device.queue.writeBuffer(this.uniformBuf,368,this.uniforms,92,1);let o=(e,n,r)=>{let i=t.beginRenderPass({colorAttachments:e.map(e=>({view:e,loadOp:`clear`,storeOp:`store`}))});i.setPipeline(n),i.setBindGroup(0,r),i.draw(3),i.end()},s=r?this.tpLumPipeExt:this.tpLumPipe;o([n.lum[i].createView()],s,this.device.createBindGroup({layout:s.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:r??this.source.createView()}]})),o([n.flow.createView()],this.tpFlowPipe,this.device.createBindGroup({layout:this.tpFlowPipe.getBindGroupLayout(0),entries:[{binding:0,resource:n.lum[i].createView()},{binding:1,resource:n.lum[a].createView()}]})),o([n.f0[i].createView(),n.f1.createView()],this.tpFieldPipe,this.device.createBindGroup({layout:this.tpFieldPipe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},{binding:6,resource:n.lum[i].createView()},{binding:7,resource:n.flow.createView()},{binding:8,resource:n.f0[a].createView()},{binding:10,resource:this.data[3].createView()}]}))}let i=this.uniforms[1],a=n?this.tpTex.out[this.tpIdx]:i>0?this.wipeTarget(e.width,e.height):e,o=t.beginRenderPass({colorAttachments:[{view:a.createView(),loadOp:`clear`,storeOp:`store`}]});o.setPipeline(this.extSource?this.gradePipelineExt:this.gradePipeline),o.setBindGroup(0,this.gradeGroup(r)),o.draw(3),o.end(),i>0?this.composite(t,a,e,i,r):n&&t.copyTextureToTexture({texture:a},{texture:e},[e.width,e.height]),n&&(this.tpIdx=1-this.tpIdx,this.tpValid=!0),this.device.queue.submit([t.finish()]),this.lastGraded=a!==e&&!r?a:null}wipeTarget(e,t){return this.wipeTex&&this.wipeTex.width===e&&this.wipeTex.height===t?this.wipeTex:(this.wipeTex?.destroy(),this.wipeTex=this.device.createTexture({size:[e,t],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),this.wipeTex)}composite(e,t,n,r,i){let a=this.beforeTex?this.beforeTex.createView():i??this.source.createView(),o=!this.beforeTex&&i?this.compPipeExt:this.compPipe;this.device.queue.writeBuffer(this.compBuf,0,new Float32Array([r,this.beforeTex?0:this.rotation,0,0]));let s=this.device.createBindGroup({layout:o.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.compBuf}},{binding:1,resource:this.sampler},{binding:2,resource:a},{binding:3,resource:t.createView()}]}),c=e.beginRenderPass({colorAttachments:[{view:n.createView(),loadOp:`clear`,storeOp:`store`}]});c.setPipeline(o),c.setBindGroup(0,s),c.draw(3),c.end()}recomposite(e){if(!this.lastGraded)return!1;let t=this.ctx.getCurrentTexture();if(t.width!==this.lastGraded.width||t.height!==this.lastGraded.height)return!1;this.uniforms[1]=e;let n=this.device.createCommandEncoder();return this.composite(n,this.lastGraded,t,e,null),this.device.queue.submit([n.finish()]),!0}setBefore(e,t,n){if(this.lastGraded=null,!e){this.beforeTex?.destroy(),this.beforeTex=null;return}(!this.beforeTex||this.beforeTex.width!==t||this.beforeTex.height!==n)&&(this.beforeTex?.destroy(),this.beforeTex=this.device.createTexture({size:[t,n],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}));let r=o(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`;this.directUpload[r]===!0?this.device.queue.copyExternalImageToTexture({source:e,flipY:!1},{texture:this.beforeTex,colorSpace:`srgb`,premultipliedAlpha:!1},[t,n]):((!this.scratch||this.scratch.width!==t||this.scratch.height!==n)&&(this.scratch=new OffscreenCanvas(t,n)),this.scratch.getContext(`2d`).drawImage(e,0,0,t,n),this.device.queue.copyExternalImageToTexture({source:this.scratch},{texture:this.beforeTex},[t,n]))}downGroup(){let e=this.extSource?{binding:2,resource:this.device.importExternalTexture({source:this.extSource})}:{binding:2,resource:this.source.createView()};return this.device.createBindGroup({layout:(this.extSource?this.downPipelineExt:this.downPipeline).getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.downParamsBuf}},{binding:1,resource:this.sampler},e]})}async probeExternal(e){this.externalOk=!1;let t=this.device.createTexture({size:[32,18],format:`rgba8unorm`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),n=this.device.createBuffer({size:256*18,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{this.device.pushErrorScope(`validation`),this.device.queue.writeBuffer(this.downParamsBuf,0,new Float32Array([e.displayWidth,e.displayHeight,32,18,0,0,0,0,0,0,1,1]));let r=this.device.createBindGroup({layout:this.downPipelineExt.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.downParamsBuf}},{binding:1,resource:this.sampler},{binding:2,resource:this.device.importExternalTexture({source:e})}]}),i=this.device.createCommandEncoder(),a=i.beginRenderPass({colorAttachments:[{view:t.createView(),loadOp:`clear`,storeOp:`store`}]});a.setPipeline(this.downPipelineExt),a.setBindGroup(0,r),a.draw(3),a.end(),i.copyTextureToBuffer({texture:t},{buffer:n,bytesPerRow:256},[32,18]),this.device.queue.submit([i.finish()]);let o=await this.device.popErrorScope();if(o)throw Error(o.message);await n.mapAsync(GPUMapMode.READ);let s=new Uint8Array(n.getMappedRange()),c=!1;for(let e=0;e<18&&!c;e++)for(let t=0;t<128;t+=4)if(s[e*256+t]>8||s[e*256+t+1]>8||s[e*256+t+2]>8){c=!0;break}n.unmap(),this.externalOk=c,console.info(`WebGPU external video import: ${c?`ok`:`renders black, using copy path`}`)}catch(e){console.warn(`WebGPU external video import unavailable:`,e.message),this.externalOk=!1}finally{t.destroy(),n.destroy()}}render(){this.draw(this.ctx.getCurrentTexture())}capture=null;forceCapture=null;setCaptureMode(e){this.forceCapture=e===`auto`?null:e,this.capture=null}readbackRing=[];async renderToFrame(e,t){let n=this.outputWidth,r=this.outputHeight;if(!this.exportCanvas||this.exportCanvas.width!==n||this.exportCanvas.height!==r){this.exportCanvas=new OffscreenCanvas(n,r),this.exportCtx=this.exportCanvas.getContext(`webgpu`),this.exportCtx.configure({device:this.device,format:this.format,alphaMode:`opaque`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST}),this.exportTex?.destroy(),this.exportTex=this.device.createTexture({size:[n,r],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});for(let e of this.readbackRing)e.buffer.destroy();this.readbackRing=[]}if(this.capture===null){let n=this.forceCapture??new URLSearchParams(location.search).get(`capture`);n===`canvas`||n===`bitmap`||n===`readback`?(this.capture=n,this.captureBench=`forced ${n}`):await this.benchmarkCapture(e,t)}return this.captureAs(this.capture??`readback`,e,t)}captureBench=``;async benchmarkCapture(e,t){let n=this.extSource;n&&(this.extSource=null,this.externalOk=!1,this.upload(n,this.srcW,this.srcH,this.rotation),this.externalOk=!0);let r=[],i=null;for(let n of[`canvas`,`bitmap`,`readback`])try{let a=!1,o=performance.now();if(n===`readback`){let r=[];for(let i=0;i<4;i++)if(r.push(this.captureAs(n,e,t)),r.length>=3){let e=await r.shift();a||=G(e),e.close()}for(let e of r){let t=await e;a||=G(t),t.close()}}else for(let r=0;r<4;r++){let r=await this.captureAs(n,e,t);a||=G(r),r.close()}let s=(performance.now()-o)/4;r.push(`${n} ${s.toFixed(1)} ms${a?``:` (black)`}`),a&&(!i||s<i.ms)&&(i={mode:n,ms:s})}catch(e){r.push(`${n} failed (${e.message.split(`
`)[0].slice(0,50)})`)}this.capture=i?.mode??`readback`,this.captureBench=r.join(`, `),console.info(`WebGPU capture bench: ${r.join(`, `)} → ${this.capture}`),n&&(this.extSource=n)}async readbackSlotFree(){for(;this.readbackRing.length>0&&!this.readbackRing.some(e=>!e.busy);)await new Promise(e=>setTimeout(e,1))}async captureAs(e,t,n){let r=this.outputWidth,i=this.outputHeight,a=performance.now();if(e===`canvas`||e===`bitmap`){this.draw(this.exportCtx.getCurrentTexture());let r=performance.now();try{if(e===`canvas`)return new VideoFrame(this.exportCanvas,{timestamp:t,duration:n});let r=this.exportCanvas.transferToImageBitmap();try{return new VideoFrame(r,{timestamp:t,duration:n})}finally{r.close()}}finally{this.lastDrawMs=r-a,this.lastCaptureMs=performance.now()-r}}let o=Math.ceil(r*4/256)*256;this.readbackRing.length===0&&(this.readbackRing=Array.from({length:3},()=>({buffer:this.device.createBuffer({size:o*i,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),busy:!1})));let s=this.readbackRing.find(e=>!e.busy);if(!s)for(await new Promise(e=>setTimeout(e,1));!(s=this.readbackRing.find(e=>!e.busy));)await new Promise(e=>setTimeout(e,1));s.busy=!0;try{this.draw(this.exportTex);let e=this.device.createCommandEncoder();e.copyTextureToBuffer({texture:this.exportTex},{buffer:s.buffer,bytesPerRow:o},[r,i]),this.device.queue.submit([e.finish()]);let c=performance.now();this.lastDrawMs=c-a,await s.buffer.mapAsync(GPUMapMode.READ),this.lastCaptureMs=performance.now()-c;try{let e=new Uint8Array(s.buffer.getMappedRange()),a;if(o===r*4)a=new Uint8Array(e);else{a=new Uint8Array(r*4*i);for(let t=0;t<i;t++)a.set(e.subarray(t*o,t*o+r*4),t*r*4)}return new VideoFrame(a,{format:this.format===`bgra8unorm`?`BGRX`:`RGBX`,codedWidth:r,codedHeight:i,timestamp:t,duration:n})}finally{s.buffer.unmap()}}finally{s.busy=!1}}async analyze(e,t,n=x){if(this.readbackInFlight)throw Error(`analysis readback already in flight`);if(!this.source&&!this.extSource)throw Error(`no source uploaded`);this.readbackInFlight=!0;try{(!this.analysisTex||this.analysisW!==e||this.analysisH!==t)&&(this.analysisTex?.destroy(),this.analysisBuf?.destroy(),this.analysisTex=this.device.createTexture({size:[e,t],format:`rgba8unorm`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.analysisBytesPerRow=Math.ceil(e*4/256)*256,this.analysisBuf=this.device.createBuffer({size:this.analysisBytesPerRow*t,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),this.analysisW=e,this.analysisH=t),this.device.queue.writeBuffer(this.downParamsBuf,0,new Float32Array([this.srcW,this.srcH,e,t,this.rotation,0,0,0,n.x,n.y,n.w,n.h]));let r=this.downGroup(),i=this.device.createCommandEncoder(),a=i.beginRenderPass({colorAttachments:[{view:this.analysisTex.createView(),loadOp:`clear`,storeOp:`store`}]});a.setPipeline(this.extSource?this.downPipelineExt:this.downPipeline),a.setBindGroup(0,r),a.draw(3),a.end(),i.copyTextureToBuffer({texture:this.analysisTex},{buffer:this.analysisBuf,bytesPerRow:this.analysisBytesPerRow},[e,t]),this.device.queue.submit([i.finish()]),await this.analysisBuf.mapAsync(GPUMapMode.READ);try{let n=new Uint8Array(this.analysisBuf.getMappedRange()),r=new Uint8ClampedArray(e*t*4),i=e*4;for(let e=0;e<t;e++)r.set(n.subarray(e*this.analysisBytesPerRow,e*this.analysisBytesPerRow+i),e*i);return r}finally{this.analysisBuf.unmap()}}finally{this.readbackInFlight=!1}}dispose(){this.source?.destroy();for(let e of this.data)e.destroy();this.uniformBuf.destroy(),this.downParamsBuf.destroy(),this.compBuf.destroy(),this.beforeTex?.destroy(),this.wipeTex?.destroy(),this.analysisTex?.destroy(),this.analysisBuf?.destroy(),this.exportTex?.destroy();for(let e of this.readbackRing)e.buffer.destroy();this.tpRelease(),this.device.destroy()}};10*Math.PI/180,26*Math.PI/180,60*Math.PI/180,110*Math.PI/180,30*Math.PI/180,60*Math.PI/180;var K=4096,Ne=new Float32Array(K+1);for(let e=0;e<=K;e++)Ne[e]=s(e/K);75*Math.PI/180;var Pe=.3,Fe=.15,Ie=.3;function Le(e,t,n,r=Pe,i=Fe){let a=new Float32Array(t*n);for(let o of e){let e=o.x-o.w*r,s=o.x+o.w*(1+r),c=o.y-o.h*r,l=o.y+o.h*(1+r),u=Math.max(.001,o.w*i),d=Math.max(.001,o.h*i);for(let r=0;r<n;r++){let i=(r+.5)/n,o=Math.max(c-i,i-l,0),f=Math.max(0,1-o/d);if(!(f<=0))for(let n=0;n<t;n++){let i=(n+.5)/t,o=Math.max(e-i,i-s,0),c=f*Math.max(0,1-o/u),l=r*t+n;c>a[l]&&(a[l]=c)}}}return a}function Re(e,t,n){let r=n.get(t);return r===void 0?e.window?e.window[1]:e.from:r}function q(e,t,n){let r=e[0];return e.forEach((e,i)=>{n>=Re(e,i,t)&&(r=e)}),r}function ze(e,t,n){return e.some((e,r)=>e.window!==void 0&&!t.has(r)&&n>=e.window[0]&&n<e.window[1])}function Be(e,t,n){e.forEach((e,r)=>{e.window&&!t.has(r)&&n>=e.window[0]&&n<=e.window[1]&&t.set(r,n)})}function J(e,t,n=!1){let r=t.backdropFit??e.backdropFit;return n?{...e,backdropFit:r}:{...e,zLo:t.zLo,zHi:t.zHi,backdropFit:r}}var Ve=.1;function Y(e,t=Ve){return Math.floor(e/t+1e-6)}var X={cMax:.13,achroma:.03,hueMax:75*Math.PI/180,lumMin:.05,texLo:.045,texHi:.25,top:.3,near:.3,fracLo:.06,fracHi:.15,samples:64,neutral:(()=>{let[,e,t]=b(1,1,.94);return[e,t]})(),pinkMax:.006,maxLog:Math.log(1.6),eps:.04,iterations:4,maxStep:.2,tol:.002,water:.6};function He(e,t){if(t[0]===0&&t[1]===0)return e;let n=Math.exp(t[0]),r=Math.exp(t[1]),i=Math.exp(t[0]*X.water),a=Math.exp(t[1]*X.water);return{...e,wb:[e.wb[0]*n,e.wb[1],e.wb[2]*r],waterWb:[e.waterWb[0]*i,e.waterWb[1],e.waterWb[2]*a]}}var Z={calmLo:.1,calmHi:.4,openLo:.05,openHi:.3,window:3,tau:.15},Ue=class{log=[0,0];hist=[];started=!1;reset(){this.log=[0,0],this.hist=[],this.started=!1}update(e,t,n){let r=e?We(e,t):0;if(!e||r<=0)return;this.hist.push([e.log[0],e.log[1]]),this.hist.length>Z.window&&this.hist.shift();let i=[Ke(this.hist.map(e=>e[0])),Ke(this.hist.map(e=>e[1]))];if(!this.started){this.log=i,this.started=!0;return}let a=1-Math.exp(-Math.max(0,n)*r/Z.tau);this.log=[this.log[0]+(i[0]-this.log[0])*a,this.log[1]+(i[1]-this.log[1])*a],r>=.5&&this.log[0]>i[0]&&(this.log[0]=i[0])}rebase(e,t){let n=Math.log(e.wb[0]/t.wb[0]),r=Math.log(e.wb[2]/t.wb[2]),i=e=>Math.max(-X.maxLog,Math.min(X.maxLog,e));this.log=[i(this.log[0]+n),i(this.log[1]+r)],this.hist=this.hist.map(([e,t])=>[e+n,t+r])}apply(e){return He(e,this.log)}};function We(e,t){return Q(X.fracLo,X.fracHi,e.frac)*Ge(t)}function Ge(e){let t=Math.max(e.calm??0,e.calmTone??0),n=Q(Z.openLo,Z.openHi,e.backdrop??0);return(1-Q(Z.calmLo,Z.calmHi,t))*(1-n)*(1-c(e))}function Q(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function Ke(e){let t=[...e].sort((e,t)=>e-t),n=t.length>>1;return t.length%2?t[n]:(t[n-1]+t[n])/2}function $(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function qe(e,t,n=!1){let r=t.width,i=t.height,a=e.width,o=e.height,s=e.data,c=new Float32Array(r*i*4);for(let e=0;e<i;e++){let l=Math.min(o-1,Math.max(0,(e+.5)/i*o-.5)),u=Math.floor(l),d=Math.min(o-1,u+1),f=l-u,p=Math.min(o-1,Math.floor((e+.5)/i*o));for(let i=0;i<r;i++){let o=Math.min(a-1,Math.max(0,(i+.5)/r*a-.5)),l=Math.floor(o),m=Math.min(a-1,l+1),h=o-l,g=Math.min(a-1,Math.floor((i+.5)/r*a)),_=s[(u*a+l)*4+1]+(s[(u*a+m)*4+1]-s[(u*a+l)*4+1])*h,v=s[(d*a+l)*4+1]+(s[(d*a+m)*4+1]-s[(d*a+l)*4+1])*h,y=e*r+i,b=t.exclude?1-t.exclude[y]:1;c[y*4]=s[(p*a+g)*4]*b,c[y*4+1]=(_+(v-_)*f)*b;let x=t.alpha[y];if(n){let e=t.depart?t.depart[y]:0,n=$(O.confLo,O.confHi,t.near[y]),r=O.waterFloor+(1-O.waterFloor)*n*$(O.insideLo,O.insideHi,x)*$(O.departLo,O.departHi,e);x*=r+(1-r)*e}c[y*4+2]=x,c[y*4+3]=t.near[y]}}return{width:r,height:i,data:c}}var Je=70,Ye=.6,Xe=.4,Ze=.7,Qe=.05,$e=.16,et=1,tt=2,nt=16,rt=.95,it=.2,at=.3,ot=Math.cos(15*Math.PI/180),st=.02,ct=3,lt=8,ut=[x,{x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}];function dt(e){return{...e,clahe:{width:e.clahe.bins,height:e.clahe.tilesX*e.clahe.tilesY,data:e.clahe.data}}}var ft=class e{backend;settings={...te};split=0;workerMs={analysis:0,person:0,analyses:0,readback:0,poolWait:0,personWait:0};analysisPoolSize=2;verifyPrecomputed=!1;precomputeStats={hits:0,misses:0,mismatches:0};worker=null;inflight=!1;reqId=0;analysisIntervalMs=70;personEvery=tt;personEnabled=!0;temporalEnabled=!0;followEnabled=!0;follow=new Ue;lastPacketSec=0;reqLock=null;profileThumbs=new Map;keepThumbAt=null;anchorTargets=[];targetsReq=0;lastRenderSec=-1;rawReq=!1;animals=new l;leadBase=null;reqTimeSec=0;strengthOn=!1;seg=null;personWorker=null;personInflight=!1;personReqId=0;personFailed=!1;personCount=0;person=null;personTarget=null;personFull=null;personTiles=null;personRectIdx=0;personRectInflight=x;personBoxes=null;personBoxesAt=-1/0;personPasses=0;personDetectInflight=!1;personDetectWarned=!1;personWaiters=[];lastSlot=NaN;current=_;target=null;fields=null;guide=null;clahe=null;fieldsTarget=null;guideTarget=null;claheTarget=null;lastMean=null;lastTickSec=0;hasAnalysis=!1;dirtyData=!1;stats;locked=null;cutSeen=new Map;pool=[];poolLoad=[];preId=0;preWaiters=new Map;pre=new Map;resolveWaiters=[];rejectWaiters=[];onError;constructor(e,t){this.backend=e,this.onError=t,this.stats={backend:e.kind,analysisMs:0,analyses:0,sceneCuts:0,person:`off`,personMs:0,personCoverage:0,personBoxes:-1,personDetectMs:0},this.fields={width:2,height:2,data:new Float32Array(16)},this.guide={width:2,height:2,data:new Float32Array(16)};let n=new Float32Array(1536*4);for(let e=0;e<48;e++)for(let t=0;t<32;t++)n[(e*32+t)*4]=(t+1)/32;this.clahe={width:32,height:48,data:n},this.pushData()}static async create(t,n,r=!0){let i=null;if(r)try{i=await Me.create(t)}catch(e){console.warn(`WebGPU unavailable, using WebGL2:`,e.message)}return i||=new je(t),new e(i,n)}getStats(){return{...this.stats}}lockGlobals(e){this.locked=e&&e.length>0?[...e].sort((e,t)=>e.from-t.from):null,this.cutSeen.clear(),this.follow.reset(),this.anchorTargets=[],this.targetsReq++,this.locked&&(this.current=this.applyLock(this.current),this.target&&=this.applyLock(this.target),this.requestTargets())}forgetProfile(){this.profileThumbs.clear()}requestTargets(){let e=this.locked;if(!e||!this.followEnabled||this.profileThumbs.size===0)return;let t=e.map((t,n)=>{let r=n===0?-1/0:t.from,i=n+1<e.length?e[n+1].from:1/0,a=[...this.profileThumbs].filter(([e])=>e>=r&&e<i).map(([,e])=>e.slice().buffer);return{lock:t.params,thumbs:a}}),n={kind:`targets`,id:this.targetsReq,width:256,height:144,shots:t};this.ensureWorker().postMessage(n,t.flatMap(e=>e.thumbs))}onTargets(e){e.id===this.targetsReq&&(this.anchorTargets=e.targets,console.info(`[anchor] targets for ${e.targets.length} segment(s): ${e.targets.map(e=>e?`${e[0].toFixed(3)},${e[1].toFixed(3)}`:`none`).join(` | `)}`))}get isLocked(){return this.locked!==null}get lockSegments(){return this.locked?.length??0}lockedParamsAt(e){return this.lockedAt(e)}lockedAt(e){return this.locked?q(this.locked,this.cutSeen,e).params:null}inCutWindow(e){return this.locked?ze(this.locked,this.cutSeen,e):!1}noteSceneCut(e){this.locked&&Be(this.locked,this.cutSeen,e)}lockRange=!1;applyLock(e){let t=this.lockedAt(this.lastTickSec);return t?this.withFollow(J(t,e,this.lockRange)):e}withFollow(e){return this.followEnabled?this.follow.apply(e):e}async analyzeRaw(e=1e4,t,n){let r=new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)});this.inflight&&await r.catch(()=>void 0);let i=new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)});this.keepThumbAt=t??null,await this.startAnalysis({raw:!0,seeds:n});let a=await new Promise((t,n)=>{let r=setTimeout(()=>n(Error(`Frame analysis timed out`)),e);i.then(e=>{clearTimeout(r),t(e)},e=>{clearTimeout(r),n(e)})});return{params:a.params,mean:a.mean,animals:a.animals}}getPersonMap(){return!this.person||!this.fields?null:{width:this.fields.width,height:this.fields.height,data:this.person}}ensureWorker(){if(this.worker)return this.worker;let e=new Worker(new URL(`/video/studio/assets/analysis-worker-DbtqEL7Z.js`,``+import.meta.url),{type:`module`});return e.onmessage=e=>{e.data.kind===`targets`?this.onTargets(e.data):this.onPacket(e.data)},e.onerror=e=>{this.inflight=!1;let t=Error(`Analysis worker failed: `+e.message);this.settle(null,t),this.onError(t)},this.worker=e,e}ensurePersonWorker(){if(this.personWorker)return this.personWorker;let e=new Worker(new URL(`/video/studio/assets/person-worker-PK8s94hj.js`,``+import.meta.url),{type:`module`});return e.onmessage=e=>this.onPersonPacket(e.data),e.onerror=e=>{this.personInflight=!1,this.personFailed=!0,this.stats.person=`failed`,console.warn(`Person segmentation worker failed:`,e.message),this.settlePerson()},this.personWorker=e,this.stats.person=`loading`,e}settlePerson(){let e=this.personWaiters;this.personWaiters=[];for(let t of e)t()}waitPerson(){return this.personInflight?new Promise(e=>this.personWaiters.push(e)):Promise.resolve()}onPersonPacket(e){if(this.personInflight=!1,this.workerMs.person+=e.ms,this.settlePerson(),e.id!==this.personReqId)return;if(this.personDetectInflight){this.personDetectInflight=!1,e.boxes===void 0?(e.error&&!this.personDetectWarned&&console.warn(`Person detector unavailable:`,e.error),this.personDetectWarned=!0,this.personBoxes=[{x:0,y:0,w:1,h:1,score:1}]):this.personBoxes=e.boxes.filter(e=>e.score>=Ie),this.personBoxesAt=this.lastTickSec,this.stats.personBoxes=this.personBoxes.length,this.stats.personDetectMs=e.ms,console.info(`[person] verdict ${this.personBoxes.length} box(es) in ${e.ms.toFixed(0)} ms at t=${this.lastTickSec.toFixed(2)}s`),this.rebuildPerson();return}if(!e.mask){e.error&&!this.personFailed&&console.warn(`Person segmentation unavailable:`,e.error),this.personFailed=!0,this.stats.person=`failed`;return}this.stats.person=`on`,this.stats.personMs=e.ms;let t=this.fields?.width??0,n=this.fields?.height??0;if(t<4||n<4)return;let r=this.personRectInflight;if((!this.personFull||this.personFull.length!==t*n)&&(this.personFull=new Float32Array(t*n),this.personTiles=new Float32Array(t*n)),r===x)this.personFull=pt(e.mask,e.width,e.height,t,n);else{let i=Math.round(r.x*t),a=Math.round(r.y*n),o=Math.round(r.w*t),s=Math.round(r.h*n),c=pt(e.mask,e.width,e.height,o,s);for(let e=0;e<s;e++)for(let n=0;n<o;n++)this.personTiles[(a+e)*t+i+n]=c[e*o+n]}this.rebuildPerson()}rebuildPerson(){let e=this.fields?.width??0,t=this.fields?.height??0;if(e<4||t<4||!this.personFull||!this.personTiles||this.personFull.length!==e*t)return;let n=this.lastTickSec-this.personBoxesAt<=lt,r=this.personBoxes&&n?Le(this.personBoxes,e,t):null,i=new Float32Array(e*t);if(r)for(let e=0;e<i.length;e++)i[e]=Math.max(this.personFull[e],this.personTiles[e])*r[e];let a=mt(i,e,t,this.guide?.data??null,this.fields?.data??null,this.current.veilColor),o=0;for(let e=0;e<a.length;e++)o+=a[e];this.stats.personCoverage=o/a.length;let s=0;if(this.person&&this.person.length===a.length)for(let e=0;e<a.length;e++)s+=this.person[e];!this.person||this.person.length!==a.length||s<1e-6&&o>0?(o>0&&console.info(`[person] mask snapped in at t=${this.lastTickSec.toFixed(2)}s (${(o/a.length*100).toFixed(0)}% coverage)`),this.person=a,this.personTarget=null,this.dirtyData=!0):this.personTarget=a}setPreviewScale(e){this.backend.setPreviewScale(e)}upload(e,t,n,r){this.backend.upload(e,t,n,r)}tick(e,t=!1){let n=Math.max(0,Math.min(.5,e-this.lastTickSec)),r=this.lockedAt(this.lastTickSec);this.lastTickSec=e;let i=this.lockedAt(e);if(r!==i&&i&&r&&this.locked){let t=q(this.locked,this.cutSeen,e);if(!t.window||this.cutSeen.has(this.locked.indexOf(t)))this.current=this.withFollow(J(i,this.current,this.lockRange)),this.target&&=this.withFollow(J(i,this.target,this.lockRange));else{this.follow.rebase(r,i);let e=this.target??this.current;this.target=this.withFollow(J(i,e,this.lockRange))}}this.smooth(n);let a=Y(e,this.slotSec());return!this.inflight&&(t||a!==this.lastSlot)?(this.lastSlot=a,this.startAnalysis(),!0):!1}slotSec(){return Math.max(Ve,this.analysisIntervalMs/1e3)}async analyzeDue(e,t=!1,n=1e4){let r=Y(e,this.slotSec());if(!t&&r===this.lastSlot&&this.hasAnalysis)return;this.lastSlot=r,await this.analyzeNow(t,n,e);let i=performance.now();t||await Promise.race([this.waitPerson(),new Promise(e=>setTimeout(e,n))]),this.workerMs.personWait+=performance.now()-i}analyzeSoon(){this.inflight||this.startAnalysis()}async analyzeNow(e,t=1e4,n){let r=()=>new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)}),i=e=>new Promise((n,r)=>{let i=setTimeout(()=>r(Error(`Frame analysis timed out`)),t);e.then(e=>{clearTimeout(i),n(e)},e=>{clearTimeout(i),r(e)})});this.inflight&&await i(r()).catch(()=>void 0);let a=r();await this.startAnalysis({dueSec:n});let o=await i(a);e&&(await i(this.waitPerson()).catch(()=>void 0),this.personTarget&&=(this.person=this.personTarget,null)),e&&o.id===this.reqId&&this.snapTo(dt(o)),e&&(this.lastSlot=Y(this.lastTickSec,this.slotSec()))}settle(e,t){let n=this.resolveWaiters,r=this.rejectWaiters;if(this.resolveWaiters=[],this.rejectWaiters=[],e)for(let t of n)t(e);else if(t)for(let e of r)e(t)}async startAnalysis(e={}){if(!this.inflight){this.inflight=!0;try{let t=e.dueSec!==void 0&&!e.raw?this.takePrecomputed(e.dueSec):void 0,n=performance.now(),r=t?.rgba??await this.readback(256,144);if(t&&this.verifyPrecomputed){let n=await this.readback(256,144);vt(n,t.rgba)||(this.precomputeStats.mismatches++,console.warn(`[engine] precomputed thumbnail differs at t=${e.dueSec.toFixed(3)}s: using the live one`),r=n,t=void 0)}this.workerMs.readback+=performance.now()-n,this.keepThumbAt!==null&&(this.profileThumbs.set(this.keepThumbAt,r.slice()),this.keepThumbAt=null);let i=this.personEnabled&&!this.personFailed&&!this.personInflight&&this.personCount++%this.personEvery===0,a=i&&this.personPasses++%ct===0,o=a?x:ut[this.personRectIdx%ut.length],s=i?o===x?r.slice():await this.readback(256,144,o):null,{lock:c,target:l}=this.anchorAt(this.lastTickSec);this.reqLock=c;let u=e.seeds??(this.settings.subjectPop&&!e.raw?this.animals.seeds(this.lastTickSec):[]),d=performance.now(),f=t&&t.lock===c&&t.target===l&&!u.length?await Promise.race([t.packet,new Promise(e=>setTimeout(()=>e(null),1e4))]):null;this.workerMs.poolWait+=performance.now()-d,e.dueSec!==void 0&&this.pool.length>0&&this.precomputeStats[f?`hits`:`misses`]++,this.rawReq=!!e.raw;let p={id:++this.reqId,rgba:r.buffer,width:256,height:144,...c&&l?{lock:c,target:l}:{},...u.length?{seeds:u}:{}};if(this.reqTimeSec=this.lastTickSec,f){let e=p.id;queueMicrotask(()=>this.onPacket({...f,id:e}))}else this.ensureWorker().postMessage(p,[p.rgba]);if(s){a||this.personRectIdx++;let e={id:++this.personReqId,rgba:s.buffer,width:256,height:144,timestampMs:Math.round(this.lastTickSec*1e3),detect:a};this.personInflight=!0,this.personDetectInflight=a,this.personRectInflight=o,this.ensurePersonWorker().postMessage(e,[e.rgba])}}catch(e){this.inflight=!1;let t=e instanceof Error?e:Error(String(e));this.settle(null,t),/timed out/i.test(t.message)?console.warn(`Analysis skipped:`,t.message):this.onError(t)}}}onPacket(e){if(this.inflight=!1,e.id!==this.reqId)return;let t=dt(e);this.stats.analyses++,this.stats.analysisMs=t.ms,this.workerMs.analysis+=t.ms,this.workerMs.analyses++;let n=this.lastMean!==null&&_t(this.lastMean,t.mean)>.16;this.lastMean=t.mean,this.rawReq||(n&&this.animals.reset(),this.settings.subjectPop&&(t.params.backdrop??0)>0&&e.animals?this.animals.update(e.animals,this.reqTimeSec,t.fields.data,t.guide.data):this.animals.fadeAll()),this.leadBase={fields:t.fields,guide:t.guide};let r=Math.abs(this.lastTickSec-this.lastPacketSec)>et;(!this.hasAnalysis||n||r)&&this.follow.reset(),n&&this.noteSceneCut(this.lastTickSec);let i=this.lockedAt(this.lastTickSec);if(i&&this.followEnabled){let a=e.anchor??null,o=this.reqLock;a&&o&&o!==i&&(a={...a,log:[a.log[0]+Math.log(o.wb[0]/i.wb[0]),a.log[1]+Math.log(o.wb[2]/i.wb[2])]}),this.follow.update(a,t.params,this.hasAnalysis&&!n&&!r?this.lastTickSec-this.lastPacketSec:0)}this.lastPacketSec=this.lastTickSec,!this.hasAnalysis||n?(n&&(this.stats.sceneCuts++,this.backend.resetTemporal?.(),this.personBoxes=null,this.personPasses=0,this.personFull?.fill(0),this.personTiles?.fill(0),this.stats.personBoxes=-1),this.snapTo(t)):(this.target=this.applyLock(t.params),this.fieldsTarget=t.fields,this.guideTarget=t.guide,this.claheTarget=t.clahe),this.settle(e,null)}snapTo(e){this.animals.snap(),this.current=this.applyLock(e.params),this.target=this.current,this.fields=e.fields,this.guide=e.guide,this.clahe=e.clahe,this.fieldsTarget=null,this.guideTarget=null,this.claheTarget=null,this.hasAnalysis=!0,this.dirtyData=!0}smooth(e){if(e<=0)return;if(this.target){let t=1-Math.exp(-e/Ye),n=this.current.backdropFit;this.current=ne(this.current,this.target,t);let r=this.target.backdropFit;if(this.settings.subjectPop&&n&&r&&n.length===r.length){let t=1-Math.exp(-e/Qe);this.current={...this.current,backdropFit:n.map((e,n)=>e+(r[n]-e)*t)}}}let t=1-Math.exp(-e/Xe),n=1-Math.exp(-e/Ze),r=(e,n,r=t,i=r)=>{if(!n)return e;if(!e||e.width!==n.width||e.height!==n.height||e.data.length!==n.data.length)return n;let a=e===this.lastEased.get(n)?e:{...e,data:new Float32Array(e.data)};return i===r?ht(a.data,n.data,r):gt(a.data,n.data,r,i),this.lastEased.set(n,a),a},i=Math.min(1,Math.max(0,this.current.backdrop??0)),a=t+(1-Math.exp(-e/Qe)-t)*i;this.settings.subjectPop&&(this.animals.step(e),this.leadAnimals());let o=r(this.fields,this.fieldsTarget,t,a),s=r(this.guide,this.guideTarget,this.settings.subjectPop?a:t),c=r(this.clahe,this.claheTarget,n);(o!==this.fields||s!==this.guide||c!==this.clahe)&&(this.dirtyData=!0),this.person&&this.personTarget&&this.personTarget.length===this.person.length&&(ht(this.person,this.personTarget,t),this.dirtyData=!0),this.fields=o,this.guide=s,this.clahe=c}lastEased=new WeakMap;guideMerged=null;pushData(){if(!this.fields||!this.guide||!this.clahe)return;this.backend.setData(0,this.fields),this.backend.setData(1,this.clahe);let e=this.guide;if(this.person&&this.person.length*4===e.data.length){let t=this.guideMerged&&this.guideMerged.length===e.data.length?this.guideMerged:new Float32Array(e.data.length);t.set(e.data);let n=1-d(this.current);for(let e=0;e<this.person.length;e++)t[e*4+3]=this.person[e]*n;this.guideMerged=t,this.backend.setData(2,{width:e.width,height:e.height,data:t})}else this.backend.setData(2,e);if(this.settings.subjectPop){let e=this.animals.strength(this.lastTickSec);this.backend.setData(3,this.seg?qe(e,this.seg,(this.current.backdrop??0)<=0):e),this.strengthOn=!0}else this.strengthOn&&=(this.backend.setData(3,{width:1,height:1,data:new Float32Array(4)}),!1);this.dirtyData=!1}leadAnimals(){let e=this.leadBase;if(!e||!this.hasAnalysis)return;let t=this.current.backdropFit,n=e.fields.width,r=e.fields.height,i=this.animals.lead(e.fields.data,e.guide.data,this.lastTickSec,(e,i)=>{if(!t||t.length!==18)return[0,0,0];let a=(e+.5)/n-.5,o=(i+.5)/r-.5,s=e=>t[e]+t[e+1]*a+t[e+2]*o+t[e+3]*a*a+t[e+4]*a*o+t[e+5]*o*o;return y(s(0),s(6),s(12))});this.fieldsTarget=i?{...e.fields,data:i.fields}:e.fields,this.guideTarget=i?{...e.guide,data:i.guide}:e.guide,this.animals.count&&(this.dirtyData=!0)}setSubjectOverrides(e){this.animals.setOverrides(e),this.dirtyData=!0}stepSubjects(e){return this.animals.step(e),this.dirtyData=!0,this.animals.easing}setTime(e){this.lastTickSec=e,this.checkJump()}checkJump(){let e=this.lastTickSec;this.lastRenderSec>=0&&(e<this.lastRenderSec-.001||e-this.lastRenderSec>.3)&&(this.backend.resetTemporal?.(),this.animals.reset()),this.lastRenderSec=e}setSegOverlay(e){e!==this.seg&&(this.seg=e,this.dirtyData=!0)}async readUpright(e,t){return this.readback(e,t)}readbackChain=Promise.resolve();readback(e,t,n){let r=this.readbackChain.then(()=>this.backend.analyze(e,t,n));return this.readbackChain=r.catch(()=>void 0),r}personBoxesNow(){return this.personBoxes??[]}openWater(){return(this.target?.backdrop??this.current.backdrop??0)>0}subjectSelection(){return this.settings.subjectPop?this.animals.selection(this.lastTickSec):null}reset(e={}){let t=e.keepPerson?this.personBoxes:null;this.clearPrecomputed(),this.reqId++,this.inflight=!1,this.hasAnalysis=!1,this.target=null,this.fieldsTarget=null,this.guideTarget=null,this.claheTarget=null,this.current=_,this.lastMean=null,this.lastSlot=NaN,this.lastTickSec=0,this.cutSeen.clear(),this.follow.reset(),this.lastPacketSec=0,this.settle({id:-1},null),this.personReqId++,this.personInflight=!1,this.person=null,this.personTarget=null,this.personFull=null,this.personTiles=null,this.personRectIdx=0,this.personCount=0,this.personBoxes=t,this.personBoxesAt=t?0:-1/0,this.personPasses=+!!t,this.personDetectInflight=!1,this.stats.personCoverage=0,this.stats.personBoxes=t?t.length:-1,this.settlePerson(),this.lastRenderSec=-1,this.backend.resetTemporal?.(),this.animals.reset(),this.leadBase=null}pack(){let e={width:this.fields.width,height:this.fields.height,fields:new Float32Array,guide:new Float32Array},t={tilesX:8,tilesY:6,bins:32,data:new Float32Array},n=this.hasAnalysis?this.settings:{...this.settings,intensity:0},r=p(this.current,n,e,t,0,this.split);return r[93]=+!!this.temporalEnabled,this.checkJump(),r}render(e=0){this.dirtyData&&this.pushData();let t=this.pack();t[0]=e,this.backend.setUniforms(t),this.backend.render()}recomposite(e){return this.split=e,this.backend.recomposite?.(e)??!1}setBefore(e,t,n){this.backend.setBefore?.(e,t,n)}analysisSlotAt(e){return Y(e,this.slotSec())}inAnyCutWindow(e){return!!this.locked?.some(t=>t.window!==void 0&&e>=t.window[0]&&e<t.window[1])}async precompute(e,t){if(this.pre.has(e))return;let n=performance.now(),r=await this.readback(256,144);this.workerMs.readback+=performance.now()-n;let{lock:i,target:a}=this.anchorAt(t),o=this.poolWorker(),s=++this.preId,c=r.slice();if(this.poolLoad[o]===1/0){this.pre.set(e,{rgba:r,lock:i,target:a,packet:Promise.resolve(null)});return}let l=new Promise(e=>this.preWaiters.set(s,{resolve:e,worker:o}));this.poolLoad[o]++;let u={id:s,rgba:c.buffer,width:256,height:144,...i&&a?{lock:i,target:a}:{}};this.pool[o].postMessage(u,[u.rgba]),this.pre.set(e,{rgba:r,lock:i,target:a,packet:l})}anchorAt(e){let t=this.followEnabled&&this.locked?q(this.locked,this.cutSeen,e):null,n=t?this.anchorTargets[this.locked.indexOf(t)]??null:null;return n?{lock:t.params,target:n}:{lock:null,target:null}}dropPrecomputedBefore(e){for(let t of this.pre.keys())t<e&&this.pre.delete(t)}clearPrecomputed(e=!1){this.pre.clear();for(let{resolve:e}of this.preWaiters.values())e(null);if(this.preWaiters.clear(),e){for(let e of this.pool)e.terminate();this.pool=[],this.poolLoad=[]}}takePrecomputed(e){let t=this.pre.get(e);return t&&this.pre.delete(e),t}poolWorker(){let e=Math.max(1,this.analysisPoolSize);for(;this.pool.length<e;){let e=this.pool.length,t=new Worker(new URL(`/video/studio/assets/analysis-worker-DbtqEL7Z.js`,``+import.meta.url),{type:`module`});t.onmessage=t=>{let n=t.data,r=this.preWaiters.get(n.id);this.poolLoad[e]=Math.max(0,this.poolLoad[e]-1),r&&(this.preWaiters.delete(n.id),r.resolve(n))},t.onerror=t=>{console.warn(`Analysis pool worker failed:`,t.message);for(let[t,n]of this.preWaiters)n.worker===e&&(n.resolve(null),this.preWaiters.delete(t));this.poolLoad[e]=1/0},this.pool.push(t),this.poolLoad.push(0)}let t=0;for(let e=1;e<this.pool.length;e++)this.poolLoad[e]<this.poolLoad[t]&&(t=e);return t}async exportReady(){await this.backend.readbackSlotFree?.()}async renderToFrame(e,t,n){this.dirtyData&&this.pushData();let r=this.pack();return r[0]=e,r[1]=0,this.backend.setUniforms(r),this.backend.renderToFrame(t,n)}dispose(){this.clearPrecomputed(!0),this.worker?.terminate(),this.worker=null,this.personWorker?.terminate(),this.personWorker=null,this.backend.dispose()}};function pt(e,t,n,r,i){let a=new Float32Array(r*i);for(let o=0;o<i;o++){let s=Math.floor(o*n/i),c=Math.max(s+1,Math.floor((o+1)*n/i));for(let n=0;n<r;n++){let i=Math.floor(n*t/r),l=Math.max(i+1,Math.floor((n+1)*t/r)),u=0,d=0;for(let n=s;n<c;n++)for(let r=i;r<l;r++)u+=e[n*t+r],d++;a[o*r+n]=Math.min(1,Math.max(0,u/d))}}return a}function mt(e,t,n,r,i,a){let o=new Float32Array(e),[,s,c]=b(a[0],a[1],a[2]),l=Math.hypot(s,c)||1,u=new Uint8Array(t*n);for(let e=0;e<t*n;e++){let t=r&&r.length>=e*4+3?.2126*r[e*4]+.7152*r[e*4+1]+.0722*r[e*4+2]:1,n=i&&i.length>=e*4+2?i[e*4+1]:1,a=!1;if(r&&r.length>=e*4+3){let[,t,n]=b(r[e*4],r[e*4+1],r[e*4+2]),i=Math.hypot(t,n);a=i>st&&(t*s+n*c)/(i*l)>ot}u[e]=+(t>it&&n>at&&!a);let d=o[e],f=Math.min(1,Math.max(0,(d-.45)/.3));o[e]=a&&t>it?0:f*f*(3-2*f)}let d=o;for(let e=0;e<nt;e++){let e=new Float32Array(d);for(let r=0;r<n;r++)for(let i=0;i<t;i++){let a=r*t+i;if(!u[a])continue;let o=0;for(let e=-1;e<=1;e++){let a=r+e;if(!(a<0||a>=n))for(let e=-1;e<=1;e++){let n=i+e;n<0||n>=t||(o=Math.max(o,d[a*t+n]))}}e[a]=Math.max(d[a],rt*o)}d=e}return d}function ht(e,t,n){for(let r=0;r<e.length;r++)e[r]+=(t[r]-e[r])*n}function gt(e,t,n,r){for(let i=0;i<e.length;i++)e[i]+=(t[i]-e[i])*((i&3)==1?r:n)}function _t(e,t){return Math.abs(e[0]-t[0])+Math.abs(e[1]-t[1])+Math.abs(e[2]-t[2])}function vt(e,t){if(e.length!==t.length)return!1;for(let n=0;n<e.length;n++)if(e[n]!==t[n])return!1;return!0}function yt(e){if(!Number.isFinite(e)||e<.5)return[];let t=Math.min(12,Math.max(4,Math.round(e)));return Array.from({length:t},(n,r)=>Math.min(e-.05,.15+(e-.3)*(r+.5)/t))}function bt(e,t){if(e.length<3)return null;let n=[{from:0,items:[e[0]]}];for(let r=1;r<e.length;r++){let i=e[r-1].mean,a=e[r].mean,o=Math.abs(i[0]-a[0])+Math.abs(i[1]-a[1])+Math.abs(i[2]-a[2]),s=e[r-1].params.wb,c=e[r].params.wb,l=Math.max(Math.abs(Math.log(s[0]/c[0])),Math.abs(Math.log(s[2]/c[2])));(o>2*t||o>t&&l>.2)&&n.push({from:(e[r-1].t+e[r].t)/2,window:[e[r-1].t,e[r].t],items:[]}),n[n.length-1].items.push(e[r])}for(let e=n.length-1;e>0;e--)n[e].items.length<2&&(n[e-1].items.push(...n[e].items),n.splice(e,1));return n.map(e=>({from:e.from,window:e.window,params:f(e.items.map(e=>e.params))}))}export{Je as ANALYSIS_INTERVAL_MS,ft as GradeEngine,$e as SCENE_CUT_MEAN_DIFF,f as medianParams,yt as profileTimes,bt as segmentProfile};