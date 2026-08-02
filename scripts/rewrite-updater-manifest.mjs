import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing --${name}`);
  }
  return process.argv[index + 1];
}

const input = resolve(option("input"));
const output = resolve(option("output"));
const baseUrl = new URL(option("base-url")).toString().replace(/\/+$/, "");
const manifest = JSON.parse(await readFile(input, "utf8"));

if (!manifest.platforms || typeof manifest.platforms !== "object") {
  throw new Error("Updater manifest has no platforms object");
}

for (const [platform, release] of Object.entries(manifest.platforms)) {
  if (
    !release ||
    typeof release !== "object" ||
    typeof release.url !== "string"
  ) {
    throw new Error(`Updater platform ${platform} has no URL`);
  }
  const fileName = basename(new URL(release.url).pathname);
  release.url = `${baseUrl}/${encodeURIComponent(fileName)}`;
}

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Mirror updater manifest: ${output}`);
