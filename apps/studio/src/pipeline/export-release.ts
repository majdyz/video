// The preview's <video> during an offline / native export.
//
// Those exports decode the file themselves (WebCodecs): the preview element is only paused, but a paused <video>
// keeps its decoder and its reference frames (at 4K HEVC on a phone, on the order of 100–200 MB), next to the
// export's own decoder and the lookahead's. So the element is unloaded for the length of the render and loaded
// again after it, whatever way the render ended (done, cancelled, failed, handed to the real-time recorder,
// which plays this element). Kept free of the DOM so the state machine is testable (test/export-release.test.ts).

/** What the release needs of an HTMLVideoElement. */
export type ReleasableVideo = {
  src: string;
  readonly readyState: number;
  pause(): void;
  play(): Promise<void>;
  load(): void;
  removeAttribute(name: string): void;
};

export type RestoreWaits<V> = {
  /** Resolves when the element has its metadata again; rejects on an error or a timeout. */
  metadata(v: V): Promise<void>;
  /** Resolves once a frame is decoded (or on its own timeout: it never rejects). */
  firstFrame(v: V): Promise<void>;
};

export type RestoreResult = "restored" | "not-released" | "clip-changed" | "failed";

export class PreviewRelease<V extends ReleasableVideo = ReleasableVideo> {
  private held: string | null = null;

  /** The element is unloaded right now. */
  get released(): boolean {
    return this.held !== null;
  }

  /** Unloads the element (its decoder goes). False when there is nothing to unload or it is unloaded already. */
  release(v: V, url: string | null): boolean {
    if (!url || this.held !== null) return false;
    this.held = url;
    v.pause();
    v.removeAttribute("src");
    v.load();
    return true;
  }

  /**
   * Loads the clip back into the element and leaves it paused on a decoded frame, as the export found it.
   * `current` is the open clip's URL now: a clip closed or replaced meanwhile owns the element, which is then
   * left alone (checked again after every wait). Safe to call when nothing was released.
   */
  async restore(v: V, current: () => string | null, waits: RestoreWaits<V>): Promise<RestoreResult> {
    const url = this.held;
    if (url === null) return "not-released";
    this.held = null;
    if (current() !== url) return "clip-changed";
    try {
      v.src = url;
      v.load();
      await waits.metadata(v);
      if (current() !== url) return "clip-changed";
      // iOS only decodes once playback starts (as on open): play muted, wait for a frame, pause.
      await v.play().catch(() => undefined);
      await waits.firstFrame(v);
      if (current() !== url) return "clip-changed";
      v.pause();
      return v.readyState >= 2 ? "restored" : "failed";
    } catch {
      return current() === url ? "failed" : "clip-changed";
    }
  }
}

/** The export log's line for what was freed at the start of a render. */
export function releaseSummary(r: { decoders: string[]; targets: number; bytes: number }): string {
  const d = r.decoders.length ? `${r.decoders.length} decoder${r.decoders.length === 1 ? "" : "s"} (${r.decoders.join(", ")})` : "0 decoders";
  return `${d}, ${r.targets} preview GPU target${r.targets === 1 ? "" : "s"} (~${(r.bytes / 1048576).toFixed(1)} MB)`;
}
