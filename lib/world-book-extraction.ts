import type {
  GameProject,
  GameSave,
  WorldBook,
  WorldBookEntry,
  WorldBookEntryCategory,
} from "./types";
import {
  createWorldBookEntry,
  extractWorldBookFromProject,
  splitWorldBookTags,
  withWorldBookActivationMode,
} from "./world-book";
import { ensureUniqueWorldBookEntryIds } from "./world-book-entry-identity";

export type WorldBookExtractionMode = "original" | "derived" | "custom";
export type WorldBookExtractionOptions = {
  mode: WorldBookExtractionMode;
  includeProtagonist: boolean;
  includeGeneratedCharacters: boolean;
  includeWorldChanges: boolean;
  includeDiscoveredSecrets: boolean;
  includeAiOnlyContent: boolean;
  preserveVisibility: boolean;
  categories?: WorldBookEntryCategory[];
};
export type ExtractedWorldBookCandidate = WorldBookEntry & {
  selected: boolean;
  sourceType:
    | "project_setting"
    | "character"
    | "location"
    | "faction"
    | "rule"
    | "memory"
    | "runtime_state";
  sourceLabel: string;
  confidence: number;
  warnings: string[];
};
export type WorldBookExtractionResult = {
  book: WorldBook;
  candidates: ExtractedWorldBookCandidate[];
  excluded: string[];
};

const LASTING_CHANGE =
  /死亡|身亡|失踪|继位|覆灭|建立|成立|分裂|联盟|毁灭|重建|战争|停战|条约|政权|发现|公开|灾难|革命|统一|独立|永久|永远|终结/;

function sourceFor(entry: WorldBookEntry) {
  if (entry.category === "character")
    return {
      sourceType: "character" as const,
      sourceLabel: `来自人物“${entry.title}”`,
    };
  if (entry.category === "location")
    return {
      sourceType: "location" as const,
      sourceLabel: `来自地点“${entry.title}”`,
    };
  if (entry.category === "faction")
    return {
      sourceType: "faction" as const,
      sourceLabel: `来自势力“${entry.title}”`,
    };
  if (entry.category === "core_rule" || entry.category === "culture")
    return { sourceType: "rule" as const, sourceLabel: "来自项目世界规则" };
  return {
    sourceType: "project_setting" as const,
    sourceLabel: "来自项目设定集",
  };
}

export function extractWorldBookCandidates(
  project: GameProject,
  save: GameSave | undefined,
  worldBookId: string,
  options: WorldBookExtractionOptions,
): WorldBookExtractionResult {
  const base = extractWorldBookFromProject(project, worldBookId);
  let entries = base.entries;
  if (!options.includeAiOnlyContent)
    entries = entries.filter((entry) => entry.visibility !== "ai_only");
  if (options.categories?.length)
    entries = entries.filter((entry) =>
      options.categories!.includes(entry.category),
    );
  const candidates: ExtractedWorldBookCandidate[] = entries.map((entry) => ({
    ...entry,
    ...sourceFor(entry),
    selected: true,
    confidence: 1,
    warnings: [],
  }));
  const excluded = [
    "玩家生命、体力、精神、等级和金钱",
    "当前装备、物品、技能和状态效果",
    "NPC 好感度与短期态度",
    "当前任务进度",
    "存档与普通回合全文",
  ];
  if (options.includeProtagonist) {
    const p = project.player;
    const content = [
      p.identity,
      p.background,
      p.personality,
      p.appearance,
      p.goals?.length ? `长期目标：${p.goals.join("、")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const entry = createWorldBookEntry(
      `${worldBookId}:protagonist`,
      worldBookId,
      "character",
    );
    candidates.push({
      ...entry,
      title: p.name || "当前主角",
      summary: `${p.identity || "人物"}。${p.background || ""}`.slice(0, 240),
      content,
      keywords: splitWorldBookTags([p.name]),
      selected: true,
      sourceType: "runtime_state",
      sourceLabel: "来自当前主角（作为世界历史人物）",
      confidence: 0.8,
      warnings: ["主角关系可能只适用于本时间线，请确认后再保留。"],
    });
  }
  if (options.mode === "derived" && save && options.includeWorldChanges) {
    const memories = [
      ...save.importantMemories,
      ...save.importantChoices.map(
        (choice) => `${choice.action}：${choice.consequence}`,
      ),
    ]
      .filter(
        (text, index, all) =>
          text.trim() &&
          LASTING_CHANGE.test(text) &&
          all.indexOf(text) === index,
      )
      .slice(0, 40);
    memories.forEach((text, index) => {
      const entry = withWorldBookActivationMode(
        createWorldBookEntry(
          `${worldBookId}:change:${index + 1}`,
          worldBookId,
          "timeline",
        ),
        "conditional",
      );
      candidates.push({
        ...entry,
        title: `本局世界变化 ${index + 1}`,
        summary: text.slice(0, 240),
        content: text,
        keywords: splitWorldBookTags(
          text.match(/[\u4e00-\u9fa5]{2,8}/g)?.slice(0, 4) || [],
        ),
        selected: true,
        sourceType: "memory",
        sourceLabel: `来自第 ${save.turn} 回合前的永久记忆`,
        confidence: 0.72,
        warnings: ["由长期影响关键词筛选，请确认它不是临时事件。"],
      });
    });
  }
  const now = new Date().toISOString();
  const book: WorldBook = {
    ...base.book,
    name:
      options.mode === "derived"
        ? `${project.projectInfo.title} · 第 ${save?.turn || 0} 回合时间线`
        : `${project.projectInfo.title} · 世界书`,
    description:
      options.mode === "derived"
        ? `基于《${project.projectInfo.title}》第 ${save?.turn || 0} 回合的世界状态创建。`
        : base.book.description,
    source: {
      projectId: project.id,
      saveId: save?.id,
      turn: save?.turn,
      extractionMode: options.mode,
      extractedAt: now,
    },
    entryIds: candidates.map((entry) => entry.id),
  };
  return { book, candidates, excluded };
}

export function candidatesToEntries(candidates: ExtractedWorldBookCandidate[]) {
  const entries = candidates
    .filter((candidate) => candidate.selected)
    .map((candidate): WorldBookEntry => ({
      id: candidate.id,
      worldBookId: candidate.worldBookId,
      category: candidate.category,
      title: candidate.title,
      summary: candidate.summary,
      content: candidate.content,
      keywords: candidate.keywords,
      aliases: candidate.aliases,
      triggers: candidate.triggers,
      aliasTriggers: candidate.aliasTriggers,
      priority: candidate.priority,
      activationMode: candidate.activationMode,
      enabled: candidate.enabled,
      alwaysActive: candidate.alwaysActive,
      visibility: candidate.visibility,
      relatedEntryIds: candidate.relatedEntryIds,
      relations: candidate.relations,
      activeRegions: candidate.activeRegions,
      activePeriods: candidate.activePeriods,
      factionIds: candidate.factionIds,
      allowAiExpansion: candidate.allowAiExpansion,
      immutable: candidate.immutable,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    }));
  return ensureUniqueWorldBookEntryIds(entries).entries;
}
