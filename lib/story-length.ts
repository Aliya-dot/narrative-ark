import type {
  GameLength,
  GameProject,
  GameSave,
  StoryLengthConfig,
} from "./types";

export type StoryLengthPreset = StoryLengthConfig & {
  label: string;
  optionLabel: string;
  description: string;
  chapterTurnRange: { min: number; max: number } | null;
};

export const STORY_LENGTH_PRESETS: Record<GameLength, StoryLengthPreset> = {
  short: {
    id: "short",
    label: "短篇",
    optionLabel: "短篇 · 30～50 回合",
    minTurns: 30,
    targetTurns: 40,
    maxTurns: 50,
    estimatedMinutesMin: 30,
    estimatedMinutesMax: 60,
    recommendedChapters: { min: 3, max: 5 },
    chapterTurnRange: { min: 8, max: 12 },
    description: "适合一次玩完的小型故事，人物和支线较少。",
  },
  standard: {
    id: "standard",
    label: "标准",
    optionLabel: "标准 · 80～120 回合",
    minTurns: 80,
    targetTurns: 100,
    maxTurns: 120,
    estimatedMinutesMin: 90,
    estimatedMinutesMax: 150,
    recommendedChapters: { min: 6, max: 10 },
    chapterTurnRange: { min: 10, max: 15 },
    description: "适合完整冒险，有主线、角色成长和适量支线。",
  },
  long: {
    id: "long",
    label: "长篇",
    optionLabel: "长篇 · 180～280 回合",
    minTurns: 180,
    targetTurns: 230,
    maxTurns: 280,
    estimatedMinutesMin: 180,
    estimatedMinutesMax: 300,
    recommendedChapters: { min: 12, max: 20 },
    chapterTurnRange: { min: 12, max: 18 },
    description: "适合多章节世界、长期成长和复杂人物关系。",
  },
  endless: {
    id: "endless",
    label: "无限",
    optionLabel: "无限 · 持续生成新章节",
    minTurns: null,
    targetTurns: null,
    maxTurns: null,
    estimatedMinutesMin: null,
    estimatedMinutesMax: null,
    recommendedChapters: null,
    chapterTurnRange: { min: 20, max: 50 },
    description: "没有固定结局回合，以多个篇章持续发展。",
  },
};

export function normalizeGameLength(value: unknown): GameLength {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    text === "endless" ||
    text === "infinite" ||
    text.includes("无限") ||
    text.includes("持续生成")
  )
    return "endless";
  if (text === "short" || text.includes("短篇") || text.includes("20～30"))
    return "short";
  if (text === "long" || text.includes("长篇") || text.includes("100～140"))
    return "long";
  if (text === "standard" || text.includes("标准") || text.includes("50～70"))
    return "standard";
  return "standard";
}

export function storyLengthConfig(value: unknown): StoryLengthConfig {
  const preset = STORY_LENGTH_PRESETS[normalizeGameLength(value)];
  return {
    id: preset.id,
    minTurns: preset.minTurns,
    targetTurns: preset.targetTurns,
    maxTurns: preset.maxTurns,
    estimatedMinutesMin: preset.estimatedMinutesMin,
    estimatedMinutesMax: preset.estimatedMinutesMax,
    recommendedChapters: preset.recommendedChapters
      ? { ...preset.recommendedChapters }
      : null,
  };
}

export function getStoryLengthPreset(value: unknown) {
  return STORY_LENGTH_PRESETS[normalizeGameLength(value)];
}

export function normalizeProjectStoryLength(project: GameProject): GameProject {
  const id = normalizeGameLength(
    project.projectInfo.gameLength ?? project.projectInfo.storyLength?.id,
  );
  const expected = storyLengthConfig(id);
  if (
    project.projectInfo.gameLength === id &&
    JSON.stringify(project.projectInfo.storyLength) === JSON.stringify(expected)
  )
    return project;
  return {
    ...project,
    projectInfo: {
      ...project.projectInfo,
      gameLength: id,
      storyLength: expected,
    },
  };
}

export function storyLengthMeta(value: unknown) {
  const preset = getStoryLengthPreset(value);
  if (preset.id === "endless") {
    return {
      turnRange: "不设固定结束回合",
      estimatedTime: "持续游玩",
      chapters: "每篇章建议 20～50 回合",
    };
  }
  const estimatedTime =
    preset.estimatedMinutesMin! >= 60
      ? `预计 ${Number.isInteger(preset.estimatedMinutesMin! / 60) ? preset.estimatedMinutesMin! / 60 : (preset.estimatedMinutesMin! / 60).toFixed(1)}～${Number.isInteger(preset.estimatedMinutesMax! / 60) ? preset.estimatedMinutesMax! / 60 : (preset.estimatedMinutesMax! / 60).toFixed(1)} 小时`
      : `预计 ${preset.estimatedMinutesMin}～${preset.estimatedMinutesMax} 分钟`;
  return {
    turnRange: `约 ${preset.minTurns}～${preset.maxTurns} 回合`,
    estimatedTime,
    chapters: `建议 ${preset.recommendedChapters!.min}～${preset.recommendedChapters!.max} 章`,
  };
}

export type StoryPhase = "开局" | "发展" | "深入" | "高潮前夕" | "结局阶段";

export function storyPacing(value: unknown, turn: number) {
  const preset = getStoryLengthPreset(value);
  if (preset.id === "endless") {
    const arcLength = 35;
    const arcTurn = ((Math.max(turn, 1) - 1) % arcLength) + 1;
    const ratio = arcTurn / arcLength;
    return {
      preset,
      progress: null,
      phase: phaseForRatio(ratio),
      exceeded: false,
      arcTurn,
      arcNumber: Math.floor((Math.max(turn, 1) - 1) / arcLength) + 1,
    };
  }
  const progress = turn / preset.targetTurns!;
  return {
    preset,
    progress,
    phase: phaseForRatio(progress),
    exceeded: turn > preset.maxTurns!,
    arcTurn: null,
    arcNumber: null,
  };
}

function phaseForRatio(progress: number): StoryPhase {
  if (progress < 0.15) return "开局";
  if (progress < 0.4) return "发展";
  if (progress < 0.7) return "深入";
  if (progress < 0.9) return "高潮前夕";
  return "结局阶段";
}

export function chapterForTurn(project: GameProject, save: GameSave) {
  const pacing = storyPacing(project.projectInfo.gameLength, save.turn);
  if (pacing.preset.id === "endless") {
    const runtimeIndex = Number(save.worldState.currentChapterIndex);
    const runtimeTitle = String(save.worldState.currentChapterTitle || "");
    return {
      index:
        Number.isFinite(runtimeIndex) && runtimeIndex > 0
          ? runtimeIndex
          : pacing.arcNumber!,
      title: runtimeTitle || `第 ${pacing.arcNumber} 篇章`,
    };
  }
  const rangedIndex = project.story.chapters.findIndex((chapter) => {
    const range = chapter.estimatedTurnRange;
    return range && save.turn >= range.min && save.turn <= range.max;
  });
  if (rangedIndex >= 0) {
    return {
      index: rangedIndex + 1,
      title: project.story.chapters[rangedIndex].title,
    };
  }
  const count = Math.max(project.story.chapters.length, 1);
  const ratio = Math.max(0, Math.min(pacing.progress ?? 0, 0.999));
  const index = Math.min(count, Math.floor(ratio * count) + 1);
  return {
    index,
    title: project.story.chapters[index - 1]?.title || `第 ${index} 章`,
  };
}

export function estimateRemainingMinutes(
  value: unknown,
  turn: number,
  samples: number[] | undefined,
) {
  const preset = getStoryLengthPreset(value);
  const valid = (samples || []).filter((ms) => ms >= 10_000 && ms <= 600_000);
  if (preset.id === "endless" || valid.length < 5) return null;
  const recent = valid.slice(-10);
  const averageMinutes =
    recent.reduce((sum, milliseconds) => sum + milliseconds, 0) /
    recent.length /
    60_000;
  const remainingTurns = Math.max(preset.targetTurns! - turn, 0);
  if (!remainingTurns) return null;
  return Math.max(1, Math.round(remainingTurns * averageMinutes));
}

export function formatRemainingMinutes(minutes: number) {
  if (minutes < 60) return `约 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `约 ${hours} 小时 ${rest} 分钟` : `约 ${hours} 小时`;
}

export function lengthPlanningInstruction(value: unknown) {
  const preset = getStoryLengthPreset(value);
  if (preset.id === "endless")
    return "无限模式：不要设置整个游戏的固定终局。采用篇章式结构，每篇章约 20～50 回合，包含独立目标、发展、阶段高潮与阶段结局；阶段结束后必须保留世界状态并规划下一篇章，定期引入新目标、地点或冲突，不能重复日常事件。";
  const chapter = preset.recommendedChapters!;
  const scale =
    preset.id === "short"
      ? "聚焦单一核心事件、少量主要角色和地点、极少支线，伏笔短期回收，避免庞大阵营。"
      : preset.id === "standard"
        ? "建立完整主线、多个重要角色、适量支线与关系变化，包含铺垫、发展、高潮和结局。"
        : "使用多个阵营、长期成长、交织的主支线、长期人物关系、重要伏笔和阶段性高潮，不能把短篇机械拉长。";
  return `${preset.label}模式：目标 ${preset.minTurns}～${preset.maxTurns} 回合，中心目标约 ${preset.targetTurns} 回合；规划 ${chapter.min}～${chapter.max} 个可调整章节。${scale}`;
}

export function turnPacingInstruction(value: unknown, turn: number) {
  const pacing = storyPacing(value, turn);
  const antiEnding =
    "普通任务完成、离开地点、结束一天或完成章节都不等于整个游戏结束。除非主要矛盾已解决、关键关系有合理结果且接近结局区间，或玩家明确要求结束，或玩家死亡且规则不允许继续，否则不得结束整个游戏。";
  const antiDelay =
    "回合目标只控制整体节奏，不得为了凑回合拖延。每回合至少产生一种有效变化：新信息、新选择、状态或关系变化、任务进展、环境变化、冲突升级或资源变化；不得重复地点介绍、相同信息或无意义障碍。";
  if (pacing.preset.id === "endless") {
    return `当前游戏篇幅：无限；当前第 ${pacing.arcNumber} 篇章，第 ${pacing.arcTurn} 个篇章回合；当前阶段：${pacing.phase}。篇章冲突解决后生成阶段性结局，并在 worldState 中更新 currentChapterIndex、currentChapterTitle 和 nextChapterGoal，继续开启新篇章，绝不能自动结束整个游戏。${antiEnding}${antiDelay}`;
  }
  const progress = Math.round(Math.min(pacing.progress!, 1) * 100);
  const transition = pacing.exceeded
    ? "当前已超过建议回合范围。不要立即强制结局；在后续数个回合内逐步回收伏笔和主要冲突，仍需尊重玩家选择。"
    : pacing.progress! < 0.15
      ? "建立人物、世界和初始矛盾，不要揭晓核心答案或进入最终决战。"
      : pacing.progress! < 0.4
        ? "推进探索、关系和主线展开，让选择形成后果。"
        : pacing.progress! < 0.7
          ? "升级冲突，让支线与主线交织并推动角色成长。"
          : pacing.progress! < 0.9
            ? "加深危机并自然回收伏笔，逐步接近高潮，但不要替玩家决定。"
            : "准备最终冲突并解决主要问题；达到目标比例不代表必须立刻结束。";
  return `当前游戏篇幅：${pacing.preset.label}篇；建议范围：${pacing.preset.minTurns}～${pacing.preset.maxTurns} 回合；中心目标：约 ${pacing.preset.targetTurns} 回合；当前回合：第 ${turn} 回合；参考进度：约 ${progress}%；当前阶段：${pacing.phase}。${transition}${antiEnding}${antiDelay}`;
}
