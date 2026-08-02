import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngSizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
const androidLauncherSizes = new Map([
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
]);

function assertPngSize(buffer: Buffer, size: number) {
  assert.deepEqual(buffer.subarray(0, 8), pngSignature);
  assert.equal(buffer.readUInt32BE(16), size);
  assert.equal(buffer.readUInt32BE(20), size);
}

for (const size of pngSizes) {
  const icon = await readFile(
    new URL(`public/icons/narrative-ark-${size}.png`, root),
  );
  assertPngSize(icon, size);
}

for (const [density, size] of androidLauncherSizes) {
  const resourceRoot =
    `src-tauri/gen/android/app/src/main/res/${density}`;
  const launcher = await readFile(
    new URL(`${resourceRoot}/ic_launcher.png`, root),
  );
  const roundLauncher = await readFile(
    new URL(`${resourceRoot}/ic_launcher_round.png`, root),
  );
  assertPngSize(launcher, size);
  assert.deepEqual(roundLauncher, launcher);
}

const maskable = await readFile(
  new URL("public/icons/narrative-ark-maskable-512.png", root),
);
assertPngSize(maskable, 512);

const favicon = await readFile(new URL("app/favicon.ico", root));
assert.equal(favicon.readUInt16LE(0), 0);
assert.equal(favicon.readUInt16LE(2), 1);
assert.equal(favicon.readUInt16LE(4), 6);
for (let index = 0; index < 6; index += 1) {
  const entry = 6 + index * 16;
  const byteLength = favicon.readUInt32LE(entry + 8);
  const offset = favicon.readUInt32LE(entry + 12);
  assert.ok(byteLength > 0);
  assert.deepEqual(favicon.subarray(offset, offset + 8), pngSignature);
}

const manifest = JSON.parse(
  await readFile(new URL("public/manifest.webmanifest", root), "utf8"),
);
assert.equal(manifest.name, "叙界 / Narrative Ark");
assert.equal(manifest.short_name, "叙界");
assert.deepEqual(
  manifest.icons.map((icon: { purpose: string }) => icon.purpose),
  ["any", "any", "maskable"],
);

const appIcon = await readFile(new URL("app/icon.svg", root), "utf8");
const publicIcon = await readFile(
  new URL("public/icons/narrative-ark.svg", root),
  "utf8",
);
assert.equal(appIcon, publicIcon);
assert.match(appIcon, /#173f32/);
assert.match(appIcon, /#83a82f/);

const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
assert.match(layout, /applicationName: "叙界 \/ Narrative Ark"/);
assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
assert.match(layout, /narrative-ark-180\.png/);

const shell = await readFile(new URL("components/app-shell.tsx", root), "utf8");
assert.match(shell, /BRAND_MARK_PATHS\.compass/);
assert.match(shell, /BRAND_MARK_PATHS\.ornaments/);

console.log("brand mark asset tests passed");
