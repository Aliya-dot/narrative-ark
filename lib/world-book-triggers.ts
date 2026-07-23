import type {
  WorldBookEntry,
  WorldBookTrigger,
  WorldBookTriggerSource,
} from "./types";

const GENERIC_TERMS = new Set([
  "人物",
  "角色",
  "地点",
  "城市",
  "国家",
  "世界",
  "组织",
  "势力",
  "魔法",
  "物品",
  "历史",
  "设定",
  "规则",
  "资料卡",
  "新资料卡",
  "未命名资料卡",
]);

export function normalizeWorldBookTriggerText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[“”‘’'"`]/g, "")
    .replace(/[\s\-_·•—–]+/g, " ")
    .replace(/^[,，。；;：:、!?！？]+|[,，。；;：:、!?！？]+$/g, "")
    .trim();
}

export function splitTriggerValues(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of list.flatMap((part) =>
    String(part).split(/[,，、；;\n]+/),
  )) {
    const display = item.trim();
    const key = normalizeWorldBookTriggerText(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(display);
  }
  return result;
}

function triggerId(source: WorldBookTriggerSource) {
  return `trigger_${source}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createWorldBookTrigger(
  value: string,
  source: WorldBookTriggerSource,
  locked = false,
): WorldBookTrigger {
  return {
    id: triggerId(source),
    value: value.trim(),
    source,
    locked,
    createdAt: new Date().toISOString(),
  };
}

export function isReliableAutoTrigger(value: string) {
  const normalized = normalizeWorldBookTriggerText(value);
  return (
    normalized.length >= 2 &&
    normalized.length <= 48 &&
    !GENERIC_TERMS.has(normalized)
  );
}

function normalizeRecords(
  records: WorldBookTrigger[] | undefined,
  fallback: string[],
): WorldBookTrigger[] {
  const result: WorldBookTrigger[] = [];
  const seen = new Set<string>();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record.value !== "string") continue;
    const value = record.value.trim();
    const key = normalizeWorldBookTriggerText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: record.id || triggerId(record.source || "imported"),
      value,
      source: ["auto", "manual", "ai", "imported"].includes(record.source)
        ? record.source
        : "imported",
      locked: Boolean(record.locked),
      createdAt: record.createdAt || new Date().toISOString(),
    });
  }
  for (const value of splitTriggerValues(fallback)) {
    const key = normalizeWorldBookTriggerText(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(createWorldBookTrigger(value, "imported"));
  }
  return result;
}

export function normalizeWorldBookEntryTriggers(
  entry: WorldBookEntry,
): WorldBookEntry {
  const rawTriggers = normalizeRecords(entry.triggers, entry.keywords || []);
  const rawAliasTriggers = normalizeRecords(
    entry.aliasTriggers,
    entry.aliases || [],
  );
  const usedIds = new Set<string>();
  const ensureUniqueIds = (records: WorldBookTrigger[]) =>
    records.map((trigger) => {
      if (!usedIds.has(trigger.id)) {
        usedIds.add(trigger.id);
        return trigger;
      }
      const replacement = createWorldBookTrigger(
        trigger.value,
        trigger.source,
        trigger.locked,
      );
      usedIds.add(replacement.id);
      return { ...replacement, createdAt: trigger.createdAt };
    });
  const triggers = ensureUniqueIds(rawTriggers);
  const aliasTriggers = ensureUniqueIds(rawAliasTriggers);
  return {
    ...entry,
    triggers,
    aliasTriggers,
    keywords: triggers.map((trigger) => trigger.value),
    aliases: aliasTriggers.map((trigger) => trigger.value),
  };
}

export function refreshAutoWorldBookTriggers(
  entry: WorldBookEntry,
): WorldBookEntry {
  const normalized = normalizeWorldBookEntryTriggers(entry);
  const preserved = (normalized.triggers || []).filter(
    (trigger) => trigger.source !== "auto" || trigger.locked,
  );
  const existingKeys = new Set(
    preserved.map((trigger) => normalizeWorldBookTriggerText(trigger.value)),
  );
  const generated: WorldBookTrigger[] = [];
  if (isReliableAutoTrigger(normalized.title)) {
    const key = normalizeWorldBookTriggerText(normalized.title);
    if (!existingKeys.has(key))
      generated.push(createWorldBookTrigger(normalized.title, "auto"));
  }
  return normalizeWorldBookEntryTriggers({
    ...normalized,
    triggers: [...preserved, ...generated],
    keywords: [...preserved, ...generated].map((trigger) => trigger.value),
  });
}

export function updateWorldBookTriggerValues(
  entry: WorldBookEntry,
  kind: "keywords" | "aliases",
  values: string[],
  source: WorldBookTriggerSource = "manual",
): WorldBookEntry {
  const normalized = normalizeWorldBookEntryTriggers(entry);
  const field = kind === "keywords" ? "triggers" : "aliasTriggers";
  const current = normalized[field] || [];
  const next = splitTriggerValues(values).map((value) => {
    const key = normalizeWorldBookTriggerText(value);
    const existing = current.find(
      (trigger) => normalizeWorldBookTriggerText(trigger.value) === key,
    );
    return existing
      ? { ...existing, value }
      : createWorldBookTrigger(value, source);
  });
  return normalizeWorldBookEntryTriggers({
    ...normalized,
    [field]: next,
    [kind]: next.map((trigger) => trigger.value),
  });
}

export function addWorldBookAlias(
  entry: WorldBookEntry,
  value: string,
): WorldBookEntry {
  return updateWorldBookTriggerValues(
    entry,
    "aliases",
    [...entry.aliases, value],
    "manual",
  );
}

export function setWorldBookTriggerLock(
  entry: WorldBookEntry,
  triggerId: string,
  locked: boolean,
): WorldBookEntry {
  const normalized = normalizeWorldBookEntryTriggers(entry);
  return normalizeWorldBookEntryTriggers({
    ...normalized,
    triggers: normalized.triggers?.map((trigger) =>
      trigger.id === triggerId ? { ...trigger, locked } : trigger,
    ),
    aliasTriggers: normalized.aliasTriggers?.map((trigger) =>
      trigger.id === triggerId ? { ...trigger, locked } : trigger,
    ),
  });
}

export const WORLD_BOOK_TRIGGER_SOURCE_LABELS: Record<
  WorldBookTriggerSource,
  string
> = {
  auto: "自动",
  manual: "手动",
  ai: "AI",
  imported: "旧版/导入",
};
