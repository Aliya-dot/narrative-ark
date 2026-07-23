import type { WorldBook, WorldBookEntry } from "./types";
import {
  estimateWorldBookTokens,
  resolveWorldBookActivationMode,
  splitWorldBookTags,
} from "./world-book";
import { normalizeWorldBookTriggerText } from "./world-book-triggers";

export type WorldBookIssue = {
  id: string;
  type?: WorldBookValidationIssueType;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  entryIds?: string[];
  relatedValues?: string[];
  canAutoSuggest?: boolean;
  canAutoApply?: boolean;
  blocksSave?: boolean;
};

export type WorldBookValidationIssueType =
  | "duplicate_trigger"
  | "duplicate_alias"
  | "duplicate_title"
  | "circular_relation"
  | "broken_relation"
  | "self_relation"
  | "empty_title"
  | "empty_content"
  | "missing_summary"
  | "missing_trigger"
  | "excessive_always_loaded_tokens"
  | "core_summary_outdated"
  | "conflicting_activation_mode"
  | "visibility_risk"
  | "other";

function issueType(id: string): WorldBookValidationIssueType {
  if (id.startsWith("duplicate-trigger:")) return "duplicate_trigger";
  if (id.startsWith("duplicate-title:")) return "duplicate_title";
  if (id.startsWith("cycle:")) return "circular_relation";
  if (id.startsWith("orphan:")) return "broken_relation";
  if (id.startsWith("self-relation:")) return "self_relation";
  if (id.startsWith("title:")) return "empty_title";
  if (id.startsWith("content:")) return "empty_content";
  if (id.startsWith("summary:")) return "missing_summary";
  if (id.startsWith("trigger:")) return "missing_trigger";
  if (id === "fixed-token") return "excessive_always_loaded_tokens";
  if (id === "core-summary-stale") return "core_summary_outdated";
  return "other";
}

export type WorldBookTokenReport = {
  coreSummaryTokens: number;
  fixedEntryTokens: number;
  fixedTokens: number;
  allEntriesTokens: number;
  conditionalCount: number;
  fixedCount: number;
  disabledCount: number;
  missingSummaryCount: number;
};

export type WorldBookCompletionReport = {
  score: number;
  required: string[];
  recommended: string[];
  optional: string[];
  items: WorldBookCompletionItem[];
};

export type WorldBookCompletionItem = {
  id: string;
  level: "required" | "recommended" | "optional";
  label: string;
  detail?: string;
  entryIds?: string[];
};

export function analyzeWorldBookCompletion(
  book: WorldBook,
  entries: WorldBookEntry[],
): WorldBookCompletionReport {
  const items: WorldBookCompletionItem[] = [];
  const add = (
    level: WorldBookCompletionItem["level"],
    id: string,
    label: string,
    entryIds?: string[],
    detail?: string,
  ) => items.push({ id, level, label, entryIds, detail });
  const entryName = (entry: WorldBookEntry) => {
    const index = entries.findIndex((item) => item.id === entry.id);
    return entry.title.trim() || `未命名资料卡（第 ${index + 1} 张）`;
  };
  if (!book.name.trim()) add("required", "book-name", "缺少世界书名称");
  if (!book.description.trim())
    add("recommended", "book-description", "缺少简介");
  if (!book.coreSummary.trim())
    add("recommended", "core-summary", "缺少核心摘要");
  if (book.coreSummaryStatus === "stale")
    add("recommended", "stale-summary", "核心摘要可能已经过期");
  const has = (...categories: WorldBookEntry["category"][]) =>
    entries.some(
      (entry) => categories.includes(entry.category) && entry.enabled,
    );
  if (
    !entries.some(
      (entry) => resolveWorldBookActivationMode(entry) === "core_rule",
    )
  )
    add("recommended", "missing-core-rule", "缺少核心规则");
  if (!has("character"))
    add("recommended", "missing-character", "缺少主要人物");
  if (!has("location")) add("recommended", "missing-location", "缺少主要地点");
  if (!has("faction")) add("recommended", "missing-faction", "缺少主要势力");
  if (!has("magic", "technology"))
    add("recommended", "missing-power-system", "缺少能力或科技体系");
  if (!has("history", "timeline"))
    add("optional", "missing-history", "可以补充历史或纪年");
  if (!has("culture", "economy", "religion"))
    add("optional", "missing-culture", "可以补充文化、经济或宗教");
  const missingSummaryEntries = entries.filter(
    (entry) => !entry.summary.trim(),
  );
  const missingTriggerEntries = entries.filter(
    (entry) =>
      resolveWorldBookActivationMode(entry) === "conditional" &&
      !entry.keywords.length &&
      !entry.aliases.length,
  );
  for (const entry of missingSummaryEntries)
    add(
      "recommended",
      `missing-entry-summary:${entry.id}`,
      `“${entryName(entry)}”缺少简短说明`,
      [entry.id],
      "点击提示可直接打开这张资料卡。",
    );
  for (const entry of missingTriggerEntries)
    add(
      "recommended",
      `missing-entry-trigger:${entry.id}`,
      `“${entryName(entry)}”缺少触发词`,
      [entry.id],
      "点击提示可直接打开这张资料卡。",
    );
  const structural = validateWorldBook(book, entries);
  for (const issue of structural) {
    if (issue.severity === "error")
      add("required", issue.id, issue.title, issue.entryIds, issue.detail);
    else if (
      issue.id === "fixed-token" ||
      issue.id.startsWith("duplicate-title:") ||
      issue.id.startsWith("orphan:") ||
      issue.id.startsWith("cycle:")
    )
      add("optional", issue.id, issue.title, issue.entryIds, issue.detail);
  }
  const uniqueItems = Array.from(
    new Map(items.map((item) => [item.id, item])).values(),
  );
  const required = uniqueItems
    .filter((item) => item.level === "required")
    .map((item) => item.label);
  const recommended = uniqueItems
    .filter((item) => item.level === "recommended")
    .map((item) => item.label);
  const optional = uniqueItems
    .filter((item) => item.level === "optional")
    .map((item) => item.label);
  const score = Math.max(
    0,
    Math.min(
      100,
      100 - required.length * 18 - recommended.length * 7 - optional.length * 2,
    ),
  );
  return {
    score,
    required: [...new Set(required)],
    recommended: [...new Set(recommended)],
    optional: [...new Set(optional)],
    items: uniqueItems,
  };
}

export function getWorldBookTokenReport(
  book: WorldBook,
  entries: WorldBookEntry[],
): WorldBookTokenReport {
  const coreSummaryTokens = estimateWorldBookTokens(book.coreSummary);
  let fixedEntryTokens = 0;
  let allEntriesTokens = 0;
  let conditionalCount = 0;
  let fixedCount = 0;
  let disabledCount = 0;
  let missingSummaryCount = 0;
  for (const entry of entries) {
    const mode = resolveWorldBookActivationMode(entry);
    const detailed = estimateWorldBookTokens(entry.content || entry.summary);
    allEntriesTokens += detailed;
    if (!entry.summary.trim()) missingSummaryCount += 1;
    if (mode === "disabled") disabledCount += 1;
    else if (mode === "conditional") conditionalCount += 1;
    else {
      fixedCount += 1;
      fixedEntryTokens += detailed;
    }
  }
  return {
    coreSummaryTokens,
    fixedEntryTokens,
    fixedTokens: coreSummaryTokens + fixedEntryTokens,
    allEntriesTokens: coreSummaryTokens + allEntriesTokens,
    conditionalCount,
    fixedCount,
    disabledCount,
    missingSummaryCount,
  };
}

export function validateWorldBook(
  book: WorldBook,
  entries: WorldBookEntry[],
): WorldBookIssue[] {
  const issues: WorldBookIssue[] = [];
  if (!book.name.trim())
    issues.push({
      id: "book-name",
      severity: "error",
      title: "缺少世界书名称",
      detail: "填写名称后才能保存或发布。",
    });
  if (!book.coreSummary.trim())
    issues.push({
      id: "core-summary",
      severity: "warning",
      title: "核心摘要为空",
      detail: "每回合将缺少稳定的世界前提，建议写一段精简摘要。",
    });
  else if (book.coreSummaryStatus === "stale")
    issues.push({
      id: "core-summary-stale",
      severity: "warning",
      title: "核心摘要可能已经过期",
      detail:
        "核心规则资料卡在摘要生成后发生过变化。建议重新整理摘要，或确认继续保留当前手写内容。",
    });

  const ids = new Set(entries.map((entry) => entry.id));
  const titleGroups = new Map<string, WorldBookEntry[]>();
  const triggerGroups = new Map<string, WorldBookEntry[]>();
  for (const entry of entries) {
    const title = entry.title.trim().toLowerCase();
    if (!title)
      issues.push({
        id: `title:${entry.id}`,
        severity: "error",
        title: "资料卡缺少标题",
        detail: "空标题无法检索。",
        entryIds: [entry.id],
      });
    else titleGroups.set(title, [...(titleGroups.get(title) || []), entry]);
    if (!entry.content.trim() && !entry.summary.trim())
      issues.push({
        id: `content:${entry.id}`,
        severity: "warning",
        title: `“${entry.title || "未命名资料卡"}”没有内容`,
        detail: "这张卡即使命中也无法提供有效设定。",
        entryIds: [entry.id],
      });
    else if (entry.content.trim() && !entry.summary.trim())
      issues.push({
        id: `summary:${entry.id}`,
        severity: "warning",
        title: `“${entry.title || "未命名资料卡"}”缺少简短说明`,
        detail:
          "检索预算不足时会优先使用简短说明。可以从详细设定中提取 1～3 句，不会改动原文。",
        entryIds: [entry.id],
      });
    if (
      resolveWorldBookActivationMode(entry) === "conditional" &&
      !entry.keywords.length &&
      !entry.aliases.length
    )
      issues.push({
        id: `trigger:${entry.id}`,
        severity: "warning",
        title: `“${entry.title}”缺少触发词`,
        detail: "仍可由人物、地点或任务命中，但一般文本更难调用它。",
        entryIds: [entry.id],
      });
    const uniqueEntryTerms = new Set(
      splitWorldBookTags([...entry.keywords, ...entry.aliases])
        .map(normalizeWorldBookTriggerText)
        .filter(Boolean),
    );
    for (const key of uniqueEntryTerms) {
      triggerGroups.set(key, [...(triggerGroups.get(key) || []), entry]);
    }
    for (const relatedId of entry.relatedEntryIds) {
      if (relatedId === entry.id)
        issues.push({
          id: `self-relation:${entry.id}`,
          severity: "error",
          title: `“${entry.title || "未命名资料卡"}”关联了自己`,
          detail: "自我调用关联没有有效信息，并可能浪费检索预算。",
          entryIds: [entry.id],
        });
      if (!ids.has(relatedId))
        issues.push({
          id: `orphan:${entry.id}:${relatedId}`,
          severity: "error",
          title: `“${entry.title}”关联了不存在的资料卡`,
          detail: `无效关联 ID：${relatedId}`,
          entryIds: [entry.id],
        });
    }
  }
  for (const group of titleGroups.values()) {
    if (group.length > 1)
      issues.push({
        id: `duplicate-title:${group[0].title}`,
        severity: "warning",
        title: `发现 ${group.length} 张同名资料卡`,
        detail: `标题“${group[0].title}”可能需要合并或改名。`,
        entryIds: group.map((entry) => entry.id),
      });
  }
  for (const [term, group] of triggerGroups) {
    if (group.length >= 4)
      issues.push({
        id: `duplicate-trigger:${term}`,
        severity: "warning",
        title: `触发词“${term}”被 ${group.length} 张资料卡共用`,
        detail: "常见词可能一次加载过多无关资料。",
        entryIds: group.map((entry) => entry.id),
      });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const walk = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      const cycle = [...path.slice(path.indexOf(id)), id];
      issues.push({
        id: `cycle:${cycle.join(":")}`,
        severity: "warning",
        title: "发现循环关联",
        detail: `${cycle
          .map((entryId) => byId.get(entryId)?.title || "未知资料卡")
          .join(" → ")}。检索器仍会限制关联深度并去重，但建议检查这条调用链。`,
        entryIds: Array.from(new Set(cycle)),
      });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of byId.get(id)?.relatedEntryIds || []) {
      if (child !== id && byId.has(child)) walk(child, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const entry of entries) walk(entry.id, []);

  const token = getWorldBookTokenReport(book, entries);
  if (token.fixedTokens > 1800)
    issues.push({
      id: "fixed-token",
      severity: "warning",
      title: `每回合固定内容约 ${token.fixedTokens} Token`,
      detail:
        "核心摘要、核心规则或始终加载的资料较多，建议压缩或改为按需调用。",
    });
  return issues.map((issue) => {
    const type = issue.type || issueType(issue.id);
    return {
      ...issue,
      type,
      entryIds: issue.entryIds || [],
      relatedValues:
        issue.relatedValues ||
        (type === "duplicate_trigger"
          ? [issue.id.slice("duplicate-trigger:".length)]
          : []),
      canAutoSuggest: true,
      canAutoApply: [
        "broken_relation",
        "self_relation",
        "missing_summary",
        "missing_trigger",
      ].includes(type),
      blocksSave: issue.severity === "error",
    };
  });
}
