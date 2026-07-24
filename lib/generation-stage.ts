import { z } from "zod";
import {
  gameCharacterSchema,
  gameProjectSchema,
  projectGameSystemSchema,
  projectInfoSchema,
  projectPlayerSchema,
  projectPromptsSchema,
  projectStorySchema,
  projectWorldSchema,
} from "./data-schemas";
import type { GameProject } from "./types";

export const generationStages = [
  "analysis",
  "world",
  "characters",
  "system",
  "story",
  "prompts",
  "consistency",
  "opening",
] as const;

export type GenerationStage = (typeof generationStages)[number];

const analysisProjectInfoSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  tone: z.string(),
  creationMode: z.enum(["simple", "advanced"]),
  freedomMode: z.enum(["linear", "hybrid", "open"]),
  gameLength: z.enum(["short", "standard", "long", "endless"]),
});

export const analysisStageResultSchema = z.strictObject({
  projectInfo: analysisProjectInfoSchema,
});

export const worldStageResultSchema = z.strictObject({
  world: projectWorldSchema,
});

export const charactersStageResultSchema = z.strictObject({
  player: projectPlayerSchema,
  characters: z.array(gameCharacterSchema),
});

export const systemStageResultSchema = z.strictObject({
  gameSystem: projectGameSystemSchema,
});

export const storyStageResultSchema = z.strictObject({
  story: projectStorySchema,
});

export const promptsStageResultSchema = z.strictObject({
  prompts: projectPromptsSchema,
});

export const consistencyStageResultSchema = z
  .strictObject({
    projectInfo: projectInfoSchema.optional(),
    world: projectWorldSchema.optional(),
    player: projectPlayerSchema.optional(),
    characters: z.array(gameCharacterSchema).optional(),
    gameSystem: projectGameSystemSchema.optional(),
    story: projectStorySchema.optional(),
    prompts: projectPromptsSchema.optional(),
    openingScene: z.string().optional(),
  })
  .refine((result) => Object.keys(result).length <= 3, {
    message: "Consistency stage may replace at most three modules.",
  });

export const openingStageResultSchema = z.strictObject({
  openingScene: z.string(),
});

export const generationStageResultSchemas = {
  analysis: analysisStageResultSchema,
  world: worldStageResultSchema,
  characters: charactersStageResultSchema,
  system: systemStageResultSchema,
  story: storyStageResultSchema,
  prompts: promptsStageResultSchema,
  consistency: consistencyStageResultSchema,
  opening: openingStageResultSchema,
} as const;

type GenerationStageSchema = (typeof generationStageResultSchemas)[GenerationStage];

export type GenerationStageResult<S extends GenerationStage> = z.output<
  (typeof generationStageResultSchemas)[S]
>;

export interface GenerationStageIssue {
  code: string;
  path: Array<string | number>;
  pathText: string;
  message: string;
}

export type GenerationStageApplyResult =
  | {
      success: true;
      stage: GenerationStage;
      project: GameProject;
      changed: boolean;
      warnings: string[];
    }
  | {
      success: false;
      code:
        | "invalid_source_project"
        | "invalid_stage_result"
        | "invalid_final_project";
      stage: GenerationStage;
      operation:
        | "validate_source_project"
        | "validate_stage_result"
        | "validate_final_project";
      path: Array<string | number>;
      pathText: string;
      message: string;
      recoverable: boolean;
      issues: GenerationStageIssue[];
    };

function pathText(path: Array<string | number>): string {
  return path.length === 0
    ? "$"
    : path
        .map((part, index) =>
          typeof part === "number"
            ? `[${part}]`
            : `${index === 0 ? "" : "."}${part}`,
        )
        .join("");
}

function issueMessage(code: string): string {
  switch (code) {
    case "invalid_type":
      return "Field has an invalid type or is missing.";
    case "invalid_value":
      return "Field has a value outside the allowed set.";
    case "unrecognized_keys":
      return "Field is not allowed by this stage.";
    case "custom":
      return "Stage-specific constraint was not satisfied.";
    default:
      return "Field failed validation.";
  }
}

function validationIssues(error: z.ZodError): GenerationStageIssue[] {
  return error.issues.flatMap((issue) => {
    const basePath = issue.path.filter(
      (part): part is string | number =>
        typeof part === "string" || typeof part === "number",
    );
    const keys =
      issue.code === "unrecognized_keys" && issue.keys.length > 0
        ? issue.keys
        : [undefined];
    return keys.map((key) => {
      const path = key === undefined ? basePath : [...basePath, key];
      return {
        code: issue.code,
        path,
        pathText: pathText(path),
        message: issueMessage(issue.code),
      };
    });
  });
}

function failure(
  stage: GenerationStage,
  code: Extract<GenerationStageApplyResult, { success: false }>["code"],
  operation: Extract<
    GenerationStageApplyResult,
    { success: false }
  >["operation"],
  error: z.ZodError,
): GenerationStageApplyResult {
  const issues = validationIssues(error);
  const first = issues[0] ?? {
    code: "unknown",
    path: [],
    pathText: "$",
    message: "Validation failed.",
  };
  return {
    success: false,
    code,
    stage,
    operation,
    path: first.path,
    pathText: first.pathText,
    message: `${operation} failed at ${first.pathText}.`,
    recoverable: code !== "invalid_source_project",
    issues,
  };
}

function parseStageResult(
  stage: GenerationStage,
  input: unknown,
):
  | { success: true; data: z.output<GenerationStageSchema> }
  | { success: false; error: z.ZodError } {
  const result = generationStageResultSchemas[stage].safeParse(input);
  if (!result.success) return result;
  return { success: true, data: result.data };
}

function applyValidatedStageResult(
  project: GameProject,
  stage: GenerationStage,
  result: z.output<GenerationStageSchema>,
): GameProject {
  const next = structuredClone(project);

  switch (stage) {
    case "analysis": {
      const value = analysisStageResultSchema.parse(result).projectInfo;
      next.projectInfo.title = value.title;
      next.projectInfo.description = value.description;
      next.projectInfo.genre = value.genre;
      next.projectInfo.tone = value.tone;
      next.projectInfo.creationMode = value.creationMode;
      next.projectInfo.freedomMode = value.freedomMode;
      next.projectInfo.gameLength = value.gameLength;
      break;
    }
    case "world":
      next.world = worldStageResultSchema.parse(result).world;
      break;
    case "characters": {
      const value = charactersStageResultSchema.parse(result);
      next.player = value.player;
      next.characters = value.characters;
      break;
    }
    case "system":
      next.gameSystem = systemStageResultSchema.parse(result).gameSystem;
      break;
    case "story":
      next.story = storyStageResultSchema.parse(result).story;
      break;
    case "prompts":
      next.prompts = promptsStageResultSchema.parse(result).prompts;
      break;
    case "consistency": {
      const value = consistencyStageResultSchema.parse(result);
      if (value.projectInfo !== undefined)
        next.projectInfo = value.projectInfo;
      if (value.world !== undefined) next.world = value.world;
      if (value.player !== undefined) next.player = value.player;
      if (value.characters !== undefined) next.characters = value.characters;
      if (value.gameSystem !== undefined) next.gameSystem = value.gameSystem;
      if (value.story !== undefined) next.story = value.story;
      if (value.prompts !== undefined) next.prompts = value.prompts;
      if (value.openingScene !== undefined)
        next.openingScene = value.openingScene;
      break;
    }
    case "opening":
      next.openingScene = openingStageResultSchema.parse(result).openingScene;
      break;
  }

  return next;
}

export function applyGenerationStageResult(
  project: GameProject,
  stage: GenerationStage,
  input: unknown,
): GenerationStageApplyResult {
  const sourceResult = gameProjectSchema.safeParse(project);
  if (!sourceResult.success) {
    return failure(
      stage,
      "invalid_source_project",
      "validate_source_project",
      sourceResult.error,
    );
  }

  const stageResult = parseStageResult(stage, input);
  if (!stageResult.success) {
    return failure(
      stage,
      "invalid_stage_result",
      "validate_stage_result",
      stageResult.error,
    );
  }

  const candidate = applyValidatedStageResult(
    sourceResult.data,
    stage,
    stageResult.data,
  );
  const finalResult = gameProjectSchema.safeParse(candidate);
  if (!finalResult.success) {
    return failure(
      stage,
      "invalid_final_project",
      "validate_final_project",
      finalResult.error,
    );
  }

  return {
    success: true,
    stage,
    project: finalResult.data,
    changed: JSON.stringify(finalResult.data) !== JSON.stringify(project),
    warnings: [],
  };
}
