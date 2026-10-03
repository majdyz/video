import { DATA_SLOTS, UNIFORM_FLOATS, isVideoFrame, uprightSize, type DataTextureSpec, type GpuBackend, type Rotation, type SourceInput } from "./backend.ts";
import { GLSL_FRAGMENT, GLSL_DOWNSCALE_FRAGMENT } from "./shaders.ts";

const VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = vec2(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
}`;

type Program = { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> };

export class WebGL2Backend implements GpuBackend {
  readonly kind = "webgl2";
  readonly canvas: HTMLCanvasElement;
  outputWidth = 0;
  outputHeight = 0;
  private readonly gl: WebGL2RenderingContext;
  private readonly grade: Program;
  private readonly down: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly source: WebGLTexture;
  private readonly data: WebGLTexture[] = [];
  private readonly uniformBuf: WebGLBuffer;
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);
  private rotation: Rotation = 0;
  private srcW = 0;
  private srcH = 0;
  private analysisFbo: WebGLFramebuffer | null = null;
  private analysisTex: WebGLTexture | null = null;
  private analysisW = 0;
  private analysisH = 0;
  private pbo: WebGLBuffer | null = null;
  private readbackInFlight = false;
  private previewScale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      // The export path wraps the canvas in a VideoFrame right after draw;
      // keeping the buffer also makes toBlob/screenshots reliable.
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    gl.getExtension("EXT_color_buffer_float");
    this.grade = this.link(VS, GLSL_FRAGMENT, ["u_source", "u_data0", "u_data1", "u_data2"]);
    this.down = this.link(VS, GLSL_DOWNSCALE_FRAGMENT, ["u_source", "u_rotation", "u_srcSize", "u_outSize"]);
    this.vao = gl.createVertexArray()!;
    this.source = this.makeTexture(gl.LINEAR);
    for (let i = 0; i < DATA_SLOTS; i++) {
      const t = this.makeTexture(gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array([0, 0, 0, 0]));
      this.data.push(t);
    }
    this.uniformBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
    gl.bufferData(gl.UNIFORM_BUFFER, this.uniforms.byteLength, gl.DYNAMIC_DRAW);
    const blockIndex = gl.getUniformBlockIndex(this.grade.prog, "Params");
    gl.uniformBlockBinding(this.grade.prog, blockIndex, 0);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.uniformBuf);
  }

  private makeTexture(filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    return t;
  }

  private link(vs: string, fs: string, names: string[]): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("Shader compile failed: " + log);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("Link failed: " + gl.getProgramInfoLog(prog));
    const loc = new Map<string, WebGLUniformLocation | null>();
    for (const n of names) loc.set(n, gl.getUniformLocation(prog, n));
    return { prog, loc };
  }

  upload(src: SourceInput, width: number, height: number, rotation: Rotation): void {
    const gl = this.gl;
    this.rotation = rotation;
    const [ow, oh] = uprightSize(width, height, rotation);
    this.outputWidth = ow;
    this.outputHeight = oh;
    this.sizeCanvas(this.previewScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (width !== this.srcW || height !== this.srcH) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
      this.srcW = width;
      this.srcH = height;
    } else {
      // Same size as last upload: texSubImage2D re-uses the GPU storage.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    }
    void isVideoFrame;
  }

  setPreviewScale(scale: number): void {
    this.previewScale = Math.min(1, Math.max(0.05, scale));
    if (this.outputWidth) this.sizeCanvas(this.previewScale);
  }

  private sizeCanvas(scale: number): void {
    const w = Math.max(1, Math.round(this.outputWidth * scale));
    const h = Math.max(1, Math.round(this.outputHeight * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setUniforms(block: Float32Array): void {
    if (block.length !== UNIFORM_FLOATS) throw new Error(`uniform block must have ${UNIFORM_FLOATS} floats`);
    this.uniforms.set(block);
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uniforms);
  }

  setData(slot: number, spec: DataTextureSpec): void {
    const gl = this.gl;
    if (spec.data.length !== spec.width * spec.height * 4) throw new Error("data texture size mismatch");
    gl.activeTexture(gl.TEXTURE1 + slot);
    gl.bindTexture(gl.TEXTURE_2D, this.data[slot]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, spec.width, spec.height, 0, gl.RGBA, gl.FLOAT, spec.data);
  }

  private bindCommon(p: Program) {
    const gl = this.gl;
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.uniform1i(p.loc.get("u_source")!, 0);
  }

  render(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.bindCommon(this.grade);
    for (let i = 0; i < DATA_SLOTS; i++) {
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.data[i]);
      gl.uniform1i(this.grade.loc.get(`u_data${i}`)!, 1 + i);
    }
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.uniformBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  async renderToFrame(timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    // Exports render at full size: the canvas is the only render surface
    // this context can hand to a VideoFrame, so it is sized up for the
    // duration (callers set the preview scale to 1 around an export).
    this.sizeCanvas(1);
    this.render();
    return new VideoFrame(this.canvas, { timestamp: timestampUs, duration: durationUs });
  }

  private ensureAnalysisTargets(w: number, h: number) {
    const gl = this.gl;
    if (this.analysisTex && this.analysisW === w && this.analysisH === h) return;
    if (this.analysisTex) gl.deleteTexture(this.analysisTex);
    if (this.analysisFbo) gl.deleteFramebuffer(this.analysisFbo);
    if (this.pbo) gl.deleteBuffer(this.pbo);
    this.analysisTex = this.makeTexture(gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, this.analysisTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.analysisFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.analysisFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.analysisTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.pbo = gl.createBuffer()!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.analysisW = w;
    this.analysisH = h;
  }

  async analyze(width: number, height: number): Promise<Uint8ClampedArray> {
    const gl = this.gl;
    if (this.readbackInFlight) throw new Error("analysis readback already in flight");
    this.readbackInFlight = true;
    try {
      this.ensureAnalysisTargets(width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.analysisFbo);
      gl.viewport(0, 0, width, height);
      this.bindCommon(this.down);
      gl.uniform1i(this.down.loc.get("u_rotation")!, this.rotation);
      gl.uniform2f(this.down.loc.get("u_srcSize")!, this.srcW, this.srcH);
      gl.uniform2f(this.down.loc.get("u_outSize")!, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Async readback: readPixels into a PBO, wait on a fence, then copy.
      // A direct readPixels would stall the pipeline on every analysis tick.
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
      gl.flush();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      await new Promise<void>((resolve, reject) => {
        let tries = 0;
        const poll = () => {
          const status = gl.clientWaitSync(sync, 0, 0);
          if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return resolve();
          if (status === gl.WAIT_FAILED || ++tries > 5000) return reject(new Error("GPU readback timed out"));
          setTimeout(poll, 2);
        };
        poll();
      });
      gl.deleteSync(sync);
      const out = new Uint8ClampedArray(width * height * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      return out;
    } finally {
      this.readbackInFlight = false;
    }
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.grade.prog);
    gl.deleteProgram(this.down.prog);
    gl.deleteTexture(this.source);
    for (const t of this.data) gl.deleteTexture(t);
    gl.deleteBuffer(this.uniformBuf);
    if (this.analysisTex) gl.deleteTexture(this.analysisTex);
    if (this.analysisFbo) gl.deleteFramebuffer(this.analysisFbo);
    if (this.pbo) gl.deleteBuffer(this.pbo);
  }
}
