/**
 * Writes muxer output into a file in the origin's private storage, so a finished
 * 4K export never sits in the page's memory. Runs in a worker because Safari only
 * offers the synchronous access handle there.
 *
 * A failed write is retried (same handle, then a reopened handle). If it still
 * fails, that chunk and every later one is handed back to the page (`failed`)
 * so the page can carry on in memory without losing bytes.
 */
type Msg =
  | { type: "open"; path: string[] }
  | { type: "write"; position: number; data: ArrayBuffer }
  | { type: "close" };

// Declared locally: the apps compile against the DOM lib only, which has no
// FileSystemSyncAccessHandle.
type SyncHandle = {
  write(data: Uint8Array, options: { at: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
};
type SyncFileHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> };

let handle: SyncHandle | undefined;
let fileHandle: SyncFileHandle | undefined;
let size = 0;
let failed: string | null = null;

/**
 * Chrome returns some storage-layer errors as a negative byte count, which
 * reaches JS as a huge unsigned number (4294967292 = -4). Decodes it.
 */
function describe(written: number, expected: number): string {
  if (written > expected && written > 2 ** 31) return `error code ${written - 2 ** 32}`;
  return `${written} of ${expected} bytes`;
}

function tryWrite(data: Uint8Array, at: number): string | null {
  try {
    const written = handle!.write(data, { at });
    return written === data.byteLength ? null : describe(written, data.byteLength);
  } catch (err) {
    return `${(err as Error).name}: ${(err as Error).message}`;
  }
}

async function reopen(): Promise<void> {
  try {
    handle?.flush();
    handle?.close();
  } catch {
    // A broken handle may not close cleanly.
  }
  handle = await fileHandle!.createSyncAccessHandle();
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  try {
    if (msg.type === "open") {
      // path: directories, then the file name (created as needed).
      let dir = await navigator.storage.getDirectory();
      for (const part of msg.path.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      fileHandle = (await dir.getFileHandle(msg.path[msg.path.length - 1], { create: true })) as SyncFileHandle;
      handle = await fileHandle.createSyncAccessHandle();
      handle.truncate(0);
      size = 0;
      failed = null;
      self.postMessage({ type: "opened" });
    } else if (msg.type === "write") {
      if (!handle) throw new Error("not open");
      const data = new Uint8Array(msg.data);
      if (!failed) {
        let problem = tryWrite(data, msg.position);
        if (problem) problem = tryWrite(data, msg.position) && problem;
        if (problem) {
          await reopen().catch(() => undefined);
          if (handle && !tryWrite(data, msg.position)) problem = null;
        }
        if (problem) {
          // A short write is how a full disk shows up; a silently truncated file is worse than no file.
          failed = `storage write failed at ${msg.position} (${problem})`;
        }
      }
      if (failed) {
        self.postMessage({ type: "failed", message: failed, position: msg.position, data: msg.data }, { transfer: [msg.data] });
        return;
      }
      size = Math.max(size, msg.position + data.byteLength);
      self.postMessage({ type: "written", position: msg.position });
    } else if (msg.type === "close") {
      if (handle) {
        try {
          handle.flush();
        } catch {
          // Flush fails on a broken handle; the bytes written so far stay readable.
        }
        handle.close();
      }
      handle = undefined;
      self.postMessage({ type: "closed", size });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: (err as Error).message });
  }
};
