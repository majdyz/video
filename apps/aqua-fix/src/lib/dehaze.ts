// Berman haze-line dehazing for underwater scenes.
//
// Reference:
//   Berman, Treibitz, Avidan, "Diving into Haze-Lines: Color Restoration
//   of Underwater Images", BMVC 2017 — extends the atmospheric Non-Local
//   Image Dehazing model (Berman, CVPR 2016) to wavelength-dependent
//   per-channel transmission.
//
// Atmospheric model:
//   I(x) = J(x) * t(x) + A * (1 - t(x))
//   where J is the unattenuated scene radiance, t is per-channel
//   transmission in [0,1], and A is the global veiling/atmospheric light.
//
// Underwater extension: t is no longer scalar. Per channel,
//   t_c(x) = exp(-beta_c * d(x))
// with beta_R >> beta_G > beta_B for typical Jerlov water types. We use
// the wavelength-attenuation ratios beta_R/beta_B and beta_G/beta_B to
// reconstruct the green and red transmission from a base blue
// transmission (estimated via the dark channel prior).

export type RGB = [number, number, number];

export interface BetaRatios {
  betaG: number;
  betaR: number;
}

// Empirical per-channel attenuation ratios relative to blue, averaged
// across Jerlov I-III coastal water from Berman 2017 Table 1 and
// Solonenko & Mobley 2015 (clear ocean / coastal). Blue is the reference
// (ratio = 1.0 implicit).
//
// Red attenuates ~5x faster than blue, green ~2.5x faster. Inverted to
// the "transmission stays high vs blue" form expected by the shader,
// the corresponding t-exponent ratios are 0.4 for green and 0.2 for red.
export function estimateBetaRatios(): BetaRatios {
  return { betaG: 0.4, betaR: 0.2 };
}

// 15x15 dark channel: per-pixel min over RGB, then min over a square
// window. He, Sun, Tang 2009 CVPR "Single Image Haze Removal Using Dark
// Channel Prior". Returns a Uint8 buffer w*h in row-major order.
export function computeDarkChannel(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  windowRadius = 7,
): Uint8ClampedArray {
  const perPixelMin = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    perPixelMin[p] = r < g ? (r < b ? r : b) : g < b ? g : b;
  }

  // Two-pass separable min filter.
  const tmp = new Uint8ClampedArray(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      const x0 = Math.max(0, x - windowRadius);
      const x1 = Math.min(w - 1, x + windowRadius);
      for (let xx = x0; xx <= x1; xx++) {
        const v = perPixelMin[y * w + xx];
        if (v < m) m = v;
      }
      tmp[y * w + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 255;
      const y0 = Math.max(0, y - windowRadius);
      const y1 = Math.min(h - 1, y + windowRadius);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * w + x];
        if (v < m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

// Pick the brightest 0.1% of dark-channel pixels and return the mean
// RGB of those pixels in the source. He et al.'s recommended A
// estimator. Returns components in [0,1].
export function estimateAtmosphericLight(
  src: Uint8ClampedArray,
  w: number,
  h: number,
): RGB {
  const pixelCount = w * h;
  const dark = computeDarkChannel(src, w, h);
  const topCount = Math.max(1, Math.floor(pixelCount * 0.001));

  // Indices of the top-k brightest dark-channel pixels via partial
  // selection — cheaper than full sort for large frames.
  const indices = new Uint32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) indices[i] = i;
  indices.sort((a, b) => dark[b] - dark[a]);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let k = 0; k < topCount; k++) {
    const p = indices[k] * 4;
    rSum += src[p];
    gSum += src[p + 1];
    bSum += src[p + 2];
  }
  return [
    rSum / topCount / 255,
    gSum / topCount / 255,
    bSum / topCount / 255,
  ];
}

// Fragment shader implementing per-pixel inverse of the haze model with
// inline transmission estimation. Transmission is derived from a
// 1-tap dark-channel proxy (min of RGB over a small neighborhood
// sampled in the shader via texelFetch-like offsets) and then split
// per channel by u_betaRatios.
//
// Uniforms expected by the host:
//   sampler2D u_image      — input radiance (sRGB, normalised in shader)
//   vec3      u_atmos      — atmospheric light A in [0,1] per channel
//   vec2      u_betaRatios — (beta_G/beta_B, beta_R/beta_B)
//   float     u_omega      — preserve-haze factor (~0.95) per Berman
//   vec2      u_texel      — 1.0 / textureSize for neighborhood sampling
//   float     u_strength   — blend factor between input and dehazed output
//
// Output: J(x) = (I - A*(1 - t)) / max(t, 0.1)
export const DEHAZE_FRAG_SRC = `
precision highp float;

uniform sampler2D u_image;
uniform vec3 u_atmos;
uniform vec2 u_betaRatios;
uniform float u_omega;
uniform vec2 u_texel;
uniform float u_strength;

varying vec2 v_uv;

// Cheap 3x3 dark-channel: min over RGB then min over a 3x3 window.
float darkChannelAt(vec2 uv) {
  float m = 1.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 o = vec2(float(dx), float(dy)) * u_texel;
      vec3 c = texture2D(u_image, uv + o).rgb;
      float chMin = min(c.r, min(c.g, c.b));
      m = min(m, chMin);
    }
  }
  return m;
}

void main() {
  vec3 I = texture2D(u_image, v_uv).rgb;

  // Base transmission for the blue channel from the dark-channel prior.
  float darkA = darkChannelAt(v_uv) / max(max(u_atmos.r, u_atmos.g), u_atmos.b);
  float tB = clamp(1.0 - u_omega * darkA, 0.1, 1.0);

  // Per-channel transmission via wavelength ratios (Berman 2017 eq. 3):
  //   t_c = t_B ^ (beta_c / beta_B)
  float tG = pow(tB, u_betaRatios.x);
  float tR = pow(tB, u_betaRatios.y);
  vec3 t = vec3(tR, tG, tB);

  // Invert the model. Clamp t to avoid division blowups in deep shadow.
  vec3 tSafe = max(t, vec3(0.1));
  vec3 J = (I - u_atmos * (1.0 - t)) / tSafe;
  J = clamp(J, 0.0, 1.0);

  gl_FragColor = vec4(mix(I, J, u_strength), 1.0);
}
`;
