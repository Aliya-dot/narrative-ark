import type {
  AIConfig,
  GameProject,
  GameSave,
  GameTurnResponse,
  GenerationDraft,
  ModuleKey,
  WorldBookTurnContext,
} from "./types";
import type { CreationAiOperation } from "./creation-ai";
import {
  creationFieldResultSchema,
  creationIdeasResultSchema,
  creationPageResultSchema,
} from "./creation-ai";
import {
  generatedWorldBookDraftSchema,
  type GeneratedWorldBookDraft,
} from "./world-book-ai";
import { executeAiRequest } from "./model-execution";
import { getPlatformCapabilities } from "./platform/capabilities";

async function request<T>(payload: unknown, signal?: AbortSignal): Promise<T> {
  const platform = getPlatformCapabilities();
  const result = await executeAiRequest(payload, {
    network: platform.network,
    runtime: platform.runtime,
    signal,
  });
  if (result.status >= 400) {
    throw new Error(String(result.body.error || "AI 请求失败"));
  }
  return result.body.data as T;
}
export const testConnection = (config: AIConfig) =>
  request<{
    ok: boolean;
    message: string;
    provider: string;
    model: string;
    latencyMs: number;
  }>({ action: "test", config });
export const generateStage = (
  config: AIConfig,
  stage: string,
  draft: GenerationDraft,
  project: GameProject,
  signal?: AbortSignal,
) =>
  request<Partial<GameProject>>(
    { action: "generate", config, stage, draft, project },
    signal,
  );
export const rewriteModule = (
  config: AIConfig,
  project: GameProject,
  key: ModuleKey,
  instruction: string,
) => request<unknown>({ action: "module", config, project, key, instruction });

export const generateCreationField = async (
  config: AIConfig,
  payload: {
    fieldKey: string;
    operation: CreationAiOperation;
    currentValue: string;
    context: unknown;
    lockedFields: string[];
  },
  signal?: AbortSignal,
) =>
  creationFieldResultSchema.parse(
    await request<unknown>(
      { action: "creation-field", config, ...payload },
      signal,
    ),
  );

export const generateCreationPage = async (
  config: AIConfig,
  payload: {
    step: number;
    context: unknown;
    currentFields: Record<string, string>;
    lockedFields: string[];
    optimizeExisting: boolean;
  },
  signal?: AbortSignal,
) =>
  creationPageResultSchema.parse(
    await request<unknown>(
      { action: "creation-page", config, ...payload },
      signal,
    ),
  );

export const generateCreationIdeas = async (
  config: AIConfig,
  payload: {
    step: number;
    fieldKey?: string;
    context: unknown;
    lockedFields: string[];
  },
  signal?: AbortSignal,
) =>
  creationIdeasResultSchema.parse(
    await request<unknown>(
      { action: "creation-ideas", config, ...payload },
      signal,
    ),
  );

export const generateWorldBookDraft = async (
  config: AIConfig,
  input: unknown,
  signal?: AbortSignal,
): Promise<GeneratedWorldBookDraft> =>
  generatedWorldBookDraftSchema.parse(
    await request<unknown>(
      { action: "worldbook-generate", config, input },
      signal,
    ),
  );

export const assistWorldBookEntry = async (
  config: AIConfig,
  input: unknown,
  signal?: AbortSignal,
): Promise<GeneratedWorldBookDraft> =>
  generatedWorldBookDraftSchema.parse(
    await request<unknown>(
      { action: "worldbook-entry", config, input },
      signal,
    ),
  );
export const playTurn = (
  config: AIConfig,
  project: GameProject,
  save: GameSave,
  actionText: string,
  regenerate = false,
  worldBookContext?: WorldBookTurnContext,
) =>
  request<GameTurnResponse>({
    action: "turn",
    config,
    project,
    save: { ...save, history: [] },
    actionText,
    regenerate,
    worldBookContext,
  });
