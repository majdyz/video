import { useEffect, useRef, useState } from "react";
import {
  AdvancedDisclosure,
  attachAudioRouting,
  buildCaptureContext,
  BusyOverlay,
  captureAudioForRecording,
  CompareButton,
  createRecordingSink,
  FilePickerButton,
  Hero,
  Modal,
  PlaceholderDropZone,
  PlayOverlay,
  PresetsRow,
  pickBitrate,
  pickRecorderMime,
  pruneOldRecordings,
  RecordingOverlay,
  type RecordingSink,
  Scrubber,
  shareOrDownload,
  Slider,
  useVideoPlaybackState,
} from "@dive-tools/shared";
import "@dive-tools/shared/theme.css";
import { Renderer, computeStats, type Settings, type Stats } from "./lib/correct";
import { parseCube } from "./lib/lut";
import { AquaFixLogo, AQUA_FIX_BRAND } from "./branding";
import { isFunieReady, loadFunie, FUNIE_SIZE_MB } from "./lib/funie-loader";
import { runFunie } from "./lib/funie-runner";

type Mode = "idle" | "photo" | "video";
type Quality = "classical" | "ai";

// Defaults retuned against bornfree/dive-color-corrector's constants
// (MIN_AVG_RED=60, BLUE_MAGIC_VALUE=1.2, THRESHOLD_RATIO=2000) and the
// Ancuti 2018 fusion-input recipe (gamma-corrected branch ≈ 0.9–0.95).
// Previous defaults blew highlights to cyan-white — these match what
// practitioners use as a Lightroom reef baseline.
const DEFAULT_SETTINGS: Settings = {
  intensity: 0.85,
  castStrength: 0.65,
  saturation: 1.25,
  gamma: 0.92,
  contrast: 0.35,
  clahe: 0.35,
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

const IDENTITY_STATS: Stats = {
  mean: [0.5, 0.5, 0.5],
  wbGain: [1, 1, 1],
  min: [0, 0, 0],
  max: [1, 1, 1],
  alpha: 0,
  toneLUT: IDENTITY_TONE_LUT,
};

// Shallow / Reef / Deep values from the research synthesis above —
// Reef matches bornfree's auto-correction defaults; Shallow scales red
// compensation low (0–10 m, reds mostly intact); Deep pushes near-max
// cast removal (>15 m, reds largely lost per TDI/SDI guidance).
const PRESETS: { label: string; settings: Settings }[] = [
  { label: "Off", settings: OFF_SETTINGS },
  { label: "Shallow", settings: { intensity: 0.55, castStrength: 0.35, saturation: 1.10, gamma: 1.00, contrast: 0.20, clahe: 0.15, lutMix: 1.0 } },
  { label: "Reef", settings: DEFAULT_SETTINGS },
  { label: "Deep", settings: { intensity: 1.00, castStrength: 0.90, saturation: 1.40, gamma: 0.80, contrast: 0.45, clahe: 0.55, lutMix: 1.0 } },
];

type AudioRouting = ReturnType<typeof attachAudioRouting>;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const statsRef = useRef<Stats | null>(null);
  const imageBitmapRef = useRef<ImageBitmap | null>(null);
  const fileNameRef = useRef<string>(AQUA_FIX_BRAND.filenamePrefix);
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
  const [canRecord, setCanRecord] = useState(true);
  const [lutName, setLutName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [quality, setQuality] = useState<Quality>(() => {
    return (localStorage.getItem("aqua-fix:quality") as Quality) || "classical";
  });
  const [funieReady, setFunieReady] = useState(isFunieReady());
  const [funieDownloadPct, setFunieDownloadPct] = useState<number | null>(null);
  const [showFuniePrompt, setShowFuniePrompt] = useState(false);
  const [aiStrength, setAiStrength] = useState(() => {
    const v = parseFloat(localStorage.getItem("aqua-fix:aiStrength") || "1");
    return isNaN(v) ? 1 : Math.min(1, Math.max(0, v));
  });
  const aiStrengthRef = useRef(aiStrength);
  const qualityRef = useRef<Quality>(quality);
  useEffect(() => {
    qualityRef.current = quality;
    localStorage.setItem("aqua-fix:quality", quality);
  }, [quality]);
  useEffect(() => {
    aiStrengthRef.current = aiStrength;
    localStorage.setItem("aqua-fix:aiStrength", aiStrength.toString());
  }, [aiStrength]);

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
    pruneOldRecordings(AQUA_FIX_BRAND.opfsPrefix);

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

  useEffect(() => {
    if (mode !== "photo" || !rendererRef.current || !imageBitmapRef.current) return;
    const bitmap = imageBitmapRef.current;
    statsRef.current = computeStats(bitmap, bitmap.width, bitmap.height, settings.castStrength);
    if (qualityRef.current === "ai" && funieReady && !showOriginal) {
      // Photos: run AI once at full quality, draw the model output directly
      // (no point doing color-transfer for a single still image — full output
      // is more accurate than a 6-float regression).
      runFunie(bitmap, aiStrengthRef.current)
        .then((res) => {
          if (!rendererRef.current) return;
          rendererRef.current.uploadSource(res.canvas, bitmap.width, bitmap.height);
          rendererRef.current.render(IDENTITY_STATS, OFF_SETTINGS);
        })
        .catch((e) => setError("AI inference failed: " + (e instanceof Error ? e.message : String(e))));
      return;
    }
    rendererRef.current.uploadSource(bitmap, bitmap.width, bitmap.height);
    const eff = showOriginal ? OFF_SETTINGS : settings;
    rendererRef.current.render(statsRef.current, eff);
  }, [settings, mode, showOriginal, funieReady, quality, aiStrength]);

  useEffect(() => {
    if (mode !== "video" || !videoRef.current || videoRef.current.readyState < 2) return;
    const v = videoRef.current;
    statsRef.current = computeStats(v, v.videoWidth, v.videoHeight, settings.castStrength);
  }, [settings.castStrength, mode]);

  const aiInflightRef = useRef(false);
  // Cached colour transfer (gain * src + bias) from the most recent FUnIE
  // inference. Refreshes whenever inference completes; until then, we render
  // every video frame at full FPS through this 6-float remap.
  const aiTransferRef = useRef<{ gain: [number, number, number]; bias: [number, number, number] }>({
    gain: [1, 1, 1],
    bias: [0, 0, 0],
  });

  function renderFrameSync(v: HTMLVideoElement) {
    if (!rendererRef.current || !statsRef.current) return;
    if (qualityRef.current === "ai" && funieReady && !showOriginalRef.current) {
      // Always upload the current frame and apply the cached AI transfer at
      // full FPS. The model runs in the background — no render-frame is
      // gated on inference, so playback stays smooth even when inference
      // takes 100+ ms per frame.
      rendererRef.current.uploadSource(v, v.videoWidth, v.videoHeight);
      const t = aiTransferRef.current;
      rendererRef.current.renderAi(t.gain, t.bias);
      // Kick off a fresh inference if none in flight — refreshes the
      // transfer from the current frame's content.
      if (!aiInflightRef.current) {
        aiInflightRef.current = true;
        runFunie(v, aiStrengthRef.current)
          .then((res) => {
            aiTransferRef.current = res.transfer;
          })
          .catch(() => undefined)
          .finally(() => {
            aiInflightRef.current = false;
          });
      }
      return;
    }
    rendererRef.current.uploadSource(v, v.videoWidth, v.videoHeight);
    const eff = showOriginalRef.current ? OFF_SETTINGS : settingsRef.current;
    rendererRef.current.render(statsRef.current, eff);
  }

  const { currentTime, isPaused } = useVideoPlaybackState(videoRef, mode === "video", () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    renderFrameSync(v);
  });

  // Repaint the frozen frame when settings change while paused.
  useEffect(() => {
    if (mode !== "video") return;
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    if (!v.paused) return;
    renderFrameSync(v);
  }, [settings, showOriginal, isPaused, mode, funieReady, quality, aiStrength]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v || recording) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
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
      // ignore
    }
  }

  type VideoWithRVFC = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, metadata: unknown) => void) => number;
  };

  function startPreview() {
    const video = videoRef.current as VideoWithRVFC | null;
    if (!video) return;
    previewActiveRef.current = true;
    lastStatsRefreshRef.current = 0;

    const renderFromVideo = () => {
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      maybeRefreshStats(v);
      renderFrameSync(v);
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

  const pendingFileRef = useRef<File | null>(null);

  async function handleFile(file: File) {
    if (qualityRef.current === "ai" && !funieReady && funieDownloadPct === null) {
      pendingFileRef.current = file;
      setShowFuniePrompt(true);
      return;
    }
    setError(null);
    setRecording(false);
    setRecordProgress(0);
    teardownVideo();
    fileNameRef.current = file.name.replace(/\.[^.]+$/, "");
    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    setBusy(isVideo ? "Loading video…" : "Loading photo…");
    try {
      if (isVideo) await loadVideo(file);
      else await loadImage(file);
    } finally {
      setBusy(null);
    }
  }

  async function confirmFunieDownloadAndProceed() {
    setShowFuniePrompt(false);
    setFunieDownloadPct(0);
    try {
      await loadFunie((pct) => setFunieDownloadPct(pct));
      setFunieReady(true);
      setFunieDownloadPct(null);
      const f = pendingFileRef.current;
      pendingFileRef.current = null;
      if (f) handleFile(f);
    } catch (e) {
      setFunieDownloadPct(null);
      setError("Couldn't load AI model: " + (e instanceof Error ? e.message : String(e)));
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

      video.play().catch(() => undefined);
      statsRef.current = IDENTITY_STATS;
      setDuration(video.duration || 0);
      setMode("video");
      startPreview();

      const computeOnce = () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) return;
        try {
          statsRef.current = computeStats(v, v.videoWidth, v.videoHeight, settingsRef.current.castStrength);
        } catch {
          // ignore
        }
      };
      if (video.readyState >= 2) computeOnce();
      else {
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
        shareOrDownload(blob, `${fileNameRef.current}-aqua.jpg`).catch(() => undefined);
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
    video.muted = false;
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
    if (!audioRoutingRef.current) audioRoutingRef.current = attachAudioRouting(video);
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
    const sink = await createRecordingSink(AQUA_FIX_BRAND.opfsPrefix);
    sinkRef.current = sink;
    let writeQueue: Promise<void> = Promise.resolve();
    recorder.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      writeQueue = writeQueue.then(() => sink.write(e.data)).catch(() => undefined);
    };
    recorder.onerror = (e: Event) => {
      const evt = e as Event & { error?: unknown };
      const msg = evt.error instanceof Error ? evt.error.message : "encoder error";
      setError("Recording error: " + msg);
    };

    lastStatsRefreshRef.current = 0;
    const renderAndPush = () => {
      if (!recordingFlagRef.current || !videoRef.current) return;
      const v = videoRef.current;
      maybeRefreshStats(v);
      renderFrameSync(v);
      setRecordTime(v.currentTime);
      if (v.duration) setRecordProgress(v.currentTime / v.duration);
    };

    const loop = () => {
      if (!recordingFlagRef.current) return;
      renderAndPush();
      if (!video.ended && recordingFlagRef.current) requestAnimationFrame(loop);
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
            await shareOrDownload(blob, `${fileNameRef.current}-aqua.${candidate.ext}`);
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

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />

      <Hero
        logo={<AquaFixLogo />}
        name={AQUA_FIX_BRAND.name}
        tagline={AQUA_FIX_BRAND.tagline}
        onInfoClick={() => setShowInfo(true)}
      />
      <Modal
        open={showFuniePrompt}
        onClose={() => {
          setShowFuniePrompt(false);
          pendingFileRef.current = null;
        }}
        title={`Download AI model (~${FUNIE_SIZE_MB.toFixed(0)} MB)`}
      >
        <p>
          AI mode uses{" "}
          <a href="https://arxiv.org/abs/1903.09766" target="_blank" rel="noopener noreferrer">
            FUnIE-GAN
          </a>{" "}
          (Islam et al., RAL 2020) — a U-Net trained end-to-end on the EUVP
          underwater dataset. It learns the inverse of the underwater
          attenuation directly from data, with no per-image stats to tune. On
          most footage it produces noticeably more natural colour than the
          classical CLAHE + Shades-of-Gray pipeline, especially on deep / very
          green water.
        </p>
        <p>
          The model is a one-time <b>~{FUNIE_SIZE_MB.toFixed(0)} MB</b>{" "}
          download from this site, then it's cached on your device — subsequent
          uses are instant and offline. Inference runs locally on WebGPU when
          available, otherwise WASM. Output is fixed at 256×256 internally and
          upscaled.
        </p>
        <div className="actions">
          <button
            className="ghost"
            onClick={() => {
              setShowFuniePrompt(false);
              setQuality("classical");
              const f = pendingFileRef.current;
              pendingFileRef.current = null;
              if (f) handleFile(f);
            }}
          >
            Use Classical instead
          </button>
          <button className="primary" onClick={confirmFunieDownloadAndProceed}>
            Download &amp; continue
          </button>
        </div>
      </Modal>
      <Modal
        open={funieDownloadPct !== null}
        onClose={() => undefined}
        title="Downloading AI model…"
      >
        <p>This is a one-time download. Subsequent uses are instant.</p>
        <div className="progress" style={{ height: 8, marginTop: 8 }}>
          <div className="bar" style={{ width: `${(funieDownloadPct || 0) * 100}%` }} />
        </div>
        <p style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}>
          {Math.round((funieDownloadPct || 0) * 100)}%
        </p>
      </Modal>
      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How Aqua Fix works">
        <h4>Pipeline</h4>
        <p>
          Each frame runs through a single WebGL fragment shader on-device:
        </p>
        <ul>
          <li>
            <b>Channel compensation</b> — lift the absorbed red and blue
            channels using the green channel as a guide before any other
            step. Prevents the purple cast naive white-balance produces on
            red-deficient images.
          </li>
          <li>
            <b>Shades-of-Gray white balance</b> — derive per-channel gains
            from Minkowski p-norms (p=6) of the compensated image, clamped
            to a safe range so deep blue scenes can be lifted without
            blowout.
          </li>
          <li>
            <b>Percentile stretch</b> — bound to <code>[0, 1]</code> with a
            minimum span floor so flat scenes don't get over-amplified.
          </li>
          <li>
            <b>CLAHE-style luminance equalisation</b> — histogram of the
            BT.709 luma, clipped at 3% per bin, redistributed; the resulting
            tone LUT rescales RGB by the <code>L_out / L_in</code> ratio so
            colour balance is preserved while local contrast comes back.
          </li>
          <li>
            <b>Optional Lightroom .cube LUT</b> — packed as a 2D-tiled 3D
            texture, trilinear lookup in the shader.
          </li>
          <li>
            <b>Adaptive tracking</b> — stats are re-sampled every ~1s and
            EMA-blended at 15% so cast changes through a clip
            (descent, scene cuts) are tracked without flicker.
          </li>
        </ul>
        <h4>Papers</h4>
        <ul>
          <li>
            Ancuti, Ancuti, De Vleeschouwer, Bekaert (2018) —{" "}
            <a
              href="https://ieeexplore.ieee.org/document/8059845"
              target="_blank"
              rel="noopener noreferrer"
            >
              Color Balance and Fusion for Underwater Image Enhancement (IEEE TIP)
            </a>
          </li>
          <li>
            Finlayson & Trezzi (2004) —{" "}
            <a
              href="https://ivrl.epfl.ch/wp-content/uploads/2018/08/Finlayson_2004.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Shades of Gray and Colour Constancy (CIC)
            </a>
          </li>
          <li>
            Pizer et al. (1987) — Adaptive Histogram Equalization and its
            Variations (CLAHE)
          </li>
          <li>
            Reference impl that informed defaults:{" "}
            <a
              href="https://github.com/bornfree/dive-color-corrector"
              target="_blank"
              rel="noopener noreferrer"
            >
              bornfree/dive-color-corrector
            </a>
          </li>
        </ul>
        <h4>Source</h4>
        <p>
          <a
            href="https://github.com/majdyz/video"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/majdyz/video
          </a>{" "}
          — both apps live in the same repo.
        </p>
      </Modal>

      <div
        className={`stage ${mode === "idle" ? "is-empty" : ""}`}
        onClick={(e) => {
          if (mode !== "video" || recording) return;
          if ((e.target as HTMLElement).closest("button")) return;
          togglePlay();
        }}
      >
        <canvas ref={canvasRef} />
        <video ref={videoRef} style={{ display: "none" }} />
        {mode === "idle" && <PlaceholderDropZone accept="image/*,video/*" onPick={handleFile} />}
        {error && <div className="error">{error}</div>}
        {busy && <BusyOverlay message={busy} />}
        {recording && (
          <RecordingOverlay currentTime={recordTime} duration={duration} progress={recordProgress} />
        )}
        {mode === "video" && isPaused && !recording && <PlayOverlay />}
        {mode !== "idle" && !recording && (
          <CompareButton
            active={showOriginal}
            onPress={() => setShowOriginal(true)}
            onRelease={() => setShowOriginal(false)}
          />
        )}
      </div>

      {mode === "video" && (
        <Scrubber
          currentTime={currentTime}
          duration={duration}
          disabled={recording}
          onSeek={seekTo}
        />
      )}

      <section className="panel">
        <FilePickerButton accept="image/*,video/*" disabled={recording} onPick={handleFile}>
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
        </FilePickerButton>

        {mode !== "idle" && (
          <>
            <div className="model-picker">
              <button
                type="button"
                className={`model-card${quality === "classical" ? " active" : ""}`}
                disabled={recording}
                onClick={() => setQuality("classical")}
                aria-pressed={quality === "classical"}
              >
                {quality === "classical" && <span className="model-check">ON</span>}
                <span className="model-title">Classical</span>
                <span className="model-sub">CLAHE + Shades-of-Gray, runs on every device.</span>
              </button>
              <button
                type="button"
                className={`model-card${quality === "ai" ? " active" : ""}`}
                disabled={recording}
                onClick={() => {
                  setQuality("ai");
                  if (!funieReady && funieDownloadPct === null) {
                    setShowFuniePrompt(true);
                  }
                }}
                aria-pressed={quality === "ai"}
              >
                {quality === "ai" && <span className="model-check">ON</span>}
                <span className="model-title">
                  AI
                  {!funieReady && <span className="model-badge">{FUNIE_SIZE_MB.toFixed(0)} MB</span>}
                </span>
                <span className="model-sub">
                  {funieReady
                    ? "FUnIE-GAN, on-device. More natural color, slower."
                    : "FUnIE-GAN, on-device. One-time download."}
                </span>
              </button>
            </div>

            {quality === "classical" && (
              <>
                <PresetsRow
                  presets={PRESETS}
                  current={settings}
                  matches={matchesPreset}
                  onSelect={setSettings}
                  disabled={recording}
                />

                <div className="sliders">
                  <Slider label="Intensity" value={settings.intensity} min={0} max={1} step={0.01}
                    onChange={(v) => setSettings((s) => ({ ...s, intensity: v }))} disabled={recording} />
                  <Slider label="Cast removal" value={settings.castStrength} min={0} max={1} step={0.01}
                    onChange={(v) => setSettings((s) => ({ ...s, castStrength: v }))} disabled={recording} />
                  <Slider label="Saturation" value={settings.saturation} min={0} max={2} step={0.01}
                    onChange={(v) => setSettings((s) => ({ ...s, saturation: v }))} disabled={recording} />
                </div>
              </>
            )}

            {quality === "ai" && !funieReady && (
              <p className="note">
                AI model not loaded yet — pick a file to start the {FUNIE_SIZE_MB.toFixed(0)} MB
                download, or switch back to Classical.
              </p>
            )}
            {quality === "ai" && funieReady && (
              <div className="sliders">
                <Slider label="Strength" value={aiStrength} min={0} max={1} step={0.01}
                  onChange={setAiStrength} disabled={recording} />
              </div>
            )}

            {quality === "classical" && (
            <AdvancedDisclosure disabled={recording}>
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
                  <span>{lutName ? "Replace LUT" : "Load Lightroom .cube LUT"}</span>
                </label>
                {lutName && (
                  <button className="lut-clear" onClick={clearLUT} aria-label="Remove LUT">×</button>
                )}
              </div>
              {lutName && <p className="lut-name" title={lutName}>{lutName}</p>}
              <Slider label="LUT mix" value={settings.lutMix} min={0} max={1} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, lutMix: v }))} disabled={recording || !lutName} />
              <Slider label="CLAHE" value={settings.clahe} min={0} max={1} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, clahe: v }))} disabled={recording} />
              <Slider label="Gamma" value={settings.gamma} min={0.5} max={1.5} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, gamma: v }))} disabled={recording} />
              <Slider label="Contrast" value={settings.contrast} min={0} max={1} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, contrast: v }))} disabled={recording} />
            </AdvancedDisclosure>
            )}

            <div className="actions">
              <button className="ghost" onClick={() => setSettings(DEFAULT_SETTINGS)} disabled={recording}>
                Reset
              </button>
              {mode === "photo" && (
                <button className="primary" onClick={savePhoto}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 19h14M12 4v11M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2"
                      fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
                <button className="danger" onClick={cancelRecording}>Cancel</button>
              )}
            </div>
            {mode === "video" && !canRecord && (
              <p className="note">This browser can't encode video. The latest Safari, Chrome, or Edge will work.</p>
            )}
          </>
        )}
      </section>

      <footer>
        <p>
          Companion: <a href="../motion-fix/" style={{ color: "#ff8b4a" }}>Motion Fix</a> · Tap Share → "Add to Home Screen" to install.
        </p>
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
