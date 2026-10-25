// Stills: decode (JPEG / PNG / WebP everywhere, HEIC where the browser can),
// bound the size to what this browser's canvases and GPU textures take, and
// encode the finished picture as a full-resolution JPEG.

const PHOTO_EXT = /\.(jpe?g|png|webp|avif|heic|heif|gif|bmp)$/i;

export function isPhotoFile(file: File): boolean {
  return file.type.startsWith("image/") || PHOTO_EXT.test(file.name);
}

export type PhotoLimits = { maxPixels: number; maxSide: number };

/**
 * WebKit caps a canvas at 16.7 Mpx (a 24/48 Mpx iPhone photo is above it);
 * WebGPU's default texture limit is 8192 px a side.
 */
export function photoLimits(webkit: boolean, backend: "webgpu" | "webgl2"): PhotoLimits {
  return { maxPixels: webkit ? 16_000_000 : 50_000_000, maxSide: backend === "webgpu" ? 8192 : webkit ? 8192 : 16384 };
}

/** Upright (EXIF-oriented) bitmap, scaled down only if it exceeds the limits. */
export async function decodePhoto(file: File, limits: PhotoLimits): Promise<{ bitmap: ImageBitmap; original: { w: number; h: number } }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Safari decodes HEIC through <img> even where createImageBitmap(blob) refuses.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      bmp = await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const original = { w: bmp.width, h: bmp.height };
  const s = Math.min(1, Math.sqrt(limits.maxPixels / (bmp.width * bmp.height)), limits.maxSide / Math.max(bmp.width, bmp.height));
  if (s < 1) {
    const w = Math.max(2, Math.floor(bmp.width * s)), h = Math.max(2, Math.floor(bmp.height * s));
    const scaled = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
    bmp.close();
    bmp = scaled;
  }
  return { bitmap: bmp, original };
}

/** JPEG of a rendered frame (VideoFrame from the engine, or the geometry canvas). */
export async function encodeJpeg(src: VideoFrame | HTMLCanvasElement, w: number, h: number, quality = 0.92): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
      return c.convertToBlob({ type: "image/jpeg", quality });
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(src as CanvasImageSource, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))), "image/jpeg", quality));
}
