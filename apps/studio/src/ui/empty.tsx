import { useRef, useState } from "react";
import { IconFilm } from "./icons";

/** No clip yet: the stage area itself is the drop target, with one button to open a file. */
export function EmptyState({ onFiles, onPick, onSample, busy, accept }: { onFiles: (f: File[]) => void; onPick?: (source: "photos" | "files") => void; onSample: () => void; busy: string | null; accept: string }) {
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
        const files = [...(e.dataTransfer.files ?? [])];
        if (files.length) onFiles(files);
      }}
    >
      <div className="empty__drop">
        <IconFilm size={28} className="empty__icon" aria-hidden="true" />
        <h2 className="empty__title" aria-live="polite">{busy ?? "Open a dive video or photo"}</h2>
        <p className="empty__sub">MP4 or MOV clips, JPEG, PNG or HEIC photos. Pick one or several from your camera roll or drop them here; it never leaves this device.</p>
        <div className="empty__actions">
          <button type="button" className="btn btn--strong" onClick={() => (onPick ? onPick("photos") : inputRef.current?.click())} disabled={!!busy}>
            Open video or photo
          </button>
          {onPick && (
            <button type="button" className="btn btn--quiet" onClick={() => onPick("files")} disabled={!!busy}>
              Browse files
            </button>
          )}
          <button type="button" className="btn btn--quiet empty__sample" onClick={onSample} disabled={!!busy}>
            Try a sample clip
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
