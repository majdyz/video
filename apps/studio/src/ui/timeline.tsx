import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconPause, IconPlay } from "./icons";
import { formatClock, formatTimecode, fullRange, isTrimmed, moveHandle, pctOf, selectionLabel, timeAtX, type TrimRange } from "../pipeline/trim.ts";

export function formatTime(s: number): string {
  return formatClock(s);
}

/** Width of a trim handle (px); the handles sit just outside the selection, so they never overlap. */
const HANDLE_W = 14;
/** Half the touch target around a handle (44 px). */
const HIT_HALF = 22;

type Drag = { kind: "in" | "out"; range: TrimRange } | { kind: "scrub"; t: number };

/**
 * Play/pause, the trim strip (filmstrip, in/out handles, playhead) and the
 * clock. Dragging a handle shows its frame and timecode; releasing it
 * commits the range (the Studio then re-runs what depends on it). The
 * playhead stays between the handles, and playback loops there.
 */
export function Timeline({
  time,
  duration,
  playing,
  disabled,
  trim,
  thumbs,
  onToggle,
  onSeek,
  onTrim,
  children,
}: {
  time: number;
  duration: number;
  playing: boolean;
  disabled?: boolean;
  trim: TrimRange | null;
  thumbs: string[] | null;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onTrim: (r: TrimRange | null, commit: boolean) => void;
  children?: ReactNode;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const range = drag?.kind === "in" || drag?.kind === "out" ? drag.range : trim ?? fullRange(duration);
  const trimmed = isTrimmed(range, duration);
  const shown = drag?.kind === "scrub" ? drag.t : drag?.kind === "in" ? range.start : drag?.kind === "out" ? range.end : time;
  const inPct = pctOf(range.start, duration);
  const outPct = pctOf(range.end, duration);
  const headPct = pctOf(shown, duration);
  const live = !disabled && duration > 0;

  const xOf = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, w: r.width };
  };
  /** A press near a handle grabs it (the nearer one), anywhere else scrubs. */
  const grab = (clientX: number): Drag => {
    const { x, w } = xOf(clientX);
    const xi = (inPct / 100) * w - HANDLE_W / 2;
    const xo = (outPct / 100) * w + HANDLE_W / 2;
    const di = Math.abs(x - xi), dout = Math.abs(x - xo);
    if (Math.min(di, dout) <= HIT_HALF) return di < dout || (di === dout && x < xi) ? { kind: "in", range } : { kind: "out", range };
    return { kind: "scrub", t: timeAtX(x, w, duration) };
  };
  const follow = (d: Drag, clientX: number): Drag => {
    const { x, w } = xOf(clientX);
    // Handles are grabbed by their middle: the edge they mark is half a handle further in.
    if (d.kind === "in") return { kind: "in", range: moveHandle(d.range, "in", timeAtX(x + HANDLE_W / 2, w, duration), duration) };
    if (d.kind === "out") return { kind: "out", range: moveHandle(d.range, "out", timeAtX(x - HANDLE_W / 2, w, duration), duration) };
    return { kind: "scrub", t: Math.min(range.end, Math.max(range.start, timeAtX(x, w, duration))) };
  };
  const apply = (d: Drag, commit: boolean) => {
    if (d.kind === "scrub") onSeek(d.t);
    else {
      onTrim(d.range, commit);
      // Show the frame at the handle being moved (the out point is exclusive: one frame before it).
      onSeek(d.kind === "in" ? d.range.start : Math.max(d.range.start, d.range.end - 0.04));
    }
  };

  const nudge = (which: "in" | "out", dt: number) => {
    const r = moveHandle(range, which, (which === "in" ? range.start : range.end) + dt, duration);
    onTrim(r, true);
    onSeek(which === "in" ? r.start : Math.max(r.start, r.end - 0.04));
  };
  const handleKeys = (which: "in" | "out") => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); nudge(which, step); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); nudge(which, -step); }
    else if (e.key === "Home") { e.preventDefault(); nudge(which, -duration); }
    else if (e.key === "End") { e.preventDefault(); nudge(which, duration); }
  };

  const tip = drag && drag.kind !== "scrub" ? (
    <div className="trim__tip" style={{ left: `${drag.kind === "in" ? inPct : outPct}%` }} aria-hidden="true">
      {formatTimecode(drag.kind === "in" ? range.start : range.end)}
    </div>
  ) : null;

  return (
    <div className={`timeline${disabled ? " is-disabled" : ""}${trimmed ? " is-trimmed" : ""}${drag ? " is-dragging" : ""}`}>
      <button type="button" className="timeline__play" aria-label={playing ? "Pause" : "Play"} onClick={onToggle} disabled={disabled}>
        {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
      </button>
      <div
        className="trim"
        onPointerDown={(e) => {
          if (!live || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const d = grab(e.clientX);
          const moved = d.kind === "scrub" ? follow(d, e.clientX) : d;
          setDrag(moved);
          if (moved.kind === "scrub") apply(moved, false);
          else onSeek(moved.kind === "in" ? moved.range.start : Math.max(moved.range.start, moved.range.end - 0.04));
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const d = follow(drag, e.clientX);
          setDrag(d);
          apply(d, false);
        }}
        onPointerUp={() => {
          if (drag && drag.kind !== "scrub") apply(drag, true);
          setDrag(null);
        }}
        onPointerCancel={() => {
          if (drag && drag.kind !== "scrub") apply(drag, true);
          setDrag(null);
        }}
      >
        <div
          ref={stripRef}
          className="trim__strip"
          role="slider"
          aria-label="Position"
          aria-valuemin={Math.round(range.start * 10) / 10}
          aria-valuemax={Math.round(range.end * 10) / 10}
          aria-valuenow={Math.round(shown * 10) / 10}
          aria-valuetext={`${formatTimecode(shown)}, ${selectionLabel(range, duration)}`}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onSeek(Math.min(range.end, time + 1)); }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onSeek(Math.max(range.start, time - 1)); }
            if (e.key === "Home") { e.preventDefault(); onSeek(range.start); }
            if (e.key === "End") { e.preventDefault(); onSeek(range.end); }
            if (e.key === " ") { e.preventDefault(); onToggle(); }
          }}
        >
          <div className={`trim__film${thumbs ? " has-thumbs" : ""}`} aria-hidden="true">
            {thumbs?.map((src, i) => (src ? <img key={i} src={src} alt="" draggable={false} /> : <span key={i} />))}
          </div>
          <div className="trim__shade" style={{ left: 0, width: `${inPct}%` }} aria-hidden="true" />
          <div className="trim__shade" style={{ left: `${outPct}%`, right: 0 }} aria-hidden="true" />
          <div className="trim__sel" style={{ left: `${inPct}%`, width: `${outPct - inPct}%` }} aria-hidden="true" />
          <div className="trim__head" style={{ left: `${headPct}%` }} aria-hidden="true" />
          <div
            className="trim__handle trim__handle--in"
            style={{ left: `${inPct}%` }}
            role="slider"
            aria-label="Trim start"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 10) / 10}
            aria-valuenow={Math.round(range.start * 10) / 10}
            aria-valuetext={formatTimecode(range.start)}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={handleKeys("in")}
          />
          <div
            className="trim__handle trim__handle--out"
            style={{ left: `${outPct}%` }}
            role="slider"
            aria-label="Trim end"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 10) / 10}
            aria-valuenow={Math.round(range.end * 10) / 10}
            aria-valuetext={formatTimecode(range.end)}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={handleKeys("out")}
          />
          {tip}
        </div>
      </div>
      <div className="timeline__meta">
        <span className="timeline__clock" aria-hidden="true">
          {drag && drag.kind !== "scrub" ? `${formatTimecode(range.start)} – ${formatTimecode(range.end)}` : formatTimecode(shown)}
        </span>
        <span className="timeline__sel" aria-live="polite">{selectionLabel(range, duration)}</span>
        {trimmed && (
          <button type="button" className="timeline__reset" onClick={() => onTrim(null, true)} disabled={disabled} aria-label="Reset trim to the full clip">
            Reset
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
