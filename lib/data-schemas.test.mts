import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  GameProjectSchema,
  GameSaveSchema,
  gameProjectSchema,
  gameSaveSchema,
  safeParseGameProject,
  safeParseGameSave,
  type DataParseResult,
  type DataValidationIssue,
} from "./data-schemas.ts";
import type {
  GameProject,
  GameSave,
  GenerationDraft,
} from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createSave, emptyProject, snapshot } = await import("./project.ts");

function clone(value: unknown): unknown {
  return structuredClone(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function property(value: unknown, key: string): unknown {
  return objectValue(value)[key];
}

function arrayValue(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

function failureIssues<T>(result: DataParseResult<T>): DataValidationIssue[] {
  if (result.success) {
    assert.fail("expected validation failure");
  }
  return result.issues;
}

function hasPath(issues: DataValidationIssue[], expected: string) {
  assert.ok(
    issues.some((issue) => issue.pathText === expected),
    `expected issue path ${expected}; received ${issues
      .map((issue) => issue.pathText)
      .join(", ")}`,
  );
}

const draft: GenerationDraft = {
  title: "群星遗迹",
  idea: "探索被遗忘的星港",
  genre: "科幻",
  protagonist: "失忆领航员",
  tone: "悬疑",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "advanced",
  supportingCharacters: [
    {
      id: "guide",
      name: "弦歌",
      identity: "星港向导",
      relationship: "盟友",
      appearance: "银色风衣",
      personality: "冷静",
      goal: "修复星图",
      specialAbility: "读取遗迹信号",
      secret: "曾属于旧舰队",
    },
  ],
};

const project = emptyProject(draft);
project.world.locations.push({
  id: "star-port",
  name: "星港",
  description: "漂浮在行星环上的遗迹",
  connections: ["archive"],
});
project.world.factions.push({
  id: "old-fleet",
  name: "旧舰队",
  description: "失联舰队的残部",
  attitude: 0,
  goal: "寻找主舰",
});
project.gameSystem.attributes.push({
  id: "insight",
  name: "洞察",
  initial: 1,
  max: 10,
  display: "bar",
});
project.story.chapters.push({
  id: "chapter-1",
  title: "失落信标",
  summary: "追踪星港信标",
  goals: ["进入档案库"],
  mainConflict: "旧舰队封锁",
  importantCharacters: ["guide"],
  estimatedTurnRange: { min: 1, max: 8 },
  completed: false,
});
project.story.sideQuests.push({
  id: "quest-1",
  title: "修复天线",
  description: "恢复星港通讯",
  status: "inactive",
  objectives: ["取得零件"],
});
project.story.randomEvents.push({
  id: "event-1",
  title: "余震",
  trigger: "进入档案库",
  description: "星港结构发生震动",
});
project.story.endings.push({
  id: "ending-1",
  title: "归航",
  conditions: ["修复星图"],
  description: "舰队重返航线",
});
project.worldBinding = {
  worldBookId: "world-book-1",
  worldBookVersionId: "world-book-version-1",
  worldBookVersionNumber: 1,
  scenarioId: "scenario-1",
  contextBudget: {
    mode: "balanced",
    maxTokens: 2400,
    maxEntries: 12,
  },
};
project.scenarioId = "scenario-1";

const projectBeforeParse = structuredClone(project);
const parsedProject = safeParseGameProject(project);
assert.equal(parsedProject.success, true);
if (parsedProject.success) {
  const typedProject: GameProject = parsedProject.data;
  assert.equal(typedProject.id, project.id);
  assert.notEqual(parsedProject.data, project);
}
assert.deepEqual(project, projectBeforeParse);
assert.equal(gameProjectSchema.safeParse(project).success, true);
assert.equal(GameProjectSchema, gameProjectSchema);

const save = createSave(project);
save.playerState.attributes.hp = 100;
save.activeQuests.push({
  id: "quest-1",
  title: "修复天线",
  description: "恢复星港通讯",
  status: "active",
  objectives: ["取得零件"],
  progress: ["定位损坏天线"],
});
save.lastWorldBookContext = {
  worldBookId: "world-book-1",
  worldBookVersionId: "world-book-version-1",
  worldBookName: "星港世界书",
  coreSummaryTokens: 100,
  injectedTokens: 200,
  fullBookTokens: 1000,
  estimatedSavingsPercent: 70,
  selected: [
    {
      entryId: "entry-1",
      title: "星港",
      visibility: "player_visible",
      score: 10,
      reasons: ["当前位置"],
      estimatedTokens: 200,
      injection: "full",
    },
  ],
  skipped: [
    {
      entryId: "entry-2",
      title: "隐秘航线",
      visibility: "ai_only",
      reason: "预算不足",
      score: 1,
      reasons: ["低相关度"],
    },
  ],
  createdAt: "2026-07-23T00:00:00.000Z",
};
save.history = [snapshot(save)];

const saveBeforeParse = structuredClone(save);
const parsedSave = safeParseGameSave(save);
assert.equal(parsedSave.success, true);
if (parsedSave.success) {
  const typedSave: GameSave = parsedSave.data;
  assert.equal(typedSave.id, save.id);
  assert.notEqual(parsedSave.data, save);
}
assert.deepEqual(save, saveBeforeParse);
assert.equal(gameSaveSchema.safeParse(save).success, true);
assert.equal(GameSaveSchema, gameSaveSchema);

const missingLocations = clone(project);
delete objectValue(property(missingLocations, "world")).locations;
const missingLocationsIssues = failureIssues(
  safeParseGameProject(missingLocations),
);
hasPath(missingLocationsIssues, "world.locations");
assert.equal(
  Object.hasOwn(objectValue(property(missingLocations, "world")), "locations"),
  false,
);

const invalidAbilities = clone(project);
const firstCharacter = arrayValue(property(invalidAbilities, "characters"))[0];
objectValue(firstCharacter).abilities = "not-an-array";
hasPath(
  failureIssues(safeParseGameProject(invalidAbilities)),
  "characters.0.abilities",
);

const missingHistory = clone(save);
delete objectValue(missingHistory).history;
hasPath(failureIssues(safeParseGameSave(missingHistory)), "history");

const invalidRuntimeAttribute = clone(save);
objectValue(
  property(property(invalidRuntimeAttribute, "playerState"), "attributes"),
).hp = "100";
hasPath(
  failureIssues(safeParseGameSave(invalidRuntimeAttribute)),
  "playerState.attributes.hp",
);

const projectRootUnknown = clone(project);
objectValue(projectRootUnknown).unexpectedRoot = "sensitive-value-not-reported";
const projectRootUnknownIssues = failureIssues(
  safeParseGameProject(projectRootUnknown),
);
hasPath(projectRootUnknownIssues, "unexpectedRoot");
assert.equal(
  JSON.stringify(projectRootUnknownIssues).includes(
    "sensitive-value-not-reported",
  ),
  false,
);
assert.equal(
  property(projectRootUnknown, "unexpectedRoot"),
  "sensitive-value-not-reported",
);

const projectNestedUnknown = clone(project);
objectValue(property(projectNestedUnknown, "world")).unexpectedNested = true;
hasPath(
  failureIssues(safeParseGameProject(projectNestedUnknown)),
  "world.unexpectedNested",
);

const saveRootUnknown = clone(save);
objectValue(saveRootUnknown).unexpectedSaveRoot = true;
hasPath(
  failureIssues(safeParseGameSave(saveRootUnknown)),
  "unexpectedSaveRoot",
);

const projectWithoutOptional = clone(project);
delete objectValue(property(projectWithoutOptional, "projectInfo")).storyLength;
delete objectValue(projectWithoutOptional).worldBinding;
delete objectValue(projectWithoutOptional).scenarioId;
assert.equal(safeParseGameProject(projectWithoutOptional).success, true);

const saveWithoutOptional = clone(save);
delete objectValue(saveWithoutOptional).settingsVersionId;
delete objectValue(saveWithoutOptional).settingsVersionNumber;
delete objectValue(saveWithoutOptional).turnDurationsMs;
delete objectValue(saveWithoutOptional).discoveredWorldBookEntryIds;
delete objectValue(saveWithoutOptional).lastWorldBookContext;
assert.equal(safeParseGameSave(saveWithoutOptional).success, true);

const multipleProjectErrors = clone(project);
objectValue(multipleProjectErrors).id = 42;
delete objectValue(property(multipleProjectErrors, "world")).locations;
objectValue(property(multipleProjectErrors, "player")).goals = null;
const multipleIssues = failureIssues(
  safeParseGameProject(multipleProjectErrors),
);
hasPath(multipleIssues, "id");
hasPath(multipleIssues, "world.locations");
hasPath(multipleIssues, "player.goals");
assert.ok(multipleIssues.length >= 3);

const numericString = clone(project);
objectValue(numericString).version = "1";
const numericStringBefore = structuredClone(numericString);
hasPath(failureIssues(safeParseGameProject(numericString)), "version");
assert.deepEqual(numericString, numericStringBefore);
assert.equal(property(numericString, "version"), "1");

const nullArray = clone(project);
objectValue(property(nullArray, "world")).locations = null;
hasPath(
  failureIssues(safeParseGameProject(nullArray)),
  "world.locations",
);
assert.equal(property(property(nullArray, "world"), "locations"), null);

console.log("project and save runtime schema regression tests passed");
