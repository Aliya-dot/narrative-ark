import assert from "node:assert/strict";
import {
  resolveAndroidBackAction,
  resolvePlayShortcut,
} from "./play-interaction.ts";

assert.equal(resolvePlayShortcut({ key: "F11", editable: true }), "fullscreen");
assert.equal(
  resolvePlayShortcut({ key: "s", ctrlKey: true, editable: false }),
  "save",
);
assert.equal(
  resolvePlayShortcut({
    key: "f",
    ctrlKey: true,
    shiftKey: true,
    editable: false,
  }),
  "immersive",
);
assert.equal(
  resolvePlayShortcut({ key: "1", altKey: true, editable: false }),
  "status",
);
assert.deepEqual(resolvePlayShortcut({ key: "3", editable: false }), {
  choiceIndex: 2,
});
assert.equal(resolvePlayShortcut({ key: "3", editable: true }), null);

assert.equal(
  resolveAndroidBackAction({
    modalOpen: true,
    menuOpen: true,
    confirmationOpen: true,
    section: "world",
    editing: true,
    canGoBack: true,
  }),
  "close-modal",
);
assert.equal(
  resolveAndroidBackAction({
    modalOpen: false,
    menuOpen: false,
    confirmationOpen: false,
    section: "world",
    editing: false,
    canGoBack: true,
  }),
  "show-story",
);
assert.equal(
  resolveAndroidBackAction({
    modalOpen: false,
    menuOpen: false,
    confirmationOpen: false,
    section: "story",
    editing: true,
    canGoBack: true,
  }),
  "dismiss-keyboard",
);
assert.equal(
  resolveAndroidBackAction({
    modalOpen: false,
    menuOpen: false,
    confirmationOpen: false,
    section: "story",
    editing: false,
    canGoBack: false,
  }),
  "home",
);

console.log("play platform interaction tests passed");
