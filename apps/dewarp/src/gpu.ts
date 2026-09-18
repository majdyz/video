import { packUniforms, type WarpUniforms } from "./fisheye";
import { WARP_WGSL } from "./warp-shader";
import { GlWarper } from "./webgl";

export type WarpSource = HTMLVideoElement | VideoFrame;
export type WarpMode = "external" | "copy";
/** How a warped frame reaches the encoder: straight from the WebGPU canvas, via an ImageBitmap, from a WebGL2 canvas, or a texture readback. */
export type CaptureMode = "canvas" | "bitmap" | "webgl" | "readback";

const PROBE_SIZE = 64;
const BENCH_FRAMES = 3;

function sourceSize(source: WarpSource): [number, number] {
  return source instanceof VideoFrame
    ? [source.displayWidth, source.displayHeight]
    : [source.videoWidth, source.videoHeight];
}

/** Draws the frame small into a 2D canvas and looks for anything above black. Works where copyTo() does not. */
function frameIsLit(frame: VideoFrame): boolean {
  const c = new OffscreenCanvas(32, 32);
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(frame, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 24 || px[i + 1] > 24 || px[i + 2] > 24) return true;
  }
  return false;
}

/**
 * One full-screen triangle that resamples a video frame through the fisheye inverse map.
 * The input path (zero-copy "external" import, or "copy" through a 2D canvas) and the output
 * path (which CaptureMode) are chosen once on the first frame by rendering and reading pixels
 * back, since a failed import or capture does not surface as an error, and the capture modes
 * differ by 10x between browsers, so the fastest lit one wins.
 */
export class Warper {
  readonly device: GPUDevice;
  mode: WarpMode = "external";
  capture: CaptureMode = "canvas";
  /** Milliseconds spent in the last renderToFrame, split for the pipeline's timing report. */
  lastDrawMs = 0;
  lastCaptureMs = 0;
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
  private gl: GlWarper | undefined;
  private decided = false;
  private deciding: Promise<{ mode: WarpMode; capture: CaptureMode }> | undefined;

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

  /** Decides the input and output paths from one frame. Safe to call repeatedly and concurrently. */
  async ensureModes(source: WarpSource, u: WarpUniforms, log: (line: string) => void = () => {}): Promise<{ mode: WarpMode; capture: CaptureMode }> {
    if (this.decided) return { mode: this.mode, capture: this.capture };
    if (this.deciding) return this.deciding;
    this.deciding = this.decideModes(source, u, log);
    try {
      return await this.deciding;
    } finally {
      this.deciding = undefined;
    }
  }

  private async decideModes(source: WarpSource, u: WarpUniforms, log: (line: string) => void): Promise<{ mode: WarpMode; capture: CaptureMode }> {
    const identity = { ...u, strength: 0, zoom: 1 };
    const externalLit = await this.probeInput(source, identity, "external");
    const copyLit = externalLit ? undefined : await this.probeInput(source, identity, "copy");
    if (!externalLit && copyLit) this.mode = "copy";
    const [width, height] = sourceSize(source);
    this.prepareOutput(width, height);

    // Time each capture mode at the real output size; the fastest one that produces a picture wins.
    const results: string[] = [];
    let best: { capture: CaptureMode; ms: number } | undefined;
    for (const capture of ["canvas", "bitmap", "webgl", "readback"] as CaptureMode[]) {
      try {
        let lit = false;
        const t0 = performance.now();
        for (let i = 0; i < BENCH_FRAMES; i++) {
          const f = await this.renderToFrame(source, identity, 0, undefined, capture);
          if (i === BENCH_FRAMES - 1) lit = frameIsLit(f);
          f.close();
        }
        const ms = (performance.now() - t0) / BENCH_FRAMES;
        results.push(`${capture} ${ms.toFixed(0)} ms${lit ? "" : " (black)"}`);
        if (lit && (!best || ms < best.ms)) best = { capture, ms };
      } catch (e) {
        results.push(`${capture} failed (${(e as Error).message.split("\n")[0].slice(0, 60)})`);
      }
    }
    if (best) this.capture = best.capture;
    log(`capture bench at ${width}x${height}: ${results.join(", ")} -> ${this.capture}`);
    log(`GPU probe: external=${externalLit} copy=${copyLit ?? "skipped"} -> ${this.mode}/${this.capture}`);
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
    const t0 = performance.now();
    if (capture === "webgl") {
      if (!this.gl || this.gl.canvas.width !== this.outCanvas.width || this.gl.canvas.height !== this.outCanvas.height) {
        this.gl = new GlWarper(this.outCanvas.width, this.outCanvas.height);
      }
      this.gl.render(source, u);
      const t1 = performance.now();
      const frame = new VideoFrame(this.gl.canvas, { timestamp, duration });
      this.lastDrawMs = t1 - t0;
      this.lastCaptureMs = performance.now() - t1;
      return frame;
    }
    if (capture === "canvas" || capture === "bitmap") {
      this.draw(this.outCtx.getCurrentTexture().createView(), source, u, this.mode);
      const t1 = performance.now();
      let frame: VideoFrame;
      if (capture === "canvas") {
        frame = new VideoFrame(this.outCanvas, { timestamp, duration });
      } else {
        const bitmap = this.outCanvas.transferToImageBitmap();
        try {
          frame = new VideoFrame(bitmap, { timestamp, duration });
        } finally {
          bitmap.close();
        }
      }
      this.lastDrawMs = t1 - t0;
      this.lastCaptureMs = performance.now() - t1;
      return frame;
    }
    const { width, height } = this.outTexture;
    this.draw(this.outTexture.createView(), source, u, this.mode);
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: this.outTexture }, { buffer: this.outBuffer, bytesPerRow: this.outBytesPerRow }, [width, height]);
    this.device.queue.submit([encoder.finish()]);
    const t1 = performance.now();
    await this.outBuffer.mapAsync(GPUMapMode.READ);
    try {
      const frame = new VideoFrame(this.outBuffer.getMappedRange(), {
        format: "RGBX",
        codedWidth: width,
        codedHeight: height,
        timestamp,
        duration,
        layout: [{ offset: 0, stride: this.outBytesPerRow }],
      });
      this.lastDrawMs = t1 - t0;
      this.lastCaptureMs = performance.now() - t1;
      return frame;
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
