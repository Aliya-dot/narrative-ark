export const LOCAL_TABLES = [
  "projects",
  "configs",
  "saves",
  "drafts",
  "exports",
  "worldBooks",
  "worldBookEntries",
  "worldBookVersions",
  "scenarios",
] as const;

export type LocalTableName = (typeof LOCAL_TABLES)[number];

export interface LocalEntity {
  id: string;
}

export interface LocalQuery {
  filterField?: string;
  filterValue?: string;
  orderBy?: string;
  descending?: boolean;
}

export interface LocalDataBackend {
  readonly kind: "indexeddb" | "sqlite";
  get<T extends LocalEntity>(
    table: LocalTableName,
    id: string,
  ): Promise<T | undefined>;
  query<T extends LocalEntity>(
    table: LocalTableName,
    query?: LocalQuery,
  ): Promise<T[]>;
  put<T extends LocalEntity>(
    table: LocalTableName,
    record: T,
    addOnly?: boolean,
  ): Promise<string>;
  bulkPut<T extends LocalEntity>(
    table: LocalTableName,
    records: readonly T[],
    addOnly?: boolean,
  ): Promise<void>;
  update<T extends LocalEntity>(
    table: LocalTableName,
    id: string,
    changes: Partial<T>,
  ): Promise<number>;
  delete(table: LocalTableName, id: string): Promise<void>;
  bulkDelete(table: LocalTableName, ids: readonly string[]): Promise<void>;
  deleteWhere(
    table: LocalTableName,
    field: string,
    value: string,
  ): Promise<number>;
  clear(table: LocalTableName): Promise<void>;
  primaryKeys(table: LocalTableName): Promise<string[]>;
  transaction<T>(
    tables: readonly LocalTableName[],
    operation: () => Promise<T>,
  ): Promise<T>;
  metadataGet(key: string): Promise<string | null>;
  metadataSet(key: string, value: string): Promise<void>;
}

export interface LocalCollection<T extends LocalEntity> {
  toArray(): Promise<T[]>;
  delete(): Promise<number>;
  sortBy(field: string): Promise<T[]>;
  primaryKeys(): Promise<string[]>;
}

export interface LocalWhereClause<T extends LocalEntity> {
  equals(value: string): LocalCollection<T>;
}

export interface LocalOrderedCollection<T extends LocalEntity> {
  reverse(): LocalOrderedCollection<T>;
  toArray(): Promise<T[]>;
}

export interface LocalTable<T extends LocalEntity> {
  readonly name: LocalTableName;
  get(id: string): Promise<T | undefined>;
  put(record: T): Promise<string>;
  add(record: T): Promise<string>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  bulkPut(records: readonly T[]): Promise<void>;
  bulkAdd(records: readonly T[]): Promise<void>;
  bulkDelete(ids: readonly string[]): Promise<void>;
  update(id: string, changes: Partial<T>): Promise<number>;
  toArray(): Promise<T[]>;
  orderBy(field: string): LocalOrderedCollection<T>;
  where(field: string): LocalWhereClause<T>;
  toCollection(): { primaryKeys(): Promise<string[]> };
}
