"""Per-region temporal colour change of a graded clip vs its source.

    ~/.venvs/video/bin/python -I apps/aqua-fix/eval/region-drift.py <clip> <png dir> [--end 10.8] [--horizon 30]

<png dir> holds graded frames f<NNNN>.png written by clip-drift.ts --png 1
(frame index NNNN of the clip, all at the same size). For each graded frame f
with a graded partner f + horizon, the source frames are aligned with dense
optical flow (Farneback, forward-backward checked); on textured seabed blocks
(12×12 px; smooth open water is left out) the block's mean colour is compared
between the two times, in the source and in the output (ΔE00, and ΔE00 of the
colour only, lightness equalised). The user's rule: the output of a region
must not change more than its source does. Reports per pair the median
over blocks, and overall the mean of the medians, the mean output/source
ratio and the mean excess (output change beyond the source's).
"""
import glob
import os
import re
import subprocess
import sys

import cv2
import numpy as np


def arg(name, default):
    if f"--{name}" in sys.argv:
        return sys.argv[sys.argv.index(f"--{name}") + 1]
    return default


clip, pngdir = sys.argv[1], sys.argv[2]
END = float(arg("end", "1e9"))
HOR = int(arg("horizon", "30"))
B = 12

files = sorted(glob.glob(os.path.join(pngdir, "f*.png")))
graded = {int(re.search(r"f(\d+)\.png$", f).group(1)): f for f in files}
first = cv2.imread(files[0])
H, W = first.shape[:2]
pr = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", clip], capture_output=True, text=True).stdout.strip().split("/")
fps = float(pr[0]) / float(pr[1])
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", clip, "-vf", f"scale={W}:{H}:flags=area:in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24", "-f", "rawvideo", "-"], capture_output=True).stdout
src = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)


def to_lab(rgb8):
    x = rgb8.astype(np.float32) / 255
    x = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]], np.float32)
    xyz = x @ m.T / np.array([0.95047, 1.0, 1.08883], np.float32)
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def de00(l1, l2):
    """Vectorised CIEDE2000 over (..., 3) arrays."""
    L1, a1, b1 = l1[..., 0], l1[..., 1], l1[..., 2]
    L2, a2, b2 = l2[..., 0], l2[..., 1], l2[..., 2]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb**7 / (Cb**7 + 25.0**7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p, h2p = np.degrees(np.arctan2(b1, a1p)) % 360, np.degrees(np.arctan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dhp = h2p - h1p
    dhp = np.where(dhp > 180, dhp - 360, np.where(dhp < -180, dhp + 360, dhp))
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hs = h1p + h2p
    hbp = np.where(np.abs(h1p - h2p) <= 180, hs / 2, np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2))
    T = 1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp)) + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.2 * np.cos(np.radians(4 * hbp - 63))
    dT = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cbp**7 / (Cbp**7 + 25.0**7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 - np.sin(np.radians(2 * dT)) * Rc * (dCp / Sc) * (dHp / Sh))


def block_means(img, mask):
    hb, wb = H // B, W // B
    x = img[: hb * B, : wb * B].reshape(hb, B, wb, B, -1).mean((1, 3))
    m = mask[: hb * B, : wb * B].reshape(hb, B, wb, B).mean((1, 3))
    return x, m


rows = []
for f in sorted(graded):
    g = f + HOR
    if g not in graded or g / fps > END or g >= len(src):
        continue
    s0, s1 = src[f], src[g]
    g0 = cv2.cvtColor(s0, cv2.COLOR_RGB2GRAY)
    g1 = cv2.cvtColor(s1, cv2.COLOR_RGB2GRAY)
    fl = cv2.calcOpticalFlowFarneback(g0, g1, None, 0.5, 4, 25, 3, 5, 1.2, 0)
    bk = cv2.calcOpticalFlowFarneback(g1, g0, None, 0.5, 4, 25, 3, 5, 1.2, 0)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    mx, my = xx + fl[..., 0], yy + fl[..., 1]
    fb = np.hypot(fl[..., 0] + cv2.remap(bk[..., 0], mx, my, cv2.INTER_LINEAR), fl[..., 1] + cv2.remap(bk[..., 1], mx, my, cv2.INTER_LINEAR))
    o0 = cv2.cvtColor(cv2.imread(graded[f]), cv2.COLOR_BGR2RGB)
    o1 = cv2.cvtColor(cv2.imread(graded[g]), cv2.COLOR_BGR2RGB)
    s1w = cv2.remap(s1, mx, my, cv2.INTER_LINEAR)
    o1w = cv2.remap(o1, mx, my, cv2.INTER_LINEAR)
    # Textured seabed only: local luma std over 7×7 at least 4/255.
    gm = cv2.blur(g0.astype(np.float32), (7, 7))
    gs = np.sqrt(np.maximum(0, cv2.blur(g0.astype(np.float32) ** 2, (7, 7)) - gm**2))
    ok = ((mx > 1) & (mx < W - 2) & (my > 1) & (my < H - 2) & (fb < 1.0) & (gs > 4)).astype(np.float32)
    ls0, m = block_means(to_lab(s0), ok)
    ls1, _ = block_means(to_lab(s1w), ok)
    lo0, _ = block_means(to_lab(o0), ok)
    lo1, _ = block_means(to_lab(o1w), ok)
    sel = m > 0.9
    if sel.sum() < 10:
        continue
    ds, do = de00(ls0[sel], ls1[sel]), de00(lo0[sel], lo1[sel])
    eq = lambda a, b: np.concatenate([a[..., :1], b[..., 1:]], -1)
    cs, co = de00(ls0[sel], eq(ls0[sel], ls1[sel])), de00(lo0[sel], eq(lo0[sel], lo1[sel]))
    rows.append((f / fps, np.median(ds), np.median(do), np.median(cs), np.median(co), np.mean(np.maximum(0, co - cs)), int(sel.sum())))

print(f"{os.path.basename(clip)} vs {pngdir}: horizon {HOR / fps:.2f} s, {len(rows)} pairs")
print("    t   src dE  out dE   src col  out col  col excess  blocks")
for r in rows:
    print(f"{r[0]:6.2f}  {r[1]:6.2f}  {r[2]:6.2f}   {r[3]:6.2f}   {r[4]:6.2f}   {r[5]:6.2f}     {r[6]}")
a = np.array([r[1:6] for r in rows])
print(f"mean: src ΔE {a[:, 0].mean():.2f}  out ΔE {a[:, 1].mean():.2f}  | colour only: src {a[:, 2].mean():.2f}  out {a[:, 3].mean():.2f}  ratio {a[:, 3].mean() / max(1e-6, a[:, 2].mean()):.2f}  excess {a[:, 4].mean():.2f}  | worst out colour {a[:, 3].max():.2f}")
