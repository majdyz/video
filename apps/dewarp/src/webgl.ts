import type { WarpUniforms } from "./fisheye";

const VS = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  uv = vec2(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
}`;

// Same arithmetic as warp-shader.ts, in GLSL.
const FS = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 srcSize;
uniform float fFish;
uniform float fOut;
uniform vec4 k;
uniform float strength;
uniform float zoom;
uniform float projection;
uniform float fy;
uniform vec2 center;
uniform float thetaMax;
in vec2 uv;
out vec4 color;
void main() {
  vec2 c = srcSize * 0.5;
  vec2 p = (uv * srcSize - c) / zoom;
  float r = length(p);
  if (r < 0.5) { color = texture(src, mix(c, center, strength) / srcSize); return; }
  float theta0 = projection > 0.5 ? 2.0 * atan(r / (2.0 * fOut)) : atan(r / fOut);
  float theta = min(theta0, thetaMax);
  float t2 = theta * theta;
  float thetaD = theta * (1.0 + t2 * (k.x + t2 * (k.y + t2 * (k.z + t2 * k.w))));
  vec2 fish = center + p / r * vec2(fFish, fy) * thetaD;
  vec2 s = mix(c + p, fish, strength);
  vec2 suv = s / srcSize;
  if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) { color = vec4(0.0, 0.0, 0.0, 1.0); return; }
  color = texture(src, suv);
}`;

/** The same warp on a WebGL2 canvas: a second rendering surface, since browsers capture the two into VideoFrames at very different speeds. */
export class GlWarper {
  readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly loc: Record<"srcSize" | "fFish" | "fOut" | "k" | "strength" | "zoom" | "projection" | "fy" | "center" | "thetaMax", WebGLUniformLocation | null>;

  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
    const gl = this.canvas.getContext("webgl2", { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`GLSL: ${gl.getShaderInfoLog(sh)}`);
      return sh;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`GLSL link: ${gl.getProgramInfoLog(program)}`);
    this.program = program;
    gl.useProgram(program);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "src"), 0);
    this.loc = {
      srcSize: gl.getUniformLocation(program, "srcSize"),
      fFish: gl.getUniformLocation(program, "fFish"),
      fOut: gl.getUniformLocation(program, "fOut"),
      k: gl.getUniformLocation(program, "k"),
      fy: gl.getUniformLocation(program, "fy"),
      center: gl.getUniformLocation(program, "center"),
      thetaMax: gl.getUniformLocation(program, "thetaMax"),
      strength: gl.getUniformLocation(program, "strength"),
      zoom: gl.getUniformLocation(program, "zoom"),
      projection: gl.getUniformLocation(program, "projection"),
    };
    gl.viewport(0, 0, width, height);
  }

  /** Uploads the frame as a texture and draws the warp into the canvas. */
  render(source: VideoFrame | HTMLVideoElement, u: WarpUniforms): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform2f(this.loc.srcSize, u.srcSize[0], u.srcSize[1]);
    gl.uniform1f(this.loc.fFish, u.fFish);
    gl.uniform1f(this.loc.fOut, u.fOut);
    gl.uniform4f(this.loc.k, u.k[0], u.k[1], u.k[2], u.k[3]);
    gl.uniform1f(this.loc.fy, u.fy);
    gl.uniform2f(this.loc.center, u.center[0], u.center[1]);
    gl.uniform1f(this.loc.thetaMax, u.thetaMax);
    gl.uniform1f(this.loc.strength, u.strength);
    gl.uniform1f(this.loc.zoom, u.zoom);
    gl.uniform1f(this.loc.projection, u.projection);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
