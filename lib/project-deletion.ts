export interface ProjectDeletionStorage {
  deleteProject(projectId: string): Promise<void>;
  deleteProjectSaves(projectId: string): Promise<void>;
  deleteProjectExports(projectId: string): Promise<void>;
}

export async function deleteProjectCascade(
  projectId: string,
  storage: ProjectDeletionStorage,
) {
  if (!projectId.trim()) throw new Error("项目 ID 不能为空");
  await storage.deleteProject(projectId);
  await storage.deleteProjectSaves(projectId);
  await storage.deleteProjectExports(projectId);
}
