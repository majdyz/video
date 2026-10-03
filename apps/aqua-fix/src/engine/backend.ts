// GPU backend contract for the grading engine. Two implementations (WebGPU,
// WebGL2) run the same shader maths; the app never talks to a GPU API
// directly. Everything the shader reads is either the source frame, one
// packed uniform block (vec4-aligned floats), or a few small RGBA32F data
// textures (tile LUTs, bilateral grid, veil map) that the shader samples
// with texelFetch/textureLoad and interpolates by hand — float filtering is
// optional on both APIs, manual interpolation is not.

/** Sub-rectangle of the upright frame, 0..1. */
export type Rect = { x: number; y: number; w: number; h: number };
export const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

export type SourceInput = HTMLVideoElement | VideoFrame | ImageBitmap | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement;

/** Clockwise quarter turns to apply when sampling the source (0..3). */
export type Rotation = 0 | 1 | 2 | 3;

export type DataTextureSpec = {
  width: number;
  height: number;
  /** Always RGBA32F; 4 floats per texel. */
  data: Float32Array;
};

export interface GpuBackend {
  readonly kind: "webgpu" | "webgl2";
  /** The on-screen canvas the backend presents into. */
  readonly canvas: HTMLCanvasElement;
  /**
   * Uploads (or imports) the source frame. `width`/`height` are the coded
   * size; `rotation` turns it upright on output. Output size follows.
   */
  upload(src: SourceInput, width: number, height: number, rotation: Rotation): void;
  /** Replaces the whole uniform block (length must equal UNIFORM_FLOATS). */
  setUniforms(block: Float32Array): void;
  /** (Re)uploads data texture `slot` (0..DATA_SLOTS-1). */
  setData(slot: number, spec: DataTextureSpec): void;
  /**
   * Downscales the current source to `width`×`height` (upright) and reads
   * back RGBA8. Async so the GPU never stalls the main thread.
   */
  analyze(width: number, height: number, rect?: Rect): Promise<Uint8ClampedArray>;
  /** Draws the graded frame into the canvas at the upright source size. */
  render(): void;
  /** Draws the graded frame and wraps the result as a VideoFrame (export). */
  renderToFrame(timestampUs: number, durationUs: number | undefined): Promise<VideoFrame>;
  /** Milliseconds the last renderToFrame spent issuing the draw vs. capturing the result. */
  readonly lastDrawMs: number;
  readonly lastCaptureMs: number;
  /** Width/height of the last upright upload (full resolution; exports use it). */
  readonly outputWidth: number;
  readonly outputHeight: number;
  /**
   * Scale of the on-screen canvas relative to the source (0 < s ≤ 1). A 4K
   * clip shown in a phone-sized stage needs no 4K preview; exports always
   * render at full size regardless.
   */
  setPreviewScale(scale: number): void;
  dispose(): void;
}

/** Floats in the uniform block (multiple of 4). Layout lives in uniforms.ts. */
export const UNIFORM_FLOATS = 64;
export const DATA_SLOTS = 3;

export function uprightSize(width: number, height: number, rotation: Rotation): [number, number] {
  return rotation === 1 || rotation === 3 ? [height, width] : [width, height];
}

export function isVideoFrame(src: SourceInput): src is VideoFrame {
  return typeof VideoFrame !== "undefined" && src instanceof VideoFrame;
}
