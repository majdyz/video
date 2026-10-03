# video — Aqua Fix + Motion Fix

Two on-device PWAs for diver-shot footage, in one monorepo.

- **Aqua Fix** · https://majdyz.github.io/video/aqua-fix/ — underwater colour
  correction. One adaptive engine, no modes: a linear-light Sea-thru-style
  pipeline (per-pixel range proxy → backscatter removal → range-adaptive
  compensation → white balance on the de-scattered image → local contrast →
  Oklab chroma control) estimated per frame from a 256×144 thumbnail in a
  worker, smoothed over time, and applied at native resolution in one WebGPU
  (or WebGL2) pass. Video export decodes/encodes offline with WebCodecs and
  copies the original audio through.
- **Motion Fix** · https://majdyz.github.io/video/motion-fix/ — similarity
  stabilisation (translation + rotation + uniform scale). Multi-point grid
  tracking on 128×72 luma thumbnails, Umeyama similarity fit, then
  L1-optimal path smoothing via ADMM (the Grundmann-Kwatra-Essa formulation,
  pentadiagonal banded Cholesky, in-bundle, no LP solver dependency).
- Landing page · https://majdyz.github.io/video/

Both run entirely in the browser, install as standalone PWAs, and process
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
  (CVPR). The Google/YouTube stabiliser: feature tracking + motion
  estimation + L1-optimal path. Motion Fix uses the same L1 first- and
  second-difference penalty (jitter + acceleration) via an ADMM solver
  shipped in-bundle — no LP-solver dependency. The full paper formulation
  also weights a third derivative (jerk) and adds explicit
  constant/linear/parabolic regime constraints via linear programming;
  that's the natural next upgrade.
- Umeyama (1991) —
  [Least-Squares Estimation of Transformation Parameters Between Two Point Patterns](https://web.stanford.edu/class/cs273/refs/umeyama.pdf)
  (IEEE TPAMI). Closed-form similarity-transform fit used per frame on
  the inlier matches.
- Lucas & Kanade (1981) — feature-tracking literature underlying the
  optical-flow approach. We use patch-based block-matching at low
  resolution instead, to keep the bundle small.

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
