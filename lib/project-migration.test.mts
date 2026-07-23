import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  GameProjectSchema,
  gameProjectSchema,
} from "./data-schemas.ts";
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
hasPath(
  failureIssues(prepareGameProject(missingLocations)),
  "world.locations",
);

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

const idempotentResult = successResult(
  prepareGameProject(normalizedOnce.data),
);
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

console.log("project migration tests passed");
