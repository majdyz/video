// The synthetic dive every fixture in this folder encodes (format-correct, made-up data).
// 40-minute reef dive: 3-minute descent to 18 m, a wandering bottom, ascent to 12 m then
// 5 m, a 3-minute safety stop, surface. Water 28.6 °C at the surface, cooler with depth.

/** Local wall-clock start: 2026-03-14 09:12:30 (UTC+8). */
export const START_WALL = Date.UTC(2026, 2, 14, 9, 12, 30) / 1000;
export const UTC_OFFSET_S = 8 * 3600;
export const DURATION_S = 2400;

const smooth = (a: number, b: number, t0: number, t1: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return a + (b - a) * x * x * (3 - 2 * x);
};

export function truthDepth(t: number): number {
  if (t <= 180) return smooth(0, 18, 0, 180, t);
  if (t <= 900) return 18 + 1.5 * Math.sin(((t - 180) / 360) * Math.PI * 2) * smooth(0, 1, 180, 300, t);
  if (t <= 1500) return smooth(18, 12, 900, 1500, t) + 0.8 * Math.sin(((t - 900) / 300) * Math.PI);
  if (t <= 2100) return smooth(12, 5, 1500, 2100, t);
  if (t <= 2280) return 5;
  return smooth(5, 0, 2280, 2400, t);
}

export const truthTemp = (t: number) => 28.6 - 0.09 * truthDepth(t);
