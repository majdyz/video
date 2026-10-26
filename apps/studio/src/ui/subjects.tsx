import { useEffect, useRef } from "react";
import type { SubjectSelection } from "../../../aqua-fix/src/engine/animals.ts";
import { subjectAt } from "../pipeline/subjects";

/** A tap's visual confirmation: the tapped animal's outline thickens and fades back over this long. */
const PULSE_MS = 450;

/**
 * Thin outlines of the Subject pop animals over the preview while selecting
 * subjects: selected animals solid, the others the engine found dashed (tap
 * to add them). Neutral white at low opacity; no fills, glows or colour.
 * Drawn inside the zoomed content, so outlines follow pinch and pan.
 */
export function SubjectOutlines({ getSelection, pulse }: {
  getSelection: () => SubjectSelection | null;
  /** The latest tap (upright uv) and when it happened (performance.now()). */
  pulse: { u: number; v: number; t: number } | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;

  useEffect(() => {
    let raf = 0;
    let lastKey = "";
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const g = c.getContext("2d");
      if (!g) return;
      const sel = getSelection();
      const p = pulseRef.current;
      const age = p ? performance.now() - p.t : Infinity;
      // Redraw only when something changed (the selection eases for a moment after a tap; otherwise it is still).
      const key = sel ? `${w}x${h}|${sel.animals.map((a) => `${a.id}:${a.strength.toFixed(2)}:${a.override ?? ""}`).join(",")}|${idsKey(sel.ids)}` : "";
      if (key === lastKey && age >= PULSE_MS + 50) return;
      lastKey = key;
      g.clearRect(0, 0, w, h);
      if (!sel) return;
      const pulseId = p && age < PULSE_MS ? subjectAt(sel, p.u, p.v) : 0;
      for (const a of sel.animals) {
        const on = a.override === "include" || (a.override !== "exclude" && a.strength > 0.5);
        const k = a.id === pulseId ? 1 - age / PULSE_MS : 0;
        g.lineWidth = (1.25 + 2 * k) * dpr;
        g.strokeStyle = `rgba(255, 255, 255, ${on ? 0.6 + 0.35 * k : 0.35 + 0.5 * k})`;
        g.setLineDash(on ? [] : [3 * dpr, 3 * dpr]);
        g.beginPath();
        contour(sel, a.id, w, h, (x0, y0, x1, y1) => { g.moveTo(x0, y0); g.lineTo(x1, y1); });
        g.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getSelection]);

  return <canvas ref={ref} className="subject-outlines" aria-hidden="true" />;
}

function idsKey(ids: Uint16Array): number {
  let k = 0;
  for (let i = 0; i < ids.length; i += 3) k = (k * 31 + ids[i] * (i + 1)) | 0;
  return k;
}

/**
 * Marching squares on animal `id`'s cells (lightly smoothed so the outline is not a staircase), scaled to w × h.
 */
function contour(sel: SubjectSelection, id: number, w: number, h: number, seg: (x0: number, y0: number, x1: number, y1: number) => void): void {
  const W = sel.width, H = sel.height;
  const f = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      s += sel.ids[yy * W + xx] === id ? (dx || dy ? 1 : 2) : 0;
      n += dx || dy ? 1 : 2;
    }
    f[y * W + x] = s / n;
  }
  const sx = w / W, sy = h / H;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : f[y * W + x]);
  // Cell (x, y) spans the centres of texels x..x+1, y..y+1; edge crossings at iso 0.5.
  const lerp = (a: number, b: number) => (0.5 - a) / (b - a);
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const a = at(x, y), b = at(x + 1, y), c = at(x + 1, y + 1), d = at(x, y + 1);
    const code = (a > 0.5 ? 1 : 0) | (b > 0.5 ? 2 : 0) | (c > 0.5 ? 4 : 0) | (d > 0.5 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const px = (gx: number) => (gx + 0.5) * sx, py = (gy: number) => (gy + 0.5) * sy;
    const top = () => [px(x + lerp(a, b)), py(y)] as const;
    const right = () => [px(x + 1), py(y + lerp(b, c))] as const;
    const bottom = () => [px(x + lerp(d, c)), py(y + 1)] as const;
    const left = () => [px(x), py(y + lerp(a, d))] as const;
    const line = (p: readonly [number, number], q: readonly [number, number]) => seg(p[0], p[1], q[0], q[1]);
    switch (code) {
      case 1: case 14: line(left(), top()); break;
      case 2: case 13: line(top(), right()); break;
      case 3: case 12: line(left(), right()); break;
      case 4: case 11: line(right(), bottom()); break;
      case 6: case 9: line(top(), bottom()); break;
      case 7: case 8: line(left(), bottom()); break;
      case 5: line(left(), top()); line(right(), bottom()); break;
      case 10: line(top(), right()); line(left(), bottom()); break;
    }
  }
}
