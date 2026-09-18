/**
 * Writes the muxer's output into a file in the origin's private storage, so the finished MP4
 * never sits in the page's memory. Runs in a worker because Safari only offers the synchronous
 * access handle there.
 */
type Msg =
  | { type: "open"; name: string }
  | { type: "write"; position: number; data: ArrayBuffer }
  | { type: "close" };

let handle: FileSystemSyncAccessHandle | undefined;
let size = 0;

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  try {
    if (msg.type === "open") {
      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle(msg.name, { create: true });
      handle = await file.createSyncAccessHandle();
      handle.truncate(0);
      size = 0;
      self.postMessage({ type: "opened" });
    } else if (msg.type === "write") {
      if (!handle) throw new Error("not open");
      handle.write(new Uint8Array(msg.data), { at: msg.position });
      size = Math.max(size, msg.position + msg.data.byteLength);
      self.postMessage({ type: "written", position: msg.position });
    } else if (msg.type === "close") {
      if (!handle) throw new Error("not open");
      handle.flush();
      handle.close();
      handle = undefined;
      self.postMessage({ type: "closed", size });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: (err as Error).message });
  }
};
