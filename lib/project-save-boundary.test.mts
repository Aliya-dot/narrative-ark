import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import type { GameSave } from "./types.ts";
import type {
  ProjectSaveStorage,
  SaveRecordStore,
} from "./project-save-boundary.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  createProjectSave,
  deleteProjectSave,
  formatProjectSaveFailure,
  listProjectSaves,
  loadLatestProjectSave,
  loadProjectSave,
  resolveSaveForProject,
  updateProjectSave,
} = await import("./project-save-boundary.ts");
const { createSave, emptyProject } = await import("./project.ts");

function fixture(projectId: string, saveId: string) {
  const project = emptyProject({
    title: projectId,
    idea: "fixture",
    genre: "test",
    protagonist: "tester",
    tone: "measured",
    freedomMode: "hybrid",
    gameLength: "standard",
    numericSystem: true,
    creationMode: "advanced",
  });
  project.id = projectId;
  const save = createSave(project);
  save.id = saveId;
  save.projectId = projectId;
  return { project, save };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

class MemoryStorage implements ProjectSaveStorage {
  saves = new Map<string, unknown>();
  events: string[] = [];
  failAdd = false;
  failPut = false;

  async get(id: string) {
    this.events.push(`get:${id}`);
    return this.saves.get(id);
  }

  async add(save: GameSave) {
    this.events.push(`add:${save.id}`);
    if (this.failAdd) throw new Error("fixture storage detail");
    if (this.saves.has(save.id)) {
      const error = new Error("fixture collision");
      error.name = "ConstraintError";
      throw error;
    }
    this.saves.set(save.id, structuredClone(save));
  }

  async put(save: GameSave) {
    this.events.push(`put:${save.id}`);
    if (this.failPut) throw new Error("fixture storage detail");
    this.saves.set(save.id, structuredClone(save));
  }

  async delete(id: string) {
    this.events.push(`delete:${id}`);
    this.saves.delete(id);
  }

  async listByProjectId(projectId: string) {
    this.events.push(`list:${projectId}`);
    return [...this.saves.values()].filter(
      (save) =>
        typeof save === "object" &&
        save !== null &&
        "projectId" in save &&
        save.projectId === projectId,
    );
  }

  async transaction<T>(operation: (store: SaveRecordStore) => Promise<T>) {
    this.events.push("transaction:start");
    const snapshot = structuredClone([...this.saves.entries()]);
    try {
      const result = await operation(this);
      this.events.push("transaction:commit");
      return result;
    } catch (error) {
      this.saves = new Map(snapshot);
      this.events.push("transaction:rollback");
      throw error;
    }
  }
}

const a = fixture("project-a", "save-a");
const b = fixture("project-b", "save-b");

// Correct ownership loads; a save from another project and a swapped route do not.
assert.equal(
  resolveSaveForProject({ projectId: a.project.id, save: a.save }).ok,
  true,
);
assert.deepEqual(
  resolveSaveForProject({ projectId: a.project.id, save: b.save }),
  { ok: false, code: "save_project_mismatch" },
);
{
  const storage = new MemoryStorage();
  storage.saves.set(b.save.id, structuredClone(b.save));
  const result = await loadProjectSave({
    routeProjectId: a.project.id,
    project: a.project,
    saveId: b.save.id,
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "save_project_mismatch" });
  let initialized = false;
  let wroteBack = false;
  if (result.ok) {
    initialized = true;
    wroteBack = true;
  }
  assert.equal(initialized, false);
  assert.equal(wroteBack, false);
  assert.deepEqual(storage.events, [`get:${b.save.id}`]);

  const legacyForeign = structuredClone(b.save) as GameSave & {
    playerState: GameSave["playerState"] & {
      inventory: Array<
        GameSave["playerState"]["inventory"][number] & {
          type?: unknown;
          damage?: unknown;
        }
      >;
    };
  };
  legacyForeign.playerState.inventory = [
    {
      id: "legacy-foreign-item",
      name: "Legacy foreign item",
      description: "Legacy ownership fixture.",
      quantity: 1,
      type: "weapon",
      damage: 4,
    },
  ];
  storage.saves.set(legacyForeign.id, legacyForeign);
  const migratedForeign = await loadProjectSave({
    routeProjectId: a.project.id,
    project: a.project,
    saveId: legacyForeign.id,
    storage,
  });
  assert.deepEqual(migratedForeign, {
    ok: false,
    code: "save_project_mismatch",
  });

  storage.saves.set(a.save.id, structuredClone(a.save));
  const swapped = await loadProjectSave({
    routeProjectId: b.project.id,
    project: a.project,
    saveId: a.save.id,
    storage,
  });
  assert.deepEqual(swapped, { ok: false, code: "project_route_mismatch" });
}

// Invalid schema fails both direct and latest-save loading.
{
  const storage = new MemoryStorage();
  storage.saves.set("broken", {
    id: "broken",
    projectId: a.project.id,
    updatedAt: "9999-01-01T00:00:00.000Z",
  });
  assert.deepEqual(
    await loadProjectSave({
      routeProjectId: a.project.id,
      project: a.project,
      saveId: "broken",
      storage,
    }),
    { ok: false, code: "invalid_save" },
  );
  assert.deepEqual(
    await loadLatestProjectSave({
      routeProjectId: a.project.id,
      project: a.project,
      storage,
    }),
    { ok: false, code: "invalid_save" },
  );
}

// Lists contain only prepared saves for the requested project.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  storage.saves.set(b.save.id, structuredClone(b.save));
  storage.saves.set("broken", { id: "broken", projectId: a.project.id });
  const listed = await listProjectSaves({
    projectId: a.project.id,
    storage,
  });
  assert.equal(listed.ok, true);
  if (listed.ok)
    assert.deepEqual(
      listed.value.map((save) => save.id),
      ["save-a"],
    );

  // A list item is only a hint: clicking re-reads and revalidates current storage.
  storage.saves.set(a.save.id, {
    ...structuredClone(a.save),
    projectId: b.project.id,
  });
  assert.deepEqual(
    await loadProjectSave({
      routeProjectId: a.project.id,
      project: a.project,
      saveId: a.save.id,
      storage,
    }),
    { ok: false, code: "save_project_mismatch" },
  );
}

// Creation binds the verified project, uses add, preserves frozen input, and
// never overwrites an ID collision.
{
  const storage = new MemoryStorage();
  const untrusted = structuredClone(a.save);
  untrusted.projectId = b.project.id;
  freezeDeep(untrusted);
  const before = structuredClone(untrusted);
  const created = await createProjectSave({
    project: a.project,
    save: untrusted,
    storage,
  });
  assert.equal(created.ok, true);
  assert.deepEqual(untrusted, before);
  assert.equal(
    (storage.saves.get(untrusted.id) as GameSave).projectId,
    a.project.id,
  );
  assert.deepEqual(storage.events, [`add:${untrusted.id}`]);

  const original = structuredClone(storage.saves.get(untrusted.id));
  assert.deepEqual(
    await createProjectSave({
      project: a.project,
      save: { ...structuredClone(a.save), name: "collision payload" },
      storage,
    }),
    { ok: false, code: "save_id_conflict" },
  );
  assert.deepEqual(storage.saves.get(untrusted.id), original);
}

// Existing saves are checked and written inside one transaction.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  const next = structuredClone(a.save);
  next.turn = 2;
  freezeDeep(next);
  const updated = await updateProjectSave({
    project: a.project,
    save: next,
    storage,
  });
  assert.equal(updated.ok, true);
  assert.equal((storage.saves.get(a.save.id) as GameSave).turn, 2);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${a.save.id}`,
    `put:${a.save.id}`,
    "transaction:commit",
  ]);

  storage.events = [];
  const rebound = { ...structuredClone(next), projectId: b.project.id };
  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: rebound,
      storage,
    }),
    { ok: false, code: "save_project_mismatch" },
  );
  assert.equal(
    (storage.saves.get(a.save.id) as GameSave).projectId,
    a.project.id,
  );
  assert.equal(storage.events.includes(`put:${a.save.id}`), false);
}

// Same-ID other-project records, deleted records, and storage errors are zero-write failures.
{
  const otherOwner = new MemoryStorage();
  otherOwner.saves.set(a.save.id, {
    ...structuredClone(a.save),
    projectId: b.project.id,
  });
  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: a.save,
      storage: otherOwner,
    }),
    { ok: false, code: "save_project_mismatch" },
  );
  assert.equal(
    otherOwner.events.some((event) => event.startsWith("put:")),
    false,
  );

  const deleted = new MemoryStorage();
  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: a.save,
      storage: deleted,
    }),
    { ok: false, code: "save_not_found" },
  );
  assert.equal(deleted.saves.size, 0);

  const failing = new MemoryStorage();
  failing.saves.set(a.save.id, structuredClone(a.save));
  failing.failPut = true;
  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: a.save,
      storage: failing,
    }),
    { ok: false, code: "save_storage_failed" },
  );
  assert.equal((failing.saves.get(a.save.id) as GameSave).turn, a.save.turn);
}

// Deletion also revalidates ownership in its transaction.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, {
    ...structuredClone(a.save),
    projectId: b.project.id,
  });
  assert.deepEqual(
    await deleteProjectSave({
      projectId: a.project.id,
      saveId: a.save.id,
      storage,
    }),
    { ok: false, code: "save_project_mismatch" },
  );
  assert.equal(storage.saves.has(a.save.id), true);
}

// Public messages are fixed and contain neither fixture content nor storage details.
const secret = "full narrative fixture content";
for (const code of [
  "project_not_found",
  "project_route_mismatch",
  "save_not_found",
  "invalid_save",
  "save_project_mismatch",
  "save_id_conflict",
  "save_storage_failed",
] as const) {
  const message = formatProjectSaveFailure(code);
  assert.doesNotMatch(message, new RegExp(secret));
  assert.doesNotMatch(message, /fixture storage detail|stack|recentMessages/);
}

// Source-boundary checks supplement the behavior tests: every play/save-manager
// entry calls the shared boundary, and no direct save put/get fallback remains.
const playSource = await readFile(
  new URL("../app/play/[id]/page.tsx", import.meta.url),
  "utf8",
);
const managerSource = await readFile(
  new URL("../components/save-manager.tsx", import.meta.url),
  "utf8",
);
assert.match(playSource, /loadProjectSave\(\{/);
assert.match(playSource, /loadLatestProjectSave\(\{/);
assert.match(playSource, /await persist\(next\)/);
assert.match(playSource, /await persist\(s\)/);
assert.match(managerSource, /loadProjectSave\(\{/);
assert.match(managerSource, /listProjectSaves\(\{/);
assert.doesNotMatch(playSource, /db\.saves\.(?:get|add|put|update|bulkPut)/);
assert.doesNotMatch(managerSource, /db\.saves\.(?:get|add|put|update|bulkPut)/);
assert.doesNotMatch(playSource, /projectId\s*=\s*(?:id|routeProjectId)/);
assert.doesNotMatch(managerSource, /projectId\s*=\s*routeProjectId/);

console.log("project save boundary tests passed");
