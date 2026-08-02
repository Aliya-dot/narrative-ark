import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { NextRequest } from "next/server.js";

const projectRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (specifier.startsWith("@/")) {
      const target = new URL(`${specifier.slice(2)}.ts`, projectRoot);
      return nextResolve(target.href, context);
    }
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(projectRoot.href) &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const [{ POST }, { generationStageResultSchemas, openingStageResultSchema }] =
  await Promise.all([
    import("../app/api/ai/route.ts"),
    import("./generation-stage.ts"),
  ]);

const API_KEY = "ROUTE_TEST_API_KEY_MUST_NOT_LEAK";
const PROJECT_SECRET = "ROUTE_TEST_PROJECT_MUST_NOT_LEAK";
const MODEL_SECRET = "DO_NOT_LEAK_ROUTE_TEST_SECRET";

function request(stage: unknown) {
  const value = new NextRequest("https://app.example/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "generate",
      stage,
      config: {
        provider: "openai",
        apiKey: API_KEY,
        baseUrl: "https://model.example/v1",
        model: "route-test-model",
        maxTokens: 512,
        temperature: 0.5,
        topP: 0.9,
        timeout: 5,
        headers: {},
      },
      draft: {
        gameLength: "standard",
        marker: PROJECT_SECRET,
      },
      project: {
        projectInfo: {
          gameLength: "standard",
        },
        marker: PROJECT_SECRET,
      },
    }),
  });
  assert.ok(value instanceof Request);
  return value;
}

function providerResponse(result: unknown) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(result),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

async function withMockFetch<T>(
  mock: typeof globalThis.fetch,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    assert.equal(globalThis.fetch, originalFetch);
  }
}

type JsonRecord = Record<string, unknown>;

async function responseJson(response: Response): Promise<JsonRecord> {
  assert.ok(response instanceof Response);
  const value: unknown = await response.json();
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
  return value as JsonRecord;
}

function assertSecretsAbsent(value: unknown, ...secrets: string[]): void {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) {
    assert.equal(serialized.includes(secret), false);
  }
}

let checks = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  await run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

await check("invalid stage is rejected before the model request", async () => {
  let fetchCalls = 0;
  const response = await withMockFetch(
    async () => {
      fetchCalls += 1;
      throw new Error("unexpected model request");
    },
    () => POST(request("unsupported-stage")),
  );
  const body = await responseJson(response);
  assert.equal(response.status, 400);
  assert.equal(body.code, "invalid_stage");
  assert.equal(fetchCalls, 0);
  assert.equal("data" in body, false);
  assertSecretsAbsent(body, API_KEY, PROJECT_SECRET);
});

await check(
  "valid opening result returns the compatible data envelope",
  async () => {
    let fetchCalls = 0;
    const opening = "真实路由测试开场";
    const response = await withMockFetch(
      async () => {
        fetchCalls += 1;
        return providerResponse({ openingScene: opening });
      },
      () => POST(request("opening")),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 200);
    assert.equal(fetchCalls, 1);
    assert.deepEqual(body, { data: { openingScene: opening } });
    assert.equal(openingStageResultSchema.safeParse(body.data).success, true);
  },
);

await check("Ollama local preset works without an API key", async () => {
  let requestedUrl = "";
  let authorization: string | null = "not-checked";
  const localRequest = new NextRequest("http://localhost:3001/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "test",
      config: {
        provider: "ollama",
        apiKey: "",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen3:8b",
        maxTokens: 4096,
        temperature: 0.75,
        topP: 0.95,
        timeout: 120,
        headers: {},
      },
    }),
  });
  const response = await withMockFetch(
    async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization");
      return providerResponse("连接成功");
    },
    () => POST(localRequest),
  );
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(requestedUrl, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(authorization, null);
  assert.equal((body.data as JsonRecord).provider, "ollama");
});

await check(
  "invalid stage result returns 502 without partial data",
  async () => {
    let fetchCalls = 0;
    const response = await withMockFetch(
      async () => {
        fetchCalls += 1;
        return providerResponse({
          openingScene: 42,
          rawValue: MODEL_SECRET,
        });
      },
      () => POST(request("opening")),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 502);
    assert.equal(body.code, "invalid_stage_result");
    assert.equal(fetchCalls, 2);
    assert.equal("data" in body, false);
    assertSecretsAbsent(body, MODEL_SECRET, API_KEY, PROJECT_SECRET);
  },
);

await check(
  "an invalid stage result is repaired once before failing",
  async () => {
    let fetchCalls = 0;
    const response = await withMockFetch(
      async () => {
        fetchCalls += 1;
        return providerResponse(
          fetchCalls === 1
            ? { openingScene: 42 }
            : { openingScene: "协议修复后的合法开场" },
        );
      },
      () => POST(request("opening")),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 200);
    assert.equal(fetchCalls, 2);
    assert.deepEqual(body, {
      data: { openingScene: "协议修复后的合法开场" },
    });
    assertSecretsAbsent(body, API_KEY, PROJECT_SECRET);
  },
);

await check(
  "a direct world object receives the missing stage envelope",
  async () => {
    let fetchCalls = 0;
    const directWorld = {
      background: "测试背景",
      history: "测试历史",
      geography: "测试地理",
      locations: [],
      factions: [],
      races: [],
      religions: [],
      socialRules: [],
      powerSystem: "测试力量体系",
      currentCrisis: "测试危机",
      secrets: [],
    };
    const response = await withMockFetch(
      async () => {
        fetchCalls += 1;
        return providerResponse(directWorld);
      },
      () => POST(request("world")),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 200);
    assert.equal(fetchCalls, 1);
    assert.deepEqual(body, { data: { world: directWorld } });
    assertSecretsAbsent(body, API_KEY, PROJECT_SECRET);
  },
);

await check(
  "common structured world variants are normalized before validation",
  async () => {
    let fetchCalls = 0;
    const structuredWorld = {
      background: { summary: "测试背景", era: "玄幻时代" },
      history: ["开天", "立宗"],
      geography: "五域相连",
      locations: [
        {
          locationId: "cloud_city",
          title: "云城",
          summary: "浮于群峰之上",
          connections: [{ name: "剑宗" }],
          climate: "高寒",
        },
      ],
      factions: [
        {
          factionId: "sword_sect",
          title: "剑宗",
          summary: "以剑立道",
          attitude: "12",
          objective: "守护云城",
          influence: "强",
        },
      ],
      races: [{ name: "人族", description: "分布最广" }],
      religions: [{ title: "星神信仰", tenet: "敬畏星海" }],
      social_rules: [{ rule: "强者庇护弱者" }],
      power_system: { name: "灵力", description: "九境递进" },
      current_crisis: { summary: "灵脉衰竭" },
      secrets: [{ title: "灵脉核心", content: "已被人工封印" }],
    };
    const response = await withMockFetch(
      async () => {
        fetchCalls += 1;
        return providerResponse({ world: structuredWorld });
      },
      () => POST(request("world")),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 200);
    assert.equal(fetchCalls, 1);
    assert.deepEqual(body, {
      data: {
        world: {
          background: "测试背景；玄幻时代",
          history: "开天；立宗",
          geography: "五域相连",
          locations: [
            {
              id: "cloud_city",
              name: "云城",
              description: "浮于群峰之上",
              connections: ["剑宗"],
            },
          ],
          factions: [
            {
              id: "sword_sect",
              name: "剑宗",
              description: "以剑立道",
              attitude: 12,
              goal: "守护云城",
            },
          ],
          races: ["人族：分布最广"],
          religions: ["星神信仰：敬畏星海"],
          socialRules: ["强者庇护弱者"],
          powerSystem: "灵力：九境递进",
          currentCrisis: "灵脉衰竭",
          secrets: ["灵脉核心：已被人工封印"],
        },
      },
    });
    assertSecretsAbsent(body, API_KEY, PROJECT_SECRET);
  },
);

await check(
  "all generation stages normalize common model variants before validation",
  async () => {
    const fixtures: Array<{
      stage: keyof typeof generationStageResultSchemas;
      response: unknown;
    }> = [
      {
        stage: "analysis",
        response: {
          title: "异世之旅",
          summary: "穿越后的成长冒险",
          category: "东方玄幻",
          tone: "成长",
          creation_mode: "simple",
          freedom_mode: "hybrid",
          game_length: "standard",
        },
      },
      {
        stage: "characters",
        response: {
          protagonist: {
            name: "林渊",
            gender: "男",
            age: 22,
            race: "人族",
            role: "穿越者",
            background: { summary: "来自现代" },
            personality: ["冷静", "果断"],
            appearance: "黑发",
            goals: [{ content: "登临绝巅" }],
            talents: ["千风演算"],
            skills: [
              {
                abilityId: "inspect",
                title: "洞察",
                effect: "分析功法",
                level: "2",
                cooldown: "无",
              },
            ],
            weaknesses: [{ name: "灵力不足" }],
            attributes: [
              { name: "生命", value: "100" },
              { key: "灵力", initial: 80 },
            ],
            inventory: ["古玉"],
            equipment: [{ itemId: "robe", title: "青衫", content: "普通法衣" }],
            status_effects: [{ title: "健康", effect: "无异常" }],
          },
          npcs: [
            {
              characterId: "mentor",
              name: "苏玄",
              role: "师尊",
              age: 120,
              race: "人族",
              personality: ["清冷", "护短"],
              appearance: "白衣",
              background: "剑宗长老",
              abilities: [
                {
                  abilityId: "sword_domain",
                  title: "剑域",
                  effect: "压制敌人",
                  rank: 9,
                  range: "百丈",
                },
              ],
              relationshipToPlayer: "师徒",
              attitude: "80",
              objective: "培养主角",
              hiddenSecret: "身负旧伤",
              speech_style: "简洁",
              isImportant: true,
              canDie: false,
            },
          ],
        },
      },
      {
        stage: "system",
        response: {
          system: {
            level_system: { summary: "九境制" },
            attributes: [
              {
                attributeId: "hp",
                title: "生命",
                default: "100",
                maximum: "100",
                displayType: "progress",
                description: "生存状态",
              },
            ],
            combat_rules: ["回合判定", "属性克制"],
            task_rules: { summary: "目标制" },
            relationship_rules: "-100 到 100",
            death_rules: "主角可死亡",
            difficulty_rules: "动态难度",
            random_check_rules: "D100 检定",
          },
        },
      },
      {
        stage: "story",
        response: {
          plot: {
            main_goal: { summary: "解决灵脉危机" },
            opening_event: "山门遇袭",
            chapters: [
              {
                chapterId: "arrival",
                name: "初入山门",
                description: "拜入剑宗",
                objectives: [{ content: "通过考核" }],
                conflict: "外门竞争",
                keyCharacters: [{ name: "苏玄" }],
                turnRange: "1-10",
                isCompleted: false,
                extraBeat: "遇见对手",
              },
            ],
            side_quests: [
              {
                questId: "herb",
                name: "采药",
                summary: "收集灵草",
                state: "pending",
                goals: ["找到三株灵草"],
              },
            ],
            random_events: [
              {
                eventId: "storm",
                name: "灵暴",
                condition: "夜间",
                content: "灵力暴走",
              },
            ],
            endings: [
              {
                endingId: "ascend",
                name: "飞升",
                requirements: [{ content: "完成主线" }],
                summary: "破界而去",
              },
            ],
          },
        },
      },
      {
        stage: "prompts",
        response: {
          prompt_templates: {
            game_master_prompt: { content: "主持人规则" },
            opening_prompt: "开场规则",
            state_update_prompt: ["更新状态", "保持连续"],
            summary_prompt: "生成摘要",
            consistency_check_prompt: "检查一致性",
          },
        },
      },
      {
        stage: "consistency",
        response: {
          fixes: {
            game_system: {
              level_system: "九境制",
              attributes: [],
              combat_rules: "回合判定",
              task_rules: "目标制",
              relationship_rules: "-100 到 100",
              death_rules: "可死亡",
              difficulty_rules: "动态难度",
              random_check_rules: "D100",
            },
            plot: {
              main_goal: "修复灵脉",
              opening_event: "山门告急",
              chapters: [],
              side_quests: [],
              random_events: [],
              endings: [],
            },
            prompt_templates: {
              game_master_prompt: "主持人规则",
              opening_prompt: "",
              state_update_prompt: "",
              summary_prompt: "",
              consistency_check_prompt: "",
            },
            opening_scene: "不应超过三个修补模块",
          },
        },
      },
      {
        stage: "opening",
        response: {
          opening_scene: {
            content: "　　山门的钟声惊醒了林渊。\n\n　　他抬头看向云海。",
          },
        },
      },
    ];

    for (const fixture of fixtures) {
      let fetchCalls = 0;
      const response = await withMockFetch(
        async () => {
          fetchCalls += 1;
          return providerResponse(fixture.response);
        },
        () => POST(request(fixture.stage)),
      );
      const body = await responseJson(response);
      assert.equal(
        response.status,
        200,
        `${fixture.stage} failed: ${JSON.stringify(body)}`,
      );
      assert.equal(fetchCalls, 1, `${fixture.stage} unexpectedly retried`);
      assert.equal(
        generationStageResultSchemas[fixture.stage].safeParse(body.data)
          .success,
        true,
        `${fixture.stage} returned an invalid normalized payload`,
      );
      assertSecretsAbsent(body, API_KEY, PROJECT_SECRET);
    }
  },
);

await check(
  "root field injection is rejected without echoing its value",
  async () => {
    let fetchCalls = 0;
    const injectedValue = `${MODEL_SECRET}_ROOT`;
    const response = await withMockFetch(
      async () => {
        fetchCalls += 1;
        return providerResponse({
          openingScene: "合法开场",
          id: injectedValue,
        });
      },
      () => POST(request("opening")),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 502);
    assert.equal(body.code, "invalid_stage_result");
    assert.equal(fetchCalls, 2);
    assert.equal("data" in body, false);
    assertSecretsAbsent(body, injectedValue, API_KEY, PROJECT_SECRET);
  },
);

await check("validation errors redact model and request secrets", async () => {
  let fetchCalls = 0;
  const rawModelResult = {
    openingScene: null,
    nested: {
      secret: MODEL_SECRET,
    },
  };
  const response = await withMockFetch(
    async () => {
      fetchCalls += 1;
      return providerResponse(rawModelResult);
    },
    () => POST(request("opening")),
  );
  const body = await responseJson(response);
  assert.equal(response.status, 502);
  assert.equal(body.code, "invalid_stage_result");
  assert.equal(fetchCalls, 2);
  assert.equal("data" in body, false);
  assertSecretsAbsent(
    body,
    MODEL_SECRET,
    API_KEY,
    PROJECT_SECRET,
    JSON.stringify(rawModelResult),
  );
});

await check(
  "model network failure cannot become a success response",
  async () => {
    let fetchCalls = 0;
    const response = await withMockFetch(
      async () => {
        fetchCalls += 1;
        throw new TypeError("fetch failed");
      },
      () => POST(request("opening")),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 500);
    assert.equal(fetchCalls, 1);
    assert.equal("data" in body, false);
    assertSecretsAbsent(body, API_KEY, PROJECT_SECRET, MODEL_SECRET);
  },
);

console.log(
  `generation route tests passed (${checks} checks, no real network)`,
);
