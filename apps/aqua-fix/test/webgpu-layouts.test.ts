// WebGPU bind group layouts vs the WGSL programs and the bind groups the backend creates.
// A binding a shader declares but its explicit layout lacks (or a bind group that misses a layout entry) makes the
// pipeline / bind group invalid and the WebGPU preview blank (iOS Safari, 0d9a074).
//   node --experimental-strip-types apps/aqua-fix/test/webgpu-layouts.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { WEBGPU_LAYOUTS, type LayoutSpec } from "../src/engine/webgpu-layouts.ts";
import { WGSL_DOWNSCALE, WGSL_DOWNSCALE_EXT, WGSL_GRADE, WGSL_GRADE_EXT } from "../src/engine/shaders.ts";
import { WGSL_TP_FIELD, WGSL_TP_FLOW, WGSL_TP_LUM, tpExternal } from "../src/engine/temporal.ts";

/** binding → kind declared by a WGSL program (group 0). */
function declared(code: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /@group\(0\)\s*@binding\((\d+)\)\s*var(<uniform>)?\s+\w+\s*:\s*([^;]+);/g;
  for (let m; (m = re.exec(code)); ) {
    const b = Number(m[1]), type = m[3].trim();
    assert.ok(!out.has(b), `binding ${b} declared twice`);
    out.set(b, m[2] ? "uniform" : type === "sampler" ? "sampler" : type === "texture_external" ? "external" : type.startsWith("texture_2d") ? "texture" : type);
  }
  return out;
}

const programs: [string, string, LayoutSpec][] = [
  ["grade", WGSL_GRADE, WEBGPU_LAYOUTS.grade],
  ["gradeExt", WGSL_GRADE_EXT, WEBGPU_LAYOUTS.gradeExt],
  ["down", WGSL_DOWNSCALE, WEBGPU_LAYOUTS.down],
  ["downExt", WGSL_DOWNSCALE_EXT, WEBGPU_LAYOUTS.downExt],
  ["lum", WGSL_TP_LUM, WEBGPU_LAYOUTS.down],
  ["lumExt", tpExternal(WGSL_TP_LUM), WEBGPU_LAYOUTS.downExt],
  ["flow", WGSL_TP_FLOW, WEBGPU_LAYOUTS.flow],
  ["field", WGSL_TP_FIELD, WEBGPU_LAYOUTS.field],
];
for (const [name, code, spec] of programs) {
  const d = declared(code);
  const want = new Map(Object.entries(spec).map(([b, k]) => [Number(b), k === "unfilterable" ? "texture" : k]));
  assert.deepEqual([...d.keys()].sort((a, b) => a - b), [...want.keys()].sort((a, b) => a - b), `${name}: WGSL bindings vs layout`);
  for (const [b, k] of d) assert.equal(k, want.get(b), `${name}: binding ${b} kind`);
}

// Every bind group the backend creates supplies exactly its layout's bindings.
const src = fs.readFileSync(new URL("../src/engine/backend-webgpu.ts", import.meta.url), "utf8");
const layoutOf: Record<string, LayoutSpec> = {
  gradePipeline: WEBGPU_LAYOUTS.grade,
  gradePipelineExt: WEBGPU_LAYOUTS.gradeExt,
  downPipeline: WEBGPU_LAYOUTS.down,
  downPipelineExt: WEBGPU_LAYOUTS.downExt,
  lumPipe: WEBGPU_LAYOUTS.down,
  tpFlowPipe: WEBGPU_LAYOUTS.flow,
  tpFieldPipe: WEBGPU_LAYOUTS.field,
};
const tpGrade = [6, 7, 8, 9];
let groups = 0;
for (let at = src.indexOf("createBindGroup("); at >= 0; at = src.indexOf("createBindGroup(", at + 1)) {
  // The call's argument, by bracket matching.
  let depth = 0, end = at + "createBindGroup".length;
  do {
    const ch = src[end++];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
  } while (depth > 0 && end < src.length);
  const call = src.slice(at, end);
  const lay = /layout:\s*\(?([^\n]*?)\.getBindGroupLayout\(0\)/.exec(call);
  assert.ok(lay, `bind group without a pipeline layout: ${call.slice(0, 80)}`);
  const pipe = /(\w+)\)?$/.exec(lay[1].trim())![1];
  const spec = layoutOf[pipe];
  assert.ok(spec, `unknown pipeline in bind group: ${lay[1]}`);
  const got = [...call.matchAll(/binding:\s*(\d+)/g)].map((x) => Number(x[1]));
  if (call.includes("tpGradeEntries")) got.push(...tpGrade);
  if (/\bsrcEntry\b/.test(call)) got.push(2); // downGroup's source entry (binding 2), built just above the call
  assert.deepEqual(got.sort((a, b) => a - b), Object.keys(spec).map(Number).sort((a, b) => a - b), `bind group for ${pipe}`);
  groups++;
}
assert.ok(groups >= 6, `found ${groups} bind groups`);
console.log(`ok  webgpu layouts (${programs.length} programs, ${groups} bind groups)`);
