// Anonymous usage counts (GoatCounter, divegrade.goatcounter.com): page views and a few named events (clip opened,
// export done, AI on, crash). No cookies, no video, file names or location: only the event name, the screen width and
// the build. Sent as a fire-and-forget beacon, so it needs no third-party script and works under the app's
// cross-origin isolation (a beacon's response is never read). Off when the viewer opts out (About), in the native
// shell, on localhost and under automation.

const ENDPOINT = "https://divegrade.goatcounter.com/count";
const OPT_OUT_KEY = "deepfix.analyticsOff";

declare const __BUILD_ID__: string;

function enabled(): boolean {
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === "1") return false;
  } catch { /* storage blocked: still count */ }
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return false;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return false;
  if (/^(localhost|127\.|192\.168\.)/.test(location.hostname)) return false;
  if ("Capacitor" in window) return false;
  return true;
}

function send(path: string, title: string, event: boolean): void {
  if (!enabled()) return;
  const q = new URLSearchParams({ p: path, t: title, s: String(Math.round(screen.width)), b: "0", rnd: Math.random().toString(36).slice(2) });
  if (event) q.set("e", "true");
  else if (document.referrer && !document.referrer.startsWith(location.origin)) q.set("r", document.referrer);
  try { navigator.sendBeacon(`${ENDPOINT}?${q.toString()}`); } catch { /* best effort */ }
}

/** One page view (on start). */
export function trackView(): void {
  send(location.pathname, document.title, false);
}

/** A named event, e.g. "export-done", "ai-on". Names only: never a file name or anything the user typed. */
export function trackEvent(name: string): void {
  send(name.replace(/[^a-z0-9-]/gi, "").slice(0, 40), `${name} · ${typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : ""}`, true);
}

export function analyticsOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === "1"; } catch { return false; }
}

export function setAnalyticsOptOut(off: boolean): void {
  try { if (off) localStorage.setItem(OPT_OUT_KEY, "1"); else localStorage.removeItem(OPT_OUT_KEY); } catch { /* blocked */ }
}

/** Breadcrumbs that are worth a count (crumbs.ts calls this for every step): their event name, or null. */
const CRUMB_EVENTS: [RegExp, string][] = [
  [/^open video/, "open-video"], [/^open image/, "open-photo"],
  [/^export start/, "export-start"], [/^export done/, "export-done"], [/^export (failed|error)/, "export-failed"],
  [/^ai: model ready/, "ai-ready"], [/^ai: model failed/, "ai-failed"], [/^ai: crashed/, "ai-crashed"],
  [/^ui crashed/, "ui-crash"],
];
export function trackCrumb(msg: string): void {
  for (const [re, name] of CRUMB_EVENTS) if (re.test(msg)) { trackEvent(name); return; }
}
