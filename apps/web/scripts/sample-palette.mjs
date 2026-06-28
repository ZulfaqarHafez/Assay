import sharp from "sharp";
const SRC = process.argv[2];
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width, C = info.channels;
const px = (x, y) => {
  const i = (y * W + x) * C;
  return `#${[0, 1, 2].map((k) => data[i + k].toString(16).padStart(2, "0")).join("")}`;
};
const y = 235;
const xs = [482, 500, 518, 536, 554, 572, 590, 608, 626];
console.log("histogram bands @y235:", xs.map((x) => `${x}:${px(x, y)}`).join("  "));
const y2 = 245;
const xs2 = [178, 196, 214, 232, 250, 268, 286];
console.log("flask bands @y245:", xs2.map((x) => `${x}:${px(x, y2)}`).join("  "));
console.log("bg:", px(40, 40), " ink:", px(360, 430));
