import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  AUTO_UPDATE_ENABLED_KEY,
  LAST_UPDATE_CHECK_KEY,
  UPDATE_CHECK_INTERVAL_MS,
  isAutoUpdateEnabled,
  recordAutomaticUpdateCheck,
  setAutoUpdateEnabled,
  shouldRunAutomaticUpdateCheck,
} = await import("./app-updater.ts");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  } as Storage;
}

const storage = memoryStorage();
assert.equal(isAutoUpdateEnabled(storage), true);
assert.equal(shouldRunAutomaticUpdateCheck(storage, 1_000), true);

recordAutomaticUpdateCheck(storage, 1_000);
assert.equal(storage.getItem(LAST_UPDATE_CHECK_KEY), "1000");
assert.equal(
  shouldRunAutomaticUpdateCheck(storage, 1_000 + UPDATE_CHECK_INTERVAL_MS - 1),
  false,
);
assert.equal(
  shouldRunAutomaticUpdateCheck(storage, 1_000 + UPDATE_CHECK_INTERVAL_MS),
  true,
);

setAutoUpdateEnabled(storage, false);
assert.equal(storage.getItem(AUTO_UPDATE_ENABLED_KEY), "false");
assert.equal(isAutoUpdateEnabled(storage), false);
assert.equal(
  shouldRunAutomaticUpdateCheck(storage, 1_000 + UPDATE_CHECK_INTERVAL_MS * 2),
  false,
);

setAutoUpdateEnabled(storage, true);
assert.equal(isAutoUpdateEnabled(storage), true);

console.log("Windows updater preference tests passed");
