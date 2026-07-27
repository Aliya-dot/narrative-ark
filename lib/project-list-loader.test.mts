import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import type { GameProject, GenerationDraft } from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const [
  { loadProjectList, prepareProjectList },
  { emptyProject },
  { createSettingsVersion, ensureSettingsVersions, settingsSnapshot },
] = await Promise.all([
  import("./project-list-loader.ts"),
  import("./project.ts"),
  import("./settings-version.ts"),
]);

const draft: GenerationDraft = {
  title: "Project list fixture",
  idea: "A deterministic read-only loading fixture",
  genre: "mystery",
  protagonist: "Investigator",
  tone: "measured",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "advanced",
};

function currentProject(id: string): GameProject {
  const project = emptyProject(draft);
  project.id = id;
  project.createdAt = "2026-01-01T00:00:00.000Z";
  project.updatedAt = "2026-01-02T00:00:00.000Z";
  return ensureSettingsVersions(project);
}

function legacyProject(id: string): Record<string, unknown> {
  const project = structuredClone(currentProject(id)) as unknown as Record<
    string,
    unknown
  >;
  const projectInfo = project.projectInfo as Record<string, unknown>;
  delete projectInfo.gameLength;
  delete projectInfo.storyLength;
  delete project.settingsVersions;
  delete project.currentSettingsVersionId;
  delete project.settingsVersionNumber;
  return project;
}

class ReadOnlyFixtureStore {
  projects = new Map<string, unknown>();
  events: string[] = [];

  async readProjects(): Promise<unknown[]> {
    this.events.push("read");
    return [...this.projects.values()].map((project) =>
      structuredClone(project),
    );
  }

  snapshot() {
    return structuredClone(this.projects);
  }

  editorSave(project: GameProject) {
    this.events.push(`editor-save:${project.id}`);
    this.projects.set(project.id, structuredClone(project));
  }
}

// 1 and 3. A legacy record is made display-ready only in memory. Its stored
// revision, timestamp, and absent settings history remain byte-for-byte alike.
{
  const store = new ReadOnlyFixtureStore();
  const legacy = legacyProject("legacy");
  store.projects.set("legacy", structuredClone(legacy));
  const before = store.snapshot();
  const result = await loadProjectList(() => store.readProjects());

  assert.equal(result.failures.length, 0);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].id, "legacy");
  assert.equal(result.projects[0].version, legacy.version);
  assert.equal(result.projects[0].updatedAt, legacy.updatedAt);
  assert.equal(result.projects[0].settingsVersions?.length, 1);
  assert.ok(result.projects[0].projectInfo.gameLength);
  assert.deepEqual(store.events, ["read"]);
  assert.deepEqual(store.projects, before);
  assert.equal(
    Object.hasOwn(
      store.projects.get("legacy") as Record<string, unknown>,
      "settingsVersions",
    ),
    false,
  );
}

// 2. A prepared N snapshot used by page state after an editor commits N+1 has
// no persistence capability and therefore leaves the editor result untouched.
{
  const store = new ReadOnlyFixtureStore();
  const current = currentProject("race");
  store.projects.set(current.id, structuredClone(current));
  const oldSnapshot = await store.readProjects();
  const listed = prepareProjectList(oldSnapshot);
  const nextSettings = settingsSnapshot(current);
  nextSettings.projectInfo = {
    ...nextSettings.projectInfo,
    description: "new editor content",
  };
  const saved = createSettingsVersion(
    current,
    nextSettings,
    0,
    "editor commit",
  );
  store.editorSave(saved);

  const pageState = listed.projects;
  assert.equal(pageState[0].version, current.version);
  assert.equal(
    (store.projects.get(current.id) as GameProject).version,
    current.version + 1,
  );
  assert.equal(
    (store.projects.get(current.id) as GameProject).projectInfo.description,
    "new editor content",
  );
  assert.equal(
    (store.projects.get(current.id) as GameProject).settingsVersions?.length,
    (current.settingsVersions?.length ?? 0) + 1,
  );
  assert.deepEqual(store.events, ["read", `editor-save:${current.id}`]);
}

// 4. A current project remains displayable and does not acquire a new
// revision, timestamp, or settings version.
{
  const store = new ReadOnlyFixtureStore();
  const current = currentProject("current");
  store.projects.set(current.id, structuredClone(current));
  const before = store.snapshot();
  const result = await loadProjectList(() => store.readProjects());

  assert.deepEqual(result, {
    projects: [current],
    failures: [],
  });
  assert.deepEqual(store.projects, before);
  assert.deepEqual(store.events, ["read"]);
}

// 5. One incompatible record is isolated while its valid neighbour remains.
{
  const store = new ReadOnlyFixtureStore();
  const valid = currentProject("valid");
  const invalid = structuredClone(valid) as unknown as Record<string, unknown>;
  invalid.id = "invalid";
  (invalid.world as Record<string, unknown>).locations = "not-an-array";
  store.projects.set("valid", structuredClone(valid));
  store.projects.set("invalid", structuredClone(invalid));
  const before = store.snapshot();
  const result = await loadProjectList(() => store.readProjects());

  assert.deepEqual(
    result.projects.map((project) => project.id),
    ["valid"],
  );
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].index, 1);
  assert.ok(
    result.failures[0].issues.some(
      (issue) => issue.pathText === "world.locations",
    ),
  );
  assert.deepEqual(store.projects, before);
  assert.deepEqual(store.events, ["read"]);
}

// 6. Mixed current and legacy records preserve readable input order and IDs.
{
  const store = new ReadOnlyFixtureStore();
  const first = legacyProject("first");
  const second = currentProject("second");
  const third = legacyProject("third");
  store.projects.set("first", structuredClone(first));
  store.projects.set("second", structuredClone(second));
  store.projects.set("third", structuredClone(third));
  const before = store.snapshot();
  const result = await loadProjectList(() => store.readProjects());

  assert.deepEqual(
    result.projects.map((project) => project.id),
    ["first", "second", "third"],
  );
  assert.equal(result.failures.length, 0);
  assert.deepEqual(store.projects, before);
  assert.deepEqual(store.events, ["read"]);
}

// 7. The page renders the in-memory result, performs no project update during
// load, emits no save success, and project cards navigate by project ID.
{
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const card = await readFile(
    new URL("../components/project-card.tsx", import.meta.url),
    "utf8",
  );
  const loader = await readFile(
    new URL("./project-list-loader.ts", import.meta.url),
    "utf8",
  );
  const loadStart = page.indexOf("async function load()");
  const effectStart = page.indexOf("useEffect(", loadStart);
  const loadSource = page.slice(loadStart, effectStart);

  assert.match(loadSource, /const result = await loadProjectList\(/);
  assert.match(loadSource, /const ps = result\.projects;[\s\S]*setProjects\(ps\)/);
  assert.doesNotMatch(
    loadSource,
    /db\.projects\.(?:put|update|bulkPut|add)/,
  );
  assert.doesNotMatch(loadSource, /toast\.success/);
  assert.doesNotMatch(loader, /\b(?:put|update|bulkPut|add)\s*\(/);
  assert.match(card, /href=\{`\/editor\/\$\{project\.id\}`\}/);
  assert.match(card, /`\/play\/\$\{project\.id\}/);
}

console.log("project list read-only loading tests passed");
