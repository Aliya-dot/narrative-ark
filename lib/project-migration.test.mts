import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { GameProjectSchema, gameProjectSchema } from "./data-schemas.ts";
import type {
  ProjectDataIssue,
  ProjectPreparationResult,
} from "./project-migration.ts";
import type { GenerationDraft } from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { prepareGameProject } = await import("./project-migration.ts");
const { formatPlayProjectLoadFailure, loadProjectForPlay } =
  await import("./play-project-loader.ts");
const { emptyProject } = await import("./project.ts");

const draft: GenerationDraft = {
  title: "Migration fixture",
  idea: "A deterministic project preparation fixture",
  genre: "mystery",
  protagonist: "Investigator",
  tone: "measured",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "advanced",
};
const project = emptyProject(draft);

function clone(value: unknown): unknown {
  return structuredClone(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
}

function property(value: unknown, key: string): unknown {
  return objectValue(value)[key];
}

function successResult(
  result: ProjectPreparationResult,
): Extract<ProjectPreparationResult, { success: true }> {
  if (!result.success) {
    assert.fail(
      `expected preparation success; received ${result.issues
        .map((issue) => issue.pathText)
        .join(", ")}`,
    );
  }
  return result;
}

function failureIssues(result: ProjectPreparationResult): ProjectDataIssue[] {
  if (result.success) {
    assert.fail("expected preparation failure");
  }
  return result.issues;
}

function hasPath(issues: ProjectDataIssue[], expected: string): void {
  assert.ok(
    issues.some((issue) => issue.pathText === expected),
    `expected issue path ${expected}; received ${issues
      .map((issue) => issue.pathText)
      .join(", ")}`,
  );
}

const currentProject = clone(project);
const currentBefore = clone(currentProject);
const currentResult = successResult(prepareGameProject(currentProject));
assert.equal(GameProjectSchema.safeParse(currentResult.data).success, true);
assert.equal(currentResult.migrated, false);
assert.equal(currentResult.normalized, false);
assert.equal(currentResult.sourceVersion, null);
assert.equal(currentResult.targetVersion, null);
assert.deepEqual(currentResult.warnings, []);
assert.deepEqual(currentProject, currentBefore);
assert.notEqual(currentResult.data, currentProject);

const optionalFieldsAbsent = clone(project);
const optionalProjectInfo = objectValue(
  property(optionalFieldsAbsent, "projectInfo"),
);
delete optionalProjectInfo.gameLength;
delete optionalProjectInfo.storyLength;
const optionalRoot = objectValue(optionalFieldsAbsent);
delete optionalRoot.settingsVersions;
delete optionalRoot.currentSettingsVersionId;
delete optionalRoot.settingsVersionNumber;
delete optionalRoot.worldBinding;
delete optionalRoot.scenarioId;
const optionalBefore = clone(optionalFieldsAbsent);
const optionalResult = successResult(prepareGameProject(optionalFieldsAbsent));
assert.equal(optionalResult.normalized, false);
assert.equal(
  Object.hasOwn(objectValue(optionalResult.data.projectInfo), "storyLength"),
  false,
);
assert.equal(
  Object.hasOwn(objectValue(optionalResult.data), "worldBinding"),
  false,
);
assert.deepEqual(optionalFieldsAbsent, optionalBefore);

const invalidLocations = clone(project);
objectValue(property(invalidLocations, "world")).locations = "not-an-array";
const invalidLocationsBefore = clone(invalidLocations);
const invalidLocationsResult = prepareGameProject(invalidLocations);
hasPath(failureIssues(invalidLocationsResult), "world.locations");
assert.deepEqual(invalidLocations, invalidLocationsBefore);

const missingLocations = clone(project);
delete objectValue(property(missingLocations, "world")).locations;
hasPath(failureIssues(prepareGameProject(missingLocations)), "world.locations");

const unknownFields = clone(project);
objectValue(unknownFields).unexpectedRoot = "root-secret-not-reported";
objectValue(property(unknownFields, "world")).unexpectedNested =
  "nested-secret-not-reported";
const unknownBefore = clone(unknownFields);
const unknownResult = prepareGameProject(unknownFields);
const unknownIssues = failureIssues(unknownResult);
hasPath(unknownIssues, "unexpectedRoot");
hasPath(unknownIssues, "world.unexpectedNested");
assert.equal(
  JSON.stringify(unknownResult).includes("secret-not-reported"),
  false,
);
assert.deepEqual(unknownFields, unknownBefore);

const highRevision = clone(project);
objectValue(highRevision).version = 999;
const highRevisionResult = successResult(prepareGameProject(highRevision));
assert.equal(highRevisionResult.data.version, 999);
assert.equal(highRevisionResult.migrated, false);
assert.equal(highRevisionResult.normalized, false);
assert.equal(highRevisionResult.sourceVersion, null);
assert.equal(highRevisionResult.targetVersion, null);
assert.deepEqual(highRevisionResult.warnings, []);

const missingRevision = clone(project);
delete objectValue(missingRevision).version;
const missingRevisionBefore = clone(missingRevision);
const normalizedOnce = successResult(prepareGameProject(missingRevision));
const normalizedAgain = successResult(prepareGameProject(missingRevision));
assert.deepEqual(normalizedOnce, normalizedAgain);
assert.equal(normalizedOnce.data.version, 1);
assert.equal(normalizedOnce.migrated, false);
assert.equal(normalizedOnce.normalized, true);
assert.equal(normalizedOnce.sourceVersion, null);
assert.equal(normalizedOnce.targetVersion, null);
assert.deepEqual(normalizedOnce.warnings, [
  {
    code: "project_version_defaulted",
    path: ["version"],
    pathText: "version",
    message:
      "Missing project revision was set to 1 using the established JSON import rule.",
  },
]);
assert.equal(gameProjectSchema.safeParse(normalizedOnce.data).success, true);
assert.equal(Object.hasOwn(objectValue(missingRevision), "version"), false);
assert.deepEqual(missingRevision, missingRevisionBefore);

const idempotentResult = successResult(prepareGameProject(normalizedOnce.data));
assert.deepEqual(idempotentResult.data, normalizedOnce.data);
assert.equal(idempotentResult.migrated, false);
assert.equal(idempotentResult.normalized, false);
assert.deepEqual(idempotentResult.warnings, []);

const inventedSchemaVersion = clone(project);
objectValue(inventedSchemaVersion).schemaVersion = 1;
hasPath(
  failureIssues(prepareGameProject(inventedSchemaVersion)),
  "schemaVersion",
);

const multipleProblems = clone(project);
objectValue(multipleProblems).id = 42;
delete objectValue(property(multipleProblems, "world")).locations;
objectValue(property(multipleProblems, "player")).goals = null;
const multipleResult = prepareGameProject(multipleProblems);
const multipleIssues = failureIssues(multipleResult);
hasPath(multipleIssues, "id");
hasPath(multipleIssues, "world.locations");
hasPath(multipleIssues, "player.goals");
assert.ok(multipleIssues.length >= 3);
assert.deepEqual(prepareGameProject(multipleProblems), multipleResult);

const legacyProject = clone(project);
const legacyRoot = objectValue(legacyProject);
const legacyPlayer = objectValue(property(legacyProject, "player"));
legacyPlayer.age = 18;
legacyPlayer.inventory = [
  {
    id: "legacy-blade",
    name: "Old blade",
    description: "A worn blade.",
    quantity: 1,
    type: "weapon",
    damage: 5,
  },
];
legacyRoot.characters = [
  {
    id: "legacy-character",
    name: "Legacy character",
    identity: "Guide",
    age: 34,
    race: "Human",
    personality: "Steady",
    appearance: "Travel clothes",
    background: "Old format fixture",
    abilities: ["Ash sense", "Ash sense"],
    relationship: "Ally",
    attitude: 10,
    goal: "Guide the player",
    secret: "",
    speechStyle: "Direct",
    important: true,
    mortal: true,
  },
];
const legacySnapshot = {
  projectInfo: clone(legacyRoot.projectInfo),
  world: clone(legacyRoot.world),
  player: clone(legacyRoot.player),
  characters: clone(legacyRoot.characters),
  gameSystem: clone(legacyRoot.gameSystem),
  story: clone(legacyRoot.story),
  prompts: clone(legacyRoot.prompts),
  openingScene: legacyRoot.openingScene,
};
legacyRoot.settingsVersions = [
  {
    id: "legacy-settings-v1",
    projectId: legacyRoot.id,
    versionNumber: 1,
    createdAt: legacyRoot.createdAt,
    updatedAt: legacyRoot.updatedAt,
    effectiveFromTurn: 0,
    settingsSnapshot: legacySnapshot,
  },
];
legacyRoot.currentSettingsVersionId = "legacy-settings-v1";
legacyRoot.settingsVersionNumber = 1;

const legacyBefore = clone(legacyProject);
const legacyResult = successResult(prepareGameProject(legacyProject));
assert.equal(legacyResult.migrated, true);
assert.equal(GameProjectSchema.safeParse(legacyResult.data).success, true);
assert.deepEqual(legacyProject, legacyBefore);
assert.equal(legacyResult.data.player.age, "18");
assert.equal(legacyResult.data.characters[0].age, "34");
assert.equal(legacyResult.data.characters[0].abilities[0].name, "Ash sense");
assert.equal(
  legacyResult.data.characters[0].abilities[0].description,
  "Ash sense",
);
assert.notEqual(
  legacyResult.data.characters[0].abilities[0].id,
  legacyResult.data.characters[0].abilities[1].id,
);
assert.equal(
  legacyResult.data.characters[0].abilities[0].id,
  successResult(prepareGameProject(legacyProject)).data.characters[0]
    .abilities[0].id,
);
assert.match(
  legacyResult.data.player.inventory[0].description,
  /类型：weapon.*伤害：5/s,
);
assert.equal(
  Object.hasOwn(
    legacyResult.data.player.inventory[0] as unknown as object,
    "type",
  ),
  false,
);
assert.equal(
  legacyResult.data.settingsVersions?.[0].settingsSnapshot.player.age,
  "18",
);
assert.equal(
  legacyResult.data.settingsVersions?.[0].settingsSnapshot.characters[0]
    .abilities[0].description,
  "Ash sense",
);
const legacyAgain = successResult(prepareGameProject(legacyResult.data));
assert.deepEqual(legacyAgain.data, legacyResult.data);
assert.equal(legacyAgain.migrated, false);

const unsupportedLegacyItem = clone(project);
objectValue(property(unsupportedLegacyItem, "player")).inventory = [
  {
    id: "unsafe-item",
    name: "Unsafe item",
    description: "Unsupported metadata fixture",
    quantity: 1,
    damage: { dice: "1d6" },
  },
];
const unsupportedResult = prepareGameProject(unsupportedLegacyItem);
assert.equal(unsupportedResult.success, false);
if (!unsupportedResult.success) {
  assert.equal(unsupportedResult.code, "legacy_project_incompatible");
  hasPath(unsupportedResult.issues, "player.inventory.0.damage");
}

const schemaInvalidProject = clone(project);
delete objectValue(property(schemaInvalidProject, "world")).locations;
const schemaInvalidResult = prepareGameProject(schemaInvalidProject);
assert.equal(schemaInvalidResult.success, false);
if (!schemaInvalidResult.success) {
  assert.equal(schemaInvalidResult.code, "project_schema_invalid");
}

const missingLoad = await loadProjectForPlay({
  routeProjectId: "missing-project",
  readProject: async () => undefined,
});
assert.deepEqual(missingLoad, { ok: false, code: "project_not_found" });
assert.equal(
  formatPlayProjectLoadFailure("project_not_found"),
  "项目记录不存在。",
);
assert.equal(
  formatPlayProjectLoadFailure("legacy_project_incompatible"),
  "历史项目无法兼容迁移。",
);
assert.equal(
  formatPlayProjectLoadFailure("project_schema_invalid"),
  "项目结构校验失败。",
);

const incompatibleLoad = await loadProjectForPlay({
  routeProjectId: String(property(unsupportedLegacyItem, "id")),
  readProject: async () => unsupportedLegacyItem,
});
assert.equal(incompatibleLoad.ok, false);
if (!incompatibleLoad.ok) {
  assert.equal(incompatibleLoad.code, "legacy_project_incompatible");
}

const invalidLoad = await loadProjectForPlay({
  routeProjectId: String(property(schemaInvalidProject, "id")),
  readProject: async () => schemaInvalidProject,
});
assert.equal(invalidLoad.ok, false);
if (!invalidLoad.ok) {
  assert.equal(invalidLoad.code, "project_schema_invalid");
}

const routeMismatchLoad = await loadProjectForPlay({
  routeProjectId: "different-route-project",
  readProject: async () => project,
});
assert.deepEqual(routeMismatchLoad, {
  ok: false,
  code: "project_route_mismatch",
});

let projectReadCount = 0;
const successfulLoad = await loadProjectForPlay({
  routeProjectId: legacyResult.data.id,
  readProject: async () => {
    projectReadCount += 1;
    return legacyProject;
  },
});
assert.equal(successfulLoad.ok, true);
assert.equal(projectReadCount, 1);
assert.deepEqual(legacyProject, legacyBefore);

console.log("project migration tests passed");
