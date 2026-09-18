import { packUniforms, type WarpUniforms } from "./fisheye";
import { WARP_WGSL } from "./warp-shader";

export type WarpSource = HTMLVideoElement | VideoFrame;
export type WarpMode = "external" | "copy";
export type CaptureMode = "canvas" | "readback";

const PROBE_SIZE = 64;

function sourceSize(source: WarpSource): [number, number] {
  return source instanceof VideoFrame
    ? [source.displayWidth, source.displayHeight]
    : [source.videoWidth, source.videoHeight];
}

async function frameIsLit(frame: VideoFrame): Promise<boolean> {
  const buf = new Uint8Array(frame.allocationSize());
  const layout = await frame.copyTo(buf);
  const stride = layout[0]?.stride ?? frame.codedWidth * 4;
  // Sample a few rows of the first plane; any signal above black counts.
  for (let y = 0; y < frame.codedHeight; y += Math.max(1, frame.codedHeight >> 5)) {
    const row = (layout[0]?.offset ?? 0) + y * stride;
    for (let x = 0; x < stride; x += 7) if (buf[row + x] > 24) return true;
  }
  return false;
}

/**
 * One full-screen triangle that resamples a video frame through the fisheye inverse map.
 * Two decisions are made once, on the first frame, by rendering and reading pixels back,
 * because a failed video import or canvas capture does not surface as a catchable error:
 * how a frame gets in ("external" zero-copy import, or "copy" through a 2D canvas) and how
 * the result gets out ("canvas" capture into a VideoFrame, or a texture "readback").
 */
export class Warper {
  readonly device: GPUDevice;
  mode: WarpMode = "external";
  capture: CaptureMode = "canvas";
  private readonly external: GPURenderPipeline;
  private readonly copy: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniforms: GPUBuffer;
  private staging: GPUTexture | undefined;
  private scratch: OffscreenCanvas | undefined;
  private outCanvas: OffscreenCanvas | undefined;
  private outCtx: GPUCanvasContext | undefined;
  private outTexture: GPUTexture | undefined;
  private outBuffer: GPUBuffer | undefined;
  private outBytesPerRow = 0;
  private decided = false;

  private constructor(device: GPUDevice, external: GPURenderPipeline, copy: GPURenderPipeline, sampler: GPUSampler, uniforms: GPUBuffer) {
    this.device = device;
    this.external = external;
    this.copy = copy;
    this.sampler = sampler;
    this.uniforms = uniforms;
  }

  static async create(): Promise<Warper> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("WebGPU adapter unavailable");
    const device = await adapter.requestDevice();
    device.addEventListener("uncapturederror", e => {
      console.error("WebGPU:", (e as GPUUncapturedErrorEvent).error.message);
    });
    const pipeline = (code: string) =>
      device.createRenderPipeline({
        layout: "auto",
        vertex: { module: device.createShaderModule({ code }), entryPoint: "vs" },
        fragment: { module: device.createShaderModule({ code }), entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
        primitive: { topology: "triangle-list" },
      });
    const external = pipeline(WARP_WGSL);
    const copy = pipeline(
      WARP_WGSL.replace("var src: texture_external;", "var src: texture_2d<f32>;").replaceAll(
        /textureSampleBaseClampToEdge\(src, samp, ([^)]*)\)/g,
        "textureSampleLevel(src, samp, $1, 0.0)"
      )
    );
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const uniforms = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    return new Warper(device, external, copy, sampler, uniforms);
  }

  configureCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): GPUCanvasContext {
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) throw new Error("WebGPU canvas context unavailable");
    ctx.configure({ device: this.device, format: "rgba8unorm", alphaMode: "opaque" });
    return ctx;
  }

  /** Decides the input and output paths from one frame. A frame that is genuinely black keeps the defaults. */
  async ensureModes(source: WarpSource, u: WarpUniforms): Promise<{ mode: WarpMode; capture: CaptureMode }> {
    if (this.decided) return { mode: this.mode, capture: this.capture };
    if (this.deciding) return this.deciding;
    this.deciding = this.decideModes(source, u);
    try {
      return await this.deciding;
    } finally {
      this.deciding = undefined;
    }
  }

  private deciding: Promise<{ mode: WarpMode; capture: CaptureMode }> | undefined;

  private async decideModes(source: WarpSource, u: WarpUniforms): Promise<{ mode: WarpMode; capture: CaptureMode }> {
    const identity = { ...u, strength: 0, zoom: 1 };
    const externalLit = await this.probeInput(source, identity, "external");
    const copyLit = externalLit ? undefined : await this.probeInput(source, identity, "copy");
    if (!externalLit && copyLit) this.mode = "copy";
    const [width, height] = sourceSize(source);
    this.prepareOutput(width, height);
    let canvasLit = false;
    try {
      const f = await this.renderToFrame(source, identity, 0, undefined, "canvas");
      canvasLit = await frameIsLit(f);
      f.close();
    } catch (e) {
      console.warn("Canvas capture failed:", (e as Error).message);
    }
    if (!canvasLit && (externalLit || copyLit)) this.capture = "readback";
    console.warn(`WebGPU probe: external=${externalLit} copy=${copyLit ?? "skipped"} canvasCapture=${canvasLit} -> ${this.mode}/${this.capture}`);
    this.decided = true;
    return { mode: this.mode, capture: this.capture };
  }

  /** Renders one frame into a visible canvas. The source must stay alive until this returns. */
  render(ctx: GPUCanvasContext, source: WarpSource, u: WarpUniforms): void {
    this.draw(ctx.getCurrentTexture().createView(), source, u, this.mode);
  }

  /** Allocates the export-sized output targets. */
  prepareOutput(width: number, height: number): void {
    if (this.outCanvas && this.outCanvas.width === width && this.outCanvas.height === height) return;
    this.outCanvas = new OffscreenCanvas(width, height);
    this.outCtx = this.configureCanvas(this.outCanvas);
    this.outTexture?.destroy();
    this.outTexture = this.device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    this.outBytesPerRow = Math.ceil((width * 4) / 256) * 256;
    this.outBuffer?.destroy();
    this.outBuffer = this.device.createBuffer({
      size: this.outBytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  /** Warps one frame and hands back a VideoFrame for the encoder. Call prepareOutput first. */
  async renderToFrame(source: WarpSource, u: WarpUniforms, timestamp: number, duration: number | undefined, capture = this.capture): Promise<VideoFrame> {
    if (!this.outCanvas || !this.outCtx || !this.outTexture || !this.outBuffer) throw new Error("prepareOutput was not called");
    if (capture === "canvas") {
      this.draw(this.outCtx.getCurrentTexture().createView(), source, u, this.mode);
      return new VideoFrame(this.outCanvas, { timestamp, duration });
    }
    const { width, height } = this.outTexture;
    this.draw(this.outTexture.createView(), source, u, this.mode);
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: this.outTexture }, { buffer: this.outBuffer, bytesPerRow: this.outBytesPerRow }, [width, height]);
    this.device.queue.submit([encoder.finish()]);
    await this.outBuffer.mapAsync(GPUMapMode.READ);
    try {
      return new VideoFrame(this.outBuffer.getMappedRange(), {
        format: "RGBX",
        codedWidth: width,
        codedHeight: height,
        timestamp,
        duration,
        layout: [{ offset: 0, stride: this.outBytesPerRow }],
      });
    } finally {
      this.outBuffer.unmap();
    }
  }

  private async probeInput(source: WarpSource, u: WarpUniforms, mode: WarpMode): Promise<boolean> {
    const texture = this.device.createTexture({
      size: [PROBE_SIZE, PROBE_SIZE],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = PROBE_SIZE * 4;
    const readback = this.device.createBuffer({ size: bytesPerRow * PROBE_SIZE, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      this.draw(texture.createView(), source, u, mode);
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow }, [PROBE_SIZE, PROBE_SIZE]);
      this.device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const px = new Uint8Array(readback.getMappedRange());
      let lit = false;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 8 || px[i + 1] > 8 || px[i + 2] > 8) { lit = true; break; }
      }
      readback.unmap();
      return lit;
    } catch (e) {
      console.warn(`WebGPU ${mode} probe failed:`, (e as Error).message);
      return false;
    } finally {
      readback.destroy();
      texture.destroy();
    }
  }

  private draw(target: GPUTextureView, source: WarpSource, u: WarpUniforms, mode: WarpMode): void {
    this.device.queue.writeBuffer(this.uniforms, 0, packUniforms(u));
    const pipeline = mode === "external" ? this.external : this.copy;
    const view = mode === "external" ? this.device.importExternalTexture({ source }) : this.upload(source).createView();
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: view },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private upload(source: WarpSource): GPUTexture {
    const [width, height] = sourceSize(source);
    if (!this.staging || this.staging.width !== width || this.staging.height !== height) {
      this.staging?.destroy();
      this.staging = this.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    // Through a 2D canvas: drawImage accepts a video frame everywhere, a direct video upload does not.
    if (!this.scratch || this.scratch.width !== width || this.scratch.height !== height) {
      this.scratch = new OffscreenCanvas(width, height);
    }
    const ctx2d = this.scratch.getContext("2d");
    if (!ctx2d) throw new Error("2D canvas unavailable");
    ctx2d.drawImage(source, 0, 0, width, height);
    this.device.queue.copyExternalImageToTexture({ source: this.scratch }, { texture: this.staging }, [width, height]);
    return this.staging;
  }
}
