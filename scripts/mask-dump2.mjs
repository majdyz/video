// AI subject masks of a clip after the full pass, v2 (for the full-mask / edge / hysteresis / back-fill work).
// A devbox tool: it drives the built studio in Playwright's Chromium (~/browser/node_modules/playwright).
//   node scripts/mask-dump2.mjs <outdir> [clip] [url] [shotFps=2]
// Writes
//   stats30.json   every filled frame (30 Hz, no seeking: SegLive.at is a pure lookup): area fraction, centre,
//                  mean alpha inside, quality, state (mask / weak / none), mean ML weight on the mask
//   summary.json   first / last masked time, frames per state, size pumping and centre jitter (see below), the
//                  [seg] re-check / back-fill / auto-seed lines
//   alpha/NNNN.pgm the overlay's alpha (mask grid, 8-bit) every 5th frame (6 Hz), for offline measurements
//   frames/NNNN.png the graded frame with the mask tinted red and its contour (bilinear, as the grade reads it; the
//                  v1 dump drew it nearest-neighbour, which is where its staircase came from) at shotFps
//   logs.txt
// Compare two runs with:  node scripts/mask-dump2.mjs --compare <dirA> <dirB>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (process.argv[2] === '--compare') {
  const [a, b] = [process.argv[3], process.argv[4]].map((d) => JSON.parse(fs.readFileSync(path.join(d, 'summary.json'), 'utf8')));
  for (const k of Object.keys(a)) if (typeof a[k] !== 'object') console.log(k.padEnd(28), String(a[k]).padEnd(14), String(b[k]));
  process.exit(0);
}

const { chromium } = await import(path.join(os.homedir(), 'browser/node_modules/playwright/index.mjs'));
const [,, out = '/tmp/mask-dump2', clipArg, urlArg, fpsArg] = process.argv;
const clip = clipArg || path.join(os.homedir(), 'video-data/user-clips/eagleray-dark-GH011035.mov');
const base = urlArg || 'http://127.0.0.1:8152/video/studio/';
const FPS = Number(fpsArg || 2);
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
fs.mkdirSync(path.join(out, 'alpha'), { recursive: true });

const b = await chromium.launch({ args: ['--no-zygote'] });
const ctx = await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem('studio.introSeen', '1'); } catch {} });
const logs = [];
const onc = (m) => { const t = m.text(); if (/\[seg\]|PAGEERROR|CRASH/i.test(t)) logs.push(t.slice(0, 400)); };
p.on('console', onc); p.on('worker', (w) => w.on('console', onc));
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';

await p.goto(base + (base.includes('?') ? '&' : '?') + 'debug=1&v=' + Date.now());
await p.waitForFunction(() => !!window.studio, null, { timeout: 30000 });
await p.setInputFiles('input[type=file]', clip);
await p.waitForFunction(() => window.studio.getSnapshot().phase === 'ready', null, { timeout: 60000 });
for (let i = 0; i < 90; i++) { if (await p.evaluate(() => window.studio.getSnapshot().colourProfiled)) break; await p.waitForTimeout(1000); }
await p.evaluate(() => { const s = window.studio; s.pause(); s.setSegEnabled(true); s.setTools({ ...s.tools, colour: { ...s.tools.colour, enabled: true, subjectPop: true, popStrength: 50 } }); });
console.log(T(), 'AI on; waiting for the full pass');
let idle = 0;
for (let i = 0; i < 3600; i++) {
  const st = await p.evaluate(() => ({ seg: window.studio.getSnapshot().seg, cov: window.studio.seg?.live?.coverage ?? 0 }));
  if (i % 30 === 0) console.log(T(), JSON.stringify(st));
  // (The back-fill of an early gap runs after the forward pass: wait for the session to be idle, not just covered.)
  if (st.seg?.phase === 'ready' && st.cov > 0.95) { if (++idle > 8) break; } else idle = 0;
  if (st.seg?.phase === 'unavailable') break;
  await p.waitForTimeout(1000);
}
const dur = await p.evaluate(() => window.studio.getSnapshot().duration ?? document.querySelector('video')?.duration ?? 0);
console.log(T(), 'pass done; duration', dur);

// Every frame's numbers, without seeking.
const stats = await p.evaluate((dur) => {
  const live = window.studio.seg?.live, out = [];
  if (!live) return out;
  for (let i = 0; i / 30 < dur - 0.02; i++) {
    const t = i / 30, o = live.at(t), state = live.stateAt(t);
    if (!o) { out.push({ t: +t.toFixed(3), state, area: 0 }); continue; }
    let area = 0, sum = 0, sx = 0, sy = 0, nw = 0;
    for (let k = 0; k < o.alpha.length; k++) if (o.alpha[k] > 0.5) { area++; sum += o.alpha[k]; sx += k % o.width; sy += (k / o.width) | 0; nw += o.near[k]; }
    out.push({ t: +t.toFixed(3), state, area: +(area / o.alpha.length).toFixed(5), meanIn: area ? +(sum / area).toFixed(3) : 0, cx: area ? +(sx / area).toFixed(2) : null, cy: area ? +(sy / area).toFixed(2) : null, weight: area ? +(nw / area).toFixed(3) : 0, quality: +(o.quality ?? 1).toFixed(3), w: o.width, h: o.height });
  }
  return out;
}, dur);
fs.writeFileSync(path.join(out, 'stats30.json'), JSON.stringify(stats));

// Alpha maps at 6 Hz.
for (let i = 0; i < stats.length; i += 5) {
  const m = await p.evaluate((t) => { const o = window.studio.seg?.live?.at?.(t); return o ? { w: o.width, h: o.height, a: Array.from(o.alpha, (x) => Math.round(x * 255)) } : null; }, i / 30);
  if (m) fs.writeFileSync(path.join(out, 'alpha', String(i).padStart(4, '0') + '.pgm'), Buffer.concat([Buffer.from(`P5\n${m.w} ${m.h}\n255\n`), Buffer.from(m.a)]));
}

// Summary: what to compare before / after.
const masked = stats.filter((s) => s.area > 0);
const count = (st) => stats.filter((s) => s.state === st).length;
let pump = 0, pumpN = 0, pumpMax = 0, jerk = 0, jerkN = 0, jerkMax = 0;
for (let i = 1; i < stats.length; i++) {
  const a = stats[i - 1], c = stats[i];
  if (!(a.area > 0 && c.area > 0)) continue;
  const d = Math.abs(c.area - a.area) / Math.max(a.area, c.area);
  pump += d; pumpN++; pumpMax = Math.max(pumpMax, d);
  const n = stats[i + 1];
  if (n && n.area > 0) {
    // Centre jitter: how far the centre is off the midpoint of its neighbours' (mask px): 0 for steady motion.
    const j = Math.hypot(c.cx - (a.cx + n.cx) / 2, c.cy - (a.cy + n.cy) / 2);
    jerk += j; jerkN++; jerkMax = Math.max(jerkMax, j);
  }
}
const far = masked.filter((s) => s.area < 0.015);
const summary = {
  frames: stats.length,
  maskFrames: count('mask'), weakFrames: count('weak'), noneFrames: count('none'), unfilled: stats.filter((s) => s.state === null).length,
  firstMaskS: masked.length ? masked[0].t : null, lastMaskS: masked.length ? masked[masked.length - 1].t : null,
  weakTimes: stats.filter((s) => s.state === 'weak').map((s) => s.t).filter((_, i) => i % 5 === 0).join(' '),
  meanAlphaInsideClose: +(masked.filter((s) => s.area >= 0.015).reduce((s, x) => s + x.meanIn, 0) / Math.max(1, masked.length - far.length)).toFixed(3),
  meanAlphaInsideFar: +(far.reduce((s, x) => s + x.meanIn, 0) / Math.max(1, far.length)).toFixed(3),
  areaPumpMeanPct: +(100 * pump / Math.max(1, pumpN)).toFixed(2), areaPumpMaxPct: +(100 * pumpMax).toFixed(1),
  centreJitterMeanPx: +(jerk / Math.max(1, jerkN)).toFixed(3), centreJitterMaxPx: +jerkMax.toFixed(2),
  minQualityOnMask: +Math.min(1, ...masked.map((s) => s.quality)).toFixed(3),
  lines: logs.filter((l) => /re-check|back-fill|auto seeds|seeded segment|ai: profile/.test(l)).filter((l, i, a) => a.indexOf(l) === i),
};
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, lines: undefined }, null, 1));

// Screenshots with the mask as the grade reads it (bilinear alpha; contour where it crosses 0.5).
let n = 0;
for (let t = 0; t < dur - 0.05; t += 1 / FPS) {
  await p.evaluate((t) => { window.studio.pause(); window.studio.seek(t); }, t);
  await p.waitForFunction((t) => { const v = document.querySelector('video'); return v && !v.seeking && Math.abs(v.currentTime - t) < 0.06; }, t, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
  const m = await p.evaluate((t) => { const o = window.studio.seg?.live?.at?.(t); return o ? { w: o.width, h: o.height, alpha: Array.from(o.alpha, (a) => Math.round(a * 255)) } : null; }, t);
  const buf = await p.locator('.stage__frame').screenshot();
  const png = await p.evaluate(async ({ b64, m }) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    if (m) {
      const id = g.getImageData(0, 0, c.width, c.height), d = id.data, W = c.width, H = c.height;
      const A = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fx = Math.min(m.w - 1, Math.max(0, ((x + 0.5) / W) * m.w - 0.5)), fy = Math.min(m.h - 1, Math.max(0, ((y + 0.5) / H) * m.h - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(m.w - 1, x0 + 1), y1 = Math.min(m.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
        A[y * W + x] = ((m.alpha[y0 * m.w + x0] * (1 - tx) + m.alpha[y0 * m.w + x1] * tx) * (1 - ty) + (m.alpha[y1 * m.w + x0] * (1 - tx) + m.alpha[y1 * m.w + x1] * tx) * ty) / 255;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const a = A[y * W + x], i = (y * W + x) * 4;
        if (a > 0.5) { d[i] = d[i] * 0.6 + 255 * 0.4; d[i + 1] *= 0.72; d[i + 2] *= 0.72; }
        if ((x > 0 && (a > 0.5) !== (A[y * W + x - 1] > 0.5)) || (y > 0 && (a > 0.5) !== (A[(y - 1) * W + x] > 0.5))) { d[i] = d[i + 1] = d[i + 2] = 255; }
      }
      g.putImageData(id, 0, 0);
    }
    const a = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }, { b64: buf.toString('base64'), m });
  fs.writeFileSync(path.join(out, 'frames', String(n).padStart(4, '0') + '.png'), Buffer.from(png, 'base64'));
  n++;
}
fs.writeFileSync(path.join(out, 'logs.txt'), logs.join('\n'));
await b.close();
console.log(T(), 'done', n, 'screenshots,', stats.length, 'frames of stats');
