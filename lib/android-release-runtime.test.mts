import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const cargo = await readFile(new URL("src-tauri/Cargo.toml", root), "utf8");
const buildScript = await readFile(
  new URL("scripts/build-android-windows.ps1", root),
  "utf8",
);
const verifier = await readFile(
  new URL("scripts/verify-android-release.mjs", root),
  "utf8",
);

assert.match(
  cargo,
  /custom-protocol\s*=\s*\[\s*"tauri\/custom-protocol"\s*\]/,
);
assert.match(
  buildScript,
  /& \$cargo build[\s\S]*--release[\s\S]*--features\s+"custom-protocol"/,
);
assert.match(verifier, /const frontendAssets =/);
assert.match(verifier, /includes\(Buffer\.from\(asset/);

console.log("Android release runtime regression tests passed");
