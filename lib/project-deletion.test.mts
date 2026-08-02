import assert from "node:assert/strict";
import {
  deleteProjectCascade,
  type ProjectDeletionStorage,
} from "./project-deletion.ts";

const calls: string[] = [];
const storage: ProjectDeletionStorage = {
  async deleteProject(projectId) {
    calls.push(`project:${projectId}`);
  },
  async deleteProjectSaves(projectId) {
    calls.push(`saves:${projectId}`);
  },
  async deleteProjectExports(projectId) {
    calls.push(`exports:${projectId}`);
  },
};

await deleteProjectCascade("project-1", storage);
assert.deepEqual(calls, [
  "project:project-1",
  "saves:project-1",
  "exports:project-1",
]);

await assert.rejects(
  () => deleteProjectCascade(" ", storage),
  /项目 ID 不能为空/,
);

const failureCalls: string[] = [];
await assert.rejects(
  () =>
    deleteProjectCascade("project-2", {
      async deleteProject() {
        failureCalls.push("project");
      },
      async deleteProjectSaves() {
        failureCalls.push("saves");
        throw new Error("save cleanup failed");
      },
      async deleteProjectExports() {
        failureCalls.push("exports");
      },
    }),
  /save cleanup failed/,
);
assert.deepEqual(failureCalls, ["project", "saves"]);

console.log("project deletion tests passed");
