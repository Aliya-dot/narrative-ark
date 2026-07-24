import type {
  WorldBook,
  WorldBookEntry,
  WorldBookVersion,
} from "./types";

export type WorldBookRecordStore = {
  runTransaction: (operation: () => Promise<void>) => Promise<void>;
  addWorldBook: (book: WorldBook) => Promise<unknown>;
  addEntries: (entries: WorldBookEntry[]) => Promise<unknown>;
  addVersion: (version: WorldBookVersion) => Promise<unknown>;
};

export async function writeWorldBookRecords(
  store: WorldBookRecordStore,
  records: {
    book: WorldBook;
    entries: WorldBookEntry[];
    version: WorldBookVersion;
  },
): Promise<void> {
  await store.runTransaction(async () => {
    await store.addWorldBook(records.book);
    await store.addEntries(records.entries);
    await store.addVersion(records.version);
  });
}
