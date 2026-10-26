// Bind group layouts of every WebGPU pipeline, declared once: backend-webgpu.ts
// builds the GPU layouts from these, and test/webgpu-layouts.test.ts checks
// them against each WGSL program's @binding declarations (a binding the
// shader declares but the layout lacks makes the pipeline invalid and the
// preview blank; see 0d9a074).

/** uniform buffer · filtering sampler · filterable float texture · unfilterable float texture · external texture. */
export type BindingKind = "uniform" | "sampler" | "texture" | "unfilterable" | "external";
export type LayoutSpec = Readonly<Record<number, BindingKind>>;

/** The engine's data textures (fields, CLAHE, guide, animal strength): rgba32float, read with textureLoad. */
const DATA = { 3: "unfilterable", 4: "unfilterable", 5: "unfilterable", 10: "unfilterable" } as const;
/** The temporal targets the grade samples (tracked mask, correction, flow, previous output). */
const TP = { 6: "texture", 7: "texture", 8: "texture", 9: "texture" } as const;

export const WEBGPU_LAYOUTS = {
  grade: { 0: "uniform", 1: "sampler", 2: "texture", ...DATA, ...TP },
  gradeExt: { 0: "uniform", 1: "sampler", 2: "external", ...DATA, ...TP },
  down: { 0: "uniform", 1: "sampler", 2: "texture" },
  downExt: { 0: "uniform", 1: "sampler", 2: "external" },
  flow: { 0: "unfilterable", 1: "unfilterable" },
  field: { 0: "uniform", ...DATA, 6: "unfilterable", 7: "unfilterable", 8: "unfilterable" },
} as const satisfies Record<string, LayoutSpec>;
