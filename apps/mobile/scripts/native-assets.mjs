// Rasterises the Studio mark (apps/studio/public/icon.svg) into the native
// icon and splash sets, overwriting Capacitor's placeholders in place (same
// files, same sizes):
//   iOS     AppIcon 1024 (opaque, the OS rounds it), Splash 2732² ×3
//   Android legacy + round launcher icons, adaptive foreground (mark inside
//           the 66 dp safe zone) on a solid background colour, splash sets.
// Run after changing the icon: pnpm --filter mobile assets
import { readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = resolve(here, "..");
const app = JSON.parse(readFileSync(join(mobile, "app.config.json"), "utf8"));
const svg = readFileSync(resolve(mobile, "../studio/public/icon.svg"), "utf8");
const BG = app.backgroundColor;
// The mark without its rounded tile: the OS applies its own mask.
const markSvg = Buffer.from(svg.replace(/<rect[^>]*\/>/, ""));

const mark = (size) => sharp(markSvg, { density: Math.max(72, Math.ceil((size / 512) * 72 * 2)) }).resize(size, size).png().toBuffer();

async function flat(size, file, { circle = false } = {}) {
  let img = sharp({ create: { width: size, height: size, channels: 4, background: BG } }).composite([{ input: await mark(size) }]);
  if (circle) {
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
    await img.png().toFile(file);
    return;
  }
  await img.flatten({ background: BG }).removeAlpha().png().toFile(file);
}

async function splash(w, h, file) {
  const s = Math.round(Math.min(w, h) * 0.28);
  await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
    .composite([{ input: await mark(s), left: Math.round((w - s) / 2), top: Math.round((h - s) / 2) }])
    .removeAlpha()
    .png()
    .toFile(file);
}

const size = async (file) => {
  const m = await sharp(readFileSync(file)).metadata();
  return [m.width, m.height];
};

// ---------------------------------------------------------------- iOS
const xc = join(mobile, "ios/App/App/Assets.xcassets");
await flat(1024, join(xc, "AppIcon.appiconset/AppIcon-512@2x.png"));
for (const f of readdirSync(join(xc, "Splash.imageset")).filter((f) => f.endsWith(".png"))) {
  await splash(2732, 2732, join(xc, "Splash.imageset", f));
}

// ---------------------------------------------------------------- Android
const res = join(mobile, "android/app/src/main/res");
for (const dir of readdirSync(res).filter((d) => d.startsWith("mipmap-") && !d.includes("anydpi"))) {
  for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
    const file = join(res, dir, name);
    if (!existsSync(file)) continue;
    const [w] = await size(file);
    if (name === "ic_launcher_foreground.png") {
      // 108 dp canvas, transparent; the mark (58 % of the tile) sits inside the 66 dp safe circle.
      await sharp(await mark(w)).png().toFile(file + ".tmp");
      writeFileSync(file, readFileSync(file + ".tmp"));
      rmSync(file + ".tmp");
    } else {
      await flat(w, file, { circle: name === "ic_launcher_round.png" });
    }
  }
}
for (const dir of readdirSync(res).filter((d) => d.startsWith("drawable"))) {
  const file = join(res, dir, "splash.png");
  if (!existsSync(file)) continue;
  const [w, h] = await size(file);
  await splash(w, h, file);
}
writeFileSync(
  join(res, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG.toUpperCase()}</color>\n</resources>\n`,
);
// Capacitor's sample vector foreground is unused (the adaptive icon points at the mipmap).
rmSync(join(res, "drawable-v24/ic_launcher_foreground.xml"), { force: true });
console.log("native icons and splash screens written");
