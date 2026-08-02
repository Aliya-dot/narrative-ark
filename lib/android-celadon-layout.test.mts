import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("app/globals.css", root), "utf8");
const androidActivity = await readFile(
  new URL(
    "src-tauri/gen/android/app/src/main/java/com/narrativeark/client/MainActivity.kt",
    root,
  ),
  "utf8",
);
const clientEntry = await readFile(new URL("client/main.tsx", root), "utf8");

assert.match(
  css,
  /@media \(max-width: 700px\)[\s\S]*:root\[data-theme="celadon"\] \.home-hero\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
);
assert.match(
  css,
  /:root\[data-theme="celadon"\] \.home-hero-title\s*\{[\s\S]*word-break:\s*keep-all/,
);
assert.match(androidActivity, /WindowInsetsCompat\.Type\.systemBars\(\)/);
assert.match(androidActivity, /WindowInsetsCompat\.Type\.displayCutout\(\)/);
assert.match(androidActivity, /view\.setPadding\(/);
assert.match(clientEntry, /dataset\.nativeInsets\s*=\s*"system-bars"/);

console.log("Android celadon layout regression tests passed");
