import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { GameProjectSchema } from "./data-schemas.ts";
import type { ProjectPreparationResult } from "./project-migration.ts";
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
  title: "Legacy regression fixture",
  idea: "A fixture for historical generated project shapes",
  genre: "fantasy",
  protagonist: "Traveler",
  tone: "measured",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "simple",
};

function success(
  result: ProjectPreparationResult,
): Extract<ProjectPreparationResult, { success: true }> {
  if (!result.success) {
    assert.fail(
      `expected success; received ${result.code}: ${result.issues
        .map((issue) => issue.pathText)
        .join(", ")}`,
    );
  }
  return result;
}

const project = emptyProject(draft) as unknown as Record<string, unknown>;
const world = project.world as Record<string, unknown>;
world.religions = [
  {
    id: "legacy-faith",
    name: "Old faith",
    description: "A historical structured religion.",
  },
];
const combatDiagnostic = "战斗规则引用了未定义的属性，初始战斗需要重新校准。";
project.gameSystem = {
  ...combatDiagnostic,
  attributes: [],
};

const snapshot = {
  projectInfo: structuredClone(project.projectInfo),
  world: structuredClone(project.world),
  player: structuredClone(project.player),
  characters: structuredClone(project.characters),
  gameSystem: structuredClone(project.gameSystem),
  story: structuredClone(project.story),
  prompts: structuredClone(project.prompts),
  openingScene: project.openingScene,
};
project.settingsVersions = [
  {
    id: "legacy-settings-v1",
    projectId: project.id,
    versionNumber: 1,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    effectiveFromTurn: 0,
    settingsSnapshot: snapshot,
  },
];
project.currentSettingsVersionId = "legacy-settings-v1";
project.settingsVersionNumber = 1;

const before = structuredClone(project);
const migrated = success(prepareGameProject(project));
assert.equal(GameProjectSchema.safeParse(migrated.data).success, true);
assert.deepEqual(project, before);
assert.deepEqual(migrated.data.world.religions, [
  "Old faith：A historical structured religion.",
]);
assert.equal(migrated.data.gameSystem.combatRules, combatDiagnostic);
assert.deepEqual(migrated.data.gameSystem.attributes, []);
assert.equal(migrated.data.gameSystem.levelSystem, "");
assert.deepEqual(
  migrated.data.settingsVersions?.[0].settingsSnapshot.world.religions,
  migrated.data.world.religions,
);
assert.equal(
  migrated.data.settingsVersions?.[0].settingsSnapshot.gameSystem.combatRules,
  combatDiagnostic,
);
assert.deepEqual(
  success(prepareGameProject(migrated.data)).data,
  migrated.data,
);

const partialStageProject = emptyProject(draft) as unknown as Record<
  string,
  unknown
>;
const partialWorld = partialStageProject.world as Record<string, unknown>;
const partialStory = partialStageProject.story as Record<string, unknown>;
delete partialWorld.background;
delete partialWorld.history;
delete partialWorld.powerSystem;
delete partialStory.openingEvent;
const partialSnapshot = {
  projectInfo: structuredClone(partialStageProject.projectInfo),
  world: structuredClone(partialWorld),
  player: structuredClone(partialStageProject.player),
  characters: structuredClone(partialStageProject.characters),
  gameSystem: structuredClone(partialStageProject.gameSystem),
  story: structuredClone(partialStory),
  prompts: structuredClone(partialStageProject.prompts),
  openingScene: partialStageProject.openingScene,
};
const partialSnapshotWorld = partialSnapshot.world as Record<string, unknown>;
for (const field of [
  "locations",
  "factions",
  "races",
  "religions",
  "socialRules",
  "secrets",
]) {
  delete partialSnapshotWorld[field];
}
const partialSnapshotPlayer = partialSnapshot.player as Record<string, unknown>;
for (const field of [
  "talents",
  "skills",
  "attributes",
  "inventory",
  "equipment",
  "statusEffects",
]) {
  delete partialSnapshotPlayer[field];
}
const partialSnapshotStory = partialSnapshot.story as Record<string, unknown>;
for (const field of ["chapters", "sideQuests", "randomEvents", "endings"]) {
  delete partialSnapshotStory[field];
}
partialStageProject.settingsVersions = [
  {
    id: "legacy-partial-stage-v1",
    projectId: partialStageProject.id,
    versionNumber: 1,
    createdAt: partialStageProject.createdAt,
    updatedAt: partialStageProject.updatedAt,
    effectiveFromTurn: 0,
    settingsSnapshot: partialSnapshot,
  },
];
partialStageProject.currentSettingsVersionId = "legacy-partial-stage-v1";
partialStageProject.settingsVersionNumber = 1;
partialStageProject.options = [];
partialStageProject.stateUpdate = {};
partialStageProject.summary = "Legacy consistency-stage response artifact.";

const partialBefore = structuredClone(partialStageProject);
const partialMigrated = success(prepareGameProject(partialStageProject));
assert.deepEqual(partialStageProject, partialBefore);
assert.equal(partialMigrated.migrated, true);
assert.deepEqual(
  partialMigrated.warnings
    .filter((item) => item.code === "legacy_generated_field_defaulted")
    .map((item) => item.pathText),
  [
    "world.background",
    "world.history",
    "world.powerSystem",
    "story.openingEvent",
  ],
);
assert.equal(
  partialMigrated.warnings.filter(
    (item) => item.code === "legacy_initial_snapshot_field_restored",
  ).length,
  20,
);
assert.deepEqual(
  partialMigrated.warnings
    .filter(
      (item) => item.code === "legacy_generation_response_artifact_removed",
    )
    .map((item) => item.pathText),
  ["options", "stateUpdate", "summary"],
);
assert.equal(partialMigrated.data.world.background, "");
assert.equal(partialMigrated.data.world.history, "");
assert.equal(partialMigrated.data.world.powerSystem, "");
assert.equal(partialMigrated.data.story.openingEvent, "");
assert.equal(
  partialMigrated.data.settingsVersions?.[0].settingsSnapshot.world.background,
  "",
);
assert.equal(
  partialMigrated.data.settingsVersions?.[0].settingsSnapshot.story
    .openingEvent,
  "",
);
assert.deepEqual(
  partialMigrated.data.settingsVersions?.[0].settingsSnapshot.player.inventory,
  partialMigrated.data.player.inventory,
);
assert.equal(
  Object.hasOwn(partialMigrated.data as unknown as object, "options"),
  false,
);
assert.equal(
  Object.hasOwn(partialMigrated.data as unknown as object, "stateUpdate"),
  false,
);
assert.equal(
  Object.hasOwn(partialMigrated.data as unknown as object, "summary"),
  false,
);
assert.equal(GameProjectSchema.safeParse(partialMigrated.data).success, true);
assert.deepEqual(
  success(prepareGameProject(partialMigrated.data)).data,
  partialMigrated.data,
);

console.log("legacy generated project migration regression tests passed");
