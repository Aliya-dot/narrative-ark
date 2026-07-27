import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { SAMPLE_PROJECT } from "./sample.ts";
import type {
  ProjectImportPersistence,
  ProjectImportPersistenceResult,
} from "./project-import-persistence.ts";
import type {
  ProjectImportFile,
  ProjectImportWorkflowDependencies,
} from "./project-import-workflow.ts";
import type { GameProject, GameSave } from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createSave } = await import("./project.ts");
const { prepareProjectImport } =
  await import("./project-import-preparation.ts");
const { persistPreparedProjectImport } =
  await import("./project-import-persistence.ts");
const {
  executeProjectImport,
  formatProjectImportFailure,
  MAX_PROJECT_IMPORT_BYTES,
} = await import("./project-import-workflow.ts");

function projectFixture(): GameProject {
  return structuredClone(SAMPLE_PROJECT);
}

function saveFixture(project: GameProject): GameSave {
  const save = createSave(project);
  save.id = "save-atomic-import";
  save.projectId = project.id;
  return save;
}

function bundleFixture() {
  const project = projectFixture();
  return {
    format: "narrative-ark-game",
    version: 2,
    exportedAt: "2026-01-01T00:00:00.000Z",
    project,
    save: saveFixture(project),
  };
}

function jsonFile(input: unknown): ProjectImportFile {
  const text = JSON.stringify(input);
  return {
    size: Buffer.byteLength(text),
    async text() {
      return text;
    },
  };
}

function constraintError(): Error {
  const error = new Error("duplicate fixture");
  error.name = "ConstraintError";
  return error;
}

class MemoryPersistence implements ProjectImportPersistence {
  projects = new Map<string, GameProject>();
  saves = new Map<string, GameSave>();
  events: string[] = [];
  failProject = false;
  failSave = false;
  failBeforeCommit = false;

  async getProject(id: string): Promise<GameProject | undefined> {
    this.events.push(`project:get:${id}`);
    return this.projects.get(id);
  }

  async getSave(id: string): Promise<GameSave | undefined> {
    this.events.push(`save:get:${id}`);
    return this.saves.get(id);
  }

  async addProject(project: GameProject): Promise<void> {
    this.events.push(`project:add:${project.id}`);
    if (this.failProject) throw new Error("project write fixture failure");
    if (this.projects.has(project.id)) throw constraintError();
    this.projects.set(project.id, structuredClone(project));
  }

  async addSave(save: GameSave): Promise<void> {
    this.events.push(`save:add:${save.id}`);
    if (this.failSave) throw new Error("save write fixture failure");
    if (this.saves.has(save.id)) throw constraintError();
    this.saves.set(save.id, structuredClone(save));
  }

  async runProjectSaveTransaction<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    this.events.push("transaction:start");
    const projectsBefore = structuredClone(this.projects);
    const savesBefore = structuredClone(this.saves);
    try {
      const result = await operation();
      if (this.failBeforeCommit) {
        throw new Error("transaction completion fixture failure");
      }
      this.events.push("transaction:commit");
      return result;
    } catch (error) {
      this.projects = projectsBefore;
      this.saves = savesBefore;
      this.events.push("transaction:rollback");
      throw error;
    }
  }
}

function seedExistingData(persistence: MemoryPersistence) {
  const project = projectFixture();
  project.id = "existing-project";
  const save = saveFixture(project);
  save.id = "existing-save";
  persistence.projects.set(project.id, structuredClone(project));
  persistence.saves.set(save.id, structuredClone(save));
}

function databaseSnapshot(persistence: MemoryPersistence) {
  return {
    projects: structuredClone(persistence.projects),
    saves: structuredClone(persistence.saves),
  };
}

function assertDatabaseSnapshot(
  persistence: MemoryPersistence,
  snapshot: ReturnType<typeof databaseSnapshot>,
) {
  assert.deepEqual(persistence.projects, snapshot.projects);
  assert.deepEqual(persistence.saves, snapshot.saves);
}

function workflowDependencies(
  persistence: MemoryPersistence,
  beforePersist?: () => void,
): ProjectImportWorkflowDependencies {
  return {
    async readExistingProjectIds() {
      return new Set(persistence.projects.keys());
    },
    async readExistingSaveIds() {
      return new Set(persistence.saves.keys());
    },
    async persist(prepared): Promise<ProjectImportPersistenceResult> {
      beforePersist?.();
      return persistPreparedProjectImport(prepared, persistence);
    },
  };
}

// 1. A bare project uses the non-overwriting project add path.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  const project = projectFixture();
  const callbacks: string[] = [];
  const result = await executeProjectImport(
    jsonFile(project),
    () => callbacks.push("committed"),
    workflowDependencies(persistence),
  );
  assert.deepEqual(result, { ok: true, kind: "project" });
  assert.deepEqual(persistence.events, [
    "transaction:start",
    `project:get:${project.id}`,
    `project:add:${project.id}`,
    "transaction:commit",
  ]);
  assert.deepEqual(callbacks, ["committed"]);
  assert.deepEqual(persistence.projects.get(project.id), project);
  assert.deepEqual(persistence.saves, before.saves);
  assert.deepEqual(
    persistence.projects.get("existing-project"),
    before.projects.get("existing-project"),
  );
}

// 2. A game bundle writes both entities inside one transaction.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  const bundle = bundleFixture();
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => undefined,
    workflowDependencies(persistence),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(persistence.events, [
    "transaction:start",
    `project:get:${bundle.project.id}`,
    `save:get:${bundle.save.id}`,
    `project:add:${bundle.project.id}`,
    `save:add:${bundle.save.id}`,
    "transaction:commit",
  ]);
  assert.equal(persistence.projects.has(bundle.project.id), true);
  assert.equal(persistence.saves.has(bundle.save.id), true);
  assert.deepEqual(
    persistence.projects.get("existing-project"),
    before.projects.get("existing-project"),
  );
  assert.deepEqual(
    persistence.saves.get("existing-save"),
    before.saves.get("existing-save"),
  );
}

// 3-5. Every preflight conflict combination produces zero write attempts.
for (const conflictKind of ["project", "save", "both"] as const) {
  const persistence = new MemoryPersistence();
  const bundle = bundleFixture();
  if (conflictKind !== "save") {
    persistence.projects.set(bundle.project.id, projectFixture());
  }
  if (conflictKind !== "project") {
    persistence.saves.set(bundle.save.id, structuredClone(bundle.save));
  }
  const beforeProjects = structuredClone(persistence.projects);
  const beforeSaves = structuredClone(persistence.saves);
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("conflict must not report success"),
    workflowDependencies(persistence),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "import_conflict");
  assert.deepEqual(persistence.events, []);
  assert.deepEqual(persistence.projects, beforeProjects);
  assert.deepEqual(persistence.saves, beforeSaves);
}

// The persistence boundary independently rejects a prepared conflict too.
{
  const persistence = new MemoryPersistence();
  const project = projectFixture();
  const prepared = prepareProjectImport({
    input: project,
    existingProjectIds: new Set([project.id]),
    existingSaveIds: new Set(),
  });
  assert.equal(prepared.ok, true);
  if (prepared.ok) {
    const result = await persistPreparedProjectImport(prepared, persistence);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "import_conflict");
  }
  assert.deepEqual(persistence.events, []);
}

// 6. A project race after preflight is reported and never overwrites.
{
  const persistence = new MemoryPersistence();
  const project = projectFixture();
  const local = { ...projectFixture(), updatedAt: "local-newer-value" };
  const result = await executeProjectImport(
    jsonFile(project),
    () => assert.fail("racing conflict must not report success"),
    workflowDependencies(persistence, () => {
      persistence.projects.set(project.id, local);
    }),
  );
  assert.deepEqual(result, {
    ok: false,
    code: "storage_conflict",
    conflicts: [
      { code: "project_id_conflict", entityId: project.id },
    ],
  });
  assert.deepEqual(persistence.projects.get(project.id), local);
}

// 7. A save race rolls back the game bundle's preceding project add.
{
  const persistence = new MemoryPersistence();
  const bundle = bundleFixture();
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("racing conflict must not report success"),
    workflowDependencies(persistence, () => {
      persistence.saves.set(bundle.save.id, structuredClone(bundle.save));
    }),
  );
  assert.deepEqual(result, {
    ok: false,
    code: "storage_conflict",
    conflicts: [
      { code: "save_id_conflict", entityId: bundle.save.id },
    ],
  });
  assert.equal(persistence.projects.has(bundle.project.id), false);
  assert.equal(persistence.saves.has(bundle.save.id), true);
  assert.equal(persistence.events.at(-1), "transaction:rollback");
}

// 8. An arbitrary save failure also rolls back the project.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  persistence.failSave = true;
  const bundle = bundleFixture();
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("failed transaction must not report success"),
    workflowDependencies(persistence),
  );
  assert.deepEqual(result, { ok: false, code: "storage_failure" });
  assertDatabaseSnapshot(persistence, before);
  assert.equal(persistence.projects.has(bundle.project.id), false);
  assert.equal(persistence.saves.has(bundle.save.id), false);
  assert.equal(persistence.events.at(-1), "transaction:rollback");
}

// 9. A bare project failure does not invoke the committed callback.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  persistence.failProject = true;
  let successCount = 0;
  const result = await executeProjectImport(
    jsonFile(projectFixture()),
    () => {
      successCount += 1;
    },
    workflowDependencies(persistence),
  );
  assert.deepEqual(result, { ok: false, code: "storage_failure" });
  assert.equal(successCount, 0);
  assertDatabaseSnapshot(persistence, before);
  assert.equal(persistence.events.at(-1), "transaction:rollback");
}

// A game bundle project-add failure stops before save add and changes nothing.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  persistence.failProject = true;
  const bundle = bundleFixture();
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("failed project add must not report success"),
    workflowDependencies(persistence),
  );
  assert.deepEqual(result, { ok: false, code: "storage_failure" });
  assertDatabaseSnapshot(persistence, before);
  assert.equal(
    persistence.events.includes(`save:add:${bundle.save.id}`),
    false,
  );
  assert.equal(persistence.events.at(-1), "transaction:rollback");
}

// A failure after both adds but before commit rolls the complete unit back.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  persistence.failBeforeCommit = true;
  const bundle = bundleFixture();
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("uncommitted import must not report success"),
    workflowDependencies(persistence),
  );
  assert.deepEqual(result, { ok: false, code: "storage_failure" });
  assertDatabaseSnapshot(persistence, before);
  assert.deepEqual(persistence.events.slice(-3), [
    `project:add:${bundle.project.id}`,
    `save:add:${bundle.save.id}`,
    "transaction:rollback",
  ]);
}

// 10. Refresh/success work runs only after the transaction commits.
{
  const persistence = new MemoryPersistence();
  const bundle = bundleFixture();
  await executeProjectImport(
    jsonFile(bundle),
    () => {
      persistence.events.push("list:refresh");
      persistence.events.push("toast:success");
    },
    workflowDependencies(persistence),
  );
  assert.deepEqual(persistence.events.slice(-3), [
    "transaction:commit",
    "list:refresh",
    "toast:success",
  ]);
}

// 11. Mismatched save ownership is rejected without correction or writes.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  const bundle = bundleFixture();
  bundle.save.projectId = "different-project";
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("invalid ownership must not report success"),
    workflowDependencies(persistence),
  );
  assert.equal(result.ok, false);
  assert.equal(bundle.save.projectId, "different-project");
  assertDatabaseSnapshot(persistence, before);
  assert.deepEqual(persistence.events, []);
}

// Invalid project and save payloads are distinguished from storage failures
// and leave both stores exactly unchanged.
{
  const persistence = new MemoryPersistence();
  seedExistingData(persistence);
  const before = databaseSnapshot(persistence);
  const invalidProject = projectFixture();
  (
    invalidProject.world.locations[0] as unknown as { connections: unknown }
  ).connections = "invalid";
  const projectResult = await executeProjectImport(
    jsonFile(invalidProject),
    () => assert.fail("invalid project must not report success"),
    workflowDependencies(persistence),
  );
  assert.equal(projectResult.ok, false);
  if (!projectResult.ok) assert.equal(projectResult.code, "preparation_failed");
  assertDatabaseSnapshot(persistence, before);

  const invalidBundle = bundleFixture();
  (
    invalidBundle.save as unknown as { recentMessages: unknown }
  ).recentMessages = "invalid";
  const saveResult = await executeProjectImport(
    jsonFile(invalidBundle),
    () => assert.fail("invalid save must not report success"),
    workflowDependencies(persistence),
  );
  assert.equal(saveResult.ok, false);
  if (!saveResult.ok) assert.equal(saveResult.code, "preparation_failed");
  assertDatabaseSnapshot(persistence, before);
  assert.deepEqual(persistence.events, []);
}

// 12. Size is checked before text, preflight ID reads, preparation, or writes.
{
  const persistence = new MemoryPersistence();
  let textReads = 0;
  let idReads = 0;
  const dependencies = workflowDependencies(persistence);
  const result = await executeProjectImport(
    {
      size: MAX_PROJECT_IMPORT_BYTES + 1,
      async text() {
        textReads += 1;
        return "{}";
      },
    },
    () => assert.fail("oversized file must not report success"),
    {
      ...dependencies,
      async readExistingProjectIds() {
        idReads += 1;
        return new Set();
      },
      async readExistingSaveIds() {
        idReads += 1;
        return new Set();
      },
    },
  );
  assert.deepEqual(result, { ok: false, code: "file_too_large" });
  assert.equal(textReads, 0);
  assert.equal(idReads, 0);
  assert.deepEqual(persistence.events, []);
}

// 13. JSON parse failure performs no ID reads or writes.
{
  const persistence = new MemoryPersistence();
  let idReads = 0;
  const dependencies = workflowDependencies(persistence);
  const result = await executeProjectImport(
    {
      size: 9,
      async text() {
        return "{invalid";
      },
    },
    () => assert.fail("invalid JSON must not report success"),
    {
      ...dependencies,
      async readExistingProjectIds() {
        idReads += 1;
        return new Set();
      },
      async readExistingSaveIds() {
        idReads += 1;
        return new Set();
      },
    },
  );
  assert.deepEqual(result, { ok: false, code: "invalid_json" });
  assert.equal(idReads, 0);
  assert.deepEqual(persistence.events, []);
}

// 14. A future game bundle version reaches preparation but never persistence.
{
  const persistence = new MemoryPersistence();
  const bundle = bundleFixture();
  bundle.version = 3;
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("future bundle must not report success"),
    workflowDependencies(persistence),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(persistence.events, []);
}

// 15. Production source uses add plus one Dexie transaction, while the page's
// import function no longer contains the old put or projectId repair path.
{
  const persistenceSource = readFileSync(
    new URL("./project-import-persistence.ts", import.meta.url),
    "utf8",
  );
  assert.match(persistenceSource, /db\.projects\.add\(project\)/);
  assert.match(persistenceSource, /db\.saves\.add\(save\)/);
  assert.match(persistenceSource, /db\.projects\.get\(id\)/);
  assert.match(persistenceSource, /db\.saves\.get\(id\)/);
  assert.match(
    persistenceSource,
    /db\.transaction\("rw", db\.projects, db\.saves, operation\)/,
  );
  assert.doesNotMatch(persistenceSource, /\.put\(/);

  const pageSource = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const importStart = pageSource.indexOf("  async function importJson");
  const importEnd = pageSource.indexOf("  return (", importStart);
  const importSource = pageSource.slice(importStart, importEnd);
  assert.match(importSource, /executeProjectImport/);
  assert.doesNotMatch(importSource, /db\.(projects|saves)\.put/);
  assert.doesNotMatch(importSource, /save\.projectId\s*=/);
}

// 16. Preparation and persistence leave the parsed source object unchanged.
{
  const persistence = new MemoryPersistence();
  const input = bundleFixture();
  const before = structuredClone(input);
  const prepared = prepareProjectImport({
    input,
    existingProjectIds: new Set(),
    existingSaveIds: new Set(),
  });
  assert.equal(prepared.ok, true);
  if (prepared.ok) {
    const result = await persistPreparedProjectImport(prepared, persistence);
    assert.equal(result.ok, true);
  }
  assert.deepEqual(input, before);
}

// 17. Structured and formatted errors do not include business content.
{
  const persistence = new MemoryPersistence();
  const secret = "SENSITIVE_IMPORT_BODY_5B";
  const bundle = bundleFixture();
  bundle.project.openingScene = secret;
  bundle.save.recentMessages[0].content = secret;
  (bundle.save as unknown as { history: unknown }).history = secret;
  const result = await executeProjectImport(
    jsonFile(bundle),
    () => assert.fail("invalid save must not report success"),
    workflowDependencies(persistence),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(secret), false);
    assert.equal(formatProjectImportFailure(result).includes(secret), false);
  }
}

console.log("project import workflow tests passed");
