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
  exportWithCodec,
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
import { DEFAULT_SETTINGS, type UserSettings } from "./engine/params";
import type { Rotation } from "./engine/backend";

type Mode = "idle" | "photo" | "video";

// The exporter analyses every Nth decoded frame; the smoother carries the
// grade across the frames in between exactly as it does in the preview.
const EXPORT_ANALYSIS_STRIDE = 4;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [compareActive, setCompareActive] = useState(false);
  const [compareSplit, setCompareSplit] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportTime, setExportTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [engineKind, setEngineKind] = useState<"webgpu" | "webgl2" | null>(null);
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
      e.upload(v, v.videoWidth, v.videoHeight, 0);
      e.render();
    }
  }

  const { currentTime, isPaused } = useVideoPlaybackState(videoRef, mode === "video", () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    renderVideoFrame(v);
  });

  function renderVideoFrame(v: HTMLVideoElement) {
    const e = engineRef.current;
    if (!e) return;
    e.upload(v, v.videoWidth, v.videoHeight, 0);
    e.tick(v.currentTime);
    e.render();
  }

  type VideoWithRVFC = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, metadata: unknown) => void) => number;
  };

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
    await e.analyzeNow(true);
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
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error("Could not decode this video"));
      };
      const cleanup = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onErr);
      };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("error", onErr);
      if (video.readyState >= 2) onReady();
    });
    if (myGen !== fileGenRef.current) return;
    setDuration(video.duration || 0);
    modeRef.current = "video";
    setMode("video");
    // First frame: analyse and snap before anything is shown, so the clip
    // never flashes uncorrected.
    e.upload(video, video.videoWidth, video.videoHeight, 0);
    await e.analyzeNow(true);
    if (myGen !== fileGenRef.current) return;
    e.render();
    await video.play().catch(() => undefined);
    startPreview();
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
    // Export has its own temporal state: start clean so the first frame
    // snaps to its own analysis instead of inheriting the preview's.
    e.reset();
    let frames = 0;
    try {
      const result = await exportWithCodec(
        file,
        async (sample, info) => {
          const frame = sample.toVideoFrame();
          try {
            const rot = (info.rotation / 90) as Rotation;
            e.upload(frame, frame.displayWidth, frame.displayHeight, rot);
            if (frames % EXPORT_ANALYSIS_STRIDE === 0) await e.analyzeNow(frames === 0);
            e.tick(info.timeSec);
            frames++;
            return await e.renderToFrame(rot, frame.timestamp, frame.duration ?? undefined);
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
      exportAbortRef.current = null;
      exportingRef.current = false;
      releaseWakeLock();
      setExporting(false);
      setExportProgress(0);
      setExportTime(0);
      // Back to the preview with a fresh analysis of the first frame.
      e.reset();
      try {
        video.currentTime = 0;
      } catch {
        // ignore
      }
      if (fileRef.current === file) {
        e.upload(video, video.videoWidth, video.videoHeight, 0);
        await e.analyzeNow(true);
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
        </p>
      </Modal>

      <div
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
        {exporting && <RecordingOverlay currentTime={exportTime} duration={duration} progress={exportProgress} />}
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
              <Slider label="Strength" value={settings.strength} min={0} max={1} step={0.01}
                onChange={(v) => setSettings((s) => ({ ...s, strength: v }))} disabled={exporting} />
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
