// AI subject detection, background pass e2e (headless, against a preview build):
//   1. AI on, the clip PLAYS while the session runs: playback fps (requestVideoFrameCallback) with the pass vs
//      without it, the "AI subjects N%" pill, frames taken while playing;
//   2. pause at T, tap INCLUDE (a missed fin / second animal): seconds until the AI outline covers the tap;
//   3. tap EXCLUDE (a part of the subject): the subject must survive (alpha share after vs before), then Undo.
// Usage: node apps/studio/eval/seg/e2e-bg.mjs <base url> <outdir> <clip.mp4>
//   env T (pause time, s), INCLUDE=u,v  EXCLUDE=u,v  WATER=u,v (a tap on open water: must be rejected)  EXTRA (more query, e.g. &webgpu=1)  PLAYS (seconds of play)
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(path.join(process.env.HOME, "browser/node_modules/playwright/index.mjs"));
const [base, out, clip] = process.argv.slice(2);
const T = Number(process.env.T ?? 0.3);
const INC = process.env.INCLUDE ? process.env.INCLUDE.split(",").map(Number) : null;
const EXC = process.env.EXCLUDE ? process.env.EXCLUDE.split(",").map(Number) : null;
const WATER = process.env.WATER ? process.env.WATER.split(",").map(Number) : null;
fs.mkdirSync(out, { recursive: true });
const gpu = /webgpu=1/.test(process.env.EXTRA ?? "");
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...(gpu ? ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan"] : [])] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const p = await ctx.newPage();
const logs = []; p.on("console", (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (/\[seg\]/.test(m.text())) console.log("   page:", m.text().slice(0, 200)); }); p.on("pageerror", (e) => logs.push("PAGEERROR " + e.message));
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const result = { clip: path.basename(clip), extra: process.env.EXTRA ?? "" };
await p.goto(base + `?debug=1&dock=open${process.env.EXTRA ?? ""}`);
await p.setInputFiles("input[type=file]", clip);
await p.waitForFunction(() => window.studio?.getSnapshot().phase === "ready" && window.studio.getSnapshot().colourProfiled && !window.studio.getSnapshot().busy, null, { timeout: 240000 });
result.engine = await p.evaluate(() => window.studio.engine?.stats?.backend);
console.log(ts(), "ready, engine", result.engine);
const stage = async () => p.locator(".stage__content").boundingBox();
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png`, clip: await stage() }); };
const snap = () => p.evaluate(() => { const s = window.studio.getSnapshot(); return { seg: s.seg, undo: s.subjectUndo, note: s.subjectNote, t: window.studio.video.currentTime, paused: window.studio.video.paused }; });
// Playback fps over `sec` seconds (frames presented by the <video>, as the preview loop sees them).
const fps = (sec) => p.evaluate((sec) => new Promise((res) => {
  const v = window.studio.video; let n = 0; const t1 = performance.now();
  const cb = () => { n++; if (performance.now() - t1 < sec * 1000) v.requestVideoFrameCallback(cb); else res(n / ((performance.now() - t1) / 1000)); };
  v.requestVideoFrameCallback(cb);
}), sec);
const play = async () => { await p.evaluate(() => { const v = window.studio.video; v.loop = true; if (v.paused) window.studio.togglePlay(); }); };
const pause = async () => { await p.evaluate(() => window.studio.pause()); };
await p.getByRole("button", { name: /Advanced/ }).first().click(); await p.waitForTimeout(800);
const pop = p.getByRole("switch", { name: /Subject pop/ });
if ((await pop.getAttribute("aria-checked")) !== "true") { await pop.click(); await p.waitForTimeout(2000); }
// Baseline: playback with Subject pop, AI off.
if (process.env.PLAYS !== "0") { await play(); await p.waitForTimeout(1000); result.fpsAiOff = +(await fps(5)).toFixed(1); }
console.log(ts(), "fps, AI off:", result.fpsAiOff);
// AI on. The engine picks its own subjects on a paused frame here (headless playback analyses too sparsely for its
// automatic choice to settle while playing; on a device it settles within a second of play), then the clip plays
// while the AI pass runs.
await p.getByRole("switch", { name: /AI subject detection/ }).click();
for (let i = 0; i < 600; i++) { const s = await snap(); if (s.seg.phase === "ready") break; await p.waitForTimeout(500); }
await pause(); await p.evaluate((t) => window.studio.seek(t), T); await p.waitForTimeout(4000);
await p.evaluate(() => window.studio.refreshSubjects()); await p.waitForTimeout(3000);
console.log(ts(), "seeded:", await p.evaluate(() => window.studio.seg.autos?.length ?? 0));
const prog = [];
const skipPlay = process.env.PLAYS === "0";
if (!skipPlay) await play();
let shotN = 0;
for (let i = 0; i < (skipPlay ? 0 : 2400); i++) {
  const s = await snap();
  if (s.paused) await play();
  if (s.seg.phase === "tracking") {
    prog.push({ s: +((Date.now() - t0) / 1000).toFixed(1), p: +(s.seg.progress ?? 0).toFixed(3), t: +s.t.toFixed(2) });
    if (prog.length === 3) { result.fpsAiOn = +(await fps(5)).toFixed(1); console.log(ts(), "fps, AI pass running:", result.fpsAiOn); }
    if (prog.length % 15 === 0 && shotN < 4) { await shot(`1-playing-${shotN++}`); console.log(ts(), "playing", JSON.stringify(s.seg), "t", s.t.toFixed(2)); }
  }
  if (i % 40 === 0) console.log(ts(), "status", JSON.stringify(s));
  const pending = await p.evaluate(() => !!window.studio.seg.pending);
  if (prog.length > 3 && !pending && s.seg.phase !== "tracking") break;
  await p.waitForTimeout(500);
}
result.progress = prog.filter((_, i) => i % 10 === 0);
result.passWallS = prog.length ? prog[prog.length - 1].s - prog[0].s : null;
console.log(ts(), "pass done while playing", JSON.stringify(await snap()));
// Pause, re-analyse, outline.
await pause();
await p.evaluate((t) => window.studio.seek(t), T); await p.waitForTimeout(2500);
// Tap mode: Colour > Advanced open (the select bar shows); clicking Advanced again would close it.
if (!(await p.locator(".select-bar").isVisible().catch(() => false))) { await p.getByRole("button", { name: /Advanced/ }).first().click().catch(() => undefined); await p.waitForTimeout(800); }
console.log(ts(), "tap mode:", await p.locator(".select-bar").isVisible().catch(() => false), JSON.stringify(await snap()));
// The AI outline within 2 cells of (u, v) (a fin is about one cell wide on the mask grid).
const mlAt = (u, v) => p.evaluate(([u, v]) => { const s = window.studio.outlineSelection(); if (!s) return false; const x0 = Math.floor(u * s.width), y0 = Math.floor(v * s.height); for (let y = Math.max(0, y0 - 2); y <= Math.min(s.height - 1, y0 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(s.width - 1, x0 + 2); x++) if (s.ids[y * s.width + x] === 65000) return true; return false; }, [u, v]);
const alphaShare = () => p.evaluate((t) => { const o = window.studio.seg.overlayAt(t); if (!o) return 0; let a = 0; for (const x of o.alpha) a += x; return a / o.alpha.length; }, T);
// The taps act on what the AI shows: wait until the frame at T is filled (the automatic subjects' first steps).
for (let i = 0; i < 1200 && (await alphaShare()) < 0.01; i++) await p.waitForTimeout(500);
console.log(ts(), "AI mask at T:", (await alphaShare()).toFixed(4));
await shot("2-paused-before-tap");
result.alphaBefore = +(await alphaShare()).toFixed(4);
const bb = await stage();
if (INC) {
  result.includeCoveredBefore = await mlAt(INC[0], INC[1]);
  const tt = Date.now();
  await p.mouse.click(bb.x + INC[0] * bb.width, bb.y + INC[1] * bb.height);
  let ok = false;
  for (let i = 0; i < 1200 && !ok; i++) { ok = await mlAt(INC[0], INC[1]); if (!ok) await p.waitForTimeout(250); }
  result.includeOutlineSeconds = ok ? +((Date.now() - tt) / 1000).toFixed(1) : null;
  console.log(ts(), "include tap: outline covers it after", result.includeOutlineSeconds, "s", JSON.stringify(await snap()));
  await p.waitForTimeout(1500); await shot("3-after-include");
}
if (WATER) {
  const n0 = (await snap()).undo;
  await p.mouse.click(bb.x + WATER[0] * bb.width, bb.y + WATER[1] * bb.height);
  let note = null;
  for (let i = 0; i < 480 && !/Nothing found/.test(note ?? ""); i++) { await p.waitForTimeout(250); note = (await snap()).note; }
  result.waterTap = { note, alpha: +(await alphaShare()).toFixed(4), undoBefore: n0 };
  console.log(ts(), "water tap", JSON.stringify(result.waterTap));
  await shot("6-after-water-tap");
}
if (EXC) {
  const before = await alphaShare();
  await p.mouse.click(bb.x + EXC[0] * bb.width, bb.y + EXC[1] * bb.height);
  for (let i = 0; i < 600; i++) { const s = await snap(); if (/Taken out|Taking/.test(s.note ?? "")) break; await p.waitForTimeout(250); }
  const te = Date.now();
  let after = before;
  for (let i = 0; i < 480 && Math.abs(after - before) < 0.002; i++) { await p.waitForTimeout(250); after = await alphaShare(); }
  await p.waitForTimeout(3000); after = await alphaShare();
  result.excludeSeconds = +((Date.now() - te) / 1000).toFixed(1);
  result.exclude = { note: (await snap()).note, alphaBefore: +before.toFixed(4), alphaAfter: +after.toFixed(4), kept: +(after / Math.max(1e-6, before)).toFixed(2) };
  console.log(ts(), "exclude tap", JSON.stringify(result.exclude));
  await shot("4-after-exclude");
  await p.getByRole("button", { name: /^Undo$/ }).click();
  const tu = Date.now();
  let u = after;
  // Back at least half way to the share before the exclude (the session takes the undo between steps).
  for (let i = 0; i < 960 && Math.abs(u - before) > 0.5 * Math.abs(after - before); i++) { await p.waitForTimeout(250); u = await alphaShare(); }
  await p.waitForTimeout(3000); u = await alphaShare();
  result.undoSeconds = +((Date.now() - tu) / 1000).toFixed(1);
  result.afterUndo = +u.toFixed(4);
  console.log(ts(), "after undo", result.afterUndo, JSON.stringify(await snap()));
  await shot("5-after-undo");
}
result.seg = logs.filter((l) => /\[seg\]/.test(l)).slice(-8);
result.errors = logs.filter((l) => /PAGEERROR|\[error\]/.test(l) && !/XNNPACK/.test(l)).slice(0, 10);
fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 1));
fs.writeFileSync(`${out}/logs.txt`, logs.join("\n"));
console.log(JSON.stringify(result, null, 1));
await b.close();
