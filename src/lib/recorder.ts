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

// ~4 bits/pixel·second, capped at 25 Mbps.
// Safari's MediaRecorder gets unstable above this and stalls 30-60s in.
export function pickBitrate(width: number, height: number): number {
  const px = width * height;
  return Math.min(25_000_000, Math.max(3_000_000, Math.round(px * 4)));
}

type CaptureContext = {
  videoStream: MediaStream;
  videoTrack: MediaStreamTrack;
  pushFrame: () => void;
};

export function buildCaptureContext(canvas: HTMLCanvasElement): CaptureContext {
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
