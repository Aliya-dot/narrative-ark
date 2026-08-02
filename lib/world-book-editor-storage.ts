"use client";

import { db } from "./db";
import type { WorldBookEditorStorage } from "./world-book-editor-workspace";

export const worldBookEditorStorage: WorldBookEditorStorage = {
  getProject: (id) => db.projects.get(id),
  getDraft: (id) => db.drafts.get(id),
  getWorldBook: (id) => db.worldBooks.get(id),
  getWorldBookEntries: (worldBookId) =>
    db.worldBookEntries.where("worldBookId").equals(worldBookId).toArray(),
  async putDraft(record) {
    await db.drafts.put(record);
  },
  async deleteDraft(id) {
    await db.drafts.delete(id);
  },
};
