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

// Roughly 6 bits/pixel·second — keeps 1080p around 12 Mbps and 4K around 50 Mbps.
export function pickBitrate(width: number, height: number): number {
  const px = width * height;
  return Math.min(80_000_000, Math.max(4_000_000, Math.round(px * 6)));
}

type CaptureContext = {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  pushFrame: () => void;
};

export function buildCaptureContext(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): CaptureContext {
  // captureStream(0) = passive — frames only published via track.requestFrame()
  // so we can drive 1:1 mapping from the source's requestVideoFrameCallback.
  let canvasStream: MediaStream;
  let useRequestFrame = false;
  try {
    canvasStream = canvas.captureStream(0);
    const track = canvasStream.getVideoTracks()[0];
    const trackWithRequestFrame = track as MediaStreamTrack & { requestFrame?: () => void };
    if (track && typeof trackWithRequestFrame.requestFrame === "function") {
      useRequestFrame = true;
    }
  } catch {
    canvasStream = canvas.captureStream(60);
  }

  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  const sourceWithCapture = video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  try {
    const sourceStream = sourceWithCapture.captureStream?.() ?? sourceWithCapture.mozCaptureStream?.();
    if (sourceStream) {
      for (const t of sourceStream.getAudioTracks()) tracks.push(t);
    }
  } catch {
    // audio capture not supported
  }

  const videoTrack = canvasStream.getVideoTracks()[0];
  const trackWithRequestFrame = videoTrack as MediaStreamTrack & { requestFrame?: () => void };
  return {
    stream: new MediaStream(tracks),
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
