import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import type {
  GameProject,
  GenerationDraft,
  ProjectSettingsSnapshot,
} from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const [{ saveEditorProject }, { emptyProject }, settingsVersion, summary] =
  await Promise.all([
    import("./editor-project-save.ts"),
    import("./project.ts"),
    import("./settings-version.ts"),
    import("./project-integrity-summary.ts"),
  ]);

const {
  createSettingsVersion,
  ensureSettingsVersions,
  settingsSnapshot,
} = settingsVersion;
const { formatProjectIntegrityFailure } = summary;

const draft: GenerationDraft = {
  title: "Editor save fixture",
  idea: "Local editor persistence boundary",
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
  project.id = "editor-project";
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
  return ensureSettingsVersions(project);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

let checks = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  await run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

await check("a deeply frozen legal final project is saved once unchanged", async () => {
  const project = deepFreeze(fixture());
  const before = structuredClone(project);
  const saved: GameProject[] = [];

  const result = await saveEditorProject({
    project,
    async saveProject(nextProject) {
      saved.push(nextProject);
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(saved, [project]);
  assert.equal(saved[0], project);
  assert.deepEqual(project, before);
});

await check("duplicate entity IDs block persistence without mutation", async () => {
  const project = fixture();
  project.world.locations[1].id = "station";
  const before = structuredClone(project);
  let writes = 0;

  const result = await saveEditorProject({
    project,
    saveProject() {
      writes += 1;
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected integrity failure");
  assert.equal(result.reason, "integrity");
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "duplicate_entity_id" &&
        issue.path === "world.locations[1].id",
    ),
  );
  assert.equal(writes, 0);
  assert.deepEqual(project, before);
});

await check("dangling references report an exact path and block persistence", async () => {
  const project = deepFreeze({
    ...fixture(),
    world: {
      ...fixture().world,
      locations: fixture().world.locations.map((location, index) =>
        index === 0
          ? { ...location, connections: ["missing-location"] }
          : location,
      ),
    },
  });
  let writes = 0;

  const result = await saveEditorProject({
    project,
    saveProject() {
      writes += 1;
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected integrity failure");
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "dangling_reference" &&
        issue.path === "world.locations[0].connections[0]" &&
        issue.relatedId === "missing-location",
    ),
  );
  assert.equal(writes, 0);
});

await check("storage errors propagate unchanged after one write attempt", async () => {
  const project = fixture();
  const before = structuredClone(project);
  const storageError = new Error("storage unavailable");
  let writes = 0;

  await assert.rejects(
    saveEditorProject({
      project,
      saveProject(nextProject) {
        writes += 1;
        assert.equal(nextProject, project);
        throw storageError;
      },
    }),
    (error) => error === storageError,
  );

  assert.equal(writes, 1);
  assert.deepEqual(project, before);
});

await check("the final object with a new settings version is checked", async () => {
  const current = fixture();
  const settings = settingsSnapshot(current) as ProjectSettingsSnapshot;
  settings.projectInfo = {
    ...settings.projectInfo,
    description: "Changed in the editor",
  };
  const nextProject = createSettingsVersion(
    current,
    settings,
    2,
    "Editor update",
  );
  const saved: GameProject[] = [];

  const success = await saveEditorProject({
    project: nextProject,
    saveProject(project) {
      saved.push(project);
    },
  });
  assert.deepEqual(success, { ok: true });
  assert.deepEqual(saved, [nextProject]);

  const wrongCurrent = deepFreeze({
    ...nextProject,
    currentSettingsVersionId: "missing-settings-version",
  });
  const wrongProjectId = deepFreeze({
    ...nextProject,
    settingsVersions: nextProject.settingsVersions?.map((version, index) =>
      index === (nextProject.settingsVersions?.length ?? 0) - 1
        ? { ...version, projectId: "other-project" }
        : version,
    ),
  });

  for (const [project, path] of [
    [wrongCurrent, "currentSettingsVersionId"],
    [
      wrongProjectId,
      `settingsVersions[${(wrongProjectId.settingsVersions?.length ?? 1) - 1}].projectId`,
    ],
  ] as const) {
    let writes = 0;
    const result = await saveEditorProject({
      project,
      saveProject() {
        writes += 1;
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected settings version integrity failure");
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "dangling_reference" && issue.path === path,
      ),
    );
    assert.equal(writes, 0);
  }
});

await check("multiple issues stay bounded and do not expose project content", async () => {
  const project = fixture();
  project.projectInfo.title = "SECRET PROJECT TITLE";
  project.prompts.gameMasterPrompt = "SECRET SYSTEM PROMPT";
  project.openingScene = "SECRET OPENING";
  project.world.locations.push(
    structuredClone(project.world.locations[0]),
    structuredClone(project.world.locations[0]),
    structuredClone(project.world.locations[0]),
    structuredClone(project.world.locations[0]),
  );
  const before = structuredClone(project);

  const result = await saveEditorProject({
    project: deepFreeze(project),
    saveProject() {
      assert.fail("invalid project must not be persisted");
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected integrity failure");
  const message = formatProjectIntegrityFailure(result.issues);
  assert.match(message, /duplicate_entity_id/);
  assert.match(message, /world\.locations/);
  assert.match(message, /另有/);
  assert.equal(message.includes(project.projectInfo.title), false);
  assert.equal(message.includes(project.prompts.gameMasterPrompt), false);
  assert.equal(message.includes(project.openingScene), false);
  assert.deepEqual(project, before);
});

await check("editor loading normalizes only in memory without persistence", async () => {
  const page = await readFile(
    new URL("../app/editor/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const loadEffect = page.match(
    /useEffect\(\(\) => \{[\s\S]*?\n  \}, \[id\]\);/,
  )?.[0];

  assert.ok(loadEffect, "expected the editor loading effect");
  assert.match(
    loadEffect,
    /const normalized = ensureSettingsVersions\(withLength\);[\s\S]*setP\(normalized\);[\s\S]*setValue\(structuredClone\(normalized\.projectInfo\)\);[\s\S]*setText\(JSON\.stringify\(normalized\.projectInfo, null, 2\)\)/,
  );
  assert.doesNotMatch(loadEffect, /db\.projects\.(?:put|add)/);
  assert.doesNotMatch(loadEffect, /void\s+db\.projects/);
});

await check("all active editor persistence paths use the save gate", async () => {
  const page = await readFile(
    new URL("../app/editor/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /const result = await saveEditorProject\(\{[\s\S]*project: next,[\s\S]*saveProject: \(project\) => db\.projects\.put\(project\),[\s\S]*if \(!result\.ok\) \{[\s\S]*return false;[\s\S]*setP\(next\)/,
  );
  assert.match(
    page,
    /const saved = await commitSettings\([\s\S]*if \(!saved\) return;[\s\S]*setVersionsOpen\(false\)/,
  );
  assert.match(
    page,
    /const duplicate = ensureSettingsVersions\(raw\);[\s\S]*saveEditorProject\(\{[\s\S]*project: duplicate,[\s\S]*saveProject: \(project\) => db\.projects\.put\(project\),[\s\S]*if \(!result\.ok\)[\s\S]*toast\.success\("已复制为新项目/,
  );
  assert.equal(page.match(/db\.projects\.put/g)?.length, 2);
  assert.doesNotMatch(page, /db\.projects\.add/);
  assert.doesNotMatch(page, /void\s+db\.projects/);
});

console.log(`editor project save tests passed (${checks} checks)`);
