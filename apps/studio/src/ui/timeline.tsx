import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconPause, IconPlay, IconSplit } from "./icons";
import { IconButton } from "./controls";
import { formatClock, formatTimecode, fullRange, isTrimmed, moveHandle, pctOf, selectionLabel, timeAtX, type TrimRange } from "../pipeline/trim.ts";
import { activeCuts, moveCut, segmentAtTime, visibleSegments } from "../pipeline/segments.ts";

export function formatTime(s: number): string {
  return formatClock(s);
}

/** Width of a trim handle (px); the handles sit just outside the selection, so they never overlap. */
const HANDLE_W = 12;
/** Half the touch target around a handle (44 px). */
const HIT_HALF = 22;
/** Room the drag timecode needs beside a handle (px). */
const TIP_W = 56;
/** Half the touch target around a split divider (px). */
const CUT_HIT = 16;
/** A press that moves less than this is a tap (px). */
const TAP_SLOP = 5;

type Drag =
  | { kind: "in" | "out"; range: TrimRange }
  | { kind: "scrub"; t: number; x0: number; moved: boolean }
  | { kind: "cut"; k: number; cuts: number[]; x0: number; moved: boolean };

/**
 * Play/pause, the trim strip (filmstrip, in/out handles, playhead) and the
 * clock. Dragging a handle shows its frame and timecode; releasing it
 * commits the range (the Studio then re-runs what depends on it). The
 * playhead stays between the handles, and playback loops there.
 *
 * Split (the scissors, or S): a divider at the playhead. Tapping a segment
 * selects it (the Colour panel then edits that segment), tapping a divider
 * offers Remove, dragging it moves the cut. Cuts outside the trim are kept
 * but not shown (segments.ts).
 */
export function Timeline({
  time,
  duration,
  playing,
  disabled,
  trim,
  thumbs,
  cuts = [],
  selected = null,
  canSplit = false,
  onToggle,
  onSeek,
  onTrim,
  onSplit,
  onSelect,
  onCuts,
  onRemoveCut,
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
  /** Split points (clip seconds, all of them: the ones outside the trim are hidden). */
  cuts?: number[];
  /** Region index of the selected segment (segments.ts), null = none. */
  selected?: number | null;
  canSplit?: boolean;
  onSplit?: () => void;
  onSelect?: (look: number) => void;
  onCuts?: (cuts: number[], commit: boolean) => void;
  onRemoveCut?: (k: number) => void;
  children?: ReactNode;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Divider whose Remove menu is open (cut index). */
  const [menu, setMenu] = useState<number | null>(null);
  /** Opened from the keyboard: Remove takes focus (a tap leaves focus alone, no ring). */
  const [menuByKey, setMenuByKey] = useState(false);
  const range = drag?.kind === "in" || drag?.kind === "out" ? drag.range : trim ?? fullRange(duration);
  const trimmed = isTrimmed(range, duration);
  const shown = drag?.kind === "scrub" ? drag.t : drag?.kind === "in" ? range.start : drag?.kind === "out" ? range.end : Math.min(range.end, Math.max(range.start, time));
  const inPct = pctOf(range.start, duration);
  const outPct = pctOf(range.end, duration);
  const headPct = pctOf(shown, duration);
  const live = !disabled && duration > 0;
  const shownCuts = drag?.kind === "cut" ? drag.cuts : cuts;
  const act = activeCuts(shownCuts, range, duration);
  const segs = visibleSegments(shownCuts, range, duration);
  const split = segs.length > 1;
  const selSeg = split ? segs.find((g) => g.look === selected) ?? null : null;

  // The Remove menu closes on a press elsewhere, Escape, or when its divider goes away.
  useEffect(() => {
    if (menu === null) return;
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const menuOn = menu !== null && act.includes(menu) && !disabled;

  const xOf = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, w: r.width };
  };
  /** A press near a handle or a divider grabs it (the nearest), anywhere else scrubs. */
  const grab = (clientX: number): Drag => {
    const { x, w } = xOf(clientX);
    const xi = (inPct / 100) * w - HANDLE_W / 2;
    const xo = (outPct / 100) * w + HANDLE_W / 2;
    const di = Math.abs(x - xi), dout = Math.abs(x - xo);
    let cut: { k: number; d: number } | null = null;
    if (onCuts) for (const k of act) {
      const d = Math.abs(x - (pctOf(cuts[k], duration) / 100) * w);
      if (d <= CUT_HIT && (!cut || d < cut.d)) cut = { k, d };
    }
    const dh = Math.min(di, dout);
    if (dh <= HIT_HALF && (!cut || dh < cut.d)) return di < dout || (di === dout && x < xi) ? { kind: "in", range } : { kind: "out", range };
    if (cut) return { kind: "cut", k: cut.k, cuts, x0: x, moved: false };
    return { kind: "scrub", t: timeAtX(x, w, duration), x0: x, moved: false };
  };
  const follow = (d: Drag, clientX: number): Drag => {
    const { x, w } = xOf(clientX);
    // Handles are grabbed by their middle: the edge they mark is half a handle further in.
    if (d.kind === "in") return { kind: "in", range: moveHandle(d.range, "in", timeAtX(x + HANDLE_W / 2, w, duration), duration) };
    if (d.kind === "out") return { kind: "out", range: moveHandle(d.range, "out", timeAtX(x - HANDLE_W / 2, w, duration), duration) };
    if (d.kind !== "scrub" && d.kind !== "cut") return d;
    const moved = d.moved || Math.abs(x - d.x0) > TAP_SLOP;
    if (d.kind === "cut") return moved ? { ...d, moved, cuts: moveCut(cuts, d.k, timeAtX(x, w, duration), range, duration) } : d;
    return { kind: "scrub", t: Math.min(range.end, Math.max(range.start, timeAtX(x, w, duration))), x0: d.x0, moved };
  };
  const apply = (d: Drag, commit: boolean) => {
    if (d.kind === "scrub") onSeek(d.t);
    else if (d.kind === "cut") {
      if (!d.moved) return;
      onCuts?.(d.cuts, commit);
      onSeek(d.cuts[d.k]);
    } else {
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

  /** Pointer released: commits a drag; a tap on a divider opens its menu, a tap on a segment selects it. */
  const release = (d: Drag) => {
    if (d.kind === "in" || d.kind === "out") apply(d, true);
    else if (d.kind === "cut") {
      if (d.moved) apply(d, true);
      else { setMenuByKey(false); setMenu(d.k); }
    } else if (d.kind === "scrub" && !d.moved && split) onSelect?.(segmentAtTime(cuts, d.t, range, duration).look);
  };
  const cutKeys = (k: number) => (e: KeyboardEvent) => {
    // The strip's own keys (seek, play) must not see these.
    e.stopPropagation();
    const step = e.shiftKey ? 1 : 0.1;
    const to = (t: number) => { e.preventDefault(); const next = moveCut(cuts, k, t, range, duration); onCuts?.(next, true); onSeek(next[k]); };
    if (e.key === "ArrowRight" || e.key === "ArrowUp") to(cuts[k] + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") to(cuts[k] - step);
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onRemoveCut?.(k); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMenuByKey(true); setMenu(k); }
  };

  // Timecode of the handle being dragged, inside the strip (never over the dock's grab bar):
  // beside the handle over the dimmed part, or inside the selection when there is no room outside.
  let tip = null;
  if (drag?.kind === "cut" && drag.moved) {
    const edge = pctOf(drag.cuts[drag.k], duration);
    const side = edge > 50 ? "left" : "right";
    tip = (
      <div className={`trim__tip trim__tip--${side}`} style={{ left: `calc(${edge}% ${side === "left" ? "-" : "+"} 6px)` }} aria-hidden="true">
        {formatTimecode(drag.cuts[drag.k])}
      </div>
    );
  } else if (drag && (drag.kind === "in" || drag.kind === "out")) {
    const w = stripRef.current?.clientWidth ?? 0;
    const atIn = drag.kind === "in";
    const edge = atIn ? inPct : outPct;
    const room = atIn ? (edge / 100) * w - HANDLE_W : w - (edge / 100) * w - HANDLE_W;
    const outside = room >= TIP_W;
    const side = atIn === outside ? "left" : "right";
    const offset = (outside ? HANDLE_W : 0) + 4;
    tip = (
      <div className={`trim__tip trim__tip--${side}`} style={{ left: `calc(${edge}% ${side === "left" ? "-" : "+"} ${offset}px)` }} aria-hidden="true">
        {formatTimecode(atIn ? range.start : range.end)}
      </div>
    );
  }

  return (
    <div className={`timeline${disabled ? " is-disabled" : ""}${trimmed ? " is-trimmed" : ""}${drag ? " is-dragging" : ""}`}>
      <button type="button" className="timeline__play" aria-label={playing ? "Pause" : "Play"} onClick={onToggle} disabled={disabled}>
        {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
      </button>
      <div
        className="trim"
        onPointerDown={(e) => {
          if (!live || e.button !== 0) return;
          // A pointer drag doesn't take keyboard focus (no focus ring after dragging); drop any it had.
          e.preventDefault();
          const focused = document.activeElement as HTMLElement | null;
          if (focused?.closest(".trim")) focused.blur();
          e.currentTarget.setPointerCapture(e.pointerId);
          const d = grab(e.clientX);
          const moved = d.kind === "scrub" ? follow(d, e.clientX) : d;
          setDrag(moved);
          setMenu(null);
          if (moved.kind === "scrub") apply(moved, false);
          else if (moved.kind === "cut") onSeek(cuts[moved.k]);
          else onSeek(moved.kind === "in" ? moved.range.start : Math.max(moved.range.start, moved.range.end - 0.04));
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const d = follow(drag, e.clientX);
          setDrag(d);
          apply(d, false);
        }}
        onPointerUp={() => {
          if (drag) release(drag);
          setDrag(null);
        }}
        onPointerCancel={() => {
          if (drag && drag.kind !== "scrub" && (drag.kind !== "cut" || drag.moved)) apply(drag, true);
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
          {selSeg && (
            <div className="trim__seg" style={{ left: `${pctOf(selSeg.start, duration)}%`, width: `${pctOf(selSeg.end, duration) - pctOf(selSeg.start, duration)}%` }} aria-hidden="true" />
          )}
          {act.map((k, i) => (
            <div
              key={k}
              className={`trim__cut${menuOn && menu === k ? " is-open" : ""}`}
              style={{ left: `${pctOf(shownCuts[k], duration)}%` }}
              role="slider"
              aria-label={`Split ${i + 1}`}
              aria-valuemin={Math.round(range.start * 10) / 10}
              aria-valuemax={Math.round(range.end * 10) / 10}
              aria-valuenow={Math.round(shownCuts[k] * 10) / 10}
              aria-valuetext={`${formatTimecode(shownCuts[k])}. Delete removes it`}
              tabIndex={disabled ? -1 : 0}
              onKeyDown={cutKeys(k)}
            />
          ))}
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
          {menuOn && (
            <div ref={menuRef} className="trim__menu" style={{ left: `${pctOf(cuts[menu!], duration)}%`, transform: `translateX(-${pctOf(cuts[menu!], duration)}%)` }} role="menu" aria-label={`Split at ${formatTimecode(cuts[menu!])}`}
              onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setMenu(null); }}>
              <span className="trim__menu-time" aria-hidden="true">{formatTimecode(cuts[menu!])}</span>
              <button type="button" role="menuitem" autoFocus={menuByKey} onClick={() => { const k = menu!; setMenu(null); onRemoveCut?.(k); }}>Remove split</button>
            </div>
          )}
        </div>
      </div>
      <div className="timeline__meta">
        <span className="timeline__clock" aria-hidden="true">
          {drag?.kind === "cut" && drag.moved ? formatTimecode(drag.cuts[drag.k]) : drag && (drag.kind === "in" || drag.kind === "out") ? `${formatTimecode(range.start)} – ${formatTimecode(range.end)}` : formatTimecode(shown)}
        </span>
        <span className="timeline__sel" aria-live="polite">{selectionLabel(range, duration)}</span>
        {trimmed && (
          <button type="button" className="timeline__reset" onClick={() => onTrim(null, true)} disabled={disabled} aria-label="Reset trim to the full clip">
            Reset
          </button>
        )}
        {onSplit && (
          <IconButton label="Split at playhead (S)" onClick={onSplit} disabled={disabled || !canSplit}>
            <IconSplit size={18} />
          </IconButton>
        )}
        {children}
      </div>
    </div>
  );
}
