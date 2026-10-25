import { useEffect, useState, type ReactNode } from "react";
import { IconClose } from "./icons";

/**
 * Bottom sheet on phones, centred panel on wide screens. Stays mounted for
 * the exit transition; Escape and the scrim close it unless `locked`.
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
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 340);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open || locked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);
  if (!mounted) return null;
  return (
    <div className={`sheet-layer${shown ? " is-open" : ""}`}>
      <div className="sheet-scrim" onClick={() => !locked && onClose()} />
      <section className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grab" aria-hidden="true" />
        <header className="sheet__head">
          <h2>{title}</h2>
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
