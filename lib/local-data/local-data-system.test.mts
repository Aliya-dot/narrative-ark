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

const [{ LOCAL_TABLES }, migration, transfer] = await Promise.all([
  import("./contracts.ts"),
  import("./indexeddb-migration.ts"),
  import("./transfer.ts"),
]);

type Entity = { id: string; [key: string]: unknown };
type TableName = (typeof LOCAL_TABLES)[number];

class MemoryBackend {
  readonly kind: "indexeddb" | "sqlite";
  private tables = new Map<TableName, Map<string, Entity>>();
  private metadata = new Map<string, string>();

  constructor(kind: "indexeddb" | "sqlite") {
    this.kind = kind;
    for (const name of LOCAL_TABLES) this.tables.set(name, new Map());
  }

  async get<T extends Entity>(table: TableName, id: string) {
    return structuredClone(this.tables.get(table)?.get(id)) as T | undefined;
  }

  async query<T extends Entity>(table: TableName) {
    return [...(this.tables.get(table)?.values() ?? [])].map((record) =>
      structuredClone(record),
    ) as T[];
  }

  async put<T extends Entity>(table: TableName, record: T, addOnly = false) {
    const records = this.tables.get(table)!;
    if (addOnly && records.has(record.id)) {
      const error = new Error("duplicate");
      error.name = "ConstraintError";
      throw error;
    }
    records.set(record.id, structuredClone(record));
    return record.id;
  }

  async bulkPut<T extends Entity>(
    table: TableName,
    records: readonly T[],
    addOnly = false,
  ) {
    for (const record of records) await this.put(table, record, addOnly);
  }

  async update<T extends Entity>(
    table: TableName,
    id: string,
    changes: Partial<T>,
  ) {
    const current = await this.get<T>(table, id);
    if (!current) return 0;
    await this.put(table, { ...current, ...changes, id });
    return 1;
  }

  async delete(table: TableName, id: string) {
    this.tables.get(table)!.delete(id);
  }

  async bulkDelete(table: TableName, ids: readonly string[]) {
    for (const id of ids) await this.delete(table, id);
  }

  async deleteWhere(table: TableName, field: string, value: string) {
    let deleted = 0;
    for (const record of await this.query(table)) {
      if (record[field] === value) {
        await this.delete(table, record.id);
        deleted += 1;
      }
    }
    return deleted;
  }

  async clear(table: TableName) {
    this.tables.get(table)!.clear();
  }

  async primaryKeys(table: TableName) {
    return [...this.tables.get(table)!.keys()];
  }

  async transaction<T>(
    _tables: readonly TableName[],
    operation: () => Promise<T>,
  ) {
    const beforeTables = structuredClone(this.tables);
    const beforeMetadata = structuredClone(this.metadata);
    try {
      return await operation();
    } catch (error) {
      this.tables = beforeTables;
      this.metadata = beforeMetadata;
      throw error;
    }
  }

  async metadataGet(key: string) {
    return this.metadata.get(key) ?? null;
  }

  async metadataSet(key: string, value: string) {
    this.metadata.set(key, value);
  }
}

const source = new MemoryBackend("indexeddb");
await source.put("projects", {
  id: "project-1",
  projectInfo: { title: "迁移测试" },
});
await source.put("saves", {
  id: "save-1",
  projectId: "project-1",
  turn: 12,
});
await source.put("worldBooks", { id: "world-1", name: "测试世界" });
await source.put("configs", {
  id: "active",
  provider: "fixture",
  apiKey: "must-not-leave-device",
});

const bundle = await transfer.createLocalDataTransfer(source);
assert.equal(bundle.format, "narrative-ark-local-data");
assert.equal(bundle.tables.projects.length, 1);
assert.equal(bundle.tables.saves.length, 1);
assert.equal(bundle.tables.worldBooks.length, 1);
assert.equal(bundle.tables.configs[0].apiKey, "");
assert.match(String(bundle.tables.configs[0].credentialRef), /active/);

const parsed = transfer.parseLocalDataTransfer(JSON.stringify(bundle));
const target = new MemoryBackend("sqlite");
assert.equal(await transfer.importLocalDataTransfer(target, parsed), 4);
assert.equal((await target.get("saves", "save-1"))?.projectId, "project-1");
assert.equal((await target.get("worldBooks", "world-1"))?.name, "测试世界");
assert.match(
  (await target.metadataGet(migration.INDEXEDDB_MIGRATION_MARKER)) ?? "",
  /^transfer:indexeddb:/,
);

await target.put("drafts", { id: "old-draft", value: "remove me" });
await transfer.importLocalDataTransfer(target, parsed, { replace: true });
assert.equal(await target.get("drafts", "old-draft"), undefined);

assert.throws(
  () =>
    transfer.parseLocalDataTransfer({
      ...bundle,
      version: 999,
    }),
  /版本 999/,
);
assert.throws(
  () =>
    transfer.parseLocalDataTransfer({
      ...bundle,
      tables: { ...bundle.tables, saves: [{ projectId: "missing-id" }] },
    }),
  /无效记录/,
);

const migrationTarget = new MemoryBackend("sqlite");
const migrationResult = await migration.migrateLegacyIndexedDb(
  migrationTarget,
  {
    async read(table) {
      return source.query(table);
    },
  },
);
assert.equal(migrationResult, "migrated");
assert.equal((await migrationTarget.get("configs", "active"))?.apiKey, "");
assert.equal(
  await migration.migrateLegacyIndexedDb(migrationTarget, {
    async read() {
      throw new Error("completed migration must not read legacy data");
    },
  }),
  "already-complete",
);

const occupiedTarget = new MemoryBackend("sqlite");
await occupiedTarget.put("projects", { id: "existing" });
assert.equal(
  await migration.migrateLegacyIndexedDb(occupiedTarget, {
    async read(table) {
      return source.query(table);
    },
  }),
  "sqlite-not-empty",
);

console.log("local data transfer and IndexedDB migration tests passed");
