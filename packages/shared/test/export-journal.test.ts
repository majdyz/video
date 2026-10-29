import { describe, expect, it } from "vitest";
import {
  fileFingerprint,
  fromBase64,
  journalKey,
  journalProgress,
  MemoryChunkStore,
  sameDecoderConfig,
  samePlan,
  toBase64,
  type JournalPlan,
} from "../src/export-journal";

const plan: JournalPlan = { codec: "avc", codecString: "avc1.640034", width: 3840, height: 2160, bitrate: 80e6, fps: 60 };

describe("export journal", () => {
  it("fingerprints by content, not name", async () => {
    const a = new File([new Uint8Array(600_000).fill(3)], "IMG_0001.MOV");
    const b = new File([new Uint8Array(600_000).fill(3)], "trim.123.MOV");
    const c = new File([new Uint8Array(600_000).fill(4)], "IMG_0001.MOV");
    expect(await fileFingerprint(a)).toBe(await fileFingerprint(b));
    expect(await fileFingerprint(a)).not.toBe(await fileFingerprint(c));
    expect(await journalKey(a, "look1")).not.toBe(await journalKey(a, "look2"));
  });

  it("base64 round trip of decoder descriptions", () => {
    const d = new Uint8Array([1, 100, 0, 40, 255, 225]);
    expect([...fromBase64(toBase64(d))]).toEqual([...d]);
  });

  it("compares plans and parameter sets", () => {
    expect(samePlan(plan, { ...plan })).toBe(true);
    expect(samePlan(plan, { ...plan, width: 1920 })).toBe(false);
    const dc = { codec: "avc1.640034", description: "AWQAKP/h", codedWidth: 3840, codedHeight: 2160 };
    expect(sameDecoderConfig(dc, { ...dc })).toBe(true);
    expect(sameDecoderConfig(dc, { ...dc, description: "AWQAKP/i" })).toBe(false);
    expect(sameDecoderConfig(null, dc)).toBe(false);
  });

  it("progress from the committed chunks", async () => {
    const store = new MemoryChunkStore("k", "a.mp4", plan, 10, 30);
    expect(journalProgress(store.manifest)).toBe(0);
    const w = await store.openChunk(0);
    w.add(new Uint8Array([1, 2, 3]), 0, 16_667, true);
    w.noteFrame(0);
    w.add(new Uint8Array([4, 5]), 9_983_333, 16_667, false);
    w.noteFrame(9_983_333);
    expect(w.packets.map((p) => p[3])).toEqual([0, 3]);
    const blob = await w.close();
    await store.commit(w, blob, null);
    expect(journalProgress(store.manifest)).toBeCloseTo(10 / 30, 2);
    const back = await store.readChunk(0);
    expect([...new Uint8Array(await back.data.arrayBuffer())]).toEqual([1, 2, 3, 4, 5]);
    expect(store.manifest.chunks[0]).toMatchObject({ index: 0, frames: 2, bytes: 5, firstUs: 0, lastUs: 9_983_333 });
  });
});
