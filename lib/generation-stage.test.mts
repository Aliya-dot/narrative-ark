import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { gameProjectSchema } from "./data-schemas.ts";
import type {
  GenerationStage,
  GenerationStageApplyResult,
} from "./generation-stage.ts";
import type { GameProject, GenerationDraft } from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { applyGenerationStageResult, generationStages } =
  await import("./generation-stage.ts");
const { emptyProject } = await import("./project.ts");

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

function fixture(): GameProject {
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
  return project;
}

function legalResult(project: GameProject, stage: GenerationStage): unknown {
  switch (stage) {
    case "analysis":
      return {
        projectInfo: {
          title: "新标题",
          description: "新简介",
          genre: "太空歌剧",
          tone: "壮阔",
          creationMode: "advanced",
          freedomMode: "open",
          gameLength: "long",
        },
      };
    case "world":
      return { world: structuredClone(project.world) };
    case "characters":
      return {
        player: structuredClone(project.player),
        characters: structuredClone(project.characters),
      };
    case "system":
      return { gameSystem: structuredClone(project.gameSystem) };
    case "story":
      return { story: structuredClone(project.story) };
    case "prompts":
      return { prompts: structuredClone(project.prompts) };
    case "consistency":
      return {};
    case "opening":
      return { openingScene: "星港在静默中苏醒。\n\n警报骤然响起。" };
  }
}

function success(
  result: GenerationStageApplyResult,
): Extract<GenerationStageApplyResult, { success: true }> {
  assert.equal(result.success, true);
  return result;
}

function failure(
  result: GenerationStageApplyResult,
): Extract<GenerationStageApplyResult, { success: false }> {
  assert.equal(result.success, false);
  return result;
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function deleteAt(value: unknown, path: string[]): void {
  let target = record(value);
  for (const part of path.slice(0, -1)) target = record(target[part]);
  delete target[path[path.length - 1]];
}

function setAt(value: unknown, path: string[], replacement: unknown): void {
  let target = record(value);
  for (const part of path.slice(0, -1)) target = record(target[part]);
  target[path[path.length - 1]] = replacement;
}

let checks = 0;
function check(name: string, run: () => void): void {
  run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

check("every real stage accepts its legal return shape", () => {
  const project = fixture();
  for (const stage of generationStages) {
    const output = success(
      applyGenerationStageResult(project, stage, legalResult(project, stage)),
    );
    assert.equal(output.stage, stage);
    assert.equal(gameProjectSchema.safeParse(output.project).success, true);
  }
});

check("every stage reports a missing required nested field", () => {
  const requiredPaths: Record<
    Exclude<GenerationStage, "consistency">,
    string[]
  > = {
    analysis: ["projectInfo", "title"],
    world: ["world", "background"],
    characters: ["player", "name"],
    system: ["gameSystem", "levelSystem"],
    story: ["story", "mainGoal"],
    prompts: ["prompts", "gameMasterPrompt"],
    opening: ["openingScene"],
  };
  const project = fixture();
  for (const [stage, path] of Object.entries(requiredPaths)) {
    const input = structuredClone(legalResult(project, stage as GenerationStage));
    deleteAt(input, path);
    const output = failure(
      applyGenerationStageResult(project, stage as GenerationStage, input),
    );
    assert.ok(output.issues.some((issue) => issue.pathText === path.join(".")));
  }
  const consistencyInput = { world: structuredClone(project.world) };
  deleteAt(consistencyInput, ["world", "background"]);
  const consistencyOutput = failure(
    applyGenerationStageResult(project, "consistency", consistencyInput),
  );
  assert.ok(
    consistencyOutput.issues.some(
      (issue) => issue.pathText === "world.background",
    ),
  );
});

check("array type errors have an exact field path", () => {
  const project = fixture();
  const input = legalResult(project, "world");
  setAt(input, ["world", "locations"], "not-an-array");
  const output = failure(applyGenerationStageResult(project, "world", input));
  assert.equal(output.pathText, "world.locations");
});

check("null nested objects are rejected", () => {
  const project = fixture();
  const output = failure(
    applyGenerationStageResult(project, "world", { world: null }),
  );
  assert.equal(output.pathText, "world");
});

check("an extra top-level module is rejected", () => {
  const project = fixture();
  const input = record(legalResult(project, "world"));
  input.story = structuredClone(project.story);
  const output = failure(applyGenerationStageResult(project, "world", input));
  assert.ok(output.issues.some((issue) => issue.pathText === "story"));
});

check("a root unknown field is rejected", () => {
  const project = fixture();
  const input = record(legalResult(project, "opening"));
  input.surprise = true;
  const output = failure(applyGenerationStageResult(project, "opening", input));
  assert.ok(output.issues.some((issue) => issue.pathText === "surprise"));
});

check("a nested unknown field is rejected without silent stripping", () => {
  const project = fixture();
  const input = legalResult(project, "world");
  setAt(input, ["world", "unexpected"], "secret-value");
  const output = failure(applyGenerationStageResult(project, "world", input));
  assert.ok(
    output.issues.some((issue) => issue.pathText === "world.unexpected"),
  );
});

check("stage and return field mismatch is rejected", () => {
  const project = fixture();
  const output = failure(
    applyGenerationStageResult(
      project,
      "story",
      legalResult(project, "world"),
    ),
  );
  assert.ok(output.issues.some((issue) => issue.pathText === "story"));
  assert.ok(output.issues.some((issue) => issue.pathText === "world"));
});

check("a partial world cannot replace the complete world", () => {
  const project = fixture();
  const output = failure(
    applyGenerationStageResult(project, "world", {
      world: { background: "only one field" },
    }),
  );
  assert.ok(output.issues.length > 1);
  assert.equal(output.success, false);
});

check("only modules owned by a stage change", () => {
  const project = fixture();
  const input = legalResult(project, "world");
  setAt(input, ["world", "background"], "更新后的背景");
  const output = success(
    applyGenerationStageResult(project, "world", input),
  ).project;
  assert.equal(output.world.background, "更新后的背景");
  assert.deepEqual(output.projectInfo, project.projectInfo);
  assert.deepEqual(output.player, project.player);
  assert.deepEqual(output.characters, project.characters);
  assert.deepEqual(output.gameSystem, project.gameSystem);
  assert.deepEqual(output.story, project.story);
  assert.deepEqual(output.prompts, project.prompts);
  assert.equal(output.openingScene, project.openingScene);
  assert.equal(output.id, project.id);
  assert.equal(output.createdAt, project.createdAt);
  assert.equal(output.updatedAt, project.updatedAt);
});

check("source project and AI input are not mutated", () => {
  const project = fixture();
  const input = legalResult(project, "characters");
  const projectBefore = structuredClone(project);
  const inputBefore = structuredClone(input);
  success(applyGenerationStageResult(project, "characters", input));
  assert.deepEqual(project, projectBefore);
  assert.deepEqual(input, inputBefore);
});

check("every successful output passes the complete project schema", () => {
  const project = fixture();
  for (const stage of generationStages) {
    const output = success(
      applyGenerationStageResult(project, stage, legalResult(project, stage)),
    );
    assert.equal(gameProjectSchema.safeParse(output.project).success, true);
  }
});

check("an invalid source returns no partial project", () => {
  const project: unknown = fixture();
  setAt(project, ["world", "locations"], null);
  const output = failure(
    applyGenerationStageResult(
      project as GameProject,
      "opening",
      { openingScene: "开场" },
    ),
  );
  assert.equal(output.code, "invalid_source_project");
  assert.equal(output.operation, "validate_source_project");
  assert.equal("project" in output, false);
});

check("a final project validation failure returns no partial project", () => {
  const project = fixture();
  const originalStructuredClone = globalThis.structuredClone;
  globalThis.structuredClone = function structuredCloneWithInvalidRoot<T>(
    value: T,
  ): T {
    const clone = originalStructuredClone(value);
    if (
      clone !== null &&
      typeof clone === "object" &&
      !Array.isArray(clone) &&
      Object.hasOwn(clone, "projectInfo")
    ) {
      record(clone).id = 42;
    }
    return clone;
  };
  try {
    const output = failure(
      applyGenerationStageResult(
        project,
        "opening",
        legalResult(project, "opening"),
      ),
    );
    assert.equal(output.code, "invalid_final_project");
    assert.equal(output.operation, "validate_final_project");
    assert.equal(output.pathText, "id");
    assert.equal("project" in output, false);
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
});

check("multiple errors are aggregated with exact paths", () => {
  const project = fixture();
  const input = legalResult(project, "world");
  deleteAt(input, ["world", "background"]);
  setAt(input, ["world", "locations"], "wrong");
  setAt(input, ["world", "factions"], null);
  const output = failure(applyGenerationStageResult(project, "world", input));
  const paths = output.issues.map((issue) => issue.pathText);
  assert.ok(paths.includes("world.background"));
  assert.ok(paths.includes("world.locations"));
  assert.ok(paths.includes("world.factions"));
});

check("the public function is deterministic", () => {
  const project = fixture();
  const input = legalResult(project, "opening");
  assert.deepEqual(
    applyGenerationStageResult(project, "opening", input),
    applyGenerationStageResult(project, "opening", input),
  );
});

check("reapplying an identical valid stage result is stable", () => {
  const project = fixture();
  const input = legalResult(project, "opening");
  const first = success(
    applyGenerationStageResult(project, "opening", input),
  );
  const second = success(
    applyGenerationStageResult(first.project, "opening", input),
  );
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.project, first.project);
});

check("errors do not leak raw field values or projects", () => {
  const project = fixture();
  const rawSecret = "RAW-SECRET-927451";
  const output = failure(
    applyGenerationStageResult(project, "opening", {
      openingScene: 42,
      leaked: rawSecret,
    }),
  );
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes(rawSecret), false);
  assert.equal(serialized.includes(project.id), false);
  assert.equal("project" in output, false);
  assert.equal("input" in output, false);
});

check("non-object, array, string, and null root inputs are rejected", () => {
  const project = fixture();
  for (const input of [42, [], "text", null]) {
    const output = failure(
      applyGenerationStageResult(project, "opening", input),
    );
    assert.equal(output.code, "invalid_stage_result");
    assert.equal(output.pathText, "$");
  }
});

check("stages cannot modify identity, timestamps, or unrelated roots", () => {
  const project = fixture();
  for (const forbidden of ["id", "createdAt", "updatedAt", "version"]) {
    const input = record(legalResult(project, "opening"));
    input[forbidden] = "forbidden";
    const output = failure(
      applyGenerationStageResult(project, "opening", input),
    );
    assert.ok(output.issues.some((issue) => issue.pathText === forbidden));
  }
});

check("consistency accepts at most three complete known modules", () => {
  const project = fixture();
  const allowed = success(
    applyGenerationStageResult(project, "consistency", {
      world: structuredClone(project.world),
      story: structuredClone(project.story),
      prompts: structuredClone(project.prompts),
    }),
  );
  assert.equal(allowed.changed, false);

  const output = failure(
    applyGenerationStageResult(project, "consistency", {
      world: structuredClone(project.world),
      story: structuredClone(project.story),
      prompts: structuredClone(project.prompts),
      player: structuredClone(project.player),
    }),
  );
  assert.equal(output.pathText, "$");
});

check("analysis preserves the final-only story length metadata", () => {
  const project = fixture();
  const storyLength = structuredClone(project.projectInfo.storyLength);
  const output = success(
    applyGenerationStageResult(
      project,
      "analysis",
      legalResult(project, "analysis"),
    ),
  );
  assert.deepEqual(output.project.projectInfo.storyLength, storyLength);
});

console.log(`generation-stage tests passed (${checks} checks)`);
