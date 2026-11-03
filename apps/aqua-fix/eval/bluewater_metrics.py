# Water / warm / silver / shadow metrics of each style against a human-graded reference, plus a board.
#   python -I apps/aqua-fix/eval/bluewater_metrics.py <graded dir (bluewater.ts out)> <ref dir> <name...> [--board out.jpg]
# <ref dir>/<name>-after.png is the reference (any size; resized to the grades). Masks come from the SOURCE
# (<graded dir>/<name>-before-src.png): water = cool, smooth source pixels; warm = warm-hued source pixels with chroma;
# silver = pixels the reference shows bright and near-neutral. Prints JSON lines.
import sys, json, numpy as np, cv2
def lin(x):
    x = x / 255.0
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
def oklab(rgb):
    l = lin(rgb.astype(np.float64)); r, g, b = l[..., 0], l[..., 1], l[..., 2]
    L_ = np.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b)
    M_ = np.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b)
    S_ = np.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b)
    return np.stack([0.2104542553*L_ + 0.7936177850*M_ - 0.0040720468*S_,
                     1.9779984951*L_ - 2.4285922050*M_ + 0.4505937099*S_,
                     0.0259040371*L_ + 0.7827717662*M_ - 0.8086757660*S_], -1)
hue = lambda lab: (np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) + 360) % 360
chroma = lambda lab: np.hypot(lab[..., 1], lab[..., 2])
def rd(p): return cv2.imread(p, cv2.IMREAD_COLOR)[..., ::-1].copy()
def stats(lab, m):
    if m.sum() < 30: return None
    a, b = lab[..., 1][m].mean(), lab[..., 2][m].mean()
    return dict(L=round(float(np.median(lab[..., 0][m])), 3), C=round(float(np.median(chroma(lab)[m])), 3),
                h=round(float((np.degrees(np.arctan2(b, a)) + 360) % 360), 1), a=float(a), b=float(b))
args = sys.argv[1:]
board = None
if "--board" in args: i = args.index("--board"); board = args[i + 1]; del args[i:i + 2]
gdir, rdir, *names = args
STY = ["natural", "vivid", "blue"]
rows = []
for n in names:
    src = rd(f"{gdir}/{n}-before-src.png"); H, W = src.shape[:2]
    ref = cv2.resize(rd(f"{rdir}/{n}-after.png"), (W, H), interpolation=cv2.INTER_AREA)
    ls, lr = oklab(src), oklab(ref)
    L = ls[..., 0].astype(np.float32); Lb = cv2.GaussianBlur(L, (0, 0), 3); sd = np.sqrt(cv2.GaussianBlur((L - Lb) ** 2, (0, 0), 3))
    hs, cs = hue(ls), chroma(ls)
    water = (hs > 140) & (hs < 290) & (cs > 0.02) & (sd < 0.02) & (L > 0.12) & (L < 0.85)
    warm = (hs > 20) & (hs < 110) & (cs > 0.035)
    silver = (lr[..., 0] > 0.6) & (chroma(lr) < 0.04)
    out = dict(name=n, ref=dict(water=stats(lr, water), warm=stats(lr, warm), silverC=round(float(np.median(chroma(lr)[silver])), 4) if silver.sum() > 30 else None, Lp5=round(float(np.percentile(lr[..., 0], 5)), 3)))
    imgs = [src]
    for s in ["src"] + STY:
        g = src if s == "src" else rd(f"{gdir}/{n}-before-{s}.png")
        if s != "src": imgs.append(g)
        lg = oklab(g)
        w = stats(lg, water); wr = out["ref"]["water"]
        d = dict(water=w, warm=stats(lg, warm), silverC=round(float(np.median(chroma(lg)[silver])), 4) if silver.sum() > 30 else None, Lp5=round(float(np.percentile(lg[..., 0], 5)), 3))
        if w and wr:
            dh = (w["h"] - wr["h"] + 180) % 360 - 180
            d["water_dh"] = round(dh, 1); d["water_dC"] = round(w["C"] - wr["C"], 3); d["water_dL"] = round(w["L"] - wr["L"], 3)
            d["water_dab"] = round(float(np.hypot(w["a"] - wr["a"], w["b"] - wr["b"])), 4)
        out[s] = d
    for k in ["water", "warm"]:
        for s in ["ref", "src"] + STY:
            if out[s][k]: out[s][k] = {kk: vv for kk, vv in out[s][k].items() if kk not in "ab"}
    print(json.dumps(out))
    imgs.append(ref)
    rows.append(np.hstack([np.pad(im, ((0, 0), (0, 6), (0, 0))) for im in imgs]))
if board:
    sc = 360 / rows[0].shape[0]
    rows = [cv2.resize(r, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA) for r in rows]
    bd = np.vstack([np.pad(r, ((0, 6), (0, 0), (0, 0))) for r in rows])
    lab = np.zeros((40, bd.shape[1], 3), np.uint8); cw = bd.shape[1] / 5
    for i, t in enumerate(["Source", "Natural", "Vivid", "Blue water (new)", "Human grade"]):
        cv2.putText(lab, t, (int(i * cw + 10), 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imwrite(board, np.vstack([lab, bd])[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 88])
