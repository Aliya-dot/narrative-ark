import { db } from "./db";
import type {
  ImportConflict,
  PreparedProjectImport,
} from "./project-import-preparation";
import type { GameProject, GameSave } from "./types";

export interface ProjectImportPersistence {
  addProject(project: GameProject): Promise<unknown>;
  addSave(save: GameSave): Promise<unknown>;
  runProjectSaveTransaction(operation: () => Promise<void>): Promise<void>;
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
      code: "storage_conflict" | "storage_failure";
    };

const dexieProjectImportPersistence: ProjectImportPersistence = {
  async addProject(project) {
    await db.projects.add(project);
  },
  async addSave(save) {
    await db.saves.add(save);
  },
  async runProjectSaveTransaction(operation) {
    await db.transaction("rw", db.projects, db.saves, operation);
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
    if (prepared.kind === "project") {
      await persistence.addProject(prepared.project);
    } else {
      await persistence.runProjectSaveTransaction(async () => {
        await persistence.addProject(prepared.project);
        await persistence.addSave(prepared.save);
      });
    }
  } catch (error) {
    return {
      ok: false,
      code: isConstraintError(error) ? "storage_conflict" : "storage_failure",
    };
  }

  return { ok: true, kind: prepared.kind };
}
