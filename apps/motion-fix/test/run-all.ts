// Runs every *.test.ts in this folder (each test file asserts at import time):
//   node --experimental-strip-types apps/motion-fix/test/run-all.ts [filter]
import { readdirSync } from "node:fs";

const dir = new URL(".", import.meta.url);
const filter = process.argv[2] ?? "";
const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts") && f.includes(filter)).sort();
let failed = 0;
for (const f of files) {
  const t0 = performance.now();
  try {
    await import(new URL(f, dir).href);
    console.log(`ok   ${f} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${f}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  }
}
if (failed) process.exit(1);
