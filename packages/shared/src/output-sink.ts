/**
 * Where muxed bytes go during an export. The file sink streams them into
 * private on-device storage (OPFS) through a worker and hands back a
 * file-backed Blob; the memory sink holds every chunk in the page, which a long
 * 4K clip cannot afford. `openOutputSink` wraps both: storage first, and if
 * storage fails mid-export (full disk, a flaky handle) a small output carries
 * on in memory with the bytes already written; a large one fails with a clear
 * message instead of a truncated file.
 */
import { formatBytes, MEMORY_FALLBACK_BYTES, requestPersistentStorage, StorageSpaceError } from "./storage";

export interface OutputSink {
  write(data: Uint8Array, position: number): Promise<void>;
  finish(mimeType: string): Promise<Blob>;
  discard(): Promise<void>;
  readonly kind: "file" | "memory";
}

export class MemorySink implements OutputSink {
  readonly kind = "memory";
  private parts: { position: number; data: Uint8Array<ArrayBuffer> }[] = [];

  /** Bytes held (for the fallback limit). */
  get size(): number {
    let size = 0;
    for (const p of this.parts) size = Math.max(size, p.position + p.data.byteLength);
    return size;
  }

  async write(data: Uint8Array, position: number): Promise<void> {
    this.parts.push({ position, data: new Uint8Array(data) });
  }

  async finish(mimeType: string): Promise<Blob> {
    // Positional writes can overwrite earlier bytes (mdat size patch, moov
    // reserve). Resolve them into one contiguous buffer.
    const out = new Uint8Array(this.size);
    for (const p of this.parts) out.set(p.data, p.position);
    this.parts = [];
    return new Blob([out], { type: mimeType });
  }

  async discard(): Promise<void> {
    this.parts = [];
  }
}

/** A sink write that failed; `posted` = the bytes reached the worker (they come back through `salvage`). */
export class SinkWriteError extends Error {
  readonly posted: boolean;
  constructor(message: string, posted: boolean) {
    super(message);
    this.posted = posted;
    this.name = "SinkWriteError";
  }
}

/** A sink whose written bytes can be recovered after a failure. */
export interface RecoverableSink extends OutputSink {
  /** Highest byte written or queued so far. */
  readonly highWater: number;
  /**
   * Stops writing and returns everything the sink was given, in order: the
   * bytes that reached storage (`base`, from position 0) and the chunks that
   * did not. Removes the temporary file.
   */
  salvage(): Promise<{ base: Uint8Array; rest: { position: number; data: Uint8Array }[] }>;
}

// Writes in flight before write() starts awaiting the worker. Bounds the
// bytes queued between the muxer and storage (24 × 4 MB chunks).
const MAX_BACKLOG = 24;
/** Temporary export files of this page (not swept while it holds them). */
const liveNames = new Set<string>();
/** Finished export Blobs → their temporary file, so the page can delete it once the user is done. */
const blobFiles = new WeakMap<Blob, string[]>();
/** Temporary files older than this, from closed or crashed tabs, are deleted when the next export starts. */
const STALE_MS = 30 * 60_000;

type WorkerReply = { type: string; message?: string; position?: number; data?: ArrayBuffer; size?: number };

export class FileSink implements RecoverableSink {
  readonly kind = "file";
  private readonly worker: Worker;
  readonly path: string[];
  private failure: Error | undefined;
  private pendingWrites = 0;
  private waiters: (() => void)[] = [];
  private returned: { position: number; data: Uint8Array }[] = [];
  highWater = 0;

  private constructor(worker: Worker, path: string[]) {
    this.worker = worker;
    this.path = path;
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const m = e.data;
      if (m.type === "failed") {
        this.failure ??= new Error(m.message ?? "storage write failed");
        if (m.data) this.returned.push({ position: m.position ?? 0, data: new Uint8Array(m.data) });
        this.pendingWrites -= 1;
      } else if (m.type === "error") this.failure ??= new Error(m.message ?? "storage write failed");
      else if (m.type === "written") this.pendingWrites -= 1;
      if (this.pendingWrites < MAX_BACKLOG || this.failure) this.wake();
    };
    worker.onerror = (e) => {
      this.failure ??= new Error(e.message || "storage worker failed");
      this.wake();
    };
  }

  /** A new temporary file at the storage root; undefined when private storage is not available here. */
  static async open(prefix: string): Promise<FileSink | undefined> {
    if (!opfsAvailable()) return undefined;
    await sweepExportFiles().catch(() => undefined);
    return FileSink.openPath([`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`]);
  }

  /** Opens (creating, truncating) the file at `path` (directories, then the name) in private storage. */
  static async openPath(path: string[]): Promise<FileSink | undefined> {
    if (!opfsAvailable()) return undefined;
    let worker: Worker | undefined;
    const key = path.join("/");
    try {
      worker = new Worker(new URL("./opfs-worker.ts", import.meta.url), { type: "module" });
      const sink = new FileSink(worker, path);
      liveNames.add(key);
      try {
        await sink.call({ type: "open", path }, "opened");
      } catch (e) {
        liveNames.delete(key);
        throw e;
      }
      return sink;
    } catch {
      worker?.terminate();
      return undefined;
    }
  }

  async write(data: Uint8Array, position: number): Promise<void> {
    if (this.failure) throw new SinkWriteError(this.failure.message, false);
    // The muxer reuses its buffer, so the bytes are copied once, into the message.
    const copy = data.slice().buffer as ArrayBuffer;
    this.pendingWrites += 1;
    this.highWater = Math.max(this.highWater, position + data.byteLength);
    this.worker.postMessage({ type: "write", position, data: copy }, [copy]);
    while (this.pendingWrites >= MAX_BACKLOG && !this.failure) {
      await new Promise<void>((r) => this.waiters.push(r));
    }
    const failure = this.failure as Error | undefined;
    if (failure) throw new SinkWriteError(failure.message, true);
  }

  /** Waits until the worker has answered every write (written or handed back). */
  private async drain(): Promise<void> {
    while (this.pendingWrites > 0) await new Promise<void>((r) => this.waiters.push(r));
  }

  async finish(mimeType: string): Promise<Blob> {
    await this.drain();
    if (this.failure) throw new SinkWriteError(this.failure.message, true);
    await this.call({ type: "close" }, "closed");
    this.worker.terminate();
    const file = await readOpfsFile(this.path);
    // The file stays until the page releases the result (releaseExportBlob) or a later export's sweep finds it stale:
    // the share sheet / download anchor streams from it.
    const blob = file.slice(0, file.size, mimeType);
    blobFiles.set(blob, this.path);
    return blob;
  }

  async salvage(): Promise<{ base: Uint8Array; rest: { position: number; data: Uint8Array }[] }> {
    await this.drain();
    await this.call({ type: "close" }, "closed").catch(() => undefined);
    this.worker.terminate();
    let base: Uint8Array = new Uint8Array(0);
    try {
      const file = await readOpfsFile(this.path);
      base = new Uint8Array(await file.arrayBuffer());
    } finally {
      await removeFile(this.path);
    }
    const rest = this.returned;
    this.returned = [];
    return { base, rest };
  }

  async discard(): Promise<void> {
    this.worker.terminate();
    await removeFile(this.path);
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private call(msg: object, reply: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (e: MessageEvent<WorkerReply>) => {
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

export function opfsAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function" && typeof Worker !== "undefined";
}

/** The directory holding `path`'s file (created when `create`). */
export async function opfsDir(path: string[], create = false): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory();
  for (const part of path.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

export async function readOpfsFile(path: string[]): Promise<File> {
  const dir = await opfsDir(path);
  return (await dir.getFileHandle(path[path.length - 1])).getFile();
}

export async function removeFile(path: string[]): Promise<void> {
  liveNames.delete(path.join("/"));
  try {
    const dir = await opfsDir(path);
    await dir.removeEntry(path[path.length - 1]);
  } catch {
    // Already gone, or still open in another tab.
  }
}

/** Age (ms) of a temporary export file from its name (`prefix-<epoch ms>-<rand>.tmp`), or null if it isn't one. */
export function tempFileAge(name: string, now = Date.now()): number | null {
  const m = /-(\d{13})-[a-z0-9]+\.tmp$/.exec(name);
  return m ? now - Number(m[1]) : null;
}

/**
 * Deletes temporary export files a closed or crashed tab left behind (each
 * can be gigabytes on a phone). Files this page still holds and recent ones
 * (another tab may be exporting) are kept; a file another tab has open
 * can't be removed anyway.
 */
export async function sweepExportFiles(staleMs = STALE_MS): Promise<number> {
  if (typeof navigator === "undefined" || typeof navigator.storage?.getDirectory !== "function") return 0;
  const root = await navigator.storage.getDirectory();
  const names: string[] = [];
  for await (const name of (root as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) names.push(name);
  let removed = 0;
  for (const name of names) {
    if (liveNames.has(name)) continue;
    const age = tempFileAge(name);
    if (age === null || age < staleMs) continue;
    try {
      await root.removeEntry(name);
      removed++;
    } catch {
      // In use elsewhere.
    }
  }
  return removed;
}

/** Deletes the temporary file behind a finished export once the page no longer offers it (Done, a new export). */
export async function releaseExportBlob(blob: Blob | null | undefined): Promise<void> {
  if (!blob) return;
  const path = blobFiles.get(blob);
  if (!path) return;
  blobFiles.delete(blob);
  await removeFile(path);
}

export type SinkOptions = {
  /** Expected output size (bytes): decides whether a storage failure may continue in memory. */
  expectedBytes?: number;
  /** Largest output the page may hold in memory after a storage failure. */
  memoryLimit?: number;
  log?: (line: string) => void;
};

/**
 * Storage first; on a write failure, outputs that fit `memoryLimit` move to
 * memory (bytes already written are read back) and the export carries on.
 */
export class FallbackSink implements OutputSink {
  private primary: RecoverableSink | null;
  private memory: MemorySink | null;
  private readonly limit: number;
  private readonly expected: number;
  private readonly log: (line: string) => void;
  private migrating: Promise<void> | null = null;

  constructor(primary: RecoverableSink | null, opts: SinkOptions = {}) {
    this.primary = primary;
    this.memory = primary ? null : new MemorySink();
    this.limit = opts.memoryLimit ?? MEMORY_FALLBACK_BYTES;
    this.expected = opts.expectedBytes ?? 0;
    this.log = opts.log ?? (() => undefined);
  }

  get kind(): "file" | "memory" {
    return this.primary ? "file" : "memory";
  }

  private canFallBack(): boolean {
    const p = this.primary;
    return !!p && Math.max(this.expected, p.highWater) <= this.limit;
  }

  private async migrate(cause: Error): Promise<void> {
    if (!this.migrating) {
      this.migrating = (async () => {
        const p = this.primary!;
        if (!this.canFallBack()) {
          await p.discard().catch(() => undefined);
          this.primary = null;
          throw storageFailure(cause, Math.max(this.expected, p.highWater));
        }
        this.log(`storage failed (${cause.message}); continuing in memory`);
        const { base, rest } = await p.salvage();
        const mem = new MemorySink();
        if (base.byteLength) await mem.write(base, 0);
        for (const r of rest) await mem.write(r.data, r.position);
        this.memory = mem;
        this.primary = null;
      })();
    }
    await this.migrating;
  }

  async write(data: Uint8Array, position: number): Promise<void> {
    if (this.migrating) await this.migrating;
    if (this.primary) {
      try {
        await this.primary.write(data, position);
        return;
      } catch (e) {
        const posted = e instanceof SinkWriteError && e.posted;
        await this.migrate(e instanceof Error ? e : new Error(String(e)));
        // Bytes the worker received come back through salvage; the rest are written here.
        if (posted) return;
      }
    }
    // After a fallback the output must stay small (the estimate can be low); a memory-only
    // sink (no storage in this browser) has nowhere else to go and may grow.
    if (this.migrating && position + data.byteLength > this.limit * 1.5) {
      throw storageFailure(new Error("output too large for memory"), position + data.byteLength);
    }
    await this.memory!.write(data, position);
  }

  async finish(mimeType: string): Promise<Blob> {
    if (this.migrating) await this.migrating;
    if (this.primary) {
      try {
        return await this.primary.finish(mimeType);
      } catch (e) {
        await this.migrate(e instanceof Error ? e : new Error(String(e)));
      }
    }
    return this.memory!.finish(mimeType);
  }

  async discard(): Promise<void> {
    await this.migrating?.catch(() => undefined);
    await this.primary?.discard().catch(() => undefined);
    await this.memory?.discard();
    this.primary = null;
  }
}

function storageFailure(cause: Error, bytes: number): Error {
  const err = new StorageSpaceError(
    `Couldn't save the video to this device's storage (${formatBytes(bytes)} needed). Free up some space, or export a shorter part or at 1080p, and try again.`,
  );
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

export async function openOutputSink(prefix: string, opts: SinkOptions = {}): Promise<OutputSink> {
  void requestPersistentStorage();
  const file = await FileSink.open(prefix);
  if (!file) opts.log?.("private storage unavailable: output kept in memory");
  return new FallbackSink(file ?? null, opts);
}
