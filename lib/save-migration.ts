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
  stage: "final_validation";
  operation: "validate_game_save";
  path: Array<string | number>;
  pathText: string;
  message: string;
  recoverable: false;
  sourceVersion: null;
  targetVersion: null;
  migrationStep: null;
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

interface MigrationStageResult {
  data: unknown;
  migrated: boolean;
  sourceVersion: null;
  targetVersion: null;
  warnings: SaveDataWarning[];
}

interface NormalizationStageResult {
  data: unknown;
  normalized: boolean;
  warnings: SaveDataWarning[];
}

function migrateGameSave(input: unknown): MigrationStageResult {
  // GameSave has no proven persistent data-schema version or historical
  // structure that can be identified unambiguously. No migration steps are
  // registered, and turn is gameplay state rather than a schema version.
  return {
    data: input,
    migrated: false,
    sourceVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    targetVersion: CURRENT_GAME_SAVE_SCHEMA_VERSION,
    warnings: [],
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
