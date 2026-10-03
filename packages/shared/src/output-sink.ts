/**
 * Where muxed bytes go during an offline export. The file sink streams them into
 * private on-device storage through a worker and hands back a file-backed Blob;
 * the memory sink is the fallback and holds every chunk in the page, which a long
 * 4K clip cannot afford.
 */
export interface OutputSink {
  write(data: Uint8Array, position: number): Promise<void>;
  finish(mimeType: string): Promise<Blob>;
  discard(): Promise<void>;
  readonly kind: "file" | "memory";
}

export class MemorySink implements OutputSink {
  readonly kind = "memory";
  private parts: { position: number; data: Uint8Array<ArrayBuffer> }[] = [];

  async write(data: Uint8Array, position: number): Promise<void> {
    this.parts.push({ position, data: new Uint8Array(data) });
  }

  async finish(mimeType: string): Promise<Blob> {
    // Positional writes can overwrite earlier bytes (mdat size patch, moov
    // reserve). Resolve them into one contiguous buffer.
    let size = 0;
    for (const p of this.parts) size = Math.max(size, p.position + p.data.byteLength);
    const out = new Uint8Array(size);
    for (const p of this.parts) out.set(p.data, p.position);
    this.parts = [];
    return new Blob([out], { type: mimeType });
  }

  async discard(): Promise<void> {
    this.parts = [];
  }
}

// Writes in flight before write() starts awaiting the worker. Bounds the
// bytes queued between the muxer and storage.
const MAX_BACKLOG = 24;

export class FileSink implements OutputSink {
  readonly kind = "file";
  private readonly worker: Worker;
  private readonly name: string;
  private failure: Error | undefined;
  private pendingWrites = 0;
  private waiters: (() => void)[] = [];

  private constructor(worker: Worker, name: string) {
    this.worker = worker;
    this.name = name;
    worker.onmessage = (e: MessageEvent<{ type: string; message?: string }>) => {
      if (e.data.type === "error") this.failure ??= new Error(e.data.message ?? "storage write failed");
      if (e.data.type === "written") this.pendingWrites -= 1;
      if (this.pendingWrites < MAX_BACKLOG || this.failure) this.wake();
    };
    worker.onerror = (e) => {
      this.failure ??= new Error(e.message);
      this.wake();
    };
  }

  /** Resolves to undefined when private storage is not available here. */
  static async open(prefix: string): Promise<FileSink | undefined> {
    if (!("storage" in navigator) || typeof navigator.storage.getDirectory !== "function") return undefined;
    try {
      const worker = new Worker(new URL("./opfs-worker.ts", import.meta.url), { type: "module" });
      const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
      const sink = new FileSink(worker, name);
      await sink.call({ type: "open", name }, "opened");
      return sink;
    } catch {
      return undefined;
    }
  }

  async write(data: Uint8Array, position: number): Promise<void> {
    if (this.failure) throw this.failure;
    // The muxer reuses its buffer, so the bytes are copied once, into the message.
    const copy = data.slice().buffer as ArrayBuffer;
    this.pendingWrites += 1;
    this.worker.postMessage({ type: "write", position, data: copy }, [copy]);
    while (this.pendingWrites >= MAX_BACKLOG && !this.failure) {
      await new Promise<void>((r) => this.waiters.push(r));
    }
    if (this.failure) throw this.failure;
  }

  private async settle(): Promise<void> {
    while (this.pendingWrites > 0 && !this.failure) await new Promise<void>((r) => this.waiters.push(r));
    if (this.failure) throw this.failure;
  }

  async finish(mimeType: string): Promise<Blob> {
    await this.settle();
    await this.call({ type: "close" }, "closed");
    this.worker.terminate();
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(this.name)).getFile();
    // Defer removal — the share sheet / download anchor streams from it.
    const name = this.name;
    setTimeout(() => {
      root.removeEntry(name).catch(() => undefined);
    }, 10 * 60_000);
    return file.slice(0, file.size, mimeType);
  }

  async discard(): Promise<void> {
    this.worker.terminate();
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.name);
    } catch {
      // Nothing to clean up.
    }
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private call(msg: object, reply: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (e: MessageEvent<{ type: string; message?: string }>) => {
        if (e.data.type === reply) {
          this.worker.removeEventListener("message", onMessage);
          resolve();
        } else if (e.data.type === "error") {
          this.worker.removeEventListener("message", onMessage);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.postMessage(msg);
    });
  }
}

export async function openOutputSink(prefix: string): Promise<OutputSink> {
  return (await FileSink.open(prefix)) ?? new MemorySink();
}
