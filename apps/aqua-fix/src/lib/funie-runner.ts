// Run FUnIE-GAN inference on an image source. Returns BOTH a 256x256
// canvas (the raw enhanced output) AND a per-channel linear color transfer
// (gain * src + bias) fitted by least-squares to map source pixels to AI
// pixels.
//
// The transfer is what App.tsx uses for smooth video playback: derive it
// once per inference, apply via a simple WebGL shader to every render frame
// at full source resolution. This means the model can run at 5–10 fps while
// the on-screen video stays at full native fps.

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

export type ColorTransfer = {
  gain: [number, number, number];
  bias: [number, number, number];
};

export type FunieResult = {
  canvas: HTMLCanvasElement;
  transfer: ColorTransfer;
};

export async function runFunie(src: Source, strength = 1.0): Promise<FunieResult> {
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

  // Pack AI output to ImageData and compute least-squares per-channel transfer
  // (ai = gain * src + bias) in a single pass over the 256² pixels.
  const dst = outputImageData.data;
  const s = Math.min(1, Math.max(0, strength));
  const oneMinusS = 1 - s;
  const sumS = [0, 0, 0];
  const sumA = [0, 0, 0];
  const sumS2 = [0, 0, 0];
  const sumSA = [0, 0, 0];
  for (let j = 0, i = 0; j < outData.length; j += 3, i += 4) {
    const aiR = (outData[j] + 1) * 0.5;
    const aiG = (outData[j + 1] + 1) * 0.5;
    const aiB = (outData[j + 2] + 1) * 0.5;
    const srR = px[i] / 255;
    const srG = px[i + 1] / 255;
    const srB = px[i + 2] / 255;
    sumS[0] += srR; sumS[1] += srG; sumS[2] += srB;
    sumA[0] += aiR; sumA[1] += aiG; sumA[2] += aiB;
    sumS2[0] += srR * srR; sumS2[1] += srG * srG; sumS2[2] += srB * srB;
    sumSA[0] += srR * aiR; sumSA[1] += srG * aiG; sumSA[2] += srB * aiB;
    // Pixel output for the still-image / paused-frame path. Strength lerps
    // between source and AI on the 256² thumbnail.
    dst[i] = clamp255((srR * oneMinusS + aiR * s) * 255);
    dst[i + 1] = clamp255((srG * oneMinusS + aiG * s) * 255);
    dst[i + 2] = clamp255((srB * oneMinusS + aiB * s) * 255);
    dst[i + 3] = 255;
  }
  outCtx.putImageData(outputImageData, 0, 0);

  // Transfer is ALWAYS full-strength. Strength is applied at render time
  // by lerping toward identity in the shader caller — that way sliding
  // the Strength slider takes effect immediately, even on paused video,
  // without waiting for the next inference (which on a paused frame
  // would never happen).
  const n = MODEL_SIZE * MODEL_SIZE;
  const meanS = [sumS[0] / n, sumS[1] / n, sumS[2] / n];
  const meanA = [sumA[0] / n, sumA[1] / n, sumA[2] / n];
  const gain: [number, number, number] = [1, 1, 1];
  const bias: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const varS = sumS2[c] / n - meanS[c] * meanS[c];
    const cov = sumSA[c] / n - meanS[c] * meanA[c];
    const g = varS > 1e-6 ? cov / varS : 1;
    // Clamp gain to keep transfer well-conditioned (prevents pathological
    // cases on near-monochromatic patches like deep-blue water frames).
    const gClamped = Math.max(0.4, Math.min(2.5, g));
    gain[c] = gClamped;
    bias[c] = meanA[c] - gClamped * meanS[c];
  }

  return { canvas: outCanvas, transfer: { gain, bias } };
}

// Lerp a full-strength transfer toward identity by (1 - strength).
// Strength = 1 → original transfer; strength = 0 → identity (no effect).
export function lerpTransferToIdentity(
  t: ColorTransfer,
  strength: number,
): ColorTransfer {
  const s = Math.min(1, Math.max(0, strength));
  return {
    gain: [
      1 + (t.gain[0] - 1) * s,
      1 + (t.gain[1] - 1) * s,
      1 + (t.gain[2] - 1) * s,
    ],
    bias: [t.bias[0] * s, t.bias[1] * s, t.bias[2] * s],
  };
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
