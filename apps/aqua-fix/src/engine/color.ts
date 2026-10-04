// Colour-science helpers shared by the CPU analysis / reference apply and
// mirrored verbatim in the GLSL / WGSL grade shader. No DOM dependencies so
// the Node harness can import this file.

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** 256-entry decode table, sRGB byte → linear. */
export const SRGB_TO_LINEAR_LUT: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i / 255);
  return t;
})();

/** Rec.709 luminance of linear RGB. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const cbrt = Math.cbrt;

/** Linear sRGB → Oklab (Björn Ottosson). Returns [L, a, b]. */
export function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Oklab → linear sRGB. */
export function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Oklab hue in degrees [0, 360). */
export function oklabHueDeg(a: number, b: number): number {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

/**
 * Constant-luminance gamut compression: pulls an out-of-range linear RGB
 * triplet toward its own luminance until every channel sits in [0, 1].
 * Channel ratios shrink together, so hue is held (no per-channel clipping
 * that turns bright reds orange or sand magenta).
 */
/**
 * Over-range pixels first scale down (hue and saturation kept, up to
 * GAMUT_SCALE_MIN darker) and only the remainder is compressed at constant
 * luminance. Pure constant-luminance compression turned a saturated orange
 * whose red overshot 1.0 into pale pink — brightness was kept, colour lost.
 */
export const GAMUT_SCALE_MIN = 0.7;
/** Chroma knee: above this share of the gamut's chroma at (L, hue) the chroma rolls off toward (never reaching) the edge. */
export const GAMUT_CHROMA_KNEE = 0.7;
/** … and asymptotically approaches this share of it, so every channel keeps a little headroom. */
export const GAMUT_CHROMA_EDGE = 0.94;
const GAMUT_CHROMA_HI = 0.4;
const GAMUT_CHROMA_STEPS = 10;

function inGamut(rgb: [number, number, number]): boolean {
  return rgb[0] >= 0 && rgb[1] >= 0 && rgb[2] >= 0 && rgb[0] <= 1 && rgb[1] <= 1 && rgb[2] <= 1;
}

/** Largest Oklab chroma inside sRGB at this lightness along this hue direction (unit a, b). */
export function gamutChroma(L: number, ha: number, hb: number): number {
  let lo = 0, hi = GAMUT_CHROMA_HI;
  for (let i = 0; i < GAMUT_CHROMA_STEPS; i++) {
    const mid = 0.5 * (lo + hi);
    if (inGamut(oklabToLinear(L, ha * mid, hb * mid))) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Keeps a colour's chroma short of the gamut edge: a chroma push on an
 * already-saturated hue (pushed intensity on cyan water) would otherwise
 * land exactly on the edge, where one channel is 0 — neon. Mirrors the
 * shaders' capChroma.
 */
export function capChroma(L: number, a: number, b: number, cSrc = 0): [number, number] {
  const C = Math.hypot(a, b);
  if (C < 1e-5) return [a, b];
  const ha = a / C, hb = b / C;
  const cMax = gamutChroma(L, ha, hb);
  const knee = GAMUT_CHROMA_KNEE * cMax;
  if (C <= knee || cMax <= 1e-5) return [a, b];
  const room = GAMUT_CHROMA_EDGE * cMax - knee;
  // Only chroma the grade added is rolled off: a colour that arrived this vivid (a Garibaldi) keeps
  // it — unless even that sits past the edge at the new lightness.
  const floor = Math.min(C, cSrc, GAMUT_CHROMA_EDGE * cMax);
  const c2 = Math.max(floor, knee + room * (1 - Math.exp(-(C - knee) / room)));
  return [ha * c2, hb * c2];
}

export function fitToGamut(r: number, g: number, b: number): [number, number, number] {
  const m = Math.max(r, g, b);
  if (m > 1) {
    const s = Math.max(GAMUT_SCALE_MIN, 1 / m);
    r *= s; g *= s; b *= s;
  }
  return compressToGamut(r, g, b);
}

export function compressToGamut(r: number, g: number, b: number): [number, number, number] {
  const Y = Math.min(1, Math.max(0, luminance(r, g, b)));
  let t = 1;
  const ch = [r, g, b];
  for (let i = 0; i < 3; i++) {
    const c = ch[i];
    if (c > 1) t = Math.min(t, (1 - Y) / (c - Y));
    else if (c < 0) t = Math.min(t, (0 - Y) / (c - Y));
  }
  if (t >= 1) return [r, g, b];
  t = Math.max(0, t);
  return [Y + t * (r - Y), Y + t * (g - Y), Y + t * (b - Y)];
}
