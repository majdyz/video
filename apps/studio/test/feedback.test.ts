// Send feedback's report and issue link, the weak-device check that keeps AI off on small phones, and the AI crash check (pure).
//   node --experimental-strip-types apps/studio/test/feedback.test.ts
import assert from "node:assert/strict";
import { feedbackReport, feedbackTitle, issueUrl, ISSUE_URL_MAX, TRUNCATED } from "../src/pipeline/feedback.ts";
import { isIOS, segThreads, weakDevice } from "../src/pipeline/device.ts";
import { aiCrashedLast, aiWorking, crumb, lastCrash, startCrumbs } from "../src/pipeline/crumbs.ts";
import { CRASHED_NOTE, segStatusText, WEAK_DEVICE_NOTE } from "../src/pipeline/seg/studio-seg.ts";

const ctx = { build: "abc1234", device: ["Device: iPhone", "Screen: 390×844 @3x"], steps: ["10:00:00 start", "10:00:05 open"], crash: null };

// Report: message first, then build, device, steps; crash section only after a crash.
{
  const r = feedbackReport("  The export froze  ", ctx);
  assert.ok(r.startsWith("The export froze\n\nBuild abc1234\nDevice: iPhone"));
  assert.ok(r.includes("This session:\n10:00:00 start"));
  assert.ok(!r.includes("crashed"));
  assert.ok(feedbackReport("", ctx).startsWith("(no message)"));
  assert.ok(feedbackReport("x", { ...ctx, crash: ["09:59 encode"] }).includes("Last session crashed; its last steps:\n09:59 encode"));
}

// Title: first line, shortened.
{
  assert.equal(feedbackTitle("Colours too red\nmore detail"), "Beta feedback: Colours too red");
  assert.equal(feedbackTitle(""), "Beta feedback: (no message)");
  const t = feedbackTitle("a".repeat(200));
  assert.ok(t.length < 100 && t.endsWith("…"));
}

// Issue link: short bodies whole; long ones cut from the end to fit, message kept, valid UTF-16.
{
  const short = issueUrl("majdyz/video", "T", "hello world");
  assert.equal(short.truncated, false);
  assert.equal(short.url, "https://github.com/majdyz/video/issues/new?title=T&body=hello%20world");
  const body = "Message first 🐠\n" + Array.from({ length: 400 }, (_, i) => `10:00:${i} step 🦈 ${"x".repeat(20)}`).join("\n");
  const long = issueUrl("majdyz/video", "T", body);
  assert.equal(long.truncated, true);
  assert.ok(long.url.length <= ISSUE_URL_MAX, `${long.url.length}`);
  assert.ok(long.url.length > ISSUE_URL_MAX - 40, "fills the room it has");
  const decoded = decodeURIComponent(new URL(long.url).searchParams.get("body") ?? "");
  assert.ok(decoded.startsWith("Message first 🐠"));
  assert.ok(decoded.endsWith(TRUNCATED));
  // A cut that would land inside an emoji's surrogate pair doesn't throw.
  for (let m = 200; m < 260; m++) issueUrl("o/r", "T", "🐠".repeat(200), m);
}

// Weak device: phones with little memory / few cores, or iOS without cross-origin isolation; never a desktop.
{
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  const desktop = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  assert.equal(isIOS({ ua: ipad, touch: 5 }), true);
  assert.equal(isIOS({ ua: ipad, touch: 0 }), false, "a real Mac");
  assert.equal(weakDevice({ ua: iphone, cores: 6, coi: false }), true, "iPhone, single-threaded WASM");
  assert.equal(weakDevice({ ua: iphone, cores: 6, coi: true }), false, "iPhone with ?coi=1 isolation");
  assert.equal(weakDevice({ ua: iphone, cores: 4, coi: true }), true, "older iPhone, 4 cores");
  assert.equal(weakDevice({ ua: ipad, touch: 5, cores: 8, coi: false }), true);
  assert.equal(weakDevice({ ua: android, memory: 8, cores: 8 }), false);
  assert.equal(weakDevice({ ua: android, memory: 2, cores: 8 }), true);
  assert.equal(weakDevice({ ua: android, cores: 4 }), true);
  assert.equal(weakDevice({ ua: desktop, memory: 2, cores: 2 }), false, "desktops keep their default");
  assert.equal(weakDevice({ ua: ipad, touch: 0, cores: 4, coi: false }), false, "Mac Safari");
  // The AI model's WASM threads: one on iOS (isolated or not), up to four elsewhere when isolated.
  assert.equal(segThreads({ ua: iphone, cores: 6, coi: true }), 1, "iPhone, isolated");
  assert.equal(segThreads({ ua: iphone, cores: 6, coi: false }), 1);
  assert.equal(segThreads({ ua: ipad, touch: 5, cores: 8, coi: true }), 1, "iPad");
  assert.equal(segThreads({ ua: desktop, cores: 16, coi: true }), 4);
  assert.equal(segThreads({ ua: android, cores: 8, coi: true }), 4);
  assert.equal(segThreads({ ua: desktop, cores: 2, coi: true }), 2);
  assert.equal(segThreads({ ua: desktop, cores: 16, coi: false }), 1, "no shared memory without isolation");
  assert.equal(segThreads({ ua: desktop, coi: true }), 1, "cores unknown");
  // ?segthreads=N (a device measurement): honoured when isolated, clamped to 1..4.
  assert.equal(segThreads({ ua: iphone, cores: 6, coi: true }, 4), 4);
  assert.equal(segThreads({ ua: iphone, cores: 6, coi: true }, 9), 4);
  assert.equal(segThreads({ ua: iphone, cores: 6, coi: false }, 4), 1);
  assert.equal(segThreads({ ua: desktop, cores: 16, coi: true }, 1), 1);
}

// AI crash: a page that dies on screen while the model is at work turns AI off for the next session (studio-seg).
// It is a flag of its own (crumbs.ts aiWorking), not "the last step was an AI step": other steps (taps, the profile,
// the export) are written during a pass, and a hidden or closed page that the system reaps is no AI crash.
{
  // A browser for crumbs.ts: storage that survives "sessions", page events, a visibility state.
  const store = new Map<string, string>();
  let handlers: Record<string, (() => void)[]> = {};
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  g.addEventListener = (ev: string, fn: () => void) => (handlers[ev] ??= []).push(fn);
  const doc = { visibilityState: "visible", addEventListener: (ev: string, fn: () => void) => (handlers[ev] ??= []).push(fn) };
  g.document = doc;
  const warn = console.warn;
  console.warn = () => undefined; // startCrumbs reports each "crashed" session
  const fire = (ev: string) => { for (const fn of handlers[ev] ?? []) fn({ persisted: false } as never); };
  /** A new page load (the old page's handlers die with it). Returns whether it starts with "AI crashed last time". */
  const load = () => { handlers = {}; doc.visibilityState = "visible"; startCrumbs("test"); return aiCrashedLast(); };

  assert.equal(load(), false, "first visit");
  // Died in a pass with other steps written after the last AI one (the old check missed this).
  aiWorking(true);
  crumb("ai: pass 40% (20/50) · heap 140 MB");
  crumb("tap 0.40,0.52 ai=live");
  crumb("profile 3/8");
  assert.equal(load(), true, "died mid-pass, whatever the last step was");
  assert.ok(lastCrash()?.some((s) => s.endsWith("profile 3/8")), "the steps are still there for About");
  assert.equal(load(), false, "once: the flag does not outlive the session that reported it");
  // The pass finished (idle / hibernate / worker shut down) and the page died later, in an export.
  aiWorking(true);
  aiWorking(false);
  crumb("export start (offline, 3840×2160)");
  assert.equal(load(), false, "died elsewhere");
  // Closed mid-pass: pagehide.
  aiWorking(true);
  fire("pagehide");
  assert.equal(load(), false, "the page was closed");
  // Swiped away mid-pass with no pagehide: hidden first, reaped later.
  aiWorking(true);
  doc.visibilityState = "hidden";
  fire("visibilitychange");
  assert.equal(load(), false, "a hidden page that goes is no AI crash");
  // Hidden and back while the pass still runs, then it dies on screen.
  aiWorking(true);
  doc.visibilityState = "hidden";
  fire("visibilitychange");
  doc.visibilityState = "visible";
  fire("visibilitychange");
  assert.equal(load(), true, "back on screen, still working, died");
  // Work that starts while hidden counts once the page shows again.
  doc.visibilityState = "hidden";
  fire("visibilitychange");
  aiWorking(true);
  assert.equal(store.has("studio.aiWorking"), false);
  doc.visibilityState = "visible";
  fire("visibilitychange");
  assert.equal(store.get("studio.aiWorking"), "1");
  aiWorking(false);
  assert.equal(store.has("studio.aiWorking"), false);
  assert.equal(load(), false);
  delete g.localStorage; delete g.addEventListener; delete g.document;
  console.warn = warn;

  assert.equal(segStatusText({ on: false, phase: "off", progress: null, note: null, weak: true, crashed: true }), CRASHED_NOTE, "the crash note over the weak-device one");
  assert.equal(segStatusText({ on: false, phase: "off", progress: null, note: null, weak: true }), WEAK_DEVICE_NOTE);
}

console.log("feedback tests passed");
