import { useEffect, useRef, useState } from "react";
import type { Snapshot, Studio } from "../pipeline/studio.ts";
import { processingChain, type ToolsState } from "../pipeline/tools.ts";
import { Sheet } from "./sheet";
import { IconDownload, IconExport, IconShare, IconWarning } from "./icons";
import { formatTime } from "./timeline";
import { formatTimecode, selectionLabel } from "../pipeline/trim.ts";
import { visibleSegments } from "../pipeline/segments.ts";
import { BRAND } from "../brand.ts";
import { isNativeShell } from "../native/registry.ts";

const loadNative = () => import("../native/bridge.ts");
const loadJournal = () => import("@dive-tools/shared/export-journal.ts");

/** What a failed export tells the user: plain words, and whether a 1080p export may get past it. */
export function friendlyExportError(message: string | null): { text: string; suggestSmaller: boolean } {
  const m = message ?? "";
  if (/^(Not enough free space|Couldn't save the video)/.test(m)) return { text: m, suggestSmaller: true };
  if (/storage write failed|QuotaExceeded|out of space|storage wrote/i.test(m)) {
    return { text: "Your device ran out of storage space while saving the video. Free up some space and try again; what's already done is kept.", suggestSmaller: true };
  }
  if (/can't encode|EncodingError|encoder|reclaim|codec/i.test(m) && !/decodable|isn't supported/i.test(m)) {
    return { text: "The phone's video encoder stopped (this can happen when the app goes to the background, or with very large videos). Try again: the export picks up where it stopped.", suggestSmaller: true };
  }
  if (/WebGL|WebGPU|GPU|context lost|device lost/i.test(m)) {
    return { text: "The graphics processor was reset while rendering. Try again: the export picks up where it stopped.", suggestSmaller: true };
  }
  if (/memory|allocation/i.test(m)) return { text: "The device ran low on memory while rendering. Close other apps and try again, or export at 1080p.", suggestSmaller: true };
  return { text: m ? `The export stopped: ${m}` : "The export stopped.", suggestSmaller: false };
}

function fmtBytes(n: number): string {
  return n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

function canShareFiles(type: string): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    return typeof nav.share === "function" && !!nav.canShare?.({ files: [new File([new Blob()], type === "image/jpeg" ? "x.jpg" : "x.mp4", { type })] });
  } catch {
    return false;
  }
}

export function ExportSheet({ open, onClose, studio, snap, tools }: { open: boolean; onClose: () => void; studio: Studio; snap: Snapshot; tools: ToolsState }) {
  const { exp, info, duration, exportMode } = snap;
  const photo = snap.kind === "photo";
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const [hasThumb, setHasThumb] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const native = isNativeShell();
  const running = exp.state === "preparing" || exp.state === "running";
  // Stabilise doesn't apply to photos.
  const chainTools = photo ? { ...tools, stabilise: { ...tools.stabilise, enabled: false } } : tools;

  useEffect(() => {
    if (!open) return;
    return studio.onExportFrame((bmp) => {
      const c = thumbRef.current;
      if (!c) return;
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d")?.drawImage(bmp, 0, 0);
      setHasThumb(true);
    });
  }, [open, studio]);
  useEffect(() => {
    if (exp.state === "idle") setHasThumb(false);
    if (exp.state !== "done") setSaveNote(null);
  }, [exp.state]);

  // An interrupted export of this clip with these settings (crash, reload, failure): offer to resume it.
  const [resumable, setResumable] = useState<{ progress: number; key: string } | null>(null);
  const settingsKey = !photo && exportMode === "offline" && open && (exp.state === "idle" || exp.state === "error") ? studio.exportKey() : null;
  const clip = studio.clipFile;
  useEffect(() => {
    if (!settingsKey || !clip) {
      setResumable(null);
      return;
    }
    let live = true;
    void loadJournal()
      .then((j) => j.findResumable(clip, settingsKey, snap.trim))
      .then((r) => {
        if (live) setResumable(r && r.progress > 0.01 ? { progress: r.progress, key: r.manifest.key } : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [settingsKey, clip, snap.trim]);
  const startOver = async () => {
    if (resumable) await loadJournal().then((j) => j.removeJournal(resumable.key)).catch(() => undefined);
    setResumable(null);
    void studio.exportVideo();
  };
  const err = exp.state === "error" ? friendlyExportError(exp.message) : null;
  const bigSource = !!info && Math.min(info.displayW, info.displayH) > 1080;

  // In the app the output lives (or is copied) in the sandbox and goes to
  // Photos / the gallery and the system share sheet through the plugin.
  const nativeFile = async () => {
    const r = exp.result!;
    const nat = await loadNative();
    if (r.native) return { nat, file: r.native };
    const file = await nat.blobToNativeFile(r.blob!, r.name);
    r.native = file;
    return { nat, file };
  };
  const share = async () => {
    const r = exp.result;
    if (!r) return;
    try {
      if (native) {
        const { nat, file } = await nativeFile();
        await nat.shareOutput(file, r.name);
      } else if (r.blob) {
        await navigator.share({ files: [new File([r.blob], r.name, { type: r.mime })], title: r.name });
      }
    } catch {
      // dismissed
    }
  };
  const save = async () => {
    const r = exp.result;
    if (!r) return;
    if (native) {
      try {
        setSaveNote("Saving…");
        const { nat, file } = await nativeFile();
        const ok = await nat.saveOutput(file, photo ? "photo" : "video", BRAND.name);
        setSaveNote(ok ? "Saved to Photos" : "Not saved: allow access to Photos in Settings");
      } catch (e) {
        setSaveNote(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    if (!r.blob) return;
    const a = document.createElement("a");
    a.href = r.url;
    a.download = r.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const aspect = info ? info.displayW / info.displayH : 16 / 9;
  const pct = Math.round(exp.progress * 100);
  const shareable = exp.result ? native || canShareFiles(exp.result.mime) : false;
  const outSize = info ? `${info.displayW}×${info.displayH}` : "–";

  return (
    <Sheet open={open} onClose={onClose} title={exp.state === "done" ? "Ready" : photo ? "Export photo" : "Export"} locked={running} className="sheet--export">
      <div className="export">
        <div hidden={exp.state === "idle" || exp.state === "error"} className={`export__preview${hasThumb ? " has-frame" : ""}`} style={{ aspectRatio: String(aspect), height: `min(30dvh, calc((min(100vw, 460px) - 48px) / ${aspect.toFixed(4)}))` }}>
          <canvas ref={thumbRef} aria-hidden="true" />
          {!hasThumb && (
            <div className="export__placeholder" aria-hidden="true">
              <IconExport size={22} />
            </div>
          )}
        </div>

        {exp.state === "idle" && (
          <>
            <dl className="export__facts">
              <div><dt>Processing</dt><dd>{processingChain(chainTools, photo ? 1 : visibleSegments(snap.segments.cuts, snap.trim, duration).length)}</dd></div>
              <div><dt>Output</dt><dd>{photo ? `${outSize} · JPEG` : `${outSize}${info?.fps ? ` · ${Math.round(info.fps)} fps` : ""} · MP4${info?.hasAudio ? " · original audio" : ""}`}</dd></div>
              {!photo && <div><dt>Length</dt><dd>{snap.trim ? `${selectionLabel(snap.trim, duration)} · ${formatTimecode(snap.trim.start)}–${formatTimecode(snap.trim.end)}` : formatTime(duration)}</dd></div>}
              {photo && snap.photoLimited && <div><dt>Note</dt><dd>Original is {snap.photoLimited.w}×{snap.photoLimited.h}; this browser renders at most {outSize}</dd></div>}
            </dl>
            {resumable ? (
              <>
                <button type="button" className="btn btn--primary btn--block" onClick={() => void studio.exportVideo()}>
                  <IconExport size={18} /> Resume ({Math.round(resumable.progress * 100)}%)
                </button>
                <button type="button" className="btn btn--quiet btn--block" onClick={() => void startOver()}>Start over</button>
              </>
            ) : (
              <button type="button" className="btn btn--primary btn--block" onClick={() => void studio.exportVideo()}>
                <IconExport size={18} /> {photo ? "Export photo" : "Export video"}
              </button>
            )}
            <p className="export__note">
              {photo ? "Rendered on this device at full resolution. Nothing is uploaded."
                : exportMode === "realtime" ? "Plays the clip through once while recording, so it takes about as long as the clip. Nothing is uploaded."
                : exportMode === "native" ? "Rendered on this device at full resolution, every frame, with the phone's hardware encoder. Nothing is uploaded."
                : "Rendered on this device at full resolution, every frame. Nothing is uploaded."}
            </p>
          </>
        )}

        {running && (
          <>
            <div className="export__progress">
              <div className="export__pct" aria-hidden="true"><span>{pct}</span>%</div>
              <div className="export__meta" aria-live="polite">
                <span>{exp.paused ? "Paused" : exp.state === "preparing" ? exp.detail : photo ? exp.detail : `${exp.frames} frames · ${exp.fps.toFixed(1)} fps${exportMode === "realtime" ? " · real time" : ""}`}</span>
                <span>{exp.etaSec !== null && exp.state === "running" && !photo && !exp.paused ? `${formatTime(exp.etaSec)} left` : ""}</span>
              </div>
              <div className="bar" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div style={{ width: `${pct}%` }} /></div>
            </div>
            {!photo && <button type="button" className="btn btn--ghost btn--block" onClick={() => studio.cancelExport()}>Cancel</button>}
            {exp.note && <p className="export__note" role="status">{exp.note}</p>}
            <p className="export__note">{exp.paused ? "Paused while the app is in the background: it carries on when you come back."
              : exportMode === "realtime" ? "Keep this screen open: switching away pauses the recording."
              : exportMode === "native" ? "You can switch apps: the export carries on or pauses until you come back, and progress shows on the Lock Screen or in notifications."
              : "Keep this screen open while it renders. If it's interrupted, it picks up where it stopped."}</p>
          </>
        )}

        {exp.state === "done" && exp.result && (
          <>
            <dl className="export__facts">
              <div><dt>File</dt><dd className="mono">{exp.result.name}</dd></div>
              <div><dt>Size</dt><dd>{fmtBytes(exp.result.bytes)} · {photo ? `${exp.result.width}×${exp.result.height}` : `${exp.result.frames} frames`} in {(exp.result.elapsedMs / 1000).toFixed(1)} s</dd></div>
              {!photo && <div><dt>Video</dt><dd>{exp.result.width}×{exp.result.height}</dd></div>}
              {!exp.result.audioIncluded && <div><dt>Audio</dt><dd>Not supported in this browser, video only</dd></div>}
            </dl>
            {exp.note && <p className="export__note" role="status">{exp.note}</p>}
            <div className="export__actions">
              {shareable && (
                <button type="button" className="btn btn--strong" onClick={() => void share()}>
                  <IconShare size={18} /> Share
                </button>
              )}
              <button type="button" className={`btn ${shareable ? "btn--secondary" : "btn--strong"}`} onClick={() => void save()}>
                <IconDownload size={18} /> {native ? "Save to Photos" : "Save"}
              </button>
            </div>
            {saveNote && <p className="export__note" role="status">{saveNote}</p>}
            <button type="button" className="btn btn--quiet btn--block" onClick={() => { studio.dismissExport(); onClose(); }}>Done</button>
          </>
        )}

        {exp.state === "error" && (
          <>
            <div className="export__error" role="alert"><IconWarning size={18} /> <span>{err?.text}</span></div>
            <button type="button" className="btn btn--strong btn--block" onClick={() => void studio.exportVideo()}>
              {resumable ? `Try again (from ${Math.round(resumable.progress * 100)}%)` : "Try again"}
            </button>
            {!photo && bigSource && (err?.suggestSmaller ?? true) && (
              <button type="button" className="btn btn--quiet btn--block" onClick={() => void studio.exportVideo({ maxLongEdge: 1920 })}>Export at 1080p</button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
