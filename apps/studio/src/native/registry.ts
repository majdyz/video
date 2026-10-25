// Which Files came from the native picker (and where their sandbox copy is).
// Kept free of @capacitor imports so the main chunk can ask cheaply.

export type NativeFileRef = { path: string; name: string; mime: string; size: number };

const byFile = new WeakMap<File, NativeFileRef>();

export function rememberNativeFile(file: File, ref: NativeFileRef): void {
  byFile.set(file, ref);
}

export function nativeFileOf(file: File | null): NativeFileRef | null {
  return file ? byFile.get(file) ?? null : null;
}

/** True inside the Capacitor shell (the native bridge injects window.Capacitor before the page runs). */
export function isNativeShell(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  return typeof cap.getPlatform === "function" && cap.getPlatform() !== "web";
}
