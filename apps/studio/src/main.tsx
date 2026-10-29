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
    // Cross-origin isolation comes from the service worker's headers (sw.js coi), so the very first visit (not yet
    // controlled) is not isolated: once the worker takes over, reload once, but only right after start-up (never
    // under someone's edit); later the next visit is isolated anyway.
    const t0 = performance.now();
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.crossOriginIsolated || performance.now() - t0 > 15_000) return;
      try {
        if (sessionStorage.getItem("coi-reloaded")) return;
        sessionStorage.setItem("coi-reloaded", "1");
      } catch {
        return;
      }
      location.reload();
    });
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}
