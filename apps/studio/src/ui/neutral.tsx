import type { NeutralPick } from "../pipeline/tools.ts";

/**
 * Tap-to-neutral: the point the user tapped, a small cross-hair ring over the picture (inside the zoomed content,
 * so it follows pinch and pan). Neutral white with a dark edge: readable on sand and on blue water alike.
 */
export function NeutralMark({ pick }: { pick: Pick<NeutralPick, "u" | "v" | "limited"> | null }) {
  if (!pick) return null;
  return <span className={`neutral-mark${pick.limited ? " is-limited" : ""}`} style={{ left: `${pick.u * 100}%`, top: `${pick.v * 100}%` }} aria-hidden="true" />;
}
