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

const [{ POST }, { openingStageResultSchema }] = await Promise.all([
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
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
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

await check("valid opening result returns the compatible data envelope", async () => {
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
});

await check("invalid stage result returns 502 without partial data", async () => {
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
  assert.equal(fetchCalls, 1);
  assert.equal("data" in body, false);
  assertSecretsAbsent(body, MODEL_SECRET, API_KEY, PROJECT_SECRET);
});

await check("root field injection is rejected without echoing its value", async () => {
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
  assert.equal(fetchCalls, 1);
  assert.equal("data" in body, false);
  assertSecretsAbsent(body, injectedValue, API_KEY, PROJECT_SECRET);
});

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
  assert.equal(fetchCalls, 1);
  assert.equal("data" in body, false);
  assertSecretsAbsent(
    body,
    MODEL_SECRET,
    API_KEY,
    PROJECT_SECRET,
    JSON.stringify(rawModelResult),
  );
});

await check("model network failure cannot become a success response", async () => {
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
});

console.log(`generation route tests passed (${checks} checks, no real network)`);
