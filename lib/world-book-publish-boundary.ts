import type {
  WorldBook,
  WorldBookEntry,
  WorldBookVersion,
} from "./types";
import { parseWorldBookBundle } from "./world-book";
import {
  validateWorldBook,
  type WorldBookIssue,
} from "./world-book-validation";

export type WorldBookRevision = {
  currentVersionId: string | null;
  versionNumber: number;
};

export interface WorldBookPublishRecords {
  getWorldBook(id: string): Promise<WorldBook | undefined>;
  listEntryIds(worldBookId: string): Promise<string[]>;
  deleteEntries(ids: string[]): Promise<unknown>;
  putEntries(entries: WorldBookEntry[]): Promise<unknown>;
  addVersion(version: WorldBookVersion): Promise<unknown>;
  putWorldBook(book: WorldBook): Promise<unknown>;
}

export interface WorldBookPublishStorage {
  transaction<T>(
    operation: (records: WorldBookPublishRecords) => Promise<T>,
  ): Promise<T>;
}

export type WorldBookPublishFailure =
  | {
      ok: false;
      code: "worldbook_validation_failed";
      issues: WorldBookIssue[];
    }
  | {
      ok: false;
      code:
        | "worldbook_not_found"
        | "worldbook_id_mismatch"
        | "worldbook_conflict"
        | "worldbook_version_conflict"
        | "worldbook_storage_failed";
    };

export type WorldBookPublishResult =
  | {
      ok: true;
      book: WorldBook;
      entries: WorldBookEntry[];
      version: WorldBookVersion;
      revision: WorldBookRevision;
    }
  | WorldBookPublishFailure;

class VersionConflictError extends Error {}

function failure(
  code:
    | "worldbook_not_found"
    | "worldbook_id_mismatch"
    | "worldbook_conflict"
    | "worldbook_version_conflict"
    | "worldbook_storage_failed",
): WorldBookPublishFailure {
  return { ok: false, code };
}

function validRevision(revision: WorldBookRevision): boolean {
  if (!Number.isInteger(revision.versionNumber) || revision.versionNumber < 0)
    return false;
  if (revision.versionNumber === 0)
    return revision.currentVersionId === null;
  return (
    typeof revision.currentVersionId === "string" &&
    revision.currentVersionId.trim().length > 0
  );
}

function defaultVersionId(worldBookId: string, versionNumber: number): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${worldBookId}:v${versionNumber}:${suffix}`;
}

function prepareCandidate(
  worldBookId: string,
  candidateBook: unknown,
  candidateEntries: unknown,
):
  | {
      ok: true;
      book: WorldBook;
      entries: WorldBookEntry[];
    }
  | WorldBookPublishFailure {
  if (
    typeof candidateBook !== "object" ||
    candidateBook === null ||
    !("id" in candidateBook) ||
    candidateBook.id !== worldBookId
  ) {
    return failure("worldbook_id_mismatch");
  }
  if (!Array.isArray(candidateEntries)) {
    return {
      ok: false,
      code: "worldbook_validation_failed",
      issues: [],
    };
  }
  if (
    candidateEntries.some(
      (entry) =>
        typeof entry !== "object" ||
        entry === null ||
        !("worldBookId" in entry) ||
        entry.worldBookId !== worldBookId,
    )
  ) {
    return failure("worldbook_id_mismatch");
  }
  const ids = candidateEntries.map((entry) =>
    typeof entry === "object" && entry !== null && "id" in entry
      ? entry.id
      : undefined,
  );
  if (
    ids.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(ids).size !== ids.length
  ) {
    return {
      ok: false,
      code: "worldbook_validation_failed",
      issues: [],
    };
  }

  try {
    const parsed = parseWorldBookBundle({
      format: "narrative-ark-world-book",
      version: 1,
      exportedAt: "publish-validation",
      worldBook: candidateBook,
      entries: candidateEntries,
    });
    const issues = validateWorldBook(parsed.worldBook, parsed.entries).filter(
      (issue) => issue.severity === "error",
    );
    if (issues.length > 0) {
      return {
        ok: false,
        code: "worldbook_validation_failed",
        issues,
      };
    }
    return {
      ok: true,
      book: parsed.worldBook,
      entries: parsed.entries,
    };
  } catch {
    return {
      ok: false,
      code: "worldbook_validation_failed",
      issues: [],
    };
  }
}

export async function publishWorldBook({
  worldBookId,
  expectedRevision,
  candidateBook,
  candidateEntries,
  note,
  storage,
  createVersionId = defaultVersionId,
  now = () => new Date().toISOString(),
}: {
  worldBookId: string;
  expectedRevision: WorldBookRevision;
  candidateBook: unknown;
  candidateEntries: unknown;
  note?: string;
  storage: WorldBookPublishStorage;
  createVersionId?: (worldBookId: string, versionNumber: number) => string;
  now?: () => string;
}): Promise<WorldBookPublishResult> {
  if (
    !expectedRevision ||
    !validRevision(expectedRevision)
  ) {
    return failure("worldbook_conflict");
  }
  const prepared = prepareCandidate(
    worldBookId,
    candidateBook,
    candidateEntries,
  );
  if (!prepared.ok) return prepared;

  try {
    return await storage.transaction(async (records) => {
      const current = await records.getWorldBook(worldBookId);
      if (!current && expectedRevision.versionNumber > 0)
        return failure("worldbook_not_found");
      if (
        current &&
        (expectedRevision.versionNumber === 0 ||
          current.currentVersionId !== expectedRevision.currentVersionId ||
          current.versionNumber !== expectedRevision.versionNumber)
      ) {
        return failure("worldbook_conflict");
      }
      if (!current && expectedRevision.currentVersionId !== null)
        return failure("worldbook_conflict");
      if (current?.id !== undefined && current.id !== worldBookId)
        return failure("worldbook_id_mismatch");

      const versionNumber = current ? current.versionNumber + 1 : 1;
      const versionId = createVersionId(worldBookId, versionNumber);
      if (!versionId.trim()) return failure("worldbook_version_conflict");
      const timestamp = now();
      const entries = prepared.entries.map((entry) => structuredClone(entry));
      const version: WorldBookVersion = {
        id: versionId,
        worldBookId,
        versionNumber,
        note: note?.trim() || (current ? "发布世界书更新" : "创建世界书"),
        createdAt: timestamp,
        snapshot: {
          coreSummary: prepared.book.coreSummary,
          entries: structuredClone(entries),
        },
      };
      const book: WorldBook = {
        ...structuredClone(prepared.book),
        status: "published",
        currentVersionId: versionId,
        versionNumber,
        updatedAt: timestamp,
        entryIds: entries.map((entry) => entry.id),
        coreSummaryStatus: prepared.book.coreSummary ? "current" : "empty",
      };

      const storedIds = current
        ? await records.listEntryIds(worldBookId)
        : [];
      const currentIds = new Set(entries.map((entry) => entry.id));
      await records.deleteEntries(
        storedIds.filter((entryId) => !currentIds.has(entryId)),
      );
      if (entries.length > 0) await records.putEntries(entries);
      try {
        await records.addVersion(version);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "ConstraintError" ||
            error.name === "VersionConflictError")
        ) {
          throw new VersionConflictError();
        }
        throw error;
      }
      await records.putWorldBook(book);
      return {
        ok: true,
        book,
        entries,
        version,
        revision: {
          currentVersionId: version.id,
          versionNumber: version.versionNumber,
        },
      };
    });
  } catch (error) {
    return error instanceof VersionConflictError
      ? failure("worldbook_version_conflict")
      : failure("worldbook_storage_failed");
  }
}

export async function cleanupPublishedWorldBookDraft(
  deleteDraft: () => Promise<unknown>,
): Promise<"clean" | "failed"> {
  try {
    await deleteDraft();
    return "clean";
  } catch {
    return "failed";
  }
}

export function formatWorldBookPublishFailure(
  result: WorldBookPublishFailure,
): string {
  switch (result.code) {
    case "worldbook_not_found":
      return "世界书已不存在，本次发布未写入。";
    case "worldbook_id_mismatch":
      return "世界书或资料卡归属不匹配，本次发布未写入。";
    case "worldbook_validation_failed":
      return "世界书校验失败，请修正资料卡后再发布。";
    case "worldbook_conflict":
      return "世界书已在其他页面更新，请重新加载并检查最新版本；当前草稿尚未正式发布。";
    case "worldbook_version_conflict":
      return "世界书版本记录发生冲突，本次发布未写入。";
    case "worldbook_storage_failed":
      return "世界书正式发布事务失败，本次发布未写入。";
  }
}
