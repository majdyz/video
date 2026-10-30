// Subject pop demo exports (headless, against a preview build): one clip, Vivid on (the default), Subject pop on with
// AI subject detection, the AI pass left to cover the whole clip, then Export (pop-on.mp4); Subject pop off, Export
// again (pop-off.mp4). Same session, same grade otherwise.
// Usage: node apps/studio/eval/seg/demo-export.mjs <base url> <outdir> <clip.mp4>    (env EXTRA: more query, T: seed time)
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(path.join(process.env.HOME, "browser/node_modules/playwright/index.mjs"));
const [base, out, clip] = process.argv.slice(2);
const T = Number(process.env.T ?? 0.5);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const p = await ctx.newPage();
const logs = []; p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`)); p.on("pageerror", (e) => logs.push("PAGEERROR " + e.message));
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
const snap = () => p.evaluate(() => { const s = window.studio.getSnapshot(); return { seg: s.seg, exp: s.exp?.state, cov: window.studio.seg.live ? +window.studio.seg.live.coverage.toFixed(3) : null, pending: !!window.studio.seg.pending, colour: { vivid: s.tools?.colour?.vivid, pop: s.tools?.colour?.subjectPop } }; });
await p.goto(base + `?debug=1&dock=open${process.env.EXTRA ?? ""}`);
for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => crossOriginIsolated).catch(() => false); if (ok || !/coi=1/.test(process.env.EXTRA ?? "")) break; await p.waitForTimeout(500); }
await p.waitForLoadState("load");
await p.setInputFiles("input[type=file]", clip);
await p.waitForFunction(() => window.studio?.getSnapshot().phase === "ready" && window.studio.getSnapshot().colourProfiled && !window.studio.getSnapshot().busy, null, { timeout: 300000 });
console.log(ts(), "ready", JSON.stringify(await p.evaluate(() => ({ coi: crossOriginIsolated, engine: window.studio.engine?.stats?.backend }))));
await p.getByRole("button", { name: /Advanced/ }).first().click(); await p.waitForTimeout(800);
const pop = p.getByRole("switch", { name: /Subject pop/ });
if ((await pop.getAttribute("aria-checked")) !== "true") { await pop.click(); await p.waitForTimeout(1500); }
const ai = p.getByRole("switch", { name: /AI subject detection/ });
if ((await ai.getAttribute("aria-checked")) !== "true") await ai.click();
for (let i = 0; i < 1200; i++) { const s = await snap(); if (s.seg.phase === "ready" || s.seg.phase === "unavailable" || s.seg.phase === "tracking") break; await p.waitForTimeout(500); }
// The engine picks its subjects on a paused, analysed frame (headless playback analyses too sparsely to settle).
await p.evaluate((t) => { window.studio.pause(); window.studio.seek(t); }, T); await p.waitForTimeout(4000);
await p.evaluate(() => window.studio.refreshSubjects()); await p.waitForTimeout(3000);
console.log(ts(), "seeded", await p.evaluate(() => window.studio.seg.autos?.length ?? 0), JSON.stringify(await snap()));
// A close-up has no open water for the engine to pick subjects from: tap the animal (env TAP=u,v), as a user would.
if (process.env.TAP && !(await p.evaluate(() => window.studio.seg.autos?.length ?? 0))) {
  const [u, v] = process.env.TAP.split(",").map(Number);
  await p.evaluate(([u, v]) => window.studio.toggleSubjectAt(u, v), [u, v]);
  console.log(ts(), "tapped", u, v, JSON.stringify(await snap()));
}
for (let i = 0; i < 14400; i++) {
  const s = await snap();
  if (i % 120 === 0) console.log(ts(), "pass", JSON.stringify(s));
  if (s.cov !== null && s.cov >= 0.999 && !s.pending && s.seg.phase !== "tracking") break;
  await p.waitForTimeout(500);
}
console.log(ts(), "pass done", JSON.stringify(await snap()));
// The ML alpha at a few clip times (for halo.py: the subject's contour on the exported frames). MASKT: times (s).
for (const t of (process.env.MASKT ?? "1,2,3,4,5").split(",").map(Number)) {
  const m = await p.evaluate((t) => { const o = window.studio.seg.overlayAt(t); return o ? { w: o.width, h: o.height, a: Array.from(o.alpha, (x) => Math.round(255 * x)) } : null; }, t);
  if (m) fs.writeFileSync(`${out}/mask-${t}.pgm`, Buffer.concat([Buffer.from(`P5\n${m.w} ${m.h}\n255\n`), Buffer.from(m.a)]));
}
const exportTo = async (name) => {
  const dl = p.waitForEvent("download", { timeout: 3600000 }).catch(() => null);
  await p.getByRole("button", { name: /^Export$/ }).first().click(); await p.waitForTimeout(1500);
  const go = p.getByRole("button", { name: /^(Export|Save|Start|Export video).*/ }).last(); if (await go.count()) await go.click();
  for (let i = 0; i < 3600; i++) { const s = p.getByRole("button", { name: /^Save$/ }); if (await s.count() && await s.first().isVisible()) { await s.first().click(); break; } await p.waitForTimeout(1000); }
  const d = await dl;
  if (d) { await d.saveAs(`${out}/${name}.mp4`); console.log(ts(), "EXPORTED", name, fs.statSync(`${out}/${name}.mp4`).size, "bytes"); } else console.log(ts(), "NO EXPORT", name, JSON.stringify(await snap()));
  // Back to the editor (the export sheet's close / done).
  await p.keyboard.press("Escape").catch(() => undefined); await p.waitForTimeout(1500);
  const done = p.getByRole("button", { name: /^(Done|Close|Back to edit)/ }); if (await done.count() && await done.first().isVisible()) await done.first().click().catch(() => undefined);
  await p.waitForTimeout(1500);
};
await exportTo("pop-on");
// Subject pop off: same clip, same grade.
if (!(await pop.isVisible().catch(() => false))) { await p.getByRole("button", { name: /Advanced/ }).first().click().catch(() => undefined); await p.waitForTimeout(800); }
if ((await pop.getAttribute("aria-checked")) === "true") { await pop.click(); await p.waitForTimeout(2000); }
console.log(ts(), "pop off", JSON.stringify(await snap()));
await exportTo("pop-off");
fs.writeFileSync(`${out}/logs.txt`, logs.join("\n"));
console.log("errors:", logs.filter((l) => /PAGEERROR|\[error\]/.test(l) && !/XNNPACK/.test(l)).slice(0, 10));
await b.close();
