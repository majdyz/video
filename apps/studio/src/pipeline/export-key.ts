// The settings an export's pixels depend on, as one string: the export journal
// (packages/shared/src/export-journal.ts) resumes an interrupted export only
// when the clip AND this key match, so a changed look, trim, split, subject
// tap, footage profile or app build starts a fresh export.

import type { ToolsState } from "./tools.ts";

type KeyParts = {
  trim: unknown;
  segments: unknown;
  subjectOverrides: unknown;
  footage: { choice: unknown; active: unknown };
};

/** Stable JSON: object keys sorted, so the same settings always give the same string. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined && typeof o[k] !== "function").sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
}

/** The running build: the entry script's hashed file name changes whenever any bundled code does. */
export function buildId(): string {
  if (typeof document === "undefined") return "dev";
  const s = document.querySelector<HTMLScriptElement>("script[type=module][src]");
  return s?.src ? new URL(s.src, location.href).pathname : "dev";
}

export function exportSettingsKey(tools: ToolsState, snap: KeyParts, build = buildId()): string {
  return stableJson({
    v: 1,
    build,
    tools,
    trim: snap.trim,
    segments: snap.segments,
    subjects: snap.subjectOverrides,
    footage: [snap.footage.choice, snap.footage.active],
  });
}
