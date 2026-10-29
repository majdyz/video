// UDDF (Universal Dive Data Format, uddf.org, v3.x): SI units throughout.
//   uddf/profiledata/repetitiongroup/dive
//     informationbeforedive/datetime     ISO 8601, usually no zone (floating)
//     samples/waypoint/{divetime s, depth m, temperature K}
// Every dive with samples becomes one DiveLog.

import { findAll, kid, kids, numOf, parseXml, textOf, type XmlNode } from "./xml.ts";
import { parseWallClock } from "./time.ts";
import { DiveLogError, tidySamples, type DiveLog, type DiveSample } from "./types.ts";

export function isUddf(text: string): boolean {
  return /<uddf[\s>]/i.test(text.slice(0, 4096));
}

export function parseUddf(text: string): DiveLog[] {
  const doc = parseXml(text);
  const root = findAll(doc, "uddf")[0];
  if (!root) throw new DiveLogError("not a UDDF file");
  const generator = textOf(kid(kid(root, "generator") ?? root, "name")) || undefined;
  const dc = findAll(root, "divecomputer")[0];
  const device = (dc && (textOf(kid(dc, "name")) || textOf(kid(dc, "model")) || dc.attrs.id)) || generator;
  const out: DiveLog[] = [];
  for (const dive of findAll(root, "dive")) {
    const samplesNode = kid(dive, "samples");
    if (!samplesNode) continue;
    const before = kid(dive, "informationbeforedive");
    const when = parseWallClock(textOf(before && kid(before, "datetime")));
    if (!when) throw new DiveLogError("UDDF dive without a readable datetime");
    const samples: DiveSample[] = [];
    for (const wp of kids(samplesNode, "waypoint") as XmlNode[]) {
      const t = numOf(wp, "divetime"), d = numOf(wp, "depth"), k = numOf(wp, "temperature");
      if (t === undefined || d === undefined) continue;
      // UDDF temperatures are kelvin; a few exporters write °C anyway (values below 100).
      const temp = k === undefined ? undefined : k > 150 ? k - 273.15 : k;
      samples.push(temp !== undefined ? { t, depth: d, temp } : { t, depth: d });
    }
    if (!samples.length) continue;
    const log: DiveLog = { startTime: when.date, utc: when.utc, samples: tidySamples(samples), format: "uddf" };
    if (device) log.device = device;
    out.push(log);
  }
  if (!out.length) throw new DiveLogError("UDDF file has no dive samples");
  return out;
}
