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
  {
    cleanupPublishedWorldBookDraft,
    formatWorldBookPublishFailure,
    publishWorldBook,
  },
  { createWorldBook, createWorldBookEntry },
] = await Promise.all([
  import("./world-book-publish-boundary.ts"),
  import("./world-book.ts"),
]);

type FailPoint =
  | "delete"
  | "putEntries"
  | "addVersion"
  | "putBook"
  | "beforeCommit";

class MemoryPublishStorage
  implements WorldBookPublishStorage, WorldBookPublishRecords
{
  books = new Map<string, WorldBook>();
  entries = new Map<string, WorldBookEntry>();
  versions = new Map<string, WorldBookVersion>();
  events: string[] = [];
  failAt?: FailPoint;

  async transaction<T>(
    operation: (records: WorldBookPublishRecords) => Promise<T>,
  ): Promise<T> {
    this.events.push("transaction:start");
    const before = this.snapshot();
    try {
      const result = await operation(this);
      if (this.failAt === "beforeCommit")
        throw new Error("fixture before commit failure");
      this.events.push("transaction:commit");
      return result;
    } catch (error) {
      this.books = before.books;
      this.entries = before.entries;
      this.versions = before.versions;
      this.events.push("transaction:rollback");
      throw error;
    }
  }

  async getWorldBook(id: string) {
    this.events.push(`getBook:${id}`);
    const value = this.books.get(id);
    return value ? structuredClone(value) : undefined;
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
    if (this.failAt === "delete")
      throw new Error("fixture delete failure");
  }

  async putEntries(entries: WorldBookEntry[]) {
    this.events.push(`putEntries:${entries.map((entry) => entry.id).join(",")}`);
    for (const entry of entries)
      this.entries.set(entry.id, structuredClone(entry));
    if (this.failAt === "putEntries")
      throw new Error("fixture entry write failure");
  }

  async addVersion(version: WorldBookVersion) {
    this.events.push(`addVersion:${version.id}`);
    if (this.failAt === "addVersion")
      throw new Error("fixture version write failure");
    if (this.versions.has(version.id)) {
      const error = new Error("fixture duplicate version");
      error.name = "ConstraintError";
      throw error;
    }
    this.versions.set(version.id, structuredClone(version));
  }

  async putWorldBook(book: WorldBook) {
    this.events.push(`putBook:${book.id}`);
    this.books.set(book.id, structuredClone(book));
    if (this.failAt === "putBook")
      throw new Error("fixture book write failure");
  }

  snapshot() {
    return {
      books: structuredClone(this.books),
      entries: structuredClone(this.entries),
      versions: structuredClone(this.versions),
    };
  }
}

function candidate(id = "world"): {
  book: WorldBook;
  entries: WorldBookEntry[];
} {
  const book = createWorldBook(id).book;
  book.name = "Publish fixture";
  book.coreSummary = "Stable fixture summary";
  const entry = createWorldBookEntry(`${id}:entry:1`, id);
  entry.title = "Fixture entry";
  entry.summary = "Fixture summary";
  entry.content = "Fixture content";
  entry.keywords = ["fixture"];
  book.entryIds = [entry.id];
  return { book, entries: [entry] };
}

function seedPublished(
  storage: MemoryPublishStorage,
  id = "world",
): { book: WorldBook; entries: WorldBookEntry[]; version: WorldBookVersion } {
  const data = candidate(id);
  const version: WorldBookVersion = {
    id: `${id}:v1:seed`,
    worldBookId: id,
    versionNumber: 1,
    note: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    snapshot: {
      coreSummary: data.book.coreSummary,
      entries: structuredClone(data.entries),
    },
  };
  const book: WorldBook = {
    ...data.book,
    status: "published",
    currentVersionId: version.id,
    versionNumber: 1,
    updatedAt: version.createdAt,
  };
  storage.books.set(id, structuredClone(book));
  for (const entry of data.entries)
    storage.entries.set(entry.id, structuredClone(entry));
  storage.versions.set(version.id, structuredClone(version));
  return { book, entries: data.entries, version };
}

function revision(book: WorldBook): WorldBookRevision {
  return {
    currentVersionId: book.currentVersionId,
    versionNumber: book.versionNumber,
    updatedAt: book.updatedAt,
  };
}

function seedUnpublished(
  storage: MemoryPublishStorage,
  id = "world",
): WorldBook {
  const book = {
    ...candidate(id).book,
    currentVersionId: null,
    versionNumber: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as WorldBook;
  storage.books.set(id, structuredClone(book));
  return book;
}

function versionId(id: string, number: number) {
  return `${id}:v${number}:test`;
}

function publish(
  storage: MemoryPublishStorage,
  data: { book: WorldBook; entries: WorldBookEntry[] },
  expectedRevision: WorldBookRevision,
) {
  return publishWorldBook({
    worldBookId: data.book.id,
    expectedRevision,
    candidateBook: data.book,
    candidateEntries: data.entries,
    note: "test publish",
    storage,
    createVersionId: versionId,
    now: () => "2026-02-01T00:00:00.000Z",
  });
}

// 1. First publication uses the explicit null/0 baseline and creates V1 only
// after the transaction commits.
{
  const storage = new MemoryPublishStorage();
  const data = candidate();
  const unpublished = seedUnpublished(storage);
  const result = await publish(storage, data, revision(unpublished));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.version.versionNumber, 1);
    assert.equal(result.book.currentVersionId, result.version.id);
    assert.deepEqual(storage.books.get(data.book.id), result.book);
    assert.deepEqual(
      [...storage.entries.values()].map((entry) => entry.id),
      data.entries.map((entry) => entry.id),
    );
    assert.deepEqual(storage.versions.get(result.version.id), result.version);
  }
  assert.equal(storage.events.at(-1), "transaction:commit");
}

// 2. A normal subsequent publication creates V(N+1) with add and keeps V(N).
{
  const storage = new MemoryPublishStorage();
  const seeded = seedPublished(storage);
  const data = candidate();
  data.book.coreSummary = "Updated summary";
  const result = await publish(storage, data, revision(seeded.book));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.version.versionNumber, 2);
    assert.equal(result.revision.versionNumber, 2);
    assert.equal(storage.versions.has(seeded.version.id), true);
    assert.equal(storage.versions.has(result.version.id), true);
    assert.deepEqual(storage.books.get(data.book.id), result.book);
  }
  assert.ok(storage.events.some((event) => event.startsWith("addVersion:")));
}

// 3. Two callers based on N: A wins, B conflicts before every formal write.
{
  const storage = new MemoryPublishStorage();
  const seeded = seedPublished(storage);
  const pageA = candidate();
  pageA.book.coreSummary = "Page A";
  const pageB = candidate();
  pageB.book.coreSummary = "Page B";
  const expected = revision(seeded.book);
  const a = await publish(storage, pageA, expected);
  assert.equal(a.ok, true);
  const afterA = storage.snapshot();
  storage.events = [];
  const b = await publish(storage, pageB, expected);
  assert.deepEqual(b, { ok: false, code: "worldbook_conflict" });
  assert.deepEqual(storage.snapshot(), afterA);
  assert.deepEqual(storage.events, [
    "transaction:start",
    `getBook:${pageB.book.id}`,
    "transaction:commit",
  ]);
}

// 4. Missing, empty, negative, fractional, and inconsistent tokens are
// rejected with no formal writes.
for (const expectedRevision of [
  undefined,
  { currentVersionId: "", versionNumber: 1 },
  { currentVersionId: null, versionNumber: -1 },
  { currentVersionId: "world:v1:seed", versionNumber: 1.5 },
  { currentVersionId: null, versionNumber: 1 },
] as unknown as WorldBookRevision[]) {
  const storage = new MemoryPublishStorage();
  const seeded = seedPublished(storage);
  const before = storage.snapshot();
  const result = await publish(storage, candidate(), expectedRevision);
  assert.deepEqual(result, { ok: false, code: "worldbook_conflict" });
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(
    storage.events.some((event) =>
      /deleteEntries|putEntries|addVersion|putBook/.test(event),
    ),
    false,
  );
  assert.equal(storage.books.get(seeded.book.id)?.versionNumber, 1);
}
{
  const storage = new MemoryPublishStorage();
  const seeded = seedPublished(storage);
  const before = storage.snapshot();
  const result = await publish(storage, candidate(), {
    currentVersionId: seeded.book.currentVersionId,
    versionNumber: seeded.book.versionNumber + 1,
    updatedAt: seeded.book.updatedAt,
  });
  assert.deepEqual(result, { ok: false, code: "worldbook_conflict" });
  assert.deepEqual(storage.snapshot(), before);
}

// 5. A missing existing target is not recreated.
{
  const storage = new MemoryPublishStorage();
  const data = candidate();
  const result = await publish(storage, data, {
    currentVersionId: "world:v1:missing",
    versionNumber: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(result, { ok: false, code: "worldbook_not_found" });
  assert.deepEqual(storage.snapshot(), {
    books: new Map(),
    entries: new Map(),
    versions: new Map(),
  });
}

// 6. Book/target and entry ownership mismatches fail before storage.
{
  const storage = new MemoryPublishStorage();
  const data = candidate("other");
  const result = await publishWorldBook({
    worldBookId: "world",
    expectedRevision: {
      currentVersionId: null,
      versionNumber: 0,
      updatedAt: data.book.updatedAt,
    },
    candidateBook: data.book,
    candidateEntries: data.entries,
    storage,
  });
  assert.deepEqual(result, { ok: false, code: "worldbook_id_mismatch" });
  assert.deepEqual(storage.events, []);
}
{
  const storage = new MemoryPublishStorage();
  const data = candidate();
  data.entries[0].worldBookId = "other";
  const result = await publish(storage, data, {
    currentVersionId: null,
    versionNumber: 0,
    updatedAt: data.book.updatedAt,
  });
  assert.deepEqual(result, { ok: false, code: "worldbook_id_mismatch" });
  assert.deepEqual(storage.events, []);
}

// 7. Existing business validation and duplicate identity checks remain
// blocking and zero-write.
{
  const storage = new MemoryPublishStorage();
  const data = candidate();
  data.entries[0].relatedEntryIds = [data.entries[0].id];
  const result = await publish(storage, data, {
    currentVersionId: null,
    versionNumber: 0,
    updatedAt: data.book.updatedAt,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "worldbook_validation_failed");
  assert.deepEqual(storage.events, []);
}
{
  const storage = new MemoryPublishStorage();
  const data = candidate();
  data.entries.push(structuredClone(data.entries[0]));
  const result = await publish(storage, data, {
    currentVersionId: null,
    versionNumber: 0,
    updatedAt: data.book.updatedAt,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "worldbook_validation_failed");
  assert.deepEqual(storage.events, []);
}

async function assertRollback(
  failAt: FailPoint,
  expectedEvent: RegExp,
): Promise<void> {
  const storage = new MemoryPublishStorage();
  const seeded = seedPublished(storage);
  const oldEntry = createWorldBookEntry("world:old", "world");
  oldEntry.title = "Old";
  oldEntry.summary = "Old";
  storage.entries.set(oldEntry.id, structuredClone(oldEntry));
  const before = storage.snapshot();
  storage.failAt = failAt;
  const result = await publish(storage, candidate(), revision(seeded.book));
  assert.deepEqual(result, { ok: false, code: "worldbook_storage_failed" });
  assert.deepEqual(storage.snapshot(), before);
  assert.ok(storage.events.some((event) => expectedEvent.test(event)));
  assert.equal(storage.events.at(-1), "transaction:rollback");
}

// 8-12. Every failure point rolls all three formal tables back.
await assertRollback("delete", /^deleteEntries:/);
await assertRollback("putEntries", /^putEntries:/);
await assertRollback("addVersion", /^addVersion:/);
await assertRollback("putBook", /^putBook:/);
await assertRollback("beforeCommit", /^putBook:/);

// 13. Non-overwriting add reports a distinct version collision and rolls back.
{
  const storage = new MemoryPublishStorage();
  const seeded = seedPublished(storage);
  const colliding: WorldBookVersion = {
    ...seeded.version,
    id: versionId("world", 2),
    versionNumber: 2,
  };
  storage.versions.set(colliding.id, structuredClone(colliding));
  const before = storage.snapshot();
  const result = await publish(storage, candidate(), revision(seeded.book));
  assert.deepEqual(result, {
    ok: false,
    code: "worldbook_version_conflict",
  });
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(storage.events.at(-1), "transaction:rollback");
}

// 14-15. Page source holds a separate formal baseline, awaits the boundary,
// updates it only from success, returns on conflict, and has no retry.
{
  const page = await readFile(
    new URL("../app/worldbooks/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const start = page.indexOf("async function publish()");
  const end = page.indexOf("if (loading || !book)", start);
  const source = page.slice(start, end);
  assert.match(page, /const \[formalRevision, setFormalRevision\]/);
  assert.match(source, /expectedRevision: formalRevision/);
  assert.match(source, /const result = await publishWorldBook\(\{/);
  assert.ok(
    source.indexOf("if (!result.ok)") <
      source.indexOf("setFormalRevision(result.revision)"),
  );
  assert.match(
    source,
    /if \(!result\.ok\) \{[\s\S]*formatWorldBookPublishFailure\(result\)[\s\S]*return;/,
  );
  assert.match(
    source,
    /setBook\(result\.book\);[\s\S]*setFormalRevision\(result\.revision\)/,
  );
  assert.doesNotMatch(source, /worldbook_conflict[\s\S]*publishWorldBook/);
  assert.match(
    formatWorldBookPublishFailure({
      ok: false,
      code: "worldbook_conflict",
    }),
    /重新加载/,
  );
}

// 16. Draft cleanup failure is a post-commit warning; formal data and the new
// revision remain committed and no second publication occurs.
{
  const storage = new MemoryPublishStorage();
  const data = candidate();
  const unpublished = seedUnpublished(storage);
  const result = await publish(storage, data, revision(unpublished));
  assert.equal(result.ok, true);
  const committed = storage.snapshot();
  let cleanupAttempts = 0;
  const cleanup = await cleanupPublishedWorldBookDraft(async () => {
    cleanupAttempts += 1;
    throw new Error("fixture draft cleanup failure");
  });
  assert.equal(cleanup, "failed");
  assert.equal(cleanupAttempts, 1);
  assert.deepEqual(storage.snapshot(), committed);
  assert.equal(storage.versions.size, 1);

  const page = await readFile(
    new URL("../app/worldbooks/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const start = page.indexOf("async function publish()");
  const end = page.indexOf("if (loading || !book)", start);
  const source = page.slice(start, end);
  assert.ok(
    source.indexOf("setFormalRevision(result.revision)") <
      source.indexOf("cleanupPublishedWorldBookDraft"),
  );
  const cleanupFailureBranch = source.match(
    /if \(cleanup === "failed"\) \{([\s\S]*?)\} else \{/,
  )?.[1];
  assert.ok(cleanupFailureBranch);
  assert.match(
    cleanupFailureBranch,
    /世界书已发布，但本地编辑草稿清理失败/,
  );
  assert.doesNotMatch(cleanupFailureBranch, /toast\.error/);
}

console.log("world book publish boundary tests passed");
