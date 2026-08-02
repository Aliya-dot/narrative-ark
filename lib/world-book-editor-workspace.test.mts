import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type {
  WorldBookEditorDraftRecord,
  WorldBookEditorStorage,
} from "./world-book-editor-workspace.ts";

const projectRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(projectRoot.href) &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const [workspaceModule, worldBookModule, { SAMPLE_PROJECT }] =
  await Promise.all([
    import("./world-book-editor-workspace.ts"),
    import("./world-book.ts"),
    import("./sample.ts"),
  ]);
const {
  createSequentialWorldBookDraftSaver,
  loadWorldBookEditorWorkspace,
  readWorldBookEditorMode,
  worldBookEditorDraftRecord,
  writeWorldBookEditorMode,
} = workspaceModule;
const { createWorldBook, createWorldBookEntry } = worldBookModule;

class MemoryStorage implements WorldBookEditorStorage {
  projects = new Map([[SAMPLE_PROJECT.id, structuredClone(SAMPLE_PROJECT)]]);
  drafts = new Map<string, { value: unknown }>();
  books = new Map();
  entries = new Map();
  writtenDrafts: WorldBookEditorDraftRecord[] = [];

  async getProject(id: string) {
    return structuredClone(this.projects.get(id));
  }

  async getDraft(id: string) {
    return structuredClone(this.drafts.get(id));
  }

  async getWorldBook(id: string) {
    return structuredClone(this.books.get(id));
  }

  async getWorldBookEntries(worldBookId: string) {
    return structuredClone(this.entries.get(worldBookId) || []);
  }

  async putDraft(record: WorldBookEditorDraftRecord) {
    this.writtenDrafts.push(structuredClone(record));
    this.drafts.set(record.id, structuredClone(record));
  }

  async deleteDraft(id: string) {
    this.drafts.delete(id);
  }
}

{
  const storage = new MemoryStorage();
  const result = await loadWorldBookEditorWorkspace({
    worldBookId: "new",
    storage,
    createWorldBookId: () => "world-new",
  });
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.book.id, "world-new");
    assert.equal(result.entries.length, 0);
    assert.equal(result.revision.currentVersionId, null);
    assert.equal(result.revision.versionNumber, 0);
    assert.equal(result.draftStatus, "clean");
  }
}

{
  const storage = new MemoryStorage();
  const result = await loadWorldBookEditorWorkspace({
    worldBookId: "new",
    projectId: SAMPLE_PROJECT.id,
    storage,
    createWorldBookId: () => "world-extracted",
  });
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.book.id, "world-extracted");
    assert.match(result.book.name, /世界书/);
    assert.ok(result.entries.length > 0);
    assert.equal(result.selectedId, result.entries[0]?.id);
    assert.equal(result.book.coreSummaryStatus, "current");
  }
}

{
  const storage = new MemoryStorage();
  const created = createWorldBook("world-draft").book;
  const first = createWorldBookEntry("duplicate", created.id, "history");
  const second = {
    ...createWorldBookEntry("duplicate", created.id, "location"),
    title: "重复卡片仍应保留",
  };
  storage.drafts.set("worldbook:new", {
    value: {
      kind: "world-book-editor-v1",
      book: created,
      entries: [first, second],
      selectedId: "missing-selection",
    },
  });
  const result = await loadWorldBookEditorWorkspace({
    worldBookId: "new",
    storage,
    createWorldBookId: () => "unused",
  });
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.entries.length, 2);
    assert.equal(new Set(result.entries.map((entry) => entry.id)).size, 2);
    assert.equal(result.repairedEntryCount, 1);
    assert.equal(result.selectedId, result.entries[0]?.id);
    assert.equal(result.draftStatus, "saved");
  }
}

{
  const storage = new MemoryStorage();
  assert.deepEqual(
    await loadWorldBookEditorWorkspace({
      worldBookId: "missing",
      storage,
      createWorldBookId: () => "unused",
    }),
    { kind: "missing" },
  );
}

{
  const storage = new MemoryStorage();
  const formalBook = createWorldBook("world-existing").book;
  formalBook.updatedAt = "2026-07-28T10:00:00.000Z";
  formalBook.versionNumber = 4;
  formalBook.currentVersionId = "world-existing:v4";
  const low = {
    ...createWorldBookEntry("low", formalBook.id),
    priority: 10,
  };
  const high = {
    ...createWorldBookEntry("high", formalBook.id),
    priority: 90,
  };
  storage.books.set(formalBook.id, formalBook);
  storage.entries.set(formalBook.id, [low, high]);
  const result = await loadWorldBookEditorWorkspace({
    worldBookId: formalBook.id,
    storage,
    createWorldBookId: () => "unused",
  });
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.deepEqual(
      result.entries.map((entry) => entry.id),
      ["high", "low"],
    );
    assert.equal(result.selectedId, "high");
    assert.deepEqual(result.revision, {
      currentVersionId: "world-existing:v4",
      versionNumber: 4,
      updatedAt: "2026-07-28T10:00:00.000Z",
    });
  }
}

{
  const storage = new MemoryStorage();
  const formalBook = createWorldBook("world-with-draft").book;
  formalBook.updatedAt = "2026-07-28T10:00:00.000Z";
  formalBook.versionNumber = 3;
  formalBook.currentVersionId = "world-with-draft:v3";
  const draftBook = {
    ...formalBook,
    name: "草稿名称",
    updatedAt: "2026-07-28T11:00:00.000Z",
  };
  const draftEntry = createWorldBookEntry("draft-entry", formalBook.id);
  storage.books.set(formalBook.id, formalBook);
  storage.drafts.set(`worldbook:${formalBook.id}`, {
    value: {
      kind: "world-book-editor-v1",
      book: draftBook,
      entries: [draftEntry],
      selectedId: draftEntry.id,
    },
  });
  const result = await loadWorldBookEditorWorkspace({
    worldBookId: formalBook.id,
    storage,
    createWorldBookId: () => "unused",
  });
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.book.name, "草稿名称");
    assert.equal(result.draftStatus, "saved");
    assert.equal(result.revision.updatedAt, formalBook.updatedAt);
    assert.equal(result.revision.updatedAt === draftBook.updatedAt, false);
  }
}

{
  const storage = new MemoryStorage();
  storage.getWorldBook = async () => {
    throw new Error("fixture database failure");
  };
  await assert.rejects(
    loadWorldBookEditorWorkspace({
      worldBookId: "world-failure",
      storage,
      createWorldBookId: () => "unused",
    }),
    /fixture database failure/,
  );
}

{
  const book = createWorldBook("world-snapshot").book;
  const entry = createWorldBookEntry("entry-snapshot", book.id);
  const record = worldBookEditorDraftRecord(
    "worldbook:world-snapshot",
    book,
    [entry],
    entry.id,
    "2026-07-28T12:00:00.000Z",
  );
  book.name = "写入后修改";
  entry.title = "写入后修改";
  assert.notEqual(record.value.book.name, book.name);
  assert.notEqual(record.value.entries[0]?.title, entry.title);
}

{
  const events: string[] = [];
  let releaseFirst = () => {};
  let markFirstStarted = () => {};
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const saver = createSequentialWorldBookDraftSaver({
    async putDraft(record) {
      events.push(`start:${record.id}`);
      if (record.id === "first") {
        markFirstStarted();
        await firstGate;
      }
      events.push(`end:${record.id}`);
    },
  });
  const book = createWorldBook("world-queue").book;
  const first = saver.save(
    worldBookEditorDraftRecord("first", book, [], "", "1"),
  );
  await firstStarted;
  const second = saver.save(
    worldBookEditorDraftRecord("second", book, [], "", "2"),
  );
  await Promise.resolve();
  assert.deepEqual(events, ["start:first"]);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [
    { ok: true },
    { ok: true },
  ]);
  assert.deepEqual(events, [
    "start:first",
    "end:first",
    "start:second",
    "end:second",
  ]);
}

{
  let attempts = 0;
  const saver = createSequentialWorldBookDraftSaver({
    async putDraft() {
      attempts += 1;
      if (attempts === 1) throw new Error("fixture write failure");
    },
  });
  const book = createWorldBook("world-recovery").book;
  assert.deepEqual(
    await saver.save(worldBookEditorDraftRecord("first", book, [], "", "1")),
    { ok: false, code: "draft_storage_failed" },
  );
  assert.deepEqual(
    await saver.save(worldBookEditorDraftRecord("second", book, [], "", "2")),
    { ok: true },
  );
}

{
  assert.equal(
    readWorldBookEditorMode({ getItem: () => "quick" }, "world"),
    "quick",
  );
  assert.equal(
    readWorldBookEditorMode(
      {
        getItem() {
          throw new Error("storage disabled");
        },
      },
      "new",
    ),
    "quick",
  );
  assert.equal(
    readWorldBookEditorMode({ getItem: () => "invalid" }, "world"),
    "professional",
  );
  assert.equal(
    writeWorldBookEditorMode({ setItem() {} }, "world", "quick"),
    true,
  );
  assert.equal(
    writeWorldBookEditorMode(
      {
        setItem() {
          throw new Error("quota exceeded");
        },
      },
      "world",
      "quick",
    ),
    false,
  );
}

console.log("world book editor workspace tests passed");
