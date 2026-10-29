// Runs every Aqua Fix test (each is a plain node script with assertions).
//   node --experimental-strip-types apps/aqua-fix/test/run-all.ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.ts")).sort();
let failed = 0;
for (const f of files) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(dir, f)], { encoding: "utf8" });
  const ms = (performance.now() - t0).toFixed(0);
  if (r.status === 0) console.log(`PASS ${f} (${ms} ms)`);
  else {
    failed++;
    console.log(`FAIL ${f} (${ms} ms)\n${(r.stdout + r.stderr).split("\n").slice(-15).join("\n")}`);
  }
}
console.log(failed ? `${failed} of ${files.length} failed` : `all ${files.length} passed`);
process.exit(failed ? 1 : 0);
