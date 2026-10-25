// Builds the Studio for the native shell into apps/mobile/www:
// relative base (the page is served from capacitor://localhost/ or
// https://localhost/), no service worker (the bundle is already on disk and a
// SW cache would outlive app updates), and the native bridge enabled.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const studio = resolve(here, "../../studio");
const out = resolve(here, "../www");
const env = { ...process.env, STUDIO_BASE: "./" };
const run = (cmd, args) => execFileSync(cmd, args, { cwd: studio, env, stdio: "inherit" });

run("node", ["scripts/build-icons.mjs"]);
run("pnpm", ["exec", "tsc", "-b"]);
run("pnpm", ["exec", "vite", "build", "--outDir", out, "--emptyOutDir"]);
// The PWA service worker and manifest are web-only (main.tsx also skips the
// registration when the Capacitor bridge is present).
for (const f of ["sw.js", "manifest.webmanifest"]) {
  const p = resolve(out, f);
  if (existsSync(p)) rmSync(p);
}
console.log(`mobile web bundle -> ${out}`);
