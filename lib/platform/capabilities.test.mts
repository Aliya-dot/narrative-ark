import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const projectRoot = new URL("../../", import.meta.url);
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

const [{ createPlatformCapabilities, detectRuntimeCapabilities }, endpoint] =
  await Promise.all([
    import("./capabilities.ts"),
    import("./model-endpoint-policy.ts"),
  ]);

assert.deepEqual(
  detectRuntimeCapabilities("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", true),
  {
    platform: "windows",
    native: true,
    supportsLoopbackOllama: true,
    supportsLanOllama: false,
  },
);
assert.deepEqual(
  detectRuntimeCapabilities("Mozilla/5.0 (Linux; Android 9)", true),
  {
    platform: "android",
    native: true,
    supportsLoopbackOllama: false,
    supportsLanOllama: true,
  },
);

const browserRequests: string[] = [];
const web = createPlatformCapabilities({
  native: false,
  userAgent: "Mozilla/5.0 (Windows NT 10.0)",
  browserFetch: async (input) => {
    browserRequests.push(String(input));
    return new Response("ok");
  },
});
assert.equal(web.network.transport, "browser");
await web.network.fetch("https://example.com");
assert.deepEqual(browserRequests, ["https://example.com"]);
assert.equal(web.secrets.available, false);
await assert.rejects(web.secrets.set("key", "secret"), /系统安全存储/);

const nativeRequests: string[] = [];
const secrets = new Map<string, string>();
const native = createPlatformCapabilities({
  native: true,
  userAgent: "Mozilla/5.0 (Linux; Android 9)",
  loaders: {
    async tauriFetch() {
      return (async (input: string | URL | Request) => {
        nativeRequests.push(String(input));
        return new Response("ok");
      }) as typeof globalThis.fetch;
    },
    async keyring() {
      return {
        async getPasswords(keys) {
          return keys.map((key) => secrets.get(key) ?? null);
        },
        async setPasswords(entries) {
          entries.forEach(({ account, secret }) =>
            secrets.set(account, secret),
          );
        },
        async deletePasswords(keys) {
          keys.forEach((key) => secrets.delete(key));
        },
        async passwordExists(key) {
          return secrets.has(key);
        },
      };
    },
  },
});
assert.equal(native.network.transport, "tauri-rust");
await native.network.fetch("http://192.168.1.10:11434");
assert.deepEqual(nativeRequests, ["http://192.168.1.10:11434"]);
assert.equal(native.secrets.backend, "os-keyring");
await native.secrets.set("model.openai", "fixture-secret");
assert.equal(await native.secrets.get("model.openai"), "fixture-secret");
assert.equal(await native.secrets.has("model.openai"), true);
await native.secrets.remove("model.openai");
assert.equal(await native.secrets.has("model.openai"), false);

assert.equal(
  endpoint.resolveModelEndpoint("http://127.0.0.1:11434/v1", "ollama", {
    platform: "windows",
    native: true,
    supportsLoopbackOllama: true,
    supportsLanOllama: false,
  }),
  "http://127.0.0.1:11434/v1/chat/completions",
);
assert.equal(
  endpoint.resolveModelEndpoint("http://192.168.1.10:11434/v1", "ollama", {
    platform: "android",
    native: true,
    supportsLoopbackOllama: false,
    supportsLanOllama: true,
  }),
  "http://192.168.1.10:11434/v1/chat/completions",
);
assert.throws(
  () =>
    endpoint.resolveModelEndpoint("http://192.168.1.10:11434/v1", "ollama", {
      platform: "windows",
      native: true,
      supportsLoopbackOllama: true,
      supportsLanOllama: false,
    }),
  /内网地址/,
);
assert.throws(
  () =>
    endpoint.resolveModelEndpoint("http://api.example.com/v1", "openai", {
      platform: "android",
      native: true,
      supportsLoopbackOllama: false,
      supportsLanOllama: true,
    }),
  /HTTPS/,
);

console.log("platform capability tests passed");
