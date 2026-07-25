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
  title: "Legacy settings fixture",
  idea: "A fixture for a historical settings snapshot",
  genre: "fantasy",
  protagonist: "Traveler",
  tone: "measured",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "simple",
};
const project = emptyProject(draft) as unknown as Record<string, unknown>;
const historicalRules = "历史设置快照中的战斗规则文本。";
project.settingsVersions = [
  {
    id: "legacy-settings-v1",
    projectId: project.id,
    versionNumber: 1,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    effectiveFromTurn: 0,
    settingsSnapshot: {
      projectInfo: structuredClone(project.projectInfo),
      world: structuredClone(project.world),
      player: structuredClone(project.player),
      characters: structuredClone(project.characters),
      gameSystem: historicalRules,
      story: structuredClone(project.story),
      prompts: structuredClone(project.prompts),
      openingScene: project.openingScene,
    },
  },
];
project.currentSettingsVersionId = "legacy-settings-v1";
project.settingsVersionNumber = 1;

const before = structuredClone(project);
const result: ProjectPreparationResult = prepareGameProject(project);
if (!result.success) {
  assert.fail(
    `expected success; received ${result.code}: ${result.issues
      .map((issue) => issue.pathText)
      .join(", ")}`,
  );
}
assert.equal(GameProjectSchema.safeParse(result.data).success, true);
assert.deepEqual(project, before);
assert.equal(
  result.data.settingsVersions?.[0].settingsSnapshot.gameSystem.combatRules,
  historicalRules,
);
const again = prepareGameProject(result.data);
if (!again.success) {
  assert.fail(`expected idempotent success; received ${again.code}`);
}
assert.deepEqual(again.data, result.data);

console.log("legacy settings snapshot migration tests passed");
