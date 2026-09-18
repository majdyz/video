import { packUniforms, type WarpUniforms } from "./fisheye";
import { WARP_WGSL } from "./warp-shader";

export type WarpSource = HTMLVideoElement | VideoFrame;

/** One full-screen triangle that resamples an external texture through the fisheye inverse map. */
export class Warper {
  readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniforms: GPUBuffer;

  private constructor(device: GPUDevice, pipeline: GPURenderPipeline, sampler: GPUSampler, uniforms: GPUBuffer) {
    this.device = device;
    this.pipeline = pipeline;
    this.sampler = sampler;
    this.uniforms = uniforms;
  }

  static async create(): Promise<Warper> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("WebGPU adapter unavailable");
    const device = await adapter.requestDevice();
    const module = device.createShaderModule({ code: WARP_WGSL });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list" },
    });
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    const uniforms = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    return new Warper(device, pipeline, sampler, uniforms);
  }

  configureCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): GPUCanvasContext {
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) throw new Error("WebGPU canvas context unavailable");
    ctx.configure({ device: this.device, format: "rgba8unorm", alphaMode: "opaque" });
    return ctx;
  }

  /** Renders one frame into the context's current texture. The source must stay alive until this returns. */
  render(ctx: GPUCanvasContext, source: WarpSource, u: WarpUniforms): void {
    this.device.queue.writeBuffer(this.uniforms, 0, packUniforms(u));
    const external = this.device.importExternalTexture({ source });
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: external },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
