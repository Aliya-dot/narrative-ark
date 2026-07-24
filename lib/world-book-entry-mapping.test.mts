import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatWorldBookMappingErrors,
  remapWorldBookEntries,
} from "./world-book-entry-mapping.ts";
import {
  type WorldBookRecordStore,
  writeWorldBookRecords,
} from "./world-book-record-write.ts";
import type { WorldBookEntry } from "./types.ts";

function entry(
  id: string,
  relatedEntryIds: string[] = [],
  relations: WorldBookEntry["relations"] = [],
): WorldBookEntry {
  return {
    id,
    worldBookId: "world-old",
    category: "custom",
    title: `card-${id}`,
    summary: "",
    content: `private-content-${id}`,
    keywords: [],
    aliases: [],
    priority: 50,
    enabled: true,
    alwaysActive: false,
    visibility: "player_visible",
    relatedEntryIds,
    relations,
    allowAiExpansion: true,
    immutable: false,
    createdAt: "old-created",
    updatedAt: "old-updated",
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const source = [
  entry("alpha", ["beta"], [
    { targetEntryId: "beta", relationType: "reference" },
    { targetEntryId: "beta", relationType: "load_with" },
  ]),
  entry("beta", ["alpha"], [
    { targetEntryId: "alpha", relationType: "reference" },
  ]),
];
const before = structuredClone(source);
const calls = new Map<string, number>();
const mapped = remapWorldBookEntries({
  entries: deepFreeze(source),
  createWorldBookId: () => "world-new",
  createEntryId: (item) => {
    calls.set(item.id, (calls.get(item.id) ?? 0) + 1);
    return `entry-new-${item.id}`;
  },
});

assert.equal(mapped.ok, true);
if (!mapped.ok) throw new Error("expected successful mapping");
assert.deepEqual(source, before, "source entries must remain unchanged");
assert.equal(mapped.entries[0].id, "entry-new-alpha");
assert.equal(mapped.entries[1].id, "entry-new-beta");
assert.notEqual(mapped.entries[0].id, mapped.entries[1].id);
assert.ok(mapped.entries.every((item) => item.worldBookId === "world-new"));
assert.deepEqual(mapped.entries[0].relatedEntryIds, ["entry-new-beta"]);
assert.deepEqual(
  mapped.entries[0].relations?.map((relation) => relation.targetEntryId),
  ["entry-new-beta", "entry-new-beta"],
);
assert.equal(
  mapped.entries[0].relations?.[0].relationType,
  "reference",
  "relation business fields must be preserved",
);
assert.deepEqual([...calls.entries()], [
  ["alpha", 1],
  ["beta", 1],
]);
const newIds = new Set(mapped.entries.map((item) => item.id));
for (const item of mapped.entries) {
  for (const targetId of item.relatedEntryIds) assert.ok(newIds.has(targetId));
  for (const relation of item.relations ?? [])
    assert.ok(newIds.has(relation.targetEntryId));
}
assert.ok(
  mapped.entries.every(
    (item) =>
      !item.relatedEntryIds.includes("alpha") &&
      !item.relatedEntryIds.includes("beta") &&
      !(item.relations ?? []).some(
        (relation) =>
          relation.targetEntryId === "alpha" ||
          relation.targetEntryId === "beta",
      ),
  ),
);

for (const testCase of [
  {
    expectedCode: "blank_entry_id",
    expectedPath: "entries[0].id",
    entries: [entry("   ")],
  },
  {
    expectedCode: "duplicate_entry_id",
    expectedPath: "entries[1].id",
    entries: [entry("same"), entry("same")],
  },
  {
    expectedCode: "dangling_related_entry",
    expectedPath: "entries[0].relatedEntryIds[0]",
    entries: [entry("one", ["missing"])],
  },
  {
    expectedCode: "dangling_relation_target",
    expectedPath: "entries[0].relations[0].targetEntryId",
    entries: [
      entry("one", [], [
        { targetEntryId: "missing", relationType: "reference" },
      ]),
    ],
  },
] as const) {
  let worldIdCalls = 0;
  let entryIdCalls = 0;
  const result = remapWorldBookEntries({
    entries: testCase.entries,
    createWorldBookId: () => {
      worldIdCalls += 1;
      return "world-must-not-be-created";
    },
    createEntryId: () => {
      entryIdCalls += 1;
      return "entry-must-not-be-created";
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected rejected mapping");
  assert.equal(result.errors[0].code, testCase.expectedCode);
  assert.equal(result.errors[0].path, testCase.expectedPath);
  assert.equal(worldIdCalls, 0, "source failure must precede world ID creation");
  assert.equal(entryIdCalls, 0, "source failure must precede entry ID creation");
  assert.ok(
    !formatWorldBookMappingErrors(result.errors).includes("private-content"),
    "safe errors must not expose card content",
  );
}

const pageSource = readFileSync(
  new URL("../app/worldbooks/page.tsx", import.meta.url),
  "utf8",
);
const bundleSource = readFileSync(
  new URL("./world-book.ts", import.meta.url),
  "utf8",
);
assert.equal(
  (pageSource.match(/remapWorldBookEntries\(\{/g) ?? []).length,
  2,
  "copy and import must both call the shared mapper",
);
assert.ok(!pageSource.includes("new Map(\n      sourceEntries.map"));
assert.ok(!pageSource.includes("new Map(\n        bundle.entries.map"));
assert.ok(!pageSource.includes("worldBookEntries.bulkPut(entries)"));
assert.ok(!pageSource.includes("worldBooks.put(book)"));
assert.ok(
  !/relatedEntryIds:\s*entry\.relatedEntryIds[\s\S]{0,180}\.filter\(Boolean\)/.test(
    pageSource,
  ),
  "page must not retain the old relatedEntryIds-only filtering path",
);
const copySource = pageSource.slice(
  pageSource.indexOf("async function copyBook"),
  pageSource.indexOf("async function exportBook"),
);
const importSource = pageSource.slice(
  pageSource.indexOf("async function importFile"),
  pageSource.indexOf("const visibleBooks"),
);
for (const operationSource of [copySource, importSource]) {
  assert.ok(
    operationSource.indexOf("remapWorldBookEntries({") <
      operationSource.indexOf("writeWorldBookRecords("),
    "mapping must finish before the copy/import transaction",
  );
}
assert.ok(
  !/relatedEntryIds:\s*entry\.relatedEntryIds\.filter/.test(bundleSource),
  "bundle parsing must preserve dangling relations for the mapper to reject",
);
assert.match(
  pageSource,
  /if \(!remapped\.ok\) \{[\s\S]*?toast\.error\([\s\S]*?return;/,
  "mapping failure must return before any success toast",
);
assert.equal(
  (pageSource.match(/writeWorldBookRecords\(worldBookRecordStore/g) ?? [])
    .length,
  2,
  "copy and import must use the same transactional write orchestration",
);

const persisted = {
  books: [] as string[],
  entries: [] as string[],
  versions: [] as string[],
};
const failingStore: WorldBookRecordStore = {
  runTransaction: async (operation) => {
    const snapshot = structuredClone(persisted);
    try {
      await operation();
    } catch (error) {
      persisted.books = snapshot.books;
      persisted.entries = snapshot.entries;
      persisted.versions = snapshot.versions;
      throw error;
    }
  },
  addWorldBook: async (book) => {
    persisted.books.push(book.id);
  },
  addEntries: async () => {
    throw new Error("injected entry write failure");
  },
  addVersion: async (version) => {
    persisted.versions.push(version.id);
  },
};
await assert.rejects(
  writeWorldBookRecords(failingStore, {
    book: {
      id: "world-new",
      name: "test",
      description: "",
      tags: [],
      status: "draft",
      currentVersionId: "world-new:v1",
      versionNumber: 1,
      coreSummary: "",
      createdAt: "now",
      updatedAt: "now",
      entryIds: ["entry-new"],
    },
    entries: [entry("entry-new")],
    version: {
      id: "world-new:v1",
      worldBookId: "world-new",
      versionNumber: 1,
      createdAt: "now",
      snapshot: { coreSummary: "", entries: [entry("entry-new")] },
    },
  }),
  /injected entry write failure/,
);
assert.deepEqual(
  persisted,
  { books: [], entries: [], versions: [] },
  "a later entry write failure must leave no partial records",
);

console.log("world-book entry mapping regression: ok");
