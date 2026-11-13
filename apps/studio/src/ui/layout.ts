/**
 * The narrow (phone) editor's layout, picked from the window and the clip's shape. One place decides, the CSS follows
 * the class (`is-stacked`, `is-landscape`) and the Stage fits the picture into what the class leaves free.
 *
 * - `stacked`: portrait window, a clip wide enough to leave letterbox bars (16:9, 4:3). The picture has the full
 *   width; the status chip sits in the bar above it, the tool rail as a row in the bar below, the dock under that.
 *   Nothing sits on the picture.
 * - `overlay`: portrait window, a tall clip (9:16, square on a small phone) that fills the screen: the rail and the
 *   dock float on it, as before.
 * - `landscape`: a phone on its side. The picture is full-bleed in the height, the rail is a column in the pillarbox
 *   at the right, the dock runs along the bottom.
 */
export type PhoneLayout = "stacked" | "overlay" | "landscape";

/** A window this low on its side is a phone in landscape (an iPhone Pro Max is 430 px high); taller ones are tablets and desktops. */
export const LANDSCAPE_MAX_H = 560;
/** Windows this low in portrait (iPhone SE, 568 px) get the compact row: no rail labels, a slimmer chip slot. */
export const COMPACT_MAX_H = 640;
/**
 * Letterbox height (window height minus the fitted picture) the stacked layout needs: top bar 56 + chip slot 52 +
 * rail row 68 + open dock 224, and room for a notch and a home indicator (81 px on an iPhone), which the window's
 * height includes. The compact row needs less and those phones have no insets.
 */
export const STACK_SPARE = 480;
export const STACK_SPARE_COMPACT = 370;

export function phoneLayout(vw: number, vh: number, aspect: number | null): PhoneLayout {
  if (vw > vh && vh <= LANDSCAPE_MAX_H) return "landscape";
  if (!aspect || !(vw > 0) || !(vh > 0)) return "overlay";
  const spare = vh - vw / aspect;
  return spare >= (vh <= COMPACT_MAX_H ? STACK_SPARE_COMPACT : STACK_SPARE) ? "stacked" : "overlay";
}

/**
 * The picture's window while zoomed. At fit it is the fitted box (w × h); zoomed in on a phone it grows into the free
 * area (aw × ah) around it, so a 16:9 clip pinched to 2× in portrait shows twice the height instead of a 2× crop
 * inside the same strip.
 */
export function zoomWindow(w: number, h: number, aw: number, ah: number, z: number, grow: boolean): [number, number] {
  if (!grow || z <= 1) return [w, h];
  return [Math.max(w, Math.min(aw, w * z)), Math.max(h, Math.min(ah, h * z))];
}
