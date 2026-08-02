import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settings = await readFile(
  new URL("../app/settings/page.tsx", import.meta.url),
  "utf8",
);

assert.match(
  settings,
  /setForm\(verified\);[\s\S]*toast\.success\("连接成功"\);[\s\S]*void persistConfig\(verified\);/,
);
assert.match(
  settings,
  /setConnection\(result\);\s*setTesting\(false\);/,
);
assert.match(settings, /finally \{\s*setTesting\(false\);\s*\}/);
assert.match(settings, /const connectionInFlight = testing && !connection;/);
assert.match(settings, /\{saving \? "正在保存…" : "保存配置"\}/);
assert.match(
  settings,
  /withTimeout\([\s\S]*saveAIConfig\(config\)[\s\S]*CONFIG_STORAGE_TIMEOUT_MS/,
);

console.log("Settings connection-state regression tests passed");
