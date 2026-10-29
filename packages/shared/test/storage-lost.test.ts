// The browser clearing or evicting the origin's storage under a running export (the reported "A requested file
// or directory could not be found" failure): how a loss is recognised, what the sinks report, and which chunks
// the journal keeps. The end-to-end check (a real wipe mid-export in Chrome) is apps/studio/scripts/opfs-wipe-e2e.mjs.
import { describe, expect, it } from "vitest";
import { FallbackSink, isStorageLost, MemorySink, SinkWriteError, StorageLostError, type RecoverableSink } from "../src/output-sink";
import { MemoryChunkStore, readableChunks, type ChunkRecord, type JournalPlan, type PacketEntry } from "../src/export-journal";
import { StorageSpaceError } from "../src/storage";

/** Chrome's error for a file read after its storage was wiped. */
const notFound = () => Object.assign(new Error("A requested file or directory could not be found at the time an operation was processed."), { name: "NotFoundError" });

/** A storage sink whose file is wiped after `okWrites` writes: writes fail with "not found", the bytes can't be read back. */
class WipedSink implements RecoverableSink {
  readonly kind = "file";
  highWater = 0;
  private writes = 0;
  constructor(private okWrites: number) {}
  async write(data: Uint8Array, position: number): Promise<void> {
    this.highWater = Math.max(this.highWater, position + data.byteLength);
    if (++this.writes > this.okWrites) throw new SinkWriteError(`storage write failed at ${position} (error code -4)`, true);
  }
  async finish(): Promise<Blob> {
    throw new StorageLostError();
  }
  async salvage(): Promise<{ base: Uint8Array; rest: { position: number; data: Uint8Array }[] }> {
    throw Object.assign(new StorageLostError(), { cause: notFound() });
  }
  async discard(): Promise<void> {}
}

describe("isStorageLost", () => {
  it("recognises a wipe, whatever layer reports it", () => {
    expect(isStorageLost(new StorageLostError())).toBe(true);
    expect(isStorageLost(notFound())).toBe(true);
    expect(isStorageLost(new SinkWriteError("storage write failed at 4194304 (error code -4)", true))).toBe(true);
    expect(isStorageLost(Object.assign(new Error("wrapped"), { cause: notFound() }))).toBe(true);
  });
  it("leaves full disks and codec errors alone", () => {
    expect(isStorageLost(new SinkWriteError("storage write failed at 0 (error code -8)", true))).toBe(false);
    expect(isStorageLost(new StorageSpaceError("Couldn't save the video"))).toBe(false);
    expect(isStorageLost(Object.assign(new Error("Codec reclaimed"), { name: "EncodingError" }))).toBe(false);
    expect(isStorageLost(null)).toBe(false);
  });
});

describe("FallbackSink after a wipe", () => {
  it("reports the loss (bytes gone), not a memory fallback with a hole", async () => {
    const s = new FallbackSink(new WipedSink(1), { expectedBytes: 100, memoryLimit: 1e6 });
    await s.write(new Uint8Array(4), 0);
    const err = await s.write(new Uint8Array(4), 4).catch((e) => e);
    expect(err).toBeInstanceOf(StorageLostError);
    expect(isStorageLost(err)).toBe(true);
  });
  it("a large output reports the loss too, not 'not enough space'", async () => {
    const s = new FallbackSink(new WipedSink(1), { expectedBytes: 5e9, memoryLimit: 1e6 });
    await s.write(new Uint8Array(4), 0);
    const err = await s.write(new Uint8Array(4), 4).catch((e) => e);
    expect(err).toBeInstanceOf(StorageLostError);
    expect(err).not.toBeInstanceOf(StorageSpaceError);
  });
  it("a file gone at finish is a loss", async () => {
    const s = new FallbackSink(new WipedSink(10), { expectedBytes: 100, memoryLimit: 1e6 });
    await s.write(new Uint8Array(4), 0);
    expect(isStorageLost(await s.finish("video/mp4").catch((e) => e))).toBe(true);
  });
});

describe("journal recovery", () => {
  const rec = (index: number): ChunkRecord => ({ index, frames: 300, bytes: 10, firstUs: index * 10e6, lastUs: index * 10e6 + 9.9e6 });
  const readable = new Blob([new Uint8Array([1, 2, 3])]);
  const gone = { size: 3, slice: () => ({ arrayBuffer: () => Promise.reject(notFound()) }) } as unknown as Blob;
  const table: PacketEntry[] = [[0, 33_333, 1, 0, 3]];

  it("keeps the chunks up to the first one that can't be read", async () => {
    const data = [readable, readable, gone, readable];
    expect(await readableChunks([0, 1, 2, 3].map(rec), async (i) => ({ packets: table, data: data[i] }))).toBe(2);
    expect(await readableChunks([0, 1].map(rec), async () => ({ packets: table, data: readable }))).toBe(2);
    // A chunk whose table or file is gone from the journal counts as lost too.
    expect(await readableChunks([0, 1].map(rec), async (i) => { if (i === 1) throw notFound(); return { packets: table, data: readable }; })).toBe(1);
  });
  it("other read errors are not a loss", async () => {
    await expect(readableChunks([rec(0)], async () => { throw new TypeError("bug"); })).rejects.toThrow("bug");
  });
  it("chunks held in memory survive", async () => {
    const plan: JournalPlan = { codec: "avc", codecString: "avc1.640034", width: 1280, height: 720, bitrate: 5e6, fps: 30 };
    const store = new MemoryChunkStore("k", "a.mp4", plan, 10, 30);
    for (const i of [0, 1]) {
      const w = await store.openChunk(i);
      w.add(new Uint8Array([i, i]), i * 10e6, 33_333, true);
      w.noteFrame(i * 10e6);
      await store.commit(w, await w.close(), null);
    }
    expect(await store.recover()).toBe(2);
    expect(store.manifest.chunks.length).toBe(2);
    void MemorySink;
  });
});
