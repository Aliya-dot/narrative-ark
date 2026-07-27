"use client";

import { db } from "./db";
import type {
  WorldBookPublishRecords,
  WorldBookPublishStorage,
} from "./world-book-publish-boundary";

const records: WorldBookPublishRecords = {
  getWorldBook: (id) => db.worldBooks.get(id),
  listEntryIds: async (worldBookId) =>
    (await db.worldBookEntries
      .where("worldBookId")
      .equals(worldBookId)
      .primaryKeys()) as string[],
  deleteEntries: (ids) => db.worldBookEntries.bulkDelete(ids),
  putEntries: (entries) => db.worldBookEntries.bulkPut(entries),
  addVersion: (version) => db.worldBookVersions.add(version),
  putWorldBook: (book) => db.worldBooks.put(book),
};

export const worldBookPublishStorage: WorldBookPublishStorage = {
  transaction: (operation) =>
    db.transaction(
      "rw",
      db.worldBooks,
      db.worldBookEntries,
      db.worldBookVersions,
      () => operation(records),
    ),
};
