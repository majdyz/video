"""Before/after board and side-by-side video from two clip-drift.ts runs.

    ~/.venvs/video/bin/python -I apps/aqua-fix/eval/board.py <clip> <old dir> <new dir> <out dir> [--times 0,2,5,8,9.3] [--fps-step 2]

<old dir> / <new dir> are clip-drift.ts outputs with --png 1 (same --step and
--gw). Writes <out>/board.jpg (rows: source / old / new at the given times,
each tile labelled with the tracked sand's colour-only ΔE00 against the
first frame, from drift.csv) and <out>/ab.mp4 (source | old | new).
"""
import csv
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


clip, old_dir, new_dir, out_dir = sys.argv[1:5]
times = [float(t) for t in arg("times", "0,2,5,8,9.3").split(",")]
os.makedirs(out_dir, exist_ok=True)

pr = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", clip], capture_output=True, text=True).stdout.strip().split("/")
fps = float(pr[0]) / float(pr[1])
frames = sorted(int(re.search(r"f(\d+)\.png$", f).group(1)) for f in glob.glob(os.path.join(new_dir, "f*.png")))
first = cv2.imread(os.path.join(new_dir, f"f{frames[0]:04d}.png"))
H, W = first.shape[:2]
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", clip, "-vf", f"scale={W}:{H}:flags=area:in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgr24", "-f", "rawvideo", "-"], capture_output=True).stdout
src = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)


def lab_of(s):
    return [float(v) for v in s.split()]


def de00_ab(l1, l2):
    """CIEDE2000 with l2's lightness set to l1's (colour only)."""
    L1, a1, b1 = l1
    _, a2, b2 = l2
    L2 = L1
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb**7 / (Cb**7 + 25.0**7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p, h2p = np.degrees(np.arctan2(b1, a1p)) % 360, np.degrees(np.arctan2(b2, a2p)) % 360
    dCp = C2p - C1p
    dhp = h2p - h1p
    dhp = dhp - 360 if dhp > 180 else dhp + 360 if dhp < -180 else dhp
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2))
    Cbp = (C1p + C2p) / 2
    hbp = (h1p + h2p) / 2 if abs(h1p - h2p) <= 180 else (h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2
    T = 1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp)) + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.2 * np.cos(np.radians(4 * hbp - 63))
    dT = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cbp**7 / (Cbp**7 + 25.0**7))
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    return float(np.sqrt((dCp / Sc) ** 2 + (dHp / Sh) ** 2 - np.sin(np.radians(2 * dT)) * Rc * (dCp / Sc) * (dHp / Sh)))


def tracked(d):
    rows = {}
    with open(os.path.join(d, "drift.csv")) as fh:
        for r in csv.DictReader(fh):
            rows[int(r["frame"])] = (lab_of(r["trk_src_lab"]), lab_of(r["trk_out_lab"]))
    return rows


told, tnew = tracked(old_dir), tracked(new_dir)
f0 = frames[0]


def label(img, text, sub=None):
    img = img.copy()
    cv2.rectangle(img, (0, 0), (W, 34 if sub else 18), (0, 0, 0), -1)
    cv2.putText(img, text, (4, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
    if sub:
        cv2.putText(img, sub, (4, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (120, 230, 255), 1, cv2.LINE_AA)
    return img


tiles = []
for t in times:
    f = min(frames, key=lambda x: abs(x - t * fps))
    so = src[f]
    o = cv2.imread(os.path.join(old_dir, f"f{f:04d}.png"))
    n = cv2.imread(os.path.join(new_dir, f"f{f:04d}.png"))
    ds = de00_ab(told[f0][0], told[f][0])
    do = de00_ab(told[f0][1], told[f][1])
    dn = de00_ab(tnew[f0][1], tnew[f][1])
    tiles.append(np.vstack([label(so, f"source {f / fps:.1f}s", f"sand dE {ds:.1f}"), label(o, "old (lock)", f"sand dE {do:.1f}"), label(n, "new (anchor)", f"sand dE {dn:.1f}")]))
board = np.hstack([np.pad(x, ((0, 0), (0, 4), (0, 0))) for x in tiles])
cv2.imwrite(os.path.join(out_dir, "board.jpg"), board, [cv2.IMWRITE_JPEG_QUALITY, 88])

# Side-by-side video at the graded frames' rate.
step = frames[1] - frames[0]
vw = cv2.VideoWriter(os.path.join(out_dir, "ab-raw.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), fps / step, (W * 3 + 8, H))
for f in frames:
    o = cv2.imread(os.path.join(old_dir, f"f{f:04d}.png"))
    n = cv2.imread(os.path.join(new_dir, f"f{f:04d}.png"))
    if o is None or n is None or f >= len(src):
        continue
    row = np.hstack([label(src[f], "source"), np.zeros((H, 4, 3), np.uint8), label(o, "old"), np.zeros((H, 4, 3), np.uint8), label(n, "new")])
    vw.write(row)
vw.release()
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(out_dir, "ab-raw.mp4"), "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", os.path.join(out_dir, "ab.mp4")], check=True)
os.remove(os.path.join(out_dir, "ab-raw.mp4"))
print("wrote", os.path.join(out_dir, "board.jpg"), os.path.join(out_dir, "ab.mp4"))
