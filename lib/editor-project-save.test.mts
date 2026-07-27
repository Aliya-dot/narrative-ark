import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import type {
  EditorProjectRecordStore,
  EditorProjectStorage,
} from "./editor-project-save.ts";
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

const [
  {
    formatEditorProjectSaveFailure,
    saveEditorProject,
  },
  { emptyProject },
  {
    createSettingsVersion,
    ensureSettingsVersions,
    settingsSnapshot,
  },
] = await Promise.all([
  import("./editor-project-save.ts"),
  import("./project.ts"),
  import("./settings-version.ts"),
]);

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

function fixture(id = "editor-project"): GameProject {
  const project = emptyProject(draft);
  project.id = id;
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

function candidate(
  current: GameProject,
  description: string,
): GameProject {
  const settings = settingsSnapshot(current) as ProjectSettingsSnapshot;
  settings.projectInfo = {
    ...settings.projectInfo,
    description,
  };
  return createSettingsVersion(current, settings, 0, description);
}

class MemoryProjectStorage
  implements EditorProjectStorage, EditorProjectRecordStore
{
  projects = new Map<string, unknown>();
  events: string[] = [];
  failPut = false;
  failBeforeCommit = false;

  async get(id: string) {
    this.events.push(`get:${id}`);
    return this.projects.get(id);
  }

  async put(project: GameProject) {
    this.events.push(`put:${project.id}`);
    if (this.failPut) throw new Error("fixture put failure");
    this.projects.set(project.id, structuredClone(project));
  }

  async transaction<T>(
    operation: (records: EditorProjectRecordStore) => Promise<T>,
  ): Promise<T> {
    this.events.push("transaction:start");
    const before = structuredClone(this.projects);
    try {
      const result = await operation(this);
      if (this.failBeforeCommit) {
        throw new Error("fixture completion failure");
      }
      this.events.push("transaction:commit");
      return result;
    } catch (error) {
      this.projects = before;
      this.events.push("transaction:rollback");
      throw error;
    }
  }
}

function snapshot(storage: MemoryProjectStorage) {
  return structuredClone(storage.projects);
}

// 1. A legal N -> N+1 save commits the validated record and leaves other
// projects untouched.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  const other = fixture("other-project");
  storage.projects.set(current.id, structuredClone(current));
  storage.projects.set(other.id, structuredClone(other));
  const otherBefore = structuredClone(other);
  const next = candidate(current, "first committed edit");

  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: next,
    storage,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.version, current.version + 1);
    assert.equal(result.value.settingsVersions?.length, 2);
    assert.deepEqual(storage.projects.get(current.id), result.value);
  }
  assert.deepEqual(storage.projects.get(other.id), otherBefore);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${current.id}`,
    `put:${current.id}`,
    "transaction:commit",
  ]);
}

// 2. Two pages based on N cannot become last-writer-wins. The stale second
// save performs no put and cannot erase the first page's new settings version.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  storage.projects.set(current.id, structuredClone(current));
  const first = candidate(current, "first page");
  const stale = candidate(current, "stale page");

  const firstResult = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: first,
    storage,
  });
  assert.equal(firstResult.ok, true);
  const afterFirst = snapshot(storage);
  storage.events = [];

  const staleResult = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: stale,
    storage,
  });
  assert.deepEqual(staleResult, { ok: false, code: "project_conflict" });
  assert.deepEqual(storage.projects, afterFirst);
  assert.equal(
    (storage.projects.get(current.id) as GameProject).projectInfo.description,
    "first page",
  );
  assert.equal(
    (storage.projects.get(current.id) as GameProject).settingsVersions?.at(-1)
      ?.note,
    "first page",
  );
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${current.id}`,
    "transaction:commit",
  ]);
}

// 3. Missing, fractional, negative, non-finite, and stale revision tokens all
// fail without put or mutation.
for (const expectedVersion of [undefined, 1.5, -1, Number.NaN] as const) {
  const storage = new MemoryProjectStorage();
  const current = fixture();
  storage.projects.set(current.id, structuredClone(current));
  const before = snapshot(storage);
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: expectedVersion as number,
    project: candidate(current, "invalid token"),
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "project_conflict" });
  assert.deepEqual(storage.projects, before);
  assert.equal(storage.events.some((event) => event.startsWith("put:")), false);
}
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  storage.projects.set(current.id, structuredClone(current));
  const next = candidate(current, "stale token");
  next.version = current.version + 2;
  const before = snapshot(storage);
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version + 1,
    project: next,
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "project_conflict" });
  assert.deepEqual(storage.projects, before);
  assert.equal(storage.events.some((event) => event.startsWith("put:")), false);
}

// 4. JSON-valid but schema-invalid data is rejected with a field path before
// entering storage.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  storage.projects.set(current.id, structuredClone(current));
  const invalid = {
    ...candidate(current, "schema invalid"),
    projectInfo: {
      ...current.projectInfo,
      title: 42,
    },
  };
  const before = snapshot(storage);
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: invalid,
    storage,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "project_schema_invalid");
    if (result.code === "project_schema_invalid") {
      assert.equal(result.issues[0]?.pathText, "projectInfo.title");
    }
  }
  assert.deepEqual(storage.projects, before);
  assert.deepEqual(storage.events, []);
}

// 5. Schema-valid integrity failures remain distinct and zero-write.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  storage.projects.set(current.id, structuredClone(current));
  const invalid = candidate(current, "integrity invalid");
  invalid.world.locations[1].id = invalid.world.locations[0].id;
  const before = snapshot(storage);
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: invalid,
    storage,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "project_integrity_failed");
  assert.deepEqual(storage.projects, before);
  assert.deepEqual(storage.events, []);
}

// 6. Candidate/route mismatch is rejected before reading either project.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  const other = fixture("other-project");
  storage.projects.set(current.id, structuredClone(current));
  storage.projects.set(other.id, structuredClone(other));
  const before = snapshot(storage);
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: candidate(other, "wrong owner"),
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "project_id_mismatch" });
  assert.deepEqual(storage.projects, before);
  assert.deepEqual(storage.events, []);
}

// 7. Missing projects are not recreated through put.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: candidate(current, "missing"),
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "project_not_found" });
  assert.equal(storage.projects.size, 0);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${current.id}`,
    "transaction:commit",
  ]);
}

// 8. A deterministic final put failure returns storage failure and preserves
// version, pointer, and history.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  storage.projects.set(current.id, structuredClone(current));
  const before = snapshot(storage);
  storage.failPut = true;
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: candidate(current, "put failure"),
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "project_storage_failed" });
  assert.deepEqual(storage.projects, before);
  assert.equal(storage.events.at(-1), "transaction:rollback");
}

// 9. A failure after put but before commit rolls the complete project back.
{
  const storage = new MemoryProjectStorage();
  const current = fixture();
  storage.projects.set(current.id, structuredClone(current));
  const before = snapshot(storage);
  storage.failBeforeCommit = true;
  const result = await saveEditorProject({
    routeProjectId: current.id,
    expectedVersion: current.version,
    project: candidate(current, "commit failure"),
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "project_storage_failed" });
  assert.deepEqual(storage.projects, before);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${current.id}`,
    `put:${current.id}`,
    "transaction:rollback",
  ]);
}

// 10-11. Production source awaits the safe boundary, supplies the persisted
// baseline, commits only result.value, and formats conflict without retrying.
{
  const page = await readFile(
    new URL("../app/editor/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const commitStart = page.indexOf("async function commitSettings(");
  const saveStart = page.indexOf("async function save()", commitStart);
  const commitSource = page.slice(commitStart, saveStart);
  assert.match(commitSource, /expectedVersion: p\.version/);
  assert.match(commitSource, /storage: editorProjectStorage/);
  assert.match(commitSource, /const result = await saveEditorProject\(\{/);
  assert.ok(
    commitSource.indexOf("if (!result.ok)") <
      commitSource.indexOf("setP(saved)"),
  );
  assert.match(commitSource, /const saved = result\.value;[\s\S]*setP\(saved\)/);
  assert.doesNotMatch(commitSource, /setP\(next\)/);
  assert.doesNotMatch(commitSource, /db\.projects\.(?:put|update)/);
  assert.doesNotMatch(commitSource, /project_conflict[\s\S]*saveEditorProject/);
  assert.match(commitSource, /formatEditorProjectSaveFailure\(result\)/);
  assert.match(
    formatEditorProjectSaveFailure({
      ok: false,
      code: "project_conflict",
    }),
    /其他页面更新/,
  );
}

console.log("editor project save tests passed");
