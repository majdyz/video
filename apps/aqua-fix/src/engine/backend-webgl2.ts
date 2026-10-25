import { DATA_SLOTS, UNIFORM_FLOATS, isVideoFrame, uprightSize, type DataTextureSpec, type GpuBackend, type Rotation, type SourceInput, FULL_RECT, type Rect } from "./backend.ts";
import { GLSL_FRAGMENT, GLSL_DOWNSCALE_FRAGMENT } from "./shaders.ts";
import { GLSL_TP_FIELD, GLSL_TP_FLOW, GLSL_TP_LUM } from "./temporal.ts";
import { TEMPORAL } from "./params.ts";

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
  lastDrawMs = 0;
  lastCaptureMs = 0;
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
  private srcKind = "";
  private viaCanvas = false;
  private scratch: OffscreenCanvas | null = null;
  private analysisFbo: WebGLFramebuffer | null = null;
  private analysisTex: WebGLTexture | null = null;
  private analysisW = 0;
  private analysisH = 0;
  private pbo: WebGLBuffer | null = null;
  private readbackInFlight = false;
  private previewScale = 1;
  // Temporal layer (temporal.ts): 1/8-resolution lum / flow / field passes
  // and a full-resolution previous-output texture, ping-ponged per frame.
  private tpOn = false;
  private tpValid = false;
  private tpLum!: Program;
  private tpFlow!: Program;
  private tpField!: Program;
  private tpLowW = 0;
  private tpLowH = 0;
  private tpOutW = 0;
  private tpOutH = 0;
  private tpIdx = 0;
  private tpTex: { lum: WebGLTexture[]; f0: WebGLTexture[]; f1: WebGLTexture; flow: WebGLTexture; out: WebGLTexture[] } | null = null;
  private tpFbo: { lum: WebGLFramebuffer[]; field: WebGLFramebuffer[]; flow: WebGLFramebuffer; out: WebGLFramebuffer[] } | null = null;

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
    const floatTargets = !!gl.getExtension("EXT_color_buffer_float");
    this.grade = this.link(VS, GLSL_FRAGMENT, ["u_source", "u_data0", "u_data1", "u_data2", "u_tpF0", "u_tpF1", "u_tpFlow", "u_tpPrev"]);
    this.down = this.link(VS, GLSL_DOWNSCALE_FRAGMENT, ["u_source", "u_rotation", "u_srcSize", "u_outSize", "u_rect"]);
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
    // The temporal layer needs half-float render targets; without them the
    // grade runs as before (history never valid).
    if (floatTargets) {
      try {
        this.tpLum = this.link(VS, GLSL_TP_LUM, ["u_source"]);
        this.tpFlow = this.link(VS, GLSL_TP_FLOW, ["u_lum", "u_lumPrev"]);
        this.tpField = this.link(VS, GLSL_TP_FIELD, ["u_data0", "u_data1", "u_data2", "u_lum", "u_flow", "u_histf"]);
        for (const p of [this.tpLum, this.tpField]) gl.uniformBlockBinding(p.prog, gl.getUniformBlockIndex(p.prog, "Params"), 0);
        this.tpOn = true;
      } catch (e) {
        console.warn("temporal layer unavailable:", (e as Error).message);
      }
    }
  }

  /** Forgets the temporal history (scene cut, seek, new clip). */
  resetTemporal(): void {
    this.tpValid = false;
  }

  private tpTarget(w: number, h: number, fmt: "half" | "rgba8"): WebGLTexture {
    const gl = this.gl;
    const t = this.makeTexture(gl.LINEAR);
    if (fmt === "half") gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  private tpFramebuffer(...tex: WebGLTexture[]): WebGLFramebuffer {
    const gl = this.gl;
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    tex.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fb;
  }

  private tpRelease(): void {
    const gl = this.gl;
    if (this.tpTex) {
      const t = this.tpTex;
      for (const x of [...t.lum, ...t.f0, t.f1, t.flow, ...t.out]) gl.deleteTexture(x);
    }
    if (this.tpFbo) {
      const f = this.tpFbo;
      for (const x of [...f.lum, ...f.field, f.flow, ...f.out]) gl.deleteFramebuffer(x);
    }
    this.tpTex = null;
    this.tpFbo = null;
  }

  /** (Re)creates the temporal targets for the current sizes; false when the layer is off. */
  private tpEnsure(): boolean {
    if (!this.tpOn || !this.outputWidth) return false;
    const lw = Math.max(1, Math.ceil(this.outputWidth / TEMPORAL.scale)), lh = Math.max(1, Math.ceil(this.outputHeight / TEMPORAL.scale));
    const ow = this.canvas.width, oh = this.canvas.height;
    if (this.tpTex && lw === this.tpLowW && lh === this.tpLowH && ow === this.tpOutW && oh === this.tpOutH) return true;
    this.tpRelease();
    const half = (w: number, h: number) => this.tpTarget(w, h, "half");
    const tex = { lum: [half(lw, lh), half(lw, lh)], f0: [half(lw, lh), half(lw, lh)], f1: half(lw, lh), flow: half(lw, lh), out: [this.tpTarget(ow, oh, "rgba8"), this.tpTarget(ow, oh, "rgba8")] };
    this.tpTex = tex;
    this.tpFbo = {
      lum: tex.lum.map((t) => this.tpFramebuffer(t)),
      field: tex.f0.map((t) => this.tpFramebuffer(t, tex.f1)),
      flow: this.tpFramebuffer(tex.flow),
      out: tex.out.map((t) => this.tpFramebuffer(t)),
    };
    this.tpLowW = lw; this.tpLowH = lh; this.tpOutW = ow; this.tpOutH = oh;
    this.tpValid = false;
    return true;
  }

  private bindTex(unit: number, tex: WebGLTexture, prog: Program, name: string): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.loc.get(name)!, unit);
  }

  /** Runs the three 1/8-resolution temporal passes; the grade then reads their output. */
  private tpPasses(): void {
    const gl = this.gl;
    const t = this.tpTex!, f = this.tpFbo!;
    const cur = this.tpIdx, prev = 1 - cur;
    // History flag for this frame (p23.x).
    this.uniforms[92] = this.tpValid ? 1 : 0;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 92 * 4, this.uniforms.subarray(92, 93));
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.uniformBuf);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.tpLowW, this.tpLowH);
    // 1. lum
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.lum[cur]);
    gl.useProgram(this.tpLum.prog);
    this.bindTex(0, this.source, this.tpLum, "u_source");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. flow
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.flow);
    gl.useProgram(this.tpFlow.prog);
    this.bindTex(4, t.lum[cur], this.tpFlow, "u_lum");
    this.bindTex(5, t.lum[prev], this.tpFlow, "u_lumPrev");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. field (two targets)
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.field[cur]);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.useProgram(this.tpField.prog);
    for (let i = 0; i < DATA_SLOTS; i++) this.bindTex(1 + i, this.data[i], this.tpField, `u_data${i}`);
    this.bindTex(4, t.lum[cur], this.tpField, "u_lum");
    this.bindTex(5, t.flow, this.tpField, "u_flow");
    this.bindTex(6, t.f0[prev], this.tpField, "u_histf");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
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
    // Anamorphic sources (sample aspect ratio ≠ 1): Chrome hands WebGL the
    // coded picture (e.g. 1280×720) while the element reports the displayed
    // size (1280×960), so a sized upload fails with INVALID_OPERATION and the
    // texture keeps its old content — a frozen export. Every new source size
    // or kind is probed once; a failure routes that kind through a 2D canvas,
    // whose drawImage applies the pixel aspect.
    const kind = isVideoFrame(src) ? "frame" : src instanceof HTMLVideoElement ? "video" : "image";
    const fresh = width !== this.srcW || height !== this.srcH || kind !== this.srcKind;
    let source = src as TexImageSource;
    if (!fresh && this.viaCanvas) source = this.throughCanvas(src, width, height);
    if (fresh) {
      while (gl.getError() !== gl.NO_ERROR) { /* clear stale errors before probing */ }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      // Chrome accepts the oversized texImage2D but rejects the per-frame texSubImage2D: probe that too.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const err = gl.getError();
      this.viaCanvas = err !== gl.NO_ERROR;
      if (this.viaCanvas) {
        console.warn(`WebGL direct upload of ${kind} at ${width}x${height} failed (0x${err.toString(16)}); resampling through a canvas`);
        source = this.throughCanvas(src, width, height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }
      this.srcW = width;
      this.srcH = height;
      this.srcKind = kind;
    } else {
      // Same size as last upload: texSubImage2D re-uses the GPU storage.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
  }

  private throughCanvas(src: SourceInput, width: number, height: number): OffscreenCanvas {
    if (!this.scratch || this.scratch.width !== width || this.scratch.height !== height) this.scratch = new OffscreenCanvas(width, height);
    this.scratch.getContext("2d")!.drawImage(src as CanvasImageSource, 0, 0, width, height);
    return this.scratch;
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
    // The layer runs only while the engine asks for it (p23.y); off, the history lapses.
    const tp = this.uniforms[93] > 0.5 && this.tpEnsure();
    if (!tp) this.tpValid = false;
    if (tp) this.tpPasses();
    else if (this.uniforms[92] !== 0) {
      this.uniforms[92] = 0;
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 92 * 4, this.uniforms.subarray(92, 93));
    }
    const cur = this.tpIdx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tp ? this.tpFbo!.out[cur] : null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.bindCommon(this.grade);
    for (let i = 0; i < DATA_SLOTS; i++) {
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.data[i]);
      gl.uniform1i(this.grade.loc.get(`u_data${i}`)!, 1 + i);
    }
    if (tp) {
      const t = this.tpTex!;
      this.bindTex(4, t.f0[cur], this.grade, "u_tpF0");
      this.bindTex(5, t.f1, this.grade, "u_tpF1");
      this.bindTex(6, t.flow, this.grade, "u_tpFlow");
      this.bindTex(7, t.out[1 - cur], this.grade, "u_tpPrev");
    } else {
      // Unused when the layer is off, but every sampler needs a texture.
      for (const [u, n] of [[4, "u_tpF0"], [5, "u_tpF1"], [6, "u_tpFlow"], [7, "u_tpPrev"]] as const) this.bindTex(u, this.data[0], this.grade, n);
    }
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.uniformBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (tp) {
      const w = this.canvas.width, h = this.canvas.height;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.tpFbo!.out[cur]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.tpIdx = 1 - cur;
      this.tpValid = true;
    }
  }

  async renderToFrame(timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    // Exports render at full size: the canvas is the only render surface
    // this context can hand to a VideoFrame, so it is sized up for the
    // duration (callers set the preview scale to 1 around an export).
    this.sizeCanvas(1);
    const t0 = performance.now();
    this.render();
    const t1 = performance.now();
    const f = new VideoFrame(this.canvas, { timestamp: timestampUs, duration: durationUs });
    this.lastDrawMs = t1 - t0;
    this.lastCaptureMs = performance.now() - t1;
    return f;
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

  async analyze(width: number, height: number, rect: Rect = FULL_RECT): Promise<Uint8ClampedArray> {
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
      gl.uniform4f(this.down.loc.get("u_rect")!, rect.x, rect.y, rect.w, rect.h);
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
          if (status === gl.WAIT_FAILED || ++tries > 15000) return reject(new Error("GPU readback timed out"));
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
    this.tpRelease();
    gl.deleteTexture(this.source);
    for (const t of this.data) gl.deleteTexture(t);
    gl.deleteBuffer(this.uniformBuf);
    if (this.analysisTex) gl.deleteTexture(this.analysisTex);
    if (this.analysisFbo) gl.deleteFramebuffer(this.analysisFbo);
    if (this.pbo) gl.deleteBuffer(this.pbo);
  }
}
