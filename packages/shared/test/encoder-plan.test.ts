import { describe, expect, it } from "vitest";
import { avcCodecString, candidateSizes, hevcCodecString, planEncoder } from "../src/encoder-plan";

describe("codec strings (level from size × fps × bitrate)", () => {
  it("H.264 High", () => {
    expect(avcCodecString(1920, 1080, 30, 20e6)).toBe("avc1.640028"); // 4.0
    expect(avcCodecString(1920, 1080, 60, 30e6)).toBe("avc1.64002a"); // 4.2
    expect(avcCodecString(3840, 2160, 30, 60e6)).toBe("avc1.640033"); // 5.1
    expect(avcCodecString(3840, 2160, 60, 80e6)).toBe("avc1.640034"); // 5.2: 4K60 exceeds 5.1's macroblock rate
    expect(avcCodecString(1080, 1920, 60, 30e6)).toBe("avc1.64002a"); // portrait: same as landscape
  });
  it("HEVC Main (hvc1 for Apple players), Main tier unless the bitrate needs High", () => {
    expect(hevcCodecString(1920, 1080, 30, 10e6)).toBe("hvc1.1.6.L120.B0");
    expect(hevcCodecString(3840, 2160, 30, 20e6)).toBe("hvc1.1.6.L150.B0");
    expect(hevcCodecString(3840, 2160, 60, 40e6)).toBe("hvc1.1.6.L153.B0");
    expect(hevcCodecString(3840, 2160, 60, 80e6)).toBe("hvc1.1.6.H153.B0");
  });
});

describe("candidateSizes", () => {
  it("source first, then 1440p / 1080p / 720p, never upscaled, always even", () => {
    expect(candidateSizes(3840, 2160)).toEqual([
      { width: 3840, height: 2160 }, { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 },
    ]);
    expect(candidateSizes(1080, 1920)).toEqual([{ width: 1080, height: 1920 }, { width: 720, height: 1280 }]);
    expect(candidateSizes(1439, 1080)[0]).toEqual({ width: 1438, height: 1080 });
  });
  it("maxLongEdge caps the first size", () => {
    expect(candidateSizes(3840, 2160, 1920)[0]).toEqual({ width: 1920, height: 1080 });
    expect(candidateSizes(2160, 3840, 1920)[0]).toEqual({ width: 1080, height: 1920 });
  });
});

describe("planEncoder", () => {
  const probeFor = (ok: (c: VideoEncoderConfig) => boolean) => async (c: VideoEncoderConfig) => ok(c);
  it("keeps 4K60 when supported, preferring HEVC for 4K", async () => {
    const p = await planEncoder({ width: 3840, height: 2160, fps: 59.94, bitrate: 80e6, probe: probeFor(() => true) });
    expect(p).toMatchObject({ codec: "hevc", width: 3840, height: 2160, downscaled: false, note: null });
  });
  it("tries every codec at full size before downscaling", async () => {
    const p = await planEncoder({ width: 3840, height: 2160, fps: 60, bitrate: 80e6, probe: probeFor((c) => c.codec.startsWith("avc1")) });
    expect(p).toMatchObject({ codec: "avc", width: 3840, height: 2160, downscaled: false, codecString: "avc1.640034" });
  });
  it("downscales with a note only when nothing can encode the source size", async () => {
    const p = await planEncoder({ width: 3840, height: 2160, fps: 60, bitrate: 80e6, probe: probeFor((c) => c.width! * c.height! <= 1920 * 1080) });
    expect(p).toMatchObject({ width: 1920, height: 1080, downscaled: true });
    expect(p!.note).toMatch(/can't encode 3840×2160 at 60 fps/);
    expect(p!.bitrate).toBeLessThan(80e6);
  });
  it("keeps the frame rate in the probed config", async () => {
    const seen: VideoEncoderConfig[] = [];
    await planEncoder({ width: 1920, height: 1080, fps: 60, bitrate: 20e6, probe: async (c) => (seen.push(c), true) });
    expect(seen[0].framerate).toBe(60);
    expect(seen[0].codec).toBe("avc1.64002a");
  });
  it("H.264 first for 1080p (plays everywhere), HEVC first for HEVC sources", async () => {
    expect((await planEncoder({ width: 1920, height: 1080, fps: 30, bitrate: 10e6, probe: async () => true }))!.codec).toBe("avc");
    expect((await planEncoder({ width: 1920, height: 1080, fps: 30, bitrate: 10e6, sourceCodec: "hevc", probe: async () => true }))!.codec).toBe("hevc");
  });
  it("returns null when nothing can be encoded", async () => {
    expect(await planEncoder({ width: 1920, height: 1080, fps: 30, bitrate: 10e6, probe: async () => false })).toBeNull();
  });
  it("Export at 1080p", async () => {
    const p = await planEncoder({ width: 3840, height: 2160, fps: 30, bitrate: 60e6, maxLongEdge: 1920, probe: async () => true });
    expect(p).toMatchObject({ width: 1920, height: 1080, downscaled: true });
    expect(p!.note).toMatch(/as requested/);
  });
});
