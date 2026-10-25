import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconClose } from "./icons";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on phones, centred panel on wide screens. Stays mounted for
 * the exit transition; Escape and the scrim close it unless `locked`. Focus
 * moves into the sheet on open, stays inside while it is open, and returns
 * to whatever opened it on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  locked,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  locked?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 340);
    returnTo.current?.focus?.();
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!shown) return;
    const el = sheetRef.current;
    if (!el || el.contains(document.activeElement)) return;
    // The first control inside the body (not the close button), else the sheet itself.
    const first = el.querySelector<HTMLElement>(`.sheet__body ${FOCUSABLE.split(", ").join(", .sheet__body ")}`);
    (first ?? el).focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = sheetRef.current;
      if (!el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);

  if (!mounted) return null;
  return (
    <div className={`sheet-layer${shown ? " is-open" : ""}`}>
      <div className="sheet-scrim" onClick={() => !locked && onClose()} aria-hidden="true" />
      <section ref={sheetRef} className={`sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="sheet__grab" aria-hidden="true" />
        <header className="sheet__head">
          <h2 id={titleId}>{title}</h2>
          {!locked && (
            <button type="button" className="icon-btn icon-btn--quiet" aria-label="Close" onClick={onClose}>
              <IconClose size={18} />
            </button>
          )}
        </header>
        <div className="sheet__body">{children}</div>
      </section>
    </div>
  );
}
