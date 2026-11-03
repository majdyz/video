// Send feedback's report and issue link, the weak-device check that keeps AI off on small phones, and the AI crash check (pure).
//   node --experimental-strip-types apps/studio/test/feedback.test.ts
import assert from "node:assert/strict";
import { feedbackReport, feedbackTitle, issueUrl, ISSUE_URL_MAX, TRUNCATED } from "../src/pipeline/feedback.ts";
import { isIOS, weakDevice } from "../src/pipeline/device.ts";
import { aiCrashed } from "../src/pipeline/crumbs.ts";
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
}

// AI crash: a crashed session whose last step was the model at work turns AI off for the next one (studio-seg).
{
  assert.equal(aiCrashed(null), false, "the last session ended cleanly");
  assert.equal(aiCrashed([]), false);
  assert.equal(aiCrashed(["15:48:52 ai: session open", "15:48:56 ai: pass 0% (2/50) · heap 120 MB"]), true, "died in the pass");
  assert.equal(aiCrashed(["15:48:53 ai· encoded · heap 100 MB"]), true, "died in a worker step");
  assert.equal(aiCrashed(["15:48:52 ai: pass 100% (50/50)", "15:50:00 ai: hibernate"]), false, "the model was shut down");
  assert.equal(aiCrashed(["15:48:52 ai: model failed: out of memory"]), false);
  assert.equal(aiCrashed(["15:48:52 ai: pass 100% (50/50)", "15:49:00 export start"]), false, "died elsewhere");
  assert.equal(segStatusText({ on: false, phase: "off", progress: null, note: null, weak: true, crashed: true }), CRASHED_NOTE, "the crash note over the weak-device one");
  assert.equal(segStatusText({ on: false, phase: "off", progress: null, note: null, weak: true }), WEAK_DEVICE_NOTE);
}

console.log("feedback tests passed");
