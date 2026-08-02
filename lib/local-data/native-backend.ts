import { invoke } from "@tauri-apps/api/core";
import type {
  LocalDataBackend,
  LocalEntity,
  LocalQuery,
  LocalTableName,
} from "./contracts";

type NativeRecordQuery = {
  table: LocalTableName;
  filterField?: string;
  filterValue?: string;
  orderBy?: string;
  descending?: boolean;
};

function normalizeNativeError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = new Error(message.replace(/^constraint:\s*/, ""));
  if (message.startsWith("constraint:")) normalized.name = "ConstraintError";
  throw normalized;
}

export class NativeSqliteBackend implements LocalDataBackend {
  readonly kind = "sqlite" as const;
  private transactionDepth = 0;

  async initialize() {
    await invoke("local_db_initialize");
  }

  async get<T extends LocalEntity>(table: LocalTableName, id: string) {
    return (
      ((await invoke("local_db_get", { table, id })) as T | null) ?? undefined
    );
  }

  async query<T extends LocalEntity>(
    table: LocalTableName,
    query: LocalQuery = {},
  ) {
    const input: NativeRecordQuery = { table, ...query };
    return invoke<T[]>("local_db_query", input);
  }

  async put<T extends LocalEntity>(
    table: LocalTableName,
    record: T,
    addOnly = false,
  ) {
    try {
      await invoke("local_db_put", { table, record, addOnly });
      return record.id;
    } catch (error) {
      normalizeNativeError(error);
    }
  }

  async bulkPut<T extends LocalEntity>(
    table: LocalTableName,
    records: readonly T[],
    addOnly = false,
  ) {
    try {
      await invoke("local_db_bulk_put", { table, records, addOnly });
    } catch (error) {
      normalizeNativeError(error);
    }
  }

  update<T extends LocalEntity>(
    table: LocalTableName,
    id: string,
    changes: Partial<T>,
  ) {
    return invoke<number>("local_db_update", { table, id, changes });
  }

  async delete(table: LocalTableName, id: string) {
    await invoke("local_db_delete", { table, id });
  }

  async bulkDelete(table: LocalTableName, ids: readonly string[]) {
    await invoke("local_db_bulk_delete", { table, ids });
  }

  deleteWhere(table: LocalTableName, field: string, value: string) {
    return invoke<number>("local_db_delete_where", { table, field, value });
  }

  async clear(table: LocalTableName) {
    await invoke("local_db_clear", { table });
  }

  primaryKeys(table: LocalTableName) {
    return invoke<string[]>("local_db_primary_keys", { table });
  }

  async transaction<T>(
    _tables: readonly LocalTableName[],
    operation: () => Promise<T>,
  ) {
    const outermost = this.transactionDepth === 0;
    if (outermost) await invoke("local_db_begin");
    this.transactionDepth += 1;
    try {
      const result = await operation();
      this.transactionDepth -= 1;
      if (outermost) await invoke("local_db_commit");
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      if (outermost) await invoke("local_db_rollback");
      throw error;
    }
  }

  metadataGet(key: string) {
    return invoke<string | null>("local_db_metadata_get", { key });
  }

  async metadataSet(key: string, value: string) {
    await invoke("local_db_metadata_set", { key, value });
  }
}
