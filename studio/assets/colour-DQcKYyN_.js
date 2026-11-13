import{$ as e,A as t,At as n,B as r,C as i,Ct as a,D as o,Dt as s,E as c,Et as l,F as u,Ft as d,G as f,H as p,Ht as m,I as h,It as g,J as _,K as v,L as y,Lt as b,M as x,Mt as S,N as C,Nt as w,O as T,Ot as E,P as D,Pt as O,Q as k,R as ee,Rt as te,S as ne,St as re,T as ie,Tt as ae,U as oe,V as A,Vt as se,W as ce,X as le,Y as ue,Z as de,_ as fe,_t as j,at as pe,b as me,bt as he,ct as ge,dt as _e,et as ve,ft as ye,gt as M,ht as be,it as xe,j as N,jt as Se,k as Ce,kt as we,lt as Te,mt as Ee,nt as De,ot as Oe,pt as ke,q as Ae,rt as je,st as Me,tt as Ne,ut as Pe,v as Fe,vt as Ie,w as Le,wt as Re,x as P,xt as ze,y as Be,yt as Ve,z as He,zt as Ue}from"./index-C0o3VPHP.js";var F={devLo:.035,devHi:.085,vetoLo:.015,vetoHi:.1,vetoDark:.9,subjLo:.02,subjHi:.05,coreIn:.85,coreLo:.012,coreHi:.03,holdLo:.004,holdHi:.01,abWeight:1.5,darkWeight:.4,inlierLo:.6,inlierHi:.8,rmsLo:.02,rmsHi:.04,inlierK:2.5,edgeLo:.006,edgeHi:.014,edgeRadius:10,ringR:2,seedR:2,closeR:4,schoolN:3,farShareLo:.15,farShareHi:.3,solidDev:.8,relKeep:.3,solidLo:.2,solidHi:.26,bottomLo:.04,bottomHi:.08,farMargin:2,seedFrac:.5,growDev:.06,minArea:.008,lightDL:.03,lightShareLo:.12,lightShareHi:.25,growEdgeLo:.08,growEdgeHi:.16,bubbleTexLo:.015,bubbleTexHi:.019,bubbleCrLo:.84,bubbleCrHi:.88,bubbleDLLo:.025,bubbleDLHi:.04,bubbleTallLo:.9,bubbleTallHi:1.1,blueLo:1.3,blueHi:1.7,step:4,iterations:3},We=6;function Ge(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}var Ke=F.abWeight*F.abWeight;function qe(e,t,n,r,i,a,o=F.vetoLo,s=F.vetoHi){return Ge(o,s,Je(e,t,n,r,i,a))}function Je(e,t,n,r,i,a){let o=r-.5,s=i-.5,c=e=>a[e]+a[e+1]*o+a[e+2]*s+a[e+3]*o*o+a[e+4]*o*s+a[e+5]*s*s,l=e-c(0),u=l>0?l:l*F.vetoDark,d=t-c(We),f=n-c(2*We);return Math.sqrt(u*u+Ke*(d*d+f*f))}var I={popLo:.2,popHi:.6,alphaR:6,rampIn:2.5,trustLo:2,trustHi:4.5,evLo:.025,evHi:.07,evFar:.4,rampEv:1,thinLevels:4,jbuK:.5,jbuNoise:.02,jbuLo:.46,jbuHi:.72};function Ye(e,t,n){let r=Math.min(n,...t),i=Math.max(n,...t),a=1/Math.max(I.jbuNoise,I.jbuK*(i-r));return e.map((e,r)=>e*Math.exp(-(((t[r]-n)*a)**2)))}var Xe=`
const float CONF_BRIGHT_LO = ${Fe.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${Fe.hi.toFixed(4)};
const float PERSON_LUM_LO = ${Ce.lo.toFixed(4)};
const float PERSON_LUM_HI = ${Ce.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${me.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${me.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${i.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${i.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${i.farKeep.toFixed(4)};
const float VIVID_C_LO = ${He.cLo.toFixed(4)};
const float VIVID_C_HI = ${He.cHi.toFixed(4)};
const float VIVID_KEEP = ${He.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${we.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${E.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${s.toFixed(4)};
const float LOOK_GAMMA = ${c.gamma.toFixed(4)};
const float LOOK_WATER_DIM = ${c.waterDim.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${c.hazeChroma.toFixed(4)};
const float LOOK_OBJ_CHROMA = ${c.objChroma.toFixed(4)};
const float LOOK_WARM_HAZE = ${c.warmHaze.toFixed(4)};
const float LOOK_DARK_HAZE = ${c.darkHaze.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${c.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${c.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${c.neutralHi.toFixed(4)};
const float LOOK_NEUTRAL_L_LO = ${c.neutralLLo.toFixed(4)};
const float LOOK_NEUTRAL_L_HI = ${c.neutralLHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${c.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${c.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${c.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${c.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${c.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${c.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${c.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${c.darkHi.toFixed(4)};
const float LOOK_FAR_LO = ${c.farLo.toFixed(6)};
const float LOOK_FAR_HI = ${c.farHi.toFixed(6)};
const float LOOK_FAR_KEEP = ${c.farKeep.toFixed(4)};
const float LOOK_BRIGHT_LO = ${c.brightLo.toFixed(4)};
const float LOOK_BRIGHT_HI = ${c.brightHi.toFixed(4)};
const float LOOK_KEEP_LO = ${c.keepLo.toFixed(4)};
const float LOOK_KEEP_HI = ${c.keepHi.toFixed(4)};
const float LOOK_C0 = ${c.c0.toFixed(4)};
const float LOOK_C1 = ${c.c1.toFixed(4)};
const float LOOK_MIX = ${c.mix.toFixed(4)};
const float SKIN_HUE = ${C.hue.toFixed(6)};
const float SKIN_BAND_HUE = ${C.bandHue.toFixed(6)};
const float SKIN_BAND_IN = ${C.bandIn.toFixed(6)};
const float SKIN_BAND_OUT = ${C.bandOut.toFixed(6)};
const float SKIN_ACHROMA = ${C.achroma.toFixed(4)};
const float SKIN_L_LO = ${C.lLo.toFixed(4)};
const float SKIN_L_HI = ${C.lHi.toFixed(4)};
const float SKIN_C_LO = ${C.cLo.toFixed(4)};
const float SKIN_C_HI = ${C.cHi.toFixed(4)};
const float SKIN_MIX = ${C.mix.toFixed(4)};
const float SKIN_W_LO = ${C.wLo.toFixed(4)};
const float SKIN_W_HI = ${C.wHi.toFixed(4)};
const float SKIN_C_MIN = ${C.cMin.toFixed(4)};
const float DG_K = ${P.k.toFixed(4)};
const float DG_EPS = ${P.eps.toFixed(5)};
const float DG_R_MIN = ${P.rMin.toFixed(4)};
const float DG_R_MAX = ${P.rMax.toFixed(4)};
const float ON_COS = ${Math.cos(T.hue).toFixed(6)};
const float ON_SIN = ${Math.sin(T.hue).toFixed(6)};
const float ON_COS_OUT = ${Math.cos(T.bandOut).toFixed(6)};
const float ON_COS_IN = ${Math.cos(T.bandIn).toFixed(6)};
const float ON_R_LO = ${T.rLo.toFixed(4)};
const float ON_R_HI = ${T.rHi.toFixed(4)};
const float ON_L_LO = ${T.lLo.toFixed(4)};
const float ON_L_HI = ${T.lHi.toFixed(4)};
const float ON_MIX = ${T.mix.toFixed(4)};
const float ON_FAR_LO = ${T.farLo.toFixed(6)};
const float ON_FAR_HI = ${T.farHi.toFixed(6)};
const float ON_LIFT = ${T.lift.toFixed(4)};
const float ON_SILVER = ${T.silver.toFixed(4)};
const float SC_K = ${D.k.toFixed(4)};
const float SC_CMAX = ${D.cMax.toFixed(4)};
const float SC_DESAT = ${D.desat.toFixed(4)};
const float SC_EDGE = ${D.edgeFloor.toFixed(4)};
const float SP_VIVID = ${u.vividKeep.toFixed(4)};
const float SP_CLARITY = ${u.clarity.toFixed(4)};
const float SP_LIFT = ${u.lift.toFixed(4)};
const float WP_HUE = ${A.hue.toFixed(4)};
const float SB_HUE = ${N.hue.toFixed(4)};
const float SB_CHROMA = ${N.chroma.toFixed(4)};
const float SB_KEEP = ${N.keep.toFixed(4)};
const float SB_LIFT = ${N.lift.toFixed(4)};
const float SB_GRID = ${N.grid.toFixed(1)};
const float SB_W_LO = ${N.wLo.toFixed(4)};
const float SB_W_HI = ${N.wHi.toFixed(4)};
const float SB_Y0 = ${N.y0.toFixed(4)};
const float SB_Y1 = ${N.y1.toFixed(4)};
const float WP_CMIN = ${A.cMin.toFixed(4)};
const float WP_CMAX = ${A.cMax.toFixed(4)};
const float WP_KEEP = ${A.keep.toFixed(4)};
const float WP_LLO = ${A.lLo.toFixed(4)};
const float WP_LHI = ${A.lHi.toFixed(4)};
const float WP_WLO = ${A.wLo.toFixed(4)};
const float WP_WHI = ${A.wHi.toFixed(4)};
const float WP_SIDE = ${A.side.toFixed(4)};
const float WP_CAST_LO = ${A.castLo.toFixed(4)};
const float WP_CAST_HI = ${A.castHi.toFixed(4)};
const float SP_CHROMA = ${u.chromaFollow.toFixed(4)};
const float SP_ENGINE = ${u.engineKeep.toFixed(4)};
const float SP_KEEP_LO = ${u.keepDarkLo.toFixed(4)};
const float SP_KEEP_HI = ${u.keepDarkHi.toFixed(4)};
const float SP_CHROMA_DARK = ${u.chromaFollowDark.toFixed(4)};
const float SP_DARK_LO = ${u.darkLo.toFixed(4)};
const float SP_DARK_HI = ${u.darkHi.toFixed(4)};
const float SP_HUE_COS = ${Math.cos(u.hueMax).toFixed(6)};
const float SP_HUE_SIN = ${Math.sin(u.hueMax).toFixed(6)};
const float BD_VETO_LO = ${F.vetoLo.toFixed(4)};
const float BD_VETO_HI = ${F.vetoHi.toFixed(4)};
const float BD_RING_R = ${F.ringR.toFixed(1)};
const float BD_CORE_IN = ${F.coreIn.toFixed(4)};
const float BD_CORE_LO = ${F.coreLo.toFixed(4)};
const float BD_CORE_HI = ${F.coreHi.toFixed(4)};
const float BD_HOLD_LO = ${F.holdLo.toFixed(4)};
const float BD_HOLD_HI = ${F.holdHi.toFixed(4)};
const float BD_SUBJ_LO = ${F.subjLo.toFixed(4)};
const float BD_SUBJ_HI = ${F.subjHi.toFixed(4)};
const float BD_DARK = ${F.vetoDark.toFixed(4)};
const float BD_AB2 = ${(F.abWeight*F.abWeight).toFixed(4)};
const float ON_CONF_LO = ${T.confLo.toFixed(4)};
const float ON_CONF_HI = ${T.confHi.toFixed(4)};
const float SEG_POP_LO = ${I.popLo.toFixed(4)};
const float SEG_POP_HI = ${I.popHi.toFixed(4)};
const float SEG_ALPHA_R = ${I.alphaR.toFixed(4)};
const float SEG_RAMP_IN = ${I.rampIn.toFixed(4)};
const float SEG_TRUST_LO = ${I.trustLo.toFixed(4)};
const float SEG_TRUST_HI = ${I.trustHi.toFixed(4)};
const float SEG_EV_LO = ${I.evLo.toFixed(4)};
const float SEG_EV_HI = ${I.evHi.toFixed(4)};
const float SEG_EV_FAR = ${I.evFar.toFixed(4)};
const float SEG_RAMP_EV = ${I.rampEv.toFixed(4)};
const float SEG_THIN_LEVELS = ${I.thinLevels.toFixed(4)};
const float SEG_JBU_K = ${I.jbuK.toFixed(4)};
const float SEG_JBU_NOISE = ${I.jbuNoise.toFixed(4)};
const float SEG_JBU_LO = ${I.jbuLo.toFixed(4)};
const float SEG_JBU_HI = ${I.jbuHi.toFixed(4)};
const float SR_DARK_LO = ${x.darkLo.toFixed(4)};
const float SR_DARK_HI = ${x.darkHi.toFixed(4)};
const float SR_POP_GATE = ${x.popGate.toFixed(4)};
const float SR_CAST = ${x.cast.toFixed(4)};
const float SR_CAST_MAX = ${x.castMax.toFixed(4)};
const float SR_COS = ${Math.cos(x.hue).toFixed(6)};
const float SR_SIN = ${Math.sin(x.hue).toFixed(6)};
const float SR_WARM = ${x.warm.toFixed(4)};
const float SR_WARM_SHARE = ${x.warmShare.toFixed(4)};
const float SR_FAR_KEEP = ${x.farKeep.toFixed(4)};
const float SR_EDGE = ${x.edge.toFixed(4)};
const float SEG_PACK = ${x.pack.toFixed(4)};
const float SEG_LEVELS = ${x.levels.toFixed(4)};
const float SR_LIT_LO = ${x.litLo.toFixed(4)};
const float SR_LIT_HI = ${x.litHi.toFixed(4)};
const float SR_HI_LO = ${x.hiLo.toFixed(4)};
const float SR_HI_HI = ${x.hiHi.toFixed(4)};
const float SR_DETAIL = ${x.detail.toFixed(4)};
const float SR_R_MIN = ${x.rMin.toFixed(4)};
const float SR_R_MAX = ${x.rMax.toFixed(4)};
const float SR_LIFT = ${x.lift.toFixed(4)};
const float SR_X_WARM = ${x.boostWarm.toFixed(4)};
const float SR_X_WARM_SHARE = ${x.boostWarmShare.toFixed(4)};
const float SR_X_DETAIL = ${x.boostDetail.toFixed(4)};
const float SR_X_LIFT = ${x.boostLift.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(T.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(T.warmHue).toFixed(6)};
const float ON_WARM_LO = ${T.warmLo.toFixed(4)};
const float ON_WARM_HI = ${T.warmHi.toFixed(4)};
${Object.entries(r).map(([e,t])=>`const float VL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(fe).map(([e,t])=>`const float BW_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(t).map(([e,t])=>`const float RL_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
${Object.entries(Le).map(([e,t])=>`const float HP_${e.replace(/[A-Z]/g,e=>`_`+e).toUpperCase()} = ${t.toFixed(6)};`).join(`
`)}
`,L=Xe.replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),R=`${Xe}
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
// resembles the pixel (content moved since the map was made). gsOut is
// guideSmooth(uv, c) (red.ts): the same four guide texels with the same
// weights, so it comes out of this loop instead of fetching them again.
vec4 sampleFields(vec2 uv, vec3 c, out float kOut, out float personOut, out vec3 gsOut) {
  ivec2 size = textureSize(u_data0, 0);
  vec2 f = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size) - 1.0);
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, size - 1);
  vec2 t = f - vec2(i0);
  float cn = length(c) + 0.02;
  vec4 sum = vec4(0.0), bil = vec4(0.0);
  vec3 sg = vec3(0.0);
  float sw = 0.0, sp = 0.0, bp = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 ij = ivec2(k == 1 || k == 3 ? i1.x : i0.x, k >= 2 ? i1.y : i0.y);
    float ws = (k == 1 || k == 3 ? t.x : 1.0 - t.x) * (k >= 2 ? t.y : 1.0 - t.y);
    vec4 fld = texelFetch(u_data0, ij, 0);
    vec4 gd = texelFetch(u_data2, ij, 0);
    vec3 g = gd.xyz;
    float diff = length(c - g) / (cn + length(g));
    float wr = exp(-(diff * diff) / (2.0 * JBU_SIGMA * JBU_SIGMA));
    float wsr = ws * wr;
    sum += wsr * fld;
    sg += wsr * g;
    sw += wsr;
    bil += ws * fld;
    sp += ws * wr * gd.w;
    bp += ws * gd.w;
  }
  kOut = min(1.0, sw / 0.08);
  gsOut = sw < 1e-6 ? c : mix(c, sg / sw, min(1.0, sw / 0.08));
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
// Blue water style (see BLUE_WATER in params.ts; mirrors apply.ts blueLook). Returns (L, a, b, chroma floor).
vec4 blueLook(vec3 lab, float v, float g) {
  if (v <= 0.0) return vec4(lab, 0.0);
  float C0 = length(lab.yz);
  float h = atan(lab.z, lab.y);
  float hh = h < 0.0 ? h + 6.2831853 : h;
  float warm = smoothstepf(BW_WARM_IN0, BW_WARM_IN1, hh) * (1.0 - smoothstepf(BW_WARM_OUT0, BW_WARM_OUT1, hh)) * smoothstepf(BW_WARM_C_LO, BW_WARM_C_HI, C0) * smoothstepf(BW_WARM_L_LO, BW_WARM_L_HI, lab.x) * v;
  float hw = hh + (BW_WARM_HUE - hh) * BW_WARM_PULL * warm;
  float Cw = max(C0, min(C0 * (1.0 + BW_WARM_GAIN * warm), BW_WARM_C_MAX));
  vec2 ab = Cw * vec2(cos(hw), sin(hw));
  float s = dot(lab.yz, vec2(cos(BW_WARM_DIR), sin(BW_WARM_DIR)));
  float cool = 1.0 - smoothstepf(BW_S_LO, BW_S_HI, s);
  float vio = smoothstepf(BW_VC_LO, BW_VC_HI, C0) * smoothstepf(BW_VIO0, BW_VIO1, hh) * (1.0 - smoothstepf(BW_VIO2, 6.2831853, hh));
  float neutral = smoothstepf(BW_NEUTRAL_L_LO, BW_NEUTRAL_L_HI, lab.x) * (1.0 - smoothstepf(BW_NEUTRAL_C_LO, BW_NEUTRAL_C_HI, C0));
  float ct = min(BW_C_MAX, BW_C_K * lab.x) * (1.0 - BW_HI_DROP * smoothstepf(BW_HI_LO, BW_HI_HI, lab.x));
  float veg = smoothstepf(BW_VEG_C_LO, BW_VEG_C_HI, C0) * smoothstepf(BW_VEG_IN0, BW_VEG_IN1, hh) * (1.0 - smoothstepf(BW_VEG_OUT0, BW_VEG_OUT1, hh)) * (1.0 - BW_VEG_GREEN * g);
  float w = BW_MIX * cool * (1.0 - vio) * (1.0 - veg) * (1.0 - neutral) * v;
  ab += (ct * vec2(cos(BW_TARGET), sin(BW_TARGET)) - ab) * w;
  ab *= 1.0 - BW_NEUTRAL_K * neutral * cool * v;
  float L2 = lab.x * (1.0 - BW_SHADOW_K * v * (1.0 - smoothstepf(0.0, BW_SHADOW_HI, lab.x)));
  return vec4(L2, ab, max(ct * w, Cw * warm));
}
// "Water colour" (see WATER_TINT in params.ts; mirrors apply.ts waterTint): the water's hue turned by t radians. Returns (a, b).
vec2 waterTint(vec2 ab, float t, float g) {
  if (t == 0.0) return ab;
  float C = length(ab);
  float h = atan(ab.y, ab.x);
  float hh = h < 0.0 ? h + 6.2831853 : h;
  float cool = 1.0 - smoothstepf(BW_S_LO, BW_S_HI, dot(ab, vec2(cos(BW_WARM_DIR), sin(BW_WARM_DIR))));
  float vio = smoothstepf(BW_VC_LO, BW_VC_HI, C) * smoothstepf(BW_VIO0, BW_VIO1, hh) * (1.0 - smoothstepf(BW_VIO2, 6.2831853, hh));
  float veg = smoothstepf(BW_VEG_C_LO, BW_VEG_C_HI, C) * smoothstepf(BW_VEG_IN0, BW_VEG_IN1, hh) * (1.0 - smoothstepf(BW_VEG_OUT0, BW_VEG_OUT1, hh)) * (1.0 - BW_VEG_GREEN * g);
  float ang = t * cool * (1.0 - vio) * (1.0 - veg);
  float cs = cos(ang), sn = sin(ang);
  return vec2(ab.x * cs - ab.y * sn, ab.x * sn + ab.y * cs);
}
// Saturation by hue (see RICH_LOOK in params.ts; mirrors apply.ts richLook). v = Vivid amount. Returns (a, b).
vec2 richLook(vec3 lab, float v) {
  float C = length(lab.yz);
  if (v <= 0.0 || C < 1e-6) return lab.yz;
  float h = atan(lab.z, lab.y);
  float hh = h < 0.0 ? h + 6.2831853 : h;
  float warm = smoothstepf(RL_WARM_IN0, RL_WARM_IN1, hh) * (1.0 - smoothstepf(RL_WARM_OUT0, RL_WARM_OUT1, hh));
  float mag = smoothstepf(RL_MAG_IN0, RL_MAG_IN1, hh) * (1.0 - smoothstepf(RL_MAG_OUT0, RL_MAG_OUT1, hh));
  float tone = smoothstepf(RL_C_LO, RL_C_HI, C) * smoothstepf(RL_L_LO, RL_L_HI, lab.x) * (1.0 - smoothstepf(RL_HI_LO, RL_HI_HI, lab.x));
  float cool = smoothstepf(RL_COOL_IN0, RL_COOL_IN1, hh) * (1.0 - smoothstepf(RL_MAG_OUT0, RL_MAG_OUT1, hh));
  float g = (RL_GAIN * (1.0 - RL_COOL_CUT * cool) + RL_WARM_GAIN * warm) * (1.0 - mag) * tone * v;
  return lab.yz * (1.0 + g * exp(-C / (RL_TOP + (RL_WARM_TOP - RL_TOP) * warm)));
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
// With an AI subject overlay (studio seg/, p24.y; seg-overlay.ts composeSegStrength) the channels are instead
// R = the local water's Oklab L (< 0: no water to compare with; > 2: a thick part, no per-pixel test), G = the
// regional trust, B = the ML alpha (the mask's signed distance, SEG_TONE.alphaR), A = the ML weight (near map x
// confidence x regional trust); all bilinear.
// With an AI overlay R also carries the subject's closeness (seg-overlay.ts packSegR: R + SEG_PACK x its step of
// SEG_LEVELS): each texel is unpacked before the bilinear mix; the closeness comes out in g_segClose (segColourK).
float g_segClose = 1.0;
// ...and the part's thinness (packSegR: (SEG_LEVELS + 1) x its step of SEG_THIN_LEVELS on top), out in g_segThin.
float g_segThin = 0.0;
vec3 segUnpack(float r) {
  float n = floor((r + 8.0) / SEG_PACK);
  float th = floor((n + 0.5) / (SEG_LEVELS + 1.0));
  return vec3(r - SEG_PACK * n, (n - (SEG_LEVELS + 1.0) * th) / SEG_LEVELS, th / SEG_THIN_LEVELS);
}
vec4 animalStrength(vec2 uv) {
  ivec2 size = textureSize(u_data3, 0);
  ivec2 i = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
  // The interior hold (G) and the ML channels are read bilinearly so their edges are soft.
  vec2 f = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size) - 1.0);
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, size - 1);
  vec2 t = f - vec2(i0);
  vec4 c00 = texelFetch(u_data3, i0, 0);
  vec4 c10 = texelFetch(u_data3, ivec2(i1.x, i0.y), 0);
  vec4 c01 = texelFetch(u_data3, ivec2(i0.x, i1.y), 0);
  vec4 c11 = texelFetch(u_data3, i1, 0);
  g_segClose = 1.0;
  g_segThin = 0.0;
  if (p[24].y > 0.5) {
    vec3 u00 = segUnpack(c00.r);
    vec3 u10 = segUnpack(c10.r);
    vec3 u01 = segUnpack(c01.r);
    vec3 u11 = segUnpack(c11.r);
    c00.r = u00.x; c10.r = u10.x; c01.r = u01.x; c11.r = u11.x;
    g_segClose = mix(mix(u00.y, u10.y, t.x), mix(u01.y, u11.y, t.x), t.y);
    g_segThin = mix(mix(u00.z, u10.z, t.x), mix(u01.z, u11.z, t.x), t.y);
  }
  vec4 c = mix(mix(c00, c10, t.x), mix(c01, c11, t.x), t.y);
  // The ML alpha edge-aware where the contour passes (SEG_TONE.jbu*; apply.ts segSample): the four texels weighted
  // by the source's luma at their centres against the pixel's own (segGuideLum, the including program's; < 0: none).
  if (p[24].y > 0.5) {
    vec4 b4 = vec4(c00.b, c10.b, c01.b, c11.b);
    float blo = min(min(b4.x, b4.y), min(b4.z, b4.w));
    float bhi = max(max(b4.x, b4.y), max(b4.z, b4.w));
    if (bhi - blo > 1e-4 && blo < SEG_JBU_HI && bhi > SEG_JBU_LO) {
      float g0 = segGuideLum(uv);
      if (g0 >= 0.0) {
        vec2 ts = 1.0 / vec2(size);
        vec4 g4 = vec4(segGuideLum((vec2(i0) + 0.5) * ts), segGuideLum((vec2(float(i1.x), float(i0.y)) + 0.5) * ts),
                       segGuideLum((vec2(float(i0.x), float(i1.y)) + 0.5) * ts), segGuideLum((vec2(i1) + 0.5) * ts));
        float glo = min(g0, min(min(g4.x, g4.y), min(g4.z, g4.w)));
        float ghi = max(g0, max(max(g4.x, g4.y), max(g4.z, g4.w)));
        vec4 e = (g4 - g0) / max(SEG_JBU_NOISE, SEG_JBU_K * (ghi - glo));
        vec4 w4 = vec4((1.0 - t.x) * (1.0 - t.y), t.x * (1.0 - t.y), (1.0 - t.x) * t.y, t.x * t.y) * exp(-e * e);
        float ws = w4.x + w4.y + w4.z + w4.w;
        if (ws > 1e-5) c.b = dot(w4, b4) / ws;
      }
    }
  }
  return vec4(p[24].y > 0.5 ? c.r : texelFetch(u_data3, i, 0).r, c.g, c.b, c.a);
}
// Object weight and warm clamp (see apply.ts objectWeight / warmClamp).
float objectWeight(float conf) { return smoothstepf(ON_CONF_LO, ON_CONF_HI, conf); }
// The pop strength: the engine's open-water amount, or a sure ML subject's own (a close-up has no open water).
// How much a tracked ML subject is popped (its ML weight over SEG_TONE.popLo..popHi); 0 without one.
float segPop(vec4 an) { return an.w > 0.0 ? smoothstepf(SEG_POP_LO, SEG_POP_HI, an.w) : 0.0; }
float popStrength(vec4 an) { return max(p[16].w, segPop(an)); }
// Subject pop separation (SUBJECT_POP; mirrors apply.ts): P = tone weight × pop strength × the user's Strength.
// A midtone lift of the subject's L (reversed for a subject darker than the water: p24.x, seg-overlay.ts
// popDirection). Nothing outside the subject changes.
// Warm pop (WARM_POP): the subject's chroma toward a warm cream hue; k = the subject's weight × warmth.
vec2 warmPop(float L, vec2 ab, float k) {
  float Ct = min(WP_CMAX, max(WP_KEEP * length(ab), WP_CMIN * smoothstepf(WP_LLO, WP_LHI, L)));
  // Along the warm hue: a linear mix; across it: faded faster, so the pull passes through neutral, never green.
  vec2 wh = vec2(cos(WP_HUE), sin(WP_HUE));
  float al = dot(ab, wh);
  return wh * mix(al, Ct, k) + (ab - wh * al) * pow(max(0.0, 1.0 - k), WP_SIDE);
}
// Seabed recovery (SEABED, params.ts): how much of the ground around a pixel is lit seabed rather than open water,
// read from the analysis' coarse grid (p27–p35, SB_GRID² cell means) with a quadratic B-spline and a soft ramp. The
// pixel's own brightness has no say: a dark stone and the sand it lies on share one weight, and it fades with the
// ground's brightness (distance). Mirrors apply.ts seabedW.
float seabedCell(int i, int j) {
  int n = int(SB_GRID);
  int k = clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1);
  vec4 r = p[27 + k / 4];
  int m = k - 4 * (k / 4);
  return m == 0 ? r.x : m == 1 ? r.y : m == 2 ? r.z : r.w;
}
float seabedW(vec2 uv) {
  vec2 g = uv * SB_GRID - 0.5;
  vec2 c = floor(g + 0.5);
  vec2 f = g - c;
  ivec2 ic = ivec2(c);
  vec3 wx = vec3(0.5 * (0.5 - f.x) * (0.5 - f.x), 0.75 - f.x * f.x, 0.5 * (0.5 + f.x) * (0.5 + f.x));
  vec3 wy = vec3(0.5 * (0.5 - f.y) * (0.5 - f.y), 0.75 - f.y * f.y, 0.5 * (0.5 + f.y) * (0.5 + f.y));
  float acc = 0.0;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) acc += wx[i] * wy[j] * seabedCell(ic.x + i - 1, ic.y + j - 1);
  }
  // The seabed lies below: the top of the frame (bright water toward the surface) is spared, softly.
  return smoothstepf(SB_W_LO, SB_W_HI, acc) * smoothstepf(SB_Y0, SB_Y1, uv.y);
}
float popLift(float L, float P) { return L + SP_LIFT * P * p[24].x * 4.0 * L * max(0.0, 1.0 - L); }
// Hue guard: on the subject (weight w) the output hue stays within SUBJECT_POP.hueMax of the source pixel's hue.
vec2 popHue(vec2 ab, vec2 abSrc, float w) {
  float C = length(ab), Cs = length(abSrc);
  // Faded in with the source chroma: a near-white source hue is noise (a hard cut there leaves patches).
  w *= smoothstepf(0.01, 0.04, Cs);
  if (w <= 0.0 || C < 1e-4) return ab;
  vec2 u = ab / C, s = abSrc / Cs;
  float cs = dot(u, s);
  if (cs >= SP_HUE_COS) return ab;
  // The limit: the source hue turned by hueMax toward the output's side.
  float side = sign(s.x * u.y - s.y * u.x);
  vec2 lim = vec2(s.x * SP_HUE_COS - side * s.y * SP_HUE_SIN, s.y * SP_HUE_COS + side * s.x * SP_HUE_SIN);
  return C * normalize(mix(u, lim, w));
}
// How far the source pixel (Oklab lab0) departs from the local water (an.x: its L; its hue is the veil's, p14.xy):
// 0 on water, 1 on a clear subject; 1 where there is no water to compare with.
// The bar follows the subject's own contrast (SEG_TONE.evFar; g_segClose, set by animalStrength).
float segEvidence(vec4 an, vec3 lab0) {
  if (an.x < 0.0 || an.x > 2.0) return 1.0;
  float perp = lab0.y * p[14].y - lab0.z * p[14].x;
  float k = mix(SEG_EV_FAR, 1.0, clamp(g_segClose, 0.0, 1.0));
  return smoothstepf(SEG_EV_LO * k, SEG_EV_HI * k, length(vec2(lab0.x - an.x, perp)));
}
// The subject weight the tone uses: the engine's (depart, 0..1: how far the pixel departs from the water, softens
// it), or with an AI overlay on the frame (p24.y) the AI's alone (the engine's coarse per-animal map would show its
// blocks once the pop lifts): 0 on and outside the mask's contour, ramping in over SEG_TONE.rampIn of the read-back
// distance (stretched on a big body); on thin parts near the contour only as far as the pixel departs from the
// water (R > 2 marks the thick parts: no test there), elsewhere the whole subject; times the ML weight (A, segPop),
// the regional trust (G) and the Pop gate (SEG_RESTORE.popGate: nothing of the AI pop is left at Pop 0).
float toneWeight(float subj, vec4 an, float depart, vec3 lab0) {
  // The engine's own masks (no AI overlay) reach past the animal: their tone is kept at SUBJECT_POP.engineKeep.
  if (p[24].y <= 0.5) return SP_ENGINE * objectWeight(subj) * mix(SC_EDGE, 1.0, depart);
  if (an.w <= 0.0) return 0.0;
  float d = (an.z - 0.5) * 2.0 * SEG_ALPHA_R;
  float ev = segEvidence(an, lab0);
  float inner = mix(ev, 1.0, smoothstepf(SEG_TRUST_LO, SEG_TRUST_HI, d));
  // On the thinnest parts (g_segThin; the per-pixel test runs there), a pixel that is the animal is toned from
  // SEG_RAMP_EV inside the contour.
  float rin = an.x >= 0.0 && an.x <= 2.0 ? mix(SEG_RAMP_IN, SEG_RAMP_EV, ev * clamp(g_segThin, 0.0, 1.0)) : SEG_RAMP_IN;
  // G: the regional trust (seg-overlay.ts waterField) scales the tone, even where the open-water amount (p22.z)
  // would pop it in full.
  return smoothstepf(0.0, rin, d) * inner * max(p[22].z, segPop(an)) * an.y * min(1.0, SR_POP_GATE * p[23].w);
}
// The analysis guide's luminance at uv, plain bilinear (no range weight): the source's low-pass (apply.ts guideLum).
float guideLum(vec2 uv) {
  ivec2 size = textureSize(u_data2, 0);
  vec2 f = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size) - 1.0);
  ivec2 i0 = ivec2(floor(f));
  ivec2 i1 = min(i0 + 1, size - 1);
  vec2 t = f - vec2(i0);
  return lum(mix(mix(texelFetch(u_data2, i0, 0).rgb, texelFetch(u_data2, ivec2(i1.x, i0.y), 0).rgb, t.x),
                 mix(texelFetch(u_data2, ivec2(i0.x, i1.y), 0).rgb, texelFetch(u_data2, i1, 0).rgb, t.x), t.y));
}
// The colour share of the AI subject restore (SEG_RESTORE edge / farKeep; apply.ts segColourK): the edge feather over
// the mask's read-back distance (an.z; whole SR_EDGE mask px inside the contour) x the subject's closeness
// (g_segClose, set by animalStrength: SR_FAR_KEEP for a far subject, 1 for a close one).
float segColourK(vec4 an) {
  float d = (an.z - 0.5) * 2.0 * SEG_ALPHA_R;
  return smoothstepf(0.0, SR_EDGE, d) * mix(SR_FAR_KEEP, 1.0, clamp(g_segClose, 0.0, 1.0));
}
// AI subject restore (SEG_RESTORE in params.ts; mirrors apply.ts segRestore) on the finished Oklab colour: s = the AI
// tone weight x the Pop multiplier (0..2), lr = the source pixel's luminance over its neighbourhood's, lifted = the
// lift Subject pop has already applied, ck = the colour share (segColourK), x = the boost of the slider's upper half
// (the AI weight x (the Pop multiplier - 1): 0 up to Pop 50; SEG_RESTORE boost*). Only with a real AI mask on the frame
// (s = 0 otherwise). The colour stays on the water's side of neutral.
vec3 segRestore(vec3 lk, float s, float lr, float lifted, float ck, float x) {
  if (s <= 0.0) return lk;
  vec2 wh = vec2(SR_COS, SR_SIN);
  vec2 ab = lk.yz;
  // De-blue: a cool pixel loses a share of its chroma (hue kept); warm, green and magenta pixels keep theirs.
  float C = length(ab);
  float cool = C > 1e-5 ? smoothstepf(0.0, 0.5, -dot(ab, wh) / C) : 0.0;
  ab *= 1.0 - min(SR_CAST_MAX, SR_CAST * s) * cool * ck;
  // Warm-up: a little chroma along the warm hue, never more than SR_WARM_SHARE of what is left on the cool side of
  // it; lit parts only, highlights stay white.
  float lit = smoothstepf(SR_LIT_LO, SR_LIT_HI, lk.x) * (1.0 - smoothstepf(SR_HI_LO, SR_HI_HI, lk.x));
  ab += wh * min((SR_WARM * s + SR_X_WARM * x) * min(1.0, 2.0 * p[24].z) * lit * ck, (SR_WARM_SHARE + SR_X_WARM_SHARE * x) * max(0.0, -dot(ab, wh)));
  // Local contrast against the neighbourhood, then the midtone lift (up to SR_LIFT x s in all).
  float L = lk.x * pow(clamp(lr, SR_R_MIN, SR_R_MAX), SR_DETAIL * s + SR_X_DETAIL * x);
  L += max(0.0, SR_LIFT * s + SR_X_LIFT * x - lifted) * 4.0 * L * max(0.0, 1.0 - L);
  return vec3(L, ab);
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
${ye}
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
  vec3 guideS;
  vec4 fld = sampleFields(uv, lin, k, personMap, guideS);
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
  // Used more than once below: computed once.
  float veilFar = hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma);
  float veilConf = hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma);
  float redKeep = smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)));
  float wSub = smoothstepf(subLo, subHi, sig) * (1.0 - veilFar) * (1.0 - RED_GREEN_PROP * p[22].w);
  // Red restoration (red.ts): amplified channels rebuilt from the smoothed chroma; red gain by red SNR.
  vec3 rg3 = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  float snrR;
  vec3 linC = chromaRebuild(lin, guideS, max(rg3 * wb, waterWb), B, snrR);
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
  float confPix = min(confSignal, max(max(veilConf * veto, confBright), p[22].w * RED_GREEN_OBJ));
  // Whatever the map says, a pixel the veil model would nearly erase
  // (tiny D) must take the water path — the physics path would crush it
  // to black, which is the dark ghost on moving content.
  // Open blue water: no source red → the water path's colour (see apply.ts).
  float conf = max(mix(confPix, min(clamp(fld.y, 0.0, 1.0), veto), k), person * smoothstepf(PERSON_LUM_LO, PERSON_LUM_HI, lumI)) * confSignal * (1.0 - p[16].w * (1.0 - redKeep));
  // Raw subject mask (before the tone gate) is also the temporal tracker's output; the warped
  // previous mask (g_subjPrior, kept near the map by the temporal layer) holds where the pixel departs like a subject.
  float subjRaw = p[16].w > 0.0 ? max(subjectWeight(uv, clamp(fld.y, 0.0, 1.0) * k, bdev), g_subjPrior * smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev)) : 0.0;
  g_subjOut = subjRaw;
  vec4 an = animalStrength(uv);
  float subj = max(subjRaw, p[16].w > 0.0 ? an.y * smoothstepf(BD_HOLD_LO, BD_HOLD_HI, bdev) : 0.0) * p[16].w * p[22].z * an.x;
  if (p[0].w > 0.5) return vec3(k, confPix, clamp(fld.y, 0.0, 1.0));
  vec3 gainV = rg3 * wb;
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
    o *= mix(rc, vec3(hazeLiftRatio(y0, p[17].w * (1.0 - HAZE_LIFT_FAR_KEEP))), veilFar);
    hf = y0 > 1e-6 ? lum(o) / y0 : 1.0;
  }
  // Levels on luminance, ratio-preserving.
  float Y = lum(o);
  float Ylv = Y + ((Y - black) / (white - black) - Y) * levelsMix;
  float ratio = Y > 1e-5 ? max(0.0, Ylv) / Y : 1.0;
  o *= ratio;
  Y = max(0.0, Ylv);

  // Departure from the water: the backdrop test in open water; in a close-up (no backdrop) the ML alpha already
  // carries its water cap (seg-overlay.ts composeSegStrength, from the overlay's own water-departure map).
  float depart = p[16].w > 0.0 ? smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev) : 1.0;
  // The pop fades out as the graded lightness drops (SUBJECT_POP.darkLo..Hi): dark parts keep the plain grade.
  float cbY = pow(max(Y, 0.0), 1.0 / 3.0);
  float tw = toneWeight(subj, an, depart, lab0);
  float ow = tw * smoothstepf(SP_DARK_LO, SP_DARK_HI, cbY);
  float popS = popStrength(an);
  float popP = ow * popS * p[23].w;
  // AI subject restore amount (SEG_RESTORE): the AI weight (its own, lower dark fade) x the Pop multiplier; 0
  // without a real AI mask on the frame.
  float segS = p[24].y > 0.5 ? tw * smoothstepf(SR_DARK_LO, SR_DARK_HI, cbY) * p[23].w : 0.0;
  // Local contrast on encoded luminance (the subject takes more of it: SUBJECT_POP.clarity).
  if (clarity > 0.0) {
    float encY = linearToSrgb(vec3(Y)).x;
    float eq = sampleClahe(uv, encY, tilesX, tilesY, bins);
    float encNew = clamp(encY + (eq - encY) * (clarity + SP_CLARITY * popP), 0.0, 1.0);
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
  float vividW = smoothstepf(VIVID_C_LO, VIVID_C_HI, cSrc) * veilFar;
  float cMin = VIVID_KEEP * cSrc * vividW;
  if (C > 1e-6 && C * scale < cMin) scale = cMin / C;
  scale *= saturation;
  float onFar = hueFar(lab0.yz, veilHue, ON_FAR_LO, ON_FAR_HI, achroma);
  lab.yz = greenNeutral(lab.x, lab.yz, p[22].w * (1.0 - RED_GN_OBJ_KEEP * conf));
  // Dark parts (a thresher's long tail) keep their colour: no cast clearing below SUBJECT_POP.keepDarkLo..Hi.
  // Under an AI mask (p24.y) the subject's cast is the AI restore's alone (SEG_RESTORE: a set share of it goes, never
  // all): the pop's own cast clearing, its warm pop and its stronger warm clamp are for the engine's masks.
  float tN = objectNeutral(lab.x, lab.yz, lin, onFar, p[24].y > 0.5 ? 0.0 : ow, popS) * smoothstepf(SP_KEEP_LO, SP_KEEP_HI, lab.x);
  float personS = person * (1.0 - p[16].w * (1.0 - redKeep));
  scale *= warmClamp(lab.yz, lin, onFar, personS, p[24].y > 0.5 ? p[16].w : popS);
  vec2 nab = clearCast(lab.yz * scale, veilHue, tN / ON_MIX);
  float Ls = lab.x;
  vec3 lk = deepBlueLook(vec3(Ls, skinTone(Ls, nab, personS)), look, 1.0 - veilConf, p[16].x, p[16].y);
  lk.yz = warmMaterial(lk.x, redGuard(lk.x, lk.yz, lab0.yz, person, onFar), p[22].w, onFar);
  // Vivid look (opt-in, p23.z), then the near-white pink guard (always).
  // The subject keeps Vivid's colour (its hue pull: sparing it shows a dark tail's purple) but is spared part of
  // its water darkening, then lifted; the chroma follows part of the lift: a lifted blue-grey stays blue-grey, not
  // a grey that reads peach next to saturated water, nor a cast belly turned cyan.
  vec3 lkV = vividLook(lk, p[23].z, p[22].w);
  // (Not under an AI mask: there the subject keeps the plain grade's lightness, see below.)
  float Lv = popP > 0.0 && p[24].y <= 0.5 ? vividLook(lk, p[23].z * (1.0 - SP_VIVID * min(1.0, popP)), p[22].w).x : lkV.x;
  // Under an AI mask the pop's own lift (or its deepening of a subject darker than the water) is left out: the AI
  // restore's small lift is all the subject gets (SEG_RESTORE.lift), so its lightness against the water stays the
  // plain grade's, and its chroma is not scaled along.
  float Lp = p[24].y > 0.5 ? Lv : popLift(Lv, popP);
  // ...and their chroma follows the lift in full (saturation kept): a lifted navy tail stays navy, not grey-mauve.
  float cf = mix(SP_CHROMA_DARK, SP_CHROMA, smoothstepf(SP_KEEP_LO, SP_KEEP_HI, Lv));
  lk = vec3(Lp, lkV.yz * (1.0 + cf * (Lp / max(1e-4, Lv) - 1.0)));
  lk.yz = highlightPink(lk.x, lk.yz);
  lk.yz = popHue(lk.yz, lab0.yz, clamp(ow * popS, 0.0, 1.0));
  // The engine's own masks are blobs reaching past the animal: there the warmth also needs the pixel's own departure
  // from the water (it hugs the animal's outline); an AI mask is the outline already.
  float wk = smoothstepf(WP_WLO, WP_WHI, ow) * p[24].z * (p[24].y > 0.5 ? 0.0 : depart) * smoothstepf(WP_CAST_LO, WP_CAST_HI, length(lab.yz) * scale);
  lk.yz = warmPop(lk.x, lk.yz, wk);
  // Blue water style (opt-in, p25.w): cobalt water, orange warm subjects, neutral silver, deeper shadows.
  vec4 bl = blueLook(lk, p[25].w, p[22].w);
  lk = bl.xyz;
  // "Water colour" (p26.w): the water's hue turned toward teal or a deeper blue; subjects keep theirs.
  lk.yz = waterTint(lk.yz, p[26].w, p[22].w);
  // Saturation by hue (RICH_LOOK; rides on the Vivid amount, p23.z): richer colour, warm subjects more.
  lk.yz = richLook(lk, p[23].z);
  // Seabed recovery: sand and reef to a warm neutral (and a little lighter) where the water left no red.
  if (p[25].x > 0.0) {
    // A pixel whose own colour escaped the cast (yellow coral, an orange fish: vividW) is not the red-less ground.
    float sb = seabedW(uv) * (1.0 - vividW) * p[25].x;
    lk = vec3(lk.x + SB_LIFT * sb, mix(lk.yz, vec2(cos(SB_HUE), sin(SB_HUE)) * SB_CHROMA + SB_KEEP * lk.yz, sb));
  }
  // AI subject restore: after every look, so none of them amplifies it.
  if (segS > 0.0) lk = segRestore(lk, segS, (lumI + DG_EPS) / (guideLum(uv) + DG_EPS), 0.0, segColourK(an), segS * max(0.0, 1.0 - 1.0 / max(p[23].w, 1.0)));
  // Tone target (analyze.ts TONE, p24.w): one gamma on the graded lightness, the same for every pixel of the frame.
  if (p[24].w > 1.0) lk.x = pow(max(lk.x, 0.0), p[24].w);
  // The warm chroma may exceed the source-relative cap (a cyan shark has little to start from).
  vec3 o1 = oklabToLinear(capChroma(lk, max(max(cSrc, wk * WP_CMIN * 1.5), bl.w)));
  vec3 o2 = fitToGamut(o1 * detailRatio(src, lin));
  vec3 outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}
vec3 grade(vec3 src, vec2 uv) { return gradeD(src, src, uv); }`,Ze=`${L}
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
// Returns (z, conf, d, veilScale), the guide-match weight k in .w of the second value, and
// guideSmooth(uv, c) (red.ts: the same four guide texels with the same weights) in the third.
fn sampleFields(uv: vec2<f32>, c: vec3<f32>) -> array<vec4<f32>, 3> {
  let size = vec2<i32>(textureDimensions(u_data0, 0));
  let f = clamp(uv * vec2<f32>(size) - 0.5, vec2(0.0), vec2<f32>(size) - 1.0);
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, size - 1);
  let t = f - vec2<f32>(i0);
  let cn = length(c) + 0.02;
  var sum = vec4(0.0); var bil = vec4(0.0); var sg = vec3(0.0); var sw = 0.0; var sp = 0.0; var bp = 0.0;
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
    let wsr = ws * wr;
    sum += wsr * fld;
    sg += wsr * g;
    sw += wsr;
    bil += ws * fld;
    sp += ws * wr * gd.w;
    bp += ws * gd.w;
  }
  // second vector: (person, 0, 0, k)
  if (sw < 1e-6) { return array<vec4<f32>, 3>(bil, vec4(bp, 0.0, 0.0, 0.0), vec4(c, 0.0)); }
  return array<vec4<f32>, 3>(sum / sw, vec4(sp / sw, 0.0, 0.0, min(1.0, sw / 0.08)), vec4(mix(c, sg / sw, min(1.0, sw / 0.08)), 0.0));
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
// Blue water style (mirrors the GLSL / apply.ts blueLook). Returns (L, a, b, chroma floor).
fn blueLook(lab: vec3<f32>, v: f32, g: f32) -> vec4<f32> {
  if (v <= 0.0) { return vec4<f32>(lab, 0.0); }
  let C0 = length(lab.yz);
  let h = atan2(lab.z, lab.y);
  let hh = select(h, h + 6.2831853, h < 0.0);
  let warm = smoothstepf(BW_WARM_IN0, BW_WARM_IN1, hh) * (1.0 - smoothstepf(BW_WARM_OUT0, BW_WARM_OUT1, hh)) * smoothstepf(BW_WARM_C_LO, BW_WARM_C_HI, C0) * smoothstepf(BW_WARM_L_LO, BW_WARM_L_HI, lab.x) * v;
  let hw = hh + (BW_WARM_HUE - hh) * BW_WARM_PULL * warm;
  let Cw = max(C0, min(C0 * (1.0 + BW_WARM_GAIN * warm), BW_WARM_C_MAX));
  var ab = Cw * vec2<f32>(cos(hw), sin(hw));
  let s = dot(lab.yz, vec2<f32>(cos(BW_WARM_DIR), sin(BW_WARM_DIR)));
  let cool = 1.0 - smoothstepf(BW_S_LO, BW_S_HI, s);
  let vio = smoothstepf(BW_VC_LO, BW_VC_HI, C0) * smoothstepf(BW_VIO0, BW_VIO1, hh) * (1.0 - smoothstepf(BW_VIO2, 6.2831853, hh));
  let neutral = smoothstepf(BW_NEUTRAL_L_LO, BW_NEUTRAL_L_HI, lab.x) * (1.0 - smoothstepf(BW_NEUTRAL_C_LO, BW_NEUTRAL_C_HI, C0));
  let ct = min(BW_C_MAX, BW_C_K * lab.x) * (1.0 - BW_HI_DROP * smoothstepf(BW_HI_LO, BW_HI_HI, lab.x));
  let veg = smoothstepf(BW_VEG_C_LO, BW_VEG_C_HI, C0) * smoothstepf(BW_VEG_IN0, BW_VEG_IN1, hh) * (1.0 - smoothstepf(BW_VEG_OUT0, BW_VEG_OUT1, hh)) * (1.0 - BW_VEG_GREEN * g);
  let w = BW_MIX * cool * (1.0 - vio) * (1.0 - veg) * (1.0 - neutral) * v;
  ab += (ct * vec2<f32>(cos(BW_TARGET), sin(BW_TARGET)) - ab) * w;
  ab *= 1.0 - BW_NEUTRAL_K * neutral * cool * v;
  let L2 = lab.x * (1.0 - BW_SHADOW_K * v * (1.0 - smoothstepf(0.0, BW_SHADOW_HI, lab.x)));
  return vec4<f32>(L2, ab, max(ct * w, Cw * warm));
}
// "Water colour" (mirrors the GLSL / apply.ts waterTint): the water's hue turned by t radians. Returns (a, b).
fn waterTint(ab: vec2<f32>, t: f32, g: f32) -> vec2<f32> {
  if (t == 0.0) { return ab; }
  let C = length(ab);
  let h = atan2(ab.y, ab.x);
  let hh = select(h, h + 6.2831853, h < 0.0);
  let cool = 1.0 - smoothstepf(BW_S_LO, BW_S_HI, dot(ab, vec2<f32>(cos(BW_WARM_DIR), sin(BW_WARM_DIR))));
  let vio = smoothstepf(BW_VC_LO, BW_VC_HI, C) * smoothstepf(BW_VIO0, BW_VIO1, hh) * (1.0 - smoothstepf(BW_VIO2, 6.2831853, hh));
  let veg = smoothstepf(BW_VEG_C_LO, BW_VEG_C_HI, C) * smoothstepf(BW_VEG_IN0, BW_VEG_IN1, hh) * (1.0 - smoothstepf(BW_VEG_OUT0, BW_VEG_OUT1, hh)) * (1.0 - BW_VEG_GREEN * g);
  let ang = t * cool * (1.0 - vio) * (1.0 - veg);
  let cs = cos(ang);
  let sn = sin(ang);
  return vec2<f32>(ab.x * cs - ab.y * sn, ab.x * sn + ab.y * cs);
}
// Saturation by hue (mirrors the GLSL / apply.ts richLook). v = Vivid amount. Returns (a, b).
fn richLook(lab: vec3<f32>, v: f32) -> vec2<f32> {
  let C = length(lab.yz);
  if (v <= 0.0 || C < 1e-6) { return lab.yz; }
  let h = atan2(lab.z, lab.y);
  let hh = select(h, h + 6.2831853, h < 0.0);
  let warm = smoothstepf(RL_WARM_IN0, RL_WARM_IN1, hh) * (1.0 - smoothstepf(RL_WARM_OUT0, RL_WARM_OUT1, hh));
  let mag = smoothstepf(RL_MAG_IN0, RL_MAG_IN1, hh) * (1.0 - smoothstepf(RL_MAG_OUT0, RL_MAG_OUT1, hh));
  let tone = smoothstepf(RL_C_LO, RL_C_HI, C) * smoothstepf(RL_L_LO, RL_L_HI, lab.x) * (1.0 - smoothstepf(RL_HI_LO, RL_HI_HI, lab.x));
  let cool = smoothstepf(RL_COOL_IN0, RL_COOL_IN1, hh) * (1.0 - smoothstepf(RL_MAG_OUT0, RL_MAG_OUT1, hh));
  let g = (RL_GAIN * (1.0 - RL_COOL_CUT * cool) + RL_WARM_GAIN * warm) * (1.0 - mag) * tone * v;
  return lab.yz * (1.0 + g * exp(-C / (RL_TOP + (RL_WARM_TOP - RL_TOP) * warm)));
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
// With an AI overlay R also carries the subject's closeness (see the GLSL animalStrength).
var<private> g_segClose: f32 = 1.0;
var<private> g_segThin: f32 = 0.0;
fn segUnpack(r: f32) -> vec3<f32> {
  let n = floor((r + 8.0) / SEG_PACK);
  let th = floor((n + 0.5) / (SEG_LEVELS + 1.0));
  return vec3<f32>(r - SEG_PACK * n, (n - (SEG_LEVELS + 1.0) * th) / SEG_LEVELS, th / SEG_THIN_LEVELS);
}
fn animalStrength(uv: vec2<f32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(u_data3, 0));
  let i = clamp(vec2<i32>(uv * vec2<f32>(size)), vec2<i32>(0), size - 1);
  let f = clamp(uv * vec2<f32>(size) - 0.5, vec2<f32>(0.0), vec2<f32>(size) - 1.0);
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, size - 1);
  let t = f - vec2<f32>(i0);
  var c00 = textureLoad(u_data3, i0, 0);
  var c10 = textureLoad(u_data3, vec2<i32>(i1.x, i0.y), 0);
  var c01 = textureLoad(u_data3, vec2<i32>(i0.x, i1.y), 0);
  var c11 = textureLoad(u_data3, i1, 0);
  g_segClose = 1.0;
  g_segThin = 0.0;
  if (params.p[24].y > 0.5) {
    let u00 = segUnpack(c00.r);
    let u10 = segUnpack(c10.r);
    let u01 = segUnpack(c01.r);
    let u11 = segUnpack(c11.r);
    c00.r = u00.x; c10.r = u10.x; c01.r = u01.x; c11.r = u11.x;
    g_segClose = mix(mix(u00.y, u10.y, t.x), mix(u01.y, u11.y, t.x), t.y);
    g_segThin = mix(mix(u00.z, u10.z, t.x), mix(u01.z, u11.z, t.x), t.y);
  }
  var c = mix(mix(c00, c10, t.x), mix(c01, c11, t.x), t.y);
  // The ML alpha edge-aware where the contour passes (see the GLSL animalStrength).
  if (params.p[24].y > 0.5) {
    let b4 = vec4<f32>(c00.b, c10.b, c01.b, c11.b);
    let blo = min(min(b4.x, b4.y), min(b4.z, b4.w));
    let bhi = max(max(b4.x, b4.y), max(b4.z, b4.w));
    if (bhi - blo > 1e-4 && blo < SEG_JBU_HI && bhi > SEG_JBU_LO) {
      let g0 = segGuideLum(uv);
      if (g0 >= 0.0) {
        let ts = 1.0 / vec2<f32>(size);
        let g4 = vec4<f32>(segGuideLum((vec2<f32>(i0) + 0.5) * ts), segGuideLum((vec2<f32>(f32(i1.x), f32(i0.y)) + 0.5) * ts),
                           segGuideLum((vec2<f32>(f32(i0.x), f32(i1.y)) + 0.5) * ts), segGuideLum((vec2<f32>(i1) + 0.5) * ts));
        let glo = min(g0, min(min(g4.x, g4.y), min(g4.z, g4.w)));
        let ghi = max(g0, max(max(g4.x, g4.y), max(g4.z, g4.w)));
        let e = (g4 - g0) / max(SEG_JBU_NOISE, SEG_JBU_K * (ghi - glo));
        let w4 = vec4<f32>((1.0 - t.x) * (1.0 - t.y), t.x * (1.0 - t.y), (1.0 - t.x) * t.y, t.x * t.y) * exp(-e * e);
        let ws = w4.x + w4.y + w4.z + w4.w;
        if (ws > 1e-5) { c.b = dot(w4, b4) / ws; }
      }
    }
  }
  return vec4<f32>(select(textureLoad(u_data3, i, 0).r, c.r, params.p[24].y > 0.5), c.g, c.b, c.a);
}
fn objectWeight(conf: f32) -> f32 { return smoothstepf(ON_CONF_LO, ON_CONF_HI, conf); }
fn segPop(an: vec4<f32>) -> f32 { return select(0.0, smoothstepf(SEG_POP_LO, SEG_POP_HI, an.w), an.w > 0.0); }
fn popStrength(an: vec4<f32>) -> f32 { return max(params.p[16].w, segPop(an)); }
fn warmPop(L: f32, ab: vec2<f32>, k: f32) -> vec2<f32> {
  let Ct = min(WP_CMAX, max(WP_KEEP * length(ab), WP_CMIN * smoothstepf(WP_LLO, WP_LHI, L)));
  let wh = vec2<f32>(cos(WP_HUE), sin(WP_HUE));
  let al = dot(ab, wh);
  return wh * mix(al, Ct, k) + (ab - wh * al) * pow(max(0.0, 1.0 - k), WP_SIDE);
}
fn seabedCell(i: i32, j: i32) -> f32 {
  let n = i32(SB_GRID);
  let k = clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1);
  let r = params.p[27 + k / 4];
  let m = k - 4 * (k / 4);
  if (m == 0) { return r.x; }
  if (m == 1) { return r.y; }
  if (m == 2) { return r.z; }
  return r.w;
}
fn seabedW(uv: vec2<f32>) -> f32 {
  let g = uv * SB_GRID - vec2<f32>(0.5);
  let c = floor(g + vec2<f32>(0.5));
  let f = g - c;
  let ic = vec2<i32>(c);
  let wx = vec3<f32>(0.5 * (0.5 - f.x) * (0.5 - f.x), 0.75 - f.x * f.x, 0.5 * (0.5 + f.x) * (0.5 + f.x));
  let wy = vec3<f32>(0.5 * (0.5 - f.y) * (0.5 - f.y), 0.75 - f.y * f.y, 0.5 * (0.5 + f.y) * (0.5 + f.y));
  var acc = 0.0;
  for (var j = 0; j < 3; j++) {
    for (var i = 0; i < 3; i++) { acc += wx[i] * wy[j] * seabedCell(ic.x + i - 1, ic.y + j - 1); }
  }
  // The seabed lies below: the top of the frame (bright water toward the surface) is spared, softly.
  return smoothstepf(SB_W_LO, SB_W_HI, acc) * smoothstepf(SB_Y0, SB_Y1, uv.y);
}
fn popLift(L: f32, P: f32) -> f32 { return L + SP_LIFT * P * params.p[24].x * 4.0 * L * max(0.0, 1.0 - L); }
fn popHue(ab: vec2<f32>, abSrc: vec2<f32>, w: f32) -> vec2<f32> {
  let C = length(ab); let Cs = length(abSrc);
  let wc = w * smoothstepf(0.01, 0.04, Cs);
  if (wc <= 0.0 || C < 1e-4) { return ab; }
  let u = ab / C; let s = abSrc / Cs;
  if (dot(u, s) >= SP_HUE_COS) { return ab; }
  let side = sign(s.x * u.y - s.y * u.x);
  let lim = vec2(s.x * SP_HUE_COS - side * s.y * SP_HUE_SIN, s.y * SP_HUE_COS + side * s.x * SP_HUE_SIN);
  return C * normalize(mix(u, lim, wc));
}
fn clearCast(ab: vec2<f32>, vh: vec2<f32>, g: f32) -> vec2<f32> {
  let C = length(ab);
  if (g <= 0.0 || C < 1e-6) { return ab; }
  let pc = max(0.0, dot(ab, vh));
  let c1 = (C - g * min(SC_K * pc, SC_CMAX)) * (1.0 - g * SC_DESAT);
  return ab * (max(0.0, c1) / C);
}
fn segEvidence(an: vec4<f32>, lab0: vec3<f32>) -> f32 {
  if (an.x < 0.0 || an.x > 2.0) { return 1.0; }
  let perp = lab0.y * params.p[14].y - lab0.z * params.p[14].x;
  let k = mix(SEG_EV_FAR, 1.0, clamp(g_segClose, 0.0, 1.0));
  return smoothstepf(SEG_EV_LO * k, SEG_EV_HI * k, length(vec2<f32>(lab0.x - an.x, perp)));
}
fn toneWeight(subj: f32, an: vec4<f32>, depart: f32, lab0: vec3<f32>) -> f32 {
  if (params.p[24].y <= 0.5) { return SP_ENGINE * objectWeight(subj) * mix(SC_EDGE, 1.0, depart); }
  if (an.w <= 0.0) { return 0.0; }
  let d = (an.z - 0.5) * 2.0 * SEG_ALPHA_R;
  let ev = segEvidence(an, lab0);
  let inner = mix(ev, 1.0, smoothstepf(SEG_TRUST_LO, SEG_TRUST_HI, d));
  let rin = select(SEG_RAMP_IN, mix(SEG_RAMP_IN, SEG_RAMP_EV, ev * clamp(g_segThin, 0.0, 1.0)), an.x >= 0.0 && an.x <= 2.0);
  return smoothstepf(0.0, rin, d) * inner * max(params.p[22].z, segPop(an)) * an.y * min(1.0, SR_POP_GATE * params.p[23].w);
}
fn guideLum(uv: vec2<f32>) -> f32 {
  let size = vec2<i32>(textureDimensions(u_data2, 0));
  let f = clamp(uv * vec2<f32>(size) - 0.5, vec2<f32>(0.0), vec2<f32>(size) - 1.0);
  let i0 = vec2<i32>(floor(f));
  let i1 = min(i0 + 1, size - 1);
  let t = f - vec2<f32>(i0);
  return lum(mix(mix(textureLoad(u_data2, i0, 0).rgb, textureLoad(u_data2, vec2<i32>(i1.x, i0.y), 0).rgb, t.x),
                 mix(textureLoad(u_data2, vec2<i32>(i0.x, i1.y), 0).rgb, textureLoad(u_data2, i1, 0).rgb, t.x), t.y));
}
// The colour share of the AI subject restore (see the GLSL segColourK).
fn segColourK(an: vec4<f32>) -> f32 {
  let d = (an.z - 0.5) * 2.0 * SEG_ALPHA_R;
  return smoothstepf(0.0, SR_EDGE, d) * mix(SR_FAR_KEEP, 1.0, clamp(g_segClose, 0.0, 1.0));
}
// AI subject restore (SEG_RESTORE; see the GLSL segRestore).
fn segRestore(lk: vec3<f32>, s: f32, lr: f32, lifted: f32, ck: f32, x: f32) -> vec3<f32> {
  if (s <= 0.0) { return lk; }
  let wh = vec2<f32>(SR_COS, SR_SIN);
  var ab = lk.yz;
  let C = length(ab);
  var cool = 0.0;
  if (C > 1e-5) { cool = smoothstepf(0.0, 0.5, -dot(ab, wh) / C); }
  ab = ab * (1.0 - min(SR_CAST_MAX, SR_CAST * s) * cool * ck);
  let lit = smoothstepf(SR_LIT_LO, SR_LIT_HI, lk.x) * (1.0 - smoothstepf(SR_HI_LO, SR_HI_HI, lk.x));
  ab = ab + wh * min((SR_WARM * s + SR_X_WARM * x) * min(1.0, 2.0 * params.p[24].z) * lit * ck, (SR_WARM_SHARE + SR_X_WARM_SHARE * x) * max(0.0, -dot(ab, wh)));
  var L = lk.x * pow(clamp(lr, SR_R_MIN, SR_R_MAX), SR_DETAIL * s + SR_X_DETAIL * x);
  L = L + max(0.0, SR_LIFT * s + SR_X_LIFT * x - lifted) * 4.0 * L * max(0.0, 1.0 - L);
  return vec3<f32>(L, ab);
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
${ke}
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
  // Used more than once below: computed once.
  let veilFar = hueFar(lab0.yz, veilHue, hueFarLo, hueFarHi, achroma);
  let veilConf = hueConf(lab0.yz, veilHue, hueLo, hueHi, achroma);
  let redKeep = smoothstepf(ON_R_LO, ON_R_HI, lin.r / max(1e-4, max(lin.g, lin.b)));
  let wSub = smoothstepf(subLo, subHi, sig) * (1.0 - veilFar) * (1.0 - RED_GREEN_PROP * p[22].w);
  // Red restoration (red.ts): amplified channels rebuilt from the smoothed chroma; red gain by red SNR.
  let rg3 = clamp(exp(attn * (z - zMean)), vec3(1.0 / gainCap), vec3(gainCap));
  let crb = chromaRebuild(lin, sf[2].xyz, max(rg3 * wb, waterWb), B);
  let linC = crb.xyz;
  let redS = redGainStrength(crb.w);
  let per = max(linC - Bs, linC * floorFrac);
  let D = mix(linC * max(floorFrac, 1.0 - lumBs / lumI), per, vec3(wSub));
  let confSignal = smoothstepf(confLo, confHi, sig);
  let confBright = smoothstepf(CONF_BRIGHT_LO, CONF_BRIGHT_HI, sig);
  let bdev = select(1.0, backdropDev(lab0, uv), p[16].w > 0.0);
  let bsub = smoothstepf(BD_VETO_LO, BD_VETO_HI, bdev);
  let veto = mix(1.0, bsub, p[16].w);
  let confPix = min(confSignal, max(max(veilConf * veto, confBright), p[22].w * RED_GREEN_OBJ));
  let conf = max(mix(confPix, min(clamp(fld.y, 0.0, 1.0), veto), k), person * smoothstepf(PERSON_LUM_LO, PERSON_LUM_HI, lumI)) * confSignal * (1.0 - p[16].w * (1.0 - redKeep));
  let subjRaw = select(0.0, max(subjectWeight(uv, clamp(fld.y, 0.0, 1.0) * k, bdev), g_subjPrior * smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev)), p[16].w > 0.0);
  g_subjOut = subjRaw;
  let an = animalStrength(uv);
  let subj = max(subjRaw, select(0.0, an.y * smoothstepf(BD_HOLD_LO, BD_HOLD_HI, bdev), p[16].w > 0.0)) * p[16].w * p[22].z * an.x;
  if (p[0].w > 0.5) { return vec3(k, confPix, clamp(fld.y, 0.0, 1.0)); }
  var gainV = rg3 * wb;
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
    o *= mix(rc, vec3(hazeLiftRatio(y0, p[17].w * (1.0 - HAZE_LIFT_FAR_KEEP))), veilFar);
    hf = select(1.0, lum(o) / y0, y0 > 1e-6);
  }
  var Y = lum(o);
  let Ylv = Y + ((Y - black) / (white - black) - Y) * levelsMix;
  var ratio = select(1.0, max(0.0, Ylv) / Y, Y > 1e-5);
  o *= ratio;
  Y = max(0.0, Ylv);

  let depart = select(1.0, smoothstepf(BD_SUBJ_LO, BD_SUBJ_HI, bdev), p[16].w > 0.0);
  let cbY = pow(max(Y, 0.0), 1.0 / 3.0);
  let tw = toneWeight(subj, an, depart, lab0);
  let ow = tw * smoothstepf(SP_DARK_LO, SP_DARK_HI, cbY);
  let popS = popStrength(an);
  let popP = ow * popS * p[23].w;
  // AI subject restore amount (SEG_RESTORE): 0 without a real AI mask on the frame.
  var segS = 0.0;
  if (p[24].y > 0.5) { segS = tw * smoothstepf(SR_DARK_LO, SR_DARK_HI, cbY) * p[23].w; }
  if (clarity > 0.0) {
    let encY = linearToSrgb(vec3(Y)).x;
    let eq = sampleClahe(uv, encY, tilesX, tilesY, bins);
    let encNew = clamp(encY + (eq - encY) * (clarity + SP_CLARITY * popP), 0.0, 1.0);
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
  let vividW = smoothstepf(VIVID_C_LO, VIVID_C_HI, cSrc) * veilFar;
  let cMin = VIVID_KEEP * cSrc * vividW;
  if (C > 1e-6 && C * scale < cMin) { scale = cMin / C; }
  scale *= saturation;
  let onFar = hueFar(lab0.yz, veilHue, ON_FAR_LO, ON_FAR_HI, achroma);
  let gnab = greenNeutral(lab.x, lab.yz, p[22].w * (1.0 - RED_GN_OBJ_KEEP * conf));
  lab = vec3(lab.x, gnab);
  // Under an AI mask the subject's cast is the AI restore's alone (see the GLSL).
  let tN = objectNeutral(lab.x, lab.yz, lin, onFar, select(ow, 0.0, p[24].y > 0.5), popS) * smoothstepf(SP_KEEP_LO, SP_KEEP_HI, lab.x);
  let personS = person * (1.0 - p[16].w * (1.0 - redKeep));
  scale *= warmClamp(lab.yz, lin, onFar, personS, select(popS, p[16].w, p[24].y > 0.5));
  let nab = clearCast(lab.yz * scale, veilHue, tN / ON_MIX);
  let Ls = lab.x;
  var lk = deepBlueLook(vec3(Ls, skinTone(Ls, nab, personS)), look, 1.0 - veilConf, p[16].x, p[16].y);
  let gab = warmMaterial(lk.x, redGuard(lk.x, lk.yz, lab0.yz, person, onFar), p[22].w, onFar);
  lk = vec3(lk.x, gab);
  let lkV = vividLook(lk, p[23].z, p[22].w);
  var Lv = lkV.x;
  if (popP > 0.0 && p[24].y <= 0.5) { Lv = vividLook(lk, p[23].z * (1.0 - SP_VIVID * min(1.0, popP)), p[22].w).x; }
  // Under an AI mask the pop's own lift is left out (see the GLSL).
  let Lp = select(popLift(Lv, popP), Lv, p[24].y > 0.5);
  let cf = mix(SP_CHROMA_DARK, SP_CHROMA, smoothstepf(SP_KEEP_LO, SP_KEEP_HI, Lv));
  lk = vec3(Lp, lkV.yz * (1.0 + cf * (Lp / max(1e-4, Lv) - 1.0)));
  lk = vec3(lk.x, highlightPink(lk.x, lk.yz));
  lk = vec3(lk.x, popHue(lk.yz, lab0.yz, clamp(ow * popS, 0.0, 1.0)));
  let wk = smoothstepf(WP_WLO, WP_WHI, ow) * p[24].z * select(depart, 0.0, p[24].y > 0.5) * smoothstepf(WP_CAST_LO, WP_CAST_HI, length(lab.yz) * scale);
  lk = vec3(lk.x, warmPop(lk.x, lk.yz, wk));
  let bl = blueLook(lk, params.p[25].w, p[22].w);
  lk = bl.xyz;
  lk = vec3(lk.x, waterTint(lk.yz, params.p[26].w, p[22].w));
  lk = vec3(lk.x, richLook(lk, p[23].z));
  if (params.p[25].x > 0.0) {
    let sb = seabedW(uv) * (1.0 - vividW) * params.p[25].x;
    lk = vec3(lk.x + SB_LIFT * sb, mix(lk.yz, vec2<f32>(cos(SB_HUE), sin(SB_HUE)) * SB_CHROMA + SB_KEEP * lk.yz, sb));
  }
  // AI subject restore: after every look, so none of them amplifies it.
  if (segS > 0.0) { lk = segRestore(lk, segS, (lumI + DG_EPS) / (guideLum(uv) + DG_EPS), 0.0, segColourK(an), segS * max(0.0, 1.0 - 1.0 / max(p[23].w, 1.0))); }
  // Tone target (analyze.ts TONE, p24.w): one gamma on the graded lightness, the same for every pixel of the frame.
  if (params.p[24].w > 1.0) { lk = vec3(pow(max(lk.x, 0.0), params.p[24].w), lk.yz); }
  let o1 = oklabToLinear(capChroma(lk, max(max(cSrc, wk * WP_CMIN * 1.5), bl.w)));
  let o2 = fitToGamut(o1 * detailRatio(src, lin));
  let outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}`,Qe=ne.map(([e,t,n])=>`  dgTap(suv + vec2(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk, acc, sw);`).join(`
`),$e=ne.map(([e,t,n])=>`  acc += dgTap(suv + vec2<f32>(${e.toFixed(1)}, ${t.toFixed(1)}) * tx, src, ${n.toFixed(4)}, kk);`).join(`
`),et=`
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
${Qe}
  return acc / sw;
}`,tt=`
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
${$e}
  return acc.xyz / acc.w;
}`,nt=e=>e.replaceAll(`dgTap`,`dgTapNr`).replaceAll(`detailBase`,`detailBaseNr`).replaceAll(`u_source`,`u_tpNr`),rt=nt(et),it=nt(tt),at=`
vec2 rotateUV(vec2 uv, int r) {
  if (r == 1) return vec2(uv.y, 1.0 - uv.x);
  if (r == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (r == 3) return vec2(1.0 - uv.y, uv.x);
  return uv;
}`,ot=`
fn rotateUV(uv: vec2<f32>, r: u32) -> vec2<f32> {
  if (r == 1u) { return vec2(uv.y, 1.0 - uv.x); }
  if (r == 2u) { return vec2(1.0 - uv.x, 1.0 - uv.y); }
  if (r == 3u) { return vec2(1.0 - uv.y, uv.x); }
  return uv;
}`,z=e=>e.toFixed(6),B=`
const int TP_R = ${y.flowR};
const float TP_LAMBDA = ${z(y.lambda)};
const float TP_SAD_LO = ${z(y.sadLo)};
const float TP_SAD_HI = ${z(y.sadHi)};
const float TP_BETA = ${z(y.betaMax)};
const float TP_BDIFF = ${z(y.betaDiff)};
const float TP_KMIN = ${z(y.kMin)};
const float TP_KMAX = ${z(y.kMax)};
const float TP_DECAY = ${z(y.decay)};
const float TP_SUP_R = ${z(y.supportR)};
const float TP_SUP_LO = ${z(y.supportLo)};
const float TP_SUP_HI = ${z(y.supportHi)};
`,st=e=>e.replace(/const int (\w+) = ([^;]+);/g,`const $1: i32 = $2;`).replace(/const float (\w+) = ([^;]+);/g,`const $1: f32 = $2;`),ct=st(B),V=`
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}`,lt=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[36]; };`,H=`${lt}
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 o_color;
${at}
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
}`,ut=`
struct Params { p: array<vec4<f32>, 36> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
${V}
${ot}
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
}`,dt=`${lt}
uniform sampler2D u_lum;
uniform sampler2D u_lumPrev;
out vec4 o_color;
${B}
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
}`,ft=`
@group(0) @binding(0) var u_lum: texture_2d<f32>;
@group(0) @binding(1) var u_lumPrev: texture_2d<f32>;
${V}
${ct}
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
}`,pt=`${lt}
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
${B}
// No guide here (grade-shader animalStrength reads the AI mask plainly bilinear at 1/8 resolution).
float segGuideLum(vec2 uv) { return -1.0; }
${R}
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
}`,U=`
struct Params { p: array<vec4<f32>, 36> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
@group(0) @binding(10) var u_data3: texture_2d<f32>;
@group(0) @binding(6) var u_lum: texture_2d<f32>;
@group(0) @binding(7) var u_flow: texture_2d<f32>;
@group(0) @binding(8) var u_histf: texture_2d<f32>;
struct FieldOut { @location(0) f0: vec4<f32>, @location(1) f1: vec4<f32> };
${V}
${ct}
// No guide here (grade-shader animalStrength reads the AI mask plainly bilinear at 1/8 resolution).
fn segGuideLum(uv: vec2<f32>) -> f32 { return -1.0; }
${Ze}
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
}`,mt=`
const int NR_RT = ${o.refineTaps};
const int NR_RSTEP = ${o.refineStep};
const float NR_RBIAS = ${z(o.refineBias)};
const float NR_BLK_LO = ${z(o.blockLo)};
const float NR_BLK_HI = ${z(o.blockHi)};
const int NR_TX = ${o.tilesX};
const int NR_TY = ${o.tilesY};
const int NR_T = ${o.tileTaps};
const float NR_TEX_LO = ${z(o.texLo)};
const float NR_TEX_HI = ${z(o.texHi)};
const float NR_TILES_MIN = ${z(o.tilesMin)};
const float NR_EPS = ${z(o.eps)};
const float NR_LUM_LO = ${z(o.lumLo)};
const float NR_LUM_HI = ${z(o.lumHi)};
const float NR_DEAD = ${z(o.dead)};
const int NR_BINS = ${o.bins};
const float NR_BIN_MIN = ${z(o.binMin)};
const float NR_BIN_MAX = ${z(o.binMax)};
const float NR_EMAX = ${z(o.eMax)};
const float NR_C0_LO = ${z(o.c0Lo)};
const float NR_C0_HI = ${z(o.c0Hi)};
const float NR_L_LO = ${z(o.lLo)};
const float NR_L_HI = ${z(o.lHi)};
const float NR_A_W = ${z(o.auto.w)};
const float NR_A_LO = ${z(o.auto.gateLo)};
const float NR_A_HI = ${z(o.auto.gateHi)};
const float NR_S_W = ${z(o.strong.w)};
const float NR_S_LO = ${z(o.strong.gateLo)};
const float NR_S_HI = ${z(o.strong.gateHi)};
`,ht=st(mt),gt=`
vec2 nrUp(vec2 t) { return vec2(t.x, 1.0 - t.y); }
vec3 nrSrc(vec2 t) { return textureLod(u_source, rotateUV(nrUp(t), int(p[0].x + 0.5)), 0.0).rgb; }`,_t=`
fn nrSrc(t: vec2<f32>) -> vec3<f32> { return textureSampleLevel(u_source, samp, rotateUV(t, u32(params.p[0].x + 0.5)), 0.0).rgb; }`,vt=`
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
}`,yt=`
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
}`,bt=`${lt}
uniform sampler2D u_source;
uniform sampler2D u_tpFlow;
uniform sampler2D u_nrPrev;
uniform sampler2D u_nrLevel;
out vec4 o_color;
${at}
${mt}
${gt}
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
    vec3 c[${o.refineTaps*o.refineTaps}];
    ivec2 q[${o.refineTaps*o.refineTaps}];
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
}`,xt=`
struct Params { p: array<vec4<f32>, 36> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(6) var u_tpFlow: texture_2d<f32>;
@group(0) @binding(7) var u_nrPrev: texture_2d<f32>;
@group(0) @binding(8) var u_nrLevel: texture_2d<f32>;
${V}
${ot}
${ht}
${_t}
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
    var c: array<vec3<f32>, ${o.refineTaps*o.refineTaps}>;
    var q: array<vec2<i32>, ${o.refineTaps*o.refineTaps}>;
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
}`,St=`${lt}
uniform sampler2D u_source;
uniform sampler2D u_nrFlow;
uniform sampler2D u_nrPrev;
uniform sampler2D u_tpLum;
out vec4 o_color;
${at}
${mt}
${gt}
${vt}
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
}`,Ct=`
struct Params { p: array<vec4<f32>, 36> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(6) var u_nrFlow: texture_2d<f32>;
@group(0) @binding(7) var u_nrPrev: texture_2d<f32>;
@group(0) @binding(8) var u_tpLum: texture_2d<f32>;
${V}
${ot}
${ht}
${_t}
${yt}
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
}`,wt=`${lt}
uniform sampler2D u_source;
uniform sampler2D u_nrFlow;
uniform sampler2D u_nrPrev;
uniform sampler2D u_nrLevel;
out vec4 o_color;
${at}
${mt}
${gt}
${vt}
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
}`,Tt=`
struct Params { p: array<vec4<f32>, 36> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(6) var u_nrFlow: texture_2d<f32>;
@group(0) @binding(7) var u_nrPrev: texture_2d<f32>;
@group(0) @binding(8) var u_nrLevel: texture_2d<f32>;
${V}
${ot}
${ht}
${_t}
${yt}
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
}`,Et=`
${B}
vec2 tpUV(vec2 uv) { return vec2(uv.x, 1.0 - uv.y); }
vec3 temporalStage(vec3 col, vec2 uv) {
  vec3 kk = clamp(texture(u_tpF1, tpUV(uv)).rgb, vec3(TP_KMIN), vec3(TP_KMAX));
  return linearToSrgb(srgbToLinear(col) * kk);
}`,Dt=`
${ct}
fn tpUV(uv: vec2<f32>) -> vec2<f32> { return uv; }
fn temporalStage(col: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let kk = clamp(textureSampleLevel(u_tpF1, samp, tpUV(uv), 0.0).rgb, vec3<f32>(TP_KMIN), vec3<f32>(TP_KMAX));
  return linearToSrgb(srgbToLinear(col) * kk);
}`;function W(e){return e.replace(`var u_source: texture_2d<f32>;`,`var u_source: texture_external;`).replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g,`textureSampleBaseClampToEdge(u_source, samp, $1)`)}var G=`
vec2 rotateUV(vec2 uv, int r) {
  if (r == 1) return vec2(uv.y, 1.0 - uv.x);
  if (r == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (r == 3) return vec2(1.0 - uv.y, uv.x);
  return uv;
}`,Ot=`
fn rotateUV(uv: vec2<f32>, r: u32) -> vec2<f32> {
  if (r == 1u) { return vec2(uv.y, 1.0 - uv.x); }
  if (r == 2u) { return vec2(1.0 - uv.x, 1.0 - uv.y); }
  if (r == 3u) { return vec2(1.0 - uv.y, uv.x); }
  return uv;
}`,K=`#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = vec2(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
}`,kt=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(std140) uniform Params { vec4 p[36]; };
uniform sampler2D u_source;
uniform sampler2D u_data0;
uniform sampler2D u_data1;
uniform sampler2D u_data2;
uniform sampler2D u_data3;
uniform sampler2D u_tpF0;
uniform sampler2D u_tpF1;
uniform sampler2D u_tpNr;
in vec2 v_uv;
out vec4 o_color;
${G}
// The guide of the AI mask's edge-aware read (grade-shader animalStrength): the source's luma at upright uv.
float segGuideLum(vec2 uv) { return dot(textureLod(u_source, rotateUV(uv, int(p[0].x + 0.5)), 0.0).rgb, vec3(0.2126, 0.7152, 0.0722)); }
${R}
${et}
${rt}
${Et}
void main() {
  int rot = int(p[0].x + 0.5);
  vec2 suv = rotateUV(v_uv, rot);
  // Noise reduction on (p26.x, temporal.ts): the source is the denoised frame (u_tpNr, drawn at this target's
  // size with the same triangle, so this fragment's own texel), and the detail guard reads it too.
  bool nr = p[26].x > 0.5;
  vec2 nuv = gl_FragCoord.xy / vec2(textureSize(u_tpNr, 0));
  vec3 src = nr ? textureLod(u_tpNr, nuv, 0.0).rgb : texture(u_source, suv).rgb;
  // Temporal layer (temporal.ts): tracked subject mask as prior, then the anti-crawl correction.
  bool tp = p[23].x > 0.5 && p[23].y > 0.5;
  g_subjPrior = tp ? texture(u_tpF0, tpUV(v_uv)).a : 0.0;
  vec3 base = nr ? detailBaseNr(nuv, src) : detailBase(suv, src);
  vec3 col = gradeD(src, base, v_uv);
  if (tp) col = temporalStage(col, v_uv);
  o_color = vec4(col, 1.0);
}`,At=`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform int u_rotation;
uniform vec2 u_srcSize;
uniform vec2 u_outSize;
uniform vec4 u_rect; // sub-rectangle of the upright frame (x, y, w, h in 0..1)
in vec2 v_uv;
out vec4 o_color;
${G}
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
}`,jt=`
struct Params { p: array<vec4<f32>, 36> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(3) var u_data0: texture_2d<f32>;
@group(0) @binding(4) var u_data1: texture_2d<f32>;
@group(0) @binding(5) var u_data2: texture_2d<f32>;
@group(0) @binding(10) var u_data3: texture_2d<f32>;
@group(0) @binding(6) var u_tpF0: texture_2d<f32>;
@group(0) @binding(7) var u_tpF1: texture_2d<f32>;
@group(0) @binding(9) var u_tpNr: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}
${Ot}
// The guide of the AI mask's edge-aware read (grade-shader animalStrength): the source's luma at upright uv.
fn segGuideLum(uv: vec2<f32>) -> f32 { return dot(textureSampleLevel(u_source, samp, rotateUV(uv, u32(params.p[0].x + 0.5)), 0.0).rgb, vec3<f32>(0.2126, 0.7152, 0.0722)); }
${Ze}
${tt}
${it}
${Dt}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let rot = u32(params.p[0].x + 0.5);
  let suv = rotateUV(in.uv, rot);
  // Noise reduction on (p26.x): the source is the denoised frame, this fragment's own texel of u_tpNr.
  let nr = params.p[26].x > 0.5;
  let nuv = in.pos.xy / vec2<f32>(textureDimensions(u_tpNr));
  var src = textureSampleLevel(u_source, samp, suv, 0.0).rgb;
  if (nr) { src = textureSampleLevel(u_tpNr, samp, nuv, 0.0).rgb; }
  let tp = params.p[23].x > 0.5 && params.p[23].y > 0.5;
  let prior = textureSampleLevel(u_tpF0, samp, tpUV(in.uv), 0.0).a;
  g_subjPrior = select(0.0, prior, tp);
  var base = src;
  if (nr) { base = detailBaseNr(nuv, src); } else { base = detailBase(suv, src); }
  var col = gradeD(src, base, in.uv);
  if (tp) { col = temporalStage(col, in.uv); }
  return vec4(col, 1.0);
}`,Mt=`
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
${Ot}
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
}`;function Nt(e){return e.replace(`var u_source: texture_2d<f32>;`,`var u_source: texture_external;`).replace(/textureSampleLevel\(u_source, samp, ([^;]*?), 0\.0\)/g,`textureSampleBaseClampToEdge(u_source, samp, $1)`)}var Pt=Nt(jt),Ft=Nt(Mt),It=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_before;
uniform sampler2D u_graded;
uniform float u_split;
uniform int u_rot;
in vec2 v_uv;
out vec4 o_color;
${G}
void main() {
  if (v_uv.x < u_split) o_color = vec4(texture(u_before, rotateUV(v_uv, u_rot)).rgb, 1.0);
  else o_color = vec4(texelFetch(u_graded, ivec2(gl_FragCoord.xy), 0).rgb, 1.0);
}`,Lt=`
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
${Ot}
@fragment fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let orig = textureSampleLevel(u_source, samp, rotateUV(in.uv, u32(cp.rot + 0.5)), 0.0).rgb;
  let graded = textureLoad(u_graded, vec2<i32>(in.pos.xy), 0).rgb;
  return vec4(select(graded, orig, in.uv.x < cp.split), 1.0);
}`,Rt=Nt(Lt),zt=2e4,q=null,Bt=[];function J(e){if(typeof MessageChannel>`u`){setTimeout(e,0);return}q||(q=new MessageChannel,q.port1.onmessage=()=>{let e=Bt.shift();Bt.length||q.port1.unref?.(),e?.()}),Bt.length||q.port1.ref?.(),Bt.push(e),q.port2.postMessage(0)}function Vt(e,t={}){let n=t.fastMs??12,r=t.slowDelayMs??1,i=t.maxSlowTries??15e3,a=t.maxFastTries??zt,o=t.now??(()=>performance.now()),s=t.yieldTask??J,c=t.setTimer??((e,t)=>void setTimeout(e,t));return new Promise((l,u)=>{let d=o(),f=0,p=0,m=()=>{let h;try{h=e()}catch(e){return u(e)}if(h===`done`)return l();if(h===`failed`)return u(Error(t.label??`GPU readback timed out`));if(f<a&&o()-d<n)return f++,s(m);if(++p>i)return u(Error(t.label??`GPU readback timed out`));c(m,r)};m()})}function Ht(e,t,n={}){return Vt(()=>{let n=e.clientWaitSync(t,0,0);return n===e.ALREADY_SIGNALED||n===e.CONDITION_SATISFIED?`done`:n===e.WAIT_FAILED?`failed`:`wait`},n)}var Ut=3,Wt=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform ivec2 u_size;
out vec4 o;
const vec3 K = vec3(0.2126, 0.7152, 0.0722);
vec3 px(int x, int y) { return texelFetch(u_src, ivec2(x, u_size.y - 1 - y), 0).rgb; }
float luma(vec3 c) { return (16.0 + 219.0 * dot(c, K)) / 255.0; }
vec2 chroma(vec3 c) {
  float y = dot(c, K);
  return (vec2(128.0) + 224.0 * vec2((c.b - y) / 1.8556, (c.r - y) / 1.5748)) / 255.0;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int x = p.x * 4;
  if (p.y < u_size.y) {
    o = vec4(luma(px(x, p.y)), luma(px(x + 1, p.y)), luma(px(x + 2, p.y)), luma(px(x + 3, p.y)));
  } else {
    int y = (p.y - u_size.y) * 2;
    vec3 a = (px(x, y) + px(x + 1, y) + px(x, y + 1) + px(x + 1, y + 1)) * 0.25;
    vec3 b = (px(x + 2, y) + px(x + 3, y) + px(x + 2, y + 1) + px(x + 3, y + 1)) * 0.25;
    o = vec4(chroma(a), chroma(b));
  }
}`;function Gt(){try{return typeof location>`u`||new URLSearchParams(location.search).get(`yuv`)!==`0`}catch{return!0}}var Kt=class{kind=`webgl2`;canvas;outputWidth=0;outputHeight=0;lastDrawMs=0;lastCaptureMs=0;gl;grade;down;comp;vao;source;data=[];uniformBuf;uniforms=new Float32Array(144);rotation=0;srcW=0;srcH=0;srcKind=``;viaCanvas=!1;scratch=null;analysisFbo=null;analysisTex=null;analysisW=0;analysisH=0;pbo=null;readbackInFlight=!1;previewScale=1;tpOn=!1;tpValid=!1;tpLum;tpFlow;tpField;tpLowW=0;tpLowH=0;tpIdx=0;tpTex=null;tpFbo=null;nrOn=!1;nrRefine;nrLevel;nrProg;nrTex=null;nrFbo=null;nrW=0;nrH=0;nrLowW=0;nrLowH=0;nrIdx=0;nrWritten=!1;nrHist=!1;nrIdle=!0;nrCount=o.idleEvery-2;nrLevels=new Float32Array(o.bins*4);nr10=!0;beforeTex=null;beforePx=0;wipe=null;lastGraded=null;drawTarget=null;sourceFbo=null;constructor(e){this.canvas=e;let t=e.getContext(`webgl2`,{alpha:!1,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0,powerPreference:`high-performance`});if(!t)throw Error(`WebGL2 not supported`);this.gl=t;let n=!!t.getExtension(`EXT_color_buffer_float`);this.grade=this.link(K,kt,[`u_source`,`u_data0`,`u_data1`,`u_data2`,`u_data3`,`u_tpF0`,`u_tpF1`,`u_tpNr`]),this.down=this.link(K,At,[`u_source`,`u_rotation`,`u_srcSize`,`u_outSize`,`u_rect`]),this.comp=this.link(K,It,[`u_before`,`u_graded`,`u_split`,`u_rot`]),this.vao=t.createVertexArray(),this.source=this.makeTexture(t.LINEAR);for(let e=0;e<4;e++){let e=this.makeTexture(t.NEAREST);t.bindTexture(t.TEXTURE_2D,e),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,1,1,0,t.RGBA,t.FLOAT,new Float32Array([0,0,0,0])),this.data.push(e)}this.uniformBuf=t.createBuffer(),t.bindBuffer(t.UNIFORM_BUFFER,this.uniformBuf),t.bufferData(t.UNIFORM_BUFFER,this.uniforms.byteLength,t.DYNAMIC_DRAW);let r=t.getUniformBlockIndex(this.grade.prog,`Params`);if(t.uniformBlockBinding(this.grade.prog,r,0),t.bindBufferBase(t.UNIFORM_BUFFER,0,this.uniformBuf),n){try{this.tpLum=this.link(K,H,[`u_source`]),this.tpFlow=this.link(K,dt,[`u_lum`,`u_lumPrev`]),this.tpField=this.link(K,pt,[`u_data0`,`u_data1`,`u_data2`,`u_data3`,`u_lum`,`u_flow`,`u_histf`]);for(let e of[this.tpLum,this.tpField])t.uniformBlockBinding(e.prog,t.getUniformBlockIndex(e.prog,`Params`),0);this.tpOn=!0}catch(e){console.warn(`temporal layer unavailable:`,e.message)}if(this.tpOn)try{this.nrRefine=this.link(K,bt,[`u_source`,`u_tpFlow`,`u_nrPrev`,`u_nrLevel`]),this.nrLevel=this.link(K,St,[`u_source`,`u_nrFlow`,`u_nrPrev`,`u_tpLum`]),this.nrProg=this.link(K,wt,[`u_source`,`u_nrFlow`,`u_nrPrev`,`u_nrLevel`]);for(let e of[this.nrRefine,this.nrLevel,this.nrProg])t.uniformBlockBinding(e.prog,t.getUniformBlockIndex(e.prog,`Params`),0);this.nrOn=!0}catch(e){console.warn(`noise reduction unavailable:`,e.message)}}}resetTemporal(){this.tpValid=!1,this.nrWritten=!1,this.nrHist=!1,this.nrIdle&&(this.nrCount=o.idleEvery-2)}tpTarget(e,t,n){let r=this.gl,i=this.makeTexture(r.LINEAR);return n===`half`?r.texImage2D(r.TEXTURE_2D,0,r.RGBA16F,e,t,0,r.RGBA,r.HALF_FLOAT,null):n===`rgb10`?r.texImage2D(r.TEXTURE_2D,0,r.RGB10_A2,e,t,0,r.RGBA,r.UNSIGNED_INT_2_10_10_10_REV,null):r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,t,0,r.RGBA,r.UNSIGNED_BYTE,null),i}tpFramebuffer(...e){let t=this.gl,n=t.createFramebuffer();return t.bindFramebuffer(t.FRAMEBUFFER,n),e.forEach((e,n)=>t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0+n,t.TEXTURE_2D,e,0)),t.bindFramebuffer(t.FRAMEBUFFER,null),n}tpRelease(){let e=this.gl;if(this.lastGraded=null,this.tpTex){let t=this.tpTex;for(let n of[...t.lum,...t.f0,t.f1,t.flow])e.deleteTexture(n)}if(this.tpFbo){let t=this.tpFbo;for(let n of[...t.lum,...t.field,t.flow])e.deleteFramebuffer(n)}this.tpTex=null,this.tpFbo=null}nrRelease(){let e=this.gl;if(this.nrTex)for(let t of[this.nrTex.flow,this.nrTex.level,...this.nrTex.out])e.deleteTexture(t);if(this.nrFbo)for(let t of[this.nrFbo.flow,this.nrFbo.level,...this.nrFbo.out])e.deleteFramebuffer(t);this.nrTex=null,this.nrFbo=null,this.nrWritten=!1,this.nrHist=!1,this.nrIdle&&(this.nrCount=o.idleEvery-2)}nrEnsure(){let e=this.gl,t=this.canvas.width,n=this.canvas.height;if(this.nrTex&&t===this.nrW&&n===this.nrH&&this.nrLowW===this.tpLowW&&this.nrLowH===this.tpLowH)return!0;this.nrRelease();let r=()=>[this.tpTarget(t,n,this.nr10?`rgb10`:`rgba8`),this.tpTarget(t,n,this.nr10?`rgb10`:`rgba8`)],i=r(),a=i.map(e=>this.tpFramebuffer(e));if(this.nr10){e.bindFramebuffer(e.FRAMEBUFFER,a[0]);let t=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!t){console.warn(`noise reduction: RGB10_A2 is not renderable here, using RGBA8 history`);for(let t of i)e.deleteTexture(t);for(let t of a)e.deleteFramebuffer(t);this.nr10=!1,i=r(),a=i.map(e=>this.tpFramebuffer(e))}}let s=this.tpTarget(this.tpLowW,this.tpLowH,`half`),c=this.tpTarget(o.bins,1,`half`);return this.nrTex={flow:s,level:c,out:i},this.nrFbo={flow:this.tpFramebuffer(s),level:this.tpFramebuffer(c),out:a},this.nrW=t,this.nrH=n,this.nrLowW=this.tpLowW,this.nrLowH=this.tpLowH,!0}nrValid(e){let t=this.gl;this.uniforms[105]=+!!e,t.bindBuffer(t.UNIFORM_BUFFER,this.uniformBuf),t.bufferSubData(t.UNIFORM_BUFFER,420,this.uniforms.subarray(105,106)),t.bindBufferBase(t.UNIFORM_BUFFER,0,this.uniformBuf),t.bindVertexArray(this.vao)}nrMeasure(){let e=this.gl,t=this.nrTex,n=this.nrFbo,r=t.out[1-this.nrIdx];e.bindFramebuffer(e.FRAMEBUFFER,n.flow),e.viewport(0,0,this.tpLowW,this.tpLowH),e.useProgram(this.nrRefine.prog),this.bindTex(0,this.source,this.nrRefine,`u_source`),this.bindTex(4,this.tpTex.flow,this.nrRefine,`u_tpFlow`),this.bindTex(5,r,this.nrRefine,`u_nrPrev`),this.bindTex(6,t.level,this.nrRefine,`u_nrLevel`),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,n.level),e.viewport(0,0,o.bins,1),e.useProgram(this.nrLevel.prog),this.bindTex(0,this.source,this.nrLevel,`u_source`),this.bindTex(4,t.flow,this.nrLevel,`u_nrFlow`),this.bindTex(5,r,this.nrLevel,`u_nrPrev`),this.bindTex(6,this.tpTex.lum[this.tpIdx],this.nrLevel,`u_tpLum`),e.drawArrays(e.TRIANGLES,0,3)}nrGateOpen(){let e=this.gl;e.bindFramebuffer(e.FRAMEBUFFER,this.nrFbo.level);let t=e.getParameter(e.PIXEL_PACK_BUFFER_BINDING);return t&&e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.readPixels(0,0,o.bins,1,e.RGBA,e.FLOAT,this.nrLevels),t&&e.bindBuffer(e.PIXEL_PACK_BUFFER,t),ve(this.uniforms[104],this.nrLevels,4)}nrDraw(){let e=this.gl,t=this.nrTex;e.bindFramebuffer(e.FRAMEBUFFER,this.nrFbo.out[this.nrIdx]),e.viewport(0,0,this.nrW,this.nrH),e.useProgram(this.nrProg.prog),this.bindTex(0,this.source,this.nrProg,`u_source`),this.bindTex(4,t.flow,this.nrProg,`u_nrFlow`),this.bindTex(5,t.out[1-this.nrIdx],this.nrProg,`u_nrPrev`),this.bindTex(6,t.level,this.nrProg,`u_nrLevel`),e.drawArrays(e.TRIANGLES,0,3),this.nrWritten=!0}nrPasses(){let e=this.uniforms[106]>.5,t=o.idleEvery;if(this.nrIdle){if(e)return!1;let n=this.nrCount++%t;return n===t-2?(this.nrValid(!1),this.nrDraw(),!1):n!==t-1||!this.nrWritten||(this.nrIdx=1-this.nrIdx,this.nrValid(!0),this.nrMeasure(),!this.nrGateOpen())?(this.nrWritten=!1,!1):(this.nrIdle=!1,this.nrCount=0,this.nrHist=!0,this.nrDraw(),!0)}return this.nrWritten&&!e?(this.nrIdx=1-this.nrIdx,this.nrHist=!0):this.nrWritten||(this.nrHist=!1),this.nrValid(this.nrHist),this.nrMeasure(),this.nrDraw(),this.nrHist&&!e&&++this.nrCount%t===0&&!this.nrGateOpen()&&(this.nrIdle=!0,this.nrCount=0,this.nrWritten=!1,this.nrHist=!1),!0}tpEnsure(){if(!this.tpOn||!this.outputWidth)return!1;let e=Math.max(1,Math.ceil(this.outputWidth/y.scale)),t=Math.max(1,Math.ceil(this.outputHeight/y.scale));if(this.tpTex&&e===this.tpLowW&&t===this.tpLowH)return!0;this.tpRelease();let n=(e,t)=>this.tpTarget(e,t,`half`),r={lum:[n(e,t),n(e,t)],f0:[n(e,t),n(e,t)],f1:n(e,t),flow:n(e,t)};return this.tpTex=r,this.tpFbo={lum:r.lum.map(e=>this.tpFramebuffer(e)),field:r.f0.map(e=>this.tpFramebuffer(e,r.f1)),flow:this.tpFramebuffer(r.flow)},this.tpLowW=e,this.tpLowH=t,this.tpValid=!1,!0}bindTex(e,t,n,r){let i=this.gl;i.activeTexture(i.TEXTURE0+e),i.bindTexture(i.TEXTURE_2D,t),i.uniform1i(n.loc.get(r),e)}tpPasses(){let e=this.gl,t=this.tpTex,n=this.tpFbo,r=this.tpIdx,i=1-r;this.uniforms[92]=+!!this.tpValid,e.bindBuffer(e.UNIFORM_BUFFER,this.uniformBuf),e.bufferSubData(e.UNIFORM_BUFFER,368,this.uniforms.subarray(92,93)),e.bindBufferBase(e.UNIFORM_BUFFER,0,this.uniformBuf),e.bindVertexArray(this.vao),e.viewport(0,0,this.tpLowW,this.tpLowH),e.bindFramebuffer(e.FRAMEBUFFER,n.lum[r]),e.useProgram(this.tpLum.prog),this.bindTex(0,this.source,this.tpLum,`u_source`),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,n.flow),e.useProgram(this.tpFlow.prog),this.bindTex(4,t.lum[r],this.tpFlow,`u_lum`),this.bindTex(5,t.lum[i],this.tpFlow,`u_lumPrev`),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,n.field[r]),e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),e.useProgram(this.tpField.prog);for(let e=0;e<4;e++)this.bindTex(qt(e),this.data[e],this.tpField,`u_data${e}`);this.bindTex(4,t.lum[r],this.tpField,`u_lum`),this.bindTex(5,t.flow,this.tpField,`u_flow`),this.bindTex(6,t.f0[i],this.tpField,`u_histf`),e.drawArrays(e.TRIANGLES,0,3),e.drawBuffers([e.COLOR_ATTACHMENT0])}makeTexture(e){let t=this.gl,n=t.createTexture();return t.bindTexture(t.TEXTURE_2D,n),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,e),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,e),n}link(e,t,n){let r=this.gl,i=(e,t)=>{let n=r.createShader(e);if(r.shaderSource(n,t),r.compileShader(n),!r.getShaderParameter(n,r.COMPILE_STATUS)){let e=r.getShaderInfoLog(n);throw r.deleteShader(n),Error(`Shader compile failed: `+e)}return n},a=i(r.VERTEX_SHADER,e),o=i(r.FRAGMENT_SHADER,t),s=r.createProgram();if(r.attachShader(s,a),r.attachShader(s,o),r.linkProgram(s),r.deleteShader(a),r.deleteShader(o),!r.getProgramParameter(s,r.LINK_STATUS))throw Error(`Link failed: `+r.getProgramInfoLog(s));let c=new Map;for(let e of n)c.set(e,r.getUniformLocation(s,e));return{prog:s,loc:c}}syncProfile=!1;stageMs={upload:0,temporal:0,grade:0,capture:0};syncPx=new Uint8Array(4);gpuSync(){let e=this.gl,t=e.getParameter(e.READ_FRAMEBUFFER_BINDING);e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.readPixels(0,0,1,1,e.RGBA,e.UNSIGNED_BYTE,this.syncPx),e.bindFramebuffer(e.READ_FRAMEBUFFER,t)}upload(e,t,n,r){let i=this.syncProfile?performance.now():0;try{this.uploadNow(e,t,n,r)}finally{this.syncProfile&&(this.gpuSync(),this.stageMs.upload+=performance.now()-i)}}uploadNow(e,t,n,r){let i=this.gl;this.lastGraded=null,this.rotation=r;let[a,o]=Ue(t,n,r);this.outputWidth=a,this.outputHeight=o,this.sizeCanvas(this.previewScale),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,this.source),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,0),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.NONE);let s=te(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`,c=t!==this.srcW||n!==this.srcH||s!==this.srcKind,l=e;if(!c&&this.viaCanvas&&(l=this.throughCanvas(e,t,n)),c){for(;i.getError()!==i.NO_ERROR;);i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,t,n,0,i.RGBA,i.UNSIGNED_BYTE,l),i.texSubImage2D(i.TEXTURE_2D,0,0,0,t,n,i.RGBA,i.UNSIGNED_BYTE,l);let r=i.getError();this.viaCanvas=r!==i.NO_ERROR,this.viaCanvas&&(console.warn(`WebGL direct upload of ${s} at ${t}x${n} failed (0x${r.toString(16)}); resampling through a canvas`),l=this.throughCanvas(e,t,n),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,t,n,0,i.RGBA,i.UNSIGNED_BYTE,l)),this.srcW=t,this.srcH=n,this.srcKind=s}else i.texSubImage2D(i.TEXTURE_2D,0,0,0,t,n,i.RGBA,i.UNSIGNED_BYTE,l)}gradeSource=kt;gradePrograms=new Map;setGradeSource(e){let t=this.gl,n=e??kt;this.gradePrograms.size||this.gradePrograms.set(kt,this.grade);let r=this.gradePrograms.get(n);r||(r=this.link(K,n,[`u_source`,`u_data0`,`u_data1`,`u_data2`,`u_data3`,`u_tpF0`,`u_tpF1`,`u_tpNr`]),t.uniformBlockBinding(r.prog,t.getUniformBlockIndex(r.prog,`Params`),0),this.gradePrograms.set(n,r)),this.grade=r,this.gradeSource=n,this.lastGraded=null}get context(){return this.gl}beginSourceDraw(e,t){let n=this.gl,r=this.drawTarget;if(!r||r.w!==e||r.h!==t){r&&(n.deleteTexture(r.tex),n.deleteFramebuffer(r.fbo));let i=this.tpTarget(e,t,`rgba8`);r=this.drawTarget={tex:i,fbo:this.tpFramebuffer(i),w:e,h:t}}n.bindFramebuffer(n.FRAMEBUFFER,r.fbo),n.viewport(0,0,e,t)}endSourceDraw(e,t,n){let r=this.syncProfile?performance.now():0,i=this.gl,a=this.drawTarget;if(!a||a.w!==e||a.h!==t)throw Error(`endSourceDraw without a matching beginSourceDraw`);this.lastGraded=null,this.rotation=n;let[o,s]=Ue(e,t,n);this.outputWidth=o,this.outputHeight=s,this.sizeCanvas(this.previewScale),(e!==this.srcW||t!==this.srcH||this.srcKind!==`drawn`||!this.sourceFbo)&&(i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,this.source),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.sourceFbo||=this.tpFramebuffer(this.source),this.srcW=e,this.srcH=t,this.srcKind=`drawn`,this.viaCanvas=!1),i.bindFramebuffer(i.READ_FRAMEBUFFER,a.fbo),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,this.sourceFbo),i.blitFramebuffer(0,0,e,t,0,t,e,0,i.COLOR_BUFFER_BIT,i.NEAREST),i.bindFramebuffer(i.FRAMEBUFFER,null),this.syncProfile&&(this.gpuSync(),this.stageMs.upload+=performance.now()-r)}syncIfProfiling(){this.syncProfile&&this.gpuSync()}throughCanvas(e,t,n){return(!this.scratch||this.scratch.width!==t||this.scratch.height!==n)&&(this.scratch=new OffscreenCanvas(t,n)),this.scratch.getContext(`2d`).drawImage(e,0,0,t,n),this.scratch}setPreviewScale(e){this.previewScale=Math.min(1,Math.max(.05,e)),this.outputWidth&&this.sizeCanvas(this.previewScale)}sizeCanvas(e){let t=Math.max(1,Math.round(this.outputWidth*e)),n=Math.max(1,Math.round(this.outputHeight*e));(this.canvas.width!==t||this.canvas.height!==n)&&(this.lastGraded=null,this.canvas.width=t,this.canvas.height=n)}setUniforms(e){if(e.length!==144)throw Error(`uniform block must have 144 floats`);this.uniforms.set(e),this.lastGraded=null;let t=this.gl;t.bindBuffer(t.UNIFORM_BUFFER,this.uniformBuf),t.bufferSubData(t.UNIFORM_BUFFER,0,this.uniforms)}setData(e,t){let n=this.gl;if(t.data.length!==t.width*t.height*4)throw Error(`data texture size mismatch`);this.lastGraded=null,n.activeTexture(n.TEXTURE0+qt(e)),n.bindTexture(n.TEXTURE_2D,this.data[e]),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,0),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,t.width,t.height,0,n.RGBA,n.FLOAT,t.data)}bindCommon(e){let t=this.gl;t.useProgram(e.prog),t.bindVertexArray(this.vao),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.source),t.uniform1i(e.loc.get(`u_source`),0)}render(){let e=this.gl,t=this.uniforms[93]>.5&&this.tpEnsure();t||(this.tpValid=!1);let n=t&&this.nrOn&&this.uniforms[104]>.5&&this.nrEnsure();n||(this.nrTex&&this.nrRelease(),this.nrWritten=!1);let r=this.syncProfile?performance.now():0;t?this.tpPasses():this.uniforms[92]!==0&&(this.uniforms[92]=0,e.bindBuffer(e.UNIFORM_BUFFER,this.uniformBuf),e.bufferSubData(e.UNIFORM_BUFFER,368,this.uniforms.subarray(92,93)));let i=n&&this.nrPasses();if(!i&&this.uniforms[104]!==0&&(this.uniforms[104]=0,e.bindBuffer(e.UNIFORM_BUFFER,this.uniformBuf),e.bufferSubData(e.UNIFORM_BUFFER,416,this.uniforms.subarray(104,105))),this.syncProfile){this.gpuSync();let e=performance.now();this.stageMs.temporal+=e-r,r=e}let a=this.uniforms[1],o=null;if(a>0){let t=this.wipeTarget();e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),o=t.tex}else e.bindFramebuffer(e.FRAMEBUFFER,null);e.viewport(0,0,this.canvas.width,this.canvas.height),this.bindCommon(this.grade);for(let e=0;e<4;e++)this.bindTex(qt(e),this.data[e],this.grade,`u_data${e}`);this.bindTex(4,t?this.tpTex.f0[this.tpIdx]:this.data[0],this.grade,`u_tpF0`),this.bindTex(5,t?this.tpTex.f1:this.data[0],this.grade,`u_tpF1`),this.bindTex(7,i?this.nrTex.out[this.nrIdx]:this.data[0],this.grade,`u_tpNr`),e.bindBufferBase(e.UNIFORM_BUFFER,0,this.uniformBuf),e.drawArrays(e.TRIANGLES,0,3),a>0&&this.composite(o,a),t&&(this.tpIdx=1-this.tpIdx,this.tpValid=!0),this.lastGraded=o,this.syncProfile&&(this.gpuSync(),this.stageMs.grade+=performance.now()-r)}wipeTarget(){let e=this.gl,t=this.canvas.width,n=this.canvas.height;if(this.wipe&&this.wipe.w===t&&this.wipe.h===n)return this.wipe;this.wipe&&(e.deleteTexture(this.wipe.tex),e.deleteFramebuffer(this.wipe.fbo));let r=this.tpTarget(t,n,`rgba8`);return this.wipe={tex:r,fbo:this.tpFramebuffer(r),w:t,h:n},this.wipe}composite(e,t){let n=this.gl;n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,this.canvas.width,this.canvas.height),n.useProgram(this.comp.prog),n.bindVertexArray(this.vao),this.bindTex(0,this.beforeTex??this.source,this.comp,`u_before`),this.bindTex(4,e,this.comp,`u_graded`),n.uniform1f(this.comp.loc.get(`u_split`),t),n.uniform1i(this.comp.loc.get(`u_rot`),this.beforeTex?0:this.rotation),n.drawArrays(n.TRIANGLES,0,3)}recomposite(e){return this.lastGraded?(this.uniforms[1]=e,this.composite(this.lastGraded,e),!0):!1}setBefore(e,t,n){let r=this.gl;if(this.lastGraded=null,!e){this.beforeTex&&r.deleteTexture(this.beforeTex),this.beforeTex=null,this.beforePx=0;return}this.beforeTex||=this.makeTexture(r.LINEAR),this.beforePx=t*n,r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,this.beforeTex),r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,0),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,r.NONE);try{r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,r.RGBA,r.UNSIGNED_BYTE,e)}catch{r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,r.RGBA,r.UNSIGNED_BYTE,this.throughCanvas(e,t,n))}}capture=null;forceCapture=null;captureBench=``;readbackRing=[];slotWaiters=[];readbackHost=null;nv12=null;nv12Failed=!1;nv12Off=!1;readbackFormat=`RGBA`;flipTarget=null;setCaptureMode(e){this.forceCapture=e===`auto`?null:e===`readback`?`readback`:`canvas`,this.capture=null,this.nv12Off=!1}async renderToFrame(e,t){this.sizeCanvas(1);let n=performance.now();this.render();let r=performance.now();if(this.lastDrawMs=r-n,this.capture===null){let n=this.forceCapture??(typeof location<`u`?new URLSearchParams(location.search).get(`capture`):null);if(n===`canvas`)this.capture=n,this.captureBench=`forced ${n}`;else{let i=await this.benchmarkCapture(e,t,n===`readback`);return this.lastCaptureMs=performance.now()-r,this.stageMs.capture+=this.lastCaptureMs,i}}let i=this.capture===`readback`?await this.captureReadback(e,t):new VideoFrame(this.canvas,{timestamp:e,duration:t});return this.lastCaptureMs=performance.now()-r,this.stageMs.capture+=this.lastCaptureMs,i}async benchmarkCapture(e,t,n=!1){let r=n?[`forced readback`]:[],i=1/0,a=1/0,o=null;if(this.gpuSync(),!n)try{let n=performance.now();for(let n=0;n<3;n++){let n=new VideoFrame(this.canvas,{timestamp:e,duration:t});o?.close(),o=n}i=(performance.now()-n)/3,r.push(`canvas ${i.toFixed(1)} ms`)}catch(e){r.push(`canvas failed (${e.message.split(`
`)[0].slice(0,50)})`)}let s=this.canvas.width,c=this.canvas.height;this.nv12Off=!0;let l=performance.now(),u=Array.from({length:3},()=>this.captureReadback(e,t));this.nv12Off=!1;let d=this.nv12Targets(s,c)?Array.from({length:3},()=>this.captureReadback(e,t)):[],f=async(e,t)=>{let n=await Promise.allSettled(e),r=performance.now(),i=n.filter(e=>e.status===`fulfilled`).map(e=>e.value);return{ok:i,err:n.find(e=>e.status===`rejected`)?.reason,end:r,ms:i.length===e.length&&e.length?(r-t())/e.length:1/0}},p=await f(u,()=>l),m=await f(d,()=>p.end);a=Math.min(p.ms,m.ms),p.ms<1/0?r.push(`readback ${p.ms.toFixed(1)} ms`):r.push(`readback failed (${(p.err?.message??`?`).split(`
`)[0].slice(0,50)})`),d.length&&r.push(m.ms<1/0?`NV12 readback ${m.ms.toFixed(1)} ms`:`NV12 failed (${(m.err?.message??`?`).split(`
`)[0].slice(0,50)})`);let h=m.ms<=p.ms*1.5;this.nv12Off=!h,this.capture=n||a<i?`readback`:`canvas`,this.captureBench=r.join(`, `),console.info(`WebGL2 capture bench: ${this.captureBench} → ${this.capture}${this.capture===`readback`?h?` (NV12)`:` (RGBA)`:``}`);let g=h?m.ok:p.ok,_=this.capture===`readback`?g.shift():o;for(let e of[...p.ok,...m.ok])e!==_&&e.close();_!==o&&o?.close();let v=this.gl;for(;this.readbackRing.length>Ut;){let e=this.readbackRing.findIndex(e=>!e.busy);if(e<0)break;v.deleteBuffer(this.readbackRing[e].pbo),this.readbackRing.splice(e,1)}if(h||this.releaseNv12(),!_)throw Error(`export capture failed`);return _}async readbackSlotFree(){if(this.capture===`readback`)for(;this.readbackRing.length>=Ut&&!this.readbackRing.some(e=>!e.busy);)await new Promise(e=>{this.slotWaiters.push(e),setTimeout(e,50)})}releasePreviewTargets(){let e=this.gl,t=0,n=0;return this.lastGraded=null,this.wipe&&=(e.deleteTexture(this.wipe.tex),e.deleteFramebuffer(this.wipe.fbo),t++,n+=this.wipe.w*this.wipe.h*4,null),this.beforeTex&&(e.deleteTexture(this.beforeTex),t++,n+=this.beforePx*4,this.beforeTex=null,this.beforePx=0),this.drawTarget&&=(e.deleteTexture(this.drawTarget.tex),e.deleteFramebuffer(this.drawTarget.fbo),t++,n+=this.drawTarget.w*this.drawTarget.h*4,null),this.tpTex&&(t+=6,n+=6*this.tpLowW*this.tpLowH*8,this.tpRelease(),this.tpValid=!1),this.nrTex&&(t+=4,n+=2*this.nrW*this.nrH*4+this.nrLowW*this.nrLowH*8+o.bins*8,this.nrRelease()),{targets:t,bytes:n}}releaseCapture(){let e=this.gl;for(let t of this.readbackRing)t.busy||e.deleteBuffer(t.pbo);this.readbackRing=this.readbackRing.filter(e=>e.busy),this.readbackHost=null,this.releaseNv12(),this.flipTarget&&!this.readbackRing.length&&(e.deleteRenderbuffer(this.flipTarget.rb),e.deleteFramebuffer(this.flipTarget.fbo),this.flipTarget=null)}releaseNv12(){let e=this.nv12;if(!e)return;let t=this.gl;t.deleteProgram(e.prog.prog),t.deleteTexture(e.src),t.deleteTexture(e.out),t.deleteFramebuffer(e.srcFbo),t.deleteFramebuffer(e.outFbo),this.nv12=null}nv12Targets(e,t){if(this.nv12Off||this.nv12Failed||e%4!=0||t%2!=0||!Gt())return null;if(this.nv12&&this.nv12.w===e&&this.nv12.h===t)return this.nv12;let n=this.gl,r=this.nv12?.prog??(()=>{try{return this.link(K,Wt,[`u_src`,`u_size`])}catch(e){return console.warn(`NV12 readback unavailable:`,e.message),this.nv12Failed=!0,null}})();if(!r)return null;this.nv12&&(n.deleteTexture(this.nv12.src),n.deleteTexture(this.nv12.out),n.deleteFramebuffer(this.nv12.srcFbo),n.deleteFramebuffer(this.nv12.outFbo));let i=(e,t)=>{let r=this.makeTexture(n.NEAREST);n.bindTexture(n.TEXTURE_2D,r),n.texStorage2D(n.TEXTURE_2D,1,n.RGBA8,e,t);let i=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,i),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,r,0);let a=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;return n.bindFramebuffer(n.FRAMEBUFFER,null),{tex:r,fbo:i,ok:a}},a=i(e,t),o=i(e/4,t*3/2);return this.nv12={prog:r,src:a.tex,srcFbo:a.fbo,out:o.tex,outFbo:o.fbo,w:e,h:t},!a.ok||!o.ok?(console.warn(`NV12 readback unavailable: framebuffer incomplete`),this.releaseNv12(),this.nv12Failed=!0,null):this.nv12}async captureReadback(e,t){let n=this.gl,r=this.canvas.width,i=this.canvas.height,a=this.nv12Targets(r,i);this.readbackFormat=a?`NV12`:`RGBA`;let o=a?r*i*3/2:r*i*4,s=this.readbackRing.find(e=>!e.busy);s||(s={pbo:n.createBuffer(),busy:!1,size:o},n.bindBuffer(n.PIXEL_PACK_BUFFER,s.pbo),n.bufferData(n.PIXEL_PACK_BUFFER,o,n.STREAM_READ),n.bindBuffer(n.PIXEL_PACK_BUFFER,null),this.readbackRing.push(s)),s.busy=!0;try{if(a)return await this.readNv12(a,s,r,i,o,e,t);let c=this.flipTarget;if(!c||c.w!==r||c.h!==i){c&&(n.deleteRenderbuffer(c.rb),n.deleteFramebuffer(c.fbo));let e=n.createRenderbuffer();n.bindRenderbuffer(n.RENDERBUFFER,e),n.renderbufferStorage(n.RENDERBUFFER,n.RGBA8,r,i),n.bindRenderbuffer(n.RENDERBUFFER,null);let t=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,t),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.RENDERBUFFER,e),n.bindFramebuffer(n.FRAMEBUFFER,null),c=this.flipTarget={rb:e,fbo:t,w:r,h:i};for(let e of this.readbackRing)e.busy&&e!==s||(n.bindBuffer(n.PIXEL_PACK_BUFFER,e.pbo),n.bufferData(n.PIXEL_PACK_BUFFER,r*i*4,n.STREAM_READ),e.size=r*i*4);n.bindBuffer(n.PIXEL_PACK_BUFFER,null)}n.bindFramebuffer(n.READ_FRAMEBUFFER,null),n.bindFramebuffer(n.DRAW_FRAMEBUFFER,c.fbo),n.blitFramebuffer(0,0,r,i,0,i,r,0,n.COLOR_BUFFER_BIT,n.NEAREST),n.bindFramebuffer(n.READ_FRAMEBUFFER,c.fbo),n.bindBuffer(n.PIXEL_PACK_BUFFER,s.pbo),s.size!==o&&(n.bufferData(n.PIXEL_PACK_BUFFER,o,n.STREAM_READ),s.size=o),n.readPixels(0,0,r,i,n.RGBA,n.UNSIGNED_BYTE,0),n.bindBuffer(n.PIXEL_PACK_BUFFER,null),n.bindFramebuffer(n.FRAMEBUFFER,null);let l=n.fenceSync(n.SYNC_GPU_COMMANDS_COMPLETE,0);n.flush();try{await Ht(n,l)}finally{n.deleteSync(l)}(!this.readbackHost||this.readbackHost.byteLength!==r*i*4)&&(this.readbackHost=new Uint8Array(r*i*4));let u=this.readbackHost;return n.bindBuffer(n.PIXEL_PACK_BUFFER,s.pbo),n.getBufferSubData(n.PIXEL_PACK_BUFFER,0,u),n.bindBuffer(n.PIXEL_PACK_BUFFER,null),new VideoFrame(u,{format:`RGBA`,codedWidth:r,codedHeight:i,timestamp:e,duration:t})}finally{s.busy=!1;for(let e of this.slotWaiters.splice(0))e()}}async readNv12(e,t,n,r,i,a,o){let s=this.gl;s.bindBuffer(s.PIXEL_PACK_BUFFER,t.pbo),t.size!==i&&(s.bufferData(s.PIXEL_PACK_BUFFER,i,s.STREAM_READ),t.size=i),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,e.srcFbo),s.blitFramebuffer(0,0,n,r,0,0,n,r,s.COLOR_BUFFER_BIT,s.NEAREST),s.bindFramebuffer(s.FRAMEBUFFER,e.outFbo),s.viewport(0,0,n/4,r*3/2),s.useProgram(e.prog.prog),s.bindVertexArray(this.vao),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e.src),s.uniform1i(e.prog.loc.get(`u_src`),0),s.uniform2i(e.prog.loc.get(`u_size`),n,r),s.drawArrays(s.TRIANGLES,0,3),s.bindTexture(s.TEXTURE_2D,this.source),s.bindFramebuffer(s.READ_FRAMEBUFFER,e.outFbo),s.bindBuffer(s.PIXEL_PACK_BUFFER,t.pbo),s.readPixels(0,0,n/4,r*3/2,s.RGBA,s.UNSIGNED_BYTE,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),s.viewport(0,0,n,r);let c=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0);s.flush();try{await Ht(s,c)}finally{s.deleteSync(c)}(!this.readbackHost||this.readbackHost.byteLength!==i)&&(this.readbackHost=new Uint8Array(i));let l=this.readbackHost;return s.bindBuffer(s.PIXEL_PACK_BUFFER,t.pbo),s.getBufferSubData(s.PIXEL_PACK_BUFFER,0,l),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),new VideoFrame(l,{format:`NV12`,codedWidth:n,codedHeight:r,timestamp:a,duration:o,colorSpace:{primaries:`bt709`,transfer:`bt709`,matrix:`bt709`,fullRange:!1}})}ensureAnalysisTargets(e,t){let n=this.gl;this.analysisTex&&this.analysisW===e&&this.analysisH===t||(this.analysisTex&&n.deleteTexture(this.analysisTex),this.analysisFbo&&n.deleteFramebuffer(this.analysisFbo),this.pbo&&n.deleteBuffer(this.pbo),this.analysisTex=this.makeTexture(n.NEAREST),n.bindTexture(n.TEXTURE_2D,this.analysisTex),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,e,t,0,n.RGBA,n.UNSIGNED_BYTE,null),this.analysisFbo=n.createFramebuffer(),n.bindFramebuffer(n.FRAMEBUFFER,this.analysisFbo),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,this.analysisTex,0),n.bindFramebuffer(n.FRAMEBUFFER,null),this.pbo=n.createBuffer(),n.bindBuffer(n.PIXEL_PACK_BUFFER,this.pbo),n.bufferData(n.PIXEL_PACK_BUFFER,e*t*4,n.STREAM_READ),n.bindBuffer(n.PIXEL_PACK_BUFFER,null),this.analysisW=e,this.analysisH=t)}async analyze(e,t,n=b){let r=this.gl;if(this.readbackInFlight)throw Error(`analysis readback already in flight`);this.readbackInFlight=!0;try{this.ensureAnalysisTargets(e,t),r.bindFramebuffer(r.FRAMEBUFFER,this.analysisFbo),r.viewport(0,0,e,t),this.bindCommon(this.down),r.uniform1i(this.down.loc.get(`u_rotation`),this.rotation),r.uniform2f(this.down.loc.get(`u_srcSize`),this.srcW,this.srcH),r.uniform2f(this.down.loc.get(`u_outSize`),e,t),r.uniform4f(this.down.loc.get(`u_rect`),n.x,n.y,n.w,n.h),r.drawArrays(r.TRIANGLES,0,3),r.bindBuffer(r.PIXEL_PACK_BUFFER,this.pbo),r.readPixels(0,0,e,t,r.RGBA,r.UNSIGNED_BYTE,0);let i=r.fenceSync(r.SYNC_GPU_COMMANDS_COMPLETE,0);r.flush(),r.bindBuffer(r.PIXEL_PACK_BUFFER,null),r.bindFramebuffer(r.FRAMEBUFFER,null);try{await Ht(r,i,{slowDelayMs:2})}finally{r.deleteSync(i)}let a=new Uint8ClampedArray(e*t*4);return r.bindBuffer(r.PIXEL_PACK_BUFFER,this.pbo),r.getBufferSubData(r.PIXEL_PACK_BUFFER,0,a),r.bindBuffer(r.PIXEL_PACK_BUFFER,null),a}finally{this.readbackInFlight=!1}}dispose(){let e=this.gl;e.deleteProgram(this.grade.prog),e.deleteProgram(this.down.prog),e.deleteProgram(this.comp.prog);for(let t of this.readbackRing)e.deleteBuffer(t.pbo);this.readbackRing=[],this.flipTarget&&=(e.deleteRenderbuffer(this.flipTarget.rb),e.deleteFramebuffer(this.flipTarget.fbo),null),this.beforeTex&&e.deleteTexture(this.beforeTex),this.wipe&&(e.deleteTexture(this.wipe.tex),e.deleteFramebuffer(this.wipe.fbo)),this.tpRelease(),this.nrRelease(),this.drawTarget&&(e.deleteTexture(this.drawTarget.tex),e.deleteFramebuffer(this.drawTarget.fbo)),this.sourceFbo&&e.deleteFramebuffer(this.sourceFbo),e.deleteTexture(this.source);for(let t of this.data)e.deleteTexture(t);e.deleteBuffer(this.uniformBuf),this.analysisTex&&e.deleteTexture(this.analysisTex),this.analysisFbo&&e.deleteFramebuffer(this.analysisFbo),this.pbo&&e.deleteBuffer(this.pbo)}};function qt(e){return e<3?1+e:5+e}var Jt={3:`unfilterable`,4:`unfilterable`,5:`unfilterable`,10:`unfilterable`},Y={6:`texture`,7:`texture`,9:`texture`},Yt={0:`uniform`,1:`sampler`,2:`texture`},Xt={0:`uniform`,1:`sampler`,2:`external`},X={grade:{0:`uniform`,1:`sampler`,2:`texture`,...Jt,...Y},gradeExt:{0:`uniform`,1:`sampler`,2:`external`,...Jt,...Y},down:{0:`uniform`,1:`sampler`,2:`texture`},downExt:{0:`uniform`,1:`sampler`,2:`external`},flow:{0:`unfilterable`,1:`unfilterable`},field:{0:`uniform`,...Jt,6:`unfilterable`,7:`unfilterable`,8:`unfilterable`},nrRefine:{...Yt,6:`unfilterable`,7:`texture`,8:`texture`},nrRefineExt:{...Xt,6:`unfilterable`,7:`texture`,8:`texture`},nrLevel:{...Yt,6:`texture`,7:`texture`,8:`unfilterable`},nrLevelExt:{...Xt,6:`texture`,7:`texture`,8:`unfilterable`},nr:{...Yt,6:`texture`,7:`texture`,8:`texture`},nrExt:{...Xt,6:`texture`,7:`texture`,8:`texture`},composite:{0:`uniform`,1:`sampler`,2:`texture`,3:`texture`},compositeExt:{0:`uniform`,1:`sampler`,2:`external`,3:`texture`}};function Zt(e){let t=new OffscreenCanvas(16,16).getContext(`2d`);if(!t)return!0;t.drawImage(e,0,0,16,16);let n=t.getImageData(0,0,16,16).data;for(let e=0;e<n.length;e+=4)if(n[e]>8||n[e+1]>8||n[e+2]>8)return!0;return!1}var Qt=class e{kind=`webgpu`;canvas;outputWidth=0;outputHeight=0;lastDrawMs=0;lastCaptureMs=0;device;ctx;format;gradePipeline;downPipeline;gradePipelineExt;downPipelineExt;extSource=null;externalOk=void 0;sampler;uniformBuf;downParamsBuf;uniforms=new Float32Array(144);source=null;srcW=0;srcH=0;rotation=0;data=[];gradeBindGroup=null;bindGroupDirty=!0;scratch=null;directUpload={frame:void 0,video:void 0,image:void 0};analysisTex=null;analysisBuf=null;analysisW=0;analysisH=0;analysisBytesPerRow=0;readbackInFlight=!1;previewScale=1;exportTex=null;exportCanvas=null;exportCtx=null;tpLumPipe;tpLumPipeExt;tpFlowPipe;tpFieldPipe;tpValid=!1;tpIdx=0;tpLowW=0;tpLowH=0;tpTex=null;nrRefinePipe;nrRefinePipeExt;nrLevelPipe;nrLevelPipeExt;nrPipe;nrPipeExt;nrTex=null;nrW=0;nrH=0;nrIdx=0;nrWritten=!1;nrHist=!1;tpDummyHalf;tpDummyOut;compPipe;compPipeExt;compBuf;beforeTex=null;wipeTex=null;lastGraded=null;constructor(e,t){this.canvas=e,this.device=t;let n=e.getContext(`webgpu`);if(!n)throw Error(`WebGPU canvas context unavailable`);this.ctx=n,this.format=navigator.gpu.getPreferredCanvasFormat(),n.configure({device:t,format:this.format,alphaMode:`opaque`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});let r=(e,t)=>{let n=GPUShaderStage.FRAGMENT;switch(t){case`uniform`:return{binding:e,visibility:n,buffer:{type:`uniform`}};case`sampler`:return{binding:e,visibility:n,sampler:{type:`filtering`}};case`external`:return{binding:e,visibility:n,externalTexture:{}};case`unfilterable`:return{binding:e,visibility:n,texture:{sampleType:`unfilterable-float`,viewDimension:`2d`}};default:return{binding:e,visibility:n,texture:{sampleType:`float`,viewDimension:`2d`}}}},i=e=>t.createBindGroupLayout({entries:Object.entries(e).map(([e,t])=>r(Number(e),t))}),a=i(X.grade),o=i(X.down),s=i(X.gradeExt),c=i(X.downExt),l=(e,n,r)=>t.createRenderPipeline({layout:t.createPipelineLayout({bindGroupLayouts:[r]}),vertex:{module:t.createShaderModule({code:e}),entryPoint:`vs`},fragment:{module:t.createShaderModule({code:e}),entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`}});this.gradePipeline=l(jt,this.format,a),this.downPipeline=l(Mt,`rgba8unorm`,o),this.gradePipelineExt=l(Pt,this.format,s),this.downPipelineExt=l(Ft,`rgba8unorm`,c),this.tpLumPipe=l(ut,`rgba16float`,o),this.tpLumPipeExt=l(W(ut),`rgba16float`,c);let u=i(X.flow);this.tpFlowPipe=l(ft,`rgba16float`,u);let d=i(X.nrRefine),f=i(X.nrRefineExt),p=i(X.nrLevel),m=i(X.nrLevelExt),h=i(X.nr),g=i(X.nrExt);this.nrRefinePipe=l(xt,`rgba16float`,d),this.nrRefinePipeExt=l(W(xt),`rgba16float`,f),this.nrLevelPipe=l(Ct,`rgba16float`,p),this.nrLevelPipeExt=l(W(Ct),`rgba16float`,m),this.nrPipe=l(Tt,`rgb10a2unorm`,h),this.nrPipeExt=l(W(Tt),`rgb10a2unorm`,g),this.compPipe=l(Lt,this.format,i(X.composite)),this.compPipeExt=l(Rt,this.format,i(X.compositeExt)),this.compBuf=t.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let _=i(X.field),v=t.createShaderModule({code:U});this.tpFieldPipe=t.createRenderPipeline({layout:t.createPipelineLayout({bindGroupLayouts:[_]}),vertex:{module:v,entryPoint:`vs`},fragment:{module:v,entryPoint:`fs`,targets:[{format:`rgba16float`},{format:`rgba16float`}]},primitive:{topology:`triangle-list`}}),this.tpDummyHalf=t.createTexture({size:[1,1],format:`rgba16float`,usage:GPUTextureUsage.TEXTURE_BINDING}),this.tpDummyOut=t.createTexture({size:[1,1],format:this.format,usage:GPUTextureUsage.TEXTURE_BINDING}),this.sampler=t.createSampler({magFilter:`linear`,minFilter:`linear`,addressModeU:`clamp-to-edge`,addressModeV:`clamp-to-edge`}),this.uniformBuf=t.createBuffer({size:576,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.downParamsBuf=t.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});for(let e=0;e<4;e++)this.data.push(this.makeDataTexture(1,1,new Float32Array(4)))}static async create(t){if(!(`gpu`in navigator))throw Error(`WebGPU not supported`);let n=await navigator.gpu.requestAdapter({powerPreference:`high-performance`});if(!n)throw Error(`WebGPU adapter unavailable`);let r=await n.requestDevice();return r.addEventListener(`uncapturederror`,e=>{console.error(`WebGPU:`,e.error.message)}),new e(t,r)}makeDataTexture(e,t,n){let r=this.device.createTexture({size:[e,t],format:`rgba32float`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return this.device.queue.writeTexture({texture:r},n,{bytesPerRow:e*16,rowsPerImage:t},[e,t]),r}upload(e,t,n,r){this.lastGraded=null,this.rotation=r;let[i,a]=Ue(t,n,r);if(this.outputWidth=i,this.outputHeight=a,this.sizeCanvas(this.previewScale),(!this.source||this.srcW!==t||this.srcH!==n)&&(this.source?.destroy(),this.source=this.device.createTexture({size:[t,n],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),this.srcW=t,this.srcH=n,this.bindGroupDirty=!0),this.extSource=null,te(e)&&this.externalOk!==!1&&(this.srcW=t,this.srcH=n,this.externalOk===void 0&&this.probeExternal(e),this.externalOk)){this.extSource=e,this.bindGroupDirty=!0;return}let o=te(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`;if(this.directUpload[o]!==!1){let r=e,i=this.directUpload[o]===void 0;i&&this.device.pushErrorScope(`validation`);try{if(this.device.queue.copyExternalImageToTexture({source:r,flipY:!1},{texture:this.source,colorSpace:`srgb`,premultipliedAlpha:!1},[t,n]),!i)return}catch{this.directUpload[o]=!1}if(i){this.directUpload[o]=!0,this.device.popErrorScope().then(e=>{e&&(console.warn(`WebGPU direct upload of ${o} unsupported, using canvas copy:`,e.message),this.directUpload[o]=!1)});return}}(!this.scratch||this.scratch.width!==t||this.scratch.height!==n)&&(this.scratch=new OffscreenCanvas(t,n)),this.scratch.getContext(`2d`).drawImage(e,0,0,t,n),this.device.queue.copyExternalImageToTexture({source:this.scratch},{texture:this.source},[t,n])}setPreviewScale(e){this.previewScale=Math.min(1,Math.max(.05,e)),this.outputWidth&&this.sizeCanvas(this.previewScale)}get gpuDevice(){return this.device}beginSourceDraw(e,t){return(!this.source||this.srcW!==e||this.srcH!==t)&&(this.source?.destroy(),this.source=this.device.createTexture({size:[e,t],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),this.srcW=e,this.srcH=t,this.bindGroupDirty=!0),this.source}endSourceDraw(e,t,n){this.lastGraded=null,this.rotation=n;let[r,i]=Ue(e,t,n);this.outputWidth=r,this.outputHeight=i,this.sizeCanvas(this.previewScale),this.extSource&&(this.bindGroupDirty=!0),this.extSource=null}sizeCanvas(e){let t=Math.max(1,Math.round(this.outputWidth*e)),n=Math.max(1,Math.round(this.outputHeight*e));(this.canvas.width!==t||this.canvas.height!==n)&&(this.lastGraded=null,this.canvas.width=t,this.canvas.height=n)}setUniforms(e){if(e.length!==144)throw Error(`uniform block must have 144 floats`);this.uniforms.set(e),this.lastGraded=null,this.device.queue.writeBuffer(this.uniformBuf,0,this.uniforms)}setData(e,t){if(t.data.length!==t.width*t.height*4)throw Error(`data texture size mismatch`);this.lastGraded=null;let n=this.data[e];n.width!==t.width||n.height!==t.height?(n.destroy(),this.data[e]=this.makeDataTexture(t.width,t.height,t.data),this.bindGroupDirty=!0):this.device.queue.writeTexture({texture:n},t.data,{bytesPerRow:t.width*16,rowsPerImage:t.height},[t.width,t.height])}gradeGroup(e){if(this.extSource)return this.device.createBindGroup({layout:this.gradePipelineExt.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:e},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},{binding:10,resource:this.data[3].createView()},...this.tpGradeEntries()]});if(this.tpTex&&(this.bindGroupDirty=!0),this.gradeBindGroup&&!this.bindGroupDirty)return this.gradeBindGroup;if(!this.source)throw Error(`no source uploaded`);return this.gradeBindGroup=this.device.createBindGroup({layout:this.gradePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:this.source.createView()},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},{binding:10,resource:this.data[3].createView()},...this.tpGradeEntries()]}),this.bindGroupDirty=!1,this.gradeBindGroup}resetTemporal(){this.tpValid=!1,this.nrWritten=!1,this.nrHist=!1}tpGradeEntries(){let e=this.tpTex,t=this.nrTex;return[{binding:6,resource:(e?e.f0[this.tpIdx]:this.tpDummyHalf).createView()},{binding:7,resource:(e?e.f1:this.tpDummyHalf).createView()},{binding:9,resource:(t?t.out[this.nrIdx]:this.tpDummyOut).createView()}]}tpEnsure(){let e=Math.max(1,Math.ceil(this.outputWidth/y.scale)),t=Math.max(1,Math.ceil(this.outputHeight/y.scale));if(this.tpTex&&e===this.tpLowW&&t===this.tpLowH)return;this.tpRelease(),this.nrRelease();let n=GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,r=()=>this.device.createTexture({size:[e,t],format:`rgba16float`,usage:n});this.tpTex={lum:[r(),r()],f0:[r(),r()],f1:r(),flow:r()},this.tpLowW=e,this.tpLowH=t,this.tpValid=!1,this.bindGroupDirty=!0}tpRelease(){this.lastGraded=null;let e=this.tpTex;if(e)for(let t of[...e.lum,...e.f0,e.f1,e.flow])t.destroy();this.tpTex=null}nrEnsure(e,t){if(this.nrTex&&e===this.nrW&&t===this.nrH)return;this.nrRelease();let n=GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,r=(e,t)=>this.device.createTexture({size:[e,t],format:`rgba16float`,usage:n}),i=()=>this.device.createTexture({size:[e,t],format:`rgb10a2unorm`,usage:n});this.nrTex={flow:r(this.tpLowW,this.tpLowH),level:r(o.bins,1),out:[i(),i()]},this.nrW=e,this.nrH=t,this.bindGroupDirty=!0}nrRelease(){let e=this.nrTex;if(e){for(let t of[e.flow,e.level,...e.out])t.destroy();this.bindGroupDirty=!0}this.nrTex=null,this.nrWritten=!1,this.nrHist=!1}draw(e){let t=this.device.createCommandEncoder(),n=this.outputWidth>0&&this.uniforms[93]>.5;n||(this.tpValid=!1,this.uniforms[92]!==0&&(this.uniforms[92]=0,this.device.queue.writeBuffer(this.uniformBuf,368,this.uniforms,92,1)));let r=n&&this.uniforms[104]>.5;r||(this.nrRelease(),this.uniforms[104]!==0&&(this.uniforms[104]=0,this.device.queue.writeBuffer(this.uniformBuf,416,this.uniforms,104,1)));let i=this.extSource?this.device.importExternalTexture({source:this.extSource}):null;if(n){this.tpEnsure();let n=this.tpTex,a=this.tpIdx,o=1-a;this.uniforms[92]=+!!this.tpValid,this.device.queue.writeBuffer(this.uniformBuf,368,this.uniforms,92,1);let s=(e,n,r)=>{let i=t.beginRenderPass({colorAttachments:e.map(e=>({view:e,loadOp:`clear`,storeOp:`store`}))});i.setPipeline(n),i.setBindGroup(0,r),i.draw(3),i.end()},c=i?this.tpLumPipeExt:this.tpLumPipe;if(s([n.lum[a].createView()],c,this.device.createBindGroup({layout:c.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:i??this.source.createView()}]})),s([n.flow.createView()],this.tpFlowPipe,this.device.createBindGroup({layout:this.tpFlowPipe.getBindGroupLayout(0),entries:[{binding:0,resource:n.lum[a].createView()},{binding:1,resource:n.lum[o].createView()}]})),s([n.f0[a].createView(),n.f1.createView()],this.tpFieldPipe,this.device.createBindGroup({layout:this.tpFieldPipe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuf}},{binding:3,resource:this.data[0].createView()},{binding:4,resource:this.data[1].createView()},{binding:5,resource:this.data[2].createView()},{binding:6,resource:n.lum[a].createView()},{binding:7,resource:n.flow.createView()},{binding:8,resource:n.f0[o].createView()},{binding:10,resource:this.data[3].createView()}]})),r){this.nrEnsure(e.width,e.height);let t=this.nrTex;this.nrWritten&&this.uniforms[106]<.5?(this.nrIdx=1-this.nrIdx,this.nrHist=!0,this.bindGroupDirty=!0):this.nrWritten||(this.nrHist=!1),this.uniforms[105]=+!!this.nrHist,this.device.queue.writeBuffer(this.uniformBuf,420,this.uniforms,105,1);let r=t.out[1-this.nrIdx],o=()=>[{binding:0,resource:{buffer:this.uniformBuf}},{binding:1,resource:this.sampler},{binding:2,resource:i??this.source.createView()}],c=i?this.nrRefinePipeExt:this.nrRefinePipe;s([t.flow.createView()],c,this.device.createBindGroup({layout:c.getBindGroupLayout(0),entries:[...o(),{binding:6,resource:n.flow.createView()},{binding:7,resource:r.createView()},{binding:8,resource:t.level.createView()}]}));let l=i?this.nrLevelPipeExt:this.nrLevelPipe;s([t.level.createView()],l,this.device.createBindGroup({layout:l.getBindGroupLayout(0),entries:[...o(),{binding:6,resource:t.flow.createView()},{binding:7,resource:r.createView()},{binding:8,resource:n.lum[a].createView()}]}));let u=i?this.nrPipeExt:this.nrPipe;s([t.out[this.nrIdx].createView()],u,this.device.createBindGroup({layout:u.getBindGroupLayout(0),entries:[...o(),{binding:6,resource:t.flow.createView()},{binding:7,resource:r.createView()},{binding:8,resource:t.level.createView()}]})),this.nrWritten=!0}}let a=this.uniforms[1],o=a>0?this.wipeTarget(e.width,e.height):e,s=t.beginRenderPass({colorAttachments:[{view:o.createView(),loadOp:`clear`,storeOp:`store`}]});s.setPipeline(this.extSource?this.gradePipelineExt:this.gradePipeline),s.setBindGroup(0,this.gradeGroup(i)),s.draw(3),s.end(),a>0&&this.composite(t,o,e,a,i),n&&(this.tpIdx=1-this.tpIdx,this.tpValid=!0),this.device.queue.submit([t.finish()]),this.lastGraded=o!==e&&!i?o:null}wipeTarget(e,t){return this.wipeTex&&this.wipeTex.width===e&&this.wipeTex.height===t?this.wipeTex:(this.wipeTex?.destroy(),this.wipeTex=this.device.createTexture({size:[e,t],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),this.wipeTex)}composite(e,t,n,r,i){let a=this.beforeTex?this.beforeTex.createView():i??this.source.createView(),o=!this.beforeTex&&i?this.compPipeExt:this.compPipe;this.device.queue.writeBuffer(this.compBuf,0,new Float32Array([r,this.beforeTex?0:this.rotation,0,0]));let s=this.device.createBindGroup({layout:o.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.compBuf}},{binding:1,resource:this.sampler},{binding:2,resource:a},{binding:3,resource:t.createView()}]}),c=e.beginRenderPass({colorAttachments:[{view:n.createView(),loadOp:`clear`,storeOp:`store`}]});c.setPipeline(o),c.setBindGroup(0,s),c.draw(3),c.end()}recomposite(e){if(!this.lastGraded)return!1;let t=this.ctx.getCurrentTexture();if(t.width!==this.lastGraded.width||t.height!==this.lastGraded.height)return!1;this.uniforms[1]=e;let n=this.device.createCommandEncoder();return this.composite(n,this.lastGraded,t,e,null),this.device.queue.submit([n.finish()]),!0}setBefore(e,t,n){if(this.lastGraded=null,!e){this.beforeTex?.destroy(),this.beforeTex=null;return}(!this.beforeTex||this.beforeTex.width!==t||this.beforeTex.height!==n)&&(this.beforeTex?.destroy(),this.beforeTex=this.device.createTexture({size:[t,n],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}));let r=te(e)?`frame`:e instanceof HTMLVideoElement?`video`:`image`;this.directUpload[r]===!0?this.device.queue.copyExternalImageToTexture({source:e,flipY:!1},{texture:this.beforeTex,colorSpace:`srgb`,premultipliedAlpha:!1},[t,n]):((!this.scratch||this.scratch.width!==t||this.scratch.height!==n)&&(this.scratch=new OffscreenCanvas(t,n)),this.scratch.getContext(`2d`).drawImage(e,0,0,t,n),this.device.queue.copyExternalImageToTexture({source:this.scratch},{texture:this.beforeTex},[t,n]))}downGroup(){let e=this.extSource?{binding:2,resource:this.device.importExternalTexture({source:this.extSource})}:{binding:2,resource:this.source.createView()};return this.device.createBindGroup({layout:(this.extSource?this.downPipelineExt:this.downPipeline).getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.downParamsBuf}},{binding:1,resource:this.sampler},e]})}async probeExternal(e){this.externalOk=!1;let t=this.device.createTexture({size:[32,18],format:`rgba8unorm`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),n=this.device.createBuffer({size:256*18,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{this.device.pushErrorScope(`validation`),this.device.queue.writeBuffer(this.downParamsBuf,0,new Float32Array([e.displayWidth,e.displayHeight,32,18,0,0,0,0,0,0,1,1]));let r=this.device.createBindGroup({layout:this.downPipelineExt.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.downParamsBuf}},{binding:1,resource:this.sampler},{binding:2,resource:this.device.importExternalTexture({source:e})}]}),i=this.device.createCommandEncoder(),a=i.beginRenderPass({colorAttachments:[{view:t.createView(),loadOp:`clear`,storeOp:`store`}]});a.setPipeline(this.downPipelineExt),a.setBindGroup(0,r),a.draw(3),a.end(),i.copyTextureToBuffer({texture:t},{buffer:n,bytesPerRow:256},[32,18]),this.device.queue.submit([i.finish()]);let o=await this.device.popErrorScope();if(o)throw Error(o.message);await n.mapAsync(GPUMapMode.READ);let s=new Uint8Array(n.getMappedRange()),c=!1;for(let e=0;e<18&&!c;e++)for(let t=0;t<128;t+=4)if(s[e*256+t]>8||s[e*256+t+1]>8||s[e*256+t+2]>8){c=!0;break}n.unmap(),this.externalOk=c,console.info(`WebGPU external video import: ${c?`ok`:`renders black, using copy path`}`)}catch(e){console.warn(`WebGPU external video import unavailable:`,e.message),this.externalOk=!1}finally{t.destroy(),n.destroy()}}render(){this.draw(this.ctx.getCurrentTexture())}capture=null;forceCapture=null;setCaptureMode(e){this.forceCapture=e===`auto`?null:e,this.capture=null}readbackRing=[];async renderToFrame(e,t){let n=this.outputWidth,r=this.outputHeight;if(!this.exportCanvas||this.exportCanvas.width!==n||this.exportCanvas.height!==r){this.exportCanvas=new OffscreenCanvas(n,r),this.exportCtx=this.exportCanvas.getContext(`webgpu`),this.exportCtx.configure({device:this.device,format:this.format,alphaMode:`opaque`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST}),this.exportTex?.destroy(),this.exportTex=this.device.createTexture({size:[n,r],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});for(let e of this.readbackRing)e.buffer.destroy();this.readbackRing=[]}if(this.capture===null){let n=this.forceCapture??new URLSearchParams(location.search).get(`capture`);n===`canvas`||n===`bitmap`||n===`readback`?(this.capture=n,this.captureBench=`forced ${n}`):await this.benchmarkCapture(e,t)}return this.captureAs(this.capture??`readback`,e,t)}captureBench=``;async benchmarkCapture(e,t){let n=this.extSource;n&&(this.extSource=null,this.externalOk=!1,this.upload(n,this.srcW,this.srcH,this.rotation),this.externalOk=!0);let r=[],i=null;for(let n of[`canvas`,`bitmap`,`readback`])try{let a=!1,o=performance.now();if(n===`readback`){let r=[];for(let i=0;i<4;i++)if(r.push(this.captureAs(n,e,t)),r.length>=3){let e=await r.shift();a||=Zt(e),e.close()}for(let e of r){let t=await e;a||=Zt(t),t.close()}}else for(let r=0;r<4;r++){let r=await this.captureAs(n,e,t);a||=Zt(r),r.close()}let s=(performance.now()-o)/4;r.push(`${n} ${s.toFixed(1)} ms${a?``:` (black)`}`),a&&(!i||s<i.ms)&&(i={mode:n,ms:s})}catch(e){r.push(`${n} failed (${e.message.split(`
`)[0].slice(0,50)})`)}this.capture=i?.mode??`readback`,this.captureBench=r.join(`, `),console.info(`WebGPU capture bench: ${r.join(`, `)} → ${this.capture}`),n&&(this.extSource=n)}async readbackSlotFree(){for(;this.readbackRing.length>0&&!this.readbackRing.some(e=>!e.busy);)await new Promise(e=>setTimeout(e,1))}async captureAs(e,t,n){let r=this.outputWidth,i=this.outputHeight,a=performance.now();if(e===`canvas`||e===`bitmap`){this.draw(this.exportCtx.getCurrentTexture());let r=performance.now();try{if(e===`canvas`)return new VideoFrame(this.exportCanvas,{timestamp:t,duration:n});let r=this.exportCanvas.transferToImageBitmap();try{return new VideoFrame(r,{timestamp:t,duration:n})}finally{r.close()}}finally{this.lastDrawMs=r-a,this.lastCaptureMs=performance.now()-r}}let o=Math.ceil(r*4/256)*256;this.readbackRing.length===0&&(this.readbackRing=Array.from({length:3},()=>({buffer:this.device.createBuffer({size:o*i,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),busy:!1})));let s=this.readbackRing.find(e=>!e.busy);if(!s)for(await new Promise(e=>setTimeout(e,1));!(s=this.readbackRing.find(e=>!e.busy));)await new Promise(e=>setTimeout(e,1));s.busy=!0;try{this.draw(this.exportTex);let e=this.device.createCommandEncoder();e.copyTextureToBuffer({texture:this.exportTex},{buffer:s.buffer,bytesPerRow:o},[r,i]),this.device.queue.submit([e.finish()]);let c=performance.now();this.lastDrawMs=c-a,await s.buffer.mapAsync(GPUMapMode.READ),this.lastCaptureMs=performance.now()-c;try{let e=new Uint8Array(s.buffer.getMappedRange()),a;if(o===r*4)a=new Uint8Array(e);else{a=new Uint8Array(r*4*i);for(let t=0;t<i;t++)a.set(e.subarray(t*o,t*o+r*4),t*r*4)}return new VideoFrame(a,{format:this.format===`bgra8unorm`?`BGRX`:`RGBX`,codedWidth:r,codedHeight:i,timestamp:t,duration:n})}finally{s.buffer.unmap()}}finally{s.busy=!1}}async analyze(e,t,n=b){if(this.readbackInFlight)throw Error(`analysis readback already in flight`);if(!this.source&&!this.extSource)throw Error(`no source uploaded`);this.readbackInFlight=!0;try{(!this.analysisTex||this.analysisW!==e||this.analysisH!==t)&&(this.analysisTex?.destroy(),this.analysisBuf?.destroy(),this.analysisTex=this.device.createTexture({size:[e,t],format:`rgba8unorm`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.analysisBytesPerRow=Math.ceil(e*4/256)*256,this.analysisBuf=this.device.createBuffer({size:this.analysisBytesPerRow*t,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),this.analysisW=e,this.analysisH=t),this.device.queue.writeBuffer(this.downParamsBuf,0,new Float32Array([this.srcW,this.srcH,e,t,this.rotation,0,0,0,n.x,n.y,n.w,n.h]));let r=this.downGroup(),i=this.device.createCommandEncoder(),a=i.beginRenderPass({colorAttachments:[{view:this.analysisTex.createView(),loadOp:`clear`,storeOp:`store`}]});a.setPipeline(this.extSource?this.downPipelineExt:this.downPipeline),a.setBindGroup(0,r),a.draw(3),a.end(),i.copyTextureToBuffer({texture:this.analysisTex},{buffer:this.analysisBuf,bytesPerRow:this.analysisBytesPerRow},[e,t]),this.device.queue.submit([i.finish()]),await this.analysisBuf.mapAsync(GPUMapMode.READ);try{let n=new Uint8Array(this.analysisBuf.getMappedRange()),r=new Uint8ClampedArray(e*t*4),i=e*4;for(let e=0;e<t;e++)r.set(n.subarray(e*this.analysisBytesPerRow,e*this.analysisBytesPerRow+i),e*i);return r}finally{this.analysisBuf.unmap()}}finally{this.readbackInFlight=!1}}dispose(){this.source?.destroy();for(let e of this.data)e.destroy();this.uniformBuf.destroy(),this.downParamsBuf.destroy(),this.compBuf.destroy(),this.beforeTex?.destroy(),this.wipeTex?.destroy(),this.analysisTex?.destroy(),this.analysisBuf?.destroy(),this.exportTex?.destroy();for(let e of this.readbackRing)e.buffer.destroy();this.tpRelease(),this.nrRelease(),this.device.destroy()}};10*Math.PI/180,26*Math.PI/180,60*Math.PI/180,110*Math.PI/180,30*Math.PI/180,60*Math.PI/180;var $t=.55,en=4096,tn=new Float32Array(en+1);for(let e=0;e<=en;e++)tn[e]=w(e/en);75*Math.PI/180;function nn(e){return e<0?0:e>1?1:e}function rn(e,t,n){let r=nn((n-e)/(t-e));return r*r*(3-2*r)}function an(e,t=$t){return .97+(t-.97)*rn(.02,.15,e)}var on=.3,sn=.15,cn=.3;function ln(e,t,n,r=on,i=sn){let a=new Float32Array(t*n);for(let o of e){let e=o.x-o.w*r,s=o.x+o.w*(1+r),c=o.y-o.h*r,l=o.y+o.h*(1+r),u=Math.max(.001,o.w*i),d=Math.max(.001,o.h*i);for(let r=0;r<n;r++){let i=(r+.5)/n,o=Math.max(c-i,i-l,0),f=Math.max(0,1-o/d);if(!(f<=0))for(let n=0;n<t;n++){let i=(n+.5)/t,o=Math.max(e-i,i-s,0),c=f*Math.max(0,1-o/u),l=r*t+n;c>a[l]&&(a[l]=c)}}}return a}function un(e,t){let n=e.count%t===0;return{want:n,detect:n&&e.passes%3==0}}function dn(e,t,n){let r={...e};for(let e=0;e<t;e++)r.count++%n===0&&r.passes++%3!=0&&r.rectIdx++;return r}function fn(e,t){return e.count===t.count&&e.passes===t.passes&&e.rectIdx===t.rectIdx}function pn(e,t,n){let r=n.get(t);return r===void 0?e.window?e.window[1]:e.from:r}function mn(e,t,n){return e.some((e,r)=>e.window!==void 0&&!t.has(r)&&n>=e.window[0]&&n<e.window[1])}function hn(e,t,n){e.forEach((e,r)=>{e.window&&!t.has(r)&&n>=e.window[0]&&n<=e.window[1]&&t.set(r,n)})}function gn(e,t,n=!1){let r=t.backdropFit??e.backdropFit,i={seabedNeed:t.seabedNeed??e.seabedNeed,seabedLw:t.seabedLw??e.seabedLw,seabedLb:t.seabedLb??e.seabedLb,seabedGrid:t.seabedGrid??e.seabedGrid},a=t.frameBlack??t.hazeBlack,o=_n.margin>0&&e.hazeBlack>1e-6?Math.min(1,_n.margin*a/e.hazeBlack):1,s={frameBlack:a,...o<1?{hazeBlack:e.hazeBlack*o,hazeFloor:e.hazeFloor.map(e=>e*o)}:{}};return n?{...e,...i,...s,backdropFit:r}:{...e,...i,...s,zLo:t.zLo,zHi:t.zHi,backdropFit:r}}var _n={margin:1.1},vn=.1;function yn(e,t=vn){return Math.floor(e/t+1e-6)}function bn(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function xn(e,t){return e&&!t}function Sn(e,t){return e&&e.pop!==void 0?e.pop===null?1:wn(e.pop):t===null?1:wn(t)}function Cn(e,t){let n=0,r=0,i=0,a=0;for(let o=0;o<e.height;o++){let s=Math.min(t.height-1,Math.floor((o+.5)/e.height*t.height));for(let c=0;c<e.width;c++){let l=s*t.width+Math.min(t.width-1,Math.floor((c+.5)/e.width*t.width)),u=(o*e.width+c)*4,d=.2126*e.data[u]+.7152*e.data[u+1]+.0722*e.data[u+2];t.alpha[l]>.6?(n+=d,r++):t.alpha[l]<.05&&t.near[l]>.15&&(i+=d,a++)}}return r<4||a<4||i<=0?null:Math.log(Math.max(1e-6,n/r)/(i/a))}function wn(e){return 1-2*bn(Tn.lo,Tn.hi,-e)}var Tn={lo:.12,hi:.35};function En(e,t,n,r){let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++){let n=0;for(let i=-r;i<=r;i++)n+=e[a*t+Math.min(t-1,Math.max(0,i))];for(let o=0;o<t;o++)i[a*t+o]=n/(2*r+1),n+=e[a*t+Math.min(t-1,o+r+1)]-e[a*t+Math.max(0,o-r)]}for(let e=0;e<t;e++){let o=0;for(let a=-r;a<=r;a++)o+=i[Math.min(n-1,Math.max(0,a))*t+e];for(let s=0;s<n;s++)a[s*t+e]=o/(2*r+1),o+=i[Math.min(n-1,s+r+1)*t+e]-i[Math.max(0,s-r)*t+e]}return a}var Z={blur:1/20,wide:1/5,alphaMax:.02,evLo:.012,evHi:.035,nearBand:1/8,farLo:.05,farHi:.09,region:1/32,trustLo:.15,trustHi:.45,rampK:.15,rampLong:8,thickR:28,thinLo:4,thinHi:9};function Dn(e,t,n=0){let r=Math.round(Math.min(1,Math.max(0,t))*x.levels),i=Math.round(Math.min(1,Math.max(0,n))*I.thinLevels);return e+x.pack*(r+(x.levels+1)*i)}function On(e){let t=Math.floor((e+8)/x.pack),n=Math.floor((t+.5)/(x.levels+1));return[e-x.pack*t,(t-(x.levels+1)*n)/x.levels,n/I.thinLevels]}function kn(e){return 1-bn(Z.thinLo,Z.thinHi,e)}function An(e,t,n,r,i){let a=new Float32Array(r*i);for(let o=0;o<i;o++){let s=Math.min(n-1,Math.max(0,(o+.5)/i*n-.5)),c=Math.floor(s),l=Math.min(n-1,c+1),u=s-c;for(let n=0;n<r;n++){let i=Math.min(t-1,Math.max(0,(n+.5)/r*t-.5)),s=Math.floor(i),d=Math.min(t-1,s+1),f=i-s,p=e[c*t+s]+(e[c*t+d]-e[c*t+s])*f,m=e[l*t+s]+(e[l*t+d]-e[l*t+s])*f;a[o*r+n]=p+(m-p)*u}}return a}function jn(e){return Math.min(Z.rampLong,Math.max(I.rampIn,Z.rampK*e))}function Mn(e,t,n){let r=1e9,i=new Float32Array(t*n);for(let a=0;a<t*n;a++)i[a]=e[a]?r:0;let a=(e,a)=>e<0||a<0||e>=t||a>=n?r:i[a*t+e];for(let e=0;e<n;e++)for(let n=0;n<t;n++){let r=e*t+n;i[r]&&(i[r]=Math.min(i[r],a(n-1,e)+3,a(n,e-1)+3,a(n-1,e-1)+4,a(n+1,e-1)+4))}for(let e=n-1;e>=0;e--)for(let n=t-1;n>=0;n--){let r=e*t+n;i[r]&&(i[r]=Math.min(i[r],a(n+1,e)+3,a(n,e+1)+3,a(n+1,e+1)+4,a(n-1,e+1)+4))}for(let e=0;e<t*n;e++)i[e]=i[e]>=r?1e4:i[e]/3;return i}function Nn(e,t){let n=e.width,r=e.height,i=t.width,a=t.height,o=n*r,s=new Float32Array(o*3),c=new Uint8Array(o),l=new Float32Array(o);for(let o=0;o<r;o++){let u=Math.floor(o*a/r),d=Math.min(a,Math.max(u+1,Math.ceil((o+1)*a/r)));for(let r=0;r<n;r++){let a=Math.floor(r*i/n),f=Math.min(i,Math.max(a+1,Math.ceil((r+1)*i/n))),p=0,m=0,h=0;for(let e=u;e<d;e++)for(let n=a;n<f;n++){let r=e*i+n;p=Math.max(p,t.alpha[r],t.exclude?t.exclude[r]:0),m+=t.alpha[r],h++}let g=o*n+r,_=g*4,v=S(Math.max(0,e.data[_]),Math.max(0,e.data[_+1]),Math.max(0,e.data[_+2]));s[g*3]=v[0],s[g*3+1]=v[1],s[g*3+2]=v[2],c[g]=+(p<Z.alphaMax),l[g]=+(m/h>.5)}}let u=Math.max(1,Math.round(Z.blur*n)),d=Math.max(1,Math.round(Z.wide*n)),f=e=>{let t=0;for(let n=0;n<o;n++)t+=e[n];if(t<1)return null;let i=En(e,n,r,u),a=En(e,n,r,d);return[0,1,2].map(c=>{let l=new Float32Array(o),f=0;for(let t=0;t<o;t++)l[t]=s[t*3+c]*e[t],f+=l[t];let p=En(l,n,r,u),m=En(l,n,r,d),h=new Float32Array(o),g=f/t;for(let e=0;e<o;e++){let t=a[e]>.001?m[e]/a[e]:g;h[e]=i[e]>1e-4?t+(p[e]/i[e]-t)*Math.min(1,i[e]/.15):t}return h})},p=(e,t=Z.evLo,n=Z.evHi)=>{let r=new Float32Array(o);for(let i=0;i<o;i++)r[i]=bn(t,n,Math.hypot(s[i*3]-e[0][i],s[i*3+1]-e[1][i],s[i*3+2]-e[2][i]));return r},m=Float32Array.from(c),h=0;for(let e=0;e<o;e++)h+=m[e];if(h<1)return null;let g=[0,1,2].map(e=>{let t=[];for(let n=0;n<o;n++)c[n]&&t.push(s[n*3+e]);return t.sort((e,t)=>e-t),t[t.length>>1]}),_=Mn(c,n,r),v=Math.max(2,Math.round(Z.nearBand*n)),y=f(Float32Array.from(m,(e,t)=>{if(!e||_[t]>v)return e;let n=Math.hypot(s[t*3]-g[0],s[t*3+1]-g[1],s[t*3+2]-g[2]);return 1-bn(Z.farLo,Z.farHi,n)}))??f(m),b=p(y),x=Math.max(1,Math.round(Z.region*n)),C=En(Float32Array.from(b,(e,t)=>e*l[t]),n,r,x),w=En(l,n,r,x),T=En(Float32Array.from(C,(e,t)=>w[t]>.001?e/w[t]:1).map(e=>bn(Z.trustLo,Z.trustHi,e)),n,r,x),E=new Float32Array(o);for(let e=0;e<o;e++)E[e]=Math.hypot(s[e*3]-y[0][e],s[e*3+1]-y[1][e],s[e*3+2]-y[2][e]);return{L:An(y[0],n,r,i,a),trust:An(T,n,r,i,a),sep:{width:n,height:r,dE:E,inside:l}}}function Pn(e,t){let n=e.width,r=e.height,i=new Float32Array(n*r);if(!t){for(let t=0;t<n*r;t++)i[t]=+(e.alpha[t]>.5);return i}let a=new Int32Array(n*r),o=[],s=0;for(let t=0;t<n*r;t++)if(!(!(e.alpha[t]>.5)||a[t]))for(a[t]=++s,o.push(t);o.length;){let t=o.pop(),i=t%n;i>0&&e.alpha[t-1]>.5&&!a[t-1]&&(a[t-1]=s,o.push(t-1)),i<n-1&&e.alpha[t+1]>.5&&!a[t+1]&&(a[t+1]=s,o.push(t+1)),t>=n&&e.alpha[t-n]>.5&&!a[t-n]&&(a[t-n]=s,o.push(t-n)),t<n*r-n&&e.alpha[t+n]>.5&&!a[t+n]&&(a[t+n]=s,o.push(t+n))}if(!s)return i;let c=new Float64Array(s+1),l=new Float64Array(s+1);for(let e=0;e<t.height;e++)for(let i=0;i<t.width;i++){let o=e*t.width+i;if(!t.inside[o])continue;let s=a[Math.min(r-1,Math.floor((e+.5)/t.height*r))*n+Math.min(n-1,Math.floor((i+.5)/t.width*n))];s&&(c[s]+=t.dE[o],l[s]++)}for(let e=0;e<n*r;e++)a[e]&&l[a[e]]>0&&(i[e]=bn(x.veilLo,x.veilHi,c[a[e]]/l[a[e]]));return i}function Fn(e,t,n,r){let i=new Float32Array(t*n),a=new Float32Array(t*n);for(let a=0;a<n;a++)for(let n=0;n<t;n++){let o=0;for(let i=Math.max(0,n-r);i<=Math.min(t-1,n+r);i++)o=Math.max(o,e[a*t+i]);i[a*t+n]=o}for(let e=0;e<t;e++)for(let o=0;o<n;o++){let s=0;for(let a=Math.max(0,o-r);a<=Math.min(n-1,o+r);a++)s=Math.max(s,i[a*t+e]);a[o*t+e]=s}return a}function In(e,t=null){let n=e.width,r=e.height,i=I.alphaR,a=new Float32Array(n*r*4),o=t?Nn(t,e):null,s=Uint8Array.from(e.alpha,e=>+(e>.5)),c=Mn(s,n,r),l=En(Fn(Float32Array.from(c,(e,t)=>s[t]?e:0),n,r,Z.thickR),n,r,Math.round(Z.thickR/2)),u=Fn(Pn(e,o?o.sep:null),n,r,2);for(let t=0;t<n*r;t++){let n=e.alpha[t],r=jn(l[t]);if(n>.5){let e=n<.995?(n-.5)*2*i:Math.max(i,c[t]-.5);n=.5+Math.min(i,e*(I.rampIn/r))/(2*i)}let s=!!o&&r<=1.5*I.rampIn;a[t*4]=Dn(o?s?o.L[t]:9:-1,u[t],s&&l[t]>.01?kn(l[t]):0),a[t*4+1]=(o?o.trust[t]:1)*(e.quality??1),a[t*4+2]=n,a[t*4+3]=e.near[t]}return{width:n,height:r,data:a}}function Ln(e){let t=e.settings.hazeAuto!==!1,n=ge(de((t?Ae:e=>e)(xe(oe(Re(e.params),Oe(e.settings)),e.settings)),e.settings),e.settings),r=M(pe(ae(Me(e.settings),n),e.settings),n);return{...e,params:n,settings:{...k(t?_(r,n):r,n),vivid:Te(n,e.settings),blue:p(n,e.settings)},seabed:Rn(n,e.settings),waterTint:Pe(e.settings)}}function Rn(e,t){return Q(t.seabed??0,0,1)*Q(e.seabedNeed??0,0,1)*(1-Q(e.backdrop??0,0,1))}function zn(e,t,n){let r=N.grid,i=e.seabedGrid;if(!i||i.length!==r*r)return 0;let a=t*r-.5,o=n*r-.5,s=Math.floor(a+.5),c=Math.floor(o+.5),l=a-s,u=o-c,d=[.5*(.5-l)*(.5-l),.75-l*l,.5*(.5+l)*(.5+l)],f=[.5*(.5-u)*(.5-u),.75-u*u,.5*(.5+u)*(.5+u)],p=0;for(let e=0;e<3;e++)for(let t=0;t<3;t++)p+=d[t]*f[e]*i[Q(c+e-1,0,r-1)*r+Q(s+t-1,0,r-1)];return $(N.wLo,N.wHi,p)*$(N.y0,N.y1,n)}var Bn=.12;function Vn(e,t,n,r,i,a){let o=Math.min(Math.max(t*e.width-.5,0),e.width-1),s=Math.min(Math.max(n*e.height-.5,0),e.height-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.width-1),d=Math.min(l+1,e.height-1),f=o-c,p=s-l,m=Math.hypot(r,i,a)+.02,h=0,g=0,_=0,v=0,y=0,b=0,x=0,S=0,C=0,w=0,T=0,E=[[c,l,(1-f)*(1-p)],[u,l,f*(1-p)],[c,d,(1-f)*p],[u,d,f*p]];for(let[t,n,o]of E){let s=n*e.width+t,c=e.guide[s*3],l=e.guide[s*3+1],u=e.guide[s*3+2],d=Math.hypot(r-c,i-l,a-u)/(m+Math.hypot(c,l,u)),f=o*Math.exp(-(d*d)/(2*Bn*Bn)),p=s*4,E=e.person?e.person[s]:0;h+=f*e.fields[p],g+=f*e.fields[p+1],_+=f*e.fields[p+2],v+=f*e.fields[p+3],b+=f*E,y+=f,x+=o*e.fields[p],S+=o*e.fields[p+1],C+=o*e.fields[p+2],w+=o*e.fields[p+3],T+=o*E}let D=Math.min(1,y/.08);return y<1e-6?[x,S,C,w,0,T]:[h/y,g/y,_/y,v/y,D,b/y]}function Hn(e,t,n,r){let i=r*e.bins-1,a=t=>{let n=t*e.bins;if(i<0)return e.data[n]*(i+1);let r=Math.min(e.bins-1,Math.floor(i)),a=Math.min(e.bins-1,r+1),o=Math.min(1,Math.max(0,i-r));return e.data[n+r]+(e.data[n+a]-e.data[n+r])*o},o=Math.min(Math.max(t*e.tilesX-.5,0),e.tilesX-1),s=Math.min(Math.max(n*e.tilesY-.5,0),e.tilesY-1),c=Math.floor(o),l=Math.floor(s),u=Math.min(c+1,e.tilesX-1),d=Math.min(l+1,e.tilesY-1),f=o-c,p=s-l,m=a(l*e.tilesX+c)*(1-f)+a(l*e.tilesX+u)*f,h=a(d*e.tilesX+c)*(1-f)+a(d*e.tilesX+u)*f;return m*(1-p)+h*p}function Un(e,t,r,o,s,c,l,p=0){let{params:m,settings:h}=e,_=l?l[0]:t,y=l?l[1]:r,b=l?l[2]:o,C=g(_),E=g(y),k=g(b),te=ee.mu0+ee.mu1*Math.max(y,b)+ee.mu2*_,[ne,ie,ae,oe,se,le]=Vn(e.depth,s,c,C,E,k),de=Q(le,0,1),fe=Math.max(.02,m.zHi-m.zLo),pe=Q((te-m.zLo)/fe,0,1.15),ge=pe+(Q(ne+Q(m.depthGuide*(te-ae)/fe,-.25,.25),0,1.15)-pe)*se,ve=1+(oe-1)*se,ye=[C,E,k],M=Math.max(1e-5,O(C,E,k)),xe=[0,0,0],we=[0,0,0],Te=0,De=0,Oe=Math.min(1,ve);for(let e=0;e<3;e++){let t=h.veil*m.binf[e]*(1-Math.exp(-(m.betaB[e]*ge+m.cB[e])));xe[e]=ve*t,we[e]=Oe*t;let n=e===0?.2126:e===1?.7152:.0722;Te+=xe[e]*n,De+=we[e]*n}let ke=Math.max(0,(M-Te)/M),Ae=S(C,E,k),Me=Ae[1],Pe=Ae[2],Le=$(m.subLo,m.subHi,ke)*(1-ur(Me,Pe,m))*(1-_e.greenProp*j(m)),Re=Math.max(m.floorFrac,1-De/M),Be=[0,1,2].map(e=>Math.min(m.gainCap,Math.max(1/m.gainCap,Math.exp(m.attn[e]*(ge-m.zMean))))),Ue=Ee(ye,Ie(e.depth,s,c,C,E,k),Be.map((e,t)=>Math.max(e*m.wb[t],m.waterWb[t])),xe),We=Ue.c,Ge=he(Ue.snrR),Ke=a(m.waterWb[0],Be[0]*m.wb[0],Ue.snrR),I=[0,0,0];for(let e=0;e<3;e++){let t=We[e],n=Math.max(t-we[e],t*m.floorFrac),r=t*Re+(n-t*Re)*Le,i=Be[e]*m.wb[e];I[e]=r*(e===0?1+(i-1)*Ge:i)}let Ye=$(m.confLo,m.confHi,ke),Xe=$(Fe.lo,Fe.hi,ke),L=Ne(m),R=m.backdropFit,Ze=L>0&&R&&R.length===18?qe(Ae[0],Me,Pe,s,c,R):1,Qe=Math.min(Ye,Math.max(fr(Me,Pe,m)*(1+(Ze-1)*L),Xe,j(m)*_e.greenObj)),$e=de*$(Ce.lo,Ce.hi,M),et=1+(Ze-1)*L,tt=Math.max(Math.min(Q(ie,0,1),et)*se+Qe*(1-se),$e)*Ye*(1-L*nr(C,E,k)),nt=e.settings.subjectPop?Q(m.subjectTone??0,0,1):0,rt=L>0&&R&&R.length===18?Je(Ae[0],Me,Pe,s,c,R):1,it=L>0&&R&&R.length===18?Math.max(hr(e.depth,s,c,Q(ie,0,1)*se,rt),p*$(F.subjLo,F.subjHi,rt)):0,[at,ot]=vr(e.depth,s,c),z=e.seg&&e.settings.subjectPop?Kn(e.seg.strength,s,c,e.seg.guide):null,B=e.settings.subjectPop?je(e.settings):0,[,st,ct]=S(m.veilColor[0],m.veilColor[1],m.veilColor[2]),V=Math.hypot(st,ct)||1,lt=Math.max(it,L>0?ot*$(F.holdLo,F.holdHi,rt):0)*L*nt*at;if(e.debug)return[se,Qe,Q(ie,0,1)];let H=[0,0,0],ut=m.exposure**+m.waterExposure,dt=1-h.dehaze*Math.min(.9,De/M)*$(me.lo,me.hi,M);for(let e=0;e<3;e++){let t=We[e]*(e===0?Ke:m.waterWb[e])*ut*dt;H[e]=t+(I[e]*m.exposure-t)*tt}let ft=v(m,h.hazeLift),pt=1;if(ft[0]+ft[1]+ft[2]>0){let e=O(H[0],H[1],H[2]),t=ur(Me,Pe,m),n=f(e,h.hazeLift*m.hazeBlack*(1-i.farKeep));for(let e=0;e<3;e++)H[e]*=f(H[e],ft[e])+(n-f(H[e],ft[e]))*t;pt=e>1e-6?O(H[0],H[1],H[2])/e:1}let U=O(H[0],H[1],H[2]),mt=U+((U-m.black)/(m.white-m.black)-U)*m.levelsMix,ht=U>1e-5?Math.max(0,mt)/U:1;for(let e=0;e<3;e++)H[e]*=ht;U=Math.max(0,mt);let gt=Math.cbrt(Math.max(0,U)),_t=z?Jn(z,Ae,st/V,ct/V,nt,B):0,vt=(z?_t:u.engineKeep*er(lt)*(D.edgeFloor+(1-D.edgeFloor)*$(F.subjLo,F.subjHi,rt)))*$(u.darkLo,u.darkHi,gt),yt=Math.max(Ne(m),z?qn(z[3]):0),bt=vt*yt*B,xt=z?_t*$(x.darkLo,x.darkHi,gt)*B:0;if(h.clarity>0){let t=w(Q(U,0,1)),n=g(Q(t+(Hn(e.clahe,s,c,t)-t)*(h.clarity+u.clarity*bt),0,1));ht=U>1e-5?n/U:1;for(let e=0;e<3;e++)H[e]*=ht}{let e=O(H[0],H[1],H[2]),t=an(M,m.shadowFloor)*M*ut*pt,n=Math.max(e,t);if(n=Ve(n,M,j(m)*(1-tt)),n>m.knee&&(n=m.knee+(1-m.knee)*(1-Math.exp(-(n-m.knee)/(1-m.knee)))),e>1e-6){if(n!==e){let t=n/e;H[0]*=t,H[1]*=t,H[2]*=t}}else{let e=n/M;H[0]=ye[0]*e,H[1]=ye[1]*e,H[2]=ye[2]*e}}let[,St,Ct]=S(C,E,k),wt=Math.hypot(St,Ct),Tt=S(Math.max(0,H[0]),Math.max(0,H[1]),Math.max(0,H[2])),Et=Tt[0],Dt=Tt[1],W=Tt[2],G=Math.hypot(Dt,W),Ot=m.chromaK*wt+m.chromaC0,K=G>Ot?Ot/G:1,kt=$(He.cLo,He.cHi,wt)*ur(St,Ct,m),At=He.keep*wt*kt;G>1e-6&&G*K<At&&(K=At/G),K*=h.saturation;let jt=dr(St,Ct,m,T.farLo,T.farHi);[Dt,W]=be(Et,Dt,W,j(m)*(1-_e.gnObjKeep*tt));let Mt=$n(Et,Dt,W,C,E,k,jt,z?0:vt,yt)*$(u.keepDarkLo,u.keepDarkHi,Et),Nt=de*(1-Ne(m)*nr(C,E,k));K*=tr(Dt,W,C,E,k,jt,Nt,z?Ne(m):yt);let[Pt,Ft]=Qn(Dt*K,W*K,st/V,ct/V,Mt/T.mix),It=$(A.castLo,A.castHi,Math.hypot(Dt,W)*K),Lt=Et,Rt=rr(Lt,Pt,Ft,Nt),zt=ir(Lt,Rt[0],Rt[1],h.look,1-fr(Me,Pe,m),ue(m),ce(m)),q=ze(zt[0],zt[1],zt[2],St,Ct,de,jt),Bt=re(zt[0],q[0],q[1],j(m),jt),J=ar(zt[0],Bt[0],Bt[1],h.vivid??0,j(m)),Vt=bt>0&&!z?ar(zt[0],Bt[0],Bt[1],(h.vivid??0)*(1-u.vividKeep*Math.min(1,bt)),j(m))[0]:J[0],Ht=z?e.seg.popDir??1:1,Ut=z?Vt:Vt+u.lift*bt*Ht*4*Vt*Math.max(0,1-Vt),Wt=1+(u.chromaFollowDark+(u.chromaFollow-u.chromaFollowDark)*$(u.keepDarkLo,u.keepDarkHi,Vt))*(Ut/Math.max(1e-4,Vt)-1);J[0]=Ut,J[1]*=Wt,J[2]*=Wt;let Gt=lr(J[0],J[1],J[2]),Kt=Gn(Gt[0],Gt[1],St,Ct,Q(vt*yt,0,1)),qt=$(A.wLo,A.wHi,vt)*(z?0:$(F.subjLo,F.subjHi,rt))*(h.subjectPop?Math.min(1,Math.max(0,h.subjectPopWarmth??0)):0)*It,Jt=Wn(J[0],Kt[0],Kt[1],qt),Y=or(J[0],Jt[0],Jt[1],h.blue??0,j(m));if([Y[1],Y[2]]=sr(Y[1],Y[2],e.waterTint??0,j(m)),[Y[1],Y[2]]=cr(Y[0],Y[1],Y[2],h.vivid??0),(e.seabed??0)>0){let t=zn(m,s,c)*(1-kt)*e.seabed;Y[0]+=N.lift*t,Y[1]+=(Math.cos(N.hue)*N.chroma+N.keep*Y[1]-Y[1])*t,Y[2]+=(Math.sin(N.hue)*N.chroma+N.keep*Y[2]-Y[2])*t}if(xt>0){let t=(M+P.eps)/(Yn(e.depth,s,c)+P.eps);[Y[0],Y[1],Y[2]]=Zn(Y[0],Y[1],Y[2],xt,h.subjectPop?Math.min(1,Math.max(0,h.subjectPopWarmth??0)):0,t,0,Xn(z),B>1?xt*(1-1/B):0)}(m.toneGamma??1)>1&&(Y[0]=Math.max(0,Y[0])**+m.toneGamma);let Yt=n(Y[0],Y[1],Y[2],Math.max(wt,qt*A.cMin*1.5,Y[3])),[Xt,X,Zt]=d(Y[0],Yt[0],Yt[1]),Qt=l?gr(t,r,o,C,E,k):1,[$t,en,tn]=Se(Xt*Qt,X*Qt,Zt*Qt),nn=w($t),rn=w(en),on=w(tn);if(e.trace){let t=e=>e.map(e=>+e.toFixed(3));Object.assign(e.trace,{subj:lt,srcC:t(We),redS:+Ge.toFixed(2),lin:t([C,E,k]),z:+ge.toFixed(2),k:+se.toFixed(2),conf:+tt.toFixed(2),veilScale:+ve.toFixed(2),B:t(xe),sig:+ke.toFixed(2),wSub:+Le.toFixed(2),full:t(I),outPreLevels:t(H.map(e=>e)),Y:+U.toFixed(3),C:+G.toFixed(3),cMax:+Ot.toFixed(3),scale:+K.toFixed(2),o1:t([Xt,X,Zt]),o2:t([$t,en,tn])})}return[t+(nn-t)*h.strength,r+(rn-r)*h.strength,o+(on-o)*h.strength]}function Wn(e,t,n,r){if(r<=0)return[t,n];let i=Math.min(A.cMax,Math.max(A.keep*Math.hypot(t,n),A.cMin*$(A.lLo,A.lHi,e))),a=Math.cos(A.hue),o=Math.sin(A.hue),s=t*a+n*o,c=Math.max(0,1-r)**+A.side,l=s+(i-s)*r;return[a*l+(t-a*s)*c,o*l+(n-o*s)*c]}function Gn(e,t,n,r,i){let a=Math.hypot(e,t),o=Math.hypot(n,r);if(i*=$(.01,.04,o),i<=0||a<1e-4)return[e,t];let s=e/a,c=t/a,l=n/o,d=r/o,f=Math.cos(u.hueMax),p=Math.sin(u.hueMax);if(s*l+c*d>=f)return[e,t];let m=Math.sign(l*c-d*s),h=l*f-m*d*p,g=d*f+m*l*p,_=s+(h-s)*i,v=c+(g-c)*i,y=Math.hypot(_,v)||1;return[a*_/y,a*v/y]}function Kn(e,t,n,r){let i=Math.min(Math.max(t*e.width-.5,0),e.width-1),a=Math.min(Math.max(n*e.height-.5,0),e.height-1),o=Math.floor(i),s=Math.floor(a),c=Math.min(o+1,e.width-1),l=Math.min(s+1,e.height-1),u=i-o,d=a-s,f=[0,0,0,0,0,0],p=(e,t,n,r)=>(e+(t-e)*u)*(1-d)+(n+(r-n)*u)*d;for(let i=0;i<4;i++){let a=e.data[(s*e.width+o)*4+i],m=e.data[(s*e.width+c)*4+i],h=e.data[(l*e.width+o)*4+i],g=e.data[(l*e.width+c)*4+i];if(i===0){let e=On(a),t=On(m),n=On(h),r=On(g);f[0]=p(e[0],t[0],n[0],r[0]),f[4]=p(e[1],t[1],n[1],r[1]),f[5]=p(e[2],t[2],n[2],r[2])}else f[i]=p(a,m,h,g);if(i===2&&r){let i=Math.min(a,m,h,g),p=Math.max(a,m,h,g);if(p-i>1e-4&&i<I.jbuHi&&p>I.jbuLo){let i=r(t,n);if(i>=0){let t=(t,n)=>r((t+.5)/e.width,(n+.5)/e.height),n=Ye([(1-u)*(1-d),u*(1-d),(1-u)*d,u*d],[t(o,s),t(c,s),t(o,l),t(c,l)],i),p=n[0]+n[1]+n[2]+n[3];p>1e-5&&(f[2]=(n[0]*a+n[1]*m+n[2]*h+n[3]*g)/p)}}}}return f}function qn(e){return e>0?$(I.popLo,I.popHi,e):0}function Jn(e,t,n,r,i,a){if(e[3]<=0)return 0;let o=(e[2]-.5)*2*I.alphaR,s=I.evFar+(1-I.evFar)*Q(e[4]??1,0,1),c=e[0]>=0&&e[0]<=2,l=c?$(I.evLo*s,I.evHi*s,Math.hypot(t[0]-e[0],t[1]*r-t[2]*n)):1,u=l+(1-l)*$(I.trustLo,I.trustHi,o);return $(0,c?I.rampIn+(I.rampEv-I.rampIn)*l*Q(e[5]??0,0,1):I.rampIn,o)*u*Math.max(i,qn(e[3]))*e[1]*Math.min(1,x.popGate*a)}function Yn(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>{let r=(n*e.width+t)*3;return O(e.guide[r],e.guide[r+1],e.guide[r+2])};return(d(a,o)+(d(s,o)-d(a,o))*l)*(1-u)+(d(a,c)+(d(s,c)-d(a,c))*l)*u}function Xn(e){let t=(e[2]-.5)*2*I.alphaR,n=Q(e[4]??1,0,1);return $(0,x.edge,t)*(x.farKeep+(1-x.farKeep)*n)}function Zn(e,t,n,r,i,a,o=0,s=1,c=0){if(r<=0)return[e,t,n];let l=x,u=Math.cos(l.hue),d=Math.sin(l.hue),f=Math.hypot(t,n),p=f>1e-5?$(0,.5,-(t*u+n*d)/f):0,m=1-Math.min(l.castMax,l.cast*r)*p*s;t*=m,n*=m;let h=$(l.litLo,l.litHi,e)*(1-$(l.hiLo,l.hiHi,e)),g=Math.min((l.warm*r+l.boostWarm*c)*Math.min(1,2*i)*h*s,(l.warmShare+l.boostWarmShare*c)*Math.max(0,-(t*u+n*d)));t+=u*g,n+=d*g;let _=e*Q(a,l.rMin,l.rMax)**+(l.detail*r+l.boostDetail*c);return _+=Math.max(0,l.lift*r+l.boostLift*c-o)*4*_*Math.max(0,1-_),[_,t,n]}function Q(e,t,n){return e<t?t:e>n?n:e}function $(e,t,n){let r=Q((n-e)/(t-e),0,1);return r*r*(3-2*r)}function Qn(e,t,n,r,i){let a=Math.hypot(e,t);if(i<=0||a<1e-6)return[e,t];let o=Math.max(0,e*n+t*r),s=Math.max(0,(a-i*Math.min(D.k*o,D.cMax))*(1-i*D.desat));return[e*s/a,t*s/a]}function $n(e,t,n,r,i,a,o,s,c){if(c<=0||s<=0)return 0;let l=Math.hypot(t,n);if(l<1e-5)return 0;let u=(t*Math.cos(T.hue)+n*Math.sin(T.hue))/l,d=$(Math.cos(T.bandOut),Math.cos(T.bandIn),u),f=1-$(T.rLo,T.rHi,r/Math.max(1e-4,i,a)),p=$(T.lLo,T.lHi,e);return c*T.mix*s*(d+(1-d)*f)*f*p*(1-o)}function er(e){return $(T.confLo,T.confHi,e)}function tr(e,t,n,r,i,a,o,s){if(s<=0)return 1;let c=Math.hypot(e,t);if(c<1e-5)return 1;let l=(e*Math.cos(T.warmHue)+t*Math.sin(T.warmHue))/c;return 1-s*(1-$(T.rLo,T.rHi,n/Math.max(1e-4,r,i)))*$(T.warmLo,T.warmHi,l)*(1-a)*(1-Q(o,0,1))}function nr(e,t,n){return 1-$(T.rLo,T.rHi,e/Math.max(1e-4,t,n))}function rr(e,t,n,r){if(r<=0)return[t,n];let i=Math.hypot(t,n),a=Math.atan2(n,t),o=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),s=Math.max(1-$(C.bandIn,C.bandOut,Math.abs(o(a-C.bandHue))),1-$(C.achroma*.5,C.achroma,i)),c=$(C.wLo,C.wHi,r)*s*$(C.lLo,C.lHi,e)*(1-$(C.cLo,C.cHi,i));if(c<=0)return[t,n];let l=a+o(C.hue-a)*C.mix*c,u=i+Math.max(0,C.cMin-i)*c;return[u*Math.cos(l),u*Math.sin(l)]}function ir(e,t,n,r,i,a,o=0){if(r<=0)return[e,t,n];let s=Math.hypot(t,n),l=Math.atan2(n,t),u=e=>e-2*Math.PI*Math.round(e/(2*Math.PI)),d=$(c.keepLo,c.keepHi,s),f=(1-$(c.warmIn,c.warmOut,Math.abs(u(l-c.warmHue))))*$(c.warmLo+c.warmHaze*a,c.warmHi+c.warmHaze*a,s),p=$(c.farLo,c.farHi,Math.abs(u(l-c.targetHue))),m=c.darkLo+(c.darkHi-c.darkLo)*(1-c.darkHaze*a),h=(1-d)*(1-f)*(1-$(c.brightLo,c.brightHi,e))*$(c.darkLo,m,e)*(1-c.farKeep*(1-a)*p)*r*c.mix,g=Math.max(0,e)**+(1+c.gamma*r)*(1-c.waterDim*r*i*(1-a)),_=Math.max(s,c.c0+c.c1*g),v=Math.max(s,(c.c0+c.c1*g)*(1+c.hazeChroma*a)),y=_+(c.objChroma-_)*a,b=y+(v-y)*Math.max(i,o),x=1-r*c.neutralDesat*(1-$(c.neutralLo,c.neutralHi,s))*$(c.neutralLLo,c.neutralLHi,e);return[g,(t+(b*Math.cos(c.targetHue)-t)*h)*x,(n+(b*Math.sin(c.targetHue)-n)*h)*x]}function ar(e,t,n,i,a){if(i<=0)return[e,t,n];let o=r,s=Math.hypot(t,n),c=Math.atan2(n,t),l=c<0?c+2*Math.PI:c,u=c-o.target-2*Math.PI*Math.round((c-o.target)/(2*Math.PI)),d=$(o.cLo,o.cHi,s)*$(o.lLo,o.lHi,e),f=1-$(o.bandHi0,o.bandHi1,l),p=$(o.bandLo0,o.bandLo1,l)*f*(1-$(o.violetCLo,o.violetCHi,s)*$(o.target,o.bandHi1,l)),m=$(o.greenLo0,o.greenLo1,l),h=m*(1-$(o.greenTop0,o.greenTop1,l)),g=c+((1-a)*p*o.pull*-u+a*h*o.greenShift)*d*i,_=(1-a)*p+a*m*f,v=$(o.darkCLo,o.darkCHi,s),y=_*v*v*i;s*=1+o.chroma*y*(1-a);let b=e*(1-(o.dark+(o.darkGreen-o.dark)*a)*y*$(o.darkLLo,o.darkLHi,e));b*=1-o.blackK*i*(1-$(o.blackLo,o.blackHi,b));let x=o.shadowC0+o.shadowC1*$(o.shadowLLo,o.shadowLHi,b);s>x&&(s-=(s-x)*(1-o.shadowKeep)*i*(1-$(o.shadowFadeLo,o.shadowFadeHi,b)));let S=i*(1+(_-1)*$(0,o.liftNeutralC,s))*$(o.liftLLo,1,e);b+=o.lift*S*(1-b),s*=1-o.hiDesat*S;let C=o.warmC*S;return[b,s*Math.cos(g)+C*Math.cos(o.warmHue),s*Math.sin(g)+C*Math.sin(o.warmHue)]}function or(e,t,n,r,i){if(r<=0)return[e,t,n,0];let a=fe,o=Math.hypot(t,n),s=Math.atan2(n,t),c=s<0?s+2*Math.PI:s,l=$(a.warmIn0,a.warmIn1,c)*(1-$(a.warmOut0,a.warmOut1,c))*$(a.warmCLo,a.warmCHi,o)*$(a.warmLLo,a.warmLHi,e)*r,u=c+(a.warmHue-c)*a.warmPull*l,d=Math.max(o,Math.min(o*(1+a.warmGain*l),a.warmCMax)),f=d*Math.cos(u),p=d*Math.sin(u),m=t*Math.cos(a.warmDir)+n*Math.sin(a.warmDir),h=1-$(a.sLo,a.sHi,m),g=$(a.vcLo,a.vcHi,o)*$(a.vio0,a.vio1,c)*(1-$(a.vio2,2*Math.PI,c)),_=$(a.neutralLLo,a.neutralLHi,e)*(1-$(a.neutralCLo,a.neutralCHi,o)),v=Math.min(a.cMax,a.cK*e)*(1-a.hiDrop*$(a.hiLo,a.hiHi,e)),y=$(a.vegCLo,a.vegCHi,o)*$(a.vegIn0,a.vegIn1,c)*(1-$(a.vegOut0,a.vegOut1,c))*(1-a.vegGreen*i),b=a.mix*h*(1-g)*(1-y)*(1-_)*r;f+=(v*Math.cos(a.target)-f)*b,p+=(v*Math.sin(a.target)-p)*b;let x=1-a.neutralK*_*h*r;return f*=x,p*=x,[e*(1-a.shadowK*r*(1-$(0,a.shadowHi,e))),f,p,Math.max(v*b,d*l)]}function sr(e,t,n,r){if(n===0)return[e,t];let i=fe,a=Math.hypot(e,t),o=Math.atan2(t,e),s=o<0?o+2*Math.PI:o,c=1-$(i.sLo,i.sHi,e*Math.cos(i.warmDir)+t*Math.sin(i.warmDir)),l=$(i.vcLo,i.vcHi,a)*$(i.vio0,i.vio1,s)*(1-$(i.vio2,2*Math.PI,s)),u=$(i.vegCLo,i.vegCHi,a)*$(i.vegIn0,i.vegIn1,s)*(1-$(i.vegOut0,i.vegOut1,s))*(1-i.vegGreen*r),d=n*c*(1-l)*(1-u),f=Math.cos(d),p=Math.sin(d);return[e*f-t*p,e*p+t*f]}function cr(e,n,r,i){let a=Math.hypot(n,r);if(i<=0||a<1e-6)return[n,r];let o=t,s=Math.atan2(r,n),c=s<0?s+2*Math.PI:s,l=$(o.warmIn0,o.warmIn1,c)*(1-$(o.warmOut0,o.warmOut1,c)),u=$(o.magIn0,o.magIn1,c)*(1-$(o.magOut0,o.magOut1,c)),d=$(o.cLo,o.cHi,a)*$(o.lLo,o.lHi,e)*(1-$(o.hiLo,o.hiHi,e)),f=$(o.coolIn0,o.coolIn1,c)*(1-$(o.magOut0,o.magOut1,c)),p=1+(o.gain*(1-o.coolCut*f)+o.warmGain*l)*(1-u)*d*i*Math.exp(-a/(o.top+(o.warmTop-o.top)*l));return[n*p,r*p]}function lr(e,t,n){let r=Math.hypot(t,n);if(r<1e-6)return[t,n];let i=Le,a=Math.atan2(n,t),o=Math.abs(a-i.hue-2*Math.PI*Math.round((a-i.hue)/(2*Math.PI))),s=i.mix*$(i.lLo,i.lHi,e)*(1-$(i.cLo,i.cHi,r))*(1-$(i.bandIn,i.bandOut,o));return[t*(1-s),n*(1-s)]}function ur(e,t,n){return dr(e,t,n,n.hueFarLo,n.hueFarHi)}function dr(e,t,n,r,i){let a=Math.hypot(e,t);if(a<n.achroma)return 0;let[,o,s]=S(n.veilColor[0],n.veilColor[1],n.veilColor[2]),c=Math.hypot(o,s)||1,l=Math.max(-1,Math.min(1,(e*o/c+t*s/c)/a));return(1-$(Math.cos(i),Math.cos(r),l))*$(n.achroma,n.achroma*2,a)}function fr(e,t,n){let r=Math.hypot(e,t);if(r<n.achroma)return 1;let[,i,a]=S(n.veilColor[0],n.veilColor[1],n.veilColor[2]),o=Math.hypot(i,a)||1,s=Math.max(-1,Math.min(1,(e*i/o+t*a/o)/r)),c=1-$(Math.cos(n.cosHi),Math.cos(n.cosLo),s),l=$(n.achroma,n.achroma*2,r);return c+(1-c)*(1-l)}function pr(e,t,n){let r=Math.min(Math.max(t*e.width-.5,0),e.width-1),i=Math.min(Math.max(n*e.height-.5,0),e.height-1),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,e.width-1),c=Math.min(o+1,e.height-1),l=r-a,u=i-o,d=(t,n)=>e.fields[(n*e.width+t)*4+1];return(d(a,o)*(1-l)+d(s,o)*l)*(1-u)+(d(a,c)*(1-l)+d(s,c)*l)*u}var mr=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];function hr(e,t,n,r,i){let a=Math.min(1,Math.max(0,r)),o=0;for(let[r,i]of mr)o=Math.max(o,pr(e,t+r*F.ringR/e.width,n+i*F.ringR/e.height));let s=$(F.subjLo,F.subjHi,i),c=$(F.coreIn,1,a)*$(F.coreLo,F.coreHi,i);return Math.max(a*(s+(1-s)*c),Math.min(Math.min(1,o),s))}function gr(e,t,n,r,i,a){let o=O(g(e),g(t),g(n)),s=O(r,i,a);return Q((o+P.eps)/(s+P.eps),P.rMin,P.rMax)}var _r=new WeakMap;function vr(e,t,n){let r=e.animals;if(!r)return[0,0];let i=e.strength??_r.get(r);i||(i=m(r).data,_r.set(r,i));let a=r.width,o=r.height,s=Math.min(a-1,Math.max(0,Math.floor(t*a))),c=Math.min(o-1,Math.max(0,Math.floor(n*o))),l=Math.min(Math.max(t*a-.5,0),a-1),u=Math.min(Math.max(n*o-.5,0),o-1),d=Math.floor(l),f=Math.floor(u),p=Math.min(d+1,a-1),h=Math.min(f+1,o-1),g=l-d,_=u-f,v=(e,t)=>i[(t*a+e)*4+1],y=(v(d,f)*(1-g)+v(p,f)*g)*(1-_)+(v(d,h)*(1-g)+v(p,h)*g)*_;return[i[(c*a+s)*4],y]}var yr={cMax:.13,achroma:.03,hueMax:75*Math.PI/180,lumMin:.05,texLo:.045,texHi:.25,top:.3,near:.3,fracLo:.06,fracHi:.15,samples:64,neutral:(()=>{let[,e,t]=S(1,1,.94);return[e,t]})(),pinkMax:.006,maxLog:Math.log(1.6),eps:.04,iterations:4,maxStep:.2,tol:.002,water:.6};function br(e,t){if(t[0]===0&&t[1]===0)return e;let n=Math.exp(t[0]),r=Math.exp(t[1]),i=Math.exp(t[0]*yr.water),a=Math.exp(t[1]*yr.water);return{...e,wb:[e.wb[0]*n,e.wb[1],e.wb[2]*r],waterWb:[e.waterWb[0]*i,e.waterWb[1],e.waterWb[2]*a]}}function xr(e,t){if(!e||!e.t.length)return[0,0];let n=e.t.length;if(n===1||t<=e.t[0])return[e.r[0],e.b[0]];if(t>=e.t[n-1])return[e.r[n-1],e.b[n-1]];let r=1;for(;e.t[r]<t;)r++;let i=(t-e.t[r-1])/Math.max(1e-6,e.t[r]-e.t[r-1]);return[e.r[r-1]+(e.r[r]-e.r[r-1])*i,e.b[r-1]+(e.b[r]-e.b[r-1])*i]}function Sr(e,t,n){return t?br(e,xr(t,n)):e}var Cr=.12;function wr(e,t){let[n,r]=e,i=[r[0]-n[0],r[1]-n[1],r[2]-n[2]],a=i[0]*i[0]+i[1]*i[1]+i[2]*i[2];return a<1e-8?0:Math.min(1,Math.max(0,((t[0]-n[0])*i[0]+(t[1]-n[1])*i[1]+(t[2]-n[2])*i[2])/a))}var Tr=class{segments;cutSeen=new Map;curves=[];seen=new Map;last=new Map;shown=new Map;time=NaN;constructor(e){this.segments=[...e].sort((e,t)=>e.from-t.from)}noteCut(e){hn(this.segments,this.cutSeen,e)}noteFrame(e,t){this.segments.forEach((n,r)=>{if(!n.window||!n.means||this.cutSeen.has(r)||t<n.window[0]||t>=n.window[1]){this.last.delete(r);return}let i=wr(n.means,e),a=this.last.get(r);this.last.set(r,i),a!==void 0&&this.seen.set(r,Math.max(this.seen.get(r)??0,Math.min(i,a)))})}aim(e,t){let n=this.segments[e];return e===0||t>=pn(n,e,this.cutSeen)?1:!n.window||t<n.window[0]?0:this.seen.get(e)??0}advance(e,t=!1){let n=e-this.time,r=!t&&n>=0&&n<=.5;this.time=e,this.segments.forEach((t,i)=>{if(!t.window)return;e<t.window[0]&&(this.seen.delete(i),this.last.delete(i));let a=this.aim(i,e),o=r&&!this.cutSeen.has(i)&&e>=t.window[0]&&e<t.window[1]+4*.12,s=this.shown.get(i)??0;this.shown.set(i,o?s+(a-s)*(1-Math.exp(-n/Cr)):a)})}share(e,t){return this.segments[e].window&&t===this.time?this.shown.get(e)??this.aim(e,t):this.aim(e,t)}index(e){let t=0;for(let n=1;n<this.segments.length;n++)this.share(n,e)>=.5&&(t=n);return t}paramsAt(e,t=!0){let n=n=>t?Sr(this.segments[n].params,this.curves[n],e):this.segments[n].params,r=n(0);for(let t=1;t<this.segments.length;t++){let i=this.share(t,e);i>=1?r=n(t):i>0&&(r=le(r,n(t),i))}return r}inCutWindow(e){return mn(this.segments,this.cutSeen,e)}reset(){this.cutSeen.clear(),this.seen.clear(),this.last.clear(),this.shown.clear(),this.time=NaN}},Er=1e3,Dr=class{holding=!1;held=null;from=null;t0=0;ms=0;hold(e){this.holding=!0,this.held=e}get isHolding(){return this.holding}rehold(e,t){this.holding&&(t||!this.held)&&(this.held=e)}handOver(e,t,n=Er){this.holding=!1,this.held=null,this.from=n>0?e:null,this.t0=t,this.ms=n}rebase(e,t){if(this.holding||!e)return;let n=this.from?this.t0+this.ms-t:0;this.from=e,this.t0=t,this.ms=Math.max(400,n)}release(){this.holding=!1,this.held=null,this.from=null}settle(){this.from=null,this.held=null}weight(e){if(!this.from)return 1;let t=Math.min(1,Math.max(0,(e-this.t0)/this.ms));return t*t*(3-2*t)}get pending(){return this.from!==null}fading(e){return this.from!==null&&e-this.t0<this.ms}globals(e,t){return e?this.from?t-this.t0>=this.ms?(this.from=null,e):le(this.from,e,this.weight(t)):e:this.holding?this.held:null}},Or={patch:9,darkY:.004,bright:.985,done:.003,limited:.012,iters:16,step:.7,probe:.04,keep:.15,useless:.7,limitedMax:2.5};function kr(e,t=255){let n=Math.floor(e.length/4),r=r=>{let i=new Float64Array(n);for(let t=0;t<n;t++)i[t]=e[t*4+r];return i.sort(),(n%2?i[n>>1]:(i[(n>>1)-1]+i[n>>1])/2)/t};return n>0?[r(0),r(1),r(2)]:[0,0,0]}function Ar(e,t,n,r){let i=Math.max(Or.patch,Math.round(.012*Math.min(n,r))),a=Math.min(1,i/Math.max(1,n)),o=Math.min(1,i/Math.max(1,r));return{x:Math.min(1-a,Math.max(0,e-a/2)),y:Math.min(1-o,Math.max(0,t-o/2)),w:a,h:o}}function jr(e){return{...e,intensity:Math.max(1,e.intensity),vivid:0,blue:0,look:0,seabed:0,subjectPop:!1,waterHue:0,wbTap:void 0}}function Mr(e,t,n,r){let i=Or,a=[g(t[0]),g(t[1]),g(t[2])];if(O(a[0],a[1],a[2])<i.darkY)return{ok:!1,reason:`dark`};if(Math.min(t[0],t[1],t[2])>=i.bright)return{ok:!1,reason:`bright`};let o=Math.log(h.max),s=e=>Math.min(o,Math.max(-o,e)),c=jr(e.settings),l=(i,a)=>{let o={...c,wbTap:[Math.exp(i),Math.exp(a)]},s=Un(Ln({...e,settings:o,debug:!1,trace:void 0}),t[0],t[1],t[2],n,r),l=[g(s[0]),g(s[1]),g(s[2])],[,u,d]=S(l[0],l[1],l[2]);return{a:u,b:d,c:Math.hypot(u,d),lin:l}},u=0,d=0,f=l(0,0),p=f.c;for(let e=0;e<i.iters&&f.c>i.done;e++){let e=u+i.probe>o?-i.probe:i.probe,t=d+i.probe>o?-i.probe:i.probe,n=l(u+e,d),r=l(u,d+t),a=(n.a-f.a)/e,c=(r.a-f.a)/t,p=(n.b-f.b)/e,m=(r.b-f.b)/t,h=a*m-c*p,g=[];Math.abs(h)>1e-7&&g.push([-(m*f.a-c*f.b)/h,-(-p*f.a+a*f.b)/h]),g.push([-Math.log(Math.max(1e-4,f.lin[0])/Math.max(1e-4,f.lin[1])),-Math.log(Math.max(1e-4,f.lin[2])/Math.max(1e-4,f.lin[1]))]);let _=!1;for(let[e,t]of g){let n=Math.min(1,i.step/Math.max(1e-9,Math.max(Math.abs(e),Math.abs(t))));for(let r=n,i=0;i<5&&!_;i++,r/=2){let n=s(u+r*e),i=s(d+r*t);if(n===u&&i===d)break;let a=l(n,i);a.c<f.c-1e-6&&(u=n,d=i,f=a,_=!0)}if(_)break}if(!_)break}let m=f.c>i.limited;if(m){if(f.c>i.useless*p)return{ok:!0,gains:[1,1],before:p,after:p,limited:!0};let a=f.c+i.keep*(p-f.c);for(let e=.1;e<.999;e+=.1){let t=l(u*e,d*e);if(t.c<=a){u*=e,d*=e,f=t;break}}if(m=f.c>i.limited,m){let a=i=>{let a=Un(Ln({...e,settings:{...e.settings,wbTap:i},debug:!1,trace:void 0}),t[0],t[1],t[2],n,r),[,o,s]=S(g(a[0]),g(a[1]),g(a[2]));return Math.hypot(o,s)};if(Math.exp(Math.max(Math.abs(u),Math.abs(d)))>i.limitedMax||a([Math.exp(u),Math.exp(d)])>i.useless*a(void 0))return{ok:!0,gains:[1,1],before:p,after:p,limited:!0}}}return{ok:!0,gains:[Math.exp(u),Math.exp(d)],before:p,after:f.c,limited:m}}var Nr=70,Pr=.6,Fr=3,Ir=.4,Lr=.7,Rr=.05,zr=.16,Br=5e3,Vr=2,Hr=16,Ur=.95,Wr=.2,Gr=.3,Kr=Math.cos(15*Math.PI/180),qr=.02,Jr=8,Yr=[b,{x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}];function Xr(e){return{...e,clahe:{width:e.clahe.bins,height:e.clahe.tilesX*e.clahe.tilesY,data:e.clahe.data}}}var Zr=class e{backend;settings={...Be};split=0;workerMs={analysis:0,person:0,analyses:0,readback:0,poolWait:0,personWait:0};analysisPoolSize=2;verifyPrecomputed=!1;precomputeStats={hits:0,misses:0,mismatches:0,personHits:0,personMisses:0};worker=null;inflight=!1;reqId=0;analysisIntervalMs=70;personEvery=Vr;personEnabled=!0;temporalEnabled=!0;noiseReductionEnabled=!0;nrDrawnSec=NaN;followEnabled=!0;profileThumbs=new Map;keepThumbAt=null;balanceReq=0;balancePending=null;balanceDone=null;lastRenderSec=-1;rawReq=!1;animals=new se;leadBase=null;reqTimeSec=0;strengthOn=!1;seg=null;popDir=1;popC={sum:0,n:0};personWorker=null;personInflight=!1;personReqId=0;personFailed=!1;personCount=0;person=null;personTarget=null;personFull=null;personTiles=null;personRectIdx=0;personRectInflight=b;personBoxes=null;personBoxesAt=-1/0;personPasses=0;personDetectInflight=!1;personDetectWarned=!1;personWaiters=[];personBase={count:0,passes:0,rectIdx:0};prePersonId=0;prePersonWaiters=new Map;lastSlot=NaN;current=ie;target=null;fields=null;guide=null;clahe=null;fieldsTarget=null;guideTarget=null;claheTarget=null;lastMean=null;lastTickSec=0;hasAnalysis=!1;dirtyData=!1;stats;track=null;handover=new Dr;fadeBalance=!1;pool=[];poolLoad=[];preId=0;preWaiters=new Map;pre=new Map;resolveWaiters=[];rejectWaiters=[];onError;constructor(e,t){this.backend=e,this.onError=t,this.stats={backend:e.kind,analysisMs:0,analyses:0,sceneCuts:0,person:`off`,personMs:0,personCoverage:0,personBoxes:-1,personDetectMs:0},this.fields={width:2,height:2,data:new Float32Array(16)},this.guide={width:2,height:2,data:new Float32Array(16)};let n=new Float32Array(1536*4);for(let e=0;e<48;e++)for(let t=0;t<32;t++)n[(e*32+t)*4]=(t+1)/32;this.clahe={width:32,height:48,data:n},this.pushData()}static async create(t,n,r=!0){let i=null;if(r)try{i=await Qt.create(t)}catch(e){console.warn(`WebGPU unavailable, using WebGL2:`,e.message)}return i||=new Kt(t),new e(i,n)}getStats(){return{...this.stats}}lockGlobals(e,t=0){let n=this.hasAnalysis?this.current:null;this.track=e&&e.length>0?new Tr(e):null,this.balanceReq++,this.balanceDone?.(),this.balancePending=this.balanceDone=null,this.track||this.handover.release(),this.track&&(this.handover.handOver(n,performance.now(),t),this.fadeBalance=t>0&&n!==null,this.track.advance(this.lastTickSec,!0),this.current=this.applyLock(this.current),this.target&&=this.applyLock(this.target),this.requestBalance())}holdGlobals(){this.handover.hold(this.hasAnalysis?this.current:null)}releaseHold(){this.handover.isHolding&&this.handover.release()}get lockSettling(){return this.track!==null&&(this.handover.pending||this.balancePending!==null)}settleLock(){this.handover.settle(),this.fadeBalance=!1,this.hasAnalysis&&(this.current=this.applyLock(this.current)),this.target&&=this.applyLock(this.target)}forgetProfile(){this.profileThumbs.clear()}requestBalance(){let e=this.track?.segments;if(!e||!this.followEnabled||this.profileThumbs.size===0)return;let t=e.map((t,n)=>{let r=n===0?-1/0:t.from,i=n+1<e.length?e[n+1].from:1/0,a=[...this.profileThumbs].filter(([e])=>e>=r&&e<i).sort((e,t)=>e[0]-t[0]);return{lock:t.params,times:a.map(([e])=>e),thumbs:a.map(([,e])=>e.slice().buffer)}}),n={kind:`balance`,id:this.balanceReq,width:256,height:144,shots:t};this.balancePending=new Promise(e=>this.balanceDone=e),this.ensureWorker().postMessage(n,t.flatMap(e=>e.thumbs))}onBalance(e){e.id!==this.balanceReq||!this.track||(this.fadeBalance&&this.hasAnalysis&&this.handover.rebase(this.current,performance.now()),this.track.curves=e.shots.map(e=>e?.curve??null),this.current=this.applyLock(this.current),this.target&&=this.applyLock(this.target),this.dirtyData=!0,this.balanceDone?.(),this.balancePending=this.balanceDone=null,console.info(`[balance] ${e.shots.length} shot(s): ${e.shots.map(e=>e?e.curve?e.curve.t.length===1?`frozen ${e.curve.r[0].toFixed(2)}/${e.curve.b[0].toFixed(2)}`:`easing ${e.curve.r[0].toFixed(2)}/${e.curve.b[0].toFixed(2)} → ${e.curve.r[e.curve.r.length-1].toFixed(2)}/${e.curve.b[e.curve.b.length-1].toFixed(2)} over ${(e.curve.t[e.curve.t.length-1]-e.curve.t[0]).toFixed(1)} s`:`no anchor frames`:`plain lock`).join(` | `)}`))}get isLocked(){return this.track!==null}get lockSegments(){return this.track?.segments.length??0}lockedParamsAt(e){return this.lockedAt(e)}lockedAt(e){return this.track?this.track.paramsAt(e,this.followEnabled):null}inCutWindow(e){return this.track?this.track.inCutWindow(e):!1}noteSceneCut(e){this.track?.noteCut(e)}lockRange=!1;applyLock(e){let t=this.handover.globals(this.lockedAt(this.lastTickSec),performance.now());return t?gn(t,e,this.lockRange):e}async analyzeRaw(e=1e4,t,n){let r=new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)});this.inflight&&await r.catch(()=>void 0);let i=new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)});this.keepThumbAt=t??null,await this.startAnalysis({raw:!0,seeds:n});let a=await new Promise((t,n)=>{let r=setTimeout(()=>n(Error(`Frame analysis timed out`)),e);i.then(e=>{clearTimeout(r),t(e)},e=>{clearTimeout(r),n(e)})});return{params:a.params,mean:a.mean,animals:a.animals}}getPersonMap(){return!this.person||!this.fields?null:{width:this.fields.width,height:this.fields.height,data:this.person}}ensureWorker(){if(this.worker)return this.worker;let e=new Worker(new URL(`/video/studio/assets/analysis-worker-Xa-XJJto.js`,``+import.meta.url),{type:`module`});return e.onmessage=e=>{e.data.kind===`balance`?this.onBalance(e.data):this.onPacket(e.data)},e.onerror=e=>{this.inflight=!1;let t=Error(`Analysis worker failed: `+e.message);this.settle(null,t),this.balanceDone?.(),this.balancePending=this.balanceDone=null,this.onError(t)},this.worker=e,e}ensurePersonWorker(){if(this.personWorker)return this.personWorker;let e=new Worker(new URL(`/video/studio/assets/person-worker-PK8s94hj.js`,``+import.meta.url),{type:`module`});return e.onmessage=e=>{let t=e.data;if(t.id<0){let e=this.prePersonWaiters.get(t.id);this.prePersonWaiters.delete(t.id),e?.(t);return}this.onPersonPacket(t)},e.onerror=e=>{for(let e of this.prePersonWaiters.values())e(null);this.prePersonWaiters.clear(),this.personInflight=!1,this.personFailed=!0,this.stats.person=`failed`,console.warn(`Person segmentation worker failed:`,e.message),this.settlePerson()},this.personWorker=e,this.stats.person=`loading`,e}settlePerson(){let e=this.personWaiters;this.personWaiters=[];for(let t of e)t()}waitPerson(){return this.personInflight?new Promise(e=>this.personWaiters.push(e)):Promise.resolve()}onPersonPacket(e){if(this.personInflight=!1,this.workerMs.person+=e.ms,this.settlePerson(),e.id!==this.personReqId)return;if(this.personDetectInflight){this.personDetectInflight=!1,e.boxes===void 0?(e.error&&!this.personDetectWarned&&console.warn(`Person detector unavailable:`,e.error),this.personDetectWarned=!0,this.personBoxes=[{x:0,y:0,w:1,h:1,score:1}]):this.personBoxes=e.boxes.filter(e=>e.score>=cn),this.personBoxesAt=this.lastTickSec,this.stats.personBoxes=this.personBoxes.length,this.stats.personDetectMs=e.ms,console.info(`[person] verdict ${this.personBoxes.length} box(es) in ${e.ms.toFixed(0)} ms at t=${this.lastTickSec.toFixed(2)}s`),this.rebuildPerson();return}if(!e.mask){e.error&&!this.personFailed&&console.warn(`Person segmentation unavailable:`,e.error),this.personFailed=!0,this.stats.person=`failed`;return}this.stats.person=`on`,this.stats.personMs=e.ms;let t=this.fields?.width??0,n=this.fields?.height??0;if(t<4||n<4)return;let r=this.personRectInflight;if((!this.personFull||this.personFull.length!==t*n)&&(this.personFull=new Float32Array(t*n),this.personTiles=new Float32Array(t*n)),r===b)this.personFull=Qr(e.mask,e.width,e.height,t,n);else{let i=Math.round(r.x*t),a=Math.round(r.y*n),o=Math.round(r.w*t),s=Math.round(r.h*n),c=Qr(e.mask,e.width,e.height,o,s);for(let e=0;e<s;e++)for(let n=0;n<o;n++)this.personTiles[(a+e)*t+i+n]=c[e*o+n]}this.rebuildPerson()}rebuildPerson(){let e=this.fields?.width??0,t=this.fields?.height??0;if(e<4||t<4||!this.personFull||!this.personTiles||this.personFull.length!==e*t)return;let n=this.lastTickSec-this.personBoxesAt<=Jr,r=this.personBoxes&&n?ln(this.personBoxes,e,t):null,i=new Float32Array(e*t);if(r)for(let e=0;e<i.length;e++)i[e]=Math.max(this.personFull[e],this.personTiles[e])*r[e];let a=$r(i,e,t,this.guide?.data??null,this.fields?.data??null,this.current.veilColor),o=0;for(let e=0;e<a.length;e++)o+=a[e];this.stats.personCoverage=o/a.length;let s=0;if(this.person&&this.person.length===a.length)for(let e=0;e<a.length;e++)s+=this.person[e];!this.person||this.person.length!==a.length||s<1e-6&&o>0?(o>0&&console.info(`[person] mask snapped in at t=${this.lastTickSec.toFixed(2)}s (${(o/a.length*100).toFixed(0)}% coverage)`),this.person=a,this.personTarget=null,this.dirtyData=!0):this.personTarget=a}setPreviewScale(e){this.backend.setPreviewScale(e)}upload(e,t,n,r){this.backend.upload(e,t,n,r)}tick(e,t=!1){let n=Math.max(0,Math.min(.5,e-this.lastTickSec));this.lastTickSec=e,this.track?.advance(e),(this.track||this.handover.isHolding)&&this.hasAnalysis&&(this.current=this.applyLock(this.current)),this.smooth(n);let r=yn(e,this.slotSec());return!this.inflight&&(t||r!==this.lastSlot)?(this.lastSlot=r,this.startAnalysis(),!0):!1}slotSec(){return Math.max(vn,this.analysisIntervalMs/1e3)}async analyzeDue(e,t=!1,n=1e4){let r=yn(e,this.slotSec());if(!t&&r===this.lastSlot&&this.hasAnalysis)return;this.balancePending&&await Promise.race([this.balancePending,new Promise(e=>setTimeout(e,Br))]),this.lastSlot=r,await this.analyzeNow(t,n,e);let i=performance.now();t||await Promise.race([this.waitPerson(),new Promise(e=>setTimeout(e,n))]),this.workerMs.personWait+=performance.now()-i}analyzeSoon(){this.inflight||this.startAnalysis()}async analyzeNow(e,t=1e4,n){let r=()=>new Promise((e,t)=>{this.resolveWaiters.push(e),this.rejectWaiters.push(t)}),i=e=>new Promise((n,r)=>{let i=setTimeout(()=>r(Error(`Frame analysis timed out`)),t);e.then(e=>{clearTimeout(i),n(e)},e=>{clearTimeout(i),r(e)})});this.inflight&&await i(r()).catch(()=>void 0);let a=r();await this.startAnalysis({dueSec:n});let o=await i(a);e&&(await i(this.waitPerson()).catch(()=>void 0),this.personTarget&&=(this.person=this.personTarget,null)),e&&o.id===this.reqId&&this.snapTo(Xr(o)),e&&(this.lastSlot=yn(this.lastTickSec,this.slotSec()))}settle(e,t){let n=this.resolveWaiters,r=this.rejectWaiters;if(this.resolveWaiters=[],this.rejectWaiters=[],e)for(let t of n)t(e);else if(t)for(let e of r)e(t)}async startAnalysis(e={}){if(!this.inflight){this.inflight=!0;try{let t=e.dueSec!==void 0&&!e.raw?this.takePrecomputed(e.dueSec):void 0,n=performance.now(),r=t?.rgba??await this.readback(256,144);if(t&&this.verifyPrecomputed){let n=await this.readback(256,144);ri(n,t.rgba)||(this.precomputeStats.mismatches++,console.warn(`[engine] precomputed thumbnail differs at t=${e.dueSec.toFixed(3)}s: using the live one`),r=n,t=void 0)}this.workerMs.readback+=performance.now()-n,this.keepThumbAt!==null&&(this.profileThumbs.set(this.keepThumbAt,r.slice()),this.keepThumbAt=null);let i={count:this.personCount,passes:this.personPasses,rectIdx:this.personRectIdx},a=this.personEnabled&&!this.personFailed&&!this.personInflight&&this.personCount++%this.personEvery===0,o=a&&this.personPasses++%3==0,s=o?b:Yr[this.personRectIdx%Yr.length],c=a&&t?.person&&fn(t.person,i)&&t.person.detect===o?t.person:null;t?.person&&this.precomputeStats[c?`personHits`:`personMisses`]++;let l=a?c?c.rgba:s===b?r.slice():await this.readback(256,144,s):null,u=e.seeds??(this.settings.subjectPop&&!e.raw?this.animals.seeds(this.lastTickSec):[]),d=performance.now(),f=t&&!u.length?await Promise.race([t.packet,new Promise(e=>setTimeout(()=>e(null),1e4))]):null;this.workerMs.poolWait+=performance.now()-d,e.dueSec!==void 0&&this.pool.length>0&&this.precomputeStats[f?`hits`:`misses`]++,this.rawReq=!!e.raw;let p={id:++this.reqId,rgba:r.buffer,width:256,height:144,...u.length?{seeds:u}:{}};if(this.reqTimeSec=this.lastTickSec,f){let e=p.id;queueMicrotask(()=>this.onPacket({...f,id:e}))}else this.ensureWorker().postMessage(p,[p.rgba]);if(l){o||this.personRectIdx++;let e={id:++this.personReqId,rgba:l.buffer,width:256,height:144,timestampMs:Math.round(this.lastTickSec*1e3),detect:o};if(this.personInflight=!0,this.personDetectInflight=o,this.personRectInflight=s,c){let t=e.id,n=new Promise(e=>{this.resolveWaiters.push(()=>e()),this.rejectWaiters.push(()=>e())});Promise.all([c.packet,n]).then(([n])=>{t===this.personReqId&&(n&&!n.error?this.onPersonPacket({...n,id:t}):this.ensurePersonWorker().postMessage(e,[e.rgba]))})}else this.ensurePersonWorker().postMessage(e,[e.rgba])}}catch(e){this.inflight=!1;let t=e instanceof Error?e:Error(String(e));this.settle(null,t),/timed out/i.test(t.message)?console.warn(`Analysis skipped:`,t.message):this.onError(t)}}}onPacket(e){if(this.inflight=!1,e.id!==this.reqId)return;let t=Xr(e);if(this.stats.analyses++,this.stats.analysisMs=t.ms,this.workerMs.analysis+=t.ms,this.workerMs.analyses++,this.rawReq&&this.hasAnalysis){this.settle(e,null);return}let n=this.lastMean!==null&&ni(this.lastMean,t.mean)>.16;this.lastMean=t.mean,this.rawReq||(n&&this.animals.reset(),this.lastAnimalMap=this.settings.subjectPop&&(t.params.backdrop??0)>0?e.animals??null:null,this.lastBlobs=(t.params.backdrop??0)>0?e.blobs??null:null,this.lastWater=t.params.backdrop??0,this.settings.subjectPop&&(t.params.backdrop??0)>0&&e.animals?this.animals.update(e.animals,this.reqTimeSec,t.fields.data,t.guide.data):this.animals.fadeAll()),this.leadBase={fields:t.fields,guide:t.guide},n&&this.noteSceneCut(this.lastTickSec),this.track?.noteFrame(t.mean,this.lastTickSec),!this.hasAnalysis||n?(this.handover.rehold(t.params,n),n&&(this.stats.sceneCuts++,this.backend.resetTemporal?.(),this.personBoxes=null,this.personPasses=0,this.personFull?.fill(0),this.personTiles?.fill(0),this.stats.personBoxes=-1),this.snapTo(t)):(this.target=this.applyLock(t.params),this.fieldsTarget=t.fields,this.guideTarget=t.guide,this.claheTarget=t.clahe),this.settle(e,null)}snapTo(e){this.animals.snap(),this.track?.advance(this.lastTickSec,!0),this.current=this.applyLock(e.params),this.target=this.current,this.fields=e.fields,this.guide=e.guide,this.guideFast=null,this.clahe=e.clahe,this.fieldsTarget=null,this.guideTarget=null,this.claheTarget=null,this.hasAnalysis=!0,this.dirtyData=!0}smooth(e){if(e<=0)return;if(this.target){let t=1-Math.exp(-e/Pr),n=this.current.backdropFit,r=this.current.seabedNeed??0;this.current=this.applyLock(le(this.current,this.target,t));let i=this.target.seabedNeed??0;i<r&&(this.current={...this.current,seabedNeed:r+(i-r)*(1-Math.exp(-e/Fr))});let a=this.target.backdropFit;if(xn(!!this.settings.subjectPop,!!this.seg)&&n&&a&&n.length===a.length){let t=1-Math.exp(-e/Rr);this.current={...this.current,backdropFit:n.map((e,n)=>e+(a[n]-e)*t)}}}let t=1-Math.exp(-e/Ir),n=1-Math.exp(-e/Lr),r=(e,n,r=t,i=r)=>{if(!n)return e;if(!e||e.width!==n.width||e.height!==n.height||e.data.length!==n.data.length)return n;let a=e===this.lastEased.get(n)?e:{...e,data:new Float32Array(e.data)};return i===r?ei(a.data,n.data,r):ti(a.data,n.data,r,i),this.lastEased.set(n,a),a},i=Math.min(1,Math.max(0,this.current.backdrop??0)),a=t+(1-Math.exp(-e/Rr)-t)*i;this.settings.subjectPop&&(this.animals.step(e),this.leadAnimals());let o=r(this.fields,this.fieldsTarget,t,a),s=xn(!!this.settings.subjectPop,!!this.seg);if(this.settings.subjectPop&&this.guide&&this.guideTarget&&this.guideTarget.data.length===this.guide.data.length){let e=this.guideFast&&this.guideFast.data.length===this.guide.data.length?this.guideFast:{...this.guide,data:new Float32Array(this.guide.data)};ei(e.data,this.guideTarget.data,a),this.guideFast=e}else this.guideFast=null;let c=r(this.guide,this.guideTarget,s?a:t),l=r(this.clahe,this.claheTarget,n);(o!==this.fields||c!==this.guide||l!==this.clahe)&&(this.dirtyData=!0),this.person&&this.personTarget&&this.personTarget.length===this.person.length&&(ei(this.person,this.personTarget,t),this.dirtyData=!0),this.fields=o,this.guide=c,this.clahe=l}lastEased=new WeakMap;guideMerged=null;guideFast=null;pushData(){if(!this.fields||!this.guide||!this.clahe)return;this.backend.setData(0,this.fields),this.backend.setData(1,this.clahe);let e=this.guide;if(this.person&&this.person.length*4===e.data.length){let t=this.guideMerged&&this.guideMerged.length===e.data.length?this.guideMerged:new Float32Array(e.data.length);t.set(e.data);let n=1-l(this.current);for(let e=0;e<this.person.length;e++)t[e*4+3]=this.person[e]*n;this.guideMerged=t,this.backend.setData(2,{width:e.width,height:e.height,data:t})}else this.backend.setData(2,e);if(this.settings.subjectPop){let t=this.guideFast??e;if(this.backend.setData(3,this.seg?In(this.seg,t):this.animals.strength(this.lastTickSec)),this.seg&&this.seg.pop===void 0){let e=Cn(t,this.seg);e!==null&&(this.popC.sum+=e,this.popC.n++)}this.popDir=Sn(this.seg,this.popC.n?this.popC.sum/this.popC.n:null),this.strengthOn=!0}else this.strengthOn&&=(this.backend.setData(3,{width:1,height:1,data:new Float32Array(4)}),!1);this.dirtyData=!1}leadAnimals(){let e=this.leadBase;if(!e||!this.hasAnalysis)return;let t=this.current.backdropFit,n=e.fields.width,r=e.fields.height,i=xn(!!this.settings.subjectPop,!!this.seg)?this.animals.lead(e.fields.data,e.guide.data,this.lastTickSec,(e,i)=>{if(!t||t.length!==18)return[0,0,0];let a=(e+.5)/n-.5,o=(i+.5)/r-.5,s=e=>t[e]+t[e+1]*a+t[e+2]*o+t[e+3]*a*a+t[e+4]*a*o+t[e+5]*o*o;return d(s(0),s(6),s(12))}):null;this.fieldsTarget=i?{...e.fields,data:i.fields}:e.fields,this.guideTarget=i?{...e.guide,data:i.guide}:e.guide,this.animals.count&&(this.dirtyData=!0)}setSubjectOverrides(e){this.animals.setOverrides(e),this.dirtyData=!0}stepSubjects(e){return this.animals.step(e),this.dirtyData=!0,this.animals.easing}setTime(e){this.lastTickSec=e,this.track&&this.hasAnalysis&&this.handover.pending&&(this.current=this.applyLock(this.current)),this.checkJump()}resetTracking(){this.backend.resetTemporal?.(),this.animals.reset(),this.lastRenderSec=-1}checkJump(){let e=this.lastTickSec;this.lastRenderSec>=0&&(e<this.lastRenderSec-.001||e-this.lastRenderSec>.3)&&(this.backend.resetTemporal?.(),this.animals.reset()),this.lastRenderSec=e}setSegOverlay(e){e!==this.seg&&(this.seg=e,this.dirtyData=!0)}async readUpright(e,t){return this.readback(e,t)}readbackChain=Promise.resolve();readback(e,t,n){let r=this.readbackChain.then(()=>this.backend.analyze(e,t,n));return this.readbackChain=r.catch(()=>void 0),r}async solveNeutral(e,t,n=this.settings){let r=this.fields,i=this.guide,a=this.clahe,o=this.backend.outputWidth,s=this.backend.outputHeight;if(!this.hasAnalysis||!r||!i||!a||!o||!s)return null;let c=Or.patch,l=await this.readback(c,c,Ar(e,t,o,s)),u=i.width*i.height,d=new Float32Array(u*3);for(let e=0;e<u;e++)d[e*3]=i.data[e*4],d[e*3+1]=i.data[e*4+1],d[e*3+2]=i.data[e*4+2];let f={width:r.width,height:r.height,fields:r.data,guide:d,person:this.person&&this.person.length===u?this.person:void 0},p=new Float32Array(a.width*a.height);for(let e=0;e<p.length;e++)p[e]=a.data[e*4];let m={tilesX:8,tilesY:6,bins:32,data:p};return Mr({params:this.current,settings:{...n,wbTap:void 0},depth:f,clahe:m},kr(l),e,t)}personBoxesNow(){return this.personBoxes??[]}openWater(){return(this.target?.backdrop??this.current.backdrop??0)>0}animalMap(){return this.lastAnimalMap}lastAnimalMap=null;subjectBlobs(){return this.lastBlobs}lastBlobs=null;waterValidity(){return this.lastWater}lastWater=0;subjectSelection(){return this.settings.subjectPop?this.animals.selection(this.lastTickSec):null}reset(e={}){let t=e.keepPerson?this.personBoxes:null;this.clearPrecomputed(),this.reqId++,this.inflight=!1,this.hasAnalysis=!1,this.target=null,this.fieldsTarget=null,this.guideTarget=null,this.claheTarget=null,this.current=ie,this.lastMean=null,this.lastSlot=NaN,this.lastTickSec=0,this.track?.reset(),this.handover.settle(),this.fadeBalance=!1,this.settle({id:-1},null),this.personReqId++,this.personInflight=!1,this.person=null,this.personTarget=null,this.personFull=null,this.personTiles=null,this.personRectIdx=0,this.personCount=0,this.personBoxes=t,this.personBoxesAt=t?0:-1/0,this.personPasses=+!!t,this.personBase={count:0,passes:this.personPasses,rectIdx:0},this.personDetectInflight=!1,this.stats.personCoverage=0,this.stats.personBoxes=t?t.length:-1,this.settlePerson(),this.lastRenderSec=-1,this.backend.resetTemporal?.(),this.animals.reset(),this.leadBase=null,this.popC={sum:0,n:0},this.popDir=1}pack(){let e={width:this.fields.width,height:this.fields.height,fields:new Float32Array,guide:new Float32Array},t={tilesX:8,tilesY:6,bins:32,data:new Float32Array},n=this.hasAnalysis?this.settings:{...this.settings,intensity:0},r=De(this.current,n,e,t,0,this.split);return r[93]=+!!this.temporalEnabled,(!this.noiseReductionEnabled||!this.temporalEnabled)&&(r[104]=0),r[106]=+(this.lastTickSec===this.nrDrawnSec),this.nrDrawnSec=this.lastTickSec,r[96]=this.popDir,r[97]=this.seg&&this.settings.subjectPop?1:0,this.checkJump(),r}render(e=0){this.dirtyData&&this.pushData();let t=this.pack();t[0]=e,this.backend.setUniforms(t),this.backend.render()}recomposite(e){return this.split=e,this.backend.recomposite?.(e)??!1}setBefore(e,t,n){this.backend.setBefore?.(e,t,n)}analysisSlotAt(e){return yn(e,this.slotSec())}inAnyCutWindow(e){return!!this.track?.segments.some(t=>t.window!==void 0&&e>=t.window[0]&&e<t.window[1])}async precompute(e,t,n){return this.precomputeNow(e,t,n)}asideCanvas=null;async analyseAside(e,t=15e3){let n=this.asideCanvas??=document.createElement(`canvas`);n.width=256,n.height=144;let r=n.getContext(`2d`,{willReadFrequently:!0});if(!r)return null;r.drawImage(e,0,0,256,144);let i=r.getImageData(0,0,256,144).data,a=this.poolWorker();if(this.poolLoad[a]===1/0)return null;let o=++this.preId,s=new Promise(e=>this.preWaiters.set(o,{resolve:e,worker:a}));this.poolLoad[a]++;let c={id:o,rgba:i.buffer,width:256,height:144};this.pool[a].postMessage(c,[c.rgba]);let l=await Promise.race([s,new Promise(e=>setTimeout(()=>e(null),t))]);if(this.preWaiters.delete(o),!l)return null;let u=l.params.backdrop??0;return{animals:this.settings.subjectPop&&u>0?l.animals??null:null,blobs:u>0?l.blobs??null:null,water:u}}async precomputeNow(e,t,n){if(this.pre.has(e))return;let r=performance.now(),i=await this.readback(256,144),a=n===void 0?void 0:await this.prePerson(i,t,n);this.workerMs.readback+=performance.now()-r;let o=this.poolWorker(),s=++this.preId,c=i.slice();if(this.poolLoad[o]===1/0){this.pre.set(e,{rgba:i,packet:Promise.resolve(null),person:a});return}let l=new Promise(e=>this.preWaiters.set(s,{resolve:e,worker:o}));this.poolLoad[o]++;let u={id:s,rgba:c.buffer,width:256,height:144};this.pool[o].postMessage(u,[u.rgba]),this.pre.set(e,{rgba:i,packet:l,person:a})}async prePerson(e,t,n){if(!this.personEnabled||this.personFailed)return;let r=this.personPlanAt(n),{want:i,detect:a}=un(r,this.personEvery);if(!i)return;let o=a?b:Yr[r.rectIdx%Yr.length],s=o===b?e.slice():await this.readback(256,144,o),c=-++this.prePersonId,l=s.slice(),u=new Promise(e=>this.prePersonWaiters.set(c,e)),d={id:c,rgba:l.buffer,width:256,height:144,timestampMs:Math.round(t*1e3),detect:a};return this.ensurePersonWorker().postMessage(d,[d.rgba]),{...r,rgba:s,detect:a,packet:u}}planCache=null;personPlanAt(e){let t=this.planCache,n=t&&t.base===this.personBase&&t.every===this.personEvery&&e>=t.n?dn(t.c,e-t.n,this.personEvery):dn(this.personBase,e,this.personEvery);return this.planCache={n:e,c:n,base:this.personBase,every:this.personEvery},n}dropPrecomputedBefore(e){for(let t of this.pre.keys())t<e&&this.pre.delete(t)}clearPrecomputed(e=!1){this.pre.clear();for(let{resolve:e}of this.preWaiters.values())e(null);if(this.preWaiters.clear(),e){for(let e of this.pool)e.terminate();this.pool=[],this.poolLoad=[]}}takePrecomputed(e){let t=this.pre.get(e);return t&&this.pre.delete(e),t}poolWorker(){let e=Math.max(1,this.analysisPoolSize);for(;this.pool.length<e;){let e=this.pool.length,t=new Worker(new URL(`/video/studio/assets/analysis-worker-Xa-XJJto.js`,``+import.meta.url),{type:`module`});t.onmessage=t=>{let n=t.data,r=this.preWaiters.get(n.id);this.poolLoad[e]=Math.max(0,this.poolLoad[e]-1),r&&(this.preWaiters.delete(n.id),r.resolve(n))},t.onerror=t=>{console.warn(`Analysis pool worker failed:`,t.message);for(let[t,n]of this.preWaiters)n.worker===e&&(n.resolve(null),this.preWaiters.delete(t));this.poolLoad[e]=1/0},this.pool.push(t),this.poolLoad.push(0)}let t=0;for(let e=1;e<this.pool.length;e++)this.poolLoad[e]<this.poolLoad[t]&&(t=e);return t}async exportReady(){await this.backend.readbackSlotFree?.()}async renderToFrame(e,t,n){this.dirtyData&&this.pushData();let r=this.pack();return r[0]=e,r[1]=0,this.backend.setUniforms(r),this.backend.renderToFrame(t,n)}dispose(){this.clearPrecomputed(!0),this.worker?.terminate(),this.worker=null,this.personWorker?.terminate(),this.personWorker=null,this.backend.dispose()}};function Qr(e,t,n,r,i){let a=new Float32Array(r*i);for(let o=0;o<i;o++){let s=Math.floor(o*n/i),c=Math.max(s+1,Math.floor((o+1)*n/i));for(let n=0;n<r;n++){let i=Math.floor(n*t/r),l=Math.max(i+1,Math.floor((n+1)*t/r)),u=0,d=0;for(let n=s;n<c;n++)for(let r=i;r<l;r++)u+=e[n*t+r],d++;a[o*r+n]=Math.min(1,Math.max(0,u/d))}}return a}function $r(e,t,n,r,i,a){let o=new Float32Array(e),[,s,c]=S(a[0],a[1],a[2]),l=Math.hypot(s,c)||1,u=new Uint8Array(t*n);for(let e=0;e<t*n;e++){let t=r&&r.length>=e*4+3?.2126*r[e*4]+.7152*r[e*4+1]+.0722*r[e*4+2]:1,n=i&&i.length>=e*4+2?i[e*4+1]:1,a=!1;if(r&&r.length>=e*4+3){let[,t,n]=S(r[e*4],r[e*4+1],r[e*4+2]),i=Math.hypot(t,n);a=i>qr&&(t*s+n*c)/(i*l)>Kr}u[e]=+(t>Wr&&n>Gr&&!a);let d=o[e],f=Math.min(1,Math.max(0,(d-.45)/.3));o[e]=a&&t>Wr?0:f*f*(3-2*f)}let d=o;for(let e=0;e<Hr;e++){let e=new Float32Array(d);for(let r=0;r<n;r++)for(let i=0;i<t;i++){let a=r*t+i;if(!u[a])continue;let o=0;for(let e=-1;e<=1;e++){let a=r+e;if(!(a<0||a>=n))for(let e=-1;e<=1;e++){let n=i+e;n<0||n>=t||(o=Math.max(o,d[a*t+n]))}}e[a]=Math.max(d[a],Ur*o)}d=e}return d}function ei(e,t,n){for(let r=0;r<e.length;r++)e[r]+=(t[r]-e[r])*n}function ti(e,t,n,r){for(let i=0;i<e.length;i++)e[i]+=(t[i]-e[i])*((i&3)==1?r:n)}function ni(e,t){return Math.abs(e[0]-t[0])+Math.abs(e[1]-t[1])+Math.abs(e[2]-t[2])}function ri(e,t){if(e.length!==t.length)return!1;for(let n=0;n<e.length;n++)if(e[n]!==t[n])return!1;return!0}function ii(e){if(!Number.isFinite(e)||e<.5)return[];let t=Math.min(12,Math.max(4,Math.round(e)));return Array.from({length:t},(n,r)=>Math.min(e-.05,.15+(e-.3)*(r+.5)/t))}function ai(t,n){if(t.length<3)return null;let r=[{from:0,items:[t[0]]}];for(let e=1;e<t.length;e++){let i=t[e-1].mean,a=t[e].mean,o=Math.abs(i[0]-a[0])+Math.abs(i[1]-a[1])+Math.abs(i[2]-a[2]),s=t[e-1].params.wb,c=t[e].params.wb,l=Math.max(Math.abs(Math.log(s[0]/c[0])),Math.abs(Math.log(s[2]/c[2]))),u=t[e+1]?.mean;(!u||Math.abs(i[0]-u[0])+Math.abs(i[1]-u[1])+Math.abs(i[2]-u[2])>n)&&(o>2*n||o>n&&l>.2)&&r.push({from:(t[e-1].t+t[e].t)/2,window:[t[e-1].t,t[e].t],means:[i,a],items:[]}),r[r.length-1].items.push(t[e])}for(let e=r.length-1;e>0;e--)r[e].items.length<2&&(r[e-1].items.push(...r[e].items),r.splice(e,1));return r.map(t=>({from:t.from,window:t.window,means:t.means,params:e(t.items.map(e=>e.params))}))}export{Nr as ANALYSIS_INTERVAL_MS,Zr as GradeEngine,Er as LOCK_FADE_MS,zr as SCENE_CUT_MEAN_DIFF,e as medianParams,ii as profileTimes,ai as segmentProfile};