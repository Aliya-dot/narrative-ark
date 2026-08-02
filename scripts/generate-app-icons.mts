import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { BRAND_ICON_COLORS, BRAND_MARK_PATHS } from "../lib/brand-mark-data.ts";

const root = process.cwd();
const publicIconDirectory = join(root, "public", "icons");
const appDirectory = join(root, "app");
const androidResourceDirectory = join(
  root,
  "src-tauri",
  "gen",
  "android",
  "app",
  "src",
  "main",
  "res",
);
const rasterSizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
const icoSizes = [16, 32, 48, 64, 128, 256];
const androidLauncherSizes = new Map([
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
]);

function iconSvg(options: { maskable?: boolean } = {}) {
  const { background, foreground, accent, border } = BRAND_ICON_COLORS;
  const maskable = options.maskable === true;
  const markScale = maskable ? 5 : 5.8;
  const markWidth = 48 * markScale;
  const markHeight = 52 * markScale;
  const x = (512 - markWidth) / 2;
  const y = (512 - markHeight) / 2;
  const radius = maskable ? 0 : 104;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="叙界">
  <rect width="512" height="512" rx="${radius}" fill="${background}"/>
  ${
    maskable
      ? ""
      : `<rect x="8" y="8" width="496" height="496" rx="${radius - 8}" fill="none" stroke="${border}" stroke-width="8"/>`
  }
  <g transform="translate(${x} ${y}) scale(${markScale})">
    <path d="${BRAND_MARK_PATHS.compass}" fill="${foreground}"/>
    <path d="${BRAND_MARK_PATHS.compassNeedle}" fill="none" stroke="${background}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="24" cy="27" r="2.5" fill="${accent}"/>
    <path d="${BRAND_MARK_PATHS.ornaments}" fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;
}

function createIco(pngs: Array<{ size: number; buffer: Buffer }>) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const directory = Buffer.alloc(16 * pngs.length);
  let offset = header.length + directory.length;
  pngs.forEach(({ size, buffer }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(buffer.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([
    header,
    directory,
    ...pngs.map(({ buffer }) => buffer),
  ]);
}

await mkdir(publicIconDirectory, { recursive: true });
const standardSvg = iconSvg();
const maskableSvg = iconSvg({ maskable: true });
await Promise.all([
  writeFile(join(publicIconDirectory, "narrative-ark.svg"), standardSvg),
  writeFile(
    join(publicIconDirectory, "narrative-ark-maskable.svg"),
    maskableSvg,
  ),
  writeFile(join(appDirectory, "icon.svg"), standardSvg),
]);

const pngs = new Map<number, Buffer>();
for (const size of rasterSizes) {
  const buffer = await sharp(Buffer.from(standardSvg))
    .resize(size, size)
    .png()
    .toBuffer();
  pngs.set(size, buffer);
  await writeFile(
    join(publicIconDirectory, `narrative-ark-${size}.png`),
    buffer,
  );
}

const maskable512 = await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toBuffer();
await writeFile(
  join(publicIconDirectory, "narrative-ark-maskable-512.png"),
  maskable512,
);

const appleIcon = pngs.get(180);
if (!appleIcon) throw new Error("180px icon was not generated");
await writeFile(join(appDirectory, "apple-icon.png"), appleIcon);

const ico = createIco(
  icoSizes.map((size) => {
    const buffer = pngs.get(size);
    if (!buffer) throw new Error(`${size}px icon was not generated`);
    return { size, buffer };
  }),
);
await Promise.all([
  writeFile(join(appDirectory, "favicon.ico"), ico),
  writeFile(join(root, "public", "favicon.ico"), ico),
]);

for (const [density, size] of androidLauncherSizes) {
  const directory = join(androidResourceDirectory, density);
  await mkdir(directory, { recursive: true });
  const launcher = await sharp(Buffer.from(standardSvg))
    .resize(size, size)
    .png()
    .toBuffer();
  await Promise.all([
    writeFile(join(directory, "ic_launcher.png"), launcher),
    writeFile(join(directory, "ic_launcher_round.png"), launcher),
  ]);
}

console.log(
  `Generated ${rasterSizes.length} web PNG sizes, Windows/favicon ICO, and ${androidLauncherSizes.size * 2} Android launcher assets.`,
);
