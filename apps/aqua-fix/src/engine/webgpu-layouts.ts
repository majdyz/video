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
/** The temporal targets the grade samples (tracked mask, correction, denoised source). */
const TP = { 6: "texture", 7: "texture", 9: "texture" } as const;
/** The noise reduction passes: params · sampler · source, then their temporal inputs. */
const NR_SRC = { 0: "uniform", 1: "sampler", 2: "texture" } as const;
const NR_SRC_EXT = { 0: "uniform", 1: "sampler", 2: "external" } as const;

export const WEBGPU_LAYOUTS = {
  grade: { 0: "uniform", 1: "sampler", 2: "texture", ...DATA, ...TP },
  gradeExt: { 0: "uniform", 1: "sampler", 2: "external", ...DATA, ...TP },
  down: { 0: "uniform", 1: "sampler", 2: "texture" },
  downExt: { 0: "uniform", 1: "sampler", 2: "external" },
  flow: { 0: "unfilterable", 1: "unfilterable" },
  field: { 0: "uniform", ...DATA, 6: "unfilterable", 7: "unfilterable", 8: "unfilterable" },
  /** Refine: block flow (read with textureLoad) · history · the previous frame's levels. */
  nrRefine: { ...NR_SRC, 6: "unfilterable", 7: "texture", 8: "texture" },
  nrRefineExt: { ...NR_SRC_EXT, 6: "unfilterable", 7: "texture", 8: "texture" },
  /** Level: refined flow · history · the low-resolution luminance (read with textureLoad). */
  nrLevel: { ...NR_SRC, 6: "texture", 7: "texture", 8: "unfilterable" },
  nrLevelExt: { ...NR_SRC_EXT, 6: "texture", 7: "texture", 8: "unfilterable" },
  /** NR: refined flow · history · levels. */
  nr: { ...NR_SRC, 6: "texture", 7: "texture", 8: "texture" },
  nrExt: { ...NR_SRC_EXT, 6: "texture", 7: "texture", 8: "texture" },
  /** Compare wipe: params · sampler · before picture · graded frame (read with textureLoad). */
  composite: { 0: "uniform", 1: "sampler", 2: "texture", 3: "texture" },
  compositeExt: { 0: "uniform", 1: "sampler", 2: "external", 3: "texture" },
} as const satisfies Record<string, LayoutSpec>;
