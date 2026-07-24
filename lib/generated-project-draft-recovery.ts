import { GeneratedProjectDraftCleanupError } from "./generated-project-finalization";

export type GenerationFailure =
  | { kind: "generation_failed"; message: string }
  | {
      kind: "draft_cleanup_failed";
      message: string;
      projectId: string;
      projectSaved: true;
    };

export type GenerationFailureAction =
  | "retry_generation"
  | "retry_draft_cleanup"
  | "enter_saved_project";

export function classifyGenerationFailure(
  error: unknown,
  projectId: string,
): GenerationFailure {
  if (error instanceof GeneratedProjectDraftCleanupError) {
    return {
      kind: "draft_cleanup_failed",
      message:
        "项目已经保存，但生成草稿清理失败。你可以重试清理，或直接进入已保存的项目。",
      projectId,
      projectSaved: true,
    };
  }
  return {
    kind: "generation_failed",
    message: error instanceof Error ? error.message : "项目最终保存失败",
  };
}

export function retainSavedProjectCleanupFailure(
  projectId: string,
): GenerationFailure {
  return {
    kind: "draft_cleanup_failed",
    message:
      "项目仍已安全保存，但生成草稿清理再次失败。你可以继续重试清理，或直接进入已保存的项目。",
    projectId,
    projectSaved: true,
  };
}

export function availableGenerationFailureActions(
  failure: GenerationFailure,
): readonly GenerationFailureAction[] {
  return failure.kind === "draft_cleanup_failed"
    ? ["retry_draft_cleanup", "enter_saved_project"]
    : ["retry_generation"];
}

type RetryDraftCleanupOptions = {
  draftId: string;
  deleteDraft: (draftId: string) => void | PromiseLike<unknown>;
  enterSavedProject: () => void;
};

export async function retryGeneratedProjectDraftCleanup({
  draftId,
  deleteDraft,
  enterSavedProject,
}: RetryDraftCleanupOptions): Promise<void> {
  await deleteDraft(draftId);
  enterSavedProject();
}

export function enterGeneratedProject(
  projectId: string,
  navigate: (href: string) => void,
): void {
  navigate(`/editor/${projectId}`);
}
