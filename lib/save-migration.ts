import {
  gameSaveSchema,
  safeParseGameSave,
  type DataValidationIssue,
} from "./data-schemas";
import type { GameSave } from "./types";

export const CURRENT_GAME_SAVE_SCHEMA_VERSION: null = null;

export interface SaveDataWarning {
  code: string;
  path: Array<string | number>;
  pathText: string;
  message: string;
  fromVersion?: number;
  toVersion?: number;
}

export interface SaveDataIssue {
  code: string;
  stage: "legacy_migration" | "final_validation";
  operation:
    "migrate_legacy_item" | "migrate_legacy_quest" | "validate_game_save";
  path: Array<string | number>;
  pathText: string;
  message: string;
  recoverable: false;
  sourceVersion: null;
  targetVersion: null;
  migrationStep: "legacy_item_fields" | "legacy_quest_fields" | null;
}

export type SavePreparationResult =
  | {
      success: true;
      data: GameSave;
      migrated: boolean;
      normalized: boolean;
      sourceVersion: number | null;
      targetVersion: number | null;
      warnings: SaveDataWarning[];
    }
  | {
      success: false;
      issues: SaveDataIssue[];
      sourceVersion: number | null;
    };

type MigrationStageResult =
  | {
      success: true;
      data: unknown;
      migrated: boolean;
      sourceVersion: null;
      targetVersion: null;
      warnings: SaveDataWarning[];
    }
  | {
      success: false;
      issues: SaveDataIssue[];
      sourceVersion: null;
    };

interface NormalizationStageResult {
  data: unknown;
  normalized: boolean;
  warnings: SaveDataWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathText(path: Array<string | number>) {
  return path.length ? path.join(".") : "$";
}

function compatibilityIssue(
  code: string,
  path: Array<string | number>,
  message: string,
  operation: SaveDataIssue["operation"] = "migrate_legacy_item",
  migrationStep: SaveDataIssue["migrationStep"] = "legacy_item_fields",
): SaveDataIssue {
  return {
    code,
    stage: "legacy_migration",
    operation,
    path,
    pathText: pathText(path),
    message,
    recoverable: false,
    sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    targetVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    migrationStep,
  };
}

function warning(
  code: string,
  path: Array<string | number>,
  message: string,
): SaveDataWarning {
  return { code, path, pathText: pathText(path), message };
}

function historicalItemDetail(
  key: "type" | "damage" | "effect",
  value: unknown,
) {
  if (key === "type" && typeof value === "string") {
    return `类型：${value}`;
  }
  if (key === "damage" && typeof value === "number" && Number.isFinite(value)) {
    return `伤害：${value}`;
  }
  if (key === "effect" && typeof value === "string") {
    return `效果：${value}`;
  }
  return undefined;
}

function migrateItems(
  playerState: Record<string, unknown>,
  key: "inventory" | "equipment",
  path: Array<string | number>,
  warnings: SaveDataWarning[],
  issues: SaveDataIssue[],
) {
  const items = playerState[key];
  if (!Array.isArray(items)) return;
  playerState[key] = items.map((item, index) => {
    if (!isRecord(item)) return item;
    const itemPath = [...path, key, index];
    const historicalKeys = (["type", "damage", "effect"] as const).filter(
      (field) => Object.hasOwn(item, field),
    );
    const quantityMissing = !Object.hasOwn(item, "quantity");
    if (!historicalKeys.length && !quantityMissing) return item;

    const migrated = { ...item };
    if (
      quantityMissing &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.description === "string"
    ) {
      migrated.quantity = 1;
      warnings.push(
        warning(
          "legacy_item_quantity_defaulted",
          [...itemPath, "quantity"],
          "Legacy acquired item quantity was restored to one.",
        ),
      );
    }

    if (!historicalKeys.length) return migrated;
    if (typeof item.description !== "string") {
      issues.push(
        compatibilityIssue(
          "legacy_item_metadata_unmappable",
          [...itemPath, "description"],
          "Legacy item metadata requires a text description.",
        ),
      );
      return item;
    }

    const details: string[] = [];
    for (const field of historicalKeys) {
      const detail = historicalItemDetail(field, item[field]);
      if (!detail) {
        issues.push(
          compatibilityIssue(
            "legacy_item_metadata_unmappable",
            [...itemPath, field],
            `Legacy item field "${field}" has an unsupported value.`,
          ),
        );
        continue;
      }
      details.push(detail);
    }
    if (details.length !== historicalKeys.length) return item;

    delete migrated.type;
    delete migrated.damage;
    delete migrated.effect;
    migrated.description = `${item.description}\n[历史属性：${details.join("；")}]`;
    for (const field of historicalKeys) {
      warnings.push(
        warning(
          "legacy_item_metadata_preserved",
          [...itemPath, field],
          `Legacy item field "${field}" was preserved in its description.`,
        ),
      );
    }
    return migrated;
  });
}

function migrateQuests(
  value: Record<string, unknown>,
  path: Array<string | number>,
  warnings: SaveDataWarning[],
  issues: SaveDataIssue[],
) {
  for (const key of [
    "activeQuests",
    "completedQuests",
    "failedQuests",
  ] as const) {
    const quests = value[key];
    if (!Array.isArray(quests)) continue;
    value[key] = quests.map((quest, index) => {
      if (!isRecord(quest) || !Object.hasOwn(quest, "name")) return quest;
      const questPath = [...path, key, index];
      if (typeof quest.name !== "string" || Object.hasOwn(quest, "title")) {
        issues.push(
          compatibilityIssue(
            "legacy_quest_unmappable",
            [...questPath, "name"],
            "Legacy quest name could not be mapped to a title.",
            "migrate_legacy_quest",
            "legacy_quest_fields",
          ),
        );
        return quest;
      }
      const migrated: Record<string, unknown> = {
        ...quest,
        title: quest.name,
      };
      delete migrated.name;
      if (!Object.hasOwn(migrated, "objectives")) migrated.objectives = [];
      if (!Object.hasOwn(migrated, "progress")) migrated.progress = [];
      warnings.push(
        warning(
          "legacy_quest_shape_migrated",
          questPath,
          "Legacy quest name and list defaults were migrated.",
        ),
      );
      return migrated;
    });
  }
}

function migratePlayerState(
  value: Record<string, unknown>,
  path: Array<string | number>,
  warnings: SaveDataWarning[],
  issues: SaveDataIssue[],
) {
  if (!isRecord(value.playerState)) return;
  const playerStatePath = [...path, "playerState"];
  migrateItems(
    value.playerState,
    "inventory",
    playerStatePath,
    warnings,
    issues,
  );
  migrateItems(
    value.playerState,
    "equipment",
    playerStatePath,
    warnings,
    issues,
  );
}

function migrateGameSave(input: unknown): MigrationStageResult {
  let data: unknown;
  try {
    data = structuredClone(input);
  } catch {
    return {
      success: false,
      sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
      issues: [
        compatibilityIssue(
          "legacy_save_not_cloneable",
          [],
          "Legacy save could not be copied for in-memory migration.",
        ),
      ],
    };
  }
  if (!isRecord(data)) {
    return {
      success: true,
      data,
      migrated: false,
      sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
      targetVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
      warnings: [],
    };
  }

  const warnings: SaveDataWarning[] = [];
  const issues: SaveDataIssue[] = [];
  migratePlayerState(data, [], warnings, issues);
  migrateQuests(data, [], warnings, issues);
  if (Array.isArray(data.history)) {
    data.history.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      migratePlayerState(entry, ["history", index], warnings, issues);
      migrateQuests(entry, ["history", index], warnings, issues);
    });
  }
  if (issues.length) {
    return {
      success: false,
      sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
      issues,
    };
  }

  return {
    success: true,
    data,
    migrated: warnings.length > 0,
    sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    targetVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    warnings,
  };
}

function normalizeGameSave(input: unknown): NormalizationStageResult {
  // The repository contains no established read-time defaulting rule for
  // missing required GameSave fields. Optional fields remain optional.
  return { data: input, normalized: false, warnings: [] };
}

function saveIssues(issues: DataValidationIssue[]): SaveDataIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    stage: "final_validation",
    operation: "validate_game_save",
    path: [...issue.path],
    pathText: issue.pathText,
    message: issue.message,
    recoverable: false,
    sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    targetVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    migrationStep: null,
  }));
}

function finalValidation(
  input: unknown,
):
  | { success: true; data: GameSave }
  | { success: false; issues: SaveDataIssue[] } {
  const stableResult = safeParseGameSave(input);
  if (!stableResult.success) {
    return { success: false, issues: saveIssues(stableResult.issues) };
  }

  const rootResult = gameSaveSchema.safeParse(stableResult.data);
  if (!rootResult.success) {
    return {
      success: false,
      issues: [
        {
          code: "internal_save_schema_mismatch",
          stage: "final_validation",
          operation: "validate_game_save",
          path: [],
          pathText: "$",
          message: "Save root schema validation was inconsistent.",
          recoverable: false,
          sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
          targetVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
          migrationStep: null,
        },
      ],
    };
  }

  return { success: true, data: rootResult.data };
}

export function prepareGameSave(input: unknown): SavePreparationResult {
  const migration = migrateGameSave(input);
  if (!migration.success) {
    return {
      success: false,
      issues: migration.issues,
      sourceVersion: migration.sourceVersion,
    };
  }
  const normalization = normalizeGameSave(migration.data);
  const final = finalValidation(normalization.data);

  if (!final.success) {
    return {
      success: false,
      issues: final.issues,
      sourceVersion: migration.sourceVersion,
    };
  }

  return {
    success: true,
    data: final.data,
    migrated: migration.migrated,
    normalized: normalization.normalized,
    sourceVersion: migration.sourceVersion,
    targetVersion: migration.targetVersion,
    warnings: [...migration.warnings, ...normalization.warnings],
  };
}
