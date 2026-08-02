import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const projectRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(projectRoot.href) &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createPlatformCapabilities } =
  await import("./platform/capabilities.ts");

let fallbackReads = 0;
let fallbackRemovals = 0;
let fallbackProbes = 0;
const platform = createPlatformCapabilities({
  native: true,
  userAgent: "Mozilla/5.0 (Linux; Android 9)",
  loaders: {
    async androidSecretInvoke() {
      throw new Error("fixture keystore failure");
    },
    legacyEncryptedSecretStore() {
      return {
        async get() {
          fallbackReads += 1;
          return null;
        },
        async remove() {
          fallbackRemovals += 1;
        },
        async has() {
          fallbackProbes += 1;
          return false;
        },
      };
    },
  },
});

await assert.rejects(
  platform.secrets.set("model.deepseek", "fixture-secret"),
  /Android 系统安全存储不可用，API Key 未保存/,
);
await assert.rejects(
  platform.secrets.get("model.deepseek"),
  /Android 系统安全存储读取失败，API Key 未读取/,
);
await assert.rejects(
  platform.secrets.remove("model.deepseek"),
  /Android 系统安全存储清除失败/,
);
await assert.rejects(
  platform.secrets.has("model.deepseek"),
  /Android 系统安全存储检查失败/,
);
assert.deepEqual(
  { fallbackReads, fallbackRemovals, fallbackProbes },
  {
    fallbackReads: 0,
    fallbackRemovals: 0,
    fallbackProbes: 0,
  },
);

console.log("Android secret storage fail-closed tests passed");
