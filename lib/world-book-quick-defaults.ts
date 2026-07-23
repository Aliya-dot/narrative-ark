import type {
  WorldBookEntry,
  WorldBookEntryActivationMode,
  WorldBookEntryCategory,
  WorldBookEntryVisibility,
} from "./types";
import { withWorldBookActivationMode } from "./world-book";
import {
  normalizeWorldBookEntryTriggers,
  refreshAutoWorldBookTriggers,
} from "./world-book-triggers";

export type WorldBookQuickDefaults = {
  activationModeByCategory: Record<
    WorldBookEntryCategory,
    WorldBookEntryActivationMode
  >;
  priorityByCategory: Record<WorldBookEntryCategory, number>;
  defaultVisibility: WorldBookEntryVisibility;
  allowTemporaryInference: boolean;
};

const categories = [
  "core_rule",
  "history",
  "timeline",
  "location",
  "faction",
  "character",
  "race",
  "religion",
  "magic",
  "technology",
  "creature",
  "item",
  "culture",
  "language",
  "economy",
  "custom",
] as const;
export const WORLD_BOOK_QUICK_DEFAULTS: WorldBookQuickDefaults = {
  activationModeByCategory: Object.fromEntries(
    categories.map((category) => [
      category,
      category === "core_rule" ? "core_rule" : "conditional",
    ]),
  ) as WorldBookQuickDefaults["activationModeByCategory"],
  priorityByCategory: Object.fromEntries(
    categories.map((category) => [
      category,
      category === "core_rule"
        ? 90
        : ["character", "location", "faction", "magic", "technology"].includes(
              category,
            )
          ? 60
          : 50,
    ]),
  ) as WorldBookQuickDefaults["priorityByCategory"],
  defaultVisibility: "player_visible",
  allowTemporaryInference: true,
};

export function applyWorldBookQuickDefaults(
  entry: WorldBookEntry,
): WorldBookEntry {
  const mode =
    WORLD_BOOK_QUICK_DEFAULTS.activationModeByCategory[entry.category];
  return refreshAutoWorldBookTriggers(withWorldBookActivationMode(
    {
      ...normalizeWorldBookEntryTriggers(entry),
      priority: WORLD_BOOK_QUICK_DEFAULTS.priorityByCategory[entry.category],
      visibility:
        entry.visibility || WORLD_BOOK_QUICK_DEFAULTS.defaultVisibility,
      allowAiExpansion:
        mode === "core_rule"
          ? false
          : WORLD_BOOK_QUICK_DEFAULTS.allowTemporaryInference,
      activeRegions: [],
      activePeriods: [],
      locked: entry.locked ?? false,
    },
    mode,
  ));
}

export function updateQuickEntryTitle(
  entry: WorldBookEntry,
  title: string,
): WorldBookEntry {
  return refreshAutoWorldBookTriggers({ ...entry, title });
}
