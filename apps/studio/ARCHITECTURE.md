# deepfix Studio: architecture

One app for the three dive tools (Colour, Stabilise, Dewarp), built to be
wrapped by Capacitor later. The engines stay where they are and are
imported, not forked:

| Tool      | Engine (imported)                                         | Studio glue                       |
|-----------|-----------------------------------------------------------|-----------------------------------|
| Colour    | `apps/aqua-fix/src/engine` (`GradeEngine`, params, lock)   | `src/pipeline/studio.ts`          |
| Stabilise | `apps/motion-fix/src/lib` v3 (`AnalysisClient`, `analysis-run`, `plan.ts` `planWarpFn`) | `src/pipeline/geometry*.ts`, `stab-info.ts` |
| Dewarp    | `apps/dewarp/src/fisheye.ts`, `profiles.ts`                | `src/pipeline/geometry*.ts`       |
| Export    | `packages/shared` (`exportWithCodec`, `squarePixels`)       | `Studio.exportVideo()`            |

Seams added to the engine folders (kept small on purpose, other work
happens there): `apps/aqua-fix/src/engine/profile.ts` (the clip-profile
segmentation that used to live inline in Aqua Fix's `App.tsx`; Aqua Fix now
imports it too).

## Render graph today (two GPU passes when geometry is on)

```
                 ┌────────────────────────── geometry on ───────────────────────────┐
 <video> /       │  GeometryRenderer (WebGL2, one pass)                              │
 VideoFrame ─────┤   mesh UVs  = stabilise warp (similarity + wobble residual)       ├─▶ geo canvas ──┬─▶ shown (colour off)
                 │   fragment  = dewarp (Kannala-Brandt, coded frame) + rotation      │                └─▶ GradeEngine.upload ─▶ colour canvas (colour on)
                 └───────────────────────────────────────────────────────────────────┘
                 └──────────── geometry off ──▶ GradeEngine.upload(source) ─▶ colour canvas
```

* Order is physical: **dewarp → stabilise → colour**. Shake is estimated on
  the camera, the lens is undone first so stabilisation and grading work on
  a rectilinear picture, and colour comes last because the engine's
  analysis (veil, white balance, person mask) should see the final framing.
* The geometry pass is exact for both warps: the stabilise warp is a
  similarity (plus a small homography residual) and is evaluated per mesh
  vertex (33×19), the non-linear lens model per fragment. Maths in
  `geometry-math.ts`, mirrored in GLSL in `geometry.ts`, cross-checked by
  `test/geometry.test.ts` against the Dewarp app's own `samplePoint`.
* Rotation (portrait phone clips): the lens model lives in the coded
  (sensor) frame; the stabilise path in the display frame. The shader maps
  display → coded, dewarps, then picks the texture orientation (the
  `<video>` element is upright, decoded `VideoFrame`s are coded).
* Before/after: the geometry pass shows the untouched source left of the
  split, and the colour engine shows its (already untouched) input there, so
  the left side is the true original with any tool combination.
* Preview: the geometry canvas renders at the stage's device-pixel size
  (≤ 1600 px), so the extra pass costs little; export renders it at full
  size and one frame at a time (the canvas is shared between stages).
* Stabilise approximation: Motion Fix tracks the raw (fisheye) frames, and
  the path is applied in the dewarped frame. Near the centre the two agree;
  at the edges of very wide lenses the residual is a fraction of the crop
  budget. The correct fix is tracking on dewarped frames (see below).

Cost of the current design: with colour + geometry on, every frame is
drawn twice and copied once (geo canvas → engine texture: a
`texImage2D`/`copyExternalImageToTexture` of a canvas). On a phone at 4K
that copy is the main overhead, roughly the cost of one upload.

## Target: single geometry-warp → colour pass

The colour engine samples its source in exactly two places, both in
`apps/aqua-fix/src/engine/shaders.ts`: the render fragment
(`texture(u_source, suv)` after `rotateUV`, then `grade(src, uv)` from
`grade-shader.ts`) and the downscale pass behind `backend.analyze()` (the
256×144 analysis thumbnail, which already takes a sub-rect `u_rect`), each
with a GLSL and a WGSL version. The single-pass design moves
the geometry into those fetches:

1. **Uniforms**: add a geometry block to the engine (`GeometryUniforms`:
   rotation, dewarp lens 16 floats as in `apps/dewarp/src/fisheye.ts`
   `packUniforms`, split flag) and a per-frame **UV mesh** or a small
   **warp texture** (33×19 RG32F of stabilised source positions, the
   same numbers `GeometryRenderer` puts in its `a_mid` buffer).
2. **Shader**: compute `suv = rotateUV(warp(uv), u_rotation)` instead of
   `rotateUV(uv, …)`, where `warp` bilinearly reads the warp texture
   (exact for the similarity, like the mesh) and then applies the lens model
   per fragment (the GLSL in `src/pipeline/geometry.ts` is the reference;
   it needs a WGSL twin next to the existing WGSL fragment in `shaders.ts`).
3. **Analysis**: the downscale pass must average the *warped* image so the
   grade sees the final framing: same `warp()` before its `rotateUV`.
4. **Engine API**: `GradeEngine.setGeometry(g: GeometryUniforms | null,
   warpTex: Float32Array | null)`; `render()`/`renderToFrame()` unchanged.
   Studio then always uploads the raw source and drops the geo canvas
   except for colour-off (where a trivial "grade = identity" flag on the
   same shader would do, removing the second renderer entirely).
5. **Motion analysis on the dewarped picture**: `motion-fix`'s worker
   decodes with mediabunny; add an optional lens to the analysis request
   and undistort the tracked feature *coordinates* (not pixels: apply the
   inverse lens to each KLT point before fitting the similarity). That is
   cheap and removes the approximation noted above.

Expected gain: one full-resolution texture copy and one draw per frame
fewer, and the person detector / veil fit see exactly what is exported.
Risk: the engine's shaders are under active work; this needs a short
freeze of `grade-shader.ts` and both backends to land.

## Export

Two paths, picked per browser when a clip opens (`Studio.pickExportMode`):

* **Offline WebCodecs** (Chrome, Android, desktop Firefox): every frame
  decoded, rendered once, encoded with its own timestamp, audio packets
  copied through (`exportWithCodec`). The stage never shows the full-size
  render canvas during this export: the engine's canvas is resized for
  `renderToFrame` every frame, which showed up as a magnified crop on the
  stage. Instead the stage gets an overlay `<canvas>` fed with bitmaps of
  the *encoded* frames (`Studio.onExportFrame`, ~4 per second at the
  stage's pixel size), the same bitmaps the export sheet shows, so the
  live view is exactly the output, on every backend.
* **Real-time recorder** (WebKit: Safari and every iOS browser, where each
  canvas → VideoFrame copy costs 60–80 ms): the clip plays through once,
  every presented frame is rendered at full size into the visible canvas
  (the colour canvas, or the geometry canvas with colour off) and recorded
  with MediaRecorder; the recording is remuxed with the original audio
  packets (`exportRealtime` in packages/shared, as Aqua Fix uses it).
  Backgrounding pauses playback and the recorder together. If the
  renderer falls below 90 % of the clip's frame rate in the first 2.5 s,
  the export restarts with the clip slowed to ½, then ¼ speed (the remux
  re-times it, so every frame still lands in the file), then at half
  size. The first frame is analysed before recording starts.
  `?rt=1` / `?rt=0` force the path on or off anywhere.
* **Native** (only inside the Capacitor app, `apps/mobile`, for clips opened
  with the native picker): the page decodes and renders exactly as the
  offline path does, then `NativeFrameSink` (`src/native/bridge.ts`) posts
  each frame's pixels to the app's encoder over a loopback socket
  (AVAssetWriter / MediaCodec), and the app copies the audio from the source
  file. `src/native/` is a lazy chunk (with `@capacitor/core`) that the web
  build never loads; `src/native/registry.ts` (no Capacitor import) is all the
  shell sees. `?native=0` keeps the web paths in the app. Design and
  background behaviour: `apps/mobile/MOBILE.md`. Footage profiles apply here
  too (same geometry-pass transform and frame re-tagging as offline).
* **Photos**: one full-size render (the WebGL2 engine's canvas, the
  WebGPU engine's `renderToFrame`, or the geometry canvas with colour off)
  drawn into a 2D canvas and encoded as JPEG (quality 0.92), with the
  source's EXIF carried over (see Photos).

Output is always 8-bit SDR Rec.709 (H.264, HEVC when H.264 can't be
encoded), whatever the source: 10-bit / HDR / log clips are converted on
the way in (see Footage profiles). HDR or 10-bit export is not offered.

WebKit fixes on the offline path (it is Safari's fallback when
MediaRecorder is missing, and `?rt=0`):

* WebKit reports an untagged stream's colour space as `primaries:
  "unspecified"`, a value outside the WebCodecs enums; mediabunny validates
  the enum when it wraps a decoded frame and threw "colorSpace.primaries
  must be one of …" on the first frame. `packages/shared/src/videoframe-
  colorspace.ts` patches `VideoFrame.prototype.colorSpace` (page and the
  motion worker) so out-of-spec values read as null.
* Canvas-wrapped VideoFrames encoded upside down in Playwright's WebKit.
  `frame-orientation.ts` measures it end to end once per page (a two-colour
  WebGL canvas → VideoEncoder → VideoDecoder → read back) and, when
  flipped, re-wraps each output frame through a vertically flipped 2D
  canvas (a flipped ImageBitmap did not survive the round trip). Chrome and
  Firefox pass the check and pay nothing per frame.
* The decoding `<video>` is a 1 px transparent box, not `display: none`:
  WebKit neither advances nor decodes a `display: none` video (black
  uploads, so the colour analysis graded black frames).

Before any export or engine reset, `Studio.settleEngine()` waits for the
engine's in-flight analysis readback: `GradeEngine.reset()` clears its flag
but the GPU readback keeps running, and the next analysis then failed with
"analysis readback already in flight".

## Photos

JPEG / PNG / WebP everywhere, HEIC where the browser decodes it (Safari;
`createImageBitmap(blob)` first, an `<img>` decode as fallback). The
bitmap is EXIF-oriented and bounded to the browser's limits (WebKit's
16.7 Mpx canvas cap, WebGPU's 8192 px textures; the sheet says when a
48 Mpx photo was scaled). Colour and Dewarp apply (Stabilise is hidden);
there is no frame loop, so the photo is analysed once, snapped, and
re-analysed (debounced) when the framing changes.

EXIF (`pipeline/photo-exif.ts`, tested in `test/exif.test.ts`): the
source's EXIF is read from JPEG (APP1), HEIC / HEIF / AVIF (the ISOBMFF
`Exif` item via iinf / iloc), PNG (`eXIf`) or WebP (`EXIF`), and written as
an APP1 segment right after SOI of the exported JPEG (the encoder's JFIF
APP0 is dropped). Orientation is set to 1 (the bitmap is already upright),
PixelX/YDimension to the exported size, IFD1 (the unedited thumbnail) is
dropped. Date, GPS, camera, lens and exposure tags are kept byte for byte.
A block too big for one segment (64 KB, e.g. large maker notes) is
re-packed without the maker note; GPS and the rest survive.

## Footage profiles (10-bit, HDR, log)

`pipeline/footage.ts` (maths + detection, no DOM), the GLSL twin
`FOOTAGE_GLSL` in the geometry pass, `pipeline/signal-probe.ts`
(per-browser calibration). The source is converted to Rec.709 SDR **before
every tool**: whenever a profile other than Standard is active the
geometry pass runs (even with Dewarp / Stabilise off) and its fragment
shader applies `footageToSdr` after the lens lookup, so dewarp,
stabilise, the colour engine's analysis and the export all see a normal
picture. 10-bit sources are uploaded into a half-float texture (RGBA16F)
so the log / HDR expansion doesn't band; the "before" side of the split
shows the untouched signal.

| Profile    | Detected from                                                     | Conversion (source signal → Rec.709 signal) |
|------------|-------------------------------------------------------------------|---------------------------------------------|
| Standard   | everything else (8-bit, GoPro Natural / Flat / Vibrant, DJI Normal) | none |
| D-Log M    | DJI djmd metadata: StreamMeta 2 → ColorMode 4 → 19 (Osmo Action 4/5 Pro, Pocket 3; DJI tags these files plain bt709). Fallback: 10-bit DJI with no colour mode | fit to DJI's free "D-Log M to Rec.709" LUT (Action 4 and 5 Pro ship the same table): 3×3 mix in a 10^(0.859·code) domain, then a degree-7 neutral curve. The LUT is not shipped. Natural colours: RMS 0.015, max 0.072 vs the LUT; on a real Osmo Action 5 Pro frame RMS 0.006 (99.5 % of values within 0.025) |
| HDR HLG    | transfer `hlg` in the codec config (iPhone HDR / Dolby Vision 8.4, GoPro / Osmo HLG) | BT.2100 inverse OETF, OOTF at 1000 cd/m² (γ 1.2), ÷ 203 cd/m² (BT.2408 reference white), BT.2020 → BT.709 (BT.2087), highlight roll-off, BT.1886 (γ 2.4) encode |
| HDR PQ     | transfer `pq`                                                      | BT.2100 EOTF ÷ 203 cd/m², same gamut / roll-off / encode (peak assumed 1000 cd/m²) |
| Apple Log  | Apple metadata naming it, or an iPhone BT.2020 clip without an HDR transfer | Apple Log white paper decode (constants as in colour-science, BSD-3), BT.2020 → BT.709, scene 18 % grey → display 0.128 (= 26/203, the same place HDR puts grey), roll-off to Apple Log's peak |
| BT.2020    | primaries `bt2020` with an SDR transfer                            | γ 2.4 → linear, BT.2020 → BT.709, re-encode |

Roll-off: identity below 0.5 (display-linear, 1 = SDR white), then a
rational curve, C¹ at the joint, reaching 1 exactly at the source's peak,
so HDR reference white lands at ≈ 0.89 signal and every level up to
1000 cd/m² stays separated (a tanh shoulder squeezed them into the top
codes: 12 % of an iPhone frame clipped). Grey cards land at 0.43 signal
(BT.2408's 26 cd/m²) from HLG, PQ and Apple Log alike. Not covered:
GoPro GP-Log (no published curve; detected from GPMF `PTCL` and reported,
shown as Rec.709), DJI D-Log (non-M) and D-Log2.

**What the browser hands over.** Measured, not assumed: Chrome uploads a
`<video>` frame's raw signal but converts a WebCodecs VideoFrame to sRGB
(BT.2020 → BT.709, HLG / PQ clipped at SDR white); Playwright WebKit
uploads raw from both. So when a clip's tags aren't plain Rec.709, the
Studio plays a tiny calibration clip with known patches, tagged the same
way and in the same codec family (`public/calib/*`, 128×64, 10-bit,
built by `scripts/calibration-clips.mjs`), through both paths and reads
it back (`signal-probe.ts`). Raw → the shader converts. Converted frames →
each decoded frame is copied out and re-wrapped tagged Rec.709 (keeping
its matrix and range), which makes the upload raw; verified by the same
read-back. If neither works, the browser's own conversion is kept on that
path and the shader skips the HDR transform there (the UI note says so).
A paused still (`createImageBitmap(video)`) that reads differently from
the element (Chrome converts it) is not used; the element is drawn
instead. Log profiles are tagged Rec.709, so they are never affected.

**Decoding.** 10-bit HEVC plays where the platform decodes it: Safari on
macOS / iOS / iPadOS, Chrome / Edge with hardware HEVC on macOS, Windows
and Android (not Linux). VP9 profile 2 and AV1 10-bit decode in Chrome
everywhere. When the `<video>` can't load a clip the error names the codec
and where it plays (`codecHelp`); when the element plays it but WebCodecs
can't decode it (offline export), Export is disabled with the reason
logged. ProRes (iPhone Apple Log) decodes only in Safari on a Mac.

The **Footage profile** chooser (Colour → Advanced, videos only) offers
Auto (with the evidence) and every profile as a manual override; a line
above the tool panel says what is converted ("DJI D-Log M → Rec.709 ·
Change"). Changing it re-profiles the colour (its input changed).
`?footage=<profile>` forces one (headless checks).

## Stabilise (Motion Fix v3)

The Stabilise tool runs Motion Fix v3's analysis (`analyzeAny` in the
worker): GoPro `gpmd` / DJI `djmd` gyro telemetry when the file has usable
data (rotation-exact through the clip's lens, rolling shutter, flat-port
underwater refraction checked against the picture), feature tracking
otherwise. `stab-info.ts` turns the result into the status line
("Gyro stabilisation · GoPro HERO10 Black" / "Visual stabilisation") and
the warning under it (EIS on in camera, no motion data: import the original
from the SD card, gyro/picture mismatch). Advanced offers the motion
source (gyro data / visual tracking: a re-analysis), the lens port (auto /
air / underwater), Keep level (when the clip knows gravity) and the crop
budget. One Strength drives both paths (`solveParams`: Steady = 0.8 on the
visual path, v3's tuned 0.6 on the gyro path, 100 = full smoothing).

The per-vertex warp is `planWarpFn(result, plan, t, displayW, displayH)`
(output centred display px → source centred display px), the same
contract as v2, so the geometry pass is unchanged. With gyro data and
Dewarp on, the plan is solved with `output: "rectilinear"`: the gyro warp
projects through the clip's own lens model into straight lines, and the
shader's separate Kannala-Brandt pass is skipped (it would undo the lens
twice). Toggling Dewarp re-solves. Without gyro data the order stays
dewarp (shader) → visual stabilise (mesh), with the approximation noted
above.

## Camera detection

When a clip opens, `pipeline/camera.ts` reads the moov box and the first
sample of each timed-metadata track (DJI `djmd`, GoPro `gpmd`) with a small
box walker (no mp4box) and runs Dewarp's `detectCamera`. The Dewarp tab
preselects the suggested profile, offers "From clip" when the camera wrote
its own lens calibration (`resolveProfile(FROM_FILE, camera)`, HyperSmooth
crop applied for GoPro), and shows "Detected: GoPro HERO10 Black · Wide".
Any chip is still a manual override.

## Loading

The first-load bundle is the shell only (React, the UI, tool state). Each
engine is its own chunk, loaded when first needed:

| Chunk        | Loaded                                  | Contents                                   |
|--------------|-----------------------------------------|--------------------------------------------|
| `index`      | page load                               | React, UI, tool state, geometry renderer   |
| `colour`     | right after first paint                 | Aqua Fix GradeEngine, clip profile         |
| `media` (+ mediabunny) | when a clip opens             | probe, camera detection, both exporters    |
| `motion`     | first time Stabilise is on              | Motion Fix analysis client, path helpers   |
| `dewarp` / `fisheye` | first time Dewarp is on         | lens maths                                 |
| workers      | on use                                  | analysis, person (MediaPipe from `mediapipe/`) |

The capability checks the shell needs live in `pipeline/env.ts` (copies of
the shared ones) so the shell shares no module, and so no mediabunny, with
the media chunk. The service worker (`public/sw.js`, versioned at build by
`studioServiceWorker` in vite.config.ts) precaches the shell and every
JS/CSS chunk, so all tools work offline after one online visit; each
deploy gets a new cache name and old caches are deleted on activate.

## UI

* `src/theme/tokens.css` is the only place colours, fonts, radii, spacing
  and motion live. Three looks are defined (`abyss` default, `coral`,
  `depth`) and switchable in the About sheet; a new direction is one more
  `[data-theme]` block. Text colours meet WCAG AA (4.5:1) on every surface
  in all three themes.
* Restraint rules (user feedback): the wordmark is one plain colour
  (`BRAND.name` in `src/brand.ts` is a placeholder); the accent appears
  only on Export, the active slider fill and focus rings; selection,
  switches, values and icons are neutral greys; no glows, glass blur,
  gradients or all-caps tracked labels.
* Fonts are self-hosted via fontsource (bundled by Vite), no runtime
  network fetch: Space Grotesk (wordmark/headings) and Inter (UI) for
  Abyss, Manrope and Fraunces for the alternatives.
* Phone portrait: the picture runs edge to edge between a 44 px top bar and
  a bottom dock (grab handle, timeline, the active tool's panel, tool tabs
  and Export). The dock collapses to timeline + tabs (tap or drag the
  handle, or tap the active tab); it starts collapsed for portrait clips
  so a 9:16 clip gets the height, open for landscape ones.
* ≥ 960 px or phone landscape: picture left, controls card right with
  Export at its bottom.
* Stage gestures (`ui/stage.tsx`), one thumb is enough: drag anywhere to
  move the before/after line (near the line when zoomed in); with compare
  off, press and hold to see the original; double-tap or pinch to zoom
  (up to 6×, the preview re-renders sharper up to 4096 px while zoomed),
  drag to pan, the "2.5×" button returns to fit; tap plays/pauses. Mouse
  wheel zooms; with the picture focused, + / − / 0 and the arrow keys.
* Accessibility: sheets are modal dialogs that take focus, trap Tab and
  return focus on close; tabs are a tablist with a labelled tabpanel;
  the timeline is a slider with a spoken time; status lines are polite
  live regions; `prefers-reduced-motion` turns transitions off (the busy
  spinner keeps turning slowly); page zoom is allowed.

## Debug URL flags

`?footage=auto|standard|dlogm|hlg|pq|applelog|wide` (footage profile),
`?webgl2` (force the WebGL2 colour backend: headless screenshots),
`?tools=colour,stabilise,dewarp` (initial tool set), `?tab=dewarp`,
`?person=0`, `?lock=0` (as in Aqua Fix), `?rt=1|0` (real-time export on /
off), `?dock=open|closed` (phone dock).

## Open issues

* The stage's magnified crop during offline exports is gone by design (the
  stage shows bitmaps of the encoded frames, never the resized render
  canvas). Its root cause in the engine's on-screen canvas was not
  isolated; it only matters if someone renders the engine canvas on the
  stage during an export again.
* Playwright's Linux WebKit has no MediaRecorder, so the real-time path was
  verified in Chrome (`?rt=1`); the WebKit offline fallback now exports
  (colour-space patch, orientation round-trip, visible `<video>`), checked
  with Playwright WebKit on an untagged H.264 clip and a 10-bit HEVC
  D-Log M clip. Real Safari's VideoToolbox encoder may not flip at all;
  the round-trip check then costs one tiny encode.
* Footage profiles were validated on CPU against independent references
  (DJI's LUT through ffmpeg `lut3d`; ffmpeg zscale + tonemap for HLG) and
  in the browser (GLSL twin = CPU to 1e-5 in Chrome; full export of a
  D-Log M clip and of synthetic HLG patches). The HLG rendering is
  display-referred (BT.1886): brighter mid-tones than a scene-referred
  BT.709-OETF conversion (ffmpeg's), by design. The HEVC calibration clips
  and the Safari / Chrome-with-HW-HEVC upload paths could not be run here
  (no HEVC decode in headless Linux Chrome, no Safari): those platforms
  fall back to "assume raw" only if the calibration clip fails to load.
* Playwright's Linux WebKit (GStreamer) refuses iPhone Dolby Vision 8.4
  files in `<video>` (MEDIA_ERR_SRC_NOT_SUPPORTED; once it played a remux)
  while its WebCodecs decodes them; the error then says the player, not
  the codec, is the problem. A WebCodecs-driven preview would cover such
  files everywhere; not built.
* Chrome decodes BT.2020 YCbCr blue ~6 % low on its WebCodecs and
  `<video>` paths (a 0.5 blue patch reads 0.47); the conversion is exact
  on what it receives.
* MediaPipe's person detector does not start in Playwright WebKit (no
  WebGL2 in its worker); the grade runs without the person mask there.
* HEIC decoding was not exercised headless (Chrome cannot decode it; the
  Linux WebKit build was not tried with a HEIC file).
* Real-time export on a slow renderer: after the ¼-speed half-size step
  the recorder keeps whatever frames it gets (as in Aqua Fix).
* The gyro warp is evaluated per mesh vertex (33×19) and interpolated
  linearly between; with rectilinear output on very wide lenses a denser
  mesh (or the single-pass per-fragment warp) would be more exact at the
  edges.
* One headless run logged "WebGL: too many errors" after ~20 minutes idle
  post-export; not reproduced in a 60 s idle run.
