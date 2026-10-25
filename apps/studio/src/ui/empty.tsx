import { useRef, useState } from "react";
import { IconColour, IconDewarp, IconFilm, IconPlus, IconStabilise } from "./icons";

/** First run: one big target to open a clip, plus a sample to try. */
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
      <div className="empty__glow" aria-hidden="true" />
      <div className="empty__inner">
        <button type="button" className="empty__target" onClick={() => inputRef.current?.click()} disabled={!!busy}>
          <span className="empty__ring"><IconFilm size={30} /></span>
          <span className="empty__title">{busy ?? "Open a dive clip"}</span>
          <span className="empty__sub">MP4 or MOV, up to 4K. Everything stays on this device.</span>
          <span className="btn btn--primary empty__cta"><IconPlus size={18} /> Choose video</span>
        </button>
        <button type="button" className="btn btn--quiet empty__sample" onClick={onSample} disabled={!!busy}>
          No clip handy? Try a sample
        </button>
        <ul className="empty__tools" aria-label="What it does">
          <li><IconColour size={16} /><span><b>Colour</b> restores reds the water took</span></li>
          <li><IconStabilise size={16} /><span><b>Stabilise</b> smooths swimming shots</span></li>
          <li><IconDewarp size={16} /><span><b>Dewarp</b> straightens action-cam fisheye</span></li>
        </ul>
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
