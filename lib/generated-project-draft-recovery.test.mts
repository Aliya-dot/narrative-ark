import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  availableGenerationFailureActions,
  classifyGenerationFailure,
  enterGeneratedProject,
  retainSavedProjectCleanupFailure,
  retryGeneratedProjectDraftCleanup,
} = await import("./generated-project-draft-recovery.ts");
const { GeneratedProjectDraftCleanupError } = await import(
  "./generated-project-finalization.ts"
);

let checks = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  await run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

await check("cleanup failures expose only safe recovery actions", async () => {
  const failure = classifyGenerationFailure(
    new GeneratedProjectDraftCleanupError(new Error("delete failed")),
    "saved-project",
  );
  assert.equal(failure.kind, "draft_cleanup_failed");
  assert.equal(failure.projectSaved, true);
  assert.equal(failure.projectId, "saved-project");
  assert.match(failure.message, /项目已经保存/);
  assert.deepEqual(availableGenerationFailureActions(failure), [
    "retry_draft_cleanup",
    "enter_saved_project",
  ]);
});

await check("ordinary failures retain generation retry", async () => {
  const failure = classifyGenerationFailure(
    new Error("stage failed"),
    "unused-project",
  );
  assert.deepEqual(failure, {
    kind: "generation_failed",
    message: "stage failed",
  });
  assert.deepEqual(availableGenerationFailureActions(failure), [
    "retry_generation",
  ]);
});

await check("cleanup retry only deletes the current draft then enters", async () => {
  const events: string[] = [];
  await retryGeneratedProjectDraftCleanup({
    draftId: "current-draft",
    async deleteDraft(draftId) {
      events.push(`deleteDraft:${draftId}`);
    },
    enterSavedProject() {
      events.push("enterSavedProject");
    },
  });
  assert.deepEqual(events, [
    "deleteDraft:current-draft",
    "enterSavedProject",
  ]);
});

await check("failed cleanup retry preserves saved-project semantics", async () => {
  const events: string[] = [];
  await assert.rejects(
    retryGeneratedProjectDraftCleanup({
      draftId: "current-draft",
      async deleteDraft(draftId) {
        events.push(`deleteDraft:${draftId}`);
        throw new Error("still unavailable");
      },
      enterSavedProject() {
        events.push("enterSavedProject");
      },
    }),
    /still unavailable/,
  );
  const retained = retainSavedProjectCleanupFailure("saved-project");
  assert.equal(retained.kind, "draft_cleanup_failed");
  assert.equal(retained.projectSaved, true);
  assert.equal(retained.projectId, "saved-project");
  assert.match(retained.message, /仍已安全保存/);
  assert.deepEqual(events, ["deleteDraft:current-draft"]);
  assert.deepEqual(availableGenerationFailureActions(retained), [
    "retry_draft_cleanup",
    "enter_saved_project",
  ]);
});

await check("entering a saved project only navigates with its id", async () => {
  const events: string[] = [];
  enterGeneratedProject("saved-project", (href) => {
    events.push(`navigate:${href}`);
  });
  assert.deepEqual(events, ["navigate:/editor/saved-project"]);
});

await check("the generation page wires dedicated recovery callbacks", async () => {
  const page = await readFile(
    new URL("../app/generate/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /error instanceof GeneratedProjectDraftCleanupError/);
  assert.match(
    page,
    /failure\?\.kind !== "draft_cleanup_failed"[\s\S]*onClick=\{\(\) => run\(state, config\)\}/,
  );
  assert.match(
    page,
    /retryGeneratedProjectDraftCleanup\(\{[\s\S]*draftId: id,[\s\S]*deleteDraft: \(draftId\) => db\.drafts\.delete\(draftId\),[\s\S]*enterSavedProject:/,
  );
  assert.match(
    page,
    /enterGeneratedProject\(failure\.projectId, router\.replace\)/,
  );
  assert.equal(page.match(/db\.projects\.put/g)?.length, 1);
});

console.log(`generated project draft recovery tests passed (${checks} checks)`);
