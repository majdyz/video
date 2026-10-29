// The compare wipe must never reach the grade or the temporal layer: the field pass grades through gradeD and the
// grade's output is the next frame's history, so a wipe applied there left a line at the old split after it moved.
// The backends composite it over the finished frame instead (shaders.ts GLSL_COMPOSITE / WGSL_COMPOSITE).
//   node --experimental-strip-types apps/aqua-fix/test/compare-wipe.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { GRADE_GLSL, GRADE_WGSL } from "../src/engine/grade-shader.ts";
import { GLSL_COMPOSITE, GLSL_FRAGMENT, WGSL_COMPOSITE, WGSL_COMPOSITE_EXT, WGSL_GRADE, WGSL_GRADE_EXT } from "../src/engine/shaders.ts";
import { GLSL_TP_FIELD, WGSL_TP_FIELD } from "../src/engine/temporal.ts";

// p0 = rotation, split, strength, 0 (params.ts packUniforms): nothing graded may read p0.y.
const readsSplit = (code: string) => /p\[0\]\.y\b/.test(code);
for (const [name, code] of Object.entries({ GRADE_GLSL, GRADE_WGSL, GLSL_FRAGMENT, WGSL_GRADE, WGSL_GRADE_EXT, GLSL_TP_FIELD, WGSL_TP_FIELD })) {
  assert.ok(!readsSplit(code), `${name} reads the compare split`);
}
assert.ok(/u_split/.test(GLSL_COMPOSITE) && /cp\.split/.test(WGSL_COMPOSITE) && /texture_external/.test(WGSL_COMPOSITE_EXT), "composite shaders apply the split");

// Both backends composite only while the wipe is on (split 0 — every export — keeps the old path untouched) and
// can redraw a moved split from the last graded frame.
for (const file of ["backend-webgl2.ts", "backend-webgpu.ts"]) {
  const src = fs.readFileSync(new URL(`../src/engine/${file}`, import.meta.url), "utf8");
  assert.match(src, /if \(split > 0\) this\.composite\(/, `${file}: composite gated on split > 0`);
  assert.match(src, /recomposite\(split: number\): boolean/, `${file}: recomposite`);
  assert.match(src, /setBefore\(src: SourceInput \| null/, `${file}: setBefore`);
}
console.log("ok  compare wipe stays out of the grade and the temporal history");
