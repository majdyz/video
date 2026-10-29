#!/usr/bin/env python3
"""Boards for the AI subject detection eval (run-eval.mjs ROBUST=1 output):
  board.jpg       per clip: source | engine's Subject pop | AI subject detection, at the pseudo-GT frames
  robust.jpg      per clip at frame 75: clean ML render, corrupted renders (shift 10 px, 2 keyframes dropped,
                  20% leak, and a hard unfeathered mask shifted 10 px for contrast) and their dE maps (x25)
  before-after.jpg (with a third argument, an earlier eval dir) close-up / blue-on-blue clips: engine, AI before, AI after
  board-tone.jpg  (board.py tone <new eval> <old eval> <live strip.jpg> <out>) source / live / new tone (engine, AI) / pop off
usage: board.py <eval out dir> <board out dir> [earlier eval dir]"""
import json, os, sys
import cv2, numpy as np

CLIPS = ["shark", "sharkclose", "manta", "dolphins", "whitetip", "reefdiver"]


def label(img, text):
    img = img.copy()
    cv2.rectangle(img, (0, 0), (img.shape[1], 22), (0, 0, 0), -1)
    cv2.putText(img, text, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def fit(img, w=320):
    return cv2.resize(img, (w, round(img.shape[0] * w / img.shape[1])), interpolation=cv2.INTER_AREA)


def tone_board(new, old, strip, out):
    """board-tone.jpg: source | current live (old tone) | new tone, engine mask | new tone, AI mask | pop off.
    `old`: an earlier eval (its engine render is the live tone); `strip`: a live export strip (thresher, 5 frames)."""
    fr, ofr = os.path.join(new, "frames"), os.path.join(old, "frames")
    live = cv2.imread(strip) if strip and os.path.exists(strip) else None
    rows = []
    plan = [("thresher", [15, 60, 90, 120, 165]), ("sharkclose", [6, 90, 165]), ("manta", [6, 90, 165]), ("dolphins", [6, 90, 165])]
    for c, frames in plan:
        rb = json.load(open(os.path.join(new, f"{c}.robust.json"))) if os.path.exists(os.path.join(new, f"{c}.robust.json")) else {}
        g = rb.get("guard-ml", {})
        gtag = f" L{g.get('lStdRatio', 0):.2f} HP{g.get('hpRatio', 0):.2f} C{g.get('cStdRatio', 0):.2f}" if g else ""
        for j, f in enumerate(frames):
            srcim = cv2.imread(os.path.join(fr, f"{c}_src_{f}.png"))
            if srcim is None:
                continue
            if c == "thresher" and live is not None:
                h = live.shape[0] // 5
                lv = cv2.resize(live[j * h:(j + 1) * h], (srcim.shape[1], srcim.shape[0]))
            else:
                lv = cv2.imread(os.path.join(ofr, f"{c}_engine_{f}.png"))
            ims = [srcim, lv, cv2.imread(os.path.join(fr, f"{c}_engine_{f}.png")), cv2.imread(os.path.join(fr, f"{c}_ml_{f}.png")), cv2.imread(os.path.join(fr, f"{c}_nopop_{f}.png"))]
            labels = [f"{c} {f / 30:.1f}s source", "current live (old tone)", "new tone, engine mask", "new, AI" + gtag, "pop off (same grade)"]
            ims = [i if i is not None else np.zeros_like(srcim) for i in ims]
            rows.append(np.hstack([label(fit(i, 256), t) for i, t in zip(ims, labels)]))
    if rows:
        cv2.imwrite(os.path.join(out, "board-tone.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
        print("tone board ->", out)


def main():
    if sys.argv[1] == "tone":  # board.py tone <new eval dir> <old eval dir> <live strip.jpg> <out dir>
        os.makedirs(sys.argv[5], exist_ok=True)
        return tone_board(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    fr = os.path.join(src, "frames")
    summ = json.load(open(os.path.join(src, "summary.json"))) if os.path.exists(os.path.join(src, "summary.json")) else {}
    rows = []
    for c in CLIPS:
        for f in (6, 90, 165):
            ims = [cv2.imread(os.path.join(fr, f"{c}_{n}_{f}.png")) for n in ("src", "engine", "ml")]
            if any(i is None for i in ims):
                continue
            iou = summ.get(c, {}).get("raw", {}).get("iou")
            tag = f" IoU {np.mean(iou):.2f}" if iou else ""
            rows.append(np.hstack([label(fit(ims[0]), f"{c} f{f} source"), label(fit(ims[1]), "engine Subject pop"), label(fit(ims[2]), "AI subject detection" + tag)]))
    if rows:
        w = max(r.shape[1] for r in rows)
        cv2.imwrite(os.path.join(out, "board.jpg"), np.vstack([np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0))) for r in rows]), [cv2.IMWRITE_JPEG_QUALITY, 88])
    rows = []
    for c in CLIPS:
        rb = json.load(open(os.path.join(src, f"{c}.robust.json"))) if os.path.exists(os.path.join(src, f"{c}.robust.json")) else {}
        names = ["ml", "shift10", "drop2", "leak20", "hard-shift10"]
        ims = [cv2.imread(os.path.join(fr, f"{c}_{n}_75.png")) for n in names]
        des = [cv2.imread(os.path.join(fr, f"{c}_de-{n}_75.png")) for n in names[1:]]
        if any(i is None for i in ims + des):
            continue
        top = [label(fit(ims[0], 256), f"{c} clean ML")] + [label(fit(i, 256), f"{n} p99 dE {rb.get(n, {}).get('p99DE', 0):.1f}") for i, n in zip(ims[1:], names[1:])]
        bot = [label(fit(ims[0], 256) * 0, "dE x25 vs clean:")] + [label(fit(d, 256), f"step p99.9 {rb.get(n, {}).get('stepP999', 0):.1f} dE/px") for d, n in zip(des, names[1:])]
        rows.append(np.vstack([np.hstack(top), np.hstack(bot)]))
    if rows:
        w = max(r.shape[1] for r in rows)
        cv2.imwrite(os.path.join(out, "robust.jpg"), np.vstack([np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0))) for r in rows]), [cv2.IMWRITE_JPEG_QUALITY, 88])
    # Optional: an earlier eval's frames (argv[3]) for a before / after of the tone rules on chosen clips.
    if len(sys.argv) > 3:
        v1 = os.path.join(sys.argv[3], "frames")
        rows = []
        for c in ("sharkclose", "dolphins", "whitetip"):
            for f in (6, 90, 165):
                names = [(fr, "src", f"{c} f{f} source"), (fr, "engine", "engine Subject pop"), (v1, "ml", "AI before (capped, open water only)"), (fr, "ml", "AI after (sure: full tone, close-ups)")]
                ims = [cv2.imread(os.path.join(d, f"{c}_{n}_{f}.png")) for d, n, _ in names]
                if any(i is None for i in ims):
                    continue
                rows.append(np.hstack([label(fit(i, 288), t) for i, (_, _, t) in zip(ims, names)]))
        if rows:
            cv2.imwrite(os.path.join(out, "before-after.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print("boards ->", out)


if __name__ == "__main__":
    main()
