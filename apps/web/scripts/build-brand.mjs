// Builds the production brand assets from the Canva-generated flask mark:
//   - assay-icon.png       rounded app icon / favicon (bone tile)
//   - assay-icon-dark.png  same mark on an ink tile (for dark surfaces)
//   - assay-og.png         1200x630 social card with mark + wordmark + spectrum
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, "..", "public", "brand");
const app = join(here, "..", "src", "app");
const MARK = join(brand, "assay-mark.png");

const BONE = { r: 0xf4, g: 0xea, b: 0xd6 };
const INK = { r: 0x1c, g: 0x21, b: 0x2e };
const spectrum = ["#F2752B", "#F65334", "#DC2E4B", "#A04575", "#753A7D", "#4D62A5"];

// rounded-rect mask helper
const roundedMask = (size, radius) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`
  );

async function icon(bg, file, padScale = 0.9) {
  const size = 512, radius = 112;
  const inner = Math.round(size * padScale);
  const markBuf = await sharp(MARK).resize(inner, inner, { fit: "contain", background: bg }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { ...bg, alpha: 1 } } })
    .composite([
      { input: markBuf, gravity: "center" },
      { input: roundedMask(size, radius), blend: "dest-in" }
    ])
    .png()
    .toFile(join(brand, file));
}

await icon(BONE, "assay-icon.png");
await icon(INK, "assay-icon-dark.png");
// Next.js app icon (served as favicon)
await sharp(join(brand, "assay-icon.png")).resize(256, 256).toFile(join(app, "icon.png"));
console.log("icons done");

// ---- OG card ----
const W = 1200, Hh = 630;
const stops = spectrum.map((c, i) => `<stop offset="${i / (spectrum.length - 1)}" stop-color="${c}"/>`).join("");
const og = `<svg width="${W}" height="${Hh}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="spec" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1F2433"/><stop offset="1" stop-color="#161A24"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${Hh}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="url(#spec)"/>
  <text x="470" y="250" font-family="'Space Grotesk','Segoe UI',Arial,sans-serif" font-size="128" font-weight="700" letter-spacing="-5" fill="#F4EAD6">Assay</text>
  <rect x="476" y="286" width="360" height="9" rx="4" fill="url(#spec)"/>
  <text x="478" y="372" font-family="'Segoe UI',Arial,sans-serif" font-size="40" font-weight="600" fill="#D7CDB7">Bring your agent.md.</text>
  <text x="478" y="428" font-family="'Segoe UI',Arial,sans-serif" font-size="40" font-weight="600" fill="#D7CDB7">Find out where it breaks.</text>
  <text x="478" y="512" font-family="'Segoe UI',Arial,sans-serif" font-size="24" font-weight="600" letter-spacing="2" fill="#8A8FA0">PRE-DEPLOYMENT LITMUS TEST FOR AI AGENTS</text>
</svg>`;

const markTile = await sharp(MARK).resize(300, 300, { fit: "contain", background: BONE })
  .composite([{ input: roundedMask(300, 66), blend: "dest-in" }]).png().toBuffer();

await sharp(Buffer.from(og))
  .composite([{ input: markTile, left: 120, top: 165 }])
  .png()
  .toFile(join(brand, "assay-og.png"));
console.log("og done");
