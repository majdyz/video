import { useCallback, useEffect, useRef, useState } from "react";
import { styleThumbsDue, type ColourStyle } from "../pipeline/tools.ts";

/** What paints the thumbnails (Studio.paintStyleThumbs) and when they are due again. */
export type StyleThumbSource = {
  paint: (targets: { style: ColourStyle; canvas: HTMLCanvasElement }[]) => boolean;
  /** Changes when the picture the thumbnails show has changed (another frame, clip or colour setting). */
  key: string;
  playing: boolean;
};


/**
 * Colour → Style as three small pictures: the frame on screen graded Natural, Vivid and Blue water, so the choice is
 * seen before it is made. They are painted from the frame the engine already holds (no decode, no analysis): once
 * when shown, again when the frame or a colour setting changes (and once more a little later, when that frame's own
 * analysis has landed). Not again and again while the clip plays: each paint is three full renders of the shared
 * engine and a GPU readback, which made playback stutter and the picture flicker on an iPhone (owner, 13 Nov). In
 * play they paint once when their picture is missing (the panel opened mid-play left them blank: owner, 13 Nov), then
 * rest and catch up on pause. Until a picture is in, each is a plain labelled tile.
 */
export function StyleThumbs({ items, value, onChange, disabled, source }: {
  items: { id: ColourStyle; label: string; hint?: string }[];
  value: ColourStyle;
  onChange: (id: ColourStyle) => void;
  disabled?: boolean;
  source: StyleThumbSource;
}) {
  const canvases = useRef(new Map<ColourStyle, HTMLCanvasElement>());
  const [painted, setPainted] = useState(false);
  const paintRef = useRef(source.paint);
  paintRef.current = source.paint;

  const run = useCallback(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targets: { style: ColourStyle; canvas: HTMLCanvasElement }[] = [];
    for (const [style, canvas] of canvases.current) {
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) continue;
      // Sizing a canvas clears it: only when its box changed.
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      targets.push({ style, canvas });
    }
    if (!targets.length || !paintRef.current(targets)) return false;
    setPainted(true);
    return true;
  }, []);

  /** The `source.key` whose picture is in the thumbnails (null: none yet). */
  const paintedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = source.key, playing = source.playing;
    if (!styleThumbsDue(playing, key, paintedKey.current)) return;
    const paint = () => { if (run()) paintedKey.current = key; };
    // In play: one paint; the later try only runs if the first could not (the engine was busy, the canvases not laid out).
    // (120 ms: the Strength slider sits under the pictures, and a drag should not paint on every step.)
    const a = window.setTimeout(paint, 120);
    const b = window.setTimeout(() => { if (!playing || paintedKey.current !== key) paint(); }, 900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [run, source.key, source.playing]);

  return (
    <div className="style-thumbs" role="radiogroup" aria-label="Style">
      {items.map((it) => (
        <button key={it.id} type="button" role="radio" aria-checked={value === it.id} title={it.hint} disabled={disabled}
          className={`style-thumb${value === it.id ? " is-on" : ""}${painted ? " has-picture" : ""}`} onClick={() => onChange(it.id)}>
          <canvas aria-hidden="true" ref={(el) => { if (el) canvases.current.set(it.id, el); else canvases.current.delete(it.id); }} />
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
