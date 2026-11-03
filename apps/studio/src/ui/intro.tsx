import { BRAND } from "../brand.ts";
import { Sheet } from "./sheet";

const SEEN_KEY = "studio.introSeen";

/**
 * The intro shows once, on the first visit (About reopens it). Automated browsers (navigator.webdriver) skip it so
 * headless checks land on the empty state; `?intro=1` shows it anyway.
 */
export function introDue(): boolean {
  try {
    if (new URLSearchParams(location.search).get("intro") === "1") return true;
    if (navigator.webdriver) return false;
    return localStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode: it shows again next time */ }
}

const STEPS = [
  { title: "Pick a clip", text: "A dive video or photo from your camera roll. It stays on this phone: nothing is uploaded." },
  { title: "Choose a style and tools", text: "Colour brings back the reds the water took: Natural, Vivid or Blue water. Turn on Stabilise or Dewarp if the shot needs it; Compare shows before and after." },
  { title: "Export", text: "Save the graded clip or photo back to your phone." },
];

/** Three steps (pick, adjust, export); before a clip is open, the bundled sample or the picker (onSample / onOpen). */
export function IntroSheet({ open, onClose, onSample, onOpen }: { open: boolean; onClose: () => void; onSample: (() => void) | null; onOpen: (() => void) | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Welcome to ${BRAND.name}`} className="intro">
      <div className="intro__body">
        <p className="intro__lede">Colour correction, stabilising and lens dewarping for dive footage, on your phone.{BRAND.beta ? " This is an early beta: Send feedback (under ⋯) when something breaks or looks wrong." : ""}</p>
        <ol className="intro__steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="intro__num" aria-hidden="true">{i + 1}</span>
              <span className="intro__text"><b>{s.title}</b>{s.text}</span>
            </li>
          ))}
        </ol>
        <div className="intro__actions">
          {onSample && <button type="button" className="btn btn--strong btn--block" onClick={onSample}>Try a sample clip</button>}
          {onOpen && <button type="button" className="btn btn--quiet btn--block" onClick={onOpen}>Open my own clip</button>}
          {!onSample && !onOpen && <button type="button" className="btn btn--strong btn--block" onClick={onClose}>Got it</button>}
        </div>
      </div>
    </Sheet>
  );
}
