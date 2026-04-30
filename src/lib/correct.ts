const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform sampler2D u_image;
uniform vec3 u_mean;
uniform vec3 u_wbGain;
uniform vec3 u_min;
uniform vec3 u_max;
uniform float u_alpha;
uniform float u_intensity;
uniform float u_redBoost;
uniform float u_saturation;
uniform float u_gamma;
uniform float u_contrast;
varying vec2 v_uv;

vec3 sCurve(vec3 c, float k) {
  vec3 s = c * c * (3.0 - 2.0 * c);
  return mix(c, s, k);
}

void main() {
  vec4 src = texture2D(u_image, v_uv);
  vec3 c = src.rgb;

  // Ancuti channel compensation: lift weak channels using the green channel
  // (preserves naturalness vs. blind histogram stretch)
  float redComp = max(0.0, u_mean.g - u_mean.r);
  float blueComp = max(0.0, u_mean.g - u_mean.b);
  vec3 comp = c;
  comp.r = c.r + u_alpha * redComp * (1.0 - c.r) * c.g;
  comp.b = c.b + u_alpha * blueComp * (1.0 - c.b) * c.g;

  // Gray-world white balance (gains derived from compensated means CPU-side)
  vec3 wb = comp * u_wbGain;

  // Robust per-channel stretch from post-WB percentiles
  vec3 stretched = clamp((wb - u_min) / max(u_max - u_min, vec3(1e-3)), 0.0, 1.0);

  // Tone: gamma + S-curve in linearised space
  vec3 toned = pow(stretched, vec3(u_gamma));
  toned = sCurve(toned, u_contrast);

  // Optional manual red push (user override)
  float extra = max(0.0, (toned.b + toned.g) * 0.5 - toned.r);
  toned.r = clamp(toned.r + u_redBoost * extra, 0.0, 1.0);

  // Saturation around BT.709 luminance
  float lum = dot(toned, vec3(0.2126, 0.7152, 0.0722));
  toned = mix(vec3(lum), toned, u_saturation);

  // Blend with original
  vec3 finalColor = mix(src.rgb, toned, u_intensity);
  gl_FragColor = vec4(finalColor, src.a);
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
  redBoost: number;
  saturation: number;
  gamma: number;
  contrast: number;
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
  private texture: WebGLTexture;
  private buffer: WebGLBuffer;
  private locs: {
    pos: number;
    image: WebGLUniformLocation;
    mean: WebGLUniformLocation;
    wbGain: WebGLUniformLocation;
    min: WebGLUniformLocation;
    max: WebGLUniformLocation;
    alpha: WebGLUniformLocation;
    intensity: WebGLUniformLocation;
    redBoost: WebGLUniformLocation;
    saturation: WebGLUniformLocation;
    gamma: WebGLUniformLocation;
    contrast: WebGLUniformLocation;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
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

    this.locs = {
      pos: gl.getAttribLocation(prog, "a_pos"),
      image: gl.getUniformLocation(prog, "u_image")!,
      mean: gl.getUniformLocation(prog, "u_mean")!,
      wbGain: gl.getUniformLocation(prog, "u_wbGain")!,
      min: gl.getUniformLocation(prog, "u_min")!,
      max: gl.getUniformLocation(prog, "u_max")!,
      alpha: gl.getUniformLocation(prog, "u_alpha")!,
      intensity: gl.getUniformLocation(prog, "u_intensity")!,
      redBoost: gl.getUniformLocation(prog, "u_redBoost")!,
      saturation: gl.getUniformLocation(prog, "u_saturation")!,
      gamma: gl.getUniformLocation(prog, "u_gamma")!,
      contrast: gl.getUniformLocation(prog, "u_contrast")!,
    };
  }

  uploadSource(source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
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
    gl.uniform3fv(this.locs.mean, stats.mean);
    gl.uniform3fv(this.locs.wbGain, stats.wbGain);
    gl.uniform3fv(this.locs.min, stats.min);
    gl.uniform3fv(this.locs.max, stats.max);
    gl.uniform1f(this.locs.alpha, stats.alpha);
    gl.uniform1f(this.locs.intensity, settings.intensity);
    gl.uniform1f(this.locs.redBoost, settings.redBoost);
    gl.uniform1f(this.locs.saturation, settings.saturation);
    gl.uniform1f(this.locs.gamma, settings.gamma);
    gl.uniform1f(this.locs.contrast, settings.contrast);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

const ALPHA = 1.0;

export function computeStats(source: CanvasImageSource, srcWidth: number, srcHeight: number): Stats {
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

  let sumR2 = 0;
  let sumB2 = 0;
  const compR = new Float32Array(total);
  const compB = new Float32Array(total);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const r2 = r + ALPHA * redCompTerm * (1 - r) * g;
    const b2 = b + ALPHA * blueCompTerm * (1 - b) * g;
    compR[p] = r2;
    compB[p] = b2;
    sumR2 += r2;
    sumB2 += b2;
  }
  const meanR2 = sumR2 / total;
  const meanB2 = sumB2 / total;

  const gainR = meanR2 > 0.01 ? meanG / meanR2 : 1;
  const gainB = meanB2 > 0.01 ? meanG / meanB2 : 1;
  const gainG = 1;

  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = compR[p] * gainR;
    const g = (data[i + 1] / 255) * gainG;
    const b = compB[p] * gainB;
    histR[clamp255(Math.round(r * 255))]++;
    histG[clamp255(Math.round(g * 255))]++;
    histB[clamp255(Math.round(b * 255))]++;
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

  return {
    mean: [meanR, meanG, meanB],
    wbGain: [gainR, gainG, gainB],
    min: [findCut(histR, lowFrac) / 255, findCut(histG, lowFrac) / 255, findCut(histB, lowFrac) / 255],
    max: [findCut(histR, highFrac) / 255, findCut(histG, highFrac) / 255, findCut(histB, highFrac) / 255],
    alpha: ALPHA,
  };
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
