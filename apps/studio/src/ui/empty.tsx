import { useRef, useState } from "react";
import { IconFilm } from "./icons";

/** No clip yet: the stage area itself is the drop target, with one button to open a file. */
export function EmptyState({ onFile, onSample, busy }: { onFile: (f: File) => void; onSample: () => void; busy: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`empty${over ? " is-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div className="empty__drop">
        <IconFilm size={28} className="empty__icon" />
        <h2 className="empty__title">{busy ?? "No clip open"}</h2>
        <p className="empty__sub">Open an MP4 or MOV from your camera roll, or drop it here. Processing stays on this device.</p>
        <div className="empty__actions">
          <button type="button" className="btn btn--strong" onClick={() => inputRef.current?.click()} disabled={!!busy}>
            Open video
          </button>
          <button type="button" className="btn btn--quiet empty__sample" onClick={onSample} disabled={!!busy}>
            Use sample clip
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mov,.mp4,.m4v"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
