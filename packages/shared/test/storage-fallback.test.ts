import { describe, expect, it } from "vitest";
import { FallbackSink, MemorySink, SinkWriteError, tempFileAge, type RecoverableSink } from "../src/output-sink";
import { checkStorage, estimateOutputBytes, StorageSpaceError } from "../src/storage";

/**
 * A storage sink that fails after `okWrites` writes. Like the OPFS worker,
 * once it fails it hands back every chunk it was given from then on; `async`
 * failures surface on a later write (the worker answers asynchronously).
 */
class FlakySink implements RecoverableSink {
  readonly kind = "file";
  highWater = 0;
  private stored = new MemorySink();
  private returned: { position: number; data: Uint8Array }[] = [];
  private writes = 0;
  failed = false;
  discarded = false;
  salvaged = false;
  constructor(private okWrites: number, private failOnFinish = false) {}
  async write(data: Uint8Array, position: number): Promise<void> {
    if (this.failed) throw new SinkWriteError("storage write failed (error code -8)", false);
    this.highWater = Math.max(this.highWater, position + data.byteLength);
    this.writes++;
    if (this.writes > this.okWrites) {
      this.failed = true;
      this.returned.push({ position, data: data.slice() });
      throw new SinkWriteError("storage write failed (error code -8)", true);
    }
    await this.stored.write(data, position);
  }
  async finish(mime: string): Promise<Blob> {
    if (this.failOnFinish) {
      this.failed = true;
      throw new SinkWriteError("flush failed", true);
    }
    return this.stored.finish(mime);
  }
  async salvage() {
    this.salvaged = true;
    const base = new Uint8Array(await (await this.stored.finish("x")).arrayBuffer());
    return { base, rest: this.returned };
  }
  async discard() {
    this.discarded = true;
  }
}

const bytes = (n: number, v: number) => new Uint8Array(n).fill(v);
async function contents(b: Blob) {
  return [...new Uint8Array(await b.arrayBuffer())];
}

describe("FallbackSink", () => {
  it("passes through to storage when it works", async () => {
    const s = new FallbackSink(new FlakySink(100), { expectedBytes: 1000, memoryLimit: 1e6 });
    await s.write(bytes(4, 1), 0);
    await s.write(bytes(4, 2), 4);
    expect(s.kind).toBe("file");
    expect(await contents(await s.finish("video/mp4"))).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
  });

  it("moves a small output to memory on a write failure, keeping every byte in order", async () => {
    const flaky = new FlakySink(2);
    const s = new FallbackSink(flaky, { expectedBytes: 100, memoryLimit: 1e6 });
    await s.write(bytes(2, 1), 0);
    await s.write(bytes(2, 2), 2);
    await s.write(bytes(2, 3), 4); // fails in storage (bytes handed back)
    expect(s.kind).toBe("memory");
    await s.write(bytes(2, 4), 6);
    await s.write(bytes(1, 9), 0); // positional patch (mdat size)
    expect(flaky.salvaged).toBe(true);
    expect(await contents(await s.finish("video/mp4"))).toEqual([9, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("fails a large output with a clear storage message instead of a truncated file", async () => {
    const flaky = new FlakySink(1);
    const s = new FallbackSink(flaky, { expectedBytes: 5e9, memoryLimit: 256e6 });
    await s.write(bytes(2, 1), 0);
    const err = await s.write(bytes(2, 2), 2).catch((e) => e);
    expect(err).toBeInstanceOf(StorageSpaceError);
    expect(String(err.message)).toMatch(/storage|space/i);
    expect(flaky.discarded).toBe(true);
  });

  it("recovers from a failure that only shows at finish (flush)", async () => {
    const flaky = new FlakySink(100, true);
    const s = new FallbackSink(flaky, { expectedBytes: 10, memoryLimit: 1e6 });
    await s.write(bytes(3, 7), 0);
    expect(await contents(await s.finish("video/mp4"))).toEqual([7, 7, 7]);
  });

  it("stops a fallback that outgrows the memory limit", async () => {
    const s = new FallbackSink(new FlakySink(0), { expectedBytes: 10, memoryLimit: 100 });
    await s.write(bytes(10, 1), 0); // fails over to memory
    await expect(s.write(bytes(200, 1), 10)).rejects.toBeInstanceOf(StorageSpaceError);
  });

  it("memory-only (no storage in this browser) has no limit", async () => {
    const s = new FallbackSink(null, { memoryLimit: 10 });
    expect(s.kind).toBe("memory");
    await s.write(bytes(50, 1), 0);
    expect((await s.finish("video/mp4")).size).toBe(50);
  });
});

describe("checkStorage", () => {
  it("enough room → storage", async () => {
    const v = await checkStorage(1e9, async () => ({ quota: 10e9, usage: 1e9 }));
    expect(v.verdict).toBe("storage");
  });
  it("short but small → memory", async () => {
    const v = await checkStorage(100e6, async () => ({ quota: 120e6, usage: 100e6 }), 256e6);
    expect(v.verdict).toBe("memory");
  });
  it("short and large → a message that says how much is needed and free", async () => {
    const v = await checkStorage(3e9, async () => ({ quota: 2e9, usage: 1.5e9 }));
    expect(v.verdict).toBe("short");
    expect(v.message).toMatch(/3\.\d GB/);
    expect(v.message).toMatch(/500 MB/);
  });
  it("unknown quota (no estimate) → assume storage", async () => {
    expect((await checkStorage(5e9, null)).verdict).toBe("storage");
    expect((await checkStorage(5e9, async () => { throw new Error("x"); })).verdict).toBe("storage");
  });
  it("estimates bytes from bitrate × length", () => {
    expect(estimateOutputBytes(80e6, 30)).toBeGreaterThan(300e6);
    expect(estimateOutputBytes(80e6, 30)).toBeLessThan(320e6);
  });
});

describe("tempFileAge", () => {
  it("reads the creation time from temporary export names only", () => {
    const now = 1_800_000_000_000;
    expect(tempFileAge(`studio-export--${now - 5000}-ab12cd.tmp`, now)).toBe(5000);
    expect(tempFileAge("export-journal", now)).toBeNull();
    expect(tempFileAge("manifest.json", now)).toBeNull();
  });
});
