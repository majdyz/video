// <video> element helpers (same behaviour as Aqua Fix's App: iOS needs muted
// inline playback before it decodes; Safari won't re-upload a paused frame).

export type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: { mediaTime?: number }) => void) => number;
};

export function waitForEvent(el: HTMLMediaElement, ok: string[], bad: string[], timeoutMs: number, failMsg: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const done = (f: () => void) => () => {
      for (const n of ok) el.removeEventListener(n, onOk);
      for (const n of bad) el.removeEventListener(n, onBad);
      clearTimeout(t);
      f();
    };
    const onOk = done(resolve);
    const onBad = done(() => reject(new Error(failMsg)));
    const t = setTimeout(done(() => reject(new Error(failMsg + " (timed out)"))), timeoutMs);
    for (const n of ok) el.addEventListener(n, onOk);
    for (const n of bad) el.addEventListener(n, onBad);
    if (el.readyState >= 1 && ok.includes("loadedmetadata")) onOk();
  });
}

/** Resolves once a frame has been presented (rVFC), or readyState says so, or on timeout. */
export function waitForFirstFrame(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(finish, timeoutMs);
    const v = video as VideoWithRVFC;
    if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(finish);
    const poll = () => {
      if (done) return;
      if (video.readyState >= 2 && video.videoWidth > 0) finish();
      else setTimeout(poll, 50);
    };
    poll();
  });
}

export function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      clearTimeout(timer);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("seek failed")); };
    const timer = setTimeout(done, 4000);
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    try {
      video.currentTime = t;
    } catch {
      fail();
    }
  });
}
