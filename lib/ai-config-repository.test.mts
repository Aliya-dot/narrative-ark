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

const [{ createAIConfigRepository }, { createPlatformCapabilities }] =
  await Promise.all([
    import("./ai-config-repository.ts"),
    import("./platform/capabilities.ts"),
  ]);

const legacyConfig = {
  id: "active",
  provider: "openai",
  apiKey: "legacy-plaintext-key",
  baseUrl: "https://api.example.com/v1",
  model: "fixture-model",
  maxTokens: 4096,
  temperature: 0.7,
  topP: 0.9,
  timeout: 60,
  headers: {},
  active: true,
  updatedAt: new Date(0).toISOString(),
};

const records = new Map([["active", legacyConfig]]);
const store = {
  async get(id: string) {
    return records.get(id);
  },
  async put(config: typeof legacyConfig) {
    records.set(config.id, config);
  },
  async delete(id: string) {
    records.delete(id);
  },
};
const keyring = new Map<string, string>();
const native = createPlatformCapabilities({
  native: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  loaders: {
    async tauriFetch() {
      return globalThis.fetch;
    },
    async keyring() {
      return {
        async getPasswords(keys: string[]) {
          return keys.map((key) => keyring.get(key) ?? null);
        },
        async setPasswords(entries: { account: string; secret: string }[]) {
          entries.forEach(({ account, secret }) =>
            keyring.set(account, secret),
          );
        },
        async deletePasswords(keys: string[]) {
          keys.forEach((key) => keyring.delete(key));
        },
        async passwordExists(key: string) {
          return keyring.has(key);
        },
      };
    },
  },
});

const repository = createAIConfigRepository(store, native);
const migrated = await repository.load();
assert.equal(migrated?.apiKey, "legacy-plaintext-key");
assert.equal(records.get("active")?.apiKey, "");
assert.equal(
  keyring.get("narrative-ark.ai-config.active.api-key"),
  "legacy-plaintext-key",
);

await repository.save({ ...legacyConfig, apiKey: "new-secure-key" });
assert.equal(records.get("active")?.apiKey, "");
assert.equal((await repository.load())?.apiKey, "new-secure-key");
assert.match(repository.storageDescription(), /加密凭据存储/);

await repository.delete();
assert.equal(records.has("active"), false);
assert.equal(keyring.size, 0);

console.log("AI config repository tests passed");
