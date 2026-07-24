"use client";

import { db } from "./db";
import type {
  ProjectSaveStorage,
  SaveRecordStore,
} from "./project-save-boundary";

const records: SaveRecordStore = {
  get: (id) => db.saves.get(id),
  add: (save) => db.saves.add(save),
  put: (save) => db.saves.put(save),
  delete: (id) => db.saves.delete(id),
};

export const projectSaveStorage: ProjectSaveStorage = {
  ...records,
  listByProjectId: (projectId) =>
    db.saves.where("projectId").equals(projectId).toArray(),
  transaction: (operation) =>
    db.transaction("rw", db.saves, () => operation(records)),
};
