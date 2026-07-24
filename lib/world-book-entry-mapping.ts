import type { WorldBookEntry } from "./types";

export type WorldBookMappingErrorCode =
  | "blank_entry_id"
  | "duplicate_entry_id"
  | "dangling_related_entry"
  | "dangling_relation_target"
  | "blank_generated_world_book_id"
  | "blank_generated_entry_id"
  | "duplicate_generated_entry_id"
  | "reused_generated_entry_id"
  | "remapped_entry_verification_failed"
  | "remapped_relation_verification_failed";

export type WorldBookMappingError = {
  code: WorldBookMappingErrorCode;
  path: string;
  entryId?: string;
  targetId?: string;
  duplicateOfPath?: string;
};

export type RemapWorldBookEntriesResult =
  | {
      ok: true;
      worldBookId: string;
      entries: WorldBookEntry[];
      idMap: Map<string, string>;
    }
  | {
      ok: false;
      errors: WorldBookMappingError[];
    };

type RemapWorldBookEntriesOptions = {
  entries: readonly WorldBookEntry[];
  createWorldBookId: () => string;
  createEntryId: (entry: WorldBookEntry, index: number) => string;
};

function validateSourceEntries(
  entries: readonly WorldBookEntry[],
): WorldBookMappingError[] {
  const errors: WorldBookMappingError[] = [];
  const firstPathById = new Map<string, string>();

  entries.forEach((entry, entryIndex) => {
    const path = `entries[${entryIndex}].id`;
    if (!entry.id.trim()) {
      errors.push({ code: "blank_entry_id", path });
      return;
    }
    const duplicateOfPath = firstPathById.get(entry.id);
    if (duplicateOfPath) {
      errors.push({
        code: "duplicate_entry_id",
        path,
        entryId: entry.id,
        duplicateOfPath,
      });
      return;
    }
    firstPathById.set(entry.id, path);
  });

  const sourceIds = new Set(firstPathById.keys());
  entries.forEach((entry, entryIndex) => {
    entry.relatedEntryIds.forEach((targetId, relatedIndex) => {
      if (!sourceIds.has(targetId)) {
        errors.push({
          code: "dangling_related_entry",
          path: `entries[${entryIndex}].relatedEntryIds[${relatedIndex}]`,
          entryId: entry.id,
          targetId,
        });
      }
    });
    entry.relations?.forEach((relation, relationIndex) => {
      if (!sourceIds.has(relation.targetEntryId)) {
        errors.push({
          code: "dangling_relation_target",
          path: `entries[${entryIndex}].relations[${relationIndex}].targetEntryId`,
          entryId: entry.id,
          targetId: relation.targetEntryId,
        });
      }
    });
  });

  return errors;
}

/**
 * Validates a complete source set, creates every ID exactly once, then rewrites
 * both legacy and canonical internal relations without mutating the source.
 */
export function remapWorldBookEntries({
  entries,
  createWorldBookId,
  createEntryId,
}: RemapWorldBookEntriesOptions): RemapWorldBookEntriesResult {
  const sourceErrors = validateSourceEntries(entries);
  if (sourceErrors.length) return { ok: false, errors: sourceErrors };

  const worldBookId = createWorldBookId();
  if (!worldBookId.trim()) {
    return {
      ok: false,
      errors: [
        {
          code: "blank_generated_world_book_id",
          path: "worldBook.id",
        },
      ],
    };
  }

  const sourceIds = new Set(entries.map((entry) => entry.id));
  const generatedIds = new Set<string>();
  const idMap = new Map<string, string>();
  const generatedErrors: WorldBookMappingError[] = [];

  entries.forEach((entry, index) => {
    const generatedId = createEntryId(entry, index);
    const path = `entries[${index}].id`;
    if (!generatedId.trim()) {
      generatedErrors.push({
        code: "blank_generated_entry_id",
        path,
        entryId: entry.id,
      });
    } else if (generatedIds.has(generatedId)) {
      generatedErrors.push({
        code: "duplicate_generated_entry_id",
        path,
        entryId: entry.id,
        targetId: generatedId,
      });
    } else if (sourceIds.has(generatedId)) {
      generatedErrors.push({
        code: "reused_generated_entry_id",
        path,
        entryId: entry.id,
        targetId: generatedId,
      });
    }
    generatedIds.add(generatedId);
    idMap.set(entry.id, generatedId);
  });

  if (generatedErrors.length) return { ok: false, errors: generatedErrors };

  const remappedEntries = entries.map((entry) => {
    const clone = structuredClone(entry);
    return {
      ...clone,
      id: idMap.get(entry.id)!,
      worldBookId,
      relatedEntryIds: clone.relatedEntryIds.map(
        (targetId) => idMap.get(targetId)!,
      ),
      relations: clone.relations?.map((relation) => ({
        ...relation,
        targetEntryId: idMap.get(relation.targetEntryId)!,
      })),
    };
  });

  const remappedIds = new Set(remappedEntries.map((entry) => entry.id));
  const verificationErrors: WorldBookMappingError[] = [];
  remappedEntries.forEach((entry, entryIndex) => {
    if (
      entry.worldBookId !== worldBookId ||
      entry.id !== idMap.get(entries[entryIndex].id)
    ) {
      verificationErrors.push({
        code: "remapped_entry_verification_failed",
        path: `entries[${entryIndex}]`,
        entryId: entry.id,
      });
    }
    entry.relatedEntryIds.forEach((targetId, relatedIndex) => {
      if (!remappedIds.has(targetId)) {
        verificationErrors.push({
          code: "remapped_relation_verification_failed",
          path: `entries[${entryIndex}].relatedEntryIds[${relatedIndex}]`,
          entryId: entry.id,
          targetId,
        });
      }
    });
    entry.relations?.forEach((relation, relationIndex) => {
      if (!remappedIds.has(relation.targetEntryId)) {
        verificationErrors.push({
          code: "remapped_relation_verification_failed",
          path: `entries[${entryIndex}].relations[${relationIndex}].targetEntryId`,
          entryId: entry.id,
          targetId: relation.targetEntryId,
        });
      }
    });
  });
  if (verificationErrors.length) {
    return { ok: false, errors: verificationErrors };
  }

  return { ok: true, worldBookId, entries: remappedEntries, idMap };
}

export function formatWorldBookMappingErrors(
  errors: readonly WorldBookMappingError[],
): string {
  return errors
    .map((error) => {
      const identifiers = [
        error.entryId ? `entry=${error.entryId}` : "",
        error.targetId ? `target=${error.targetId}` : "",
        error.duplicateOfPath ? `first=${error.duplicateOfPath}` : "",
      ].filter(Boolean);
      return `${error.code} at ${error.path}${identifiers.length ? ` (${identifiers.join(", ")})` : ""}`;
    })
    .join("; ");
}
