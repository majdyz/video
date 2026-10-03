// Browser capability probe shared by the apps. Each flag says whether the
// gap costs *quality* or only *speed*, so the banner can be honest about it:
//  - WebGPU: speed only. The colour / warp maths is identical on WebGL2.
//  - WebCodecs: needed to save video (offline decode → grade → encode with
//    exact frames and the original audio). Without it saving is disabled.
//  - WASM SIMD / threads: speed only (analysis + on-device models).

export type Capabilities = {
  webgpu: boolean;
  webgl2: boolean;
  webcodecs: boolean;
  wasmSimd: boolean;
  wasmThreads: boolean;
  secureContext: boolean;
  /** Human-readable notes, one per gap, worst first. */
  notes: CapabilityNote[];
};

export type CapabilityNote = {
  key: "webgpu" | "webcodecs" | "webgl2" | "wasmSimd";
  impact: "quality" | "speed" | "fatal";
  message: string;
};

let probePromise: Promise<Capabilities> | null = null;

function hasWebGL2(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

function hasWasmSimd(): boolean {
  // Smallest valid module using v128 (from the wasm-feature-detect project).
  try {
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]));
  } catch {
    return false;
  }
}

function hasWasmThreads(): boolean {
  try {
    return typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined";
  } catch {
    return false;
  }
}

async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

export function probeCapabilities(): Promise<Capabilities> {
  if (probePromise) return probePromise;
  probePromise = (async () => {
    const webgl2 = hasWebGL2();
    const webgpu = await hasWebGPU();
    const webcodecs = typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
    const wasmSimd = hasWasmSimd();
    const wasmThreads = hasWasmThreads();
    const notes: CapabilityNote[] = [];
    if (!webgl2 && !webgpu) {
      notes.push({ key: "webgl2", impact: "fatal", message: "No GPU access (WebGL2 or WebGPU). The app can't render here." });
    }
    if (!webcodecs) {
      notes.push({
        key: "webcodecs",
        impact: "quality",
        message:
          "WebCodecs isn't available here, so saving video is disabled (preview still works). Update to the latest Safari / Chrome for exact, faster-than-realtime export.",
      });
    }
    if (!webgpu && webgl2) {
      notes.push({
        key: "webgpu",
        impact: "speed",
        message: "WebGPU isn't available — running on WebGL2. Same image quality, but preview and export are slower on 4K clips.",
      });
    }
    if (!wasmSimd) {
      notes.push({ key: "wasmSimd", impact: "speed", message: "WebAssembly SIMD is off — motion analysis will be slower." });
    }
    return { webgpu, webgl2, webcodecs, wasmSimd, wasmThreads, secureContext: window.isSecureContext, notes };
  })();
  return probePromise;
}
