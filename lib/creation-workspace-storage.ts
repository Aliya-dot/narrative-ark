import type { CreationDraftMeta, GenerationDraft } from "./types";

export interface CreationDraftStorage {
  put(record: {
    id: string;
    value: unknown;
    updatedAt: string;
  }): PromiseLike<unknown>;
}

export interface CreationDraftReplacementStorage extends CreationDraftStorage {
  delete(id: string): PromiseLike<unknown>;
}

export function creationWorkspaceRecord<FormSnapshot>(
  form: FormSnapshot,
  meta: CreationDraftMeta,
  updatedAt: string,
) {
  return {
    id: "creation",
    value: {
      kind: "creation-workspace-v1" as const,
      form,
      meta,
    },
    updatedAt,
  };
}

export async function saveCreationWorkspace<FormSnapshot>(
  storage: CreationDraftStorage,
  form: FormSnapshot,
  meta: CreationDraftMeta,
  updatedAt = new Date().toISOString(),
) {
  try {
    await storage.put(creationWorkspaceRecord(form, meta, updatedAt));
    return { ok: true as const };
  } catch {
    return { ok: false as const, code: "draft_storage_failed" as const };
  }
}

export async function replaceCreationWorkspace(
  storage: CreationDraftReplacementStorage,
  generationId: string,
  form: GenerationDraft,
  updatedAt = new Date().toISOString(),
) {
  await storage.put({
    id: generationId,
    value: form,
    updatedAt,
  });
  await storage.delete("creation");
}
