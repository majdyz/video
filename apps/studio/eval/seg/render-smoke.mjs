// Renderer / isolation smoke (headless Chromium): the sample clip with Subject pop on, per query variant, checks the
// preview is not black (mean luminance of the visible canvas), which backend the engine took, whether the page is
// cross-origin isolated, and page errors. Usage: node apps/studio/eval/seg/render-smoke.mjs <base url> <outdir>
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(path.join(process.env.HOME, "browser/node_modules/playwright/index.mjs"));
const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const variants = (process.env.VARIANTS ?? ",&webgpu=1,&coi=1,&coi=1&webgpu=1").split(",").map((v) => v);
const rows = [];
for (const q of variants) {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan"] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/XNNPACK/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(`${base}?debug=1&pop=1${q}`);
  for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => crossOriginIsolated).catch(() => false); if (ok || !q.includes("coi")) break; await p.waitForTimeout(500); }
  await p.waitForLoadState("load");
  await p.getByText("Use sample clip").click();
  await p.waitForFunction(() => window.studio?.getSnapshot().phase === "ready" && window.studio.getSnapshot().colourProfiled && !window.studio.getSnapshot().busy, null, { timeout: 300000 }).catch(() => undefined);
  await p.evaluate(() => { window.studio.pause(); window.studio.seek(2); });
  await p.waitForTimeout(6000);
  const name = q.replace(/[&=]/g, "") || "default";
  await p.screenshot({ path: `${out}/${name}.png` });
  const r = await p.evaluate(() => {
    const c = [...document.querySelectorAll("canvas")].filter((x) => x.offsetParent && x.width > 100).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    let lum = -1;
    if (c) { const t = document.createElement("canvas"); t.width = 64; t.height = 36; const g = t.getContext("2d"); g.drawImage(c, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; lum = s / (d.length / 4); }
    return { isolated: crossOriginIsolated, backend: window.studio.engine?.stats?.backend ?? null, meanLuma: Math.round(lum), phase: window.studio.getSnapshot().phase };
  });
  rows.push({ variant: q || "(default)", ...r, errors: errs.slice(0, 3) });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await b.close();
}
fs.writeFileSync(`${out}/render-smoke.json`, JSON.stringify(rows, null, 1));
