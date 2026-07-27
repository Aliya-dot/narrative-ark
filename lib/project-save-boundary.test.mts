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
  failBeforeCommit = false;

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
      if (this.failBeforeCommit) {
        throw new Error("fixture transaction completion failure");
      }
      this.events.push("transaction:commit");
      return result;
    } catch (error) {
      this.saves = new Map(snapshot);
      this.events.push("transaction:rollback");
      throw error;
    }
  }
}

class UnfilteredMemoryStorage extends MemoryStorage {
  override async listByProjectId(projectId: string) {
    this.events.push(`list:${projectId}`);
    return [...this.saves.values()];
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

// Default loading prepares every candidate before sorting by updatedAt
// descending, then by id ascending. Reads and in-memory migration never write.
{
  const storage = new UnfilteredMemoryStorage();
  const latest = structuredClone(a.save) as GameSave & {
    playerState: GameSave["playerState"] & {
      inventory: Array<
        GameSave["playerState"]["inventory"][number] & {
          type?: unknown;
          damage?: unknown;
        }
      >;
    };
  };
  latest.id = "z-latest";
  latest.updatedAt = "2026-03-03T00:00:00.000Z";
  latest.playerState.inventory = [
    {
      id: "legacy-item",
      name: "Legacy item",
      description: "Legacy fixture.",
      quantity: 1,
      type: "weapon",
      damage: 4,
    },
  ];
  const older = {
    ...structuredClone(a.save),
    id: "a-older",
    updatedAt: "2026-02-02T00:00:00.000Z",
  };
  const foreign = {
    ...structuredClone(b.save),
    id: "foreign-future",
    updatedAt: "9999-01-01T00:00:00.000Z",
  };
  const invalid = {
    id: "invalid-future",
    projectId: a.project.id,
    updatedAt: "9999-12-31T00:00:00.000Z",
  };

  // Valid-candidate insertion order ends with an older save, and ascending ID
  // order also puts the older save first, so neither order represents recency.
  storage.saves.set(latest.id, latest);
  storage.saves.set(older.id, older);
  storage.saves.set(foreign.id, foreign);
  storage.saves.set(invalid.id, invalid);
  const storedBefore = structuredClone([...storage.saves.entries()]);

  const loaded = await loadLatestProjectSave({
    routeProjectId: a.project.id,
    project: a.project,
    storage,
  });
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.value.id, latest.id);
    assert.equal(
      Object.hasOwn(loaded.value.playerState.inventory[0], "type"),
      false,
    );
    assert.equal(
      Object.hasOwn(loaded.value.playerState.inventory[0], "damage"),
      false,
    );
  }
  assert.deepEqual(storage.events, [`list:${a.project.id}`]);
  assert.deepEqual([...storage.saves.entries()], storedBefore);
}

// Equal updatedAt values use the explicit stable secondary rule: ID ascending.
{
  const storage = new MemoryStorage();
  const sameTime = "2026-04-04T00:00:00.000Z";
  const tieZ = { ...structuredClone(a.save), id: "tie-z", updatedAt: sameTime };
  const tieA = { ...structuredClone(a.save), id: "tie-a", updatedAt: sameTime };
  storage.saves.set(tieZ.id, tieZ);
  storage.saves.set(tieA.id, tieA);

  const loaded = await loadLatestProjectSave({
    routeProjectId: a.project.id,
    project: a.project,
    storage,
  });
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.value.id, tieA.id);
  assert.deepEqual(storage.events, [`list:${a.project.id}`]);
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
  next.updatedAt = "2099-01-01T00:00:00.000Z";
  freezeDeep(next);
  const updated = await updateProjectSave({
    project: a.project,
    save: next,
    expectedUpdatedAt: a.save.updatedAt,
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
      expectedUpdatedAt: next.updatedAt,
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

// Missing, empty, or illegal revision tokens never reach put and cannot turn
// an existing-save update into an unconditional overwrite.
{
  for (const expectedUpdatedAt of [
    undefined,
    "",
    "   ",
    "not-a-revision-token",
  ]) {
    const storage = new MemoryStorage();
    storage.saves.set(a.save.id, structuredClone(a.save));
    const before = structuredClone([...storage.saves.entries()]);
    const next = {
      ...structuredClone(a.save),
      turn: 3,
      updatedAt: "2099-01-01T00:00:00.000Z",
    };

    assert.deepEqual(
      await updateProjectSave({
        project: a.project,
        save: next,
        expectedUpdatedAt: expectedUpdatedAt as string,
        storage,
      }),
      { ok: false, code: "save_conflict" },
    );
    assert.deepEqual([...storage.saves.entries()], before);
    assert.equal(
      storage.events.some((event) => event.startsWith("put:")),
      false,
    );
  }
}

// A valid baseline token still requires the candidate revision to be a valid,
// strictly later timestamp.
{
  for (const updatedAt of [
    a.save.updatedAt,
    "not-a-revision-token",
    "2000-01-01T00:00:00.000Z",
  ]) {
    const storage = new MemoryStorage();
    storage.saves.set(a.save.id, structuredClone(a.save));
    const before = structuredClone([...storage.saves.entries()]);
    const next = { ...structuredClone(a.save), updatedAt };

    assert.deepEqual(
      await updateProjectSave({
        project: a.project,
        save: next,
        expectedUpdatedAt: a.save.updatedAt,
        storage,
      }),
      { ok: false, code: "save_conflict" },
    );
    assert.deepEqual([...storage.saves.entries()], before);
    assert.equal(
      storage.events.some((event) => event.startsWith("put:")),
      false,
    );
  }
}

// Same-ID other-project records, deleted records, and storage errors are zero-write failures.
{
  const otherOwner = new MemoryStorage();
  otherOwner.saves.set(a.save.id, {
    ...structuredClone(a.save),
    projectId: b.project.id,
  });
  const otherOwnerBefore = structuredClone([...otherOwner.saves.entries()]);
  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: a.save,
      expectedUpdatedAt: a.save.updatedAt,
      storage: otherOwner,
    }),
    { ok: false, code: "save_project_mismatch" },
  );
  assert.equal(
    otherOwner.events.some((event) => event.startsWith("put:")),
    false,
  );
  assert.deepEqual([...otherOwner.saves.entries()], otherOwnerBefore);
  assert.equal(
    [...otherOwner.saves.values()].some(
      (record) =>
        typeof record === "object" &&
        record !== null &&
        "projectId" in record &&
        record.projectId === a.project.id,
    ),
    false,
  );

  const deleted = new MemoryStorage();
  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: a.save,
      expectedUpdatedAt: a.save.updatedAt,
      storage: deleted,
    }),
    { ok: false, code: "save_not_found" },
  );
  assert.equal(deleted.saves.size, 0);

  const failing = new MemoryStorage();
  failing.saves.set(a.save.id, structuredClone(a.save));
  failing.failPut = true;
  const failingCandidate = {
    ...structuredClone(a.save),
    updatedAt: "2099-01-02T00:00:00.000Z",
  };
  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: failingCandidate,
      expectedUpdatedAt: a.save.updatedAt,
      storage: failing,
    }),
    { ok: false, code: "save_storage_failed" },
  );
  assert.equal((failing.saves.get(a.save.id) as GameSave).turn, a.save.turn);
}

// A failure after the callback has performed its put but before the transaction
// commits rolls every field back and is reported as failure, never success.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  const before = structuredClone([...storage.saves.entries()]);
  const next = structuredClone(a.save);
  next.name = "transaction failure candidate";
  next.turn = 8;
  next.updatedAt = "2099-02-01T00:00:00.000Z";
  next.recentMessages.push({
    id: "message-after-snapshot",
    role: "player",
    content: "must roll back",
    createdAt: next.updatedAt,
    turn: next.turn,
  });
  storage.failBeforeCommit = true;

  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: next,
      expectedUpdatedAt: a.save.updatedAt,
      storage,
    }),
    { ok: false, code: "save_storage_failed" },
  );
  assert.deepEqual([...storage.saves.entries()], before);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${a.save.id}`,
    `put:${a.save.id}`,
    "transaction:rollback",
  ]);
}

// A deterministic final-put failure occurs after ownership and revision checks,
// leaves the complete original snapshot intact, and creates no extra record.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  const before = structuredClone([...storage.saves.entries()]);
  const next = {
    ...structuredClone(a.save),
    name: "put failure candidate",
    turn: 9,
    updatedAt: "2099-03-01T00:00:00.000Z",
  };
  storage.failPut = true;

  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: next,
      expectedUpdatedAt: a.save.updatedAt,
      storage,
    }),
    { ok: false, code: "save_storage_failed" },
  );
  assert.deepEqual([...storage.saves.entries()], before);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${a.save.id}`,
    `put:${a.save.id}`,
    "transaction:rollback",
  ]);
}

// Two writers based on one revision cannot become last-writer-wins: the first
// commits, while the stale second writer is rejected before put.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  const first = {
    ...structuredClone(a.save),
    name: "first writer",
    turn: 10,
    updatedAt: "2099-04-01T00:00:00.000Z",
  };
  const second = {
    ...structuredClone(a.save),
    name: "stale second writer",
    turn: 11,
    updatedAt: "2099-05-01T00:00:00.000Z",
  };

  const firstResult = await updateProjectSave({
    project: a.project,
    save: first,
    expectedUpdatedAt: a.save.updatedAt,
    storage,
  });
  assert.equal(firstResult.ok, true);
  const afterFirst = structuredClone([...storage.saves.entries()]);
  storage.events = [];

  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: second,
      expectedUpdatedAt: a.save.updatedAt,
      storage,
    }),
    { ok: false, code: "save_conflict" },
  );
  assert.deepEqual([...storage.saves.entries()], afterFirst);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${a.save.id}`,
    "transaction:commit",
  ]);
  assert.equal((storage.saves.get(a.save.id) as GameSave).name, "first writer");
}

// Failed non-overwriting creation never falls back to put or chooses another ID.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  const before = structuredClone([...storage.saves.entries()]);
  const target = { ...structuredClone(a.save), id: "failed-create" };
  storage.failAdd = true;

  assert.deepEqual(
    await createProjectSave({
      project: a.project,
      save: target,
      storage,
    }),
    { ok: false, code: "save_storage_failed" },
  );
  assert.deepEqual([...storage.saves.entries()], before);
  assert.equal(storage.saves.has(target.id), false);
  assert.deepEqual(storage.events, [`add:${target.id}`]);
}

// Failed copy creation preserves the source byte-for-byte and leaves no partial
// target record.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  const sourceBefore = structuredClone(storage.saves.get(a.save.id));
  const source = await loadProjectSave({
    routeProjectId: a.project.id,
    project: a.project,
    saveId: a.save.id,
    storage,
  });
  if (!source.ok) throw new Error("copy source fixture did not load");
  const copy = {
    ...structuredClone(source.value),
    id: "failed-copy",
    name: "copy candidate",
    updatedAt: "2099-06-01T00:00:00.000Z",
  };
  storage.failAdd = true;

  assert.deepEqual(
    await createProjectSave({
      project: a.project,
      save: copy,
      storage,
    }),
    { ok: false, code: "save_storage_failed" },
  );
  assert.deepEqual(storage.saves.get(a.save.id), sourceBefore);
  assert.equal(storage.saves.has(copy.id), false);
  assert.deepEqual(storage.events, [`get:${a.save.id}`, `add:${copy.id}`]);
}

// Invalid migrated/schema input fails after the transactional read but before
// put; its error category remains distinct from a storage failure.
{
  const storage = new MemoryStorage();
  storage.saves.set(a.save.id, structuredClone(a.save));
  const before = structuredClone([...storage.saves.entries()]);
  const invalid = {
    ...structuredClone(a.save),
    playerState: null,
    updatedAt: "2099-07-01T00:00:00.000Z",
  } as unknown as GameSave;

  assert.deepEqual(
    await updateProjectSave({
      project: a.project,
      save: invalid,
      expectedUpdatedAt: a.save.updatedAt,
      storage,
    }),
    { ok: false, code: "invalid_save" },
  );
  assert.deepEqual([...storage.saves.entries()], before);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `get:${a.save.id}`,
    "transaction:commit",
  ]);
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
  "save_conflict",
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
assert.match(playSource, /setS\(loaded\.value\)/);

// The play page builds candidates locally, awaits the shared update boundary,
// and only then commits the returned persisted record. Its turn failure branch
// restores the pre-operation base, while quick-save preserves specific errors.
const persistStart = playSource.indexOf("async function persist(");
const sendStart = playSource.indexOf("async function send(", persistStart);
const persistSource = playSource.slice(persistStart, sendStart);
assert.ok(persistStart >= 0 && sendStart > persistStart);
assert.ok(
  persistSource.indexOf("await updateProjectSave({") <
    persistSource.indexOf("setS(result.value)"),
);
assert.match(persistSource, /if \(!result\.ok\) throw new Error\(/);
assert.doesNotMatch(persistSource, /setS\(candidate\)|setS\(next\)/);

const turnStart = playSource.indexOf("async function send(", sendStart);
const renderStart = playSource.indexOf("if (p === undefined", turnStart);
const turnSource = playSource.slice(turnStart, renderStart);
assert.doesNotMatch(
  turnSource.slice(0, turnSource.indexOf("await persist(next)")),
  /setS\(next\)/,
);
assert.match(turnSource, /await persist\(next\)/);
assert.match(turnSource, /catch \(e\)[\s\S]*?setS\(base\)/);
assert.match(
  playSource,
  /await persist\(s\);[\s\S]*?catch \(e\)[\s\S]*?e instanceof Error \? e\.message/,
);

console.log("project save boundary tests passed");
