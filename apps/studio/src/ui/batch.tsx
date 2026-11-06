import { useEffect, useRef, useState } from "react";
import type { Snapshot, Studio } from "../pipeline/studio.ts";
import { processingChain, type ToolsState } from "../pipeline/tools.ts";
import { batchFiles, batchZip, canShareJpegs, kindOf, shareGroups, ZIP_MAX_BYTES, type BatchKind, type BatchOutput } from "../pipeline/batch.ts";
import { crumb } from "../pipeline/crumbs.ts";
import { releaseExportBlob } from "@dive-tools/shared/output-sink.ts";
import { BRAND } from "../brand.ts";
import { isNativeShell } from "../native/registry.ts";
import { Sheet } from "./sheet";
import { IconCheck, IconDownload, IconExport, IconFilm, IconShare, IconWarning } from "./icons";
import { friendlyExportError } from "./export-sheet";

/** One file of a batch: the picked file, a small preview, and how its export went. */
export type BatchItem = { file: File; kind: BatchKind; thumb: string | null; status?: "done" | "failed"; error?: string };

const THUMB_PX = 112;

async function thumbOfVideo(file: File): Promise<ImageBitmap | null> {
  const v = document.createElement("video");
  const url = URL.createObjectURL(file);
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  try {
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      v.onloadeddata = () => { clearTimeout(t); resolve(); };
      v.onerror = () => { clearTimeout(t); reject(new Error("decode")); };
    });
    if (v.duration > 0.5) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 2000);
        v.onseeked = () => { clearTimeout(t); resolve(); };
        v.currentTime = Math.min(1, v.duration / 3);
      });
    }
    if (!v.videoWidth) return null;
    return await createImageBitmap(v, { resizeHeight: THUMB_PX, resizeQuality: "medium" });
  } catch {
    return null;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

async function thumbOfPhoto(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image", resizeHeight: THUMB_PX, resizeQuality: "medium" });
  } catch {
    // Safari decodes HEIC through <img> even where createImageBitmap(blob) refuses.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img, { resizeHeight: THUMB_PX, resizeQuality: "medium" });
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** A small JPEG preview (object URL) of a photo or a clip's early frame; null where the browser can't decode it. */
export async function makeThumb(file: File): Promise<string | null> {
  const bmp = kindOf(file) === "photo" ? await thumbOfPhoto(file) : await thumbOfVideo(file);
  if (!bmp) return null;
  try {
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.8));
    c.width = c.height = 0;
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    bmp.close();
  }
}

/** The batch under the picture: every file as a thumbnail (tap to preview / tweak it), the open one ringed. */
export function BatchStrip({ items, active, onSelect, disabled }: { items: BatchItem[]; active: File | null; onSelect: (f: File) => void; disabled?: boolean }) {
  const idx = items.findIndex((it) => it.file === active);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [idx]);
  const videos = items.filter((it) => it.kind === "video").length;
  return (
    <div className="batch" data-testid="batch-strip">
      <div className="batch__meta">
        <span className="batch__count">{idx >= 0 ? `${idx + 1} of ${items.length}` : `${items.length} files`}</span>
        <span className="batch__name">{active?.name ?? ""}</span>
        <span className="batch__hint">{videos && videos < items.length ? `${items.length - videos} photos · ${videos} videos · ` : ""}Edits apply to all</span>
      </div>
      <ul className="batch__strip" aria-label="Files in this batch">
        {items.map((it, i) => {
          const on = it.file === active;
          return (
            <li key={`${i}:${it.file.name}`}>
              <button ref={on ? activeRef : undefined} type="button" className={`batch__thumb${on ? " is-on" : ""}${it.status ? ` is-${it.status}` : ""}`}
                aria-label={`${it.file.name}${it.status === "failed" ? ", failed" : it.status === "done" ? ", exported" : ""}`} aria-current={on || undefined}
                title={it.error ?? it.file.name} onClick={() => !on && onSelect(it.file)} disabled={disabled}>
                {it.thumb ? <img src={it.thumb} alt="" draggable={false} /> : <span className="batch__ph" aria-hidden="true">{i + 1}</span>}
                {it.kind === "video" && <span className="batch__kind" aria-hidden="true"><IconFilm size={11} /></span>}
                {it.status === "failed" && <span className="batch__badge batch__badge--bad" aria-hidden="true"><IconWarning size={12} /></span>}
                {it.status === "done" && <span className="batch__badge" aria-hidden="true"><IconCheck size={12} /></span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function fmtBytes(n: number): string {
  return n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

type Run =
  | { state: "idle" }
  | { state: "running"; index: number; name: string; kind: BatchKind; cancelling: boolean }
  | { state: "done"; outputs: BatchOutput[]; failed: { name: string; reason: string }[]; cancelled: boolean; total: number; elapsedMs: number };

/** Share on phones (one sheet per group: "Save N Images" on iPhone), a ZIP / downloads elsewhere. */
function shareMode(): boolean {
  return canShareJpegs() && matchMedia("(pointer: coarse)").matches;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Export all: every file opened in turn (its own colour analysis / scene
 * lock, motion analysis for Stabilise), exported with the current tools
 * through the same path as a single export, one file at a time; a file that
 * fails is skipped and listed.
 */
export function BatchSheet({ open, onClose, onSingle, studio, snap, items, setItems, tools, openItem }: {
  open: boolean;
  onClose: () => void;
  /** Export only the open file (the usual export sheet). */
  onSingle: () => void;
  studio: Studio;
  snap: Snapshot;
  items: BatchItem[];
  setItems: (fn: (it: BatchItem[]) => BatchItem[]) => void;
  tools: ToolsState;
  /** Opens one file of the batch in the studio (resolves once it is ready, or failed). */
  openItem: (f: File) => Promise<void>;
}) {
  const [run, setRun] = useState<Run>({ state: "idle" });
  const [group, setGroup] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef(false);
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const [hasThumb, setHasThumb] = useState(false);
  const native = isNativeShell();
  const share = !native && shareMode();
  const running = run.state === "running";
  const n = items.length;
  const nVideos = items.filter((it) => it.kind === "video").length;
  const nPhotos = n - nVideos;
  const noun = nVideos === 0 ? "photos" : nPhotos === 0 ? "videos" : "files";

  useEffect(() => {
    if (!open || !running) return;
    return studio.onExportFrame((bmp) => {
      const c = thumbRef.current;
      if (!c) return;
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d")?.drawImage(bmp, 0, 0);
      setHasThumb(true);
    });
  }, [open, running, studio]);

  // The finished files (a video export lives in private storage until released) go with the run.
  const outputsRef = useRef<BatchOutput[]>([]);
  const release = () => {
    for (const o of outputsRef.current) void releaseExportBlob(o.blob);
    outputsRef.current = [];
  };
  useEffect(() => release, []);

  const exportOne = async (item: BatchItem): Promise<BatchOutput | null> => {
    const file = item.file;
    // Its own analysis (depth and light differ file to file); the tools as they are now on top.
    await openItem(file);
    // The dewarp lens a clip's metadata names lands through React state: let it reach the studio.
    await new Promise((r) => setTimeout(r, 60));
    const s0 = studio.getSnapshot();
    if (studio.clipFile !== file || s0.phase !== "ready" || s0.error) throw new Error(s0.error ?? "It didn't open");
    if (cancel.current) return null;
    if (s0.kind === "photo") {
      const r = await studio.renderOpenPhoto();
      return { name: r.name, kind: "photo", blob: r.blob, native: null, size: r.blob.size, mime: "image/jpeg", width: r.width, height: r.height };
    }
    await studio.exportVideo();
    const s1 = studio.getSnapshot();
    // Held by the batch from here (released when the batch sheet closes).
    const r = studio.takeExportResult();
    if (r) {
      if (r.url.startsWith("blob:")) URL.revokeObjectURL(r.url);
      return { name: r.name, kind: "video", blob: r.blob, native: r.native, size: r.bytes, mime: r.mime, width: r.width, height: r.height };
    }
    if (s1.exp.state === "idle" && cancel.current) return null;
    throw new Error(s1.exp.state === "error" ? friendlyExportError(s1.exp.message).text : "The export stopped");
  };

  const start = async () => {
    release();
    cancel.current = false;
    setGroup(0);
    setNote(null);
    setItems((it) => it.map((x) => ({ ...x, status: undefined, error: undefined })));
    crumb(`batch export ${nPhotos} photos, ${nVideos} videos`);
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    const lock = await wl?.request("screen").catch(() => null);
    const t0 = performance.now();
    const outputs: BatchOutput[] = [];
    const failed: { name: string; reason: string }[] = [];
    const mark = (f: File, status: "done" | "failed", error?: string) => setItems((it) => it.map((x) => (x.file === f ? { ...x, status, error } : x)));
    for (let i = 0; i < items.length && !cancel.current; i++) {
      const it = items[i];
      setHasThumb(false);
      setRun({ state: "running", index: i, name: it.file.name, kind: it.kind, cancelling: false });
      try {
        studio.clearError();
        const out = await exportOne(it);
        if (out) {
          outputs.push(out);
          outputsRef.current = outputs.slice();
          mark(it.file, "done");
        }
      } catch (err) {
        if (isAbort(err) && cancel.current) break;
        const raw = err instanceof Error ? err.message : String(err);
        const reason = /createImageBitmap|ImageBitmap|decode|EncodingError|source image/i.test(raw) && it.kind === "photo" ? "couldn't read it (damaged, or a format this browser can't open)" : raw;
        console.warn(`[batch] ${it.file.name} skipped: ${raw}`);
        failed.push({ name: it.file.name, reason });
        mark(it.file, "failed", reason);
        studio.clearError();
      }
    }
    // A file that failed leaves the studio empty: back to one that worked, so the strip stays.
    if (studio.getSnapshot().phase !== "ready") {
      const bad = new Set(failed.map((f) => f.name));
      const ok = items.find((x) => !bad.has(x.file.name));
      if (ok) await openItem(ok.file).catch(() => undefined);
    }
    await lock?.release().catch(() => undefined);
    console.info(`[batch] ${outputs.length}/${items.length} exported, ${failed.length} failed${cancel.current ? ", cancelled" : ""}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    setRun({ state: "done", outputs, failed, cancelled: cancel.current, total: items.length, elapsedMs: performance.now() - t0 });
  };

  const stop = () => {
    if (run.state !== "running") return;
    cancel.current = true;
    setRun({ ...run, cancelling: true });
    // A video stops now (its partial file is dropped); a photo finishes its one render.
    if (run.kind === "video") studio.cancelExport();
  };

  const close = () => {
    if (running) return;
    release();
    setRun({ state: "idle" });
    setNote(null);
    onClose();
  };

  const outputs = run.state === "done" ? run.outputs : [];
  const groups = share ? shareGroups(outputs) : [];
  const bytes = outputs.reduce((s, o) => s + o.size, 0);
  const zipOk = !native && bytes <= ZIP_MAX_BYTES && outputs.every((o) => o.blob);

  const doShare = async () => {
    const g = groups[group];
    if (!g) return;
    const files = batchFiles(g);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.canShare && !nav.canShare({ files })) throw new Error("this browser can't share these files");
      await navigator.share({ files, title: `${BRAND.name} ${noun}` });
      setNote(null);
      setGroup((k) => k + 1);
    } catch (e) {
      if (isAbort(e)) return; // dismissed
      setNote(`The share sheet didn't open (${e instanceof Error ? e.message : String(e)}). ${zipOk ? "Download the ZIP instead." : "Save the files one by one instead."}`);
    }
  };
  const doZip = async () => {
    setBusy(true);
    setNote("Preparing the ZIP…");
    try {
      const zip = await batchZip(outputs);
      download(zip, `${BRAND.name.toLowerCase()}-${outputs.length}-${noun}.zip`);
      setNote(null);
    } catch (e) {
      setNote(`The ZIP failed (${e instanceof Error ? e.message : String(e)}). Save the files one by one instead.`);
    } finally {
      setBusy(false);
    }
  };
  const doEach = async () => {
    setBusy(true);
    const names = batchFiles(outputs);
    for (let i = 0; i < names.length; i++) {
      setNote(`Downloading ${i + 1}/${names.length}…`);
      download(names[i], names[i].name);
      // Browsers drop downloads started in the same tick.
      await new Promise((r) => setTimeout(r, 600));
    }
    setNote(`${names.length} downloads started`);
    setBusy(false);
  };
  const doNative = async () => {
    setBusy(true);
    const nat = await import("../native/bridge.ts");
    let saved = 0;
    for (let i = 0; i < outputs.length; i++) {
      const o = outputs[i];
      setNote(`Saving ${i + 1}/${outputs.length}…`);
      try {
        const f = (o.native as Awaited<ReturnType<typeof nat.blobToNativeFile>> | null) ?? (o.blob ? await nat.blobToNativeFile(o.blob, o.name) : null);
        if (f && (await nat.saveOutput(f, o.kind, BRAND.name))) saved++;
      } catch { /* counted below */ }
    }
    setNote(saved === outputs.length ? `Saved ${saved} to Photos` : `Saved ${saved} of ${outputs.length}: allow access to Photos in Settings`);
    setBusy(false);
  };

  const shared = Math.min(group, groups.length);
  const nextFrom = groups.slice(0, shared).reduce((s, g) => s + g.length, 0) + 1;
  const nextTo = nextFrom + (groups[shared]?.length ?? 0) - 1;
  const chainTools = nVideos ? tools : { ...tools, stabilise: { ...tools.stabilise, enabled: false } };
  const fileProgress = run.state === "running" && run.kind === "video" && (snap.exp.state === "running" || snap.exp.state === "preparing") ? snap.exp.progress : 0;
  const overall = run.state === "running" ? Math.round(((run.index + fileProgress) / n) * 100) : 100;
  const fileDetail = run.state === "running" && run.kind === "video"
    ? snap.exp.state === "running" ? `${Math.round(snap.exp.progress * 100)}% · ${snap.exp.frames} frames` : snap.exp.state === "preparing" ? snap.exp.detail : snap.busy ?? "Opening…"
    : run.state === "running" ? snap.busy ?? "Rendering" : "";

  return (
    <Sheet open={open} onClose={close} title={run.state === "done" ? (run.outputs.length ? "Ready" : "Nothing exported") : `Export ${n} ${noun}`} locked={running} className="sheet--export sheet--batch">
      <div className="export">
        {run.state === "idle" && (
          <>
            <dl className="export__facts">
              <div><dt>Files</dt><dd>{[nPhotos && `${nPhotos} photo${nPhotos > 1 ? "s" : ""}`, nVideos && `${nVideos} video${nVideos > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</dd></div>
              <div><dt>Processing</dt><dd>{processingChain(chainTools, 1)}</dd></div>
              <div><dt>Colour</dt><dd>{tools.colour.enabled ? `Balanced for each ${nVideos ? "file" : "photo"}, your adjustments on all` : "Off"}</dd></div>
              {nVideos > 0 && nPhotos > 0 && tools.stabilise.enabled && <div><dt>Stabilise</dt><dd>Videos only</dd></div>}
              <div><dt>Output</dt><dd>{[nPhotos && "full-resolution JPEGs", nVideos && "MP4s"].filter(Boolean).join(", ")}, original details kept</dd></div>
              <div><dt>Saved as</dt><dd>{native ? "Photos" : share ? "Share sheet (Save to Photos)" : nVideos ? "ZIP or one download each" : "One ZIP file"}</dd></div>
            </dl>
            <button type="button" className="btn btn--primary btn--block" onClick={() => void start()} data-testid="batch-export-all">
              <IconExport size={18} /> Apply to all and export {n}
            </button>
            <button type="button" className="btn btn--quiet btn--block" onClick={onSingle}>Export only this {snap.kind === "video" ? "video" : "photo"}</button>
            <p className="export__note">One file at a time on this device{nVideos ? "; videos take a while each" : ""}. Nothing is uploaded.</p>
          </>
        )}

        {run.state === "running" && (
          <>
            <div className={`export__preview batch__preview${hasThumb ? " has-frame" : ""}`}>
              <canvas ref={thumbRef} aria-hidden="true" />
              {!hasThumb && <div className="export__placeholder" aria-hidden="true"><IconExport size={22} /></div>}
            </div>
            <div className="export__progress">
              <div className="export__pct" aria-hidden="true" data-testid="batch-count"><span>{run.index + 1}</span>/{n}</div>
              <div className="export__meta" aria-live="polite">
                <span className="batch__file">{run.cancelling ? `Stopping${run.kind === "photo" ? " after this photo" : ""}…` : run.name}</span>
                <span>{fileDetail}</span>
              </div>
              <div className="bar" role="progressbar" aria-label="Batch progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall}><div style={{ width: `${overall}%` }} /></div>
            </div>
            <button type="button" className="btn btn--ghost btn--block" disabled={run.cancelling} data-testid="batch-cancel" onClick={stop}>Cancel</button>
            <p className="export__note">Keep this screen open while it renders.</p>
          </>
        )}

        {run.state === "done" && (
          <>
            <dl className="export__facts" data-testid="batch-result">
              <div><dt>Exported</dt><dd>{run.outputs.length} of {run.total}{run.cancelled ? " (stopped)" : ""}</dd></div>
              {run.outputs.length > 0 && <div><dt>Size</dt><dd>{fmtBytes(bytes)} in {(run.elapsedMs / 1000).toFixed(1)} s</dd></div>}
              {run.failed.map((f, i) => (
                <div key={`${i}:${f.name}`} className="batch__failed"><dt>Skipped</dt><dd><span className="mono">{f.name}</span>: {f.reason}</dd></div>
              ))}
            </dl>
            {run.outputs.length > 0 && (
              <div className="export__actions export__actions--stack">
                {native && (
                  <button type="button" className="btn btn--strong" onClick={() => void doNative()} disabled={busy}><IconDownload size={18} /> Save all to Photos</button>
                )}
                {share && shared < groups.length && (
                  <button type="button" className="btn btn--strong" onClick={() => void doShare()} data-testid="batch-share">
                    <IconShare size={18} />
                    {groups.length === 1 ? `Save ${run.outputs.length} ${noun}` : shared === 0 ? `Share ${nextFrom}–${nextTo} of ${run.outputs.length}` : `Share next batch (${nextFrom}–${nextTo})`}
                  </button>
                )}
                {share && groups.length > 0 && shared >= groups.length && <p className="export__note" role="status">All {run.outputs.length} shared</p>}
                {zipOk && (
                  <button type="button" className={`btn ${share ? "btn--secondary" : "btn--strong"}`} onClick={() => void doZip()} disabled={busy} data-testid="batch-zip">
                    <IconDownload size={18} /> Download ZIP ({fmtBytes(bytes)})
                  </button>
                )}
                {!native && (!share || !zipOk) && (nVideos > 0 || !zipOk) && (
                  <button type="button" className={`btn ${zipOk || share ? "btn--quiet" : "btn--strong"}`} onClick={() => void doEach()} disabled={busy} data-testid="batch-each">
                    <IconDownload size={18} /> Download each file
                  </button>
                )}
              </div>
            )}
            {note && <p className="export__note" role="status">{note}</p>}
            <button type="button" className="btn btn--quiet btn--block" onClick={close} disabled={busy}>Done</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
