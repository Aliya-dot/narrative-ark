import { NextRequest, NextResponse } from "next/server";
import { extractJson, parseTurnResponse } from "@/lib/schemas";
import { validateApiBaseUrl, validateCustomHeaders } from "@/lib/ai-config";
import { PROVIDERS } from "@/lib/providers";
import {
  chapterForTurn,
  lengthPlanningInstruction,
  turnPacingInstruction,
} from "@/lib/story-length";
import type { GameProject, GameSave, WorldBookTurnContext } from "@/lib/types";
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
} from "@/lib/creation-ai";
import { z } from "zod";
import {
  sanitizeGeneratedWorldBookDraft,
  worldBookEntryPrompt,
  worldBookEntryRequestSchema,
  worldBookGenerationPrompt,
  worldBookGenerationRequestSchema,
  worldBookSystemPrompt,
} from "@/lib/world-book-ai";
import {
  isGenerationStage,
  validateGenerationStageResult,
} from "@/lib/generation-stage";
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
function endpoint(base: string) {
  const clean = base.trim().replace(/\/$/, "");
  const target = clean.endsWith("/chat/completions")
    ? clean
    : `${clean}/chat/completions`;
  const url = validateApiBaseUrl(target);
  return url.toString();
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
async function chat(
  config: Config,
  messages: { role: string; content: string }[],
  json = true,
  maxTokensOverride?: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    (config.timeout || 60) * 1000,
  );
  try {
    const support = config.parameterSupport ?? {
      temperature: true,
      topP: true,
      maxTokens: true,
    };
    const providerOptions =
      PROVIDERS.find((provider) => provider.id === config.provider)
        ?.requestBody ?? {};
    const payload = {
      model: config.model,
      messages,
      ...providerOptions,
      ...(support.temperature
        ? { temperature: config.temperature ?? 0.75 }
        : {}),
      ...(support.topP ? { top_p: config.topP ?? 0.95 } : {}),
      ...(support.maxTokens
        ? { max_tokens: (maxTokensOverride ?? config.maxTokens) || 4096 }
        : {}),
      ...(json ? { response_format: { type: "json_object" } } : {}),
    };
    const res = await fetch(endpoint(config.baseUrl), {
      method: "POST",
      headers: {
        ...validateCustomHeaders(config.headers || {}),
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(friendly(res.status, raw));
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error("服务商返回格式异常");
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型没有返回内容，可能已被截断");
    return content as string;
  } finally {
    clearTimeout(timer);
  }
}
const stageSpecs: Record<string, string> = {
  analysis:
    '返回 {"projectInfo":{"title","description","genre","tone","creationMode":"simple|advanced","freedomMode":"linear|hybrid|open","gameLength":"short|standard|long|endless"}}。gameLength 必须严格沿用用户选择。',
  world:
    '返回 {"world":{"background":"","history":"","geography":"","locations":[{"id":"","name":"","description":"","connections":[]}],"factions":[{"id":"","name":"","description":"","attitude":0,"goal":""}],"races":[],"religions":[],"socialRules":[],"powerSystem":"","currentCrisis":"","secrets":[]}}。',
  characters:
    '返回 {"player":{"name":"","gender":"","age":"","race":"","identity":"","background":"","personality":"","appearance":"","goals":[],"talents":[{"id":"","name":"","description":"","level":1}],"skills":[],"weaknesses":[],"attributes":{},"inventory":[],"equipment":[],"statusEffects":[]},"characters":[{"id":"","name":"","identity":"","age":"","race":"","personality":"","appearance":"","background":"","abilities":[],"relationship":"","attitude":0,"goal":"","secret":"","speechStyle":"","important":true,"mortal":true}]}。严格保留并完善用户填写的主角与主要配角设定，不得擅自改名、改变核心性格、关系、目标或特殊能力；用户未添加配角时，再按所选篇幅需要补足有独立目标的 NPC，不要机械固定数量。',
  system:
    '返回 {"gameSystem":{"levelSystem":"","attributes":[{"id":"","name":"","initial":0,"max":100,"display":"bar|number"}],"combatRules":"","taskRules":"","relationshipRules":"","deathRules":"","difficultyRules":"","randomCheckRules":""}}。',
  story:
    '返回 {"story":{"mainGoal":"","openingEvent":"","chapters":[{"id":"","title":"","summary":"","goals":[],"mainConflict":"","importantCharacters":[],"estimatedTurnRange":{"min":1,"max":10},"completed":false}],"sideQuests":[{"id":"","title":"","description":"","status":"inactive","objectives":[]}],"randomEvents":[{"id":"","title":"","trigger":"","description":""}],"endings":[{"id":"","title":"","conditions":[],"description":""}]}}。章节数量和每章预计回合范围必须服从篇幅规划；预计范围允许重叠和动态调整，不是强制结束点。',
  prompts:
    '返回 {"prompts":{"gameMasterPrompt":"完整主持人规则","openingPrompt":"","stateUpdatePrompt":"","summaryPrompt":"生成 120-180 字的当前状态摘要，只记录地点、处境、当前目标、关键选择及其结果，不写环境描写、对话和叙事过程","consistencyCheckPrompt":""}}。主持人规则必须强调不替玩家决定、NPC独立目标、世界持续运行、合理判定、选择有后果、严格JSON输出；同时规定剧情正文使用适合小说阅读的短段落，每段 2-4 句，场景、说话者或行动焦点变化时另起一段，段落之间使用两个换行符。',
  consistency:
    "检查当前项目的人名、地点、力量等级、NPC目标、核心冲突、数值规则与开场一致性。只返回确实需要修复的顶层字段及其完整新值，最多修复 3 个字段；禁止重复返回未修改字段，禁止复述整个项目，没有问题则只返回 {}。",
  opening:
    '返回 {"openingScene":"可立即游玩的 500-800 字中文开场，结尾留下明确行动空间"}。正文分为 6-10 个自然短段，每段约 60-130 字、2-4 句；场景转换、说话者改变或行动焦点变化必须另起一段，段落之间使用两个换行符。不要输出一整块连续长文。',
};
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
export async function POST(req: NextRequest) {
  let requestedAction = "";
  try {
    const body = await req.json();
    requestedAction = String(body.action || "");
    const config = body.config as Config;
    if (!config?.apiKey || !config.baseUrl || !config.model)
      return NextResponse.json({ error: "API 配置不完整" }, { status: 400 });
    if (body.action === "test") {
      const startedAt = Date.now();
      await chat(
        config,
        [{ role: "user", content: "请只回复：连接成功" }],
        false,
        64,
      );
      return NextResponse.json({
        data: {
          ok: true,
          message: "连接成功",
          provider: body.config.provider,
          model: config.model,
          latencyMs: Date.now() - startedAt,
        },
      });
    }
    if (body.action === "creation-field") {
      const definition = findCreationField(String(body.fieldKey || ""));
      if (!definition)
        return NextResponse.json(
          { error: "不支持生成这个字段" },
          { status: 400 },
        );
      const lockedFields = z
        .array(z.string())
        .default([])
        .parse(body.lockedFields);
      if (lockedFields.includes(definition.fieldKey))
        return NextResponse.json(
          { error: "该字段已锁定，AI 不会修改它" },
          { status: 409 },
        );
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
        config,
        [
          { role: "system", content: creationSystemRule(lockedFields) },
          { role: "user", content: prompt },
        ],
        true,
        definition.candidateOnly ? 600 : 1000,
      );
      const parsed = creationFieldResultSchema.parse(extractJson(text));
      return NextResponse.json({
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
      return NextResponse.json({
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
        return NextResponse.json(
          { error: "不支持这个灵感字段" },
          { status: 400 },
        );
      const lockedFields = z
        .array(z.string())
        .default([])
        .parse(body.lockedFields);
      const numericSystem = Boolean(body.context?.project?.numericSystem);
      const text = await chat(
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
      return NextResponse.json({
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
        config,
        [
          { role: "system", content: worldBookSystemPrompt() },
          { role: "user", content: worldBookGenerationPrompt(input) },
        ],
        true,
        maxTokens,
      );
      return NextResponse.json({
        data: sanitizeGeneratedWorldBookDraft(extractJson(text)),
      });
    }
    if (body.action === "worldbook-entry") {
      const input = worldBookEntryRequestSchema.parse(body.input);
      const text = await chat(
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
      return NextResponse.json({ data: result });
    }
    if (body.action === "generate") {
      if (!isGenerationStage(body.stage))
        return NextResponse.json(
          {
            error: "未知生成阶段",
            code: "invalid_stage",
            path: "$",
          },
          { status: 400 },
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
      const text = await chat(
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
        stage === "consistency" ? 1800 : undefined,
      );
      const result = validateGenerationStageResult(stage, extractJson(text));
      if (!result.success)
        return NextResponse.json(
          {
            error: "模型生成的数据结构不符合阶段协议",
            code: result.code,
            stage: result.stage,
            path: result.pathText,
            issues: result.issues.map((issue) => ({
              code: issue.code,
              path: issue.pathText,
            })),
          },
          { status: 502 },
        );
      return NextResponse.json({
        data: result.data,
      });
    }
    if (body.action === "module") {
      const prompt = `重写项目的 ${body.key} 模块。要求：${body.instruction}\n返回 {"value": 模块的新 JSON 值}，不要 Markdown。\n项目：${contextProject(body.project)}`;
      const text = await chat(config, [{ role: "user", content: prompt }]);
      const result = z.object({ value: z.unknown() }).parse(extractJson(text));
      return NextResponse.json({ data: result.value });
    }
    if (body.action === "turn") {
      const p = body.project,
        s = body.save;
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
        '返回严格 json：{"narrative":"剧情正文","dialogue":[{"characterId":"","characterName":"","content":""}],"choices":[{"id":"","text":""}],"statePatch":{"playerAttributes":{},"addItems":[],"removeItemIds":[],"locationId":"","time":"","characterStates":{},"questUpdates":[],"worldState":{}},"newEvents":[{"id":"","type":"","content":"","createdAt":"ISO时间"}],"importantMemories":[],"shortSummary":"本回合发生了什么，60-100字","rollingSummary":"截至当前的状态摘要，120-180字"}。statePatch、shortSummary 和 rollingSummary 必须存在；没有状态变化时 statePatch 返回空对象。shortSummary 只概括本回合的行动与结果；rollingSummary 基于运行状态中的旧摘要更新，只保留玩家当前地点与处境、当前目标、尚未解决的冲突、最重要的选择及明确结果，删除已经失效的信息，禁止环境描写、对话、心理活动和逐步复述。rollingSummary 使用“当前处境：…”“当前目标：…”“未解决冲突：…”“关键结果：…”等简短标签组织，每个冒号标签只写一个完整句子。禁止凭空奖励。narrative 控制在 600-900 字并分为 7-11 个自然短段，每段约 70-140 字、2-4 句；每个正文段落（包括独立对白段）开头使用两个全角空格“　　”进行首行缩进。每回合必须包含实质性的场景推进、人物反应或信息变化，不能依靠重复环境描写和同义复述凑字数。场景、说话者或行动焦点变化时另起一段，JSON 字符串内用 \\n\\n 表示段落间隔。必须使用中文弯引号“”书写对白。凡是由冒号引出的完整对白，该对白必须单独成段；冒号前的说话提示、完整对白、对白后的动作描写分别成段。每更换说话者也必须另起一段，并且绝不在一对尚未闭合的引号中间换段。禁止输出连续长文。';
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
      const text = await chat(config, [
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
      ]);
      const parsed = parseTurnResponse(extractJson(text));
      return NextResponse.json({ data: parsed });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      if (
        requestedAction.startsWith("creation-") ||
        requestedAction.startsWith("worldbook-")
      ) {
        return NextResponse.json(
          { error: "模型返回的内容格式不完整，未修改当前表单" },
          { status: 502 },
        );
      }
      const field = e.issues[0]?.path.join(".") || "未知字段";
      return NextResponse.json(
        { error: `AI 返回的回合格式仍不完整（${field}），请重新生成本回合` },
        { status: 502 },
      );
    }
    const baseMessage =
      e instanceof Error
        ? e.name === "AbortError"
          ? "请求超时，请检查网络或延长超时"
          : e.message === "fetch failed" ||
              e.message.includes("Failed to fetch")
            ? "服务端无法连接模型接口。请检查代理、防火墙或启动进程的网络权限"
            : e.message
        : "未知错误";
    const msg =
      (requestedAction.startsWith("creation-") ||
        requestedAction.startsWith("worldbook-")) &&
      /JSON|格式|字段生成结果为空/.test(baseMessage)
        ? "模型返回的内容格式不完整，未修改当前表单"
        : baseMessage;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
