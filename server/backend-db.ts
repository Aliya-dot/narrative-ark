import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const BACKEND_SCHEMA_VERSION = 1;

export type StoredProject = Record<string, unknown> & {
  id: string;
  updatedAt: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export class BackendConflictError extends Error {
  constructor(message = "项目已在其他客户端更新") {
    super(message);
    this.name = "BackendConflictError";
  }
}

function defaultDatabasePath() {
  return (
    process.env.NARRATIVE_ARK_DB_PATH ||
    path.join(process.cwd(), ".data", "narrative-ark.sqlite")
  );
}

function projectTitle(project: StoredProject) {
  const info = project.projectInfo;
  if (!info || typeof info !== "object" || Array.isArray(info)) return "";
  const title = (info as Record<string, unknown>).title;
  return typeof title === "string" ? title : "";
}

export class BackendDatabase {
  private readonly database: DatabaseSync;
  readonly location: string;

  constructor(location = defaultDatabasePath()) {
    this.location = location;
    if (location !== ":memory:") mkdirSync(path.dirname(location), { recursive: true });
    this.database = new DatabaseSync(location);
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA busy_timeout = 5000");
    if (location !== ":memory:") this.database.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    const current = Number(
      (
        this.database.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
    );
    if (current >= BACKEND_SCHEMA_VERSION) return;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL,
          data_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saves (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          data_json TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS saves_project_updated
          ON saves(project_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS world_books (
          id TEXT PRIMARY KEY,
          updated_at TEXT NOT NULL,
          data_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS world_book_entries (
          id TEXT PRIMARY KEY,
          world_book_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          data_json TEXT NOT NULL,
          FOREIGN KEY (world_book_id) REFERENCES world_books(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS world_book_entries_book
          ON world_book_entries(world_book_id);

        CREATE TABLE IF NOT EXISTS world_book_versions (
          id TEXT PRIMARY KEY,
          world_book_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          data_json TEXT NOT NULL,
          FOREIGN KEY (world_book_id) REFERENCES world_books(id) ON DELETE CASCADE,
          UNIQUE(world_book_id, version_number)
        );

        CREATE TABLE IF NOT EXISTS scenarios (
          id TEXT PRIMARY KEY,
          world_book_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          data_json TEXT NOT NULL,
          FOREIGN KEY (world_book_id) REFERENCES world_books(id) ON DELETE CASCADE
        );
      `);
      this.database.exec(`PRAGMA user_version = ${BACKEND_SCHEMA_VERSION}`);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  health() {
    this.database.prepare("SELECT 1").get();
    return {
      ok: true as const,
      storage: "sqlite" as const,
      schemaVersion: BACKEND_SCHEMA_VERSION,
    };
  }

  listProjects(): ProjectSummary[] {
    const rows = this.database
      .prepare(
        "SELECT id, title, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC",
      )
      .all() as ProjectSummary[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
    }));
  }

  getProject(id: string): StoredProject | undefined {
    const row = this.database
      .prepare("SELECT data_json AS dataJson FROM projects WHERE id = ?")
      .get(id) as { dataJson: string } | undefined;
    return row ? (JSON.parse(row.dataJson) as StoredProject) : undefined;
  }

  putProject(
    project: StoredProject,
    expectedUpdatedAt?: string | null,
  ): StoredProject {
    const existing = this.database
      .prepare("SELECT updated_at AS updatedAt FROM projects WHERE id = ?")
      .get(project.id) as { updatedAt: string } | undefined;

    if (
      expectedUpdatedAt !== undefined &&
      (existing?.updatedAt ?? null) !== expectedUpdatedAt
    ) {
      throw new BackendConflictError();
    }

    this.database
      .prepare(
        `INSERT INTO projects (id, title, updated_at, data_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           updated_at = excluded.updated_at,
           data_json = excluded.data_json`,
      )
      .run(
        project.id,
        projectTitle(project),
        project.updatedAt,
        JSON.stringify(project),
      );
    return project;
  }

  deleteProject(id: string) {
    return (
      this.database.prepare("DELETE FROM projects WHERE id = ?").run(id)
        .changes > 0
    );
  }

  close() {
    this.database.close();
  }
}

const backendGlobal = globalThis as typeof globalThis & {
  narrativeArkBackend?: BackendDatabase;
};

export function getBackendDatabase() {
  if (!backendGlobal.narrativeArkBackend) {
    backendGlobal.narrativeArkBackend = new BackendDatabase();
  }
  return backendGlobal.narrativeArkBackend;
}
