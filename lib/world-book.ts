import { z } from "zod";
import type {
  GameProject,
  GameSave,
  GameWorldBinding,
  WorldBook,
  WorldBookContextBudget,
  WorldBookEntry,
  WorldBookEntryActivationMode,
  WorldBookEntryCategory,
  WorldBookRetrievalContext,
  WorldBookTurnContext,
  WorldBookVersion,
} from "./types";
import {
  normalizeWorldBookEntryTriggers,
  normalizeWorldBookTriggerText,
} from "./world-book-triggers";
import { ensureUniqueWorldBookEntryIds } from "./world-book-entry-identity";

export const WORLD_BOOK_RETRIEVAL = {
  minimumScore: 130,
  fullContentScore: 300,
  relatedMinimumParentScore: 200,
  relatedMaxDepth: 2,
} as const;

export const WORLD_BOOK_ACTIVATION_LABELS: Record<
  WorldBookEntryActivationMode,
  string
> = {
  conditional: "按需调用",
  always: "始终加载",
  core_rule: "核心规则",
  disabled: "暂不使用",
};

export function splitWorldBookTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of values
    .flatMap((part) => String(part).split(/[，,、；;\n]+/))
    .map((part) => part.trim())
    .filter(Boolean)) {
    const key = normalizeWorldBookTriggerText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function resolveWorldBookActivationMode(
  entry: Pick<
    WorldBookEntry,
    "activationMode" | "enabled" | "alwaysActive" | "immutable" | "category"
  >,
): WorldBookEntryActivationMode {
  if (entry.activationMode) return entry.activationMode;
  if (entry.immutable || entry.category === "core_rule") return "core_rule";
  if (entry.alwaysActive) return "always";
  if (entry.enabled) return "conditional";
  return "disabled";
}

export function withWorldBookActivationMode(
  entry: WorldBookEntry,
  activationMode: WorldBookEntryActivationMode,
): WorldBookEntry {
  return {
    ...entry,
    activationMode,
    enabled: activationMode !== "disabled",
    alwaysActive: activationMode === "always" || activationMode === "core_rule",
    immutable: activationMode === "core_rule",
  };
}

export function normalizeWorldBookEntry(entry: WorldBookEntry): WorldBookEntry {
  const explicitRelations = Array.isArray(entry.relations)
    ? entry.relations
        .filter(
          (relation) =>
            relation &&
            typeof relation.targetEntryId === "string" &&
            (relation.relationType === "reference" ||
              relation.relationType === "load_with"),
        )
        .filter(
          (relation, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.targetEntryId === relation.targetEntryId &&
                candidate.relationType === relation.relationType,
            ) === index,
        )
    : [];
  const relations = [...explicitRelations];
  for (const targetEntryId of Array.isArray(entry.relatedEntryIds)
    ? entry.relatedEntryIds
    : []) {
    if (
      !relations.some(
        (relation) =>
          relation.targetEntryId === targetEntryId &&
          relation.relationType === "load_with",
      )
    )
      relations.push({ targetEntryId, relationType: "load_with" });
  }
  const normalized = normalizeWorldBookEntryTriggers({
    ...entry,
    keywords: splitWorldBookTags(entry.keywords),
    aliases: splitWorldBookTags(entry.aliases),
    activeRegions: splitWorldBookTags(entry.activeRegions),
    activePeriods: splitWorldBookTags(entry.activePeriods),
    relations,
    relatedEntryIds: relations
      .filter((relation) => relation.relationType === "load_with")
      .map((relation) => relation.targetEntryId),
    factionIds: splitWorldBookTags(entry.factionIds),
    locked: entry.locked ?? false,
  });
  return withWorldBookActivationMode(
    normalized,
    resolveWorldBookActivationMode(normalized),
  );
}

export const WORLD_BOOK_CATEGORY_LABELS: Record<
  WorldBookEntryCategory,
  string
> = {
  core_rule: "核心规则",
  history: "历史",
  timeline: "纪年",
  location: "地点",
  faction: "势力",
  character: "人物",
  race: "种族与文明",
  religion: "宗教与神话",
  magic: "魔法与力量",
  technology: "科技",
  creature: "生物与怪物",
  item: "物品与资源",
  culture: "文化与习俗",
  language: "语言",
  economy: "经济与货币",
  custom: "自定义",
};

export const WORLD_BOOK_CATEGORIES = Object.keys(
  WORLD_BOOK_CATEGORY_LABELS,
) as WorldBookEntryCategory[];

export const WORLD_BOOK_BUDGETS: Record<
  Exclude<WorldBookContextBudget["mode"], "custom">,
  WorldBookContextBudget
> = {
  compact: { mode: "compact", maxTokens: 650, maxEntries: 5 },
  balanced: { mode: "balanced", maxTokens: 1200, maxEntries: 9 },
  detailed: { mode: "detailed", maxTokens: 2200, maxEntries: 16 },
};

export type WorldBookBundle = {
  format: "narrative-ark-world-book";
  version: 1;
  exportedAt: string;
  worldBook: WorldBook;
  entries: WorldBookEntry[];
  versions?: WorldBookVersion[];
};

const tagListSchema = z.preprocess(
  splitWorldBookTags,
  z.array(z.string().max(120)).max(100).default([]),
);

const triggerSchema = z.object({
  id: z.string().max(160),
  value: z.string().max(120),
  source: z.enum(["auto", "manual", "ai", "imported"]),
  locked: z.boolean().default(false),
  createdAt: z.string(),
});

const entrySchema = z
  .object({
    // Blank IDs are a semantic mapping error so the safe import path can
    // report blank_entry_id after structural bundle parsing.
    id: z.string().max(160),
    worldBookId: z.string().min(1).max(160),
    category: z.enum(
      WORLD_BOOK_CATEGORIES as [
        WorldBookEntryCategory,
        ...WorldBookEntryCategory[],
      ],
    ),
    title: z.string().min(1).max(160),
    summary: z.string().max(1200).default(""),
    content: z.string().max(12000).default(""),
    keywords: tagListSchema,
    aliases: tagListSchema,
    triggers: z.array(triggerSchema).max(100).optional(),
    aliasTriggers: z.array(triggerSchema).max(100).optional(),
    priority: z.number().int().min(0).max(100).default(50),
    activationMode: z
      .enum(["conditional", "always", "core_rule", "disabled"])
      .optional(),
    enabled: z.boolean().default(true),
    alwaysActive: z.boolean().default(false),
    visibility: z
      .enum(["player_visible", "ai_only", "hidden_until_discovered"])
      .default("player_visible"),
    relatedEntryIds: z.array(z.string().max(160)).max(100).default([]),
    relations: z
      .array(
        z.object({
          targetEntryId: z.string().max(160),
          relationType: z.enum(["reference", "load_with"]),
        }),
      )
      .max(200)
      .optional(),
    activeRegions: tagListSchema.optional(),
    activePeriods: tagListSchema.optional(),
    factionIds: tagListSchema.optional(),
    allowAiExpansion: z.boolean().default(true),
    immutable: z.boolean().default(false),
    locked: z.boolean().default(false),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strip();

const bookSchema = z
  .object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
    description: z.string().max(1200).default(""),
    cover: z.string().max(1000).optional(),
    tags: z.array(z.string().max(60)).max(30).default([]),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    currentVersionId: z.string().max(200).default(""),
    versionNumber: z.number().int().min(1).default(1),
    coreSummary: z.string().max(4000).default(""),
    coreSummaryStatus: z
      .enum(["current", "stale", "manual", "empty"])
      .optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    entryIds: z.array(z.string().max(160)).max(2000).default([]),
    source: z
      .object({
        projectId: z.string(),
        saveId: z.string().optional(),
        turn: z.number().optional(),
        extractionMode: z.enum(["original", "derived", "custom"]),
        extractedAt: z.string(),
      })
      .optional(),
  })
  .strip();

const versionSchema = z
  .object({
    id: z.string().min(1).max(220),
    worldBookId: z.string().min(1).max(160),
    versionNumber: z.number().int().min(1),
    note: z.string().max(500).optional(),
    createdAt: z.string(),
    snapshot: z.object({
      coreSummary: z.string().max(4000),
      entries: z.array(entrySchema).max(2000),
    }),
  })
  .strip();

const bundleSchema = z
  .object({
    format: z.literal("narrative-ark-world-book"),
    version: z.literal(1),
    exportedAt: z.string(),
    worldBook: bookSchema,
    entries: z.array(entrySchema).max(2000),
    versions: z.array(versionSchema).max(200).optional(),
  })
  .strip();

export function estimateWorldBookTokens(value: string) {
  if (!value.trim()) return 0;
  const ascii = (value.match(/[\x00-\xff]/g) || []).length;
  const nonAscii = Math.max(0, value.length - ascii);
  return Math.max(1, Math.ceil(ascii / 4 + nonAscii / 1.7));
}

export function createWorldBook(
  id: string,
  name = "未命名世界书",
): { book: WorldBook; version: WorldBookVersion } {
  const now = new Date().toISOString();
  const versionId = `${id}:v1`;
  const book: WorldBook = {
    id,
    name,
    description: "",
    tags: [],
    status: "draft",
    currentVersionId: versionId,
    versionNumber: 1,
    coreSummary: "",
    coreSummaryStatus: "empty",
    createdAt: now,
    updatedAt: now,
    entryIds: [],
  };
  return {
    book,
    version: {
      id: versionId,
      worldBookId: id,
      versionNumber: 1,
      note: "创建世界书",
      createdAt: now,
      snapshot: { coreSummary: "", entries: [] },
    },
  };
}

export function createWorldBookEntry(
  id: string,
  worldBookId: string,
  category: WorldBookEntryCategory = "custom",
): WorldBookEntry {
  const now = new Date().toISOString();
  return withWorldBookActivationMode(
    {
      id,
      worldBookId,
      category,
      title: "新资料卡",
      summary: "",
      content: "",
      keywords: [],
      aliases: [],
      triggers: [],
      aliasTriggers: [],
      priority: 50,
      enabled: true,
      alwaysActive: category === "core_rule",
      visibility: "player_visible",
      relatedEntryIds: [],
      relations: [],
      allowAiExpansion: true,
      immutable: category === "core_rule",
      locked: false,
      createdAt: now,
      updatedAt: now,
    },
    category === "core_rule" ? "core_rule" : "conditional",
  );
}

export function createNextWorldBookVersion(
  book: WorldBook,
  entries: WorldBookEntry[],
  note = "更新世界书",
) {
  const now = new Date().toISOString();
  const versionNumber = book.versionNumber + 1;
  const version: WorldBookVersion = {
    id: `${book.id}:v${versionNumber}:${Date.now().toString(36)}`,
    worldBookId: book.id,
    versionNumber,
    note,
    createdAt: now,
    snapshot: {
      coreSummary: book.coreSummary,
      entries: structuredClone(entries),
    },
  };
  return {
    book: {
      ...book,
      currentVersionId: version.id,
      versionNumber,
      updatedAt: now,
      entryIds: entries.map((entry) => entry.id),
    },
    version,
  };
}

export function createWorldBookBundle(
  book: WorldBook,
  entries: WorldBookEntry[],
  versions?: WorldBookVersion[],
): WorldBookBundle {
  return {
    format: "narrative-ark-world-book",
    version: 1,
    exportedAt: new Date().toISOString(),
    worldBook: structuredClone(book),
    entries: structuredClone(entries),
    versions: versions ? structuredClone(versions) : undefined,
  };
}

export function parseWorldBookBundle(value: unknown): WorldBookBundle {
  const parsed = bundleSchema.parse(value);
  const ids = new Set(parsed.entries.map((entry) => entry.id));
  return {
    ...parsed,
    worldBook: {
      ...parsed.worldBook,
      entryIds: parsed.worldBook.entryIds.filter((id) => ids.has(id)),
    },
    entries: parsed.entries.map((rawEntry) => {
      const entry = normalizeWorldBookEntry(rawEntry);
      return {
        ...entry,
        worldBookId: parsed.worldBook.id,
      };
    }),
  };
}

export function bindingForWorldBook(
  book: WorldBook,
  budget: WorldBookContextBudget = WORLD_BOOK_BUDGETS.balanced,
): GameWorldBinding {
  return {
    worldBookId: book.id,
    worldBookVersionId: book.currentVersionId,
    worldBookVersionNumber: book.versionNumber,
    contextBudget: { ...budget },
  };
}

function normalizedTerms(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) =>
          value.toLowerCase().split(/[\s，。、“”！？；：,.;:()[\]{}]+/),
        )
        .map(normalizeWorldBookTriggerText)
        .filter((value) => value.length >= 2),
    ),
  ].slice(0, 120);
}

function includesTerm(haystack: string, terms: string[]) {
  const source = normalizeWorldBookTriggerText(haystack);
  return terms.find((term) => source.includes(term));
}

export function buildWorldBookRetrievalContext(
  project: GameProject,
  save: GameSave,
  userInput: string,
): WorldBookRetrievalContext {
  const location = project.world.locations.find(
    (item) => item.id === save.currentLocationId,
  );
  const activeNpcIds = Object.entries(save.characterStates)
    .filter(([, state]) => state.locationId === save.currentLocationId)
    .map(([id]) => id);
  const activeNpcNames = project.characters
    .filter(
      (character) =>
        activeNpcIds.includes(character.id) ||
        userInput.includes(character.name),
    )
    .map((character) => character.name);
  const recentNarrative = save.recentMessages
    .slice(-6)
    .map((message) => message.content)
    .join("\n");
  return {
    userInput,
    recentNarrative,
    currentLocation: location?.name || save.currentLocationId,
    activeNpcIds,
    activeNpcNames,
    activeFactionIds: Object.keys(save.factionStates).filter(
      (id) => save.factionStates[id]?.status !== "消亡",
    ),
    activeTaskIds: save.activeQuests.map((quest) => quest.id),
    activeTaskText: save.activeQuests.flatMap((quest) => [
      quest.title,
      quest.description,
      ...quest.objectives,
      ...quest.progress,
    ]),
    activeItemIds: [
      ...save.playerState.inventory,
      ...save.playerState.equipment,
    ].map((item) => item.id),
    activeItemNames: [
      ...save.playerState.inventory,
      ...save.playerState.equipment,
    ].map((item) => item.name),
    currentPeriod: save.currentTime,
  };
}

type ScoredEntry = {
  entry: WorldBookEntry;
  score: number;
  reasons: string[];
};

type EvaluatedEntry = ScoredEntry & { skippedReason?: string };

function termInText(text: string, term: string) {
  if (!text || !term) return false;
  const source = normalizeWorldBookTriggerText(text);
  const needle = normalizeWorldBookTriggerText(term);
  if (/^[a-z0-9_-]+$/i.test(needle)) {
    return new RegExp(
      `(^|[^a-z0-9_-])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9_-])`,
      "i",
    ).test(source);
  }
  return needle.length >= 2 && source.includes(needle);
}

function firstTerm(text: string, terms: string[]) {
  return terms.find((term) => termInText(text, term));
}

function conditionMatch(
  current: string | undefined,
  allowed: string[] | undefined,
) {
  if (!allowed?.length) return { allowed: true, exact: false, parent: false };
  if (!current?.trim()) return { allowed: false, exact: false, parent: false };
  const value = normalizeWorldBookTriggerText(current);
  const exact = allowed.some(
    (item) => normalizeWorldBookTriggerText(item) === value,
  );
  const parent =
    !exact &&
    allowed.some((item) => {
      const condition = normalizeWorldBookTriggerText(item);
      return (
        condition.length >= 2 &&
        (value.includes(condition) || condition.includes(value))
      );
    });
  return { allowed: exact || parent, exact, parent };
}

function evaluateEntry(
  entry: WorldBookEntry,
  context: WorldBookRetrievalContext,
): EvaluatedEntry {
  entry = normalizeWorldBookEntry(entry);
  const mode = resolveWorldBookActivationMode(entry);
  if (mode === "disabled")
    return {
      entry,
      score: 0,
      reasons: [],
      skippedReason: "资料卡已设为暂不使用",
    };
  let score = 0;
  const reasons: string[] = [];
  const searchable = [
    entry.title,
    entry.summary,
    ...entry.keywords,
    ...entry.aliases,
  ].join(" ");
  const entryTerms = normalizedTerms([
    entry.title,
    ...entry.keywords,
    ...entry.aliases,
  ]);
  if (mode === "core_rule") {
    score += 900;
    reasons.push("核心规则：每回合以最高优先级加载");
  } else if (mode === "always") {
    score += 700;
    reasons.push("调用模式为始终加载");
  }
  const locationCondition = conditionMatch(
    context.currentLocation,
    entry.activeRegions,
  );
  if (mode === "conditional" && !locationCondition.allowed)
    return {
      entry,
      score,
      reasons,
      skippedReason: "当前地点不符合资料卡的生效地点",
    };
  const periodCondition = conditionMatch(
    context.currentPeriod,
    entry.activePeriods,
  );
  if (mode === "conditional" && !periodCondition.allowed)
    return {
      entry,
      score,
      reasons,
      skippedReason: "当前时期不符合资料卡的生效时间",
    };
  if (locationCondition.exact) {
    score += 360;
    reasons.push("当前地点精确匹配");
  } else if (locationCondition.parent) {
    score += 180;
    reasons.push("当前地点与生效地区存在上下级关系");
  }
  if (periodCondition.exact) {
    score += 210;
    reasons.push("当前时期精确匹配");
  } else if (periodCondition.parent) {
    score += 100;
    reasons.push("当前时期与生效时间相关");
  }
  const normalizedLocation = (context.currentLocation || "").toLowerCase();
  if (
    context.currentLocation &&
    !entry.activeRegions?.length &&
    (searchable.toLowerCase().includes(normalizedLocation) ||
      Boolean(firstTerm(context.currentLocation, entryTerms)))
  ) {
    score += 360;
    reasons.push("当前地点");
  }
  const npcTerms = normalizedTerms([
    ...context.activeNpcIds,
    ...context.activeNpcNames,
  ]);
  const npcHit =
    context.activeNpcIds.includes(entry.id) ||
    includesTerm(searchable, npcTerms);
  if (npcHit) {
    score += 320;
    reasons.push("当前出场人物");
  }
  if (
    context.activeFactionIds.includes(entry.id) ||
    entry.factionIds?.some((id) => context.activeFactionIds.includes(id))
  ) {
    score += 240;
    reasons.push("当前势力");
  }
  const taskContext = [
    ...context.activeTaskIds,
    ...context.activeTaskText,
  ].join(" ");
  const taskHit =
    includesTerm(taskContext, entryTerms) ||
    includesTerm(
      searchable,
      normalizedTerms([...context.activeTaskIds, ...context.activeTaskText]),
    );
  if (taskHit) {
    score += 220;
    reasons.push(`当前任务命中“${taskHit}”`);
  }
  const itemContext = [
    ...context.activeItemIds,
    ...context.activeItemNames,
  ].join(" ");
  const itemHit =
    includesTerm(itemContext, entryTerms) ||
    includesTerm(
      searchable,
      normalizedTerms([...context.activeItemIds, ...context.activeItemNames]),
    );
  if (itemHit) {
    score += 190;
    reasons.push(`能力或物品命中“${itemHit}”`);
  }
  const inputHit = firstTerm(context.userInput, entryTerms);
  if (inputHit) {
    score += 260;
    reasons.push(`玩家输入命中“${inputHit}”`);
  }
  const recentHit = firstTerm(context.recentNarrative, entryTerms);
  if (recentHit) {
    score += 100;
    reasons.push(`最近剧情命中“${recentHit}”`);
  }
  if (mode === "conditional" && reasons.length === 0)
    return {
      entry,
      score: 0,
      reasons,
      skippedReason: "没有命中人物、地点、任务、物品或触发词",
    };
  if (mode === "conditional" && score < WORLD_BOOK_RETRIEVAL.minimumScore)
    return { entry, score, reasons, skippedReason: "相关度低于调用阈值" };
  // Importance only orders cards that were already activated; it never activates a card alone.
  score += Math.max(0, Math.min(100, entry.priority)) * 0.5;
  return { entry, score, reasons };
}

export function retrieveWorldBookContext(
  book: WorldBook,
  version: WorldBookVersion,
  context: WorldBookRetrievalContext,
  budget: WorldBookContextBudget,
): WorldBookTurnContext {
  const maxTokens = Math.max(200, budget.maxTokens);
  const maxEntries = Math.max(1, budget.maxEntries || 10);
  const normalizedEntries = ensureUniqueWorldBookEntryIds(
    version.snapshot.entries.map(normalizeWorldBookEntry),
  ).entries;
  const entriesById = new Map(
    normalizedEntries.map((entry) => [entry.id, entry]),
  );
  const evaluations = normalizedEntries.map((entry) =>
    evaluateEntry(entry, context),
  );
  const scored = evaluations.filter((item) => !item.skippedReason);
  const scoredById = new Map(scored.map((item) => [item.entry.id, item]));
  const queue = scored
    .filter(
      (item) => item.score >= WORLD_BOOK_RETRIEVAL.relatedMinimumParentScore,
    )
    .map((item) => ({ item, depth: 0 }));
  const visited = new Set(scored.map((item) => item.entry.id));
  while (queue.length) {
    const { item, depth } = queue.shift()!;
    if (depth >= WORLD_BOOK_RETRIEVAL.relatedMaxDepth) continue;
    for (const relatedId of item.entry.relatedEntryIds) {
      const related = entriesById.get(relatedId);
      if (!related || visited.has(relatedId)) continue;
      visited.add(relatedId);
      const mode = resolveWorldBookActivationMode(related);
      if (mode === "disabled") continue;
      const location = conditionMatch(
        context.currentLocation,
        related.activeRegions,
      );
      const period = conditionMatch(
        context.currentPeriod,
        related.activePeriods,
      );
      if (!location.allowed || !period.allowed) continue;
      const relatedItem = {
        entry: related,
        score: Math.max(
          140,
          item.score * 0.3 + related.priority * 0.5 - depth * 25,
        ),
        reasons: [`由“${item.entry.title}”关联加载（第 ${depth + 1} 层）`],
      };
      scored.push(relatedItem);
      scoredById.set(relatedId, relatedItem);
      queue.push({ item: relatedItem, depth: depth + 1 });
    }
  }
  scored.sort(
    (a, b) => b.score - a.score || b.entry.priority - a.entry.priority,
  );

  const coreSummaryTokens = estimateWorldBookTokens(
    version.snapshot.coreSummary,
  );
  let usedTokens = coreSummaryTokens;
  const selected: WorldBookTurnContext["entries"] = [];
  const previewSelected: WorldBookTurnContext["preview"]["selected"] = [];
  const skipped: WorldBookTurnContext["preview"]["skipped"] = evaluations
    .filter((item) => item.skippedReason && !scoredById.has(item.entry.id))
    .map((item) => ({
      entryId: item.entry.id,
      title: item.entry.title,
      visibility: item.entry.visibility,
      reason: item.skippedReason!,
      score: Math.round(item.score),
      reasons: item.reasons,
    }));
  for (const item of scored) {
    const mode = resolveWorldBookActivationMode(item.entry);
    const protectedEntry = mode === "core_rule";
    if (selected.length >= maxEntries && !protectedEntry) {
      skipped.push({
        entryId: item.entry.id,
        title: item.entry.title,
        visibility: item.entry.visibility,
        reason: "超过条目数量预算",
        score: Math.round(item.score),
        reasons: item.reasons,
      });
      continue;
    }
    const highRelevance = item.score >= WORLD_BOOK_RETRIEVAL.fullContentScore;
    let injection: "full" | "summary" = highRelevance ? "full" : "summary";
    let text =
      injection === "full"
        ? item.entry.content || item.entry.summary
        : item.entry.summary || item.entry.content.slice(0, 420);
    let tokens = estimateWorldBookTokens(text);
    if (usedTokens + tokens > maxTokens && injection === "full") {
      injection = "summary";
      text = item.entry.summary || item.entry.content.slice(0, 420);
      tokens = estimateWorldBookTokens(text);
    }
    if (usedTokens + tokens > maxTokens && !protectedEntry) {
      skipped.push({
        entryId: item.entry.id,
        title: item.entry.title,
        visibility: item.entry.visibility,
        reason: "Token 预算不足",
        score: Math.round(item.score),
        reasons: item.reasons,
      });
      continue;
    }
    usedTokens += tokens;
    selected.push({
      id: item.entry.id,
      category: item.entry.category,
      title: item.entry.title,
      text,
      visibility: item.entry.visibility,
      injection,
    });
    previewSelected.push({
      entryId: item.entry.id,
      title: item.entry.title,
      visibility: item.entry.visibility,
      score: Math.round(item.score),
      reasons: item.reasons.length
        ? item.reasons
        : [`资料重要度 ${item.entry.priority}`],
      estimatedTokens: tokens,
      injection,
    });
  }
  const fullBookTokens = estimateWorldBookTokens(
    [
      version.snapshot.coreSummary,
      ...version.snapshot.entries.map(
        (entry) => `${entry.title}\n${entry.content}`,
      ),
    ].join("\n\n"),
  );
  const injectedTokens = usedTokens;
  return {
    worldBookId: book.id,
    worldBookVersionId: version.id,
    worldBookName: book.name,
    coreSummary: version.snapshot.coreSummary,
    entries: selected,
    preview: {
      worldBookId: book.id,
      worldBookVersionId: version.id,
      worldBookName: book.name,
      coreSummaryTokens,
      injectedTokens,
      fullBookTokens,
      estimatedSavingsPercent:
        fullBookTokens > 0
          ? Math.max(0, Math.round((1 - injectedTokens / fullBookTokens) * 100))
          : 0,
      selected: previewSelected,
      skipped,
      createdAt: new Date().toISOString(),
    },
  };
}

export function worldBookSnapshotToProjectWorld(version: WorldBookVersion) {
  const enabled = version.snapshot.entries.filter((entry) => entry.enabled);
  const byCategory = (category: WorldBookEntryCategory) =>
    enabled.filter((entry) => entry.category === category);
  const text = (entry: WorldBookEntry) => entry.content || entry.summary;
  return {
    background: version.snapshot.coreSummary,
    history: [...byCategory("history"), ...byCategory("timeline")]
      .map(text)
      .join("\n\n"),
    geography: byCategory("location")
      .map((entry) => `${entry.title}：${entry.summary || entry.content}`)
      .join("\n"),
    locations: byCategory("location").map((entry) => ({
      id: entry.id,
      name: entry.title,
      description: text(entry),
      connections: entry.relatedEntryIds,
    })),
    factions: byCategory("faction").map((entry) => ({
      id: entry.id,
      name: entry.title,
      description: text(entry),
      attitude: 0,
      goal: entry.summary,
    })),
    races: byCategory("race").map((entry) => entry.title),
    religions: byCategory("religion").map((entry) => entry.title),
    socialRules: [...byCategory("culture"), ...byCategory("economy")].map(text),
    powerSystem: [...byCategory("magic"), ...byCategory("technology")]
      .map(text)
      .join("\n\n"),
    currentCrisis: "",
    secrets: enabled
      .filter((entry) => entry.visibility !== "player_visible")
      .map(text),
  };
}

export function extractWorldBookFromProject(
  project: GameProject,
  worldBookId: string,
) {
  const now = new Date().toISOString();
  const entries: WorldBookEntry[] = [];
  const add = (
    category: WorldBookEntryCategory,
    title: string,
    content: string,
    options: Partial<WorldBookEntry> = {},
  ) => {
    if (!content.trim()) return;
    const id = `${worldBookId}:${category}:${entries.length + 1}`;
    entries.push({
      ...createWorldBookEntry(id, worldBookId, category),
      title,
      summary: content.slice(0, 240),
      content,
      keywords: [title],
      createdAt: now,
      updatedAt: now,
      ...options,
    });
  };
  add("history", "世界历史", project.world.history);
  add("custom", "地理概览", project.world.geography);
  for (const location of project.world.locations)
    add("location", location.name, location.description, {
      relatedEntryIds: location.connections,
      aliases: [location.id],
    });
  for (const faction of project.world.factions)
    add("faction", faction.name, faction.description, {
      summary: faction.goal || faction.description.slice(0, 240),
      aliases: [faction.id],
    });
  for (const character of project.characters)
    add(
      "character",
      character.name,
      [
        character.identity,
        character.background,
        character.personality,
        character.appearance,
        `目标：${character.goal}`,
      ]
        .filter(Boolean)
        .join("\n"),
      {
        aliases: [character.id],
        visibility: character.secret ? "ai_only" : "player_visible",
      },
    );
  add("magic", "力量体系", project.world.powerSystem);
  project.world.socialRules.forEach((rule, index) =>
    add("culture", `社会规则 ${index + 1}`, rule),
  );
  const extractedIdMap = new Map<string, string>();
  for (const entry of entries) {
    for (const alias of entry.aliases) extractedIdMap.set(alias, entry.id);
  }
  for (const entry of entries) {
    entry.relatedEntryIds = entry.relatedEntryIds
      .map((relatedId) => extractedIdMap.get(relatedId) || relatedId)
      .filter((relatedId) =>
        entries.some((candidate) => candidate.id === relatedId),
      );
  }
  const book: WorldBook = {
    id: worldBookId,
    name: `${project.projectInfo.title} · 世界书`,
    description: `从《${project.projectInfo.title}》的稳定世界设定提取。未包含玩家状态、任务进度、关系数值、回合历史与存档。`,
    tags: [project.projectInfo.genre, project.projectInfo.tone].filter(Boolean),
    status: "draft",
    currentVersionId: `${worldBookId}:v1`,
    versionNumber: 1,
    coreSummary: project.world.background,
    createdAt: now,
    updatedAt: now,
    entryIds: entries.map((entry) => entry.id),
  };
  const version: WorldBookVersion = {
    id: book.currentVersionId,
    worldBookId,
    versionNumber: 1,
    note: `从项目《${project.projectInfo.title}》提取`,
    createdAt: now,
    snapshot: {
      coreSummary: book.coreSummary,
      entries: structuredClone(entries),
    },
  };
  return { book, entries, version };
}

export function playerVisibleWorldBookEntries(
  entries: WorldBookEntry[],
  discoveredIds: string[] = [],
) {
  return entries.filter(
    (entry) =>
      entry.visibility === "player_visible" ||
      (entry.visibility === "hidden_until_discovered" &&
        discoveredIds.includes(entry.id)),
  );
}
