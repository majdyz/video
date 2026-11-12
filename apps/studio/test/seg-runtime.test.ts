// AI subject detection: what the model runs on (device.ts segRuntime: WebGPU on WebKit from Safari / iOS 26), the
// Safari version read from the user agent, and what a page that died with the model at work means for the next
// session (crumbs.ts: the flag keeps the provider; studio-seg.ts crashOutcome).
//   node --experimental-strip-types apps/studio/test/seg-runtime.test.ts
import assert from "node:assert/strict";
import { isWebKitUA, safariVersion, segRuntime } from "../src/pipeline/device.ts";

// ---------------------------------------------------------------- the Safari / iOS version

const UA = {
  // iOS 26.6.1 Safari: the OS token is frozen at 18_7; Version/ is the real one.
  ios26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",
  ios18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
  ios27: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  iosHome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  mac26: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
};

assert.equal(safariVersion(UA.ios26), 26, "Version/26.6, not the frozen iPhone OS 18_7");
assert.equal(safariVersion(UA.ios18), 18);
assert.equal(safariVersion(UA.ios27), 27);
assert.equal(safariVersion(UA.mac26), 26);
assert.equal(safariVersion(UA.iosChrome), null, "Chrome on iOS has no Version token");
assert.equal(safariVersion(UA.iosHome), null, "nor has a page on the home screen");
assert.equal(safariVersion(UA.chrome), null);
assert.equal(safariVersion("AppleWebKit/605.1.15 Version/9.1 Safari"), 9, "one digit");
assert.ok(isWebKitUA(UA.ios26) && isWebKitUA(UA.iosChrome) && isWebKitUA(UA.mac26));
assert.ok(!isWebKitUA(UA.chrome) && !isWebKitUA(UA.android) && !isWebKitUA(UA.firefox));
console.log("device: Safari version from the user agent's Version token: ok");

// ---------------------------------------------------------------- what the model runs on

{
  const rt = (ua: string, o: { gpu?: boolean; param?: string | null; avoidGpu?: boolean; mobile?: boolean } = {}) => {
    const r = segRuntime({ ua, gpu: o.gpu ?? true, param: o.param ?? null, avoidGpu: o.avoidGpu ?? false, mobile: o.mobile });
    return `${r.wasm ? "wasm" : "webgpu"}${r.lite ? " lite" : ""}`;
  };
  // WebKit: WebGPU from Safari / iOS 26, with the lite encoder on either.
  assert.equal(rt(UA.ios26), "webgpu lite");
  assert.equal(rt(UA.ios27), "webgpu lite");
  assert.equal(rt(UA.mac26), "webgpu lite");
  assert.equal(rt(UA.ios18), "wasm lite", "before 26: WASM (WebGPU there crashed the page)");
  assert.equal(rt(UA.iosChrome), "wasm lite", "version unknown: WASM");
  assert.equal(rt(UA.iosHome), "wasm lite");
  assert.equal(rt(UA.ios26, { gpu: false }), "wasm lite", "no navigator.gpu");
  // The preference a crash on WebGPU leaves, and the two overrides.
  assert.equal(rt(UA.ios26, { avoidGpu: true }), "wasm lite", "crashed on WebGPU before");
  assert.equal(rt(UA.ios26, { param: "0" }), "wasm lite", "?seggpu=0");
  assert.equal(rt(UA.ios18, { param: "1" }), "webgpu lite", "?seggpu=1 whatever the version");
  assert.equal(rt(UA.ios26, { param: "1", avoidGpu: true }), "webgpu lite", "and whatever crashed before");
  assert.equal(rt(UA.ios26, { param: "1", gpu: false }), "wasm lite", "but not without WebGPU");
  // Elsewhere as before: WebGPU with the full model where there is one.
  assert.equal(rt(UA.chrome), "webgpu");
  assert.equal(rt(UA.android, { mobile: true }), "webgpu");
  assert.equal(rt(UA.firefox, { gpu: false }), "wasm");
  assert.equal(rt(UA.chrome, { param: "0" }), "wasm");
  assert.equal(rt(UA.chrome, { avoidGpu: true }), "wasm", "a desktop that fell back keeps the full model");
  assert.equal(rt(UA.android, { avoidGpu: true, mobile: true }), "wasm lite", "a phone that fell back takes the lite one");
  assert.match(segRuntime({ ua: UA.ios18, gpu: true, param: null, avoidGpu: false }).why, /Safari 18/);
  assert.match(segRuntime({ ua: UA.ios26, gpu: true, param: null, avoidGpu: true }).why, /crashed on WebGPU/);
  console.log("device: WebGPU on WebKit from Safari 26, lite; WASM after a crash on it or ?seggpu=0: ok");
}

// ---------------------------------------------------------------- the crash flag keeps the provider

{
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  g.addEventListener = () => undefined;
  // (startCrumbs warns about every session that did not end cleanly: all of them here.)
  const warn = console.warn;
  console.warn = () => undefined;
  const { aiCrashedLast, aiCrashedOn, aiWorking, crashedProvider, startCrumbs } = await import("../src/pipeline/crumbs.ts");
  const { crashOutcome } = await import("../src/pipeline/seg/studio-seg.ts");
  const FLAG = "studio.aiWorking";

  assert.equal(crashedProvider(null), null);
  assert.equal(crashedProvider("webgpu"), "webgpu");
  assert.equal(crashedProvider("wasm"), "wasm");
  assert.equal(crashedProvider("1"), "wasm", "an older build's flag: no fallback, as then");

  // A clean session: the flag is there while the model works and gone when it stops.
  startCrumbs("test");
  assert.equal(aiCrashedOn(), null);
  aiWorking(true, "webgpu");
  assert.equal(store.get(FLAG), "webgpu", "what the model is meant to run on while it loads");
  aiWorking(true, "wasm");
  assert.equal(store.get(FLAG), "wasm", "what it got (no adapter: the worker fell back)");
  aiWorking(false);
  assert.equal(store.has(FLAG), false);
  aiWorking(true);
  assert.equal(store.get(FLAG), "wasm", "the provider holds until told otherwise");
  aiWorking(false);
  startCrumbs("test");
  assert.equal(aiCrashedOn(), null, "ended with the model idle: no crash");

  // The page dies with the model at work on WebGPU: the next session knows on what.
  aiWorking(true, "webgpu");
  startCrumbs("test");
  assert.equal(aiCrashedOn(), "webgpu");
  assert.equal(aiCrashedLast(), true);
  assert.equal(store.has(FLAG), false, "read once");
  aiWorking(true, "wasm");
  startCrumbs("test");
  assert.equal(aiCrashedOn(), "wasm");
  store.set(FLAG, "1");
  startCrumbs("test");
  assert.equal(aiCrashedOn(), "wasm");
  startCrumbs("test");
  assert.equal(aiCrashedOn(), null);
  assert.equal(aiCrashedLast(), false);

  // What it means: on WebGPU → AI stays on, the model on WASM from now; on WASM → AI off (the old behaviour); on
  // WebGPU although it was already kept off it (forced, and it died again) → off as well.
  assert.deepEqual(crashOutcome(true, null, false), { on: true, crashed: false, forceWasm: false });
  assert.deepEqual(crashOutcome(true, "webgpu", false), { on: true, crashed: false, forceWasm: true });
  assert.deepEqual(crashOutcome(false, "webgpu", false), { on: false, crashed: false, forceWasm: true });
  assert.deepEqual(crashOutcome(true, "wasm", false), { on: false, crashed: true, forceWasm: false });
  assert.deepEqual(crashOutcome(true, "wasm", true), { on: false, crashed: true, forceWasm: true }, "on WASM after the fallback: off, and still WASM when turned on again");
  assert.deepEqual(crashOutcome(true, "webgpu", true), { on: false, crashed: true, forceWasm: true });
  assert.deepEqual(crashOutcome(true, null, true), { on: true, crashed: false, forceWasm: true });
  assert.deepEqual(crashOutcome(false, "wasm", false), { on: false, crashed: false, forceWasm: false });

  // "WASM from now on" holds for the build it was set on only: the next build (a fix) gets the GPU back.
  const { forceWasmHolds, SubjectSeg } = await import("../src/pipeline/seg/studio-seg.ts");
  const KEY = "deepfix.subjectPop.segForceWasm";
  assert.equal(forceWasmHolds(null, "/assets/index-b.js"), false);
  assert.equal(forceWasmHolds("/assets/index-b.js", "/assets/index-b.js"), true, "set on this build: holds");
  assert.equal(forceWasmHolds("/assets/index-a.js", "/assets/index-b.js"), false, "set on another build: expired");
  assert.equal(forceWasmHolds("1", "/assets/index-b.js"), false, "the flag of the builds before it carried a build: expired");
  assert.equal(forceWasmHolds("", "dev"), false);
  // In the app: a stale flag is dropped at start-up (no crash since), and a crash on WebGPU stores this build.
  startCrumbs("test");
  store.set(KEY, "1");
  new SubjectSeg(() => undefined);
  assert.equal(store.has(KEY), false, "an older build's flag is gone: the model is back on WebGPU");
  store.set(KEY, "/assets/index-old.js");
  aiWorking(true, "webgpu");
  startCrumbs("test");
  new SubjectSeg(() => undefined);
  assert.equal(store.get(KEY), "dev", "a crash on WebGPU on this build: WASM for this build (node: build 'dev')");
  aiWorking(false);
  console.warn = warn;
  console.log("crumbs: the AI flag keeps the provider; a crash on WebGPU → WASM, on WASM → off: ok");
}
