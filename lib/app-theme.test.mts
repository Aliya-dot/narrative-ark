import assert from "node:assert/strict";
import {
  APP_THEME_BOOTSTRAP_SCRIPT,
  APP_THEME_STORAGE_KEY,
  APP_THEMES,
  DEFAULT_APP_THEME,
  resolveAppTheme,
} from "./app-theme.ts";

assert.deepEqual(
  APP_THEMES.map(({ id, label }) => [id, label]),
  [
    ["dark", "深色"],
    ["light", "浅色"],
    ["mint", "青柠薄荷"],
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
assert.equal(resolveAppTheme(null), DEFAULT_APP_THEME);
assert.equal(resolveAppTheme("unknown-theme"), DEFAULT_APP_THEME);

assert.match(APP_THEME_BOOTSTRAP_SCRIPT, new RegExp(APP_THEME_STORAGE_KEY));
assert.match(
  APP_THEME_BOOTSTRAP_SCRIPT,
  /document\.documentElement\.dataset\.theme/,
);

console.log("app theme regression tests passed");
