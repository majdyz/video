import type { NeutralPick } from "../pipeline/tools.ts";

/**
 * Tap to fix: the point the user tapped (a white / grey or skin), a small cross-hair ring over the picture (inside the zoomed content,
 * so it follows pinch and pan). Neutral white with a dark edge: readable on sand and on blue water alike.
 */
export function NeutralMark({ pick }: { pick: Pick<NeutralPick, "u" | "v" | "limited"> | null }) {
  if (!pick) return null;
  return <span className={`neutral-mark${pick.limited ? " is-limited" : ""}`} style={{ left: `${pick.u * 100}%`, top: `${pick.v * 100}%` }} aria-hidden="true" />;
}

/** The instant answer to a finger landing in Tap to fix mode: a ring that opens and fades at the touch point (`t` restarts it). */
export function TapRing({ at }: { at: { u: number; v: number; t: number } | null }) {
  if (!at) return null;
  return <span key={at.t} className="tap-ring" style={{ left: `${at.u * 100}%`, top: `${at.v * 100}%` }} aria-hidden="true" />;
}
