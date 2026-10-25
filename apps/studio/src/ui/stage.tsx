import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { IconPlay, IconSwap } from "./icons";

/**
 * The picture: a box fitted to the clip's aspect inside the available area,
 * holding the two canvases (geometry, colour) and the before/after split.
 */
export function Stage({
  aspect,
  colourRef,
  geoRef,
  visible,
  split,
  onSplit,
  onTap,
  onFrameSize,
  paused,
  showPlayHint,
  children,
}: {
  aspect: number | null;
  colourRef: RefObject<HTMLCanvasElement | null>;
  geoRef: RefObject<HTMLCanvasElement | null>;
  visible: "colour" | "geo";
  split: number | null;
  onSplit: (v: number) => void;
  onTap: () => void;
  onFrameSize: (w: number, h: number) => void;
  paused: boolean;
  showPlayHint: boolean;
  children?: ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dragging = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);

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

  const toSplit = (clientX: number) => {
    const r = frameRef.current!.getBoundingClientRect();
    return Math.min(0.98, Math.max(0.02, (clientX - r.left) / r.width));
  };

  return (
    <div className="stage" ref={areaRef}>
      <div
        ref={frameRef}
        className={`stage__frame${aspect ? " is-live" : ""}`}
        style={{ width: box.w || undefined, height: box.h || undefined }}
        onPointerDown={(e) => {
          if (split === null) return;
          const r = frameRef.current!.getBoundingClientRect();
          const lineX = r.left + split * r.width;
          // Grab the divider anywhere along its height (generous touch slop).
          if (Math.abs(e.clientX - lineX) < 28) {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
          }
        }}
        onPointerMove={(e) => {
          if (dragging.current) onSplit(toSplit(e.clientX));
        }}
        onPointerUp={(e) => {
          if (dragging.current) {
            dragging.current = false;
            return;
          }
          if ((e.target as HTMLElement).closest("button")) return;
          onTap();
        }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        <canvas ref={geoRef} className={`stage__canvas${visible === "geo" ? " is-visible" : ""}`} />
        <canvas ref={colourRef} className={`stage__canvas${visible === "colour" ? " is-visible" : ""}`} />
        {split !== null && aspect && (
          <div className="split" style={{ ["--split" as string]: `${split * 100}%` }}>
            <div className="split__line" />
            <div className="split__knob" aria-hidden="true">
              <IconSwap size={16} />
            </div>
            <span className="split__tag split__tag--before" style={{ opacity: split < 0.14 ? 0 : 1 }}>Before</span>
            <span className="split__tag split__tag--after" style={{ opacity: split > 0.86 ? 0 : 1 }}>After</span>
          </div>
        )}
        {aspect && paused && showPlayHint && (
          <div className="stage__play" aria-hidden="true">
            <IconPlay size={26} />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
