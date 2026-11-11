// Tap-to-neutral (pure, no GPU): the user taps a point that should be white or grey; the balance offset that makes
// that point grade to neutral is solved here, once, against the grade as it stands at that frame (the CPU reference
// of the shader, apply.ts), and stored with the clip's settings (UserSettings.wbTap). From then on it is a constant
// that rides on top of the locked balance (params.ts tapParams): no later analysis, lock or shot offset undoes it,
// and the preview and the export read the same two numbers.
import { gradePixel, resolveContext, type ApplyContext } from "./apply.ts";
import { linearToOklab, luminance, srgbToLinear } from "./color.ts";
import { TAP, type UserSettings } from "./params.ts";

/**
 * Solver tuning. `patch`: the tap samples patch × patch source pixels around the point (their per-channel median: a
 * bubble or a speck of marine snow in the patch does not move it). `darkY` / `bright`: a sample darker than this
 * linear luminance, or with every channel above this sRGB value (clipped), carries no colour to balance. `done`:
 * Oklab chroma at which the point counts as neutral (below 1 CIELAB unit); `limited`: residual chroma above which
 * the tap could not be honoured in full (the guards held: a dead red channel is not amplified into noise, the gains
 * stop at TAP.max). `keep`: when limited, the gains go back to the smallest that still buy all but this share of the
 * achievable improvement, so a point that cannot be neutralised does not drag the rest of the picture to the limit;
 * `useless`: and when even the best leaves more than this share of the point's chroma (gravel whose red is gone:
 * no balance brings it back), the tap changes nothing at all rather than recolour the frame for a point it cannot fix.
 */
export const TAP_SOLVE = { patch: 9, darkY: 0.004, bright: 0.985, done: 0.003, limited: 0.012, iters: 16, step: 0.7, probe: 0.04, keep: 0.15, useless: 0.7 };

export type TapSolve =
  | {
      ok: true;
      /** Gains on red and blue (green = 1): UserSettings.wbTap. [1, 1] when nothing could be gained. */
      gains: [number, number];
      /** Oklab chroma of the graded point before and after. */
      before: number;
      after: number;
      /** The point could not be made fully neutral (see TAP_SOLVE.limited). */
      limited: boolean;
    }
  | { ok: false; reason: "dark" | "bright" };

/** The tap's sample: per-channel median of an RGBA patch (any size), as sRGB 0..1. */
export function tapSample(rgba: ArrayLike<number>, scale = 255): [number, number, number] {
  const n = Math.floor(rgba.length / 4);
  const med = (c: number) => {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = rgba[i * 4 + c];
    v.sort();
    return (n % 2 ? v[n >> 1] : (v[(n >> 1) - 1] + v[n >> 1]) / 2) / scale;
  };
  return n > 0 ? [med(0), med(1), med(2)] : [0, 0, 0];
}

/** The source rectangle a tap at upright (u, v) samples in a w × h frame: about 1.2 % of the short side, at least `patch` pixels, inside the frame. */
export function tapRect(u: number, v: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const side = Math.max(TAP_SOLVE.patch, Math.round(0.012 * Math.min(w, h)));
  const rw = Math.min(1, side / Math.max(1, w)), rh = Math.min(1, side / Math.max(1, h));
  return { x: Math.min(1 - rw, Math.max(0, u - rw / 2)), y: Math.min(1 - rh, Math.max(0, v - rh / 2)), w: rw, h: rh };
}

/**
 * The settings the tap is solved under: the correction alone, at full Strength or the user's push. The balance is a
 * property of the correction, not of the style on top of it: solved through the looks, the gains would also cancel
 * whatever tint a look gives a neutral on purpose (the cobalt pull on a dark grey, Seabed's warm sand), and that
 * counter-tint then shows wherever the look acts differently — a subject (Subject pop spares it the water's blue)
 * turned green next to sand that came out neutral — and again when the style, Seabed or Strength is changed
 * later. Solved on the correction, a neutral point is neutral before the looks, and each look treats it as it
 * treats any white or grey (BLUE_WATER / RICH_LOOK leave near-neutrals alone by design).
 */
export function correctionOnly(s: UserSettings): UserSettings {
  return { ...s, intensity: Math.max(1, s.intensity), vivid: 0, blue: 0, look: 0, seabed: 0, subjectPop: false, waterHue: 0, wbTap: undefined };
}

/**
 * Solves the tap. `ctx` = the frame's grade as rendered (the parameters in force — locked, eased —, the user's
 * settings, the frame's maps); any tap already in the settings is ignored (a second tap replaces the first).
 * `rgb` = the source colour at the point (tapSample), (u, v) its upright position.
 *
 * A damped Newton iteration on the log gains (two unknowns, two equations: Oklab a = b = 0 of the graded point),
 * with a per-channel fixed-point step where the Jacobian says nothing (a channel the grade does not let through).
 * Everything the correction does to that pixel is in the loop — veil removal, the water / object split, the red
 * SNR guard, levels, the chroma ceilings, the push — but not the looks on top (correctionOnly): `before` / `after`
 * are the chroma of the corrected point, the same whatever style is on.
 */
export function solveTap(ctx: ApplyContext, rgb: readonly [number, number, number], u: number, v: number): TapSolve {
  const S = TAP_SOLVE;
  const lin = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
  if (luminance(lin[0], lin[1], lin[2]) < S.darkY) return { ok: false, reason: "dark" };
  if (Math.min(rgb[0], rgb[1], rgb[2]) >= S.bright) return { ok: false, reason: "bright" };
  const bound = Math.log(TAP.max);
  const clampX = (x: number) => Math.min(bound, Math.max(-bound, x));
  type F = { a: number; b: number; c: number; lin: [number, number, number] };
  const corr = correctionOnly(ctx.settings);
  const at = (x: number, y: number): F => {
    const settings: UserSettings = { ...corr, wbTap: [Math.exp(x), Math.exp(y)] };
    const o = gradePixel(resolveContext({ ...ctx, settings, debug: false, trace: undefined }), rgb[0], rgb[1], rgb[2], u, v);
    const l: [number, number, number] = [srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2])];
    const [, a, b] = linearToOklab(l[0], l[1], l[2]);
    return { a, b, c: Math.hypot(a, b), lin: l };
  };
  let x = 0, y = 0, f = at(0, 0);
  const before = f.c;
  for (let it = 0; it < S.iters && f.c > S.done; it++) {
    // Forward differences (backward at the upper bound).
    const hx = x + S.probe > bound ? -S.probe : S.probe, hy = y + S.probe > bound ? -S.probe : S.probe;
    const fx = at(x + hx, y), fy = at(x, y + hy);
    const j11 = (fx.a - f.a) / hx, j12 = (fy.a - f.a) / hy, j21 = (fx.b - f.b) / hx, j22 = (fy.b - f.b) / hy;
    const det = j11 * j22 - j12 * j21;
    const steps: [number, number][] = [];
    if (Math.abs(det) > 1e-7) steps.push([-(j22 * f.a - j12 * f.b) / det, -(-j21 * f.a + j11 * f.b) / det]);
    // Fixed point: each channel toward green's level.
    steps.push([-Math.log(Math.max(1e-4, f.lin[0]) / Math.max(1e-4, f.lin[1])), -Math.log(Math.max(1e-4, f.lin[2]) / Math.max(1e-4, f.lin[1]))]);
    let moved = false;
    for (const [dx0, dy0] of steps) {
      const k0 = Math.min(1, S.step / Math.max(1e-9, Math.max(Math.abs(dx0), Math.abs(dy0))));
      for (let k = k0, tries = 0; tries < 5 && !moved; tries++, k /= 2) {
        const nx = clampX(x + k * dx0), ny = clampX(y + k * dy0);
        if (nx === x && ny === y) break;
        const fn = at(nx, ny);
        if (fn.c < f.c - 1e-6) { x = nx; y = ny; f = fn; moved = true; }
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  let limited = f.c > S.limited;
  if (limited) {
    // Nothing to gain: leave the picture alone.
    if (f.c > S.useless * before) return { ok: true, gains: [1, 1], before, after: before, limited: true };
    // The smallest share of the solution that buys (almost) all it can.
    const goal = f.c + S.keep * (before - f.c);
    for (let t = 0.1; t < 0.999; t += 0.1) {
      const ft = at(x * t, y * t);
      if (ft.c <= goal) { x *= t; y *= t; f = ft; break; }
    }
    limited = f.c > S.limited;
  }
  return { ok: true, gains: [Math.exp(x), Math.exp(y)], before, after: f.c, limited };
}
