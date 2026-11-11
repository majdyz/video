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
  try {
    aiDied = localStorage.getItem(AI_KEY) === "1";
    localStorage.removeItem(AI_KEY);
  } catch { /* no storage */ }
  aiBusy = false;
  aiShown = null;
  crumb(`start build ${build} · ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 90)}`);
  addEventListener("pagehide", () => { crumb(DONE); writeAi(true); });
  addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) crumb("back from cache"); writeAi(); });
  // A hidden page is fair game for the system whatever it was doing (and a swiped-away Safari may never get its
  // pagehide): only a page that dies while it is on screen with the model at work counts against the AI.
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => writeAi());
}

// "AI working": a flag of its own next to the steps. The steps could not say whether the model was at work when the
// page died: AI steps are throttled, and taps, the colour profile, a subject's track pass and the export write their
// own steps during a pass, so "the last step was an AI step" missed most deaths in a pass (and the next session
// walked into the same crash), while a page swiped away mid-pass counted as one.
const AI_KEY = "studio.aiWorking";
let aiDied = false;
let aiBusy = false;
let aiShown: boolean | null = null;

function writeAi(closing = false): void {
  const on = aiBusy && !closing && (typeof document === "undefined" || document.visibilityState !== "hidden");
  if (on === aiShown) return;
  aiShown = on;
  try {
    if (on) localStorage.setItem(AI_KEY, "1");
    else localStorage.removeItem(AI_KEY);
  } catch { /* full or blocked */ }
}

/**
 * The AI model starts (true) or stops (false) working: loading, opening a clip, tracking, answering a tap. Kept in
 * localStorage while true and the page is visible; cleared when the work ends (idle, hibernation, the worker shut
 * down) and when the page is hidden or closed. Cheap to call often (it writes only on a change).
 */
export function aiWorking(on: boolean): void {
  aiBusy = on;
  writeAi();
}

/** The last session's page died on screen with the AI model at work (the flag was still set at start-up). */
export function aiCrashedLast(): boolean {
  return aiDied;
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

// The last AI pass's profile (studio-seg.ts profileLine): kept apart from the steps (40 of them: an export's own steps
// push it out) and across reloads, so a phone's numbers can be read back in About after the fact.
const PROFILE_KEY = "studio.aiProfile";

/** Keeps the AI pass's profile line (and writes it as a step). */
export function aiProfile(line: string): void {
  crumb(line);
  try {
    localStorage.setItem(PROFILE_KEY, `${new Date().toISOString().slice(0, 16).replace("T", " ")} ${line}`);
  } catch { /* full or blocked */ }
}

/** The last AI pass's profile on this device, or null. */
export function lastAiProfile(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
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

/**
 * Whether a crashed session died in a video export (its last step an export start or progress step, not its end):
 * on a phone that is the export running out of memory, typically at 4K. Pure (the steps as startCrumbs kept them).
 */
export function exportCrashed(steps: readonly string[] | null): boolean {
  const last = steps?.[steps.length - 1];
  return !!last && /^\S+ export (start|\d+%)/.test(last);
}
