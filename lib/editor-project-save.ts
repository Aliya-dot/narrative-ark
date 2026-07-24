import {
  validateProjectIntegrity,
  type ProjectIntegrityIssue,
} from "./project-integrity";
import type { GameProject } from "./types";

type MaybePromise = void | PromiseLike<unknown>;

export type EditorProjectSaveResult =
  | { ok: true }
  | {
      ok: false;
      reason: "integrity";
      issues: ProjectIntegrityIssue[];
    };

export async function saveEditorProject({
  project,
  saveProject,
}: {
  project: GameProject;
  saveProject: (project: GameProject) => MaybePromise;
}): Promise<EditorProjectSaveResult> {
  const issues = validateProjectIntegrity(project);
  if (issues.length > 0) {
    return { ok: false, reason: "integrity", issues };
  }

  await saveProject(project);
  return { ok: true };
}
