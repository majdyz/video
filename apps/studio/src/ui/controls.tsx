import { useEffect, useId, useRef, type ReactNode } from "react";

/** Labelled slider: drawn track + fill, with a native range input on top for touch, keyboard and a11y. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(Math.round(v)),
  disabled,
  defaultValue,
  emphasis,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
  /** Double-tap / double-click returns here. */
  defaultValue?: number;
  /** The tool's main slider (bigger, accent value). */
  emphasis?: boolean;
}) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const mark = defaultValue !== undefined && max > min ? ((defaultValue - min) / (max - min)) * 100 : null;
  return (
    <div className={`slider${emphasis ? " slider--main" : ""}${disabled ? " is-disabled" : ""}`}>
      <div className="slider__row">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <div className="slider__track" style={{ ["--pct" as string]: `${pct}%` }}>
        <div className="slider__rail" />
        <div className="slider__fill" />
        {mark !== null && <div className="slider__mark" style={{ left: `${mark}%` }} />}
        <div className="slider__thumb" />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        />
      </div>
    </div>
  );
}

export function Chips<T extends string>({
  items,
  value,
  onChange,
  disabled,
  label,
}: {
  items: { id: T; label: string; hint?: string }[];
  value: T | string;
  onChange: (id: T) => void;
  disabled?: boolean;
  label: string;
}) {
  // Keep the selected chip in view (a preselected camera can sit past the scroll edge).
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = ref.current, on = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    const left = on.offsetLeft - row.offsetLeft, right = left + on.offsetWidth;
    if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, left - 16);
  }, [value]);
  return (
    <div className="chips" role="radiogroup" aria-label={label} ref={ref}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="radio"
          aria-checked={value === it.id}
          title={it.hint}
          className={`chip${value === it.id ? " is-on" : ""}`}
          disabled={disabled}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? " is-on" : ""}`} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="switch__knob" />
    </button>
  );
}

export function Segmented<T extends string>({ items, value, onChange, label, disabled }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" role="radio" aria-checked={value === it.id} className={value === it.id ? "is-on" : ""} disabled={disabled} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ label, onClick, children, disabled, className = "", pressed }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; className?: string; pressed?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
