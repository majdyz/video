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
};

/**
 * Calibrations from the Gyroflow lens-profile database (github.com/gyroflow/lens_profiles, CC0-1.0).
 * The Osmo Action 4 and 5 Pro share the Action 3's 155° f/2.8 lens; the HERO12/13 share the HERO11's.
 */
const OSMO_ACTION_WIDE_16_9: Lens = {
  // DJI_Osmo_Action_3_FOV__145_f2.8_C_4k_16by9_3840x2160 (RMS 0.32 px); fx agrees with the
  // independent "FOV 155" calibration of the same lens (1400.8) to 0.1 %.
  width: 3840, height: 2160, fx: 1402.5, fy: 1402.7, cx: 1930.5, cy: 1082.7,
  k: [0.2803, -0.0557, 0.0044, -0.0091],
};
const OSMO_ACTION_ULTRA_WIDE_4_3: Lens = {
  // DJI_Osmo_Action_3__4k_Ultra_Wideangle_C4k_4by3_4096x3072
  width: 4096, height: 3072, fx: 1191.5, fy: 1189.5, cx: 2042.7, cy: 1541.9,
  k: [0.3939, -0.0548, 0.0191, -0.009],
};
const GOPRO_HERO11_WIDE_16_9: Lens = {
  // GoPro_HERO11 Black_Wide_16by9 (Eddy)
  width: 3840, height: 2160, fx: 1796.3, fy: 1797.2, cx: 1919.4, cy: 1063.2,
  k: [0.0342, 0.0677, -0.0741, 0.0299],
};

export const PROFILES: Record<string, FisheyeProfile> = {
  "osmo-action-wide": {
    label: "Osmo Action 3 / 4 / 5 Pro, Wide 16:9",
    fovDeg: 148, k1: 0, lens: OSMO_ACTION_WIDE_16_9, source: "Gyroflow lens profile (Action 3, 155° lens)",
  },
  "osmo-action-ultra-wide": {
    label: "Osmo Action 3 / 4 / 5 Pro, Ultra Wide 4:3",
    fovDeg: 155, k1: 0, lens: OSMO_ACTION_ULTRA_WIDE_4_3, source: "Gyroflow lens profile (Action 3)",
  },
  "gopro-hero11-wide": {
    label: "GoPro HERO11 / 12 / 13, Wide 16:9",
    fovDeg: 122, k1: 0, lens: GOPRO_HERO11_WIDE_16_9, source: "Gyroflow lens profile (HERO11)",
  },
  "generic-fisheye": { label: "Other camera, set the FOV yourself", fovDeg: 150, k1: 0 },
};

export const DEFAULT_PROFILE = "osmo-action-wide";
