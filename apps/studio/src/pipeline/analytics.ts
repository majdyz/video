// Anonymous usage counts (GoatCounter, divegrade.goatcounter.com): page views and a few named events (clip opened,
// export done, AI on, crash). No cookies, no video, file names or location: only the event name, the screen width and
// the build. Sent as a fire-and-forget beacon, so it needs no third-party script and works under the app's
// cross-origin isolation (a beacon's response is never read). Off when the viewer opts out (About), in the native
// shell, on localhost, under automation and on our own test runs: `?debug=1` in the address, or the opt-out key set
// by the test scripts before the page loads (the devbox's browser hides navigator.webdriver, so that check alone let
// its runs through).

const ENDPOINT = "https://divegrade.goatcounter.com/count";
const OPT_OUT_KEY = "deepfix.analyticsOff";

declare const __BUILD_ID__: string;

/** Whether this page load is counted: pure, so the rules are tested (test/analytics.test.ts). */
export function countable(f: { optOut: boolean; beacon: boolean; webdriver: boolean; hostname: string; search: string; native: boolean; ua: string }): boolean {
  if (f.optOut || !f.beacon || f.webdriver || f.native) return false;
  if (/^(localhost|127\.|192\.168\.|10\.)/.test(f.hostname)) return false;
  // Our own runs: every headless check opens the app with ?debug (App.tsx exposes the studio on it).
  if (new URLSearchParams(f.search).has("debug")) return false;
  if (/HeadlessChrome|Playwright|Puppeteer/i.test(f.ua)) return false;
  return true;
}

function enabled(): boolean {
  let optOut = false;
  try {
    optOut = localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch { /* storage blocked: still count */ }
  if (typeof navigator === "undefined" || typeof location === "undefined" || !navigator.sendBeacon) return false;
  return countable({
    optOut,
    beacon: !!navigator.sendBeacon,
    webdriver: !!(navigator as Navigator & { webdriver?: boolean }).webdriver,
    hostname: location.hostname,
    search: location.search,
    native: "Capacitor" in window,
    ua: navigator.userAgent,
  });
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
