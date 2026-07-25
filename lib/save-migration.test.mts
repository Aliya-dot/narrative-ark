import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { GameSaveSchema, gameSaveSchema } from "./data-schemas.ts";
import type { SaveDataIssue, SavePreparationResult } from "./save-migration.ts";
import type { GenerationDraft } from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { CURRENT_GAME_SAVE_SCHEMA_VERSION, prepareGameSave } =
  await import("./save-migration.ts");
const { createSave, emptyProject, snapshot } = await import("./project.ts");

const draft: GenerationDraft = {
  title: "Save migration fixture",
  idea: "A deterministic save preparation fixture",
  genre: "mystery",
  protagonist: "Investigator",
  tone: "measured",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "advanced",
};
const project = emptyProject(draft);
const save = createSave(project);

function clone(value: unknown): unknown {
  return structuredClone(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

function property(value: unknown, key: string): unknown {
  return objectValue(value)[key];
}

function successResult(
  result: SavePreparationResult,
): Extract<SavePreparationResult, { success: true }> {
  if (!result.success) {
    assert.fail(
      `expected preparation success; received ${result.issues
        .map((issue) => issue.pathText)
        .join(", ")}`,
    );
  }
  return result;
}

function failureIssues(result: SavePreparationResult): SaveDataIssue[] {
  if (result.success) {
    assert.fail("expected preparation failure");
  }
  assert.equal(Object.hasOwn(result, "data"), false);
  return result.issues;
}

function hasPath(issues: SaveDataIssue[], expected: string): void {
  assert.ok(
    issues.some((issue) => issue.pathText === expected),
    `expected issue path ${expected}; received ${issues
      .map((issue) => issue.pathText)
      .join(", ")}`,
  );
}

function assertStableFailure(input: unknown, expectedPath: string): void {
  const before = clone(input);
  const first = prepareGameSave(input);
  hasPath(failureIssues(first), expectedPath);
  assert.deepEqual(prepareGameSave(input), first);
  assert.deepEqual(input, before);
}

assert.equal(CURRENT_GAME_SAVE_SCHEMA_VERSION, null);

const currentSave = clone(save);
const currentBefore = clone(currentSave);
const currentResult = successResult(prepareGameSave(currentSave));
assert.equal(GameSaveSchema.safeParse(currentResult.data).success, true);
assert.equal(gameSaveSchema.safeParse(currentResult.data).success, true);
assert.equal(currentResult.migrated, false);
assert.equal(currentResult.normalized, false);
assert.equal(currentResult.sourceVersion, null);
assert.equal(currentResult.targetVersion, null);
assert.deepEqual(currentResult.warnings, []);
assert.deepEqual(currentResult.data, currentSave);
assert.deepEqual(currentSave, currentBefore);
assert.notEqual(currentResult.data, currentSave);

const saveWithHistory = clone(save);
objectValue(saveWithHistory).history = [snapshot(save)];
const historyBefore = clone(saveWithHistory);
const historyResult = successResult(prepareGameSave(saveWithHistory));
assert.equal(historyResult.data.history.length, 1);
assert.equal(GameSaveSchema.safeParse(historyResult.data).success, true);
assert.deepEqual(saveWithHistory, historyBefore);
assert.notEqual(
  historyResult.data.history,
  property(saveWithHistory, "history"),
);

const optionalFieldsAbsent = clone(save);
const optionalRoot = objectValue(optionalFieldsAbsent);
delete optionalRoot.settingsVersionId;
delete optionalRoot.settingsVersionNumber;
delete optionalRoot.turnDurationsMs;
delete optionalRoot.discoveredWorldBookEntryIds;
delete optionalRoot.lastWorldBookContext;
const optionalBefore = clone(optionalFieldsAbsent);
const optionalResult = successResult(prepareGameSave(optionalFieldsAbsent));
assert.equal(optionalResult.normalized, false);
assert.equal(
  Object.hasOwn(objectValue(optionalResult.data), "turnDurationsMs"),
  false,
);
assert.equal(
  Object.hasOwn(
    objectValue(optionalResult.data),
    "discoveredWorldBookEntryIds",
  ),
  false,
);
assert.deepEqual(optionalFieldsAbsent, optionalBefore);

for (const requiredCollection of [
  "characterStates",
  "factionStates",
  "activeQuests",
  "completedQuests",
  "failedQuests",
  "triggeredEvents",
  "importantChoices",
  "worldState",
  "recentMessages",
  "importantMemories",
  "history",
]) {
  const missingCollection = clone(save);
  delete objectValue(missingCollection)[requiredCollection];
  assertStableFailure(missingCollection, requiredCollection);
}

for (const nestedCollection of [
  "attributes",
  "inventory",
  "equipment",
  "statusEffects",
]) {
  const missingNested = clone(save);
  delete objectValue(property(missingNested, "playerState"))[nestedCollection];
  assertStableFailure(missingNested, `playerState.${nestedCollection}`);
}

const saveWithCharacter = clone(save);
objectValue(saveWithCharacter).characterStates = {
  "npc-1": {
    attitude: 0,
    locationId: "location-1",
    status: "normal",
    memories: [],
  },
};
const missingMemories = clone(saveWithCharacter);
delete objectValue(
  property(property(missingMemories, "characterStates"), "npc-1"),
).memories;
assertStableFailure(missingMemories, "characterStates.npc-1.memories");

const invalidMessages = clone(save);
objectValue(invalidMessages).recentMessages = "invalid";
assertStableFailure(invalidMessages, "recentMessages");

const arrayAttributes = clone(save);
objectValue(property(arrayAttributes, "playerState")).attributes = [];
assertStableFailure(arrayAttributes, "playerState.attributes");

const numericTurn = clone(save);
objectValue(numericTurn).turn = "3";
assertStableFailure(numericTurn, "turn");

const nullPlayerState = clone(save);
objectValue(nullPlayerState).playerState = null;
assertStableFailure(nullPlayerState, "playerState");

for (const rootInput of [null, [], "invalid", 42]) {
  const result = prepareGameSave(rootInput);
  const issues = failureIssues(result);
  hasPath(issues, "$");
  assert.ok(
    issues.every(
      (issue) =>
        issue.stage === "final_validation" &&
        issue.operation === "validate_game_save" &&
        issue.recoverable === false &&
        issue.sourceVersion === null &&
        issue.targetVersion === null &&
        issue.migrationStep === null,
    ),
  );
}

for (const identityField of [
  "id",
  "projectId",
  "name",
  "createdAt",
  "updatedAt",
  "currentLocationId",
  "currentTime",
]) {
  const missingIdentity = clone(save);
  delete objectValue(missingIdentity)[identityField];
  assertStableFailure(missingIdentity, identityField);
}

const unknownFields = clone(save);
objectValue(unknownFields).unexpectedRoot = "root-secret-not-reported";
objectValue(property(unknownFields, "playerState")).unexpectedNested =
  "nested-secret-not-reported";
const unknownBefore = clone(unknownFields);
const unknownResult = prepareGameSave(unknownFields);
const unknownIssues = failureIssues(unknownResult);
hasPath(unknownIssues, "unexpectedRoot");
hasPath(unknownIssues, "playerState.unexpectedNested");
assert.equal(
  JSON.stringify(unknownResult).includes("secret-not-reported"),
  false,
);
assert.deepEqual(unknownFields, unknownBefore);

const unknownHistory = clone(saveWithHistory);
const firstSnapshot = arrayValue(property(unknownHistory, "history"))[0];
objectValue(firstSnapshot).unexpectedSnapshot = "snapshot-secret-not-reported";
const unknownHistoryResult = prepareGameSave(unknownHistory);
hasPath(failureIssues(unknownHistoryResult), "history.0.unexpectedSnapshot");
assert.equal(
  JSON.stringify(unknownHistoryResult).includes("snapshot-secret-not-reported"),
  false,
);

const inventedVersion = clone(save);
objectValue(inventedVersion).schemaVersion = 1;
assertStableFailure(inventedVersion, "schemaVersion");

const multipleProblems = clone(save);
objectValue(multipleProblems).id = 42;
delete objectValue(multipleProblems).history;
objectValue(property(multipleProblems, "playerState")).attributes = null;
const multipleResult = prepareGameSave(multipleProblems);
const multipleIssues = failureIssues(multipleResult);
hasPath(multipleIssues, "id");
hasPath(multipleIssues, "history");
hasPath(multipleIssues, "playerState.attributes");
assert.ok(multipleIssues.length >= 3);

const deterministicInputA = clone(saveWithHistory);
const deterministicInputB = clone(saveWithHistory);
assert.deepEqual(
  prepareGameSave(deterministicInputA),
  prepareGameSave(deterministicInputB),
);

const idempotentOnce = successResult(prepareGameSave(saveWithHistory));
const idempotentTwice = successResult(prepareGameSave(idempotentOnce.data));
assert.deepEqual(idempotentTwice.data, idempotentOnce.data);
assert.equal(idempotentTwice.migrated, false);
assert.equal(idempotentTwice.normalized, false);
assert.deepEqual(idempotentTwice.warnings, []);

const partiallyPlausible = clone(save);
delete objectValue(partiallyPlausible).history;
objectValue(partiallyPlausible).recentMessages = "invalid";
const finalFailure = prepareGameSave(partiallyPlausible);
const finalIssues = failureIssues(finalFailure);
hasPath(finalIssues, "history");
hasPath(finalIssues, "recentMessages");
assert.equal(Object.hasOwn(finalFailure, "data"), false);

const legacyItems = clone(save);
const legacyRoot = objectValue(legacyItems);
const legacyPlayerState = objectValue(property(legacyItems, "playerState"));
legacyPlayerState.inventory = [
  {
    id: "legacy-type",
    name: "Typed item",
    description: "Original type description.",
    quantity: 1,
    type: "key_item",
  },
  {
    id: "legacy-damage",
    name: "Damaging item",
    description: "Original damage description.",
    quantity: 1,
    damage: 5,
  },
  {
    id: "legacy-both",
    name: "Combined item",
    description: "Original combined description.",
    quantity: 1,
    type: "weapon",
    damage: 9,
  },
];
legacyPlayerState.equipment = [
  {
    id: "legacy-equipment",
    name: "Equipment",
    description: "Original equipment description.",
    quantity: 1,
    type: "armor",
    damage: 2,
  },
];
const legacySnapshot = objectValue(snapshot(save));
const legacySnapshotPlayerState = objectValue(
  property(legacySnapshot, "playerState"),
);
legacySnapshotPlayerState.inventory = [
  {
    id: "legacy-history-inventory",
    name: "Historical inventory",
    description: "Historical inventory description.",
    quantity: 1,
    type: "consumable",
  },
];
legacySnapshotPlayerState.equipment = [
  {
    id: "legacy-history-equipment",
    name: "Historical equipment",
    description: "Historical equipment description.",
    quantity: 1,
    damage: 3,
  },
];
legacyRoot.history = [legacySnapshot];

const legacyBefore = clone(legacyItems);
const legacyPrepared = successResult(prepareGameSave(legacyItems));
assert.equal(legacyPrepared.migrated, true);
assert.equal(GameSaveSchema.safeParse(legacyPrepared.data).success, true);
assert.deepEqual(legacyItems, legacyBefore);
assert.equal(legacyPrepared.data.id, property(legacyItems, "id"));
assert.equal(legacyPrepared.data.projectId, property(legacyItems, "projectId"));
assert.match(
  legacyPrepared.data.playerState.inventory[0].description,
  /Original type description\.\n\[历史属性：类型：key_item\]/,
);
assert.match(
  legacyPrepared.data.playerState.inventory[1].description,
  /Original damage description\.\n\[历史属性：伤害：5\]/,
);
assert.match(
  legacyPrepared.data.playerState.inventory[2].description,
  /Original combined description\.\n\[历史属性：类型：weapon；伤害：9\]/,
);
assert.match(
  legacyPrepared.data.playerState.equipment[0].description,
  /\[历史属性：类型：armor；伤害：2\]/,
);
assert.match(
  legacyPrepared.data.history[0].playerState.inventory[0].description,
  /\[历史属性：类型：consumable\]/,
);
assert.match(
  legacyPrepared.data.history[0].playerState.equipment[0].description,
  /\[历史属性：伤害：3\]/,
);
for (const item of [
  ...legacyPrepared.data.playerState.inventory,
  ...legacyPrepared.data.playerState.equipment,
  ...legacyPrepared.data.history[0].playerState.inventory,
  ...legacyPrepared.data.history[0].playerState.equipment,
]) {
  assert.equal(Object.hasOwn(item, "type"), false);
  assert.equal(Object.hasOwn(item, "damage"), false);
}
const legacyPreparedAgain = successResult(prepareGameSave(legacyPrepared.data));
assert.deepEqual(legacyPreparedAgain.data, legacyPrepared.data);
assert.equal(legacyPreparedAgain.migrated, false);
assert.deepEqual(legacyPreparedAgain.warnings, []);

const invalidLegacyType = clone(save);
objectValue(property(invalidLegacyType, "playerState")).inventory = [
  {
    id: "invalid-type",
    name: "Invalid type",
    description: "Invalid type fixture.",
    quantity: 1,
    type: 42,
  },
];
const invalidTypeBefore = clone(invalidLegacyType);
const invalidTypeResult = prepareGameSave(invalidLegacyType);
const invalidTypeIssues = failureIssues(invalidTypeResult);
hasPath(invalidTypeIssues, "playerState.inventory.0.type");
assert.equal(invalidTypeIssues[0].stage, "legacy_migration");
assert.equal(invalidTypeIssues[0].operation, "migrate_legacy_item");
assert.equal(invalidTypeIssues[0].migrationStep, "legacy_item_fields");
assert.deepEqual(invalidLegacyType, invalidTypeBefore);

const invalidLegacyDamage = clone(saveWithHistory);
const invalidDamageSnapshot = arrayValue(
  property(invalidLegacyDamage, "history"),
)[0];
objectValue(property(invalidDamageSnapshot, "playerState")).equipment = [
  {
    id: "invalid-damage",
    name: "Invalid damage",
    description: "Invalid damage fixture.",
    quantity: 1,
    damage: Number.POSITIVE_INFINITY,
  },
];
const invalidDamageBefore = clone(invalidLegacyDamage);
const invalidDamageResult = prepareGameSave(invalidLegacyDamage);
hasPath(
  failureIssues(invalidDamageResult),
  "history.0.playerState.equipment.0.damage",
);
assert.deepEqual(invalidLegacyDamage, invalidDamageBefore);

console.log("save migration tests passed");
