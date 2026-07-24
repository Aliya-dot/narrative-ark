import { z } from "zod";
import type { GameProject, GameSave } from "./types";

const creationModeSchema = z.enum(["simple", "advanced"]);
const freedomModeSchema = z.enum(["linear", "hybrid", "open"]);
const gameLengthSchema = z.enum(["short", "standard", "long", "endless"]);

const storyLengthConfigSchema = z.strictObject({
  id: gameLengthSchema,
  minTurns: z.number().nullable(),
  targetTurns: z.number().nullable(),
  maxTurns: z.number().nullable(),
  estimatedMinutesMin: z.number().nullable(),
  estimatedMinutesMax: z.number().nullable(),
  recommendedChapters: z
    .strictObject({
      min: z.number(),
      max: z.number(),
    })
    .nullable(),
});

const gameAbilitySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  level: z.number().optional(),
});

const gameItemSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  quantity: z.number(),
});

const gameStatusSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  duration: z.number().optional(),
});

const gameLocationSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  connections: z.array(z.string()),
});

const gameFactionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  attitude: z.number(),
  goal: z.string(),
});

export const gameCharacterSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  identity: z.string(),
  age: z.string(),
  race: z.string(),
  personality: z.string(),
  appearance: z.string(),
  background: z.string(),
  abilities: z.array(gameAbilitySchema),
  relationship: z.string(),
  attitude: z.number(),
  goal: z.string(),
  secret: z.string(),
  speechStyle: z.string(),
  important: z.boolean(),
  mortal: z.boolean(),
});

const attributeDefinitionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  initial: z.number(),
  max: z.number(),
  display: z.enum(["number", "bar"]),
});

const storyChapterSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  goals: z.array(z.string()),
  mainConflict: z.string().optional(),
  importantCharacters: z.array(z.string()).optional(),
  estimatedTurnRange: z
    .strictObject({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  completed: z.boolean().optional(),
});

const gameQuestSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["inactive", "active", "completed", "failed"]),
  objectives: z.array(z.string()),
});

const gameEventSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  trigger: z.string(),
  description: z.string(),
});

const gameEndingSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  conditions: z.array(z.string()),
  description: z.string(),
});

export const projectInfoSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  tone: z.string(),
  creationMode: creationModeSchema,
  freedomMode: freedomModeSchema,
  gameLength: gameLengthSchema.optional(),
  storyLength: storyLengthConfigSchema.optional(),
});

export const projectWorldSchema = z.strictObject({
  background: z.string(),
  history: z.string(),
  geography: z.string(),
  locations: z.array(gameLocationSchema),
  factions: z.array(gameFactionSchema),
  races: z.array(z.string()),
  religions: z.array(z.string()),
  socialRules: z.array(z.string()),
  powerSystem: z.string(),
  currentCrisis: z.string(),
  secrets: z.array(z.string()),
});

export const projectPlayerSchema = z.strictObject({
  name: z.string(),
  gender: z.string(),
  age: z.string(),
  race: z.string(),
  identity: z.string(),
  background: z.string(),
  personality: z.string(),
  appearance: z.string(),
  goals: z.array(z.string()),
  talents: z.array(gameAbilitySchema),
  skills: z.array(gameAbilitySchema),
  weaknesses: z.array(z.string()),
  attributes: z.record(z.string(), z.number()),
  inventory: z.array(gameItemSchema),
  equipment: z.array(gameItemSchema),
  statusEffects: z.array(gameStatusSchema),
});

export const projectGameSystemSchema = z.strictObject({
  levelSystem: z.string(),
  attributes: z.array(attributeDefinitionSchema),
  combatRules: z.string(),
  taskRules: z.string(),
  relationshipRules: z.string(),
  deathRules: z.string(),
  difficultyRules: z.string(),
  randomCheckRules: z.string(),
});

export const projectStorySchema = z.strictObject({
  mainGoal: z.string(),
  openingEvent: z.string(),
  chapters: z.array(storyChapterSchema),
  sideQuests: z.array(gameQuestSchema),
  randomEvents: z.array(gameEventSchema),
  endings: z.array(gameEndingSchema),
});

export const projectPromptsSchema = z.strictObject({
  gameMasterPrompt: z.string(),
  openingPrompt: z.string(),
  stateUpdatePrompt: z.string(),
  summaryPrompt: z.string(),
  consistencyCheckPrompt: z.string(),
});

const projectSettingsSnapshotSchema = z.strictObject({
  projectInfo: projectInfoSchema,
  world: projectWorldSchema,
  player: projectPlayerSchema,
  characters: z.array(gameCharacterSchema),
  gameSystem: projectGameSystemSchema,
  story: projectStorySchema,
  prompts: projectPromptsSchema,
  openingScene: z.string(),
});

const settingsVersionSchema = z.strictObject({
  id: z.string(),
  projectId: z.string(),
  versionNumber: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  note: z.string().optional(),
  effectiveFromTurn: z.number(),
  settingsSnapshot: projectSettingsSnapshotSchema,
});

const worldBookContextBudgetSchema = z.strictObject({
  mode: z.enum(["compact", "balanced", "detailed", "custom"]),
  maxTokens: z.number(),
  maxEntries: z.number().optional(),
});

const gameWorldBindingSchema = z.strictObject({
  worldBookId: z.string(),
  worldBookVersionId: z.string(),
  worldBookVersionNumber: z.number(),
  scenarioId: z.string().optional(),
  contextBudget: worldBookContextBudgetSchema,
});

export const gameProjectSchema = z.strictObject({
  id: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  projectInfo: projectInfoSchema,
  world: projectWorldSchema,
  player: projectPlayerSchema,
  characters: z.array(gameCharacterSchema),
  gameSystem: projectGameSystemSchema,
  story: projectStorySchema,
  prompts: projectPromptsSchema,
  openingScene: z.string(),
  settingsVersions: z.array(settingsVersionSchema).optional(),
  currentSettingsVersionId: z.string().optional(),
  settingsVersionNumber: z.number().optional(),
  worldBinding: gameWorldBindingSchema.optional(),
  scenarioId: z.string().optional(),
});

export const GameProjectSchema = gameProjectSchema;

const gameMessageSchema = z.strictObject({
  id: z.string(),
  role: z.enum(["player", "narrator", "system"]),
  content: z.string(),
  createdAt: z.string(),
  turn: z.number(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const runtimePlayerStateSchema = z.strictObject({
  attributes: z.record(z.string(), z.number()),
  inventory: z.array(gameItemSchema),
  equipment: z.array(gameItemSchema),
  statusEffects: z.array(gameStatusSchema),
});

const runtimeCharacterStateSchema = z.strictObject({
  attitude: z.number(),
  locationId: z.string(),
  status: z.string(),
  memories: z.array(z.string()),
});

const runtimeFactionStateSchema = z.strictObject({
  attitude: z.number(),
  power: z.number(),
  status: z.string(),
});

const runtimeQuestSchema = gameQuestSchema.extend({
  progress: z.array(z.string()),
});

const importantChoiceSchema = z.strictObject({
  turn: z.number(),
  action: z.string(),
  consequence: z.string(),
});

const worldBookContextPreviewSchema = z.strictObject({
  worldBookId: z.string(),
  worldBookVersionId: z.string(),
  worldBookName: z.string(),
  coreSummaryTokens: z.number(),
  injectedTokens: z.number(),
  fullBookTokens: z.number(),
  estimatedSavingsPercent: z.number(),
  selected: z.array(
    z.strictObject({
      entryId: z.string(),
      title: z.string(),
      visibility: z.enum([
        "player_visible",
        "ai_only",
        "hidden_until_discovered",
      ]),
      score: z.number(),
      reasons: z.array(z.string()),
      estimatedTokens: z.number(),
      injection: z.enum(["full", "summary"]),
    }),
  ),
  skipped: z.array(
    z.strictObject({
      entryId: z.string(),
      title: z.string(),
      visibility: z.enum([
        "player_visible",
        "ai_only",
        "hidden_until_discovered",
      ]),
      reason: z.string(),
      score: z.number().optional(),
      reasons: z.array(z.string()).optional(),
    }),
  ),
  createdAt: z.string(),
});

const gameSaveSnapshotFields = {
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  turn: z.number(),
  currentLocationId: z.string(),
  currentTime: z.string(),
  playerState: runtimePlayerStateSchema,
  characterStates: z.record(z.string(), runtimeCharacterStateSchema),
  factionStates: z.record(z.string(), runtimeFactionStateSchema),
  activeQuests: z.array(runtimeQuestSchema),
  completedQuests: z.array(runtimeQuestSchema),
  failedQuests: z.array(runtimeQuestSchema),
  triggeredEvents: z.array(z.string()),
  importantChoices: z.array(importantChoiceSchema),
  worldState: z.record(z.string(), z.unknown()),
  recentMessages: z.array(gameMessageSchema),
  rollingSummary: z.string(),
  importantMemories: z.array(z.string()),
  settingsVersionId: z.string().optional(),
  settingsVersionNumber: z.number().optional(),
  turnDurationsMs: z.array(z.number()).optional(),
  discoveredWorldBookEntryIds: z.array(z.string()).optional(),
  lastWorldBookContext: worldBookContextPreviewSchema.optional(),
};

const gameSaveSnapshotSchema = z.strictObject(gameSaveSnapshotFields);

export const gameSaveSchema = z.strictObject({
  ...gameSaveSnapshotFields,
  history: z.array(gameSaveSnapshotSchema),
});

export const GameSaveSchema = gameSaveSchema;

export interface DataValidationIssue {
  path: Array<string | number>;
  pathText: string;
  code: string;
  message: string;
}

export type DataParseResult<T> =
  | {
      success: true;
      data: T;
      issues: [];
    }
  | {
      success: false;
      issues: DataValidationIssue[];
    };

function issuePath(path: PropertyKey[]): Array<string | number> {
  return path.map((segment) =>
    typeof segment === "number" ? segment : String(segment),
  );
}

function pathText(path: Array<string | number>) {
  return path.length ? path.join(".") : "$";
}

function validationIssues(error: z.ZodError): DataValidationIssue[] {
  const issues: DataValidationIssue[] = [];
  for (const issue of error.issues) {
    const path = issuePath(issue.path);
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        const keyPath = [...path, key];
        issues.push({
          path: keyPath,
          pathText: pathText(keyPath),
          code: issue.code,
          message: `Unrecognized key: "${key}"`,
        });
      }
      continue;
    }
    issues.push({
      path,
      pathText: pathText(path),
      code: issue.code,
      message: issue.message,
    });
  }
  return issues;
}

export function safeParseGameProject(
  input: unknown,
): DataParseResult<GameProject> {
  const result = gameProjectSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data, issues: [] }
    : { success: false, issues: validationIssues(result.error) };
}

export function safeParseGameSave(input: unknown): DataParseResult<GameSave> {
  const result = gameSaveSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data, issues: [] }
    : { success: false, issues: validationIssues(result.error) };
}

type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Assert<T extends true> = T;

export type GameProjectSchemaOutput = z.output<typeof gameProjectSchema>;
export type GameSaveSchemaOutput = z.output<typeof gameSaveSchema>;
export type AssertGameProjectSchemaToType = Assert<
  IsAssignable<GameProjectSchemaOutput, GameProject>
>;
export type AssertGameProjectTypeToSchema = Assert<
  IsAssignable<GameProject, GameProjectSchemaOutput>
>;
export type AssertGameSaveSchemaToType = Assert<
  IsAssignable<GameSaveSchemaOutput, GameSave>
>;
export type AssertGameSaveTypeToSchema = Assert<
  IsAssignable<GameSave, GameSaveSchemaOutput>
>;
