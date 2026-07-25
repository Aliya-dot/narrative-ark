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

console.log("legacy generated project migration regression tests passed");
