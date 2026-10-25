// WebKit reports untagged streams' colour space with values outside the
// WebCodecs enums: a decoded frame of an H.264 file with no colour
// description says `{ primaries: "unspecified", transfer: "unspecified" }`
// (Chrome and Firefox return null for the same field). mediabunny validates
// `frame.colorSpace` against the spec's enums when it wraps a decoded frame
// in a VideoSample and throws "init.colorSpace.primaries, when provided,
// must be one of bt709, …", so every offline decode on Safari failed for
// untagged clips. This patch makes `VideoFrame.prototype.colorSpace` return
// a spec-shaped VideoColorSpace (unknown values become null) wherever it
// isn't one already. Installed once per realm (page and each worker) by
// importing this module; a no-op where VideoFrame is missing or already sane.

const PRIMARIES = new Set(["bt709", "bt470bg", "smpte170m", "bt2020", "smpte432"]);
const TRANSFER = new Set(["bt709", "smpte170m", "iec61966-2-1", "linear", "pq", "hlg"]);
const MATRIX = new Set(["rgb", "bt709", "bt470bg", "smpte170m", "bt2020-ncl"]);

type CS = { primaries?: string | null; transfer?: string | null; matrix?: string | null; fullRange?: boolean | null };

/** Spec-valid copy of a colour space init (unknown enum values → null). Exported for tests. */
export function sanitizeColorSpace(cs: CS | null | undefined): { primaries: string | null; transfer: string | null; matrix: string | null; fullRange: boolean | null } {
  const pick = (v: string | null | undefined, ok: Set<string>) => (v != null && ok.has(v) ? v : null);
  return {
    primaries: pick(cs?.primaries, PRIMARIES),
    transfer: pick(cs?.transfer, TRANSFER),
    matrix: pick(cs?.matrix, MATRIX),
    fullRange: typeof cs?.fullRange === "boolean" ? cs.fullRange : null,
  };
}

function needsFix(cs: CS | null | undefined): boolean {
  if (!cs) return false;
  return (cs.primaries != null && !PRIMARIES.has(cs.primaries))
    || (cs.transfer != null && !TRANSFER.has(cs.transfer))
    || (cs.matrix != null && !MATRIX.has(cs.matrix));
}

const FLAG = "__diveColorSpacePatched";

export function installVideoFrameColorSpaceFix(): void {
  const g = globalThis as typeof globalThis & { [FLAG]?: boolean };
  if (g[FLAG] || typeof VideoFrame === "undefined") return;
  g[FLAG] = true;
  const desc = Object.getOwnPropertyDescriptor(VideoFrame.prototype, "colorSpace");
  const get = desc?.get;
  if (!get || !desc.configurable) return;
  Object.defineProperty(VideoFrame.prototype, "colorSpace", {
    configurable: true,
    enumerable: desc.enumerable,
    get(this: VideoFrame) {
      const cs = get.call(this) as VideoColorSpace;
      if (!needsFix(cs)) return cs;
      const clean = sanitizeColorSpace(cs);
      try {
        return new VideoColorSpace(clean as VideoColorSpaceInit);
      } catch {
        return { ...clean, toJSON: () => clean } as unknown as VideoColorSpace;
      }
    },
  });
}

installVideoFrameColorSpaceFix();
