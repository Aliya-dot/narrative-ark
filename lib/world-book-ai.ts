import { z } from "zod";
import type { WorldBookAiOperation, WorldBookEntry } from "./types";
import {
  createWorldBookEntry,
  splitWorldBookTags,
  withWorldBookActivationMode,
  WORLD_BOOK_CATEGORIES,
} from "./world-book";
import {
  createWorldBookTrigger,
  normalizeWorldBookEntryTriggers,
} from "./world-book-triggers";
import { applyWorldBookQuickDefaults } from "./world-book-quick-defaults";

const categorySchema = z.enum(
  WORLD_BOOK_CATEGORIES as [
    WorldBookEntry["category"],
    ...WorldBookEntry["category"][],
  ],
);
export const generatedWorldBookEntrySchema = z
  .object({
    temporaryId: z.string().max(80).default(""),
    category: categorySchema,
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(500).default(""),
    content: z.string().trim().max(5000).default(""),
    keywords: z.array(z.string().trim().max(60)).max(20).default([]),
    aliases: z.array(z.string().trim().max(60)).max(20).default([]),
    suggestedActivationMode: z
      .enum(["conditional", "always", "core_rule", "disabled"])
      .default("conditional"),
    suggestedPriority: z.number().int().min(0).max(100).default(50),
    suggestedVisibility: z
      .enum(["player_visible", "ai_only", "hidden_until_discovered"])
      .default("player_visible"),
    relatedTitles: z.array(z.string().trim().max(120)).max(20).default([]),
  })
  .strip();
export const generatedWorldBookDraftSchema = z
  .object({
    suggestedNames: z.array(z.string().trim().max(120)).max(5).default([]),
    description: z.string().trim().max(1200).default(""),
    tags: z.array(z.string().trim().max(40)).max(20).default([]),
    coreSummary: z.string().trim().max(3000).default(""),
    entries: z.array(generatedWorldBookEntrySchema).max(30).default([]),
  })
  .strip();
export type GeneratedWorldBookDraft = z.infer<
  typeof generatedWorldBookDraftSchema
>;

export const worldBookGenerationRequestSchema = z.object({
  operation: z.enum(["full_generation", "fill_missing", "category_generation"]),
  brief: z.object({
    genre: z.string().max(120).default(""),
    idea: z.string().max(1600).default(""),
    tone: z.string().max(300).default(""),
    scale: z.enum(["compact", "standard", "large"]).default("standard"),
    era: z.string().max(300).default(""),
    include: z.string().max(800).default(""),
    exclude: z.string().max(800).default(""),
    conflict: z.string().max(800).default(""),
    reference: z.string().max(500).default(""),
    creativity: z.enum(["safe", "unique", "bold"]).default("unique"),
    category: categorySchema.optional(),
    count: z.number().int().min(1).max(8).optional(),
    direction: z.string().max(600).default(""),
  }),
  existing: z
    .object({
      name: z.string().max(160),
      description: z.string().max(1200),
      coreSummary: z.string().max(3000),
      entries: z
        .array(
          z
            .object({
              category: categorySchema,
              title: z.string().max(120),
              summary: z.string().max(500),
              locked: z.boolean().default(false),
            })
            .strip(),
        )
        .max(80),
    })
    .optional(),
});
export const worldBookEntryRequestSchema = z.object({
  operation: z.enum([
    "entry_generation",
    "entry_expand",
    "entry_summarize",
    "keyword_generation",
    "alias_generation",
    "entry_rewrite",
  ]),
  instruction: z.string().max(800).default(""),
  entry: z
    .object({
      category: categorySchema,
      title: z.string().max(120),
      summary: z.string().max(500),
      content: z.string().max(5000),
      keywords: z.array(z.string()).max(20),
      aliases: z.array(z.string()).max(20),
    })
    .strip(),
  context: z
    .object({
      coreSummary: z.string().max(3000),
      related: z
        .array(z.object({ title: z.string(), summary: z.string() }))
        .max(12),
    })
    .strip(),
});

export function worldBookSystemPrompt() {
  return "你是严谨的世界观编辑。只返回符合指定结构的 JSON，不输出 Markdown、代码或解释。不得照搬具体作品角色与专有设定；秘密不得写进玩家可见摘要。每张资料卡只表达一个主题，摘要 1-3 句，正文克制清晰。";
}
export function worldBookGenerationPrompt(
  input: z.infer<typeof worldBookGenerationRequestSchema>,
) {
  const scale =
    input.brief.scale === "compact"
      ? "精简骨架，约 12-16 张"
      : input.brief.scale === "large"
        ? "大型世界骨架，约 22-28 张，避免冗长"
        : "标准世界，约 16-24 张";
  const scope =
    input.operation === "category_generation"
      ? `只生成 ${input.brief.category} 分类，共 ${input.brief.count || 3} 张，方向：${input.brief.direction || "贴合现有世界"}`
      : input.operation === "fill_missing"
        ? "只补充现有世界明显缺失的分类或字段，不重写已有完整资料卡，忽略 locked=true 的资料卡"
        : `生成${scale}`;
  return `${scope}。\n创作条件：${JSON.stringify(input.brief)}\n现有世界（可能为空）：${JSON.stringify(input.existing || {})}\n返回 {"suggestedNames":[],"description":"","tags":[],"coreSummary":"","entries":[{"temporaryId":"","category":"","title":"","summary":"","content":"","keywords":[],"aliases":[],"suggestedActivationMode":"conditional|always|core_rule|disabled","suggestedPriority":50,"suggestedVisibility":"player_visible|ai_only|hidden_until_discovered","relatedTitles":[]}]}。核心规则 3-6 张；人物、地点、势力按规模合理分配。不要返回超过 30 张资料卡。`;
}
export function worldBookEntryPrompt(
  input: z.infer<typeof worldBookEntryRequestSchema>,
) {
  const action: Record<
    z.infer<typeof worldBookEntryRequestSchema>["operation"],
    string
  > = {
    entry_generation: "根据标题和分类完成这张资料卡",
    entry_expand: "保留事实并扩写详细设定",
    entry_summarize: "根据正文生成 1-3 句低 Token 摘要",
    keyword_generation: "只完善准确触发词，避免单字和宽泛词",
    alias_generation: "只完善合理别名或简称",
    entry_rewrite: "按用户要求换一种写法，但保留未要求改变的核心事实",
  };
  return `${action[input.operation]}。用户补充要求：${input.instruction || "无"}\n当前资料卡：${JSON.stringify(input.entry)}\n必要世界上下文：${JSON.stringify(input.context)}\n返回完整单卡，放在 entries 数组第一项；不修改调用方式和可见性。返回结构同完整世界书 JSON，其余顶层字段留空。`;
}

export function sanitizeGeneratedWorldBookDraft(
  value: unknown,
): GeneratedWorldBookDraft {
  const parsed = generatedWorldBookDraftSchema.parse(value);
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  return {
    ...parsed,
    entries: parsed.entries.filter((entry, index) => {
      const id = entry.temporaryId || `generated-${index + 1}`;
      const title = entry.title.toLowerCase();
      if (seenIds.has(id) || seenTitles.has(title)) return false;
      seenIds.add(id);
      seenTitles.add(title);
      entry.temporaryId = id;
      return true;
    }),
  };
}

export function operationForEntryAction(action: string): WorldBookAiOperation {
  return action as WorldBookAiOperation;
}

export function generatedDraftToEntries(
  worldBookId: string,
  draft: GeneratedWorldBookDraft,
): WorldBookEntry[] {
  const titleToId = new Map<string, string>();
  const prepared = draft.entries.map((generated) => {
    const id = `entry_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    titleToId.set(generated.title.toLowerCase(), id);
    let entry = applyWorldBookQuickDefaults(
      createWorldBookEntry(id, worldBookId, generated.category),
    );
    const generatedKeywords = splitWorldBookTags([
      generated.title,
      ...generated.keywords,
    ]);
    const generatedAliases = splitWorldBookTags(generated.aliases);
    entry = normalizeWorldBookEntryTriggers(withWorldBookActivationMode(
      {
        ...entry,
        title: generated.title,
        summary: generated.summary,
        content: generated.content,
        keywords: generatedKeywords,
        aliases: generatedAliases,
        triggers: generatedKeywords.map((value) =>
          createWorldBookTrigger(value, "ai"),
        ),
        aliasTriggers: generatedAliases.map((value) =>
          createWorldBookTrigger(value, "ai"),
        ),
        priority: generated.suggestedPriority,
        visibility: generated.suggestedVisibility,
        updatedAt: new Date().toISOString(),
      },
      generated.category === "core_rule"
        ? "core_rule"
        : generated.suggestedActivationMode,
    ));
    return { entry, relatedTitles: generated.relatedTitles };
  });
  return prepared.map(({ entry, relatedTitles }) => ({
    ...entry,
    relatedEntryIds: relatedTitles
      .map((title) => titleToId.get(title.toLowerCase()))
      .filter((id): id is string => Boolean(id)),
  }));
}
