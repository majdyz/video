// Subject pop selection helpers shared by the studio and its preview overlay.
import type { SubjectSelection } from "../../../aqua-fix/src/engine/animals.ts";
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
