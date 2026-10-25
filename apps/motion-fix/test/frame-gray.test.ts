// Plane route of the frame reader: YUV/RGB planes -> green at the analysis
// size, against a reference computed from the RGB the planes encode.
//   node --experimental-strip-types apps/motion-fix/test/frame-gray.test.ts
import assert from "node:assert/strict";
import { PlaneConverter, planeFormat, rotateInto } from "../src/lib/frame-gray.ts";

const W = 64;
const H = 36;

// A smooth colour image (so box-filtered chroma stays close to the true value).
function rgbAt(x: number, y: number): [number, number, number] {
  return [128 + 100 * Math.sin(x / 9), 128 + 90 * Math.cos(y / 7 + x / 23), 128 + 80 * Math.sin((x + y) / 11)];
}

/** BT.709 limited-range encode, 4:2:0 (chroma averaged over each 2x2 block). */
function encodeI420(bits: number, nv12: boolean): { buffer: ArrayBuffer; layout: { offset: number; stride: number }[] } {
  const kr = 0.2126;
  const kb = 0.0722;
  const kg = 1 - kr - kb;
  const scale = 1 << (bits - 8);
  const wide = bits > 8;
  const unit = wide ? 2 : 1;
  const ySize = W * H;
  const cw = W / 2;
  const chh = H / 2;
  const total = nv12 ? ySize + 2 * cw * chh : ySize + 2 * cw * chh;
  const buffer = new ArrayBuffer(total * unit);
  const data = wide ? new Uint16Array(buffer) : new Uint8Array(buffer);
  const yuv = (x: number, y: number): [number, number, number] => {
    const [r, g, b] = rgbAt(x, y);
    const Y = kr * r + kg * g + kb * b;
    return [16 + (219 * Y) / 255, 128 + (224 * (b - Y)) / (2 * (1 - kb)) / 255, 128 + (224 * (r - Y)) / (2 * (1 - kr)) / 255];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = Math.round(yuv(x, y)[0] * scale);
  for (let y = 0; y < chh; y++) {
    for (let x = 0; x < cw; x++) {
      let u = 0;
      let v = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const p = yuv(2 * x + dx, 2 * y + dy);
        u += p[1] / 4;
        v += p[2] / 4;
      }
      if (nv12) {
        data[ySize + y * W + 2 * x] = Math.round(u * scale);
        data[ySize + y * W + 2 * x + 1] = Math.round(v * scale);
      } else {
        data[ySize + y * cw + x] = Math.round(u * scale);
        data[ySize + cw * chh + y * cw + x] = Math.round(v * scale);
      }
    }
  }
  const layout = nv12
    ? [{ offset: 0, stride: W * unit }, { offset: ySize * unit, stride: W * unit }]
    : [{ offset: 0, stride: W * unit }, { offset: ySize * unit, stride: cw * unit }, { offset: (ySize + cw * chh) * unit, stride: cw * unit }];
  return { buffer, layout };
}

/** Reference: green averaged over each 2x2 block (the analysis size is half the frame). */
function referenceHalf(): Float32Array {
  const out = new Float32Array((W / 2) * (H / 2));
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
    let g = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g += rgbAt(2 * x + dx, 2 * y + dy)[1] / 4;
    out[y * (W / 2) + x] = g;
  }
  return out;
}

function meanAbs(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

const rect = { left: 0, top: 0, width: W, height: H };
const ref = referenceHalf();
const cs = { matrix: "bt709", fullRange: false };

for (const [name, fmt, bits, nv12] of [["I420", "I420", 8, false], ["NV12", "NV12", 8, true], ["I420P10", "I420P10", 10, false]] as const) {
  const { buffer, layout } = encodeI420(bits, nv12);
  const conv = new PlaneConverter(W / 2, H / 2);
  const out = new Float32Array((W / 2) * (H / 2));
  conv.convert(buffer, layout, planeFormat(fmt)!, rect, 0, cs, out);
  const err = meanAbs(out, ref);
  // Chroma is averaged before the matrix (as any 4:2:0 frame is): a fraction of a level off.
  assert.ok(err < 1.0, `${name}: mean |green - reference| = ${err.toFixed(3)}`);
}

// RGBA: green byte straight through, box-filtered.
{
  const buf = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = rgbAt(x, y);
    buf.set([r, g, b, 255], 4 * (y * W + x));
  }
  const out = new Float32Array((W / 2) * (H / 2));
  new PlaneConverter(W / 2, H / 2).convert(buf.buffer, [{ offset: 0, stride: 4 * W }], planeFormat("RGBA")!, rect, 0, null, out);
  assert.ok(meanAbs(out, ref) < 0.6, `RGBA error ${meanAbs(out, ref)}`);
}

// Non-integer scale keeps the image in place (area filter, no half-pixel shift):
// a horizontal ramp resampled 64 -> 48 stays a ramp through the same centre values.
{
  const buf = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) buf[4 * (y * W + x) + 1] = 2 * x;
  const ow = 48;
  const oh = 27;
  const out = new Float32Array(ow * oh);
  new PlaneConverter(ow, oh).convert(buf.buffer, [{ offset: 0, stride: 4 * W }], planeFormat("RGBA")!, rect, 0, null, out);
  for (let x = 0; x < ow; x++) {
    const centre = ((x + 0.5) * W) / ow - 0.5; // source px at the output sample's centre
    assert.ok(Math.abs(out[10 * ow + x] - 2 * centre) < 0.51, `ramp at ${x}: ${out[10 * ow + x]} vs ${2 * centre}`);
  }
}

// Large reductions read a sub-grid (every m-th sample) that stays inside each output's
// footprint: 2048 -> 256 (8x) of an image that is constant over each 8-px block
// must come out exactly as the block values.
{
  const SW = 2048;
  const SH = 64;
  const buf = new Uint8Array(SW * SH * 4);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) buf[4 * (y * SW + x) + 1] = (x >> 3) ^ (y >> 3);
  const ow = 256;
  const oh = 8;
  const out = new Float32Array(ow * oh);
  new PlaneConverter(ow, oh).convert(buf.buffer, [{ offset: 0, stride: 4 * SW }], planeFormat("RGBA")!, { left: 0, top: 0, width: SW, height: SH }, 0, null, out);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) assert.ok(Math.abs(out[y * ow + x] - (x ^ y)) < 1e-3, `decimated block (${x}, ${y}): ${out[y * ow + x]}`);
}

// Rotation matches a clockwise display rotation (sample.draw's convention).
{
  const w = 3;
  const h = 2;
  const src = Float32Array.from([1, 2, 3, 4, 5, 6]); // rows: [1 2 3] / [4 5 6]
  const r90 = new Float32Array(6);
  rotateInto(src, w, h, 90, r90);
  assert.deepEqual([...r90], [4, 1, 5, 2, 6, 3]); // 2 wide, 3 tall: [4 1] / [5 2] / [6 3]
  const r180 = new Float32Array(6);
  rotateInto(src, w, h, 180, r180);
  assert.deepEqual([...r180], [6, 5, 4, 3, 2, 1]);
  const r270 = new Float32Array(6);
  rotateInto(src, w, h, 270, r270);
  assert.deepEqual([...r270], [3, 6, 2, 5, 1, 4]);
}

// Formats the plane route reads, and ones it leaves to the canvas.
assert.deepEqual(planeFormat("I422P10"), { kind: "planar", sx: 2, sy: 1, bits: 10 });
assert.deepEqual(planeFormat("I444A"), { kind: "planar", sx: 1, sy: 1, bits: 8 });
assert.equal(planeFormat(null), null);
assert.equal(planeFormat("XYZ"), null);
