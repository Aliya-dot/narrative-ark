import assert from "node:assert/strict";
import { storyLengthBadge } from "./story-length.ts";

assert.equal(storyLengthBadge("short"), "短篇");
assert.equal(storyLengthBadge("standard"), "标准篇");
assert.equal(storyLengthBadge("long"), "长篇");
assert.equal(storyLengthBadge("endless"), "无限篇");
assert.equal(storyLengthBadge(undefined), "标准篇");

console.log("story length badge tests passed");
