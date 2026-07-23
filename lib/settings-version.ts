import type {
  GameProject,
  ModuleKey,
  ProjectSettingsSnapshot,
  SettingsVersion,
} from "./types";
import {
  normalizeGameLength,
  normalizeProjectStoryLength,
  storyLengthConfig,
} from "./story-length";

export type SettingsRisk = {
  level: "low" | "medium" | "high";
  reasons: string[];
};

export function settingsSnapshot(
  project: GameProject,
): ProjectSettingsSnapshot {
  const normalized = normalizeProjectStoryLength(project);
  return structuredClone({
    projectInfo: {
      ...normalized.projectInfo,
    },
    world: project.world,
    player: project.player,
    characters: project.characters,
    gameSystem: project.gameSystem,
    story: project.story,
    prompts: project.prompts,
    openingScene: project.openingScene,
  });
}

export function ensureSettingsVersions(project: GameProject): GameProject {
  const normalizedProject = normalizeProjectStoryLength(project);
  if (
    normalizedProject.settingsVersions?.length &&
    normalizedProject.currentSettingsVersionId &&
    normalizedProject.settingsVersionNumber
  ) {
    let changed = normalizedProject !== project;
    const versions = normalizedProject.settingsVersions.map((version) => {
      const length = normalizeGameLength(
        version.settingsSnapshot.projectInfo.storyLength?.id ??
          version.settingsSnapshot.projectInfo.gameLength,
      );
      const expectedLength = storyLengthConfig(length);
      const hasLength =
        version.settingsSnapshot.projectInfo.gameLength === length &&
        JSON.stringify(version.settingsSnapshot.projectInfo.storyLength) ===
          JSON.stringify(expectedLength);
      const hasEffectiveTurn = Number.isFinite(version.effectiveFromTurn);
      if (hasLength && hasEffectiveTurn) return version;
      changed = true;
      return {
        ...version,
        effectiveFromTurn: hasEffectiveTurn ? version.effectiveFromTurn : 0,
        settingsSnapshot: {
          ...version.settingsSnapshot,
          projectInfo: {
            ...version.settingsSnapshot.projectInfo,
            gameLength: length,
            storyLength: expectedLength,
          },
        },
      };
    });
    return changed
      ? { ...normalizedProject, settingsVersions: versions }
      : normalizedProject;
  }

  const now = normalizedProject.updatedAt || new Date().toISOString();
  const initial: SettingsVersion = {
    id: `${normalizedProject.id}:settings:v1`,
    projectId: normalizedProject.id,
    versionNumber: 1,
    createdAt: normalizedProject.createdAt || now,
    updatedAt: now,
    note: "由现有设定初始化",
    effectiveFromTurn: 0,
    settingsSnapshot: settingsSnapshot(normalizedProject),
  };
  return {
    ...normalizedProject,
    settingsVersions: [initial],
    currentSettingsVersionId: initial.id,
    settingsVersionNumber: 1,
  };
}

export function createSettingsVersion(
  current: GameProject,
  nextSettings: ProjectSettingsSnapshot,
  effectiveFromTurn: number,
  note: string,
): GameProject {
  const normalized = ensureSettingsVersions(current);
  const length = normalizeGameLength(
    nextSettings.projectInfo.gameLength ??
      nextSettings.projectInfo.storyLength?.id,
  );
  const normalizedSettings: ProjectSettingsSnapshot = {
    ...structuredClone(nextSettings),
    projectInfo: {
      ...structuredClone(nextSettings.projectInfo),
      gameLength: length,
      storyLength: storyLengthConfig(length),
    },
  };
  const now = new Date().toISOString();
  const versionNumber = (normalized.settingsVersionNumber || 1) + 1;
  const version: SettingsVersion = {
    id: `${normalized.id}:settings:v${versionNumber}:${Date.now().toString(36)}`,
    projectId: normalized.id,
    versionNumber,
    createdAt: now,
    updatedAt: now,
    note,
    effectiveFromTurn,
    settingsSnapshot: structuredClone(normalizedSettings),
  };
  return {
    ...normalized,
    ...structuredClone(normalizedSettings),
    updatedAt: now,
    version: normalized.version + 1,
    settingsVersions: [...(normalized.settingsVersions || []), version],
    currentSettingsVersionId: version.id,
    settingsVersionNumber: versionNumber,
  };
}

export function sameSettings(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ids(value: unknown, key: string) {
  const source = value as Record<string, unknown>;
  const list = source?.[key];
  return new Set(
    Array.isArray(list)
      ? list
          .map((item) =>
            item && typeof item === "object"
              ? String((item as Record<string, unknown>).id || "")
              : "",
          )
          .filter(Boolean)
      : [],
  );
}

function removed(before: Set<string>, after: Set<string>) {
  return [...before].some((id) => !after.has(id));
}

function changed(a: unknown, b: unknown) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function settingsLength(value: Record<string, unknown>) {
  const structured = value.storyLength as { id?: unknown } | null | undefined;
  return normalizeGameLength(value.gameLength ?? structured?.id);
}

function majorTextReplacement(a: unknown, b: unknown) {
  if (typeof a !== "string" || typeof b !== "string" || a.length < 80)
    return false;
  return b.length < a.length * 0.45 || Math.abs(a.length - b.length) > 500;
}

export function classifySettingsChange(
  key: ModuleKey,
  before: unknown,
  after: unknown,
): SettingsRisk {
  const oldValue = before as Record<string, unknown>;
  const newValue = after as Record<string, unknown>;
  const high: string[] = [];
  const medium: string[] = [];

  if (key === "characters") {
    const oldCharacters = Array.isArray(before) ? before : [];
    const newCharacters = Array.isArray(after) ? after : [];
    const newById = new Map(
      newCharacters.map((item) => [
        String((item as Record<string, unknown>).id || ""),
        item as Record<string, unknown>,
      ]),
    );
    if (
      oldCharacters.some(
        (item) =>
          !newById.has(String((item as Record<string, unknown>).id || "")),
      )
    )
      high.push("删除了可能已经出场的 NPC");
    if (
      oldCharacters.some((item) => {
        const oldCharacter = item as Record<string, unknown>;
        const next = newById.get(String(oldCharacter.id || ""));
        return (
          next &&
          (changed(oldCharacter.name, next.name) ||
            changed(oldCharacter.identity, next.identity))
        );
      })
    )
      medium.push("修改了已有 NPC 的姓名或身份");
  }

  if (key === "world") {
    if (removed(ids(before, "locations"), ids(after, "locations")))
      high.push("删除了存档可能正在使用的地点");
    if (majorTextReplacement(oldValue.background, newValue.background))
      high.push("大幅替换了世界背景");
    if (
      changed(oldValue.powerSystem, newValue.powerSystem) ||
      changed(oldValue.currentCrisis, newValue.currentCrisis)
    )
      medium.push("修改了力量体系或当前世界危机");
  }

  if (key === "gameSystem") {
    const beforeAttributes = ids(before, "attributes");
    const afterAttributes = ids(after, "attributes");
    if (
      removed(beforeAttributes, afterAttributes) ||
      removed(afterAttributes, beforeAttributes)
    )
      high.push("改变了存档依赖的属性字段结构");
  }

  if (key === "player") {
    if (
      removed(ids(before, "skills"), ids(after, "skills")) ||
      removed(ids(before, "talents"), ids(after, "talents"))
    )
      high.push("删除了主角技能或天赋类型");
    if (
      ["name", "identity", "age", "race"].some((field) =>
        changed(oldValue[field], newValue[field]),
      )
    )
      medium.push("修改了主角姓名、身份、年龄或种族");
  }

  if (key === "story") {
    if (removed(ids(before, "chapters"), ids(after, "chapters")))
      high.push("删除了既有章节结构");
    if (changed(oldValue.mainGoal, newValue.mainGoal))
      medium.push("修改了主线目标");
  }

  if (key === "prompts") {
    if (
      majorTextReplacement(oldValue.gameMasterPrompt, newValue.gameMasterPrompt)
    )
      high.push("大幅替换了游戏主持逻辑");
  }

  if (
    key === "projectInfo" &&
    ["title", "genre"].some((field) =>
      changed(oldValue[field], newValue[field]),
    )
  )
    medium.push("修改了项目名称或题材");

  if (
    key === "projectInfo" &&
    settingsLength(oldValue) !== settingsLength(newValue)
  )
    medium.push("修改了游戏篇幅；新节奏会从下一回合开始生效，不改写已有剧情");

  if (high.length) return { level: "high", reasons: [...high, ...medium] };
  if (medium.length) return { level: "medium", reasons: medium };
  return { level: "low", reasons: ["仅影响后续叙事表现或补充设定"] };
}
