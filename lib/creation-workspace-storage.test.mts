import assert from "node:assert/strict";
import type { GenerationDraft } from "./types.ts";
import {
  creationWorkspaceRecord,
  replaceCreationWorkspace,
  saveCreationWorkspace,
} from "./creation-workspace-storage.ts";

const meta = {
  step: 2,
  lockedFields: ["idea"],
  aiDraftFields: [],
  fieldUndo: {},
  optimizeExisting: false,
};
const form = {
  title: "测试项目",
  idea: "测试想法",
};
const generationForm: GenerationDraft = {
  ...form,
  genre: "悬疑",
  protagonist: "调查员",
  tone: "克制",
  freedomMode: "hybrid",
  gameLength: "short",
  numericSystem: true,
  creationMode: "simple",
  advanced: {},
  supportingCharacters: [],
};
const updatedAt = "2026-07-28T12:00:00.000Z";

assert.deepEqual(creationWorkspaceRecord(form, meta, updatedAt), {
  id: "creation",
  value: {
    kind: "creation-workspace-v1",
    form,
    meta,
  },
  updatedAt,
});

let stored: unknown;
assert.deepEqual(
  await saveCreationWorkspace(
    {
      async put(record) {
        stored = record;
      },
    },
    form,
    meta,
    updatedAt,
  ),
  { ok: true },
);
assert.deepEqual(stored, creationWorkspaceRecord(form, meta, updatedAt));

assert.deepEqual(
  await saveCreationWorkspace(
    {
      async put() {
        throw new Error("storage disabled");
      },
    },
    form,
    meta,
    updatedAt,
  ),
  { ok: false, code: "draft_storage_failed" },
);

const replacementCalls: string[] = [];
await replaceCreationWorkspace(
  {
    async put(record) {
      replacementCalls.push(`put:${record.id}`);
    },
    async delete(id) {
      replacementCalls.push(`delete:${id}`);
    },
  },
  "generation-1",
  generationForm,
  updatedAt,
);
assert.deepEqual(replacementCalls, ["put:generation-1", "delete:creation"]);

console.log("creation workspace storage tests passed");
