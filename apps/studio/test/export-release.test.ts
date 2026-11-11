// The preview <video> is unloaded for an offline export and comes back after it, however it ended (export-release.ts).
//   node --experimental-strip-types apps/studio/test/export-release.test.ts
import assert from "node:assert/strict";
import { PreviewRelease, releaseSummary, type ReleasableVideo, type RestoreWaits } from "../src/pipeline/export-release.ts";

/** A <video> stand-in: readyState follows src / load / play as the element's does; every call is logged. */
class FakeVideo implements ReleasableVideo {
  log: string[] = [];
  readyState = 4;
  paused = false;
  private attr: string | null;
  private loaded: string | null;
  constructor(url: string | null) { this.attr = url; this.loaded = url; this.readyState = url ? 4 : 0; }
  get src(): string { return this.attr ?? ""; }
  set src(u: string) { this.attr = u; this.log.push(`src=${u}`); }
  get decoding(): string | null { return this.loaded; }
  pause(): void { this.paused = true; this.log.push("pause"); }
  removeAttribute(name: string): void { if (name === "src") this.attr = null; this.log.push(`remove ${name}`); }
  load(): void { this.loaded = this.attr; this.readyState = 0; this.log.push("load"); }
  playFails = false;
  async play(): Promise<void> {
    this.log.push("play");
    if (this.playFails || !this.loaded) throw new Error("NotAllowedError");
    this.paused = false;
    this.readyState = 4;
  }
}
const waits = (over: Partial<RestoreWaits<FakeVideo>> = {}): RestoreWaits<FakeVideo> => ({
  metadata: async (v) => { if (!v.decoding) throw new Error("Could not reload the clip"); v.readyState = 1; },
  firstFrame: async () => undefined,
  ...over,
});
const URL_A = "blob:a", URL_B = "blob:b";

// Release unloads the element (the decoder goes); restore loads the same clip and leaves it paused on a frame.
{
  const v = new FakeVideo(URL_A), r = new PreviewRelease<FakeVideo>();
  assert.equal(r.released, false);
  assert.equal(r.release(v, URL_A), true);
  assert.equal(r.released, true);
  assert.deepEqual(v.log, ["pause", "remove src", "load"]);
  assert.equal(v.decoding, null, "no source left in the element");
  assert.equal(v.readyState, 0);
  v.log = [];
  assert.equal(await r.restore(v, () => URL_A, waits()), "restored");
  assert.deepEqual(v.log, [`src=${URL_A}`, "load", "play", "pause"]);
  assert.equal(v.decoding, URL_A);
  assert.equal(v.paused, true);
  assert.equal(r.released, false);
}

// Restore without a release (the real-time recorder's exports, a second call from the finally): nothing touched.
{
  const v = new FakeVideo(URL_A), r = new PreviewRelease<FakeVideo>();
  assert.equal(await r.restore(v, () => URL_A, waits()), "not-released");
  assert.deepEqual(v.log, []);
  r.release(v, URL_A);
  await r.restore(v, () => URL_A, waits());
  v.log = [];
  assert.equal(await r.restore(v, () => URL_A, waits()), "not-released");
  assert.deepEqual(v.log, []);
}

// Nothing open (no URL) or released twice: the second is a no-op, and one restore brings it back.
{
  const v = new FakeVideo(URL_A), r = new PreviewRelease<FakeVideo>();
  assert.equal(r.release(v, null), false);
  assert.deepEqual(v.log, []);
  assert.equal(r.release(v, URL_A), true);
  assert.equal(r.release(v, URL_A), false);
  assert.equal(v.log.filter((l) => l === "load").length, 1);
  assert.equal(await r.restore(v, () => URL_A, waits()), "restored");
}

// Offline → recorder → offline again (the WebKit handover): release, restore, release, restore.
{
  const v = new FakeVideo(URL_A), r = new PreviewRelease<FakeVideo>();
  for (let i = 0; i < 2; i++) {
    assert.equal(r.release(v, URL_A), true);
    assert.equal(v.decoding, null);
    assert.equal(await r.restore(v, () => URL_A, waits()), "restored");
    assert.equal(v.decoding, URL_A);
  }
}

// The clip was closed during the export (teardown cleared the URL): the element is left alone.
{
  const v = new FakeVideo(URL_A), r = new PreviewRelease<FakeVideo>();
  r.release(v, URL_A);
  v.log = [];
  assert.equal(await r.restore(v, () => null, waits()), "clip-changed");
  assert.deepEqual(v.log, []);
  assert.equal(r.released, false);
}

// Another clip was opened while the restore waited: its element state is not touched again (no pause).
{
  const v = new FakeVideo(URL_A), r = new PreviewRelease<FakeVideo>();
  r.release(v, URL_A);
  let current: string | null = URL_A;
  v.log = [];
  const res = await r.restore(v, () => current, waits({ metadata: async (el) => { current = URL_B; el.src = URL_B; el.load(); } }));
  assert.equal(res, "clip-changed");
  assert.deepEqual(v.log, [`src=${URL_A}`, "load", `src=${URL_B}`, "load"], "no play / pause on the new clip's element");
  current = URL_A;
  const v2 = new FakeVideo(URL_A), r2 = new PreviewRelease<FakeVideo>();
  r2.release(v2, URL_A);
  v2.log = [];
  assert.equal(await r2.restore(v2, () => current, waits({ firstFrame: async () => { current = URL_B; } })), "clip-changed");
  assert.equal(v2.log.includes("pause"), false);
}

// The reload fails (error / timeout) or no frame arrives: reported, never thrown, and not stuck "released".
{
  const v = new FakeVideo(URL_A), r = new PreviewRelease<FakeVideo>();
  r.release(v, URL_A);
  assert.equal(await r.restore(v, () => URL_A, waits({ metadata: async () => { throw new Error("timed out"); } })), "failed");
  assert.equal(r.released, false);
  const v2 = new FakeVideo(URL_A), r2 = new PreviewRelease<FakeVideo>();
  v2.playFails = true;
  r2.release(v2, URL_A);
  assert.equal(await r2.restore(v2, () => URL_A, waits()), "failed", "autoplay refused and no frame decoded");
  assert.equal(r2.released, false);
  // A reload that fails because the clip went away is the clip's change, not a failure.
  const v3 = new FakeVideo(URL_A), r3 = new PreviewRelease<FakeVideo>();
  let cur: string | null = URL_A;
  r3.release(v3, URL_A);
  assert.equal(await r3.restore(v3, () => cur, waits({ metadata: async () => { cur = null; throw new Error("error"); } })), "clip-changed");
}

// The log line.
assert.equal(releaseSummary({ decoders: ["work", "preview"], targets: 9, bytes: 33 * 1048576 }), "2 decoders (work, preview), 9 preview GPU targets (~33.0 MB)");
assert.equal(releaseSummary({ decoders: ["preview"], targets: 1, bytes: 0 }), "1 decoder (preview), 1 preview GPU target (~0.0 MB)");
assert.equal(releaseSummary({ decoders: [], targets: 0, bytes: 0 }), "0 decoders, 0 preview GPU targets (~0.0 MB)");
console.log("export-release tests passed");
