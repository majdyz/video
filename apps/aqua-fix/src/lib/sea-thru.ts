// Sea-thru underwater color correction with cyan-red pseudo-depth.
//
// Reference:
//   Akkaynak & Treibitz, "Sea-thru: A Method for Removing Water From
//   Underwater Images", CVPR 2019. The full Sea-thru model splits
//   attenuation into two coefficients per channel — beta_D for the
//   direct-signal component and beta_B for the backscatter — and
//   requires a metric depth map z(x):
//
//     I(x) = J(x) * exp(-beta_D * z(x)) + B_inf * (1 - exp(-beta_B * z(x)))
//
// Solving for J:
//     J(x) = (I(x) - B_inf * (1 - exp(-beta_B * z(x)))) / exp(-beta_D * z(x))
//
// We don't have a true depth sensor for arbitrary footage, so we use a
// monocular cyan-red proxy: red attenuates ~10x faster than blue per
// metre in clear water, so (R - B) is a monotonically decreasing
// function of depth for typical reef scenes. The proxy fails on objects
// that are intrinsically red and close to the camera (e.g. divers in
// red wetsuits, red soft coral close-ups) — those pixels will be
// flagged as "deep" and over-corrected. Item flagged in-shader via the
// pseudoDepth comment.

export interface SeaThruCoeffs {
  // Per-channel direct-signal attenuation (1/m, scaled to depth proxy
  // range so depth 1.0 is "deep enough that red is gone").
  betaD: [number, number, number];
  // Per-channel backscatter coefficient.
  betaB: [number, number, number];
  // Veiling light B_inf in [0,1].
  bInf: [number, number, number];
}

// Defaults sourced from Sea-thru Table 1 ranges (Jerlov-style binning).
// Values rescaled so the pseudo-depth proxy in [0,1] approximates the
// metric depth range each preset targets.
//
// shallow: 0-3 m, weak attenuation, neutral veil.
// reef:    3-10 m, classic reef blue-green cast.
// deep:    10-25 m, heavy red loss, strong cyan veil.
export const SEA_THRU_PRESETS = {
  shallow: {
    betaD: [0.85, 0.32, 0.18],
    betaB: [0.55, 0.28, 0.16],
    bInf: [0.18, 0.32, 0.42],
  } as SeaThruCoeffs,
  reef: {
    betaD: [1.6, 0.55, 0.28],
    betaB: [1.1, 0.5, 0.32],
    bInf: [0.1, 0.4, 0.55],
  } as SeaThruCoeffs,
  deep: {
    betaD: [2.4, 0.95, 0.42],
    betaB: [1.7, 0.85, 0.55],
    bInf: [0.05, 0.35, 0.65],
  } as SeaThruCoeffs,
} as const;

export type SeaThruPresetName = keyof typeof SEA_THRU_PRESETS;

// Sea-thru fragment shader. Reads the source frame, computes a
// pseudo-depth proxy from cyan-red contrast, then inverts the two-coeff
// attenuation model per channel.
//
// Uniforms expected by the host:
//   sampler2D u_image   — input radiance
//   vec3      u_betaD   — direct-signal coefficients (RGB)
//   vec3      u_betaB   — backscatter coefficients (RGB)
//   vec3      u_bInf    — veiling light B_inf (RGB)
//   float     u_depthBias — additive shift for pseudoDepth, lets the
//                            user tune "how deep does the scene look"
//   float     u_strength — blend factor between input and corrected
//
// Pseudo-depth derivation:
//   pseudoDepth = clamp(1 - (R - B + 0.5), 0, 1)
// Monotonic with depth for reef shots, breaks for close red objects
// (they look "deep" → get over-amplified red back). A real depth source
// should replace this when available.
export const SEATHRU_FRAG_SRC = `
precision highp float;

uniform sampler2D u_image;
uniform vec3 u_betaD;
uniform vec3 u_betaB;
uniform vec3 u_bInf;
uniform float u_depthBias;
uniform float u_strength;

varying vec2 v_uv;

float pseudoDepthFromRGB(vec3 c) {
  // Red minus blue: positive in shallow / red-rich pixels, negative deep.
  // FAILURE MODE: intrinsically red foreground objects look "deep" and
  // get over-corrected. Use a real depth map when the platform exposes
  // one.
  float rb = c.r - c.b;
  return clamp(1.0 - (rb + 0.5) + u_depthBias, 0.0, 1.0);
}

void main() {
  vec3 I = texture2D(u_image, v_uv).rgb;
  float z = pseudoDepthFromRGB(I);

  // Two-coefficient model per channel.
  vec3 directT = exp(-u_betaD * z);
  vec3 backT   = 1.0 - exp(-u_betaB * z);

  // Backscatter removal first, then direct-signal recovery.
  vec3 noBack = I - u_bInf * backT;
  vec3 J = noBack / max(directT, vec3(0.05));

  J = clamp(J, 0.0, 1.0);
  gl_FragColor = vec4(mix(I, J, u_strength), 1.0);
}
`;

// Stand-alone pseudo-depth pass — useful if the host wants to render
// the depth proxy to a single-channel FBO for debug overlays or to feed
// it into another pass instead of recomputing per-pixel.
export const PSEUDO_DEPTH_FRAG_SRC = `
precision highp float;

uniform sampler2D u_image;
uniform float u_depthBias;

varying vec2 v_uv;

void main() {
  vec3 c = texture2D(u_image, v_uv).rgb;
  float rb = c.r - c.b;
  float z = clamp(1.0 - (rb + 0.5) + u_depthBias, 0.0, 1.0);
  gl_FragColor = vec4(z, z, z, 1.0);
}
`;

// CPU helper for picking a preset based on a quick blue-cast estimate
// of the source frame mean. Lets the caller auto-select shallow / reef
// / deep without exposing a dropdown when the user doesn't care.
export function autoSelectPreset(meanRGB: [number, number, number]): SeaThruPresetName {
  const [r, , b] = meanRGB;
  const blueCast = b - r;
  if (blueCast < 0.08) return "shallow";
  if (blueCast < 0.22) return "reef";
  return "deep";
}
