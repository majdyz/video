import type { CameraInfo } from "./camera-detect";
import type { Lens } from "./fisheye";

export type FisheyeProfile = {
  label: string;
  /** Diagonal field of view of the source, degrees; the starting value of the FOV slider. With a lens it is derived from the calibration. */
  fovDeg: number;
  /** Extra radial term (tweak slider start). */
  k1: number;
  /** Calibrated lens, OpenCV fisheye model at the calibration frame size. */
  lens?: Lens;
  /** Where the calibration comes from. */
  source?: string;
  /**
   * Default Strength (0..1). The Osmo's default "Wide" footage already carries
   * part of the camera's own dewarp, so the full calibrated correction
   * over-shoots it: on a public Osmo Action 5 Pro clip the roofline was
   * straightest at ≈0.55 (RMS 0.67 px vs 2.2 px at 1.0). Raw-lens footage
   * (camera dewarp off) wants 1.0.
   */
  strength?: number;
  /** GoPro Wide/Max calibrations are HyperSmooth off; a HyperSmooth clip is cropped by its known factor. */
  goproHyperSmooth?: boolean;
};

/**
 * Calibrations from the Gyroflow lens-profile database (github.com/gyroflow/lens_profiles, CC0-1.0).
 * The Gyroflow database (checked 25 Oct 2026, last commit 28 Jul 2026) has no Osmo Action 4, Action 5 Pro,
 * Osmo 360 or Osmo Nano entries. The Action 4 and 5 Pro share the Action 3's 155° f/2.8 lens, so the
 * Action 3 calibrations stand in; the Osmo Nano (143°) uses the same profile as the closest match.
 * DJI's metadata track (djmd) can carry the clip's own lens (focal + k1..k4; telemetry-parser reads it
 * for Gyroflow); when it does, camera-detect.ts prefers it. The public RockSteady Action 5 Pro clip did not.
 */
const OSMO_ACTION_WIDE_16_9: Lens = {
  // DJI_Osmo_Action_3_FOV__145_f2.8_C_4k_16by9_3840x2160 (RMS 0.32 px); fx agrees with the
  // independent "FOV 155" calibration of the same lens (1400.8) to 0.1 %.
  width: 3840, height: 2160, fx: 1402.5, fy: 1402.7, cx: 1930.5, cy: 1082.7,
  k: [0.2803, -0.0557, 0.0044, -0.0091],
};
const OSMO_ACTION_ULTRA_WIDE_4_3: Lens = {
  // DJI_Osmo_Action_3__4k_Ultra_Wideangle_C4k_4by3_4096x3072 (RMS 0.82 px); the same calibrator's
  // 2.5K 4:3 profile (RMS 0.52) scales to fx 1191.6, k1 0.402.
  width: 4096, height: 3072, fx: 1191.5, fy: 1189.5, cx: 2042.7, cy: 1541.9,
  k: [0.3939, -0.0548, 0.0191, -0.009],
};
// GoPro: the HERO9, 10 and 11 Black share the Wide calibrations below (Gyroflow lists the same
// official numbers, calibrated by AdrianEddy/"Eddy", for all three); HERO12 and HERO13 Black keep
// the HERO11's 1/1.9" sensor and lens, and an independent HERO12 8:7 calibration (Bhavith Potluri,
// RMS 0.70) matches the HERO11 one once its HyperSmooth crop (0.928) is taken out (fx 1835 vs 1704/0.928 = 1836).
// HERO12/13 clips normally carry their own lens polynomial (GPMF "Large FOV"), which camera-detect.ts
// prefers over these.
const GOPRO_WIDE_16_9: Lens = {
  // GoPro_HERO11 Black_Wide_16by9 (official, Eddy, RMS 0.27 px, HyperSmooth off)
  width: 3840, height: 2160, fx: 1796.3, fy: 1797.2, cx: 1919.4, cy: 1063.2,
  k: [0.0342, 0.0677, -0.0741, 0.0299],
};
const GOPRO_WIDE_4_3: Lens = {
  // GoPro_HERO11 Black_Wide_4by3 (official, Eddy, RMS 0.80 px at 5312x3984, HyperSmooth off)
  width: 5312, height: 3984, fx: 2373.2, fy: 2374.2, cx: 2685.7, cy: 1992.6,
  k: [0.0329, 0.0557, -0.0384, 0.0069],
};
const GOPRO_WIDE_8_7: Lens = {
  // GoPro_HERO11 Black_Wide_8by7 (official, Eddy, RMS 0.96 px at 5312x4648, HyperSmooth off); HERO11–13 only
  width: 5312, height: 4648, fx: 2357.1, fy: 2356.1, cx: 2676.8, cy: 2319.6,
  k: [0.0314, 0.0597, -0.0434, 0.0099],
};
const GOPRO_MAX_LENS_16_9: Lens = {
  // GoPro_HERO10 Black_Max_NO-EIS_2.7k_16by9 (official, Eddy, RMS 0.32 px): Max Lens Mod on HERO9–11
  width: 2704, height: 1520, fx: 1120.2, fy: 1119.3, cx: 1366.2, cy: 734.4,
  k: [0.1544, -0.1579, 0.1288, -0.0427],
};

export const PROFILES: Record<string, FisheyeProfile> = {
  "osmo-action-wide": {
    label: "Osmo Action 3 / 4 / 5 Pro / Nano, Wide 16:9 (camera dewarp on, the default)",
    fovDeg: 148, k1: 0, lens: OSMO_ACTION_WIDE_16_9, source: "Gyroflow lens profile (Action 3, 155° lens), strength fitted on a public Action 5 Pro clip", strength: 0.55,
  },
  "osmo-action-wide-raw": {
    label: "Osmo Action 3 / 4 / 5 Pro, Wide 16:9 (camera dewarp off)",
    fovDeg: 148, k1: 0, lens: OSMO_ACTION_WIDE_16_9, source: "Gyroflow lens profile (Action 3, 155° lens)", strength: 1,
  },
  "osmo-action-ultra-wide": {
    label: "Osmo Action 3 / 4 / 5 Pro, Ultra Wide 4:3",
    fovDeg: 155, k1: 0, lens: OSMO_ACTION_ULTRA_WIDE_4_3, source: "Gyroflow lens profile (Action 3)",
  },
  "gopro-wide-16x9": {
    label: "GoPro HERO9–13, Wide 16:9",
    fovDeg: 122, k1: 0, lens: GOPRO_WIDE_16_9, source: "Gyroflow lens profile (HERO9–11 official, same lens on 12/13)", goproHyperSmooth: true,
  },
  "gopro-wide-4x3": {
    label: "GoPro HERO9–13, Wide 4:3",
    fovDeg: 122, k1: 0, lens: GOPRO_WIDE_4_3, source: "Gyroflow lens profile (HERO9–11 official, same lens on 12/13)", goproHyperSmooth: true,
  },
  "gopro-wide-8x7": {
    label: "GoPro HERO11–13, Wide 8:7 (full sensor)",
    fovDeg: 122, k1: 0, lens: GOPRO_WIDE_8_7, source: "Gyroflow lens profile (HERO11 official, same lens on 12/13)", goproHyperSmooth: true,
  },
  "gopro-max-lens-16x9": {
    label: "GoPro HERO9–11 with Max Lens Mod, 16:9",
    fovDeg: 160, k1: 0, lens: GOPRO_MAX_LENS_16_9, source: "Gyroflow lens profile (HERO10 Max Lens Mod, official)", goproHyperSmooth: true,
  },
  "generic-fisheye": { label: "Other camera, set the FOV yourself", fovDeg: 150, k1: 0 },
  "none": { label: "Already straight (GoPro Linear, Osmo dewarp on full)", fovDeg: 150, k1: 0, strength: 0 },
};

export const DEFAULT_PROFILE = "osmo-action-wide";

/**
 * Profile for a clip whose metadata names no lens (no action-camera
 * evidence): a fisheye profile on a phone or web clip over-warps and crops
 * it, so such clips start straight and the user picks the lens.
 */
export const UNRECOGNISED_PROFILE = "none";
export const UNRECOGNISED_HINT = "Camera not recognised — pick your lens";

/** Option value of the per-clip lens the camera wrote into the file. */
export const FROM_FILE = "from-file";

/** Zooms a calibration in by a centred crop (HyperSmooth): focal lengths and the principal point's offset grow by 1/crop. */
export function cropLens(lens: Lens, crop: number): Lens {
  if (!(crop > 0 && crop < 1)) return lens;
  const hw = lens.width / 2, hh = lens.height / 2;
  return { ...lens, fx: lens.fx / crop, fy: lens.fy / crop, cx: hw + (lens.cx - hw) / crop, cy: hh + (lens.cy - hh) / crop };
}

/**
 * The profile the warp uses for a picker value and the clip's detected camera: the clip's own lens
 * for FROM_FILE, a database profile otherwise, cropped for HyperSmooth when the file says it was on.
 */
export function resolveProfile(id: string, camera?: CameraInfo): FisheyeProfile {
  if (id === FROM_FILE && camera?.lens) {
    const who = [camera.brand, camera.model].filter(Boolean).join(" ");
    return {
      label: `This clip's own lens data${who ? ` (${who}${camera.lensMode ? `, ${camera.lensMode}` : ""})` : ""}`,
      fovDeg: 150, k1: 0, lens: camera.lens, source: camera.lensSource ?? "lens data in the file", strength: 1,
    };
  }
  const p = PROFILES[id] ?? PROFILES[DEFAULT_PROFILE]!;
  const crop = camera?.brand === "GoPro" ? camera.stabilizationCrop ?? 1 : 1;
  if (p.lens && p.goproHyperSmooth && crop < 1) {
    return { ...p, lens: cropLens(p.lens, crop), source: `${p.source}, HyperSmooth crop ${crop}` };
  }
  return p;
}
