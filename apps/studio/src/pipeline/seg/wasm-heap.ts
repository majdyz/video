// The WASM heap size of onnxruntime-web (seg-worker), for the AI breadcrumbs: ORT keeps its module private, so the
// worker notes every WebAssembly.Memory made in it (emscripten makes the heap in JS: initial 16 MB, grows on demand
// and never shrinks). The runtime makes it at its first session, after this module has run.
const heaps: WebAssembly.Memory[] = [];

try {
  const Native = WebAssembly.Memory;
  const Hooked = function (this: unknown, d: WebAssembly.MemoryDescriptor) {
    const m = new Native(d);
    heaps.push(m);
    return m;
  } as unknown as typeof WebAssembly.Memory;
  Hooked.prototype = Native.prototype;
  (WebAssembly as { Memory: typeof WebAssembly.Memory }).Memory = Hooked;
} catch { /* no WebAssembly */ }

/** The largest WASM heap in this worker (MB; ORT's), 0 before the runtime starts. */
export function wasmHeapMB(): number {
  let b = 0;
  for (const m of heaps) b = Math.max(b, m.buffer.byteLength);
  return Math.round(b / 2 ** 20);
}
