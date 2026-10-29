// Resumable exports. The encoder output is kept as ~10 s chunks (each starts
// with a key frame) in private storage, next to a manifest keyed by the clip's
// fingerprint and a hash of the export settings. A crash, reload or failure
// loses at most the chunk in progress: the next export with the same clip and
// settings picks up after the last committed chunk, and the chunks are muxed
// into the final MP4 at the end.
//
// Layout (OPFS): export-journal/<key>/manifest.json, cNNNNN.bin (packet
// bytes), cNNNNN.json (packet table). The manifest only lists a chunk once
// its bytes and table are on disk, so a crash mid-chunk redoes that chunk.

import { FallbackSink, FileSink, MemorySink, opfsAvailable, opfsDir, readOpfsFile, type OutputSink } from "./output-sink";

export const JOURNAL_DIR = "export-journal";
/** Journals kept at most (each holds up to a full export's bytes on the phone). */
const MAX_JOURNALS = 2;
/** Journals older than this are deleted. */
const MAX_AGE_MS = 3 * 24 * 3600_000;

/** [timestamp µs, duration µs, key frame 0/1, byte offset in the chunk, byte size]. */
export type PacketEntry = [number, number, 0 | 1, number, number];

export type ChunkRecord = {
  index: number;
  frames: number;
  bytes: number;
  /** First and last frame timestamps (µs, output clock). */
  firstUs: number;
  lastUs: number;
};

export type JournalPlan = { codec: string; codecString: string; width: number; height: number; bitrate: number; fps: number };

export type StoredDecoderConfig = {
  codec: string;
  codedWidth?: number;
  codedHeight?: number;
  /** base64 of the avcC / hvcC record. */
  description?: string;
  colorSpace?: VideoColorSpaceInit;
};

export type JournalManifest = {
  v: 1;
  key: string;
  fileName: string;
  createdAt: number;
  updatedAt: number;
  plan: JournalPlan;
  chunkSec: number;
  /** Output length in seconds (for the progress shown on "Resume"). */
  span: number;
  decoderConfig: StoredDecoderConfig | null;
  chunks: ChunkRecord[];
};

// ------------------------------------------------------------------ keys

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** FNV-1a 64 (as two 32-bit halves); used where crypto.subtle is missing (http pages). */
function fnv(data: Uint8Array): string {
  let h1 = 0x811c9dc5, h2 = 0x050c5d1f;
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ data[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ data[data.length - 1 - i], 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export async function hashBytes(data: Uint8Array): Promise<string> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle) {
    try {
      return hex(await subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>)).slice(0, 32);
    } catch {
      // fall through
    }
  }
  return fnv(data);
}

export async function hashString(s: string): Promise<string> {
  return hashBytes(new TextEncoder().encode(s));
}

/**
 * Identifies the clip by its size and content (first and last 256 kB), not
 * its name or date: the iOS picker hands over a fresh copy with a new name
 * and modification time each time.
 */
export async function fileFingerprint(file: Blob): Promise<string> {
  const n = 256 * 1024;
  const head = new Uint8Array(await file.slice(0, n).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - n)).arrayBuffer());
  const size = new TextEncoder().encode(String(file.size));
  const all = new Uint8Array(size.length + head.length + tail.length);
  all.set(size, 0);
  all.set(head, size.length);
  all.set(tail, size.length + head.length);
  return hashBytes(all);
}

/** Journal key: the clip fingerprint + the caller's settings key (look, trim, tools, build). */
export async function journalKey(file: Blob, settingsKey: string): Promise<string> {
  return (await hashString(`${await fileFingerprint(file)}|${settingsKey}`)).slice(0, 24);
}

export function toBase64(data: ArrayBuffer | ArrayBufferView): string {
  const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function storeDecoderConfig(c: VideoDecoderConfig): StoredDecoderConfig {
  return {
    codec: c.codec,
    codedWidth: c.codedWidth,
    codedHeight: c.codedHeight,
    description: c.description ? toBase64(c.description as ArrayBuffer | ArrayBufferView) : undefined,
    colorSpace: c.colorSpace ? { primaries: c.colorSpace.primaries, transfer: c.colorSpace.transfer, matrix: c.colorSpace.matrix, fullRange: c.colorSpace.fullRange } : undefined,
  };
}

export function loadDecoderConfig(s: StoredDecoderConfig): VideoDecoderConfig {
  return {
    codec: s.codec,
    codedWidth: s.codedWidth,
    codedHeight: s.codedHeight,
    description: s.description ? fromBase64(s.description) : undefined,
    colorSpace: s.colorSpace,
  };
}

/** True when two encoder sessions produced the same parameter sets (their chunks can share one track). */
export function sameDecoderConfig(a: StoredDecoderConfig | null, b: StoredDecoderConfig | null): boolean {
  if (!a || !b) return false;
  return a.codec === b.codec && (a.description ?? "") === (b.description ?? "") && a.codedWidth === b.codedWidth && a.codedHeight === b.codedHeight;
}

export function samePlan(a: JournalPlan, b: JournalPlan): boolean {
  return a.codec === b.codec && a.codecString === b.codecString && a.width === b.width && a.height === b.height && a.bitrate === b.bitrate && Math.abs(a.fps - b.fps) < 1e-3;
}

/** Fraction of the export the committed chunks cover. */
export function journalProgress(m: JournalManifest): number {
  if (!m.chunks.length || !(m.span > 0)) return 0;
  const last = m.chunks[m.chunks.length - 1];
  return Math.min(0.99, Math.max(0, (last.lastUs / 1e6 + 1 / Math.max(1, m.plan.fps)) / m.span));
}

// ------------------------------------------------------------------ stores

/** Packets of one chunk being written; offsets are assigned at once, the bytes stream to storage. */
export class ChunkWriter {
  private offset = 0;
  private chain: Promise<void> = Promise.resolve();
  private pendingBytes = 0;
  private error: unknown = null;
  readonly packets: PacketEntry[] = [];
  frames = 0;
  firstUs = Number.NaN;
  lastUs = Number.NaN;

  readonly index: number;
  private readonly sink: OutputSink;
  constructor(index: number, sink: OutputSink) {
    this.index = index;
    this.sink = sink;
  }

  get bytes(): number {
    return this.offset;
  }

  /** Bytes queued but not yet handed to storage. */
  get backlog(): number {
    return this.pendingBytes;
  }

  get failed(): unknown {
    return this.error;
  }

  /** Queues one encoded packet (data is owned by the writer from here). */
  add(data: Uint8Array, timestampUs: number, durationUs: number, key: boolean): void {
    const at = this.offset;
    this.offset += data.byteLength;
    this.pendingBytes += data.byteLength;
    this.packets.push([timestampUs, durationUs, key ? 1 : 0, at, data.byteLength]);
    this.chain = this.chain.then(async () => {
      if (this.error) return;
      try {
        await this.sink.write(data, at);
      } catch (e) {
        this.error = e;
      } finally {
        this.pendingBytes -= data.byteLength;
      }
    });
  }

  noteFrame(timestampUs: number): void {
    this.frames++;
    if (Number.isNaN(this.firstUs)) this.firstUs = timestampUs;
    this.lastUs = timestampUs;
  }

  /** Waits until at most `maxBytes` are still queued (storage backpressure). */
  async drainTo(maxBytes: number): Promise<void> {
    while (this.pendingBytes > maxBytes && !this.error) {
      const c = this.chain;
      await Promise.race([c, new Promise((r) => setTimeout(r, 20))]);
    }
    if (this.error) throw this.error;
  }

  /** All bytes stored; returns the chunk's bytes as a Blob. */
  async close(): Promise<Blob> {
    await this.chain;
    if (this.error) throw this.error;
    const blob = await this.sink.finish("application/octet-stream");
    this.storedIn = this.sink.kind;
    return blob;
  }

  /** Where the closed chunk's bytes ended up. */
  storedIn: "file" | "memory" | null = null;

  async abort(): Promise<void> {
    await this.chain.catch(() => undefined);
    await this.sink.discard().catch(() => undefined);
  }
}

export interface ChunkStore {
  /** Committed chunks survive a reload. */
  readonly resumable: boolean;
  readonly manifest: JournalManifest;
  openChunk(index: number): Promise<ChunkWriter>;
  /** Records a closed chunk (and the encoder's decoder config on the first one). */
  commit(writer: ChunkWriter, blob: Blob, decoderConfig: StoredDecoderConfig | null): Promise<void>;
  /** The packet table and the bytes of a committed chunk. */
  readChunk(index: number): Promise<{ packets: PacketEntry[]; data: Blob }>;
  /** Frees one chunk's bytes after it has been muxed. */
  dropChunk(index: number): Promise<void>;
  /** Forgets every chunk (settings or parameter sets changed). */
  reset(plan: JournalPlan): Promise<void>;
  /** Deletes the journal (export finished or cancelled). */
  destroy(): Promise<void>;
}

const chunkName = (i: number) => `c${String(i).padStart(5, "0")}`;

function freshManifest(key: string, fileName: string, plan: JournalPlan, chunkSec: number, span: number): JournalManifest {
  const now = Date.now();
  return { v: 1, key, fileName, createdAt: now, updatedAt: now, plan, chunkSec, span, decoderConfig: null, chunks: [] };
}

/** Chunks in page memory: no storage here, or a small export; nothing to resume. */
export class MemoryChunkStore implements ChunkStore {
  readonly resumable = false;
  manifest: JournalManifest;
  private blobs = new Map<number, { packets: PacketEntry[]; data: Blob }>();

  constructor(key: string, fileName: string, plan: JournalPlan, chunkSec: number, span: number) {
    this.manifest = freshManifest(key, fileName, plan, chunkSec, span);
  }

  async openChunk(index: number): Promise<ChunkWriter> {
    return new ChunkWriter(index, new MemorySink());
  }

  async commit(w: ChunkWriter, blob: Blob, dc: StoredDecoderConfig | null): Promise<void> {
    this.blobs.set(w.index, { packets: w.packets, data: blob });
    this.manifest.chunks.push({ index: w.index, frames: w.frames, bytes: w.bytes, firstUs: w.firstUs, lastUs: w.lastUs });
    this.manifest.decoderConfig ??= dc;
  }

  async readChunk(index: number) {
    const c = this.blobs.get(index);
    if (!c) throw new Error(`chunk ${index} missing`);
    return c;
  }

  async dropChunk(index: number): Promise<void> {
    this.blobs.delete(index);
  }

  async reset(plan: JournalPlan): Promise<void> {
    this.blobs.clear();
    this.manifest = { ...this.manifest, plan, chunks: [], decoderConfig: null };
  }

  async destroy(): Promise<void> {
    this.blobs.clear();
  }
}

async function writeSmallFile(path: string[], text: string): Promise<void> {
  const sink = await FileSink.openPath(path);
  if (!sink) throw new Error("private storage unavailable");
  try {
    await sink.write(new TextEncoder().encode(text), 0);
    await sink.finish("application/json");
  } catch (e) {
    await sink.discard().catch(() => undefined);
    throw e;
  }
}

async function readJson<T>(path: string[]): Promise<T | null> {
  try {
    return JSON.parse(await (await readOpfsFile(path)).text()) as T;
  } catch {
    return null;
  }
}

/** Chunks in private storage with a manifest: survives a crash or reload. */
export class OpfsChunkStore implements ChunkStore {
  readonly resumable = true;
  manifest: JournalManifest;
  private readonly memoryLimit: number;
  private constructor(manifest: JournalManifest, memoryLimit: number) {
    this.manifest = manifest;
    this.memoryLimit = memoryLimit;
  }

  private path(name: string): string[] {
    return [JOURNAL_DIR, this.manifest.key, name];
  }

  /** Opens the journal for `key`, resuming its chunks when the plan matches. */
  static async open(key: string, fileName: string, plan: JournalPlan, chunkSec: number, span: number, memoryLimit: number): Promise<OpfsChunkStore | null> {
    if (!opfsAvailable()) return null;
    try {
      await pruneJournals(key);
      const existing = await readJson<JournalManifest>([JOURNAL_DIR, key, "manifest.json"]);
      const ok = existing && existing.v === 1 && existing.key === key && samePlan(existing.plan, plan) && existing.chunkSec === chunkSec && Math.abs(existing.span - span) < 1e-3;
      const store = new OpfsChunkStore(ok ? existing : freshManifest(key, fileName, plan, chunkSec, span), memoryLimit);
      if (!ok) await store.writeManifest();
      return store;
    } catch {
      return null;
    }
  }

  private async writeManifest(): Promise<void> {
    this.manifest.updatedAt = Date.now();
    await writeSmallFile(this.path("manifest.json"), JSON.stringify(this.manifest));
  }

  async openChunk(index: number): Promise<ChunkWriter> {
    const file = await FileSink.openPath(this.path(`${chunkName(index)}.bin`));
    // Storage failing for a chunk: it carries on in memory if small (FallbackSink), and stops being resumable.
    return new ChunkWriter(index, new FallbackSink(file ?? null, { memoryLimit: this.memoryLimit }));
  }

  async commit(w: ChunkWriter, blob: Blob, dc: StoredDecoderConfig | null): Promise<void> {
    const rec: ChunkRecord = { index: w.index, frames: w.frames, bytes: w.bytes, firstUs: w.firstUs, lastUs: w.lastUs };
    // This session reads its own chunks back from the Blob in hand (file-backed, or memory after a storage failure).
    this.sessionBlobs.set(w.index, { packets: w.packets, data: blob });
    this.manifest.chunks.push(rec);
    this.manifest.decoderConfig ??= dc;
    if (!this.persisting) return;
    if (w.storedIn !== "file") {
      // Later chunks build on one that isn't on disk: what's on disk stays resumable, nothing after it.
      this.persisting = false;
      return;
    }
    try {
      await writeSmallFile(this.path(`${chunkName(w.index)}.json`), JSON.stringify(w.packets));
      await this.writeManifest();
    } catch {
      this.persisting = false;
    }
  }

  /** Chunks keep being recorded on disk until one can't be. */
  private persisting = true;
  /** Chunks committed in this session (bytes in hand, no re-read needed). */
  private sessionBlobs = new Map<number, { packets: PacketEntry[]; data: Blob }>();

  async readChunk(index: number) {
    const mem = this.sessionBlobs.get(index);
    if (mem) return mem;
    const packets = await readJson<PacketEntry[]>(this.path(`${chunkName(index)}.json`));
    if (!packets) throw new Error(`export journal: chunk ${index} table missing`);
    const data = await readOpfsFile(this.path(`${chunkName(index)}.bin`));
    return { packets, data };
  }

  async dropChunk(index: number): Promise<void> {
    this.sessionBlobs.delete(index);
    try {
      const dir = await opfsDir(this.path("x"));
      await dir.removeEntry(`${chunkName(index)}.bin`).catch(() => undefined);
    } catch {
      // gone
    }
  }

  async reset(plan: JournalPlan): Promise<void> {
    const key = this.manifest.key;
    await removeJournal(key);
    this.sessionBlobs.clear();
    this.persisting = true;
    this.manifest = freshManifest(key, this.manifest.fileName, plan, this.manifest.chunkSec, this.manifest.span);
    await this.writeManifest().catch(() => undefined);
  }

  async destroy(): Promise<void> {
    this.sessionBlobs.clear();
    await removeJournal(this.manifest.key);
  }
}

async function journalsDir(create = false): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(JOURNAL_DIR, { create });
  } catch {
    return null;
  }
}

export async function removeJournal(key: string): Promise<void> {
  const dir = await journalsDir();
  await dir?.removeEntry(key, { recursive: true }).catch(() => undefined);
}

/** Lists the stored journals (newest first). */
export async function listJournals(): Promise<JournalManifest[]> {
  if (!opfsAvailable()) return [];
  const dir = await journalsDir();
  if (!dir) return [];
  const out: JournalManifest[] = [];
  for await (const key of (dir as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) {
    const m = await readJson<JournalManifest>([JOURNAL_DIR, key, "manifest.json"]);
    if (m && m.key === key) out.push(m);
    else await dir.removeEntry(key, { recursive: true }).catch(() => undefined);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Deletes old journals and all but the newest few (keeping `keep`). */
export async function pruneJournals(keep?: string, now = Date.now()): Promise<void> {
  const all = await listJournals();
  let kept = keep ? 1 : 0;
  for (const m of all) {
    if (m.key === keep) continue;
    // Temporary (non-resumable) journals: another tab's live export, or left by a crash.
    if (m.key.startsWith("tmp")) {
      if (now - m.updatedAt > 3600_000) await removeJournal(m.key);
      continue;
    }
    if (now - m.updatedAt > MAX_AGE_MS || kept >= MAX_JOURNALS) await removeJournal(m.key);
    else kept++;
  }
}

/**
 * What the export sheet offers: a committed partial export of this clip with
 * these settings (null when there is none).
 */
export async function findResumable(file: Blob, settingsKey: string): Promise<{ progress: number; chunks: number; manifest: JournalManifest } | null> {
  if (!opfsAvailable()) return null;
  try {
    const key = await journalKey(file, settingsKey);
    const m = await readJson<JournalManifest>([JOURNAL_DIR, key, "manifest.json"]);
    if (!m || !m.chunks.length) return null;
    return { progress: journalProgress(m), chunks: m.chunks.length, manifest: m };
  } catch {
    return null;
  }
}
