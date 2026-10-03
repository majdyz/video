import { useEffect, useState } from "react";
import { probeCapabilities, type Capabilities } from "./capabilities";

/**
 * Informational strip listing what this browser can't do and whether that
 * costs quality or only speed. Hidden when everything is available.
 * Dismissal is remembered per session.
 */
export function CapabilityBanner({ storageKey = "capnote-dismissed" }: { storageKey?: string }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    probeCapabilities().then(setCaps).catch(() => undefined);
  }, []);
  if (!caps || caps.notes.length === 0 || dismissed) return null;
  const fatal = caps.notes.some((n) => n.impact === "fatal");
  return (
    <div className="capnote" role="status">
      <div className="capnote-head">
        <strong>{fatal ? "This browser can't run the app" : "About this browser"}</strong>
        {!fatal && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(storageKey, "1");
              } catch {
                // ignore
              }
            }}
          >
            ×
          </button>
        )}
      </div>
      {caps.notes.map((n) => (
        <div className="capnote-row" key={n.key}>
          <span className={`capnote-tag ${n.impact}`}>
            {n.impact === "quality" ? "quality" : n.impact === "speed" ? "speed" : "blocked"}
          </span>
          <span>{n.message}</span>
        </div>
      ))}
      <div className="capnote-ok">
        {[
          caps.webgpu ? "WebGPU ✓" : null,
          !caps.webgpu && caps.webgl2 ? "WebGL2 ✓" : null,
          caps.webcodecs ? "WebCodecs ✓" : null,
          caps.wasmSimd ? "WASM SIMD ✓" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}
