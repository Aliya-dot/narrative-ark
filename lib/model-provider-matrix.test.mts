import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const projectRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const [{ executeAiRequest }, { PROVIDERS }] = await Promise.all([
  import("./model-execution.ts"),
  import("./providers.ts"),
]);

type Runtime = {
  platform: "windows" | "android";
  native: true;
  supportsLoopbackOllama: boolean;
  supportsLanOllama: boolean;
};

const windowsRuntime: Runtime = {
  platform: "windows",
  native: true,
  supportsLoopbackOllama: true,
  supportsLanOllama: false,
};
const androidRuntime: Runtime = {
  platform: "android",
  native: true,
  supportsLoopbackOllama: false,
  supportsLanOllama: true,
};

function config(
  provider: string,
  baseUrl: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    provider,
    apiKey: provider === "ollama" ? "" : "fixture-api-key",
    baseUrl,
    model: "fixture-model",
    maxTokens: 4096,
    temperature: 0.7,
    topP: 0.9,
    timeout: 5,
    headers: {},
    ...overrides,
  };
}

function successResponse() {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: "连接成功" } }] }),
    { status: 200 },
  );
}

const providerCases = [
  {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    endpoint: "https://api.deepseek.com/chat/completions",
    runtime: windowsRuntime,
    authorization: true,
    thinking: { type: "disabled" },
  },
  {
    provider: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    endpoint:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    runtime: windowsRuntime,
    authorization: true,
    thinking: undefined,
  },
  {
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    runtime: windowsRuntime,
    authorization: false,
    thinking: undefined,
  },
  {
    provider: "ollama",
    baseUrl: "http://192.168.1.9:11434/v1",
    endpoint: "http://192.168.1.9:11434/v1/chat/completions",
    runtime: androidRuntime,
    authorization: false,
    thinking: undefined,
  },
];

for (const testCase of providerCases) {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await executeAiRequest(
    {
      action: "test",
      config: config(testCase.provider, testCase.baseUrl),
    },
    {
      runtime: testCase.runtime,
      network: {
        transport: "tauri-rust",
        async fetch(input, init) {
          requestUrl = String(input);
          requestInit = init;
          return successResponse();
        },
      },
    },
  );
  assert.equal(result.status, 200, `${testCase.provider} connection failed`);
  assert.equal(requestUrl, testCase.endpoint);
  const headers = new Headers(requestInit?.headers);
  assert.equal(
    headers.has("authorization"),
    testCase.authorization,
    `${testCase.provider} authorization policy differs`,
  );
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.model, "fixture-model");
  assert.equal(body.max_tokens, 64);
  assert.deepEqual(body.thinking, testCase.thinking);
}

for (const providerId of ["deepseek", "qwen", "ollama"]) {
  assert.ok(
    PROVIDERS.some((provider) => provider.id === providerId),
    `provider preset missing: ${providerId}`,
  );
}

async function faultResponse(
  fetcher: (init?: RequestInit) => Promise<Response>,
) {
  return executeAiRequest(
    {
      action: "test",
      config: config("deepseek", "https://api.deepseek.com"),
    },
    {
      runtime: windowsRuntime,
      network: {
        transport: "tauri-rust",
        async fetch(_input, init) {
          return fetcher(init);
        },
      },
    },
  );
}

const offline = await faultResponse(async () => {
  throw new TypeError("fetch failed");
});
assert.equal(offline.status, 500);
assert.match(String(offline.body.error), /无法连接模型接口/);

const unauthorized = await faultResponse(
  async () =>
    new Response(
      JSON.stringify({ error: { message: "invalid sk-secret-material" } }),
      { status: 401 },
    ),
);
assert.equal(unauthorized.status, 500);
assert.match(String(unauthorized.body.error), /身份验证失败/);
assert.doesNotMatch(String(unauthorized.body.error), /sk-secret-material/);

const rateLimited = await faultResponse(
  async () =>
    new Response(JSON.stringify({ error: { message: "quota" } }), {
      status: 429,
    }),
);
assert.equal(rateLimited.status, 500);
assert.match(String(rateLimited.body.error), /请求过于频繁|额度不足/);

const serviceFailure = await faultResponse(
  async () => new Response("upstream unavailable", { status: 503 }),
);
assert.equal(serviceFailure.status, 500);
assert.match(String(serviceFailure.body.error), /503/);

const malformed = await faultResponse(
  async () => new Response("not-json", { status: 200 }),
);
assert.equal(malformed.status, 500);
assert.match(String(malformed.body.error), /返回格式异常/);

const timedOut = await executeAiRequest(
  {
    action: "test",
    config: config("deepseek", "https://api.deepseek.com", { timeout: 0.01 }),
  },
  {
    runtime: windowsRuntime,
    network: {
      transport: "tauri-rust",
      async fetch(_input, init) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    },
  },
);
assert.equal(timedOut.status, 500);
assert.match(String(timedOut.body.error), /请求超时/);

console.log("model provider and failure matrix tests passed");
