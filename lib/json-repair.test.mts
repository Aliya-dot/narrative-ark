import assert from "node:assert/strict";
import { parseModelJson } from "./json-repair.ts";

const missingArrayComma = `\`\`\`json
{
  "characters": [
    {"id":"a","name":"甲"}
    {"id":"b","name":"乙"}
  ]
}
\`\`\``;

assert.deepEqual(parseModelJson(missingArrayComma), {
  characters: [
    { id: "a", name: "甲" },
    { id: "b", name: "乙" },
  ],
});

assert.deepEqual(
  parseModelJson('{"world":{"locations":[]}\n"characters":[],}'),
  { world: { locations: [] }, characters: [] },
);

assert.deepEqual(parseModelJson('{"goals":["寻找线索"\n"返回营地"]}'), {
  goals: ["寻找线索", "返回营地"],
});

assert.deepEqual(parseModelJson('{"line":"她说：“别走。”"}'), {
  line: "她说：“别走。”",
});

assert.throws(
  () => parseModelJson('{"characters":[{"name":"未结束}]}'),
  /结构化内容不完整/,
);

console.log("json repair regression tests passed");
