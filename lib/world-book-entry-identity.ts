export type WorldBookEntryIdentityRepair = {
  originalId: string;
  replacementId: string;
  index: number;
};

const MAX_ENTRY_ID_LENGTH = 160;

function replacementId(originalId: string, occurrence: number) {
  const suffix = `~${occurrence}`;
  const base = originalId.slice(0, MAX_ENTRY_ID_LENGTH - suffix.length);
  return `${base}${suffix}`;
}

/**
 * Keeps every card while repairing duplicate primary keys deterministically.
 * The first occurrence retains the old ID so existing relations keep their
 * historical target; later occurrences receive a stable numeric suffix.
 */
export function ensureUniqueWorldBookEntryIds<T extends { id: string }>(
  entries: T[],
): { entries: T[]; repairs: WorldBookEntryIdentityRepair[] } {
  const reservedOriginalIds = new Set(entries.map((entry) => entry.id));
  const used = new Set<string>();
  const nextOccurrence = new Map<string, number>();
  const repairs: WorldBookEntryIdentityRepair[] = [];
  const repairedEntries = entries.map((entry, index) => {
    if (!used.has(entry.id)) {
      used.add(entry.id);
      nextOccurrence.set(entry.id, 2);
      return entry;
    }
    let occurrence = nextOccurrence.get(entry.id) || 2;
    let candidate = replacementId(entry.id, occurrence);
    while (used.has(candidate) || reservedOriginalIds.has(candidate)) {
      occurrence += 1;
      candidate = replacementId(entry.id, occurrence);
    }
    nextOccurrence.set(entry.id, occurrence + 1);
    used.add(candidate);
    repairs.push({ originalId: entry.id, replacementId: candidate, index });
    return { ...entry, id: candidate };
  });
  return { entries: repairedEntries, repairs };
}
