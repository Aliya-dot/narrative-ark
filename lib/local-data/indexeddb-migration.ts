import type { AIConfig } from "../types";
import { legacyBrowserDb } from "./browser-backend";
import {
  LOCAL_TABLES,
  type LocalDataBackend,
  type LocalEntity,
  type LocalTableName,
} from "./contracts";

export const INDEXEDDB_MIGRATION_MARKER = "indexeddb-migration-v1";

export interface LegacyIndexedDbSource {
  read(table: LocalTableName): Promise<LocalEntity[]>;
}

const defaultLegacySource: LegacyIndexedDbSource = {
  async read(table) {
    return (await legacyBrowserDb.table(table).toArray()) as LocalEntity[];
  },
};

function sanitizeForMigration(
  table: LocalTableName,
  records: LocalEntity[],
): LocalEntity[] {
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

export async function migrateLegacyIndexedDb(
  backend: LocalDataBackend,
  source: LegacyIndexedDbSource = defaultLegacySource,
): Promise<"already-complete" | "empty" | "migrated" | "sqlite-not-empty"> {
  const marker = await backend.metadataGet(INDEXEDDB_MIGRATION_MARKER);
  if (marker) return "already-complete";

  const sqliteCounts = await Promise.all(
    LOCAL_TABLES.map(
      async (table) => (await backend.primaryKeys(table)).length,
    ),
  );
  if (sqliteCounts.some((count) => count > 0)) {
    await backend.metadataSet(INDEXEDDB_MIGRATION_MARKER, "sqlite-not-empty");
    return "sqlite-not-empty";
  }

  const legacyRecords = await Promise.all(
    LOCAL_TABLES.map(async (table) => ({
      table,
      records: sanitizeForMigration(table, await source.read(table)),
    })),
  );
  if (legacyRecords.every(({ records }) => records.length === 0)) {
    await backend.metadataSet(INDEXEDDB_MIGRATION_MARKER, "empty");
    return "empty";
  }

  await backend.transaction(LOCAL_TABLES, async () => {
    for (const { table, records } of legacyRecords) {
      if (records.length > 0) await backend.bulkPut(table, records);
    }
    await backend.metadataSet(INDEXEDDB_MIGRATION_MARKER, "migrated");
  });
  return "migrated";
}
