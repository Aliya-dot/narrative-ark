import assert from "node:assert/strict";
import {
  DEFAULT_PLAY_LAYOUT,
  readPlayLayout,
  writePlayLayout,
} from "./play-layout-persistence.ts";

const values = new Map<string, string>();
const storage = {
  getItem(key: string) {
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    values.set(key, value);
  },
};

assert.deepEqual(readPlayLayout(storage, "missing"), DEFAULT_PLAY_LAYOUT);

values.set(
  "valid",
  JSON.stringify({ leftOpen: false, rightOpen: true, immersive: true }),
);
assert.deepEqual(readPlayLayout(storage, "valid"), {
  leftOpen: false,
  rightOpen: true,
  immersive: true,
});

values.set(
  "invalid-types",
  JSON.stringify({ leftOpen: "false", rightOpen: 0, immersive: null }),
);
assert.deepEqual(readPlayLayout(storage, "invalid-types"), DEFAULT_PLAY_LAYOUT);

values.set("invalid-json", "{");
assert.deepEqual(readPlayLayout(storage, "invalid-json"), DEFAULT_PLAY_LAYOUT);

assert.equal(
  writePlayLayout(storage, "saved", {
    leftOpen: false,
    rightOpen: false,
    immersive: true,
  }),
  true,
);
assert.deepEqual(JSON.parse(values.get("saved") || ""), {
  leftOpen: false,
  rightOpen: false,
  immersive: true,
});

const throwingStorage = {
  getItem() {
    throw new Error("storage disabled");
  },
  setItem() {
    throw new Error("storage disabled");
  },
};
assert.deepEqual(
  readPlayLayout(throwingStorage, "layout"),
  DEFAULT_PLAY_LAYOUT,
);
assert.equal(
  writePlayLayout(throwingStorage, "layout", DEFAULT_PLAY_LAYOUT),
  false,
);

console.log("play layout persistence tests passed");
