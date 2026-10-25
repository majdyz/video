// Builds the tiny colour-calibration clips in public/calib/ (needs ffmpeg with
// libx265 and libvpx-vp9). Each clip is 128×64, 10-bit, two frames, tagged
// like a real HDR / wide-gamut camera file, with patches of exact signal
// values (see PATCHES, mirrored in src/pipeline/signal-probe.ts). The Studio
// plays one through the same <video> / WebCodecs path as the user's clip to
// learn whether this browser hands the raw signal to WebGL or converts it.
//   node apps/studio/scripts/calibration-clips.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const W = 128, H = 64, FRAMES = 2;
/** Signal R'G'B' per 16 px column (top half); bottom half repeats them. */
export const PATCHES = [[0.25, 0.25, 0.25], [0.5, 0.5, 0.5], [0.75, 0.75, 0.75], [0.9, 0.9, 0.9], [0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.1, 0.1, 0.1]];
const KINDS = {
  hlg: { prim: "bt2020", trc: "arib-std-b67", mat: "bt2020nc", k: [0.2627, 0.0593] },
  pq: { prim: "bt2020", trc: "smpte2084", mat: "bt2020nc", k: [0.2627, 0.0593] },
  wide: { prim: "bt2020", trc: "bt709", mat: "bt2020nc", k: [0.2627, 0.0593] },
};
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "../public/calib");
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calib-"));

function yuv([kr, kb]) {
  const Y = new Uint16Array(W * H), U = new Uint16Array((W / 2) * (H / 2)), V = new Uint16Array((W / 2) * (H / 2));
  for (let x = 0; x < W; x++) {
    const [r, g, b] = PATCHES[Math.floor(x / 16)];
    const y = kr * r + (1 - kr - kb) * g + kb * b;
    const cb = (b - y) / (2 * (1 - kb)), cr = (r - y) / (2 * (1 - kr));
    for (let yy = 0; yy < H; yy++) Y[yy * W + x] = Math.round(64 + 876 * y);
    if (x % 2 === 0) for (let yy = 0; yy < H / 2; yy++) {
      U[yy * (W / 2) + x / 2] = Math.round(512 + 896 * cb);
      V[yy * (W / 2) + x / 2] = Math.round(512 + 896 * cr);
    }
  }
  const frame = Buffer.concat([Buffer.from(Y.buffer), Buffer.from(U.buffer), Buffer.from(V.buffer)]);
  return Buffer.concat(Array.from({ length: FRAMES }, () => frame));
}

for (const [name, k] of Object.entries(KINDS)) {
  const raw = path.join(tmp, `${name}.yuv`);
  fs.writeFileSync(raw, yuv(k.k));
  const inArgs = ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "yuv420p10le", "-s", `${W}x${H}`, "-r", "30", "-i", raw];
  const tags = ["-color_primaries", k.prim, "-color_trc", k.trc, "-colorspace", k.mat, "-color_range", "tv"];
  execFileSync("ffmpeg", [...inArgs, "-c:v", "libx265", "-preset", "medium", "-x265-params", `crf=2:log-level=error:colorprim=${k.prim}:transfer=${k.trc}:colormatrix=${k.mat}:range=limited`, "-pix_fmt", "yuv420p10le", ...tags, "-tag:v", "hvc1", "-movflags", "+faststart", path.join(out, `${name}-hevc.mp4`)]);
  execFileSync("ffmpeg", [...inArgs, "-c:v", "libvpx-vp9", "-profile:v", "2", "-pix_fmt", "yuv420p10le", "-crf", "2", "-b:v", "0", ...tags, path.join(out, `${name}-vp9.webm`)]);
}
fs.rmSync(tmp, { recursive: true, force: true });
for (const f of fs.readdirSync(out)) console.log(f, fs.statSync(path.join(out, f)).size);
