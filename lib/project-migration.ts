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
      code: "legacy_project_incompatible" | "project_schema_invalid";
      issues: ProjectDataIssue[];
      sourceVersion: number | null;
    };

type MigrationStageResult =
  | {
      success: true;
      data: unknown;
      migrated: boolean;
      sourceVersion: null;
      targetVersion: null;
      warnings: ProjectDataWarning[];
    }
  | {
      success: false;
      issues: ProjectDataIssue[];
      sourceVersion: null;
    };

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
  if (typeof input.projectInfo.title !== "string" || !input.projectInfo.title) {
    return false;
  }
  return isRecord(input.world) && isRecord(input.story);
}

function pathText(path: Array<string | number>) {
  return path.length ? path.join(".") : "$";
}

function compatibilityIssue(
  code: string,
  path: Array<string | number>,
  message: string,
): ProjectDataIssue {
  return { code, path, pathText: pathText(path), message };
}

function warning(
  code: string,
  path: Array<string | number>,
  message: string,
): ProjectDataWarning {
  return { code, path, pathText: pathText(path), message };
}

function stableTextHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function migrateAge(
  value: Record<string, unknown>,
  path: Array<string | number>,
  warnings: ProjectDataWarning[],
) {
  if (typeof value.age !== "number") return;
  if (!Number.isFinite(value.age)) {
    throw compatibilityIssue(
      "legacy_age_not_finite",
      [...path, "age"],
      "Legacy numeric age must be finite.",
    );
  }
  value.age = String(value.age);
  warnings.push(
    warning(
      "legacy_age_stringified",
      [...path, "age"],
      "Legacy numeric age was converted to text.",
    ),
  );
}

function migrateCharacterAbilities(
  character: Record<string, unknown>,
  path: Array<string | number>,
  warnings: ProjectDataWarning[],
) {
  if (!Array.isArray(character.abilities)) return;
  character.abilities = character.abilities.map((ability, index) => {
    if (typeof ability !== "string") return ability;
    const abilityPath = [...path, "abilities", index];
    warnings.push(
      warning(
        "legacy_ability_object_created",
        abilityPath,
        "Legacy text ability was converted to the current ability shape.",
      ),
    );
    return {
      id: `legacy-ability-${index + 1}-${stableTextHash(ability)}`,
      name: ability,
      description: ability,
    };
  });
}

function historicalItemDetail(key: "type" | "damage", value: unknown) {
  if (key === "type" && typeof value === "string") {
    return `类型：${value}`;
  }
  if (key === "damage" && typeof value === "number" && Number.isFinite(value)) {
    return `伤害：${value}`;
  }
  return undefined;
}

function migrateItems(
  player: Record<string, unknown>,
  key: "inventory" | "equipment",
  path: Array<string | number>,
  warnings: ProjectDataWarning[],
  issues: ProjectDataIssue[],
) {
  const items = player[key];
  if (!Array.isArray(items)) return;
  player[key] = items.map((item, index) => {
    if (!isRecord(item)) return item;
    const historicalKeys = (["type", "damage"] as const).filter((field) =>
      Object.hasOwn(item, field),
    );
    if (!historicalKeys.length) return item;

    const itemPath = [...path, key, index];
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

    const migrated = { ...item };
    delete migrated.type;
    delete migrated.damage;
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

function migrateReligions(
  world: Record<string, unknown>,
  path: Array<string | number>,
  warnings: ProjectDataWarning[],
  issues: ProjectDataIssue[],
) {
  if (!Array.isArray(world.religions)) return;
  world.religions = world.religions.map((religion, index) => {
    if (typeof religion === "string") return religion;
    const religionPath = [...path, "religions", index];
    if (
      !isRecord(religion) ||
      typeof religion.name !== "string" ||
      (religion.description !== undefined &&
        typeof religion.description !== "string")
    ) {
      issues.push(
        compatibilityIssue(
          "legacy_religion_unmappable",
          religionPath,
          "Legacy religion must contain a text name and description.",
        ),
      );
      return religion;
    }
    warnings.push(
      warning(
        "legacy_religion_text_created",
        religionPath,
        "Legacy religion details were preserved as text.",
      ),
    );
    return religion.description
      ? `${religion.name}：${religion.description}`
      : religion.name;
  });
}

function currentGameSystem(
  combatRules: string,
  attributes: unknown[] = [],
): Record<string, unknown> {
  return {
    levelSystem: "",
    attributes,
    combatRules,
    taskRules: "",
    relationshipRules: "",
    deathRules: "",
    difficultyRules: "",
    randomCheckRules: "",
  };
}

function migrateLegacyGameSystem(
  value: Record<string, unknown>,
  path: Array<string | number>,
  warnings: ProjectDataWarning[],
  issues: ProjectDataIssue[],
) {
  const gameSystemPath = [...path, "gameSystem"];
  if (typeof value.gameSystem === "string") {
    value.gameSystem = currentGameSystem(value.gameSystem);
    warnings.push(
      warning(
        "legacy_game_system_reconstructed",
        gameSystemPath,
        "Legacy text combat rules were reconstructed.",
      ),
    );
    return;
  }
  if (!isRecord(value.gameSystem)) return;
  const gameSystem = value.gameSystem;
  const numericKeys = Object.keys(gameSystem)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));
  if (!numericKeys.length || typeof gameSystem.combatRules === "string") return;

  const contiguous = numericKeys.every(
    (key, index) =>
      Number(key) === index &&
      typeof gameSystem[key] === "string" &&
      gameSystem[key].length === 1,
  );
  if (!contiguous || !Array.isArray(gameSystem.attributes)) {
    issues.push(
      compatibilityIssue(
        "legacy_game_system_unmappable",
        gameSystemPath,
        "Legacy character-spread game system is incomplete.",
      ),
    );
    return;
  }

  const combatRules = numericKeys.map((key) => gameSystem[key]).join("");
  value.gameSystem = currentGameSystem(combatRules, gameSystem.attributes);
  warnings.push(
    warning(
      "legacy_game_system_reconstructed",
      gameSystemPath,
      "Legacy character-spread combat rules were reconstructed.",
    ),
  );
}

function migrateLegacyGeneratedStageFields(
  value: Record<string, unknown>,
  path: Array<string | number>,
  warnings: ProjectDataWarning[],
) {
  if (isRecord(value.world)) {
    const world = value.world;
    const matchesLegacyWorldStage =
      typeof world.geography === "string" &&
      Array.isArray(world.locations) &&
      Array.isArray(world.factions) &&
      Array.isArray(world.races) &&
      Array.isArray(world.religions) &&
      Array.isArray(world.socialRules) &&
      typeof world.currentCrisis === "string" &&
      Array.isArray(world.secrets);
    if (matchesLegacyWorldStage) {
      for (const field of ["background", "history", "powerSystem"] as const) {
        if (Object.hasOwn(world, field)) continue;
        world[field] = "";
        warnings.push(
          warning(
            "legacy_generated_field_defaulted",
            [...path, "world", field],
            `Legacy generated world field "${field}" was restored to its original empty default.`,
          ),
        );
      }
    }
  }

  if (isRecord(value.story)) {
    const story = value.story;
    const matchesLegacyStoryStage =
      typeof story.mainGoal === "string" &&
      Array.isArray(story.chapters) &&
      Array.isArray(story.sideQuests) &&
      Array.isArray(story.randomEvents) &&
      Array.isArray(story.endings);
    if (matchesLegacyStoryStage && !Object.hasOwn(story, "openingEvent")) {
      story.openingEvent = "";
      warnings.push(
        warning(
          "legacy_generated_field_defaulted",
          [...path, "story", "openingEvent"],
          'Legacy generated story field "openingEvent" was restored to its original empty default.',
        ),
      );
    }
  }
}

const settingsSectionFields = {
  world: [
    "background",
    "history",
    "geography",
    "locations",
    "factions",
    "races",
    "religions",
    "socialRules",
    "powerSystem",
    "currentCrisis",
    "secrets",
  ],
  player: [
    "name",
    "gender",
    "age",
    "race",
    "identity",
    "background",
    "personality",
    "appearance",
    "goals",
    "talents",
    "skills",
    "weaknesses",
    "attributes",
    "inventory",
    "equipment",
    "statusEffects",
  ],
  story: [
    "mainGoal",
    "openingEvent",
    "chapters",
    "sideQuests",
    "randomEvents",
    "endings",
  ],
} as const;

function migrateLegacyInitialSettingsSnapshot(
  project: Record<string, unknown>,
  warnings: ProjectDataWarning[],
) {
  if (
    !Array.isArray(project.settingsVersions) ||
    project.settingsVersions.length !== 1 ||
    project.settingsVersionNumber !== 1
  ) {
    return;
  }
  const version = project.settingsVersions[0];
  if (
    !isRecord(version) ||
    version.versionNumber !== 1 ||
    version.effectiveFromTurn !== 0 ||
    typeof version.id !== "string" ||
    project.currentSettingsVersionId !== version.id ||
    version.projectId !== project.id ||
    !isRecord(version.settingsSnapshot)
  ) {
    return;
  }

  for (const [sectionKey, fieldNames] of Object.entries(
    settingsSectionFields,
  )) {
    const source = project[sectionKey];
    const target = version.settingsSnapshot[sectionKey];
    if (!isRecord(source) || !isRecord(target)) continue;
    for (const fieldName of fieldNames) {
      if (
        Object.hasOwn(target, fieldName) ||
        !Object.hasOwn(source, fieldName)
      ) {
        continue;
      }
      target[fieldName] = structuredClone(source[fieldName]);
      warnings.push(
        warning(
          "legacy_initial_snapshot_field_restored",
          ["settingsVersions", 0, "settingsSnapshot", sectionKey, fieldName],
          `Legacy initial settings field "${sectionKey}.${fieldName}" was restored from its project value.`,
        ),
      );
    }
  }
}

function migrateLegacyGenerationResponseArtifacts(
  project: Record<string, unknown>,
  warnings: ProjectDataWarning[],
) {
  if (
    !Array.isArray(project.options) ||
    !isRecord(project.stateUpdate) ||
    typeof project.summary !== "string"
  ) {
    return;
  }
  for (const field of ["options", "stateUpdate", "summary"] as const) {
    delete project[field];
    warnings.push(
      warning(
        "legacy_generation_response_artifact_removed",
        [field],
        `Legacy generation response artifact "${field}" was excluded from the in-memory project.`,
      ),
    );
  }
}

function migrateSettingsShape(
  value: Record<string, unknown>,
  path: Array<string | number>,
  warnings: ProjectDataWarning[],
  issues: ProjectDataIssue[],
) {
  migrateLegacyGeneratedStageFields(value, path, warnings);
  if (isRecord(value.world)) {
    migrateReligions(value.world, [...path, "world"], warnings, issues);
  }
  if (isRecord(value.player)) {
    migrateAge(value.player, [...path, "player"], warnings);
    migrateItems(
      value.player,
      "inventory",
      [...path, "player"],
      warnings,
      issues,
    );
    migrateItems(
      value.player,
      "equipment",
      [...path, "player"],
      warnings,
      issues,
    );
  }
  migrateLegacyGameSystem(value, path, warnings, issues);
  if (!Array.isArray(value.characters)) return;
  value.characters.forEach((character, index) => {
    if (!isRecord(character)) return;
    const characterPath = [...path, "characters", index];
    migrateAge(character, characterPath, warnings);
    migrateCharacterAbilities(character, characterPath, warnings);
  });
}

function migrateGameProject(input: unknown): MigrationStageResult {
  let data: unknown;
  try {
    data = structuredClone(input);
  } catch {
    return {
      success: false,
      sourceVersion: null,
      issues: [
        compatibilityIssue(
          "legacy_project_not_cloneable",
          [],
          "Legacy project could not be copied for in-memory migration.",
        ),
      ],
    };
  }
  if (!isRecord(data)) {
    return {
      success: true,
      data,
      migrated: false,
      sourceVersion: null,
      targetVersion: null,
      warnings: [],
    };
  }

  const warnings: ProjectDataWarning[] = [];
  const issues: ProjectDataIssue[] = [];
  try {
    migrateSettingsShape(data, [], warnings, issues);
    migrateLegacyInitialSettingsSnapshot(data, warnings);
    migrateLegacyGenerationResponseArtifacts(data, warnings);
    if (Array.isArray(data.settingsVersions)) {
      data.settingsVersions.forEach((version, index) => {
        if (!isRecord(version) || !isRecord(version.settingsSnapshot)) return;
        migrateSettingsShape(
          version.settingsSnapshot,
          ["settingsVersions", index, "settingsSnapshot"],
          warnings,
          issues,
        );
      });
    }
  } catch (error) {
    if (isRecord(error) && Array.isArray(error.path)) {
      issues.push(error as unknown as ProjectDataIssue);
    } else {
      issues.push(
        compatibilityIssue(
          "legacy_project_migration_failed",
          [],
          "Legacy project migration failed.",
        ),
      );
    }
  }

  if (issues.length) {
    return { success: false, sourceVersion: null, issues };
  }
  return {
    success: true,
    data,
    migrated: warnings.length > 0,
    sourceVersion: null,
    targetVersion: null,
    warnings,
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

export function prepareGameProject(input: unknown): ProjectPreparationResult {
  const current = safeParseGameProject(input);
  if (current.success) {
    const final = finalValidation(current.data);
    if (!final.success) {
      return {
        success: false,
        code: "project_schema_invalid",
        issues: final.issues,
        sourceVersion: null,
      };
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
  if (!migration.success) {
    return {
      success: false,
      code: "legacy_project_incompatible",
      issues: migration.issues,
      sourceVersion: migration.sourceVersion,
    };
  }
  const normalization = normalizeGameProject(migration.data);
  const final = finalValidation(normalization.data);
  if (!final.success) {
    return {
      success: false,
      code: "project_schema_invalid",
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
