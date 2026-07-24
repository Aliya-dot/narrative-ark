import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { gameProjectSchema } from "./data-schemas.ts";
import type {
  GenerationStage,
  GenerationStageApplyResult,
  GenerationStageValidationResult,
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

const {
  applyGenerationStageResult,
  generationOwnedProjectFields,
  generationStages,
  validateGenerationStageResult,
} = await import("./generation-stage.ts");
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

function validationSuccess(
  result: GenerationStageValidationResult,
): Extract<GenerationStageValidationResult, { success: true }> {
  assert.equal(result.success, true);
  return result;
}

function validationFailure(
  result: GenerationStageValidationResult,
): Extract<GenerationStageValidationResult, { success: false }> {
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

function reverseObjectKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeyOrder);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeyOrder(child)]),
  );
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

check("pure validation accepts every real stage without a project", () => {
  const project = fixture();
  for (const stage of generationStages) {
    const input = legalResult(project, stage);
    const before = structuredClone(input);
    const output = validationSuccess(
      validateGenerationStageResult(stage, input),
    );
    assert.equal(output.stage, stage);
    assert.deepEqual(output.data, input);
    assert.deepEqual(input, before);
  }
});

check("pure validation preserves analysis patch semantics", () => {
  assert.deepEqual(
    validationSuccess(
      validateGenerationStageResult("analysis", { projectInfo: {} }),
    ).data,
    { projectInfo: {} },
  );
  assert.deepEqual(
    validationSuccess(
      validateGenerationStageResult("analysis", {
        projectInfo: { title: "partial" },
      }),
    ).data,
    { projectInfo: { title: "partial" } },
  );
  const explicitUndefined = validationFailure(
    validateGenerationStageResult("analysis", {
      projectInfo: { title: undefined },
    }),
  );
  assert.equal(explicitUndefined.pathText, "projectInfo.title");
});

check("pure validation rejects incomplete complete modules", () => {
  const project = fixture();
  const incompleteWorld = legalResult(project, "world");
  deleteAt(incompleteWorld, ["world", "background"]);
  assert.equal(
    validationFailure(
      validateGenerationStageResult("world", incompleteWorld),
    ).code,
    "invalid_stage_result",
  );

  const characters = legalResult(project, "characters");
  (record(characters).characters as unknown[])[0] = {
    id: "partial-character",
  };
  assert.ok(
    validationFailure(
      validateGenerationStageResult("characters", characters),
    ).issues.some((issue) => issue.pathText.startsWith("characters[0]")),
  );
});

check("pure validation enforces consistency ownership limits", () => {
  validationSuccess(validateGenerationStageResult("consistency", {}));
  const project = fixture();
  const fourModules = {
    world: structuredClone(project.world),
    story: structuredClone(project.story),
    prompts: structuredClone(project.prompts),
    player: structuredClone(project.player),
  };
  assert.equal(
    validationFailure(
      validateGenerationStageResult("consistency", fourModules),
    ).pathText,
    "$",
  );
  assert.ok(
    validationFailure(
      validateGenerationStageResult("consistency", { id: "injected" }),
    ).issues.some((issue) => issue.pathText === "id"),
  );
});

check("pure validation rejects all invalid runtime stages safely", () => {
  const rawMarker = "RAW-STAGE-VALIDATION-MARKER";
  for (const stage of [
    "unknown",
    "",
    null,
    42,
    [],
    { marker: rawMarker },
    undefined,
  ]) {
    const output = validationFailure(
      validateGenerationStageResult(stage, { marker: rawMarker }),
    );
    assert.equal(output.code, "invalid_stage");
    assert.equal(output.stage, null);
    assert.equal(JSON.stringify(output).includes(rawMarker), false);
  }
});

check("pure validation errors do not leak raw values", () => {
  const rawSecret = "RAW-VALIDATION-SECRET-314159";
  const output = validationFailure(
    validateGenerationStageResult("opening", {
      openingScene: 42,
      extra: rawSecret,
    }),
  );
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes(rawSecret), false);
  assert.equal("input" in output, false);
  assert.equal(output.pathText, "openingScene");
});

check("generate route guards stage before chat and validates its result", () => {
  const routeSource = readFileSync(
    new URL("../app/api/ai/route.ts", import.meta.url),
    "utf8",
  );
  const generateStart = routeSource.indexOf(
    'if (body.action === "generate")',
  );
  const moduleStart = routeSource.indexOf(
    'if (body.action === "module")',
    generateStart,
  );
  assert.ok(generateStart >= 0 && moduleStart > generateStart);

  const generateBranch = routeSource.slice(generateStart, moduleStart);
  const stageGuard = generateBranch.indexOf(
    "if (!isGenerationStage(body.stage))",
  );
  const modelCall = generateBranch.indexOf("const text = await chat(");
  const resultValidation = generateBranch.indexOf(
    "validateGenerationStageResult(stage, extractJson(text))",
  );
  assert.ok(stageGuard >= 0 && stageGuard < modelCall);
  assert.ok(resultValidation > modelCall);
  assert.ok(generateBranch.includes("data: result.data"));
  assert.equal(generateBranch.includes("z.record("), false);

  const nonGenerateSource =
    routeSource.slice(0, generateStart) + routeSource.slice(moduleStart);
  assert.equal(
    nonGenerateSource.includes(
      "validateGenerationStageResult(stage, extractJson(text))",
    ),
    false,
  );
});

check("generation page applies protected results through the safe entry point", () => {
  const pageSource = readFileSync(
    new URL("../app/generate/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const runStart = pageSource.indexOf("const run = useCallback(");
  const runEnd = pageSource.indexOf("useEffect(() => {", runStart);
  assert.ok(runStart >= 0 && runEnd > runStart);

  const runSource = pageSource.slice(runStart, runEnd);
  const request = runSource.indexOf("await generateStage(");
  const protection = runSource.indexOf("protectGeneratedProjectPatch(");
  const application = runSource.indexOf("applyGenerationStageResult(");
  const failureGuard = runSource.indexOf("if (!applied.success)");
  const projectCommit = runSource.indexOf("project: nextProject");
  assert.ok(request >= 0 && request < protection);
  assert.ok(protection < application);
  assert.ok(application < failureGuard && failureGuard < projectCommit);
  assert.equal(runSource.includes("...stageResult"), false);
  assert.equal(runSource.includes("...protectedResult"), false);
  assert.equal(runSource.includes("...patch"), false);
  assert.equal(runSource.includes("s.project = {"), false);
});

check("analysis accepts a partial patch and preserves omitted fields", () => {
  const project = fixture();
  const before = structuredClone(project.projectInfo);
  const output = success(
    applyGenerationStageResult(project, "analysis", {
      projectInfo: { title: "仅更新标题" },
    }),
  );
  assert.equal(output.changed, true);
  assert.equal(output.project.projectInfo.title, "仅更新标题");
  assert.equal(
    output.project.projectInfo.description,
    before.description,
  );
  assert.equal(output.project.projectInfo.genre, before.genre);
  assert.equal(output.project.projectInfo.tone, before.tone);
  assert.equal(output.project.projectInfo.creationMode, before.creationMode);
  assert.equal(output.project.projectInfo.freedomMode, before.freedomMode);
  assert.equal(output.project.projectInfo.gameLength, before.gameLength);
  assert.deepEqual(output.project.projectInfo.storyLength, before.storyLength);
});

check("analysis accepts an empty patch as a stable no-op", () => {
  const project = fixture();
  const output = success(
    applyGenerationStageResult(project, "analysis", { projectInfo: {} }),
  );
  assert.equal(output.changed, false);
  assert.deepEqual(output.project, project);
});

check("analysis rejects wrong types, undefined, unknowns, and storyLength", () => {
  const project = fixture();
  for (const projectInfo of [
    { title: 42 },
    { title: null },
    { title: undefined },
    { unknown: "field" },
    { storyLength: structuredClone(project.projectInfo.storyLength) },
  ]) {
    const output = failure(
      applyGenerationStageResult(project, "analysis", { projectInfo }),
    );
    assert.equal(output.code, "invalid_stage_result");
  }
});

check("every stage reports a missing required nested field", () => {
  const requiredPaths: Record<
    Exclude<GenerationStage, "analysis" | "consistency">,
    string[]
  > = {
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

check("characters rejects a partial array element", () => {
  const project = fixture();
  const input = record(legalResult(project, "characters"));
  assert.ok(Array.isArray(input.characters));
  delete record(input.characters[0]).name;
  const output = failure(
    applyGenerationStageResult(project, "characters", input),
  );
  assert.ok(
    output.issues.some((issue) => issue.pathText === "characters[0].name"),
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

check("failed page-style applications are atomic", () => {
  const project = fixture();
  const projectBefore = structuredClone(project);
  const inputs: Array<[GenerationStage, unknown]> = [
    ["world", { world: { background: "partial" } }],
    [
      "analysis",
      {
        projectInfo: {
          title: undefined,
        },
      },
    ],
    [
      "consistency",
      {
        id: "injected-id",
        updatedAt: "injected-time",
      },
    ],
  ];

  for (const [stage, input] of inputs) {
    const inputBefore = structuredClone(input);
    const output = failure(
      applyGenerationStageResult(project, stage, input),
    );
    assert.equal("project" in output, false);
    assert.deepEqual(project, projectBefore);
    assert.deepEqual(input, inputBefore);
  }
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

check("invalid runtime stages return structured failures without throwing", () => {
  const project = fixture();
  const rawMarker = "RAW-STAGE-MARKER";
  for (const stage of ["missing", "", null, 42, { rawMarker }]) {
    const output = failure(
      applyGenerationStageResult(
        project,
        stage,
        { openingScene: "ignored" },
      ),
    );
    assert.equal(output.code, "invalid_stage");
    assert.equal(output.stage, null);
    assert.equal(output.operation, "validate_stage");
    assert.equal(output.recoverable, true);
    assert.equal("project" in output, false);
    assert.equal(JSON.stringify(output).includes(rawMarker), false);
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

check("changed ignores object key order at every nesting level", () => {
  const project = fixture();
  const reordered = reverseObjectKeyOrder(project) as GameProject;
  assert.equal(gameProjectSchema.safeParse(reordered).success, true);
  const output = success(
    applyGenerationStageResult(reordered, "consistency", {}),
  );
  assert.equal(output.changed, false);
  assert.deepEqual(output.project, project);
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
  for (const forbidden of [
    "id",
    "version",
    "createdAt",
    "updatedAt",
    "settingsVersions",
    "currentSettingsVersionId",
    "settingsVersionNumber",
    "worldBinding",
    "scenarioId",
  ]) {
    const input: Record<string, unknown> = {};
    input[forbidden] = "forbidden";
    const output = failure(
      applyGenerationStageResult(project, "consistency", input),
    );
    assert.ok(output.issues.some((issue) => issue.pathText === forbidden));
  }
});

check("generation ownership is explicit and excludes project metadata", () => {
  assert.deepEqual(generationOwnedProjectFields, [
    "projectInfo",
    "world",
    "player",
    "characters",
    "gameSystem",
    "story",
    "prompts",
    "openingScene",
  ]);
});

check("empty consistency is a stable no-op", () => {
  const project = fixture();
  const output = success(
    applyGenerationStageResult(project, "consistency", {}),
  );
  assert.equal(output.changed, false);
  assert.deepEqual(output.project, project);
});

check("consistency projectInfo is a patch that preserves length metadata", () => {
  const project = fixture();
  const before = structuredClone(project.projectInfo);
  const titleOnly = success(
    applyGenerationStageResult(project, "consistency", {
      projectInfo: { title: "一致性标题" },
    }),
  );
  assert.equal(titleOnly.changed, true);
  assert.equal(titleOnly.project.projectInfo.title, "一致性标题");
  assert.equal(
    titleOnly.project.projectInfo.gameLength,
    before.gameLength,
  );
  assert.deepEqual(
    titleOnly.project.projectInfo.storyLength,
    before.storyLength,
  );

  const lengthUpdate = success(
    applyGenerationStageResult(project, "consistency", {
      projectInfo: { gameLength: "long" },
    }),
  );
  assert.equal(lengthUpdate.project.projectInfo.gameLength, "long");
  assert.deepEqual(
    lengthUpdate.project.projectInfo.storyLength,
    before.storyLength,
  );
});

check("consistency projectInfo rejects unknowns and storyLength injection", () => {
  const project = fixture();
  for (const projectInfo of [
    { unknown: "field" },
    { storyLength: structuredClone(project.projectInfo.storyLength) },
  ]) {
    const output = failure(
      applyGenerationStageResult(project, "consistency", { projectInfo }),
    );
    assert.equal(output.code, "invalid_stage_result");
  }
});

check("consistency applies one complete changed module", () => {
  const project = fixture();
  const world = structuredClone(project.world);
  world.background = "一致性修正后的世界";
  const output = success(
    applyGenerationStageResult(project, "consistency", { world }),
  );
  assert.equal(output.changed, true);
  assert.equal(output.project.world.background, world.background);
  assert.deepEqual(output.project.story, project.story);
});

check("consistency applies three changed modules and rejects four", () => {
  const project = fixture();
  const world = structuredClone(project.world);
  const story = structuredClone(project.story);
  const prompts = structuredClone(project.prompts);
  world.background = "新世界";
  story.mainGoal = "新目标";
  prompts.openingPrompt = "新开场规则";

  const allowed = success(
    applyGenerationStageResult(project, "consistency", {
      world,
      story,
      prompts,
    }),
  );
  assert.equal(allowed.changed, true);
  assert.equal(allowed.project.world.background, "新世界");
  assert.equal(allowed.project.story.mainGoal, "新目标");
  assert.equal(allowed.project.prompts.openingPrompt, "新开场规则");

  const output = failure(
    applyGenerationStageResult(project, "consistency", {
      world,
      story,
      prompts,
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
