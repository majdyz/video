// "Blue magic" underwater color correction — the filter-matrix algorithm
// behind Dive+-class results (bornfree/dive-color-corrector, itself a port
// of nikolajbech/underwater-image-color-correction).
//
// Why this beats the old WB+stretch+CLAHE stack:
//  - Red is RECONSTRUCTED as a cross-channel mix of R, G and B, not
//    amplified diagonally. At depth the red channel is noise floor;
//    diagonal gains amplify noise into magenta blotches, while a channel
//    mixer re-injects chroma from the channels that still carry signal.
//  - The mix amount is depth-adaptive: a 1-D search finds the smallest
//    hue rotation that restores average red to a target, so shallow
//    footage gets a near-identity matrix and deep footage gets
//    aggressive G/B→R mixing.
//  - One affine transform per pixel (M·c + o). WB, stretch and
//    saturation happen simultaneously and consistently across the gamut
//    — no per-stage clipping, no halos, no hue twists.

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// AI color-transfer shader: applies a 6-float per-channel linear remap
// (gain * src + bias) derived offline from a FUnIE-GAN inference. Lets us
// run the model at slow cadence (~5–10 fps) but render at full source
// resolution and full display fps — much smoother than upscaling the
// 256×256 model output every frame.
const FRAG_AI = `
precision highp float;
uniform sampler2D u_image;
uniform vec3 u_gain;
uniform vec3 u_bias;
uniform float u_splitX;
varying vec2 v_uv;
void main() {
  vec4 src = texture2D(u_image, v_uv);
  if (v_uv.x < u_splitX) {
    gl_FragColor = src;
    return;
  }
  vec3 c = clamp(src.rgb * u_gain + u_bias, 0.0, 1.0);
  gl_FragColor = vec4(c, src.a);
}
`;

const FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_lut;
uniform mat3 u_colorMatrix;   // blue-magic filter matrix (column-major)
uniform vec3 u_colorOffset;
uniform float u_intensity;
uniform float u_saturation;
uniform float u_gamma;
uniform float u_contrast;
uniform float u_lutSize;
uniform float u_lutMix;
uniform float u_splitX;  // Compare-wipe split: pixels with uv.x < splitX show source.
varying vec2 v_uv;

vec3 sCurve(vec3 c, float k) {
  vec3 s = c * c * (3.0 - 2.0 * c);
  return mix(c, s, k);
}

// 3D LUT laid out as width = size*size, height = size. Each B slice tiles
// horizontally; within a slice, X = R, Y = G. Manual lerp across the two
// adjacent B slices, relying on hardware bilinear for R/G inside each slice.
vec3 sampleLUT(vec3 color, float size) {
  float fz = clamp(color.b, 0.0, 1.0) * (size - 1.0);
  float zLow = floor(fz);
  float zHigh = min(zLow + 1.0, size - 1.0);
  float zMix = fz - zLow;

  float r = clamp(color.r, 0.0, 1.0) * (size - 1.0);
  float g = clamp(color.g, 0.0, 1.0) * (size - 1.0);
  float texW = size * size;
  float texH = size;

  vec2 uvLow = vec2(zLow * size + r + 0.5, g + 0.5) / vec2(texW, texH);
  vec2 uvHigh = vec2(zHigh * size + r + 0.5, g + 0.5) / vec2(texW, texH);

  vec3 cLow = texture2D(u_lut, uvLow).rgb;
  vec3 cHigh = texture2D(u_lut, uvHigh).rgb;
  return mix(cLow, cHigh, zMix);
}

void main() {
  vec4 src = texture2D(u_image, v_uv);
  if (v_uv.x < u_splitX) {
    gl_FragColor = src;
    return;
  }

  // The whole correction is one affine transform. The matrix already
  // performs red reconstruction + white balance + stretch coherently.
  vec3 corrected = clamp(u_colorMatrix * src.rgb + u_colorOffset, 0.0, 1.0);

  // Mild optional post-tone, identity by default.
  corrected = pow(corrected, vec3(u_gamma));
  corrected = sCurve(corrected, u_contrast);

  float lum = dot(corrected, vec3(0.2126, 0.7152, 0.0722));
  corrected = mix(vec3(lum), corrected, u_saturation);

  // Optional Lightroom .cube LUT overlay
  if (u_lutMix > 0.001 && u_lutSize > 0.5) {
    vec3 graded = sampleLUT(corrected, u_lutSize);
    corrected = mix(corrected, graded, u_lutMix);
  }

  // Intensity = lerp toward the original. Equivalent to lerping (M, o)
  // toward (I, 0) — scales red reconstruction, stretch and offsets
  // together so the in-between states stay on the "natural" path.
  vec3 finalColor = mix(src.rgb, corrected, u_intensity);
  gl_FragColor = vec4(finalColor, src.a);
}
`;

export type Stats = {
  // Column-major 3x3 filter matrix + offset, in 0..1 color space.
  matrix: [number, number, number, number, number, number, number, number, number];
  offset: [number, number, number];
  // Mean of the analysis frame (0..1) — used for scene-cut detection so
  // hard cuts snap the matrix instead of EMA-crawling through wrong color.
  mean: [number, number, number];
};

export type Settings = {
  intensity: number;
  castStrength: number;
  saturation: number;
  gamma: number;
  contrast: number;
  lutMix: number;
};

export const IDENTITY_MATRIX: Stats = {
  matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  offset: [0, 0, 0],
  mean: [0.5, 0.5, 0.5],
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

export class Renderer {
  canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private aiProgram: WebGLProgram;
  private aiLocs: {
    pos: number;
    image: WebGLUniformLocation;
    gain: WebGLUniformLocation;
    bias: WebGLUniformLocation;
    splitX: WebGLUniformLocation;
  };
  private splitX = 0;
  private texture: WebGLTexture;
  private lutTexture: WebGLTexture;
  private lutSize: number = 0;
  private buffer: WebGLBuffer;
  private locs: {
    pos: number;
    image: WebGLUniformLocation;
    lut: WebGLUniformLocation;
    colorMatrix: WebGLUniformLocation;
    colorOffset: WebGLUniformLocation;
    intensity: WebGLUniformLocation;
    saturation: WebGLUniformLocation;
    gamma: WebGLUniformLocation;
    contrast: WebGLUniformLocation;
    lutSize: WebGLUniformLocation;
    lutMix: WebGLUniformLocation;
    splitX: WebGLUniformLocation;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      // savePhoto re-renders synchronously before toBlob, so we don't
      // need preserveDrawingBuffer (which costs a backbuffer copy every
      // frame on most drivers).
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Link failed: " + gl.getProgramInfoLog(prog));
    }
    this.program = prog;

    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
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
    // 1×1 placeholder so the sampler is always valid even with no LUT loaded.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    // Build the AI color-transfer program (parallel pipeline).
    const aiVs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const aiFs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_AI);
    const aiProg = gl.createProgram()!;
    gl.attachShader(aiProg, aiVs);
    gl.attachShader(aiProg, aiFs);
    gl.linkProgram(aiProg);
    if (!gl.getProgramParameter(aiProg, gl.LINK_STATUS)) {
      throw new Error("AI link failed: " + gl.getProgramInfoLog(aiProg));
    }
    this.aiProgram = aiProg;
    this.aiLocs = {
      pos: gl.getAttribLocation(aiProg, "a_pos"),
      image: gl.getUniformLocation(aiProg, "u_image")!,
      gain: gl.getUniformLocation(aiProg, "u_gain")!,
      bias: gl.getUniformLocation(aiProg, "u_bias")!,
      splitX: gl.getUniformLocation(aiProg, "u_splitX")!,
    };

    this.locs = {
      pos: gl.getAttribLocation(prog, "a_pos"),
      image: gl.getUniformLocation(prog, "u_image")!,
      lut: gl.getUniformLocation(prog, "u_lut")!,
      colorMatrix: gl.getUniformLocation(prog, "u_colorMatrix")!,
      colorOffset: gl.getUniformLocation(prog, "u_colorOffset")!,
      intensity: gl.getUniformLocation(prog, "u_intensity")!,
      saturation: gl.getUniformLocation(prog, "u_saturation")!,
      gamma: gl.getUniformLocation(prog, "u_gamma")!,
      contrast: gl.getUniformLocation(prog, "u_contrast")!,
      lutSize: gl.getUniformLocation(prog, "u_lutSize")!,
      lutMix: gl.getUniformLocation(prog, "u_lutMix")!,
      splitX: gl.getUniformLocation(prog, "u_splitX")!,
    };
  }

  setSplit(x: number) {
    // 0 = entire frame original, 1 = entire frame corrected.
    this.splitX = Math.max(0, Math.min(1, x));
  }

  uploadLUT(data: Uint8Array, size: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
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
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  render(stats: Stats, settings: Settings) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.locs.pos);
    gl.vertexAttribPointer(this.locs.pos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locs.image, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.uniform1i(this.locs.lut, 1);

    gl.uniformMatrix3fv(this.locs.colorMatrix, false, stats.matrix);
    gl.uniform3fv(this.locs.colorOffset, stats.offset);
    gl.uniform1f(this.locs.intensity, settings.intensity);
    gl.uniform1f(this.locs.saturation, settings.saturation);
    gl.uniform1f(this.locs.gamma, settings.gamma);
    gl.uniform1f(this.locs.contrast, settings.contrast);
    gl.uniform1f(this.locs.lutSize, this.lutSize);
    gl.uniform1f(this.locs.lutMix, this.lutSize > 0 ? settings.lutMix : 0);
    gl.uniform1f(this.locs.splitX, this.splitX);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // AI-mode render: applies a per-channel linear remap (gain * src + bias)
  // computed from a recent FUnIE inference. Decouples model FPS from render
  // FPS — model can run at 5–10 fps while render stays at native source fps.
  renderAi(gain: [number, number, number], bias: [number, number, number]) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.aiProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.aiLocs.pos);
    gl.vertexAttribPointer(this.aiLocs.pos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.aiLocs.image, 0);

    gl.uniform3fv(this.aiLocs.gain, gain);
    gl.uniform3fv(this.aiLocs.bias, bias);
    gl.uniform1f(this.aiLocs.splitX, this.splitX);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// ---------------------------------------------------------------------------
// Filter-matrix derivation (CPU, on a 256×256 downscale).
// Constants from the reference implementations.
const ANALYSIS_SIZE = 256;
const THRESHOLD_RATIO = 2000; // sparse-bin threshold = numPixels / 2000
const MAX_HUE_SHIFT = 120; // degrees
const BLUE_MAGIC_VALUE = 1.2; // extra blue→red weight
const MIN_GAP = 32; // hardening: stretch interval ≥ 32/256 → gain ≤ 8
const MAX_CHANNEL_GAIN = 8;
const MIN_CHANNEL_GAIN = 0.5;

// Red-row coefficients of the standard YUV hue-rotation matrix. At h=0
// this returns (1, 0, 0) — identity. As h grows, green and blue feed
// into the reconstructed red.
function hueShiftRed(h: number): [number, number, number] {
  const U = Math.cos((h * Math.PI) / 180);
  const W = Math.sin((h * Math.PI) / 180);
  return [
    0.299 + 0.701 * U + 0.168 * W,
    0.587 - 0.587 * U + 0.33 * W,
    0.114 - 0.114 * U - 0.497 * W,
  ];
}

// Per-channel robust stretch: instead of fixed percentiles, find the
// LARGEST gap between sparsely-populated histogram bins and stretch the
// dense interval between. Immune to large dark-water or sun-ball regions
// that wreck percentile cutoffs.
function denseInterval(hist: Uint32Array, sparseThresh: number): [number, number] {
  let bestLow = 0;
  let bestHigh = 255;
  let bestSpan = -1;
  let prevSparse = 0;
  for (let i = 1; i < 256; i++) {
    const isSparse = i === 255 || hist[i] < sparseThresh;
    if (isSparse) {
      const span = i - prevSparse;
      if (span > bestSpan) {
        bestSpan = span;
        bestLow = prevSparse;
        bestHigh = i;
      }
      prevSparse = i;
    }
  }
  return [bestLow, bestHigh];
}

// castStrength 0..1 → target mean red 40..90 (0–255 scale). 0.4 lands on
// the canonical MIN_AVG_RED = 60 from the reference implementations.
export function computeStats(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  castStrength: number,
): Stats {
  void srcWidth;
  void srcHeight;
  const minAvgRed = 40 + Math.max(0, Math.min(1, castStrength)) * 50;

  const c = scratchCanvas();
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const data = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE).data;
  const total = ANALYSIS_SIZE * ANALYSIS_SIZE;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }
  const avgR = sumR / total;
  const avgG = sumG / total;
  const avgB = sumB / total;

  // Depth-adaptive search: smallest hue shift that restores average red
  // to the target. Shallow water exits at h=0 (identity).
  let h = 0;
  let coef = hueShiftRed(0);
  while (h <= MAX_HUE_SHIFT) {
    coef = hueShiftRed(h);
    const newR = coef[0] * avgR + coef[1] * avgG + coef[2] * avgB;
    if (newR >= minAvgRed) break;
    h += 1;
  }
  const [a, b, cb] = coef;

  // Histograms: R from the reconstructed red, G and B raw.
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const rNew = a * data[i] + b * data[i + 1] + cb * data[i + 2];
    histR[Math.max(0, Math.min(255, rNew | 0))]++;
    histG[data[i + 1]]++;
    histB[data[i + 2]]++;
  }

  const sparseThresh = total / THRESHOLD_RATIO;
  const gains: number[] = [];
  const offsets: number[] = [];
  for (const hist of [histR, histG, histB]) {
    let [low, high] = denseInterval(hist, sparseThresh);
    if (high - low < MIN_GAP) {
      // Degenerate histogram (near-uniform frame) — widen around center.
      const center = (low + high) / 2;
      low = Math.max(0, Math.round(center - MIN_GAP / 2));
      high = Math.min(255, low + MIN_GAP);
    }
    let gain = 256 / (high - low);
    gain = Math.max(MIN_CHANNEL_GAIN, Math.min(MAX_CHANNEL_GAIN, gain));
    gains.push(gain);
    offsets.push((-low / 256) * gain);
  }

  // Assemble the matrix. Only the red row has cross-channel terms —
  // exactly why output stays natural while red returns. Column-major
  // for uniformMatrix3fv.
  const [gainR, gainG, gainB] = gains;
  return {
    matrix: [
      a * gainR, 0, 0,
      b * gainR, gainG, 0,
      cb * gainR * BLUE_MAGIC_VALUE, 0, gainB,
    ],
    offset: [offsets[0], offsets[1], offsets[2]],
    mean: [avgR / 255, avgG / 255, avgB / 255],
  };
}

let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(): HTMLCanvasElement {
  if (!scratch) {
    scratch = document.createElement("canvas");
    scratch.width = ANALYSIS_SIZE;
    scratch.height = ANALYSIS_SIZE;
  }
  return scratch;
}

// Element-wise lerp of two stats. Lerping the matrix coefficients is
// well-behaved (the reference video implementation interpolates keyframe
// matrices exactly this way) and is the entire flicker solution.
export function lerpStats(p: Stats, q: Stats, t: number): Stats {
  const mix = (x: number, y: number) => x * (1 - t) + y * t;
  return {
    matrix: p.matrix.map((v, i) => mix(v, q.matrix[i])) as Stats["matrix"],
    offset: [
      mix(p.offset[0], q.offset[0]),
      mix(p.offset[1], q.offset[1]),
      mix(p.offset[2], q.offset[2]),
    ],
    mean: [
      mix(p.mean[0], q.mean[0]),
      mix(p.mean[1], q.mean[1]),
      mix(p.mean[2], q.mean[2]),
    ],
  };
}

// Hard scene cut detection: when the average color jumps, snap the
// matrix instead of EMA-crawling through several seconds of wrong color.
export function isSceneCut(p: Stats, q: Stats): boolean {
  const d =
    Math.abs(p.mean[0] - q.mean[0]) +
    Math.abs(p.mean[1] - q.mean[1]) +
    Math.abs(p.mean[2] - q.mean[2]);
  return d > 40 / 255;
}
