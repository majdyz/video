import { DATA_SLOTS, UNIFORM_FLOATS, isVideoFrame, uprightSize, type DataTextureSpec, type GpuBackend, type Rotation, type SourceInput, FULL_RECT, type Rect } from "./backend.ts";
import { GLSL_FRAGMENT, GLSL_DOWNSCALE_FRAGMENT, GLSL_COMPOSITE, GLSL_VERTEX as VS } from "./shaders.ts";
import { GLSL_NR, GLSL_NR_LEVEL, GLSL_NR_REFINE, GLSL_TP_FIELD, GLSL_TP_FLOW, GLSL_TP_LUM } from "./temporal.ts";
import { NR, TEMPORAL } from "./params.ts";
import { waitForSync } from "./fence-poll.ts";


/** Export readbacks kept in flight (the exporter overlaps up to three frames). */
const READBACK_SLOTS = 3;

type Program = { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> };

/**
 * Export readback as NV12 (BT.709, limited range), packed four bytes to an RGBA8 texel: rows 0..h-1 of the target
 * hold the luma plane (4 pixels per texel), rows h..1.5h-1 the interleaved CbCr plane (2 chroma pairs per texel,
 * each the mean of a 2×2 block). Row m of the target is row m of the image (top-down), so the bytes readPixels
 * returns are an NV12 frame as is: 12 bits a pixel instead of 32, and the encoder gets the format it encodes.
 */
const GLSL_NV12 = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform ivec2 u_size;
out vec4 o;
const vec3 K = vec3(0.2126, 0.7152, 0.0722);
vec3 px(int x, int y) { return texelFetch(u_src, ivec2(x, u_size.y - 1 - y), 0).rgb; }
float luma(vec3 c) { return (16.0 + 219.0 * dot(c, K)) / 255.0; }
vec2 chroma(vec3 c) {
  float y = dot(c, K);
  return (vec2(128.0) + 224.0 * vec2((c.b - y) / 1.8556, (c.r - y) / 1.5748)) / 255.0;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int x = p.x * 4;
  if (p.y < u_size.y) {
    o = vec4(luma(px(x, p.y)), luma(px(x + 1, p.y)), luma(px(x + 2, p.y)), luma(px(x + 3, p.y)));
  } else {
    int y = (p.y - u_size.y) * 2;
    vec3 a = (px(x, y) + px(x + 1, y) + px(x, y + 1) + px(x + 1, y + 1)) * 0.25;
    vec3 b = (px(x + 2, y) + px(x + 3, y) + px(x + 2, y + 1) + px(x + 3, y + 1)) * 0.25;
    o = vec4(chroma(a), chroma(b));
  }
}`;

/** NV12 export readback unless `?yuv=0` (RGBA bytes, the encoder converts). */
function nv12Wanted(): boolean {
  try {
    return typeof location === "undefined" || new URLSearchParams(location.search).get("yuv") !== "0";
  } catch {
    return true;
  }
}

export class WebGL2Backend implements GpuBackend {
  readonly kind = "webgl2";
  readonly canvas: HTMLCanvasElement;
  outputWidth = 0;
  outputHeight = 0;
  lastDrawMs = 0;
  lastCaptureMs = 0;
  private readonly gl: WebGL2RenderingContext;
  private grade: Program;
  private readonly down: Program;
  private readonly comp: Program;
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
  // Temporal layer (temporal.ts): 1/8-resolution lum / flow / field passes, ping-ponged per frame.
  private tpOn = false;
  private tpValid = false;
  private tpLum!: Program;
  private tpFlow!: Program;
  private tpField!: Program;
  private tpLowW = 0;
  private tpLowH = 0;
  private tpIdx = 0;
  private tpTex: { lum: WebGLTexture[]; f0: WebGLTexture[]; f1: WebGLTexture; flow: WebGLTexture } | null = null;
  private tpFbo: { lum: WebGLFramebuffer[]; field: WebGLFramebuffer[]; flow: WebGLFramebuffer } | null = null;
  // Noise reduction (temporal.ts passes 4-6): the refined flow and the noise levels (half float, small) and the
  // denoised source at the canvas size, ping-ponged: the one drawn this frame is the grade's source and the next
  // frame's history. Allocated only while Noise reduction is on. nrWritten: nr[nrIdx] holds a frame; nrHist: the
  // other one holds the frame before it (the history is valid).
  private nrOn = false;
  private nrRefine!: Program;
  private nrLevel!: Program;
  private nrProg!: Program;
  private nrTex: { flow: WebGLTexture; level: WebGLTexture; out: WebGLTexture[] } | null = null;
  private nrFbo: { flow: WebGLFramebuffer; level: WebGLFramebuffer; out: WebGLFramebuffer[] } | null = null;
  private nrW = 0;
  private nrH = 0;
  private nrLowW = 0;
  private nrLowH = 0;
  private nrIdx = 0;
  private nrWritten = false;
  private nrHist = false;
  /** RGB10_A2 history (false: the device cannot draw into it, RGBA8 instead). */
  private nr10 = true;
  // Compare wipe (GLSL_COMPOSITE): the "before" picture when it is not the
  // source, the graded target used while the wipe is on without the temporal
  // layer, and the last graded frame recomposite() can reuse (null once the
  // source, uniforms, data or canvas size change).
  private beforeTex: WebGLTexture | null = null;
  private beforePx = 0;
  private wipe: { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number } | null = null;
  private lastGraded: WebGLTexture | null = null;
  // A source drawn in this context by another stage (beginSourceDraw / endSourceDraw): its
  // target, and a framebuffer on the source texture the target is blitted into.
  private drawTarget: { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number } | null = null;
  private sourceFbo: WebGLFramebuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      // Kept on purpose: the photo export draws this canvas into a 2D canvas after awaits (studio
      // renderPhotoJpeg → emitFrame → encodeJpeg), and the eval pages read it outside the frame that drew
      // it; without it both would read a cleared buffer. The video export captures in the task that draws.
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    const floatTargets = !!gl.getExtension("EXT_color_buffer_float");
    this.grade = this.link(VS, GLSL_FRAGMENT, ["u_source", "u_data0", "u_data1", "u_data2", "u_data3", "u_tpF0", "u_tpF1", "u_tpNr"]);
    this.down = this.link(VS, GLSL_DOWNSCALE_FRAGMENT, ["u_source", "u_rotation", "u_srcSize", "u_outSize", "u_rect"]);
    this.comp = this.link(VS, GLSL_COMPOSITE, ["u_before", "u_graded", "u_split", "u_rot"]);
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
        this.tpField = this.link(VS, GLSL_TP_FIELD, ["u_data0", "u_data1", "u_data2", "u_data3", "u_lum", "u_flow", "u_histf"]);
        for (const p of [this.tpLum, this.tpField]) gl.uniformBlockBinding(p.prog, gl.getUniformBlockIndex(p.prog, "Params"), 0);
        this.tpOn = true;
      } catch (e) {
        console.warn("temporal layer unavailable:", (e as Error).message);
      }
      // The noise reduction is separate: a device that cannot compile it keeps the temporal layer.
      if (this.tpOn) {
        try {
          this.nrRefine = this.link(VS, GLSL_NR_REFINE, ["u_source", "u_tpFlow", "u_nrPrev", "u_nrLevel"]);
          this.nrLevel = this.link(VS, GLSL_NR_LEVEL, ["u_source", "u_nrFlow", "u_nrPrev", "u_tpLum"]);
          this.nrProg = this.link(VS, GLSL_NR, ["u_source", "u_nrFlow", "u_nrPrev", "u_nrLevel"]);
          for (const p of [this.nrRefine, this.nrLevel, this.nrProg]) gl.uniformBlockBinding(p.prog, gl.getUniformBlockIndex(p.prog, "Params"), 0);
          this.nrOn = true;
        } catch (e) {
          console.warn("noise reduction unavailable:", (e as Error).message);
        }
      }
    }
  }

  /** Forgets the temporal history (scene cut, seek, new clip). */
  resetTemporal(): void {
    this.tpValid = false;
    this.nrWritten = false;
    this.nrHist = false;
  }

  private tpTarget(w: number, h: number, fmt: "half" | "rgba8" | "rgb10"): WebGLTexture {
    const gl = this.gl;
    const t = this.makeTexture(gl.LINEAR);
    if (fmt === "half") gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else if (fmt === "rgb10") gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB10_A2, w, h, 0, gl.RGBA, gl.UNSIGNED_INT_2_10_10_10_REV, null);
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
    this.lastGraded = null;
    if (this.tpTex) {
      const t = this.tpTex;
      for (const x of [...t.lum, ...t.f0, t.f1, t.flow]) gl.deleteTexture(x);
    }
    if (this.tpFbo) {
      const f = this.tpFbo;
      for (const x of [...f.lum, ...f.field, f.flow]) gl.deleteFramebuffer(x);
    }
    this.tpTex = null;
    this.tpFbo = null;
  }

  private nrRelease(): void {
    const gl = this.gl;
    if (this.nrTex) for (const x of [this.nrTex.flow, this.nrTex.level, ...this.nrTex.out]) gl.deleteTexture(x);
    if (this.nrFbo) for (const x of [this.nrFbo.flow, this.nrFbo.level, ...this.nrFbo.out]) gl.deleteFramebuffer(x);
    this.nrTex = null;
    this.nrFbo = null;
    this.nrWritten = false;
    this.nrHist = false;
  }

  /** (Re)creates the noise reduction targets for the current sizes (after tpEnsure). */
  private nrEnsure(): boolean {
    const gl = this.gl;
    const ow = this.canvas.width, oh = this.canvas.height;
    if (this.nrTex && ow === this.nrW && oh === this.nrH && this.nrLowW === this.tpLowW && this.nrLowH === this.tpLowH) return true;
    this.nrRelease();
    const out = (): WebGLTexture[] => [this.tpTarget(ow, oh, this.nr10 ? "rgb10" : "rgba8"), this.tpTarget(ow, oh, this.nr10 ? "rgb10" : "rgba8")];
    let outs = out();
    let fbos = outs.map((t) => this.tpFramebuffer(t));
    if (this.nr10) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0]);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        console.warn("noise reduction: RGB10_A2 is not renderable here, using RGBA8 history");
        for (const t of outs) gl.deleteTexture(t);
        for (const f of fbos) gl.deleteFramebuffer(f);
        this.nr10 = false;
        outs = out();
        fbos = outs.map((t) => this.tpFramebuffer(t));
      }
    }
    const flow = this.tpTarget(this.tpLowW, this.tpLowH, "half"), level = this.tpTarget(NR.bins, 1, "half");
    this.nrTex = { flow, level, out: outs };
    this.nrFbo = { flow: this.tpFramebuffer(flow), level: this.tpFramebuffer(level), out: fbos };
    this.nrW = ow; this.nrH = oh; this.nrLowW = this.tpLowW; this.nrLowH = this.tpLowH;
    return true;
  }

  /**
   * Runs the noise reduction passes (refine, level, nr) after the temporal passes; the grade then reads
   * nr[nrIdx]. The history advances with the picture: a frame drawn again (p26.z, set by the engine: the same
   * media time, e.g. a setting changed while paused) is denoised again from the same history, not from itself.
   */
  private nrPasses(): void {
    const gl = this.gl;
    const t = this.nrTex!, f = this.nrFbo!;
    if (this.nrWritten && this.uniforms[106] < 0.5) {
      this.nrIdx = 1 - this.nrIdx;
      this.nrHist = true;
    } else if (!this.nrWritten) this.nrHist = false;
    const cur = this.nrIdx, prev = 1 - cur;
    this.uniforms[105] = this.nrHist ? 1 : 0;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 105 * 4, this.uniforms.subarray(105, 106));
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.uniformBuf);
    gl.bindVertexArray(this.vao);
    // 4. refine (low size)
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.flow);
    gl.viewport(0, 0, this.tpLowW, this.tpLowH);
    gl.useProgram(this.nrRefine.prog);
    this.bindTex(0, this.source, this.nrRefine, "u_source");
    this.bindTex(4, this.tpTex!.flow, this.nrRefine, "u_tpFlow");
    this.bindTex(5, t.out[prev], this.nrRefine, "u_nrPrev");
    this.bindTex(6, t.level, this.nrRefine, "u_nrLevel"); // the previous frame's levels
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 5. level (one texel per luminance bin)
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.level);
    gl.viewport(0, 0, NR.bins, 1);
    gl.useProgram(this.nrLevel.prog);
    this.bindTex(0, this.source, this.nrLevel, "u_source");
    this.bindTex(4, t.flow, this.nrLevel, "u_nrFlow");
    this.bindTex(5, t.out[prev], this.nrLevel, "u_nrPrev");
    this.bindTex(6, this.tpTex!.lum[this.tpIdx], this.nrLevel, "u_tpLum");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 6. nr (canvas size)
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.out[cur]);
    gl.viewport(0, 0, this.nrW, this.nrH);
    gl.useProgram(this.nrProg.prog);
    this.bindTex(0, this.source, this.nrProg, "u_source");
    this.bindTex(4, t.flow, this.nrProg, "u_nrFlow");
    this.bindTex(5, t.out[prev], this.nrProg, "u_nrPrev");
    this.bindTex(6, t.level, this.nrProg, "u_nrLevel");
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.nrWritten = true;
  }

  /** (Re)creates the temporal targets for the current sizes; false when the layer is off. */
  private tpEnsure(): boolean {
    if (!this.tpOn || !this.outputWidth) return false;
    const lw = Math.max(1, Math.ceil(this.outputWidth / TEMPORAL.scale)), lh = Math.max(1, Math.ceil(this.outputHeight / TEMPORAL.scale));
    if (this.tpTex && lw === this.tpLowW && lh === this.tpLowH) return true;
    this.tpRelease();
    const half = (w: number, h: number) => this.tpTarget(w, h, "half");
    const tex = { lum: [half(lw, lh), half(lw, lh)], f0: [half(lw, lh), half(lw, lh)], f1: half(lw, lh), flow: half(lw, lh) };
    this.tpTex = tex;
    this.tpFbo = {
      lum: tex.lum.map((t) => this.tpFramebuffer(t)),
      field: tex.f0.map((t) => this.tpFramebuffer(t, tex.f1)),
      flow: this.tpFramebuffer(tex.flow),
    };
    this.tpLowW = lw; this.tpLowH = lh;
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
    for (let i = 0; i < DATA_SLOTS; i++) this.bindTex(dataUnit(i), this.data[i], this.tpField, `u_data${i}`);
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

  /**
   * Export profiling (?profile=sync): wait for the GPU after the upload, the
   * temporal passes and the grade so each one's time lands in `stageMs`
   * (costs the overlap between them; off otherwise). `capture` is always counted.
   */
  syncProfile = false;
  readonly stageMs = { upload: 0, temporal: 0, grade: 0, capture: 0 };
  private syncPx = new Uint8Array(4);

  /** Waits for the GPU to finish all work issued so far: a 1-pixel read of the canvas (gl.finish() returns early in Chrome). */
  private gpuSync(): void {
    const gl = this.gl;
    const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.syncPx);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
  }

  upload(src: SourceInput, width: number, height: number, rotation: Rotation): void {
    const t0 = this.syncProfile ? performance.now() : 0;
    try {
      this.uploadNow(src, width, height, rotation);
    } finally {
      if (this.syncProfile) {
        this.gpuSync();
        this.stageMs.upload += performance.now() - t0;
      }
    }
  }

  private uploadNow(src: SourceInput, width: number, height: number, rotation: Rotation): void {
    const gl = this.gl;
    this.lastGraded = null;
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

  /** Shader benchmarks (debug): the grade's fragment source in use. */
  gradeSource = GLSL_FRAGMENT;

  private gradePrograms = new Map<string, Program>();
  /** Shader benchmarks (debug): grade with another fragment source (null: the built-in one); variants stay compiled. Throws on a compile error. */
  setGradeSource(fs: string | null): void {
    const gl = this.gl;
    const src = fs ?? GLSL_FRAGMENT;
    if (!this.gradePrograms.size) this.gradePrograms.set(GLSL_FRAGMENT, this.grade);
    let next = this.gradePrograms.get(src);
    if (!next) {
      next = this.link(VS, src, ["u_source", "u_data0", "u_data1", "u_data2", "u_data3", "u_tpF0", "u_tpF1", "u_tpNr"]);
      gl.uniformBlockBinding(next.prog, gl.getUniformBlockIndex(next.prog, "Params"), 0);
      this.gradePrograms.set(src, next);
    }
    this.grade = next;
    this.gradeSource = src;
    this.lastGraded = null;
  }

  /** This backend's context: a stage drawing the source itself (the studio's geometry pass) renders in it. */
  get context(): WebGL2RenderingContext {
    return this.gl;
  }

  /**
   * Binds a width×height RGBA8 framebuffer for another stage to draw the
   * next source frame into, exactly as it would draw a canvas of that size
   * (row 0 at the bottom). endSourceDraw then makes it the source.
   */
  beginSourceDraw(width: number, height: number): void {
    const gl = this.gl;
    let t = this.drawTarget;
    if (!t || t.w !== width || t.h !== height) {
      if (t) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      const tex = this.tpTarget(width, height, "rgba8");
      t = this.drawTarget = { tex, fbo: this.tpFramebuffer(tex), w: width, h: height };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, width, height);
  }

  /**
   * The frame drawn since beginSourceDraw becomes the source: the same
   * texels upload() of a canvas holding that picture stores (a canvas
   * uploads top row first, so the copy flips rows), without the copy
   * between contexts. Same bookkeeping as upload().
   */
  endSourceDraw(width: number, height: number, rotation: Rotation): void {
    const t0 = this.syncProfile ? performance.now() : 0;
    const gl = this.gl;
    const t = this.drawTarget;
    if (!t || t.w !== width || t.h !== height) throw new Error("endSourceDraw without a matching beginSourceDraw");
    this.lastGraded = null;
    this.rotation = rotation;
    const [ow, oh] = uprightSize(width, height, rotation);
    this.outputWidth = ow;
    this.outputHeight = oh;
    this.sizeCanvas(this.previewScale);
    if (width !== this.srcW || height !== this.srcH || this.srcKind !== "drawn" || !this.sourceFbo) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.source);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if (!this.sourceFbo) this.sourceFbo = this.tpFramebuffer(this.source);
      this.srcW = width;
      this.srcH = height;
      // The next upload() of a real source re-probes its size and kind.
      this.srcKind = "drawn";
      this.viaCanvas = false;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.sourceFbo);
    gl.blitFramebuffer(0, 0, width, height, 0, height, width, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (this.syncProfile) {
      this.gpuSync();
      this.stageMs.upload += performance.now() - t0;
    }
  }

  /** Profiling (?profile=sync): waits for the GPU (the work of a stage drawing in this context lands in its own time). */
  syncIfProfiling(): void {
    if (this.syncProfile) this.gpuSync();
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
      this.lastGraded = null;
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setUniforms(block: Float32Array): void {
    if (block.length !== UNIFORM_FLOATS) throw new Error(`uniform block must have ${UNIFORM_FLOATS} floats`);
    this.uniforms.set(block);
    this.lastGraded = null;
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uniforms);
  }

  setData(slot: number, spec: DataTextureSpec): void {
    const gl = this.gl;
    if (spec.data.length !== spec.width * spec.height * 4) throw new Error("data texture size mismatch");
    this.lastGraded = null;
    gl.activeTexture(gl.TEXTURE0 + dataUnit(slot));
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
    // Noise reduction (p26.x) rides on the layer's flow: its targets exist only while it is on.
    const nr = tp && this.nrOn && this.uniforms[104] > 0.5 && this.nrEnsure();
    if (!nr) {
      if (this.nrTex) this.nrRelease();
      this.nrWritten = false;
      if (this.uniforms[104] !== 0) {
        // The grade must read the source itself.
        this.uniforms[104] = 0;
        gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 104 * 4, this.uniforms.subarray(104, 105));
      }
    }
    let ts = this.syncProfile ? performance.now() : 0;
    if (tp) this.tpPasses();
    else if (this.uniforms[92] !== 0) {
      this.uniforms[92] = 0;
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuf);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 92 * 4, this.uniforms.subarray(92, 93));
    }
    if (nr) this.nrPasses();
    if (this.syncProfile) {
      this.gpuSync();
      const now = performance.now();
      this.stageMs.temporal += now - ts;
      ts = now;
    }
    // The grade never applies the compare wipe (p0.y): with the wipe on it
    // renders into a texture and the composite pass draws the screen from it.
    const split = this.uniforms[1];
    let graded: WebGLTexture | null = null;
    if (split > 0) {
      const w = this.wipeTarget();
      gl.bindFramebuffer(gl.FRAMEBUFFER, w.fbo);
      graded = w.tex;
    } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.bindCommon(this.grade);
    for (let i = 0; i < DATA_SLOTS; i++) this.bindTex(dataUnit(i), this.data[i], this.grade, `u_data${i}`);
    // Unused when the layer (or the noise reduction) is off, but every sampler needs a texture.
    this.bindTex(4, tp ? this.tpTex!.f0[this.tpIdx] : this.data[0], this.grade, "u_tpF0");
    this.bindTex(5, tp ? this.tpTex!.f1 : this.data[0], this.grade, "u_tpF1");
    this.bindTex(7, nr ? this.nrTex!.out[this.nrIdx] : this.data[0], this.grade, "u_tpNr");
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.uniformBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (split > 0) this.composite(graded!, split);
    if (tp) {
      this.tpIdx = 1 - this.tpIdx;
      this.tpValid = true;
    }
    this.lastGraded = graded;
    if (this.syncProfile) {
      this.gpuSync();
      this.stageMs.grade += performance.now() - ts;
    }
  }

  /** Graded target for the compare wipe (canvas size, RGBA8). */
  private wipeTarget(): { tex: WebGLTexture; fbo: WebGLFramebuffer } {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    if (this.wipe && this.wipe.w === w && this.wipe.h === h) return this.wipe;
    if (this.wipe) {
      gl.deleteTexture(this.wipe.tex);
      gl.deleteFramebuffer(this.wipe.fbo);
    }
    const tex = this.tpTarget(w, h, "rgba8");
    this.wipe = { tex, fbo: this.tpFramebuffer(tex), w, h };
    return this.wipe;
  }

  /** Draws the canvas: the "before" picture left of `split`, the graded frame right of it. */
  private composite(graded: WebGLTexture, split: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.comp.prog);
    gl.bindVertexArray(this.vao);
    this.bindTex(0, this.beforeTex ?? this.source, this.comp, "u_before");
    this.bindTex(4, graded, this.comp, "u_graded");
    gl.uniform1f(this.comp.loc.get("u_split")!, split);
    gl.uniform1i(this.comp.loc.get("u_rot")!, this.beforeTex ? 0 : this.rotation);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  recomposite(split: number): boolean {
    if (!this.lastGraded) return false;
    this.uniforms[1] = split;
    this.composite(this.lastGraded, split);
    return true;
  }

  setBefore(src: SourceInput | null, width: number, height: number): void {
    const gl = this.gl;
    this.lastGraded = null;
    if (!src) {
      if (this.beforeTex) gl.deleteTexture(this.beforeTex);
      this.beforeTex = null;
      this.beforePx = 0;
      return;
    }
    if (!this.beforeTex) this.beforeTex = this.makeTexture(gl.LINEAR);
    this.beforePx = width * height;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.beforeTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    // Unsized upload: the picture keeps its own size (it is sampled by uv), so
    // an anamorphic <video> cannot fail the way a sized upload does (upload()).
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    } catch {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.throughCanvas(src, width, height));
    }
  }

  /**
   * Export capture: how a rendered frame becomes a VideoFrame. "canvas" wraps the canvas (free on Chrome, but
   * 60–80 ms per frame on Safari, which pinned its offline export near 10 fps); "readback" reads the pixels into a
   * pixel-pack buffer (a flipped blit, so the rows come out top-down; asynchronous, several frames in flight) and
   * builds the frame from the bytes. Both carry the same RGBA8 pixels. null = time both on the first export frame
   * and keep the faster; `?capture=canvas|readback` (or setCaptureMode) forces one.
   */
  capture: "canvas" | "readback" | null = null;
  private forceCapture: "canvas" | "readback" | null = null;
  /** Human-readable result of the capture benchmark (diagnostics). */
  captureBench = "";
  private readbackRing: { pbo: WebGLBuffer; busy: boolean; size: number }[] = [];
  /** readbackSlotFree callers waiting for a slot. */
  private slotWaiters: (() => void)[] = [];
  /**
   * Host copy of a readback, reused frame after frame: the VideoFrame constructor copies the bytes, so one
   * buffer serves every slot (the copy-out and the wrap run back to back, synchronously). A fresh 33 MB array
   * per 4K frame was ~1 GB/s of garbage, which WebKit on iPhone collects too late (tab reloads mid-export).
   */
  private readbackHost: Uint8Array<ArrayBuffer> | null = null;
  /** NV12 packing pass (GLSL_NV12): its program, the canvas copy it reads and the packed target. */
  private nv12: { prog: Program; src: WebGLTexture; srcFbo: WebGLFramebuffer; out: WebGLTexture; outFbo: WebGLFramebuffer; w: number; h: number } | null = null;
  private nv12Failed = false;
  /** The capture benchmark found the RGBA readback faster on this device (or `?yuv=0`): no NV12 pass. */
  private nv12Off = false;
  /** Pixel format of the export readback frames (diagnostics). */
  readbackFormat: "RGBA" | "NV12" = "RGBA";
  private flipTarget: { rb: WebGLRenderbuffer; fbo: WebGLFramebuffer; w: number; h: number } | null = null;

  /** Sets the capture path for the next export: "auto" re-benchmarks; "bitmap" (a WebGPU path) means "canvas" here. */
  setCaptureMode(mode: "auto" | "canvas" | "bitmap" | "readback"): void {
    this.forceCapture = mode === "auto" ? null : mode === "readback" ? "readback" : "canvas";
    this.capture = null;
    this.nv12Off = false;
  }

  async renderToFrame(timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    // Exports render at full size: the canvas is the render surface (callers
    // set the preview scale to 1 around an export).
    this.sizeCanvas(1);
    const t0 = performance.now();
    this.render();
    const t1 = performance.now();
    this.lastDrawMs = t1 - t0;
    if (this.capture === null) {
      const forced = this.forceCapture ?? (typeof location !== "undefined" ? new URLSearchParams(location.search).get("capture") : null);
      if (forced === "canvas") {
        this.capture = forced;
        this.captureBench = `forced ${forced}`;
      } else {
        // Forced readback still times its two formats (RGBA, NV12).
        const f = await this.benchmarkCapture(timestampUs, durationUs, forced === "readback");
        this.lastCaptureMs = performance.now() - t1;
        this.stageMs.capture += this.lastCaptureMs;
        return f;
      }
    }
    const f = this.capture === "readback" ? await this.captureReadback(timestampUs, durationUs) : new VideoFrame(this.canvas, { timestamp: timestampUs, duration: durationUs });
    this.lastCaptureMs = performance.now() - t1;
    this.stageMs.capture += this.lastCaptureMs;
    return f;
  }

  /**
   * Times both capture paths on the frame just drawn (a few captures each; the readbacks overlapped as the
   * exporter overlaps them), keeps the faster, and returns this frame. Every capture of the canvas is issued
   * before the first await: another frame may draw into the canvas once this call yields.
   */
  private async benchmarkCapture(timestampUs: number, durationUs: number | undefined, readbackOnly = false): Promise<VideoFrame> {
    const N = 3;
    const results: string[] = readbackOnly ? ["forced readback"] : [];
    let canvasMs = Infinity, readbackMs = Infinity;
    let frame: VideoFrame | null = null;
    // The render finished first, so neither path is charged the GPU time of the draw (the first capture would be).
    this.gpuSync();
    if (!readbackOnly) try {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) {
        const f = new VideoFrame(this.canvas, { timestamp: timestampUs, duration: durationUs });
        frame?.close();
        frame = f;
      }
      canvasMs = (performance.now() - t0) / N;
      results.push(`canvas ${canvasMs.toFixed(1)} ms`);
    } catch (e) {
      results.push(`canvas failed (${(e as Error).message.split("\n")[0].slice(0, 50)})`);
    }
    // Readbacks: RGBA, then NV12 where it can run (all issued before the first await, so all read this frame; the GPU
    // runs them in order, so each set's time is from the previous set's end). The faster format is kept.
    const w = this.canvas.width, h = this.canvas.height;
    this.nv12Off = true;
    const t0 = performance.now();
    const rgbaReads = Array.from({ length: N }, () => this.captureReadback(timestampUs, durationUs));
    this.nv12Off = false;
    const nv12Reads = this.nv12Targets(w, h) ? Array.from({ length: N }, () => this.captureReadback(timestampUs, durationUs)) : [];
    const settle = async (reads: Promise<VideoFrame>[], from: () => number) => {
      const done = await Promise.allSettled(reads);
      const end = performance.now();
      const ok = done.filter((r): r is PromiseFulfilledResult<VideoFrame> => r.status === "fulfilled").map((r) => r.value);
      const err = done.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason as Error | undefined;
      return { ok, err, end, ms: ok.length === reads.length && reads.length ? (end - from()) / reads.length : Infinity };
    };
    const rgba = await settle(rgbaReads, () => t0);
    const nv12 = await settle(nv12Reads, () => rgba.end);
    readbackMs = Math.min(rgba.ms, nv12.ms);
    if (rgba.ms < Infinity) results.push(`readback ${rgba.ms.toFixed(1)} ms`);
    else results.push(`readback failed (${(rgba.err?.message ?? "?").split("\n")[0].slice(0, 50)})`);
    if (nv12Reads.length) results.push(nv12.ms < Infinity ? `NV12 readback ${nv12.ms.toFixed(1)} ms` : `NV12 failed (${(nv12.err?.message ?? "?").split("\n")[0].slice(0, 50)})`);
    // NV12 unless clearly slower: it is the encoder's own format with the colour matrix stated (WebKit's RGBA
    // conversion, in Playwright WebKit, encoded BT.601 into a stream the file calls BT.709: reds and blues 2–12 levels off),
    // and frames waiting for the encoder hold 12 bits a pixel instead of 32.
    const useNv12 = nv12.ms <= rgba.ms * 1.5;
    this.nv12Off = !useNv12;
    this.capture = readbackOnly || readbackMs < canvasMs ? "readback" : "canvas";
    this.captureBench = results.join(", ");
    console.info(`WebGL2 capture bench: ${this.captureBench} → ${this.capture}${this.capture === "readback" ? (useNv12 ? " (NV12)" : " (RGBA)") : ""}`);
    // The frame itself: every path holds the same pixels of this one picture.
    const chosen = useNv12 ? nv12.ok : rgba.ok;
    const keep = this.capture === "readback" ? chosen.shift()! : frame;
    for (const f of [...rgba.ok, ...nv12.ok]) if (f !== keep) f.close();
    if (keep !== frame) frame?.close();
    // The benchmark's extra readback buffers (two formats in flight): back to the export's ring size.
    const gl = this.gl;
    while (this.readbackRing.length > READBACK_SLOTS) {
      const i = this.readbackRing.findIndex((r) => !r.busy);
      if (i < 0) break;
      gl.deleteBuffer(this.readbackRing[i].pbo);
      this.readbackRing.splice(i, 1);
    }
    if (!useNv12) this.releaseNv12();
    if (!keep) throw new Error("export capture failed");
    return keep;
  }

  /**
   * Resolves once a readback slot is free (the exporter calls this before uploading a frame, so the
   * renderToFrame that follows issues its read at once, before any other frame draws into the canvas).
   */
  async readbackSlotFree(): Promise<void> {
    if (this.capture !== "readback") return;
    // Woken when a readback finishes (captureReadback); the timer is only a net under a missed wake-up.
    while (this.readbackRing.length >= READBACK_SLOTS && !this.readbackRing.some((r) => !r.busy)) {
      await new Promise<void>((r) => {
        this.slotWaiters.push(r);
        setTimeout(r, 50);
      });
    }
  }

  /**
   * Frees the targets only the preview needs (start of an export, which renders without the compare wipe and
   * at its own size): the wipe's graded target, the "before" picture, the drawn-source target and the temporal
   * targets. Each comes back on its next use (the temporal history starts over, as after a seek). Returns how
   * many textures went and their size, for the export log.
   */
  releasePreviewTargets(): { targets: number; bytes: number } {
    const gl = this.gl;
    let targets = 0, bytes = 0;
    this.lastGraded = null;
    if (this.wipe) {
      gl.deleteTexture(this.wipe.tex);
      gl.deleteFramebuffer(this.wipe.fbo);
      targets++;
      bytes += this.wipe.w * this.wipe.h * 4;
      this.wipe = null;
    }
    if (this.beforeTex) {
      gl.deleteTexture(this.beforeTex);
      targets++;
      bytes += this.beforePx * 4;
      this.beforeTex = null;
      this.beforePx = 0;
    }
    if (this.drawTarget) {
      gl.deleteTexture(this.drawTarget.tex);
      gl.deleteFramebuffer(this.drawTarget.fbo);
      targets++;
      bytes += this.drawTarget.w * this.drawTarget.h * 4;
      this.drawTarget = null;
    }
    if (this.tpTex) {
      // Six half-float targets at the low size.
      targets += 6;
      bytes += 6 * this.tpLowW * this.tpLowH * 8;
      this.tpRelease();
      this.tpValid = false;
    }
    if (this.nrTex) {
      // The noise reduction's two histories at the canvas size (4 bytes a pixel), its flow and its levels.
      targets += 4;
      bytes += 2 * this.nrW * this.nrH * 4 + this.nrLowW * this.nrLowH * 8 + NR.bins * 8;
      this.nrRelease();
    }
    return { targets, bytes };
  }

  /** Frees the export readback buffers (end of an export: at 4K they hold ~100 MB). */
  releaseCapture(): void {
    const gl = this.gl;
    for (const r of this.readbackRing) if (!r.busy) gl.deleteBuffer(r.pbo);
    this.readbackRing = this.readbackRing.filter((r) => r.busy);
    this.readbackHost = null;
    this.releaseNv12();
    if (this.flipTarget && !this.readbackRing.length) {
      gl.deleteRenderbuffer(this.flipTarget.rb);
      gl.deleteFramebuffer(this.flipTarget.fbo);
      this.flipTarget = null;
    }
  }

  private releaseNv12(): void {
    const n = this.nv12;
    if (!n) return;
    const gl = this.gl;
    gl.deleteProgram(n.prog.prog);
    gl.deleteTexture(n.src);
    gl.deleteTexture(n.out);
    gl.deleteFramebuffer(n.srcFbo);
    gl.deleteFramebuffer(n.outFbo);
    this.nv12 = null;
  }

  /** The NV12 pass's targets at w×h (null: this size or this GPU can't take it, RGBA readback then). */
  private nv12Targets(w: number, h: number): NonNullable<WebGL2Backend["nv12"]> | null {
    if (this.nv12Off || this.nv12Failed || w % 4 !== 0 || h % 2 !== 0 || !nv12Wanted()) return null;
    if (this.nv12 && this.nv12.w === w && this.nv12.h === h) return this.nv12;
    const gl = this.gl;
    const prog = this.nv12?.prog ?? (() => {
      try {
        return this.link(VS, GLSL_NV12, ["u_src", "u_size"]);
      } catch (e) {
        console.warn("NV12 readback unavailable:", (e as Error).message);
        this.nv12Failed = true;
        return null;
      }
    })();
    if (!prog) return null;
    if (this.nv12) {
      gl.deleteTexture(this.nv12.src);
      gl.deleteTexture(this.nv12.out);
      gl.deleteFramebuffer(this.nv12.srcFbo);
      gl.deleteFramebuffer(this.nv12.outFbo);
    }
    const target = (tw: number, th: number) => {
      const tex = this.makeTexture(gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, tw, th);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, ok };
    };
    const a = target(w, h), b = target(w / 4, (h * 3) / 2);
    this.nv12 = { prog, src: a.tex, srcFbo: a.fbo, out: b.tex, outFbo: b.fbo, w, h };
    if (!a.ok || !b.ok) {
      console.warn("NV12 readback unavailable: framebuffer incomplete");
      this.releaseNv12();
      this.nv12Failed = true;
      return null;
    }
    return this.nv12;
  }

  /** Reads the canvas (drawn just now) into a free pixel-pack buffer at once, then waits for the GPU and wraps the bytes. */
  private async captureReadback(timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const nv12 = this.nv12Targets(w, h);
    this.readbackFormat = nv12 ? "NV12" : "RGBA";
    const bytes = nv12 ? (w * h * 3) / 2 : w * h * 4;
    let slot = this.readbackRing.find((r) => !r.busy);
    if (!slot) {
      // The read must be issued before anything else draws: a slot more rather than a wait.
      slot = { pbo: gl.createBuffer()!, busy: false, size: bytes };
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.readbackRing.push(slot);
    }
    slot.busy = true;
    try {
      if (nv12) return await this.readNv12(nv12, slot, w, h, bytes, timestampUs, durationUs);
      // GL rows run bottom-up: a flipped blit into a same-size target makes them top-down for the frame.
      let ft = this.flipTarget;
      if (!ft || ft.w !== w || ft.h !== h) {
        if (ft) {
          gl.deleteRenderbuffer(ft.rb);
          gl.deleteFramebuffer(ft.fbo);
        }
        const rb = gl.createRenderbuffer()!;
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        ft = this.flipTarget = { rb, fbo, w, h };
        for (const r of this.readbackRing) {
          if (r.busy && r !== slot) continue;
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo);
          gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
          r.size = w * h * 4;
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, ft.fbo);
      gl.blitFramebuffer(0, 0, w, h, 0, h, w, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ft.fbo);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      if (slot.size !== bytes) {
        gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
        slot.size = bytes;
      }
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
      gl.flush();
      try {
        await waitForSync(gl, sync);
      } finally {
        gl.deleteSync(sync);
      }
      if (!this.readbackHost || this.readbackHost.byteLength !== w * h * 4) this.readbackHost = new Uint8Array(w * h * 4);
      const px = this.readbackHost;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      // RGBA (alpha is opaque: the canvas has none): WebKit can't copyTo an RGBX frame ("Unable to copy data").
      // The constructor copies px (no transfer), so the buffer is free again once it returns.
      return new VideoFrame(px, { format: "RGBA", codedWidth: w, codedHeight: h, timestamp: timestampUs, duration: durationUs });
    } finally {
      slot.busy = false;
      for (const wake of this.slotWaiters.splice(0)) wake();
    }
  }

  /** captureReadback's NV12 path: the canvas copied into a texture, packed by GLSL_NV12, read into the slot's buffer. */
  private async readNv12(n: NonNullable<WebGL2Backend["nv12"]>, slot: { pbo: WebGLBuffer; size: number }, w: number, h: number, bytes: number, timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    const gl = this.gl;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    // A slot sized for the other format (the size or the format changed between exports).
    if (slot.size !== bytes) {
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
      slot.size = bytes;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, n.srcFbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, n.outFbo);
    gl.viewport(0, 0, w / 4, (h * 3) / 2);
    gl.useProgram(n.prog.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, n.src);
    gl.uniform1i(n.prog.loc.get("u_src")!, 0);
    gl.uniform2i(n.prog.loc.get("u_size")!, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, n.outFbo);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    gl.readPixels(0, 0, w / 4, (h * 3) / 2, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    try {
      await waitForSync(gl, sync);
    } finally {
      gl.deleteSync(sync);
    }
    if (!this.readbackHost || this.readbackHost.byteLength !== bytes) this.readbackHost = new Uint8Array(bytes);
    const px = this.readbackHost;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return new VideoFrame(px, {
      format: "NV12",
      codedWidth: w,
      codedHeight: h,
      timestamp: timestampUs,
      duration: durationUs,
      colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false },
    });
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
      try {
        await waitForSync(gl, sync, { slowDelayMs: 2 });
      } finally {
        gl.deleteSync(sync);
      }
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
    gl.deleteProgram(this.comp.prog);
    for (const r of this.readbackRing) gl.deleteBuffer(r.pbo);
    this.readbackRing = [];
    if (this.flipTarget) {
      gl.deleteRenderbuffer(this.flipTarget.rb);
      gl.deleteFramebuffer(this.flipTarget.fbo);
      this.flipTarget = null;
    }
    if (this.beforeTex) gl.deleteTexture(this.beforeTex);
    if (this.wipe) {
      gl.deleteTexture(this.wipe.tex);
      gl.deleteFramebuffer(this.wipe.fbo);
    }
    this.tpRelease();
    this.nrRelease();
    if (this.drawTarget) {
      gl.deleteTexture(this.drawTarget.tex);
      gl.deleteFramebuffer(this.drawTarget.fbo);
    }
    if (this.sourceFbo) gl.deleteFramebuffer(this.sourceFbo);
    gl.deleteTexture(this.source);
    for (const t of this.data) gl.deleteTexture(t);
    gl.deleteBuffer(this.uniformBuf);
    if (this.analysisTex) gl.deleteTexture(this.analysisTex);
    if (this.analysisFbo) gl.deleteFramebuffer(this.analysisFbo);
    if (this.pbo) gl.deleteBuffer(this.pbo);
  }
}

/** Texture unit of data slot i: units 4–7 belong to the temporal targets. */
function dataUnit(i: number): number {
  return i < 3 ? 1 + i : 5 + i;
}
