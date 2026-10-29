// Shearwater exports.
//
// XML (Shearwater Desktop / Cloud "Export XML"), as read by Subsurface's
// shearwater.xslt:
//   <dive version="…"><diveLog>
//     <startDate>…</startDate> <imperialUnits>true|false</imperialUnits> <product>…</product>
//     <diveLogRecords><diveLogRecord>
//       <currentTime> seconds, or milliseconds in newer exports </currentTime>
//       <currentDepth> m or ft </currentDepth> <waterTemp> °C or °F </waterTemp>
// Time unit: milliseconds when the samples step by 100 or more (Subsurface
// tests the first record's time against 100; the step is the more robust test).
//
// CSV: Shearwater Cloud's CSV export has a block of dive-info rows
// ("Start Date", "Imperial Units", …: a header row and a value row) and then
// the sample table with a header row naming the columns. Columns are found by
// name, so the same reader also takes other per-sample CSVs with a time and a
// depth column. Units come from the header text: "(ms)", "(min)", "(ft)",
// "(°F)" / "(F)", else seconds, metres, °C (or imperial when the info block
// says Imperial Units = true).

import { kid, kids, numOf, parseXml, textOf } from "./xml.ts";
import { parseWallClock } from "./time.ts";
import { DiveLogError, FT, fToC, tidySamples, type DiveLog, type DiveSample } from "./types.ts";

export function isShearwaterXml(text: string): boolean {
  const head = text.slice(0, 8192);
  // Case-sensitive: Subsurface files start with <divelog …>, which is a different format.
  return /<diveLog[\s>]/.test(head) && /<diveLogRecord[\s>]/.test(text.slice(0, 1 << 20));
}

const truthy = (s: string) => /^(true|1|yes)$/i.test(s.trim());

export function parseShearwaterXml(text: string): DiveLog[] {
  const doc = parseXml(text);
  const logs: DiveLog[] = [];
  const roots = doc.children.flatMap((c) => (c.name.toLowerCase() === "divelog" ? [c] : kids(c, "diveLog")));
  for (const dl of roots) {
    const imperial = truthy(textOf(kid(dl, "imperialUnits")));
    const when = parseWallClock(textOf(kid(dl, "startDate")));
    if (!when) throw new DiveLogError("Shearwater XML: unreadable startDate");
    const recs = kids(kid(dl, "diveLogRecords") ?? dl, "diveLogRecord");
    const raw = recs.map((r) => ({ t: numOf(r, "currentTime"), d: numOf(r, "currentDepth"), w: numOf(r, "waterTemp") }));
    const times = raw.map((r) => r.t).filter((t): t is number => t !== undefined);
    const steps = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0).sort((a, b) => a - b);
    const step = steps.length ? steps[steps.length >> 1] : times[0] ?? 0;
    const tScale = step >= 100 || (steps.length === 0 && (times[0] ?? 0) > 100) ? 1e-3 : 1;
    const samples: DiveSample[] = [];
    for (const r of raw) {
      if (r.t === undefined || r.d === undefined) continue;
      const depth = imperial ? r.d * FT : r.d;
      const temp = r.w === undefined ? undefined : imperial ? fToC(r.w) : r.w;
      samples.push(temp === undefined ? { t: r.t * tScale, depth } : { t: r.t * tScale, depth, temp });
    }
    if (!samples.length) continue;
    const product = textOf(kid(dl, "product")) || textOf(kid(dl, "computerModel"));
    const log: DiveLog = { startTime: when.date, utc: when.utc, samples: tidySamples(samples), format: "shearwater-xml" };
    log.device = product ? `Shearwater ${product}`.replace(/^Shearwater Shearwater/, "Shearwater") : "Shearwater";
    logs.push(log);
  }
  if (!logs.length) throw new DiveLogError("Shearwater XML has no dive records");
  return logs;
}

// ------------------------------------------------------------------ CSV

/** RFC 4180-ish CSV line splitting (quotes, doubled quotes); also accepts ; and tab separators. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const sepOf = (line: string) => ([",", ";", "\t"] as const).map((s) => [s, line.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];

type Col = { i: number; scale: (v: number) => number };

function findCols(header: string[], imperial: boolean) {
  const h = header.map((x) => x.toLowerCase());
  const at = (re: RegExp, not?: RegExp) => h.findIndex((x) => re.test(x) && !(not && not.test(x)));
  const ti = at(/^(time|elapsed|dive ?time|divetime|run ?time|sample ?time)\b|^time\s*\(/, /(to surface|tts|stop|date|surface time|ndl)/);
  const di = at(/depth/, /(stop|max|avg|average|ceiling|mean)/);
  const wi = at(/temp/, /(air|cpu|sensor)/);
  if (ti < 0 || di < 0) return null;
  const tUnit = h[ti];
  const time: Col = { i: ti, scale: /\(ms\)|millis/.test(tUnit) ? (v) => v / 1000 : /\(min/.test(tUnit) ? (v) => v * 60 : (v) => v };
  const dUnit = h[di];
  const ftDepth = /\(ft\)|feet|\bft\b/.test(dUnit) || (imperial && !/\(m\)|met/.test(dUnit));
  const depth: Col = { i: di, scale: ftDepth ? (v) => v * FT : (v) => v };
  let temp: Col | null = null;
  if (wi >= 0) {
    const wUnit = h[wi];
    const fTemp = /°f|\(f\)|fahrenheit/.test(wUnit) || (imperial && !/°c|\(c\)|celsius/.test(wUnit));
    temp = { i: wi, scale: fTemp ? fToC : /\(k\)|kelvin/.test(wUnit) ? (v) => v - 273.15 : (v) => v };
  }
  return { time, depth, temp };
}

/** "mm:ss" / "h:mm:ss" or a plain number. */
const timeCell = (s: string) => {
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(s)) return s.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

export function isShearwaterCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).slice(0, 80);
  return lines.some((l) => {
    const cells = splitCsvLine(l, sepOf(l)).map((c) => c.toLowerCase());
    return cells.length >= 2 && cells.some((c) => /^time\b|^time\s*\(/.test(c)) && cells.some((c) => /depth/.test(c));
  });
}

/**
 * Shearwater Cloud CSV (or any per-sample CSV with time + depth columns).
 * `fallbackStart` is used when the file has no start date row.
 */
export function parseShearwaterCsv(text: string, fallbackStart?: Date): DiveLog {
  const lines = text.split(/\r?\n/);
  let imperial = false;
  let start: { date: Date; utc: boolean } | null = null;
  let device: string | undefined;
  let headerAt = -1;
  let cols: ReturnType<typeof findCols> = null;
  let sep = ",";
  for (let li = 0; li < lines.length && headerAt < 0; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    sep = sepOf(line);
    const cells = splitCsvLine(line, sep);
    const lower = cells.map((c) => c.toLowerCase());
    // Info block: a header row, then a value row (or "key,value" pairs).
    const next = li + 1 < lines.length ? splitCsvLine(lines[li + 1], sep) : [];
    const valueFor = (re: RegExp): string | undefined => {
      const k = lower.findIndex((c) => re.test(c));
      if (k < 0) return undefined;
      if (cells.length === 2 && k === 0) return cells[1];
      return next[k];
    };
    const sd = valueFor(/^(start ?date|date ?time|start ?time|date)$/);
    if (sd && !start) {
      start = parseWallClock(sd);
      const tm = valueFor(/^(start )?time$/);
      if (start && tm && /^\d{1,2}:\d{2}/.test(tm) && !/\d{1,2}:\d{2}/.test(sd)) start = parseWallClock(`${sd} ${tm}`) ?? start;
    }
    const iu = valueFor(/^imperial ?units$/);
    if (iu !== undefined) imperial = truthy(iu);
    const units = valueFor(/^(depth )?units?$/);
    if (units && /imperial|ft|feet/i.test(units)) imperial = true;
    const prod = valueFor(/^(product|computer|computer model|model|dive computer)$/);
    if (prod && !device) device = prod;
    const c = findCols(cells, imperial);
    if (c) {
      headerAt = li;
      cols = c;
    }
  }
  if (headerAt < 0 || !cols) throw new DiveLogError("CSV: no header with time and depth columns");
  const samples: DiveSample[] = [];
  for (let li = headerAt + 1; li < lines.length; li++) {
    if (!lines[li].trim()) continue;
    const cells = splitCsvLine(lines[li], sep);
    const t = timeCell(cells[cols.time.i] ?? ""), d = Number((cells[cols.depth.i] ?? "").replace(",", "."));
    if (t === undefined || !Number.isFinite(d) || cells[cols.depth.i] === "") continue;
    const wRaw = cols.temp ? (cells[cols.temp.i] ?? "").replace(",", ".") : "";
    const w = wRaw === "" ? NaN : Number(wRaw);
    const s: DiveSample = { t: cols.time.scale(t), depth: cols.depth.scale(d) };
    if (cols.temp && Number.isFinite(w)) s.temp = cols.temp.scale(w);
    samples.push(s);
  }
  if (!samples.length) throw new DiveLogError("CSV: no sample rows");
  if (!start && !fallbackStart) throw new DiveLogError("CSV: no start date (pass one)");
  const log: DiveLog = { startTime: start?.date ?? fallbackStart!, utc: start?.utc ?? false, samples: tidySamples(samples), format: "shearwater-csv" };
  log.device = device ? (/shearwater/i.test(device) ? device : `Shearwater ${device}`) : "Shearwater";
  return log;
}
