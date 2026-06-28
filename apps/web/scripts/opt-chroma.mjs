// Optimizes the rendered chromatogram for the web: trims to a wide hero band,
// downscales, and writes a compressed PNG -> public/brand/hero-chroma.png.
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const f = join(here, "..", "public", "brand", "hero-chroma.png");

const buf = await sharp(f)
  .resize(1280, 720, { fit: "fill" })
  .png({ palette: true, quality: 72, compressionLevel: 9 })
  .toBuffer();
await sharp(buf).toFile(f);
const meta = await sharp(f).metadata();
console.log("optimized hero-chroma.png", meta.width, "x", meta.height, "size", meta.size);
