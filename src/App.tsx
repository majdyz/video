import { useEffect, useRef, useState } from "react";
import { Renderer, computeStats, type Settings, type Stats } from "./lib/correct";
import {
  attachAudioRouting,
  buildCaptureContext,
  captureAudioForRecording,
  createRecordingSink,
  pickBitrate,
  pickRecorderMime,
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
  lutMix: 1.0,
};

const OFF_SETTINGS: Settings = {
  intensity: 0,
  castStrength: 0,
  saturation: 1,
  gamma: 1,
  contrast: 0,
  lutMix: 0,
};

const PRESETS: { label: string; settings: Settings }[] = [
  { label: "Off", settings: OFF_SETTINGS },
  { label: "Shallow", settings: { intensity: 0.85, castStrength: 0.55, saturation: 1.1, gamma: 0.96, contrast: 0.18, lutMix: 1.0 } },
  { label: "Reef", settings: DEFAULT_SETTINGS },
  { label: "Deep", settings: { intensity: 1.0, castStrength: 1.0, saturation: 1.3, gamma: 0.86, contrast: 0.4, lutMix: 1.0 } },
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

  const [mode, setMode] = useState<Mode>("idle");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [recordTime, setRecordTime] = useState(0);
  const [duration, setDuration] = useState(0);
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
    try {
      rendererRef.current = new Renderer(canvasRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setCanRecord(pickRecorderMime() !== null);
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
    const sampler = document.createElement("canvas");
    sampler.width = v.videoWidth;
    sampler.height = v.videoHeight;
    sampler.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0);
    statsRef.current = computeStats(sampler, sampler.width, sampler.height, settings.castStrength);
  }, [settings.castStrength, mode]);

  function startPreview() {
    const video = videoRef.current as VideoWithRVFC | null;
    if (!video) return;
    previewActiveRef.current = true;

    const renderFromVideo = () => {
      if (!rendererRef.current || !statsRef.current || !videoRef.current) return;
      const v = videoRef.current;
      if (v.readyState < 2) return;
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

    try {
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          video.removeEventListener("loadeddata", onLoaded);
          video.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener("loadeddata", onLoaded);
          video.removeEventListener("error", onError);
          reject(new Error("Could not decode video"));
        };
        video.addEventListener("loadeddata", onLoaded);
        video.addEventListener("error", onError);
      });

      // Web Audio routing must be attached before play() so the source node
      // captures the audio graph. createMediaElementSource only works once
      // per element, so we keep the routing across file changes.
      if (!audioRoutingRef.current) {
        audioRoutingRef.current = attachAudioRouting(video);
      }

      await video.play().catch(() => undefined);

      const sampler = document.createElement("canvas");
      sampler.width = video.videoWidth;
      sampler.height = video.videoHeight;
      const sctx = sampler.getContext("2d", { willReadFrequently: true })!;
      sctx.drawImage(video, 0, 0);
      statsRef.current = computeStats(sampler, sampler.width, sampler.height, settingsRef.current.castStrength);

      if (canvasRef.current && rendererRef.current) {
        rendererRef.current.uploadSource(video, video.videoWidth, video.videoHeight);
        rendererRef.current.render(statsRef.current, settingsRef.current);
      }

      setDuration(video.duration || 0);
      setMode("video");
      startPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function savePhoto() {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        triggerDownload(blob, `${fileNameRef.current}-aqua.jpg`);
      },
      "image/jpeg",
      0.95,
    );
  }

  async function recordVideo() {
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
    try {
      video.currentTime = 0;
    } catch {
      // ignore
    }

    if (rendererRef.current) {
      rendererRef.current.uploadSource(video, video.videoWidth, video.videoHeight);
      rendererRef.current.render(statsRef.current, settingsRef.current);
    }

    const captureCtx = buildCaptureContext(canvas);
    const audioCapture = await captureAudioForRecording(audioRoutingRef.current);
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

    const renderAndPush = () => {
      if (!recordingFlagRef.current || !rendererRef.current || !statsRef.current || !videoRef.current) return;
      const v = videoRef.current;
      rendererRef.current.uploadSource(v, v.videoWidth, v.videoHeight);
      const eff = showOriginalRef.current ? OFF_SETTINGS : settingsRef.current;
      rendererRef.current.render(statsRef.current, eff);
      captureCtx.pushFrame();
      setRecordTime(v.currentTime);
      if (v.duration) setRecordProgress(v.currentTime / v.duration);
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      const onFrame = () => {
        if (!recordingFlagRef.current) return;
        renderAndPush();
        const v = videoRef.current as VideoWithRVFC | null;
        if (v && recordingFlagRef.current && !v.ended) {
          v.requestVideoFrameCallback?.(onFrame);
        }
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      const loop = () => {
        if (!recordingFlagRef.current) return;
        renderAndPush();
        if (!video.ended && recordingFlagRef.current) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    const stopAndDownload = () =>
      new Promise<void>((resolve) => {
        recorder.onstop = async () => {
          audioCapture.cleanup();
          audioCleanupRef.current = null;
          try {
            await writeQueue;
            const blob = await sink.finalize(candidate.mime || "video/webm");
            triggerDownload(blob, `${fileNameRef.current}-aqua.${candidate.ext}`);
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
      setRecording(false);
      setRecordProgress(0);
      setRecordTime(0);
      video.loop = true;
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

    setRecording(false);
    setRecordProgress(0);
    setRecordTime(0);

    if (v) {
      v.loop = true;
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
            <svg viewBox="0 0 32 32">
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#5fd0ff" />
                  <stop offset="1" stopColor="#2bb89e" />
                </linearGradient>
              </defs>
              <path d="M16 4 C 22 12, 22 20, 16 28 C 10 20, 10 12, 16 4 Z" fill="url(#lg)" />
            </svg>
          </div>
          <div>
            <h1>Aqua Fix</h1>
            <p className="tag">underwater color in your pocket</p>
          </div>
        </div>
      </header>

      <div className={`stage ${mode === "idle" ? "is-empty" : ""}`}>
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
    Math.abs(a.contrast - b.contrast) < eps
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
