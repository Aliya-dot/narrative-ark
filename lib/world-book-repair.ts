import type {
  WorldBook,
  WorldBookEntry,
  WorldBookEntryRelation,
} from "./types";
import {
  estimateWorldBookTokens,
  normalizeWorldBookEntry,
  resolveWorldBookActivationMode,
  splitWorldBookTags,
  withWorldBookActivationMode,
} from "./world-book";
import type { WorldBookIssue } from "./world-book-validation";
import { getWorldBookTokenReport } from "./world-book-validation";
import { normalizeWorldBookTriggerText } from "./world-book-triggers";

export type WorldBookRepairStrategy =
  | "remove_duplicate_trigger"
  | "replace_with_specific_trigger"
  | "break_relation"
  | "convert_relation_type"
  | "remove_invalid_relation"
  | "remove_self_relation"
  | "generate_summary"
  | "generate_trigger_words"
  | "change_activation_mode"
  | "compress_always_loaded_content"
  | "refresh_core_summary"
  | "manual_review";

export type WorldBookRepairChange = {
  entryId?: string;
  field: keyof WorldBookEntry | keyof WorldBook;
  label: string;
  before: unknown;
  after: unknown;
};

export type WorldBookRepairSuggestion = {
  id: string;
  issueId: string;
  strategy: WorldBookRepairStrategy;
  title: string;
  explanation: string;
  affectedEntryIds: string[];
  before: unknown;
  after: unknown;
  changes: WorldBookRepairChange[];
  confidence: "high" | "medium" | "low";
  source: "local_rule" | "ai";
  safeToApply: boolean;
  canApply: boolean;
};

const BROAD_CATEGORIES: WorldBookEntry["category"][] = [
  "core_rule",
  "race",
  "faction",
  "culture",
  "religion",
  "magic",
  "technology",
];

function firstSummary(content: string) {
  const firstParagraph = content
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .find(Boolean);
  if (!firstParagraph) return "";
  const sentences = firstParagraph.match(/[^。！？!?]+[。！？!?]?/g) || [
    firstParagraph,
  ];
  const concise = sentences.slice(0, 3).join("").trim();
  return concise.length > 240 ? `${concise.slice(0, 237)}…` : concise;
}

function reliableTitle(title: string) {
  const value = title.trim();
  if (value.length < 2 || value.length > 48) return false;
  return !/^(新资料卡|未命名|人物|地点|城市|国家|世界|魔法|物品|势力|组织)$/.test(
    value,
  );
}

function relationList(entry: WorldBookEntry): WorldBookEntryRelation[] {
  return normalizeWorldBookEntry(entry).relations || [];
}

function change(
  entryId: string,
  field: keyof WorldBookEntry,
  label: string,
  before: unknown,
  after: unknown,
): WorldBookRepairChange {
  return { entryId, field, label, before, after };
}

export function planWorldBookRepairs(
  book: WorldBook,
  entries: WorldBookEntry[],
  issues: WorldBookIssue[],
): WorldBookRepairSuggestion[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const suggestions: WorldBookRepairSuggestion[] = [];
  for (const issue of issues) {
    const issueEntryIds = Array.from(new Set(issue.entryIds || []));
    const affected = issueEntryIds
      .map((id) => byId.get(id))
      .filter((entry): entry is WorldBookEntry => Boolean(entry));
    if (issue.type === "broken_relation" || issue.type === "self_relation") {
      const entry = affected[0];
      if (!entry) continue;
      const invalidId =
        issue.type === "self_relation"
          ? entry.id
          : issue.id.split(":").slice(2).join(":");
      const beforeRelations = relationList(entry);
      const afterRelations = beforeRelations.filter(
        (relation) => relation.targetEntryId !== invalidId,
      );
      const beforeIds = entry.relatedEntryIds;
      const afterIds = beforeIds.filter((id) => id !== invalidId);
      const changes = [
        change(
          entry.id,
          "relations",
          "关联关系",
          beforeRelations,
          afterRelations,
        ),
        change(entry.id, "relatedEntryIds", "调用关联", beforeIds, afterIds),
      ];
      suggestions.push({
        id: `repair:${issue.id}`,
        issueId: issue.id,
        strategy:
          issue.type === "self_relation"
            ? "remove_self_relation"
            : "remove_invalid_relation",
        title: issue.type === "self_relation" ? "移除自我关联" : "移除失效关联",
        explanation:
          issue.type === "self_relation"
            ? "资料卡无需调用自己；移除后不会损失其他内容。"
            : "目标资料卡已不存在，保留这个 ID 只会产生无效检索。",
        affectedEntryIds: [entry.id],
        before: changes.map((item) => item.before),
        after: changes.map((item) => item.after),
        changes,
        confidence: "high",
        source: "local_rule",
        safeToApply: true,
        canApply: true,
      });
      continue;
    }
    if (issue.type === "missing_summary") {
      const entry = affected[0];
      const summary = entry ? firstSummary(entry.content) : "";
      if (!entry || !summary) continue;
      const changes = [
        change(entry.id, "summary", "简短说明", entry.summary, summary),
      ];
      suggestions.push({
        id: `repair:${issue.id}`,
        issueId: issue.id,
        strategy: "generate_summary",
        title: `从“${entry.title}”详细设定提取简短说明`,
        explanation:
          "本地规则只截取详细设定的前 1～3 句话，不添加新事实。应用前可以查看完整差异。",
        affectedEntryIds: [entry.id],
        before: entry.summary,
        after: summary,
        changes,
        confidence: "medium",
        source: "local_rule",
        safeToApply: false,
        canApply: true,
      });
      continue;
    }
    if (issue.type === "missing_trigger") {
      const entry = affected[0];
      if (!entry || !reliableTitle(entry.title)) continue;
      const nextKeywords = splitWorldBookTags([...entry.keywords, entry.title]);
      const changes = [
        change(entry.id, "keywords", "触发词", entry.keywords, nextKeywords),
      ];
      suggestions.push({
        id: `repair:${issue.id}`,
        issueId: issue.id,
        strategy: "generate_trigger_words",
        title: `使用“${entry.title}”作为精确触发词`,
        explanation:
          "资料卡标题是可靠的专有名称。本地修复不会生成“人物、城市、魔法”等宽泛普通词。",
        affectedEntryIds: [entry.id],
        before: entry.keywords,
        after: nextKeywords,
        changes,
        confidence: "high",
        source: "local_rule",
        safeToApply: true,
        canApply: true,
      });
      continue;
    }
    if (issue.type === "duplicate_trigger") {
      const term = issue.relatedValues?.[0] || "";
      const ranked = [...affected].sort((left, right) => {
        const score = (entry: WorldBookEntry) =>
          (BROAD_CATEGORIES.includes(entry.category) ? 80 : 0) +
          (entry.title.trim().toLowerCase() === term.toLowerCase() ? 70 : 0) +
          entry.priority +
          Math.min(30, entry.summary.length / 12);
        return score(right) - score(left);
      });
      const overview = ranked[0];
      const clearlyOverview =
        overview &&
        BROAD_CATEGORIES.includes(overview.category) &&
        ranked.filter((entry) => BROAD_CATEGORIES.includes(entry.category))
          .length === 1;
      const safeChanges: WorldBookRepairChange[] = [];
      if (clearlyOverview) {
        for (const entry of affected.filter(
          (item) => item.id !== overview.id,
        )) {
          const nextTriggers = (entry.triggers || []).filter(
            (trigger) =>
              !(
                trigger.source === "auto" &&
                !trigger.locked &&
                normalizeWorldBookTriggerText(trigger.value) ===
                  normalizeWorldBookTriggerText(term)
              ),
          );
          const nextAliases = (entry.aliasTriggers || []).filter(
            (trigger) =>
              !(
                trigger.source === "auto" &&
                !trigger.locked &&
                normalizeWorldBookTriggerText(trigger.value) ===
                  normalizeWorldBookTriggerText(term)
              ),
          );
          if (nextTriggers.length !== (entry.triggers || []).length) {
            safeChanges.push(
              change(
                entry.id,
                "triggers",
                "自动触发词",
                entry.triggers,
                nextTriggers,
              ),
              change(
                entry.id,
                "keywords",
                "触发词",
                entry.keywords,
                nextTriggers.map((trigger) => trigger.value),
              ),
            );
          }
          if (nextAliases.length !== (entry.aliasTriggers || []).length) {
            safeChanges.push(
              change(
                entry.id,
                "aliasTriggers",
                "自动别名",
                entry.aliasTriggers,
                nextAliases,
              ),
              change(
                entry.id,
                "aliases",
                "其他叫法",
                entry.aliases,
                nextAliases.map((trigger) => trigger.value),
              ),
            );
          }
        }
      }
      const canSafelyApply = safeChanges.length > 0;
      suggestions.push({
        id: `repair:${issue.id}`,
        issueId: issue.id,
        strategy: canSafelyApply
          ? "remove_duplicate_trigger"
          : clearlyOverview
            ? "replace_with_specific_trigger"
            : "manual_review",
        title: canSafelyApply
          ? `保留总览卡的“${term}”，移除其他卡的未锁定自动词`
          : clearlyOverview
            ? `建议由“${overview.title}”保留通用词“${term}”`
            : `确认通用词“${term}”是否为有意重复`,
        explanation: canSafelyApply
          ? `“${overview.title}”是更明确的总览资料卡。这里只移除其他资料卡中来源为“自动”且未锁定的重复词；手动、AI、导入和已锁定内容不会被改动。`
          : clearlyOverview
            ? `“${overview.title}”更像总纲资料卡。其他资料卡建议改用标题、姓名或唯一别名；为避免删除用户手动词，本轮只展示方案，不自动应用。`
            : "本地规则无法唯一确定总纲资料卡。直接删除可能破坏用户有意设计，因此需要手动选择。",
        affectedEntryIds: affected.map((entry) => entry.id),
        before: affected.map((entry) => ({
          title: entry.title,
          keywords: entry.keywords,
          aliases: entry.aliases,
        })),
        after: clearlyOverview
          ? affected.map((entry) => ({
              title: entry.title,
              recommendation:
                entry.id === overview.id
                  ? `保留“${term}”`
                  : `改用“${entry.title}”或唯一别名`,
            }))
          : "请选择保留该通用词的资料卡，或确认这是有意重复。",
        changes: safeChanges,
        confidence: canSafelyApply
          ? "high"
          : clearlyOverview
            ? "medium"
            : "low",
        source: "local_rule",
        safeToApply: canSafelyApply,
        canApply: canSafelyApply,
      });
      continue;
    }
    if (issue.type === "circular_relation") {
      const cycle = affected;
      const source = cycle.find(
        (entry, index) =>
          ["faction", "race", "location"].includes(entry.category) &&
          cycle[(index + 1) % cycle.length]?.category === "character",
      );
      const target = source
        ? cycle[
            (cycle.findIndex((entry) => entry.id === source.id) + 1) %
              cycle.length
          ]
        : undefined;
      if (source && target) {
        const beforeRelations = relationList(source);
        const afterRelations = beforeRelations.map((relation) =>
          relation.targetEntryId === target.id &&
          relation.relationType === "load_with"
            ? { ...relation, relationType: "reference" as const }
            : relation,
        );
        const changes = [
          change(
            source.id,
            "relations",
            `${source.title} → ${target.title}`,
            beforeRelations,
            afterRelations,
          ),
          change(
            source.id,
            "relatedEntryIds",
            "调用关联",
            source.relatedEntryIds,
            source.relatedEntryIds.filter((id) => id !== target.id),
          ),
        ];
        suggestions.push({
          id: `repair:${issue.id}`,
          issueId: issue.id,
          strategy: "convert_relation_type",
          title: `将“${source.title} → ${target.title}”改为普通关联`,
          explanation:
            "人物命中时加载所属势力通常有价值，但势力命中时不必自动加载所有人物详情。普通关联仍保留界面关系。",
          affectedEntryIds: [source.id, target.id],
          before: "调用关联",
          after: "普通关联",
          changes,
          confidence: "medium",
          source: "local_rule",
          safeToApply: false,
          canApply: true,
        });
      } else {
        suggestions.push({
          id: `repair:${issue.id}`,
          issueId: issue.id,
          strategy: "manual_review",
          title: "手动选择一条调用关联改为普通关联",
          explanation:
            "本地规则无法可靠判断哪条关系价值最低，因此不会按数组顺序擅自断开。",
          affectedEntryIds: affected.map((entry) => entry.id),
          before: issue.detail,
          after: "保留单向调用，另一方向改为普通关联",
          changes: [],
          confidence: "low",
          source: "local_rule",
          safeToApply: false,
          canApply: false,
        });
      }
      continue;
    }
    if (issue.type === "excessive_always_loaded_tokens") {
      const candidates = entries.filter(
        (entry) => resolveWorldBookActivationMode(entry) === "always",
      );
      const current = getWorldBookTokenReport(book, entries).fixedTokens;
      const projectedEntries = entries.map((entry) =>
        candidates.some((candidate) => candidate.id === entry.id)
          ? withWorldBookActivationMode(entry, "conditional")
          : entry,
      );
      const projected = getWorldBookTokenReport(
        book,
        projectedEntries,
      ).fixedTokens;
      suggestions.push({
        id: `repair:${issue.id}`,
        issueId: issue.id,
        strategy: "compress_always_loaded_content",
        title: "检查始终加载资料卡并改为按需调用",
        explanation: `当前固定加载约 ${current} Token；若将 ${candidates.length} 张非核心常驻卡改为按需调用，预计约 ${projected} Token。数值仅为估算。`,
        affectedEntryIds: candidates.map((entry) => entry.id),
        before: `约 ${current} Token`,
        after: `预计约 ${projected} Token`,
        changes: [],
        confidence: "low",
        source: "local_rule",
        safeToApply: false,
        canApply: false,
      });
      continue;
    }
    suggestions.push({
      id: `repair:${issue.id}`,
      issueId: issue.id,
      strategy: "manual_review",
      title: `手动检查：${issue.title}`,
      explanation: issue.detail,
      affectedEntryIds: issueEntryIds,
      before: issue.title,
      after: "根据设定意图手动调整",
      changes: [],
      confidence: "low",
      source: "local_rule",
      safeToApply: false,
      canApply: false,
    });
  }
  return suggestions;
}

export function applyWorldBookRepair(
  book: WorldBook,
  entries: WorldBookEntry[],
  suggestions: WorldBookRepairSuggestion[],
) {
  let nextBook = { ...book };
  let nextEntries = entries.map((entry) => ({ ...entry }));
  for (const suggestion of suggestions) {
    if (!suggestion.canApply) continue;
    const entryPatches = new Map<string, WorldBookRepairChange[]>();
    for (const patch of suggestion.changes) {
      if (patch.entryId)
        entryPatches.set(patch.entryId, [
          ...(entryPatches.get(patch.entryId) || []),
          patch,
        ]);
      else {
        nextBook = {
          ...nextBook,
          [patch.field]: structuredClone(patch.after),
          updatedAt: new Date().toISOString(),
        } as WorldBook;
      }
    }
    nextEntries = nextEntries.map((entry) => {
      const patches = entryPatches.get(entry.id);
      if (!patches) return entry;
      const next = { ...entry } as WorldBookEntry;
      for (const patch of patches)
        Object.assign(next, { [patch.field]: structuredClone(patch.after) });
      next.updatedAt = new Date().toISOString();
      return normalizeWorldBookEntry(next);
    });
  }
  return { book: nextBook, entries: nextEntries };
}

export function formatRepairValue(value: unknown) {
  if (Array.isArray(value)) {
    if (!value.length) return "（空）";
    return value
      .map((item) =>
        typeof item === "string" ? item : JSON.stringify(item, null, 2),
      )
      .join("、");
  }
  if (typeof value === "string") return value || "（空）";
  if (value == null) return "（空）";
  return JSON.stringify(value, null, 2);
}

export function repairTokenEstimate(suggestion: WorldBookRepairSuggestion) {
  return {
    before: estimateWorldBookTokens(formatRepairValue(suggestion.before)),
    after: estimateWorldBookTokens(formatRepairValue(suggestion.after)),
  };
}
