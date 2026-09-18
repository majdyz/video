export type FisheyeProfile = {
  label: string;
  /** Diagonal field of view of the source, degrees. */
  fovDeg: number;
  /** Extra radial term on the fisheye angle, tuned by eye until edges look straight. */
  k1: number;
};

export const PROFILES: Record<string, FisheyeProfile> = {
  "osmo-action-5-pro-wide": { label: "Osmo Action 5 Pro, Wide (155°)", fovDeg: 155, k1: 0 },
  "osmo-action-4-wide": { label: "Osmo Action 4, Wide (155°)", fovDeg: 155, k1: 0 },
  "generic-fisheye": { label: "Other camera, set the FOV yourself", fovDeg: 150, k1: 0 },
};

export const DEFAULT_PROFILE = "osmo-action-5-pro-wide";
