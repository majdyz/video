import { createRoot } from "react-dom/client";
// Self-hosted variable fonts (bundled by Vite; the browser fetches only the subsets it renders).
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "./theme/tokens.css";
import "./styles/app.css";
import App from "./App.tsx";

// No StrictMode: the GPU contexts and the <video> element are owned by one
// long-lived Studio session; a double mount would tear them down mid-init.
createRoot(document.getElementById("root")!).render(<App />);

// No service worker inside the native app (apps/mobile): the bundle ships in
// the binary and a SW cache would outlive app updates.
if ("serviceWorker" in navigator && import.meta.env.PROD && !("Capacitor" in window)) {
  window.addEventListener("load", () => {
    // ?coi=1 (opt-in): cross-origin isolation from the service worker's headers (sw.js), for multi-threaded WASM.
    // The first visit is not controlled yet: once the worker takes over, reload once, only right after start-up and
    // never after any interaction (a reload would drop what was just opened).
    if (new URLSearchParams(location.search).get("coi") === "1" && !window.crossOriginIsolated) {
      const t0 = performance.now();
      let touched = false;
      for (const ev of ["pointerdown", "keydown", "drop", "change"]) window.addEventListener(ev, () => (touched = true), { capture: true, once: true });
      const reload = () => {
        if (touched || window.crossOriginIsolated || performance.now() - t0 > 15_000) return;
        try {
          if (sessionStorage.getItem("coi-reloaded")) return;
          sessionStorage.setItem("coi-reloaded", "1");
        } catch {
          return;
        }
        location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", reload);
      // Already controlled by a worker from before this mode: its next navigation answers with the headers.
      if (navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(reload).catch(() => undefined);
    }
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}
