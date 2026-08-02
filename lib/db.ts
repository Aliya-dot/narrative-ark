"use client";

import type {
  AIConfig,
  GameProject,
  GameSave,
  WorldBook,
  WorldBookEntry,
  WorldBookVersion,
  WorldScenario,
} from "./types";
import { isTauriRuntime } from "./platform/capabilities";
import { BrowserLocalDataBackend } from "./local-data/browser-backend";
import { NativeSqliteBackend } from "./local-data/native-backend";
import { migrateLegacyIndexedDb } from "./local-data/indexeddb-migration";
import { scheduleAutomaticBackup } from "./local-data/backup-service";
import type {
  LocalCollection,
  LocalDataBackend,
  LocalEntity,
  LocalOrderedCollection,
  LocalTable,
  LocalTableName,
  LocalWhereClause,
} from "./local-data/contracts";

export interface DraftRecord extends LocalEntity {
  value: unknown;
  updatedAt: string;
}

export interface ExportRecord extends LocalEntity {
  projectId: string;
  format: string;
  createdAt: string;
}

let backendOverride: LocalDataBackend | undefined;
let backendPromise: Promise<LocalDataBackend> | undefined;

class TransactionCoordinator {
  private active = false;
  private dirty = false;
  private tail: Promise<void> = Promise.resolve();

  markMutation() {
    if (this.active) {
      this.dirty = true;
      return;
    }
    scheduleAutomaticBackup();
  }

  async run<T>(operation: () => Promise<T>) {
    const previous = this.tail;
    let release = () => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.active = true;
    this.dirty = false;
    try {
      const result = await operation();
      if (this.dirty) scheduleAutomaticBackup();
      return result;
    } finally {
      this.active = false;
      this.dirty = false;
      release();
    }
  }
}

const transactionCoordinator = new TransactionCoordinator();

async function createBackend(): Promise<LocalDataBackend> {
  if (!isTauriRuntime()) return new BrowserLocalDataBackend();
  const backend = new NativeSqliteBackend();
  await backend.initialize();
  const migration = await migrateLegacyIndexedDb(backend);
  if (migration === "migrated") scheduleAutomaticBackup(0);
  return backend;
}

export function getLocalDataBackend() {
  if (backendOverride) return Promise.resolve(backendOverride);
  backendPromise ??= createBackend();
  return backendPromise;
}

export function setLocalDataBackendForTests(
  backend: LocalDataBackend | undefined,
) {
  backendOverride = backend;
  backendPromise = undefined;
}

function markMutation() {
  transactionCoordinator.markMutation();
}

class OrderedCollection<
  T extends LocalEntity,
> implements LocalOrderedCollection<T> {
  private descending = false;
  private readonly table: LocalTableName;
  private readonly field: string;

  constructor(table: LocalTableName, field: string) {
    this.table = table;
    this.field = field;
  }

  reverse() {
    this.descending = !this.descending;
    return this;
  }

  async toArray() {
    return (await getLocalDataBackend()).query<T>(this.table, {
      orderBy: this.field,
      descending: this.descending,
    });
  }
}

class FilteredCollection<T extends LocalEntity> implements LocalCollection<T> {
  private readonly table: LocalTableName;
  private readonly field: string;
  private readonly value: string;

  constructor(table: LocalTableName, field: string, value: string) {
    this.table = table;
    this.field = field;
    this.value = value;
  }

  async toArray() {
    return (await getLocalDataBackend()).query<T>(this.table, {
      filterField: this.field,
      filterValue: this.value,
    });
  }

  async delete() {
    const result = await (
      await getLocalDataBackend()
    ).deleteWhere(this.table, this.field, this.value);
    if (result > 0) markMutation();
    return result;
  }

  async sortBy(field: string) {
    return (await getLocalDataBackend()).query<T>(this.table, {
      filterField: this.field,
      filterValue: this.value,
      orderBy: field,
    });
  }

  async primaryKeys() {
    return (await this.toArray()).map((record) => record.id);
  }
}

class WhereClause<T extends LocalEntity> implements LocalWhereClause<T> {
  private readonly table: LocalTableName;
  private readonly field: string;

  constructor(table: LocalTableName, field: string) {
    this.table = table;
    this.field = field;
  }

  equals(value: string) {
    return new FilteredCollection<T>(this.table, this.field, value);
  }
}

class DataTable<T extends LocalEntity> implements LocalTable<T> {
  readonly name: LocalTableName;

  constructor(name: LocalTableName) {
    this.name = name;
  }

  async get(id: string) {
    return (await getLocalDataBackend()).get<T>(this.name, id);
  }

  async put(record: T) {
    const id = await (await getLocalDataBackend()).put(this.name, record);
    markMutation();
    return id;
  }

  async add(record: T) {
    const id = await (await getLocalDataBackend()).put(this.name, record, true);
    markMutation();
    return id;
  }

  async delete(id: string) {
    await (await getLocalDataBackend()).delete(this.name, id);
    markMutation();
  }

  async clear() {
    await (await getLocalDataBackend()).clear(this.name);
    markMutation();
  }

  async bulkPut(records: readonly T[]) {
    await (await getLocalDataBackend()).bulkPut(this.name, records);
    if (records.length > 0) markMutation();
  }

  async bulkAdd(records: readonly T[]) {
    await (await getLocalDataBackend()).bulkPut(this.name, records, true);
    if (records.length > 0) markMutation();
  }

  async bulkDelete(ids: readonly string[]) {
    await (await getLocalDataBackend()).bulkDelete(this.name, ids);
    if (ids.length > 0) markMutation();
  }

  async update(id: string, changes: Partial<T>) {
    const count = await (
      await getLocalDataBackend()
    ).update(this.name, id, changes);
    if (count > 0) markMutation();
    return count;
  }

  async toArray() {
    return (await getLocalDataBackend()).query<T>(this.name);
  }

  orderBy(field: string) {
    return new OrderedCollection<T>(this.name, field);
  }

  where(field: string) {
    return new WhereClause<T>(this.name, field);
  }

  toCollection() {
    return {
      primaryKeys: async () =>
        (await getLocalDataBackend()).primaryKeys(this.name),
    };
  }
}

class NarrativeDatabase {
  readonly projects = new DataTable<GameProject>("projects");
  readonly configs = new DataTable<AIConfig>("configs");
  readonly saves = new DataTable<GameSave>("saves");
  readonly drafts = new DataTable<DraftRecord>("drafts");
  readonly exports = new DataTable<ExportRecord>("exports");
  readonly worldBooks = new DataTable<WorldBook>("worldBooks");
  readonly worldBookEntries = new DataTable<WorldBookEntry>("worldBookEntries");
  readonly worldBookVersions = new DataTable<WorldBookVersion>(
    "worldBookVersions",
  );
  readonly scenarios = new DataTable<WorldScenario>("scenarios");

  transaction<T>(
    mode: string,
    table: unknown,
    operation: () => T | Promise<T>,
  ): Promise<T>;
  transaction<T>(
    mode: string,
    table1: unknown,
    table2: unknown,
    operation: () => T | Promise<T>,
  ): Promise<T>;
  transaction<T>(
    mode: string,
    table1: unknown,
    table2: unknown,
    table3: unknown,
    operation: () => T | Promise<T>,
  ): Promise<T>;
  transaction<T>(
    mode: string,
    table1: unknown,
    table2: unknown,
    table3: unknown,
    table4: unknown,
    operation: () => T | Promise<T>,
  ): Promise<T>;
  async transaction<T>(_mode: string, ...args: unknown[]): Promise<T> {
    const operation = args.at(-1);
    if (typeof operation !== "function") {
      throw new Error("本地数据库事务缺少操作函数");
    }
    const tables = args
      .slice(0, -1)
      .flatMap((value) =>
        value instanceof DataTable ? [value.name] : [],
      ) as LocalTableName[];
    return transactionCoordinator.run(async () => {
      const backend = await getLocalDataBackend();
      return await backend.transaction(tables, async () =>
        (operation as () => T | Promise<T>)(),
      );
    });
  }
}

export const db = new NarrativeDatabase();

export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
