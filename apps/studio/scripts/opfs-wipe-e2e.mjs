// End-to-end check for exports that lose their storage mid-way (the "A requested file or directory could not
// be found" failure): the browser clears the origin's private storage (as storage pressure, a private window's
// in-memory store or "clear site data" can) while an export runs. The export must still finish, with the same
// frames as an export left alone (?framehash=1).
//
// Usage: node apps/studio/scripts/opfs-wipe-e2e.mjs <studio url> <clip> [encode|mux]
//   PLAYWRIGHT=/path/to/playwright/index.mjs (default: the "playwright" package)
// The clip should be a few chunks long (10 s each), e.g. a 30 s 360p file; tools: Dewarp only (fast, no colour).
const pw = await import(process.env.PLAYWRIGHT ?? "playwright");
const [url, clip, when = "encode"] = process.argv.slice(2);
if (!url || !clip) {
  console.error("usage: opfs-wipe-e2e.mjs <studio url> <clip> [encode|mux]");
  process.exit(2);
}
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(m.text()));
const u = new URL(url);
u.searchParams.set("debug", "1");
u.searchParams.set("framehash", "1");
await page.goto(u.toString());
await page.locator("input[type=file]").first().setInputFiles(clip);
await page.waitForTimeout(6000);
const on = async (name) => {
  await page.getByRole("tab", { name }).click();
  await page.waitForTimeout(500);
  const s = page.getByRole("switch", { name });
  if ((await s.getAttribute("aria-checked")) !== "true") await s.click();
};
await on(/Dewarp/);
const lens = page.getByRole("radio", { name: /^GoPro Wide$/ });
if (await lens.count()) await lens.first().click();
await page.getByRole("tab", { name: /Colour/ }).click();
{
  const s = page.getByRole("switch", { name: /Colour/ });
  if ((await s.getAttribute("aria-checked")) === "true") await s.click();
}
await page.waitForTimeout(1000);
const cdp = await ctx.newCDPSession(page);
const origin = u.origin;
const wipe = () => cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "file_systems" });

async function exportOnce(wipeWhen) {
  await page.evaluate(() => { window.exportFrameHashes = null; window.studio.dismissExport(); });
  const before = logs.length;
  await page.evaluate(() => { void window.studio.exportVideo(); });
  let wiped = false;
  for (let i = 0; i < 1800; i++) {
    const s = await page.evaluate(() => ({ state: window.studio.snap.exp.state, progress: window.studio.snap.exp.progress }));
    if (!wiped && wipeWhen === "encode" && s.state === "running" && s.progress > 0.5) {
      await wipe();
      wiped = true;
    }
    if (!wiped && wipeWhen === "mux" && logs.slice(before).some((l) => /\[export\] output →/.test(l))) {
      await wipe();
      wiped = true;
    }
    if (s.state === "done" || s.state === "error") break;
    await page.waitForTimeout(wipeWhen === "mux" ? 20 : 250);
  }
  const r = await page.evaluate(async () => {
    const exp = window.studio.snap.exp;
    const blob = exp.result?.blob;
    // Read it all: a file lost from storage would fail here.
    const bytes = blob ? (await blob.arrayBuffer()).byteLength : 0;
    return { state: exp.state, message: exp.message, hashes: window.exportFrameHashes, bytes };
  });
  return { ...r, wiped, log: logs.slice(before).filter((l) => /\[export\] (storage lost|done|output)/.test(l)) };
}

const ref = await exportOnce(null);
const hit = await exportOnce(when);
await browser.close();
// The pass that lost its storage was hashed too: the output is the frames rendered after it.
const last = hit.hashes && ref.hashes ? hit.hashes.slice(-ref.hashes.length) : null;
const same = !!last && last.length === ref.hashes.length && ref.hashes.every((h, i) => h === last[i]);
// (The MP4s differ only in their creation time stamps.)
console.log(JSON.stringify({ when, ref: { state: ref.state, frames: ref.hashes?.length, bytes: ref.bytes }, wiped: { state: hit.state, message: hit.message, wipedMidway: hit.wiped, framesRendered: hit.hashes?.length, bytes: hit.bytes, log: hit.log }, identicalFrames: same, sameSize: ref.bytes === hit.bytes }, null, 1));
process.exit(ref.state === "done" && hit.state === "done" && hit.wiped && same ? 0 : 1);
