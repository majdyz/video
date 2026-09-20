import { describe, expect, it } from "vitest";
import { differs } from "./gpu";

function frame(fill: (x: number, y: number) => number): Uint8Array {
  const px = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = fill(x, y); const i = (y * 64 + x) * 4; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
  return px;
}

describe("differs", () => {
  it("treats filtering noise as agreement", () => {
    const a = frame((x, y) => (x * 4 + y * 2) & 255);
    const b = frame((x, y) => ((x * 4 + y * 2) & 255) + (x % 2 ? 3 : -3));
    expect(differs(a, b)).toBe(false);
  });
  it("sees a sheared frame as disagreement", () => {
    const a = frame((x, y) => (x * 4) & 255);
    const b = frame((x, y) => ((x + y * 3) * 4) & 255);
    expect(differs(a, b)).toBe(true);
  });
});

import { tightenRows } from "./gpu";

describe("tightenRows", () => {
  it("drops the 256 byte padding WebGPU adds to each readback row", () => {
    const width = 3, height = 2, stride = 256;
    const src = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) for (let i = 0; i < width * 4; i++) src[y * stride + i] = y * 100 + i;
    src[width * 4] = 255; // padding, must not leak
    const out = tightenRows(src, width, height, stride, new Uint8Array(width * 4 * height));
    expect(Array.from(out)).toEqual([...Array.from({ length: 12 }, (_, i) => i), ...Array.from({ length: 12 }, (_, i) => 100 + i)]);
  });
  it("is the identity when rows are already tight", () => {
    const width = 4, height = 3, stride = width * 4;
    const src = Uint8Array.from({ length: stride * height }, (_, i) => i & 255);
    const out = tightenRows(src, width, height, stride, new Uint8Array(stride * height));
    expect(Array.from(out)).toEqual(Array.from(src));
  });
});
