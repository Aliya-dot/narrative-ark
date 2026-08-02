import assert from "node:assert/strict";
import vm from "node:vm";
import {
  ANDROID_DEFAULT_APP_THEME,
  APP_THEME_BOOTSTRAP_SCRIPT,
  APP_THEME_STORAGE_KEY,
  APP_THEMES,
  DEFAULT_APP_THEME,
  resolveAppTheme,
  resolveDefaultAppTheme,
} from "./app-theme.ts";

assert.deepEqual(
  APP_THEMES.map(({ id, label }) => [id, label]),
  [
    ["dark", "深色"],
    ["light", "浅色"],
    ["mint", "青柠薄荷"],
    ["celadon", "雾海青瓷"],
  ],
);
assert.equal(new Set(APP_THEMES.map(({ id }) => id)).size, APP_THEMES.length);
assert.equal(
  new Set(APP_THEMES.map(({ label }) => label)).size,
  APP_THEMES.length,
);

assert.equal(resolveAppTheme("dark"), "dark");
assert.equal(resolveAppTheme("light"), "light");
assert.equal(resolveAppTheme("mint"), "mint");
assert.equal(resolveAppTheme("celadon"), "celadon");
assert.equal(resolveAppTheme(null), DEFAULT_APP_THEME);
assert.equal(resolveAppTheme("unknown-theme"), DEFAULT_APP_THEME);
assert.equal(ANDROID_DEFAULT_APP_THEME, "celadon");
assert.equal(
  resolveDefaultAppTheme("Mozilla/5.0 (Linux; Android 9)"),
  "celadon",
);
assert.equal(resolveDefaultAppTheme("Mozilla/5.0 (Windows NT 10.0)"), "dark");
assert.equal(
  resolveAppTheme(null, "Mozilla/5.0 (Linux; Android 15)"),
  "celadon",
);
assert.equal(
  resolveAppTheme("unknown-theme", "Mozilla/5.0 (Linux; Android 15)"),
  "celadon",
);
assert.equal(
  resolveAppTheme("mint", "Mozilla/5.0 (Linux; Android 15)"),
  "mint",
);

assert.match(APP_THEME_BOOTSTRAP_SCRIPT, new RegExp(APP_THEME_STORAGE_KEY));
assert.match(
  APP_THEME_BOOTSTRAP_SCRIPT,
  /document\.documentElement\.dataset\.theme/,
);

function runBootstrap(userAgent: string, storedTheme: string | null) {
  const dataset: Record<string, string> = {};
  vm.runInNewContext(APP_THEME_BOOTSTRAP_SCRIPT, {
    document: { documentElement: { dataset } },
    localStorage: { getItem: () => storedTheme },
    navigator: { userAgent },
  });
  return dataset.theme;
}

assert.equal(runBootstrap("Mozilla/5.0 (Linux; Android 9)", null), "celadon");
assert.equal(runBootstrap("Mozilla/5.0 (Windows NT 10.0)", null), "dark");
assert.equal(
  runBootstrap("Mozilla/5.0 (Linux; Android 15)", "light"),
  "light",
);

console.log("app theme regression tests passed");
