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
