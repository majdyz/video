import "./style.css";

declare const __BUILD__: string;
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
  const fileInput = el("input", { type: "file", accept: "video/*" }) as HTMLInputElement;
  const fileLabel = el("label", { class: "file" }, fileInput, el("strong", {}, "Pick a clip"), " from the Osmo, MP4 or MOV");
  const meta = el("div", { class: "meta" }, "Nothing loaded.");
  const logBox = el("pre", { class: "log" });
  const logPanel = el("details", { class: "logpanel" }, el("summary", {}, "Log"), logBox);
  const log = (line: string) => {
    const t = (performance.now() / 1000).toFixed(1).padStart(6);
    logBox.textContent += `${t}s ${line}\n`;
    console.log("[dewarp]", line);
  };
  window.addEventListener("error", e => log(`error: ${e.message}`));
  window.addEventListener("unhandledrejection", e => log(`rejected: ${(e.reason as Error)?.message ?? String(e.reason)}`));
  log(`build ${__BUILD__} · ${navigator.userAgent}`);

  const video = el("video", { class: "hidden", playsinline: "", muted: "", preload: "auto" }) as HTMLVideoElement;
  const before = el("canvas", { class: "before" }) as HTMLCanvasElement;
  const after = el("canvas", { class: "after" }) as HTMLCanvasElement;
  const wipeLine = el("div", { class: "wipe-line" });
  // The video stays in the document (hidden) so every browser actually loads it.
  const preview = el("div", { class: "preview" }, video, before, after, wipeLine,
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
      el("div", { class: "card" }, fileLabel, meta, logPanel),
      el("div", { class: "card" }, el("h2", {}, "Preview one frame"), preview, wipe.row, scrub.row),
      el("div", { class: "card" }, el("h2", {}, "Correction"),
        el("div", { class: "row" }, el("span", {}, "Camera"), profileSelect, el("span")),
        strength.row, zoom.row,
        el("details", {}, el("summary", {}, "Advanced"), fov.row, k1.row)),
      el("div", { class: "card" }, el("h2", {}, "Export"),
        el("p", {}, "Same size and frame rate, audio copied through. The file lands in Downloads; save it to Photos from there. Keep this tab in front while it runs."),
        el("div", { class: "actions" }, exportBtn, cancelBtn), progress, status),
      el("p", {}, "Runs entirely in the browser with WebCodecs and WebGPU. Source on ",
        el("a", { href: "https://github.com/majdyz/video", target: "_blank", rel: "noopener" }, "GitHub"), `. Build ${__BUILD__}.`)
    )
  );

  // The GPU comes up in the background so picking and probing a file works (and logs) even if it fails.
  let warper: Warper | undefined;
  // Preview targets are created once the GPU paths are known: WebGPU canvases when the device can
  // present, otherwise 2D canvases fed by the same readback the export uses.
  type PreviewTarget = { kind: "gpu"; ctx: GPUCanvasContext } | { kind: "2d"; ctx: CanvasRenderingContext2D };
  let beforeTarget: PreviewTarget | undefined;
  let afterTarget: PreviewTarget | undefined;
  const gpuReady = (async () => {
    try {
      warper = await Warper.create();
      warper.device.addEventListener("uncapturederror", e => {
        status.className = "status error";
        status.textContent = `GPU error: ${(e as GPUUncapturedErrorEvent).error.message.split("\n")[0]}`;
      });
      log("WebGPU device ready");
    } catch (e) {
      status.className = "status error";
      status.textContent = `WebGPU failed to start: ${(e as Error).message}`;
      log(`WebGPU failed: ${(e as Error).message}`);
    }
  })();

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

  let modeReady = false;
  const makeTarget = (canvas: HTMLCanvasElement, capture: "canvas" | "readback"): PreviewTarget =>
    capture === "canvas"
      ? { kind: "gpu", ctx: warper!.configureCanvas(canvas) }
      : { kind: "2d", ctx: canvas.getContext("2d")! };
  const paint = async (target: PreviewTarget, source: VideoFrame | HTMLVideoElement, u: WarpUniforms) => {
    if (target.kind === "gpu") {
      warper!.render(target.ctx, source, u);
      return;
    }
    const frame = await warper!.renderToFrame(source, u, 0, undefined);
    try {
      target.ctx.drawImage(frame, 0, 0);
    } finally {
      frame.close();
    }
  };
  let painting = false;
  const renderPreview = async () => {
    if (!info || video.readyState < 2 || painting) return;
    await gpuReady;
    if (!warper) return;
    painting = true;
    const u = currentUniforms();
    // A VideoFrame is what the export renders from, so the preview takes the same path.
    let frame: VideoFrame | undefined;
    try {
      frame = new VideoFrame(video);
    } catch {
      frame = undefined;
    }
    const source = frame ?? video;
    try {
      if (!modeReady) {
        // The first frame decides whether this device can import video into WebGPU and present it.
        const { mode, capture } = await warper.ensureModes(source, u);
        warper.prepareOutput(info.width, info.height);
        beforeTarget = makeTarget(before, capture);
        afterTarget = makeTarget(after, capture);
        modeReady = true;
        log(`GPU paths: input ${mode}, output ${capture}`);
        if (mode === "copy" || capture === "readback") meta.textContent += ` · GPU ${mode}/${capture}`;
        exportBtn.disabled = !file || !info || info.tenBit;
      }
      await paint(beforeTarget!, source, { ...u, strength: 0, zoom: 1 });
      await paint(afterTarget!, source, u);
    } catch (e) {
      log(`preview failed: ${(e as Error).message}`);
    } finally {
      frame?.close();
      painting = false;
    }
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
    if (!file) { log("picker returned no file"); return; }
    log(`picked "${file.name}" ${file.type || "no type"} ${(file.size / 1e6).toFixed(1)} MB`);
    status.className = "status";
    status.textContent = "";
    exportBtn.disabled = true;
    modeReady = false;
    meta.textContent = "Reading…";
    try {
      info = await probe(file, log);
      log(`probe ok: ${info.width}x${info.height} ${info.codec} ${info.frames} frames${info.rotation ? ` rotation ${info.rotation}` : ""}`);
    } catch (e) {
      meta.textContent = `Could not read this file: ${(e as Error).message}`;
      log(`probe failed: ${(e as Error).message}`);
      return;
    }
    before.width = after.width = info.width;
    before.height = after.height = info.height;
    if (beforeTarget?.kind === "gpu") beforeTarget = { kind: "gpu", ctx: warper!.configureCanvas(before) };
    if (afterTarget?.kind === "gpu") afterTarget = { kind: "gpu", ctx: warper!.configureCanvas(after) };
    if (warper && modeReady) warper.prepareOutput(info.width, info.height);
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
    // Export opens once the first preview frame has settled the GPU path.
    exportBtn.disabled = !modeReady;
    log("video element loading for the preview");
  });
  video.addEventListener("error", () => log(`video element error: ${video.error?.message ?? video.error?.code ?? "unknown"}`));
  video.addEventListener("loadedmetadata", () => log(`video metadata ${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(1)} s`));

  exportBtn.addEventListener("click", async () => {
    if (!file || !info || !warper) return;
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
        // ?debug=passthrough re-encodes without the GPU, to tell a codec problem from a warp problem.
        passthrough: new URLSearchParams(location.search).get("debug") === "passthrough",
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
      log(`export failed: ${err.message}`);
    } finally {
      await keepAwake?.release().catch(() => undefined);
      exportBtn.disabled = false;
      cancelBtn.hidden = true;
      abort = undefined;
    }
  });
  cancelBtn.addEventListener("click", () => abort?.abort());
}
