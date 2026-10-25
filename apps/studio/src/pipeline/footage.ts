// Footage profile: how the camera encoded the picture (SDR Rec.709, HDR HLG /
// PQ, wide-gamut BT.2020, or a log curve), detected from the clip and
// converted to Rec.709 SDR before any other tool sees it, so the colour
// engine, the stabiliser's look and the export all work on a normal picture.
//
// Everything here is plain maths (no DOM) so the node tests can check it;
// `FOOTAGE_GLSL` is the same transform for the geometry pass, kept in step
// with `footageToSdr` by test/footage.test.ts.
//
// Sources (see ARCHITECTURE.md "Footage profiles"):
// * HLG, PQ: ITU-R BT.2100-2 (inverse OETF / EOTF, OOTF at 1000 cd/m²),
//   BT.2408-5 (HDR reference white 203 cd/m², 18 % grey at 26 cd/m²),
//   BT.2087 (BT.2020 → BT.709 linear matrix).
// * Apple Log: Apple "Apple Log Profile White Paper" (2023) constants, as in
//   colour-science (BSD-3) `log_decoding_AppleLogProfile`; BT.2020 primaries.
// * DJI D-Log M: DJI publishes no formula. The model below is our own fit to
//   DJI's free "D-Log M to Rec.709" LUT (Osmo Action 4 / 5 Pro, both the same
//   Mavic 3 Pro table): a neutral tone curve (degree-7 polynomial) after a
//   3×3 mix in an exponential domain (10^(k·code)). The LUT itself is not
//   shipped. Fit error over natural colours (chroma < 0.25 of the code range,
//   no channel above 0.8): RMS 0.015, max 0.072 of full scale; the neutral
//   axis is within 5/1023.

export type FootageProfile = "standard" | "wide" | "hlg" | "pq" | "dlogm" | "applelog";
/** UI choice: auto-detect, or one profile forced. */
export type FootageChoice = "auto" | FootageProfile;

export const FOOTAGE_LABEL: Record<FootageProfile, string> = {
  standard: "Standard (Rec.709)",
  wide: "Wide gamut (BT.2020 SDR)",
  hlg: "HDR HLG",
  pq: "HDR PQ / HDR10",
  dlogm: "DJI D-Log M",
  applelog: "Apple Log",
};

/** Shader mode numbers (u_footage in FOOTAGE_GLSL). */
export const FOOTAGE_MODE: Record<FootageProfile, number> = { standard: 0, wide: 1, hlg: 2, pq: 3, dlogm: 4, applelog: 5 };

export type ColourTags = { primaries?: string | null; transfer?: string | null; matrix?: string | null; fullRange?: boolean | null };

export type FootageInfo = {
  /** Bits per sample from the codec string (8 when unknown). */
  bitDepth: number;
  /** Codec family + profile for messages, e.g. "HEVC Main 10". */
  codecLabel: string | null;
  tags: ColourTags | null;
  /** Detected profile (before any manual choice). */
  detected: FootageProfile;
  /** Short reasons, for the log and the hint under the picker. */
  evidence: string[];
};

/** Bit depth and a readable name from an RFC 6381 codec string (avc1/hvc1/hev1/vp09/av01). */
export function parseCodec(codec: string | null | undefined): { family: string | null; bitDepth: number; label: string | null } {
  if (!codec) return { family: null, bitDepth: 8, label: null };
  const c = codec.trim();
  const p = c.split(".");
  const fam = p[0].toLowerCase();
  if (fam === "hvc1" || fam === "hev1") {
    // hvc1.<profile_space><profile_idc>.<compat>.<tier><level>...: idc 2 = Main 10; 4 = RExt (10/12-bit 4:2:2, 4:4:4).
    const idc = Number((p[1] ?? "").replace(/^[A-Ca-c]/, ""));
    const depth = idc === 2 ? 10 : idc === 4 ? 10 : 8;
    return { family: "hevc", bitDepth: depth, label: idc === 2 ? "HEVC Main 10" : idc === 4 ? "HEVC RExt (10-bit+)" : "HEVC Main" };
  }
  if (fam === "avc1" || fam === "avc3") {
    const prof = parseInt((p[1] ?? "").slice(0, 2), 16);
    const depth = prof === 110 || prof === 122 || prof === 244 ? 10 : 8;
    return { family: "avc", bitDepth: depth, label: depth > 8 ? "H.264 High 10" : "H.264" };
  }
  if (fam === "vp09") {
    const depth = Number(p[3] ?? 8) || 8;
    return { family: "vp9", bitDepth: depth, label: `VP9${depth > 8 ? ` ${depth}-bit` : ""}` };
  }
  if (fam === "av01") {
    const depth = Number(p[3] ?? 8) || 8;
    return { family: "av1", bitDepth: depth, label: `AV1${depth > 8 ? ` ${depth}-bit` : ""}` };
  }
  if (/^(apch|apcn|apcs|apco|ap4h|ap4x)$/i.test(fam)) return { family: "prores", bitDepth: 10, label: "ProRes" };
  return { family: fam, bitDepth: 8, label: fam.toUpperCase() };
}

export type FootageHints = {
  codec: string | null;
  tags: ColourTags | null;
  /** Camera brand / model from the clip's metadata (Dewarp's detector), when known. */
  brand?: string | null;
  model?: string | null;
  /** Free-form vendor strings that may name the colour mode (DJI / GoPro / Apple metadata). */
  vendorText?: string | null;
};

/**
 * What the clip is, from its colour tags first (HLG / PQ / BT.2020 are
 * always tagged by phones and action cams), then vendor hints for log
 * curves, which cameras tag as plain Rec.709.
 */
export function detectFootage(h: FootageHints): FootageInfo {
  const { bitDepth, label } = parseCodec(h.codec);
  const t = h.tags ?? null;
  const ev: string[] = [];
  if (label) ev.push(`${label}${bitDepth > 8 && !/10/.test(label) ? ` ${bitDepth}-bit` : ""}`);
  if (t && (t.primaries || t.transfer)) ev.push(`tagged ${t.primaries ?? "?"} / ${t.transfer ?? "?"}`);
  const vendor = (h.vendorText ?? "").toLowerCase();
  const brand = (h.brand ?? "").toLowerCase();
  let detected: FootageProfile = "standard";
  if (t?.transfer === "hlg") detected = "hlg";
  else if (t?.transfer === "pq") detected = "pq";
  else if (/d-?log ?m|dlogm/.test(vendor)) {
    detected = "dlogm";
    ev.push(/dji colour mode/.test(vendor) ? "DJI metadata: colour mode D-Log M" : "metadata names D-Log M");
  } else if (/apple ?log/.test(vendor)) {
    detected = "applelog";
    ev.push("Apple metadata names Apple Log");
  } else if (/gopro colour profile: /.test(vendor)) {
    // GoPro's PTCL: Natural / Vibrant / Flat are Rec.709 looks; GP-Log has no published curve yet.
    const p = vendor.match(/gopro colour profile: ([a-z0-9 -]+)/)![1].trim();
    ev.push(/log/.test(p) ? "GoPro colour profile GP-Log: no published curve, shown as Rec.709" : `GoPro colour profile ${p}`);
  } else if (/dji colour mode: (normal|d-cinelike|hlg)/.test(vendor)) {
    // The camera says what it recorded: a 10-bit Normal clip is Rec.709.
    ev.push(`DJI metadata: colour mode ${vendor.match(/dji colour mode: ([a-z-]+)/)![1]}`);
  } else if (brand === "dji" && bitDepth > 8 && t?.primaries !== "bt2020" && !/dji colour mode/.test(vendor)) {
    // No colour mode in the metadata (older firmware, re-muxed file): 10-bit from a DJI action cam is almost always D-Log M.
    detected = "dlogm";
    ev.push("10-bit DJI clip, no colour mode in metadata: assumed D-Log M");
  } else if (/apple|iphone/.test(brand + " " + (h.model ?? "").toLowerCase()) && t?.primaries === "bt2020" && !t?.transfer) {
    detected = "applelog";
    ev.push("iPhone BT.2020 clip with no HDR transfer: Apple Log");
  } else if (t?.primaries === "bt2020") detected = "wide";
  return { bitDepth, codecLabel: label, tags: t, detected, evidence: ev };
}

export function resolveFootage(choice: FootageChoice, info: FootageInfo | null): FootageProfile {
  if (choice !== "auto") return choice;
  return info?.detected ?? "standard";
}

/** True for the HDR transfers a browser may itself convert on upload (see signal-probe.ts). */
export function isHdrProfile(p: FootageProfile): boolean {
  return p === "hlg" || p === "pq";
}

// ------------------------------------------------------------------ maths

type V3 = [number, number, number];

/** BT.2020 → BT.709, linear light (ITU-R BT.2087-0). */
export const BT2020_TO_709: number[] = [
  1.6604910, -0.5876411, -0.0728499,
  -0.1245505, 1.1328999, -0.0083494,
  -0.0181508, -0.1005789, 1.1187297,
];

/** D-Log M fit (see header): 3×3 mix in the 10^(k·code) domain, then the neutral curve. */
export const DLOGM = {
  k: 0.8589883697358386,
  mix: [
    1.440255038916968, -0.4437762677735112, 0.0035212288565433297,
    -0.14085845655693732, 1.2150889073244422, -0.07423045076750484,
    -0.09545213981553106, -0.3110078523920192, 1.4064599922075502,
  ],
  /** Neutral tone curve, c0 + c1·x + … + c7·x⁷ on code values 0..1. */
  neutral: [0.0010071500529459216, -0.16114334055092874, 5.497273250729976, -4.998002182182485, -18.132840948559608, 48.98985798003423, -43.78406825156554, 13.590076458738451],
};

export const APPLE_LOG = { R0: -0.05641088, Rt: 0.01, sigma: 47.28711236, beta: 0.00964052, gamma: 0.08550479, delta: 0.69336945 };

const HLG_A = 0.17883277, HLG_B = 0.28466892, HLG_C = 0.55991073;
const PQ_M1 = 0.1593017578125, PQ_M2 = 78.84375, PQ_C1 = 0.8359375, PQ_C2 = 18.8515625, PQ_C3 = 18.6875;
/** HDR reference white (BT.2408): the level SDR "white" is anchored to. */
export const HDR_REF_WHITE_NITS = 203;
/** HLG nominal peak for the OOTF (BT.2100: γ = 1.2 at 1000 cd/m²). */
export const HLG_PEAK_NITS = 1000;
/** Shoulder start (display-linear, relative to SDR white) for the HDR / log rendering. */
export const SHOULDER = 0.5;
/** Brightest level each rendering must still separate (display-linear, 1 = SDR white). */
export const PEAK = {
  /** HLG at its nominal 1000 cd/m², PQ assumed mastered to 1000 cd/m² (iPhone, GoPro, Osmo HDR all are). */
  hdr: 1000 / 203,
  /** Apple Log's code 1.0 (≈ 12× grey) after the grey anchoring below. */
  appleLog: 0,
};
/** Scene 18 % grey → display-linear 0.128 (26 / 203 cd/m², BT.2408), so grey lands at the same place for log and HDR sources. */
export const SCENE_TO_DISPLAY = 26 / HDR_REF_WHITE_NITS / 0.18;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mul3 = (m: number[], v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

export function hlgInverseOetf(e: number): number {
  e = Math.max(0, e);
  return e <= 0.5 ? (e * e) / 3 : (Math.exp((e - HLG_C) / HLG_A) + HLG_B) / 12;
}

/** PQ signal → absolute display light, cd/m². */
export function pqEotf(e: number): number {
  const p = Math.pow(Math.max(0, e), 1 / PQ_M2);
  return 10000 * Math.pow(Math.max(p - PQ_C1, 0) / (PQ_C2 - PQ_C3 * p), 1 / PQ_M1);
}

export function appleLogDecode(p: number): number {
  const { R0, Rt, sigma, beta, gamma, delta } = APPLE_LOG;
  const Pt = sigma * (Rt - R0) * (Rt - R0);
  if (p >= Pt) return Math.pow(2, (p - delta) / gamma) - beta;
  if (p >= 0) return Math.sqrt(p / sigma) + R0;
  return R0;
}

PEAK.appleLog = appleLogDecode(1) * SCENE_TO_DISPLAY;

/** Highlight roll-off: identity below SHOULDER, then a rational curve that is
 * C¹ at the joint and reaches 1 exactly at `peak`, so every level up to the
 * source's peak keeps some separation (a tanh shoulder squeezed everything
 * above HDR reference white into the top few codes). Above `peak`: 1.
 */
export function shoulder(x: number, peak: number = PEAK.hdr): number {
  if (x <= SHOULDER) return Math.max(0, x);
  const span = Math.max(peak - SHOULDER, 1e-3);
  const t = Math.min(1, (x - SHOULDER) / span);
  const a = span / (1 - SHOULDER) - 1;
  return SHOULDER + (1 - SHOULDER) * ((1 + a) * t) / (1 + a * t);
}

/** Display-linear (1 = SDR white) → Rec.709 / BT.1886 signal. */
export function sdrEncode(y: number): number {
  return Math.pow(clamp01(y), 1 / 2.4);
}

function polyval(c: number[], x: number): number {
  let y = 0;
  for (let i = c.length - 1; i >= 0; i--) y = y * x + c[i];
  return y;
}

/**
 * Source signal (non-linear R'G'B', 0..1, in the clip's own primaries, as
 * the browser hands it over without colour conversion) → Rec.709 SDR signal.
 */
export function footageToSdr(p: FootageProfile, rgb: V3): V3 {
  switch (p) {
    case "standard":
      return rgb.map(clamp01) as V3;
    case "wide": {
      // SDR BT.2020: display light through BT.1886 (γ 2.4), gamut-convert, re-encode.
      const lin = mul3(BT2020_TO_709, rgb.map((v) => Math.pow(clamp01(v), 2.4)) as V3);
      return lin.map(sdrEncode) as V3;
    }
    case "hlg": {
      const e = rgb.map(hlgInverseOetf) as V3;
      const ys = 0.2627 * e[0] + 0.678 * e[1] + 0.0593 * e[2];
      const gain = (HLG_PEAK_NITS * Math.pow(Math.max(ys, 1e-6), 0.2)) / HDR_REF_WHITE_NITS;
      const lin = mul3(BT2020_TO_709, [e[0] * gain, e[1] * gain, e[2] * gain]);
      return lin.map((v) => sdrEncode(shoulder(v, PEAK.hdr))) as V3;
    }
    case "pq": {
      const lin = mul3(BT2020_TO_709, rgb.map((v) => pqEotf(v) / HDR_REF_WHITE_NITS) as V3);
      return lin.map((v) => sdrEncode(shoulder(v, PEAK.hdr))) as V3;
    }
    case "applelog": {
      const lin = mul3(BT2020_TO_709, rgb.map((v) => appleLogDecode(v) * SCENE_TO_DISPLAY) as V3);
      return lin.map((v) => sdrEncode(shoulder(v, PEAK.appleLog))) as V3;
    }
    case "dlogm": {
      const k = DLOGM.k;
      const ex = rgb.map((v) => Math.pow(10, k * clamp01(v))) as V3;
      const m = mul3(DLOGM.mix, ex);
      return m.map((v) => clamp01(polyval(DLOGM.neutral, clamp01(Math.log10(Math.max(v, 1e-6)) / k)))) as V3;
    }
  }
}

/**
 * GLSL ES 3.00 twin of `footageToSdr` (uniform `u_footage`: FOOTAGE_MODE).
 * Declares `vec3 footageToSdr(vec3 s)`.
 */
export const FOOTAGE_GLSL = `
uniform int u_footage;
const mat3 BT2020_TO_709 = mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => BT2020_TO_709[i].toFixed(7)).join(", ")});
const mat3 DLOGM_MIX = mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => DLOGM.mix[i].toPrecision(10)).join(", ")});
float shoulderF(float x, float peak) {
  if (x <= ${SHOULDER.toFixed(4)}) return max(x, 0.0);
  float span = max(peak - ${SHOULDER.toFixed(4)}, 1e-3);
  float t = min(1.0, (x - ${SHOULDER.toFixed(4)}) / span);
  float a = span / ${(1 - SHOULDER).toFixed(4)} - 1.0;
  return ${SHOULDER.toFixed(4)} + ${(1 - SHOULDER).toFixed(4)} * ((1.0 + a) * t) / (1.0 + a * t);
}
vec3 sdrEncode3(vec3 y) { return pow(clamp(y, 0.0, 1.0), vec3(1.0 / 2.4)); }
vec3 shoulder3(vec3 v, float peak) { return vec3(shoulderF(v.r, peak), shoulderF(v.g, peak), shoulderF(v.b, peak)); }
float hlgInv(float e) {
  e = max(e, 0.0);
  return e <= 0.5 ? e * e / 3.0 : (exp((e - ${HLG_C}) / ${HLG_A}) + ${HLG_B}) / 12.0;
}
float pqEotf(float e) {
  float p = pow(max(e, 0.0), ${(1 / PQ_M2).toPrecision(10)});
  return 10000.0 * pow(max(p - ${PQ_C1}, 0.0) / (${PQ_C2} - ${PQ_C3} * p), ${(1 / PQ_M1).toPrecision(10)});
}
float appleLog(float p) {
  float Pt = ${(APPLE_LOG.sigma * (APPLE_LOG.Rt - APPLE_LOG.R0) ** 2).toPrecision(10)};
  if (p >= Pt) return exp2((p - ${APPLE_LOG.delta}) / ${APPLE_LOG.gamma}) - ${APPLE_LOG.beta};
  if (p >= 0.0) return sqrt(p / ${APPLE_LOG.sigma}) + (${APPLE_LOG.R0});
  return ${APPLE_LOG.R0};
}
float dlogmNeutral(float x) {
  x = clamp(x, 0.0, 1.0);
  float y = ${DLOGM.neutral[7].toPrecision(12)};
${DLOGM.neutral.slice(0, 7).reverse().map((c) => `  y = y * x + (${c.toPrecision(12)});`).join("\n")}
  return clamp(y, 0.0, 1.0);
}
vec3 footageToSdr(vec3 s) {
  if (u_footage == 0) return clamp(s, 0.0, 1.0);
  if (u_footage == 1) return sdrEncode3(BT2020_TO_709 * pow(clamp(s, 0.0, 1.0), vec3(2.4)));
  if (u_footage == 2) {
    vec3 e = vec3(hlgInv(s.r), hlgInv(s.g), hlgInv(s.b));
    float ys = dot(e, vec3(0.2627, 0.678, 0.0593));
    float gain = ${HLG_PEAK_NITS.toFixed(1)} * pow(max(ys, 1e-6), 0.2) / ${HDR_REF_WHITE_NITS.toFixed(1)};
    return sdrEncode3(shoulder3(BT2020_TO_709 * (e * gain), ${PEAK.hdr.toPrecision(10)}));
  }
  if (u_footage == 3) return sdrEncode3(shoulder3(BT2020_TO_709 * (vec3(pqEotf(s.r), pqEotf(s.g), pqEotf(s.b)) / ${HDR_REF_WHITE_NITS.toFixed(1)}), ${PEAK.hdr.toPrecision(10)}));
  if (u_footage == 5) return sdrEncode3(shoulder3(BT2020_TO_709 * (vec3(appleLog(s.r), appleLog(s.g), appleLog(s.b)) * ${SCENE_TO_DISPLAY.toPrecision(10)}), ${PEAK.appleLog.toPrecision(10)}));
  if (u_footage == 4) {
    float k = ${DLOGM.k.toPrecision(12)};
    vec3 m = DLOGM_MIX * pow(vec3(10.0), k * clamp(s, 0.0, 1.0));
    vec3 c = log2(max(m, vec3(1e-6))) * ${(Math.LOG10E * Math.LN2).toPrecision(12)} / k;
    return vec3(dlogmNeutral(c.r), dlogmNeutral(c.g), dlogmNeutral(c.b));
  }
  return s;
}
`;
