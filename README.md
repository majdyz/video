# video — Aqua Fix + Motion Fix + Dewarp

Three on-device PWAs for diver-shot footage, in one monorepo.

- **Aqua Fix** · https://majdyz.github.io/video/aqua-fix/ — underwater colour
  correction. One adaptive engine, no modes: a linear-light Sea-thru-style
  pipeline (per-pixel range proxy → backscatter removal → range-adaptive
  compensation → white balance on the de-scattered image → local contrast →
  Oklab chroma control) estimated from 256×144 thumbnails in a worker and
  applied at native resolution in one WebGPU (or WebGL2) pass. For video the
  global correction is locked to the median over ~12 frames of the clip
  (a subject passing through can't swing it); the per-pixel water/object
  maps still follow the content. An on-device person model (MediaPipe)
  keeps skin on the restoration path and pulls it toward a skin tone.
  Controls: Intensity (50 % = the estimate), scene presets (Auto / Green
  water / Deep blue / Shallow reef) as priors, a Deep-blue look fitted to
  reference grades, and advanced sliders. Export decodes/encodes offline
  with WebCodecs and copies the original audio through; on WebKit, where the
  canvas capture is slow, it plays the clip and records the graded canvas in
  real time, then remuxes the original audio.
- **Motion Fix** · https://majdyz.github.io/video/motion-fix/ — stabilisation.
  One pipeline, no modes: dependency-free KLT tracking (Shi-Tomasi corners
  bucketed on a grid, pyramidal Lucas-Kanade with a forward–backward check,
  per-cell translational RANSAC, MSAC similarity + Tukey IRLS), Grundmann's
  L1-optimal camera path solved exactly by a banded primal-dual interior
  point (1000 frames in under a second), adaptive zoom within the crop
  budget, Grundmann wobble suppression between keyframes, a 32×18 WebGL
  UV-warp mesh for preview and export, analysis in a worker over WebCodecs
  decode. Offline WebCodecs export, or real-time canvas recording with the
  original audio remuxed on WebKit.
- **Dewarp** · https://majdyz.github.io/video/dewarp/ — fisheye to
  rectilinear for action cameras. Calibrated OpenCV-fisheye (Kannala-Brandt
  k1..k4, principal point, fx/fy) lens profiles from the Gyroflow database
  (Osmo Action Wide / Ultra Wide, GoPro HERO9-13 Wide 16:9 / 4:3 / 8:7, Max
  Lens Mod), scaled to the clip size. The camera is detected from the file
  (GoPro FIRM/GPMF, DJI ©too and djmd metadata track) and the profile
  preselected; HERO12/13 clips use the lens polynomial GoPro writes into
  each clip, HyperSmooth crops are applied. Auto-fit zoom (no black corners),
  a Natural-shapes (stereographic) option, strength, advanced focal trim and
  k1 tweak. One WebGPU (or WebGL2) pass with adaptive Catmull-Rom / footprint
  resampling, WebCodecs export, AAC copied or other audio re-encoded.
- Landing page · https://majdyz.github.io/video/

All three run entirely in the browser, install as standalone PWAs, and process
video at native resolution (4K supported, capped at 30 Mbps to stay under
Safari's MediaRecorder ceiling).

## Algorithms — papers & references

### Aqua Fix

- Akkaynak & Treibitz (2019) —
  [Sea-thru: A Method for Removing Water from Underwater Images](https://openaccess.thecvf.com/content_CVPR_2019/html/Akkaynak_Sea-Thru_A_Method_for_Removing_Water_From_Underwater_Images_CVPR_2019_paper.html)
  (CVPR). The revised image-formation model (additive, range-dependent
  backscatter + colour-dependent attenuation) and the dark-pixel backscatter
  fit per range bin that the engine implements, using a depth-free range proxy.
- Song, Wang, Zhang & Li (2018) — ULAP, a rapid underwater light-attenuation
  prior (PCM): the linear depth prior used as the per-pixel range proxy.
- Finlayson & Trezzi (2004) —
  [Shades of Gray and Colour Constancy](https://ivrl.epfl.ch/wp-content/uploads/2018/08/Finlayson_2004.pdf)
  (CIC). Minkowski p-norm white balance (p=6), measured on the de-scattered
  image and spread over range.
- Pizer et al. (1987) — Adaptive Histogram Equalization. CLAHE tile LUTs on
  luminance only, interpolated in the shader.
- Björn Ottosson — [Oklab](https://bottosson.github.io/posts/oklab/) and
  [sRGB gamut clipping](https://bottosson.github.io/posts/gamutclipping/):
  the chroma ceiling and constant-luminance gamut compression that keep sand
  and skin from clipping to magenta.
- Kopf et al. (2007) — Joint Bilateral Upsampling: the low-res range /
  confidence fields are upsampled in the shader guided by the full-res pixel.

Offline evaluation on still photos: `node --experimental-strip-types
scripts/aqua-eval.ts <out dir> <images…>` runs the exact CPU reference of the
shader and writes before/after comparisons.

### Motion Fix

- Grundmann, Kwatra & Essa (2011) —
  [Auto-Directed Video Stabilization with Robust L1 Optimal Camera Paths](https://research.google.com/pubs/archive/37041.pdf)
  (CVPR). The path model: w = (10, 1, 100) on first/second/third
  differences with the 100:1 affine:translation scaling inside residuals,
  proximity bounds and crop-window inclusion constraints. Solved here as a
  banded primal-dual interior-point LP (Kim, Koh, Boyd & Gorinevsky 2009,
  [ℓ1 trend filtering](https://web.stanford.edu/~boyd/papers/l1_trend_filter.html)),
  windowed with pinned frames for long clips.
- Bouguet (2000) — Pyramidal implementation of the Lucas-Kanade feature
  tracker; Shi & Tomasi (1994) — Good Features to Track; Kalal et al. (2010)
  — forward–backward error.
- Umeyama (1991) — closed-form similarity fit; MSAC (Torr & Zisserman 2000)
  with Tukey IRLS for the robust frame-to-frame estimate.
- Adaptive zoom follows the approach used by Gyroflow (per-frame minimal
  zoom, rolling maximum, Gaussian smoothing).

Tests: `node --experimental-strip-types apps/motion-fix/test/*.test.ts`.

### Dewarp

- Kannala & Brandt (2006) — A generic camera model and calibration method
  for conventional, wide-angle, and fish-eye lenses (the OpenCV `fisheye`
  model: θd = θ (1 + k1 θ² + k2 θ⁴ + k3 θ⁶ + k4 θ⁸)).
- Lens calibrations from the [Gyroflow lens-profile
  database](https://github.com/gyroflow/lens_profiles) (CC0-1.0); the Osmo
  Action 4 / 5 Pro use the Action 3's 155° f/2.8 lens, the HERO12/13 the
  HERO11's. The shader maths is unit-tested against an independent OpenCV
  `projectPoints`.
- GoPro's per-clip lens description (GPMF "Large FOV": ZFOV, POLY, ZMPL;
  [gpmf-parser](https://github.com/gopro/gpmf-parser) docs) is converted to
  Kannala-Brandt by a linear least-squares fit; DJI's djmd field numbers come
  from [telemetry-parser](https://github.com/AdrianEddy/telemetry-parser)
  (MIT/Apache-2.0).

Tests: `pnpm --filter dewarp test`.

The "How it works" button in each app's header opens a modal with the same
explanation and links.

## Repo layout

```
.
├── apps/
│   ├── aqua-fix/                 colour corrector — base /video/aqua-fix/
│   └── motion-fix/               stabiliser     — base /video/motion-fix/
├── packages/
│   └── shared/                   reusable UI + recorder + theme
├── scripts/
│   └── assemble-dist.mjs         builds dist/<app>/ + landing index.html
├── pnpm-workspace.yaml
└── package.json                  root orchestrator + gh-pages deploy
```

## Local development

```bash
pnpm install
pnpm dev:aqua    # starts apps/aqua-fix dev server
pnpm dev:motion  # starts apps/motion-fix dev server
```

Build everything and assemble for deploy:

```bash
pnpm build
```

## Deploy

```bash
pnpm deploy   # runs pnpm build then gh-pages -d dist
```

The `gh-pages` branch is served at `https://majdyz.github.io/video/`.

## Install on iPhone

Open the URL in Safari → Share → **Add to Home Screen**. Each app installs
as a separate icon and launches fullscreen.
