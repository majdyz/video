// Subject pop selection helpers shared by the studio and its preview overlay.
import type { SubjectOverride, SubjectSelection } from "../../../aqua-fix/src/engine/animals.ts";
/** The animal id at upright (u, v), or the nearest within reach (a tap is coarse; 0 = none). */
export function subjectAt(sel: SubjectSelection, u: number, v: number, reach = 3): number {
  const x0 = Math.min(sel.width - 1, Math.max(0, Math.floor(u * sel.width)));
  const y0 = Math.min(sel.height - 1, Math.max(0, Math.floor(v * sel.height)));
  let best = 0, bestD = reach + 1;
  for (let y = Math.max(0, y0 - reach); y <= Math.min(sel.height - 1, y0 + reach); y++) {
    for (let x = Math.max(0, x0 - reach); x <= Math.min(sel.width - 1, x0 + reach); x++) {
      const id = sel.ids[y * sel.width + x];
      const d = Math.max(Math.abs(x - x0), Math.abs(y - y0));
      if (id && d < bestD) { best = id; bestD = d; }
    }
  }
  return best;
}

/**
 * What a tap at upright (u, v), clip time `t`, does to the corrections `list` given the selection on screen:
 * - on a subject that is toned (automatically or by an include): exclude it;
 * - on a subject that is not toned, or on anything else: include it (a seed when no subject is there);
 * - on a subject that already carries a correction: undo it when that brings back the automatic choice the tap
 *   asks for, else flip it (the path it was followed along is kept).
 * `follow` is the index of a new correction that still needs its track pass (-1 = none).
 */
export function toggleOverride(list: readonly SubjectOverride[], sel: SubjectSelection | null, u: number, v: number, t: number): { list: SubjectOverride[]; follow: number; id: number } {
  const id = sel ? subjectAt(sel, u, v) : 0;
  const a = id && sel ? sel.animals.find((an) => an.id === id) : undefined;
  const on = !!a && (a.override === "include" || (a.override !== "exclude" && a.strength > 0.5));
  const action: SubjectOverride["action"] = on ? "exclude" : "include";
  const out = list.slice();
  if (a && a.overrideIndex !== undefined && out[a.overrideIndex]) {
    if (((a.auto ?? 0) > 0.5) === (action === "include")) out.splice(a.overrideIndex, 1);
    else out[a.overrideIndex] = { ...out[a.overrideIndex], action };
    return { list: out, follow: -1, id };
  }
  out.push({ t, u, v, action });
  return { list: out, follow: out.length - 1, id };
}
