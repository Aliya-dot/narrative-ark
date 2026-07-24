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

const generationStageSet: ReadonlySet<string> = new Set(generationStages);

export function isGenerationStage(stage: unknown): stage is GenerationStage {
  return typeof stage === "string" && generationStageSet.has(stage);
}

const generatedProjectInfoFieldSelection = {
  title: true,
  description: true,
  genre: true,
  tone: true,
  creationMode: true,
  freedomMode: true,
  gameLength: true,
} as const;

const generatedProjectInfoPatchSchema = projectInfoSchema
  .pick(generatedProjectInfoFieldSelection)
  .partial()
  .superRefine((patch, context) => {
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Present patch fields must have a defined value.",
        });
      }
    }
  });

export const analysisStageResultSchema = z.strictObject({
  projectInfo: generatedProjectInfoPatchSchema,
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

// These are the top-level fields owned by the eight real generation stages.
// Project metadata, settings history, and world-book bindings are excluded.
export const generationOwnedProjectFields = [
  "projectInfo",
  "world",
  "player",
  "characters",
  "gameSystem",
  "story",
  "prompts",
  "openingScene",
] as const satisfies readonly (keyof GameProject)[];

type GenerationOwnedProjectField =
  (typeof generationOwnedProjectFields)[number];

const generationOwnedProjectFieldSet: ReadonlySet<string> = new Set(
  generationOwnedProjectFields,
);

const consistencyStageFields = {
  projectInfo: generatedProjectInfoPatchSchema.optional(),
  world: projectWorldSchema.optional(),
  player: projectPlayerSchema.optional(),
  characters: z.array(gameCharacterSchema).optional(),
  gameSystem: projectGameSystemSchema.optional(),
  story: projectStorySchema.optional(),
  prompts: projectPromptsSchema.optional(),
  openingScene: z.string().optional(),
} satisfies Record<GenerationOwnedProjectField, z.ZodType>;

export const consistencyStageResultSchema = z
  .strictObject(consistencyStageFields)
  .refine(
    (result) =>
      Object.keys(result).every((field) =>
        generationOwnedProjectFieldSet.has(field),
      ),
    {
      message: "Consistency stage may only replace generation-owned fields.",
    },
  )
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
        | "invalid_stage"
        | "invalid_source_project"
        | "invalid_stage_result"
        | "invalid_final_project";
      stage: GenerationStage | null;
      operation:
        | "validate_stage"
        | "validate_source_project"
        | "validate_stage_result"
        | "validate_final_project";
      path: Array<string | number>;
      pathText: string;
      message: string;
      recoverable: boolean;
      issues: GenerationStageIssue[];
    };

type GenerationStageFailure = Extract<
  GenerationStageApplyResult,
  { success: false }
>;

export type GenerationStageValidationResult =
  | {
      success: true;
      stage: GenerationStage;
      data: GenerationStageResult<GenerationStage>;
      warnings: string[];
    }
  | GenerationStageFailure;

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
): GenerationStageFailure {
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

function invalidStageFailure(): GenerationStageFailure {
  const issue: GenerationStageIssue = {
    code: "invalid_stage",
    path: [],
    pathText: "$",
    message: "Generation stage is not recognized.",
  };
  return {
    success: false,
    code: "invalid_stage",
    stage: null,
    operation: "validate_stage",
    path: issue.path,
    pathText: issue.pathText,
    message: "validate_stage failed at $.",
    recoverable: true,
    issues: [issue],
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
      applyProjectInfoPatch(next.projectInfo, value);
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
        applyProjectInfoPatch(next.projectInfo, value.projectInfo);
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

function applyProjectInfoPatch(
  target: GameProject["projectInfo"],
  patch: z.output<typeof generatedProjectInfoPatchSchema>,
): void {
  if (patch.title !== undefined) target.title = patch.title;
  if (patch.description !== undefined) target.description = patch.description;
  if (patch.genre !== undefined) target.genre = patch.genre;
  if (patch.tone !== undefined) target.tone = patch.tone;
  if (patch.creationMode !== undefined)
    target.creationMode = patch.creationMode;
  if (patch.freedomMode !== undefined) target.freedomMode = patch.freedomMode;
  if (patch.gameLength !== undefined) target.gameLength = patch.gameLength;
}

function jsonDataEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) => jsonDataEqual(value, right[index]))
    );
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        jsonDataEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

export function validateGenerationStageResult(
  stage: unknown,
  input: unknown,
): GenerationStageValidationResult {
  if (!isGenerationStage(stage)) return invalidStageFailure();

  const stageResult = parseStageResult(stage, input);
  if (!stageResult.success) {
    return failure(
      stage,
      "invalid_stage_result",
      "validate_stage_result",
      stageResult.error,
    );
  }

  return {
    success: true,
    stage,
    data: stageResult.data,
    warnings: [],
  };
}

export function applyGenerationStageResult(
  project: GameProject,
  stage: unknown,
  input: unknown,
): GenerationStageApplyResult {
  if (!isGenerationStage(stage)) return invalidStageFailure();

  const sourceResult = gameProjectSchema.safeParse(project);
  if (!sourceResult.success) {
    return failure(
      stage,
      "invalid_source_project",
      "validate_source_project",
      sourceResult.error,
    );
  }

  const stageResult = validateGenerationStageResult(stage, input);
  if (!stageResult.success) return stageResult;

  const candidate = applyValidatedStageResult(
    sourceResult.data,
    stage,
    stageResult.data,
  );
  // With module schemas derived from the final project schema this is normally
  // defensive, but it remains the final boundary for future cross-field rules.
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
    changed: !jsonDataEqual(finalResult.data, project),
    warnings: [],
  };
}
