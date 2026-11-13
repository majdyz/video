import { useMemo, useSyncExternalStore } from "react";

/** Live `matchMedia(query).matches`. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", fn);
      return () => m.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Live window size in CSS px (the phone layout is picked from it: ui/layout.ts). */
export function useViewport(): { w: number; h: number } {
  const key = useSyncExternalStore(
    (fn) => {
      window.addEventListener("resize", fn);
      window.addEventListener("orientationchange", fn);
      return () => {
        window.removeEventListener("resize", fn);
        window.removeEventListener("orientationchange", fn);
      };
    },
    () => `${window.innerWidth}x${window.innerHeight}`,
  );
  return useMemo(() => {
    const [w, h] = key.split("x").map(Number);
    return { w, h };
  }, [key]);
}
