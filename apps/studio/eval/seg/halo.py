#!/usr/bin/env python3
"""Subject pop halo on exported clips (demo-export.mjs output: pop-on.mp4, pop-off.mp4, mask-<t>.pgm), the metric of
halo.ts: the ML alpha upsampled bilinearly to the frame, subject = alpha > 0.5; dL = CIE L* (on) - L* (off);
halo = mean dL in a ring 2..15 px outside the contour - mean dL in water 30..60 px out (~0 when the pop stays on the
subject), the water glow (water-coloured pixels within 15 px of the contour on either side, where a slightly fat
mask puts water inside it, against the far water), the lift on the subject (mean dL >= 3 px inside) and the ring's
mean dE.
Also writes side-by-side native crops (off | on) around the subject to <outdir>/halo-<t>.png.
usage: halo.py <export dir> [crop.png prefix]"""
import glob, json, os, re, sys
import cv2, numpy as np

R = dict(rLo=2, rHi=15, fLo=30, fHi=60, inside=3)


def frame(path, t):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps)))
    ok, f = cap.read()
    cap.release()
    return f if ok else None


def lab(bgr):
    return cv2.cvtColor(bgr.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)


def halo(on, off, alpha):
    H, W = on.shape[:2]
    a = cv2.resize(alpha.astype(np.float32) / 255, (W, H), interpolation=cv2.INTER_LINEAR)
    inside = (a > 0.5).astype(np.uint8)
    d_out = cv2.distanceTransform(1 - inside, cv2.DIST_L2, 5)
    d_in = cv2.distanceTransform(inside, cv2.DIST_L2, 5)
    lo, lf = lab(on), lab(off)
    dl = lo[..., 0] - lf[..., 0]
    de = np.linalg.norm(lo - lf, axis=2)
    ring = (inside == 0) & (d_out >= R["rLo"]) & (d_out <= R["rHi"])
    far = (inside == 0) & (d_out >= R["fLo"]) & (d_out <= R["fHi"])
    inn = (inside == 1) & (d_in >= R["inside"])
    if ring.sum() < 50 or far.sum() < 50 or inn.sum() < 50:
        return None, None
    r2 = lambda x: round(float(x), 2)
    # Water glow: water-coloured pixels (off frame within dE 4 of the far ring's mean) within 15 px of the contour,
    # either side (a mask a little fat puts water inside it): their dL against the far water's.
    wref = lf[far].mean(axis=0)
    band = ((inside == 0) & (d_out <= R["rHi"])) | ((inside == 1) & (d_in <= R["rHi"]))
    wl = band & (np.linalg.norm(lf - wref, axis=2) < 4)
    glow = r2(dl[wl].mean() - dl[far].mean()) if wl.sum() >= 50 else None
    out = dict(halo=r2(dl[ring].mean() - dl[far].mean()), waterGlow=glow, ringDL=r2(dl[ring].mean()), farDL=r2(dl[far].mean()), ringDE=r2(de[ring].mean()), liftDL=r2(dl[inn].mean()))
    return out, inside


def main():
    d = sys.argv[1]
    crops = sys.argv[2] if len(sys.argv) > 2 else None
    rows = {}
    for m in sorted(glob.glob(os.path.join(d, "mask-*.pgm")), key=lambda p: float(re.findall(r"mask-([\d.]+)", p)[0])):
        t = float(re.findall(r"mask-([\d.]+)", m)[0])
        on, off = frame(os.path.join(d, "pop-on.mp4"), t), frame(os.path.join(d, "pop-off.mp4"), t)
        if on is None or off is None:
            continue
        h, inside = halo(on, off, cv2.imread(m, cv2.IMREAD_GRAYSCALE))
        if h is None:
            continue
        rows[t] = h
        if crops:
            ys, xs = np.nonzero(inside)
            H, W = on.shape[:2]
            x0, x1 = max(0, xs.min() - 40), min(W, xs.max() + 40)
            y0, y1 = max(0, ys.min() - 40), min(H, ys.max() + 40)
            a, b = off[y0:y1, x0:x1], on[y0:y1, x0:x1]
            sep = np.full((4, a.shape[1], 3), 255, np.uint8) if a.shape[1] > 1.2 * a.shape[0] else np.full((a.shape[0], 4, 3), 255, np.uint8)
            cv2.imwrite(f"{crops}-{t:g}s.png", np.concatenate([a, sep, b], axis=0 if sep.shape[0] == 4 else 1))
    keys = ["halo", "waterGlow", "ringDL", "farDL", "ringDE", "liftDL"]
    mean = {k: round(float(np.mean([r[k] for r in rows.values() if r[k] is not None])), 2) for k in keys} if rows else {}
    print(json.dumps({"dir": d, "mean": mean, "frames": rows}))


main()
