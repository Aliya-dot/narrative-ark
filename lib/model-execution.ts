import type {
  NetworkGateway,
  RuntimeCapabilities,
} from "./platform/capabilities";
import { resolveModelEndpoint } from "./platform/model-endpoint-policy";

export interface ModelExecutionContext {
  network: NetworkGateway;
  runtime: RuntimeCapabilities;
  signal?: AbortSignal;
}

export interface AiExecutionResponse {
  status: number;
  body: Record<string, unknown>;
}

function json(
  body: Record<string, unknown>,
  status = 200,
): AiExecutionResponse {
  return { status, body };
}
import { extractJson, parseTurnResponse } from "./schemas";
import { validateCustomHeaders } from "./ai-config";
import { PROVIDERS } from "./providers";
import {
  chapterForTurn,
  lengthPlanningInstruction,
  turnPacingInstruction,
} from "./story-length";
import type { GameProject, GameSave, WorldBookTurnContext } from "./types";
import {
  creationFieldPrompt,
  creationFieldResultSchema,
  creationIdeasPrompt,
  creationIdeasResultSchema,
  creationPagePrompt,
  creationPageResultSchema,
  creationSystemRule,
  findCreationField,
  resolveIdeaCandidateFields,
  sanitizePageFields,
} from "./creation-ai";
import { z } from "zod";
import {
  sanitizeGeneratedWorldBookDraft,
  worldBookEntryPrompt,
  worldBookEntryRequestSchema,
  worldBookGenerationPrompt,
  worldBookGenerationRequestSchema,
  worldBookSystemPrompt,
} from "./world-book-ai";
import {
  isGenerationStage,
  validateGenerationStageResult,
} from "./generation-stage";
type Config = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  timeout: number;
  headers?: Record<string, string>;
  parameterSupport?: {
    temperature: boolean;
    topP: boolean;
    maxTokens: boolean;
  };
};

interface AiRequestBody {
  [key: string]: unknown;
  action?: unknown;
  config?: unknown;
  context?: { project?: { numericSystem?: unknown } };
  draft?: {
    gameLength?: unknown;
    creationMeta?: { lockedFields?: unknown };
  };
  project?: GameProject;
  save?: GameSave;
}
function providerDetail(text: string) {
  try {
    const parsed = JSON.parse(text);
    const detail = parsed?.error?.message ?? parsed?.message;
    if (typeof detail === "string") {
      return detail
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[密钥已隐藏]")
        .slice(0, 300);
    }
  } catch {
    // 非 JSON 错误响应不直接回传，避免泄露服务商页面或网关信息。
  }
  return "";
}
function friendly(status: number, text: string) {
  const detail = providerDetail(text);
  if (status === 401 || status === 403)
    return "身份验证失败，请检查 API Key 是否正确、已启用并拥有调用权限";
  if (status === 402) return "账户余额不足，请前往服务商平台检查余额";
  if (status === 404) return "没有找到接口或模型，请检查 Base URL 和模型名称";
  if (status === 429)
    return "请求过于频繁或账户额度不足，请稍后重试并检查服务商余额";
  if (text.includes("context")) return "上下文过长，请缩短内容";
  if (status === 400)
    return detail ? `请求格式无效：${detail}` : "请求格式无效，请检查模型参数";
  if (status === 422)
    return detail ? `请求参数无效：${detail}` : "请求参数不受当前模型支持";
  return `服务商请求失败（${status}）`;
}

type ChatResponse = {
  content: string;
  finishReason: string;
};

function responseText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value))
    return value
      .map((part) => responseText(part))
      .filter(Boolean)
      .join("")
      .trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return (
    responseText(record.text) ||
    responseText(record.content) ||
    responseText(record.output_text)
  );
}

function parseChatResponse(raw: string, structured: boolean): ChatResponse {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("服务商返回格式异常");
  }

  const detail = providerDetail(raw);
  if (body.error) {
    throw new Error(detail ? `服务商返回错误：${detail}` : "服务商返回了错误");
  }

  const choices = Array.isArray(body.choices) ? body.choices : [];
  const choice =
    choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : {};
  const message =
    choice.message && typeof choice.message === "object"
      ? (choice.message as Record<string, unknown>)
      : {};
  const finishReason = String(
    choice.finish_reason ?? body.finish_reason ?? "未说明",
  );
  const content =
    responseText(message.content) ||
    responseText(choice.text) ||
    responseText(body.output_text);
  if (content) return { content, finishReason };

  // A few OpenAI-compatible gateways put the final JSON in the reasoning field.
  // Only accept it when it is already a complete JSON value; partial reasoning
  // from a token-limited response must go through the controlled retry below.
  if (structured && finishReason !== "length") {
    const reasoning = responseText(
      message.reasoning_content ?? message.reasoning,
    );
    if (reasoning) {
      try {
        extractJson(reasoning);
        return { content: reasoning, finishReason };
      } catch {
        // Keep treating incomplete reasoning as an empty final response.
      }
    }
  }
  return { content: "", finishReason };
}

function isCompleteStructuredContent(content: string): boolean {
  if (!content) return false;
  try {
    extractJson(content);
    return true;
  } catch {
    return false;
  }
}

async function chatAttempt(
  context: ModelExecutionContext,
  config: Config,
  payload: Record<string, unknown>,
): Promise<ChatResponse> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (context.signal?.aborted) {
    controller.abort();
  } else {
    context.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(),
    (config.timeout || 60) * 1000,
  );
  try {
    const res = await context.network.fetch(
      resolveModelEndpoint(config.baseUrl, config.provider, context.runtime),
      {
        method: "POST",
        headers: {
          ...validateCustomHeaders(config.headers || {}),
          ...(config.provider === "ollama" || !config.apiKey?.trim()
            ? {}
            : { Authorization: `Bearer ${config.apiKey}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    const raw = await res.text();
    if (!res.ok) throw new Error(friendly(res.status, raw));
    return parseChatResponse(raw, Boolean(payload.response_format));
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function chat(
  context: ModelExecutionContext,
  config: Config,
  messages: { role: string; content: string }[],
  json = true,
  maxTokensOverride?: number,
) {
  const support = config.parameterSupport ?? {
    temperature: true,
    topP: true,
    maxTokens: true,
  };
  const providerOptions =
    PROVIDERS.find((provider) => provider.id === config.provider)
      ?.requestBody ?? {};
  const requestedMaxTokens = (maxTokensOverride ?? config.maxTokens) || 4096;
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    ...providerOptions,
    ...(support.temperature ? { temperature: config.temperature ?? 0.75 } : {}),
    ...(support.topP ? { top_p: config.topP ?? 0.95 } : {}),
    ...(support.maxTokens ? { max_tokens: requestedMaxTokens } : {}),
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };

  const first = await chatAttempt(context, config, payload);
  if (first.content && (!json || isCompleteStructuredContent(first.content)))
    return first.content;
  if (context.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const retryMaxTokens = Math.min(
    Math.max(requestedMaxTokens * 2, json ? 4096 : 256),
    16000,
  );
  const retryMessages = [
    ...messages,
    {
      role: "user",
      content: json
        ? "上次响应正文为空、被截断或 JSON 没有闭合。请压缩描述，省略思考过程，直接从头重新输出一个完整、可解析的 JSON 对象。完整性优先于细节，不要 Markdown。"
        : "上次响应正文为空。请省略思考过程，直接给出最终答案。",
    },
  ];
  const retryPayload: Record<string, unknown> = {
    ...payload,
    messages: retryMessages,
    ...(support.temperature
      ? { temperature: Math.min(config.temperature ?? 0.75, 0.5) }
      : {}),
    ...(support.maxTokens ? { max_tokens: retryMaxTokens } : {}),
  };
  const second = await chatAttempt(context, config, retryPayload);
  if (second.content && (!json || isCompleteStructuredContent(second.content)))
    return second.content;
  if (second.content && json) {
    // Reuse the shared friendly parse error so generation state remains
    // recoverable and no incomplete module is persisted.
    extractJson(second.content);
  }
  throw new Error(
    `模型连续两次未返回正文（结束原因：${second.finishReason || first.finishReason}）`,
  );
}
const stageSpecs: Record<string, string> = {
  analysis:
    '返回 {"projectInfo":{"title","description","genre","tone","creationMode":"simple|advanced","freedomMode":"linear|hybrid|open","gameLength":"short|standard|long|endless"}}。gameLength 必须严格沿用用户选择。',
  world:
    '返回 {"world":{"background":"","history":"","geography":"","locations":[{"id":"","name":"","description":"","connections":["相连地点ID"]}],"factions":[{"id":"","name":"","description":"","attitude":0,"goal":""}],"races":["种族名：简述"],"religions":["信仰名：简述"],"socialRules":["社会规则"],"powerSystem":"","currentCrisis":"","secrets":["秘密内容"]}}。races、religions、socialRules、secrets 及 connections 的每一项都必须是字符串，不得返回对象；powerSystem 和 currentCrisis 也必须是字符串。必须控制总长度并一次闭合 JSON：background、history、geography、powerSystem、currentCrisis 各不超过 220 个汉字；locations 生成 4-6 项，每项 description 不超过 100 个汉字；factions 生成 2-4 项，每项 description 与 goal 各不超过 80 个汉字；races、religions、socialRules、secrets 各生成 2-5 条，每条不超过 60 个汉字。完整结构优先于扩写细节。',
  characters:
    '返回 {"player":{"name":"","gender":"","age":"","race":"","identity":"","background":"","personality":"","appearance":"","goals":[""],"talents":[{"id":"","name":"","description":"","level":1}],"skills":[{"id":"","name":"","description":"","level":1}],"weaknesses":[""],"attributes":{"\u5c5e\u6027\u540d":0},"inventory":[{"id":"","name":"","description":"","quantity":1}],"equipment":[{"id":"","name":"","description":"","quantity":1}],"statusEffects":[{"id":"","name":"","description":"","duration":1}]},"characters":[{"id":"","name":"","identity":"","age":"","race":"","personality":"","appearance":"","background":"","abilities":[{"id":"","name":"","description":"","level":1}],"relationship":"","attitude":0,"goal":"","secret":"","speechStyle":"","important":true,"mortal":true}]}。talents、skills、abilities 的每项只能包含 id、name、description 和可选数字 level；不要添加 type、range、cooldown 等字段。inventory 与 equipment 严格使用 id、name、description、quantity。严格保留并完善用户填写的主角与主要配角设定，不得擅自改名、改变核心性格、关系、目标或特殊能力；用户未添加配角时，再按所选篇幅需要补足有独立目标的 NPC，不要机械固定数量。',
  system:
    '返回 {"gameSystem":{"levelSystem":"","attributes":[{"id":"","name":"","initial":0,"max":100,"display":"bar|number"}],"combatRules":"","taskRules":"","relationshipRules":"","deathRules":"","difficultyRules":"","randomCheckRules":""}}。attributes 的 initial 和 max 必须是数字，display 只能是 bar 或 number，各规则字段必须是字符串。',
  story:
    '返回 {"story":{"mainGoal":"","openingEvent":"","chapters":[{"id":"","title":"","summary":"","goals":[""],"mainConflict":"","importantCharacters":["\u89d2\u8272ID"],"estimatedTurnRange":{"min":1,"max":10},"completed":false}],"sideQuests":[{"id":"","title":"","description":"","status":"inactive","objectives":[""]}],"randomEvents":[{"id":"","title":"","trigger":"","description":""}],"endings":[{"id":"","title":"","conditions":[""],"description":""}]}}。goals、importantCharacters、objectives、conditions 的每项都是字符串；status 只能是 inactive、active、completed、failed。章节数量和每章预计回合范围必须服从篇幅规划；预计范围允许重叠和动态调整，不是强制结束点。',
  prompts:
    '返回 {"prompts":{"gameMasterPrompt":"完整主持人规则","openingPrompt":"","stateUpdatePrompt":"","summaryPrompt":"生成 120-180 字的当前状态摘要，只记录地点、处境、当前目标、关键选择及其结果，不写环境描写、对话和叙事过程","consistencyCheckPrompt":""}}。主持人规则必须强调不替玩家决定、NPC独立目标、世界持续运行、合理判定、选择有后果、严格JSON输出；同时规定剧情正文使用适合小说阅读的短段落，每段 2-4 句，场景、说话者或行动焦点变化时另起一段，段落之间使用两个换行符。',
  consistency:
    "检查当前项目的人名、地点、力量等级、NPC目标、核心冲突、数值规则与开场一致性。只返回确实需要修复的顶层字段及其完整新值，最多修复 3 个字段；禁止重复返回未修改字段，禁止复述整个项目，没有问题则只返回 {}。",
  opening:
    '返回 {"openingScene":"可立即游玩的 500-800 字中文开场，结尾留下明确行动空间"}。正文分为 6-10 个自然短段，每段约 60-130 字、2-4 句；场景转换、说话者改变或行动焦点变化必须另起一段，段落之间使用两个换行符。不要输出一整块连续长文。',
};
const stageMinimumTokens: Record<string, number> = {
  analysis: 1600,
  world: 6000,
  characters: 6000,
  system: 3200,
  story: 6000,
  prompts: 5000,
  consistency: 1800,
  opening: 3200,
};

function generatedText(value: unknown, separator = "；"): unknown {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => generatedText(item, separator))
      .filter(
        (item): item is string => typeof item === "string" && Boolean(item),
      );
    return parts.join("；");
  }
  if (!value || typeof value !== "object") return value;
  const parts = Object.values(value as Record<string, unknown>)
    .map((item) => generatedText(item, "；"))
    .filter(
      (item): item is string => typeof item === "string" && Boolean(item),
    );
  return [...new Set(parts)].join(separator);
}

function generatedTextList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => generatedText(item, "："))
    .filter(
      (item): item is string => typeof item === "string" && Boolean(item),
    );
}

function firstDefined(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function normalizeGeneratedWorld(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const world = value as Record<string, unknown>;
  const rawLocations = firstDefined(world, "locations", "places");
  const rawFactions = firstDefined(
    world,
    "factions",
    "organizations",
    "forces",
  );
  const locations = Array.isArray(rawLocations)
    ? rawLocations.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          return item;
        const location = item as Record<string, unknown>;
        return {
          id: String(
            firstDefined(location, "id", "locationId", "location_id") ??
              `location_${index + 1}`,
          ),
          name: String(firstDefined(location, "name", "title") ?? ""),
          description: String(
            generatedText(
              firstDefined(location, "description", "summary", "content") ?? "",
            ),
          ),
          connections:
            (generatedTextList(
              firstDefined(
                location,
                "connections",
                "connectedLocations",
                "links",
              ) ?? [],
            ) as string[]) ?? [],
        };
      })
    : (rawLocations ?? []);
  const factions = Array.isArray(rawFactions)
    ? rawFactions.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          return item;
        const faction = item as Record<string, unknown>;
        const rawAttitude = firstDefined(
          faction,
          "attitude",
          "initialAttitude",
          "relationship",
        );
        const numericAttitude = Number(rawAttitude);
        return {
          id: String(
            firstDefined(faction, "id", "factionId", "faction_id") ??
              `faction_${index + 1}`,
          ),
          name: String(firstDefined(faction, "name", "title") ?? ""),
          description: String(
            generatedText(
              firstDefined(faction, "description", "summary", "content") ?? "",
            ),
          ),
          attitude: Number.isFinite(numericAttitude) ? numericAttitude : 0,
          goal: String(
            generatedText(
              firstDefined(faction, "goal", "objective", "purpose") ?? "",
            ),
          ),
        };
      })
    : (rawFactions ?? []);
  return {
    background: generatedText(firstDefined(world, "background", "setting")),
    history: generatedText(firstDefined(world, "history", "timeline")),
    geography: generatedText(
      firstDefined(world, "geography", "geographicOverview"),
    ),
    locations,
    factions,
    races:
      generatedTextList(firstDefined(world, "races", "species") ?? []) ?? [],
    religions:
      generatedTextList(firstDefined(world, "religions", "faiths") ?? []) ?? [],
    socialRules:
      generatedTextList(
        firstDefined(world, "socialRules", "social_rules", "rules") ?? [],
      ) ?? [],
    powerSystem: generatedText(
      firstDefined(world, "powerSystem", "power_system", "magicSystem"),
      "：",
    ),
    currentCrisis: generatedText(
      firstDefined(world, "currentCrisis", "current_crisis", "crisis"),
    ),
    secrets:
      generatedTextList(
        firstDefined(world, "secrets", "hiddenSecrets") ?? [],
      ) ?? [],
  };
}

function generatedRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizedText(value: unknown, fallback = ""): string {
  const result = generatedText(value);
  return typeof result === "string" ? result : fallback;
}

function normalizedTextList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const source = Array.isArray(value) ? value : [value];
  return source
    .map((item) => generatedText(item, "："))
    .filter(
      (item): item is string =>
        typeof item === "string" && Boolean(item.trim()),
    );
}

function normalizedNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "是", "可以", "重要"].includes(normalized))
      return true;
    if (["false", "no", "0", "否", "不", "不可", "不重要"].includes(normalized))
      return false;
  }
  return fallback;
}

function generatedArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = generatedRecord(value);
  return record ? Object.values(record) : [];
}

function withoutKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );
}

function normalizeAbility(value: unknown, prefix: string, index: number) {
  const ability = generatedRecord(value);
  if (!ability) {
    const text = normalizedText(value);
    return {
      id: `${prefix}_${index + 1}`,
      name: text,
      description: text,
      level: 1,
    };
  }
  const rawLevel = firstDefined(ability, "level", "rank", "grade", "tier");
  return {
    id: String(
      firstDefined(ability, "id", "abilityId", "ability_id", "skillId") ??
        `${prefix}_${index + 1}`,
    ),
    name: normalizedText(firstDefined(ability, "name", "title", "ability")),
    description: normalizedText(
      firstDefined(ability, "description", "effect", "content", "summary"),
    ),
    ...(rawLevel === undefined ? {} : { level: normalizedNumber(rawLevel, 1) }),
  };
}

function normalizeItem(value: unknown, prefix: string, index: number) {
  const item = generatedRecord(value);
  if (!item) {
    const text = normalizedText(value);
    return {
      id: `${prefix}_${index + 1}`,
      name: text,
      description: text,
      quantity: 1,
    };
  }
  return {
    id: String(
      firstDefined(item, "id", "itemId", "item_id") ?? `${prefix}_${index + 1}`,
    ),
    name: normalizedText(firstDefined(item, "name", "title")),
    description: normalizedText(
      firstDefined(item, "description", "content", "effect", "summary"),
    ),
    quantity: normalizedNumber(
      firstDefined(item, "quantity", "count", "amount") ?? 1,
      1,
    ),
  };
}

function normalizeStatus(value: unknown, index: number) {
  const status = generatedRecord(value);
  if (!status) {
    const text = normalizedText(value);
    return {
      id: `status_${index + 1}`,
      name: text,
      description: text,
    };
  }
  const duration = firstDefined(status, "duration", "turns", "remainingTurns");
  return {
    id: String(
      firstDefined(status, "id", "statusId", "status_id") ??
        `status_${index + 1}`,
    ),
    name: normalizedText(firstDefined(status, "name", "title")),
    description: normalizedText(
      firstDefined(status, "description", "effect", "content", "summary"),
    ),
    ...(duration === undefined
      ? {}
      : { duration: normalizedNumber(duration, 0) }),
  };
}

function normalizeAttributeRecord(
  value: unknown,
  fallback: Record<string, number> = {},
): Record<string, number> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((item, index) => {
        const attribute = generatedRecord(item);
        if (!attribute) return [];
        const name = normalizedText(
          firstDefined(attribute, "name", "title", "key", "id"),
          `属性${index + 1}`,
        );
        return [
          [
            name,
            normalizedNumber(
              firstDefined(attribute, "value", "initial", "default") ?? 0,
            ),
          ],
        ];
      }),
    );
  }
  const record = generatedRecord(value);
  if (!record) return { ...fallback };
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, normalizedNumber(item)]),
  );
}

function normalizePlayer(value: unknown, fallbackValue: unknown) {
  const player = generatedRecord(value) ?? {};
  const fallback = generatedRecord(fallbackValue) ?? {};
  const field = (...keys: string[]) =>
    firstDefined(player, ...keys) ?? firstDefined(fallback, ...keys);
  return {
    name: normalizedText(field("name", "title")),
    gender: normalizedText(field("gender", "sex")),
    age: normalizedText(field("age")),
    race: normalizedText(field("race", "species")),
    identity: normalizedText(field("identity", "role", "occupation")),
    background: normalizedText(field("background", "history", "origin")),
    personality: normalizedText(field("personality", "traits")),
    appearance: normalizedText(field("appearance", "look")),
    goals: normalizedTextList(field("goals", "objectives", "goal")),
    talents: generatedArray(field("talents", "gifts")).map((item, index) =>
      normalizeAbility(item, "talent", index),
    ),
    skills: generatedArray(field("skills", "abilities")).map((item, index) =>
      normalizeAbility(item, "skill", index),
    ),
    weaknesses: normalizedTextList(
      field("weaknesses", "weakness", "limitations"),
    ),
    attributes: normalizeAttributeRecord(
      field("attributes", "stats"),
      normalizeAttributeRecord(fallback.attributes),
    ),
    inventory: generatedArray(field("inventory", "items")).map((item, index) =>
      normalizeItem(item, "inventory", index),
    ),
    equipment: generatedArray(field("equipment", "equippedItems")).map(
      (item, index) => normalizeItem(item, "equipment", index),
    ),
    statusEffects: generatedArray(
      field("statusEffects", "status_effects", "statuses"),
    ).map(normalizeStatus),
  };
}

function normalizeCharacter(value: unknown, index: number) {
  const character = generatedRecord(value) ?? {};
  const mortalValue = firstDefined(character, "mortal", "canDie", "can_die");
  const immortalValue = firstDefined(character, "immortal", "isImmortal");
  return {
    id: String(
      firstDefined(character, "id", "characterId", "character_id", "npcId") ??
        `character_${index + 1}`,
    ),
    name: normalizedText(firstDefined(character, "name", "title")),
    identity: normalizedText(
      firstDefined(character, "identity", "role", "occupation"),
    ),
    age: normalizedText(firstDefined(character, "age")),
    race: normalizedText(firstDefined(character, "race", "species")),
    personality: normalizedText(
      firstDefined(character, "personality", "traits"),
    ),
    appearance: normalizedText(firstDefined(character, "appearance", "look")),
    background: normalizedText(
      firstDefined(character, "background", "history", "origin"),
    ),
    abilities: generatedArray(
      firstDefined(character, "abilities", "skills", "powers"),
    ).map((item, abilityIndex) =>
      normalizeAbility(item, `character_${index + 1}_ability`, abilityIndex),
    ),
    relationship: normalizedText(
      firstDefined(
        character,
        "relationship",
        "relationshipToPlayer",
        "relationship_to_player",
      ),
    ),
    attitude: normalizedNumber(
      firstDefined(character, "attitude", "favorability", "affinity"),
    ),
    goal: normalizedText(
      firstDefined(character, "goal", "objective", "motivation"),
    ),
    secret: normalizedText(
      firstDefined(character, "secret", "hiddenSecret", "hidden_secret"),
    ),
    speechStyle: normalizedText(
      firstDefined(character, "speechStyle", "speech_style", "voice"),
    ),
    important: normalizedBoolean(
      firstDefined(character, "important", "isImportant", "is_important"),
      true,
    ),
    mortal:
      immortalValue === undefined
        ? normalizedBoolean(mortalValue, true)
        : !normalizedBoolean(immortalValue, false),
  };
}

function normalizeGeneratedCharacters(value: unknown, project?: GameProject) {
  const result = generatedRecord(value) ?? {};
  const player = firstDefined(
    result,
    "player",
    "protagonist",
    "mainCharacter",
    "main_character",
  );
  const characters = firstDefined(
    result,
    "characters",
    "npcs",
    "supportingCharacters",
    "supporting_characters",
  );
  return {
    player: normalizePlayer(player, project?.player),
    characters: generatedArray(characters).map(normalizeCharacter),
  };
}

function normalizeGameSystem(value: unknown, fallbackValue?: unknown) {
  const system = generatedRecord(value) ?? {};
  const fallback = generatedRecord(fallbackValue) ?? {};
  const field = (...keys: string[]) =>
    firstDefined(system, ...keys) ?? firstDefined(fallback, ...keys);
  return {
    levelSystem: normalizedText(field("levelSystem", "level_system", "levels")),
    attributes: generatedArray(field("attributes", "stats")).map(
      (item, index) => {
        const attribute = generatedRecord(item) ?? {};
        const display = normalizedText(
          firstDefined(attribute, "display", "displayType", "display_type"),
        );
        return {
          id: String(
            firstDefined(attribute, "id", "attributeId", "attribute_id") ??
              `attribute_${index + 1}`,
          ),
          name: normalizedText(firstDefined(attribute, "name", "title")),
          initial: normalizedNumber(
            firstDefined(attribute, "initial", "default", "value"),
          ),
          max: normalizedNumber(
            firstDefined(attribute, "max", "maximum", "upperLimit") ?? 100,
            100,
          ),
          display:
            display === "bar" || display === "progress" ? "bar" : "number",
        };
      },
    ),
    combatRules: normalizedText(field("combatRules", "combat_rules")),
    taskRules: normalizedText(field("taskRules", "task_rules", "questRules")),
    relationshipRules: normalizedText(
      field("relationshipRules", "relationship_rules"),
    ),
    deathRules: normalizedText(field("deathRules", "death_rules")),
    difficultyRules: normalizedText(
      field("difficultyRules", "difficulty_rules"),
    ),
    randomCheckRules: normalizedText(
      field("randomCheckRules", "random_check_rules", "checkRules"),
    ),
  };
}

function normalizeTurnRange(
  value: unknown,
): { min: number; max: number } | undefined {
  const range = generatedRecord(value);
  if (range) {
    const min = normalizedNumber(
      firstDefined(range, "min", "start", "from"),
      1,
    );
    const max = normalizedNumber(firstDefined(range, "max", "end", "to"), min);
    return { min, max };
  }
  if (typeof value === "string") {
    const numbers = value.match(/\d+/g)?.map(Number) ?? [];
    if (numbers.length)
      return { min: numbers[0], max: numbers[1] ?? numbers[0] };
  }
  return undefined;
}

function normalizeQuestStatus(value: unknown) {
  const status = normalizedText(value).toLowerCase();
  if (["active", "in_progress", "doing", "进行中"].includes(status))
    return "active" as const;
  if (["completed", "complete", "done", "已完成"].includes(status))
    return "completed" as const;
  if (["failed", "failure", "失败"].includes(status)) return "failed" as const;
  return "inactive" as const;
}

function normalizeStory(value: unknown, fallbackValue?: unknown) {
  const story = generatedRecord(value) ?? {};
  const fallback = generatedRecord(fallbackValue) ?? {};
  const field = (...keys: string[]) =>
    firstDefined(story, ...keys) ?? firstDefined(fallback, ...keys);
  return {
    mainGoal: normalizedText(field("mainGoal", "main_goal", "goal")),
    openingEvent: normalizedText(
      field("openingEvent", "opening_event", "incitingIncident"),
    ),
    chapters: generatedArray(field("chapters", "acts")).map((item, index) => {
      const chapter = generatedRecord(item) ?? {};
      const turnRange = normalizeTurnRange(
        firstDefined(
          chapter,
          "estimatedTurnRange",
          "estimated_turn_range",
          "turnRange",
          "turn_range",
        ),
      );
      return {
        id: String(
          firstDefined(chapter, "id", "chapterId", "chapter_id") ??
            `chapter_${index + 1}`,
        ),
        title: normalizedText(firstDefined(chapter, "title", "name")),
        summary: normalizedText(
          firstDefined(chapter, "summary", "description", "content"),
        ),
        goals: normalizedTextList(
          firstDefined(chapter, "goals", "objectives", "goal"),
        ),
        mainConflict: normalizedText(
          firstDefined(chapter, "mainConflict", "main_conflict", "conflict"),
        ),
        importantCharacters: normalizedTextList(
          firstDefined(
            chapter,
            "importantCharacters",
            "important_characters",
            "keyCharacters",
          ),
        ),
        ...(turnRange ? { estimatedTurnRange: turnRange } : {}),
        completed: normalizedBoolean(
          firstDefined(chapter, "completed", "isCompleted", "is_completed"),
          false,
        ),
      };
    }),
    sideQuests: generatedArray(
      field("sideQuests", "side_quests", "quests"),
    ).map((item, index) => {
      const quest = generatedRecord(item) ?? {};
      return {
        id: String(
          firstDefined(quest, "id", "questId", "quest_id") ??
            `quest_${index + 1}`,
        ),
        title: normalizedText(firstDefined(quest, "title", "name")),
        description: normalizedText(
          firstDefined(quest, "description", "summary", "content"),
        ),
        status: normalizeQuestStatus(
          firstDefined(quest, "status", "state") ?? "inactive",
        ),
        objectives: normalizedTextList(
          firstDefined(quest, "objectives", "goals", "tasks"),
        ),
      };
    }),
    randomEvents: generatedArray(
      field("randomEvents", "random_events", "events"),
    ).map((item, index) => {
      const event = generatedRecord(item) ?? {};
      return {
        id: String(
          firstDefined(event, "id", "eventId", "event_id") ??
            `event_${index + 1}`,
        ),
        title: normalizedText(firstDefined(event, "title", "name")),
        trigger: normalizedText(
          firstDefined(event, "trigger", "condition", "when"),
        ),
        description: normalizedText(
          firstDefined(event, "description", "content", "summary"),
        ),
      };
    }),
    endings: generatedArray(field("endings", "possibleEndings")).map(
      (item, index) => {
        const ending = generatedRecord(item) ?? {};
        return {
          id: String(
            firstDefined(ending, "id", "endingId", "ending_id") ??
              `ending_${index + 1}`,
          ),
          title: normalizedText(firstDefined(ending, "title", "name")),
          conditions: normalizedTextList(
            firstDefined(ending, "conditions", "requirements", "criteria"),
          ),
          description: normalizedText(
            firstDefined(ending, "description", "summary", "content"),
          ),
        };
      },
    ),
  };
}

function normalizePrompts(value: unknown, fallbackValue?: unknown) {
  const prompts = generatedRecord(value) ?? {};
  const fallback = generatedRecord(fallbackValue) ?? {};
  const field = (...keys: string[]) =>
    firstDefined(prompts, ...keys) ?? firstDefined(fallback, ...keys);
  return {
    gameMasterPrompt: normalizedText(
      field("gameMasterPrompt", "game_master_prompt", "gmPrompt"),
    ),
    openingPrompt: normalizedText(field("openingPrompt", "opening_prompt")),
    stateUpdatePrompt: normalizedText(
      field("stateUpdatePrompt", "state_update_prompt"),
    ),
    summaryPrompt: normalizedText(field("summaryPrompt", "summary_prompt")),
    consistencyCheckPrompt: normalizedText(
      field("consistencyCheckPrompt", "consistency_check_prompt"),
    ),
  };
}

function normalizeProjectInfo(value: unknown, project?: GameProject) {
  const info = generatedRecord(value) ?? {};
  const result: Record<string, unknown> = {};
  const setText = (target: string, ...keys: string[]) => {
    const field = firstDefined(info, ...keys);
    if (field !== undefined) result[target] = normalizedText(field);
  };
  setText("title", "title", "name");
  setText("description", "description", "summary", "idea");
  setText("genre", "genre", "category", "type");
  setText("tone", "tone", "style", "mood");
  const creationMode = firstDefined(info, "creationMode", "creation_mode");
  const freedomMode = firstDefined(info, "freedomMode", "freedom_mode");
  const gameLength = firstDefined(info, "gameLength", "game_length", "length");
  if (creationMode !== undefined)
    result.creationMode = ["simple", "advanced"].includes(String(creationMode))
      ? String(creationMode)
      : (project?.projectInfo.creationMode ?? "simple");
  if (freedomMode !== undefined)
    result.freedomMode = ["linear", "hybrid", "open"].includes(
      String(freedomMode),
    )
      ? String(freedomMode)
      : (project?.projectInfo.freedomMode ?? "hybrid");
  if (gameLength !== undefined)
    result.gameLength = ["short", "standard", "long", "endless"].includes(
      String(gameLength),
    )
      ? String(gameLength)
      : (project?.projectInfo.gameLength ?? "standard");
  return result;
}

function normalizeConsistency(value: unknown, project?: GameProject) {
  const root = generatedRecord(value) ?? {};
  const fixes = generatedRecord(
    firstDefined(root, "fixes", "patch", "changes", "corrections"),
  );
  const source = fixes ?? root;
  const result: Record<string, unknown> = {};
  if (firstDefined(source, "projectInfo", "project_info") !== undefined)
    result.projectInfo = normalizeProjectInfo(
      firstDefined(source, "projectInfo", "project_info"),
      project,
    );
  if (
    firstDefined(source, "world", "worldSetting", "world_setting") !== undefined
  )
    result.world = normalizeGeneratedWorld(
      firstDefined(source, "world", "worldSetting", "world_setting"),
    );
  if (firstDefined(source, "player", "protagonist") !== undefined)
    result.player = normalizePlayer(
      firstDefined(source, "player", "protagonist"),
      project?.player,
    );
  if (firstDefined(source, "characters", "npcs") !== undefined)
    result.characters = generatedArray(
      firstDefined(source, "characters", "npcs"),
    ).map(normalizeCharacter);
  if (firstDefined(source, "gameSystem", "game_system", "system") !== undefined)
    result.gameSystem = normalizeGameSystem(
      firstDefined(source, "gameSystem", "game_system", "system"),
      project?.gameSystem,
    );
  if (firstDefined(source, "story", "plot") !== undefined)
    result.story = normalizeStory(
      firstDefined(source, "story", "plot"),
      project?.story,
    );
  if (firstDefined(source, "prompts", "prompt_templates") !== undefined)
    result.prompts = normalizePrompts(
      firstDefined(source, "prompts", "prompt_templates"),
      project?.prompts,
    );
  if (
    firstDefined(source, "openingScene", "opening_scene", "opening") !==
    undefined
  )
    result.openingScene = normalizedText(
      firstDefined(source, "openingScene", "opening_scene", "opening"),
    );
  return Object.fromEntries(Object.entries(result).slice(0, 3));
}

function normalizeGenerationEnvelope(
  stage: string,
  input: unknown,
  project?: GameProject,
): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  if (stage === "analysis") {
    const wrapped = firstDefined(
      record,
      "projectInfo",
      "project_info",
      "analysis",
    );
    const source = wrapped ?? input;
    const projectInfo = normalizeProjectInfo(source, project);
    return wrapped === undefined
      ? { projectInfo }
      : {
          ...withoutKeys(record, ["projectInfo", "project_info", "analysis"]),
          projectInfo,
        };
  }
  if (stage === "world") {
    if (record.world !== undefined)
      return { ...record, world: normalizeGeneratedWorld(record.world) };
    const world =
      record.worldview ??
      record.worldSetting ??
      record.world_setting ??
      (record.background !== undefined ||
      record.locations !== undefined ||
      record.factions !== undefined
        ? input
        : undefined);
    return world === undefined
      ? input
      : { world: normalizeGeneratedWorld(world) };
  }
  if (stage === "characters") {
    const normalized = normalizeGeneratedCharacters(record, project);
    return {
      ...withoutKeys(record, [
        "player",
        "protagonist",
        "mainCharacter",
        "main_character",
        "characters",
        "npcs",
        "supportingCharacters",
        "supporting_characters",
      ]),
      ...normalized,
    };
  }
  if (stage === "system") {
    const system = firstDefined(record, "gameSystem", "game_system", "system");
    return {
      ...withoutKeys(record, ["gameSystem", "game_system", "system"]),
      gameSystem: normalizeGameSystem(system ?? input, project?.gameSystem),
    };
  }
  if (stage === "story") {
    const story = firstDefined(record, "story", "plot", "narrativeStructure");
    return {
      ...withoutKeys(record, ["story", "plot", "narrativeStructure"]),
      story: normalizeStory(story ?? input, project?.story),
    };
  }
  if (stage === "prompts") {
    const prompts = firstDefined(
      record,
      "prompts",
      "prompt_templates",
      "promptTemplates",
    );
    return {
      ...withoutKeys(record, [
        "prompts",
        "prompt_templates",
        "promptTemplates",
      ]),
      prompts: normalizePrompts(prompts ?? input, project?.prompts),
    };
  }
  if (stage === "consistency") return normalizeConsistency(record, project);
  if (stage === "opening") {
    const opening = firstDefined(
      record,
      "openingScene",
      "opening_scene",
      "opening",
      "scene",
      "content",
      "narrative",
    );
    const openingScene =
      typeof opening === "number" || typeof opening === "boolean"
        ? opening
        : opening === undefined || opening === null
          ? opening
          : normalizedText(opening);
    return {
      ...withoutKeys(record, [
        "openingScene",
        "opening_scene",
        "opening",
        "scene",
        "content",
        "narrative",
      ]),
      openingScene,
    };
  }
  return input;
}
function contextProject(p: unknown) {
  const s = JSON.stringify(p, (key, value) =>
    key === "settingsVersions" ? undefined : value,
  );
  if (s.length <= 24000) return s;
  return JSON.stringify({
    note: "项目内容过长，preview 是截断后的参考文本，不是需要照抄的 JSON 输出",
    preview: s.slice(0, 22000),
  });
}
function compactBoundProject(p: GameProject) {
  return {
    projectInfo: p.projectInfo,
    player: p.player,
    characters: p.characters,
    gameSystem: p.gameSystem,
    story: p.story,
    currentCrisis: p.world.currentCrisis,
    scenarioId: p.scenarioId,
    worldBinding: p.worldBinding,
  };
}
export async function executeAiRequest(
  input: unknown,
  context: ModelExecutionContext,
): Promise<AiExecutionResponse> {
  let requestedAction = "";
  try {
    const body = input as AiRequestBody;
    requestedAction = String(body.action || "");
    const config = body.config as Config;
    const apiKeyRequired = config?.provider !== "ollama";
    if (
      !config ||
      (apiKeyRequired && !config.apiKey?.trim()) ||
      !config.baseUrl ||
      !config.model
    )
      return json({ error: "API 配置不完整" }, 400);
    if (body.action === "test") {
      const startedAt = Date.now();
      await chat(
        context,
        config,
        [{ role: "user", content: "请只回复：连接成功" }],
        false,
        64,
      );
      return json({
        data: {
          ok: true,
          message: "连接成功",
          provider: config.provider,
          model: config.model,
          latencyMs: Date.now() - startedAt,
        },
      });
    }
    if (body.action === "creation-field") {
      const definition = findCreationField(String(body.fieldKey || ""));
      if (!definition) return json({ error: "不支持生成这个字段" }, 400);
      const lockedFields = z
        .array(z.string())
        .default([])
        .parse(body.lockedFields);
      if (lockedFields.includes(definition.fieldKey))
        return json({ error: "该字段已锁定，AI 不会修改它" }, 409);
      const operation = z
        .enum(["generate", "expand", "simplify", "rewrite"])
        .parse(body.operation);
      const currentValue = z
        .string()
        .max(3000)
        .default("")
        .parse(body.currentValue);
      const prompt = creationFieldPrompt({
        definition,
        operation,
        currentValue,
        context: body.context,
      });
      const text = await chat(
        context,
        config,
        [
          { role: "system", content: creationSystemRule(lockedFields) },
          { role: "user", content: prompt },
        ],
        true,
        definition.candidateOnly ? 600 : 1000,
      );
      const parsed = creationFieldResultSchema.parse(extractJson(text));
      return json({
        data: {
          ...parsed,
          value: parsed.value?.trim().slice(0, definition.maxLength),
          candidates: parsed.candidates?.map((candidate) =>
            candidate.trim().slice(0, definition.maxLength),
          ),
        },
      });
    }
    if (body.action === "creation-page") {
      const step = z.number().int().min(0).max(6).parse(body.step);
      const lockedFields = z
        .array(z.string())
        .default([])
        .parse(body.lockedFields);
      const currentFields = z
        .record(z.string(), z.string().max(3000))
        .parse(body.currentFields || {});
      const optimizeExisting = Boolean(body.optimizeExisting);
      const numericSystem = Boolean(body.context?.project?.numericSystem);
      const prompt = creationPagePrompt({
        step,
        context: body.context,
        currentFields,
        lockedFields,
        optimizeExisting,
        numericSystem,
      });
      const text = await chat(
        context,
        config,
        [
          { role: "system", content: creationSystemRule(lockedFields) },
          { role: "user", content: prompt },
        ],
        true,
        2600,
      );
      const parsed = creationPageResultSchema.parse(extractJson(text));
      const fields = sanitizePageFields(step, numericSystem, parsed.fields);
      const allowedFields = Object.fromEntries(
        Object.entries(fields).filter(
          ([key]) =>
            !lockedFields.includes(key) &&
            (optimizeExisting || !String(currentFields[key] || "").trim()),
        ),
      );
      return json({
        data: {
          fields: allowedFields,
          supportingCharacters:
            step === 3 ? parsed.supportingCharacters : undefined,
        },
      });
    }
    if (body.action === "creation-ideas") {
      const step = z.number().int().min(0).max(6).parse(body.step);
      const fieldKey = body.fieldKey ? String(body.fieldKey) : undefined;
      if (fieldKey && !findCreationField(fieldKey))
        return json({ error: "不支持这个灵感字段" }, 400);
      const lockedFields = z
        .array(z.string())
        .default([])
        .parse(body.lockedFields);
      const numericSystem = Boolean(body.context?.project?.numericSystem);
      const text = await chat(
        context,
        config,
        [
          { role: "system", content: creationSystemRule(lockedFields) },
          {
            role: "user",
            content: creationIdeasPrompt({
              step,
              fieldKey,
              context: body.context,
              lockedFields,
            }),
          },
        ],
        true,
        2200,
      );
      const parsed = creationIdeasResultSchema.parse(extractJson(text));
      return json({
        data: {
          candidates: parsed.candidates.map((candidate) => ({
            ...candidate,
            fields: Object.fromEntries(
              Object.entries(
                sanitizePageFields(
                  step,
                  numericSystem,
                  resolveIdeaCandidateFields(candidate, fieldKey),
                ),
              ).filter(([key]) => !lockedFields.includes(key)),
            ),
          })),
        },
      });
    }
    if (body.action === "worldbook-generate") {
      const input = worldBookGenerationRequestSchema.parse(body.input);
      const maxTokens = input.operation === "category_generation" ? 2600 : 6000;
      const text = await chat(
        context,
        config,
        [
          { role: "system", content: worldBookSystemPrompt() },
          { role: "user", content: worldBookGenerationPrompt(input) },
        ],
        true,
        maxTokens,
      );
      return json({
        data: sanitizeGeneratedWorldBookDraft(extractJson(text)),
      });
    }
    if (body.action === "worldbook-entry") {
      const input = worldBookEntryRequestSchema.parse(body.input);
      const text = await chat(
        context,
        config,
        [
          { role: "system", content: worldBookSystemPrompt() },
          { role: "user", content: worldBookEntryPrompt(input) },
        ],
        true,
        1800,
      );
      const result = sanitizeGeneratedWorldBookDraft(extractJson(text));
      if (!result.entries[0]) throw new Error("模型没有返回资料卡内容");
      return json({ data: result });
    }
    if (body.action === "generate") {
      if (!isGenerationStage(body.stage))
        return json(
          {
            error: "未知生成阶段",
            code: "invalid_stage",
            path: "$",
          },
          400,
        );
      const stage = body.stage;
      const spec = stageSpecs[stage];
      const lengthPlan = lengthPlanningInstruction(
        body.draft?.gameLength ?? body.project?.projectInfo?.gameLength,
      );
      const lockedFields = Array.isArray(body.draft?.creationMeta?.lockedFields)
        ? body.draft.creationMeta.lockedFields
        : [];
      const prompt = `你是资深中文文字冒险架构师。严格输出 JSON，不要 Markdown。当前用户输入：${JSON.stringify(body.draft)}\n当前已生成项目：${contextProject(body.project)}\n篇幅与节奏规划：${lengthPlan}\n本阶段要求：${spec}\n协作规则：用户已经填写的内容均视为明确设定，优先补全空白，不得改名、删除、反向解释或静默修复。锁定字段绝对不能修改：${lockedFields.join("、") || "无"}。若发现设定冲突，只在相关文本中保留冲突提示，不得擅自覆盖用户设定。\n所有 id 使用简短英文或拼音且唯一，内容具体、可执行、彼此一致。回合目标只用于控制叙事节奏，不得写成固定回合强制结局规则。`;
      const stageMaxTokens = Math.max(
        config.maxTokens || 4096,
        stageMinimumTokens[stage] ?? 4096,
      );
      const text = await chat(
        context,
        config,
        [
          {
            role: "system",
            content:
              stage === "consistency"
                ? "你只做最小化一致性修补。只输出严格 JSON；不要复述完整项目，不要输出解释。"
                : "你负责生成可持续游玩的结构化文字冒险。只输出严格 JSON。",
          },
          { role: "user", content: prompt },
        ],
        true,
        stageMaxTokens,
      );
      let result = validateGenerationStageResult(
        stage,
        normalizeGenerationEnvelope(stage, extractJson(text), body.project),
      );
      if (!result.success) {
        const issuePaths = result.issues
          .slice(0, 8)
          .map((issue) => `${issue.code}:${issue.pathText}`)
          .join("、");
        const repairText = await chat(
          context,
          config,
          [
            {
              role: "system",
              content:
                "你只修复 JSON 数据结构，不扩写、不解释。严格输出一个完整 JSON 对象，不要 Markdown。",
            },
            {
              role: "user",
              content: `以下 ${stage} 阶段结果未通过协议校验。请保留已有有效内容，只修复缺失字段、字段类型和多余字段，并严格符合本阶段要求。\n本阶段要求：${spec}\n校验问题：${issuePaths || result.pathText}\n待修复 JSON：${contextProject(extractJson(text))}`,
            },
          ],
          true,
          stageMaxTokens,
        );
        result = validateGenerationStageResult(
          stage,
          normalizeGenerationEnvelope(
            stage,
            extractJson(repairText),
            body.project,
          ),
        );
      }
      if (!result.success)
        return json(
          {
            error: `模型生成的数据结构不符合阶段协议（字段：${result.pathText}）`,
            code: result.code,
            stage: result.stage,
            path: result.pathText,
            issues: result.issues.map((issue) => ({
              code: issue.code,
              path: issue.pathText,
            })),
          },
          502,
        );
      return json({
        data: result.data,
      });
    }
    if (body.action === "module") {
      const prompt = `重写项目的 ${body.key} 模块。要求：${body.instruction}\n返回 {"value": 模块的新 JSON 值}，不要 Markdown。\n项目：${contextProject(body.project)}`;
      const text = await chat(context, config, [
        { role: "user", content: prompt },
      ]);
      const result = z.object({ value: z.unknown() }).parse(extractJson(text));
      return json({ data: result.value });
    }
    if (body.action === "turn") {
      const p = body.project as GameProject,
        s = body.save as GameSave;
      const nextTurn = Number(s.turn ?? 0) + 1;
      const chapter = chapterForTurn(
        p as GameProject,
        {
          ...s,
          turn: nextTurn,
        } as GameSave,
      );
      const pacing = `${turnPacingInstruction(
        p.projectInfo?.gameLength,
        nextTurn,
      )} 当前规划章节：第 ${chapter.index} 章《${chapter.title}》。以该章目标和核心冲突为本回合局部方向；章节完成状态可随玩家选择动态调整。`;
      const format =
        '返回严格 json：{"narrative":"剧情正文","dialogue":[{"characterId":"","characterName":"","content":""}],"choices":[{"id":"","text":""}],"statePatch":{"playerAttributes":{},"addItems":[],"removeItemIds":[],"locationId":"","time":"","characterStates":{},"questUpdates":[],"worldState":{}},"newEvents":[{"id":"","type":"","content":"","createdAt":"ISO时间"}],"importantMemories":[],"shortSummary":"本回合发生了什么，60-100字","rollingSummary":"截至当前的状态摘要，120-180字"}。statePatch、shortSummary 和 rollingSummary 必须存在；没有状态变化时 statePatch 返回空对象。shortSummary 只概括本回合的行动与结果；rollingSummary 基于运行状态中的旧摘要更新，只保留玩家当前地点与处境、当前目标、尚未解决的冲突、最重要的选择及明确结果，删除已经失效的信息，禁止环境描写、对话、心理活动和逐步复述。rollingSummary 使用“当前处境：…”“当前目标：…”“未解决冲突：…”“关键结果：…”等简短标签组织，每个冒号标签只写一个完整句子。禁止凭空奖励。narrative 控制在 700-1500 字，建议写到 900-1300 字，并分为 7-14 个自然短段，每段约 70-160 字、2-4 句。每个正文段落（包括独立对白段）开头使用两个全角空格“　　”进行首行缩进。每回合必须包含实质性的场景推进、人物反应或信息变化，不能依靠重复环境描写和同义复述凑字数。场景、说话者或行动焦点变化时另起一段，JSON 字符串内用 \\n\\n 表示段落间隔。必须使用中文弯引号“”书写对白。凡是由冒号引出的完整对白，该对白必须单独成段；冒号前的说话提示、完整对白、对白后的动作描写分别成段。每更换说话者也必须另起一段，并且绝不在一对尚未闭合的引号中间换段。禁止输出连续长文。';
      const memory = {
        recentMessages: s.recentMessages?.slice(-12),
        rollingSummary: s.rollingSummary,
        importantMemories: s.importantMemories,
        importantChoices: s.importantChoices,
        activeQuests: s.activeQuests,
        completedQuests: s.completedQuests,
        failedQuests: s.failedQuests,
        triggeredEvents: s.triggeredEvents,
        playerState: s.playerState,
        characterStates: s.characterStates,
        worldState: s.worldState,
        currentLocationId: s.currentLocationId,
        currentTime: s.currentTime,
      };
      const worldBookContext = body.worldBookContext as
        WorldBookTurnContext | undefined;
      const worldBookInstruction = worldBookContext
        ? `\n世界书固定版本：${worldBookContext.worldBookName}（${worldBookContext.worldBookVersionId}）。\n核心摘要：${worldBookContext.coreSummary || "无"}\n本回合按需检索条目：${contextProject(worldBookContext.entries)}\n世界书条目只用于约束本回合与后续剧情，不得用未检索条目自行补写硬设定。不可违背的核心规则优先于普通背景；已经发生的游戏事实与当前运行状态优先于后来修改的世界书。`
        : "";
      const turnMessages = [
        {
          role: "system",
          content:
            p.prompts.gameMasterPrompt +
            "\n冲突优先级：当前玩家与世界状态 > 已发生的历史事件 > 重要记忆 > 当前任务与 NPC 关系 > 最新设定集 > 普通背景补充 > 自由发挥。当最新设定与已经发生的游戏事实冲突时，必须以已发生事实、当前状态和世界记忆为准；不要无解释地重置剧情、复活角色、撤销选择或清除关系。设定更新只约束本次及后续新回合，不得重写已有正文。" +
            "\n" +
            pacing +
            "\n" +
            format +
            worldBookInstruction,
        },
        {
          role: "user",
          content: `项目设定：${contextProject(worldBookContext ? compactBoundProject(p) : { ...p, prompts: undefined })}\n运行状态：${contextProject(memory)}\n玩家行动：${body.actionText}`,
        },
      ];
      const turnMaxTokens = Math.max(config.maxTokens || 4096, 4096);
      const text = await chat(
        context,
        config,
        turnMessages,
        true,
        turnMaxTokens,
      );
      const parsed = parseTurnResponse(extractJson(text));
      return json({ data: parsed });
    }
    return json({ error: "未知操作" }, 400);
  } catch (e) {
    if (e instanceof z.ZodError) {
      if (
        requestedAction.startsWith("creation-") ||
        requestedAction.startsWith("worldbook-")
      ) {
        return json({ error: "模型返回的内容格式不完整，未修改当前表单" }, 502);
      }
      const field = e.issues[0]?.path.join(".") || "未知字段";
      return json(
        { error: `AI 返回的回合格式仍不完整（${field}），请重新生成本回合` },
        502,
      );
    }
    const baseMessage =
      e instanceof Error
        ? e.name === "AbortError"
          ? "请求超时，请检查网络或延长超时"
          : e.message === "fetch failed" ||
              e.message.includes("Failed to fetch")
            ? "客户端无法连接模型接口。请检查地址、代理、防火墙或网络权限"
            : e.message
        : "未知错误";
    const msg =
      (requestedAction.startsWith("creation-") ||
        requestedAction.startsWith("worldbook-")) &&
      /JSON|格式|字段生成结果为空/.test(baseMessage)
        ? "模型返回的内容格式不完整，未修改当前表单"
        : baseMessage;
    return json({ error: msg }, 500);
  }
}
