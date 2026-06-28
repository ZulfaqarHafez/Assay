// Crops the "A + drop" mark from the new Canva logo via bbox of ink/plum pixels
// in the upper region (above the wordmark) -> public/brand/assay-mark.png.
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "brand");

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const QY = Math.floor(H * 0.60); // mark above, wordmark below ~0.62
let minX = W, minY = H, maxX = 0, maxY = 0, hits = 0;
for (let y = 0; y < QY; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (Math.max(r, g, b) < 110 || (sat > 40 && r > g)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      hits++;
    }
  }
}
console.log("mark bbox:", { minX, minY, maxX, maxY, hits });
const pad = 24;
const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
const width = Math.min(W - left, maxX - minX + pad * 2);
const height = Math.min(H - top, maxY - minY + pad * 2);
const crop = await sharp(SRC).extract({ left, top, width, height }).toBuffer();
const side = Math.max(width, height) + 80;
await sharp({ create: { width: side, height: side, channels: 3, background: { r: 0xf4, g: 0xea, b: 0xd6 } } })
  .composite([{ input: crop, gravity: "center" }])
  .png()
  .toFile(join(outDir, "assay-mark.png"));
console.log("wrote assay-mark.png", side, "x", side, "(crop", width, "x", height + ")");
