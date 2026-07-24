import {
  validateProjectIntegrity,
  type ProjectIntegrityIssue,
} from "./project-integrity";
import type { GameProject } from "./types";

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

function formatId(label: "entityId" | "relatedId", value?: string): string {
  if (value === undefined) return "";
  const limit = 80;
  const bounded = value.slice(0, limit);
  const suffix = value.length > limit ? "…" : "";
  return ` ${label}=${JSON.stringify(`${bounded}${suffix}`)}`;
}

export function formatProjectIntegrityFailure(
  issues: readonly ProjectIntegrityIssue[],
): string {
  const visibleLimit = 3;
  const visible = issues.slice(0, visibleLimit).map(
    (issue) =>
      `${issue.code} @ ${issue.path}${formatId("entityId", issue.entityId)}${formatId("relatedId", issue.relatedId)}`,
  );
  const remaining =
    issues.length > visibleLimit ? `；另有 ${issues.length - visibleLimit} 项` : "";
  return `项目完整性检查未通过（${issues.length} 项）：${visible.join("；")}${remaining}`;
}
