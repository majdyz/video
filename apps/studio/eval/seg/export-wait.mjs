// Export waits for the AI pass (headless, against a preview build, ?framehash=1): Subject pop + AI on, then
//   MODE=immediate  Export right after the clip is ready (the pass has not started or is running);
//   MODE=playing    playback started, then Export right away (export must pause it and let the pass reach idle);
//   MODE=after      the pass left to finish in the preview first, then Export.
// Every mode must give the same frames (window.exportFrameHashes). Saves <out>/<MODE>.json: the hashes, the export
// sheet's progress lines ("Finding subjects N%… then exporting") and the [export] log.
// Usage: MODE=immediate node apps/studio/eval/seg/export-wait.mjs <base url> <outdir> <clip.mp4>   (env EXTRA)
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(path.join(process.env.HOME, "browser/node_modules/playwright/index.mjs"));
const [base, out, clip] = process.argv.slice(2);
const MODE = process.env.MODE ?? "immediate";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage();
const logs = []; p.on("console", (m) => logs.push(m.text())); p.on("pageerror", (e) => logs.push("PAGEERROR " + e.message));
// MODE=noai: the model files can't be fetched (AI unavailable): the export must go ahead with the engine's masks and
// say so in the sheet.
if (MODE === "noai") await p.route(/\/seg\/.*\.(onnx|json)(\?|$)/, (r) => r.abort());
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
await p.goto(base + `?debug=1&dock=open&framehash=1${process.env.EXTRA ?? ""}`);
for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => crossOriginIsolated).catch(() => false); if (ok || !/coi=1/.test(process.env.EXTRA ?? "")) break; await p.waitForTimeout(500); }
await p.waitForLoadState("load");
await p.setInputFiles("input[type=file]", clip);
await p.waitForFunction(() => window.studio?.getSnapshot().phase === "ready" && window.studio.getSnapshot().colourProfiled && !window.studio.getSnapshot().busy, null, { timeout: 300000 });
await p.getByRole("button", { name: /Advanced/ }).first().click(); await p.waitForTimeout(800);
const pop = p.getByRole("switch", { name: /Subject pop/ });
if ((await pop.getAttribute("aria-checked")) !== "true") { await pop.click(); await p.waitForTimeout(500); }
const ai = p.getByRole("switch", { name: /AI subject detection/ });
if ((await ai.getAttribute("aria-checked")) !== "true") await ai.click();
const seg = () => p.evaluate(() => ({ ...window.studio.getSnapshot().seg, cov: window.studio.seg.live?.coverage ?? null, autos: window.studio.seg.autos?.length ?? null }));
if (MODE === "after") {
  // The preview's own pass: model, session, the engine's subjects seeded, every step done.
  let quiet = 0;
  for (let i = 0; i < 7200 && quiet < 10; i++) {
    const s = await seg();
    if (i % 120 === 0) console.log(ts(), "preview pass", JSON.stringify(s));
    quiet = s.autos && s.cov !== null && s.cov >= 0.999 && s.phase === "ready" && !(await p.evaluate(() => !!window.studio.seg.pending)) ? quiet + 1 : 0;
    await p.waitForTimeout(500);
  }
  console.log(ts(), "preview pass done", JSON.stringify(await seg()));
} else if (MODE === "playing") {
  await p.evaluate(() => { const v = window.studio.video; v.loop = true; if (v.paused) window.studio.togglePlay(); });
  await p.waitForTimeout(1500);
}
console.log(ts(), "export starts", JSON.stringify(await seg()), "playing", await p.evaluate(() => !window.studio.video.paused));
const lines = [];
const dl = p.waitForEvent("download", { timeout: 7200000 }).catch(() => null);
await p.getByRole("button", { name: /^Export$/ }).first().click(); await p.waitForTimeout(1500);
const go = p.getByRole("button", { name: /^(Export|Save|Start|Export video).*/ }).last(); if (await go.count()) await go.click();
let pausedSeen = null;
for (let i = 0; i < 14400; i++) {
  const e = await p.evaluate(() => { const x = window.studio.getSnapshot().exp; return { state: x.state, detail: x.detail, note: x.note, playing: !window.studio.video.paused }; });
  if (pausedSeen === null && e.state !== "idle") pausedSeen = !e.playing;
  const l = `${e.state} ${e.detail}${e.note ? " | " + e.note : ""}`;
  if (lines[lines.length - 1]?.l !== l) { lines.push({ s: ts(), l }); if (/Finding|done|error/.test(l) || lines.length < 8) console.log(ts(), l); }
  if (e.state === "done" || e.state === "error") break;
  const s = p.getByRole("button", { name: /^Save$/ }); if (await s.count() && await s.first().isVisible()) { await s.first().click(); }
  await p.waitForTimeout(1000);
}
const hashes = await p.evaluate(() => window.exportFrameHashes ?? null);
const save = p.getByRole("button", { name: /^Save$/ });
if (await save.count() && await save.first().isVisible()) { await save.first().click(); const d = await dl; if (d) await d.saveAs(`${out}/${MODE}.mp4`); }
const res = { mode: MODE, frames: hashes?.length ?? 0, first: hashes?.[0], last: hashes?.[hashes.length - 1], playbackPausedAtExport: pausedSeen, sheet: lines.filter((x, i) => i < 4 || /Finding|note|done|error|\|/.test(x.l)).slice(0, 40), log: logs.filter((l) => /\[export\]|\[seg\]|PAGEERROR/.test(l)).slice(0, 40), hashes };
fs.writeFileSync(`${out}/${MODE}.json`, JSON.stringify(res, null, 1));
console.log(ts(), "RESULT", JSON.stringify({ mode: MODE, frames: res.frames, first: res.first, last: res.last, playbackPausedAtExport: pausedSeen }));
await b.close();
