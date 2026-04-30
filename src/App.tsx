import { useEffect, useRef, useState } from "react";
import { Renderer, computeStats, type Settings, type Stats } from "./lib/correct";
import {
  attachAudioRouting,
  buildCaptureContext,
  captureAudioForRecording,
  createRecordingSink,
  pickBitrate,
  pickRecorderMime,
  pruneOldRecordings,
  type RecordingSink,
} from "./lib/recorder";
import { parseCube } from "./lib/lut";
import "./App.css";

type Mode = "idle" | "photo" | "video";

const DEFAULT_SETTINGS: Settings = {
  intensity: 1.0,
  castStrength: 0.85,
  saturation: 1.18,
  gamma: 0.92,
  contrast: 0.3,
  clahe: 0.6,
  lutMix: 1.0,
};

const OFF_SETTINGS: Settings = {
  intensity: 0,
  castStrength: 0,
  saturation: 1,
  gamma: 1,
  contrast: 0,
  clahe: 0,
  lutMix: 0,
};

const IDENTITY_TONE_LUT = (() => {
  const a = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    a[i * 4] = i;
    a[i * 4 + 1] = i;
    a[i * 4 + 2] = i;
    a[i * 4 + 3] = 255;
  }
  return a;
})();

// Identity stats let preview render immediately while real stats compute in
// the background — output passes the source through unchanged.
const IDENTITY_STATS: Stats = {
  mean: [0.5, 0.5, 0.5],
  wbGain: [1, 1, 1],
  min: [0, 0, 0],
  max: [1, 1, 1],
  alpha: 0,
  toneLUT: IDENTITY_TONE_LUT,
};

const PRESETS: { label: string; settings: Settings }[] = [
  { label: "Off", settings: OFF_SETTINGS },
  { label: "Shallow", settings: { intensity: 0.85, castStrength: 0.55, saturation: 1.1, gamma: 0.96, contrast: 0.18, clahe: 0.4, lutMix: 1.0 } },
  { label: "Reef", settings: DEFAULT_SETTINGS },
  { label: "Deep", settings: { intensity: 1.0, castStrength: 1.0, saturation: 1.3, gamma: 0.86, contrast: 0.4, clahe: 0.75, lutMix: 1.0 } },
];

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: unknown) => void) => number;
};

type AudioRouting = ReturnType<typeof attachAudioRouting>;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const statsRef = useRef<Stats | null>(null);
  const imageBitmapRef = useRef<ImageBitmap | null>(null);
  const fileNameRef = useRef<string>("aqua");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const previewActiveRef = useRef(false);
  const recordingFlagRef = useRef(false);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const showOriginalRef = useRef(false);
  const audioRoutingRef = useRef<AudioRouting>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const onEndedRef = useRef<(() => void) | null>(null);
  const sinkRef = useRef<RecordingSink | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastStatsRefreshRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [recordTime, setRecordTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [canRecord, setCanRecord] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lutName, setLutName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    showOriginalRef.current = showOriginal;
  }, [showOriginal]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    try {
      rendererRef.current = new Renderer(canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setCanRecord(pickRecorderMime() !== null);
    pruneOldRecordings();

    const onLost = (e: Event) => {
      e.preventDefault();
      setError("GPU context lost — try a smaller video or reload the page");
      recordingFlagRef.current = false;
    };
    const onRestored = () => {
      try {
        rendererRef.current = new Renderer(canvas);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);

  // Re-render the loaded photo whenever any setting changes; recompute stats
  // when castStrength changes (it affects the WB gains and stretch bounds).
  useEffect(() => {
    if (mode !== "photo" || !rendererRef.current || !imageBitmapRef.current) return;
    const bitmap = imageBitmapRef.current;
    statsRef.current = computeStats(bitmap, bitmap.width, bitmap.height, settings.castStrength);
    rendererRef.current.uploadSource(bitmap, bitmap.width, bitmap.height);
    const eff = showOriginal ? OFF_SETTINGS : settings;
    rendererRef.current.render(statsRef.current, eff);
  }, [settings, mode, showOriginal]);

  // For video, recompute stats when castStrength changes (sample current frame).
  useEffect(() => {
    if (mode !== "video" || !videoRef.current || videoRef.current.readyState < 2) return;
    const v = videoRef.current;
    statsRef.current = computeStats(v, v.videoWidth, v.videoHeight, settings.castStrength);
  }, [settings.castStrength, mode]);

  // When the video preview is paused, the rVFC render loop is dormant — so
  // settings tweaks wouldn't repaint the frozen frame. This effect re-renders
  // the current paused frame on every settings/showOriginal change.
  useEffect(() => {
    if (mode !== "video") return;
    const v = videoRef.current;
    if (!v || !rendererRef.current || !statsRef.current) return;
    if (!v.paused) return;
    if (v.readyState < 2) return;
    rendererRef.current.uploadSource(v, v.videoWidth, v.videoHeight);
    const eff = showOriginal ? OFF_SETTINGS : settings;
    rendererRef.current.render(statsRef.current, eff);
  }, [settings, showOriginal, isPaused, mode]);

  // Track playback time + paused state so the scrubber and the play-overlay reflect reality.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || mode !== "video") return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);
    const onSeeked = () => {
      setCurrentTime(v.currentTime);
      // re-render the seeked frame in case rVFC didn't fire
      if (rendererRef.current && statsRef.current && v.readyState >= 2) {
        rendererRef.current.uploadSource(v, v.videoWidth, v.videoHeight);
        const eff = showOriginalRef.current ? OFF_SETTINGS : settingsRef.current;
        rendererRef.current.render(statsRef.current, eff);
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    setCurrentTime(v.currentTime);
    setIsPaused(v.paused);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [mode]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v || recording) return;
    if (v.paused) {
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v || recording) return;
    try {
      v.currentTime = Math.min(Math.max(0, t), v.duration || 0);
    } catch {
      // ignore
    }
  }

  function maybeRefreshStats(video: HTMLVideoElement) {
    // Adaptive: re-sample stats every ~1s from the current frame and blend
    // with the existing stats so cast/colour changes (depth, sun, scene cuts)
    // are tracked without flicker. EMA at 15% feels responsive but smooth.
    const now = performance.now();
    if (now - lastStatsRefreshRef.current < 1000) return;
    if (video.readyState < 2) return;
    try {
      const fresh = computeStats(video, video.videoWidth, video.videoHeight, settingsRef.current.castStrength);
      const cur = statsRef.current;
      if (cur && cur !== IDENTITY_STATS) {
        statsRef.current = lerpStats(cur, fresh, 0.15);
      } else {
        statsRef.current = fresh;
      }
      lastStatsRefreshRef.current = now;
    } catch {
      // ignore — keep existing stats
    }
  }

  function startPreview() {
    const video = videoRef.current as VideoWithRVFC | null;
    if (!video) return;
    previewActiveRef.current = true;
    lastStatsRefreshRef.current = 0;

    const renderFromVideo = () => {
      if (!rendererRef.current || !statsRef.current || !videoRef.current) return;
      const v = videoRef.current;
      if (v.readyState < 2) return;
      maybeRefreshStats(v);
      rendererRef.current.uploadSource(v, v.videoWidth, v.videoHeight);
      const eff = showOriginalRef.current ? OFF_SETTINGS : settingsRef.current;
      rendererRef.current.render(statsRef.current, eff);
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      const onFrame = () => {
        if (!previewActiveRef.current || recordingFlagRef.current) return;
        renderFromVideo();
        const v = videoRef.current as VideoWithRVFC | null;
        if (v && previewActiveRef.current && !recordingFlagRef.current) {
          v.requestVideoFrameCallback?.(onFrame);
        }
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      const loop = () => {
        if (!previewActiveRef.current || recordingFlagRef.current) return;
        renderFromVideo();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  function teardownVideo() {
    previewActiveRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    recordingFlagRef.current = false;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setRecording(false);
    setRecordProgress(0);
    teardownVideo();
    fileNameRef.current = file.name.replace(/\.[^.]+$/, "");
    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    setBusy(isVideo ? "Loading video…" : "Loading photo…");
    try {
      if (isVideo) {
        await loadVideo(file);
      } else {
        await loadImage(file);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleLUTFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCube(text);
      if (rendererRef.current) {
        rendererRef.current.uploadLUT(parsed.data, parsed.size);
      }
      setLutName(file.name);
      // re-render photo or trigger video repaint via state nudge
      if (mode === "photo" && rendererRef.current && imageBitmapRef.current && statsRef.current) {
        rendererRef.current.uploadSource(imageBitmapRef.current, imageBitmapRef.current.width, imageBitmapRef.current.height);
        rendererRef.current.render(statsRef.current, showOriginal ? OFF_SETTINGS : settings);
      }
    } catch (e) {
      setError("LUT load failed: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function clearLUT() {
    if (rendererRef.current) rendererRef.current.clearLUT();
    setLutName(null);
    if (mode === "photo" && rendererRef.current && imageBitmapRef.current && statsRef.current) {
      rendererRef.current.uploadSource(imageBitmapRef.current, imageBitmapRef.current.width, imageBitmapRef.current.height);
      rendererRef.current.render(statsRef.current, showOriginal ? OFF_SETTINGS : settings);
    }
  }

  async function loadImage(file: File) {
    try {
      const bitmap = await createImageBitmap(file);
      imageBitmapRef.current = bitmap;
      const stats = computeStats(bitmap, bitmap.width, bitmap.height, settingsRef.current.castStrength);
      statsRef.current = stats;
      setMode("photo");
      requestAnimationFrame(() => {
        if (!rendererRef.current) return;
        rendererRef.current.uploadSource(bitmap, bitmap.width, bitmap.height);
        rendererRef.current.render(stats, settingsRef.current);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadVideo(file: File) {
    if (!videoRef.current || !rendererRef.current) return;
    const url = URL.createObjectURL(file);
    const video = videoRef.current;
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "auto";

    try {
      // Block only until metadata is parsed (videoWidth/duration available);
      // don't wait for first-frame decode. That's where the multi-second stall
      // was on 4K MOVs.
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onMeta = () => {
            video.removeEventListener("loadedmetadata", onMeta);
            video.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = () => {
            video.removeEventListener("loadedmetadata", onMeta);
            video.removeEventListener("error", onErr);
            reject(new Error("Could not decode video"));
          };
          video.addEventListener("loadedmetadata", onMeta);
          video.addEventListener("error", onErr);
        });
      }

      // Audio routing (createMediaElementSource) is iOS Safari's slow path —
      // attaching it here used to add a multi-second hang to the first video
      // load. We attach lazily inside recordVideo() instead.

      // Start playback in the background — don't await it before showing UI.
      video.play().catch(() => undefined);

      // Identity stats let the preview show frames as they decode; real stats
      // swap in once we have a decoded frame. Avoids a several-hundred-ms gap.
      statsRef.current = IDENTITY_STATS;
      setDuration(video.duration || 0);
      setMode("video");
      startPreview();

      // Compute real stats once the first frame is actually available.
      const computeOnce = () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) return;
        try {
          // Pass the video element directly to skip allocating a 4K sampler canvas.
          statsRef.current = computeStats(v, v.videoWidth, v.videoHeight, settingsRef.current.castStrength);
        } catch {
          // identity stats stay; preview keeps showing source
        }
      };
      if (video.readyState >= 2) {
        computeOnce();
      } else {
        const onCanPlay = () => {
          video.removeEventListener("canplay", onCanPlay);
          computeOnce();
        };
        video.addEventListener("canplay", onCanPlay);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function savePhoto() {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        triggerDownload(blob, `${fileNameRef.current}-aqua.jpg`).catch(() => undefined);
      },
      "image/jpeg",
      0.95,
    );
  }

  async function recordVideo() {
    try {
      await recordVideoInner();
    } catch (e) {
      recordingFlagRef.current = false;
      if (audioCleanupRef.current) {
        audioCleanupRef.current();
        audioCleanupRef.current = null;
      }
      if (sinkRef.current) {
        sinkRef.current.cleanup().catch(() => undefined);
        sinkRef.current = null;
      }
      setRecording(false);
      setError("Recording failed: " + (e instanceof Error ? e.message : String(e)));
      startPreview();
    }
  }

  async function recordVideoInner() {
    const canvas = canvasRef.current;
    const video = videoRef.current as VideoWithRVFC | null;
    if (!canvas || !video || !statsRef.current) return;
    const candidate = pickRecorderMime();
    if (!candidate) {
      setError("This browser can't encode video. Try the latest Safari or Chrome.");
      return;
    }
    setError(null);

    previewActiveRef.current = false;
    recordingFlagRef.current = true;

    video.pause();
    video.loop = false;
    // muted=false is required on iOS for the audio decoder to actually run.
    // The audio still goes through a 0-gain Web Audio graph so the user
    // hears nothing locally, but createMediaElementSource gets real samples.
    video.muted = false;
    // Wait for the seek-to-zero to complete before recording starts, otherwise
    // play() can resume from the previous preview position and the recorded
    // video starts mid-clip.
    if (video.currentTime > 0.01) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        try {
          video.currentTime = 0;
        } catch {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        }
      });
    }

    // Wake lock fire-and-forget — don't await it (it can throw synchronously
    // on browsers that announce the API but don't actually implement
    // .request, and we don't want to consume the user-gesture window or
    // delay recorder startup either way).
    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    }).wakeLock;
    if (wakeLockApi && typeof wakeLockApi.request === "function") {
      wakeLockApi
        .request("screen")
        .then((lock) => {
          wakeLockRef.current = lock;
        })
        .catch(() => undefined);
    }

    if (rendererRef.current) {
      rendererRef.current.uploadSource(video, video.videoWidth, video.videoHeight);
      rendererRef.current.render(statsRef.current, settingsRef.current);
    }

    const captureCtx = buildCaptureContext(canvas);
    if (!audioRoutingRef.current) {
      audioRoutingRef.current = attachAudioRouting(video);
    }
    const audioCapture = captureAudioForRecording(audioRoutingRef.current);
    const stream = new MediaStream([
      ...captureCtx.videoStream.getVideoTracks(),
      ...audioCapture.tracks,
    ]);
    const bitrate = pickBitrate(video.videoWidth, video.videoHeight);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: candidate.mime || undefined,
        videoBitsPerSecond: bitrate,
      });
    } catch (e) {
      audioCapture.cleanup();
      recordingFlagRef.current = false;
      setError("Recording failed: " + (e instanceof Error ? e.message : String(e)));
      startPreview();
      return;
    }

    recorderRef.current = recorder;
    audioCleanupRef.current = audioCapture.cleanup;
    const sink = await createRecordingSink();
    sinkRef.current = sink;
    let writeQueue: Promise<void> = Promise.resolve();
    recorder.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      // serialize writes so OPFS sees chunks in arrival order
      writeQueue = writeQueue.then(() => sink.write(e.data)).catch(() => undefined);
    };
    recorder.onerror = (e: Event) => {
      const evt = e as Event & { error?: unknown };
      const msg = evt.error instanceof Error ? evt.error.message : "encoder error";
      setError("Recording error: " + msg);
    };

    lastStatsRefreshRef.current = 0;
    const renderAndPush = () => {
      if (!recordingFlagRef.current || !rendererRef.current || !statsRef.current || !videoRef.current) return;
      const v = videoRef.current;
      maybeRefreshStats(v);
      rendererRef.current.uploadSource(v, v.videoWidth, v.videoHeight);
      const eff = showOriginalRef.current ? OFF_SETTINGS : settingsRef.current;
      rendererRef.current.render(statsRef.current, eff);
      setRecordTime(v.currentTime);
      if (v.duration) setRecordProgress(v.currentTime / v.duration);
    };

    // Drive recording renders via requestAnimationFrame (not rVFC). rAF runs
    // before each display refresh, so the WebGL drawing buffer is presented in
    // sync with the active captureStream sampler. Using rVFC here was leaving
    // the canvas un-presented and the captured video stream ended up with only
    // one frame (just an audio track plus the seed frame).
    const loop = () => {
      if (!recordingFlagRef.current) return;
      renderAndPush();
      if (!video.ended && recordingFlagRef.current) {
        requestAnimationFrame(loop);
      }
    };
    requestAnimationFrame(loop);

    const stopAndDownload = () =>
      new Promise<void>((resolve) => {
        recorder.onstop = async () => {
          audioCapture.cleanup();
          audioCleanupRef.current = null;
          try {
            await writeQueue;
            const blob = await sink.finalize(candidate.mime || "video/webm");
            await triggerDownload(blob, `${fileNameRef.current}-aqua.${candidate.ext}`);
          } catch (err) {
            setError("Save failed: " + (err instanceof Error ? err.message : String(err)));
          } finally {
            await sink.cleanup();
            sinkRef.current = null;
            resolve();
          }
        };
        try {
          recorder.stop();
        } catch {
          audioCapture.cleanup();
          audioCleanupRef.current = null;
          sink.cleanup().finally(() => {
            sinkRef.current = null;
            resolve();
          });
        }
      });

    const onEnded = async () => {
      recordingFlagRef.current = false;
      onEndedRef.current = null;
      video.removeEventListener("ended", onEnded);
      await stopAndDownload();
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // ignore
        }
        wakeLockRef.current = null;
      }
      setRecording(false);
      setRecordProgress(0);
      setRecordTime(0);
      video.loop = true;
      video.muted = true;
      try {
        video.currentTime = 0;
      } catch {
        // ignore
      }
      await video.play().catch(() => undefined);
      startPreview();
    };
    onEndedRef.current = onEnded;
    video.addEventListener("ended", onEnded);

    setRecording(true);
    setRecordProgress(0);
    setRecordTime(0);
    recorder.start(1000);
    try {
      await video.play();
    } catch (e) {
      recordingFlagRef.current = false;
      audioCapture.cleanup();
      audioCleanupRef.current = null;
      try {
        recorder.stop();
      } catch {
        // ignore
      }
      try {
        await sink.cleanup();
      } catch {
        // ignore
      }
      sinkRef.current = null;
      setRecording(false);
      setError("Couldn't start playback for recording: " + (e instanceof Error ? e.message : String(e)));
      startPreview();
    }
  }

  function cancelRecording() {
    // Halt the rVFC/rAF capture loop first so it doesn't keep firing while we
    // tear things down — that was freezing the page on cancel.
    recordingFlagRef.current = false;

    const v = videoRef.current;
    if (v && onEndedRef.current) {
      v.removeEventListener("ended", onEndedRef.current);
      onEndedRef.current = null;
    }
    if (v) v.pause();

    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try {
        if (recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {
        // ignore
      }
      recorderRef.current = null;
    }
    if (audioCleanupRef.current) {
      audioCleanupRef.current();
      audioCleanupRef.current = null;
    }
    if (sinkRef.current) {
      sinkRef.current.cleanup().catch(() => undefined);
      sinkRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => undefined);
      wakeLockRef.current = null;
    }

    setRecording(false);
    setRecordProgress(0);
    setRecordTime(0);

    if (v) {
      v.loop = true;
      v.muted = true;
      try {
        v.currentTime = 0;
      } catch {
        // ignore
      }
      v.play().catch(() => undefined);
    }
    startPreview();
  }

  function reset() {
    setSettings(DEFAULT_SETTINGS);
  }

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />

      <header className="hero">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            {/* Sea lion silhouette by Ryan Kissinger / NIAID, NIH BioArt 489 — public domain */}
            <svg viewBox="0 0 500 500">
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#5fd0ff" />
                  <stop offset="1" stopColor="#2bb89e" />
                </linearGradient>
              </defs>
              <path
                d="M484.89,405.07c-.58-1.28-1.79-2.23-2.7-3.3-1.79-2.19-1.45-5.46-3.2-7.79-6.19-6.57-14.73-12.71-24.01-13.9-15.06-1.39-30.06,1.25-45.13.95-11.66.09-26.16,1.63-34.31-8.37-8.26-9.81-4.88-23.37-3.05-34.89,2.42-18.04,8.78-35.42,9.38-53.72.27-3.57,1.01-7.06.74-10.54-.17-4.24-1.52-8.39-1.66-12.74-.43-18.95-14.42-33.37-20.86-50.36-5.76-15.09-12.91-29.95-16.53-45.75-1.09-6.24-2.19-12.41-3.22-18.77-.25-1.64-.58-3.27-.64-4.91-.19-3.18,1.62-4.77,2.02-6.94.32-1.76-.81-3.42-1.91-4.75-1.79-2.16-3.74-4.13-5.43-6.36-5.1-7.73-11.34-14.68-19.06-19.88-11.45-7.12-25.56-8.4-38.72-7.89-4.2.17-7.95,1.98-11.77,3.56-9.79,3.58-16.55-5.48-26.2,2.72-10.16,7.97-8.4,19.02-4.71,29.91.63,2.12,1.14,4.3,1.79,6.41,1.29,4.41,4.19,7.85,5.66,11.96.9,3.11.17,5.59-.17,8.99-1.45,9.48,9.39,11.46,9.86,20.52.65,8.43.17,17.26-1.57,25.62-4.06,16.71-12.59,32.13-19.85,47.6-3.03,5.68-9.51,6.7-15.43,7.46-6.58.86-13,1.27-19.43,2.66-5.01,1.11-10.11,1.76-15.14,2.74-7.33,1.5-14.43,3.85-21.79,5.2-15.5,2.86-30.84,6.79-45.36,13-9.25,3.34-18.63,6.52-27.19,11.42-6.34,4-13.14,7.79-19.23,11.91-3.04,2.02-5.94,4.38-9.32,5.78-7.45,3.01-15.22-2.21-22.84-.74-2.1.39-3.46,1.68-4.78,3.18-2.16,2.37-4.24,5.08-7.39,6.2-3.99,2.51-14.31-.19-15.26,5.04.68,4.41,6.58,5.23,10.1,6.69,4.85,1.82,9.62,3.48,14.08,5.93,7.14,3.84,2.41,9.8,1.11,15.65-5.08,16.54-4.05,23.11,13.4,29.24,6.66,2.48,13.66,4.46,20.82,3.61,3.38-.28,7.61-.48,9.62-3.57,4.44-7.5-3.39-20.82.52-27.98,3.08-5.24,32.33,3.93,38.44,5.43,10.18,2.58,20.95,3.99,31.35,5.78,9.61,1.18,19.16,2.3,28.76,3.62,8.17,1.53,16.11,4.32,23.94,6.74,4.65,1.57,11.14,3.21,11.33,8.89.78,2.99.07,6.6-1.57,9.62-2.26,4.76-4.42,8.59-9.18,10.49-4.85,1.86-10.27,2.64-15.15,4.92-6,2.58-12.93,5.78-14.68,12.57-.98,3.3-3.7,6.02-6.63,7.88-2.58,1.5-3.21,4.05-4.72,6.3-2.27,2.81-10.95,3.39-12.89,5.95-3.49,5.82,23.77,6.27,26.76,4.82,5.28-1.02,10.59-1.9,15.55-3.87,6-2.59,12.33-4.79,18.21-7.52,14.51-8.01,28.67-16.62,43.16-24.55,3.19-1.85,6.18-4.13,8.11-7.3,2.14-3.42,2.29-7.39,5.1-9.82,2.32-1.96,5.6-2.25,8.54-2.81,5.08-.92,10.43-1.08,15.62-1.82,8.61-1.12,17.57-1.32,25.62-4.69,6.01-2.56,12.07-5.68,17.02-9.94,5.52-4.51,10.64-10.57,15.6-15.56.92-.9,1.09,3.15,1.23,4.36,1.52,15.46,3.43,23.79,16.46,33.72,9.21,7.61,21.14,10.32,32.69,12.59,9.5,2.51,19.27,1.89,28.85,2.28,7.74.65,15.89,1.58,23.77,1.57,11.11.21,23.25.26,33.32-4.69,2.8-1.5,5.01-3.11,4.17-5.67l-.04-.11Z"
                fill="url(#lg)"
              />
            </svg>
          </div>
          <div>
            <h1>Aqua Fix</h1>
            <p className="tag">underwater color in your pocket</p>
          </div>
        </div>
      </header>

      <div
        className={`stage ${mode === "idle" ? "is-empty" : ""}`}
        onClick={(e) => {
          if (mode !== "video" || recording) return;
          // Don't toggle when clicking the compare pill or other overlay buttons.
          const target = e.target as HTMLElement;
          if (target.closest("button")) return;
          togglePlay();
        }}
      >
        <canvas ref={canvasRef} />
        <video ref={videoRef} style={{ display: "none" }} />
        {mode === "idle" && (
          <label className="placeholder">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <div className="dropper">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l4 5h-3v6h-2V8H8l4-5zM5 18h14v2H5z" fill="currentColor" />
              </svg>
              <p>tap to pick a photo or video</p>
            </div>
          </label>
        )}
        {error && <div className="error">{error}</div>}
        {busy && (
          <div className="busy">
            <div className="spinner" />
            <span>{busy}</span>
          </div>
        )}
        {recording && (
          <div className="recording-overlay">
            <div className="rec-dot" />
            <span>
              {formatTime(recordTime)} / {formatTime(duration)}
            </span>
            <div className="progress">
              <div className="bar" style={{ width: `${recordProgress * 100}%` }} />
            </div>
          </div>
        )}
        {mode === "video" && isPaused && !recording && (
          <div className="play-overlay" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          </div>
        )}
        {mode !== "idle" && !recording && (
          <button
            className="compare"
            onPointerDown={() => setShowOriginal(true)}
            onPointerUp={() => setShowOriginal(false)}
            onPointerLeave={() => setShowOriginal(false)}
            aria-label="Hold to compare"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 4v16M5 8l-3 4 3 4M19 8l3 4-3 4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {showOriginal ? "Original" : "Hold"}
          </button>
        )}
      </div>

      {mode === "video" && (
        <div className="scrubber">
          <span className="time">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            disabled={recording || !duration}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
          />
          <span className="time">{formatTime(duration)}</span>
        </div>
      )}

      <section className="panel">
        <label className="file">
          <input
            type="file"
            accept="image/*,video/*"
            disabled={recording}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 5h14v14H5z M9 9l3-3 3 3M12 6v9"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Pick photo or video
          </span>
        </label>

        {mode !== "idle" && (
          <>
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`preset ${matchesPreset(settings, p.settings) ? "active" : ""}`}
                  onClick={() => setSettings(p.settings)}
                  disabled={recording}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="sliders">
              <Slider
                label="Intensity"
                value={settings.intensity}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, intensity: v }))}
                disabled={recording}
              />
              <Slider
                label="Cast removal"
                value={settings.castStrength}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, castStrength: v }))}
                disabled={recording}
              />
              <Slider
                label="Saturation"
                value={settings.saturation}
                min={0}
                max={2}
                step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, saturation: v }))}
                disabled={recording}
              />
            </div>

            <button
              className="adv-toggle"
              onClick={() => setShowAdvanced((v) => !v)}
              disabled={recording}
            >
              <span>Advanced</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className={showAdvanced ? "open" : ""}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="advanced">
                <div className="lut-row">
                  <label className="lut-pick">
                    <input
                      type="file"
                      accept=".cube,application/octet-stream,text/plain"
                      disabled={recording}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLUTFile(f);
                        e.target.value = "";
                      }}
                    />
                    <span>
                      {lutName ? "Replace LUT" : "Load Lightroom .cube LUT"}
                    </span>
                  </label>
                  {lutName && (
                    <button className="lut-clear" onClick={clearLUT} aria-label="Remove LUT">
                      ×
                    </button>
                  )}
                </div>
                {lutName && (
                  <p className="lut-name" title={lutName}>{lutName}</p>
                )}
                <Slider
                  label="LUT mix"
                  value={settings.lutMix}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => setSettings((s) => ({ ...s, lutMix: v }))}
                  disabled={recording || !lutName}
                />
                <Slider
                  label="CLAHE"
                  value={settings.clahe}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => setSettings((s) => ({ ...s, clahe: v }))}
                  disabled={recording}
                />
                <Slider
                  label="Gamma"
                  value={settings.gamma}
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  onChange={(v) => setSettings((s) => ({ ...s, gamma: v }))}
                  disabled={recording}
                />
                <Slider
                  label="Contrast"
                  value={settings.contrast}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => setSettings((s) => ({ ...s, contrast: v }))}
                  disabled={recording}
                />
              </div>
            )}

            <div className="actions">
              <button className="ghost" onClick={reset} disabled={recording}>
                Reset
              </button>
              {mode === "photo" && (
                <button className="primary" onClick={savePhoto}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 19h14M12 4v11M7 10l5 5 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Save photo
                </button>
              )}
              {mode === "video" && !recording && (
                <button className="primary" onClick={recordVideo} disabled={!canRecord}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="6" fill="currentColor" />
                  </svg>
                  {canRecord ? `Save video${duration ? ` (${duration.toFixed(1)}s)` : ""}` : "Recording unsupported"}
                </button>
              )}
              {mode === "video" && recording && (
                <button className="danger" onClick={cancelRecording}>
                  Cancel
                </button>
              )}
            </div>
            {mode === "video" && !canRecord && (
              <p className="note">This browser can't encode video. The latest Safari, Chrome, or Edge will work.</p>
            )}
          </>
        )}
      </section>

      <footer>
        <p>Tap Share → "Add to Home Screen" to install.</p>
      </footer>
    </div>
  );
}

function lerpStats(a: Stats, b: Stats, t: number): Stats {
  const mix = (x: number, y: number) => x * (1 - t) + y * t;
  const mix3 = (
    p: [number, number, number],
    q: [number, number, number],
  ): [number, number, number] => [mix(p[0], q[0]), mix(p[1], q[1]), mix(p[2], q[2])];
  const lutOut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256 * 4; i++) {
    lutOut[i] = Math.round(a.toneLUT[i] * (1 - t) + b.toneLUT[i] * t);
  }
  return {
    mean: mix3(a.mean, b.mean),
    wbGain: mix3(a.wbGain, b.wbGain),
    min: mix3(a.min, b.min),
    max: mix3(a.max, b.max),
    alpha: b.alpha,
    toneLUT: lutOut,
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function matchesPreset(a: Settings, b: Settings, eps = 0.01) {
  return (
    Math.abs(a.intensity - b.intensity) < eps &&
    Math.abs(a.castStrength - b.castStrength) < eps &&
    Math.abs(a.saturation - b.saturation) < eps &&
    Math.abs(a.gamma - b.gamma) < eps &&
    Math.abs(a.contrast - b.contrast) < eps &&
    Math.abs(a.clahe - b.clahe) < eps
  );
}

async function triggerDownload(blob: Blob, filename: string) {
  // iOS Safari's anchor[download] mechanism is unreliable for large video
  // blobs ("Download failed"). Web Share API is the supported path on iOS:
  // it opens the share sheet and the user picks Photos / Files / etc.
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e) {
      // AbortError = user cancelled. Anything else: fall through to the
      // anchor fallback rather than dropping the recording entirely.
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`slider ${disabled ? "is-disabled" : ""}`}>
      <span>
        {label} <em>{value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}
