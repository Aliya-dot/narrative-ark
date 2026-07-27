import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import type {
  WorldBook,
  WorldBookEntry,
  WorldBookVersion,
} from "./types.ts";
import type {
  WorldBookPublishRecords,
  WorldBookPublishStorage,
  WorldBookRevision,
} from "./world-book-publish-boundary.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const [
  { advanceWorldBookUpdatedAt, publishWorldBook },
  { createWorldBook, createWorldBookEntry },
] = await Promise.all([
  import("./world-book-publish-boundary.ts"),
  import("./world-book.ts"),
]);

class RevisionStore
  implements WorldBookPublishStorage, WorldBookPublishRecords
{
  books = new Map<string, WorldBook>();
  entries = new Map<string, WorldBookEntry>();
  versions = new Map<string, WorldBookVersion>();
  events: string[] = [];

  async transaction<T>(
    operation: (records: WorldBookPublishRecords) => Promise<T>,
  ): Promise<T> {
    this.events.push("transaction:start");
    const result = await operation(this);
    this.events.push("transaction:commit");
    return result;
  }

  async getWorldBook(id: string) {
    this.events.push(`getBook:${id}`);
    const book = this.books.get(id);
    return book ? structuredClone(book) : undefined;
  }

  async listEntryIds(worldBookId: string) {
    this.events.push(`listEntries:${worldBookId}`);
    return [...this.entries.values()]
      .filter((entry) => entry.worldBookId === worldBookId)
      .map((entry) => entry.id);
  }

  async deleteEntries(ids: string[]) {
    this.events.push(`deleteEntries:${ids.join(",")}`);
    for (const id of ids) this.entries.delete(id);
  }

  async putEntries(entries: WorldBookEntry[]) {
    this.events.push(`putEntries:${entries.map((entry) => entry.id).join(",")}`);
    for (const entry of entries)
      this.entries.set(entry.id, structuredClone(entry));
  }

  async addVersion(version: WorldBookVersion) {
    this.events.push(`addVersion:${version.id}`);
    assert.equal(this.versions.has(version.id), false);
    this.versions.set(version.id, structuredClone(version));
  }

  async putWorldBook(book: WorldBook) {
    this.events.push(`putBook:${book.id}`);
    assert.equal(this.books.has(book.id), true);
    this.books.set(book.id, structuredClone(book));
  }

  snapshot() {
    return {
      books: structuredClone(this.books),
      entries: structuredClone(this.entries),
      versions: structuredClone(this.versions),
    };
  }
}

function candidate(id = "world") {
  const book = createWorldBook(id).book;
  book.name = "Revision fixture";
  book.coreSummary = "Stable revision fixture";
  const entry = createWorldBookEntry(`${id}:entry`, id);
  entry.title = "Revision entry";
  entry.summary = "Summary";
  entry.content = "Content";
  entry.keywords = ["revision"];
  book.entryIds = [entry.id];
  return { book, entries: [entry] };
}

function unpublished(id = "world"): WorldBook {
  return {
    ...candidate(id).book,
    currentVersionId: null,
    versionNumber: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as WorldBook;
}

function published(id = "world"): {
  book: WorldBook;
  entry: WorldBookEntry;
  version: WorldBookVersion;
} {
  const data = candidate(id);
  const version: WorldBookVersion = {
    id: `${id}:v1:seed`,
    worldBookId: id,
    versionNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    snapshot: {
      coreSummary: data.book.coreSummary,
      entries: structuredClone(data.entries),
    },
  };
  return {
    book: {
      ...data.book,
      status: "published",
      currentVersionId: version.id,
      versionNumber: 1,
      updatedAt: version.createdAt,
    },
    entry: data.entries[0],
    version,
  };
}

function revision(book: WorldBook): WorldBookRevision {
  return {
    currentVersionId: book.currentVersionId,
    versionNumber: book.versionNumber,
    updatedAt: book.updatedAt,
  };
}

function execute(
  store: RevisionStore,
  expectedRevision: WorldBookRevision,
  data = candidate(),
  now = "2026-02-01T00:00:00.000Z",
) {
  return publishWorldBook({
    worldBookId: data.book.id,
    expectedRevision,
    candidateBook: data.book,
    candidateEntries: data.entries,
    storage: store,
    createVersionId: (id, number) => `${id}:v${number}:revision-test`,
    now: () => now,
  });
}

function assertReadOnly(store: RevisionStore, before: ReturnType<RevisionStore["snapshot"]>) {
  assert.deepEqual(store.snapshot(), before);
  assert.equal(
    store.events.some((event) =>
      /listEntries|deleteEntries|putEntries|addVersion|putBook/.test(event),
    ),
    false,
  );
}

// 1. A never-existing target remains absent even with a syntactically valid
// null/0 token.
{
  const store = new RevisionStore();
  const data = candidate();
  const before = store.snapshot();
  const result = await execute(store, {
    currentVersionId: null,
    versionNumber: 0,
    updatedAt: data.book.updatedAt,
  });
  assert.deepEqual(result, { ok: false, code: "worldbook_not_found" });
  assertReadOnly(store, before);
  assert.deepEqual(store.events, [
    "transaction:start",
    "getBook:world",
    "transaction:commit",
  ]);
}

// 2. Deletion after an editor loaded null/0 cannot be reversed by publishing.
{
  const store = new RevisionStore();
  const removed = unpublished();
  const other = published("other");
  store.books.set(removed.id, structuredClone(removed));
  store.books.set(other.book.id, structuredClone(other.book));
  store.entries.set(other.entry.id, structuredClone(other.entry));
  store.versions.set(other.version.id, structuredClone(other.version));
  const oldRevision = revision(removed);
  store.books.delete(removed.id);
  const before = store.snapshot();
  const result = await execute(store, oldRevision);
  assert.deepEqual(result, { ok: false, code: "worldbook_not_found" });
  assertReadOnly(store, before);
  assert.equal(store.books.has(removed.id), false);
  assert.deepEqual(store.books.get(other.book.id), other.book);
}

// 3. Null/0 permits V1 only when the main record already exists.
{
  const store = new RevisionStore();
  const current = unpublished();
  store.books.set(current.id, structuredClone(current));
  const result = await execute(store, revision(current));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.version.versionNumber, 1);
    assert.equal(result.book.currentVersionId, result.version.id);
    assert.equal(store.versions.size, 1);
    assert.deepEqual(store.books.get(current.id), result.book);
  }
  assert.equal(store.events.at(-1), "transaction:commit");
}

// 4. Archive/unarchive style updates preserve the version pair but advance
// updatedAt; the old editor token conflicts before entry access.
{
  const store = new RevisionStore();
  const current = published();
  store.books.set(current.book.id, structuredClone(current.book));
  store.entries.set(current.entry.id, structuredClone(current.entry));
  store.versions.set(current.version.id, structuredClone(current.version));
  const oldRevision = revision(current.book);
  const archived = {
    ...current.book,
    status: "archived" as const,
    updatedAt: advanceWorldBookUpdatedAt(
      current.book.updatedAt,
      current.book.updatedAt,
    ),
  };
  store.books.set(archived.id, structuredClone(archived));
  const before = store.snapshot();
  const result = await execute(store, oldRevision);
  assert.deepEqual(result, { ok: false, code: "worldbook_conflict" });
  assertReadOnly(store, before);
  assert.equal(store.books.get(archived.id)?.status, "archived");
  assert.equal(store.books.get(archived.id)?.updatedAt, archived.updatedAt);
}

// 5. A representative non-publish rename is covered by the same full token.
{
  const store = new RevisionStore();
  const current = published();
  store.books.set(current.book.id, structuredClone(current.book));
  const oldRevision = revision(current.book);
  const renamed = {
    ...current.book,
    name: "Renamed elsewhere",
    updatedAt: advanceWorldBookUpdatedAt(current.book.updatedAt),
  };
  store.books.set(renamed.id, structuredClone(renamed));
  const before = store.snapshot();
  const result = await execute(store, oldRevision);
  assert.deepEqual(result, { ok: false, code: "worldbook_conflict" });
  assertReadOnly(store, before);
  assert.equal(store.books.get(renamed.id)?.name, "Renamed elsewhere");
}

// 6. Missing, blank, malformed, and mismatched updatedAt tokens are rejected.
for (const token of [
  {
    currentVersionId: "world:v1:seed",
    versionNumber: 1,
  },
  {
    currentVersionId: "world:v1:seed",
    versionNumber: 1,
    updatedAt: "",
  },
  {
    currentVersionId: "world:v1:seed",
    versionNumber: 1,
    updatedAt: "not-a-date",
  },
  {
    currentVersionId: "world:v1:seed",
    versionNumber: 1,
    updatedAt: "2026-01-01T00:00:00.001Z",
  },
] as unknown as WorldBookRevision[]) {
  const store = new RevisionStore();
  const current = published();
  store.books.set(current.book.id, structuredClone(current.book));
  const before = store.snapshot();
  const result = await execute(store, token);
  assert.deepEqual(result, { ok: false, code: "worldbook_conflict" });
  assertReadOnly(store, before);
}

// 7. Success advances all three revision fields from the committed record.
{
  const store = new RevisionStore();
  const current = published();
  store.books.set(current.book.id, structuredClone(current.book));
  store.entries.set(current.entry.id, structuredClone(current.entry));
  store.versions.set(current.version.id, structuredClone(current.version));
  const result = await execute(store, revision(current.book));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.revision.versionNumber, 2);
    assert.equal(result.revision.currentVersionId, result.version.id);
    assert.equal(result.revision.updatedAt, result.book.updatedAt);
    assert.ok(
      Date.parse(result.revision.updatedAt) >
        Date.parse(current.book.updatedAt),
    );
  }
}

// 8. Equal or older clock output still advances updatedAt by at least 1ms.
for (const proposed of [
  "2030-01-01T00:00:00.000Z",
  "2029-01-01T00:00:00.000Z",
]) {
  const store = new RevisionStore();
  const current = published();
  current.book.updatedAt = "2030-01-01T00:00:00.000Z";
  store.books.set(current.book.id, structuredClone(current.book));
  store.entries.set(current.entry.id, structuredClone(current.entry));
  store.versions.set(current.version.id, structuredClone(current.version));
  const result = await execute(store, revision(current.book), candidate(), proposed);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      Date.parse(result.book.updatedAt),
      Date.parse(current.book.updatedAt) + 1,
    );
  }
}

// 9. Existing-page draft recovery keeps the formal token sourced from the
// database record and success replaces it only with the boundary result.
{
  const page = await readFile(
    new URL("../app/worldbooks/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const existingStart = page.indexOf(
    "const [storedBook, storedEntries, storedDraft]",
  );
  const loadEnd = page.indexOf("hydrated.current = true;", existingStart);
  const existingLoad = page.slice(existingStart, loadEnd);
  assert.match(
    existingLoad,
    /setFormalRevision\(\{\s*currentVersionId: storedBook\.currentVersionId,\s*versionNumber: storedBook\.versionNumber,\s*updatedAt: storedBook\.updatedAt/,
  );
  assert.ok(
    existingLoad.indexOf("setFormalRevision({") <
      existingLoad.indexOf("const value = storedDraft"),
  );
  assert.doesNotMatch(existingLoad, /updatedAt: value\.book\.updatedAt/);

  const publishStart = page.indexOf("async function publish()");
  const publishEnd = page.indexOf("if (loading || !book)", publishStart);
  const publishSource = page.slice(publishStart, publishEnd);
  assert.match(publishSource, /expectedRevision: formalRevision/);
  assert.match(publishSource, /setFormalRevision\(result\.revision\)/);
  assert.ok(
    publishSource.indexOf("if (!result.ok)") <
      publishSource.indexOf("setFormalRevision(result.revision)"),
  );
}

// 10. The production archive toggle uses the shared monotonic helper.
{
  const listPage = await readFile(
    new URL("../app/worldbooks/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    listPage,
    /db\.worldBooks\.update\(book\.id,[\s\S]*updatedAt: advanceWorldBookUpdatedAt\(book\.updatedAt\)/,
  );
}

console.log("world book publish record revision tests passed");
