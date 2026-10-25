// Playwright's WebKit encodes VideoFrames wrapped from a canvas upside down:
// an offline export of an upright render came out flipped. Where exactly it
// goes wrong is murky (`copyTo` of such a frame already reads bottom-up, yet a
// frame whose `copyTo` reads top-down still encodes flipped), so this measures
// the only thing that matters, end to end: a two-colour WebGL canvas is
// wrapped, encoded and decoded once per page, and if the decoded picture is
// upside down, candidate re-wraps are tried until one survives the round trip
// upright. Chrome and Firefox pass the first check and pay nothing per frame.

export type FrameFix = (frame: VideoFrame) => Promise<VideoFrame>;

const W = 64, H = 64;

function testCanvas(): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const gl = c.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) return null;
  gl.enable(gl.SCISSOR_TEST);
  // GL y runs up: the top half of the picture is y H/2..H.
  gl.scissor(0, H / 2, W, H / 2);
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.scissor(0, 0, W, H / 2);
  gl.clearColor(0, 0, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return c;
}

/** Encodes and decodes one frame (H.264), returns whether the decoded picture is upright (red on top); null if it couldn't run. */
async function roundTripUpright(frame: VideoFrame): Promise<boolean | null> {
  const config: VideoEncoderConfig = { codec: "avc1.42001f", width: W, height: H, bitrate: 1_000_000, framerate: 30 };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) return null;
  const chunks: EncodedVideoChunk[] = [];
  let meta: VideoDecoderConfig | undefined;
  const enc = new VideoEncoder({
    output: (c, m) => {
      chunks.push(c);
      if (m?.decoderConfig) meta = m.decoderConfig;
    },
    error: () => undefined,
  });
  enc.configure(config);
  enc.encode(frame, { keyFrame: true });
  frame.close();
  await enc.flush();
  enc.close();
  if (!chunks.length || !meta) return null;
  let decoded: VideoFrame | null = null;
  const dec = new VideoDecoder({ output: (f) => { if (decoded) f.close(); else decoded = f; }, error: () => undefined });
  dec.configure(meta);
  for (const c of chunks) dec.decode(c);
  await dec.flush();
  dec.close();
  const out = decoded as VideoFrame | null;
  if (!out) return null;
  const o = document.createElement("canvas");
  o.width = W;
  o.height = H;
  const ctx = o.getContext("2d");
  if (!ctx) { out.close(); return null; }
  ctx.drawImage(out, 0, 0, W, H);
  out.close();
  const top = ctx.getImageData(W / 2, 8, 1, 1).data;
  const bottom = ctx.getImageData(W / 2, H - 8, 1, 1).data;
  if (top[0] > 150 && bottom[2] > 150) return true;
  if (top[2] > 150 && bottom[0] > 150) return false;
  return null;
}

const viaFlippedBitmap: FrameFix = async (frame) => {
  const bmp = await createImageBitmap(frame, { imageOrientation: "flipY" });
  const out = new VideoFrame(bmp, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
  bmp.close();
  frame.close();
  return out;
};

const viaFlipped2d: FrameFix = async (frame) => {
  const w = frame.displayWidth, h = frame.displayHeight;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.translate(0, h);
  ctx.scale(1, -1);
  ctx.drawImage(frame, 0, 0, w, h);
  const out = new VideoFrame(c, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
  frame.close();
  return out;
};

let cached: Promise<FrameFix | null> | null = null;

/**
 * null when canvas-wrapped frames encode upright here (every Chromium and
 * Gecko browser); otherwise the re-wrap that makes them upright. Measured
 * once per page.
 */
export function canvasFrameFix(log: (line: string) => void = () => undefined): Promise<FrameFix | null> {
  if (cached) return cached;
  cached = (async () => {
    if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined" || typeof document === "undefined") return null;
    const c = testCanvas();
    if (!c) return null;
    try {
      const first = await roundTripUpright(new VideoFrame(c, { timestamp: 0 }));
      if (first !== false) return null;
      log("canvas frames encode upside down in this browser");
      for (const [name, fix] of [["flipped bitmap", viaFlippedBitmap], ["flipped 2D canvas", viaFlipped2d]] as const) {
        const ok = await roundTripUpright(await fix(new VideoFrame(c, { timestamp: 0 })));
        log(`  re-wrap via ${name}: ${ok ? "upright" : "still flipped"}`);
        if (ok) return fix;
      }
      return null;
    } catch (e) {
      log(`orientation check failed: ${(e as Error).message}`);
      return null;
    }
  })();
  return cached;
}
