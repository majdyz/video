// Studio AI subject detection e2e (headless, against a preview build): toggle in the UI (remembered per device) →
// model download with inline progress → ML pass on the engine's own subjects → tap a subject (exclude / include) →
// ML pass again → overlay in preview → export completes.
// Usage: node apps/studio/eval/seg/e2e.mjs <base url> <outdir> <clip.mp4> [u v t]     (env EXTRA: more query)
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(path.join(process.env.HOME, "browser/node_modules/playwright/index.mjs"));
const base = process.argv[2] || "http://127.0.0.1:8124/video/studio/";
const out = process.argv[3] || "/tmp/seg-e2e";
const clip = process.argv[4];
const U = Number(process.argv[5] ?? 0.59), V = Number(process.argv[6] ?? 0.55), T = Number(process.argv[7] ?? 0);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const p = await ctx.newPage();
const logs = []; p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`)); p.on("pageerror", (e) => logs.push("PAGEERROR " + e.message));
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const snap = () => p.evaluate(() => { const s = window.studio.getSnapshot(); return { phase: s.phase, seg: s.seg, tracking: s.subjectTracking, overrides: s.subjectOverrides.length, exp: s.exp?.state }; });
await p.goto(base + `?debug=1&webgl2&dock=open&segslow=7200000${process.env.EXTRA ?? ""}`);
await p.setInputFiles("input[type=file]", clip);
await p.waitForFunction(() => window.studio?.getSnapshot().phase === "ready" && window.studio.getSnapshot().colourProfiled && !window.studio.getSnapshot().busy, null, { timeout: 180000 });
console.log(ts(), "ready", JSON.stringify(await snap()));
await p.evaluate((t) => { window.studio.pause(); window.studio.seek(t); }, T);
await p.waitForTimeout(2000);
const stage = async () => p.locator(".stage__content").boundingBox();
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png`, clip: await stage() }); };
await p.getByRole("button", { name: /Advanced/ }).first().click(); await p.waitForTimeout(800);
// Panel clicks can restart playback: the AI pass waits for a paused video.
await p.evaluate((t) => { window.studio.pause(); window.studio.seek(t); }, T); await p.waitForTimeout(2000);
const pop = p.getByRole("switch", { name: /Subject pop/ });
if ((await pop.getAttribute("aria-checked")) !== "true") { await pop.click(); await p.waitForTimeout(3000); }
const ai = p.getByRole("switch", { name: /AI subject detection/ });
console.log(ts(), "AI toggle visible:", await ai.isVisible(), "checked:", await ai.getAttribute("aria-checked"));
await p.screenshot({ path: `${out}/0-panel.png` });
if ((await ai.getAttribute("aria-checked")) !== "true") await ai.click();
const seen = new Set();
for (let i = 0; i < 1200; i++) {
  const s = await snap();
  const txt = (await p.locator(".adv").innerText().catch(() => "")).match(/(Downloading[^\n]*|Starting[^\n]*|On: [^\n]*|Not available[^\n]*|Too slow[^\n]*)/)?.[0];
  if (txt && !seen.has(txt.replace(/\d+%/, ""))) { seen.add(txt.replace(/\d+%/, "")); console.log(ts(), "status:", txt); if (/Downloading/.test(txt)) await p.screenshot({ path: `${out}/0-downloading.png` }); }
  if (s.seg.phase === "ready" || s.seg.phase === "unavailable") break;
  await p.waitForTimeout(100);
}
console.log(ts(), "model", JSON.stringify(await snap()), "pref", await p.evaluate(() => localStorage.getItem("deepfix.subjectPop.ai")));
const overlay = () => p.evaluate((t) => { const o = window.studio.seg.overlayAt(t); if (!o) return null; let a = 0, n = 0; for (let i = 0; i < o.alpha.length; i++) { a += o.alpha[i]; n += o.near[i] > 0.01 ? 1 : 0; } return { w: o.width, h: o.height, alphaMean: +(a / o.alpha.length).toFixed(4), nearShare: +(n / o.near.length).toFixed(4) }; }, T);
const waitPass = async (label) => {
  let saw = false, quiet = 0;
  for (let i = 0; i < 7200; i++) {
    const s = await snap();
    if (s.seg.phase === "tracking") { if (!saw) console.log(ts(), label, "AI pass started"); saw = true; if (i % 60 === 0) console.log(ts(), label, "AI pass", Math.round((s.seg.progress ?? 0) * 100) + "%"); }
    const idle = s.seg.phase !== "tracking" && s.tracking === null && !(await p.evaluate(() => !!window.studio.seg.pending));
    quiet = idle ? quiet + 1 : 0;
    if (saw && quiet >= 6) break;
    if (!saw && i > 240 && s.tracking === null) break;
    await p.waitForTimeout(500);
  }
  await p.waitForTimeout(3000);
  console.log(ts(), label, "done", JSON.stringify(await snap()), "overlay", JSON.stringify(await overlay()));
};
// Turning AI on follows the subjects the engine chose by itself.
await waitPass("auto");
await shot("1-ai-auto");
const bb = await stage();
await p.mouse.click(bb.x + U * bb.width, bb.y + V * bb.height);
console.log(ts(), "tapped", U, V, JSON.stringify((await p.evaluate(() => window.studio.getSnapshot().subjectOverrides)).map((o) => ({ t: o.t, action: o.action }))));
await waitPass("tap");
await shot("2-after-tap");
const dl = p.waitForEvent("download", { timeout: 1800000 }).catch(() => null);
await p.getByRole("button", { name: /^Export$/ }).first().click(); await p.waitForTimeout(1500);
const go = p.getByRole("button", { name: /^(Export|Save|Start|Export video).*/ }).last(); if (await go.count()) await go.click();
for (let i = 0; i < 3600; i++) { const s = p.getByRole("button", { name: /^Save$/ }); if (await s.count() && await s.first().isVisible()) { await s.first().click(); break; } await p.waitForTimeout(1000); }
const d = await dl;
if (d) { await d.saveAs(`${out}/export.mp4`); console.log(ts(), "EXPORTED", d.suggestedFilename(), fs.statSync(`${out}/export.mp4`).size, "bytes"); } else console.log(ts(), "NO EXPORT", JSON.stringify(await snap()));
console.log("seg logs:", logs.filter((l) => /\[seg\]/.test(l)).slice(0, 12));
console.log("errors:", logs.filter((l) => /PAGEERROR|\[error\]/.test(l)).slice(0, 10));
fs.writeFileSync(`${out}/logs.txt`, logs.join("\n"));
await b.close();
