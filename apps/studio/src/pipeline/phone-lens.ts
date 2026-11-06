// Which phone camera took a photo (EXIF): the ultra-wide (0.5×) gets the
// Dewarp "Phone 0.5×" stretch fix by default; the main / tele cameras are
// left as they are. Without EXIF (messaging apps strip it) nothing is
// assumed: the Dewarp panel suggests picking Phone 0.5× when the size is a
// typical phone frame.

import type { CameraInfo } from "../../../dewarp/src/camera-detect.ts";

export type PhotoTags = { make?: string; model?: string; lensModel?: string; focal?: number; focal35?: number };

/** Make, model, lens model, focal length and its 35 mm equivalent from a TIFF/EXIF block (photo-exif.ts readExif). */
export function photoTags(tiff: Uint8Array | null): PhotoTags {
  const out: PhotoTags = {};
  if (!tiff || tiff.length < 8) return out;
  const v = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = tiff[0] === 0x49;
  const u16 = (at: number) => v.getUint16(at, le), u32 = (at: number) => v.getUint32(at, le);
  const ok = (at: number, n: number) => at >= 0 && at + n <= tiff.length;
  const ascii = (e: number) => {
    const count = u32(e + 4);
    const at = count <= 4 ? e + 8 : u32(e + 8);
    if (!ok(at, count) || count > 256) return undefined;
    let s = "";
    for (let i = 0; i < count && tiff[at + i]; i++) s += String.fromCharCode(tiff[at + i]);
    return s.trim() || undefined;
  };
  const num = (e: number) => {
    const type = u16(e + 2);
    if (type === 3) return u16(e + 8);
    if (type === 4) return u32(e + 8);
    if (type === 5 || type === 10) {
      const at = u32(e + 8);
      if (!ok(at, 8)) return undefined;
      const d = u32(at + 4);
      return d ? u32(at) / d : undefined;
    }
    return undefined;
  };
  const walk = (off: number, fn: (tag: number, e: number) => void) => {
    if (!ok(off, 2)) return;
    const n = u16(off);
    if (n > 500 || !ok(off + 2, n * 12)) return;
    for (let i = 0; i < n; i++) fn(u16(off + 2 + i * 12), off + 2 + i * 12);
  };
  let exifIfd = 0;
  try {
    walk(u32(4), (tag, e) => {
      if (tag === 0x010f) out.make = ascii(e);
      else if (tag === 0x0110) out.model = ascii(e);
      else if (tag === 0x8769) exifIfd = u32(e + 8);
    });
    if (exifIfd) {
      walk(exifIfd, (tag, e) => {
        if (tag === 0x920a) out.focal = num(e);
        else if (tag === 0xa405) out.focal35 = num(e) || undefined;
        else if (tag === 0xa434) out.lensModel = ascii(e);
      });
    }
  } catch {
    /* a damaged block: whatever was read */
  }
  return out;
}

const PHONE_MAKES = /apple|samsung|google|xiaomi|redmi|poco|oneplus|oppo|vivo|realme|huawei|honor|motorola|sony|nothing|asus|nokia|lg|zte|tecno|infinix/i;

/** Typical phone frame sizes (either orientation): 4:3 and 16:9 at 12, 24, 48, 50 Mpx. */
export function phoneSized(w: number, h: number): boolean {
  const L = Math.max(w, h), S = Math.min(w, h);
  const r = L / S;
  return L >= 3000 && L <= 8200 && (Math.abs(r - 4 / 3) < 0.02 || Math.abs(r - 16 / 9) < 0.03);
}

/**
 * Camera info for a photo, in the shape the Dewarp panel reads for clips.
 * Ultra-wide when the 35 mm equivalent is 10–18 mm, or (no equivalent) a
 * phone's focal length under 2.6 mm, or the lens model says "ultra wide".
 */
export function photoCamera(t: PhotoTags, size: { w: number; h: number }): CameraInfo {
  const brand = t.make?.replace(/\s+(inc\.?|corporation|co\.?,? ?ltd\.?)$/i, "");
  const model = t.model && brand && t.model.toLowerCase().startsWith(brand.toLowerCase()) ? t.model.slice(brand.length).trim() : t.model;
  const evidence: string[] = [];
  if (t.lensModel) evidence.push(`lens "${t.lensModel}"`);
  if (t.focal35) evidence.push(`${t.focal35} mm (35 mm equivalent)`);
  else if (t.focal) evidence.push(`${t.focal.toFixed(2)} mm focal length`);
  const phone = !!t.make && PHONE_MAKES.test(t.make);
  const uwLens = !!t.lensModel && /ultra ?wide/i.test(t.lensModel);
  const ultraWide = (t.focal35 !== undefined && t.focal35 >= 10 && t.focal35 <= 18) || uwLens || (t.focal35 === undefined && phone && !!t.focal && t.focal < 2.6);
  if (ultraWide) {
    return { brand, model, lensMode: "Ultra wide 0.5×", profileId: "phone-ultra-wide", focal35: t.focal35 && t.focal35 <= 18 ? t.focal35 : undefined, evidence };
  }
  if (phone && (t.focal35 || t.focal)) return { brand, model, lensMode: t.focal35 ? `${t.focal35} mm` : undefined, notUltraWide: true, evidence };
  if (!t.make) evidence.push(phoneSized(size.w, size.h) ? "no camera data (a phone-sized photo)" : "no camera data");
  return { brand, model, evidence };
}

/** Dewarp status hint for a photo without camera data, else null. */
export function photoLensHint(c: CameraInfo | null | undefined, size: { w: number; h: number } | null): string | null {
  if (!c || c.brand || c.profileId) return null;
  return size && phoneSized(size.w, size.h) ? "No camera data in this photo. Shot at 0.5× on a phone? Pick Phone 0.5×" : null;
}
