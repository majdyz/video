import { DATA_SLOTS, UNIFORM_FLOATS, isVideoFrame, uprightSize, type DataTextureSpec, type GpuBackend, type Rotation, type SourceInput } from "./backend.ts";
import { WGSL_GRADE, WGSL_DOWNSCALE, WGSL_GRADE_EXT, WGSL_DOWNSCALE_EXT } from "./shaders.ts";

/** Draws the frame small into a 2D canvas and looks for anything above black. */
function frameIsLit(frame: VideoFrame): boolean {
  const c = new OffscreenCanvas(16, 16);
  const ctx = c.getContext("2d");
  if (!ctx) return true;
  ctx.drawImage(frame, 0, 0, 16, 16);
  const px = ctx.getImageData(0, 0, 16, 16).data;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 8 || px[i + 1] > 8 || px[i + 2] > 8) return true;
  return false;
}

// Sources reach the shader two ways. VideoFrames go through
// importExternalTexture (zero-copy, the export path's hot loop; the import
// only lives for the current task, so every draw re-imports). Everything
// else — and VideoFrames on a stack where the external import renders black
// — is copied into a regular 2D texture with copyExternalImageToTexture.
export class WebGPUBackend implements GpuBackend {
  readonly kind = "webgpu";
  readonly canvas: HTMLCanvasElement;
  outputWidth = 0;
  outputHeight = 0;
  lastDrawMs = 0;
  lastCaptureMs = 0;
  private readonly device: GPUDevice;
  private readonly ctx: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly gradePipeline: GPURenderPipeline;
  private readonly downPipeline: GPURenderPipeline;
  private readonly gradePipelineExt: GPURenderPipeline;
  private readonly downPipelineExt: GPURenderPipeline;
  /** Current VideoFrame source when the external path is in use. */
  private extSource: VideoFrame | null = null;
  /** undefined = not probed yet, false = external import renders black here. */
  private externalOk: boolean | undefined = undefined;
  private readonly sampler: GPUSampler;
  private readonly uniformBuf: GPUBuffer;
  private readonly downParamsBuf: GPUBuffer;
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);
  private source: GPUTexture | null = null;
  private srcW = 0;
  private srcH = 0;
  private rotation: Rotation = 0;
  private readonly data: GPUTexture[] = [];
  private gradeBindGroup: GPUBindGroup | null = null;
  private bindGroupDirty = true;
  private scratch: OffscreenCanvas | null = null;
  private directUpload: Record<"frame" | "video" | "image", boolean | undefined> = { frame: undefined, video: undefined, image: undefined };
  private analysisTex: GPUTexture | null = null;
  private analysisBuf: GPUBuffer | null = null;
  private analysisW = 0;
  private analysisH = 0;
  private analysisBytesPerRow = 0;
  private readbackInFlight = false;
  private previewScale = 1;
  private exportTex: GPUTexture | null = null;
  private exportCanvas: OffscreenCanvas | null = null;
  private exportCtx: GPUCanvasContext | null = null;

  private constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
    this.canvas = canvas;
    this.device = device;
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) throw new Error("WebGPU canvas context unavailable");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });
    // Explicit layouts: an "auto" layout drops bindings a shader variant
    // doesn't read, and the bind group below always supplies all of them.
    const tex = (binding: number, sampleType: GPUTextureSampleType = "float"): GPUBindGroupLayoutEntry => ({
      binding, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType, viewDimension: "2d" },
    });
    const gradeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        tex(2), tex(3, "unfilterable-float"), tex(4, "unfilterable-float"), tex(5, "unfilterable-float"),
      ],
    });
    const downLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        tex(2),
      ],
    });
    const ext: GPUBindGroupLayoutEntry = { binding: 2, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} };
    const gradeLayoutExt = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ext, tex(3, "unfilterable-float"), tex(4, "unfilterable-float"), tex(5, "unfilterable-float"),
      ],
    });
    const downLayoutExt = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ext,
      ],
    });
    const pipeline = (code: string, targetFormat: GPUTextureFormat, layout: GPUBindGroupLayout) =>
      device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { module: device.createShaderModule({ code }), entryPoint: "vs" },
        fragment: { module: device.createShaderModule({ code }), entryPoint: "fs", targets: [{ format: targetFormat }] },
        primitive: { topology: "triangle-list" },
      });
    this.gradePipeline = pipeline(WGSL_GRADE, this.format, gradeLayout);
    this.downPipeline = pipeline(WGSL_DOWNSCALE, "rgba8unorm", downLayout);
    this.gradePipelineExt = pipeline(WGSL_GRADE_EXT, this.format, gradeLayoutExt);
    this.downPipelineExt = pipeline(WGSL_DOWNSCALE_EXT, "rgba8unorm", downLayoutExt);
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    this.uniformBuf = device.createBuffer({ size: UNIFORM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.downParamsBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    for (let i = 0; i < DATA_SLOTS; i++) this.data.push(this.makeDataTexture(1, 1, new Float32Array(4)));
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPUBackend> {
    if (!("gpu" in navigator)) throw new Error("WebGPU not supported");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("WebGPU adapter unavailable");
    const device = await adapter.requestDevice();
    device.addEventListener("uncapturederror", (e) => {
      console.error("WebGPU:", (e as GPUUncapturedErrorEvent).error.message);
    });
    return new WebGPUBackend(canvas, device);
  }

  private makeDataTexture(w: number, h: number, data: Float32Array): GPUTexture {
    const t = this.device.createTexture({ size: [w, h], format: "rgba32float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture: t }, data, { bytesPerRow: w * 16, rowsPerImage: h }, [w, h]);
    return t;
  }

  upload(src: SourceInput, width: number, height: number, rotation: Rotation): void {
    this.rotation = rotation;
    const [ow, oh] = uprightSize(width, height, rotation);
    this.outputWidth = ow;
    this.outputHeight = oh;
    this.sizeCanvas(this.previewScale);
    if (!this.source || this.srcW !== width || this.srcH !== height) {
      this.source?.destroy();
      this.source = this.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.srcW = width;
      this.srcH = height;
      this.bindGroupDirty = true;
    }
    // VideoFrames: zero-copy external import (probed once; the probe renders
    // the frame small and checks it isn't black).
    this.extSource = null;
    if (isVideoFrame(src) && this.externalOk !== false) {
      this.srcW = width;
      this.srcH = height;
      if (this.externalOk === undefined) void this.probeExternal(src);
      if (this.externalOk) {
        this.extSource = src;
        this.bindGroupDirty = true;
        return;
      }
    }
    // copyExternalImageToTexture takes video elements, VideoFrames, bitmaps
    // and canvases directly, but some stacks reject video sources with a
    // validation error (not an exception). The first upload of each source
    // kind runs under an error scope; a failure switches that kind to the
    // 2D-canvas route for good.
    const kind = isVideoFrame(src) ? "frame" : src instanceof HTMLVideoElement ? "video" : "image";
    if (this.directUpload[kind] !== false) {
      const external = src as GPUCopyExternalImageSource;
      const probe = this.directUpload[kind] === undefined;
      if (probe) this.device.pushErrorScope("validation");
      try {
        this.device.queue.copyExternalImageToTexture({ source: external, flipY: false }, { texture: this.source, colorSpace: "srgb", premultipliedAlpha: false }, [width, height]);
        if (!probe) return;
      } catch {
        this.directUpload[kind] = false;
      }
      if (probe) {
        // The probe result arrives async; assume success until it says otherwise.
        this.directUpload[kind] = true;
        void this.device.popErrorScope().then((err) => {
          if (err) {
            console.warn(`WebGPU direct upload of ${kind} unsupported, using canvas copy:`, err.message);
            this.directUpload[kind] = false;
          }
        });
        return;
      }
    }
    if (!this.scratch || this.scratch.width !== width || this.scratch.height !== height) this.scratch = new OffscreenCanvas(width, height);
    const c2 = this.scratch.getContext("2d")!;
    c2.drawImage(src as CanvasImageSource, 0, 0, width, height);
    this.device.queue.copyExternalImageToTexture({ source: this.scratch }, { texture: this.source }, [width, height]);
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
    this.device.queue.writeBuffer(this.uniformBuf, 0, this.uniforms);
  }

  setData(slot: number, spec: DataTextureSpec): void {
    if (spec.data.length !== spec.width * spec.height * 4) throw new Error("data texture size mismatch");
    const cur = this.data[slot];
    if (cur.width !== spec.width || cur.height !== spec.height) {
      cur.destroy();
      this.data[slot] = this.makeDataTexture(spec.width, spec.height, spec.data);
      this.bindGroupDirty = true;
    } else {
      this.device.queue.writeTexture({ texture: cur }, spec.data, { bytesPerRow: spec.width * 16, rowsPerImage: spec.height }, [spec.width, spec.height]);
    }
  }

  private gradeGroup(): GPUBindGroup {
    if (this.extSource) {
      // External textures are per task: a fresh import and bind group per draw.
      return this.device.createBindGroup({
        layout: this.gradePipelineExt.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuf } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.device.importExternalTexture({ source: this.extSource }) },
          { binding: 3, resource: this.data[0].createView() },
          { binding: 4, resource: this.data[1].createView() },
          { binding: 5, resource: this.data[2].createView() },
        ],
      });
    }
    if (this.gradeBindGroup && !this.bindGroupDirty) return this.gradeBindGroup;
    if (!this.source) throw new Error("no source uploaded");
    this.gradeBindGroup = this.device.createBindGroup({
      layout: this.gradePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.source.createView() },
        { binding: 3, resource: this.data[0].createView() },
        { binding: 4, resource: this.data[1].createView() },
        { binding: 5, resource: this.data[2].createView() },
      ],
    });
    this.bindGroupDirty = false;
    return this.gradeBindGroup;
  }

  private draw(target: GPUTextureView): void {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: "clear", storeOp: "store" }] });
    pass.setPipeline(this.extSource ? this.gradePipelineExt : this.gradePipeline);
    pass.setBindGroup(0, this.gradeGroup());
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private downGroup(): GPUBindGroup {
    const srcEntry: GPUBindGroupEntry = this.extSource
      ? { binding: 2, resource: this.device.importExternalTexture({ source: this.extSource }) }
      : { binding: 2, resource: this.source!.createView() };
    return this.device.createBindGroup({
      layout: (this.extSource ? this.downPipelineExt : this.downPipeline).getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.downParamsBuf } }, { binding: 1, resource: this.sampler }, srcEntry],
    });
  }

  /** Renders the frame small through the external path and checks it isn't black. */
  private async probeExternal(frame: VideoFrame): Promise<void> {
    this.externalOk = false; // pessimistic until proven; this frame goes the copy route
    const w = 32, h = 18;
    const tex = this.device.createTexture({ size: [w, h], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const buf = this.device.createBuffer({ size: 256 * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      this.device.pushErrorScope("validation");
      this.device.queue.writeBuffer(this.downParamsBuf, 0, new Float32Array([frame.displayWidth, frame.displayHeight, w, h, 0, 0, 0, 0]));
      const group = this.device.createBindGroup({
        layout: this.downPipelineExt.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.downParamsBuf } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.device.importExternalTexture({ source: frame }) },
        ],
      });
      const enc = this.device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: "clear", storeOp: "store" }] });
      pass.setPipeline(this.downPipelineExt);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
      enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: 256 }, [w, h]);
      this.device.queue.submit([enc.finish()]);
      const err = await this.device.popErrorScope();
      if (err) throw new Error(err.message);
      await buf.mapAsync(GPUMapMode.READ);
      const px = new Uint8Array(buf.getMappedRange());
      let lit = false;
      for (let y = 0; y < h && !lit; y++) for (let x = 0; x < w * 4; x += 4) if (px[y * 256 + x] > 8 || px[y * 256 + x + 1] > 8 || px[y * 256 + x + 2] > 8) { lit = true; break; }
      buf.unmap();
      this.externalOk = lit;
      console.info(`WebGPU external video import: ${lit ? "ok" : "renders black, using copy path"}`);
    } catch (e) {
      console.warn("WebGPU external video import unavailable:", (e as Error).message);
      this.externalOk = false;
    } finally {
      tex.destroy();
      buf.destroy();
    }
  }

  render(): void {
    this.draw(this.ctx.getCurrentTexture().createView());
  }

  // How a rendered frame reaches the encoder. Browsers differ: a VideoFrame
  // from a WebGPU canvas is free on Chrome but black on some stacks, so the
  // first export frame probes canvas → bitmap → readback and keeps the first
  // path that produces a lit picture.
  private capture: "canvas" | "bitmap" | "readback" | null = null;
  // Readback ring: the exporter keeps two renders in flight, so a frame can
  // be mapping while the next one is copied into another slot.
  private readbackRing: { buffer: GPUBuffer; busy: boolean }[] = [];

  async renderToFrame(timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    const w = this.outputWidth;
    const h = this.outputHeight;
    if (!this.exportCanvas || this.exportCanvas.width !== w || this.exportCanvas.height !== h) {
      this.exportCanvas = new OffscreenCanvas(w, h);
      this.exportCtx = this.exportCanvas.getContext("webgpu") as GPUCanvasContext;
      this.exportCtx.configure({ device: this.device, format: this.format, alphaMode: "opaque", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      this.exportTex?.destroy();
      this.exportTex = this.device.createTexture({ size: [w, h], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      for (const r of this.readbackRing) r.buffer.destroy();
      this.readbackRing = [];
    }
    if (this.capture === null) await this.benchmarkCapture(timestampUs, durationUs);
    return this.captureAs(this.capture ?? "readback", timestampUs, durationUs);
  }

  /**
   * Times each capture path on the current frame (a few frames each) and
   * keeps the fastest one that produces a lit picture — the modes differ by
   * 10× between browsers. Runs on the copy path so the awaits inside don't
   * outlive an external texture import.
   */
  private async benchmarkCapture(timestampUs: number, durationUs: number | undefined): Promise<void> {
    const ext = this.extSource;
    if (ext) {
      this.extSource = null;
      this.externalOk = false; // force the copy route for the probe frame
      this.upload(ext, this.srcW, this.srcH, this.rotation);
      this.externalOk = true;
    }
    const N = 3;
    const results: string[] = [];
    let best: { mode: "canvas" | "bitmap" | "readback"; ms: number } | null = null;
    for (const mode of ["canvas", "bitmap", "readback"] as const) {
      try {
        let lit = false;
        const t0 = performance.now();
        for (let i = 0; i < N; i++) {
          const f = await this.captureAs(mode, timestampUs, durationUs);
          lit = lit || frameIsLit(f);
          f.close();
        }
        const ms = (performance.now() - t0) / N;
        results.push(`${mode} ${ms.toFixed(1)} ms${lit ? "" : " (black)"}`);
        if (lit && (!best || ms < best.ms)) best = { mode, ms };
      } catch (e) {
        results.push(`${mode} failed (${(e as Error).message.split("\n")[0].slice(0, 50)})`);
      }
    }
    this.capture = best?.mode ?? "readback";
    console.info(`WebGPU capture bench: ${results.join(", ")} → ${this.capture}`);
    if (ext) this.extSource = ext;
  }

  private async captureAs(mode: "canvas" | "bitmap" | "readback", timestampUs: number, durationUs: number | undefined): Promise<VideoFrame> {
    const w = this.outputWidth;
    const h = this.outputHeight;
    const t0 = performance.now();
    if (mode === "canvas" || mode === "bitmap") {
      this.draw(this.exportCtx!.getCurrentTexture().createView());
      const t1 = performance.now();
      try {
        if (mode === "canvas") return new VideoFrame(this.exportCanvas!, { timestamp: timestampUs, duration: durationUs });
        const bitmap = this.exportCanvas!.transferToImageBitmap();
        try {
          return new VideoFrame(bitmap, { timestamp: timestampUs, duration: durationUs });
        } finally {
          bitmap.close();
        }
      } finally {
        this.lastDrawMs = t1 - t0;
        this.lastCaptureMs = performance.now() - t1;
      }
    }
    // Readback through a tight RGBA8 buffer (rows repacked if padded).
    const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
    if (this.readbackRing.length === 0) {
      this.readbackRing = Array.from({ length: 3 }, () => ({
        buffer: this.device.createBuffer({ size: bytesPerRow * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
        busy: false,
      }));
    }
    let slot = this.readbackRing.find((r) => !r.busy);
    if (!slot) {
      // More renders in flight than slots: wait for the oldest map to finish.
      await new Promise<void>((r) => setTimeout(r, 1));
      while (!(slot = this.readbackRing.find((r) => !r.busy))) await new Promise<void>((r) => setTimeout(r, 1));
    }
    slot.busy = true;
    try {
      this.draw(this.exportTex!.createView());
      const enc = this.device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: this.exportTex! }, { buffer: slot.buffer, bytesPerRow }, [w, h]);
      this.device.queue.submit([enc.finish()]);
      const t1 = performance.now();
      this.lastDrawMs = t1 - t0;
      await slot.buffer.mapAsync(GPUMapMode.READ);
      this.lastCaptureMs = performance.now() - t1;
      try {
        const mapped = new Uint8Array(slot.buffer.getMappedRange());
        let tight: Uint8Array<ArrayBuffer>;
        if (bytesPerRow === w * 4) tight = new Uint8Array(mapped);
        else {
          tight = new Uint8Array(w * 4 * h);
          for (let y = 0; y < h; y++) tight.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + w * 4), y * w * 4);
        }
        return new VideoFrame(tight, { format: "RGBX", codedWidth: w, codedHeight: h, timestamp: timestampUs, duration: durationUs });
      } finally {
        slot.buffer.unmap();
      }
    } finally {
      slot.busy = false;
    }
  }

  async analyze(width: number, height: number): Promise<Uint8ClampedArray> {
    if (this.readbackInFlight) throw new Error("analysis readback already in flight");
    if (!this.source && !this.extSource) throw new Error("no source uploaded");
    this.readbackInFlight = true;
    try {
      if (!this.analysisTex || this.analysisW !== width || this.analysisH !== height) {
        this.analysisTex?.destroy();
        this.analysisBuf?.destroy();
        this.analysisTex = this.device.createTexture({ size: [width, height], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        this.analysisBytesPerRow = Math.ceil((width * 4) / 256) * 256;
        this.analysisBuf = this.device.createBuffer({ size: this.analysisBytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        this.analysisW = width;
        this.analysisH = height;
      }
      this.device.queue.writeBuffer(this.downParamsBuf, 0, new Float32Array([this.srcW, this.srcH, width, height, this.rotation, 0, 0, 0]));
      const group = this.downGroup();
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.analysisTex.createView(), loadOp: "clear", storeOp: "store" }] });
      pass.setPipeline(this.extSource ? this.downPipelineExt : this.downPipeline);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
      encoder.copyTextureToBuffer({ texture: this.analysisTex }, { buffer: this.analysisBuf!, bytesPerRow: this.analysisBytesPerRow }, [width, height]);
      this.device.queue.submit([encoder.finish()]);
      await this.analysisBuf!.mapAsync(GPUMapMode.READ);
      try {
        const mapped = new Uint8Array(this.analysisBuf!.getMappedRange());
        const out = new Uint8ClampedArray(width * height * 4);
        const rowBytes = width * 4;
        for (let y = 0; y < height; y++) out.set(mapped.subarray(y * this.analysisBytesPerRow, y * this.analysisBytesPerRow + rowBytes), y * rowBytes);
        return out;
      } finally {
        this.analysisBuf!.unmap();
      }
    } finally {
      this.readbackInFlight = false;
    }
  }

  dispose(): void {
    this.source?.destroy();
    for (const t of this.data) t.destroy();
    this.uniformBuf.destroy();
    this.downParamsBuf.destroy();
    this.analysisTex?.destroy();
    this.analysisBuf?.destroy();
    this.exportTex?.destroy();
    for (const r of this.readbackRing) r.buffer.destroy();
    this.device.destroy();
  }
}
