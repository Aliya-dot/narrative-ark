import { z } from "zod";
import { compactSummary } from "./text";
import { parseModelJson } from "./json-repair";
export const configSchema = z.object({
  provider: z.string(),
  apiKey: z.string().min(1, "请输入 API Key"),
  baseUrl: z.string().url("请输入有效地址"),
  model: z.string().min(1, "请输入模型名称"),
  maxTokens: z.number().min(256).max(64000),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  timeout: z.number().min(5).max(300),
  headers: z.record(z.string(), z.string()),
});
export const turnResponseSchema = z.object({
  narrative: z.string(),
  dialogue: z
    .array(
      z.object({
        characterId: z.string(),
        characterName: z.string(),
        content: z.string(),
      }),
    )
    .optional(),
  choices: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  statePatch: z
    .object({
      playerAttributes: z.record(z.string(), z.number()).optional(),
      addItems: z.array(z.any()).optional(),
      removeItemIds: z.array(z.string()).optional(),
      locationId: z.string().optional(),
      time: z.string().optional(),
      characterStates: z.record(z.string(), z.any()).optional(),
      questUpdates: z.array(z.any()).optional(),
      worldState: z.record(z.string(), z.unknown()).optional(),
    })
    .default({}),
  newEvents: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        content: z.string(),
        createdAt: z.string(),
      }),
    )
    .default([]),
  importantMemories: z.array(z.string()).default([]),
  shortSummary: z.string().default(""),
  rollingSummary: z.string().default(""),
});
export function parseTurnResponse(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("AI 返回的回合数据不是对象");
  }
  const source = raw as Record<string, unknown>;
  const narrative =
    source.narrative ?? source.content ?? source.story ?? source.response;
  const rawChoices = source.choices ?? source.options ?? [];
  const choices = Array.isArray(rawChoices)
    ? rawChoices.map((choice, index) =>
        typeof choice === "string"
          ? { id: `choice_${index + 1}`, text: choice }
          : choice,
      )
    : [];
  const normalized = {
    ...source,
    narrative,
    choices,
    statePatch: source.statePatch ?? source.state_patch ?? {},
    newEvents: source.newEvents ?? source.new_events ?? source.events ?? [],
    importantMemories:
      source.importantMemories ??
      source.important_memories ??
      source.memories ??
      [],
    shortSummary:
      source.shortSummary ?? source.short_summary ?? source.summary ?? "",
    rollingSummary:
      source.rollingSummary ??
      source.rolling_summary ??
      source.currentSummary ??
      "",
  };
  const parsed = turnResponseSchema.parse(normalized);
  if (!parsed.shortSummary.trim()) {
    parsed.shortSummary = compactSummary(parsed.narrative, 100);
  }
  parsed.shortSummary = compactSummary(parsed.shortSummary, 100);
  parsed.rollingSummary = compactSummary(parsed.rollingSummary, 180);
  return parsed;
}
export function extractJson(text: string) {
  return parseModelJson(text);
}
