// Grading maths, once in GLSL ES 3.00 and once in WGSL — an exact mirror of
// apply.ts (gradePixel). Both define
//   grade(src: rgb in sRGB 0..1, uv: upright 0..1) -> rgb sRGB 0..1
// and read the uniform block `p` (16 × vec4, layout in params.ts) and the
// data textures: u_data0 = fields (z, conf, dSmooth), u_data1 = CLAHE LUTs
// (x = bin, y = tile), u_data2 = guide colour (linear rgb).

import { CONF_BRIGHT, DEHAZE_LUM, DETAIL_GUARD, DETAIL_TAPS, HAZE_LIFT, HIGHLIGHT_PINK, LOOK, OBJECT_NEUTRAL, PERSON_LUM, SKIN, SUBJECT_CLEAR, SUBJECT_POP, SEG_RESTORE, VIVID, VIVID_LOOK, BLUE_WATER, RICH_LOOK, WARM_POP, SEABED } from "./params.ts";
import { GAMUT_CHROMA_EDGE, GAMUT_CHROMA_KNEE, GAMUT_SCALE_MIN } from "./color.ts";
import { BACKDROP } from "./backdrop.ts";
import { RED_GLSL, RED_WGSL } from "./red.ts";

/**
 * AI subject detection (studio seg/, data texture 3; seg-overlay.ts composeSegStrength): how the ML mask turns into
 * the pop's tone weight (grade toneWeight). The tone stays inside the subject: nothing on or outside the mask's
 * contour, and on the water a mask covers by mistake (a fat contour, a leak) only as far as the pixel itself departs
 * from the water.
 */
export const SEG_TONE = {
  /** The ML weight (A: confidence × nearness, eased over time) over which a tracked ML subject is popped at all (pop
   * strength and its tone weight): a normal track (keyframe confidence ≈ 0.6–0.7) pops fully. */
  popLo: 0.2,
  popHi: 0.6,
  /** The ML alpha is the mask's signed distance: 0.5 on its contour, ramping linearly to 1 (0) this many mask-grid
   * px inside (outside) it (studio seg/track.ts SEG.alphaR feathers it so; the shader reads the distance back). */
  alphaR: 6,
  /** The tone never reaches past the contour: it ramps in over this many mask px of the read-back distance (seg-overlay.ts
   * stretches it a little with the part's thickness: a big body fades in over up to SEG_WATER.rampLong, a fin is toned to its
   * edge)... */
  rampIn: 2.5,
  /** ...and on thin parts (where the ramp stays short), within trustLo..trustHi mask px of the contour (where a mask
   * is often a little fat: motion blur) it follows the pixel itself: tone only as far as the pixel departs from the
   * local water (Oklab ΔL and chroma off the water's hue, evLo..evHi), so the glow never lands on water inside the
   * mask. Deeper in, the mask rules (a shaded flank that matches the water is toned with the rest); a leak onto the
   * water is under-popped as a whole region (G, the regional trust), never in patches. */
  trustLo: 2,
  trustHi: 4.5,
  evLo: 0.025,
  evHi: 0.07,
  /** ...measured against the subject's own contrast: a far subject (closeness 0, seg-overlay.ts subjectCloseness: it
   * stands off its water by under SEG_RESTORE.veilLo) is tested at evFar × evLo..evHi, a close one at evLo..evHi. A
   * far ray in haze is ΔL ≈ 0.035 off the water all over: under the close bar it read as water to its spine, and its
   * tone was a fraction of the mask's (owner's clip, 12 Nov: "the marking is not full"). */
  evFar: 0.4,
  /** ...and on the thinnest parts (seg-overlay.ts segThin, packed into R: half-width under SEG_WATER.thinHi mask px)
   * a pixel that passes that test is toned from rampEv mask px inside the contour instead of rampIn (in between by
   * how far it passes and how thin the part is): a far animal is 6–8 mask px thick, and at the fixed 2.5 px of
   * feather each side only its spine was toned in full. The picture itself says the pixel is the animal, so the
   * feather there is the picture's own edge; a pixel of water under a fat contour keeps the long feather and the
   * test (nothing until trustLo). */
  rampEv: 1,
  /** The thinness rides in R in this many steps (seg-overlay.ts packSegR). */
  thinLevels: 4,
  /** The ML alpha is read edge-aware where the contour passes (animalStrength / apply.ts segSample: a joint
   * bilateral upsample): the four mask texels around the pixel are weighted, on top of the bilinear weights, by how
   * close the source's luma at each texel's centre is to the pixel's own (a Gaussian of width jbuK × the range of
   * those five lumas, at least jbuNoise: flat water gives the plain bilinear read). The contour then follows the
   * picture's edge between mask texels (6 px apart on a 1080p frame) instead of cutting straight across it. Only
   * where the texels' alphas reach into jbuLo..jbuHi (the contour and the tone's ramp). */
  jbuK: 0.5,
  jbuNoise: 0.02,
  jbuLo: 0.46,
  jbuHi: 0.72,
};

/**
 * The joint bilateral weights of animalStrength / segSample (SEG_TONE.jbu*): `wb` the four bilinear weights, `g` the
 * source luma at the four texel centres, `g0` at the pixel. Returns the weights (not normalised). The shaders spell
 * the same arithmetic out.
 */
export function segJbuWeights(wb: readonly number[], g: readonly number[], g0: number): number[] {
  const lo = Math.min(g0, ...g), hi = Math.max(g0, ...g), s = 1 / Math.max(SEG_TONE.jbuNoise, SEG_TONE.jbuK * (hi - lo));
  return wb.map((w, k) => w * Math.exp(-(((g[k] - g0) * s) ** 2)));
}

// Look constants shared by both shaders, emitted as literals.
const LOOK_CONSTS_GLSL = `
const float CONF_BRIGHT_LO = ${CONF_BRIGHT.lo.toFixed(4)};
const float CONF_BRIGHT_HI = ${CONF_BRIGHT.hi.toFixed(4)};
const float PERSON_LUM_LO = ${PERSON_LUM.lo.toFixed(4)};
const float PERSON_LUM_HI = ${PERSON_LUM.hi.toFixed(4)};
const float DEHAZE_LUM_LO = ${DEHAZE_LUM.lo.toFixed(4)};
const float DEHAZE_LUM_HI = ${DEHAZE_LUM.hi.toFixed(4)};
const float HAZE_LIFT_FLOOR = ${HAZE_LIFT.floor.toFixed(4)};
const float HAZE_LIFT_SOFT = ${HAZE_LIFT.soft.toFixed(4)};
const float HAZE_LIFT_FAR_KEEP = ${HAZE_LIFT.farKeep.toFixed(4)};
const float VIVID_C_LO = ${VIVID.cLo.toFixed(4)};
const float VIVID_C_HI = ${VIVID.cHi.toFixed(4)};
const float VIVID_KEEP = ${VIVID.keep.toFixed(4)};
const float GAMUT_SCALE_MIN = ${GAMUT_SCALE_MIN.toFixed(4)};
const float GAMUT_CHROMA_KNEE = ${GAMUT_CHROMA_KNEE.toFixed(4)};
const float GAMUT_CHROMA_EDGE = ${GAMUT_CHROMA_EDGE.toFixed(4)};
const float LOOK_GAMMA = ${LOOK.gamma.toFixed(4)};
const float LOOK_WATER_DIM = ${LOOK.waterDim.toFixed(4)};
const float LOOK_HAZE_CHROMA = ${LOOK.hazeChroma.toFixed(4)};
const float LOOK_OBJ_CHROMA = ${LOOK.objChroma.toFixed(4)};
const float LOOK_WARM_HAZE = ${LOOK.warmHaze.toFixed(4)};
const float LOOK_DARK_HAZE = ${LOOK.darkHaze.toFixed(4)};
const float LOOK_NEUTRAL_DESAT = ${LOOK.neutralDesat.toFixed(4)};
const float LOOK_NEUTRAL_LO = ${LOOK.neutralLo.toFixed(4)};
const float LOOK_NEUTRAL_HI = ${LOOK.neutralHi.toFixed(4)};
const float LOOK_NEUTRAL_L_LO = ${LOOK.neutralLLo.toFixed(4)};
const float LOOK_NEUTRAL_L_HI = ${LOOK.neutralLHi.toFixed(4)};
const float LOOK_TARGET_HUE = ${LOOK.targetHue.toFixed(6)};
const float LOOK_WARM_HUE = ${LOOK.warmHue.toFixed(6)};
const float LOOK_WARM_IN = ${LOOK.warmIn.toFixed(6)};
const float LOOK_WARM_OUT = ${LOOK.warmOut.toFixed(6)};
const float LOOK_WARM_LO = ${LOOK.warmLo.toFixed(4)};
const float LOOK_WARM_HI = ${LOOK.warmHi.toFixed(4)};
const float LOOK_DARK_LO = ${LOOK.darkLo.toFixed(4)};
const float LOOK_DARK_HI = ${LOOK.darkHi.toFixed(4)};
const float LOOK_FAR_LO = ${LOOK.farLo.toFixed(6)};
const float LOOK_FAR_HI = ${LOOK.farHi.toFixed(6)};
const float LOOK_FAR_KEEP = ${LOOK.farKeep.toFixed(4)};
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
const float DG_K = ${DETAIL_GUARD.k.toFixed(4)};
const float DG_EPS = ${DETAIL_GUARD.eps.toFixed(5)};
const float DG_R_MIN = ${DETAIL_GUARD.rMin.toFixed(4)};
const float DG_R_MAX = ${DETAIL_GUARD.rMax.toFixed(4)};
const float ON_COS = ${Math.cos(OBJECT_NEUTRAL.hue).toFixed(6)};
const float ON_SIN = ${Math.sin(OBJECT_NEUTRAL.hue).toFixed(6)};
const float ON_COS_OUT = ${Math.cos(OBJECT_NEUTRAL.bandOut).toFixed(6)};
const float ON_COS_IN = ${Math.cos(OBJECT_NEUTRAL.bandIn).toFixed(6)};
const float ON_R_LO = ${OBJECT_NEUTRAL.rLo.toFixed(4)};
const float ON_R_HI = ${OBJECT_NEUTRAL.rHi.toFixed(4)};
const float ON_L_LO = ${OBJECT_NEUTRAL.lLo.toFixed(4)};
const float ON_L_HI = ${OBJECT_NEUTRAL.lHi.toFixed(4)};
const float ON_MIX = ${OBJECT_NEUTRAL.mix.toFixed(4)};
const float ON_FAR_LO = ${OBJECT_NEUTRAL.farLo.toFixed(6)};
const float ON_FAR_HI = ${OBJECT_NEUTRAL.farHi.toFixed(6)};
const float ON_LIFT = ${OBJECT_NEUTRAL.lift.toFixed(4)};
const float ON_SILVER = ${OBJECT_NEUTRAL.silver.toFixed(4)};
const float SC_K = ${SUBJECT_CLEAR.k.toFixed(4)};
const float SC_CMAX = ${SUBJECT_CLEAR.cMax.toFixed(4)};
const float SC_DESAT = ${SUBJECT_CLEAR.desat.toFixed(4)};
const float SC_EDGE = ${SUBJECT_CLEAR.edgeFloor.toFixed(4)};
const float SP_VIVID = ${SUBJECT_POP.vividKeep.toFixed(4)};
const float SP_CLARITY = ${SUBJECT_POP.clarity.toFixed(4)};
const float SP_LIFT = ${SUBJECT_POP.lift.toFixed(4)};
const float WP_HUE = ${WARM_POP.hue.toFixed(4)};
const float SB_HUE = ${SEABED.hue.toFixed(4)};
const float SB_CHROMA = ${SEABED.chroma.toFixed(4)};
const float SB_KEEP = ${SEABED.keep.toFixed(4)};
const float SB_LIFT = ${SEABED.lift.toFixed(4)};
const float SB_GRID = ${SEABED.grid.toFixed(1)};
const float SB_W_LO = ${SEABED.wLo.toFixed(4)};
const float SB_W_HI = ${SEABED.wHi.toFixed(4)};
const float SB_Y0 = ${SEABED.y0.toFixed(4)};
const float SB_Y1 = ${SEABED.y1.toFixed(4)};
const float WP_CMIN = ${WARM_POP.cMin.toFixed(4)};
const float WP_CMAX = ${WARM_POP.cMax.toFixed(4)};
const float WP_KEEP = ${WARM_POP.keep.toFixed(4)};
const float WP_LLO = ${WARM_POP.lLo.toFixed(4)};
const float WP_LHI = ${WARM_POP.lHi.toFixed(4)};
const float WP_WLO = ${WARM_POP.wLo.toFixed(4)};
const float WP_WHI = ${WARM_POP.wHi.toFixed(4)};
const float WP_SIDE = ${WARM_POP.side.toFixed(4)};
const float WP_CAST_LO = ${WARM_POP.castLo.toFixed(4)};
const float WP_CAST_HI = ${WARM_POP.castHi.toFixed(4)};
const float SP_CHROMA = ${SUBJECT_POP.chromaFollow.toFixed(4)};
const float SP_ENGINE = ${SUBJECT_POP.engineKeep.toFixed(4)};
const float SP_KEEP_LO = ${SUBJECT_POP.keepDarkLo.toFixed(4)};
const float SP_KEEP_HI = ${SUBJECT_POP.keepDarkHi.toFixed(4)};
const float SP_CHROMA_DARK = ${SUBJECT_POP.chromaFollowDark.toFixed(4)};
const float SP_DARK_LO = ${SUBJECT_POP.darkLo.toFixed(4)};
const float SP_DARK_HI = ${SUBJECT_POP.darkHi.toFixed(4)};
const float SP_HUE_COS = ${Math.cos(SUBJECT_POP.hueMax).toFixed(6)};
const float SP_HUE_SIN = ${Math.sin(SUBJECT_POP.hueMax).toFixed(6)};
const float BD_VETO_LO = ${BACKDROP.vetoLo.toFixed(4)};
const float BD_VETO_HI = ${BACKDROP.vetoHi.toFixed(4)};
const float BD_RING_R = ${BACKDROP.ringR.toFixed(1)};
const float BD_CORE_IN = ${BACKDROP.coreIn.toFixed(4)};
const float BD_CORE_LO = ${BACKDROP.coreLo.toFixed(4)};
const float BD_CORE_HI = ${BACKDROP.coreHi.toFixed(4)};
const float BD_HOLD_LO = ${BACKDROP.holdLo.toFixed(4)};
const float BD_HOLD_HI = ${BACKDROP.holdHi.toFixed(4)};
const float BD_SUBJ_LO = ${BACKDROP.subjLo.toFixed(4)};
const float BD_SUBJ_HI = ${BACKDROP.subjHi.toFixed(4)};
const float BD_DARK = ${BACKDROP.vetoDark.toFixed(4)};
const float BD_AB2 = ${(BACKDROP.abWeight * BACKDROP.abWeight).toFixed(4)};
const float ON_CONF_LO = ${OBJECT_NEUTRAL.confLo.toFixed(4)};
const float ON_CONF_HI = ${OBJECT_NEUTRAL.confHi.toFixed(4)};
const float SEG_POP_LO = ${SEG_TONE.popLo.toFixed(4)};
const float SEG_POP_HI = ${SEG_TONE.popHi.toFixed(4)};
const float SEG_ALPHA_R = ${SEG_TONE.alphaR.toFixed(4)};
const float SEG_RAMP_IN = ${SEG_TONE.rampIn.toFixed(4)};
const float SEG_TRUST_LO = ${SEG_TONE.trustLo.toFixed(4)};
const float SEG_TRUST_HI = ${SEG_TONE.trustHi.toFixed(4)};
const float SEG_EV_LO = ${SEG_TONE.evLo.toFixed(4)};
const float SEG_EV_HI = ${SEG_TONE.evHi.toFixed(4)};
const float SEG_EV_FAR = ${SEG_TONE.evFar.toFixed(4)};
const float SEG_RAMP_EV = ${SEG_TONE.rampEv.toFixed(4)};
const float SEG_THIN_LEVELS = ${SEG_TONE.thinLevels.toFixed(4)};
const float SEG_JBU_K = ${SEG_TONE.jbuK.toFixed(4)};
const float SEG_JBU_NOISE = ${SEG_TONE.jbuNoise.toFixed(4)};
const float SEG_JBU_LO = ${SEG_TONE.jbuLo.toFixed(4)};
const float SEG_JBU_HI = ${SEG_TONE.jbuHi.toFixed(4)};
const float SR_DARK_LO = ${SEG_RESTORE.darkLo.toFixed(4)};
const float SR_DARK_HI = ${SEG_RESTORE.darkHi.toFixed(4)};
const float SR_POP_GATE = ${SEG_RESTORE.popGate.toFixed(4)};
const float SR_CAST = ${SEG_RESTORE.cast.toFixed(4)};
const float SR_CAST_MAX = ${SEG_RESTORE.castMax.toFixed(4)};
const float SR_COS = ${Math.cos(SEG_RESTORE.hue).toFixed(6)};
const float SR_SIN = ${Math.sin(SEG_RESTORE.hue).toFixed(6)};
const float SR_WARM = ${SEG_RESTORE.warm.toFixed(4)};
const float SR_WARM_SHARE = ${SEG_RESTORE.warmShare.toFixed(4)};
const float SR_FAR_KEEP = ${SEG_RESTORE.farKeep.toFixed(4)};
const float SR_EDGE = ${SEG_RESTORE.edge.toFixed(4)};
const float SEG_PACK = ${SEG_RESTORE.pack.toFixed(4)};
const float SEG_LEVELS = ${SEG_RESTORE.levels.toFixed(4)};
const float SR_LIT_LO = ${SEG_RESTORE.litLo.toFixed(4)};
const float SR_LIT_HI = ${SEG_RESTORE.litHi.toFixed(4)};
const float SR_HI_LO = ${SEG_RESTORE.hiLo.toFixed(4)};
const float SR_HI_HI = ${SEG_RESTORE.hiHi.toFixed(4)};
const float SR_DETAIL = ${SEG_RESTORE.detail.toFixed(4)};
const float SR_R_MIN = ${SEG_RESTORE.rMin.toFixed(4)};
const float SR_R_MAX = ${SEG_RESTORE.rMax.toFixed(4)};
const float SR_LIFT = ${SEG_RESTORE.lift.toFixed(4)};
const float ON_WARM_COS = ${Math.cos(OBJECT_NEUTRAL.warmHue).toFixed(6)};
const float ON_WARM_SIN = ${Math.sin(OBJECT_NEUTRAL.warmHue).toFixed(6)};
const float ON_WARM_LO = ${OBJECT_NEUTRAL.warmLo.toFixed(4)};
const float ON_WARM_HI = ${OBJECT_NEUTRAL.warmHi.toFixed(4)};
${Object.entries(VIVID_LOOK).map(([k, v]) => `const float VL_${k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()} = ${v.toFixed(6)};`).join("\n")}
${Object.entries(BLUE_WATER).map(([k, v]) => `const float BW_${k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()} = ${v.toFixed(6)};`).join("\n")}
${Object.entries(RICH_LOOK).map(([k, v]) => `const float RL_${k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()} = ${v.toFixed(6)};`).join("\n")}
${Object.entries(HIGHLIGHT_PINK).map(([k, v]) => `const float HP_${k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()} = ${v.toFixed(6)};`).join("\n")}
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
// lift Subject pop has already applied, ck = the colour share (segColourK). Only with a real AI mask on the frame
// (s = 0 otherwise). The colour stays on the water's side of neutral.
vec3 segRestore(vec3 lk, float s, float lr, float lifted, float ck) {
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
  ab += wh * min(SR_WARM * s * min(1.0, 2.0 * p[24].z) * lit * ck, SR_WARM_SHARE * max(0.0, -dot(ab, wh)));
  // Local contrast against the neighbourhood, then the midtone lift (up to SR_LIFT x s in all).
  float L = lk.x * pow(clamp(lr, SR_R_MIN, SR_R_MAX), SR_DETAIL * s);
  L += max(0.0, SR_LIFT * s - lifted) * 4.0 * L * max(0.0, 1.0 - L);
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
${RED_GLSL}
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
  if (segS > 0.0) lk = segRestore(lk, segS, (lumI + DG_EPS) / (guideLum(uv) + DG_EPS), 0.0, segColourK(an));
  // Tone target (analyze.ts TONE, p24.w): one gamma on the graded lightness, the same for every pixel of the frame.
  if (p[24].w > 1.0) lk.x = pow(max(lk.x, 0.0), p[24].w);
  // The warm chroma may exceed the source-relative cap (a cyan shark has little to start from).
  vec3 o1 = oklabToLinear(capChroma(lk, max(max(cSrc, wk * WP_CMIN * 1.5), bl.w)));
  vec3 o2 = fitToGamut(o1 * detailRatio(src, lin));
  vec3 outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}
vec3 grade(vec3 src, vec2 uv) { return gradeD(src, src, uv); }`;

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
fn segRestore(lk: vec3<f32>, s: f32, lr: f32, lifted: f32, ck: f32) -> vec3<f32> {
  if (s <= 0.0) { return lk; }
  let wh = vec2<f32>(SR_COS, SR_SIN);
  var ab = lk.yz;
  let C = length(ab);
  var cool = 0.0;
  if (C > 1e-5) { cool = smoothstepf(0.0, 0.5, -dot(ab, wh) / C); }
  ab = ab * (1.0 - min(SR_CAST_MAX, SR_CAST * s) * cool * ck);
  let lit = smoothstepf(SR_LIT_LO, SR_LIT_HI, lk.x) * (1.0 - smoothstepf(SR_HI_LO, SR_HI_HI, lk.x));
  ab = ab + wh * min(SR_WARM * s * min(1.0, 2.0 * params.p[24].z) * lit * ck, SR_WARM_SHARE * max(0.0, -dot(ab, wh)));
  var L = lk.x * pow(clamp(lr, SR_R_MIN, SR_R_MAX), SR_DETAIL * s);
  L = L + max(0.0, SR_LIFT * s - lifted) * 4.0 * L * max(0.0, 1.0 - L);
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
${RED_WGSL}
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
  if (segS > 0.0) { lk = segRestore(lk, segS, (lumI + DG_EPS) / (guideLum(uv) + DG_EPS), 0.0, segColourK(an)); }
  // Tone target (analyze.ts TONE, p24.w): one gamma on the graded lightness, the same for every pixel of the frame.
  if (params.p[24].w > 1.0) { lk = vec3(pow(max(lk.x, 0.0), params.p[24].w), lk.yz); }
  let o1 = oklabToLinear(capChroma(lk, max(max(cSrc, wk * WP_CMIN * 1.5), bl.w)));
  let o2 = fitToGamut(o1 * detailRatio(src, lin));
  let outS = linearToSrgb(o2);
  return mix(src, outS, strength);
}`;

// Artifact guard base (see DETAIL_GUARD in params.ts; mirrors apply.ts
// detailBase tap for tap): needs the source texture, so it lives with the
// fragment plumbing in shaders.ts, which includes these after the bindings.
const tapsGlsl = DETAIL_TAPS.map(([x, y, w]) => `  dgTap(suv + vec2(${x.toFixed(1)}, ${y.toFixed(1)}) * tx, src, ${w.toFixed(4)}, kk, acc, sw);`).join("\n");
const tapsWgsl = DETAIL_TAPS.map(([x, y, w]) => `  acc += dgTap(suv + vec2<f32>(${x.toFixed(1)}, ${y.toFixed(1)}) * tx, src, ${w.toFixed(4)}, kk);`).join("\n");
export const DETAIL_GLSL = `
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
${tapsGlsl}
  return acc / sw;
}`;
export const DETAIL_WGSL = `
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
${tapsWgsl}
  return acc.xyz / acc.w;
}`;

// The same guard reading the denoised source (temporal.ts NR pass, u_tpNr) at its own uv: the taps are closed
// under rotation and reflection (DETAIL_TAPS), so the target's orientation does not matter.
const forNr = (code: string) => code.replaceAll("dgTap", "dgTapNr").replaceAll("detailBase", "detailBaseNr").replaceAll("u_source", "u_tpNr");
export const DETAIL_NR_GLSL = forNr(DETAIL_GLSL);
export const DETAIL_NR_WGSL = forNr(DETAIL_WGSL);
