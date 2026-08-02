import assert from "node:assert/strict";
import {
  BackendConflictError,
  BackendDatabase,
} from "./backend-db.ts";

const database = new BackendDatabase(":memory:");

assert.deepEqual(database.health(), {
  ok: true,
  storage: "sqlite",
  schemaVersion: 1,
});
assert.deepEqual(database.listProjects(), []);

const first = {
  id: "project_backend_test",
  updatedAt: "2026-07-28T12:00:00.000Z",
  projectInfo: { title: "后端测试项目" },
};
database.putProject(first, null);
assert.deepEqual(database.getProject(first.id), first);
assert.deepEqual(database.listProjects(), [
  {
    id: first.id,
    title: "后端测试项目",
    updatedAt: first.updatedAt,
  },
]);

const second = {
  ...first,
  updatedAt: "2026-07-28T12:01:00.000Z",
  projectInfo: { title: "已更新项目" },
};
database.putProject(second, first.updatedAt);
assert.deepEqual(database.getProject(first.id), second);

assert.throws(
  () => database.putProject(first, first.updatedAt),
  BackendConflictError,
  "旧版本不能覆盖服务端新版本",
);
assert.equal(database.deleteProject(first.id), true);
assert.equal(database.getProject(first.id), undefined);
assert.equal(database.deleteProject(first.id), false);

database.close();
console.log("backend database tests passed");
