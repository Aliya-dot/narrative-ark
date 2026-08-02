import assert from "node:assert/strict";
import {
  BUILTIN_TRIAL_PROJECT,
  BUILTIN_TRIAL_PROJECT_ID,
  ensureBuiltInTrialProject,
} from "./builtin-trial-project.ts";
import { safeParseGameProject } from "./data-schemas.ts";
import type { GameProject } from "./types.ts";

const parsed = safeParseGameProject(BUILTIN_TRIAL_PROJECT);
assert.equal(parsed.success, true);
assert.equal(BUILTIN_TRIAL_PROJECT.projectInfo.title, "千风仙途");
assert.equal(BUILTIN_TRIAL_PROJECT_ID, "project_msbgeuha_3fe66fe3");
assert.ok(BUILTIN_TRIAL_PROJECT.openingScene.length > 1_000);
assert.equal(BUILTIN_TRIAL_PROJECT.characters.length, 5);
assert.equal(BUILTIN_TRIAL_PROJECT.story.chapters.length, 15);

const records = new Map<string, GameProject>();
let writes = 0;
const storage = {
  async readProject(id: string) {
    return records.get(id);
  },
  async writeProject(project: GameProject) {
    writes += 1;
    records.set(project.id, project);
  },
};

assert.equal(await ensureBuiltInTrialProject(storage), "installed");
assert.equal(writes, 1);
assert.notEqual(records.get(BUILTIN_TRIAL_PROJECT_ID), BUILTIN_TRIAL_PROJECT);

const installed = records.get(BUILTIN_TRIAL_PROJECT_ID);
assert.ok(installed);
installed.projectInfo.title = "用户修改后的标题";
assert.equal(await ensureBuiltInTrialProject(storage), "existing");
assert.equal(writes, 1);
assert.equal(
  records.get(BUILTIN_TRIAL_PROJECT_ID)?.projectInfo.title,
  "用户修改后的标题",
);

console.log("built-in trial project tests passed");
