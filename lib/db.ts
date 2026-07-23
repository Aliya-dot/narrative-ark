"use client";
import Dexie, { type EntityTable } from "dexie";
import type {
  AIConfig,
  GameProject,
  GameSave,
  WorldBook,
  WorldBookEntry,
  WorldBookVersion,
  WorldScenario,
} from "./types";
export interface DraftRecord {
  id: string;
  value: unknown;
  updatedAt: string;
}
export interface ExportRecord {
  id: string;
  projectId: string;
  format: string;
  createdAt: string;
}
class NarrativeDB extends Dexie {
  projects!: EntityTable<GameProject, "id">;
  configs!: EntityTable<AIConfig, "id">;
  saves!: EntityTable<GameSave, "id">;
  drafts!: EntityTable<DraftRecord, "id">;
  exports!: EntityTable<ExportRecord, "id">;
  worldBooks!: EntityTable<WorldBook, "id">;
  worldBookEntries!: EntityTable<WorldBookEntry, "id">;
  worldBookVersions!: EntityTable<WorldBookVersion, "id">;
  scenarios!: EntityTable<WorldScenario, "id">;
  constructor() {
    super("narrative-ark");
    this.version(1).stores({
      projects: "id,updatedAt,projectInfo.title",
      configs: "id,active,updatedAt",
      saves: "id,projectId,updatedAt",
      drafts: "id,updatedAt",
      exports: "id,projectId,createdAt",
    });
    this.version(2).stores({
      projects: "id,updatedAt,projectInfo.title",
      configs: "id,active,updatedAt",
      saves: "id,projectId,updatedAt",
      drafts: "id,updatedAt",
      exports: "id,projectId,createdAt",
    });
    this.version(3).stores({
      projects: "id,updatedAt,projectInfo.title,worldBinding.worldBookId",
      configs: "id,active,updatedAt",
      saves: "id,projectId,updatedAt",
      drafts: "id,updatedAt",
      exports: "id,projectId,createdAt",
      worldBooks: "id,status,updatedAt,name,currentVersionId",
      worldBookEntries: "id,worldBookId,category,updatedAt,enabled",
      worldBookVersions: "id,worldBookId,versionNumber,createdAt",
      scenarios: "id,worldBookId,worldBookVersionId,updatedAt",
    });
  }
}
export const db = new NarrativeDB();
export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
