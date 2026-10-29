#!/usr/bin/env python3
"""Scores the browser pipeline's masks (run-eval.mjs output) exactly as the prototype did
(~/video-data/sam/scripts/eval_video.py): IoU against the SAM 2.1-L pseudo-GT at frames 6/90/165, and flicker =
flow-compensated change sum|m_t - warp(m_t-1)| / sum max, on the prototype's cached DIS flows at 320 px.
usage: metrics.py <out dir> [clip ...]"""
import json, os, sys
import cv2, numpy as np

SAM = os.path.expanduser("~/video-data/sam/")
GT_IDX = [6, 90, 165]
PROTO = "vidkf_edgetam_s5_rp_bidir"


def warp(m, flow):
    h, w = flow.shape[:2]; H, W = m.shape[:2]
    fl = cv2.resize(flow, (W, H)) * (W / w)
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    return cv2.remap(m.astype(np.float32), gx + fl[..., 0], gy + fl[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def iou(a, b):
    a, b = a > .5, b > .5; u = (a | b).sum()
    return float((a & b).sum() / u) if u else 1.0


def metrics(M, c, gt):
    """M: (T, H, W) float 0..1 at any size."""
    fb = np.load(SAM + f"cache/flowb_{c}.npy").astype(np.float32); W = fb.shape[2]; H = round(M.shape[1] * W / M.shape[2])
    m = np.array([cv2.resize(x, (W, H), interpolation=cv2.INTER_AREA) for x in M])
    tc = []
    for t in range(1, len(m)):
        a, b = m[t], warp(m[t - 1], fb[t]); den = np.maximum(a, b).sum()
        if den > 20: tc.append(np.abs(a - b).sum() / den)
    tc = np.array(tc) if tc else np.zeros(1)
    g0 = gt[f"{c}_{GT_IDX[0]}"]
    full = [cv2.resize(M[i], (g0.shape[1], g0.shape[0]), interpolation=cv2.INTER_LINEAR) for i in GT_IDX]
    return {"iou": [iou(f, gt[f"{c}_{i}"] / 255.) for f, i in zip(full, GT_IDX)], "tc_mean": float(tc.mean()), "tc_p95": float(np.percentile(tc, 95))}


def main():
    out = sys.argv[1]; clips = sys.argv[2:]
    gt = np.load(SAM + "gt.npz")
    proto = json.load(open(SAM + "out/eval_video.json"))
    rows, res = [], {}
    for c in clips:
        meta = json.load(open(os.path.join(out, f"{c}.meta.json")))
        T, mh, mw = meta["T"], meta["mh"], meta["mw"]
        r = {}
        for name in ("alpha", "raw"):
            p = os.path.join(out, f"{c}.{name}.u8")
            if os.path.exists(p):
                r[name] = metrics(np.fromfile(p, np.uint8).reshape(T, mh, mw).astype(np.float32) / 255, c, gt)
        r["proto"] = proto.get(PROTO, {}).get(c)
        r["engine"] = proto.get("engine (current)", {}).get(c)
        r["timing"] = {k: meta[k] for k in ("passMs", "encodeMedMs", "stepMedMs", "renderMsPerFrame", "keyframes", "reprompts")}
        r["info"] = meta["info"]
        res[c] = r
        f = lambda d: f"{np.mean(d['iou']):.2f} / {100 * d['tc_mean']:.1f}%" if d else "  -  "
        rows.append(f"{c:11s} app(feathered) {f(r.get('alpha'))}   app(raw) {f(r.get('raw'))}   prototype {f(r['proto'])}   engine {f(r['engine'])}   "
                    f"kf {meta['keyframes']} reprompts {meta['reprompts']} enc {meta['encodeMedMs']:.0f} ms step {meta['stepMedMs']:.0f} ms")
    mean = lambda k: (np.mean([np.mean(res[c][k]["iou"]) for c in clips if res[c].get(k)]), np.mean([res[c][k]["tc_mean"] for c in clips if res[c].get(k)]))
    print("IoU / flicker per clip")
    print("\n".join(rows))
    for k in ("alpha", "raw", "proto", "engine"):
        if any(res[c].get(k) for c in clips):
            a, b = mean(k); print(f"MEAN {k:7s} IoU {a:.3f} flicker {100 * b:.2f}%")
    json.dump(res, open(os.path.join(out, "summary.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
