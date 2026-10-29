// Footage profiles: detection and the SDR conversions (CPU reference of the shader).
//   node --experimental-strip-types apps/studio/test/footage.test.ts
// Optional: DLOGM_LUT=/path/to/"DJI OSMO Action 4 D-Log M to Rec.709 V1.cube" checks the
// D-Log M model against DJI's LUT over every natural-colour node (not shipped with the repo).
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  appleLogDecode, detectFootage, PEAK, FOOTAGE_GLSL, FOOTAGE_MODE, footageToSdr, gplogDecode, gplogEncode, hlgInverseOetf, parseCodec, pqEotf, resolveFootage, sdrEncode, shoulder,
} from "../src/pipeline/footage.ts";
import { sanitizeColorSpace } from "../../../packages/shared/src/videoframe-colorspace.ts";
import { djiColourMode, goproColourProfile, protoVarintAt } from "../src/pipeline/camera.ts";

const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// ---------------------------------------------------------------- codec strings
assert.deepEqual(parseCodec("hvc1.2.4.L153.B0"), { family: "hevc", bitDepth: 10, label: "HEVC Main 10" });
assert.equal(parseCodec("hev1.1.6.L120.90").bitDepth, 8);
assert.equal(parseCodec("avc1.640028").bitDepth, 8);
assert.equal(parseCodec("avc1.6E0028").bitDepth, 10, "High 10");
assert.equal(parseCodec("vp09.02.31.10.01.02.02.02.00").bitDepth, 10);
assert.equal(parseCodec("av01.0.08M.10").bitDepth, 10);
assert.equal(parseCodec(null).bitDepth, 8);

// ---------------------------------------------------------------- detection
const iphoneHlg = detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt2020", transfer: "hlg", matrix: "bt2020-ncl" }, brand: "Apple" });
assert.equal(iphoneHlg.detected, "hlg");
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt2020", transfer: "pq", matrix: "bt2020-ncl" } }).detected, "pq");
// Osmo D-Log M: 10-bit HEVC tagged as plain Rec.709.
const osmo = detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt709", transfer: "bt709", matrix: "bt709" }, brand: "DJI", model: "Osmo Action 4" });
assert.equal(osmo.detected, "dlogm");
// 8-bit DJI is Normal colour.
assert.equal(detectFootage({ codec: "avc1.640033", tags: { primaries: "bt709" }, brand: "DJI" }).detected, "standard");
// Osmo HLG is tagged HLG.
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt2020", transfer: "hlg" }, brand: "DJI" }).detected, "hlg");
// GoPro 10-bit (Flat or Natural): Rec.709, no conversion.
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt709", transfer: "bt709" }, brand: "GoPro" }).detected, "standard");
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt2020", transfer: "bt709" } }).detected, "wide");
assert.equal(detectFootage({ codec: "apch", tags: { primaries: "bt2020", transfer: null }, brand: "Apple", model: "iPhone 15 Pro" }).detected, "applelog");
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: null, vendorText: "D-Log M" }).detected, "dlogm");
assert.equal(detectFootage({ codec: null, tags: null }).detected, "standard");
assert.equal(resolveFootage("auto", osmo), "dlogm");
assert.equal(resolveFootage("standard", osmo), "standard", "manual override wins");
assert.equal(resolveFootage("auto", null), "standard");

// ---------------------------------------------------------------- transfer functions (published values)
// BT.2100 HLG: signal 0.5 ↔ scene 1/12; signal 1 ↔ scene 1.
near(hlgInverseOetf(0.5), 1 / 12, 1e-9, "HLG 0.5");
near(hlgInverseOetf(1), 1, 1e-6, "HLG 1.0");
// BT.2100 PQ: 0.508 ≈ 100 cd/m², 0.581 ≈ 203 cd/m² (BT.2408), 0.752 ≈ 1000 cd/m².
near(pqEotf(0.5081), 100, 1, "PQ 100 nit");
near(pqEotf(0.5806), 203, 2, "PQ 203 nit");
near(pqEotf(0.7518), 1000, 5, "PQ 1000 nit");
near(pqEotf(1), 10000, 1e-6, "PQ peak");
// Apple Log white paper / colour-science doctest: 0.18 ↔ 0.4882724.
near(appleLogDecode(0.4882724), 0.18, 1e-6, "Apple Log grey");
near(appleLogDecode(0), -0.05641088, 1e-8, "Apple Log black");
// Shoulder is the identity below 0.5, continuous, monotone and bounded.
assert.equal(shoulder(0.3), 0.3);
near(shoulder(0.5 + 1e-6), 0.5, 1e-5, "shoulder C0");
assert.ok(shoulder(1) > 0.7 && shoulder(1) < 0.85, "HDR reference white leaves room for highlights");
near(shoulder(PEAK.hdr), 1, 1e-9, "1000 cd/m² reaches SDR white");
assert.equal(shoulder(50), 1);
assert.ok(shoulder(3) - shoulder(2) > 0.02, "highlights between 400 and 600 cd/m² stay apart");
near(sdrEncode(1), 1, 0, "SDR white");

// ---------------------------------------------------------------- conversions
const grey = (p: Parameters<typeof footageToSdr>[0], s: number) => footageToSdr(p, [s, s, s]);
// Standard is the identity.
assert.deepEqual(footageToSdr("standard", [0.2, 0.5, 0.9]), [0.2, 0.5, 0.9]);
// Wide-gamut SDR: neutrals untouched, BT.2020 primaries saturate in BT.709.
near(grey("wide", 0.5)[0], 0.5, 1e-4, "wide neutral");
const r2020 = footageToSdr("wide", [0.5, 0, 0]);
assert.ok(r2020[0] > 0.55 && r2020[1] === 0, "2020 red is outside 709: clipped green, brighter red");
// HLG (BT.2408): 18 % grey at 38 % signal → ~26 cd/m² → SDR ≈ 0.42; reference white (75 %) → near white; black → 0.
near(grey("hlg", 0.38)[1], sdrEncode(26 / 203), 0.03, "HLG grey");
assert.ok(grey("hlg", 0.75)[1] > 0.85 && grey("hlg", 0.75)[1] < 0.95, "HLG reference white below clip");
assert.equal(grey("hlg", 0)[0], 0);
assert.ok(grey("hlg", 1)[0] > grey("hlg", 0.9)[0], "HLG highlights keep separation (no clip at ref white)");
// PQ: same anchors.
near(grey("pq", 0.5806)[1], sdrEncode(shoulder(1)), 1e-3, "PQ ref white");
near(grey("pq", 0.3889)[1], sdrEncode(26 / 203), 0.02, "PQ grey (26 cd/m²)");
// HLG and PQ renderings agree on a grey card.
near(grey("hlg", 0.38)[1], grey("pq", 0.3889)[1], 0.03, "HLG ≈ PQ grey");
// Apple Log: grey card → the same SDR grey.
near(grey("applelog", 0.4882724)[1], sdrEncode(26 / 203), 1e-3, "Apple Log grey");
// D-Log M neutral axis follows DJI's LUT (samples of the published table).
for (const [x, y] of [[0.25, 0.192473], [0.5, 0.487409], [0.75, 0.774289], [0.9375, 0.960404]] as const) near(grey("dlogm", x)[1], y, 0.006, `D-Log M neutral ${x}`);
// D-Log M saturates: a log-flat red becomes a clearly red Rec.709 colour.
const dr = footageToSdr("dlogm", [0.55, 0.4, 0.38]);
assert.ok(dr[0] - dr[1] > 0.55 - 0.4, "D-Log M expands chroma");
// GP-Log transfer: base-400 log. GoPro's "MAX2 GP-Log to Rec.709 Technical" LUT grey axis is
// exactly gplogDecode then the BT.709 OETF (samples of the published table).
const oetf709 = (l: number) => (l < 0.018 ? 4.5 * l : 1.099 * Math.pow(l, 0.45) - 0.099);
for (const [x, y] of [[0.125, 0.01257], [0.25, 0.03916], [0.375, 0.09501], [0.5, 0.18025], [0.625, 0.29702], [0.75, 0.4589], [0.875, 0.68458], [1, 1]] as const) {
  near(oetf709(gplogDecode(x)), y, 6e-5, `GP-Log technical grey ${x}`);
}
for (const l of [0, 0.001, 0.0476, 0.18, 1]) near(gplogDecode(gplogEncode(l)), l, 1e-12, `GP-Log round trip ${l}`);
near(gplogDecode(0.5), 19 / 399, 1e-12, "GP-Log code 0.5 = 1/20 of clip, 4.3 stops under");
// GP-Log rendering follows GoPro's HERO12 (fw 2.00+) / HERO13 Creative LUT: grey axis …
for (const [x, y] of [[0.125, 0.05199], [0.25, 0.1021], [0.375, 0.20171], [0.5, 0.36608], [0.625, 0.55236], [0.75, 0.7453], [0.875, 0.88699], [1, 0.9995]] as const) {
  const g = grey("gplog", x);
  near(g[1], y, 0.005, `GP-Log neutral ${x}`);
  near(g[0], g[2], 1e-9, `GP-Log grey stays grey ${x}`);
}
// … and natural colours (nodes of the published 33³ table, code → Rec.709).
const GPLOG_NODES: [[number, number, number], [number, number, number]][] = [
  [[0.4375, 0.5, 0.5625], [0.17084, 0.34665, 0.5465]], [[0.375, 0.5, 0.59375], [0, 0.33114, 0.65234]],
  [[0.3125, 0.46875, 0.5625], [0, 0.30245, 0.62846]], [[0.5, 0.46875, 0.40625], [0.40789, 0.33581, 0.16667]],
  [[0.5625, 0.46875, 0.4375], [0.55755, 0.30097, 0.23987]], [[0.625, 0.5, 0.46875], [0.68817, 0.32889, 0.28608]],
  [[0.40625, 0.53125, 0.46875], [0.0088, 0.48998, 0.2238]], [[0.34375, 0.4375, 0.53125], [0.04266, 0.24076, 0.51438]],
  [[0.53125, 0.53125, 0.40625], [0.43502, 0.45388, 0.05826]], [[0.46875, 0.40625, 0.5], [0.32561, 0.16324, 0.49929]],
  [[0.6875, 0.625, 0.5625], [0.72914, 0.5595, 0.368]], [[0.25, 0.34375, 0.4375], [0.01573, 0.14617, 0.36127]],
  [[0.59375, 0.5625, 0.5], [0.54975, 0.47211, 0.27897]], [[0.375, 0.5625, 0.625], [0, 0.4826, 0.74824]],
  [[0.28125, 0.375, 0.375], [0.03549, 0.22136, 0.21694]], [[0.65625, 0.53125, 0.53125], [0.74397, 0.35351, 0.41732]],
];
{
  let se = 0, max = 0;
  for (const [inp, want] of GPLOG_NODES) {
    const got = footageToSdr("gplog", inp);
    for (let c = 0; c < 3; c++) {
      se += (got[c] - want[c]) ** 2;
      max = Math.max(max, Math.abs(got[c] - want[c]));
    }
  }
  const rms = Math.sqrt(se / GPLOG_NODES.length / 3);
  assert.ok(rms < 0.02 && max < 0.07, `GP-Log natural colours vs GoPro LUT: rms ${rms.toFixed(4)}, max ${max.toFixed(4)}`);
}
// GP-Log is flat: the conversion expands chroma, a log-flat blue-green becomes clearly blue-green.
const gw = footageToSdr("gplog", [0.42, 0.5, 0.55]);
assert.ok(gw[2] - gw[0] > 0.55 - 0.42, "GP-Log expands chroma");

// Every profile maps into 0..1 and is monotone on neutrals.
for (const p of ["standard", "wide", "hlg", "pq", "dlogm", "applelog", "gplog"] as const) {
  let prev = -1;
  for (let i = 0; i <= 64; i++) {
    const v = grey(p, i / 64)[1];
    assert.ok(v >= 0 && v <= 1, `${p} in range`);
    assert.ok(v >= prev - 2e-3, `${p} monotone at ${i / 64}: ${v} < ${prev}`);
    prev = v;
  }
}

// Optional: whole-LUT comparison.
const lutPath = process.env.DLOGM_LUT;
if (lutPath && fs.existsSync(lutPath)) {
  const rows = fs.readFileSync(lutPath, "utf8").split("\n").filter((l) => /^[\d.-]/.test(l.trim())).map((l) => l.trim().split(/\s+/).map(Number));
  const n = Math.round(Math.cbrt(rows.length));
  let se = 0, cnt = 0, max = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const inp: [number, number, number] = [r / (n - 1), g / (n - 1), b / (n - 1)];
    if (Math.max(...inp) - Math.min(...inp) >= 0.25 || Math.max(...inp) >= 0.8) continue;
    const want = rows[(b * n + g) * n + r];
    const got = footageToSdr("dlogm", inp);
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(got[c] - want[c]);
      se += d * d;
      cnt++;
      max = Math.max(max, d);
    }
  }
  const rms = Math.sqrt(se / cnt);
  console.log(`D-Log M vs DJI LUT (natural colours): rms ${rms.toFixed(4)}, max ${max.toFixed(4)}`);
  assert.ok(rms < 0.02 && max < 0.08);
}
// Optional: GPLOG_LUT=/path/to/"GPLOG_Creative_EV0.cube" (HERO12 fw 2.00+ / HERO13, from GoPro's
// "GoPro Log Profiles LUT Downloads" article; not shipped) checks every natural-colour node.
const gplogLut = process.env.GPLOG_LUT;
if (gplogLut && fs.existsSync(gplogLut)) {
  const rows = fs.readFileSync(gplogLut, "utf8").split("\n").map((l) => l.trim()).filter((l) => /^[\d.-]/.test(l)).map((l) => l.split(/\s+/).map(Number)).filter((r) => r.length === 3);
  const n = Math.round(Math.cbrt(rows.length));
  let se = 0, cnt = 0, max = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const inp: [number, number, number] = [r / (n - 1), g / (n - 1), b / (n - 1)];
    if (Math.max(...inp) - Math.min(...inp) >= 0.25 || Math.max(...inp) >= 0.8) continue;
    const want = rows[(b * n + g) * n + r];
    const got = footageToSdr("gplog", inp);
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(got[c] - want[c]);
      se += d * d;
      cnt++;
      max = Math.max(max, d);
    }
  }
  const rms = Math.sqrt(se / cnt);
  console.log(`GP-Log vs GoPro LUT (natural colours): rms ${rms.toFixed(4)}, max ${max.toFixed(4)}`);
  assert.ok(rms < 0.02 && max < 0.16);
}

// Vendor colour modes. DJI djmd: StreamMeta(2) → ColorMode(4) → color_mode(1) = 19 (D-Log M), as in Osmo Action 5 Pro files.
const djmd = Uint8Array.from([0x0a, 0x03, 0x61, 0x62, 0x63, 0x12, 0x09, 0x1a, 0x03, 0x28, 0x0a, 0x30, 0x22, 0x02, 0x08, 0x13, 0x1a, 0x00]);
assert.equal(protoVarintAt(djmd, [2, 4, 1]), 19);
assert.equal(djiColourMode(djmd), "D-Log M");
assert.equal(djiColourMode(Uint8Array.from([0x12, 0x02, 0x1a, 0x00])), "Normal", "proto3 omits the default");
assert.equal(djiColourMode(Uint8Array.from([0x12, 0x04, 0x22, 0x02, 0x08, 0x09])), "HLG");
assert.equal(djiColourMode(Uint8Array.from([0xff, 0xff])), null, "garbage");
const gpmf = new Uint8Array(40);
gpmf.set([0x50, 0x54, 0x43, 0x4c, 0x63, 0x06, 0x00, 0x01, ...new TextEncoder().encode("GP-LOG")], 10);
assert.equal(goproColourProfile(gpmf), "GP-LOG");
const goproLog = detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt709", transfer: "bt709" }, brand: "GoPro", vendorText: `GoPro colour profile: ${goproColourProfile(gpmf)}` });
assert.equal(goproLog.detected, "gplog", "GoPro PTCL GP-LOG");
assert.ok(goproLog.evidence.some((e) => /GP-Log/.test(e)));
assert.equal(resolveFootage("auto", goproLog), "gplog");
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: null, vendorText: "GP-Log" }).detected, "gplog");
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt709" }, brand: "DJI", vendorText: "DJI colour mode: Normal" }).detected, "standard", "10-bit Normal stays Rec.709");
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt709" }, brand: "DJI", vendorText: "DJI colour mode: D-Log M" }).detected, "dlogm");
assert.equal(detectFootage({ codec: "hvc1.2.4.L153.B0", tags: { primaries: "bt709" }, brand: "GoPro", vendorText: "GoPro colour profile: FLAT" }).detected, "standard");

// WebKit's out-of-spec "unspecified" colour-space values are nulled before mediabunny sees them.
assert.deepEqual(sanitizeColorSpace({ primaries: "unspecified", transfer: "unspecified", matrix: "smpte170m", fullRange: false }), { primaries: null, transfer: null, matrix: "smpte170m", fullRange: false });
assert.deepEqual(sanitizeColorSpace({ primaries: "bt2020", transfer: "hlg", matrix: "bt2020-ncl", fullRange: false }), { primaries: "bt2020", transfer: "hlg", matrix: "bt2020-ncl", fullRange: false });
assert.deepEqual(sanitizeColorSpace(null), { primaries: null, transfer: null, matrix: null, fullRange: null });

// The GLSL twin carries the same constants (compiled and compared on a GPU by scripts in the scratchpad).
assert.ok(FOOTAGE_GLSL.includes("vec3 footageToSdr(vec3 s)"));
assert.ok(!/NaN|undefined/.test(FOOTAGE_GLSL), "no unformatted constants in the shader");
assert.ok(FOOTAGE_GLSL.includes(`u_footage == ${FOOTAGE_MODE.gplog}) return gplogToSdr(s)`), "GP-Log has a shader branch");

console.log("footage tests passed");
