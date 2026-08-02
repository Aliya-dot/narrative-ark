import type {
  GameProject,
  WorldBook,
  WorldBookEditorMode,
  WorldBookEntry,
} from "./types";
import { ensureUniqueWorldBookEntryIds } from "./world-book-entry-identity";
import {
  createWorldBook,
  extractWorldBookFromProject,
  normalizeWorldBookEntry,
} from "./world-book";
import type { WorldBookRevision } from "./world-book-publish-boundary";

export type WorldBookEditorDraftValue = {
  kind: "world-book-editor-v1";
  book: WorldBook;
  entries: WorldBookEntry[];
  selectedId: string;
};

export type WorldBookEditorDraftRecord = {
  id: string;
  value: WorldBookEditorDraftValue;
  updatedAt: string;
};

export interface WorldBookEditorStorage {
  getProject(id: string): Promise<GameProject | undefined>;
  getDraft(id: string): Promise<{ value: unknown } | undefined>;
  getWorldBook(id: string): Promise<WorldBook | undefined>;
  getWorldBookEntries(worldBookId: string): Promise<WorldBookEntry[]>;
  putDraft(record: WorldBookEditorDraftRecord): Promise<void>;
  deleteDraft(id: string): Promise<void>;
}

export type WorldBookEditorWorkspace =
  | { kind: "missing" }
  | {
      kind: "ready";
      book: WorldBook;
      entries: WorldBookEntry[];
      selectedId: string;
      revision: WorldBookRevision;
      draftStatus: "clean" | "saved";
      repairedEntryCount: number;
    };

export type DraftSaveResult =
  { ok: true } | { ok: false; code: "draft_storage_failed" };

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

function isWorldBookEditorDraft(
  value: unknown,
): value is WorldBookEditorDraftValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorldBookEditorDraftValue>;
  return (
    candidate.kind === "world-book-editor-v1" &&
    !!candidate.book &&
    Array.isArray(candidate.entries) &&
    typeof candidate.selectedId === "string"
  );
}

export function normalizeWorldBookEditorEntries(entries: WorldBookEntry[]) {
  return ensureUniqueWorldBookEntryIds(
    entries.map((entry) => normalizeWorldBookEntry(entry)),
  );
}

function selectedEntryId(entries: WorldBookEntry[], requestedId: string) {
  return entries.some((entry) => entry.id === requestedId)
    ? requestedId
    : entries[0]?.id || "";
}

function readyWorkspace(
  book: WorldBook,
  entries: WorldBookEntry[],
  selectedId: string,
  revision: WorldBookRevision,
  draftStatus: "clean" | "saved",
): WorldBookEditorWorkspace {
  const normalized = normalizeWorldBookEditorEntries(entries);
  return {
    kind: "ready",
    book: {
      ...book,
      entryIds: normalized.entries.map((entry) => entry.id),
      coreSummaryStatus:
        book.coreSummaryStatus || (book.coreSummary ? "current" : "empty"),
    },
    entries: normalized.entries,
    selectedId: selectedEntryId(normalized.entries, selectedId),
    revision,
    draftStatus,
    repairedEntryCount: normalized.repairs.length,
  };
}

export async function loadWorldBookEditorWorkspace(options: {
  worldBookId: string;
  projectId?: string | null;
  storage: WorldBookEditorStorage;
  createWorldBookId: () => string;
}): Promise<WorldBookEditorWorkspace> {
  const { worldBookId, projectId, storage, createWorldBookId } = options;
  const draftKey = `worldbook:${worldBookId}`;

  if (worldBookId === "new") {
    if (projectId) {
      const project = await storage.getProject(projectId);
      if (project) {
        const extracted = extractWorldBookFromProject(
          project,
          createWorldBookId(),
        );
        return readyWorkspace(
          extracted.book,
          extracted.entries,
          extracted.entries[0]?.id || "",
          {
            currentVersionId: null,
            versionNumber: 0,
            updatedAt: extracted.book.updatedAt,
          },
          "clean",
        );
      }
    }

    const storedDraft = await storage.getDraft(draftKey);
    if (isWorldBookEditorDraft(storedDraft?.value)) {
      return readyWorkspace(
        storedDraft.value.book,
        storedDraft.value.entries,
        storedDraft.value.selectedId,
        {
          currentVersionId: null,
          versionNumber: 0,
          updatedAt: storedDraft.value.book.updatedAt,
        },
        "saved",
      );
    }

    const created = createWorldBook(createWorldBookId());
    return readyWorkspace(
      created.book,
      [],
      "",
      {
        currentVersionId: null,
        versionNumber: 0,
        updatedAt: created.book.updatedAt,
      },
      "clean",
    );
  }

  const [storedBook, storedEntries, storedDraft] = await Promise.all([
    storage.getWorldBook(worldBookId),
    storage.getWorldBookEntries(worldBookId),
    storage.getDraft(draftKey),
  ]);
  if (!storedBook) return { kind: "missing" };

  const revision: WorldBookRevision = {
    currentVersionId: storedBook.currentVersionId,
    versionNumber: storedBook.versionNumber,
    updatedAt: storedBook.updatedAt,
  };
  if (
    isWorldBookEditorDraft(storedDraft?.value) &&
    storedDraft.value.book.id === worldBookId
  ) {
    return readyWorkspace(
      storedDraft.value.book,
      storedDraft.value.entries,
      storedDraft.value.selectedId,
      revision,
      "saved",
    );
  }

  const normalized = normalizeWorldBookEditorEntries(storedEntries);
  const sortedEntries = [...normalized.entries].sort(
    (left, right) => right.priority - left.priority,
  );
  return {
    kind: "ready",
    book: {
      ...storedBook,
      entryIds: sortedEntries.map((entry) => entry.id),
      coreSummaryStatus:
        storedBook.coreSummaryStatus ||
        (storedBook.coreSummary ? "current" : "empty"),
    },
    entries: sortedEntries,
    selectedId: sortedEntries[0]?.id || "",
    revision,
    draftStatus: "clean",
    repairedEntryCount: normalized.repairs.length,
  };
}

export function worldBookEditorDraftRecord(
  id: string,
  book: WorldBook,
  entries: WorldBookEntry[],
  selectedId: string,
  updatedAt: string,
): WorldBookEditorDraftRecord {
  return {
    id,
    value: {
      kind: "world-book-editor-v1",
      book: structuredClone(book),
      entries: structuredClone(entries),
      selectedId,
    },
    updatedAt,
  };
}

export function createSequentialWorldBookDraftSaver(
  storage: Pick<WorldBookEditorStorage, "putDraft">,
) {
  let queue: Promise<void> = Promise.resolve();
  return {
    save(record: WorldBookEditorDraftRecord): Promise<DraftSaveResult> {
      const operation = queue.then(() => storage.putDraft(record));
      queue = operation.catch(() => undefined);
      return operation.then(
        () => ({ ok: true }),
        () => ({ ok: false, code: "draft_storage_failed" }),
      );
    },
  };
}

export function readWorldBookEditorMode(
  storage: Pick<BrowserStorage, "getItem">,
  worldBookId: string,
): WorldBookEditorMode {
  try {
    const stored = storage.getItem(
      `narrative-ark:worldbook-mode:${worldBookId}`,
    );
    if (stored === "quick" || stored === "professional") return stored;
  } catch {
    // The editor remains usable when browser storage is unavailable.
  }
  return worldBookId === "new" ? "quick" : "professional";
}

export function writeWorldBookEditorMode(
  storage: Pick<BrowserStorage, "setItem">,
  worldBookId: string,
  mode: WorldBookEditorMode,
) {
  try {
    storage.setItem(`narrative-ark:worldbook-mode:${worldBookId}`, mode);
    return true;
  } catch {
    return false;
  }
}
