import { useRef, useState } from "react";
import { IconPause, IconPlay } from "./icons";

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Play/pause, a scrub track you can drag anywhere on, and the clock. */
export function Timeline({
  time,
  duration,
  playing,
  disabled,
  onToggle,
  onSeek,
}: {
  time: number;
  duration: number;
  playing: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? time;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;
  const at = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
  };
  return (
    <div className={`timeline${disabled ? " is-disabled" : ""}`}>
      <button type="button" className="timeline__play" aria-label={playing ? "Pause" : "Play"} onClick={onToggle} disabled={disabled}>
        {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
      </button>
      <div
        ref={trackRef}
        className={`timeline__track${drag !== null ? " is-dragging" : ""}`}
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(shown * 10) / 10}
        aria-valuetext={`${formatTime(shown)} of ${formatTime(duration)}`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onSeek(Math.min(duration, time + 1)); }
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onSeek(Math.max(0, time - 1)); }
          if (e.key === "Home") { e.preventDefault(); onSeek(0); }
          if (e.key === "End") { e.preventDefault(); onSeek(duration); }
          if (e.key === " ") { e.preventDefault(); onToggle(); }
        }}
        onPointerDown={(e) => {
          if (disabled || duration <= 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = at(e.clientX);
          setDrag(t);
          onSeek(t);
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const t = at(e.clientX);
          setDrag(t);
          onSeek(t);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="timeline__rail">
          <div className="timeline__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="timeline__head" style={{ left: `${pct}%` }} />
      </div>
      <div className="timeline__clock" aria-hidden="true">
        <span>{formatTime(shown)}</span>
        <span className="timeline__dur">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
