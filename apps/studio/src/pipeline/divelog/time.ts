// Date strings from dive-log exports → Date. Strings with no zone are kept
// as floating wall-clock time (the fields stored as UTC, `utc: false`);
// strings with Z or ±hh:mm become real instants (`utc: true`).

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type WallClock = { date: Date; utc: boolean };

function mk(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, 0) + s * 1000);
  return Number.isFinite(dt.getTime()) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? dt : null;
}

function hms(t: string | undefined, ampm?: string): [number, number, number] {
  if (!t) return [0, 0, 0];
  const p = t.split(":").map(Number);
  let h = p[0] || 0;
  const ap = (ampm ?? "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return [h, p[1] || 0, p[2] || 0];
}

/** Parse the date formats dive software writes. Returns null when nothing fits. */
export function parseWallClock(raw: string): WallClock | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO 8601: 2025-04-03T23:38:18(.sss)(Z|±hh:mm) or with a space.
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) {
    const [h, mi, sec] = hms(m[4]);
    const d = mk(+m[1], +m[2], +m[3], h, mi, sec);
    if (!d) return null;
    if (!m[5]) return { date: d, utc: false };
    if (/z/i.test(m[5])) return { date: d, utc: true };
    const sign = m[5][0] === "-" ? -1 : 1;
    const z = m[5].slice(1).replace(":", "");
    return { date: new Date(d.getTime() - sign * (+z.slice(0, 2) * 60 + +z.slice(2)) * 60000), utc: true };
  }
  // US: 2/6/2016 11:08:04 AM ; or day-first with dots: 06.02.2016 11:08
  m = s.match(/^(\d{1,2})([/.])(\d{1,2})\2(\d{2,4})(?:[ T,]+(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm)?)?$/i);
  if (m) {
    const [h, mi, sec] = hms(m[5], m[6]);
    const a = +m[1], b = +m[3];
    // Slash dates are month-first (US software) unless the first number cannot be a month.
    const [mo, d] = m[2] === "/" ? (a > 12 ? [b, a] : [a, b]) : [b, a];
    const dt = mk(+m[4], mo, d, h, mi, sec);
    return dt ? { date: dt, utc: false } : null;
  }
  // Text month: "Sat Feb 06 11:08:04 2016", "Feb 6 2016 11:08:04", "6 Feb 2016 11:08".
  const tokens = s.replace(/,/g, " ").split(/\s+/);
  const mi = tokens.findIndex((t) => MONTHS.includes(t.slice(0, 3).toLowerCase()) && /^[a-z]+\.?$/i.test(t));
  if (mi >= 0) {
    const mo = MONTHS.indexOf(tokens[mi].slice(0, 3).toLowerCase()) + 1;
    const nums = tokens.filter((t, i) => i !== mi && /^\d+$/.test(t)).map(Number);
    const time = tokens.find((t) => /^\d{1,2}:\d{2}/.test(t));
    const ampm = tokens.find((t) => /^(am|pm)$/i.test(t));
    const year = nums.find((v) => v > 31);
    const day = nums.find((v) => v >= 1 && v <= 31);
    if (year !== undefined && day !== undefined) {
      const [h, mn, sec] = hms(time, ampm);
      const dt = mk(year, mo, day, h, mn, sec);
      return dt ? { date: dt, utc: false } : null;
    }
  }
  return null;
}
