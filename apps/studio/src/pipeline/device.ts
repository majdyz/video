// Is this a phone the AI subject model is a poor fit for? The model (EdgeTAM, 33 MB) is the heaviest thing the app
// runs: on iPhone WebKit it is the lite encoder on single-threaded WASM unless the page is cross-origin isolated, and
// a phone with little memory is where its encode killed the page. Only the default hint changes with this (Subjects
// says why AI is off and the user can turn it on); desktops are never "weak".

export type DeviceFacts = {
  ua: string;
  /** navigator.deviceMemory (GB, Chromium only, rounded and capped at 8); undefined where the browser hides it. */
  memory?: number;
  /** navigator.hardwareConcurrency; 0 / undefined when unknown. */
  cores?: number;
  /** navigator.maxTouchPoints (an iPad reports a Mac user agent). */
  touch?: number;
  /** window.crossOriginIsolated (multi-threaded WASM). */
  coi?: boolean;
};

export function isIOS(f: Pick<DeviceFacts, "ua" | "touch">): boolean {
  return /iPhone|iPad|iPod/.test(f.ua) || (/Macintosh/.test(f.ua) && (f.touch ?? 0) > 1);
}

export function isMobile(f: Pick<DeviceFacts, "ua" | "touch">): boolean {
  return isIOS(f) || /Android|Mobi/.test(f.ua);
}

/**
 * A phone or tablet with under 4 GB of memory (where the browser says), 4 cores or fewer, or iOS without cross-origin
 * isolation (WebKit: single-threaded WASM, the lite model).
 */
export function weakDevice(f: DeviceFacts): boolean {
  if (!isMobile(f)) return false;
  if (f.memory !== undefined && f.memory > 0 && f.memory < 4) return true;
  if (f.cores !== undefined && f.cores > 0 && f.cores <= 4) return true;
  return isIOS(f) && !f.coi;
}

/**
 * WASM threads for the AI model (onnxruntime-web). One without cross-origin isolation (no shared memory). One on
 * iOS whatever the isolation: every thread there is a full Web Worker that loads the whole runtime, the pass's
 * 1.37 GB peak was measured with four of them on a desktop and never with one, and iPhone Safari kills a tab around
 * there; what four threads cost on a phone is unmeasured, so iOS stays at one until a device says otherwise. It also
 * makes a user's first visit (not isolated yet) and their later ones behave alike. `force` (`?segthreads=N`, 1..4)
 * is for that measurement; it cannot add threads without isolation.
 */
export function segThreads(f: Pick<DeviceFacts, "ua" | "touch" | "cores" | "coi">, force?: number | null): number {
  if (!f.coi) return 1;
  if (force && Number.isFinite(force)) return Math.min(4, Math.max(1, Math.round(force)));
  if (isIOS(f)) return 1;
  return Math.min(4, f.cores || 1);
}

/** Safari / any WebKit browser (iPhone browsers all are). */
export function isWebKitUA(ua: string): boolean {
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
}

/**
 * Safari's major version from the user agent's "Version/26.0" token (null: none). On iOS this is the system's
 * version: the "iPhone OS 18_7" next to it is frozen (iOS 26 still says 18_6 / 18_7) and says nothing. Chrome and
 * Firefox on iOS (CriOS, FxiOS) and a page on the home screen carry no Version token: unknown.
 */
export function safariVersion(ua: string): number | null {
  const m = /\bVersion\/(\d+)/.exec(ua);
  return m ? Number(m[1]) : null;
}

/** WebKit runs the AI model on WebGPU by default from this Safari / iOS version (segRuntime). */
export const SEG_WEBKIT_GPU_FROM = 26;

/**
 * What the AI model runs on here (studio-seg.ts ensureModel). Pure.
 *   wasm   the plain WASM runtime, no WebGPU. No navigator.gpu; `?seggpu=0`; a page that died with the model on
 *          the GPU before (avoidGpu, kept per device); WebKit before Safari / iOS 26 (WebGPU there crashed the page
 *          on its first frames, 31 Oct) or of unknown version.
 *   lite   the 512-px encoder: WebKit always, on WebGPU too (the 1024 one's activations are the memory peak, and a
 *          phone's GPU memory is the page's), and a phone that fell back to WASM after a crash.
 * `?seggpu=1` puts the model on WebGPU wherever there is one, whatever the version and the crash before.
 */
export function segRuntime(o: { ua: string; gpu: boolean; param: string | null; avoidGpu: boolean; mobile?: boolean }): { wasm: boolean; lite: boolean; why: string } {
  const webkit = isWebKitUA(o.ua), v = safariVersion(o.ua);
  let wasm: boolean, why: string;
  if (!o.gpu) { wasm = true; why = "no WebGPU"; }
  else if (o.param === "0") { wasm = true; why = "seggpu=0"; }
  else if (o.param === "1") { wasm = false; why = "seggpu=1"; }
  else if (o.avoidGpu) { wasm = true; why = "crashed on WebGPU before"; }
  else if (webkit && !(v !== null && v >= SEG_WEBKIT_GPU_FROM)) { wasm = true; why = v === null ? "WebKit, version unknown" : `Safari ${v}`; }
  else { wasm = false; why = webkit ? `Safari ${v}` : "default"; }
  return { wasm, lite: webkit || (wasm && o.avoidGpu && !!o.mobile), why };
}

export function deviceFacts(): DeviceFacts {
  const n = navigator as Navigator & { deviceMemory?: number };
  return { ua: n.userAgent, memory: n.deviceMemory, cores: n.hardwareConcurrency, touch: n.maxTouchPoints, coi: typeof crossOriginIsolated !== "undefined" && crossOriginIsolated };
}

let weak: boolean | null = null;
/** weakDevice for this browser (`?weak=1|0` overrides it for checks). */
export function isWeakDevice(): boolean {
  if (weak !== null) return weak;
  try {
    const q = new URLSearchParams(location.search).get("weak");
    weak = q === "1" ? true : q === "0" ? false : weakDevice(deviceFacts());
  } catch {
    weak = false;
  }
  return weak;
}
