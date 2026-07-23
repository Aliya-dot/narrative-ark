import {
  gameProjectSchema,
  safeParseGameProject,
  type DataValidationIssue,
} from "./data-schemas";
import type { GameProject } from "./types";

export interface ProjectDataWarning {
  code: string;
  path: Array<string | number>;
  pathText: string;
  message: string;
  fromVersion?: number;
  toVersion?: number;
}

export interface ProjectDataIssue {
  code: string;
  path: Array<string | number>;
  pathText: string;
  message: string;
}

export type ProjectPreparationResult =
  | {
      success: true;
      data: GameProject;
      migrated: boolean;
      normalized: boolean;
      sourceVersion: number | null;
      targetVersion: number | null;
      warnings: ProjectDataWarning[];
    }
  | {
      success: false;
      issues: ProjectDataIssue[];
      sourceVersion: number | null;
    };

interface MigrationStageResult {
  data: unknown;
  migrated: boolean;
  sourceVersion: null;
  targetVersion: null;
  warnings: ProjectDataWarning[];
}

interface NormalizationStageResult {
  data: unknown;
  normalized: boolean;
  warnings: ProjectDataWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProjectCandidateWithoutVersion(
  input: unknown,
): input is Record<string, unknown> {
  if (!isRecord(input) || Object.hasOwn(input, "version")) return false;
  if (typeof input.id !== "string" || !input.id) return false;
  if (!isRecord(input.projectInfo)) return false;
  if (
    typeof input.projectInfo.title !== "string" ||
    !input.projectInfo.title
  ) {
    return false;
  }
  return isRecord(input.world) && isRecord(input.story);
}

function migrateGameProject(input: unknown): MigrationStageResult {
  // GameProject.version is a mutable project revision counter, not a proven
  // data-schema version. No historical schema migration steps are registered.
  return {
    data: input,
    migrated: false,
    sourceVersion: null,
    targetVersion: null,
    warnings: [],
  };
}

function normalizeGameProject(input: unknown): NormalizationStageResult {
  if (!isProjectCandidateWithoutVersion(input)) {
    return { data: input, normalized: false, warnings: [] };
  }

  return {
    data: { ...input, version: 1 },
    normalized: true,
    warnings: [
      {
        code: "project_version_defaulted",
        path: ["version"],
        pathText: "version",
        message:
          "Missing project revision was set to 1 using the established JSON import rule.",
      },
    ],
  };
}

function projectIssues(issues: DataValidationIssue[]): ProjectDataIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    path: [...issue.path],
    pathText: issue.pathText,
    message: issue.message,
  }));
}

function finalValidation(
  input: unknown,
):
  | { success: true; data: GameProject }
  | { success: false; issues: ProjectDataIssue[] } {
  const stableResult = safeParseGameProject(input);
  if (!stableResult.success) {
    return { success: false, issues: projectIssues(stableResult.issues) };
  }

  const rootResult = gameProjectSchema.safeParse(stableResult.data);
  if (!rootResult.success) {
    return {
      success: false,
      issues: [
        {
          code: "internal_project_schema_mismatch",
          path: [],
          pathText: "$",
          message: "Project root schema validation was inconsistent.",
        },
      ],
    };
  }

  return { success: true, data: rootResult.data };
}

export function prepareGameProject(
  input: unknown,
): ProjectPreparationResult {
  const current = safeParseGameProject(input);
  if (current.success) {
    const final = finalValidation(current.data);
    if (!final.success) {
      return { success: false, issues: final.issues, sourceVersion: null };
    }
    return {
      success: true,
      data: final.data,
      migrated: false,
      normalized: false,
      sourceVersion: null,
      targetVersion: null,
      warnings: [],
    };
  }

  const migration = migrateGameProject(input);
  const normalization = normalizeGameProject(migration.data);
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
