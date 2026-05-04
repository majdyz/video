// Run FUnIE-GAN inference on an image source. Returns a 256x256 canvas with
// the enhanced result that the caller can upload as a WebGL texture (so the
// existing pipeline canvas stays a WebGL context — getContext('2d') on it
// would otherwise fail forever).

import { getFunieSession } from "./funie-loader";

const MODEL_SIZE = 256;

let downCanvas: HTMLCanvasElement | null = null;
let downCtx: CanvasRenderingContext2D | null = null;
let outCanvas: HTMLCanvasElement | null = null;
let outCtx: CanvasRenderingContext2D | null = null;
let inputBuffer: Float32Array | null = null;
let outputImageData: ImageData | null = null;

function ensureBuffers() {
  if (!downCanvas) {
    downCanvas = document.createElement("canvas");
    downCanvas.width = MODEL_SIZE;
    downCanvas.height = MODEL_SIZE;
    downCtx = downCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (!outCanvas) {
    outCanvas = document.createElement("canvas");
    outCanvas.width = MODEL_SIZE;
    outCanvas.height = MODEL_SIZE;
    outCtx = outCanvas.getContext("2d");
  }
  if (!inputBuffer) {
    inputBuffer = new Float32Array(MODEL_SIZE * MODEL_SIZE * 3);
  }
  if (!outputImageData) {
    outputImageData = new ImageData(MODEL_SIZE, MODEL_SIZE);
  }
}

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;

// strength: 0..1 lerp between source and AI output (default 1.0 = pure AI).
// The blend is done at 256x256 and then upscaled by the caller, same as the
// raw output — so strength is essentially free (one extra mul-add per pixel).
export async function runFunie(src: Source, strength = 1.0): Promise<HTMLCanvasElement> {
  ensureBuffers();
  if (!downCtx || !outCtx || !inputBuffer || !outputImageData || !outCanvas) {
    throw new Error("FUnIE buffers not initialised");
  }

  downCtx.drawImage(src, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const px = downCtx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
    inputBuffer[j] = px[i] / 127.5 - 1;
    inputBuffer[j + 1] = px[i + 1] / 127.5 - 1;
    inputBuffer[j + 2] = px[i + 2] / 127.5 - 1;
  }

  const session = getFunieSession();
  const ort = await import("onnxruntime-web");
  const input = new ort.Tensor("float32", inputBuffer, [1, MODEL_SIZE, MODEL_SIZE, 3]);
  const outputs = await session.run({ [session.inputNames[0]]: input });
  const outData = outputs[session.outputNames[0]].data as Float32Array;

  const dst = outputImageData.data;
  const s = Math.min(1, Math.max(0, strength));
  const oneMinusS = 1 - s;
  for (let j = 0, i = 0; j < outData.length; j += 3, i += 4) {
    const aiR = (outData[j] + 1) * 127.5;
    const aiG = (outData[j + 1] + 1) * 127.5;
    const aiB = (outData[j + 2] + 1) * 127.5;
    dst[i] = clamp255(px[i] * oneMinusS + aiR * s);
    dst[i + 1] = clamp255(px[i + 1] * oneMinusS + aiG * s);
    dst[i + 2] = clamp255(px[i + 2] * oneMinusS + aiB * s);
    dst[i + 3] = 255;
  }
  outCtx.putImageData(outputImageData, 0, 0);
  return outCanvas;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
