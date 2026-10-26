import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { IconChevron, IconClose, IconSliders } from "./icons";

/** Movement before a press on the header becomes a drag (below it, taps stay clicks). */
const SLOP = 6;
/** Release past this many px, or flicked down faster than FLICK px/ms, closes. */
const CLOSE_DY = 64;
const FLICK = 0.45;
const EXIT_MS = 180;

/**
 * Advanced controls, inline in the tool dock under the main controls (not a
 * modal): the preview above stays visible and every change shows on it
 * live. The "Advanced" row is both the toggle and, while open, the drag
 * handle; on phones the dock grows up to a cap and the body scrolls inside.
 *
 * Closes on: the Advanced row again, the close button, Escape, a tap on the
 * preview (App), or dragging the row down (touch or mouse; distance or
 * flick velocity).
 */
export function AdvancedDrawer({ open, onToggle, onClose, label, id, disabled, children }: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Accessible name of the open section, e.g. "Colour advanced settings". */
  label: string;
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; y0: number; dy: number; active: boolean; samples: [number, number][] } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    // Focus inside a closing region would be lost: hand it back to the toggle.
    if (ref.current?.querySelector(".adv-drawer__body")?.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
    setOffset(0);
    setLeaving(true);
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // In the scrolling sidebar, bring the opened section into view.
  useEffect(() => {
    const el = ref.current, sc = el?.closest<HTMLElement>(".controls__panel");
    if (!open || !mounted || !el || !sc || getComputedStyle(sc).overflowY !== "auto") return;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    if (top > sc.clientHeight * 0.5) sc.scrollBy({ top, behavior: "smooth" });
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // A modal sheet above (Export, About) owns Escape.
      if (document.querySelector(".sheet-layer")) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function setOffset(dy: number) {
    const el = ref.current;
    if (!el) return;
    el.style.transform = dy ? `translateY(${dy}px)` : "";
    const body = el.querySelector<HTMLElement>(".adv-drawer__body");
    if (body) body.style.opacity = dy > 0 ? String(Math.max(0.3, 1 - dy / 200)) : "";
  }

  // Move / up are followed on the window: the pointer soon leaves the 32 px row,
  // and capturing it on press would retarget the click away from the buttons.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (!open || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const d = { id: e.pointerId, y0: e.clientY, dy: 0, active: false, samples: [[e.timeStamp, e.clientY]] as [number, number][] };
    drag.current = d;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      const raw = ev.clientY - d.y0;
      if (!d.active) {
        if (Math.abs(raw) < SLOP) return;
        d.active = true;
        dragged.current = true;
        ref.current?.classList.add("is-dragging");
      }
      ev.preventDefault();
      // Down follows the finger; up resists (there is nowhere to go).
      d.dy = raw > 0 ? raw : raw / 4;
      d.samples.push([ev.timeStamp, ev.clientY]);
      if (d.samples.length > 5) d.samples.shift();
      setOffset(d.dy);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      drag.current = null;
      if (!d.active) return;
      // The click that may follow this pointerup is swallowed (onClickCapture), then taps work again.
      setTimeout(() => { dragged.current = false; }, 0);
      ref.current?.classList.remove("is-dragging");
      const [t0, y0] = d.samples[0];
      const [t1, y1] = d.samples[d.samples.length - 1];
      const v = (y1 - y0) / Math.max(1, t1 - t0);
      if (ev.type === "pointerup" && (d.dy > CLOSE_DY || (v > FLICK && d.dy > 16))) onClose();
      else setOffset(0);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  // A drag that started on a button must not also click it.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div ref={ref} className={`adv-drawer${mounted ? " is-open" : ""}${leaving ? " is-leaving" : ""}`}>
      <div className="adv-drawer__head" onPointerDown={onPointerDown} onClickCapture={onClickCapture}>
        <button ref={toggleRef} type="button" id={`${id}-toggle`} className="link-btn adv-toggle" onClick={onToggle} disabled={disabled} aria-expanded={open} aria-controls={mounted ? id : undefined}>
          <IconSliders size={16} />
          Advanced
          <span className="adv-toggle__chev" aria-hidden="true"><IconChevron size={14} /></span>
        </button>
        {mounted && (
          <button type="button" className="icon-btn icon-btn--quiet adv-drawer__close" aria-label="Close advanced settings" onClick={onClose}>
            <IconClose size={18} />
          </button>
        )}
      </div>
      {mounted && (
        <section id={id} className="adv-drawer__body" role="region" aria-label={label}>
          {children}
        </section>
      )}
    </div>
  );
}
