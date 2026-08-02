import type {
  GameSave,
  GameTurnResponse,
  WorldBookContextPreview,
} from "./types";
import { applyPatch, snapshot } from "./project";
import { compactSummary } from "./text";

export interface PendingPlayTurn {
  base: GameSave;
  next: GameSave;
  action: string;
  playerMessageId: string;
}

export function restorePreviousTurn(save: GameSave) {
  const previous = save.history.at(-1);
  if (!previous) return null;
  return {
    ...structuredClone(previous),
    history: structuredClone(save.history.slice(0, -1)),
  };
}

export function latestPlayerAction(save: GameSave) {
  return [...save.recentMessages]
    .reverse()
    .find((message) => message.role === "player")?.content;
}

export function preparePlayTurn(
  save: GameSave,
  actionText: string,
  playerMessageId: string,
  createdAt: string,
): PendingPlayTurn {
  const action = actionText.trim();
  if (!action) throw new Error("玩家行动不能为空");

  const base = structuredClone(save);
  const next = structuredClone(save);
  next.history = [...next.history.slice(-19), snapshot(base)];
  next.recentMessages.push({
    id: playerMessageId,
    role: "player",
    content: action,
    createdAt,
    turn: next.turn + 1,
  });
  return { base, next, action, playerMessageId };
}

export function completePlayTurn({
  pendingSave,
  action,
  response,
  narratorMessageId,
  createdAt,
  settingsVersionId,
  settingsVersionNumber,
  activeTurnDurationMs,
  worldBookContext,
}: {
  pendingSave: GameSave;
  action: string;
  response: GameTurnResponse;
  narratorMessageId: string;
  createdAt: string;
  settingsVersionId?: string;
  settingsVersionNumber?: number;
  activeTurnDurationMs: number | null;
  worldBookContext?: WorldBookContextPreview;
}) {
  const next = structuredClone(pendingSave);
  if (worldBookContext) next.lastWorldBookContext = worldBookContext;

  next.turn += 1;
  next.recentMessages.push({
    id: narratorMessageId,
    role: "narrator",
    content: response.narrative,
    createdAt,
    turn: next.turn,
    meta: {
      choices: response.choices,
      dialogue: response.dialogue,
      events: response.newEvents,
      settingsVersionId,
      settingsVersionNumber,
    },
  });
  next.settingsVersionId = settingsVersionId;
  next.settingsVersionNumber = settingsVersionNumber;

  if (
    activeTurnDurationMs !== null &&
    activeTurnDurationMs >= 10_000 &&
    activeTurnDurationMs <= 600_000
  ) {
    next.turnDurationsMs = [
      ...(next.turnDurationsMs || []),
      activeTurnDurationMs,
    ].slice(-20);
  }

  applyPatch(next, response.statePatch);
  next.importantMemories = [
    ...new Set([...next.importantMemories, ...response.importantMemories]),
  ].slice(-60);
  next.rollingSummary = compactSummary(
    response.rollingSummary ||
      [next.rollingSummary, response.shortSummary].filter(Boolean).join(" "),
    180,
  );
  next.importantChoices.push({
    turn: next.turn,
    action,
    consequence: compactSummary(response.shortSummary, 100),
  });
  return next;
}
