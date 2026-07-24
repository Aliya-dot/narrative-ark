import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { SAMPLE_PROJECT } from "./sample.ts";
import type {
  ImportPreparationError,
  PreparedProjectImport,
} from "./project-import-preparation.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  CURRENT_GAME_BUNDLE_VERSION,
  GAME_BUNDLE_FORMAT,
  prepareProjectImport,
} = await import("./project-import-preparation.ts");
const { createSave } = await import("./project.ts");

const noIds = new Set<string>();

function projectFixture() {
  return structuredClone(SAMPLE_PROJECT);
}

function saveFixture() {
  const project = projectFixture();
  const save = createSave(project);
  save.id = "save-import-fixture";
  save.projectId = project.id;
  save.createdAt = "2026-01-01T00:00:00.000Z";
  save.updatedAt = "2026-01-01T00:00:00.000Z";
  return save;
}

function bundleFixture() {
  return {
    format: GAME_BUNDLE_FORMAT,
    version: CURRENT_GAME_BUNDLE_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    project: projectFixture(),
    save: saveFixture(),
  };
}

function prepare(
  input: unknown,
  existingProjectIds: ReadonlySet<string> = noIds,
  existingSaveIds: ReadonlySet<string> = noIds,
): PreparedProjectImport {
  return prepareProjectImport({
    input,
    existingProjectIds,
    existingSaveIds,
  });
}

function success(
  result: PreparedProjectImport,
): Extract<PreparedProjectImport, { ok: true }> {
  if (!result.ok) {
    assert.fail(`expected success; received ${JSON.stringify(result.errors)}`);
  }
  return result;
}

function errors(result: PreparedProjectImport): ImportPreparationError[] {
  if (result.ok) assert.fail("expected failure");
  return result.errors;
}

function hasError(
  result: PreparedProjectImport,
  code: string,
  path: string,
): void {
  assert.ok(
    errors(result).some((error) => error.code === code && error.path === path),
    `expected ${code} at ${path}`,
  );
}

function deepFreeze(value: unknown): unknown {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function assertInputUnchanged(input: unknown): PreparedProjectImport {
  const before = structuredClone(input);
  const result = prepare(input);
  assert.deepEqual(input, before);
  return result;
}

// 1. A current bare project is recognized, prepared, and returned as a clone.
{
  const input = projectFixture();
  const result = success(assertInputUnchanged(input));
  assert.equal(result.kind, "project");
  assert.deepEqual(result.project, input);
  assert.notEqual(result.project, input);
  assert.deepEqual(result.conflicts, []);
}

// 2. The exact current bundle envelope is recognized.
{
  const input = bundleFixture();
  const result = success(assertInputUnchanged(input));
  assert.equal(result.kind, "game_bundle");
  assert.deepEqual(result.project, input.project);
  if (result.kind === "game_bundle") assert.deepEqual(result.save, input.save);
}

// 3. The established legacy project shape without the revision is normalized.
{
  const input = projectFixture() as Record<string, unknown>;
  delete input.version;
  const result = success(assertInputUnchanged(input));
  assert.equal(result.project.version, 1);
  assert.equal(Object.hasOwn(input, "version"), false);
}

// 4. A legacy persisted save shape without newer optional fields remains valid
// through the real save preparation pipeline.
{
  const input = bundleFixture();
  delete input.save.turnDurationsMs;
  delete input.save.discoveredWorldBookEntryIds;
  delete input.save.settingsVersionId;
  delete input.save.settingsVersionNumber;
  const result = success(assertInputUnchanged(input));
  assert.equal(result.kind, "game_bundle");
  if (result.kind === "game_bundle") {
    assert.equal(Object.hasOwn(result.save, "turnDurationsMs"), false);
  }
}

// 5. Non-records, arrays, and unrelated records are unknown formats.
for (const input of [null, 3, "project", [], { hello: "world" }]) {
  hasError(assertInputUnchanged(input), "unknown_import_format", "$");
}
hasError(
  assertInputUnchanged({ project: projectFixture(), save: saveFixture() }),
  "unknown_import_format",
  "$",
);

// 6. The known bundle format rejects a future version before reading payloads.
{
  const input = bundleFixture();
  input.version = CURRENT_GAME_BUNDLE_VERSION + 1;
  const result = assertInputUnchanged(input);
  hasError(result, "future_game_bundle_version", "version");
  assert.equal(errors(result)[0]?.relatedId, "3");
}

// Unsupported older or missing bundle envelope versions are not guessed.
for (const version of [1, undefined]) {
  const input = bundleFixture() as Record<string, unknown>;
  if (version === undefined) delete input.version;
  else input.version = version;
  hasError(
    assertInputUnchanged(input),
    "unsupported_game_bundle_version",
    "version",
  );
}

// 7. Project schema errors retain a precise, safely prefixed field path.
{
  const input = projectFixture();
  (
    input.world.locations[0] as unknown as { connections: unknown }
  ).connections = "not-an-array";
  hasError(
    assertInputUnchanged(input),
    "project_invalid_type",
    "world.locations.0.connections",
  );
}

// 8. Save schema errors retain a precise bundle field path.
{
  const input = bundleFixture();
  (input.save as unknown as { recentMessages: unknown }).recentMessages =
    "not-an-array";
  hasError(
    assertInputUnchanged(input),
    "save_invalid_type",
    "save.recentMessages",
  );
}

// 9. Real integrity validation rejects duplicate IDs and dangling references.
{
  const duplicate = projectFixture();
  duplicate.world.locations[1].id = duplicate.world.locations[0].id;
  hasError(
    assertInputUnchanged(duplicate),
    "project_duplicate_entity_id",
    "world.locations[1].id",
  );

  const dangling = projectFixture();
  dangling.world.locations[0].connections = ["missing-location"];
  hasError(
    assertInputUnchanged(dangling),
    "project_dangling_reference",
    "world.locations[0].connections[0]",
  );
}

// 10. Bundle ownership mismatch is an error and is never repaired.
{
  const input = bundleFixture();
  input.save.projectId = "different-project";
  const result = assertInputUnchanged(input);
  hasError(result, "save_project_id_mismatch", "save.projectId");
  assert.equal(input.save.projectId, "different-project");
}

// 11-13. Conflicts are reported without changing data, in project/save order.
{
  const input = bundleFixture();
  const result = success(
    prepare(input, new Set([input.project.id]), new Set([input.save.id])),
  );
  assert.deepEqual(result.conflicts, [
    { code: "project_id_conflict", entityId: input.project.id },
    { code: "save_id_conflict", entityId: input.save.id },
  ]);
  assert.equal(result.project.id, input.project.id);
  if (result.kind === "game_bundle")
    assert.equal(result.save.id, input.save.id);

  const projectOnly = success(
    prepare(projectFixture(), new Set([input.project.id]), noIds),
  );
  assert.deepEqual(projectOnly.conflicts, [
    { code: "project_id_conflict", entityId: input.project.id },
  ]);

  const saveOnly = success(prepare(input, noIds, new Set([input.save.id])));
  assert.deepEqual(saveOnly.conflicts, [
    { code: "save_id_conflict", entityId: input.save.id },
  ]);
}

// 14-15. Success and failure preserve mutable and deeply frozen inputs.
{
  const valid = deepFreeze(bundleFixture());
  assert.equal(success(prepare(valid)).kind, "game_bundle");

  const invalid = bundleFixture();
  invalid.save.projectId = "frozen-mismatch";
  deepFreeze(invalid);
  hasError(prepare(invalid), "save_project_id_mismatch", "save.projectId");
}

// 16. Errors contain only codes, paths, and permitted IDs, never content.
{
  const secretText = "SENSITIVE_BUSINESS_BODY_5A";
  const input = bundleFixture();
  input.project.openingScene = secretText;
  input.save.recentMessages[0].content = secretText;
  (input.save as unknown as { history: unknown }).history = secretText;
  const result = prepare(input);
  assert.equal(result.ok, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secretText), false);
  assert.equal(serialized.includes(input.project.projectInfo.title), false);
  assert.deepEqual(Object.keys(errors(result)[0] ?? {}).sort(), [
    "code",
    "path",
  ]);
}

// Explicit future schema markers are rejected rather than interpreted as the
// mutable project revision or save turn.
for (const target of ["project", "save"] as const) {
  const input = target === "project" ? projectFixture() : bundleFixture();
  if (target === "project") {
    (input as unknown as Record<string, unknown>).schemaVersion = 999;
    hasError(
      assertInputUnchanged(input),
      "unsupported_project_schema_version",
      "schemaVersion",
    );
  } else {
    (input as ReturnType<typeof bundleFixture>).save = {
      ...input.save,
      schemaVersion: 999,
    } as never;
    hasError(
      assertInputUnchanged(input),
      "unsupported_save_schema_version",
      "save.schemaVersion",
    );
  }
}

// The production module has no persistence, UI, browser, or network imports.
{
  const source = readFileSync(
    new URL("./project-import-preparation.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "./db",
    "dexie",
    "react",
    "next/",
    "window",
    "document",
    "fetch(",
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden),
      false,
      `unexpected dependency: ${forbidden}`,
    );
  }
}

console.log("project import preparation tests passed");
