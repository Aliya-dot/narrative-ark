import assert from "node:assert/strict";
import { ensureUniqueWorldBookEntryIds } from "./world-book-entry-identity.ts";

const duplicateId = "world_demo:location:3";
const original = [
  { id: duplicateId, title: "北港" },
  { id: duplicateId, title: "南港" },
  { id: `${duplicateId}~2`, title: "旧版重编号卡" },
  { id: duplicateId, title: "王城" },
];

const result = ensureUniqueWorldBookEntryIds(original);
const ids = result.entries.map((entry) => entry.id);

assert.equal(new Set(ids).size, original.length, "所有资料卡 ID 必须唯一");
assert.equal(result.entries[0].id, duplicateId, "第一张卡保留原 ID");
assert.equal(result.entries[1].title, "南港", "重复卡内容不能被删除");
assert.notEqual(result.entries[1].id, duplicateId, "第二张重复卡必须重编号");
assert.notEqual(
  result.entries[3].id,
  result.entries[1].id,
  "多张重复卡和已有后缀都不能再次冲突",
);
assert.equal(result.repairs.length, 2, "应准确报告两张被修复的重复卡");

console.log("world-book-entry-identity regression: ok");
