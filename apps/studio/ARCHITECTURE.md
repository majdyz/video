# deepfix Studio: architecture

One app for the three dive tools (Colour, Stabilise, Dewarp), built to be
wrapped by Capacitor later. The engines stay where they are and are
imported, not forked:

| Tool      | Engine (imported)                                         | Studio glue                       |
|-----------|-----------------------------------------------------------|-----------------------------------|
| Colour    | `apps/aqua-fix/src/engine` (`GradeEngine`, params, lock)   | `src/pipeline/studio.ts`          |
| Stabilise | `apps/motion-fix/src/lib` (`AnalysisClient`, `warpFnAtTime`) | `src/pipeline/geometry*.ts`     |
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
* **Photos**: one full-size render (`renderToFrame`, or the geometry
  canvas with colour off) drawn into a 2D canvas and encoded as JPEG
  (quality 0.92).

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
re-analysed (debounced) when the framing changes. Output keeps no EXIF.

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

`?webgl2` (force the WebGL2 colour backend: headless screenshots),
`?tools=colour,stabilise,dewarp` (initial tool set), `?tab=dewarp`,
`?person=0`, `?lock=0` (as in Aqua Fix), `?rt=1|0` (real-time export on /
off), `?dock=open|closed` (phone dock).

## Open issues

* With a geometry tool on, `GradeEngine.render()` on the stage during an
  offline export showed a magnified crop in headless WebGL2 (the exported
  frames are correct). The stage live view is therefore disabled on that
  path; the export sheet's thumbnails (bitmaps of the encoded frames) are
  the live view. Likely the backend's on-screen size after a full-size
  `renderToFrame` of a canvas source; investigate with the single-pass work.
* One headless run logged "WebGL: too many errors" after ~20 minutes idle
  post-export; not reproduced in a 60 s idle run.
* Photos (Aqua Fix supports stills) are not wired into the Studio yet.
* The bundled sample clip's attribution (Wikimedia Commons, CC BY-SA)
  needs the exact author/title before a store release.
