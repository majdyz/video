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

Offline WebCodecs export only (`exportWithCodec`): every frame decoded,
rendered once, encoded with its own timestamp, audio packets copied
through. The export sheet shows progress, frames/fps/ETA and small
bitmaps of the rendered output (`Studio.onThumb`), and offers Share (Web
Share with files) and Save (download) at the end. The real-time recorder
path of Aqua Fix (`?rt=1`) is not wired; the user rejected it as the
default in Oct 2026.

## UI

* `src/theme/tokens.css` is the only place colours, fonts, radii, spacing
  and motion live. Three looks are defined (`abyss` default, `coral`,
  `depth`) and switchable in the About sheet; a new direction is one more
  `[data-theme]` block.
* Restraint rules (user feedback): the wordmark is one plain colour
  (`BRAND.name` in `src/brand.ts` is a placeholder); the accent appears
  only on Export, the active slider fill and focus rings; selection,
  switches, values and icons are neutral greys; no glows, glass blur,
  gradients or all-caps tracked labels.
* Fonts are self-hosted via fontsource (bundled by Vite), no runtime
  network fetch: Space Grotesk (wordmark/headings) and Inter (UI) for
  Abyss, Manrope and Fraunces for the alternatives.
* Layout: phone portrait = picture, timeline, tool panel, then the tab bar
  with Export in the bottom-right; ≥ 960 px or phone landscape = picture
  left, controls card right with Export at its bottom. Safe-area insets on
  all edges; 44 px minimum touch targets.

## Debug URL flags

`?webgl2` (force the WebGL2 colour backend: headless screenshots),
`?tools=colour,stabilise,dewarp` (initial tool set), `?tab=dewarp`,
`?person=0`, `?lock=0` (as in Aqua Fix).

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
