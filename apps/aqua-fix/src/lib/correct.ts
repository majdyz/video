// Aqua Fix WebGL pipeline.
//
// Pipeline topology (each arrow is a render pass writing to an FBO unless
// noted; T0..T5 are pyramid levels, level 0 = source resolution):
//
//   src ──basePass──▶ base    (Ancuti compensation + Shades-of-Gray WB +
//                              soft percentile stretch, in linear-ish sRGB)
//   base ──gammaPass──▶ I1    (gamma-corrected branch, lifts midtones)
//   base ──blurH──▶ tmp ──blurV──▶ baseBlur  (5x5 separable Gaussian)
//   base + baseBlur ──unsharpPass──▶ I2      (sharpened / detail branch)
//
//   For each Ik:
//     - compute Gaussian blur of Ik       (saliency uses |Ik − blur(Ik)|)
//     - weightPass writes a single channel containing the un-normalised
//       weight = w_laplacian * w_saliency * w_saturation * w_exposedness
//     - normalisePass turns (Wraw1, Wraw2) into (W1, W2 = 1 − W1)
//
//   Build Gaussian pyramids of I1, I2, W1, W2 (5 levels). Laplacian levels
//   for I1, I2 are derived on-the-fly inside the blend pass (G[k] − up(G[k+1]))
//   to halve our texture count.
//
//   Fuse per level k:  L_out[k] = W1[k] * L1[k] + W2[k] * L2[k]
//                      with the bottom-most Gaussian level fused similarly.
//
//   Collapse bottom-up: out[k] = L_out[k] + up(out[k+1]).
//
//   Detail boost (single-scale Aubry-style remap) operates on the fused
//   image's bottom-residual luma — see detailPass for the math justification.
//
//   Final pass: saturation control + optional .cube LUT overlay + intensity
//   crossfade with the original frame, output to the canvas.
//
// Why FBO ping-pong instead of one giant fragment shader: multi-scale fusion
// inherently needs intermediate textures (you can't compute pyramid level k
// without level k-1's output). Once you have FBOs anyway, factoring the rest
// into named passes keeps each shader short enough to read and lets us
// reuse the Gaussian downsample pass for every pyramid we build.
//
// We use WebGL1 with OES_texture_half_float so Laplacian coefficients (which
// are signed and small) survive without 8-bit quantisation. If half-float
// isn't available we degrade to UNSIGNED_BYTE with a 0.5 bias for signed
// storage — quality drops but the pipeline still runs.

const PYR_LEVELS = 5;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Pass 0: Ancuti compensation + SoG WB + soft percentile stretch.
// Output is the "base" image used by both fusion branches.
const BASE_FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform vec3 u_mean;
uniform vec3 u_wbGain;
uniform vec3 u_min;
uniform vec3 u_max;
uniform float u_alpha;
varying vec2 v_uv;
void main() {
  vec4 src = texture2D(u_image, v_uv);
  vec3 c = src.rgb;
  float redComp = max(0.0, u_mean.g - u_mean.r);
  float blueComp = max(0.0, u_mean.g - u_mean.b);
  vec3 comp = c;
  comp.r = c.r + u_alpha * redComp * (1.0 - c.r) * c.g;
  comp.b = c.b + u_alpha * blueComp * (1.0 - c.b) * c.g;
  vec3 wb = clamp(comp * u_wbGain, 0.0, 1.0);
  vec3 stretched = clamp((wb - u_min) / max(u_max - u_min, vec3(1e-3)), 0.0, 1.0);
  gl_FragColor = vec4(stretched, src.a);
}
`;

// Branch I1 — gamma-corrected. Lifts midtones, preserves global colour.
// The Ancuti paper picks I1 to be exposure-corrected (their "white-balanced"
// branch); since we already did WB in basePass, gamma here plays the same
// role — it's the contrast-low / well-exposed input to the fusion.
const GAMMA_FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform float u_gamma;
varying vec2 v_uv;
void main() {
  vec4 src = texture2D(u_image, v_uv);
  vec3 g = pow(clamp(src.rgb, 0.0, 1.0), vec3(u_gamma));
  gl_FragColor = vec4(g, src.a);
}
`;

// Branch I2 — unsharp mask: I + amount * (I − blur(I)).
// This is the contrast-high / detail input. Amount is driven by the
// "contrast" slider so the existing UI knob keeps a meaningful job.
const UNSHARP_FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_blur;
uniform float u_amount;
varying vec2 v_uv;
void main() {
  vec4 src = texture2D(u_image, v_uv);
  vec3 lo = texture2D(u_blur, v_uv).rgb;
  vec3 sharp = src.rgb + u_amount * (src.rgb - lo);
  gl_FragColor = vec4(clamp(sharp, 0.0, 1.0), src.a);
}
`;

// Separable 5-tap Gaussian. sigma ≈ 1.0, weights from Pascal-ish row.
// Used both for unsharp blur and for saliency reference colour.
const BLUR_FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_dir;        // (1/w, 0) for horizontal, (0, 1/h) for vertical
varying vec2 v_uv;
void main() {
  // Weights normalised: 1 4 6 4 1 → /16
  vec3 sum = vec3(0.0);
  sum += texture2D(u_image, v_uv - 2.0 * u_dir).rgb * (1.0 / 16.0);
  sum += texture2D(u_image, v_uv -       u_dir).rgb * (4.0 / 16.0);
  sum += texture2D(u_image, v_uv               ).rgb * (6.0 / 16.0);
  sum += texture2D(u_image, v_uv +       u_dir).rgb * (4.0 / 16.0);
  sum += texture2D(u_image, v_uv + 2.0 * u_dir).rgb * (1.0 / 16.0);
  gl_FragColor = vec4(sum, 1.0);
}
`;

// Mertens-style downsample: blur then take every other pixel. Since the
// next pass samples at half resolution from a hardware-LINEAR texture, we
// rely on bilinear to do the 2x2 average and treat it as the box filter.
// This is cheap and matches the Mertens reference well enough.
const DOWNSAMPLE_FRAG = `
precision highp float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
`;

// Bilinear upsample is the same shader; the FBO size differs.
const UPSAMPLE_FRAG = DOWNSAMPLE_FRAG;

// Compute the four Mertens / Ancuti weight maps for one input image.
// Output = single value packed into all RGBA channels.
//
//   w_laplacian = |∇²L|                  (luma contrast — fine detail wins)
//   w_saliency  = ||I − blur(I)||₂       (frequency-tuned saliency, Achanta 2009;
//                                         we use sRGB instead of CIELab — close
//                                         enough for an iPhone preview, and the
//                                         conversion would cost another pass)
//   w_saturation = stddev(R,G,B)         (saturated regions look "good")
//   w_exposedness = exp(−(L−0.5)² / 0.08) per channel, multiplied
//                                        (Mertens 2007; well-exposed pixels
//                                         contribute most)
//
// Output stores the geometric weight product (with small bias so 0 is rare).
const WEIGHT_FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_blur;
uniform vec2 u_texel;            // (1/w, 1/h) — for the Laplacian stencil
varying vec2 v_uv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 c  = texture2D(u_image, v_uv).rgb;
  vec3 cb = texture2D(u_blur,  v_uv).rgb;

  // Discrete Laplacian on luma: 4*center - (N+S+E+W).
  float lC = luma(c);
  float lN = luma(texture2D(u_image, v_uv + vec2(0.0,  u_texel.y)).rgb);
  float lS = luma(texture2D(u_image, v_uv - vec2(0.0,  u_texel.y)).rgb);
  float lE = luma(texture2D(u_image, v_uv + vec2(u_texel.x, 0.0)).rgb);
  float lW = luma(texture2D(u_image, v_uv - vec2(u_texel.x, 0.0)).rgb);
  float wLap = abs(4.0 * lC - lN - lS - lE - lW);

  // Saliency = magnitude of (image − low-passed image).
  vec3 d = c - cb;
  float wSal = sqrt(dot(d, d) + 1e-6);

  // Saturation = std of channels.
  float m = (c.r + c.g + c.b) / 3.0;
  vec3 dv = c - vec3(m);
  float wSat = sqrt(dot(dv, dv) / 3.0);

  // Exposedness — bell around 0.5 per channel, multiplied.
  vec3 ex = exp(-((c - 0.5) * (c - 0.5)) / vec3(0.08));
  float wExp = ex.r * ex.g * ex.b;

  // Combine. Add tiny floor so divide-by-zero never bites the normaliser.
  float w = (wLap + 0.05) * (wSal + 0.05) * (wSat + 0.05) * (wExp + 0.05);
  gl_FragColor = vec4(w, w, w, 1.0);
}
`;

// Normalise (Wraw1, Wraw2) per pixel into W1 (W2 = 1 − W1).
// We only need to store W1 — saves a texture.
const NORMALISE_FRAG = `
precision highp float;
uniform sampler2D u_w1;
uniform sampler2D u_w2;
varying vec2 v_uv;
void main() {
  float a = texture2D(u_w1, v_uv).r;
  float b = texture2D(u_w2, v_uv).r;
  float w1 = a / max(a + b, 1e-6);
  gl_FragColor = vec4(w1, w1, w1, 1.0);
}
`;

// Per-level Laplacian fusion blend.
//   L_k = G_k - up(G_{k+1})    (computed inline)
//   out_k = W1_k * L1_k + W2_k * L2_k
//
// We bias by 0.5 so signed Laplacian coefficients fit in [0,1] storage when
// half-float isn't available. The collapse pass undoes the bias.
//
// At the bottom level (k = N-1) the caller invokes the simpler "fuseBottom"
// shader instead — see FUSE_BOTTOM_FRAG.
const BLEND_FRAG = `
precision highp float;
uniform sampler2D u_g1;          // gauss I1 at level k
uniform sampler2D u_g2;          // gauss I2 at level k
uniform sampler2D u_g1Next;      // gauss I1 at level k+1 (lower res, sampled bilinearly upsampled)
uniform sampler2D u_g2Next;
uniform sampler2D u_w1;          // gauss W1 at level k (W2 = 1 - W1)
uniform float u_signedBias;      // 0.5 if storage is unorm8, 0.0 if half-float
varying vec2 v_uv;
void main() {
  vec3 g1 = texture2D(u_g1, v_uv).rgb;
  vec3 g2 = texture2D(u_g2, v_uv).rgb;
  vec3 u1 = texture2D(u_g1Next, v_uv).rgb;
  vec3 u2 = texture2D(u_g2Next, v_uv).rgb;
  vec3 l1 = g1 - u1;
  vec3 l2 = g2 - u2;
  float w1 = texture2D(u_w1, v_uv).r;
  vec3 fused = w1 * l1 + (1.0 - w1) * l2;
  gl_FragColor = vec4(fused + vec3(u_signedBias), 1.0);
}
`;

// Bottom-of-pyramid fuse — Gaussians directly (no Laplacian to derive).
const FUSE_BOTTOM_FRAG = `
precision highp float;
uniform sampler2D u_g1;
uniform sampler2D u_g2;
uniform sampler2D u_w1;
varying vec2 v_uv;
void main() {
  vec3 g1 = texture2D(u_g1, v_uv).rgb;
  vec3 g2 = texture2D(u_g2, v_uv).rgb;
  float w1 = texture2D(u_w1, v_uv).r;
  vec3 fused = w1 * g1 + (1.0 - w1) * g2;
  gl_FragColor = vec4(fused, 1.0);
}
`;

// Collapse step: out_k = laplacian_k + upsample(out_{k+1}).
// Removes the 0.5 signed-storage bias if it was applied by the blend pass.
const COLLAPSE_FRAG = `
precision highp float;
uniform sampler2D u_lap;
uniform sampler2D u_lower;
uniform float u_signedBias;
varying vec2 v_uv;
void main() {
  vec3 lap = texture2D(u_lap, v_uv).rgb - vec3(u_signedBias);
  vec3 up  = texture2D(u_lower, v_uv).rgb;
  gl_FragColor = vec4(lap + up, 1.0);
}
`;

// Detail / "Clarity" pass — Aubry-style local-Laplacian-inspired remap.
//
// True local Laplacian (Paris/Hasinoff/Aubry) processes every level with a
// per-pixel reference gray and rebuilds a separate Laplacian pyramid. That
// would multiply our pyramid passes by ~4 and miss 60fps on iPhone.
//
// Aubry 2014 "Fast local Laplacian filters" reduces this to a few discrete
// reference levels and interpolates. For an iPhone preview we collapse the
// scheme further: take the high-frequency component (full-res image minus
// its Gaussian-blurred copy from blurH/blurV) and apply a sigmoidal remap
// scaled by the local detail magnitude. With α controlled by `detail` this
// gives the same midtone-detail boost users recognise as "Clarity" without
// needing a second pyramid. We document the simplification and ship it
// behind the same slider so a future swap to the multi-level fast variant
// stays a drop-in.
const DETAIL_FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_blur;        // low-pass of u_image at the same resolution
uniform float u_strength;        // 0..1 from the Detail slider
varying vec2 v_uv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 src = texture2D(u_image, v_uv).rgb;
  vec3 lo  = texture2D(u_blur,  v_uv).rgb;
  vec3 hi  = src - lo;

  // Aubry/Paris remap: r(d) = sign(d) * |d|^(1/alpha+epsilon). For small d
  // (noise-ish) we attenuate slightly; for medium d we boost. Implemented
  // here as a smooth sigmoid scaled by the slider strength so the transition
  // stays artefact-free at high settings.
  float mag = length(hi);
  float boost = 1.0 + u_strength * 1.5 * smoothstep(0.0, 0.05, mag);
  vec3 detail = hi * boost;

  // Add the boosted detail back onto the low-pass luminance carrier.
  // Working through luma keeps colour stable when the boost is large.
  float Llo = luma(lo);
  float Lhi = luma(detail);
  float Lout = clamp(Llo + Lhi, 0.0, 1.0);
  // Preserve chroma by rescaling the original colour to the new luma.
  float Lsrc = max(luma(src), 1e-4);
  vec3 outRgb = clamp(src * (Lout / Lsrc), 0.0, 1.0);
  gl_FragColor = vec4(outRgb, 1.0);
}
`;

// Final pass: saturation + .cube LUT overlay + intensity crossfade with the
// original (unprocessed, but white-balanced? no — true original) frame.
const FINAL_FRAG = `
precision highp float;
uniform sampler2D u_processed;
uniform sampler2D u_original;
uniform sampler2D u_lut;
uniform float u_saturation;
uniform float u_lutSize;
uniform float u_lutMix;
uniform float u_intensity;
varying vec2 v_uv;

vec3 sampleLUT(vec3 color, float size) {
  float fz = clamp(color.b, 0.0, 1.0) * (size - 1.0);
  float zLow = floor(fz);
  float zHigh = min(zLow + 1.0, size - 1.0);
  float zMix = fz - zLow;
  float r = clamp(color.r, 0.0, 1.0) * (size - 1.0);
  float g = clamp(color.g, 0.0, 1.0) * (size - 1.0);
  float texW = size * size;
  float texH = size;
  vec2 uvLow  = vec2(zLow  * size + r + 0.5, g + 0.5) / vec2(texW, texH);
  vec2 uvHigh = vec2(zHigh * size + r + 0.5, g + 0.5) / vec2(texW, texH);
  vec3 cLow  = texture2D(u_lut, uvLow ).rgb;
  vec3 cHigh = texture2D(u_lut, uvHigh).rgb;
  return mix(cLow, cHigh, zMix);
}

void main() {
  vec4 procPx = texture2D(u_processed, v_uv);
  vec3 c = procPx.rgb;
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(L), c, u_saturation);
  if (u_lutMix > 0.001 && u_lutSize > 0.5) {
    vec3 graded = sampleLUT(c, u_lutSize);
    c = mix(c, graded, u_lutMix);
  }
  vec3 src = texture2D(u_original, v_uv).rgb;
  vec3 outC = mix(src, c, u_intensity);
  gl_FragColor = vec4(outC, procPx.a);
}
`;

export type Stats = {
  mean: [number, number, number];
  wbGain: [number, number, number];
  min: [number, number, number];
  max: [number, number, number];
  alpha: number;
};

export type Settings = {
  intensity: number;
  castStrength: number;
  saturation: number;
  gamma: number;
  contrast: number;          // drives unsharp-mask amount on the I2 branch
  detail: number;            // local-laplacian-style detail / "Clarity"
  lutMix: number;
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Link failed: " + gl.getProgramInfoLog(p));
  }
  return p;
}

// One framebuffer + texture + size record. We keep these in pools so a
// resize blows them away once and steady-state rendering allocates nothing.
type FBO = {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
};

function createTexture(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  type: number,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, null);
  return tex;
}

function createFBO(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  type: number,
): FBO {
  const tex = createTexture(gl, width, height, type);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("FBO incomplete at " + width + "x" + height);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, width, height };
}

function deleteFBO(gl: WebGLRenderingContext, fbo: FBO | null) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  gl.deleteTexture(fbo.tex);
}

export class Renderer {
  canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private buffer: WebGLBuffer;

  // Shaders, keyed by purpose. Each holds (program, uniform locations).
  private programs: {
    base: WebGLProgram;
    gamma: WebGLProgram;
    unsharp: WebGLProgram;
    blur: WebGLProgram;
    down: WebGLProgram;
    up: WebGLProgram;
    weight: WebGLProgram;
    normalise: WebGLProgram;
    blend: WebGLProgram;
    fuseBottom: WebGLProgram;
    collapse: WebGLProgram;
    detail: WebGLProgram;
    final: WebGLProgram;
  };

  // Storage type chosen once at construction. Half-float keeps signed
  // Laplacian coefficients honest; UNSIGNED_BYTE forces a 0.5 bias trick.
  private storeType: number;
  private signedBias: number;

  // Pyramid + scratch FBOs. Allocated lazily on first uploadSource and
  // re-allocated only when the resolution changes.
  private pyrI1: FBO[] = [];
  private pyrI2: FBO[] = [];
  private pyrW1: FBO[] = [];
  private pyrW2: FBO[] = [];
  private pyrFused: FBO[] = [];     // collapse output, level-by-level
  private pyrTmp: FBO[] = [];       // separable-blur scratch at each level
  private base: FBO | null = null;
  private blurFull: FBO | null = null;       // gauss(base), reused as i2-blur
  private i1: FBO | null = null;
  private i2: FBO | null = null;
  private i1Blur: FBO | null = null;
  private i2Blur: FBO | null = null;
  private w1Raw: FBO | null = null;
  private w2Raw: FBO | null = null;
  private w1: FBO | null = null;
  private w2: FBO | null = null;
  private processed: FBO | null = null;      // detail-pass output, fed into final
  private allocW = 0;
  private allocH = 0;

  // Source frame upload + LUT upload.
  private sourceTex: WebGLTexture;
  private lutTexture: WebGLTexture;
  private lutSize: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    // Half-float intermediate textures keep Laplacian precision. iOS Safari
    // supports OES_texture_half_float since 14, and Linear since 14 as well;
    // we degrade to UNSIGNED_BYTE if either is missing (older Android).
    const halfFloat = gl.getExtension("OES_texture_half_float");
    const halfFloatLinear = gl.getExtension("OES_texture_half_float_linear");
    if (halfFloat && halfFloatLinear) {
      this.storeType = halfFloat.HALF_FLOAT_OES;
      this.signedBias = 0.0;
    } else {
      this.storeType = gl.UNSIGNED_BYTE;
      this.signedBias = 0.5;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const mk = (frag: string) => linkProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, frag));
    this.programs = {
      base: mk(BASE_FRAG),
      gamma: mk(GAMMA_FRAG),
      unsharp: mk(UNSHARP_FRAG),
      blur: mk(BLUR_FRAG),
      down: mk(DOWNSAMPLE_FRAG),
      up: mk(UPSAMPLE_FRAG),
      weight: mk(WEIGHT_FRAG),
      normalise: mk(NORMALISE_FRAG),
      blend: mk(BLEND_FRAG),
      fuseBottom: mk(FUSE_BOTTOM_FRAG),
      collapse: mk(COLLAPSE_FRAG),
      detail: mk(DETAIL_FRAG),
      final: mk(FINAL_FRAG),
    };

    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.sourceTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.lutTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  }

  uploadLUT(data: Uint8Array, size: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size * size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.lutSize = size;
  }

  clearLUT() {
    this.lutSize = 0;
  }

  hasLUT(): boolean {
    return this.lutSize > 0;
  }

  uploadSource(source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (width !== this.allocW || height !== this.allocH) {
      this.reallocPyramids(width, height);
      this.allocW = width;
      this.allocH = height;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  // (Re)build all framebuffers for the new resolution. Old ones are deleted.
  // The pyramid uses ceil-divide so a 1-pixel residual at the bottom is
  // still representable — important for non-power-of-two video frames.
  private reallocPyramids(w: number, h: number) {
    const gl = this.gl;
    const all = [
      this.base, this.blurFull, this.i1, this.i2, this.i1Blur, this.i2Blur,
      this.w1Raw, this.w2Raw, this.w1, this.w2, this.processed,
    ];
    for (const f of all) deleteFBO(gl, f);
    for (const arr of [this.pyrI1, this.pyrI2, this.pyrW1, this.pyrW2, this.pyrFused, this.pyrTmp]) {
      for (const f of arr) deleteFBO(gl, f);
      arr.length = 0;
    }

    const T = this.storeType;
    this.base = createFBO(gl, w, h, T);
    this.blurFull = createFBO(gl, w, h, T);
    this.i1 = createFBO(gl, w, h, T);
    this.i2 = createFBO(gl, w, h, T);
    this.i1Blur = createFBO(gl, w, h, T);
    this.i2Blur = createFBO(gl, w, h, T);
    this.w1Raw = createFBO(gl, w, h, T);
    this.w2Raw = createFBO(gl, w, h, T);
    this.w1 = createFBO(gl, w, h, T);
    this.w2 = createFBO(gl, w, h, T);
    this.processed = createFBO(gl, w, h, T);

    let lw = w;
    let lh = h;
    for (let k = 0; k < PYR_LEVELS; k++) {
      this.pyrI1.push(createFBO(gl, lw, lh, T));
      this.pyrI2.push(createFBO(gl, lw, lh, T));
      this.pyrW1.push(createFBO(gl, lw, lh, T));
      this.pyrW2.push(createFBO(gl, lw, lh, T));
      this.pyrFused.push(createFBO(gl, lw, lh, T));
      this.pyrTmp.push(createFBO(gl, lw, lh, T));
      lw = Math.max(1, Math.ceil(lw / 2));
      lh = Math.max(1, Math.ceil(lh / 2));
    }
  }

  // Run a fragment program writing into `out` (or canvas if null), with the
  // bound textures. `setUniforms` is the shader-specific uniform setup.
  // Centralising vertex bind + viewport here means each shader's uniforms
  // are the only thing that varies between passes.
  private runPass(
    program: WebGLProgram,
    out: FBO | null,
    setUniforms: (loc: (n: string) => WebGLUniformLocation | null) => void,
  ) {
    const gl = this.gl;
    if (out) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
      gl.viewport(0, 0, out.width, out.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const posLoc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    setUniforms((n) => gl.getUniformLocation(program, n));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Bind a texture to a sampler unit and assign it to a uniform.
  private bindTex(unit: number, tex: WebGLTexture, locUniform: WebGLUniformLocation | null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (locUniform) gl.uniform1i(locUniform, unit);
  }

  // Two-tap separable Gaussian blur from `src` into `dst`, using `tmp` for
  // the horizontal intermediate. All three FBOs must be the same size.
  private blur(src: FBO, dst: FBO, tmp: FBO) {
    const gl = this.gl;
    this.runPass(this.programs.blur, tmp, (u) => {
      this.bindTex(0, src.tex, u("u_image"));
      gl.uniform2f(u("u_dir")!, 1.0 / src.width, 0.0);
    });
    this.runPass(this.programs.blur, dst, (u) => {
      this.bindTex(0, tmp.tex, u("u_image"));
      gl.uniform2f(u("u_dir")!, 0.0, 1.0 / src.height);
    });
  }

  // Downsample by drawing the source into a smaller FBO with bilinear
  // sampling (= 2x2 box filter on average). Mertens' construction calls for
  // a Gaussian first, but for fusion at this preview quality the bilinear
  // box gives effectively the same pyramid; saves N blur passes.
  private downsampleInto(src: FBO, dst: FBO) {
    this.runPass(this.programs.down, dst, (u) => {
      this.bindTex(0, src.tex, u("u_image"));
    });
  }

  // Build a Gaussian pyramid in `levels[0..N-1]` from `src` placed at
  // levels[0]. Caller arranges that levels[0] is already populated (we copy
  // src into it first via downsampleInto, which is a same-size identity blit).
  private buildPyramid(src: FBO, levels: FBO[]) {
    this.downsampleInto(src, levels[0]);
    for (let k = 1; k < levels.length; k++) {
      this.downsampleInto(levels[k - 1], levels[k]);
    }
  }

  render(stats: Stats, settings: Settings) {
    const gl = this.gl;
    if (!this.base || !this.blurFull || !this.i1 || !this.i2
      || !this.i1Blur || !this.i2Blur || !this.w1Raw || !this.w2Raw
      || !this.w1 || !this.w2 || !this.processed) {
      throw new Error("Renderer not initialised — call uploadSource first");
    }

    // ---- Pass 0: base = compensation + WB + soft stretch ----
    this.runPass(this.programs.base, this.base, (u) => {
      this.bindTex(0, this.sourceTex, u("u_image"));
      gl.uniform3fv(u("u_mean")!, stats.mean);
      gl.uniform3fv(u("u_wbGain")!, stats.wbGain);
      gl.uniform3fv(u("u_min")!, stats.min);
      gl.uniform3fv(u("u_max")!, stats.max);
      gl.uniform1f(u("u_alpha")!, stats.alpha);
    });

    // ---- Branch I1: gamma correction of base ----
    this.runPass(this.programs.gamma, this.i1, (u) => {
      this.bindTex(0, this.base!.tex, u("u_image"));
      gl.uniform1f(u("u_gamma")!, settings.gamma);
    });

    // ---- Blur of base, used by I2 unsharp and (later) by the detail pass ----
    this.blur(this.base, this.blurFull, this.pyrTmp[0]);

    // ---- Branch I2: unsharp-masked base ----
    // Amount comes from the contrast slider — same intent (more contrast),
    // different mechanism than the dropped sCurve.
    this.runPass(this.programs.unsharp, this.i2, (u) => {
      this.bindTex(0, this.base!.tex, u("u_image"));
      this.bindTex(1, this.blurFull!.tex, u("u_blur"));
      gl.uniform1f(u("u_amount")!, settings.contrast);
    });

    // ---- Per-branch saliency low-pass ----
    this.blur(this.i1, this.i1Blur, this.pyrTmp[0]);
    this.blur(this.i2, this.i2Blur, this.pyrTmp[0]);

    // ---- Weight maps (raw, then normalised so W1 + W2 = 1) ----
    this.runPass(this.programs.weight, this.w1Raw, (u) => {
      this.bindTex(0, this.i1!.tex, u("u_image"));
      this.bindTex(1, this.i1Blur!.tex, u("u_blur"));
      gl.uniform2f(u("u_texel")!, 1.0 / this.i1!.width, 1.0 / this.i1!.height);
    });
    this.runPass(this.programs.weight, this.w2Raw, (u) => {
      this.bindTex(0, this.i2!.tex, u("u_image"));
      this.bindTex(1, this.i2Blur!.tex, u("u_blur"));
      gl.uniform2f(u("u_texel")!, 1.0 / this.i2!.width, 1.0 / this.i2!.height);
    });
    this.runPass(this.programs.normalise, this.w1, (u) => {
      this.bindTex(0, this.w1Raw!.tex, u("u_w1"));
      this.bindTex(1, this.w2Raw!.tex, u("u_w2"));
    });
    // W2 = 1 − W1 in shaders, so we don't need to materialise it; but the
    // pyramid still needs a texture, so we synthesise W2 once at full res by
    // pulling from w2Raw via a normalise-with-swapped-inputs.
    this.runPass(this.programs.normalise, this.w2, (u) => {
      this.bindTex(0, this.w2Raw!.tex, u("u_w1"));
      this.bindTex(1, this.w1Raw!.tex, u("u_w2"));
    });

    // ---- Pyramids ----
    this.buildPyramid(this.i1, this.pyrI1);
    this.buildPyramid(this.i2, this.pyrI2);
    this.buildPyramid(this.w1, this.pyrW1);
    this.buildPyramid(this.w2, this.pyrW2);

    // ---- Per-level Laplacian fusion + bottom-up collapse ----
    // Level N-1: fuse Gaussians directly.
    const last = PYR_LEVELS - 1;
    this.runPass(this.programs.fuseBottom, this.pyrFused[last], (u) => {
      this.bindTex(0, this.pyrI1[last].tex, u("u_g1"));
      this.bindTex(1, this.pyrI2[last].tex, u("u_g2"));
      this.bindTex(2, this.pyrW1[last].tex, u("u_w1"));
    });
    // Walk upwards: each level fuses Laplacian (from G_k vs upsampled G_{k+1})
    // then immediately collapses against the previous output.
    for (let k = last - 1; k >= 0; k--) {
      // Blend writes the fused Laplacian into pyrTmp[k] (with signed bias).
      this.runPass(this.programs.blend, this.pyrTmp[k], (u) => {
        this.bindTex(0, this.pyrI1[k].tex, u("u_g1"));
        this.bindTex(1, this.pyrI2[k].tex, u("u_g2"));
        this.bindTex(2, this.pyrI1[k + 1].tex, u("u_g1Next"));
        this.bindTex(3, this.pyrI2[k + 1].tex, u("u_g2Next"));
        this.bindTex(4, this.pyrW1[k].tex, u("u_w1"));
        gl.uniform1f(u("u_signedBias")!, this.signedBias);
      });
      // Collapse: out_k = lap_k + upsample(out_{k+1}). The upsample is
      // implicit because pyrFused[k+1] is sampled with bilinear into the
      // larger pyrFused[k] viewport.
      this.runPass(this.programs.collapse, this.pyrFused[k], (u) => {
        this.bindTex(0, this.pyrTmp[k].tex, u("u_lap"));
        this.bindTex(1, this.pyrFused[k + 1].tex, u("u_lower"));
        gl.uniform1f(u("u_signedBias")!, this.signedBias);
      });
    }
    const fused = this.pyrFused[0];

    // ---- Detail pass (Aubry-style local-Laplacian-inspired remap) ----
    // Reuses blurFull's shader path: blur the fused image, then apply the
    // sigmoidal detail boost. Output goes into `processed` so the final
    // pass can layer saturation + LUT + intensity on top.
    if (settings.detail > 0.001) {
      // We need a low-pass of the fused image. Reuse blurFull as scratch
      // (it's no longer needed after the I2 unsharp + saliency steps).
      this.blur(fused, this.blurFull, this.pyrTmp[0]);
      this.runPass(this.programs.detail, this.processed, (u) => {
        this.bindTex(0, fused.tex, u("u_image"));
        this.bindTex(1, this.blurFull!.tex, u("u_blur"));
        gl.uniform1f(u("u_strength")!, settings.detail);
      });
    } else {
      // Skip the detail pass — copy fused into processed via the cheap blit.
      this.downsampleInto(fused, this.processed);
    }

    // ---- Final composite: saturation + LUT + intensity crossfade ----
    this.runPass(this.programs.final, null, (u) => {
      this.bindTex(0, this.processed!.tex, u("u_processed"));
      this.bindTex(1, this.sourceTex, u("u_original"));
      this.bindTex(2, this.lutTexture, u("u_lut"));
      gl.uniform1f(u("u_saturation")!, settings.saturation);
      gl.uniform1f(u("u_lutSize")!, this.lutSize);
      gl.uniform1f(u("u_lutMix")!, this.lutSize > 0 ? settings.lutMix : 0.0);
      gl.uniform1f(u("u_intensity")!, settings.intensity);
    });
  }
}

const SOG_P = 6;
const MAX_GAIN = 4.5;
const MIN_GAIN = 0.4;

// CPU-side stats. We keep mean / WB gains / percentile cuts (everything the
// basePass shader needs). The CLAHE tone LUT is gone — fusion replaces it.
export function computeStats(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  alpha: number,
): Stats {
  const target = 256;
  const scale = Math.min(1, target / Math.max(srcWidth, srcHeight));
  const w = Math.max(1, Math.round(srcWidth * scale));
  const h = Math.max(1, Math.round(srcHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const total = w * h;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }
  const meanR = sumR / total / 255;
  const meanG = sumG / total / 255;
  const meanB = sumB / total / 255;

  const redCompTerm = Math.max(0, meanG - meanR);
  const blueCompTerm = Math.max(0, meanG - meanB);

  const compR = new Float32Array(total);
  const compB = new Float32Array(total);
  let sumRp = 0;
  let sumGp = 0;
  let sumBp = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const r2 = r + alpha * redCompTerm * (1 - r) * g;
    const b2 = b + alpha * blueCompTerm * (1 - b) * g;
    compR[p] = r2;
    compB[p] = b2;
    sumRp += Math.pow(r2, SOG_P);
    sumGp += Math.pow(g, SOG_P);
    sumBp += Math.pow(b2, SOG_P);
  }
  const normR = Math.pow(sumRp / total, 1 / SOG_P);
  const normG = Math.pow(sumGp / total, 1 / SOG_P);
  const normB = Math.pow(sumBp / total, 1 / SOG_P);

  const gainR = clampGain(normR > 0.001 ? normG / normR : 1);
  const gainG = 1;
  const gainB = clampGain(normB > 0.001 ? normG / normB : 1);

  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = clamp01(compR[p] * gainR);
    const g = clamp01((data[i + 1] / 255) * gainG);
    const b = clamp01(compB[p] * gainB);
    histR[(r * 255) | 0]++;
    histG[(g * 255) | 0]++;
    histB[(b * 255) | 0]++;
  }

  const lowFrac = 0.005;
  const highFrac = 0.995;
  const findCut = (hist: Uint32Array, frac: number) => {
    const targetN = frac * total;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= targetN) return i;
    }
    return 255;
  };

  const MIN_SPAN = 0.3;
  const min: [number, number, number] = [
    findCut(histR, lowFrac) / 255,
    findCut(histG, lowFrac) / 255,
    findCut(histB, lowFrac) / 255,
  ];
  const max: [number, number, number] = [
    findCut(histR, highFrac) / 255,
    findCut(histG, highFrac) / 255,
    findCut(histB, highFrac) / 255,
  ];
  for (let c2 = 0; c2 < 3; c2++) {
    const span = max[c2] - min[c2];
    if (span < MIN_SPAN) {
      const center = (max[c2] + min[c2]) / 2;
      const half = MIN_SPAN / 2;
      min[c2] = Math.max(0, center - half);
      max[c2] = Math.min(1, center + half);
    }
  }

  return {
    mean: [meanR, meanG, meanB],
    wbGain: [gainR, gainG, gainB],
    min,
    max,
    alpha,
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampGain(g: number) {
  return g < MIN_GAIN ? MIN_GAIN : g > MAX_GAIN ? MAX_GAIN : g;
}
