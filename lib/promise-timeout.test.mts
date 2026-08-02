import assert from "node:assert/strict";
import { withTimeout } from "./promise-timeout.ts";

assert.equal(
  await withTimeout(Promise.resolve("done"), 50, "timed out"),
  "done",
);

await assert.rejects(
  withTimeout(new Promise(() => {}), 20, "secure storage timed out"),
  /secure storage timed out/,
);

await assert.rejects(
  withTimeout(Promise.reject(new Error("original error")), 50, "timed out"),
  /original error/,
);

console.log("Promise timeout regression tests passed");
