// Picks the encoder for an offline export: codec, codec string (profile +
// level from the picture size, the frame rate AND the bitrate) and output
// size. The source resolution is kept whenever the browser says it can encode
// it; only when no codec can, the output steps down (1440p → 1080p → 720p)
// and the caller shows why.
//
// Pure apart from the default probe (VideoEncoder.isConfigSupported), so the
// level tables and the fallback order are unit-tested in Node.

export type EncoderCodec = "avc" | "hevc";

export type EncoderProbe = (config: VideoEncoderConfig) => Promise<boolean>;

export type EncoderPlan = {
  codec: EncoderCodec;
  /** Full WebCodecs codec string, e.g. "avc1.640034" or "hvc1.1.6.L153.B0". */
  codecString: string;
  width: number;
  height: number;
  bitrate: number;
  fps: number;
  /** True when the output is smaller than the source. */
  downscaled: boolean;
  /** Source size, for the note. */
  sourceWidth: number;
  sourceHeight: number;
  /** One line for the UI when the output isn't what the source was (null otherwise). */
  note: string | null;
};

export type PlanRequest = {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  /** Preferred codecs in order (default: HEVC first for > 1080p or HEVC sources, else AVC first). */
  codecs?: EncoderCodec[];
  /** Codec of the source (mediabunny name), steers the default order. */
  sourceCodec?: string | null;
  /** Cap the long edge (the "Export at 1080p" fallback). */
  maxLongEdge?: number;
  probe?: EncoderProbe;
};

// H.264 levels (Table A-1): max macroblocks per frame, per second, and max
// bitrate (Main/Baseline, kbit/s; High profile allows 1.25×).
const AVC_LEVELS: { level: number; maxFs: number; maxMbps: number; maxBrKbps: number }[] = [
  { level: 30, maxFs: 1620, maxMbps: 40500, maxBrKbps: 10000 },
  { level: 31, maxFs: 3600, maxMbps: 108000, maxBrKbps: 14000 },
  { level: 32, maxFs: 5120, maxMbps: 216000, maxBrKbps: 20000 },
  { level: 40, maxFs: 8192, maxMbps: 245760, maxBrKbps: 20000 },
  { level: 41, maxFs: 8192, maxMbps: 245760, maxBrKbps: 50000 },
  { level: 42, maxFs: 8704, maxMbps: 522240, maxBrKbps: 50000 },
  { level: 50, maxFs: 22080, maxMbps: 589824, maxBrKbps: 135000 },
  { level: 51, maxFs: 36864, maxMbps: 983040, maxBrKbps: 240000 },
  { level: 52, maxFs: 36864, maxMbps: 2073600, maxBrKbps: 240000 },
  { level: 60, maxFs: 139264, maxMbps: 4177920, maxBrKbps: 240000 },
  { level: 61, maxFs: 139264, maxMbps: 8355840, maxBrKbps: 480000 },
  { level: 62, maxFs: 139264, maxMbps: 16711680, maxBrKbps: 800000 },
];

// HEVC levels (Table A.8/A.9): max luma picture size, luma samples per
// second, and max bitrate for the Main and High tiers (Main profile, kbit/s).
const HEVC_LEVELS: { level: number; maxPs: number; maxSr: number; mainKbps: number; highKbps: number | null }[] = [
  { level: 90, maxPs: 552960, maxSr: 16588800, mainKbps: 6000, highKbps: null },
  { level: 93, maxPs: 983040, maxSr: 33177600, mainKbps: 10000, highKbps: null },
  { level: 120, maxPs: 2228224, maxSr: 66846720, mainKbps: 12000, highKbps: 30000 },
  { level: 123, maxPs: 2228224, maxSr: 133693440, mainKbps: 20000, highKbps: 50000 },
  { level: 150, maxPs: 8912896, maxSr: 267386880, mainKbps: 25000, highKbps: 100000 },
  { level: 153, maxPs: 8912896, maxSr: 534773760, mainKbps: 40000, highKbps: 160000 },
  { level: 156, maxPs: 8912896, maxSr: 1069547520, mainKbps: 60000, highKbps: 240000 },
  { level: 180, maxPs: 35651584, maxSr: 1069547520, mainKbps: 60000, highKbps: 240000 },
  { level: 183, maxPs: 35651584, maxSr: 2139095040, mainKbps: 120000, highKbps: 480000 },
  { level: 186, maxPs: 35651584, maxSr: 4278190080, mainKbps: 240000, highKbps: 800000 },
];

/** H.264 High profile codec string with the lowest level that fits size × fps × bitrate. */
export function avcCodecString(width: number, height: number, fps: number, bitrate: number): string {
  const fs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbps = fs * Math.max(1, fps);
  const kbps = bitrate / 1000;
  const lv = AVC_LEVELS.find((l) => fs <= l.maxFs && mbps <= l.maxMbps && kbps <= l.maxBrKbps * 1.25
    // A frame side may not exceed sqrt(8 × MaxFS) macroblocks.
    && Math.ceil(width / 16) <= Math.sqrt(8 * l.maxFs) && Math.ceil(height / 16) <= Math.sqrt(8 * l.maxFs)) ?? AVC_LEVELS[AVC_LEVELS.length - 1];
  return `avc1.6400${lv.level.toString(16).padStart(2, "0")}`;
}

/** HEVC Main profile codec string (hvc1: what Apple's players require), Main tier when the bitrate allows. */
export function hevcCodecString(width: number, height: number, fps: number, bitrate: number): string {
  const ps = width * height;
  const sr = ps * Math.max(1, fps);
  const kbps = bitrate / 1000;
  const fits = HEVC_LEVELS.filter((l) => ps <= l.maxPs && sr <= l.maxSr
    && Math.max(width, height) <= Math.sqrt(8 * l.maxPs));
  const main = fits.find((l) => kbps <= l.mainKbps);
  const high = fits.find((l) => l.highKbps !== null && kbps <= l.highKbps);
  // Main tier unless it would need a much higher level than the High tier does.
  if (main && (!high || main.level <= high.level + 3)) return `hvc1.1.6.L${main.level}.B0`;
  if (high) return `hvc1.1.6.H${high.level}.B0`;
  return `hvc1.1.6.H${HEVC_LEVELS[HEVC_LEVELS.length - 1].level}.B0`;
}

export function codecString(codec: EncoderCodec, width: number, height: number, fps: number, bitrate: number): string {
  return codec === "avc" ? avcCodecString(width, height, fps, bitrate) : hevcCodecString(width, height, fps, bitrate);
}

// Floor to even: an odd 1439-wide frame is cropped to 1438 (evenFrame), never stretched to 1440.
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** Output sizes to try, largest first: the source, then 1440p / 1080p / 720p (by the short edge), never upscaled. */
export function candidateSizes(width: number, height: number, maxLongEdge?: number): { width: number; height: number }[] {
  const w0 = even(width), h0 = even(height);
  const out: { width: number; height: number }[] = [];
  const push = (w: number, h: number) => {
    if (!out.some((s) => s.width === w && s.height === h)) out.push({ width: w, height: h });
  };
  const long = Math.max(w0, h0), short = Math.min(w0, h0);
  const fit = (longEdge: number) => {
    const k = Math.min(1, longEdge / long);
    return { width: even(w0 * k), height: even(h0 * k) };
  };
  if (!maxLongEdge || long <= maxLongEdge) push(w0, h0);
  else {
    const s = fit(maxLongEdge);
    push(s.width, s.height);
  }
  // Steps by the short edge (a 9:16 phone clip steps 2160 → 1440 → 1080 → 720 wide).
  for (const shortEdge of [1440, 1080, 720]) {
    if (shortEdge >= short) continue;
    const k = shortEdge / short;
    const s = { width: even(w0 * k), height: even(h0 * k) };
    if (maxLongEdge && Math.max(s.width, s.height) > maxLongEdge) continue;
    push(s.width, s.height);
  }
  return out;
}

/** Default codec order: HEVC first above 1080p or for HEVC sources (smaller files, the phones' native 4K codec), else H.264 (plays everywhere). */
export function defaultCodecOrder(width: number, height: number, sourceCodec?: string | null): EncoderCodec[] {
  const big = width * height > 1920 * 1088;
  return big || sourceCodec === "hevc" ? ["hevc", "avc"] : ["avc", "hevc"];
}

/** Bitrate for a smaller output: scaled by pixel count^0.75 (smaller pictures need relatively more bits per pixel). */
export function scaleBitrate(bitrate: number, from: { width: number; height: number }, to: { width: number; height: number }): number {
  const r = (to.width * to.height) / Math.max(1, from.width * from.height);
  return Math.max(500_000, Math.round(bitrate * Math.min(1, Math.pow(r, 0.75))));
}

export const defaultProbe: EncoderProbe = async (config) => {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    return !!(await VideoEncoder.isConfigSupported(config)).supported;
  } catch {
    return false;
  }
};

/** The VideoEncoder config for a plan (the one the probe accepted). */
export function encoderConfig(plan: EncoderPlan): VideoEncoderConfig {
  return configFor(plan.codec, plan.codecString, plan.width, plan.height, plan.bitrate, plan.fps);
}

function configFor(codec: EncoderCodec, codecStr: string, width: number, height: number, bitrate: number, fps: number): VideoEncoderConfig {
  const cfg: VideoEncoderConfig & { avc?: { format: string }; hevc?: { format: string } } = {
    codec: codecStr,
    width,
    height,
    bitrate,
    framerate: fps,
    bitrateMode: "variable",
    latencyMode: "quality",
  };
  if (codec === "avc") cfg.avc = { format: "avc" };
  else cfg.hevc = { format: "hevc" };
  return cfg;
}

const LABEL: Record<EncoderCodec, string> = { avc: "H.264", hevc: "HEVC" };

/**
 * Tries every codec at the full size before any smaller size: a 4K export in
 * H.264 beats a 1080p HEVC one. Each size is probed with the level computed
 * for its size, frame rate and bitrate. Returns null when nothing, not even
 * 720p, can be encoded.
 */
export async function planEncoder(req: PlanRequest): Promise<EncoderPlan | null> {
  const probe = req.probe ?? defaultProbe;
  const fps = req.fps > 0 && Number.isFinite(req.fps) ? req.fps : 30;
  const codecs = req.codecs ?? defaultCodecOrder(req.width, req.height, req.sourceCodec);
  const src = { width: even(req.width), height: even(req.height) };
  const sizes = candidateSizes(req.width, req.height, req.maxLongEdge);
  for (const size of sizes) {
    const bitrate = size.width === src.width && size.height === src.height ? Math.round(req.bitrate) : scaleBitrate(req.bitrate, src, size);
    for (const codec of codecs) {
      const str = codecString(codec, size.width, size.height, fps, bitrate);
      if (await probe(configFor(codec, str, size.width, size.height, bitrate, fps))) {
        const downscaled = size.width < src.width || size.height < src.height;
        let note: string | null = null;
        if (downscaled) {
          note = req.maxLongEdge && Math.max(src.width, src.height) > req.maxLongEdge && sizes[0] === size
            ? `Saved at ${size.width}×${size.height} as requested (source ${src.width}×${src.height}).`
            : `This device can't encode ${src.width}×${src.height} at ${Math.round(fps)} fps, so the video is saved at ${size.width}×${size.height}.`;
        }
        return { codec, codecString: str, width: size.width, height: size.height, bitrate, fps, downscaled, sourceWidth: src.width, sourceHeight: src.height, note };
      }
    }
  }
  return null;
}

export function codecLabel(codec: string): string {
  return LABEL[codec as EncoderCodec] ?? codec.toUpperCase();
}
