import { z } from "zod";
import type {
  CreationDraftMeta,
  CreationStepSnapshot,
  CreationWorkspaceDraft,
  GameProject,
  GenerationDraft,
  SupportingCharacterDraft,
} from "./types";

export type CreationAiOperation =
  "generate" | "expand" | "simplify" | "rewrite";

export type AiFieldDefinition = {
  stepId: number;
  fieldKey: string;
  label: string;
  contextFields: string[];
  maxLength: number;
  supportsExpand: boolean;
  supportsSimplify: boolean;
  supportsIdeas: boolean;
  candidateOnly?: boolean;
};

const field = (
  stepId: number,
  fieldKey: string,
  label: string,
  maxLength = 800,
  options: Partial<AiFieldDefinition> = {},
): AiFieldDefinition => ({
  stepId,
  fieldKey,
  label,
  contextFields: [],
  maxLength,
  supportsExpand: true,
  supportsSimplify: true,
  supportsIdeas: true,
  ...options,
});

export const CREATION_AI_FIELDS: AiFieldDefinition[] = [
  field(0, "title", "文游名称", 80, { candidateOnly: true }),
  field(0, "idea", "一句话故事想法", 500),
  field(0, "protagonist", "主角类型", 160),
  field(0, "tone", "整体风格", 160),
  field(0, "advanced.experience", "核心体验", 500),
  field(1, "advanced.era", "故事时代", 300),
  field(1, "advanced.tech", "科技或文明水平", 400),
  field(1, "advanced.background", "世界背景", 1600),
  field(1, "advanced.history", "世界历史", 1600),
  field(1, "advanced.geography", "地理环境", 1200),
  field(1, "advanced.crisis", "当前危机", 900),
  field(1, "advanced.secret", "隐藏真相", 800),
  field(1, "advanced.civilizations", "国家、种族、宗教或特殊文明", 1200),
  field(2, "advanced.playerName", "主角姓名", 80, { candidateOnly: true }),
  field(2, "advanced.playerGender", "性别 / 性别认同", 80),
  field(2, "advanced.playerAge", "年龄", 80),
  field(2, "advanced.playerRace", "种族 / 物种", 120),
  field(2, "advanced.playerIdentity", "身份 / 职业", 200),
  field(2, "advanced.playerOrigin", "主角出身", 900),
  field(2, "advanced.playerAppearance", "外观特征", 700),
  field(2, "advanced.playerPersonality", "性格特质", 700),
  field(2, "advanced.playerGoal", "主角目标", 600),
  field(2, "advanced.specialAbility", "特殊能力", 700),
  field(2, "advanced.weakness", "弱点", 500),
  field(2, "advanced.playerSecret", "隐藏秘密", 600),
  field(3, "advanced.factions", "主要势力", 1400),
  field(4, "advanced.attributes", "自定义属性", 900),
  field(4, "advanced.powerSystem", "能力体系", 1200),
  field(4, "advanced.levelSystem", "等级体系", 700),
  field(4, "advanced.growthRules", "成长方式", 700),
  field(4, "advanced.resourceRules", "资源消耗", 600),
  field(4, "advanced.checkRules", "判定规则", 800),
  field(5, "advanced.mainGoal", "主线目标", 900),
  field(5, "advanced.opening", "开场事件", 1000),
  field(5, "advanced.turns", "重要转折", 1400),
  field(5, "advanced.endings", "结局条件", 1200),
  field(5, "advanced.conflict", "主要冲突", 900),
  field(5, "advanced.foreshadowing", "核心伏笔", 1000),
  field(5, "advanced.chapters", "章节规划", 1800),
  field(6, "advanced.replyLength", "单回合回复长度", 80, {
    supportsExpand: false,
    supportsSimplify: false,
  }),
  field(6, "advanced.difficulty", "游戏难度", 80, {
    supportsExpand: false,
    supportsSimplify: false,
  }),
  field(6, "advanced.failureRules", "失败规则", 700),
  field(6, "advanced.deathRules", "死亡规则", 700),
  field(6, "advanced.allowRollback", "是否允许回档", 80, {
    supportsExpand: false,
    supportsSimplify: false,
  }),
  field(6, "advanced.aiAgency", "AI 是否可以替玩家决定行动", 120, {
    supportsExpand: false,
    supportsSimplify: false,
  }),
  field(6, "advanced.checkPrinciples", "数值判定原则", 800),
  field(6, "advanced.pacingRules", "剧情节奏要求", 800),
];

export const CREATION_STEP_LABELS = [
  "基础信息",
  "世界观",
  "主角",
  "角色与势力",
  "数值能力",
  "剧情结构",
  "游玩规则",
] as const;

export const CREATION_STEP_RULES = [
  "保留用户核心创意；标题或姓名类字段应给候选，其他内容保持清晰可继续编辑。",
  "按题材和篇幅控制世界规模：短篇聚焦少量地点与矛盾，标准篇适中，长篇才增加多层历史和势力。",
  "严格保留已有姓名、年龄、性别、种族和身份，只补足缺失的个人细节，避免替用户改变主角定位。",
  "角色必须有不同剧情功能和独立目标；避免与已有角色重复定位，并与主线形成可执行关联。",
  "仅在启用数值系统时生成，控制在 4～8 个可追踪核心属性，规则必须能由现有状态字段执行。",
  "读取篇幅、自由度、世界、主角与角色；短篇集中，标准篇完整，长篇采用多章节和阶段高潮。",
  "优先返回明确可读的规则值；不得允许 AI 替玩家决定核心行动，规则需兼容存档、状态和判定系统。",
] as const;

export function creationSystemRule(lockedFields: string[]) {
  return `用户已经填写的内容视为明确设定。除非用户选择允许优化，否则不得覆盖、改名、删除或反向解释。锁定字段绝对不能修改。锁定字段：${lockedFields.length ? lockedFields.join("、") : "无"}。严格输出 JSON，不输出 Markdown、代码或解释。`;
}

export function creationFieldPrompt(args: {
  definition: AiFieldDefinition;
  operation: CreationAiOperation;
  currentValue: string;
  context: unknown;
}) {
  const { definition, operation, currentValue, context } = args;
  const operationRule = {
    generate: "根据已有设定生成最连贯、最适合的内容。",
    expand: "保留原意并增加具体、可执行的细节，不改变事实。",
    simplify: "保留关键信息，压缩重复和模糊表达。",
    rewrite: "提供一种明显不同但与现有设定兼容的写法。",
  }[operation];
  const output = definition.candidateOnly
    ? '{"candidates":["候选1","候选2","候选3"]}'
    : '{"value":"生成内容"}';
  return `当前步骤：${CREATION_STEP_LABELS[definition.stepId]}。字段：${definition.label}（${definition.fieldKey}）。操作：${operationRule} 当前内容：${currentValue || "空白"}。相关上下文：${JSON.stringify(context)}。步骤规则：${CREATION_STEP_RULES[definition.stepId]}。最多 ${definition.maxLength} 个字符。返回 ${output}。`;
}

export function creationPagePrompt(args: {
  step: number;
  context: unknown;
  currentFields: Record<string, string>;
  lockedFields: string[];
  optimizeExisting: boolean;
  numericSystem: boolean;
}) {
  const isSimple =
    (args.context as { project?: { creationMode?: string } }).project
      ?.creationMode === "simple";
  const definitions = fieldsForStep(args.step, args.numericSystem).filter(
    (definition) => !isSimple || !definition.fieldKey.startsWith("advanced."),
  );
  const allowed = definitions.map((item) => item.fieldKey);
  return `补全${isSimple ? "简单" : "专业"}创建流程的“${CREATION_STEP_LABELS[args.step]}”页面。允许返回的字段只有：${allowed.join("、")}。当前字段：${JSON.stringify(args.currentFields)}。相关上下文：${JSON.stringify(args.context)}。${CREATION_STEP_RULES[args.step]}。${args.optimizeExisting ? "可以优化未锁定的已有内容，但不得改变核心事实。" : "只为当前为空的字段生成内容，不要返回已有字段。"}锁定字段不得返回：${args.lockedFields.join("、") || "无"}。返回 {"fields":{"字段路径":"内容"}${args.step === 3 ? ',"supportingCharacters":[{"name":"","identity":"","relationship":"","appearance":"","personality":"","goal":"","specialAbility":"","secret":""}]' : ""}}。缺失字段不要用空字符串占位。`;
}

export function creationIdeasPrompt(args: {
  step: number;
  fieldKey?: string;
  context: unknown;
  lockedFields: string[];
}) {
  const definition = args.fieldKey
    ? findCreationField(args.fieldKey)
    : undefined;
  const isSimple =
    (args.context as { project?: { creationMode?: string } }).project
      ?.creationMode === "simple";
  const allowed = definition
    ? [definition.fieldKey]
    : fieldsForStep(
        args.step,
        Boolean(
          (args.context as { project?: { numericSystem?: boolean } }).project
            ?.numericSystem,
        ),
      )
        .filter((item) => !isSimple || !item.fieldKey.startsWith("advanced."))
        .map((item) => item.fieldKey);
  return `为${isSimple ? "简单" : "专业"}创建流程的“${CREATION_STEP_LABELS[args.step]}”${definition ? `字段“${definition.label}”` : "页面"}提供三个候选方向。相关上下文：${JSON.stringify(args.context)}。步骤规则：${CREATION_STEP_RULES[args.step]}。仅可使用字段：${allowed.join("、")}，不得包含锁定字段：${args.lockedFields.join("、") || "无"}。返回 {"candidates":[{"style":"稳妥","title":"","description":"","fields":{}},{"style":"反转","title":"","description":"","fields":{}},{"style":"大胆","title":"","description":"","fields":{}}]}。候选只供预览，不写入表单。`;
}

export const fieldsForStep = (step: number, numericSystem = true) =>
  CREATION_AI_FIELDS.filter(
    (definition) => definition.stepId === step && (step !== 4 || numericSystem),
  );

export function findCreationField(fieldKey: string) {
  return CREATION_AI_FIELDS.find(
    (definition) => definition.fieldKey === fieldKey,
  );
}

export function readDraftField(draft: GenerationDraft, path: string): string {
  if (path.startsWith("advanced.")) {
    return String(draft.advanced?.[path.slice("advanced.".length)] ?? "");
  }
  return String((draft as unknown as Record<string, unknown>)[path] ?? "");
}

export function writeDraftField(
  draft: GenerationDraft,
  path: string,
  value: string,
): GenerationDraft {
  if (path.startsWith("advanced.")) {
    return {
      ...draft,
      advanced: { ...draft.advanced, [path.slice("advanced.".length)]: value },
    };
  }
  return { ...draft, [path]: value };
}

export function buildCreationAiContext(
  draft: GenerationDraft,
  step: number,
  fieldKey?: string,
) {
  const previous = CREATION_AI_FIELDS.filter(
    (definition) => definition.stepId <= step,
  )
    .filter((definition) => !fieldKey || definition.fieldKey !== fieldKey)
    .map(
      (definition) =>
        [
          definition.fieldKey,
          readDraftField(draft, definition.fieldKey),
        ] as const,
    )
    .filter(([, value]) => value.trim())
    .slice(-28);
  return {
    project: {
      idea: draft.idea,
      genre: draft.genre,
      protagonist: draft.protagonist,
      tone: draft.tone,
      freedomMode: draft.freedomMode,
      gameLength: draft.gameLength,
      numericSystem: draft.numericSystem,
      creationMode: draft.creationMode,
      worldBook: draft.worldBookPreview,
    },
    confirmedFields: Object.fromEntries(previous),
    existingCharacterRoles: (draft.supportingCharacters || [])
      .map(
        (character) =>
          `${character.name || "未命名"}：${character.identity || character.relationship}`,
      )
      .filter(Boolean),
  };
}

export const characterDraftSchema = z.object({
  id: z.string().max(100).optional().default(""),
  name: z.string().max(100).default(""),
  identity: z.string().max(200).default(""),
  relationship: z.string().max(300).default(""),
  appearance: z.string().max(800).default(""),
  personality: z.string().max(800).default(""),
  goal: z.string().max(800).default(""),
  specialAbility: z.string().max(800).default(""),
  secret: z.string().max(800).default(""),
});

export const creationFieldResultSchema = z
  .object({
    value: z.string().max(3000).optional(),
    candidates: z.array(z.string().max(1000)).min(3).max(5).optional(),
  })
  .refine((value) => value.value !== undefined || value.candidates?.length, {
    message: "字段生成结果为空",
  });

export const creationPageResultSchema = z.object({
  fields: z.record(z.string(), z.string().max(3000)).default({}),
  supportingCharacters: z.array(characterDraftSchema).max(8).optional(),
});

export const creationIdeasResultSchema = z.object({
  candidates: z
    .array(
      z.object({
        style: z.enum(["稳妥", "反转", "大胆"]),
        title: z.string().max(120),
        description: z.string().max(1000),
        fields: z.record(z.string(), z.string().max(3000)).default({}),
        supportingCharacters: z.array(characterDraftSchema).max(4).optional(),
      }),
    )
    .length(3),
});

export function resolveIdeaCandidateFields(
  candidate: {
    title: string;
    description: string;
    fields: Record<string, string>;
  },
  fieldKey?: string,
) {
  if (!fieldKey) return candidate.fields;
  const explicitValue = candidate.fields[fieldKey]?.trim();
  const definition = findCreationField(fieldKey);
  const fallbackValue = definition?.candidateOnly
    ? candidate.title.trim() || candidate.description.trim()
    : candidate.description.trim() || candidate.title.trim();
  const value = explicitValue || fallbackValue;
  return value
    ? {
        ...candidate.fields,
        [fieldKey]: value,
      }
    : candidate.fields;
}

export function sanitizePageFields(
  step: number,
  numericSystem: boolean,
  fields: Record<string, string>,
): Record<string, string> {
  const allowed = new Map(
    fieldsForStep(step, numericSystem).map((definition) => [
      definition.fieldKey,
      definition.maxLength,
    ]),
  );
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key, value]) => allowed.has(key) && typeof value === "string")
      .map(([key, value]) => [key, value.trim().slice(0, allowed.get(key))])
      .filter(([, value]) => value),
  ) as Record<string, string>;
}

export function emptyCreationMeta(): CreationDraftMeta {
  return {
    step: 0,
    lockedFields: [],
    aiDraftFields: [],
    fieldUndo: {},
    optimizeExisting: false,
  };
}

export function normalizeCreationWorkspace(
  value: unknown,
): CreationWorkspaceDraft | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<CreationWorkspaceDraft> &
    Partial<GenerationDraft>;
  if (source.kind === "creation-workspace-v1" && source.form) {
    return {
      kind: "creation-workspace-v1",
      form: source.form,
      meta: { ...emptyCreationMeta(), ...source.meta },
    };
  }
  if (typeof source.idea === "string" && source.creationMode) {
    return {
      kind: "creation-workspace-v1",
      form: source as GenerationDraft,
      meta: emptyCreationMeta(),
    };
  }
  return null;
}

export function snapshotCreationStep(
  draft: GenerationDraft,
  step: number,
): CreationStepSnapshot {
  return {
    fields: Object.fromEntries(
      fieldsForStep(step, draft.numericSystem).map((definition) => [
        definition.fieldKey,
        readDraftField(draft, definition.fieldKey),
      ]),
    ),
    supportingCharacters:
      step === 3
        ? structuredClone(draft.supportingCharacters || [])
        : undefined,
  };
}

export function countCreationFields(
  draft: GenerationDraft,
  lockedFields: string[],
) {
  const applicable = CREATION_AI_FIELDS.filter(
    (definition) => definition.stepId !== 4 || draft.numericSystem,
  );
  const filled = applicable.filter((definition) =>
    readDraftField(draft, definition.fieldKey).trim(),
  ).length;
  return {
    filled,
    empty: applicable.length - filled,
    locked: lockedFields.length,
  };
}

export function detectCreationConflicts(draft: GenerationDraft) {
  const warnings: string[] = [];
  const characters = draft.supportingCharacters || [];
  const roles = characters
    .map((character) => character.identity.trim().toLowerCase())
    .filter(Boolean);
  const duplicatedRoles = [
    ...new Set(roles.filter((role, index) => roles.indexOf(role) !== index)),
  ];
  if (duplicatedRoles.length)
    warnings.push(`主要配角存在重复身份定位：${duplicatedRoles.join("、")}`);
  if (draft.gameLength === "short" && characters.length > 5)
    warnings.push("短篇包含超过 5 位主要配角，可能导致人物线难以充分展开");
  if (
    !draft.numericSystem &&
    [
      "attributes",
      "levelSystem",
      "growthRules",
      "resourceRules",
      "checkRules",
    ].some((key) => draft.advanced?.[key]?.trim())
  )
    warnings.push(
      "数值系统已关闭，但草稿中仍有数值或成长规则；最终生成会忽略这些规则",
    );
  if (!draft.idea.trim()) warnings.push("还没有填写核心故事想法");
  if (!draft.protagonist.trim()) warnings.push("还没有确定主角类型");
  return warnings;
}

export function mergeCharacterDraft(
  current: SupportingCharacterDraft,
  generated: SupportingCharacterDraft,
  optimize: boolean,
) {
  return Object.fromEntries(
    Object.keys(current).map((key) => {
      const currentValue = current[key as keyof SupportingCharacterDraft];
      const nextValue = generated[key as keyof SupportingCharacterDraft];
      return [
        key,
        optimize || !String(currentValue).trim()
          ? nextValue || currentValue
          : currentValue,
      ];
    }),
  ) as unknown as SupportingCharacterDraft;
}

export function protectGeneratedProjectPatch(
  patch: Partial<GameProject>,
  base: GameProject,
  draft: GenerationDraft,
) {
  const next = structuredClone(patch);
  const advanced = draft.advanced || {};
  const locked = new Set(draft.creationMeta?.lockedFields || []);
  const keep = (path: string, value: string | undefined) =>
    locked.has(path) || Boolean(value?.trim());

  if (next.projectInfo) {
    if (keep("title", draft.title)) next.projectInfo.title = draft.title;
    if (keep("idea", draft.idea)) next.projectInfo.description = draft.idea;
    next.projectInfo.genre = draft.genre;
    next.projectInfo.tone = draft.tone;
    next.projectInfo.freedomMode = draft.freedomMode;
    next.projectInfo.gameLength = draft.gameLength;
  }
  if (next.world) {
    if (keep("advanced.background", advanced.background))
      next.world.background = advanced.background || base.world.background;
    if (keep("advanced.history", advanced.history))
      next.world.history = advanced.history || base.world.history;
    if (keep("advanced.geography", advanced.geography))
      next.world.geography = advanced.geography || base.world.geography;
    if (keep("advanced.crisis", advanced.crisis))
      next.world.currentCrisis = advanced.crisis || base.world.currentCrisis;
    if (keep("advanced.powerSystem", advanced.powerSystem))
      next.world.powerSystem = advanced.powerSystem || base.world.powerSystem;
  }
  if (next.player) {
    const playerMap: Array<[string, keyof GameProject["player"]]> = [
      ["playerName", "name"],
      ["playerGender", "gender"],
      ["playerAge", "age"],
      ["playerRace", "race"],
      ["playerIdentity", "identity"],
      ["playerOrigin", "background"],
      ["playerAppearance", "appearance"],
      ["playerPersonality", "personality"],
    ];
    for (const [draftKey, projectKey] of playerMap) {
      const value = advanced[draftKey];
      if (keep(`advanced.${draftKey}`, value)) {
        (next.player[projectKey] as string) =
          value || (base.player[projectKey] as string);
      }
    }
    if (keep("advanced.playerGoal", advanced.playerGoal))
      next.player.goals = advanced.playerGoal
        ? [advanced.playerGoal]
        : base.player.goals;
    if (keep("advanced.weakness", advanced.weakness))
      next.player.weaknesses = advanced.weakness
        ? [advanced.weakness]
        : base.player.weaknesses;
  }
  if (next.characters && draft.supportingCharacters?.length) {
    const generated = new Map(
      next.characters.map((character) => [character.id, character]),
    );
    const protectedCharacters = draft.supportingCharacters.map(
      (source, index) => {
        const existing =
          generated.get(source.id) ||
          next.characters?.[index] ||
          base.characters[index];
        const protectedCard = locked.has(`supportingCharacters.${source.id}`);
        if (protectedCard && base.characters[index])
          return base.characters[index];
        return {
          ...(existing || base.characters[index]),
          id: source.id,
          name: source.name || existing?.name || "",
          identity: source.identity || existing?.identity || "",
          relationship: source.relationship || existing?.relationship || "",
          appearance: source.appearance || existing?.appearance || "",
          personality: source.personality || existing?.personality || "",
          goal: source.goal || existing?.goal || "",
          secret: source.secret || existing?.secret || "",
        } as GameProject["characters"][number];
      },
    );
    const sourceIds = new Set(
      draft.supportingCharacters.map((character) => character.id),
    );
    const sourceNames = new Set(
      draft.supportingCharacters
        .map((character) => character.name)
        .filter(Boolean),
    );
    next.characters = [
      ...protectedCharacters,
      ...next.characters.filter(
        (character) =>
          !sourceIds.has(character.id) && !sourceNames.has(character.name),
      ),
    ];
  }
  if (next.gameSystem) {
    if (keep("advanced.levelSystem", advanced.levelSystem))
      next.gameSystem.levelSystem =
        advanced.levelSystem || base.gameSystem.levelSystem;
    if (keep("advanced.checkRules", advanced.checkRules))
      next.gameSystem.randomCheckRules =
        advanced.checkRules || base.gameSystem.randomCheckRules;
    if (keep("advanced.deathRules", advanced.deathRules))
      next.gameSystem.deathRules =
        advanced.deathRules || base.gameSystem.deathRules;
    if (keep("advanced.difficulty", advanced.difficulty))
      next.gameSystem.difficultyRules =
        advanced.difficulty || base.gameSystem.difficultyRules;
  }
  if (next.story) {
    if (keep("advanced.mainGoal", advanced.mainGoal))
      next.story.mainGoal = advanced.mainGoal || base.story.mainGoal;
    if (keep("advanced.opening", advanced.opening))
      next.story.openingEvent = advanced.opening || base.story.openingEvent;
  }
  return next;
}
