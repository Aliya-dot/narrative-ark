import { db } from "./db";
import {
  prepareProjectImport,
  type ImportConflict,
  type ImportPreparationError,
} from "./project-import-preparation";
import {
  persistPreparedProjectImport,
  type ProjectImportPersistenceResult,
} from "./project-import-persistence";

export const MAX_PROJECT_IMPORT_BYTES = 10 * 1024 * 1024;

export interface ProjectImportFile {
  readonly size: number;
  text(): Promise<string>;
}

export type ProjectImportSuccess = {
  ok: true;
  kind: "project" | "game_bundle";
  saveTurn?: number;
};

export type ProjectImportFailure =
  | {
      ok: false;
      code:
        | "file_too_large"
        | "invalid_json"
        | "storage_failure";
    }
  | {
      ok: false;
      code: "storage_conflict";
      conflicts: ImportConflict[];
    }
  | {
      ok: false;
      code: "preparation_failed";
      errors: ImportPreparationError[];
    }
  | {
      ok: false;
      code: "import_conflict";
      conflicts: ImportConflict[];
    };

export type ProjectImportExecutionResult =
  ProjectImportSuccess | ProjectImportFailure;

export interface ProjectImportWorkflowDependencies {
  readExistingProjectIds(): Promise<ReadonlySet<string>>;
  readExistingSaveIds(): Promise<ReadonlySet<string>>;
  persist(
    prepared: Extract<ReturnType<typeof prepareProjectImport>, { ok: true }>,
  ): Promise<ProjectImportPersistenceResult>;
}

const productionDependencies: ProjectImportWorkflowDependencies = {
  async readExistingProjectIds() {
    const ids = await db.projects.toCollection().primaryKeys();
    return new Set(ids);
  },
  async readExistingSaveIds() {
    const ids = await db.saves.toCollection().primaryKeys();
    return new Set(ids);
  },
  persist: persistPreparedProjectImport,
};

export async function executeProjectImport(
  file: ProjectImportFile,
  afterCommit: (result: ProjectImportSuccess) => Promise<void> | void,
  dependencies: ProjectImportWorkflowDependencies = productionDependencies,
): Promise<ProjectImportExecutionResult> {
  if (file.size > MAX_PROJECT_IMPORT_BYTES) {
    return { ok: false, code: "file_too_large" };
  }

  let input: unknown;
  try {
    input = JSON.parse(await file.text()) as unknown;
  } catch {
    return { ok: false, code: "invalid_json" };
  }

  const [existingProjectIds, existingSaveIds] = await Promise.all([
    dependencies.readExistingProjectIds(),
    dependencies.readExistingSaveIds(),
  ]);
  const prepared = prepareProjectImport({
    input,
    existingProjectIds,
    existingSaveIds,
  });

  if (!prepared.ok) {
    return {
      ok: false,
      code: "preparation_failed",
      errors: prepared.errors,
    };
  }
  if (prepared.conflicts.length > 0) {
    return {
      ok: false,
      code: "import_conflict",
      conflicts: prepared.conflicts,
    };
  }

  const persistenceResult = await dependencies.persist(prepared);
  if (!persistenceResult.ok) {
    return persistenceResult;
  }

  const success: ProjectImportSuccess = {
    ok: true,
    kind: prepared.kind,
    ...(prepared.kind === "game_bundle"
      ? { saveTurn: prepared.save.turn }
      : {}),
  };
  await afterCommit(success);
  return success;
}

export function formatProjectImportFailure(
  failure: ProjectImportFailure,
): string {
  switch (failure.code) {
    case "file_too_large":
      return "导入文件超过 10 MiB，未读取或写入任何数据。";
    case "invalid_json":
      return "JSON 解析失败，未写入任何数据。";
    case "import_conflict": {
      const ids = failure.conflicts.map(({ entityId }) => entityId).join(", ");
      return `存在相同 ID（${ids}），导入未执行，本地数据没有变化。`;
    }
    case "storage_conflict":
      return `写入时检测到相同 ID（${failure.conflicts
        .map(({ code, entityId }) => `${code}:${entityId}`)
        .join(", ")}），导入未执行，本地数据没有变化。`;
    case "storage_failure":
      return "导入写入失败，未显示成功。";
    case "preparation_failed": {
      const first = failure.errors[0];
      if (!first) return "导入预检失败，未写入任何数据。";
      return `${first.code}${first.path ? `（${first.path}）` : ""}`;
    }
  }
}
