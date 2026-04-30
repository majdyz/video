type Candidate = { mime: string; ext: "mp4" | "webm" };

const CANDIDATES: Candidate[] = [
  { mime: "video/mp4;codecs=h264,aac", ext: "mp4" },
  { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
  { mime: "video/mp4", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];

export function pickRecorderMime(): Candidate | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
      // ignore
    }
  }
  try {
    if (MediaRecorder.isTypeSupported("video/webm")) return { mime: "video/webm", ext: "webm" };
  } catch {
    // ignore
  }
  return null;
}

// ~4 bits/pixel·second, capped at 30 Mbps. iPhone's native 4K H.264 is around
// 25–30 Mbps; pushing higher is where Safari's MediaRecorder starts dropping
// frames or losing the WebGL context mid-recording.
export function pickBitrate(width: number, height: number): number {
  const px = width * height;
  return Math.min(30_000_000, Math.max(3_000_000, Math.round(px * 4)));
}

type CaptureContext = {
  videoStream: MediaStream;
  videoTrack: MediaStreamTrack;
  pushFrame: () => void;
};

export function buildCaptureContext(canvas: HTMLCanvasElement): CaptureContext {
  // Active capture at 30fps. The passive captureStream(0)+requestFrame path
  // gave 1:1 frame mapping but lost frames mid-recording on iOS Safari for
  // long 4K clips ("black middle" symptom). Active mode is browser-managed
  // and far more stable.
  const canvasStream = canvas.captureStream(30);
  const videoTrack = canvasStream.getVideoTracks()[0];
  return {
    videoStream: canvasStream,
    videoTrack,
    pushFrame: () => undefined,
  };
}

type AudioRouting = {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
};

// Web Audio routes the element's audio through a graph; the gain stays at 0 so
// preview is silent locally, while a MediaStreamAudioDestinationNode tap can
// still pull the audio into MediaRecorder when the user starts a save.
export function attachAudioRouting(video: HTMLVideoElement): AudioRouting | null {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(video);
    const muteGain = ctx.createGain();
    muteGain.gain.value = 0;
    source.connect(muteGain);
    muteGain.connect(ctx.destination);
    return { ctx, source };
  } catch {
    return null;
  }
}

export function captureAudioForRecording(routing: AudioRouting | null): {
  tracks: MediaStreamTrack[];
  cleanup: () => void;
} {
  if (!routing) return { tracks: [], cleanup: () => undefined };
  // Resume fire-and-forget so we don't burn the user-gesture window awaiting
  // a Promise that can hang on some browsers.
  if (routing.ctx.state === "suspended") {
    routing.ctx.resume().catch(() => undefined);
  }
  const dest = routing.ctx.createMediaStreamDestination();
  routing.source.connect(dest);
  return {
    tracks: dest.stream.getAudioTracks(),
    cleanup: () => {
      try {
        routing.source.disconnect(dest);
      } catch {
        // ignore
      }
    },
  };
}

// Output sink: streams MediaRecorder chunks to disk via the Origin Private File
// System so a long recording doesn't sit in JS heap. Falls back to in-memory
// if OPFS isn't available (older Safari, private mode).
export type RecordingSink = {
  write: (chunk: BlobPart) => Promise<void>;
  finalize: (mimeType: string) => Promise<Blob>;
  cleanup: () => Promise<void>;
};

type StorageWithDirectory = {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type WritableHandle = FileSystemFileHandle & {
  createWritable?: (options?: { keepExistingData?: boolean }) => Promise<FileSystemWritableFileStream>;
};

// Best-effort sweep of leftover aqua-*.tmp entries from previous sessions.
export async function pruneOldRecordings(): Promise<void> {
  const storage = navigator.storage as Navigator["storage"] & StorageWithDirectory;
  if (!storage || typeof storage.getDirectory !== "function") return;
  try {
    const root = await storage.getDirectory();
    const dir = root as FileSystemDirectoryHandle & {
      values?: () => AsyncIterable<FileSystemHandle>;
    };
    if (typeof dir.values !== "function") return;
    for await (const entry of dir.values()) {
      if (entry.name.startsWith("aqua-") && entry.name.endsWith(".tmp")) {
        root.removeEntry(entry.name).catch(() => undefined);
      }
    }
  } catch {
    // ignore
  }
}

export async function createRecordingSink(): Promise<RecordingSink> {
  const storage = navigator.storage as Navigator["storage"] & StorageWithDirectory;
  if (storage && typeof storage.getDirectory === "function") {
    try {
      const root = await storage.getDirectory();
      const name = `aqua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
      const handle = (await root.getFileHandle(name, { create: true })) as WritableHandle;
      if (typeof handle.createWritable === "function") {
        const writable = await handle.createWritable();
        let closed = false;
        return {
          write: async (chunk) => {
            if (!closed) await writable.write(chunk);
          },
          finalize: async (mimeType) => {
            if (!closed) {
              await writable.close();
              closed = true;
            }
            const file = await handle.getFile();
            return mimeType ? file.slice(0, file.size, mimeType) : file;
          },
          cleanup: async () => {
            if (!closed) {
              try {
                await writable.close();
              } catch {
                // ignore
              }
              closed = true;
            }
            // The download anchor is still streaming from this OPFS file when
            // cleanup runs — removing it now truncates the saved file. Defer
            // the entry removal; stale entries get pruned on next launch.
            setTimeout(() => {
              root.removeEntry(name).catch(() => undefined);
            }, 60_000);
          },
        };
      }
    } catch {
      // fall through to memory
    }
  }
  const chunks: BlobPart[] = [];
  return {
    write: async (chunk) => {
      chunks.push(chunk);
    },
    finalize: async (mimeType) => new Blob(chunks, { type: mimeType }),
    cleanup: async () => {
      chunks.length = 0;
    },
  };
}
