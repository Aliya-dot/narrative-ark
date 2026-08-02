import { db } from "./db";
import { getPlatformCapabilities } from "./platform/capabilities";
import type { PlatformCapabilities } from "./platform/capabilities";
import type { AIConfig } from "./types";

export interface AIConfigRecordStore {
  get(id: string): Promise<AIConfig | undefined>;
  put(config: AIConfig): Promise<unknown>;
  delete(id: string): Promise<void>;
}

export interface AIConfigRepository {
  load(id?: string): Promise<AIConfig | undefined>;
  save(config: AIConfig): Promise<void>;
  delete(id?: string): Promise<void>;
  storageDescription(): string;
}

const credentialAccount = (id: string) =>
  `narrative-ark.ai-config.${id}.api-key`;

export function createAIConfigRepository(
  store: AIConfigRecordStore,
  platform: PlatformCapabilities,
): AIConfigRepository {
  return {
    async load(id = "active") {
      const record = await store.get(id);
      if (!record || !platform.secrets.available) return record;

      const account = record.credentialRef || credentialAccount(id);
      const securedApiKey = await platform.secrets.get(account);
      if (securedApiKey !== null) {
        return { ...record, apiKey: securedApiKey };
      }

      // One-time migration from the former plaintext configuration field.
      if (record.apiKey) {
        await platform.secrets.set(account, record.apiKey);
        await store.put({ ...record, apiKey: "", credentialRef: account });
      }
      return record;
    },

    async save(config) {
      if (!platform.secrets.available) {
        await store.put(config);
        return;
      }

      const account = credentialAccount(config.id);
      if (config.apiKey) {
        await platform.secrets.set(account, config.apiKey);
      } else {
        await platform.secrets.remove(account);
      }
      await store.put({ ...config, apiKey: "", credentialRef: account });
    },

    async delete(id = "active") {
      if (platform.secrets.available) {
        await platform.secrets.remove(credentialAccount(id));
      }
      await store.delete(id);
    },

    storageDescription() {
      return platform.secrets.available
        ? "API 配置已保存，API Key 已写入设备加密凭据存储（系统 KeyStore 优先）"
        : "API 配置已保存在当前浏览器";
    },
  };
}

const localConfigStore: AIConfigRecordStore = {
  get: (id) => db.configs.get(id),
  put: (config) => db.configs.put(config),
  delete: (id) => db.configs.delete(id),
};

let activeRepository: AIConfigRepository | undefined;
const sessionConfigs = new Map<string, AIConfig>();

export function getAIConfigRepository() {
  activeRepository ??= createAIConfigRepository(
    localConfigStore,
    getPlatformCapabilities(),
  );
  return activeRepository;
}

export async function loadAIConfig(id = "active") {
  const sessionConfig = sessionConfigs.get(id);
  if (sessionConfig) return sessionConfig;
  const stored = await getAIConfigRepository().load(id);
  if (stored) sessionConfigs.set(id, stored);
  return stored;
}

export async function saveAIConfig(config: AIConfig) {
  sessionConfigs.set(config.id, config);
  await getAIConfigRepository().save(config);
}

export async function deleteAIConfig(id = "active") {
  sessionConfigs.delete(id);
  await getAIConfigRepository().delete(id);
}

export const describeAIConfigStorage = () =>
  getAIConfigRepository().storageDescription();

export function setAIConfigRepositoryForTests(
  repository: AIConfigRepository | undefined,
) {
  activeRepository = repository;
  sessionConfigs.clear();
}
