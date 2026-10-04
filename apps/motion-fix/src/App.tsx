import { useCallback, useEffect, useRef, useState } from "react";
import {
  bitrateFromSource,
  BusyOverlay,
  CapabilityBanner,
  CompareWipe,
  exportRealtime,
  exportWithCodec,
  isRealtimeExportSupported,
  isWebKit,
  probeFrameRate,
  FilePickerButton,
  Hero,
  isWebCodecsSupported,
  Modal,
  pickBitrate,
  PlaceholderDropZone,
  PlayOverlay,
  pruneOldRecordings,
  RecordingOverlay,
  Scrubber,
  shareOrDownload,
  Slider,
  touchFile,
  useVideoPlaybackState,
  validateUploadedFile,
  type ExportFrameInfo,
} from "@dive-tools/shared";
import "@dive-tools/shared/theme.css";
import "./motion-theme.css";
import type { VideoSample } from "mediabunny";
import { MotionFixLogo, MOTION_FIX_BRAND } from "./branding";
import { AnalysisClient } from "./lib/analysis-client.ts";
import { MeshRenderer, type Rotation } from "./lib/mesh-renderer.ts";
import {
  DEFAULT_PARAMS,
  warpFnAtTime,
  type MotionAnalysis,
  type StabilizedPath,
} from "./lib/stabilize.ts";

type Mode = "idle" | "video";

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: { mediaTime: number }) => void) => number;
};

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rendererRef = useRef<MeshRenderer | null>(null);
  const clientRef = useRef<AnalysisClient | null>(null);
  const fileRef = useRef<File | null>(null);
  const fileNameRef = useRef<string>(MOTION_FIX_BRAND.filenamePrefix);
  const sourceUrlRef = useRef<string | null>(null);
  const sourceBitrateRef = useRef<number | null>(null);
  const analysisRef = useRef<MotionAnalysis | null>(null);
  const pathRef = useRef<StabilizedPath | null>(null);
  const previewActiveRef = useRef(false);
  const exportingRef = useRef(false);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Sequence number of the latest solve request; older results are dropped.
  const solveSeqRef = useRef(0);
  // Compare wipe state lives in refs too: the draw loop reads them every
  // frame and a pointermove must not go through a React commit.
  const compareActiveRef = useRef(false);
  const compareSplitRef = useRef(0.5);
  // 2D scratch canvas for export frames the GPU would not accept directly.
  const fallbackCanvasRef = useRef<OffscreenCanvas | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [smoothing, setSmoothing] = useState(DEFAULT_PARAMS.smoothing);
  const [crop, setCrop] = useState(DEFAULT_PARAMS.maxCrop);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportTime, setExportTime] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplit, setCompareSplit] = useState(0.5);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    compareActiveRef.current = compareActive;
  }, [compareActive]);
  useEffect(() => {
    compareSplitRef.current = compareSplit;
  }, [compareSplit]);

  useEffect(() => {
    pruneOldRecordings(MOTION_FIX_BRAND.opfsPrefix);
    const c = canvasRef.current;
    if (c && !rendererRef.current) {
      try {
        rendererRef.current = new MeshRenderer(c);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    clientRef.current = new AnalysisClient();
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------
  // Drawing

  /** Draws the <video> frame at `time` through the current path. */
  const drawFrame = useCallback((time: number) => {
    const v = videoRef.current;
    const renderer = rendererRef.current;
    if (!v || !renderer || v.readyState < 2 || v.videoWidth === 0) return;
    renderer.resize(v.videoWidth, v.videoHeight);
    if (!renderer.upload(v, v.videoWidth, v.videoHeight)) return;
    const path = pathRef.current;
    // Per-vertex warp (similarity + wobble residual): the same callback the
    // export uses, so the preview is what gets saved.
    renderer.render({
      warp: path ? warpFnAtTime(path, time) : null,
      rotation: 0,
      split: compareActiveRef.current ? compareSplitRef.current : null,
    });
  }, []);

  const drawCurrentFrame = useCallback(() => {
    const v = videoRef.current;
    if (v) drawFrame(v.currentTime);
  }, [drawFrame]);

  const { currentTime, isPaused } = useVideoPlaybackState(videoRef, mode === "video", drawCurrentFrame);

  useEffect(() => {
    if (mode === "video") drawCurrentFrame();
  }, [mode, compareActive, compareSplit, drawCurrentFrame]);

  function startPreview() {
    const video = videoRef.current as VideoWithRvfc | null;
    if (!video) return;
    previewActiveRef.current = true;
    if (typeof video.requestVideoFrameCallback === "function") {
      // mediaTime is the presented frame's own timestamp: exactly what the
      // analysis recorded, so the residual lines up frame for frame.
      const onFrame = (_now: number, metadata: { mediaTime: number }): void => {
        if (!previewActiveRef.current || exportingRef.current) return;
        drawFrame(metadata.mediaTime);
        (videoRef.current as VideoWithRvfc | null)?.requestVideoFrameCallback?.(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      const loop = (): void => {
        if (!previewActiveRef.current || exportingRef.current) return;
        drawCurrentFrame();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  // ---------------------------------------------------------------------
  // Loading and analysis

  function teardownVideo() {
    previewActiveRef.current = false;
    analysisRef.current = null;
    pathRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = null;
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setStatus(null);
    setAnalysisReady(false);
    setCompareActive(false);
    const validation = validateUploadedFile(file, "video");
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    if (!isWebCodecsSupported()) {
      setError("This browser has no WebCodecs support. Motion Fix needs Safari 17+ or a current Chrome / Edge.");
      return;
    }
    teardownVideo();
    analysisAbortRef.current?.abort();
    const ctrl = new AbortController();
    analysisAbortRef.current = ctrl;
    fileRef.current = file;
    fileNameRef.current = file.name.replace(/\.[^.]+$/, "");
    setBusy("Loading video…");
    try {
      // Touch the first byte so iOS finishes an iCloud download before the
      // decoder opens the file.
      await touchFile(file);
      const v = videoRef.current;
      const client = clientRef.current;
      if (!v || !client) return;
      const url = URL.createObjectURL(file);
      sourceUrlRef.current = url;
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        if (v.readyState >= 1) return resolve();
        const done = (): void => {
          v.removeEventListener("loadedmetadata", done);
          v.removeEventListener("error", fail);
          resolve();
        };
        const fail = (): void => {
          v.removeEventListener("loadedmetadata", done);
          v.removeEventListener("error", fail);
          reject(new Error("Could not decode video"));
        };
        v.addEventListener("loadedmetadata", done);
        v.addEventListener("error", fail);
      });
      setDuration(v.duration || 0);
      sourceBitrateRef.current = bitrateFromSource(file.size, v.duration || 0);
      setMode("video");
      drawCurrentFrame();

      setBusy("Analyzing motion 0%");
      const analysis = await client.analyze(
        file,
        (fraction, frames) => setBusy(`Analyzing motion ${Math.floor(fraction * 100)}% · ${frames} frames`),
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      analysisRef.current = analysis;
      setBusy("Solving camera path…");
      const path = await client.solve({ smoothing, maxCrop: crop });
      if (ctrl.signal.aborted) return;
      pathRef.current = path;
      setStatus(describe(analysis, path));
      setAnalysisReady(true);
      v.play().catch(() => undefined);
      startPreview();
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (analysisAbortRef.current === ctrl) analysisAbortRef.current = null;
      setBusy(null);
    }
  }

  function cancelAnalysis() {
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setBusy(null);
    setAnalysisReady(false);
    setError(null);
    setMode("idle");
    teardownVideo();
  }

  // Re-solve when the sliders settle. The solve runs in the worker, so the
  // debounce only limits the number of requests, not UI responsiveness.
  useEffect(() => {
    if (!analysisRef.current || !analysisReady) return;
    const seq = ++solveSeqRef.current;
    const id = setTimeout(async () => {
      const client = clientRef.current;
      if (!client) return;
      try {
        const path = await client.solve({ smoothing, maxCrop: crop });
        if (seq !== solveSeqRef.current) return;
        pathRef.current = path;
        if (analysisRef.current) setStatus(describe(analysisRef.current, path));
        drawCurrentFrame();
      } catch (e) {
        if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      }
    }, 120);
    return () => clearTimeout(id);
  }, [smoothing, crop, analysisReady, drawCurrentFrame]);

  // ---------------------------------------------------------------------
  // Playback controls

  function togglePlay() {
    const v = videoRef.current;
    if (!v || exporting) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v || exporting) return;
    v.currentTime = Math.min(Math.max(0, t), v.duration || 0);
  }

  // ---------------------------------------------------------------------
  // Export

  /** Renders one decoded frame for the exporter; same renderer and warp as the preview. */
  function renderExportFrame(sample: VideoSample, info: ExportFrameInfo): HTMLCanvasElement {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const path = pathRef.current;
    if (!renderer || !canvas || !path) throw new Error("Renderer not ready");
    renderer.resize(info.displayWidth, info.displayHeight);
    // Fast path: the VideoFrame goes straight to the GPU in coded
    // orientation; the renderer folds the container rotation into the UVs.
    let rotation: Rotation = info.rotation;
    const frame = sample.toVideoFrame();
    let uploaded = false;
    try {
      uploaded = renderer.upload(frame, frame.displayWidth, frame.displayHeight);
    } finally {
      frame.close();
    }
    if (!uploaded) {
      // Browser refused the VideoFrame as a texture: draw it upright on a 2D
      // canvas (sample.draw applies the rotation) and upload that instead.
      let fb = fallbackCanvasRef.current;
      if (!fb || fb.width !== info.displayWidth || fb.height !== info.displayHeight) {
        fb = new OffscreenCanvas(info.displayWidth, info.displayHeight);
        fallbackCanvasRef.current = fb;
      }
      const ctx = fb.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable");
      sample.draw(ctx, 0, 0, info.displayWidth, info.displayHeight);
      if (!renderer.upload(fb, fb.width, fb.height)) throw new Error("Could not upload frame to WebGL");
      rotation = 0;
    }
    renderer.render({ warp: warpFnAtTime(path, info.timeSec), rotation, split: null });
    return canvas;
  }

  async function exportVideo() {
    const file = fileRef.current;
    const video = videoRef.current;
    if (!file || !video || !pathRef.current) return;
    setError(null);
    previewActiveRef.current = false;
    exportingRef.current = true;
    if (compareActiveRef.current) {
      compareActiveRef.current = false;
      setCompareActive(false);
    }
    video.pause();
    const ctrl = new AbortController();
    exportAbortRef.current = ctrl;
    const wakeLockApi = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    wakeLockApi?.request("screen").then((lock) => {
      wakeLockRef.current = lock;
    }).catch(() => undefined);
    setExporting(true);
    setExportProgress(0);
    setExportTime(0);
    const total = video.duration || 0;
    let lastUiPush = 0;
    const started = performance.now();
    try {
      const bitrate = sourceBitrateRef.current ?? pickBitrate(video.videoWidth, video.videoHeight, analysisRef.current?.frameRate ?? 30);
      // Real-time path on WebKit (see aqua-fix): Safari's canvas → VideoFrame
      // copy pins the offline exporter to ~10 fps, so play the clip and
      // record the stabilised canvas instead, then remux the original audio.
      // ?rt=1 / ?rt=0 force it on or off.
      const rtParam = new URLSearchParams(location.search).get("rt");
      const canvasEl = canvasRef.current;
      const useRealtime = !!canvasEl && (rtParam === "1" || (rtParam !== "0" && isWebKit() && isRealtimeExportSupported(canvasEl)));
      if (useRealtime && canvasEl) {
        const srcFps = Math.min(60, Math.max(24, Math.round(analysisRef.current?.frameRate ?? (await probeFrameRate(file)))));
        let rendered = 0;
        const result = await exportRealtime(file, video, canvasEl, {
          bitrate,
          opfsPrefix: MOTION_FIX_BRAND.opfsPrefix,
          fps: srcFps,
          signal: ctrl.signal,
          log: (line) => console.info("[export]", line),
          onProgress: (p) => {
            const now = performance.now();
            if (now - lastUiPush < 250 && p < 1) return;
            lastUiPush = now;
            setExportProgress(p);
            setExportTime(p * total);
          },
          startRendering: (onFrame) => {
            let active = true;
            const vv = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
            const step = () => {
              if (!active || !exportingRef.current) return;
              if (video.readyState >= 2) {
                drawFrame(video.currentTime);
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
        const fps = rendered / (result.recordedMs / 1000);
        setStatus((s) => `${s ?? ""}${s ? " · " : ""}exported in real time, ${fps.toFixed(0)} fps rendered (${result.codec})`);
        try {
          await shareOrDownload(result.blob, `${fileNameRef.current}-stabilized.${result.blob.type === "video/webm" ? "webm" : "mp4"}`);
        } catch (err) {
          setError("Save failed: " + (err instanceof Error ? err.message : String(err)));
        }
        return;
      }
      const result = await exportWithCodec(file, renderExportFrame, {
        bitrate,
        opfsPrefix: MOTION_FIX_BRAND.opfsPrefix,
        signal: ctrl.signal,
        onProgress: (p) => {
          const now = performance.now();
          if (now - lastUiPush < 250 && p < 1) return;
          lastUiPush = now;
          setExportProgress(p);
          setExportTime(p * total);
        },
      });
      const fps = result.frames / ((performance.now() - started) / 1000);
      setStatus((s) => `${s ?? ""}${s ? " · " : ""}exported ${result.frames} frames at ${fps.toFixed(0)} fps (${result.codec})`);
      try {
        await shareOrDownload(result.blob, `${fileNameRef.current}-stabilized.mp4`);
      } catch (err) {
        setError("Save failed: " + (err instanceof Error ? err.message : String(err)));
      }
    } catch (e) {
      if (!isAbortError(e)) setError("Export failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      exportAbortRef.current = null;
      exportingRef.current = false;
      wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      setExporting(false);
      setExportProgress(0);
      setExportTime(0);
      video.currentTime = 0;
      video.play().catch(() => undefined);
      startPreview();
    }
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
  }

  // ---------------------------------------------------------------------

  const controlsDisabled = exporting || !analysisReady;

  return (
    <div className="app motion-app">
      <div className="bg" aria-hidden="true" />

      <Hero
        logo={<MotionFixLogo />}
        name={MOTION_FIX_BRAND.name}
        tagline={MOTION_FIX_BRAND.tagline}
        onInfoClick={() => setShowInfo(true)}
      />
      <CapabilityBanner storageKey="motion-capnote-dismissed" />

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="How Motion Fix works">
        <h4>Pipeline</h4>
        <ul>
          <li>
            <b>Decode</b> — every frame is decoded with WebCodecs in a worker
            (exact container timestamps, no dropped or duplicated frames) and
            shrunk to a 640-px analysis image: green channel plus
            contrast-limited adaptive histogram equalisation (CLAHE, 8×8
            tiles), because blue water has almost no red and very little
            contrast.
          </li>
          <li>
            <b>Track</b> — Shi-Tomasi corners bucketed on a 40-px grid
            (three per cell, re-detected only where tracks died), followed by
            pyramidal Lucas-Kanade (Bouguet 2000: 15×15 window, 4 levels,
            up to 20 iterations) with a forward-backward check of 1 px. A
            translational RANSAC inside each cell drops fish, particles and
            caustics before the global fit.
          </li>
          <li>
            <b>Fit</b> — one 2-D similarity per frame pair (rotation, zoom,
            translation) from MSAC over 2-point hypotheses plus the previous
            frame's motion, refined by Tukey IRLS with track-age weights. When
            support is thin the model degrades to rigid, translation, then
            identity rather than inventing motion.
          </li>
          <li>
            <b>Smooth</b> — the virtual camera path is the L1-optimal path of
            Grundmann, Kwatra and Essa (2011): minimise{" "}
            <code>10·|D¹| + 1·|D²| + 100·|D³|</code> of the path (affine
            entries weighted 100:1 against translation) subject to the crop
            window staying inside every frame and the warp staying near
            identity. The result is made of still, constant-velocity and
            constant-acceleration segments — tripod, dolly and crane moves —
            instead of a blurred average of the shake. The linear program is
            solved exactly with a banded primal-dual interior-point method
            (Mehrotra predictor-corrector; the structure of Kim, Koh, Boyd and
            Gorinevsky's ℓ1 trend filtering), windowed with three pinned
            frames for long clips, then a 1–3 frame zero-phase filter hides
            the kinks between segments.
          </li>
          <li>
            <b>Wobble</b> — a similarity cannot describe parallax, refraction
            through the port or what is left of rolling shutter, so each
            frame pair also gets a homography (4-point MSAC on the
            similarity's inliers, kept only when it fits measurably better
            and looks like a camera motion). Following the paper's wobble
            suppression, keyframes every 30 frames use the smoothed path
            exactly; in between, the residual motion is replayed through the
            chained homographies forward from the previous keyframe and
            backward from the next, blended linearly in time, as a per-vertex
            warp clamped to 2 % of the frame.
          </li>
          <li>
            <b>Zoom</b> — instead of a constant crop, each frame gets the
            smallest zoom that fills the output (measured on the warped
            border, wobble included), smoothed with a 2.5 s rolling maximum
            and a Gaussian, within the <i>Max crop</i> budget. The crop
            breathes slowly and invisibly rather than cropping the whole clip
            for its worst second.
          </li>
          <li>
            <b>Render</b> — a 32×18 WebGL mesh samples the source where the
            warp says each output point came from, for the preview and the
            export alike. Export runs through WebCodecs faster than realtime,
            copies the original audio untouched and streams to on-device
            storage.
          </li>
        </ul>
        <h4>Sliders</h4>
        <p>
          <b>Smoothing</b> is how much of the crop budget the virtual camera
          may use to decouple from the real one; 0 is pass-through.{" "}
          <b>Max crop</b> caps the zoom (0.15 = at most 15 % off each side, a
          1.43× zoom). The actual zoom is usually well below the cap.
        </p>
        <h4>Caveats</h4>
        <p>
          The path is planned on similarities (rotation, zoom, translation);
          the wobble pass only corrects what a single plane-projective motion
          per frame can explain, so strong parallax from nearby coral stays.
          Phones and action cameras already correct rolling shutter in-camera,
          so no per-row readout model is applied: with a guessed readout time
          it adds jello rather than removing it. Clips with a large moving
          subject that fills the frame will follow the subject.
        </p>
        <h4>References</h4>
        <ul>
          <li>
            Grundmann, Kwatra, Essa (2011) —{" "}
            <a href="https://research.google.com/pubs/archive/37041.pdf" target="_blank" rel="noopener noreferrer">
              Auto-Directed Video Stabilization with Robust L1 Optimal Camera Paths (CVPR)
            </a>
          </li>
          <li>
            Bouguet (2000) —{" "}
            <a href="http://robots.stanford.edu/cs223b04/algo_tracking.pdf" target="_blank" rel="noopener noreferrer">
              Pyramidal Implementation of the Lucas Kanade Feature Tracker
            </a>
          </li>
          <li>
            Kim, Koh, Boyd, Gorinevsky (2009) —{" "}
            <a href="https://web.stanford.edu/~boyd/papers/l1_trend_filter.html" target="_blank" rel="noopener noreferrer">
              ℓ1 Trend Filtering (SIAM Review)
            </a>
          </li>
          <li>
            Shi, Tomasi (1994) — Good Features to Track (CVPR); Torr, Zisserman (2000) — MLESAC/MSAC; Zuiderveld (1994) — CLAHE.
          </li>
        </ul>
        <h4>Source</h4>
        <p>
          <a href="https://github.com/majdyz/video" target="_blank" rel="noopener noreferrer">github.com/majdyz/video</a>
        </p>
      </Modal>

      <div
        className={`stage ${mode === "idle" ? "is-empty" : ""}`}
        onClick={(e) => {
          if (mode !== "video" || exporting || !analysisReady || compareActive) return;
          if ((e.target as HTMLElement).closest("button")) return;
          togglePlay();
        }}
      >
        <canvas ref={canvasRef} />
        <video ref={videoRef} style={{ display: "none" }} />
        {mode === "idle" && <PlaceholderDropZone accept="video/*" onPick={handleFile} message="tap to pick a video" />}
        {error && <div className="error">{error}</div>}
        {busy && <BusyOverlay message={busy} onCancel={analysisAbortRef.current ? cancelAnalysis : undefined} />}
        {exporting && <RecordingOverlay currentTime={exportTime} duration={duration} progress={exportProgress} />}
        {mode === "video" && analysisReady && isPaused && !exporting && <PlayOverlay />}
        {mode === "video" && analysisReady && !exporting && (
          <CompareWipe
            active={compareActive}
            value={compareSplit}
            onChange={setCompareSplit}
            onLiveChange={(v) => {
              compareSplitRef.current = v;
              drawCurrentFrame();
            }}
            onToggle={() => setCompareActive((a) => !a)}
            canvasRef={canvasRef}
          />
        )}
      </div>

      {mode === "video" && (
        <Scrubber currentTime={currentTime} duration={duration} disabled={controlsDisabled} onSeek={seekTo} />
      )}

      <section className="panel">
        <FilePickerButton accept="video/*" disabled={exporting} onPick={handleFile}>
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
              <Slider label="Smoothing" value={smoothing} min={0} max={1} step={0.01} onChange={setSmoothing} disabled={controlsDisabled} />
              <Slider label="Max crop" value={crop} min={0} max={0.4} step={0.005} onChange={setCrop} disabled={controlsDisabled} />
            </div>
            {status && <p className="note">{status}</p>}
            <div className="actions">
              {!exporting && (
                <button className="primary" onClick={exportVideo} disabled={controlsDisabled}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="6" fill="currentColor" />
                  </svg>
                  Save stabilised video
                </button>
              )}
              {exporting && (
                <button className="danger" onClick={cancelExport}>
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

/** One-line summary under the sliders. */
function describe(analysis: MotionAnalysis, path: StabilizedPath): string {
  let good = 0;
  for (let t = 0; t < analysis.frameCount; t++) if (analysis.model[t] >= 2) good++;
  const quality = analysis.frameCount ? Math.round((100 * good) / analysis.frameCount) : 0;
  return `${analysis.frameCount} frames · tracked ${quality}% · zoom ${path.stats.meanZoom.toFixed(2)}× (max ${path.stats.maxUsedZoom.toFixed(2)}×)`;
}
