import assert from "node:assert/strict";
import { displayAttributeName } from "./attribute-label.ts";

assert.equal(
  displayAttributeName("hp", [{ id: "hp", name: "生命值" }]),
  "生命值",
  "项目设定的属性名称应优先于旧键兜底",
);
assert.equal(displayAttributeName("hp", []), "生命");
assert.equal(displayAttributeName("spirit", []), "精神");
assert.equal(displayAttributeName("blood_power", []), "血源之力");
assert.equal(displayAttributeName("blood-power", []), "血源之力");
assert.equal(displayAttributeName("体力", []), "体力");
assert.equal(displayAttributeName("custom_score", []), "未命名属性");
assert.equal(displayAttributeName("   ", []), "未知属性");

console.log("attribute label regression tests passed");
