// Rasterises public/icon.svg into the PWA / iOS icon sizes.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, "../public");
const svg = readFileSync(resolve(pub, "icon.svg"));
const BG = { r: 10, g: 10, b: 11, alpha: 1 };

const targets = [
  { name: "icon-192.png", size: 192, pad: 0 },
  { name: "icon-512.png", size: 512, pad: 0 },
  // Maskable: the OS crops to its own shape; keep the mark inside the 80 % safe zone.
  { name: "icon-maskable-512.png", size: 512, pad: 56 },
  { name: "apple-touch-icon.png", size: 180, pad: 0 },
];

for (const t of targets) {
  const inner = t.size - t.pad * 2;
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: t.size, height: t.size, channels: 4, background: BG } })
    .composite([{ input: art, top: t.pad, left: t.pad }])
    .flatten({ background: BG })
    .png()
    .toFile(resolve(pub, t.name));
  console.log("wrote", t.name);
}
