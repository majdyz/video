import { useEffect, useRef, useState } from "react";
import type { Snapshot, Studio } from "../pipeline/studio.ts";
import { processingChain, type ToolsState } from "../pipeline/tools.ts";
import { Sheet } from "./sheet";
import { IconDownload, IconExport, IconShare, IconWarning } from "./icons";
import { formatTime } from "./timeline";

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
  }, [exp.state]);

  const share = async () => {
    const r = exp.result;
    if (!r) return;
    try {
      await navigator.share({ files: [new File([r.blob], r.name, { type: r.blob.type })], title: r.name });
    } catch {
      // dismissed
    }
  };
  const save = () => {
    const r = exp.result;
    if (!r) return;
    const a = document.createElement("a");
    a.href = r.url;
    a.download = r.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const aspect = info ? info.displayW / info.displayH : 16 / 9;
  const pct = Math.round(exp.progress * 100);
  const shareable = exp.result ? canShareFiles(exp.result.blob.type) : false;
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
              <div><dt>Processing</dt><dd>{processingChain(chainTools)}</dd></div>
              <div><dt>Output</dt><dd>{photo ? `${outSize} · JPEG` : `${outSize} · H.264 MP4${info?.hasAudio ? " · original audio" : ""}`}</dd></div>
              {!photo && <div><dt>Length</dt><dd>{formatTime(duration)}</dd></div>}
              {photo && snap.photoLimited && <div><dt>Note</dt><dd>Original is {snap.photoLimited.w}×{snap.photoLimited.h}; this browser renders at most {outSize}</dd></div>}
            </dl>
            <button type="button" className="btn btn--primary btn--block" onClick={() => void studio.exportVideo()}>
              <IconExport size={18} /> {photo ? "Export photo" : "Export video"}
            </button>
            <p className="export__note">
              {photo ? "Rendered on this device at full resolution. Nothing is uploaded."
                : exportMode === "realtime" ? "Plays the clip through once while recording, so it takes about as long as the clip. Nothing is uploaded."
                : "Rendered on this device at full resolution, every frame. Nothing is uploaded."}
            </p>
          </>
        )}

        {running && (
          <>
            <div className="export__progress">
              <div className="export__pct" aria-hidden="true"><span>{pct}</span>%</div>
              <div className="export__meta" aria-live="polite">
                <span>{exp.state === "preparing" ? exp.detail : photo ? exp.detail : `${exp.frames} frames · ${exp.fps.toFixed(1)} fps${exportMode === "realtime" ? " · real time" : ""}`}</span>
                <span>{exp.etaSec !== null && exp.state === "running" && !photo ? `${formatTime(exp.etaSec)} left` : ""}</span>
              </div>
              <div className="bar" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div style={{ width: `${pct}%` }} /></div>
            </div>
            {!photo && <button type="button" className="btn btn--ghost btn--block" onClick={() => studio.cancelExport()}>Cancel</button>}
            <p className="export__note">{exportMode === "realtime" ? "Keep this screen open: switching away pauses the recording." : "Keep this screen open while it renders."}</p>
          </>
        )}

        {exp.state === "done" && exp.result && (
          <>
            <dl className="export__facts">
              <div><dt>File</dt><dd className="mono">{exp.result.name}</dd></div>
              <div><dt>Size</dt><dd>{fmtBytes(exp.result.blob.size)} · {photo ? `${exp.result.width}×${exp.result.height}` : `${exp.result.frames} frames`} in {(exp.result.elapsedMs / 1000).toFixed(1)} s</dd></div>
              {!exp.result.audioIncluded && <div><dt>Audio</dt><dd>Not supported in this browser, video only</dd></div>}
            </dl>
            <div className="export__actions">
              {shareable && (
                <button type="button" className="btn btn--strong" onClick={() => void share()}>
                  <IconShare size={18} /> Share
                </button>
              )}
              <button type="button" className={`btn ${shareable ? "btn--secondary" : "btn--strong"}`} onClick={save}>
                <IconDownload size={18} /> Save
              </button>
            </div>
            <button type="button" className="btn btn--quiet btn--block" onClick={() => { studio.dismissExport(); onClose(); }}>Done</button>
          </>
        )}

        {exp.state === "error" && (
          <>
            <div className="export__error" role="alert"><IconWarning size={18} /> <span>{exp.message}</span></div>
            <button type="button" className="btn btn--strong btn--block" onClick={() => void studio.exportVideo()}>Try again</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
