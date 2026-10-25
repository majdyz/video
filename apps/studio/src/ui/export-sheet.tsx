import { useEffect, useRef, useState } from "react";
import type { ExportStatus, Studio } from "../pipeline/studio.ts";
import type { ClipInfo } from "../pipeline/probe.ts";
import { processingChain, type ToolsState } from "../pipeline/tools.ts";
import { Sheet } from "./sheet";
import { IconDownload, IconExport, IconShare, IconWarning } from "./icons";
import { formatTime } from "./timeline";

function fmtBytes(n: number): string {
  return n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

function canShareFiles(): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    return typeof nav.share === "function" && !!nav.canShare?.({ files: [new File([new Blob()], "x.mp4", { type: "video/mp4" })] });
  } catch {
    return false;
  }
}

export function ExportSheet({
  open,
  onClose,
  studio,
  exp,
  tools,
  info,
  duration,
}: {
  open: boolean;
  onClose: () => void;
  studio: Studio;
  exp: ExportStatus;
  tools: ToolsState;
  info: ClipInfo | null;
  duration: number;
}) {
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const [hasThumb, setHasThumb] = useState(false);
  const running = exp.state === "preparing" || exp.state === "running";

  useEffect(() => {
    if (!open) return;
    return studio.onThumb((bmp) => {
      const c = thumbRef.current;
      if (c) {
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")?.drawImage(bmp, 0, 0);
        setHasThumb(true);
      }
      bmp.close();
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

  return (
    <Sheet open={open} onClose={onClose} title={exp.state === "done" ? "Ready" : "Export"} locked={running} className="sheet--export">
      <div className="export">
        <div className={`export__preview${hasThumb ? " has-frame" : ""}`} style={{ aspectRatio: String(aspect), height: `min(34dvh, calc((min(100vw, 460px) - 48px) / ${aspect.toFixed(4)}))` }}>
          <canvas ref={thumbRef} />
          {!hasThumb && (
            <div className="export__placeholder">
              <IconExport size={22} />
            </div>
          )}
        </div>

        {exp.state === "idle" && (
          <>
            <dl className="export__facts">
              <div><dt>Processing</dt><dd>{processingChain(tools)}</dd></div>
              <div><dt>Output</dt><dd>{info ? `${info.displayW}×${info.displayH}` : "–"} · H.264 MP4{info?.hasAudio ? " · original audio" : ""}</dd></div>
              <div><dt>Length</dt><dd>{formatTime(duration)}</dd></div>
            </dl>
            <button type="button" className="btn btn--primary btn--block" onClick={() => void studio.exportVideo()}>
              <IconExport size={18} /> Export video
            </button>
            <p className="export__note">Rendered on this device at full resolution. Nothing is uploaded.</p>
          </>
        )}

        {running && (
          <>
            <div className="export__progress">
              <div className="export__pct"><span>{pct}</span>%</div>
              <div className="export__meta">
                <span>{exp.state === "preparing" ? exp.detail : `${exp.frames} frames · ${exp.fps.toFixed(1)} fps`}</span>
                <span>{exp.etaSec !== null && exp.state === "running" ? `${formatTime(exp.etaSec)} left` : ""}</span>
              </div>
              <div className="bar"><div style={{ width: `${pct}%` }} /></div>
            </div>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => studio.cancelExport()}>Cancel</button>
            <p className="export__note">Keep this screen open while it renders.</p>
          </>
        )}

        {exp.state === "done" && exp.result && (
          <>
            <dl className="export__facts">
              <div><dt>File</dt><dd className="mono">{exp.result.name}</dd></div>
              <div><dt>Size</dt><dd>{fmtBytes(exp.result.blob.size)} · {exp.result.frames} frames in {(exp.result.elapsedMs / 1000).toFixed(1)} s</dd></div>
              {!exp.result.audioIncluded && <div><dt>Audio</dt><dd>Not supported in this browser, video only</dd></div>}
            </dl>
            <div className="export__actions">
              {canShareFiles() && (
                <button type="button" className="btn btn--strong" onClick={() => void share()}>
                  <IconShare size={18} /> Share
                </button>
              )}
              <button type="button" className={`btn ${canShareFiles() ? "btn--secondary" : "btn--strong"}`} onClick={save}>
                <IconDownload size={18} /> Save
              </button>
            </div>
            <button type="button" className="btn btn--quiet btn--block" onClick={() => { studio.dismissExport(); onClose(); }}>Done</button>
          </>
        )}

        {exp.state === "error" && (
          <>
            <div className="export__error"><IconWarning size={18} /> <span>{exp.message}</span></div>
            <button type="button" className="btn btn--strong btn--block" onClick={() => void studio.exportVideo()}>Try again</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
