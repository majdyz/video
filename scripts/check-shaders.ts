// Shader guard: compiles every shader the engines build, in headless Chromium, and fails on any error.
//   pnpm check:shaders            (node --experimental-strip-types scripts/check-shaders.ts [repoRoot])
//
// WGSL: every exported WebGPU module of aqua-fix (incl. the external-texture variants) and dewarp goes
// through device.createShaderModule().getCompilationInfo(), then a render pipeline is built with the
// engine's real bind group layouts (WEBGPU_LAYOUTS), so an unresolved name (6ba39fb / toneWeight), a
// binding the layout lacks or a bad entry point fails here instead of as a black preview on Safari.
// The grade pipeline then draws one frame at strength 0 and must return the source colour.
// GLSL: every WebGL2 fragment shader is compiled and linked with its vertex shader.
// Vivid / subject pop / AI seg are uniform-driven (p[16], p[22], p[23], data texture 3), not compile-time
// variants, so each module above is the whole set the engines can generate.
//
// Needs Playwright's Chromium (SwiftShader WebGPU). Resolution: $PLAYWRIGHT_MODULE, the `playwright`
// package, then ~/browser/node_modules/playwright (the devbox install).
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const load = (rel: string) => import(pathToFileURL(path.join(root, rel)).href);

const shaders = await load("apps/aqua-fix/src/engine/shaders.ts");
const temporal = await load("apps/aqua-fix/src/engine/temporal.ts");
const { WEBGPU_LAYOUTS } = await load("apps/aqua-fix/src/engine/webgpu-layouts.ts");
const warp = await load("apps/dewarp/src/warp-shader.ts");
const dewarpGl = await load("apps/dewarp/src/webgl.ts");

type Wgsl = { name: string; code: string; layout?: string; targets?: string[] };
type Glsl = { name: string; vs: string; fs: string };

// Pipelines exactly as backend-webgpu.ts / dewarp gpu.ts build them (layout name → WEBGPU_LAYOUTS; none → "auto").
const wgsl: Wgsl[] = [
  { name: "aqua WGSL_GRADE", code: shaders.WGSL_GRADE, layout: "grade" },
  { name: "aqua WGSL_GRADE_EXT", code: shaders.WGSL_GRADE_EXT, layout: "gradeExt" },
  { name: "aqua WGSL_DOWNSCALE", code: shaders.WGSL_DOWNSCALE, layout: "down", targets: ["rgba8unorm"] },
  { name: "aqua WGSL_DOWNSCALE_EXT", code: shaders.WGSL_DOWNSCALE_EXT, layout: "downExt", targets: ["rgba8unorm"] },
  { name: "aqua WGSL_TP_LUM", code: temporal.WGSL_TP_LUM, layout: "down", targets: ["rgba16float"] },
  { name: "aqua tpExternal(WGSL_TP_LUM)", code: temporal.tpExternal(temporal.WGSL_TP_LUM), layout: "downExt", targets: ["rgba16float"] },
  { name: "aqua WGSL_TP_FLOW", code: temporal.WGSL_TP_FLOW, layout: "flow", targets: ["rgba16float"] },
  { name: "aqua WGSL_TP_FIELD", code: temporal.WGSL_TP_FIELD, layout: "field", targets: ["rgba16float", "rgba16float"] },
  { name: "aqua WGSL_COMPOSITE", code: shaders.WGSL_COMPOSITE, layout: "composite" },
  { name: "aqua WGSL_COMPOSITE_EXT", code: shaders.WGSL_COMPOSITE_EXT, layout: "compositeExt" },
  { name: "dewarp WARP_WGSL", code: warp.WARP_WGSL, targets: ["rgba8unorm"] },
  { name: "dewarp warpCopyVariant(WARP_WGSL)", code: warp.warpCopyVariant(warp.WARP_WGSL), targets: ["rgba8unorm"] },
];
// Any other exported full WGSL module (one with an entry point) is compiled too, so a new one can't slip past.
for (const [mod, ns] of [["aqua shaders", shaders], ["aqua temporal", temporal], ["dewarp", warp]] as const) {
  for (const [k, v] of Object.entries(ns)) {
    if (typeof v === "string" && /@(fragment|vertex|compute)\b/.test(v) && !wgsl.some((w) => w.code === v)) wgsl.push({ name: `${mod} ${k}`, code: v });
  }
}
const glsl: Glsl[] = [];
for (const ns of [shaders, temporal]) {
  for (const [k, v] of Object.entries(ns)) {
    if (k !== "GLSL_VERTEX" && typeof v === "string" && v.startsWith("#version 300 es")) glsl.push({ name: `aqua ${k}`, vs: shaders.GLSL_VERTEX, fs: v });
  }
}
glsl.push({ name: "dewarp WARP_GLSL_FS", vs: dewarpGl.WARP_GLSL_VS, fs: dewarpGl.WARP_GLSL_FS });

async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, "playwright", pathToFileURL(path.join(os.homedir(), "browser/node_modules/playwright/index.mjs")).href];
  for (const t of tries) {
    if (!t) continue;
    try { return await import(t); } catch { /* next */ }
  }
  throw new Error("Playwright not found (set PLAYWRIGHT_MODULE to its index.mjs)");
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan", "--ignore-gpu-blocklist"] });
let failures: string[] = [];
try {
  const page = await browser.newPage();
  // navigator.gpu needs a secure context: serve an empty page on a routed https origin (no network).
  await page.route("https://shader-check.invalid/**", (r: any) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>shader check</title>" }));
  await page.goto("https://shader-check.invalid/");
  failures = await page.evaluate(async ({ wgsl, glsl, layouts }: { wgsl: Wgsl[]; glsl: Glsl[]; layouts: Record<string, Record<string, string>> }) => {
    const out: string[] = [];
    const gpu = (navigator as any).gpu;
    const adapter = gpu && (await gpu.requestAdapter());
    if (!adapter) return ["WebGPU adapter unavailable in headless Chromium: cannot check WGSL"];
    const device = await adapter.requestDevice();
    const S = (globalThis as any).GPUShaderStage, T = (globalThis as any).GPUTextureUsage, B = (globalThis as any).GPUBufferUsage;
    const entry = (binding: number, kind: string) => {
      const visibility = S.FRAGMENT;
      switch (kind) {
        case "uniform": return { binding, visibility, buffer: { type: "uniform" } };
        case "sampler": return { binding, visibility, sampler: { type: "filtering" } };
        case "external": return { binding, visibility, externalTexture: {} };
        case "unfilterable": return { binding, visibility, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } };
        default: return { binding, visibility, texture: { sampleType: "float", viewDimension: "2d" } };
      }
    };
    const bgl = (name: string) => device.createBindGroupLayout({ entries: Object.entries(layouts[name]).map(([b, k]) => entry(Number(b), k)) });
    const fmt = gpu.getPreferredCanvasFormat();
    const pipes: Record<string, any> = {};
    for (const w of wgsl) {
      device.pushErrorScope("validation");
      const module = device.createShaderModule({ code: w.code });
      const info = await module.getCompilationInfo();
      const errs = info.messages.filter((m: any) => m.type === "error");
      const scoped = await device.popErrorScope();
      if (errs.length || scoped) {
        const lines = w.code.split("\n");
        out.push(`${w.name}: WGSL compile error\n` + (errs.length
          ? errs.map((m: any) => `  ${m.lineNum}:${m.linePos} ${m.message}\n    ${(lines[m.lineNum - 1] ?? "").trim()}`).join("\n")
          : `  ${scoped.message}`));
        continue;
      }
      if (!/@fragment/.test(w.code) || !/@vertex/.test(w.code)) continue;
      device.pushErrorScope("validation");
      const p = device.createRenderPipeline({
        layout: w.layout ? device.createPipelineLayout({ bindGroupLayouts: [bgl(w.layout)] }) : "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: (w.targets ?? [fmt]).map((format) => ({ format })) },
        primitive: { topology: "triangle-list" },
      });
      const perr = await device.popErrorScope();
      if (perr) out.push(`${w.name}: render pipeline invalid with its bind group layout${w.layout ? ` (${w.layout})` : ""}\n  ${perr.message}`);
      else pipes[w.name] = p;
    }

    // One grade draw at strength 0 (p[0].z): the grade returns the source, so the pixel must equal it.
    const gp = pipes["aqua WGSL_GRADE"];
    if (gp) {
      device.pushErrorScope("validation");
      const tex = (format: string, data?: ArrayBufferView, bpp = 16) => {
        const t = device.createTexture({ size: [1, 1], format, usage: T.TEXTURE_BINDING | T.COPY_DST });
        device.queue.writeTexture({ texture: t }, data ?? new Uint8Array(bpp), { bytesPerRow: bpp }, [1, 1]);
        return t;
      };
      const src = tex("rgba8unorm", new Uint8Array([200, 120, 40, 255]), 4);
      const data = () => tex("rgba32float", new Float32Array([1, 1, 1, 1]));
      const half = () => tex("rgba16float", new Uint16Array(4), 8);
      const ubuf = device.createBuffer({ size: 96 * 4, usage: B.UNIFORM | B.COPY_DST });
      const u = new Float32Array(96);
      u[2] = 0; // p[0].z strength
      device.queue.writeBuffer(ubuf, 0, u);
      const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
      const target = device.createTexture({ size: [4, 4], format: fmt, usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
      const views: Record<number, any> = { 2: src, 3: data(), 4: data(), 5: data(), 10: data(), 6: half(), 7: half(), 8: half(), 9: tex("rgba8unorm", new Uint8Array(4), 4) };
      const bg = device.createBindGroup({
        layout: gp.getBindGroupLayout(0),
        entries: Object.keys(layouts.grade).map(Number).map((b) => ({ binding: b, resource: b === 0 ? { buffer: ubuf } : b === 1 ? sampler : views[b].createView() })),
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(gp); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
      const rb = device.createBuffer({ size: 256 * 4, usage: B.COPY_DST | B.MAP_READ });
      enc.copyTextureToBuffer({ texture: target }, { buffer: rb, bytesPerRow: 256 }, [4, 4]);
      device.queue.submit([enc.finish()]);
      const derr = await device.popErrorScope();
      if (derr) out.push(`aqua WGSL_GRADE: draw failed validation\n  ${derr.message}`);
      else {
        await rb.mapAsync(1);
        const px = Array.from(new Uint8Array(rb.getMappedRange(), 0, 4));
        const want = fmt === "bgra8unorm" ? [40, 120, 200] : [200, 120, 40];
        if (want.some((v, i) => Math.abs(v - px[i]) > 2)) out.push(`aqua WGSL_GRADE: strength-0 draw returned ${px} (want ${want}, ${fmt})`);
      }
    }

    // GLSL (WebGL2).
    const gl = new OffscreenCanvas(4, 4).getContext("webgl2");
    if (!gl) out.push("WebGL2 unavailable in headless Chromium: cannot check GLSL");
    else for (const g of glsl) {
      const sh = (type: number, s: string) => {
        const o = gl.createShader(type)!;
        gl.shaderSource(o, s); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) out.push(`${g.name}: GLSL compile error\n  ${gl.getShaderInfoLog(o)}`);
        return o;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, g.vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, g.fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) out.push(`${g.name}: GLSL link error\n  ${gl.getProgramInfoLog(prog)}`);
    }
    device.destroy();
    return out;
  }, { wgsl, glsl, layouts: WEBGPU_LAYOUTS });
} finally {
  await browser.close();
}

const total = wgsl.length + glsl.length;
if (failures.length) {
  console.error(failures.join("\n\n"));
  console.error(`\ncheck:shaders FAILED (${failures.length} problem(s) across ${total} shaders)`);
  process.exit(1);
}
console.log(`check:shaders ok: ${wgsl.length} WGSL modules (compiled, pipelines built with their layouts, grade drawn) and ${glsl.length} GLSL programs`);
