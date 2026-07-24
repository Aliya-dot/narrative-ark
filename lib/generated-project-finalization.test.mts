import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import type { GenerationDraft, GameProject } from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const [
  { emptyProject },
  {
    GeneratedProjectDraftCleanupError,
    finalizeGeneratedProject,
    formatProjectIntegrityFailure,
  },
  { validateProjectIntegrity },
] = await Promise.all([
  import("./project.ts"),
  import("./generated-project-finalization.ts"),
  import("./project-integrity.ts"),
]);

const draft: GenerationDraft = {
  title: "Finalization fixture",
  idea: "Local persistence boundary fixture",
  genre: "mystery",
  protagonist: "investigator",
  tone: "measured",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "advanced",
};

function fixture(): GameProject {
  const project = emptyProject(draft);
  project.id = "project-finalization";
  project.createdAt = "2026-01-01T00:00:00.000Z";
  project.updatedAt = project.createdAt;
  project.world.locations = [
    {
      id: "station",
      name: "Station",
      description: "Start",
      connections: ["archive"],
    },
    {
      id: "archive",
      name: "Archive",
      description: "Destination",
      connections: ["station"],
    },
  ];
  return project;
}

let checks = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  await run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

await check(
  "legal projects save the latest draft, validate, save, then delete",
  async () => {
    const events: string[] = [];
    const project = fixture();
    const projectId = project.id;
    Object.defineProperty(project, "id", {
      configurable: true,
      enumerable: true,
      get() {
        events.push("validateProjectIntegrity");
        return projectId;
      },
    });

    const result = await finalizeGeneratedProject({
      project,
      async saveLatestDraft() {
        events.push("saveLatestDraft");
      },
      async saveProject(savedProject) {
        assert.equal(savedProject, project);
        events.push("saveProject");
      },
      async deleteDraft() {
        events.push("deleteDraft");
      },
    });

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(events, [
      "saveLatestDraft",
      "validateProjectIntegrity",
      "saveProject",
      "deleteDraft",
    ]);
  },
);

await check(
  "invalid projects preserve the latest draft and never persist or delete",
  async () => {
    const project = fixture();
    project.world.locations[0].connections = ["missing-location"];
    const before = structuredClone(project);
    const events: string[] = [];

    const result = await finalizeGeneratedProject({
      project,
      async saveLatestDraft() {
        events.push("saveLatestDraft");
      },
      async saveProject() {
        events.push("saveProject");
      },
      async deleteDraft() {
        events.push("deleteDraft");
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected an integrity failure");
    assert.deepEqual(result.issues, validateProjectIntegrity(project));
    assert.deepEqual(events, ["saveLatestDraft"]);
    assert.deepEqual(project, before);
  },
);

await check("latest draft failures stop finalization unchanged", async () => {
  const project = fixture();
  const failure = new Error("draft storage failed");
  const events: string[] = [];

  await assert.rejects(
    finalizeGeneratedProject({
      project,
      async saveLatestDraft() {
        events.push("saveLatestDraft");
        throw failure;
      },
      async saveProject() {
        events.push("saveProject");
      },
      async deleteDraft() {
        events.push("deleteDraft");
      },
    }),
    (error) => error === failure,
  );
  assert.deepEqual(events, ["saveLatestDraft"]);
});

await check("project write failures retain the saved draft", async () => {
  const project = fixture();
  const failure = new Error("project storage failed");
  const events: string[] = [];

  await assert.rejects(
    finalizeGeneratedProject({
      project,
      async saveLatestDraft() {
        events.push("saveLatestDraft");
      },
      async saveProject() {
        events.push("saveProject");
        throw failure;
      },
      async deleteDraft() {
        events.push("deleteDraft");
      },
    }),
    (error) => error === failure,
  );
  assert.deepEqual(events, ["saveLatestDraft", "saveProject"]);
});

await check(
  "draft deletion failures report that the project is already saved",
  async () => {
    const project = fixture();
    const failure = new Error("draft deletion failed");
    const events: string[] = [];
    const savedProjects: GameProject[] = [];

    await assert.rejects(
      finalizeGeneratedProject({
        project,
        async saveLatestDraft() {
          events.push("saveLatestDraft");
        },
        async saveProject(savedProject) {
          events.push("saveProject");
          savedProjects.push(savedProject);
        },
        async deleteDraft() {
          events.push("deleteDraft");
          throw failure;
        },
      }),
      (error) => {
        assert.ok(error instanceof GeneratedProjectDraftCleanupError);
        assert.equal(error.projectSaved, true);
        assert.equal(error.cause, failure);
        assert.match(error.message, /项目已保存/);
        return true;
      },
    );

    assert.deepEqual(events, [
      "saveLatestDraft",
      "saveProject",
      "deleteDraft",
    ]);
    assert.deepEqual(savedProjects, [project]);
  },
);

await check("integrity summaries expose only bounded issue metadata", async () => {
  const project = fixture();
  project.projectInfo.title = "SECRET PROJECT TITLE";
  project.prompts.gameMasterPrompt = "SECRET SYSTEM PROMPT";
  project.openingScene = "SECRET OPENING";
  project.world.locations[0].connections = ["missing-location"];
  const issues = validateProjectIntegrity(project);

  const message = formatProjectIntegrityFailure(issues);
  assert.match(message, /dangling_reference/);
  assert.match(message, /world\.locations\[0\]\.connections\[0\]/);
  assert.match(message, /relatedId="missing-location"/);
  assert.equal(message.includes(project.projectInfo.title), false);
  assert.equal(message.includes(project.prompts.gameMasterPrompt), false);
  assert.equal(message.includes(project.openingScene), false);
});

await check(
  "the generation page routes its only final project put through the boundary",
  async () => {
    const page = await readFile(
      new URL("../app/generate/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(
      page,
      /import \{[\s\S]*finalizeGeneratedProject[\s\S]*\} from "@\/lib\/generated-project-finalization";/,
    );
    assert.equal(page.match(/db\.projects\.put/g)?.length, 1);
    assert.doesNotMatch(page, /await\s+db\.projects\.put/);
    assert.match(
      page,
      /finalizeGeneratedProject\(\{[\s\S]*saveLatestDraft:[\s\S]*saveProject:[\s\S]*db\.projects\.put\(project\)[\s\S]*deleteDraft:[\s\S]*db\.drafts\.delete\(id\)/,
    );
  },
);

console.log(`generated project finalization tests passed (${checks} checks)`);
