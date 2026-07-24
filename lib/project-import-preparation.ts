import { validateProjectIntegrity } from "./project-integrity";
import { prepareGameProject } from "./project-migration";
import { prepareGameSave } from "./save-migration";
import type { GameProject, GameSave } from "./types";

export const GAME_BUNDLE_FORMAT = "narrative-ark-game";
export const CURRENT_GAME_BUNDLE_VERSION = 2;

export type ImportConflict =
  | {
      code: "project_id_conflict";
      entityId: string;
    }
  | {
      code: "save_id_conflict";
      entityId: string;
    };

export interface ImportPreparationError {
  code: string;
  path?: string;
  relatedId?: string;
}

type PreparedBase = {
  project: GameProject;
  conflicts: ImportConflict[];
};

export type PreparedProjectImport =
  | ({ ok: true; kind: "project" } & PreparedBase)
  | ({
      ok: true;
      kind: "game_bundle";
      save: GameSave;
    } & PreparedBase)
  | {
      ok: false;
      errors: ImportPreparationError[];
    };

export interface PrepareProjectImportOptions {
  input: unknown;
  existingProjectIds: ReadonlySet<string>;
  existingSaveIds: ReadonlySet<string>;
}

const PROJECT_ROOT_KEYS = new Set([
  "projectInfo",
  "world",
  "player",
  "characters",
  "gameSystem",
  "story",
  "prompts",
  "openingScene",
  "settingsVersions",
  "currentSettingsVersionId",
  "settingsVersionNumber",
  "worldBinding",
  "scenarioId",
  "schemaVersion",
]);

const BUNDLE_KEYS = new Set([
  "format",
  "version",
  "exportedAt",
  "project",
  "save",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProjectCandidate(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => PROJECT_ROOT_KEYS.has(key));
}

function prefixPath(prefix: string, path: string): string {
  if (prefix === "") return path;
  return path === "$" ? prefix : `${prefix}.${path}`;
}

function prepareProject(
  input: unknown,
  prefix = "",
):
  | { success: true; project: GameProject }
  | { success: false; errors: ImportPreparationError[] } {
  if (isRecord(input) && Object.hasOwn(input, "schemaVersion")) {
    return {
      success: false,
      errors: [
        {
          code: "unsupported_project_schema_version",
          path: prefixPath(prefix, "schemaVersion"),
        },
      ],
    };
  }

  const preparation = prepareGameProject(input);
  if (!preparation.success) {
    return {
      success: false,
      errors: preparation.issues.map((issue) => ({
        code: `project_${issue.code}`,
        path: prefix ? prefixPath(prefix, issue.pathText) : issue.pathText,
      })),
    };
  }

  const integrityIssues = validateProjectIntegrity(preparation.data);
  if (integrityIssues.length > 0) {
    return {
      success: false,
      errors: integrityIssues.map((issue) => ({
        code: `project_${issue.code}`,
        path: prefix ? prefixPath(prefix, issue.path) : issue.path,
        ...(issue.relatedId !== undefined
          ? { relatedId: issue.relatedId }
          : issue.entityId !== undefined
            ? { relatedId: issue.entityId }
            : {}),
      })),
    };
  }

  return { success: true, project: preparation.data };
}

function prepareSave(
  input: unknown,
):
  | { success: true; save: GameSave }
  | { success: false; errors: ImportPreparationError[] } {
  if (isRecord(input) && Object.hasOwn(input, "schemaVersion")) {
    return {
      success: false,
      errors: [
        {
          code: "unsupported_save_schema_version",
          path: "save.schemaVersion",
        },
      ],
    };
  }

  const preparation = prepareGameSave(input);
  if (!preparation.success) {
    return {
      success: false,
      errors: preparation.issues.map((issue) => ({
        code: `save_${issue.code}`,
        path: prefixPath("save", issue.pathText),
      })),
    };
  }

  return { success: true, save: preparation.data };
}

function bundleEnvelopeErrors(
  bundle: Record<string, unknown>,
): ImportPreparationError[] {
  if (
    typeof bundle.version === "number" &&
    bundle.version > CURRENT_GAME_BUNDLE_VERSION
  ) {
    return [
      {
        code: "future_game_bundle_version",
        path: "version",
        relatedId: String(bundle.version),
      },
    ];
  }

  if (bundle.version !== CURRENT_GAME_BUNDLE_VERSION) {
    return [{ code: "unsupported_game_bundle_version", path: "version" }];
  }

  const errors: ImportPreparationError[] = [];
  if (typeof bundle.exportedAt !== "string") {
    errors.push({
      code: "invalid_game_bundle_exported_at",
      path: "exportedAt",
    });
  }
  if (!Object.hasOwn(bundle, "project")) {
    errors.push({ code: "missing_game_bundle_project", path: "project" });
  }
  if (!Object.hasOwn(bundle, "save")) {
    errors.push({ code: "missing_game_bundle_save", path: "save" });
  }
  for (const key of Object.keys(bundle)) {
    if (!BUNDLE_KEYS.has(key)) {
      errors.push({
        code: "unrecognized_game_bundle_field",
        path: key,
      });
    }
  }
  return errors;
}

function conflictsFor(
  project: GameProject,
  save: GameSave | undefined,
  existingProjectIds: ReadonlySet<string>,
  existingSaveIds: ReadonlySet<string>,
): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  if (existingProjectIds.has(project.id)) {
    conflicts.push({ code: "project_id_conflict", entityId: project.id });
  }
  if (save !== undefined && existingSaveIds.has(save.id)) {
    conflicts.push({ code: "save_id_conflict", entityId: save.id });
  }
  return conflicts;
}

export function prepareProjectImport({
  input,
  existingProjectIds,
  existingSaveIds,
}: PrepareProjectImportOptions): PreparedProjectImport {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ code: "unknown_import_format", path: "$" }],
    };
  }

  if (Object.hasOwn(input, "format")) {
    if (input.format !== GAME_BUNDLE_FORMAT) {
      return {
        ok: false,
        errors: [{ code: "unknown_import_format", path: "format" }],
      };
    }

    const envelopeErrors = bundleEnvelopeErrors(input);
    if (envelopeErrors.length > 0) {
      return { ok: false, errors: envelopeErrors };
    }

    const projectResult = prepareProject(input.project, "project");
    if (!projectResult.success) {
      return { ok: false, errors: projectResult.errors };
    }

    const saveResult = prepareSave(input.save);
    if (!saveResult.success) {
      return { ok: false, errors: saveResult.errors };
    }

    if (saveResult.save.projectId !== projectResult.project.id) {
      return {
        ok: false,
        errors: [
          {
            code: "save_project_id_mismatch",
            path: "save.projectId",
            relatedId: saveResult.save.projectId,
          },
        ],
      };
    }

    return {
      ok: true,
      kind: "game_bundle",
      project: projectResult.project,
      save: saveResult.save,
      conflicts: conflictsFor(
        projectResult.project,
        saveResult.save,
        existingProjectIds,
        existingSaveIds,
      ),
    };
  }

  if (!isProjectCandidate(input)) {
    return {
      ok: false,
      errors: [{ code: "unknown_import_format", path: "$" }],
    };
  }

  const projectResult = prepareProject(input);
  if (!projectResult.success) {
    return { ok: false, errors: projectResult.errors };
  }

  return {
    ok: true,
    kind: "project",
    project: projectResult.project,
    conflicts: conflictsFor(
      projectResult.project,
      undefined,
      existingProjectIds,
      existingSaveIds,
    ),
  };
}
