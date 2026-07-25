import { ensureSettingsVersions } from "./settings-version";
import { prepareGameProject, type ProjectDataIssue } from "./project-migration";
import type { GameProject } from "./types";

export type PlayProjectLoadErrorCode =
  | "project_not_found"
  | "legacy_project_incompatible"
  | "project_schema_invalid"
  | "project_route_mismatch"
  | "project_storage_failed";

export type PlayProjectLoadResult =
  | { ok: true; value: GameProject }
  | {
      ok: false;
      code: PlayProjectLoadErrorCode;
      issues?: ProjectDataIssue[];
    };

export async function loadProjectForPlay({
  routeProjectId,
  readProject,
}: {
  routeProjectId: string;
  readProject: (projectId: string) => Promise<unknown | undefined>;
}): Promise<PlayProjectLoadResult> {
  let storedProject: unknown | undefined;
  try {
    storedProject = await readProject(routeProjectId);
  } catch {
    return { ok: false, code: "project_storage_failed" };
  }
  if (storedProject === undefined) {
    return { ok: false, code: "project_not_found" };
  }

  const prepared = prepareGameProject(storedProject);
  if (!prepared.success) {
    return {
      ok: false,
      code: prepared.code,
      issues: prepared.issues,
    };
  }
  if (prepared.data.id !== routeProjectId) {
    return { ok: false, code: "project_route_mismatch" };
  }

  return { ok: true, value: ensureSettingsVersions(prepared.data) };
}

export function formatPlayProjectLoadFailure(code: PlayProjectLoadErrorCode) {
  switch (code) {
    case "project_not_found":
      return "项目记录不存在。";
    case "legacy_project_incompatible":
      return "历史项目无法兼容迁移。";
    case "project_schema_invalid":
      return "项目结构校验失败。";
    case "project_route_mismatch":
      return "项目与当前地址不匹配。";
    default:
      return "项目加载失败。";
  }
}
