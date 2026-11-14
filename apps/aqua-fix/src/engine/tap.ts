// Tap to fix (pure, no GPU): the user taps a point that should be white or grey, or a person's skin; the tap works
// out which (TAP_SKIN, solveTap below) and the balance offset that makes that point grade to neutral, or to a
// plausible skin colour, is solved here, once, against the grade as it stands at that frame (the CPU reference
// of the shader, apply.ts), and stored with the clip's settings (UserSettings.wbTap). From then on it is a constant
// that rides on top of the locked balance (params.ts tapParams): no later analysis, lock or shot offset undoes it,
// and the preview and the export read the same two numbers.
import { gradePixel, resolveContext, type ApplyContext } from "./apply.ts";
import { linearToOklab, luminance, oklabToLinear, srgbToLinear } from "./color.ts";
import { SKIN, TAP, type UserSettings } from "./params.ts";

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
 * The same share is asked of the picture as shown (with its style), and a tap still short of neutral at gains
 * beyond `limitedMax` is refused outright (see the end of solveTap).
 * A refused tap is not the end (owner, 13 Nov: sand in deep blue water, its red gone, answered "No red left" and
 * did nothing): the fallback pulls the cast down instead of boosting the dead channel — blue down by at most
 * `fallBlue`, red up by at most `fallRed` (the grade's own red guard still holds), the pair that leaves the point
 * with the least chroma on a small grid (`fallSteps` per side), never one that turns it green (`greenLo..greenHi`
 * degrees of Oklab hue above `limited` chroma), and only when it sheds at least `fallGain` of the chroma. Small,
 * bounded gains: a tap on open water then mutes its blue a little rather than re-balancing the frame for it.
 */
export const TAP_SOLVE = { patch: 9, darkY: 0.004, bright: 0.985, done: 0.003, limited: 0.012, iters: 16, step: 0.7, probe: 0.04, keep: 0.15, useless: 0.7, limitedMax: 2.5, fallBlue: 1.6, fallRed: 1.5, fallSteps: 5, fallGain: 0.08, greenLo: 110, greenHi: 185 };

/**
 * What the tapped point is taken for. "skin": the target is not grey but a natural skin colour — Oklab hue `hue`
 * (the skin guard's, SKIN.hue), chroma between `cLo` and `cHi`: the point's own chroma along that hue under the
 * automatic balance, held to the range (pale skin stays pale, tanned skin tanned: the smallest move that makes it
 * read as skin). Where that cannot be had in full — the red is not there, or the point is on a detected person
 * whose blue-lit skin the skin guard holds pale on purpose (look-fit.ts SKIN_GUARD.coolCut) — the target falls
 * back to pale skin (`pale` chroma at the same hue, when that is had in full inside TAP_SOLVE.limitedMax) before
 * the limits and the pull-down take over: a balance
 * chasing a chroma the grade will not give would run to the limit for nothing. Which of the two a tap means is read from the point as the clip's automatic balance grades it
 * (the correction alone): skin keeps more red than a grey under the same water, so it comes out warm — within
 * `band` of the skin hue with at least `minC` chroma — where a white or grey comes out near neutral or still cool.
 * A warm point could still be a grey the balance overshot: then the one that asks for the smaller correction
 * (largest gain or cut, in log) wins, and one the guards cut short loses to one they did not.
 * Deep skin does not come out warm (the owner's freediver clip, eval/eyedropper.ts: hands and face at 250–265°,
 * as blue as the sand of other clips, with less red than the frame's bright parts): by its colour alone it cannot
 * be told from a grey card. There the person mask decides: a point on a detected person (`person` of the mask or
 * more) that is neither dark (suit, hair, shadow: corrected Oklab L under `lLo`) nor bright (L above `lHi`) nor
 * neutral already is skin, when a balance can do anything for it. Everything else is a neutral, and the caller
 * can ask for either outright (`want`; the studio does on a second tap on the same spot).
 */
export const TAP_SKIN = { hue: SKIN.hue, cLo: 0.045, cHi: 0.085, pale: 0.015, band: (30 * Math.PI) / 180, minC: 0.02, person: 0.5, lLo: 0.25, lHi: 0.85 };
export type TapKind = "neutral" | "skin";

export type TapSolve =
  | {
      ok: true;
      /** What the point was balanced to (see TAP_SKIN). */
      kind: TapKind;
      /** Gains on red and blue (green = 1): UserSettings.wbTap. [1, 1] when nothing could be gained. */
      gains: [number, number];
      /** Oklab distance of the graded point from its target before and after (neutral: its chroma). */
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
 * `rgb` = the source colour at the point (tapSample), (u, v) its upright position. `want` forces what the point is
 * taken for; left out, the tap decides (TAP_SKIN).
 *
 * A damped Newton iteration on the log gains (two unknowns, two equations: Oklab (a, b) of the graded point on its
 * target: 0, 0 for a neutral, the skin colour for skin), with a per-channel fixed-point step where the Jacobian
 * says nothing (a channel the grade does not let through). Both kinds run through the same limits and the same
 * pull-down fallback.
 * Everything the correction does to that pixel is in the loop — veil removal, the water / object split, the red
 * SNR guard, levels, the chroma ceilings, the push — but not the looks on top (correctionOnly): `before` / `after`
 * are the chroma of the corrected point, the same whatever style is on.
 */
export function solveTap(ctx: ApplyContext, rgb: readonly [number, number, number], u: number, v: number, want?: TapKind): TapSolve {
  const S = TAP_SOLVE, K = TAP_SKIN;
  const lin = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
  if (luminance(lin[0], lin[1], lin[2]) < S.darkY) return { ok: false, reason: "dark" };
  if (Math.min(rgb[0], rgb[1], rgb[2]) >= S.bright) return { ok: false, reason: "bright" };
  // The point under the automatic balance (the correction alone): what the tap is read from.
  const o = gradePixel(resolveContext({ ...ctx, settings: correctionOnly(ctx.settings), debug: false, trace: undefined }), rgb[0], rgb[1], rgb[2], u, v);
  const [L0, a0, b0] = linearToOklab(srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2]));
  const ch = Math.cos(K.hue), sh = Math.sin(K.hue), c0 = Math.hypot(a0, b0), along = a0 * ch + b0 * sh;
  const cSkin = Math.min(K.cHi, Math.max(K.cLo, along));
  const skin = () => {
    // Skin within `limited` of its target reads as skin already: nothing to do (a white is held to `done`).
    const full = solveTo(ctx, rgb, u, v, "skin", cSkin * ch, cSkin * sh, S.limited);
    if (!full.limited) return full;
    const pale = solveTo(ctx, rgb, u, v, "skin", K.pale * ch, K.pale * sh, S.limited);
    return pale.limited || Math.max(pale.gains[0], 1 / pale.gains[0], pale.gains[1], 1 / pale.gains[1]) > S.limitedMax ? full : pale;
  };
  const neutral = () => solveTo(ctx, rgb, u, v, "neutral", 0, 0);
  if (want) return want === "skin" ? skin() : neutral();
  const n = neutral();
  if (!(c0 >= K.minC && along >= c0 * Math.cos(K.band))) {
    // Not warm under the automatic balance: a white or grey, unless it is the lit part of a person.
    if (!(personAt(ctx, u, v) >= K.person && L0 >= K.lLo && L0 <= K.lHi && c0 > S.limited)) return n;
    const k = skin();
    // … and only inside the limits of a tap the guards cut short (limitedMax): the mask is a guess, not the user's word.
    return (k.limited && k.gains[0] === 1 && k.gains[1] === 1) || Math.max(k.gains[0], 1 / k.gains[0], k.gains[1], 1 / k.gains[1]) > S.limitedMax ? n : k;
  }
  const k = skin();
  if (n.limited !== k.limited) return n.limited ? k : n;
  // Both cut short: the neutral's answer, unless it is to do nothing where skin still gains.
  if (n.limited && n.gains[0] === 1 && n.gains[1] === 1) return k;
  const cost = (s: { gains: [number, number] }) => Math.max(Math.abs(Math.log(s.gains[0])), Math.abs(Math.log(s.gains[1])));
  return cost(k) < cost(n) ? k : n;
}

/** The person mask (0..1) at upright (u, v): its nearest texel; 0 without a mask. */
function personAt(ctx: ApplyContext, u: number, v: number): number {
  const d = ctx.depth, p = d.person;
  if (!p || p.length !== d.width * d.height) return 0;
  const x = Math.min(d.width - 1, Math.max(0, Math.floor(u * d.width))), y = Math.min(d.height - 1, Math.max(0, Math.floor(v * d.height)));
  return p[y * d.width + x];
}

/** The solver for one target: (ta, tb) = the Oklab (a, b) the graded point should have; a point within `slack` of it is left as it is. */
function solveTo(ctx: ApplyContext, rgb: readonly [number, number, number], u: number, v: number, kind: TapKind, ta: number, tb: number, slack = 0): TapSolve & { ok: true } {
  const S = TAP_SOLVE;
  const bound = Math.log(TAP.max);
  const clampX = (x: number) => Math.min(bound, Math.max(-bound, x));
  // a, b: the graded point's Oklab (a, b) less the target's; c: its distance from the target.
  type F = { a: number; b: number; c: number; L: number; lin: [number, number, number] };
  const corr = correctionOnly(ctx.settings);
  const at = (x: number, y: number): F => {
    const settings: UserSettings = { ...corr, wbTap: [Math.exp(x), Math.exp(y)] };
    const o = gradePixel(resolveContext({ ...ctx, settings, debug: false, trace: undefined }), rgb[0], rgb[1], rgb[2], u, v);
    const l: [number, number, number] = [srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2])];
    const [L, a, b] = linearToOklab(l[0], l[1], l[2]);
    return { a: a - ta, b: b - tb, c: Math.hypot(a - ta, b - tb), L, lin: l };
  };
  let x = 0, y = 0, f = at(0, 0);
  const before = f.c;
  if (before <= slack) return { ok: true, kind, gains: [1, 1], before, after: before, limited: false };
  // Skin that starts on the warm side of neutral (too red, too orange): the pull-down and the as-shown test below
  // are for a cold point the grade cannot warm; here they would add red to red skin, or judge it by a look that
  // saturates skin on purpose.
  const warmStart = kind === "skin" && (f.a + ta) * ta + (f.b + tb) * tb > 0;
  // The pull-down fallback for a tap the solution cannot honour (TAP_SOLVE.fall*).
  const fallback = (): TapSolve & { ok: true } => {
    if (warmStart) return { ok: true, kind, gains: [1, 1], before, after: before, limited: true };
    const green = (q: F) => { const h = ((Math.atan2(q.b + tb, q.a + ta) * 180) / Math.PI + 360) % 360; return Math.hypot(q.a + ta, q.b + tb) > S.limited && h > S.greenLo && h < S.greenHi; };
    let best: { x: number; y: number; f: F } | null = null;
    for (let i = 0; i <= S.fallSteps; i++) for (let j = 0; j <= S.fallSteps; j++) {
      if (!i && !j) continue;
      const gx = (i / S.fallSteps) * Math.log(S.fallRed), gy = -(j / S.fallSteps) * Math.log(S.fallBlue);
      const q = at(gx, gy);
      if (green(q) || q.c >= (best ? best.f.c : before) - 1e-6) continue;
      best = { x: gx, y: gy, f: q };
    }
    if (!best || best.f.c > (1 - S.fallGain) * before) return { ok: true, kind, gains: [1, 1], before, after: before, limited: true };
    return { ok: true, kind, gains: [Math.exp(best.x), Math.exp(best.y)], before, after: best.f.c, limited: true };
  };
  for (let it = 0; it < S.iters && f.c > S.done; it++) {
    // Forward differences (backward at the upper bound).
    const hx = x + S.probe > bound ? -S.probe : S.probe, hy = y + S.probe > bound ? -S.probe : S.probe;
    const fx = at(x + hx, y), fy = at(x, y + hy);
    const j11 = (fx.a - f.a) / hx, j12 = (fy.a - f.a) / hy, j21 = (fx.b - f.b) / hx, j22 = (fy.b - f.b) / hy;
    const det = j11 * j22 - j12 * j21;
    const steps: [number, number][] = [];
    if (Math.abs(det) > 1e-7) steps.push([-(j22 * f.a - j12 * f.b) / det, -(-j21 * f.a + j11 * f.b) / det]);
    // Fixed point: each channel toward its level against green in the target colour (a neutral: green's own).
    const tl = kind === "neutral" ? [1, 1, 1] : oklabToLinear(f.L, ta, tb).map((c) => Math.max(1e-4, c));
    const off = (c: number) => Math.log(Math.max(1e-4, f.lin[c]) / Math.max(1e-4, f.lin[1])) - Math.log(tl[c] / tl[1]);
    steps.push([-off(0), -off(2)]);
    // A neutral takes the first step that pays. Skin takes the better of the two: skin the balance turned red
    // sits near the top of a chroma ceiling, where the local slope (more red: a little less chroma) points away
    // from the target and the fixed-point step (less red) is the one that gets there.
    let next: { x: number; y: number; f: F } | null = null;
    for (const [dx0, dy0] of steps) {
      const k0 = Math.min(1, S.step / Math.max(1e-9, Math.max(Math.abs(dx0), Math.abs(dy0))));
      for (let k = k0, tries = 0; tries < 5; tries++, k /= 2) {
        const nx = clampX(x + k * dx0), ny = clampX(y + k * dy0);
        if (nx === x && ny === y) break;
        const fn = at(nx, ny);
        if (fn.c < f.c - 1e-6) { if (!next || fn.c < next.f.c) next = { x: nx, y: ny, f: fn }; break; }
      }
      if (next && kind === "neutral") break;
    }
    if (!next) break;
    x = next.x; y = next.y; f = next.f;
  }
  let limited = f.c > S.limited;
  if (limited) {
    // Nothing to gain: leave the picture alone.
    if (f.c > S.useless * before) return fallback();
    // The smallest share of the solution that buys (almost) all it can.
    const goal = f.c + S.keep * (before - f.c);
    for (let t = 0.1; t < 0.999; t += 0.1) {
      const ft = at(x * t, y * t);
      if (ft.c <= goal) { x *= t; y *= t; f = ft; break; }
    }
    limited = f.c > S.limited;
    // A tap the guards cut short must still pay on screen. The gains are solved on the correction, but what the
    // user sees is the picture with its style: a patch of open water (a bubble stream that is mostly water) loses
    // a third of its cast in the correction and Vivid paints it blue again, so the frame would be re-balanced
    // for nothing visible. Judged as shown (style, Seabed, Strength), by the same `useless` share: refuse it.
    if (limited) {
      const shown = (tap: [number, number] | undefined) => {
        const o = gradePixel(resolveContext({ ...ctx, settings: { ...ctx.settings, wbTap: tap }, debug: false, trace: undefined }), rgb[0], rgb[1], rgb[2], u, v);
        const [, a, b] = linearToOklab(srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2]));
        return Math.hypot(a - ta, b - tb);
      };
      // … and a tap that is still short of neutral at more than `limitedMax` on a channel is not a grey under a
      // cast: it is water (or another coloured thing) asked to be grey. Re-balancing the frame that hard for it is
      // never what the tap meant, however much of the patch's own chroma it sheds.
      const big = Math.exp(Math.max(Math.abs(x), Math.abs(y))) > S.limitedMax;
      if (big || (!warmStart && shown([Math.exp(x), Math.exp(y)]) > S.useless * shown(undefined))) return fallback();
    }
  }
  return { ok: true, kind, gains: [Math.exp(x), Math.exp(y)], before, after: f.c, limited };
}
