export type RuntimePlatform =
  "web" | "windows" | "android" | "linux" | "macos" | "ios" | "unknown";

export interface RuntimeCapabilities {
  platform: RuntimePlatform;
  native: boolean;
  supportsLoopbackOllama: boolean;
  supportsLanOllama: boolean;
}

export interface NetworkGateway {
  readonly transport: "browser" | "tauri-rust";
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface SecretStore {
  readonly backend: "unavailable" | "os-keyring";
  readonly available: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

export interface PlatformCapabilities {
  runtime: RuntimeCapabilities;
  network: NetworkGateway;
  secrets: SecretStore;
}

export type PlatformAdapterLoaders = {
  tauriFetch?: () => Promise<typeof globalThis.fetch>;
  keyring?: () => Promise<{
    getPasswords(keys: string[]): Promise<(string | null)[]>;
    setPasswords(entries: { account: string; secret: string }[]): Promise<void>;
    deletePasswords(keys: string[]): Promise<void>;
    passwordExists(key: string): Promise<boolean>;
  }>;
};

const unavailableSecrets: SecretStore = {
  backend: "unavailable",
  available: false,
  async get() {
    return null;
  },
  async set() {
    throw new Error("当前运行环境没有系统安全存储");
  },
  async remove() {},
  async has() {
    return false;
  },
};

export function detectRuntimeCapabilities(
  userAgent: string,
  native: boolean,
): RuntimeCapabilities {
  const normalized = userAgent.toLowerCase();
  const platform: RuntimePlatform = normalized.includes("android")
    ? "android"
    : normalized.includes("windows")
      ? "windows"
      : normalized.includes("iphone") || normalized.includes("ipad")
        ? "ios"
        : normalized.includes("mac")
          ? "macos"
          : normalized.includes("linux")
            ? "linux"
            : native
              ? "unknown"
              : "web";
  return {
    platform,
    native,
    supportsLoopbackOllama: native && platform === "windows",
    supportsLanOllama: native && platform === "android",
  };
}

export function isTauriRuntime() {
  return (
    typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis
  );
}

export function createPlatformCapabilities(
  options: {
    native?: boolean;
    userAgent?: string;
    browserFetch?: typeof globalThis.fetch;
    loaders?: PlatformAdapterLoaders;
  } = {},
): PlatformCapabilities {
  const native = options.native ?? isTauriRuntime();
  const userAgent =
    options.userAgent ??
    (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const runtime = detectRuntimeCapabilities(userAgent, native);
  const browserFetch =
    options.browserFetch ?? globalThis.fetch.bind(globalThis);
  const tauriFetchLoader =
    options.loaders?.tauriFetch ??
    (async () => (await import("@tauri-apps/plugin-http")).fetch);
  const keyringLoader =
    options.loaders?.keyring ??
    (async () => await import("tauri-plugin-keyring-store-api"));
  const useNativeAndroidSecretBridge =
    runtime.platform === "android" && !options.loaders?.keyring;
  const encryptedSecretFallback = useNativeAndroidSecretBridge
    ? createEncryptedSecretFallback()
    : undefined;
  async function invokeAndroidSecret<T>(
    command: string,
    args: Record<string, unknown>,
  ) {
    const { invoke } = await import("@tauri-apps/api/core");
    return await withTimeout(
      invoke<T>(command, args),
      8_000,
      "Android Keystore 响应超时",
    );
  }

  const network: NetworkGateway = native
    ? {
        transport: "tauri-rust",
        async fetch(input, init) {
          const tauriFetch = await tauriFetchLoader();
          return tauriFetch(input, init);
        },
      }
    : {
        transport: "browser",
        fetch: browserFetch,
      };

  const secrets: SecretStore = native
    ? {
        backend: "os-keyring",
        available: true,
        async get(key) {
          if (useNativeAndroidSecretBridge) {
            try {
              const secured = await invokeAndroidSecret<string | null>(
                "secure_secret_get",
                { key },
              );
              return secured ?? (await encryptedSecretFallback!.get(key));
            } catch (error) {
              console.warn("Android Keystore read failed; using encrypted fallback", error);
              return await encryptedSecretFallback!.get(key);
            }
          }
          const keyring = await keyringLoader();
          return (await keyring.getPasswords([key]))[0] ?? null;
        },
        async set(key, value) {
          if (useNativeAndroidSecretBridge) {
            try {
              await invokeAndroidSecret<void>("secure_secret_set", {
                key,
                value,
              });
              await encryptedSecretFallback!.remove(key);
            } catch (error) {
              console.warn(
                "Android Keystore write failed; using encrypted fallback",
                error,
              );
              await encryptedSecretFallback!.set(key, value);
            }
            return;
          }
          const keyring = await keyringLoader();
          await keyring.setPasswords([{ account: key, secret: value }]);
        },
        async remove(key) {
          if (useNativeAndroidSecretBridge) {
            try {
              await invokeAndroidSecret<void>("secure_secret_remove", { key });
            } catch (error) {
              console.warn("Android Keystore remove failed", error);
            }
            await encryptedSecretFallback!.remove(key);
            return;
          }
          const keyring = await keyringLoader();
          await keyring.deletePasswords([key]);
        },
        async has(key) {
          if (useNativeAndroidSecretBridge) {
            try {
              if (
                await invokeAndroidSecret<boolean>("secure_secret_has", { key })
              ) {
                return true;
              }
            } catch (error) {
              console.warn("Android Keystore probe failed", error);
            }
            return await encryptedSecretFallback!.has(key);
          }
          const keyring = await keyringLoader();
          return keyring.passwordExists(key);
        },
      }
    : unavailableSecrets;

  return { runtime, network, secrets };
}

let activePlatform: PlatformCapabilities | undefined;

export function getPlatformCapabilities() {
  activePlatform ??= createPlatformCapabilities();
  return activePlatform;
}

export function setPlatformCapabilitiesForTests(
  platform: PlatformCapabilities | undefined,
) {
  activePlatform = platform;
}
import { withTimeout } from "../promise-timeout";
import { createEncryptedSecretFallback } from "./encrypted-secret-fallback";
