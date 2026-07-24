import { prepareGameSave } from "./save-migration";
import type { GameProject, GameSave } from "./types";

export type ProjectSaveErrorCode =
  | "project_not_found"
  | "project_route_mismatch"
  | "save_not_found"
  | "invalid_save"
  | "save_project_mismatch"
  | "save_id_conflict"
  | "save_storage_failed";

export type ProjectSaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProjectSaveErrorCode };

export interface SaveRecordStore {
  get(id: string): Promise<unknown | undefined>;
  add(save: GameSave): Promise<unknown>;
  put(save: GameSave): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

export interface ProjectSaveStorage extends SaveRecordStore {
  listByProjectId(projectId: string): Promise<unknown[]>;
  transaction<T>(operation: (store: SaveRecordStore) => Promise<T>): Promise<T>;
}

function failure<T>(code: ProjectSaveErrorCode): ProjectSaveResult<T> {
  return { ok: false, code };
}

function isConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "ConstraintError" || error.name === "BulkError")
  );
}

export function resolveSaveForProject({
  projectId,
  save,
}: {
  projectId: string;
  save: unknown | undefined;
}): ProjectSaveResult<GameSave> {
  if (save === undefined) return failure("save_not_found");
  const prepared = prepareGameSave(save);
  if (!prepared.success) return failure("invalid_save");
  if (prepared.data.projectId !== projectId) {
    return failure("save_project_mismatch");
  }
  return { ok: true, value: prepared.data };
}

function resolveProject(
  project: GameProject | undefined,
): ProjectSaveResult<GameProject> {
  if (!project) return failure("project_not_found");
  return { ok: true, value: project };
}

export async function listProjectSaves({
  projectId,
  storage,
}: {
  projectId: string;
  storage: Pick<ProjectSaveStorage, "listByProjectId">;
}): Promise<ProjectSaveResult<GameSave[]>> {
  try {
    const records = await storage.listByProjectId(projectId);
    const saves = records.flatMap((record) => {
      const result = resolveSaveForProject({ projectId, save: record });
      return result.ok ? [result.value] : [];
    });
    saves.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { ok: true, value: saves };
  } catch {
    return failure("save_storage_failed");
  }
}

export async function loadProjectSave({
  routeProjectId,
  project,
  saveId,
  storage,
}: {
  routeProjectId: string;
  project: GameProject | undefined;
  saveId: string;
  storage: Pick<ProjectSaveStorage, "get">;
}): Promise<ProjectSaveResult<GameSave>> {
  const currentProject = resolveProject(project);
  if (!currentProject.ok) return currentProject;
  try {
    const raw = await storage.get(saveId);
    const save = resolveSaveForProject({
      projectId: currentProject.value.id,
      save: raw,
    });
    if (!save.ok) return save;
    if (currentProject.value.id !== routeProjectId) {
      return failure("project_route_mismatch");
    }
    return save;
  } catch {
    return failure("save_storage_failed");
  }
}

export async function loadLatestProjectSave({
  routeProjectId,
  project,
  storage,
}: {
  routeProjectId: string;
  project: GameProject | undefined;
  storage: Pick<ProjectSaveStorage, "listByProjectId">;
}): Promise<ProjectSaveResult<GameSave>> {
  const currentProject = resolveProject(project);
  if (!currentProject.ok) return currentProject;
  try {
    const records = await storage.listByProjectId(currentProject.value.id);
    if (records.length === 0) return failure("save_not_found");
    const newest = [...records].sort((a, b) => {
      const left =
        typeof a === "object" &&
        a !== null &&
        "updatedAt" in a &&
        typeof a.updatedAt === "string"
          ? a.updatedAt
          : "";
      const right =
        typeof b === "object" &&
        b !== null &&
        "updatedAt" in b &&
        typeof b.updatedAt === "string"
          ? b.updatedAt
          : "";
      return right.localeCompare(left);
    })[0];
    const save = resolveSaveForProject({
      projectId: currentProject.value.id,
      save: newest,
    });
    if (!save.ok) return save;
    if (currentProject.value.id !== routeProjectId) {
      return failure("project_route_mismatch");
    }
    return save;
  } catch {
    return failure("save_storage_failed");
  }
}

export async function createProjectSave({
  project,
  save,
  storage,
}: {
  project: GameProject;
  save: GameSave;
  storage: Pick<ProjectSaveStorage, "add">;
}): Promise<ProjectSaveResult<GameSave>> {
  const next = structuredClone(save);
  next.projectId = project.id;
  const prepared = resolveSaveForProject({ projectId: project.id, save: next });
  if (!prepared.ok) return prepared;
  try {
    await storage.add(prepared.value);
    return { ok: true, value: prepared.value };
  } catch (error) {
    return failure(
      isConstraintError(error) ? "save_id_conflict" : "save_storage_failed",
    );
  }
}

export async function updateProjectSave({
  project,
  save,
  storage,
}: {
  project: GameProject;
  save: GameSave;
  storage: Pick<ProjectSaveStorage, "transaction">;
}): Promise<ProjectSaveResult<GameSave>> {
  const next = structuredClone(save);
  try {
    return await storage.transaction(async (records) => {
      const existing = resolveSaveForProject({
        projectId: project.id,
        save: await records.get(next.id),
      });
      if (!existing.ok) return existing;
      if (
        next.id !== existing.value.id ||
        next.projectId !== project.id ||
        next.projectId !== existing.value.projectId
      ) {
        return failure("save_project_mismatch");
      }
      const prepared = resolveSaveForProject({
        projectId: project.id,
        save: next,
      });
      if (!prepared.ok) return prepared;
      await records.put(prepared.value);
      return { ok: true, value: prepared.value };
    });
  } catch {
    return failure("save_storage_failed");
  }
}

export async function deleteProjectSave({
  projectId,
  saveId,
  storage,
}: {
  projectId: string;
  saveId: string;
  storage: Pick<ProjectSaveStorage, "transaction">;
}): Promise<ProjectSaveResult<undefined>> {
  try {
    return await storage.transaction(async (records) => {
      const existing = resolveSaveForProject({
        projectId,
        save: await records.get(saveId),
      });
      if (!existing.ok) return existing;
      await records.delete(existing.value.id);
      return { ok: true, value: undefined };
    });
  } catch {
    return failure("save_storage_failed");
  }
}

export function formatProjectSaveFailure(code: ProjectSaveErrorCode): string {
  switch (code) {
    case "project_not_found":
    case "project_route_mismatch":
      return "项目不存在或当前地址已失效。";
    case "save_not_found":
      return "存档不存在。";
    case "invalid_save":
      return "存档格式无效。";
    case "save_project_mismatch":
      return "存档不属于当前项目。";
    case "save_id_conflict":
      return "存档 ID 冲突，原存档未被覆盖。";
    case "save_storage_failed":
      return "保存失败，请稍后重试。";
  }
}
