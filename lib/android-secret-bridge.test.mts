import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const rust = await readFile(new URL("src-tauri/src/lib.rs", root), "utf8");
const capabilities = await readFile(
  new URL("lib/platform/capabilities.ts", root),
  "utf8",
);
const repository = await readFile(
  new URL("lib/ai-config-repository.ts", root),
  "utf8",
);
const settings = await readFile(
  new URL("app/settings/page.tsx", root),
  "utf8",
);

for (const command of [
  "secure_secret_get",
  "secure_secret_set",
  "secure_secret_remove",
  "secure_secret_has",
]) {
  assert.match(rust, new RegExp(`async fn ${command}`));
  assert.match(capabilities, new RegExp(`"${command}"`));
}
assert.match(rust, /spawn_blocking/);
assert.match(repository, /sessionConfigs/);
assert.match(settings, /CONFIG_STORAGE_TIMEOUT_MS = 30_000/);

console.log("Android native secret bridge regression tests passed");
