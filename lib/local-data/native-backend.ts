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

type NativeInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

function normalizeNativeError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = new Error(message.replace(/^constraint:\s*/, ""));
  if (message.startsWith("constraint:")) normalized.name = "ConstraintError";
  throw normalized;
}

export class NativeSqliteBackend implements LocalDataBackend {
  readonly kind = "sqlite" as const;
  private readonly invokeCommand: NativeInvoke;
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(invokeCommand: NativeInvoke = invoke) {
    this.invokeCommand = invokeCommand;
  }

  async initialize() {
    await this.invokeCommand("local_db_initialize");
  }

  async get<T extends LocalEntity>(table: LocalTableName, id: string) {
    return (
      ((await this.invokeCommand("local_db_get", { table, id })) as T | null) ??
      undefined
    );
  }

  async query<T extends LocalEntity>(
    table: LocalTableName,
    query: LocalQuery = {},
  ) {
    const input: NativeRecordQuery = { table, ...query };
    return this.invokeCommand<T[]>("local_db_query", input);
  }

  async put<T extends LocalEntity>(
    table: LocalTableName,
    record: T,
    addOnly = false,
  ) {
    try {
      await this.invokeCommand("local_db_put", { table, record, addOnly });
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
      await this.invokeCommand("local_db_bulk_put", {
        table,
        records,
        addOnly,
      });
    } catch (error) {
      normalizeNativeError(error);
    }
  }

  update<T extends LocalEntity>(
    table: LocalTableName,
    id: string,
    changes: Partial<T>,
  ) {
    return this.invokeCommand<number>("local_db_update", {
      table,
      id,
      changes,
    });
  }

  async delete(table: LocalTableName, id: string) {
    await this.invokeCommand("local_db_delete", { table, id });
  }

  async bulkDelete(table: LocalTableName, ids: readonly string[]) {
    await this.invokeCommand("local_db_bulk_delete", { table, ids });
  }

  deleteWhere(table: LocalTableName, field: string, value: string) {
    return this.invokeCommand<number>("local_db_delete_where", {
      table,
      field,
      value,
    });
  }

  async clear(table: LocalTableName) {
    await this.invokeCommand("local_db_clear", { table });
  }

  primaryKeys(table: LocalTableName) {
    return this.invokeCommand<string[]>("local_db_primary_keys", { table });
  }

  private async enqueueTransaction<T>(operation: () => Promise<T>) {
    const previous = this.transactionTail;
    let release = () => {};
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async transaction<T>(
    _tables: readonly LocalTableName[],
    operation: () => Promise<T>,
  ) {
    return this.enqueueTransaction(async () => {
      await this.invokeCommand("local_db_begin");
      try {
        const result = await operation();
        await this.invokeCommand("local_db_commit");
        return result;
      } catch (error) {
        try {
          await this.invokeCommand("local_db_rollback");
        } catch (rollbackError) {
          throw new Error(
            `本地数据库事务与回滚均失败：${String(rollbackError)}`,
            { cause: error },
          );
        }
        throw error;
      }
    });
  }

  metadataGet(key: string) {
    return this.invokeCommand<string | null>("local_db_metadata_get", { key });
  }

  async metadataSet(key: string, value: string) {
    await this.invokeCommand("local_db_metadata_set", { key, value });
  }
}
