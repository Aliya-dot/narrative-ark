import type {
  GenerationDraft,
  GameProject,
  GameSave,
  GameSaveSnapshot,
  GameStatePatch,
  WorldBookVersion,
} from "./types";
import { uid } from "./db";
import { compactSummary } from "./text";
import { storyLengthConfig } from "./story-length";
import { worldBookSnapshotToProjectWorld } from "./world-book";
export function emptyProject(
  d: GenerationDraft,
  worldBookVersion?: WorldBookVersion,
): GameProject {
  const now = new Date().toISOString();
  const advanced = d.advanced ?? {};
  const extractedWorld = worldBookVersion
    ? worldBookSnapshotToProjectWorld(worldBookVersion)
    : undefined;
  return {
    id: uid("project"),
    version: 1,
    createdAt: now,
    updatedAt: now,
    projectInfo: {
      title: d.title || "未命名冒险",
      description: d.idea,
      genre: d.genre,
      tone: d.tone,
      creationMode: d.creationMode,
      freedomMode: d.freedomMode,
      gameLength: d.gameLength || "standard",
      storyLength: storyLengthConfig(d.gameLength || "standard"),
    },
    world: extractedWorld
      ? {
          ...extractedWorld,
          currentCrisis: advanced.crisis || extractedWorld.currentCrisis,
        }
      : {
          background: [advanced.era, advanced.tech, advanced.background]
            .filter(Boolean)
            .join("\n"),
          history: advanced.history || "",
          geography: advanced.geography || "",
          locations: [],
          factions: [],
          races: [],
          religions: [],
          socialRules: advanced.civilizations
            ? advanced.civilizations.split("\n").filter(Boolean)
            : [],
          powerSystem: advanced.powerSystem || "",
          currentCrisis: advanced.crisis || "",
          secrets: advanced.secret ? [advanced.secret] : [],
        },
    player: {
      name: advanced.playerName || "",
      gender: advanced.playerGender || "",
      age: advanced.playerAge || "",
      race: advanced.playerRace || "",
      identity: advanced.playerIdentity || d.protagonist,
      background: advanced.playerOrigin || "",
      personality: advanced.playerPersonality || "",
      appearance: advanced.playerAppearance || "",
      goals: advanced.playerGoal ? [advanced.playerGoal] : [],
      talents:
        advanced.specialAbility || advanced.talent
          ? [
              {
                id: "player-special-ability",
                name: "特殊能力",
                description: advanced.specialAbility || advanced.talent,
                level: 1,
              },
            ]
          : [],
      skills: [],
      weaknesses: advanced.weakness ? [advanced.weakness] : [],
      attributes: d.numericSystem
        ? { 生命: 100, 体力: 100, 精神: 100, 等级: 1, 金钱: 0 }
        : {},
      inventory: [],
      equipment: [],
      statusEffects: [],
    },
    characters: (d.supportingCharacters ?? []).map((character, index) => ({
      id: character.id || `supporting-${index + 1}`,
      name: character.name,
      identity: character.identity,
      age: "",
      race: "",
      personality: character.personality,
      appearance: character.appearance,
      background: "",
      abilities: character.specialAbility
        ? [
            {
              id: `${character.id || `supporting-${index + 1}`}-ability`,
              name: "特殊能力",
              description: character.specialAbility,
              level: 1,
            },
          ]
        : [],
      relationship: character.relationship,
      attitude: 0,
      goal: character.goal,
      secret: character.secret,
      speechStyle: "",
      important: true,
      mortal: true,
    })),
    gameSystem: {
      levelSystem: advanced.levelSystem || advanced.growthRules || "",
      attributes: [],
      combatRules: "",
      taskRules: "",
      relationshipRules: "",
      deathRules: advanced.deathRules || advanced.failureRules || "",
      difficultyRules: advanced.difficulty || "",
      randomCheckRules: advanced.checkRules || advanced.checkPrinciples || "",
    },
    story: {
      mainGoal: advanced.mainGoal || "",
      openingEvent: advanced.opening || "",
      chapters: [],
      sideQuests: [],
      randomEvents: [],
      endings: [],
    },
    prompts: {
      gameMasterPrompt: "",
      openingPrompt: "",
      stateUpdatePrompt: "",
      summaryPrompt: "",
      consistencyCheckPrompt: "",
    },
    openingScene: "",
    worldBinding: d.worldBinding,
    scenarioId: d.worldBinding?.scenarioId,
  };
}
export function createSave(p: GameProject, name = "初始存档"): GameSave {
  const now = new Date().toISOString();
  return {
    id: uid("save"),
    projectId: p.id,
    name,
    createdAt: now,
    updatedAt: now,
    turn: 0,
    currentLocationId: p.world.locations[0]?.id || "unknown",
    currentTime: "第一日 · 黎明",
    playerState: {
      attributes: { ...p.player.attributes },
      inventory: [...p.player.inventory],
      equipment: [...p.player.equipment],
      statusEffects: [...p.player.statusEffects],
    },
    characterStates: Object.fromEntries(
      p.characters.map((c) => [
        c.id,
        {
          attitude: c.attitude,
          locationId: p.world.locations[0]?.id || "unknown",
          status: "正常",
          memories: [],
        },
      ]),
    ),
    factionStates: Object.fromEntries(
      p.world.factions.map((f) => [
        f.id,
        { attitude: f.attitude, power: 100, status: "活跃" },
      ]),
    ),
    activeQuests: [],
    completedQuests: [],
    failedQuests: [],
    triggeredEvents: [],
    importantChoices: [],
    worldState: {},
    recentMessages: [
      {
        id: uid("msg"),
        role: "narrator",
        content: p.openingScene,
        createdAt: now,
        turn: 0,
        meta: {
          settingsVersionId: p.currentSettingsVersionId,
          settingsVersionNumber: p.settingsVersionNumber,
        },
      },
    ],
    rollingSummary: compactSummary(p.story.openingEvent || p.openingScene, 180),
    importantMemories: [],
    history: [],
    settingsVersionId: p.currentSettingsVersionId,
    settingsVersionNumber: p.settingsVersionNumber,
    turnDurationsMs: [],
    discoveredWorldBookEntryIds: [],
  };
}
export function snapshot(s: GameSave): GameSaveSnapshot {
  const cloned = structuredClone(s);
  delete (cloned as Partial<GameSave>).history;
  return cloned;
}
export function applyPatch(save: GameSave, p: GameStatePatch) {
  if (p.playerAttributes)
    Object.assign(save.playerState.attributes, p.playerAttributes);
  if (p.addItems) save.playerState.inventory.push(...p.addItems);
  if (p.removeItemIds)
    save.playerState.inventory = save.playerState.inventory.filter(
      (i) => !p.removeItemIds!.includes(i.id),
    );
  if (p.locationId) save.currentLocationId = p.locationId;
  if (p.time) save.currentTime = p.time;
  if (p.worldState) Object.assign(save.worldState, p.worldState);
  if (p.characterStates)
    for (const [id, delta] of Object.entries(p.characterStates)) {
      save.characterStates[id] = Object.assign(
        save.characterStates[id] || {
          attitude: 0,
          locationId: save.currentLocationId,
          status: "正常",
          memories: [],
        },
        delta,
      );
    }
  if (p.questUpdates)
    for (const q of p.questUpdates) {
      save.activeQuests = save.activeQuests.filter((x) => x.id !== q.id);
      if (q.status === "active") save.activeQuests.push(q);
      else if (q.status === "completed") save.completedQuests.push(q);
      else if (q.status === "failed") save.failedQuests.push(q);
    }
}
