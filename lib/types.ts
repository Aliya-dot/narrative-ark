export type CreationMode = "simple" | "advanced";
export type FreedomMode = "linear" | "hybrid" | "open";
export type GameLength = "short" | "standard" | "long" | "endless";
export interface StoryLengthConfig {
  id: GameLength;
  minTurns: number | null;
  targetTurns: number | null;
  maxTurns: number | null;
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
  recommendedChapters: { min: number; max: number } | null;
}

export type WorldBookStatus = "draft" | "published" | "archived";
export type WorldBookEntryCategory =
  | "core_rule"
  | "history"
  | "timeline"
  | "location"
  | "faction"
  | "character"
  | "race"
  | "religion"
  | "magic"
  | "technology"
  | "creature"
  | "item"
  | "culture"
  | "language"
  | "economy"
  | "custom";
export type WorldBookEntryVisibility =
  "player_visible" | "ai_only" | "hidden_until_discovered";
export type WorldBookEntryActivationMode =
  "conditional" | "always" | "core_rule" | "disabled";
export type WorldBookEntryRelationType = "reference" | "load_with";
export interface WorldBookEntryRelation {
  targetEntryId: string;
  relationType: WorldBookEntryRelationType;
}
export type WorldBookTriggerSource = "auto" | "manual" | "ai" | "imported";
export interface WorldBookTrigger {
  id: string;
  value: string;
  source: WorldBookTriggerSource;
  locked: boolean;
  createdAt: string;
}
export type WorldBookSummaryStatus = "current" | "stale" | "manual" | "empty";
export type WorldBookEditorMode = "quick" | "professional";
export interface WorldBookEntry {
  id: string;
  worldBookId: string;
  category: WorldBookEntryCategory;
  title: string;
  summary: string;
  content: string;
  keywords: string[];
  aliases: string[];
  /** Source-aware trigger metadata. String arrays remain the runtime/import view. */
  triggers?: WorldBookTrigger[];
  aliasTriggers?: WorldBookTrigger[];
  priority: number;
  /** New canonical field. Legacy flags remain for imported and pinned versions. */
  activationMode?: WorldBookEntryActivationMode;
  enabled: boolean;
  alwaysActive: boolean;
  visibility: WorldBookEntryVisibility;
  /** Canonical typed relations. Legacy relatedEntryIds remains the load-with view. */
  relations?: WorldBookEntryRelation[];
  relatedEntryIds: string[];
  activeRegions?: string[];
  activePeriods?: string[];
  factionIds?: string[];
  allowAiExpansion: boolean;
  immutable: boolean;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface WorldBook {
  id: string;
  name: string;
  description: string;
  cover?: string;
  tags: string[];
  status: WorldBookStatus;
  currentVersionId: string;
  versionNumber: number;
  coreSummary: string;
  coreSummaryStatus?: WorldBookSummaryStatus;
  createdAt: string;
  updatedAt: string;
  entryIds: string[];
  source?: {
    projectId: string;
    saveId?: string;
    turn?: number;
    extractionMode: "original" | "derived" | "custom";
    extractedAt: string;
  };
}
export interface WorldBookVersion {
  id: string;
  worldBookId: string;
  versionNumber: number;
  note?: string;
  createdAt: string;
  snapshot: {
    coreSummary: string;
    entries: WorldBookEntry[];
  };
}
export type WorldBookAiOperation =
  | "full_generation"
  | "fill_missing"
  | "category_generation"
  | "entry_generation"
  | "entry_expand"
  | "entry_summarize"
  | "keyword_generation"
  | "alias_generation"
  | "entry_rewrite"
  | "consistency_check"
  | "token_optimization";
export interface WorldBookAiDraft {
  id: string;
  worldBookId: string;
  operation: WorldBookAiOperation;
  targetEntryIds?: string[];
  beforeSnapshot: unknown;
  result: unknown;
  createdAt: string;
  status:
    | "generating"
    | "ready"
    | "partially_applied"
    | "applied"
    | "discarded"
    | "failed";
}
export interface WorldScenario {
  id: string;
  worldBookId: string;
  worldBookVersionId: string;
  name: string;
  description: string;
  startPeriod: string;
  startLocation: string;
  initialCrisis: string;
  mainGoal: string;
  recommendedProtagonist: string;
  importantEntryIds: string[];
  chapterPlan: string;
  endingDirections: string[];
  specialRules: string[];
  gameLength: GameLength;
  createdAt: string;
  updatedAt: string;
}
export interface WorldBookContextBudget {
  mode: "compact" | "balanced" | "detailed" | "custom";
  maxTokens: number;
  maxEntries?: number;
}
export interface GameWorldBinding {
  worldBookId: string;
  worldBookVersionId: string;
  worldBookVersionNumber: number;
  scenarioId?: string;
  contextBudget: WorldBookContextBudget;
}
export interface WorldBookRetrievalContext {
  userInput: string;
  recentNarrative: string;
  currentLocation?: string;
  activeNpcIds: string[];
  activeNpcNames: string[];
  activeFactionIds: string[];
  activeTaskIds: string[];
  activeTaskText: string[];
  activeItemIds: string[];
  activeItemNames: string[];
  currentPeriod?: string;
}
export interface RetrievedWorldBookEntry {
  entry: WorldBookEntry;
  score: number;
  reasons: string[];
  estimatedTokens: number;
  injection: "full" | "summary";
}
export interface WorldBookContextPreview {
  worldBookId: string;
  worldBookVersionId: string;
  worldBookName: string;
  coreSummaryTokens: number;
  injectedTokens: number;
  fullBookTokens: number;
  estimatedSavingsPercent: number;
  selected: Array<{
    entryId: string;
    title: string;
    visibility: WorldBookEntryVisibility;
    score: number;
    reasons: string[];
    estimatedTokens: number;
    injection: "full" | "summary";
  }>;
  skipped: Array<{
    entryId: string;
    title: string;
    visibility: WorldBookEntryVisibility;
    reason: string;
    score?: number;
    reasons?: string[];
  }>;
  createdAt: string;
}
export interface WorldBookTurnContext {
  worldBookId: string;
  worldBookVersionId: string;
  worldBookName: string;
  coreSummary: string;
  entries: Array<{
    id: string;
    category: WorldBookEntryCategory;
    title: string;
    text: string;
    visibility: WorldBookEntryVisibility;
    injection: "full" | "summary";
  }>;
  preview: WorldBookContextPreview;
}
export interface SupportingCharacterDraft {
  id: string;
  name: string;
  identity: string;
  relationship: string;
  appearance: string;
  personality: string;
  goal: string;
  specialAbility: string;
  secret: string;
}
export interface GameAbility {
  id: string;
  name: string;
  description: string;
  level?: number;
}
export interface GameItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
}
export interface GameStatus {
  id: string;
  name: string;
  description: string;
  duration?: number;
}
export interface GameLocation {
  id: string;
  name: string;
  description: string;
  connections: string[];
}
export interface GameFaction {
  id: string;
  name: string;
  description: string;
  attitude: number;
  goal: string;
}
export interface GameCharacter {
  id: string;
  name: string;
  identity: string;
  age: string;
  race: string;
  personality: string;
  appearance: string;
  background: string;
  abilities: GameAbility[];
  relationship: string;
  attitude: number;
  goal: string;
  secret: string;
  speechStyle: string;
  important: boolean;
  mortal: boolean;
}
export interface AttributeDefinition {
  id: string;
  name: string;
  initial: number;
  max: number;
  display: "number" | "bar";
}
export interface StoryChapter {
  id: string;
  title: string;
  summary: string;
  goals: string[];
  mainConflict?: string;
  importantCharacters?: string[];
  estimatedTurnRange?: { min: number; max: number };
  completed?: boolean;
}
export interface GameQuest {
  id: string;
  title: string;
  description: string;
  status: "inactive" | "active" | "completed" | "failed";
  objectives: string[];
}
export interface GameEvent {
  id: string;
  title: string;
  trigger: string;
  description: string;
}
export interface GameEnding {
  id: string;
  title: string;
  conditions: string[];
  description: string;
}
export interface GameProject {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  projectInfo: {
    title: string;
    description: string;
    genre: string;
    tone: string;
    creationMode: CreationMode;
    freedomMode: FreedomMode;
    gameLength?: GameLength;
    storyLength?: StoryLengthConfig;
  };
  world: {
    background: string;
    history: string;
    geography: string;
    locations: GameLocation[];
    factions: GameFaction[];
    races: string[];
    religions: string[];
    socialRules: string[];
    powerSystem: string;
    currentCrisis: string;
    secrets: string[];
  };
  player: {
    name: string;
    gender: string;
    age: string;
    race: string;
    identity: string;
    background: string;
    personality: string;
    appearance: string;
    goals: string[];
    talents: GameAbility[];
    skills: GameAbility[];
    weaknesses: string[];
    attributes: Record<string, number>;
    inventory: GameItem[];
    equipment: GameItem[];
    statusEffects: GameStatus[];
  };
  characters: GameCharacter[];
  gameSystem: {
    levelSystem: string;
    attributes: AttributeDefinition[];
    combatRules: string;
    taskRules: string;
    relationshipRules: string;
    deathRules: string;
    difficultyRules: string;
    randomCheckRules: string;
  };
  story: {
    mainGoal: string;
    openingEvent: string;
    chapters: StoryChapter[];
    sideQuests: GameQuest[];
    randomEvents: GameEvent[];
    endings: GameEnding[];
  };
  prompts: {
    gameMasterPrompt: string;
    openingPrompt: string;
    stateUpdatePrompt: string;
    summaryPrompt: string;
    consistencyCheckPrompt: string;
  };
  openingScene: string;
  settingsVersions?: SettingsVersion[];
  currentSettingsVersionId?: string;
  settingsVersionNumber?: number;
  worldBinding?: GameWorldBinding;
  scenarioId?: string;
}
export type ProjectSettingsSnapshot = Pick<
  GameProject,
  | "projectInfo"
  | "world"
  | "player"
  | "characters"
  | "gameSystem"
  | "story"
  | "prompts"
  | "openingScene"
>;
export interface SettingsVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
  note?: string;
  effectiveFromTurn: number;
  settingsSnapshot: ProjectSettingsSnapshot;
}
export interface AIConfig {
  id: string;
  provider: string;
  apiKey: string;
  credentialRef?: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  timeout: number;
  headers: Record<string, string>;
  parameterSupport?: {
    temperature: boolean;
    topP: boolean;
    maxTokens: boolean;
  };
  active: boolean;
  updatedAt: string;
  connectionVerifiedAt?: string;
  connectionFailedAt?: string;
}
export interface GameMessage {
  id: string;
  role: "player" | "narrator" | "system";
  content: string;
  createdAt: string;
  turn: number;
  meta?: Record<string, unknown>;
}
export interface RuntimePlayerState {
  attributes: Record<string, number>;
  inventory: GameItem[];
  equipment: GameItem[];
  statusEffects: GameStatus[];
}
export interface RuntimeCharacterState {
  attitude: number;
  locationId: string;
  status: string;
  memories: string[];
}
export interface RuntimeFactionState {
  attitude: number;
  power: number;
  status: string;
}
export interface RuntimeQuest extends GameQuest {
  progress: string[];
}
export interface ImportantChoice {
  turn: number;
  action: string;
  consequence: string;
}
export interface GameSave {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  turn: number;
  currentLocationId: string;
  currentTime: string;
  playerState: RuntimePlayerState;
  characterStates: Record<string, RuntimeCharacterState>;
  factionStates: Record<string, RuntimeFactionState>;
  activeQuests: RuntimeQuest[];
  completedQuests: RuntimeQuest[];
  failedQuests: RuntimeQuest[];
  triggeredEvents: string[];
  importantChoices: ImportantChoice[];
  worldState: Record<string, unknown>;
  recentMessages: GameMessage[];
  rollingSummary: string;
  importantMemories: string[];
  history: GameSaveSnapshot[];
  settingsVersionId?: string;
  settingsVersionNumber?: number;
  turnDurationsMs?: number[];
  discoveredWorldBookEntryIds?: string[];
  lastWorldBookContext?: WorldBookContextPreview;
}
export type GameSaveSnapshot = Omit<GameSave, "history">;
export interface GameStatePatch {
  playerAttributes?: Record<string, number>;
  addItems?: GameItem[];
  removeItemIds?: string[];
  locationId?: string;
  time?: string;
  characterStates?: Record<string, Partial<RuntimeCharacterState>>;
  questUpdates?: RuntimeQuest[];
  worldState?: Record<string, unknown>;
}
export interface GameLogEvent {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}
export interface GameTurnResponse {
  narrative: string;
  dialogue?: { characterId: string; characterName: string; content: string }[];
  choices: { id: string; text: string }[];
  statePatch: GameStatePatch;
  newEvents: GameLogEvent[];
  importantMemories: string[];
  shortSummary: string;
  rollingSummary: string;
}
export interface GenerationDraft {
  title: string;
  idea: string;
  genre: string;
  protagonist: string;
  tone: string;
  freedomMode: FreedomMode;
  gameLength: GameLength;
  numericSystem: boolean;
  creationMode: CreationMode;
  advanced?: Record<string, string>;
  supportingCharacters?: SupportingCharacterDraft[];
  creationMeta?: {
    lockedFields: string[];
  };
  worldBinding?: GameWorldBinding;
  worldBookPreview?: {
    name: string;
    coreSummary: string;
  };
}

export interface CreationStepSnapshot {
  fields: Record<string, string>;
  supportingCharacters?: SupportingCharacterDraft[];
}

export interface CreationDraftMeta {
  step: number;
  lockedFields: string[];
  aiDraftFields: string[];
  fieldUndo: Record<string, string>;
  stepUndo?: CreationStepSnapshot;
  optimizeExisting: boolean;
}

export interface CreationWorkspaceDraft {
  kind: "creation-workspace-v1";
  form: GenerationDraft;
  meta: CreationDraftMeta;
}
export const MODULE_KEYS = [
  "projectInfo",
  "world",
  "player",
  "characters",
  "gameSystem",
  "story",
  "prompts",
  "openingScene",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
