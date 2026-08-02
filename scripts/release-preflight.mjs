import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const tauriConfig = JSON.parse(
  await readFile("src-tauri/tauri.conf.json", "utf8"),
);
const cargoToml = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoToml.match(
  /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
)?.[1];

const versions = new Set([
  packageJson.version,
  tauriConfig.version,
  cargoVersion,
]);
if (versions.size !== 1 || versions.has(undefined)) {
  throw new Error(
    `Version mismatch: package=${packageJson.version}, tauri=${tauriConfig.version}, cargo=${cargoVersion}`,
  );
}
if (!tauriConfig.bundle?.createUpdaterArtifacts) {
  throw new Error("bundle.createUpdaterArtifacts must be enabled");
}
if (!Array.isArray(tauriConfig.bundle?.targets)) {
  throw new Error("Windows bundle targets are missing");
}
for (const target of ["nsis", "msi"]) {
  if (!tauriConfig.bundle.targets.includes(target)) {
    throw new Error(`Windows bundle target ${target} is missing`);
  }
}
if (!tauriConfig.plugins?.updater?.pubkey) {
  throw new Error("Updater public key is missing");
}
if (!cargoToml.includes('tauri-plugin-updater = "2.10.0"')) {
  throw new Error("tauri-plugin-updater 2.10.0 is required");
}

console.log(`Windows release preflight passed for ${packageJson.version}.`);
