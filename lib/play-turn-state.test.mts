import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const projectRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(projectRoot.href) &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const [{ createSave }, { SAMPLE_PROJECT }, playTurnState] = await Promise.all([
  import("./project.ts"),
  import("./sample.ts"),
  import("./play-turn-state.ts"),
]);
const { completePlayTurn, preparePlayTurn } = playTurnState;
const { latestPlayerAction, restorePreviousTurn } = playTurnState;

const original = createSave(SAMPLE_PROJECT);
const frozenInput = structuredClone(original);
const pending = preparePlayTurn(
  original,
  "  检查牢门  ",
  "player-message",
  "2026-07-28T12:00:00.000Z",
);

assert.deepEqual(original, frozenInput);
assert.notEqual(pending.base, original);
assert.notEqual(pending.next, original);
assert.equal(pending.action, "检查牢门");
assert.equal(pending.next.history.length, 1);
assert.equal(pending.next.recentMessages.at(-1)?.role, "player");
assert.equal(pending.next.recentMessages.at(-1)?.content, "检查牢门");

const completed = completePlayTurn({
  pendingSave: pending.next,
  action: pending.action,
  response: {
    narrative: "牢门后传来脚步声。",
    dialogue: [],
    choices: [{ id: "hide", text: "躲进阴影" }],
    statePatch: {
      locationId: "hall",
      time: "第一日 · 清晨",
      playerAttributes: { 生命: 95 },
    },
    newEvents: [],
    importantMemories: ["听见脚步", "听见脚步"],
    shortSummary: "检查牢门后听见脚步。",
    rollingSummary: "当前处境：牢门外有人接近。",
  },
  narratorMessageId: "narrator-message",
  createdAt: "2026-07-28T12:00:05.000Z",
  settingsVersionId: "settings-v2",
  settingsVersionNumber: 2,
  activeTurnDurationMs: 15_000,
  worldBookContext: {
    worldBookId: "book-1",
    worldBookVersionId: "book-v1",
    entryIds: ["entry-1"],
  },
});

assert.equal(completed.turn, original.turn + 1);
assert.equal(completed.currentLocationId, "hall");
assert.equal(completed.currentTime, "第一日 · 清晨");
assert.equal(completed.playerState.attributes.生命, 95);
assert.equal(completed.recentMessages.at(-1)?.role, "narrator");
assert.deepEqual(completed.importantMemories, ["听见脚步"]);
assert.deepEqual(completed.turnDurationsMs, [15_000]);
assert.equal(completed.settingsVersionId, "settings-v2");
assert.equal(completed.settingsVersionNumber, 2);
assert.equal(completed.importantChoices.at(-1)?.action, "检查牢门");
assert.equal(completed.lastWorldBookContext?.worldBookId, "book-1");
assert.deepEqual(pending.next.recentMessages.at(-1)?.role, "player");
assert.equal(latestPlayerAction(completed), "检查牢门");

const restored = restorePreviousTurn(completed);
assert.ok(restored);
assert.equal(restored.turn, original.turn);
assert.equal(restored.history.length, 0);
assert.deepEqual(restorePreviousTurn(original), null);

for (const duration of [9_999, 600_001]) {
  const withoutDuration = completePlayTurn({
    pendingSave: pending.next,
    action: pending.action,
    response: {
      narrative: "继续。",
      choices: [],
      statePatch: {},
      newEvents: [],
      importantMemories: [],
      shortSummary: "",
      rollingSummary: "",
    },
    narratorMessageId: `narrator-${duration}`,
    createdAt: "2026-07-28T12:00:05.000Z",
    activeTurnDurationMs: duration,
  });
  assert.deepEqual(
    withoutDuration.turnDurationsMs,
    pending.next.turnDurationsMs,
  );
}

assert.throws(
  () =>
    preparePlayTurn(
      original,
      " ",
      "player-message",
      "2026-07-28T12:00:00.000Z",
    ),
  /玩家行动不能为空/,
);

console.log("play turn state tests passed");
