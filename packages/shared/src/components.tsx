/**
 * Shared UI primitives used by both apps. Keeps styling/behaviour identical
 * across the suite — only the brand and the per-app processing differ.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="info-btn" onClick={onClick} aria-label="How it works">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <circle cx="12" cy="7.5" r="1.1" fill="currentColor" />
        <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while the modal is open. Without this, on iOS
    // the page bounces behind the backdrop on long modals (Info,
    // download consent), making it look like the dialog is broken.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`slider ${disabled ? "is-disabled" : ""}`}>
      <span>
        {label} <em>{value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Scrubber({
  currentTime,
  duration,
  disabled,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  disabled?: boolean;
  onSeek: (t: number) => void;
}) {
  return (
    <div className="scrubber">
      <span className="time">{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(currentTime, duration || 0)}
        disabled={disabled || !duration}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
      />
      <span className="time">{formatTime(duration)}</span>
    </div>
  );
}

export function FilePickerButton({
  accept,
  disabled,
  onPick,
  children,
}: {
  accept: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  children: ReactNode;
}) {
  return (
    <label className="file">
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <span>{children}</span>
    </label>
  );
}

export function PlaceholderDropZone({
  accept,
  onPick,
  message,
  subMessage,
}: {
  accept: string;
  onPick: (file: File) => void;
  message?: string;
  subMessage?: string;
}) {
  const isVideoOnly = !accept.includes("image");
  const title = message ?? (isVideoOnly ? "Drop a video here" : "Drop a photo or video");
  const sub = subMessage ?? (isVideoOnly
    ? "or tap to choose from your library"
    : "or tap to choose from your library — runs entirely on your device");
  return (
    <label className="placeholder" aria-label={title}>
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <div className="dropper">
        <div className="dropper-iconwrap">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 4v12m0-12l-4 4m4-4l4 4M5 18h14"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="dropper-title">{title}</p>
        <p className="dropper-sub">{sub}</p>
      </div>
    </label>
  );
}

export function PlayOverlay() {
  return (
    <div className="play-overlay" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" fill="currentColor" />
      </svg>
    </div>
  );
}

export function CompareButton({
  active,
  onPress,
  onRelease,
}: {
  active: boolean;
  onPress: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      className="compare"
      onPointerDown={onPress}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      aria-label="Hold to compare"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 4v16M5 8l-3 4 3 4M19 8l3 4-3 4"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {active ? "Original" : "Hold"}
    </button>
  );
}

// Wipe-style comparison overlay. A vertical line plus a draggable handle
// sits on top of the stage; the consumer reads the `value` (0..1) and
// either passes it as a shader uniform (WebGL apps) or uses it to clip a
// 2D context (canvas2D apps). At 0 the entire frame is the original; at
// 1 the entire frame is corrected.
//
// canvasRef positions the overlay over the canvas's *visible content
// rect* — not the stage. With `object-fit: contain`, the canvas content
// is letterboxed inside its DOM box; without this calculation the bar
// would track the stage edges (including the letterbox bands) instead
// of the video itself.
type Rect = { left: number; top: number; width: number; height: number };

function contentRect(canvas: HTMLCanvasElement): Rect {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const iw = canvas.width;
  const ih = canvas.height;
  if (!iw || !ih || !cw || !ch) {
    return { left: 0, top: 0, width: cw, height: ch };
  }
  const scale = Math.min(cw / iw, ch / ih);
  const renderedW = iw * scale;
  const renderedH = ih * scale;
  return {
    left: (cw - renderedW) / 2,
    top: (ch - renderedH) / 2,
    width: renderedW,
    height: renderedH,
  };
}

export function CompareWipe({
  active,
  value,
  onChange,
  onToggle,
  canvasRef,
}: {
  active: boolean;
  value: number;
  onChange: (v: number) => void;
  onToggle: () => void;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  const [rect, setRect] = useState<Rect>({ left: 0, top: 0, width: 0, height: 0 });
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Recompute the canvas's visible content rect on resize and whenever
  // the wipe is toggled on. We only need this when the wipe is active.
  useEffect(() => {
    if (!active || !canvasRef?.current) return;
    const canvas = canvasRef.current;
    const update = () => setRect(contentRect(canvas));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [active, canvasRef]);

  function pickFromEvent(clientX: number) {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const r = overlay.getBoundingClientRect();
    if (r.width <= 0) return;
    const v = (clientX - r.left) / r.width;
    onChange(Math.max(0, Math.min(1, v)));
  }

  // Position the overlay over the canvas's actual visible content area
  // when canvasRef is provided. Without it, fall back to filling the
  // parent (legacy behavior for callers that don't pass a ref).
  const overlayStyle: React.CSSProperties = canvasRef
    ? {
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    : { position: "absolute", inset: 0 };

  return (
    <>
      <button
        className="compare"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-pressed={active}
        aria-label={active ? "Hide comparison wipe" : "Show comparison wipe"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 4v16M5 8l-3 4 3 4M19 8l3 4-3 4"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {active ? "Done" : "Compare"}
      </button>
      {active && (
        <div
          ref={overlayRef}
          className="compare-wipe"
          style={overlayStyle}
          onPointerDown={(e) => {
            // Stop propagation so the parent stage's onClick (toggle
            // play/pause) doesn't fire when the user finishes a drag.
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            pickFromEvent(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
            pickFromEvent(e.clientX);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="compare-wipe-bar" style={{ left: `${value * 100}%` }} />
          <div className="compare-wipe-handle" style={{ left: `${value * 100}%` }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l-4 6 4 6M15 6l4 6-4 6" stroke="currentColor" strokeWidth="2"
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="compare-wipe-tag compare-wipe-tag-left">Before</div>
          <div className="compare-wipe-tag compare-wipe-tag-right">After</div>
        </div>
      )}
    </>
  );
}

export function RecordingOverlay({
  currentTime,
  duration,
  progress,
}: {
  currentTime: number;
  duration: number;
  progress: number;
}) {
  return (
    <div className="recording-overlay">
      <div className="rec-dot" />
      <span>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <div className="progress">
        <div className="bar" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

export function BusyOverlay({
  message,
  onCancel,
}: {
  message: string;
  onCancel?: () => void;
}) {
  return (
    <div className="busy">
      <div className="spinner" />
      <span>{message}</span>
      {onCancel && (
        <button className="busy-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

export function AdvancedDisclosure({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="adv-toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <span>Advanced</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={open ? "open" : ""}>
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <div className="advanced">{children}</div>}
    </>
  );
}

export function PresetsRow<T>({
  presets,
  current,
  matches,
  onSelect,
  disabled,
}: {
  presets: { label: string; settings: T }[];
  current: T;
  matches: (a: T, b: T) => boolean;
  onSelect: (s: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="presets">
      {presets.map((p) => (
        <button
          key={p.label}
          className={`preset ${matches(current, p.settings) ? "active" : ""}`}
          onClick={() => onSelect(p.settings)}
          disabled={disabled}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function Hero({
  logo,
  name,
  tagline,
  onInfoClick,
}: {
  logo: ReactNode;
  name: string;
  tagline: string;
  onInfoClick?: () => void;
}) {
  return (
    <header className="hero">
      <div className="brand">
        <div className="logo" aria-hidden="true">
          {logo}
        </div>
        <div className="brand-text">
          <h1>{name}</h1>
          <p className="tag">{tagline}</p>
        </div>
        {onInfoClick && <InfoButton onClick={onInfoClick} />}
      </div>
    </header>
  );
}

/**
 * Mirrors a video element's playback state into React. Listens to
 * timeupdate/play/pause/seeked and surfaces currentTime + paused. Also fires
 * onSeeked so callers can repaint their canvas at the new time.
 */
export function useVideoPlaybackState(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onSeeked?: () => void,
) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // Hold onSeeked in a ref so we don't have to add the inline arrow
  // function the caller passes to the effect deps. Without this every
  // parent render rebound the four <video> listeners — fine on idle
  // pages, but during recording the parent re-commits frequently and
  // the listener thrash showed up as missed events.
  const onSeekedRef = useRef(onSeeked);
  useEffect(() => {
    onSeekedRef.current = onSeeked;
  }, [onSeeked]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);
    const onSeekedHandler = () => {
      setCurrentTime(v.currentTime);
      onSeekedRef.current?.();
    };
    // Also fire onSeeked on `loadeddata` — when a fresh src finishes
    // loading at t=0 there's no `seeked` event (browser was already
    // there), so the first paint relied on the rVFC loop catching up.
    // Surface it explicitly so the canvas paints the very first frame.
    const onLoaded = () => {
      setCurrentTime(v.currentTime);
      onSeekedRef.current?.();
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeekedHandler);
    v.addEventListener("loadeddata", onLoaded);
    setCurrentTime(v.currentTime);
    setIsPaused(v.paused);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeekedHandler);
      v.removeEventListener("loadeddata", onLoaded);
    };
  }, [videoRef, active]);

  return { currentTime, isPaused };
}
