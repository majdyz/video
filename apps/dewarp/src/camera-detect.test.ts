import { describe, expect, it } from "vitest";
import { aspectClass, detectCamera, djiModelName, hyperSmoothCrop, lensFromGoProPoly, parseDjiMeta, parseGpmf, type GoProFov } from "./camera-detect";
import { DJI_OA5P_DJMD, GOPRO_HERO12_GPMF } from "./camera-fixtures";
import { thetaD } from "./fisheye";

const enc = new TextEncoder();
const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const len = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  new DataView(out.buffer).setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i) & 0xff;
  let at = 8;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
const bytes = (...xs: number[]) => Uint8Array.from(xs);
const cat = (...parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let a = 0; for (const p of parts) { o.set(p, a); a += p.length; } return o; };

/** udta/meta(hdlr mdir)/ilst/<tag>/data — the iTunes form DJI uses for ©too. */
function ilstTag(tag: string, value: string): Uint8Array {
  const data = box("data", bytes(0, 0, 0, 1, 0, 0, 0, 0), enc.encode(value));
  const hdlr = box("hdlr", new Uint8Array(8), enc.encode("mdirappl"), new Uint8Array(9));
  return box("meta", new Uint8Array(4), hdlr, box("ilst", box(tag, data)));
}
const moovWith = (...udta: Uint8Array[]) => box("moov", box("mvhd", new Uint8Array(100)), box("udta", ...udta));

describe("GoPro metadata", () => {
  const gpmf = b64(GOPRO_HERO12_GPMF);

  it("parses the GPMF KLV block of a real HERO12 clip", () => {
    const klv = parseGpmf(gpmf);
    const devices = klv.filter(k => k.key === "DEVC");
    expect(devices.length).toBe(2);
    const fov = devices[1]!.children!;
    expect(fov.find(k => k.key === "VFOV")!.value).toBe("X");
    expect((fov.find(k => k.key === "ZFOV")!.value as number[])[0]).toBeCloseTo(167.62, 2);
    expect((fov.find(k => k.key === "POLY")!.value as number[]).length).toBe(7);
  });

  it("detects a HERO12 Black with the Max Lens Mod and HyperSmooth, and builds the lens from its polynomial", () => {
    const moov = moovWith(box("FIRM", enc.encode("H23.01.02.32.00")), box("GPMF", gpmf));
    const cam = detectCamera({ moov, width: 1920, height: 1080 });
    expect(cam.brand).toBe("GoPro");
    expect(cam.model).toBe("HERO12 Black");
    expect(cam.lensMode).toBe("Max Lens Mod");
    expect(cam.stabilization).toContain("HS EIS");
    expect(cam.stabilizationCrop).toBeCloseTo(0.928);
    expect(cam.profileId).toBe("from-file");
    // An independent Gyroflow calibration of the HERO12 Max mode at 1080p (Louis O'Brien, RMS 0.28): fx 659.8.
    expect(cam.lens!.fx).toBeGreaterThan(640);
    expect(cam.lens!.fx).toBeLessThan(670);
    const ref = { fx: 659.8, k: [0.1827, -0.2128, 0.1702, -0.0505] };
    for (const deg of [20, 40, 60]) {
      const t = (deg * Math.PI) / 180;
      const ours = cam.lens!.fx * thetaD(t, cam.lens!.k);
      const theirs = ref.fx * thetaD(t, ref.k);
      expect(Math.abs(ours - theirs) / theirs).toBeLessThan(0.015);
    }
  });

  it("falls back to the firmware string when there is no GPMF block", () => {
    const cam = detectCamera({ moov: moovWith(box("FIRM", enc.encode("H22.01.02.10.00"))), width: 3840, height: 2160 });
    expect(cam.brand).toBe("GoPro");
    expect(cam.model).toBe("HERO11 Black");
    expect(cam.profileId).toBe("gopro-wide-16x9");
    expect(detectCamera({ moov: moovWith(box("FIRM", enc.encode("HD9.01.01.72.00"))), width: 2704, height: 2028 }).profileId).toBe("gopro-wide-4x3");
    expect(detectCamera({ moov: moovWith(box("FIRM", enc.encode("H24.01.01.10.00"))), width: 3840, height: 3360 }).profileId).toBe("gopro-wide-8x7");
  });

  it("knows the HyperSmooth crops", () => {
    expect(hyperSmoothCrop("HS EIS")).toBeCloseTo(0.928);
    expect(hyperSmoothCrop("HS High")).toBeCloseTo(0.928);
    expect(hyperSmoothCrop("HS Boost")).toBeCloseTo(0.745);
    expect(hyperSmoothCrop("HS AutoBoost")).toBe(1);
    expect(hyperSmoothCrop("N/A")).toBe(1);
    expect(hyperSmoothCrop(undefined)).toBe(1);
  });

  it("fits the polynomial inverse to within two pixels at 4K", () => {
    const fov: GoProFov = { zfov: 156.7, vfov: "W", poly: [0, 2.111, 0.143, -1.03, 0.641], zmpl: 0.6, aruw: 16 / 9, arwa: 16 / 9, mapx: [1], mapy: [1] };
    const fit = lensFromGoProPoly(fov, 3840, 2160)!;
    expect(fit).toBeDefined();
    expect(fit.maxErrPx).toBeLessThan(2);
  });
});

describe("DJI metadata", () => {
  const djmd = b64(DJI_OA5P_DJMD);

  it("reads the product, firmware and stabilisation from a real Osmo Action 5 Pro djmd sample", () => {
    const m = parseDjiMeta(djmd)!;
    expect(m.productName).toBe("DJI OsmoAction5 Pro");
    expect(m.protoFile).toBe("dvtm_ac204.proto");
    expect(m.firmware).toBe("10.00.11.39");
    expect(m.eis).toBe(1);
    expect(m.focal).toBeUndefined();
  });

  it("detects the Action 5 Pro from the metadata track and picks the Osmo Wide profile", () => {
    const cam = detectCamera({ moov: moovWith(), width: 3840, height: 2160, metaSamples: [{ format: "djmd", data: djmd }] });
    expect(cam.brand).toBe("DJI");
    expect(cam.model).toBe("Osmo Action 5 Pro");
    expect(cam.stabilization).toBe("RockSteady");
    expect(cam.profileId).toBe("osmo-action-wide");
  });

  it("detects from the ©too tag alone, and 4:3 goes to Ultra Wide", () => {
    const cam = detectCamera({ moov: moovWith(ilstTag("©too", "DJI OsmoAction4")), width: 4096, height: 3072 });
    expect(cam.brand).toBe("DJI");
    expect(cam.model).toBe("Osmo Action 4");
    expect(cam.profileId).toBe("osmo-action-ultra-wide");
  });

  it("uses the lens DJI writes into the clip when the sample carries one", () => {
    // ProductMeta { clip_meta { header { proto 1, product 10 }, distortion 3 { packed floats 1 }, focal 8 { float 1 } } }
    const varint = (n: number) => { const o: number[] = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); return Uint8Array.from(o); };
    const field = (f: number, payload: Uint8Array) => cat(varint((f << 3) | 2), varint(payload.length), payload);
    const f32 = (...v: number[]) => { const o = new Uint8Array(v.length * 4); const dv = new DataView(o.buffer); v.forEach((x, i) => dv.setFloat32(i * 4, x, true)); return o; };
    const header = cat(field(1, enc.encode("dvtm_ac203.proto")), field(10, enc.encode("DJI OsmoAction4")));
    const fixed32 = (f: number, v: number) => cat(varint((f << 3) | 5), f32(v));
    const clip = cat(field(1, header), field(3, field(1, f32(0.28, -0.05, 0.01, -0.01))), field(8, fixed32(1, 1402.5)));
    const sample = field(1, clip);
    const cam = detectCamera({ moov: moovWith(), width: 3840, height: 2160, metaSamples: [{ format: "djmd", data: sample }] });
    expect(cam.model).toBe("Osmo Action 4");
    expect(cam.profileId).toBe("from-file");
    expect(cam.lens!.fx).toBeCloseTo(1402.5, 1);
    expect(cam.lens!.k[0]).toBeCloseTo(0.28, 5);
    expect(cam.lens!.cx).toBe(1920);
  });

  it("normalises DJI product names", () => {
    expect(djiModelName("DJI OsmoAction5 Pro")).toBe("Osmo Action 5 Pro");
    expect(djiModelName("DJI Osmo Action 4")).toBe("Osmo Action 4");
    expect(djiModelName("DJI Osmo360")).toBe("Osmo 360");
    expect(djiModelName("DJI FC8183")).toBe("Avata (FC8183)");
  });
});

describe("other files", () => {
  it("reports make and model tags and leaves the profile to the user", () => {
    const cam = detectCamera({ moov: moovWith(box("©mak", bytes(0, 5, 0, 0), enc.encode("Apple")), box("©mod", bytes(0, 9, 0, 0), enc.encode("iPhone 17"))), width: 1920, height: 1080 });
    expect(cam.brand).toBe("Apple");
    expect(cam.model).toBe("iPhone 17");
    expect(cam.profileId).toBeUndefined();
  });

  it("survives an empty or garbage moov", () => {
    expect(detectCamera({ moov: new Uint8Array(0), width: 1920, height: 1080 }).brand).toBeUndefined();
    expect(detectCamera({ moov: Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 255), width: 1920, height: 1080 }).evidence.length).toBeGreaterThan(0);
  });

  it("classifies frame shapes, either orientation", () => {
    expect(aspectClass(3840, 2160)).toBe("16:9");
    expect(aspectClass(2160, 3840)).toBe("16:9");
    expect(aspectClass(4000, 3000)).toBe("4:3");
    expect(aspectClass(5312, 4648)).toBe("8:7");
    expect(aspectClass(1000, 1000)).toBe("other");
  });
});
