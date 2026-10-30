// AI pass benchmark (headless, against a preview build, ?coi=1 for WASM threads and the memory API): a clip, Subject
// pop + AI on, the session left to finish (every segment seeded, every frame filled). Reports the pass's wall time,
// the time per minute of clip, the share of the clip covered, where the time went (session.ts profile: decode,
// encode, memory attention, decoder, memory encoder, flow guard, fill, product) and the page's memory over the pass
// (performance.measureUserAgentSpecificMemory: the page and its workers), peak and at the end.
// Usage: node apps/studio/eval/seg/pass-bench.mjs <base url> <out.json> <clip>     (env EXTRA, default &coi=1)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const { chromium } = await import(path.join(process.env.HOME, "browser/node_modules/playwright/index.mjs"));
const [base, out, clip] = process.argv.slice(2);
const EXTRA = process.env.EXTRA ?? "&coi=1";
// A marker on the browser's command line finds its process tree (resident memory of every process: the page, its
// workers with the WASM heap, the GPU process).
const MARK = `--segbench-${process.pid}`;
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-experimental-web-platform-features", MARK] });
const treeRssMB = () => {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss=,args="], { encoding: "utf8" }).split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], args: m[4] }));
  const root = rows.find((r) => r.args.includes(MARK) && !r.args.includes("--type="));
  if (!root) return -1;
  const ids = new Set([root.pid]);
  for (let grew = true; grew;) { grew = false; for (const r of rows) if (!ids.has(r.pid) && ids.has(r.ppid)) { ids.add(r.pid); grew = true; } }
  return +(rows.filter((r) => ids.has(r.pid)).reduce((a, r) => a + r.rss, 0) / 1024).toFixed(0);
};
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const logs = []; p.on("console", (m) => logs.push(m.text())); p.on("pageerror", (e) => logs.push("PAGEERROR " + e.message));
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
await p.goto(base + `?debug=1&dock=open${EXTRA}`);
for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => crossOriginIsolated).catch(() => false); if (ok) break; await p.waitForTimeout(500); }
await p.waitForLoadState("load");
await p.setInputFiles("input[type=file]", clip);
await p.waitForFunction(() => window.studio?.getSnapshot().phase === "ready" && window.studio.getSnapshot().colourProfiled && !window.studio.getSnapshot().busy, null, { timeout: 600000 });
const duration = await p.evaluate(() => window.studio.video.duration);
console.log(ts(), "ready", duration.toFixed(1), "s clip, isolated", await p.evaluate(() => crossOriginIsolated));
await p.getByRole("button", { name: /Advanced/ }).first().click(); await p.waitForTimeout(800);
const pop = p.getByRole("switch", { name: /Subject pop/ });
if ((await pop.getAttribute("aria-checked")) !== "true") { await pop.click(); await p.waitForTimeout(500); }
await p.evaluate(() => window.studio.pause());
const ai = p.getByRole("switch", { name: /AI subject detection/ });
if ((await ai.getAttribute("aria-checked")) !== "true") await ai.click();
await p.waitForFunction(() => { const s = window.studio.getSnapshot().seg; return s.phase !== "download" && s.phase !== "starting"; }, null, { timeout: 600000 });
const tPass = Date.now();
const mem = [];
const memNow = () => p.evaluate(async () => { try { const m = await performance.measureUserAgentSpecificMemory(); return m.bytes; } catch { return (performance.memory?.usedJSHeapSize ?? -1); } });
let done = false;
const sampler = (async () => { while (!done) { const m = await memNow().catch(() => -1); mem.push({ s: +((Date.now() - tPass) / 1000).toFixed(0), mb: +(m / 1e6).toFixed(1), rssMB: treeRssMB() }); await new Promise((r) => setTimeout(r, 15000)); } })();
// The session goes on until every segment is seeded and every frame filled (seg.settle, as the export waits).
for (;;) {
  const st = await p.evaluate(async () => {
    const seg = window.studio.seg;
    if (!seg.live || seg.autos === null) return { open: false };
    const r = await seg.settle({ signal: new AbortController().signal, stallMs: 1e9, onProgress: () => {} });
    return { open: true, r, cov: seg.live.coverage, bytes: seg.live.bytes };
  });
  if (st.open) { console.log(ts(), "settled", JSON.stringify(st)); break; }
  await p.waitForTimeout(1000);
}
done = true;
await sampler;
const passS = (Date.now() - tPass) / 1000;
// env SNAPS=t,t,…: the frame at each time with the AI mask tinted red over it (<out>.snap-<t>.png).
for (const t of (process.env.SNAPS ?? "").split(",").filter(Boolean).map(Number)) {
  const url = await p.evaluate(async (t) => {
    const s = window.studio, v = s.video;
    s.pause(); s.seek(t);
    await new Promise((r) => setTimeout(r, 1500));
    const c = document.createElement("canvas"); c.width = 640; c.height = Math.round(640 * v.videoHeight / v.videoWidth);
    const g = c.getContext("2d"); g.drawImage(v, 0, 0, c.width, c.height);
    const o = s.seg.live?.at(t);
    if (o) {
      const img = g.getImageData(0, 0, c.width, c.height);
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const a = o.alpha[Math.floor((y / c.height) * o.height) * o.width + Math.floor((x / c.width) * o.width)];
        const i = (y * c.width + x) * 4;
        img.data[i] = img.data[i] * (1 - 0.5 * a) + 255 * 0.5 * a; img.data[i + 1] *= 1 - 0.5 * a; img.data[i + 2] *= 1 - 0.5 * a;
      }
      g.putImageData(img, 0, 0);
    }
    g.fillStyle = "#fff"; g.font = "16px sans-serif"; g.fillText(`${t} s${o ? "" : " (no AI)"}`, 8, 20);
    return c.toDataURL("image/png");
  }, t);
  fs.writeFileSync(out.replace(/\.json$/, `.snap-${t}.png`), Buffer.from(url.split(",")[1], "base64"));
}
const r = await p.evaluate(() => {
  // AI coverage: the share of frames whose AI mask has a subject (not just filled), per second of clip too.
  const live = window.studio.seg.live, n = live?.n ?? 0, perSec = [];
  let withSubject = 0;
  for (let i = 0; i < n; i++) {
    const o = live.at((live.i0 + i) / 30);
    let has = false;
    if (o) for (let k = 0; k < o.alpha.length; k++) if (o.alpha[k] > 0.5) { has = true; break; }
    if (has) withSubject++;
    const s = Math.floor(i / 30);
    perSec[s] = (perSec[s] ?? 0) + (has ? 1 : 0);
  }
  return { profile: window.studio.seg.lastProfile, cov: live?.coverage, aiShare: n ? withSubject / n : 0, perSec: perSec.map((x) => +(x / 30).toFixed(2)), bytes: live?.bytes, autos: window.studio.seg.autos?.length ?? null };
});
const res = { clip: path.basename(clip), duration, passS, passSPerMin: +(passS / (duration / 60)).toFixed(0), coverage: r.cov, aiSubjectShare: +r.aiShare.toFixed(3), aiPerSecond: r.perSec, maskMB: +(r.bytes / 1e6).toFixed(2), autos0: r.autos, peakMB: Math.max(...mem.map((m) => m.mb)), endMB: mem[mem.length - 1]?.mb, peakRssMB: Math.max(...mem.map((m) => m.rssMB)), startRssMB: mem[0]?.rssMB, endRssMB: mem[mem.length - 1]?.rssMB, profile: r.profile, mem, seg: logs.filter((l) => /\[seg\]|PAGEERROR/.test(l)).slice(0, 60) };
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(ts(), "RESULT", JSON.stringify({ ...res, mem: undefined, seg: undefined }));
await b.close();
