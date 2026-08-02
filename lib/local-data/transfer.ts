import type { AIConfig } from "../types";
import { INDEXEDDB_MIGRATION_MARKER } from "./indexeddb-migration";
import {
  LOCAL_TABLES,
  type LocalDataBackend,
  type LocalEntity,
  type LocalTableName,
} from "./contracts";

export const LOCAL_DATA_TRANSFER_FORMAT = "narrative-ark-local-data";
export const LOCAL_DATA_TRANSFER_VERSION = 1;

export type LocalDataTransferBundle = {
  format: typeof LOCAL_DATA_TRANSFER_FORMAT;
  version: typeof LOCAL_DATA_TRANSFER_VERSION;
  exportedAt: string;
  source: "indexeddb" | "sqlite";
  tables: Record<LocalTableName, LocalEntity[]>;
};

function sanitizeRecords(table: LocalTableName, records: LocalEntity[]) {
  if (table !== "configs") return records;
  return records.map((record) => {
    const config = record as AIConfig;
    return {
      ...config,
      apiKey: "",
      credentialRef:
        config.credentialRef || `narrative-ark.ai-config.${config.id}.api-key`,
    };
  });
}

export async function createLocalDataTransfer(
  backend: LocalDataBackend,
): Promise<LocalDataTransferBundle> {
  const entries = await Promise.all(
    LOCAL_TABLES.map(async (table) => [
      table,
      sanitizeRecords(table, await backend.query(table)),
    ]),
  );
  return {
    format: LOCAL_DATA_TRANSFER_FORMAT,
    version: LOCAL_DATA_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    source: backend.kind,
    tables: Object.fromEntries(entries) as LocalDataTransferBundle["tables"],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseLocalDataTransfer(input: string | unknown) {
  if (typeof input === "string" && input.length > 100 * 1024 * 1024) {
    throw new Error("本地数据包超过 100 MB 上限");
  }
  const value: unknown = typeof input === "string" ? JSON.parse(input) : input;
  if (!isRecord(value)) throw new Error("本地数据包格式错误");
  if (value.format !== LOCAL_DATA_TRANSFER_FORMAT) {
    throw new Error("这不是叙界本地数据包");
  }
  if (value.version !== LOCAL_DATA_TRANSFER_VERSION) {
    throw new Error(`暂不识别本地数据包版本 ${String(value.version)}`);
  }
  if (!isRecord(value.tables)) throw new Error("本地数据包缺少数据表");

  const tables = {} as Record<LocalTableName, LocalEntity[]>;
  for (const table of LOCAL_TABLES) {
    const records = value.tables[table];
    if (!Array.isArray(records)) throw new Error(`数据表 ${table} 格式错误`);
    if (records.length > 250_000) {
      throw new Error(`数据表 ${table} 记录数超过上限`);
    }
    tables[table] = records.map((record) => {
      if (!isRecord(record) || typeof record.id !== "string" || !record.id) {
        throw new Error(`数据表 ${table} 含有无效记录`);
      }
      return record as unknown as LocalEntity;
    });
  }

  return {
    format: LOCAL_DATA_TRANSFER_FORMAT,
    version: LOCAL_DATA_TRANSFER_VERSION,
    exportedAt:
      typeof value.exportedAt === "string"
        ? value.exportedAt
        : new Date(0).toISOString(),
    source: value.source === "sqlite" ? "sqlite" : "indexeddb",
    tables,
  } satisfies LocalDataTransferBundle;
}

export async function importLocalDataTransfer(
  backend: LocalDataBackend,
  bundle: LocalDataTransferBundle,
  options: { replace?: boolean } = {},
) {
  const total = LOCAL_TABLES.reduce(
    (sum, table) => sum + bundle.tables[table].length,
    0,
  );
  await backend.transaction(LOCAL_TABLES, async () => {
    if (options.replace) {
      for (const table of LOCAL_TABLES) await backend.clear(table);
    }
    for (const table of LOCAL_TABLES) {
      const records = sanitizeRecords(table, bundle.tables[table]);
      if (records.length > 0) await backend.bulkPut(table, records);
    }
    await backend.metadataSet(
      INDEXEDDB_MIGRATION_MARKER,
      `transfer:${bundle.source}:${bundle.exportedAt}`,
    );
  });
  return total;
}
