// Geometry stage: stabilise (mesh UVs) and dewarp (per fragment) in ONE
// WebGL2 pass, drawn into a canvas that is either shown directly (colour
// off) or handed to the colour engine as its source (colour on). With the
// colour engine on WebGL2 a second renderer lives in the engine's own GL
// context and draws straight into its source (GeometryRenderer.inContext):
// no canvas, no copy between contexts.
// The maths is geometry-math.ts; keep the two in step.

import type { WarpUniforms } from "../../../dewarp/src/fisheye.ts";
import { stabilisedPoint, type GeometryParams, type QuarterTurns } from "./geometry-math.ts";
import { FOOTAGE_GLSL } from "./footage.ts";

const GRID_W = 32;
const GRID_H = 18;
const VW = GRID_W + 1;
const VH = GRID_H + 1;

const VS = `#version 300 es
in vec2 a_pos;
in vec2 a_mid;
in vec2 a_id;
out vec2 v_mid;
out vec2 v_id;
void main() {
  v_mid = a_mid;
  v_id = a_id;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform int u_rot;          // clockwise quarter turns coded -> display
uniform bool u_texCoded;    // texture stored in coded orientation (VideoFrame) vs display (<video>)
uniform float u_split;      // < 0: off; else fraction of the width showing the untouched source
uniform bool u_dewarp;
uniform vec2 srcSize;       // coded size (px) the dewarp uniforms were built for
uniform float fFish;
uniform float fOut;
uniform vec4 k;
uniform float strength;
uniform float zoom;
uniform float projection;
uniform float fy;
uniform vec2 center;
uniform float thetaMax;
${FOOTAGE_GLSL}
in vec2 v_mid;
in vec2 v_id;
out vec4 color;

vec2 displayToCoded(vec2 d) {
  if (u_rot == 1) return vec2(d.y, 1.0 - d.x);
  if (u_rot == 2) return 1.0 - d;
  if (u_rot == 3) return vec2(1.0 - d.y, d.x);
  return d;
}
vec2 codedToDisplay(vec2 c) {
  if (u_rot == 1) return vec2(1.0 - c.y, c.x);
  if (u_rot == 2) return 1.0 - c;
  if (u_rot == 3) return vec2(c.y, 1.0 - c.x);
  return c;
}
// Rectilinear output pixel -> fisheye source pixel (apps/dewarp/src/fisheye.ts samplePoint).
vec2 dewarp(vec2 outPx) {
  vec2 c = srcSize * 0.5;
  vec2 p = (outPx - c) / zoom;
  float r = length(p);
  if (r < 0.5) return mix(c, center, strength);
  float theta0 = projection > 0.5 ? 2.0 * atan(r / (2.0 * fOut)) : atan(r / fOut);
  float theta = min(theta0, thetaMax);
  float t2 = theta * theta;
  float td = theta * (1.0 + t2 * (k.x + t2 * (k.y + t2 * (k.z + t2 * k.w))));
  vec2 fish = center + p / r * vec2(fFish, fy) * td;
  return mix(c + p, fish, strength);
}
void main() {
  bool before = u_split >= 0.0 && v_id.x < u_split;
  vec2 c = displayToCoded(before ? v_id : v_mid);
  if (u_dewarp && !before) c = dewarp(c * srcSize) / srcSize;
  if (c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0) { color = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec4 s = texture(u_tex, u_texCoded ? c : codedToDisplay(c));
  // Footage profile (log / HDR / wide gamut → Rec.709 SDR); the "before" side stays the untouched signal.
  color = vec4(before ? clamp(s.rgb, 0.0, 1.0) : footageToSdr(s.rgb), 1.0);
}`;

export type GeometrySource = HTMLVideoElement | VideoFrame | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

export type GeometryRenderOptions = {
  /** Source stored in coded orientation (decoded VideoFrames) vs upright (<video>, stills). */
  texCoded: boolean;
  split: number | null;
  /** Footage transform (FOOTAGE_MODE in footage.ts); 0 / omitted = none. */
  footage?: number;
  /** Upload into a half-float texture so a 10-bit source keeps its precision through the transform. */
  highPrecision?: boolean;
};

type Loc = Record<string, WebGLUniformLocation | null>;

export class GeometryRenderer {
  /** The canvas drawn into; null for a renderer in another stage's context (inContext), which draws into the bound framebuffer. */
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly shared: boolean;
  private w = 2;
  private h = 2;
  /** Export profiling (?profile=sync): wait for the GPU after each render so its time is the geometry stage's. */
  syncProfile = false;
  private syncPx = new Uint8Array(4);
  private readonly prog: WebGLProgram;
  private readonly tex: WebGLTexture;
  private readonly midBuf: WebGLBuffer;
  private readonly mid = new Float32Array(VW * VH * 2);
  private readonly loc: Loc;
  private readonly vao: WebGLVertexArrayObject;
  /** Half-float uploads failed once on this device: stay on 8-bit. */
  private floatBroken = false;

  /**
   * A renderer in an existing WebGL2 context (the colour engine's): it draws
   * into whatever framebuffer is bound and leaves the context's canvas alone.
   */
  static inContext(gl: WebGL2RenderingContext): GeometryRenderer {
    return new GeometryRenderer(gl);
  }

  constructor(target: HTMLCanvasElement | WebGL2RenderingContext) {
    let gl: WebGL2RenderingContext | null;
    if (target instanceof HTMLCanvasElement) {
      this.canvas = target;
      this.shared = false;
      gl = target.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    } else {
      gl = target;
      this.canvas = target.canvas as HTMLCanvasElement;
      this.shared = true;
    }
    if (!gl) throw new Error("WebGL2 is not available on this device");
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("geometry shader: " + gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("geometry link: " + gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    const names = ["u_tex", "u_rot", "u_texCoded", "u_split", "u_dewarp", "srcSize", "fFish", "fOut", "k", "strength", "zoom", "projection", "fy", "center", "thetaMax", "u_footage"];
    this.loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const pos = new Float32Array(VW * VH * 2);
    const id = new Float32Array(VW * VH * 2);
    for (let vy = 0, i = 0; vy < VH; vy++) {
      for (let vx = 0; vx < VW; vx++, i += 2) {
        pos[i] = (vx / GRID_W) * 2 - 1;
        pos[i + 1] = 1 - (vy / GRID_H) * 2;
        id[i] = vx / GRID_W;
        id[i + 1] = vy / GRID_H;
      }
    }
    const attr = (name: string, data: Float32Array, usage: number) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      const l = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
      return b;
    };
    attr("a_pos", pos, gl.STATIC_DRAW);
    attr("a_id", id, gl.STATIC_DRAW);
    this.midBuf = attr("a_mid", this.mid, gl.DYNAMIC_DRAW);
    const idx = new Uint16Array(GRID_W * GRID_H * 6);
    for (let cy = 0, i = 0; cy < GRID_H; cy++) {
      for (let cx = 0; cx < GRID_W; cx++) {
        const v00 = cy * VW + cx, v10 = v00 + 1, v01 = v00 + VW, v11 = v01 + 1;
        idx.set([v00, v11, v10, v00, v01, v11], i);
        i += 6;
      }
    }
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /** Output size; a renderer in another context draws that size into the bound framebuffer (its canvas is not touched). */
  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width)), h = Math.max(2, Math.round(height));
    this.w = w;
    this.h = h;
    if (this.shared) return;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  /** Output size in pixels (the last resize). */
  get width(): number {
    return this.shared ? this.w : this.canvas.width;
  }
  get height(): number {
    return this.shared ? this.h : this.canvas.height;
  }

  /**
   * Draws `src` through the geometry. `texCoded` says the source is stored in
   * coded orientation (decoded VideoFrames); the <video> element and stills
   * grabbed from it are already upright.
   */
  render(src: GeometrySource, p: GeometryParams, opts: GeometryRenderOptions): void {
    const gl = this.gl;
    for (let vy = 0, i = 0; vy < VH; vy++) {
      for (let vx = 0; vx < VW; vx++, i += 2) {
        const [mx, my] = stabilisedPoint(vx / GRID_W, vy / GRID_H, p);
        this.mid[i] = mx;
        this.mid[i + 1] = my;
      }
    }
    // Unit 0 explicitly: in a shared context another stage may have left a different unit active.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // This context's own defaults, whatever the stage sharing it set (the colour engine uploads with NONE).
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (opts.highPrecision && !this.floatBroken) {
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, src as TexImageSource);
      const err = gl.getError();
      if (err !== gl.NO_ERROR) {
        console.warn(`geometry: half-float upload failed (0x${err.toString(16)}), using 8-bit`);
        this.floatBroken = true;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
      }
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    }
    if (this.shared) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.midBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.mid);
    const L = this.loc;
    gl.uniform1i(L.u_tex, 0);
    gl.uniform1i(L.u_rot, p.rot as QuarterTurns);
    gl.uniform1i(L.u_texCoded, opts.texCoded ? 1 : 0);
    gl.uniform1f(L.u_split, opts.split === null ? -1 : opts.split);
    const d: WarpUniforms | null = p.dewarp;
    gl.uniform1i(L.u_dewarp, d ? 1 : 0);
    gl.uniform1i(L.u_footage, opts.footage ?? 0);
    if (d) {
      gl.uniform2f(L.srcSize, d.srcSize[0], d.srcSize[1]);
      gl.uniform1f(L.fFish, d.fFish);
      gl.uniform1f(L.fOut, d.fOut);
      gl.uniform4f(L.k, d.k[0], d.k[1], d.k[2], d.k[3]);
      gl.uniform1f(L.strength, d.strength);
      gl.uniform1f(L.zoom, d.zoom);
      gl.uniform1f(L.projection, d.projection);
      gl.uniform1f(L.fy, d.fy);
      gl.uniform2f(L.center, d.center[0], d.center[1]);
      gl.uniform1f(L.thetaMax, d.thetaMax);
    }
    gl.drawElements(gl.TRIANGLES, GRID_W * GRID_H * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    if (this.syncProfile && !this.shared) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.syncPx);
  }

  /**
   * Uploads `src` exactly as `render` does (half-float, no footage transform,
   * no geometry) and reads back RGB at normalised points of the source:
   * the signal-calibration probe (signal-probe.ts). Leaves the canvas at the
   * source size; the next render resizes it.
   */
  sample(src: GeometrySource, w: number, h: number, texCoded: boolean, points: [number, number][]): number[][] {
    const gl = this.gl;
    if (this.shared) throw new Error("geometry: sample() needs the renderer's own canvas");
    this.resize(w, h);
    const identity: GeometryParams = { rot: 0, displayW: w, displayH: h, stab: null, dewarp: null };
    this.render(src, identity, { texCoded, split: null, footage: 0, highPrecision: true });
    const px = new Uint8Array(4);
    return points.map(([x, y]) => {
      // Canvas row 0 is the bottom; the picture's y runs down.
      gl.readPixels(Math.min(w - 1, Math.floor(x * w)), Math.min(h - 1, Math.floor((1 - y) * h)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0] / 255, px[1] / 255, px[2] / 255];
    });
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.prog);
  }
}
