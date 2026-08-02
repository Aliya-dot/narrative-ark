import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const projectRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(projectRoot.href) &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { db, setLocalDataBackendForTests } = await import("./db.ts");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const events: string[] = [];
const releaseFirst = deferred();
const backend = {
  kind: "sqlite" as const,
  async transaction(
    _tables: readonly string[],
    operation: () => Promise<unknown>,
  ) {
    return await operation();
  },
  async put(_table: string, record: { id: string }) {
    events.push(`put:${record.id}`);
    return record.id;
  },
};
setLocalDataBackendForTests(backend as never);

try {
  const first = db.transaction("rw", db.drafts, async () => {
    events.push("first:start");
    await db.drafts.put({
      id: "first",
      value: {},
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    await releaseFirst.promise;
    events.push("first:end");
  });
  await settle();

  const second = db.transaction("rw", db.drafts, async () => {
    events.push("second:start");
    await db.drafts.put({
      id: "second",
      value: {},
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    events.push("second:end");
  });
  await settle();

  assert.deepEqual(events, ["first:start", "put:first"]);
  releaseFirst.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    "first:start",
    "put:first",
    "first:end",
    "second:start",
    "put:second",
    "second:end",
  ]);

  const failed = db.transaction("rw", db.drafts, async () => {
    events.push("failed:start");
    throw new Error("fixture database failure");
  });
  const recovered = db.transaction("rw", db.drafts, async () => {
    events.push("recovered:start");
  });
  const [failedResult, recoveredResult] = await Promise.allSettled([
    failed,
    recovered,
  ]);
  assert.equal(failedResult.status, "rejected");
  assert.equal(recoveredResult.status, "fulfilled");
  assert.deepEqual(events.slice(-2), ["failed:start", "recovered:start"]);
} finally {
  setLocalDataBackendForTests(undefined);
}

console.log("Database transaction concurrency tests passed");
