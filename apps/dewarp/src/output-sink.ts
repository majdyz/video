/**
 * Where the muxed bytes go. The file sink streams them into private on-device storage through
 * a worker and hands back a file-backed Blob; the memory sink is the fallback and holds every
 * chunk in the page, which a long 4K clip cannot afford.
 */
export interface OutputSink {
  write(data: Uint8Array, position: number): void;
  finish(): Promise<Blob>;
  discard(): Promise<void>;
  readonly kind: "file" | "memory";
}

export class MemorySink implements OutputSink {
  readonly kind = "memory";
  private parts: { position: number; data: Uint8Array<ArrayBuffer> }[] = [];

  write(data: Uint8Array, position: number): void {
    this.parts.push({ position, data: new Uint8Array(data) });
  }

  async finish(): Promise<Blob> {
    this.parts.sort((a, b) => a.position - b.position);
    const blob = new Blob(this.parts.map(p => p.data), { type: "video/mp4" });
    this.parts = [];
    return blob;
  }

  async discard(): Promise<void> {
    this.parts = [];
  }
}

const FILE_NAME = "dewarp-export.mp4";

export class FileSink implements OutputSink {
  readonly kind = "file";
  private readonly worker: Worker;
  private failure: Error | undefined;
  private pendingWrites = 0;
  private waiters: (() => void)[] = [];

  private constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = (e: MessageEvent<{ type: string; message?: string }>) => {
      if (e.data.type === "error") {
        this.failure ??= new Error(e.data.message ?? "storage write failed");
      }
      if (e.data.type === "written") this.pendingWrites -= 1;
      if (this.pendingWrites <= 0 || this.failure) this.wake();
    };
    worker.onerror = e => {
      this.failure ??= new Error(e.message);
      this.wake();
    };
  }

  /** Resolves to undefined when private storage is not available here. */
  static async open(): Promise<FileSink | undefined> {
    if (!("storage" in navigator) || typeof navigator.storage.getDirectory !== "function") return undefined;
    try {
      const worker = new Worker(new URL("./opfs-worker.ts", import.meta.url), { type: "module" });
      const sink = new FileSink(worker);
      await sink.call({ type: "open", name: FILE_NAME }, "opened");
      return sink;
    } catch {
      return undefined;
    }
  }

  write(data: Uint8Array, position: number): void {
    if (this.failure) throw this.failure;
    // The muxer reuses its buffer, so the bytes are copied once, into the message.
    const copy = data.slice().buffer as ArrayBuffer;
    this.pendingWrites += 1;
    this.worker.postMessage({ type: "write", position, data: copy }, [copy]);
  }

  /** Slows the producer down when the worker falls behind. */
  backlog(): number {
    return this.pendingWrites;
  }

  async settle(): Promise<void> {
    while (this.pendingWrites > 0 && !this.failure) await new Promise<void>(r => this.waiters.push(r));
    if (this.failure) throw this.failure;
  }

  async finish(): Promise<Blob> {
    await this.settle();
    await this.call({ type: "close" }, "closed");
    this.worker.terminate();
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(FILE_NAME)).getFile();
    return file.slice(0, file.size, "video/mp4");
  }

  async discard(): Promise<void> {
    this.worker.terminate();
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(FILE_NAME);
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
