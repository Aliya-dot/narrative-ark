import {
  validateProjectIntegrity,
  type ProjectIntegrityIssue,
} from "./project-integrity";
import type { GameProject } from "./types";

export { formatProjectIntegrityFailure } from "./project-integrity-summary";

type MaybePromise = void | PromiseLike<unknown>;

export type GeneratedProjectFinalizationResult =
  | { ok: true }
  | { ok: false; issues: ProjectIntegrityIssue[] };

export type GeneratedProjectFinalizationOptions = {
  project: GameProject;
  saveLatestDraft: () => MaybePromise;
  saveProject: (project: GameProject) => MaybePromise;
  deleteDraft: () => MaybePromise;
};

export class GeneratedProjectDraftCleanupError extends Error {
  readonly projectSaved = true;

  constructor(cause: unknown) {
    super("项目已保存，但生成草稿清理失败；可以重试清理。", { cause });
    this.name = "GeneratedProjectDraftCleanupError";
  }
}

export async function finalizeGeneratedProject({
  project,
  saveLatestDraft,
  saveProject,
  deleteDraft,
}: GeneratedProjectFinalizationOptions): Promise<GeneratedProjectFinalizationResult> {
  await saveLatestDraft();

  const issues = validateProjectIntegrity(project);
  if (issues.length > 0) return { ok: false, issues };

  await saveProject(project);

  try {
    await deleteDraft();
  } catch (error) {
    throw new GeneratedProjectDraftCleanupError(error);
  }

  return { ok: true };
}
