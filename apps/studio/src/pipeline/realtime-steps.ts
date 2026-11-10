// WebKit export policy: offline (WebCodecs: every frame, resumable) first, and the real-time recorder
// (MediaRecorder on the graded canvas) only when one of its playback speeds clearly beats what offline measured.
// The recorder restarts from the beginning (the seconds offline did are lost), may drop a frame now and then, and
// has to stay in the foreground, so a recorder at ½ speed against offline at 0.45× real time is a loss. Before
// this, any offline run under 1× handed over, and the recorder walked 1× → ½ → ¼ → half size restarting each time.

export type RealtimeStep = { scale: number; rate: number };

const ALL: readonly RealtimeStep[] = [{ scale: 1, rate: 1 }, { scale: 1, rate: 0.5 }, { scale: 1, rate: 0.25 }, { scale: 0.5, rate: 0.25 }];

/** A recorder step must be this much faster than the offline speed to be worth the restart. */
export const REALTIME_MIN_GAIN = 1.3;

/**
 * The recorder's steps (playback rate, size), fastest first. With the speed an offline export measured
 * (× real time): only the full-size steps at least REALTIME_MIN_GAIN× faster (empty: stay offline).
 * null (the recorder forced with ?rt=1): every step, down to half size.
 */
export function realtimeSteps(offlineSpeed: number | null): RealtimeStep[] {
  if (offlineSpeed === null) return ALL.map((s) => ({ ...s }));
  return ALL.filter((s) => s.scale === 1 && s.rate >= offlineSpeed * REALTIME_MIN_GAIN).map((s) => ({ ...s }));
}
