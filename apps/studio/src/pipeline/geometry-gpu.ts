// The geometry pass (geometry.ts) for a colour engine on WebGPU: the same mesh
// and the same per-fragment dewarp in WGSL, rendered with the engine's device
// straight into its source texture, so the frame no longer goes WebGL texture
// → WebGL canvas → WebGPU copy. Decoded frames and the <video> element are
// imported (importExternalTexture, zero copy); stills are copied into a
// texture. Standard footage only: log / HDR transforms and the half-float
// upload stay on the WebGL pass (supports()). Not bit-identical to the WebGL
// pass: the browser converts and filters an imported frame its own way.
// Keep the maths in step with geometry.ts (FS) and geometry-math.ts.

import type { WarpUniforms } from "../../../dewarp/src/fisheye.ts";
import { stabilisedPoint, type GeometryParams } from "./geometry-math.ts";
import type { GeometryRenderOptions, GeometrySource } from "./geometry.ts";

const GRID_W = 32;
const GRID_H = 18;
const VW = GRID_W + 1;
const VH = GRID_H + 1;

const WGSL_TEX = /* wgsl */ `
struct U {
  a: vec4<f32>,   // rot, texCoded, dewarp, -
  b: vec4<f32>,   // srcSize.xy, fFish, fOut
  k: vec4<f32>,
  c: vec4<f32>,   // strength, zoom, projection, fy
  d: vec4<f32>,   // center.xy, thetaMax, -
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;
fn sampleSrc(uv: vec2<f32>) -> vec4<f32> { return textureSampleLevel(tex, samp, uv, 0.0); }

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) mid: vec2<f32> };
@vertex fn vs(@location(0) pos: vec2<f32>, @location(1) mid: vec2<f32>) -> VOut {
  var o: VOut;
  o.pos = vec4<f32>(pos, 0.0, 1.0);
  o.mid = mid;
  return o;
}
fn displayToCoded(d: vec2<f32>, rot: i32) -> vec2<f32> {
  if (rot == 1) { return vec2<f32>(d.y, 1.0 - d.x); }
  if (rot == 2) { return 1.0 - d; }
  if (rot == 3) { return vec2<f32>(1.0 - d.y, d.x); }
  return d;
}
fn codedToDisplay(c: vec2<f32>, rot: i32) -> vec2<f32> {
  if (rot == 1) { return vec2<f32>(1.0 - c.y, c.x); }
  if (rot == 2) { return 1.0 - c; }
  if (rot == 3) { return vec2<f32>(c.y, 1.0 - c.x); }
  return c;
}
fn dewarp(outPx: vec2<f32>) -> vec2<f32> {
  let srcSize = u.b.xy;
  let fFish = u.b.z; let fOut = u.b.w;
  let strength = u.c.x; let zoom = u.c.y; let projection = u.c.z; let fy = u.c.w;
  let center = u.d.xy; let thetaMax = u.d.z;
  let c = srcSize * 0.5;
  let p = (outPx - c) / zoom;
  let r = length(p);
  if (r < 0.5) { return mix(c, center, strength); }
  let theta0 = select(atan(r / fOut), 2.0 * atan(r / (2.0 * fOut)), projection > 0.5);
  let theta = min(theta0, thetaMax);
  let t2 = theta * theta;
  let td = theta * (1.0 + t2 * (u.k.x + t2 * (u.k.y + t2 * (u.k.z + t2 * u.k.w))));
  let fish = center + p / r * vec2<f32>(fFish, fy) * td;
  return mix(c + p, fish, strength);
}
@fragment fn fs(@location(0) mid: vec2<f32>) -> @location(0) vec4<f32> {
  let rot = i32(u.a.x + 0.5);
  var c = displayToCoded(mid, rot);
  if (u.a.z > 0.5) { c = dewarp(c * u.b.xy) / u.b.xy; }
  let outside = c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0;
  let uv = select(codedToDisplay(c, rot), c, u.a.y > 0.5);
  let s = sampleSrc(uv);
  return select(vec4<f32>(clamp(s.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0), vec4<f32>(0.0, 0.0, 0.0, 1.0), outside);
}`;

// The same pass reading an imported frame.
const WGSL_EXT = WGSL_TEX
  .replace("var tex: texture_2d<f32>;", "var tex: texture_external;")
  .replace("return textureSampleLevel(tex, samp, uv, 0.0);", "return textureSampleBaseClampToEdge(tex, samp, uv);");

type SourceKind = "frame" | "video" | "image";
function kindOf(src: GeometrySource): SourceKind {
  if (typeof VideoFrame !== "undefined" && src instanceof VideoFrame) return "frame";
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) return "video";
  return "image";
}

export class GpuGeometryRenderer {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly pipelineExt: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniformBuf: GPUBuffer;
  private readonly posBuf: GPUBuffer;
  private readonly midBuf: GPUBuffer;
  private readonly idxBuf: GPUBuffer;
  private readonly mid = new Float32Array(VW * VH * 2);
  private readonly u = new Float32Array(20);
  private input: GPUTexture | null = null;
  private group: GPUBindGroup | null = null;
  /**
   * Per source kind: does this device render it (probe())? Some stacks throw on the import, some hand back
   * an invalid or a black texture; until a kind is proven the caller uses the WebGL pass for it.
   */
  private readonly verdict: Record<SourceKind, boolean | undefined> = { frame: undefined, video: undefined, image: undefined };
  private readonly probing: Partial<Record<SourceKind, Promise<boolean>>> = {};

  constructor(device: GPUDevice) {
    this.device = device;
    const pipeline = (code: string) => {
      const module = device.createShaderModule({ code });
      return device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module,
          entryPoint: "vs",
          buffers: [
            { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
            { arrayStride: 8, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x2" }] },
          ],
        },
        fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
        primitive: { topology: "triangle-list" },
      });
    };
    this.pipeline = pipeline(WGSL_TEX);
    this.pipelineExt = pipeline(WGSL_EXT);
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    this.uniformBuf = device.createBuffer({ size: this.u.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const pos = new Float32Array(VW * VH * 2);
    for (let vy = 0, i = 0; vy < VH; vy++) {
      for (let vx = 0; vx < VW; vx++, i += 2) {
        pos[i] = (vx / GRID_W) * 2 - 1;
        pos[i + 1] = 1 - (vy / GRID_H) * 2;
      }
    }
    this.posBuf = device.createBuffer({ size: pos.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.posBuf, 0, pos);
    this.midBuf = device.createBuffer({ size: this.mid.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const idx = new Uint16Array(GRID_W * GRID_H * 6);
    for (let cy = 0, i = 0; cy < GRID_H; cy++) {
      for (let cx = 0; cx < GRID_W; cx++) {
        const v00 = cy * VW + cx, v10 = v00 + 1, v01 = v00 + VW, v11 = v01 + 1;
        idx.set([v00, v11, v10, v00, v01, v11], i);
        i += 6;
      }
    }
    this.idxBuf = device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.idxBuf, 0, idx);
  }

  /** What this pass renders: standard footage (no log / HDR transform, no half-float upload) and no compare split. */
  static supports(opts: GeometryRenderOptions): boolean {
    return !opts.footage && !opts.highPrecision && opts.split === null;
  }

  /**
   * Whether this device renders sources of `src`'s kind: the first one of
   * each kind is drawn small under a validation error scope and read back
   * (an error, an exception or an all-black picture fail it). The GPU work
   * is issued at once, so `src` may be closed when the promise settles.
   */
  probe(src: GeometrySource): Promise<boolean> {
    const kind = kindOf(src);
    const known = this.verdict[kind];
    if (known !== undefined) return Promise.resolve(known);
    const running = this.probing[kind];
    if (running) return running;
    const dev = this.device;
    const W = 16, H = 16;
    const tex = dev.createTexture({ size: [W, H], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const buf = dev.createBuffer({ size: 256 * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    dev.pushErrorScope("validation");
    let threw = false;
    try {
      this.draw(tex, src, { rot: 0, displayW: W, displayH: H, stab: null, dewarp: null }, { texCoded: false, split: null });
      const enc = dev.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: 256 }, [W, H]);
      dev.queue.submit([enc.finish()]);
    } catch {
      threw = true;
    }
    const verdict = (async () => {
      const err = await dev.popErrorScope();
      if (threw || err) return false;
      await buf.mapAsync(GPUMapMode.READ);
      const px = new Uint8Array(buf.getMappedRange());
      let lit = false;
      for (let y = 0; y < H && !lit; y++) for (let x = 0; x < W * 4; x += 4) if (px[y * 256 + x] > 8 || px[y * 256 + x + 1] > 8 || px[y * 256 + x + 2] > 8) { lit = true; break; }
      buf.unmap();
      return lit;
    })().catch(() => false).then((ok) => {
      this.verdict[kind] = ok;
      delete this.probing[kind];
      tex.destroy();
      buf.destroy();
      console.info(`[geometry] WebGPU pass for ${kind} sources: ${ok ? "ok" : "unavailable here, using the WebGL pass"}`);
      return ok;
    });
    this.probing[kind] = verdict;
    return verdict;
  }

  /**
   * Renders `src` through the geometry into `target` (rgba8unorm, the output
   * size). False (nothing drawn) while this device hasn't proven it renders
   * that kind of source (probe(), started here if needed).
   */
  render(target: GPUTexture, src: GeometrySource, p: GeometryParams, opts: GeometryRenderOptions): boolean {
    const kind = kindOf(src);
    if (this.verdict[kind] !== true) {
      if (this.verdict[kind] === undefined) void this.probe(src);
      return false;
    }
    try {
      this.draw(target, src, p, opts);
      return true;
    } catch (err) {
      console.warn(`[geometry] WebGPU pass failed for a ${kind} source (${err instanceof Error ? err.message : err}); using the WebGL pass`);
      this.verdict[kind] = false;
      return false;
    }
  }

  /** Imports or copies `src` and draws it through the geometry into `target`; throws when the device can't take it. */
  private draw(target: GPUTexture, src: GeometrySource, p: GeometryParams, opts: GeometryRenderOptions): void {
    const dev = this.device;
    // Decoded frames and the <video> element: imported (valid for this task only, so a bind group per draw).
    const external = kindOf(src) !== "image";
    let group: GPUBindGroup;
    if (external) {
      group = dev.createBindGroup({
        layout: this.pipelineExt.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: dev.importExternalTexture({ source: src as VideoFrame | HTMLVideoElement }) }],
      });
    } else {
      const w = Math.max(1, Math.round((src as ImageBitmap).width)), h = Math.max(1, Math.round((src as ImageBitmap).height));
      if (!this.input || this.input.width !== w || this.input.height !== h) {
        this.input?.destroy();
        this.input = dev.createTexture({ size: [w, h], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        this.group = dev.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: this.input.createView() }],
        });
      }
      dev.queue.copyExternalImageToTexture({ source: src as GPUCopyExternalImageSource, flipY: false }, { texture: this.input, colorSpace: "srgb", premultipliedAlpha: false }, [w, h]);
      group = this.group!;
    }
    for (let vy = 0, i = 0; vy < VH; vy++) {
      for (let vx = 0; vx < VW; vx++, i += 2) {
        const [mx, my] = stabilisedPoint(vx / GRID_W, vy / GRID_H, p);
        this.mid[i] = mx;
        this.mid[i + 1] = my;
      }
    }
    dev.queue.writeBuffer(this.midBuf, 0, this.mid);
    const d: WarpUniforms | null = p.dewarp;
    const u = this.u;
    u.fill(0);
    u[0] = p.rot;
    u[1] = opts.texCoded ? 1 : 0;
    u[2] = d ? 1 : 0;
    if (d) {
      u.set([d.srcSize[0], d.srcSize[1], d.fFish, d.fOut], 4);
      u.set([d.k[0], d.k[1], d.k[2], d.k[3]], 8);
      u.set([d.strength, d.zoom, d.projection, d.fy], 12);
      u.set([d.center[0], d.center[1], d.thetaMax, 0], 16);
    }
    dev.queue.writeBuffer(this.uniformBuf, 0, u);
    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
    pass.setPipeline(external ? this.pipelineExt : this.pipeline);
    pass.setBindGroup(0, group);
    pass.setVertexBuffer(0, this.posBuf);
    pass.setVertexBuffer(1, this.midBuf);
    pass.setIndexBuffer(this.idxBuf, "uint16");
    pass.drawIndexed(GRID_W * GRID_H * 6);
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  dispose(): void {
    this.input?.destroy();
    for (const b of [this.uniformBuf, this.posBuf, this.midBuf, this.idxBuf]) b.destroy();
  }
}
