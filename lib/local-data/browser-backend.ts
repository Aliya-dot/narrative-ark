import Dexie from "dexie";
import type { Table, UpdateSpec } from "dexie";
import type {
  LocalDataBackend,
  LocalEntity,
  LocalQuery,
  LocalTableName,
} from "./contracts";

type IndexedEntity = LocalEntity & Record<string, unknown>;

export class LegacyNarrativeDexie extends Dexie {
  constructor() {
    super("narrative-ark");
    this.version(1).stores({
      projects: "id,updatedAt,projectInfo.title",
      configs: "id,active,updatedAt",
      saves: "id,projectId,updatedAt",
      drafts: "id,updatedAt",
      exports: "id,projectId,createdAt",
    });
    this.version(2).stores({
      projects: "id,updatedAt,projectInfo.title",
      configs: "id,active,updatedAt",
      saves: "id,projectId,updatedAt",
      drafts: "id,updatedAt",
      exports: "id,projectId,createdAt",
    });
    this.version(3).stores({
      projects: "id,updatedAt,projectInfo.title,worldBinding.worldBookId",
      configs: "id,active,updatedAt",
      saves: "id,projectId,updatedAt",
      drafts: "id,updatedAt",
      exports: "id,projectId,createdAt",
      worldBooks: "id,status,updatedAt,name,currentVersionId",
      worldBookEntries: "id,worldBookId,category,updatedAt,enabled",
      worldBookVersions: "id,worldBookId,versionNumber,createdAt",
      scenarios: "id,worldBookId,worldBookVersionId,updatedAt",
    });
  }
}

export const legacyBrowserDb = new LegacyNarrativeDexie();

function table(name: LocalTableName): Table<IndexedEntity, string> {
  return legacyBrowserDb.table(name);
}

export class BrowserLocalDataBackend implements LocalDataBackend {
  readonly kind = "indexeddb" as const;

  async get<T extends LocalEntity>(name: LocalTableName, id: string) {
    return (await table(name).get(id)) as T | undefined;
  }

  async query<T extends LocalEntity>(
    name: LocalTableName,
    query: LocalQuery = {},
  ) {
    let values: IndexedEntity[];
    if (query.filterField !== undefined && query.filterValue !== undefined) {
      values = await table(name)
        .where(query.filterField)
        .equals(query.filterValue)
        .toArray();
    } else if (query.orderBy) {
      const ordered = table(name).orderBy(query.orderBy);
      values = await (query.descending ? ordered.reverse() : ordered).toArray();
    } else {
      values = await table(name).toArray();
    }
    if (query.filterField && query.orderBy) {
      values.sort((left, right) => {
        const a = left[query.orderBy!];
        const b = right[query.orderBy!];
        const comparison = String(a ?? "").localeCompare(String(b ?? ""));
        return query.descending ? -comparison : comparison;
      });
    }
    return values as T[];
  }

  async put<T extends LocalEntity>(
    name: LocalTableName,
    record: T,
    addOnly = false,
  ) {
    const value = record as IndexedEntity;
    return addOnly ? table(name).add(value) : table(name).put(value);
  }

  async bulkPut<T extends LocalEntity>(
    name: LocalTableName,
    records: readonly T[],
    addOnly = false,
  ) {
    const values = records as readonly IndexedEntity[];
    if (addOnly) await table(name).bulkAdd(values);
    else await table(name).bulkPut(values);
  }

  async update<T extends LocalEntity>(
    name: LocalTableName,
    id: string,
    changes: Partial<T>,
  ) {
    return table(name).update(id, changes as UpdateSpec<IndexedEntity>);
  }

  async delete(name: LocalTableName, id: string) {
    await table(name).delete(id);
  }

  async bulkDelete(name: LocalTableName, ids: readonly string[]) {
    await table(name).bulkDelete([...ids]);
  }

  async deleteWhere(name: LocalTableName, field: string, value: string) {
    return table(name).where(field).equals(value).delete();
  }

  async clear(name: LocalTableName) {
    await table(name).clear();
  }

  async primaryKeys(name: LocalTableName) {
    return (await table(name).toCollection().primaryKeys()).map(String);
  }

  transaction<T>(
    tables: readonly LocalTableName[],
    operation: () => Promise<T>,
  ) {
    const runTransaction = legacyBrowserDb.transaction.bind(
      legacyBrowserDb,
    ) as unknown as (
      mode: "rw",
      targetTables: ReturnType<typeof table>[],
      scope: () => Promise<T>,
    ) => Promise<T>;
    return runTransaction(
      "rw",
      tables.map((name) => table(name)),
      operation,
    );
  }

  async metadataGet() {
    return null;
  }

  async metadataSet() {}
}
