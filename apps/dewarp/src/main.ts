import "./style.css";
import { warpUniforms, type WarpUniforms } from "./fisheye";
import { Warper } from "./gpu";
import { exportClip, probe, type ProbeResult } from "./pipeline";
import { DEFAULT_PROFILE, PROFILES } from "./profiles";

const app = document.getElementById("app")!;

function missingCapabilities(): string[] {
  const missing: string[] = [];
  if (!("gpu" in navigator)) missing.push("WebGPU (navigator.gpu)");
  if (typeof VideoDecoder === "undefined") missing.push("WebCodecs VideoDecoder");
  if (typeof VideoEncoder === "undefined") missing.push("WebCodecs VideoEncoder");
  if (typeof VideoFrame === "undefined") missing.push("WebCodecs VideoFrame");
  return missing;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function slider(label: string, min: number, max: number, step: number, value: number, format: (v: number) => string) {
  const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = el("output", {}, format(value));
  const row = el("div", { class: "row" }, el("span", {}, label), input, out);
  input.addEventListener("input", () => { out.textContent = format(input.valueAsNumber); });
  return { row, input };
}

const missing = missingCapabilities();
if (missing.length > 0) {
  app.append(
    el("div", { class: "wrap" },
      el("h1", {}, "Dewarp"),
      el("div", { class: "card gate" },
        el("h2", {}, "This browser cannot run the export"),
        el("p", {}, `Missing: ${missing.join(", ")}.`),
        el("p", {}, "Use Safari 26 or newer on iOS 26 / macOS 26, or Chrome 113 or newer on a laptop.")
      )
    )
  );
} else {
  void main();
}

async function main() {
  const fileInput = el("input", { type: "file", accept: "video/mp4,video/quicktime,.mp4,.mov" }) as HTMLInputElement;
  const fileLabel = el("label", { class: "file" }, fileInput, el("strong", {}, "Pick a clip"), " from the Osmo, MP4 or MOV");
  const meta = el("div", { class: "meta" }, "Nothing loaded.");

  const video = el("video", { class: "hidden", playsinline: "", muted: "", preload: "auto" }) as HTMLVideoElement;
  const before = el("canvas", { class: "before" }) as HTMLCanvasElement;
  const after = el("canvas", { class: "after" }) as HTMLCanvasElement;
  const wipeLine = el("div", { class: "wipe-line" });
  const preview = el("div", { class: "preview" }, before, after, wipeLine,
    el("span", { class: "tag before" }, "Before"), el("span", { class: "tag after" }, "After"));
  const wipe = slider("Compare", 0, 100, 1, 50, v => `${v}%`);
  const scrub = slider("Frame at", 0, 1, 0.1, 0, fmtTime);

  const profileSelect = el("select") as HTMLSelectElement;
  for (const [id, p] of Object.entries(PROFILES)) profileSelect.append(el("option", { value: id }, p.label));
  profileSelect.value = DEFAULT_PROFILE;

  const strength = slider("Strength", 0, 100, 1, 70, v => `${v}%`);
  const zoom = slider("Zoom", 100, 160, 1, 100, v => `${(v / 100).toFixed(2)}x`);
  const fov = slider("Source FOV", 100, 180, 1, PROFILES[DEFAULT_PROFILE].fovDeg, v => `${v}°`);
  const k1 = slider("Edge tweak", -0.3, 0.3, 0.01, 0, v => v.toFixed(2));

  const exportBtn = el("button", {}, "Export") as HTMLButtonElement;
  const cancelBtn = el("button", { class: "secondary" }, "Cancel") as HTMLButtonElement;
  const progress = el("progress", { max: "1", value: "0" }) as HTMLProgressElement;
  const status = el("div", { class: "status" });
  exportBtn.disabled = true;
  cancelBtn.hidden = true;
  progress.hidden = true;

  app.append(
    el("div", { class: "wrap" },
      el("header", {}, el("h1", {}, "Dewarp ", el("span", {}, "Wide → straight")),
        el("p", {}, "Straightens DJI Osmo Action Wide clips on this device. Nothing is uploaded. Strength around 70% keeps corners natural; 100% is full rectilinear.")),
      el("div", { class: "card" }, fileLabel, meta),
      el("div", { class: "card" }, el("h2", {}, "Preview one frame"), preview, wipe.row, scrub.row),
      el("div", { class: "card" }, el("h2", {}, "Correction"),
        el("div", { class: "row" }, el("span", {}, "Camera"), profileSelect, el("span")),
        strength.row, zoom.row,
        el("details", {}, el("summary", {}, "Advanced"), fov.row, k1.row)),
      el("div", { class: "card" }, el("h2", {}, "Export"),
        el("p", {}, "Same size and frame rate, audio copied through. The file lands in Downloads; save it to Photos from there. Keep this tab in front while it runs."),
        el("div", { class: "actions" }, exportBtn, cancelBtn), progress, status),
      el("p", {}, "Runs entirely in the browser with WebCodecs and WebGPU. Source on ",
        el("a", { href: "https://github.com/majdyz/video", target: "_blank", rel: "noopener" }, "GitHub"), ".")
    )
  );

  let warper: Warper;
  try {
    warper = await Warper.create();
  } catch (e) {
    status.className = "status error";
    status.textContent = `WebGPU failed to start: ${(e as Error).message}`;
    return;
  }
  const beforeCtx = warper.configureCanvas(before);
  const afterCtx = warper.configureCanvas(after);

  let file: File | undefined;
  let info: ProbeResult | undefined;
  let abort: AbortController | undefined;

  const currentUniforms = (): WarpUniforms =>
    warpUniforms({
      srcWidth: info?.width ?? 1920,
      srcHeight: info?.height ?? 1080,
      fovDeg: fov.input.valueAsNumber,
      k1: k1.input.valueAsNumber,
      strength: strength.input.valueAsNumber / 100,
      zoom: zoom.input.valueAsNumber / 100,
    });

  const renderPreview = () => {
    if (!info || video.readyState < 2) return;
    const u = currentUniforms();
    warper.render(beforeCtx, video, { ...u, strength: 0, zoom: 1 });
    warper.render(afterCtx, video, u);
  };

  const setWipe = () => {
    preview.style.setProperty("--wipe", `${wipe.input.valueAsNumber}%`);
  };
  setWipe();
  wipe.input.addEventListener("input", setWipe);
  for (const s of [strength, zoom, fov, k1]) s.input.addEventListener("input", renderPreview);
  profileSelect.addEventListener("change", () => {
    const p = PROFILES[profileSelect.value];
    fov.input.value = String(p.fovDeg);
    fov.input.dispatchEvent(new Event("input"));
    k1.input.value = String(p.k1);
    k1.input.dispatchEvent(new Event("input"));
  });
  scrub.input.addEventListener("input", () => { video.currentTime = scrub.input.valueAsNumber; });
  video.addEventListener("seeked", renderPreview);
  video.addEventListener("loadeddata", renderPreview);

  fileInput.addEventListener("change", async () => {
    file = fileInput.files?.[0];
    if (!file) return;
    status.className = "status";
    status.textContent = "";
    exportBtn.disabled = true;
    meta.textContent = "Reading…";
    try {
      info = await probe(file);
    } catch (e) {
      meta.textContent = `Could not read this file: ${(e as Error).message}`;
      return;
    }
    before.width = after.width = info.width;
    before.height = after.height = info.height;
    preview.style.aspectRatio = `${info.width} / ${info.height}`;
    meta.textContent = `${info.width}×${info.height}, ${info.fps.toFixed(2)} fps, ${fmtTime(info.durationS)}, ${info.codec}${info.hasAudio ? ", audio" : ", no audio"}${info.rotation ? `, rotated ${info.rotation}°` : ""}`;
    scrub.input.max = String(Math.max(0.1, info.durationS - 0.1));
    scrub.input.value = String(Math.min(1, info.durationS / 2));
    if (info.tenBit) {
      status.className = "status error";
      status.textContent = "This is a 10-bit (D-Log M) clip. Version 1 only handles 8-bit; shoot in Normal colour or convert first.";
      return;
    }
    video.src = URL.createObjectURL(file);
    video.currentTime = scrub.input.valueAsNumber;
    exportBtn.disabled = false;
  });

  exportBtn.addEventListener("click", async () => {
    if (!file || !info) return;
    abort = new AbortController();
    exportBtn.disabled = true;
    cancelBtn.hidden = false;
    progress.hidden = false;
    progress.value = 0;
    status.className = "status";
    status.textContent = "Starting…";
    const keepAwake = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
      .wakeLock?.request("screen").catch(() => undefined);
    try {
      const blob = await exportClip({
        file,
        warper,
        uniforms: currentUniforms(),
        signal: abort.signal,
        onProgress: p => {
          progress.value = p.totalFrames ? p.frames / p.totalFrames : 0;
          status.textContent = `${p.frames} of ${p.totalFrames} frames, ${fmtTime(p.elapsedMs / 1000)} elapsed`;
        },
      });
      const name = file.name.replace(/\.[^.]+$/, "") + "-dewarp.mp4";
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: name }, name);
      a.click();
      status.textContent = "";
      status.append("Done. If nothing downloaded, tap ", a, ".");
    } catch (e) {
      const err = e as Error;
      status.className = "status error";
      status.textContent = err.name === "AbortError" ? "Cancelled." : `Export failed: ${err.message}`;
    } finally {
      await keepAwake?.release().catch(() => undefined);
      exportBtn.disabled = false;
      cancelBtn.hidden = true;
      abort = undefined;
    }
  });
  cancelBtn.addEventListener("click", () => abort?.abort());
}
