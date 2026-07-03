// Regenerates the social/OG card to match the current calm brand: warm bone
// wordmark + a single dusty-plum accent on deep ink, with the flask mark tile.
// No rainbow spectrum (the old card no longer matched the UI).
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, "..", "public", "brand");
const MARK = join(brand, "assay-mark.png");
const BONE = { r: 0xf4, g: 0xea, b: 0xd6 };

const roundedMask = (size, radius) =>
  Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`);

const W = 1200, H = 630;
const og = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#201A26"/><stop offset="1" stop-color="#17131C"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- a single, calm accent rule (dusty plum) instead of the old rainbow -->
  <rect x="0" y="0" width="${W}" height="6" fill="#9c6f8c"/>
  <text x="470" y="250" font-family="'Space Grotesk','Segoe UI',Arial,sans-serif" font-size="128" font-weight="700" letter-spacing="-5" fill="#F4EAD6">Assay</text>
  <rect x="476" y="286" width="220" height="7" rx="3" fill="#a87b98"/>
  <text x="478" y="372" font-family="'Segoe UI',Arial,sans-serif" font-size="40" font-weight="600" fill="#D7CDB7">Bring your agent.md.</text>
  <text x="478" y="428" font-family="'Segoe UI',Arial,sans-serif" font-size="40" font-weight="600" fill="#D7CDB7">Find out where it breaks.</text>
  <text x="478" y="512" font-family="'Segoe UI',Arial,sans-serif" font-size="24" font-weight="600" letter-spacing="2" fill="#8B8493">PRE-DEPLOYMENT LITMUS TEST FOR AI AGENTS</text>
</svg>`;

const markTile = await sharp(MARK)
  .resize(300, 300, { fit: "contain", background: BONE })
  .composite([{ input: roundedMask(300, 66), blend: "dest-in" }])
  .png()
  .toBuffer();

await sharp(Buffer.from(og))
  .composite([{ input: markTile, left: 120, top: 165 }])
  .png()
  .toFile(join(brand, "assay-og.png"));
console.log("wrote calm assay-og.png");
