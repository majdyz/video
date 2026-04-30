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

// ~6 bits/pixel·second, capped at 50 Mbps. Matches iPhone's native 4K H.264
// bitrate, leaves headroom under Safari's MediaRecorder memory ceiling.
export function pickBitrate(width: number, height: number): number {
  const px = width * height;
  return Math.min(50_000_000, Math.max(3_000_000, Math.round(px * 6)));
}

type CaptureContext = {
  videoStream: MediaStream;
  videoTrack: MediaStreamTrack;
  pushFrame: () => void;
};

export function buildCaptureContext(canvas: HTMLCanvasElement): CaptureContext {
  // Prefer passive capture (captureStream(0) + track.requestFrame) for 1:1
  // source-to-output frame mapping, but only if both are actually available.
  // iOS Safari versions that lack track.requestFrame would otherwise leave
  // us with a passive stream and no way to push frames — recording would
  // start and produce zero frames.
  let canvasStream: MediaStream | null = null;
  let useRequestFrame = false;
  try {
    const passive = canvas.captureStream(0);
    const track = passive.getVideoTracks()[0];
    const trackWithRequestFrame = track as MediaStreamTrack & { requestFrame?: () => void };
    if (track && typeof trackWithRequestFrame.requestFrame === "function") {
      canvasStream = passive;
      useRequestFrame = true;
    } else {
      track?.stop();
    }
  } catch {
    // ignore, fall through to active mode
  }
  if (!canvasStream) {
    canvasStream = canvas.captureStream(30);
  }

  const videoTrack = canvasStream.getVideoTracks()[0];
  const trackWithRequestFrame = videoTrack as MediaStreamTrack & { requestFrame?: () => void };
  return {
    videoStream: canvasStream,
    videoTrack,
    pushFrame: () => {
      if (useRequestFrame) {
        try {
          trackWithRequestFrame.requestFrame?.();
        } catch {
          // ignore
        }
      }
    },
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

export async function captureAudioForRecording(routing: AudioRouting | null): Promise<{
  tracks: MediaStreamTrack[];
  cleanup: () => void;
}> {
  if (!routing) return { tracks: [], cleanup: () => undefined };
  if (routing.ctx.state === "suspended") {
    try {
      await routing.ctx.resume();
    } catch {
      // ignore
    }
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
            try {
              await root.removeEntry(name);
            } catch {
              // ignore
            }
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
