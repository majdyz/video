import { useEffect, useMemo, useRef, useState } from "react";
import {
  attachAudioRouting,
  bitrateFromSource,
  buildCaptureContext,
  BusyOverlay,
  captureAudioForRecording,
  CompareWipe,
  createRecordingSink,
  FilePickerButton,
  Hero,
  Modal,
  PlaceholderDropZone,
  PlayOverlay,
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
import "./motion-theme.css";
import { MotionFixLogo, MOTION_FIX_BRAND } from "./branding";
import {
  analyzeVideo,
  type AnalysisResult,
  frameIndexForTime,
  residualTransform,
  smoothPath,
} from "./lib/stabilizer";
import { analyzeVideoOpenCV } from "./lib/stabilizer-opencv";
import { isOpenCVCached, isOpenCVReady, loadOpenCV, OPENCV_SIZE_MB } from "./lib/opencv-loader";

type Mode = "idle" | "video";
type AudioRouting = ReturnType<typeof attachAudioRouting>;
type SmoothPath = ReturnType<typeof smoothPath>;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileNameRef = useRef<string>(MOTION_FIX_BRAND.filenamePrefix);
  // Source-video properties detected on load. Recording will use these to
  // match the input — same fps, same bitrate ceiling, same resolution.
  const sourceFpsRef = useRef<number>(60);
  const sourceBitrateRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const previewActiveRef = useRef(false);
  const recordingFlagRef = useRef(false);
  const audioRoutingRef = useRef<AudioRouting>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const onEndedRef = useRef<(() => void) | null>(null);
  const sinkRef = useRef<RecordingSink | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const analysisRef = useRef<AnalysisResult | null>(null);
  const smoothRef = useRef<SmoothPath | null>(null);
  const cropRef = useRef(0.1);
  // Compare wipe (0..1). Stored as a ref so the per-frame draw picks
  // up the live value without depending on React commits. compareActiveRef
  // gates whether the wipe path is taken at all.
  const compareActiveRef = useRef(false);
  const compareSplitRef = useRef(0.5);

  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [smoothing, setSmoothing] = useState(0.6);
  const [crop, setCrop] = useState(0.1);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [recordTime, setRecordTime] = useState(0);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [canRecord, setCanRecord] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplit, setCompareSplit] = useState(0.5);
  useEffect(() => {
    compareActiveRef.current = compareActive;
  }, [compareActive]);
  useEffect(() => {
    compareSplitRef.current = compareSplit;
  }, [compareSplit]);
  // Quality is the user-visible name. Internally: "fast" = built-in
  // block matcher, "better" = OpenCV.js (lazy-loaded ~9 MB script).
  // No localStorage persistence — Better requires an opt-in click each
  // session, same pattern as aqua-fix's AI mode.
  const [quality, setQuality] = useState<"fast" | "better">("fast");
  const [opencvReady, setOpencvReady] = useState(isOpenCVReady());
  const [opencvDownloadPct, setOpencvDownloadPct] = useState<number | null>(null);
  const [showCvPrompt, setShowCvPrompt] = useState(false);
  // True once we've confirmed the script is in Cache API. Probed once
  // on mount; if true, clicking Better skips the consent dialog and
  // loads silently.
  const [opencvCached, setOpencvCached] = useState(false);
  useEffect(() => {
    isOpenCVCached().then(setOpencvCached).catch(() => undefined);
  }, []);

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useEffect(() => {
    const a = analysisRef.current;
    if (!a) return;
    const v = videoRef.current;
    const w = v?.videoWidth ?? 1920;
    const h = v?.videoHeight ?? 1080;
    smoothRef.current = smoothPath(a, smoothing, crop, w, h);
  }, [smoothing, crop, analysisReady]);

  useEffect(() => {
    setCanRecord(pickRecorderMime() !== null);
    pruneOldRecordings(MOTION_FIX_BRAND.opfsPrefix);
  }, []);

  const { currentTime, isPaused } = useVideoPlaybackState(videoRef, mode === "video", () => {
    drawStabilizedFrame();
  });

  useEffect(() => {
    if (mode !== "video") return;
    drawStabilizedFrame();
  }, [crop, smoothing, mode, compareActive, compareSplit]);

  function drawStabilizedFrame() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    if (v.readyState < 2) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (c.width !== v.videoWidth) c.width = v.videoWidth;
    if (c.height !== v.videoHeight) c.height = v.videoHeight;
    ctx.clearRect(0, 0, c.width, c.height);

    const splitActive = compareActiveRef.current;
    const split = compareSplitRef.current;
    if (splitActive) {
      // Left of split: original passthrough, no transform.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, c.width * split, c.height);
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      ctx.restore();
      // Right of split: stabilised draw.
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.width * split, 0, c.width * (1 - split), c.height);
      ctx.clip();
      applyStabilizedTransform(ctx, c.width, c.height, v.currentTime);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.restore();
      return;
    }

    applyStabilizedTransform(ctx, c.width, c.height, v.currentTime);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function applyStabilizedTransform(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
  ) {
    const a = analysisRef.current;
    const sm = smoothRef.current;
    const cropAmt = cropRef.current;
    const effCrop = Math.max(0.015, cropAmt);
    const maxScaleUp = 1 / (1 - 2 * effCrop);

    if (!a || !sm) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }

    const idx = frameIndexForTime(a, time);
    const raw = residualTransform(a, sm, idx);
    // Use the precomputed smoothed zoom for this frame. The smoother already
    // looked across the whole clip and chose a zoom curve that pre-zooms
    // before shaky segments and gradually zooms back out for steady ones —
    // no jerks, no per-frame surprises.
    const targetZoom = sm.zoom[idx] ?? 1;
    const scaleUp = Math.max(1, Math.min(targetZoom, maxScaleUp));
    // If the residual still wouldn't fit in the chosen zoom (e.g. user
    // capped max-crop below what this frame really needs), lerp residual
    // toward identity until it does.
    const t = clampResidualToCanvas(raw, scaleUp, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    ctx.setTransform(
      scaleUp * t.a,
      scaleUp * t.b,
      -scaleUp * t.b,
      scaleUp * t.a,
      scaleUp * t.tx + cx * (1 - scaleUp),
      scaleUp * t.ty + cy * (1 - scaleUp),
    );
  }

  // Compute the smallest scale-up that, combined with this residual, would
  // make the source frame cover the canvas completely. Inverse of the full
  // transform must map every canvas point into the source rectangle.
  function requiredScaleUp(t: { a: number; b: number; tx: number; ty: number }, w: number, h: number): number {
    const a = t.a;
    const b = t.b;
    const r = a * a + b * b;
    if (r < 1e-9) return 1e6;
    const aInv = a / r;
    const bInv = b / r;
    const txInv = -(a * t.tx + b * t.ty) / r;
    const tyInv = (b * t.tx - a * t.ty) / r;
    const halfW = w * 0.5;
    const halfH = h * 0.5;
    let s = 1;
    for (const cx of [-halfW, halfW]) {
      for (const cy of [-halfH, halfH]) {
        const numX = aInv * cx + bInv * cy;
        const numY = -bInv * cx + aInv * cy;
        const upperX = halfW - txInv;
        const lowerX = -halfW - txInv;
        const upperY = halfH - tyInv;
        const lowerY = -halfH - tyInv;
        if (numX > 0) {
          if (upperX <= 0) return 1e6;
          s = Math.max(s, numX / upperX);
        } else if (numX < 0) {
          if (lowerX >= 0) return 1e6;
          s = Math.max(s, numX / lowerX);
        }
        if (numY > 0) {
          if (upperY <= 0) return 1e6;
          s = Math.max(s, numY / upperY);
        } else if (numY < 0) {
          if (lowerY >= 0) return 1e6;
          s = Math.max(s, numY / lowerY);
        }
      }
    }
    return s;
  }

  // If the residual needs more zoom than the user's crop allows, lerp it
  // back toward identity (the unstabilised source frame) until it fits.
  // Binary search the lerp factor — requiredScaleUp is monotonic in lerp.
  function clampResidualToCanvas(
    t: { a: number; b: number; tx: number; ty: number },
    scaleUp: number,
    w: number,
    h: number,
  ): { a: number; b: number; tx: number; ty: number } {
    if (requiredScaleUp(t, w, h) <= scaleUp + 1e-6) return t;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      const tk = {
        a: 1 + (t.a - 1) * mid,
        b: t.b * mid,
        tx: t.tx * mid,
        ty: t.ty * mid,
      };
      if (requiredScaleUp(tk, w, h) <= scaleUp + 1e-6) lo = mid;
      else hi = mid;
    }
    return {
      a: 1 + (t.a - 1) * lo,
      b: t.b * lo,
      tx: t.tx * lo,
      ty: t.ty * lo,
    };
  }

  type VideoWithRVFC = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };

  function startPreview() {
    const video = videoRef.current as VideoWithRVFC | null;
    if (!video) return;
    previewActiveRef.current = true;
    const useRvfc = typeof video.requestVideoFrameCallback === "function";
    if (useRvfc) {
      const onFrame = () => {
        if (!previewActiveRef.current || recordingFlagRef.current) return;
        drawStabilizedFrame();
        const v = videoRef.current as VideoWithRVFC | null;
        if (v && previewActiveRef.current && !recordingFlagRef.current) {
          v.requestVideoFrameCallback?.(onFrame);
        }
      };
      video.requestVideoFrameCallback?.(onFrame);
    } else {
      const loop = () => {
        if (!previewActiveRef.current || recordingFlagRef.current) return;
        drawStabilizedFrame();
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
    setAnalysisReady(false);
    analysisRef.current = null;
    smoothRef.current = null;
    teardownVideo();
    fileNameRef.current = file.name.replace(/\.[^.]+$/, "");
    setBusy("Loading video…");
    try {
      const v = videoRef.current;
      if (!v) return;
      v.src = URL.createObjectURL(file);
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = "auto";
      if (v.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onMeta = () => {
            v.removeEventListener("loadedmetadata", onMeta);
            v.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = () => {
            v.removeEventListener("loadedmetadata", onMeta);
            v.removeEventListener("error", onErr);
            reject(new Error("Could not decode video"));
          };
          v.addEventListener("loadedmetadata", onMeta);
          v.addEventListener("error", onErr);
        });
      }
      setDuration(v.duration || 0);
      setMode("video");

      setBusy("Analyzing motion 0%");
      const analyzer = quality === "better" && opencvReady ? analyzeVideoOpenCV : analyzeVideo;
      const result = await analyzer(v, (p) => {
        setBusy(`Analyzing motion ${Math.floor(p * 100)}%`);
      });
      analysisRef.current = result;
      smoothRef.current = smoothPath(result, smoothing, crop, v.videoWidth, v.videoHeight);
      setAnalysisReady(true);

      // The analyser already counts frames over the duration — that's the
      // most accurate fps reading we have, so use it directly. Bitrate
      // comes from file size / duration to match the source's per-pixel
      // budget.
      sourceFpsRef.current = result.frameRate || 60;
      sourceBitrateRef.current = bitrateFromSource(file.size, v.duration || 0);

      v.play().catch(() => undefined);
      startPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

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
    if (!canvas || !video || !analysisRef.current) return;
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

    drawStabilizedFrame();

    const fps = sourceFpsRef.current;
    const captureCtx = buildCaptureContext(canvas, fps);
    if (!audioRoutingRef.current) audioRoutingRef.current = attachAudioRouting(video);
    const audioCapture = captureAudioForRecording(audioRoutingRef.current);
    const stream = new MediaStream([
      ...captureCtx.videoStream.getVideoTracks(),
      ...audioCapture.tracks,
    ]);
    const bitrate = sourceBitrateRef.current
      ?? pickBitrate(video.videoWidth, video.videoHeight, fps);

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
    const sink = await createRecordingSink(MOTION_FIX_BRAND.opfsPrefix);
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

    const renderAndPush = () => {
      if (!recordingFlagRef.current || !videoRef.current) return;
      const v = videoRef.current;
      drawStabilizedFrame();
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
            await shareOrDownload(blob, `${fileNameRef.current}-stabilized.${candidate.ext}`);
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

  const saveDisabled = useMemo(
    () => !analysisReady || recording || !canRecord,
    [analysisReady, recording, canRecord],
  );

  async function confirmDownloadAndProceed() {
    setShowCvPrompt(false);
    setOpencvDownloadPct(0);
    try {
      await loadOpenCV((pct) => setOpencvDownloadPct(pct));
      setOpencvReady(true);
      setOpencvCached(true);
      setOpencvDownloadPct(null);
      setQuality("better");
    } catch (e) {
      setOpencvDownloadPct(null);
      setError("Couldn't load OpenCV: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  // Cached path: load silently (no dialog, no progress bar) and switch
  // straight to Better. Decoding ~9 MB from cache + the ort runtime
  // initialise takes a fraction of a second.
  async function loadOpenCVFromCacheAndSwitch() {
    try {
      await loadOpenCV();
      setOpencvReady(true);
      setQuality("better");
    } catch (e) {
      setError("Couldn't load OpenCV: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="app motion-app">
      <div className="bg" aria-hidden="true" />

      <Hero
        logo={<MotionFixLogo />}
        name={MOTION_FIX_BRAND.name}
        tagline={MOTION_FIX_BRAND.tagline}
        onInfoClick={() => setShowInfo(true)}
      />
      <Modal
        open={showCvPrompt}
        onClose={() => setShowCvPrompt(false)}
        title={`Download Better-quality tracker (~${OPENCV_SIZE_MB.toFixed(0)} MB)`}
      >
        <p>
          The Better quality mode uses{" "}
          <a href="https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html" target="_blank" rel="noopener noreferrer">
            OpenCV.js
          </a>{" "}
          for proper feature tracking (Shi-Tomasi corners + pyramidal Lucas-Kanade
          optical flow + RANSAC similarity fit). It produces noticeably more stable
          results on hand-held footage with moving content (fish, particles, caustics)
          than the built-in block-matching tracker — much closer to what
          Premiere/After Effects do.
        </p>
        <p>
          The runtime is a one-time <b>~{OPENCV_SIZE_MB.toFixed(0)} MB</b> download
          from a CDN, then it's cached on your device — subsequent uses are instant
          and offline. First analysis after download is slower than Fast mode (more
          compute per frame), but the result is markedly better.
        </p>
        <div className="actions">
          <button
            className="ghost"
            onClick={() => {
              setShowCvPrompt(false);
              setQuality("fast");
            }}
          >
            Use Fast instead
          </button>
          <button className="primary" onClick={confirmDownloadAndProceed}>
            Download &amp; continue
          </button>
        </div>
      </Modal>
      <Modal
        open={opencvDownloadPct !== null}
        onClose={() => undefined}
        title="Downloading OpenCV.js…"
      >
        <p>This is a one-time download. Subsequent uses are instant.</p>
        <div className="progress" style={{ height: 8, marginTop: 8 }}>
          <div className="bar" style={{ width: `${(opencvDownloadPct || 0) * 100}%` }} />
        </div>
        <p style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}>
          {Math.round((opencvDownloadPct || 0) * 100)}%
        </p>
      </Modal>
      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How Motion Fix works">
        <h4>Pipeline</h4>
        <ul>
          <li>
            <b>Analysis pass</b> — play the video at <code>2×</code> muted,
            capture each decoded frame via{" "}
            <code>requestVideoFrameCallback</code>, downsample to a 128×72
            grayscale thumbnail.
          </li>
          <li>
            <b>Multi-point tracking</b> — a 4×3 grid of feature centres is
            tracked between consecutive thumbnails using small patch
            block-matching with sub-pixel parabolic refinement. Low-texture
            patches are dropped via a confidence check.
          </li>
          <li>
            <b>Similarity transform</b> — for each frame pair, fit a 2D
            similarity (translation + rotation + uniform scale) to the
            inlier matches via closed-form least-squares (Umeyama 1991);
            outliers above 2.5× the median residual are trimmed and the fit
            is refined.
          </li>
          <li>
            <b>Cumulative path</b> — compose per-frame transforms into the
            absolute camera path: <code>(a, b, tx, ty)</code> per frame.
          </li>
          <li>
            <b>L1-optimal path smoothing</b> — median pre-filter, then ADMM
            optimisation of{" "}
            <code>min ‖p − c‖² + λ₁‖D¹p‖₁ + λ₂‖D²p‖₁</code> per path
            component. The L1 penalties on first and second differences
            produce piecewise-linear paths with smooth accelerations
            (hold-still / linear-pan / smooth-accel segments) — the same
            class of "professional camera move" Grundmann-Kwatra-Essa
            target. The <code>‖p − c‖∞ ≤ box</code> constraint keeps the
            virtual path within the crop budget. ADMM solves the
            pentadiagonal system in O(n) per iteration via banded
            Cholesky (LDLᵀ); 80 iterations are plenty for paths of
            thousands of frames.
          </li>
          <li>
            <b>Render</b> — residual{" "}
            <code>= smoothed ∘ raw⁻¹</code> applied as a 2D{" "}
            <code>setTransform()</code> with a uniform scale-up of{" "}
            <code>1 / (1 − 2·crop)</code> so the rotated/translated edges
            don't reveal the canvas background.
          </li>
        </ul>
        <h4>Caveats</h4>
        <p>
          We use the L1 first- and second-difference penalty (jitter +
          acceleration). Grundmann's full formulation includes a third
          derivative (jerk) and explicit constant/linear/parabolic regime
          weights via linear programming — that's the natural next
          upgrade. Rolling-shutter wobble (CMOS skew on whip-pans) needs
          per-row correction and is out of scope.
        </p>
        <h4>Papers</h4>
        <ul>
          <li>
            Grundmann, Kwatra, Essa (2011) —{" "}
            <a
              href="https://research.google.com/pubs/archive/37041.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Auto-Directed Video Stabilization with Robust L1 Optimal Camera
              Paths (CVPR)
            </a>
            . Reference for production-grade stabilisation.
          </li>
          <li>
            Umeyama (1991) —{" "}
            <a
              href="https://web.stanford.edu/class/cs273/refs/umeyama.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Least-Squares Estimation of Transformation Parameters Between
              Two Point Patterns (IEEE TPAMI)
            </a>
            . The closed-form similarity-transform fit used per frame.
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
          </a>
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
        {mode === "idle" && (
          <PlaceholderDropZone
            accept="video/*"
            onPick={handleFile}
            message="tap to pick a video"
          />
        )}
        {error && <div className="error">{error}</div>}
        {busy && <BusyOverlay message={busy} />}
        {recording && (
          <RecordingOverlay
            currentTime={recordTime}
            duration={duration}
            progress={recordProgress}
          />
        )}
        {mode === "video" && isPaused && !recording && <PlayOverlay />}
        {mode === "video" && analysisReady && !recording && (
          <CompareWipe
            active={compareActive}
            value={compareSplit}
            onChange={setCompareSplit}
            onToggle={() => setCompareActive((a) => !a)}
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
        <FilePickerButton accept="video/*" disabled={recording} onPick={handleFile}>
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
          Pick a video
        </FilePickerButton>

        {mode === "video" && (
          <>
            <div className="sliders">
              <Slider
                label="Smoothing"
                value={smoothing}
                min={0}
                max={1}
                step={0.01}
                onChange={setSmoothing}
                disabled={recording || !analysisReady}
              />
              <Slider
                label="Max crop"
                value={crop}
                min={0}
                max={0.3}
                step={0.005}
                onChange={setCrop}
                disabled={recording}
              />
            </div>

            <div className="quality-row">
              <span className="quality-label">Quality</span>
              <div className="quality-segment">
                <button
                  className={quality === "fast" ? "active" : ""}
                  disabled={recording}
                  onClick={() => setQuality("fast")}
                >
                  Fast
                </button>
                <button
                  className={quality === "better" ? "active" : ""}
                  disabled={recording}
                  onClick={() => {
                    if (opencvReady) {
                      setQuality("better");
                      return;
                    }
                    if (opencvDownloadPct !== null) return;
                    if (opencvCached) {
                      loadOpenCVFromCacheAndSwitch();
                      return;
                    }
                    setShowCvPrompt(true);
                  }}
                >
                  Better {opencvReady || opencvCached ? "✓" : `(${OPENCV_SIZE_MB.toFixed(0)} MB)`}
                </button>
              </div>
            </div>
            <div className="actions">
              {!recording && (
                <button className="primary" onClick={recordVideo} disabled={saveDisabled}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="6" fill="currentColor" />
                  </svg>
                  {canRecord ? "Save stabilised video" : "Recording unsupported"}
                </button>
              )}
              {recording && (
                <button className="danger" onClick={cancelRecording}>
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <footer>
        <p>
          Companion to{" "}
          <a href="../aqua-fix/" style={{ color: "#5fd0ff" }}>
            Aqua Fix
          </a>
          . Tap Share → "Add to Home Screen".
        </p>
      </footer>
    </div>
  );
}

