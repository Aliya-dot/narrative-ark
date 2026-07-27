import { prepareGameProject, type ProjectDataIssue } from "./project-migration";
import { ensureSettingsVersions } from "./settings-version";
import type { GameProject } from "./types";

export type ProjectListFailure = {
  index: number;
  code: "legacy_project_incompatible" | "project_schema_invalid";
  issues: ProjectDataIssue[];
};

export type ProjectListLoadResult = {
  projects: GameProject[];
  failures: ProjectListFailure[];
};

export function prepareProjectList(
  storedProjects: readonly unknown[],
): ProjectListLoadResult {
  const projects: GameProject[] = [];
  const failures: ProjectListFailure[] = [];

  storedProjects.forEach((storedProject, index) => {
    const prepared = prepareGameProject(structuredClone(storedProject));
    if (!prepared.success) {
      failures.push({
        index,
        code: prepared.code,
        issues: prepared.issues,
      });
      return;
    }
    projects.push(ensureSettingsVersions(prepared.data));
  });

  return { projects, failures };
}

export async function loadProjectList(
  readProjects: () => Promise<readonly unknown[]>,
): Promise<ProjectListLoadResult> {
  return prepareProjectList(await readProjects());
}
