/**
 * Works out which camera (and, where the file says so, which lens mode) shot a clip, from the
 * metadata action cameras write into their MP4s:
 *
 * - GoPro (HERO8 and later): `moov/udta/FIRM` firmware string and a `udta/GPMF` block in GoPro's
 *   KLV format. Its "Global Settings" carry the model (MINF) and stabilisation (EISA); from the
 *   HERO11/12 on, the "Large FOV" device (DVID FOVL) describes the clip's own lens: the diagonal
 *   FOV, the lens style (VFOV: W wide, L linear, S SuperView, H HyperView, X Max lens) and a
 *   polynomial mapping image radius to the world angle (documented in github.com/gopro/gpmf-parser).
 * - DJI (Osmo Action 3/4/5 Pro, Osmo 360, Osmo Nano): an `udta/meta/ilst/©too` string such as
 *   "DJI OsmoAction5 Pro", and a timed metadata track (sample entry `djmd`, handler "DJI meta")
 *   whose first sample is a protobuf with the product name and, in some modes, the lens's own
 *   OpenCV-fisheye focal length and k1..k4.
 * - Anything else: `©mak`/`©mod`, Apple `keys` make/model, `©too`, then the frame aspect.
 *
 * Pure: the caller hands in the moov bytes and the first sample of each timed metadata track.
 */
import type { Lens } from "./fisheye";

export type MetaSample = { format: string; data: Uint8Array };

/** GoPro's own lens description for the clip (GPMF "Large FOV"). */
export type GoProFov = {
  /** Diagonal field of view, degrees. */
  zfov: number;
  /** Lens style letter: W wide, L linear, S SuperView, H HyperView, X Max lens mod. */
  vfov: string;
  /** world_angle = Σ poly[i] · (zmpl · r)^i with r the radius over the half diagonal of the unwarped frame. */
  poly: number[];
  zmpl: number;
  /** Aspect ratio of the unwarped lens image and of the recorded (warped) frame. */
  aruw: number;
  arwa: number;
  mapx: number[];
  mapy: number[];
};

export type CameraInfo = {
  brand?: "DJI" | "GoPro" | "Insta360" | string;
  /** Marketing name, e.g. "Osmo Action 5 Pro", "HERO12 Black". */
  model?: string;
  firmware?: string;
  /** Lens mode the file states, e.g. "Wide", "SuperView", "Linear", "Max Lens Mod". */
  lensMode?: string;
  /** Stabilisation the file states, e.g. "HyperSmooth (HS EIS)", "RockSteady". */
  stabilization?: string;
  /** HyperSmooth / RockSteady crop factor relative to the unstabilised view (1 when off or unknown). */
  stabilizationCrop?: number;
  /** The clip's own lens calibration, when the camera wrote one. Beats any database profile. */
  lens?: Lens;
  /** Where `lens` came from and how well the conversion fits. */
  lensSource?: string;
  /** GoPro's raw lens description, kept for the log and for modes the warp cannot yet model. */
  goproFov?: GoProFov;
  /** Suggested profile id from profiles.ts. */
  profileId?: string;
  /** Short reasons, for the log and the hint under the camera picker. */
  evidence: string[];
};

type Box = { type: string; start: number; end: number; body: number };

function boxes(buf: Uint8Array, from: number, to: number): Box[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = Number(view.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) size = to - at;
    if (size < body - at || at + size > to) break;
    out.push({ type: String.fromCharCode(buf[at + 4]!, buf[at + 5]!, buf[at + 6]!, buf[at + 7]!), start: at, end: at + size, body });
    at += size;
  }
  return out;
}

const latin1 = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join("");
const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);
const clean = (s: string) => s.replace(/\0+$/g, "").trim();

/** moov children, and udta's, with a `meta` box's full-box header skipped where needed. */
function moovChildren(moov: Uint8Array): Box[] {
  const top = boxes(moov, 0, moov.length);
  // Either the moov box itself or already its payload.
  if (top.length === 1 && top[0]!.type === "moov") return boxes(moov, top[0]!.body, top[0]!.end);
  return top;
}

function metaChildren(buf: Uint8Array, meta: Box): Box[] {
  // ISO meta is a full box (4 bytes version/flags); QuickTime's is not. Try both.
  const iso = boxes(buf, meta.body + 4, meta.end);
  if (iso.some(b => b.type === "hdlr")) return iso;
  return boxes(buf, meta.body, meta.end);
}

/** iTunes-style tags (©too, ©mak, ©mod …) and Apple `keys` tags from a meta box. */
function readIlst(buf: Uint8Array, meta: Box, into: Map<string, string>): void {
  const kids = metaChildren(buf, meta);
  const ilst = kids.find(b => b.type === "ilst");
  if (!ilst) return;
  const keysBox = kids.find(b => b.type === "keys");
  const keyNames: string[] = [];
  if (keysBox) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const n = view.getUint32(keysBox.body + 4);
    let at = keysBox.body + 8;
    for (let i = 0; i < n && at + 8 <= keysBox.end; i++) {
      const size = view.getUint32(at);
      if (size < 8) break;
      keyNames.push(latin1(buf.subarray(at + 8, at + size)));
      at += size;
    }
  }
  for (const item of boxes(buf, ilst.body, ilst.end)) {
    const data = boxes(buf, item.body, item.end).find(b => b.type === "data");
    if (!data || data.end - data.body < 8) continue;
    const value = clean(utf8(buf.subarray(data.body + 8, data.end)));
    if (!value) continue;
    // A keys-indexed item is named by its 1-based index as a big-endian integer.
    const idx = (buf[item.start + 4]! << 24) | (buf[item.start + 5]! << 16) | (buf[item.start + 6]! << 8) | buf[item.start + 7]!;
    const name = keyNames.length && idx >= 1 && idx <= keyNames.length ? keyNames[idx - 1]! : item.type;
    into.set(name, value);
  }
}

/** QuickTime udta text atoms (©mak etc.): 2 bytes length, 2 bytes language, text. */
function readUdtaText(buf: Uint8Array, b: Box): string {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.end - b.body >= 4) {
    const len = view.getUint16(b.body);
    if (len > 0 && b.body + 4 + len <= b.end) return clean(utf8(buf.subarray(b.body + 4, b.body + 4 + len)));
  }
  return clean(latin1(buf.subarray(b.body, b.end)));
}

// ---- GoPro GPMF (KLV: 4 char key, 1 char type, 1 byte struct size, 2 byte repeat, payload padded to 4) ----

type Klv = { key: string; type: string; value: unknown; children?: Klv[] };

export function parseGpmf(buf: Uint8Array, from = 0, to = buf.length, depth = 0): Klv[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Klv[] = [];
  let at = from;
  while (at + 8 <= to) {
    const key = latin1(buf.subarray(at, at + 4));
    if (!/^[A-Za-z0-9 ]{4}$/.test(key)) break;
    const type = String.fromCharCode(buf[at + 4]!);
    const ss = buf[at + 5]!;
    const rep = view.getUint16(at + 6);
    const n = ss * rep;
    const p = at + 8;
    if (p + n > to) break;
    let value: unknown;
    let children: Klv[] | undefined;
    if (type === "\0") {
      if (depth < 4) children = parseGpmf(buf, p, p + n, depth + 1);
    } else if (type === "c") {
      // Several strings of `ss` bytes each (e.g. PYCF "r0      r1 …").
      const strs: string[] = [];
      for (let i = 0; i < rep; i++) strs.push(clean(latin1(buf.subarray(p + i * ss, p + (i + 1) * ss))));
      value = ss > 1 && rep > 1 ? strs : clean(latin1(buf.subarray(p, p + n)));
    } else if (type === "f") {
      value = Array.from({ length: n / 4 }, (_, i) => view.getFloat32(p + i * 4));
    } else if (type === "d") {
      value = Array.from({ length: n / 8 }, (_, i) => view.getFloat64(p + i * 8));
    } else if (type === "L" || type === "l") {
      value = Array.from({ length: n / 4 }, (_, i) => (type === "L" ? view.getUint32(p + i * 4) : view.getInt32(p + i * 4)));
    } else if (type === "S" || type === "s") {
      value = Array.from({ length: n / 2 }, (_, i) => (type === "S" ? view.getUint16(p + i * 2) : view.getInt16(p + i * 2)));
    } else if (type === "B" || type === "b") {
      value = Array.from(buf.subarray(p, p + n), v => (type === "b" && v > 127 ? v - 256 : v));
    } else {
      value = buf.subarray(p, p + n);
    }
    out.push({ key, type, value, children });
    at = p + ((n + 3) & ~3);
  }
  return out;
}

function gpmfDevices(klv: Klv[]): Map<string, Map<string, unknown>> {
  const devices = new Map<string, Map<string, unknown>>();
  for (const dev of klv.filter(k => k.key === "DEVC")) {
    const m = new Map<string, unknown>();
    for (const c of dev.children ?? []) m.set(c.key, c.value);
    const name = typeof m.get("DVNM") === "string" ? (m.get("DVNM") as string) : String(devices.size);
    devices.set(name, m);
  }
  return devices;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? (v as string[]).join("") : undefined);
const nums = (v: unknown): number[] | undefined => (Array.isArray(v) && typeof v[0] === "number" ? (v as number[]) : undefined);

/** GoPro firmware prefixes to models, for files whose GPMF block lacks MINF. */
const GOPRO_FIRMWARE: [RegExp, string][] = [
  [/^H24\.01/, "HERO13 Black"],
  [/^H23\.01/, "HERO12 Black"],
  [/^H22\.03/, "HERO11 Black Mini"],
  [/^H22\.01/, "HERO11 Black"],
  [/^H21\.01/, "HERO10 Black"],
  [/^HD9\./, "HERO9 Black"],
  [/^HD8\./, "HERO8 Black"],
  [/^HD7\./, "HERO7"],
  [/^HD6\./, "HERO6 Black"],
];

const VFOV_NAMES: Record<string, string> = { W: "Wide", L: "Linear", S: "SuperView", H: "HyperView", X: "Max Lens Mod" };

/** HyperSmooth crop factors (Gyroflow lens-profile database, "compatible_settings" of the HERO9–11 Wide profiles). */
export function hyperSmoothCrop(eisa: string | undefined): number {
  if (!eisa) return 1;
  if (/boost/i.test(eisa) && !/auto/i.test(eisa)) return 0.745;
  if (/HS (EIS|High|On)/i.test(eisa)) return 0.928;
  return 1;
}

/**
 * GoPro's lens polynomial as an OpenCV-fisheye lens for this frame size. The polynomial gives
 * the world angle from the radius; the warp needs the radius from the angle, which the
 * Kannala-Brandt form r = f θ (1 + k1 θ² + … + k4 θ⁸) represents with a linear least-squares
 * fit on the polynomial's inverse. Returns the lens and the worst fit error in pixels.
 */
export function lensFromGoProPoly(fov: GoProFov, width: number, height: number): { lens: Lens; maxErrPx: number } | undefined {
  const { poly, zmpl } = fov;
  if (!(poly.length >= 2 && poly[1]! > 0 && zmpl > 0)) return undefined;
  const halfDiag = Math.hypot(width, height) / 2;
  const angle = (rn: number) => { const x = zmpl * rn; let s = 0, p = 1; for (const c of poly) { s += c * p; p *= x; } return s; };
  // The corner of the frame (rn = 1) bounds the angles that matter.
  const thetaCorner = angle(1);
  if (!(thetaCorner > 0.05 && thetaCorner < Math.PI / 2 + 0.3)) return undefined;
  // Sample the inverse r(θ) by sampling r: the polynomial is monotone over the frame.
  const ts: number[] = [], rs: number[] = [];
  let prev = 0;
  for (let i = 1; i <= 200; i++) {
    const rn = (i / 200) * 1.02;
    const t = angle(rn);
    if (t <= prev) break;
    prev = t;
    ts.push(t);
    rs.push(rn * halfDiag);
  }
  if (ts.length < 50) return undefined;
  const f = halfDiag / (zmpl * poly[1]!);
  // r/(fθ) − 1 = k1 θ² + k2 θ⁴ + k3 θ⁶ + k4 θ⁸, solved by normal equations.
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const b = [0, 0, 0, 0];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!, t2 = t * t;
    const row = [t2, t2 * t2, t2 * t2 * t2, t2 * t2 * t2 * t2];
    // Weight by θ so the residual is in pixels (r = fθ(1 + …)).
    const w = (f * t) ** 2;
    const y = rs[i]! / (f * t) - 1;
    for (let r = 0; r < 4; r++) {
      b[r]! += w * row[r]! * y;
      for (let c = 0; c < 4; c++) A[r]![c]! += w * row[r]! * row[c]!;
    }
  }
  const k = solve4(A, b);
  if (!k) return undefined;
  let maxErrPx = 0;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!, t2 = t * t;
    const r = f * t * (1 + t2 * (k[0]! + t2 * (k[1]! + t2 * (k[2]! + t2 * k[3]!))));
    maxErrPx = Math.max(maxErrPx, Math.abs(r - rs[i]!));
  }
  return { lens: { width, height, fx: f, fy: f, cx: width / 2, cy: height / 2, k: k as Lens["k"] }, maxErrPx };
}

function solve4(A: number[][], b: number[]): number[] | undefined {
  const n = 4;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-18) return undefined;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / M[i]![i]!);
}

// ---- DJI djmd protobuf ----

type PbField = { field: number; wire: number; value: number | Uint8Array };

function pbFields(b: Uint8Array): PbField[] | undefined {
  const out: PbField[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 0;
  const varint = (): number | undefined => {
    let r = 0, s = 1;
    for (let n = 0; n < 10; n++) {
      if (i >= b.length) return undefined;
      const c = b[i++]!;
      r += (c & 0x7f) * s;
      s *= 128;
      if (c < 0x80) return r;
    }
    return undefined;
  };
  while (i < b.length) {
    const key = varint();
    if (key === undefined) return undefined;
    const field = Math.floor(key / 8), wire = key & 7;
    if (field === 0) return undefined;
    if (wire === 0) { const v = varint(); if (v === undefined) return undefined; out.push({ field, wire, value: v }); }
    else if (wire === 1) { if (i + 8 > b.length) return undefined; out.push({ field, wire, value: view.getFloat64(i, true) }); i += 8; }
    else if (wire === 5) { if (i + 4 > b.length) return undefined; out.push({ field, wire, value: view.getFloat32(i, true) }); i += 4; }
    else if (wire === 2) { const n = varint(); if (n === undefined || i + n > b.length) return undefined; out.push({ field, wire, value: b.subarray(i, i + n) }); i += n; }
    else return undefined;
  }
  return out;
}

const sub = (fields: PbField[] | undefined, n: number): PbField[] | undefined => {
  const f = fields?.find(x => x.field === n && x.wire === 2);
  return f ? pbFields(f.value as Uint8Array) : undefined;
};
const pbString = (fields: PbField[] | undefined, n: number): string | undefined => {
  const f = fields?.find(x => x.field === n && x.wire === 2);
  return f ? clean(utf8(f.value as Uint8Array)) : undefined;
};
const pbFloats = (fields: PbField[] | undefined, n: number): number[] => {
  const out: number[] = [];
  for (const f of fields?.filter(x => x.field === n) ?? []) {
    if (f.wire === 5) out.push(f.value as number);
    else if (f.wire === 2) {
      const b = f.value as Uint8Array;
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      for (let i = 0; i + 4 <= b.length; i += 4) out.push(v.getFloat32(i, true));
    }
  }
  return out;
};
const pbVarint = (fields: PbField[] | undefined, n: number): number | undefined => {
  const f = fields?.find(x => x.field === n && x.wire === 0);
  return f ? (f.value as number) : undefined;
};

export type DjiClipMeta = {
  productName?: string;
  protoFile?: string;
  firmware?: string;
  /** Lens focal length in pixels at the recorded size, when the camera states it. */
  focal?: number;
  /** OpenCV fisheye k1..k4, when stated. */
  distortion?: number[];
  /** EisStatus enum: 0 off, 1 RockSteady, 2 HorizonSteady, 3 Hyper, 5 HorizonBalancing, 7 off with crop, 8 HorizonCorrection, 9 RS auto. */
  eis?: number;
};

/**
 * First sample of the DJI metadata track. ProductMeta { ClipMeta clip_meta = 1 { ClipMetaHeader = 1
 * { proto_file_name = 1, product_firmware_version = 6, product_name = 10 }, LensDistortionCoefficients = 3
 * { repeated float = 1 }, DigitalFocalLength = 8 (6 in the newer 360 schema) { float = 1 }, EisStatus = 9 } }
 * — field numbers from the telemetry-parser .proto files (MIT/Apache-2.0).
 */
export function parseDjiMeta(sample: Uint8Array): DjiClipMeta | undefined {
  const top = pbFields(sample);
  const clip = sub(top, 1);
  const header = sub(clip, 1);
  if (!header) return undefined;
  const productName = pbString(header, 10);
  const protoFile = pbString(header, 1);
  if (!productName && !protoFile) return undefined;
  const newSchema = /wa530/i.test(protoFile ?? "") || /360 (II|Air)|Avata360/i.test(productName ?? "");
  const distortion = pbFloats(sub(clip, 3), 1);
  const focal = pbFloats(sub(clip, newSchema ? 6 : 8), 1)[0];
  const eis = pbVarint(sub(clip, newSchema ? 7 : 9), 1);
  return {
    productName,
    protoFile,
    firmware: pbString(header, 6),
    focal: focal && focal > 10 ? focal : undefined,
    distortion: distortion.length >= 4 ? distortion.slice(0, 4) : undefined,
    eis,
  };
}

const DJI_EIS: Record<number, string> = { 0: "off", 1: "RockSteady", 2: "HorizonSteady", 3: "HyperSmooth", 4: "Tradeoff", 5: "Horizon Balancing", 7: "off (cropped)", 8: "Horizon correction", 9: "RockSteady (auto)" };

/** "DJI OsmoAction5 Pro" → "Osmo Action 5 Pro". */
export function djiModelName(raw: string): string {
  let s = raw.replace(/^DJI\s*/i, "").trim();
  s = s.replace(/^Osmo\s*Action\s*/i, "Osmo Action ").replace(/^Osmo\s*360/i, "Osmo 360").replace(/^Osmo\s*Nano/i, "Osmo Nano");
  return s.replace(/\s+/g, " ").trim();
}

function djiModelFromProto(proto: string | undefined): string | undefined {
  if (!proto) return undefined;
  if (/ac203/i.test(proto)) return "Osmo Action 4";
  if (/ac204/i.test(proto)) return "Osmo Action 5 Pro";
  if (/ac002|ac202/i.test(proto)) return "Osmo Action 3";
  if (/oq101/i.test(proto)) return "Osmo 360";
  return undefined;
}

const aspectOf = (w: number, h: number) => Math.max(w, h) / Math.min(w, h);
export function aspectClass(width: number, height: number): "16:9" | "4:3" | "8:7" | "other" {
  const a = aspectOf(width, height);
  if (Math.abs(a - 16 / 9) < 0.03) return "16:9";
  if (Math.abs(a - 4 / 3) < 0.03) return "4:3";
  if (Math.abs(a - 8 / 7) < 0.03) return "8:7";
  return "other";
}

/** Profile for a clip by brand and frame aspect, when the file states no lens of its own. */
export function profileFor(brand: string | undefined, width: number, height: number, lensMode?: string): string | undefined {
  const aspect = aspectClass(width, height);
  if (brand === "GoPro") {
    if (lensMode === "Linear") return "none";
    if (aspect === "4:3") return "gopro-wide-4x3";
    if (aspect === "8:7") return "gopro-wide-8x7";
    return "gopro-wide-16x9";
  }
  if (brand === "DJI") {
    if (aspect === "4:3") return "osmo-action-ultra-wide";
    return "osmo-action-wide";
  }
  return undefined;
}

export type DetectInput = { moov: Uint8Array; width: number; height: number; metaSamples?: MetaSample[] };

export function detectCamera({ moov, width, height, metaSamples = [] }: DetectInput): CameraInfo {
  const info: CameraInfo = { evidence: [] };
  const tags = new Map<string, string>();
  let gpmf: Map<string, Map<string, unknown>> | undefined;
  const kids = moovChildren(moov);
  for (const k of kids) {
    if (k.type === "meta") readIlst(moov, k, tags);
    if (k.type !== "udta") continue;
    for (const u of boxes(moov, k.body, k.end)) {
      if (u.type === "meta") readIlst(moov, u, tags);
      else if (u.type === "FIRM") tags.set("FIRM", clean(latin1(moov.subarray(u.body, u.end))));
      else if (u.type === "GPMF") gpmf = gpmfDevices(parseGpmf(moov, u.body, u.end));
      else if (u.type.charCodeAt(0) === 0xa9) tags.set(u.type, readUdtaText(moov, u));
    }
  }

  // GoPro
  const global = gpmf?.get("Global Settings") ?? gpmf?.get("Video Global Settings");
  const firm = tags.get("FIRM") ?? str(global?.get("FMWR"));
  const goproModel = str(global?.get("MINF")) ?? GOPRO_FIRMWARE.find(([re]) => firm && re.test(firm))?.[1];
  if (goproModel || (firm && GOPRO_FIRMWARE.some(([re]) => re.test(firm)))) {
    info.brand = "GoPro";
    info.model = goproModel?.replace(/^GoPro\s*/i, "");
    info.firmware = firm;
    info.evidence.push(`GoPro firmware ${firm ?? "?"}${str(global?.get("MINF")) ? `, model "${str(global?.get("MINF"))}" in GPMF` : ""}`);
    const eisa = str(global?.get("EISA"));
    const eise = str(global?.get("EISE"));
    if (eisa && eisa !== "N/A") info.stabilization = `HyperSmooth (${eisa})`;
    else if (eise === "N") info.stabilization = "off";
    info.stabilizationCrop = hyperSmoothCrop(eisa);
    if (str(global?.get("DZOM")) === "Y") info.evidence.push("digital zoom on");
    const fovl = gpmf?.get("Large FOV") ?? [...(gpmf?.values() ?? [])].find(d => { const id = d.get("DVID"); return id instanceof Uint8Array && latin1(id) === "FOVL"; });
    if (fovl) {
      const fov: GoProFov = {
        zfov: nums(fovl.get("ZFOV"))?.[0] ?? 0,
        vfov: str(fovl.get("VFOV")) ?? "",
        poly: nums(fovl.get("POLY")) ?? [],
        zmpl: nums(fovl.get("ZMPL"))?.[0] ?? 1,
        aruw: nums(fovl.get("ARUW"))?.[0] ?? width / height,
        arwa: nums(fovl.get("ARWA"))?.[0] ?? width / height,
        mapx: nums(fovl.get("MAPX")) ?? [1],
        mapy: nums(fovl.get("MAPY")) ?? [1],
      };
      info.goproFov = fov;
      info.lensMode = VFOV_NAMES[fov.vfov] ?? (fov.vfov || undefined);
      info.evidence.push(`GoPro lens data: ${info.lensMode ?? "?"} ${fov.zfov.toFixed(1)}° diagonal`);
      const identityMap = Math.abs(fov.aruw - fov.arwa) < 0.01 && fov.mapx.length <= 1 && Math.abs((fov.mapx[0] ?? 1) - 1) < 1e-3 && fov.mapy.length <= 1 && Math.abs((fov.mapy[0] ?? 1) - 1) < 1e-3;
      if (fov.vfov === "L") {
        info.profileId = "none";
        info.evidence.push("Linear mode is already straight");
      } else if (identityMap) {
        const fit = lensFromGoProPoly(fov, width, height);
        if (fit && fit.maxErrPx < Math.max(2, width / 1000)) {
          info.lens = fit.lens;
          info.lensSource = `lens data GoPro wrote into this clip (${info.lensMode}, ${fov.zfov.toFixed(1)}° diagonal${info.stabilization ? `, ${info.stabilization}` : ""})`;
          info.profileId = "from-file";
        }
      } else {
        info.evidence.push(`${info.lensMode} stretches the frame non-radially; using the closest Wide profile`);
      }
    } else {
      // Older bodies (HERO7–10) state only the lens style in the global settings.
      const vfov = str(global?.get("VFOV"));
      if (vfov) {
        info.lensMode = VFOV_NAMES[vfov] ?? vfov;
        info.evidence.push(`lens mode ${info.lensMode}`);
        if (vfov === "L") info.profileId = "none";
        else if (vfov === "S" || vfov === "H") info.evidence.push(`${info.lensMode} stretches the frame non-radially; using the closest Wide profile`);
      }
    }
  }

  // DJI
  const djmd = metaSamples.find(s => s.format === "djmd");
  const dji = djmd ? parseDjiMeta(djmd.data) : undefined;
  const too = tags.get("©too") ?? tags.get("©too");
  if (!info.brand && (dji || /\bDJI\b/i.test(too ?? "") || /\bDJI\b/i.test(tags.get("©mak") ?? ""))) {
    info.brand = "DJI";
    const raw = dji?.productName ?? (too && /DJI/i.test(too) ? too : undefined) ?? tags.get("©mod");
    info.model = raw ? djiModelName(raw) : djiModelFromProto(dji?.protoFile);
    info.firmware = dji?.firmware;
    info.evidence.push(`DJI ${dji?.productName ? `metadata track "${dji.productName}"` : `tag "${raw ?? too}"`}${dji?.protoFile ? ` (${dji.protoFile})` : ""}`);
    if (dji?.eis !== undefined) info.stabilization = DJI_EIS[dji.eis] ?? `EIS ${dji.eis}`;
    if (dji?.focal && dji.distortion) {
      info.lens = { width, height, fx: dji.focal, fy: dji.focal, cx: width / 2, cy: height / 2, k: dji.distortion as Lens["k"] };
      info.lensSource = `lens data DJI wrote into this clip (fx ${dji.focal.toFixed(0)} px)`;
      info.profileId = "from-file";
    }
  }

  // Others: make/model tags.
  if (!info.brand) {
    const make = tags.get("©mak") ?? tags.get("com.apple.quicktime.make") ?? tags.get("com.android.manufacturer");
    const model = tags.get("©mod") ?? tags.get("com.apple.quicktime.model") ?? tags.get("com.android.model");
    if (/insta360/i.test(`${make} ${model} ${too}`)) info.brand = "Insta360";
    else if (make) info.brand = make;
    if (model) info.model = model;
    if (make || model) info.evidence.push(`make/model tags "${[make, model].filter(Boolean).join(" ")}"`);
    else if (too) info.evidence.push(`encoder tag "${too}"`);
  }

  if (!info.profileId) info.profileId = profileFor(info.brand, width, height, info.lensMode);
  if (info.brand === "GoPro" && info.profileId?.startsWith("gopro-wide") && info.stabilizationCrop && info.stabilizationCrop < 1) {
    info.evidence.push(`HyperSmooth crop ${info.stabilizationCrop}`);
  }
  if (!info.brand) info.evidence.push(`no camera metadata; ${aspectClass(width, height)} frame`);
  return info;
}
