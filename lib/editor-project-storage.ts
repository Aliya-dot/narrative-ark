"use client";

import { db } from "./db";
import type {
  EditorProjectRecordStore,
  EditorProjectStorage,
} from "./editor-project-save";

const records: EditorProjectRecordStore = {
  get: (id) => db.projects.get(id),
  put: (project) => db.projects.put(project),
};

export const editorProjectStorage: EditorProjectStorage = {
  transaction: (operation) =>
    db.transaction("rw", db.projects, () => operation(records)),
};
