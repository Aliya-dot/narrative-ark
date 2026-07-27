import { db } from "./db";
import type {
  ImportConflict,
  PreparedProjectImport,
} from "./project-import-preparation";
import type { GameProject, GameSave } from "./types";

export interface ProjectImportPersistence {
  getProject(id: string): Promise<unknown | undefined>;
  getSave(id: string): Promise<unknown | undefined>;
  addProject(project: GameProject): Promise<unknown>;
  addSave(save: GameSave): Promise<unknown>;
  runProjectSaveTransaction<T>(operation: () => Promise<T>): Promise<T>;
}

type PreparedImport = Extract<PreparedProjectImport, { ok: true }>;

export type ProjectImportPersistenceResult =
  | {
      ok: true;
      kind: PreparedImport["kind"];
    }
  | {
      ok: false;
      code: "import_conflict";
      conflicts: ImportConflict[];
    }
  | {
      ok: false;
      code: "storage_conflict";
      conflicts: ImportConflict[];
    }
  | {
      ok: false;
      code: "storage_failure";
    };

const dexieProjectImportPersistence: ProjectImportPersistence = {
  async getProject(id) {
    return db.projects.get(id);
  },
  async getSave(id) {
    return db.saves.get(id);
  },
  async addProject(project) {
    await db.projects.add(project);
  },
  async addSave(save) {
    await db.saves.add(save);
  },
  async runProjectSaveTransaction(operation) {
    return db.transaction("rw", db.projects, db.saves, operation);
  },
};

function isConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "ConstraintError"
  );
}

class ImportStorageConflictError extends Error {
  readonly conflicts: ImportConflict[];

  constructor(conflicts: ImportConflict[]) {
    super("import storage conflict");
    this.name = "ImportStorageConflictError";
    this.conflicts = conflicts;
  }
}

export async function persistPreparedProjectImport(
  prepared: PreparedImport,
  persistence: ProjectImportPersistence = dexieProjectImportPersistence,
): Promise<ProjectImportPersistenceResult> {
  if (prepared.conflicts.length > 0) {
    return {
      ok: false,
      code: "import_conflict",
      conflicts: prepared.conflicts,
    };
  }

  try {
    await persistence.runProjectSaveTransaction(async () => {
      const conflicts: ImportConflict[] = [];
      if ((await persistence.getProject(prepared.project.id)) !== undefined) {
        conflicts.push({
          code: "project_id_conflict",
          entityId: prepared.project.id,
        });
      }
      if (
        prepared.kind === "game_bundle" &&
        (await persistence.getSave(prepared.save.id)) !== undefined
      ) {
        conflicts.push({
          code: "save_id_conflict",
          entityId: prepared.save.id,
        });
      }
      if (conflicts.length > 0) {
        throw new ImportStorageConflictError(conflicts);
      }

      try {
        await persistence.addProject(prepared.project);
      } catch (error) {
        if (isConstraintError(error)) {
          throw new ImportStorageConflictError([
            {
              code: "project_id_conflict",
              entityId: prepared.project.id,
            },
          ]);
        }
        throw error;
      }

      if (prepared.kind === "game_bundle") {
        try {
          await persistence.addSave(prepared.save);
        } catch (error) {
          if (isConstraintError(error)) {
            throw new ImportStorageConflictError([
              {
                code: "save_id_conflict",
                entityId: prepared.save.id,
              },
            ]);
          }
          throw error;
        }
      }
    });
  } catch (error) {
    if (error instanceof ImportStorageConflictError) {
      return {
        ok: false,
        code: "storage_conflict",
        conflicts: error.conflicts,
      };
    }
    return {
      ok: false,
      code: "storage_failure",
    };
  }

  return { ok: true, kind: prepared.kind };
}
