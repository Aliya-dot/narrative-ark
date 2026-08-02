import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const projectRoot = new URL("../../", import.meta.url);
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

const { NativeSqliteBackend } = await import("./native-backend.ts");

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
const invoke = async <T,>(command: string) => {
  events.push(command);
  return undefined as T;
};
const backend = new NativeSqliteBackend(invoke);

const first = backend.transaction([], async () => {
  events.push("first:start");
  await releaseFirst.promise;
  events.push("first:end");
});
await settle();

const second = backend.transaction([], async () => {
  events.push("second:start");
  events.push("second:end");
});
await settle();

assert.deepEqual(events, ["local_db_begin", "first:start"]);
releaseFirst.resolve();
await Promise.all([first, second]);
assert.deepEqual(events, [
  "local_db_begin",
  "first:start",
  "first:end",
  "local_db_commit",
  "local_db_begin",
  "second:start",
  "second:end",
  "local_db_commit",
]);

const recoveryEvents: string[] = [];
const recoveryBackend = new NativeSqliteBackend(async <T,>(command: string) => {
  recoveryEvents.push(command);
  return undefined as T;
});
const failed = recoveryBackend.transaction([], async () => {
  recoveryEvents.push("failed:start");
  throw new Error("fixture transaction failure");
});
const recovered = recoveryBackend.transaction([], async () => {
  recoveryEvents.push("recovered:start");
});
const [failedResult, recoveredResult] = await Promise.allSettled([
  failed,
  recovered,
]);
assert.equal(failedResult.status, "rejected");
assert.equal(recoveredResult.status, "fulfilled");
assert.deepEqual(recoveryEvents, [
  "local_db_begin",
  "failed:start",
  "local_db_rollback",
  "local_db_begin",
  "recovered:start",
  "local_db_commit",
]);

console.log("Native SQLite transaction concurrency tests passed");
