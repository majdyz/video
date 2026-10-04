import { useEffect, useRef, useState } from "react";
import {
  AdvancedDisclosure,
  BusyOverlay,
  CapabilityBanner,
  CompareWipe,
  FilePickerButton,
  Hero,
  Modal,
  PlaceholderDropZone,
  PlayOverlay,
  RecordingOverlay,
  Scrubber,
  Slider,
  bitrateFromSource,
  exportRealtime,
  exportWithCodec,
  isRealtimeExportSupported,
  isWebKit,
  probeFrameRate,
  isWebCodecsSupported,
  pickBitrate,
  shareOrDownload,
  touchFile,
  useVideoPlaybackState,
  validateUploadedFile,
} from "@dive-tools/shared";
import "@dive-tools/shared/theme.css";
import { AquaFixLogo, AQUA_FIX_BRAND } from "./branding";
import { GradeEngine } from "./engine/engine";
import { DEFAULT_SETTINGS, INTENSITY_MAX, SCENE_PRESETS, medianParams, type GradeParams, type UserSettings } from "./engine/params";
import { ANALYSIS_INTERVAL_MS, SCENE_CUT_MEAN_DIFF } from "./engine/engine";
import type { Rotation } from "./engine/backend";

type Mode = "idle" | "photo" | "video";


// Preview renders at the stage's device-pixel size (capped), never at 4K.
const PREVIEW_MAX_WIDTH = 1600;

function waitForEvent(el: HTMLMediaElement, ok: string[], bad: string[], timeoutMs: number, failMsg: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const done = (f: () => void) => () => {
      for (const n of ok) el.removeEventListener(n, onOk);
      for (const n of bad) el.removeEventListener(n, onBad);
      clearTimeout(t);
      f();
    };
    const onOk = done(resolve);
    const onBad = done(() => reject(new Error(failMsg)));
    const t = setTimeout(done(() => reject(new Error(failMsg + " (timed out)"))), timeoutMs);
    for (const n of ok) el.addEventListener(n, onOk);
    for (const n of bad) el.addEventListener(n, onBad);
    if (el.readyState >= 1 && ok.includes("loadedmetadata")) onOk();
  });
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: unknown) => void) => number;
};

/** Resolves once a frame has been presented (rVFC), or readyState says so, or on timeout. */
function waitForFirstFrame(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(finish, timeoutMs);
    const v = video as VideoWithRVFC;
    if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(finish);
    const poll = () => {
      if (done) return;
      if (video.readyState >= 2 && video.videoWidth > 0) finish();
      else setTimeout(poll, 50);
    };
    poll();
  });
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Frame grabbed when the video pauses, so wipe drags and slider changes
  // repaint from a stable bitmap (Safari won't re-upload a paused <video>).
  const pausedFrameRef = useRef<ImageBitmap | null>(null);
  const engineRef = useRef<GradeEngine | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const fileRef = useRef<File | null>(null);
  const fileNameRef = useRef<string>(AQUA_FIX_BRAND.filenamePrefix);
  const sourceUrlRef = useRef<string | null>(null);
  const previewActiveRef = useRef(false);
  const exportingRef = useRef(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const settingsRef = useRef<UserSettings>(DEFAULT_SETTINGS);
  // Bumped per file so async work for a stale file can't paint the new one.
  const fileGenRef = useRef(0);
  const modeRef = useRef<Mode>("idle");

  const [mode, setMode] = useState<Mode>("idle");
  const [settings, setSettings] = useState<UserSettings>(() => {
    // Debug/testing: ?intensity=1.5&look=1 preset the controls (headless runs).
    const q = new URLSearchParams(location.search);
    const num = (k: string) => { const v = parseFloat(q.get(k) ?? ""); return Number.isFinite(v) ? v : undefined; };
    return { ...DEFAULT_SETTINGS, intensity: num("intensity") ?? DEFAULT_SETTINGS.intensity, look: num("look") ?? DEFAULT_SETTINGS.look, hazeAuto: q.get("hazeauto") !== "0" };
  });
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplit, setCompareSplit] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportTime, setExportTime] = useState(0);
  const [exportDetail, setExportDetail] = useState("");
  const [duration, setDuration] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [engineKind, setEngineKind] = useState<"webgpu" | "webgl2" | null>(null);
  // Diagnostics for the info modal, refreshed while it is open.
  const [diag, setDiag] = useState<string | null>(null);
  useEffect(() => {
    if (!showInfo) return;
    const update = () => {
      const e = engineRef.current;
      if (!e) return;
      const st = e.getStats();
      setDiag(`${st.backend} · analysis ${st.analysisMs.toFixed(0)} ms (${st.analyses} runs, ${st.sceneCuts} cuts) · people ${st.person}${st.person === "on" ? ` ${st.personMs.toFixed(0)} ms, ${(st.personCoverage * 100).toFixed(0)}%` : ""}${e.isLocked ? ` · clip-locked (${e.lockSegments} seg)` : ""}`);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [showInfo]);
  const canExport = isWebCodecsSupported();

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    settingsRef.current = settings;
    const e = engineRef.current;
    if (!e) return;
    e.settings = settings;
    repaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.split = compareActive ? compareSplit : 0;
    repaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareActive, compareSplit]);

  // Engine (WebGPU, else WebGL2) on the stage canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    // ?webgl2 forces the fallback backend (debugging on devices / headless).
    const preferWebGPU = !new URLSearchParams(location.search).has("webgl2");
    GradeEngine.create(canvas, (e) => setError(e.message), preferWebGPU)
      .then((engine) => {
        if (disposed) {
          engine.dispose();
          return;
        }
        engine.settings = settingsRef.current;
        engineRef.current = engine;
        setEngineKind(engine.backend.kind);
      })
      .catch((e) => setError("GPU init failed: " + (e instanceof Error ? e.message : String(e))));
    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Preview scale from the stage's device-pixel size and the source size.
  function applyPreviewScale() {
    const e = engineRef.current;
    const stage = stageRef.current;
    if (!e || !stage || exportingRef.current) return;
    const sw = e.backend.outputWidth;
    const sh = e.backend.outputHeight;
    if (!sw || !sh) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const wantW = Math.min(PREVIEW_MAX_WIDTH, stage.clientWidth * dpr);
    const wantH = stage.clientHeight * dpr;
    const scale = Math.min(1, wantW / sw, wantH / sh);
    e.setPreviewScale(scale);
  }
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => {
      applyPreviewScale();
      repaint();
    });
    ro.observe(stage);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paint the current still (photo, or paused video) with the current grade.
  function repaint() {
    const e = engineRef.current;
    if (!e) return;
    if (modeRef.current === "photo" && bitmapRef.current) {
      const b = bitmapRef.current;
      e.upload(b, b.width, b.height, 0);
      e.render();
      return;
    }
    const v = videoRef.current;
    if (modeRef.current === "video" && v && v.paused && v.readyState >= 2 && !exportingRef.current) {
      const still = pausedFrameRef.current;
      if (still) e.upload(still, still.width, still.height, 0);
      else e.upload(v, v.videoWidth, v.videoHeight, 0);
      e.render();
    }
  }

  // Grab the paused frame as a bitmap (and drop it on play).
  async function captureStill() {
    const v = videoRef.current;
    if (!v || !v.paused || v.readyState < 2 || modeRef.current !== "video") return;
    const myGen = fileGenRef.current;
    try {
      const bmp = await createImageBitmap(v);
      if (myGen !== fileGenRef.current || !v.paused) {
        bmp.close();
        return;
      }
      pausedFrameRef.current?.close();
      pausedFrameRef.current = bmp;
    } catch {
      // Keep uploading from the element.
    }
  }
  function dropStill() {
    pausedFrameRef.current?.close();
    pausedFrameRef.current = null;
  }

  const { currentTime, isPaused } = useVideoPlaybackState(videoRef, mode === "video", () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    dropStill();
    renderVideoFrame(v);
    if (v.paused) void captureStill();
  });
  useEffect(() => {
    if (mode !== "video") return;
    if (isPaused) void captureStill();
    else dropStill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused, mode]);

  function renderVideoFrame(v: HTMLVideoElement) {
    const e = engineRef.current;
    if (!e) return;
    e.upload(v, v.videoWidth, v.videoHeight, 0);
    e.tick(v.currentTime);
    e.render();
  }

  function startPreview() {
    const video = videoRef.current as VideoWithRVFC | null;
    if (!video) return;
    previewActiveRef.current = true;
    const draw = () => {
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      renderVideoFrame(v);
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      const onFrame = () => {
        if (!previewActiveRef.current || exportingRef.current) return;
        draw();
        const v = videoRef.current as VideoWithRVFC | null;
        if (v && previewActiveRef.current && !exportingRef.current) v.requestVideoFrameCallback?.(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      const loop = () => {
        if (!previewActiveRef.current || exportingRef.current) return;
        draw();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  function teardown() {
    previewActiveRef.current = false;
    exportAbortRef.current?.abort();
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (sourceUrlRef.current) {
      try { URL.revokeObjectURL(sourceUrlRef.current); } catch { /* ignore */ }
      sourceUrlRef.current = null;
    }
    if (bitmapRef.current) {
      try { bitmapRef.current.close(); } catch { /* ignore */ }
      bitmapRef.current = null;
    }
    dropStill();
    engineRef.current?.reset();
  }

  async function handleFile(file: File) {
    setError(null);
    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    const validation = validateUploadedFile(file, isVideo ? "video" : "image");
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    if (!engineRef.current) {
      setError("The GPU engine isn't ready yet — try again in a moment.");
      return;
    }
    teardown();
    fileGenRef.current++;
    fileRef.current = file;
    fileNameRef.current = file.name.replace(/\.[^.]+$/, "");
    setCompareActive(false);
    setBusy(isVideo ? "Loading video…" : "Loading photo…");
    engineRef.current?.lockGlobals(null);
    try {
      await touchFile(file);
      if (isVideo) await loadVideo(file);
      else await loadImage(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadImage(file: File) {
    const e = engineRef.current!;
    const myGen = fileGenRef.current;
    // "from-image" honours EXIF orientation (portrait iPhone photos).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (myGen !== fileGenRef.current) {
      bitmap.close();
      return;
    }
    bitmapRef.current = bitmap;
    modeRef.current = "photo";
    setMode("photo");
    e.upload(bitmap, bitmap.width, bitmap.height, 0);
    applyPreviewScale();
    try {
      await e.analyzeNow(true);
    } catch (err) {
      setError("Analysis failed: " + (err instanceof Error ? err.message : String(err)));
    }
    if (myGen !== fileGenRef.current) return;
    e.render();
  }

  async function loadVideo(file: File) {
    const e = engineRef.current!;
    const video = videoRef.current;
    if (!video) return;
    const myGen = fileGenRef.current;
    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "auto";
    // Metadata first (dimensions, duration) …
    await waitForEvent(video, ["loadedmetadata"], ["error"], 20_000, "Could not read this video");
    if (myGen !== fileGenRef.current) return;
    setDuration(video.duration || 0);
    // … then a decoded frame. iOS Safari only decodes once playback starts,
    // so play (muted, inline) and wait for the first presented frame.
    await video.play().catch(() => undefined);
    await waitForFirstFrame(video, 15_000);
    if (myGen !== fileGenRef.current) return;
    if (!video.videoWidth) throw new Error("This video has no decodable picture (unsupported codec?)");
    modeRef.current = "video";
    setMode("video");
    e.upload(video, video.videoWidth, video.videoHeight, 0);
    applyPreviewScale();
    // Analyse the first frame and snap so the clip never shows uncorrected;
    // if analysis fails the preview still runs (ungraded) and the error shows.
    e.upload(video, video.videoWidth, video.videoHeight, 0);
    try {
      await e.analyzeNow(true);
    } catch (err) {
      setError("Analysis failed: " + (err instanceof Error ? err.message : String(err)));
    }
    if (myGen !== fileGenRef.current) return;
    e.render();
    startPreview();
    // Clip profile: analyse a dozen frames spread over the clip and lock the
    // global correction to their median, so a subject passing through (an
    // orange fish filling the frame) can't swing the balance mid-video.
    // ?lock=0 keeps per-frame estimation (A/B testing).
    e.lockRange = new URLSearchParams(location.search).get("lockz") === "1";
    if (new URLSearchParams(location.search).get("lock") !== "0") void profileClip(video, myGen);
  }

  async function profileClip(video: HTMLVideoElement, myGen: number) {
    const e = engineRef.current;
    const dur = video.duration;
    if (!e || !Number.isFinite(dur) || dur < 0.5) return;
    const n = Math.min(12, Math.max(4, Math.round(dur)));
    const samples: { t: number; params: GradeParams; mean: [number, number, number] }[] = [];
    const wasPaused = video.paused;
    const resumeAt = video.currentTime;
    previewActiveRef.current = false;
    video.pause();
    setBusy("Analysing clip…");
    try {
      for (let i = 0; i < n; i++) {
        if (myGen !== fileGenRef.current || exportingRef.current) return;
        const t = Math.min(dur - 0.05, 0.15 + ((dur - 0.3) * (i + 0.5)) / n);
        await seekVideoTo(video, t);
        e.upload(video, video.videoWidth, video.videoHeight, 0);
        try {
          const r = await e.analyzeRaw();
          samples.push({ t, params: r.params, mean: r.mean });
        } catch {
          // a failed sample just doesn't vote
        }
      }
      if (myGen !== fileGenRef.current) return;
      if (samples.length >= 3) {
        // Split at real cuts only: samples are ~0.5–1 s apart, so a pan from
        // sunlit surface to dark rock already moves the mean colour by more
        // than the frame-to-frame cut threshold. A split needs a large jump,
        // or a moderate one together with a genuinely different estimate —
        // if the estimates agree there is nothing to gain from splitting
        // (and a mid-clip snap is exactly the inconsistency the lock exists
        // to remove). Each segment with ≥ 2 samples locks its own median; a
        // lone sample joins the previous segment.
        const segs: { from: number; items: typeof samples }[] = [{ from: 0, items: [samples[0]] }];
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1].mean, b = samples[i].mean;
          const diff = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
          const wa = samples[i - 1].params.wb, wb = samples[i].params.wb;
          const wbDiff = Math.max(Math.abs(Math.log(wa[0] / wb[0])), Math.abs(Math.log(wa[2] / wb[2])));
          const cut = diff > 2 * SCENE_CUT_MEAN_DIFF || (diff > SCENE_CUT_MEAN_DIFF && wbDiff > 0.2);
          if (cut) segs.push({ from: (samples[i - 1].t + samples[i].t) / 2, items: [] });
          segs[segs.length - 1].items.push(samples[i]);
        }
        for (let i = segs.length - 1; i > 0; i--) if (segs[i].items.length < 2) { segs[i - 1].items.push(...segs[i].items); segs.splice(i, 1); }
        const lock = segs.map((s) => ({ from: s.from, params: medianParams(s.items.map((x) => x.params)) }));
        e.lockGlobals(lock);
        console.info(`[profile] locked ${lock.length} segment(s): ${samples.length}/${n} samples, wb ${samples.map((p) => p.params.wb[0].toFixed(2)).join("/")}, cuts at ${lock.slice(1).map((s) => s.from.toFixed(1) + "s").join(", ") || "none"}`);
      } else {
        console.info(`[profile] skipped: ${samples.length}/${n} samples`);
      }
    } finally {
      setBusy(null);
      if (myGen === fileGenRef.current && !exportingRef.current) {
        await seekVideoTo(video, resumeAt).catch(() => undefined);
        e.upload(video, video.videoWidth, video.videoHeight, 0);
        e.render();
        if (!wasPaused) await video.play().catch(() => undefined);
        startPreview();
      }
    }
  }

  function seekVideoTo(video: HTMLVideoElement, t: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); resolve(); };
      const fail = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); reject(new Error("seek failed")); };
      video.addEventListener("seeked", done);
      video.addEventListener("error", fail);
      try { video.currentTime = t; } catch (err) { fail(); void err; }
      setTimeout(() => done(), 4000);
    });
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v || exporting) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v || exporting) return;
    try {
      v.currentTime = Math.min(Math.max(0, t), v.duration || 0);
    } catch {
      // ignore
    }
  }

  async function savePhoto() {
    const e = engineRef.current;
    const bitmap = bitmapRef.current;
    if (!e || !bitmap) return;
    try {
      e.setPreviewScale(1);
      e.upload(bitmap, bitmap.width, bitmap.height, 0);
      const frame = await e.renderToFrame(0, 0, undefined);
      const out = document.createElement("canvas");
      out.width = bitmap.width;
      out.height = bitmap.height;
      out.getContext("2d")!.drawImage(frame, 0, 0);
      frame.close();
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.95));
      if (blob) await shareOrDownload(blob, `${fileNameRef.current}-aqua.jpg`);
    } catch (err) {
      setError("Save failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      applyPreviewScale();
      repaint();
    }
  }

  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }

  async function saveVideo() {
    const e = engineRef.current;
    const file = fileRef.current;
    const video = videoRef.current;
    if (!e || !file || !video) return;
    if (!canExport) {
      setError("Saving video needs WebCodecs — update to the latest Safari or Chrome.");
      return;
    }
    setError(null);
    previewActiveRef.current = false;
    exportingRef.current = true;
    setCompareActive(false);
    video.pause();
    const ctrl = new AbortController();
    exportAbortRef.current = ctrl;
    const wakeLockApi = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    wakeLockApi?.request("screen").then((l) => { wakeLockRef.current = l; }).catch(() => undefined);
    setExporting(true);
    setExportProgress(0);
    setExportTime(0);
    const total = video.duration || 0;
    const bitrate = bitrateFromSource(file.size, total) ?? pickBitrate(video.videoWidth, video.videoHeight, 30);
    // Per-stage timing for the overlay: where an export spends its time.
    const stage = { upload: 0, render: 0, draw: 0, capture: 0, frames: 0, started: performance.now(), lastUi: 0 };
    // Export has its own temporal state: start clean so the first frame
    // snaps to its own analysis instead of inheriting the preview's.
    e.reset();
    dropStill();
    e.setPreviewScale(1);
    let frames = 0;
    // Real-time path: WebKit's canvas → VideoFrame copy pins the offline
    // exporter to ~10 fps, so there we play the clip and record the graded
    // canvas (MediaRecorder), then remux the original audio. ?rt=1/0 forces.
    const rtParam = new URLSearchParams(location.search).get("rt");
    const canvasEl = e.backend.canvas;
    const useRealtime = rtParam === "1" || (rtParam !== "0" && isWebKit() && isRealtimeExportSupported(canvasEl));
    try {
      if (useRealtime) {
        // The recorder captures whatever gets painted, so the renderer must
        // keep up with playback. Start at full size; if the first seconds
        // render well below the capture rate, restart at a smaller scale.
        const SCALES = [1, 0.75, 0.5];
        // Lighter per-frame load while recording: the globals are locked per
        // clip anyway, so analyses can run at a lower cadence and person
        // passes less often; both restored in the finally below.
        e.analysisIntervalMs = 150;
        e.personEvery = 4;
        // Capture at the clip's own frame rate (60 fps phones), capped to what
        // the recorder can take; "too slow" is judged relative to it.
        const srcFps = Math.min(60, Math.max(24, Math.round(await probeFrameRate(file))));
        console.info(`[export] source ${srcFps} fps`);
        for (let si = 0; si < SCALES.length; si++) {
          const scale = SCALES[si];
          const canRetry = si < SCALES.length - 1;
          e.reset();
          e.setPreviewScale(scale);
          setExportDetail(`real-time · playing the clip and recording the graded canvas${scale < 1 ? ` · ${Math.round(scale * 100)}% size` : ""}`);
          let rendered = 0;
          let slow = false;
          const rtStart = performance.now();
          const rtCtrl = new AbortController();
          const onOuterAbort = () => rtCtrl.abort();
          ctrl.signal.addEventListener("abort", onOuterAbort, { once: true });
          try {
            const result = await exportRealtime(file, video, canvasEl, {
              bitrate,
              opfsPrefix: AQUA_FIX_BRAND.opfsPrefix,
              fps: srcFps,
              signal: rtCtrl.signal,
              log: (line) => console.info("[export]", line),
              onProgress: (p) => {
                setExportProgress(p);
                setExportTime(p * total);
                const secs = (performance.now() - rtStart) / 1000;
                if (secs > 0.5) setExportDetail(`real-time · ${(rendered / secs).toFixed(1)} fps rendered${scale < 1 ? ` · ${Math.round(scale * 100)}% size` : ""} · ${e.backend.kind}`);
                if (canRetry && secs > 2.5 && rendered / secs < srcFps * 0.72 && !slow) {
                  slow = true;
                  console.info(`[export] ${(rendered / secs).toFixed(1)} fps at ${scale}× — restarting smaller`);
                  rtCtrl.abort();
                }
              },
              startRendering: (onFrame) => {
                let active = true;
                const vv = video as VideoWithRVFC;
                const step = () => {
                  if (!active || !exportingRef.current) return;
                  if (video.readyState >= 2) {
                    e.upload(video, video.videoWidth, video.videoHeight, 0);
                    // First frame snaps to its own analysis; afterwards tick()
                    // starts analyses at the preview's cadence (~70 ms) — one
                    // per frame cost a GPU readback per frame and starved the
                    // renderer.
                    if (rendered === 0) void e.analyzeNow(true).catch(() => undefined);
                    e.tick(video.currentTime);
                    e.render();
                    onFrame(video.currentTime);
                    rendered++;
                  }
                  if (typeof vv.requestVideoFrameCallback === "function") vv.requestVideoFrameCallback(step);
                  else requestAnimationFrame(step);
                };
                step();
                return () => { active = false; };
              },
            });
            await shareOrDownload(result.blob, `${fileNameRef.current}-aqua.${result.blob.type === "video/webm" ? "webm" : "mp4"}`);
            return;
          } catch (err) {
            if (slow && !ctrl.signal.aborted) continue; // retry at the next scale
            throw err;
          } finally {
            ctrl.signal.removeEventListener("abort", onOuterAbort);
          }
        }
        return;
      }
      const result = await exportWithCodec(
        file,
        async (sample, info) => {
          const frame = sample.toVideoFrame();
          try {
            const rot = (info.rotation / 90) as Rotation;
            const t0 = performance.now();
            e.upload(frame, frame.displayWidth, frame.displayHeight, rot);
            // The first frame waits for its analysis (and person mask) and
            // snaps; after that the analysis runs alongside the frame loop —
            // waiting on it cost a GPU readback round-trip per frame on
            // iPhone (up ≈ 100 ms), and the eased maps hide a frame of lag.
            if (frames === 0) await e.analyzeNow(true);
            else e.analyzeSoon();
            e.tick(info.timeSec);
            frames++;
            const t1 = performance.now();
            // Stamp with the shifted presentation time, never the decoder's raw
            // timestamp (WebKit emits negative ones; the muxer rejects those).
            const out = await e.renderToFrame(rot, Math.round(info.timeSec * 1e6), frame.duration ?? undefined);
            const t2 = performance.now();
            stage.upload += t1 - t0;
            stage.render += t2 - t1;
            stage.draw += e.backend.lastDrawMs;
            stage.capture += e.backend.lastCaptureMs;
            stage.frames++;
            if (t2 - stage.lastUi > 500) {
              stage.lastUi = t2;
              const fps = stage.frames / ((t2 - stage.started) / 1000);
              const st = e.getStats();
              const be = e.backend as unknown as { capture?: string; externalOk?: boolean; captureBench?: string };
              setExportDetail(`${fps.toFixed(1)} fps · up ${(stage.upload / stage.frames).toFixed(0)} · draw ${(stage.draw / stage.frames).toFixed(0)} · cap ${(stage.capture / stage.frames).toFixed(0)} · wait ${((stage.render - stage.draw - stage.capture) / stage.frames).toFixed(0)} ms · an ${st.analysisMs.toFixed(0)} · ppl ${st.person === "on" ? st.personMs.toFixed(0) : st.person} · ${st.backend}${be.capture ? "/" + be.capture : ""}${be.externalOk ? "/ext" : ""}${be.captureBench ? ` · bench ${be.captureBench}` : ""}`);
            }
            return out;
          } finally {
            frame.close();
          }
        },
        {
          bitrate,
          opfsPrefix: AQUA_FIX_BRAND.opfsPrefix,
          signal: ctrl.signal,
          onProgress: (p) => {
            setExportProgress(p);
            setExportTime(p * total);
          },
        },
      );
      await shareOrDownload(result.blob, `${fileNameRef.current}-aqua.mp4`);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError("Export failed: " + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      e.analysisIntervalMs = ANALYSIS_INTERVAL_MS;
      e.personEvery = 2;
      exportAbortRef.current = null;
      exportingRef.current = false;
      releaseWakeLock();
      setExporting(false);
      setExportProgress(0);
      setExportTime(0);
      setExportDetail("");
      // Back to the preview with a fresh analysis of the first frame.
      e.reset();
      try {
        video.currentTime = 0;
      } catch {
        // ignore
      }
      if (fileRef.current === file) {
        e.upload(video, video.videoWidth, video.videoHeight, 0);
        applyPreviewScale();
        await e.analyzeNow(true).catch(() => undefined);
        e.render();
        await video.play().catch(() => undefined);
        startPreview();
      }
    }
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
  }

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />

      <Hero logo={<AquaFixLogo />} name={AQUA_FIX_BRAND.name} tagline={AQUA_FIX_BRAND.tagline} onInfoClick={() => setShowInfo(true)} />
      <CapabilityBanner storageKey="aqua-fix:capnote" />

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How Aqua Fix works">
        <h4>One adaptive engine</h4>
        <p>
          Underwater footage is the scene multiplied by colour-dependent attenuation,
          plus an additive blue-green veil (backscatter) that grows with distance. Boosting
          red on top of that veil is what turns far water magenta. Aqua Fix instead follows
          the Sea-thru image-formation model, in linear light:
        </p>
        <ul>
          <li>
            <b>Range proxy</b> — a per-pixel prior (ULAP) says how far each pixel is;
            objects and water are told apart by hue against the veiling light and by how
            much signal survives the veil.
          </li>
          <li>
            <b>Backscatter removal</b> — the veiling light and its growth with range are
            fitted from the darkest pixels at each range (Akkaynak &amp; Treibitz 2019) and
            subtracted per pixel, so far regions lose their milky cast without reddening.
          </li>
          <li>
            <b>Range-adaptive compensation</b> — a Shades-of-Gray white balance measured on
            the de-scattered image is spread over range: the far field gets more lift than
            the foreground.
          </li>
          <li>
            <b>Tone and colour</b> — highlight-protected exposure, robust levels, local
            contrast (CLAHE) on luminance only, then a chroma ceiling and constant-luminance
            gamut compression in Oklab so sand and skin never clip to magenta.
          </li>
          <li>
            <b>Video</b> — a 256×144 thumbnail is read back from the GPU ~8× per second
            and re-analysed in a worker; every parameter is eased in over ~0.6 s with hard
            cuts snapping, so there is no flicker. The full-resolution frame is graded in a
            single {engineKind === "webgpu" ? "WebGPU" : "WebGL2"} pass.
          </li>
        </ul>
        <h4>References</h4>
        <ul>
          <li>
            Akkaynak &amp; Treibitz (2019) —{" "}
            <a href="https://openaccess.thecvf.com/content_CVPR_2019/html/Akkaynak_Sea-Thru_A_Method_for_Removing_Water_From_Underwater_Images_CVPR_2019_paper.html" target="_blank" rel="noopener noreferrer">
              Sea-thru: A Method for Removing Water from Underwater Images (CVPR)
            </a>
          </li>
          <li>
            Song, Wang, Zhang &amp; Li (2018) — ULAP, a rapid underwater light-attenuation prior for scene depth.
          </li>
          <li>
            Finlayson &amp; Trezzi (2004) — Shades of Gray and Colour Constancy (CIC).
          </li>
          <li>
            Björn Ottosson — <a href="https://bottosson.github.io/posts/oklab/" target="_blank" rel="noopener noreferrer">Oklab</a> and sRGB gamut mapping.
          </li>
        </ul>
        <h4>Source</h4>
        <p>
          <a href="https://github.com/majdyz/video" target="_blank" rel="noopener noreferrer">github.com/majdyz/video</a>
          {diag && <><br /><span style={{ color: "var(--dim)", fontSize: 12 }}>This device: {diag}</span></>}
        </p>
      </Modal>

      <div
        ref={stageRef}
        className={`stage ${mode === "idle" ? "is-empty" : ""}`}
        onClick={(e) => {
          if (mode !== "video" || exporting) return;
          if ((e.target as HTMLElement).closest("button")) return;
          if (compareActive) return;
          togglePlay();
        }}
      >
        <canvas ref={canvasRef} />
        <video ref={videoRef} style={{ display: "none" }} />
        {mode === "idle" && <PlaceholderDropZone accept="image/*,video/*" onPick={handleFile} />}
        {error && <div className="error">{error}</div>}
        {busy && <BusyOverlay message={busy} />}
        {exporting && <RecordingOverlay currentTime={exportTime} duration={duration} progress={exportProgress} detail={exportDetail} />}
        {mode === "video" && isPaused && !exporting && <PlayOverlay />}
        {mode !== "idle" && !exporting && (
          <CompareWipe
            active={compareActive}
            value={compareSplit}
            onChange={setCompareSplit}
            onLiveChange={(v) => {
              const e = engineRef.current;
              if (!e) return;
              e.split = v;
              repaint();
            }}
            onToggle={() => setCompareActive((a) => !a)}
            canvasRef={canvasRef}
          />
        )}
      </div>

      {mode === "video" && <Scrubber currentTime={currentTime} duration={duration} disabled={exporting} onSeek={seekTo} />}

      <section className="panel">
        <FilePickerButton accept="image/*,video/*" disabled={exporting} onPick={handleFile}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5h14v14H5z M9 9l3-3 3 3M12 6v9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Pick photo or video
        </FilePickerButton>

        {mode !== "idle" && (
          <>
            <div className="sliders">
              <div className="optswitch" role="radiogroup" aria-label="Scene">
                {SCENE_PRESETS.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={settings.preset === p.id} title={p.hint}
                    className={settings.preset === p.id ? "on" : ""} disabled={exporting}
                    onClick={() => setSettings((s) => ({ ...s, preset: p.id }))}>{p.label}</button>
                ))}
              </div>
              <Slider label="Intensity" value={settings.intensity} min={0} max={INTENSITY_MAX} step={0.01}
                format={(v) => `${Math.round((v / INTENSITY_MAX) * 100)}%`}
                onChange={(v) => setSettings((s) => ({ ...s, intensity: v }))} disabled={exporting} />
              <p className="hint">50% is the estimated correction. Above it the colour split is pushed harder than the estimate.</p>
              <Slider label="Deep blue look" value={settings.look} min={0} max={1} step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setSettings((s) => ({ ...s, look: v }))} disabled={exporting} />
            </div>
            <AdvancedDisclosure disabled={exporting}>
              <Slider label="Saturation" value={settings.saturation} min={0} max={2} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, saturation: v }))} disabled={exporting} />
              <Slider label="Clarity" value={settings.clarity} min={0} max={1} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, clarity: v }))} disabled={exporting} />
              <Slider label="Veil removal" value={settings.veil} min={0} max={1.2} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, veil: v }))} disabled={exporting} />
            </AdvancedDisclosure>

            <div className="actions">
              <button className="ghost" onClick={() => setSettings(DEFAULT_SETTINGS)} disabled={exporting}>
                Reset
              </button>
              {mode === "photo" && (
                <button className="primary" onClick={savePhoto}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 19h14M12 4v11M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Save photo
                </button>
              )}
              {mode === "video" && !exporting && (
                <button className="primary" onClick={saveVideo} disabled={!canExport}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="6" fill="currentColor" />
                  </svg>
                  {canExport ? `Save video${duration ? ` (${duration.toFixed(1)}s)` : ""}` : "Saving unsupported"}
                </button>
              )}
              {mode === "video" && exporting && (
                <button className="danger" onClick={cancelExport}>Cancel</button>
              )}
            </div>
            {mode === "video" && !canExport && (
              <p className="note">Saving video needs WebCodecs. The latest Safari, Chrome, or Edge will work.</p>
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
