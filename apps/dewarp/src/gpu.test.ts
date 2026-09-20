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
