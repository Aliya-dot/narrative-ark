import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const { executeAiRequest } = await import("./model-execution.ts");
const requestedUrls: string[] = [];
const requestedHeaders: Headers[] = [];
const requestedBodies: Array<Record<string, unknown>> = [];
const context = {
  network: {
    transport: "tauri-rust" as const,
    async fetch(input: string | URL | Request, init?: RequestInit) {
      requestedUrls.push(String(input));
      requestedHeaders.push(new Headers(init?.headers));
      requestedBodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "连接成功" } }],
        }),
        { status: 200 },
      );
    },
  },
  runtime: {
    platform: "android" as const,
    native: true,
    supportsLoopbackOllama: false,
    supportsLanOllama: true,
  },
};

const result = await executeAiRequest(
  {
    action: "test",
    config: {
      provider: "ollama",
      apiKey: "",
      baseUrl: "http://192.168.1.9:11434/v1",
      model: "fixture-model",
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.9,
      timeout: 5,
      headers: {},
    },
  },
  context,
);

assert.equal(result.status, 200);
assert.equal(requestedUrls[0], "http://192.168.1.9:11434/v1/chat/completions");
assert.equal(requestedHeaders[0]?.get("authorization"), null);
assert.equal(requestedBodies[0]?.max_tokens, 64);

const segmentedResult = await executeAiRequest(
  {
    action: "test",
    config: {
      provider: "openai",
      apiKey: "fixture-key",
      baseUrl: "https://model.example/v1",
      model: "fixture-model",
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.9,
      timeout: 5,
      headers: {},
    },
  },
  {
    ...context,
    network: {
      transport: "tauri-rust" as const,
      async fetch() {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    { type: "text", text: "连接" },
                    { type: "text", text: "成功" },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    },
  },
);
assert.equal(segmentedResult.status, 200);

const world = {
  background: "fixture background",
  history: "fixture history",
  geography: "fixture geography",
  locations: [],
  factions: [],
  races: [],
  religions: [],
  socialRules: [],
  powerSystem: "fixture power",
  currentCrisis: "fixture crisis",
  secrets: [],
};
const retryBodies: Array<Record<string, unknown>> = [];
let retryCalls = 0;
const retryResult = await executeAiRequest(
  {
    action: "generate",
    stage: "world",
    config: {
      provider: "custom",
      apiKey: "fixture-key",
      baseUrl: "https://model.example/v1",
      model: "fixture-reasoning-model",
      maxTokens: 4096,
      temperature: 0.75,
      topP: 0.95,
      timeout: 5,
      headers: {},
    },
    draft: { gameLength: "standard" },
    project: {},
  },
  {
    ...context,
    network: {
      transport: "tauri-rust" as const,
      async fetch(_input: string | URL | Request, init?: RequestInit) {
        retryCalls += 1;
        retryBodies.push(JSON.parse(String(init?.body)));
        if (retryCalls === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content:
                      '{"world":{"background":"truncated before closing"',
                  },
                  finish_reason: "length",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ world }),
                },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200 },
        );
      },
    },
  },
);
assert.equal(retryResult.status, 200);
assert.deepEqual(retryResult.body.data, { world });
assert.equal(retryCalls, 2);
assert.equal(retryBodies[0]?.max_tokens, 6000);
assert.equal(retryBodies[1]?.max_tokens, 12000);
assert.equal(retryBodies[1]?.temperature, 0.5);
assert.equal(
  Array.isArray(retryBodies[1]?.messages),
  true,
  "retry must append a direct-output instruction",
);
assert.match(
  String(
    (
      retryBodies[1]?.messages as Array<{ role: string; content: string }>
    ).at(-1)?.content,
  ),
  /JSON 没有闭合/,
);

const clientSource = await readFile(
  new URL("./ai-client.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(clientSource, /["']\/api\/ai["']/);
assert.match(clientSource, /executeAiRequest/);

console.log("model execution tests passed");
