import {
  safeParseGameProject,
  type DataValidationIssue,
} from "./data-schemas";
import {
  validateProjectIntegrity,
  type ProjectIntegrityIssue,
} from "./project-integrity";
import type { GameProject } from "./types";

export interface EditorProjectRecordStore {
  get(id: string): Promise<unknown | undefined>;
  put(project: GameProject): Promise<unknown>;
}

export interface EditorProjectStorage {
  transaction<T>(
    operation: (records: EditorProjectRecordStore) => Promise<T>,
  ): Promise<T>;
}

export type EditorProjectSaveResult =
  | { ok: true; value: GameProject }
  | {
      ok: false;
      code: "project_schema_invalid";
      issues: DataValidationIssue[];
    }
  | {
      ok: false;
      code: "project_integrity_failed";
      issues: ProjectIntegrityIssue[];
    }
  | {
      ok: false;
      code:
        | "project_not_found"
        | "project_id_mismatch"
        | "project_conflict"
        | "project_storage_failed";
    };

function failure(
  code:
    | "project_not_found"
    | "project_id_mismatch"
    | "project_conflict"
    | "project_storage_failed",
): EditorProjectSaveResult {
  return { ok: false, code };
}

export function validateEditorProject(
  project: unknown,
):
  | { ok: true; value: GameProject }
  | Extract<
      EditorProjectSaveResult,
      {
        ok: false;
        code: "project_schema_invalid" | "project_integrity_failed";
      }
    > {
  const parsed = safeParseGameProject(project);
  if (!parsed.success) {
    return {
      ok: false,
      code: "project_schema_invalid",
      issues: parsed.issues,
    };
  }
  const issues = validateProjectIntegrity(parsed.data);
  if (issues.length > 0) {
    return {
      ok: false,
      code: "project_integrity_failed",
      issues,
    };
  }
  return { ok: true, value: parsed.data };
}

export async function saveEditorProject({
  routeProjectId,
  expectedVersion,
  project,
  storage,
}: {
  routeProjectId: string;
  expectedVersion: number;
  project: unknown;
  storage: EditorProjectStorage;
}): Promise<EditorProjectSaveResult> {
  if (
    typeof project === "object" &&
    project !== null &&
    "id" in project &&
    project.id !== routeProjectId
  ) {
    return failure("project_id_mismatch");
  }
  if (
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    return failure("project_conflict");
  }

  const validated = validateEditorProject(project);
  if (!validated.ok) return validated;
  const candidate = validated.value;
  if (candidate.id !== routeProjectId) {
    return failure("project_id_mismatch");
  }
  if (candidate.version !== expectedVersion + 1) {
    return failure("project_conflict");
  }

  try {
    return await storage.transaction(async (records) => {
      const stored = await records.get(routeProjectId);
      if (stored === undefined) return failure("project_not_found");
      const current = safeParseGameProject(stored);
      if (!current.success) return failure("project_storage_failed");
      if (
        current.data.id !== routeProjectId ||
        candidate.id !== current.data.id
      ) {
        return failure("project_id_mismatch");
      }
      if (current.data.version !== expectedVersion) {
        return failure("project_conflict");
      }
      await records.put(candidate);
      return { ok: true, value: candidate };
    });
  } catch {
    return failure("project_storage_failed");
  }
}

export function formatEditorProjectSaveFailure(
  result: Extract<EditorProjectSaveResult, { ok: false }>,
): string {
  switch (result.code) {
    case "project_not_found":
      return "项目已不存在，未保存当前修改。";
    case "project_id_mismatch":
      return "项目与当前编辑地址不匹配，未保存当前修改。";
    case "project_schema_invalid": {
      const path = result.issues[0]?.pathText;
      return `项目结构校验失败${path ? `（${path}）` : ""}。`;
    }
    case "project_integrity_failed": {
      const path = result.issues[0]?.path;
      return `项目完整性校验失败${path ? `（${path}）` : ""}。`;
    }
    case "project_conflict":
      return "项目已在其他页面更新，请保留当前编辑内容并重新加载后再保存。";
    case "project_storage_failed":
      return "项目保存失败，当前修改尚未写入。";
  }
}
