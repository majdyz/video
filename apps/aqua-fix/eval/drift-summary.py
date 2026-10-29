"""Tracked-sand drift of clip-drift.ts runs over a time window.

    python3 apps/aqua-fix/eval/drift-summary.py <run dir> [<run dir> …] [--end 10.8] [--start 0]

Reads <run dir>/drift.csv and prints, per run, the tracked sand's colour-only
ΔE00 against the first frame in the window (max, p95), its worst change over
any 1 s, and the same for the source.
"""
import csv
import math
import sys


def arg(name, default):
    if f"--{name}" in sys.argv:
        return sys.argv[sys.argv.index(f"--{name}") + 1]
    return default


END, START = float(arg("end", "1e9")), float(arg("start", "0"))
runs = [a for i, a in enumerate(sys.argv[1:]) if not a.startswith("--") and not sys.argv[i].startswith("--")]


def de00(l1, l2):
    L1, a1, b1 = l1
    L2, a2, b2 = l2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb**7 / (Cb**7 + 25**7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p, h2p = math.degrees(math.atan2(b1, a1p)) % 360, math.degrees(math.atan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dhp = h2p - h1p
    dhp = dhp - 360 if dhp > 180 else dhp + 360 if dhp < -180 else dhp
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hbp = (h1p + h2p) / 2 if abs(h1p - h2p) <= 180 else (h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2
    T = 1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp)) + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.2 * math.cos(math.radians(4 * hbp - 63))
    dT = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp**7 / (Cbp**7 + 25**7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 - math.sin(math.radians(2 * dT)) * Rc * (dCp / Sc) * (dHp / Sh))


def ab(l0, l):
    return de00(l0, [l0[0], l[1], l[2]])


for run in runs:
    rows = [r for r in csv.DictReader(open(f"{run}/drift.csv")) if START <= float(r["t"]) <= END]
    t = [float(r["t"]) for r in rows]
    for key in ("trk_src_lab", "trk_out_lab"):
        labs = [[float(v) for v in r[key].split()] for r in rows]
        d = [ab(labs[0], x) for x in labs]
        worst = 0.0
        for i in range(len(t)):
            for j in range(i + 1, len(t)):
                if t[j] - t[i] > 1.0:
                    break
                worst = max(worst, ab(labs[i], labs[j]))
        s = sorted(d)
        print(f"{run} {key[4:7]}: max {max(d):.2f}  p95 {s[int(0.95 * (len(s) - 1))]:.2f}  worst within 1 s {worst:.2f}  ({len(d)} frames, {t[0]:.1f}-{t[-1]:.1f} s)")
