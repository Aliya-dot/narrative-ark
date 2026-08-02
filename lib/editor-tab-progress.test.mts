import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readEditorTabProgress,
  saveEditorTabProgress,
  type EditorTabProgressMap,
} from "./editor-tab-progress.ts";

const progress: EditorTabProgressMap = {};

assert.deepEqual(readEditorTabProgress(progress, "projectInfo"), {
  pageY: 0,
  panelY: 0,
});

saveEditorTabProgress(progress, "projectInfo", {
  pageY: 840,
  panelY: 220,
});
saveEditorTabProgress(progress, "characters", {
  pageY: 1560,
  panelY: 715,
});

assert.deepEqual(readEditorTabProgress(progress, "projectInfo"), {
  pageY: 840,
  panelY: 220,
});
assert.deepEqual(readEditorTabProgress(progress, "characters"), {
  pageY: 1560,
  panelY: 715,
});
assert.deepEqual(readEditorTabProgress(progress, "story"), {
  pageY: 0,
  panelY: 0,
});

saveEditorTabProgress(progress, "world", {
  pageY: Number.NaN,
  panelY: -20,
});
assert.deepEqual(readEditorTabProgress(progress, "world"), {
  pageY: 0,
  panelY: 0,
});

const editorSource = readFileSync(
  new URL("../app/editor/[id]/page.tsx", import.meta.url),
  "utf8",
);
assert.match(
  editorSource,
  /saveEditorTabProgress\(tabProgressRef\.current, key/,
);
assert.match(
  editorSource,
  /readEditorTabProgress\(tabProgressRef\.current, key/,
);
assert.match(editorSource, /pageY: window\.scrollY/);
assert.match(editorSource, /ref=\{editorPanelRef\}/);

console.log("editor tab progress tests passed");
