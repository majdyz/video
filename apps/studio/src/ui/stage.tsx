import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { IconPlay, IconSwap } from "./icons";

type View = { z: number; tx: number; ty: number };
const FIT: View = { z: 1, tx: 0, ty: 0 };
const MAX_ZOOM = 6;
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 280;
const HOLD_MS = 380;
/** Grab distance (CSS px) around the before/after line when zoomed in. */
const LINE_GRAB = 32;

function clampView(v: View, w: number, h: number): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
  return { z, tx: Math.min(0, Math.max(w - w * z, v.tx)), ty: Math.min(0, Math.max(h - h * z, v.ty)) };
}

/** Zoom to `z` keeping the content point under (px, py) in place. */
function zoomAbout(v: View, px: number, py: number, z: number, w: number, h: number): View {
  const cx = (px - v.tx) / v.z, cy = (py - v.ty) / v.z;
  return clampView({ z, tx: px - cx * z, ty: py - cy * z }, w, h);
}

type Gesture = {
  mode: "pending" | "split" | "pan" | "pinch" | "hold" | "none";
  id: number;
  x0: number;
  y0: number;
  t0: number;
  view0: View;
  d0: number;
  mid0: [number, number];
  splitCandidate: boolean;
};

/**
 * The picture: a box fitted to the clip's aspect inside the available area,
 * holding the two canvases (geometry, colour), the before/after split and,
 * during an export, a live view of the encoded frames.
 *
 * Gestures (one thumb is enough): drag anywhere to move the before/after
 * line; press and hold to see the original; double-tap or pinch to zoom,
 * drag to pan while zoomed; tap to play/pause. Mouse: wheel zooms, keyboard
 * + / − / 0 and arrows when the picture has focus.
 */
export function Stage({
  aspect,
  nativeWidth,
  colourRef,
  geoRef,
  liveRef,
  liveOn,
  visible,
  split,
  holding,
  onSplit,
  onHold,
  onTap,
  onTapAt,
  overlay,
  onZoom,
  interactive,
  onFrameSize,
  paused,
  showPlayHint,
  resetKey,
  children,
}: {
  aspect: number | null;
  nativeWidth: number;
  colourRef: RefObject<HTMLCanvasElement | null>;
  geoRef: RefObject<HTMLCanvasElement | null>;
  liveRef: RefObject<HTMLCanvasElement | null>;
  liveOn: boolean;
  visible: "colour" | "geo";
  split: number | null;
  holding: boolean;
  onSplit: (v: number) => void;
  onHold?: (on: boolean) => void;
  onTap?: () => void;
  /** A tap at upright picture position (u, v), 0..1 (takes over from onTap; e.g. selecting subjects). */
  onTapAt?: (u: number, v: number) => void;
  /** Drawn over the picture inside the zoomed content (follows pinch and pan). */
  overlay?: ReactNode;
  onZoom: (z: number) => void;
  interactive: boolean;
  onFrameSize: (w: number, h: number) => void;
  paused: boolean;
  showPlayHint: boolean;
  resetKey: string;
  children?: ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [view, setViewState] = useState<View>(FIT);
  const [animating, setAnimating] = useState(false);
  const viewRef = useRef<View>(FIT);
  const pointers = useRef(new Map<number, [number, number]>());
  const g = useRef<Gesture | null>(null);
  const holdTimer = useRef(0);
  const tapTimer = useRef(0);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const zoomTimer = useRef(0);

  const setView = useCallback((v: View, animate = false) => {
    viewRef.current = v;
    setViewState(v);
    if (animate) {
      setAnimating(true);
      window.setTimeout(() => setAnimating(false), 260);
    }
    clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => onZoom(v.z), 140);
  }, [onZoom]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const aw = el.clientWidth, ah = el.clientHeight;
      if (!aspect || !aw || !ah) return setBox({ w: aw, h: ah });
      let w = aw, h = aw / aspect;
      if (h > ah) { h = ah; w = ah * aspect; }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    if (box.w && box.h) onFrameSize(box.w, box.h);
  }, [box.w, box.h, onFrameSize]);

  // New clip or new frame size: back to fit.
  useEffect(() => {
    setView(FIT);
  }, [resetKey, box.w, box.h, setView]);
  // Exports render un-zoomed.
  useEffect(() => {
    if (!interactive && viewRef.current.z > 1) setView(FIT);
  }, [interactive, setView]);

  // Wheel zoom (needs a non-passive listener to keep the page from scrolling).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!aspect || !interactive) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      setView(zoomAbout(v, e.clientX - r.left, e.clientY - r.top, v.z * Math.exp(-e.deltaY * 0.0015), r.width, r.height));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [aspect, interactive, setView]);

  useEffect(() => () => { clearTimeout(holdTimer.current); clearTimeout(tapTimer.current); clearTimeout(zoomTimer.current); }, []);

  const local = (clientX: number, clientY: number): [number, number] => {
    const r = frameRef.current!.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };
  const splitAt = (x: number) => {
    const v = viewRef.current;
    return Math.min(0.98, Math.max(0.02, (x - v.tx) / (box.w * v.z)));
  };
  const doubleTapZoom = (x: number, y: number) => {
    const v = viewRef.current;
    if (v.z > 1.01) return setView(FIT, true);
    const dpr = window.devicePixelRatio || 1;
    const target = Math.min(MAX_ZOOM, Math.max(2.5, nativeWidth / Math.max(1, box.w * dpr)));
    setView(zoomAbout(v, x, y, target, box.w, box.h), true);
  };
  const endHold = () => {
    clearTimeout(holdTimer.current);
    if (g.current?.mode === "hold") onHold?.(false);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!aspect || !interactive) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = local(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, [x, y]);
    const v = viewRef.current;
    if (pointers.current.size === 2) {
      endHold();
      const [a, b] = [...pointers.current.values()];
      g.current = { mode: "pinch", id: e.pointerId, x0: x, y0: y, t0: performance.now(), view0: v, d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], splitCandidate: false };
      return;
    }
    if (pointers.current.size > 2) return;
    let splitCandidate = false;
    let mode: Gesture["mode"] = "pending";
    if (split !== null) {
      const lineX = v.tx + split * box.w * v.z;
      if (Math.abs(x - lineX) < LINE_GRAB) mode = "split";
      else splitCandidate = v.z <= 1.01;
    }
    g.current = { mode, id: e.pointerId, x0: x, y0: y, t0: performance.now(), view0: v, d0: 0, mid0: [x, y], splitCandidate };
    if (mode === "pending" && split === null && v.z <= 1.01 && onHold) {
      holdTimer.current = window.setTimeout(() => {
        if (g.current?.mode === "pending") {
          g.current.mode = "hold";
          onHold(true);
        }
      }, HOLD_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const gs = g.current;
    if (!gs || !pointers.current.has(e.pointerId)) return;
    const [x, y] = local(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, [x, y]);
    if (gs.mode === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const v0 = gs.view0;
      const z = Math.min(MAX_ZOOM, Math.max(1, v0.z * (d / gs.d0)));
      const cx = (gs.mid0[0] - v0.tx) / v0.z, cy = (gs.mid0[1] - v0.ty) / v0.z;
      setView(clampView({ z, tx: mid[0] - cx * z, ty: mid[1] - cy * z }, box.w, box.h));
      return;
    }
    if (e.pointerId !== gs.id) return;
    const dx = x - gs.x0, dy = y - gs.y0;
    if (gs.mode === "pending" && Math.hypot(dx, dy) > TAP_SLOP) {
      clearTimeout(holdTimer.current);
      gs.mode = gs.splitCandidate ? "split" : gs.view0.z > 1.01 ? "pan" : "none";
    }
    if (gs.mode === "split") onSplit(splitAt(x));
    else if (gs.mode === "pan") setView(clampView({ ...gs.view0, tx: gs.view0.tx + dx, ty: gs.view0.ty + dy }, box.w, box.h));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const gs = g.current;
    pointers.current.delete(e.pointerId);
    if (!gs) return;
    if (gs.mode === "pinch") {
      // One finger left: carry on as a pan from here.
      const rest = [...pointers.current.entries()][0];
      if (rest) g.current = { ...gs, mode: "pan", id: rest[0], x0: rest[1][0], y0: rest[1][1], view0: viewRef.current };
      else g.current = null;
      return;
    }
    if (e.pointerId !== gs.id) return;
    const [x, y] = local(e.clientX, e.clientY);
    const wasTap = gs.mode === "pending" && performance.now() - gs.t0 < 350;
    endHold();
    g.current = null;
    if (!wasTap) return;
    const now = performance.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(x - prev.x, y - prev.y) < 40) {
      clearTimeout(tapTimer.current);
      lastTap.current = null;
      doubleTapZoom(x, y);
      return;
    }
    lastTap.current = { t: now, x, y };
    if (onTapAt) {
      // Picture coordinates under the finger (undo the zoom / pan).
      const v = viewRef.current;
      const u = (x - v.tx) / v.z / box.w, w = (y - v.ty) / v.z / box.h;
      clearTimeout(tapTimer.current);
      if (u >= 0 && u <= 1 && w >= 0 && w <= 1) tapTimer.current = window.setTimeout(() => onTapAt(u, w), DOUBLE_TAP_MS);
    } else if (onTap) {
      clearTimeout(tapTimer.current);
      tapTimer.current = window.setTimeout(() => onTap(), DOUBLE_TAP_MS);
    }
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    endHold();
    g.current = null;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!aspect || !interactive) return;
    const v = viewRef.current;
    const step = 40;
    let next: View | null = null;
    if (e.key === "+" || e.key === "=") next = zoomAbout(v, box.w / 2, box.h / 2, v.z * 1.5, box.w, box.h);
    else if (e.key === "-" || e.key === "_") next = zoomAbout(v, box.w / 2, box.h / 2, v.z / 1.5, box.w, box.h);
    else if (e.key === "0") next = FIT;
    else if (v.z > 1.01 && e.key.startsWith("Arrow")) {
      const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key] ?? [0, 0];
      next = clampView({ ...v, tx: v.tx + d[0], ty: v.ty + d[1] }, box.w, box.h);
    } else if (split !== null && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      onSplit(Math.min(0.98, Math.max(0.02, split + (e.key === "ArrowLeft" ? -0.05 : 0.05))));
      e.preventDefault();
      return;
    }
    if (next) {
      e.preventDefault();
      setView(next, true);
    }
  };

  const zoomed = view.z > 1.01;
  const lineX = split !== null ? view.tx + split * box.w * view.z : 0;
  const lineVisible = split !== null && lineX >= 0 && lineX <= box.w;
  const label = !aspect ? undefined
    : `Preview${zoomed ? `, zoomed ${view.z.toFixed(1)} times` : ""}. ${split !== null ? "Drag to move the before and after line. " : onHold ? "Press and hold to see the original. " : ""}Double-tap or pinch to zoom${onTapAt ? ", tap an animal to include or exclude it" : onTap ? ", tap to play or pause" : ""}.`;

  return (
    <div className="stage" ref={areaRef}>
      <div
        ref={frameRef}
        className={`stage__frame${aspect ? " is-live" : ""}${zoomed ? " is-zoomed" : ""}`}
        style={{ width: box.w || undefined, height: box.h || undefined }}
        role={aspect ? "group" : undefined}
        aria-label={label}
        aria-roledescription={aspect ? "editable preview" : undefined}
        tabIndex={aspect && interactive ? 0 : -1}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className={`stage__content${animating ? " is-animating" : ""}`}
          style={{ transform: zoomed ? `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.z})` : undefined }}
        >
          <canvas ref={geoRef} className={`stage__canvas${visible === "geo" ? " is-visible" : ""}`} />
          <canvas ref={colourRef} className={`stage__canvas${visible === "colour" ? " is-visible" : ""}`} />
          {overlay}
        </div>
        <canvas ref={liveRef} className={`stage__live${liveOn ? " is-on" : ""}`} aria-hidden="true" />
        {split !== null && aspect && (
          <div className="split" aria-hidden="true" style={{ ["--split-x" as string]: `${lineX}px` }}>
            {lineVisible && <div className="split__line" />}
            {lineVisible && (
              <div className="split__knob">
                <IconSwap size={16} />
              </div>
            )}
            <span className="split__tag split__tag--before" style={{ opacity: lineX < 64 ? 0 : 1 }}>Before</span>
            <span className="split__tag split__tag--after" style={{ opacity: lineX > box.w - 64 ? 0 : 1 }}>After</span>
          </div>
        )}
        {holding && aspect && <span className="split__tag split__tag--before" aria-live="polite">Original</span>}
        {aspect && paused && showPlayHint && !zoomed && split === null && !holding && (
          <div className="stage__play" aria-hidden="true">
            <IconPlay size={26} />
          </div>
        )}
        {zoomed && interactive && (
          <button type="button" className="stage__zoom" onClick={() => setView(FIT, true)} aria-label={`Zoomed ${view.z.toFixed(1)} times. Fit to screen`}>
            {view.z.toFixed(1)}×
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
