import assert from "node:assert/strict";
import {
  APP_THEME_BOOTSTRAP_SCRIPT,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  nextAppTheme,
  resolveAppTheme,
} from "./app-theme.ts";

assert.equal(resolveAppTheme("dark"), "dark");
assert.equal(resolveAppTheme("light"), "light");
assert.equal(resolveAppTheme(null), DEFAULT_APP_THEME);
assert.equal(resolveAppTheme("unknown-theme"), DEFAULT_APP_THEME);

assert.equal(nextAppTheme("dark"), "light");
assert.equal(nextAppTheme("light"), "dark");

assert.match(APP_THEME_BOOTSTRAP_SCRIPT, new RegExp(APP_THEME_STORAGE_KEY));
assert.match(
  APP_THEME_BOOTSTRAP_SCRIPT,
  /document\.documentElement\.dataset\.theme/,
);

console.log("app theme regression tests passed");
