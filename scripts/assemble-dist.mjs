import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Each app gets its own subpath under /video/ (the classic single-tool apps
// keep their URLs; the unified Studio lives at /video/studio/).
const assembled = [];
for (const app of ["aqua-fix", "motion-fix", "dewarp", "studio"]) {
  const src = resolve(root, `apps/${app}/dist`);
  if (!existsSync(src)) continue;
  const dst = resolve(dist, app);
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  assembled.push(app);
}

// /video/ → the Studio (instant redirect; links for no-JS and for the classic tools).
writeFileSync(
  resolve(dist, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#08090b" />
<title>deepfix</title>
<meta http-equiv="refresh" content="0; url=./studio/" />
<link rel="canonical" href="./studio/" />
<script>location.replace("./studio/" + location.search + location.hash);</script>
<style>
  html, body { margin: 0; height: 100%; background: #08090b; color: #f2f4f7; font: 15px/1.5 -apple-system, system-ui, sans-serif; }
  main { min-height: 100%; display: grid; place-content: center; gap: 12px; text-align: center; padding: 24px; }
  a { color: #3ee6ff; text-decoration: none; }
  small { color: #7d8590; }
</style>
</head>
<body>
<main>
  <a href="./studio/">Open deepfix &rarr;</a>
  <small>Classic tools: <a href="./classic/">all</a> · <a href="./aqua-fix/">Aqua Fix</a> · <a href="./motion-fix/">Motion Fix</a> · <a href="./dewarp/">Dewarp</a></small>
</main>
</body>
</html>
`,
);

// The previous landing page (links to the single-tool apps) moves to /video/classic/.
mkdirSync(resolve(dist, "classic"), { recursive: true });
writeFileSync(
  resolve(dist, "classic/index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Dive Tools</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: #04101c; color: #e8f3ff; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 48px 24px; min-height: 100svh; display: flex; flex-direction: column; gap: 32px; }
  h1 { margin: 0; font-size: 32px; letter-spacing: -0.02em; background: linear-gradient(120deg, #b8f0ff, #b6ffe2); -webkit-background-clip: text; background-clip: text; color: transparent; }
  p.intro { margin: 0; color: #7a99b3; line-height: 1.5; }
  .grid { display: grid; gap: 16px; }
  a.card { display: block; padding: 22px 20px; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)); border: 1px solid rgba(159, 244, 255, 0.18); color: inherit; text-decoration: none; transition: transform 0.1s ease, border-color 0.2s ease; }
  a.card:hover { border-color: rgba(159, 244, 255, 0.35); }
  a.card:active { transform: scale(0.99); }
  a.card h2 { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
  a.card p { margin: 0; color: #7a99b3; font-size: 14px; line-height: 1.4; }
  a.card .arrow { float: right; opacity: 0.5; }
  .aqua h2 { color: #5fd0ff; }
  .motion h2 { color: #ff8b4a; }
  .dewarp h2 { color: #b6ffe2; }
  footer { margin-top: auto; color: #4f7088; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Dive Tools</h1>
    <p class="intro">On-device PWAs for diver-shot video. Pick a tool below; both work offline once installed to your home screen.</p>
  </header>
  <nav class="grid">
    <a class="card aqua" href="../aqua-fix/">
      <span class="arrow">→</span>
      <h2>Aqua Fix</h2>
      <p>Underwater colour correction. Physically-based: removes the backscatter veil, restores colour by range, keeps water looking like water. One estimate per clip, on-device person detection for skin, scene presets, native 4K, WebGPU. Real-time export on iPhone with the original audio.</p>
    </a>
    <a class="card motion" href="../motion-fix/">
      <span class="arrow">→</span>
      <h2>Motion Fix</h2>
      <p>Stabilize shaky clips. KLT tracking with outlier rejection, L1-optimal camera path (interior-point solver), wobble suppression, adaptive zoom. WebCodecs export; real-time export on iPhone with the original audio.</p>
    </a>
    <a class="card dewarp" href="../dewarp/">
      <span class="arrow">→</span>
      <h2>Dewarp</h2>
      <p>Straighten Osmo Action and GoPro wide-angle clips with calibrated lens profiles. Fisheye to rectilinear, audio kept, on-device.</p>
    </a>
  </nav>
  <footer>Source: github.com/majdyz/video</footer>
</div>
</body>
</html>
`,
);

console.log(`Assembled dist/ → ${assembled.map((a) => "/" + a + "/").join(", ")}, /classic/, landing → /studio/`);
