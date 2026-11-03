// Crash breadcrumbs: iPhone Safari kills a page that crashes ("A problem repeatedly occurred") with no log left
// anywhere. The last steps are kept in localStorage as they happen; a session that ends cleanly marks itself, and
// the next load shows what an unmarked one was doing (About).
const KEY = "studio.crumbs";
const DONE = "· page closed";
const MAX = 40;

let previous: string[] | null = null;

/** Reads the last session's steps (once, at start-up), then starts a fresh list. Null when it ended cleanly. */
export function startCrumbs(build: string): void {
  try {
    const old = JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
    previous = old.length && old[old.length - 1] !== DONE ? old : null;
    localStorage.setItem(KEY, "[]");
    if (previous) console.warn("[crumbs] the last session ended unexpectedly:\n" + previous.join("\n"));
  } catch { /* no storage */ }
  crumb(`start build ${build} · ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 90)}`);
  addEventListener("pagehide", () => crumb(DONE));
  addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) crumb("back from cache"); });
}

/** One step (kept short: it is written synchronously). */
export function crumb(msg: string): void {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
    if (a[a.length - 1] === DONE && msg !== DONE) a.pop();
    a.push(msg === DONE ? DONE : `${new Date().toISOString().slice(11, 19)} ${msg}`);
    while (a.length > MAX) a.shift();
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch { /* full or blocked */ }
}

/** The steps of a last session that crashed, or null. */
export function lastCrash(): string[] | null {
  return previous;
}

/** This session's steps so far (Send feedback attaches them). */
export function sessionCrumbs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
  } catch {
    return [];
  }
}
