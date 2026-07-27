import assert from "node:assert/strict";
import { displayLocationName } from "./location-label.ts";

assert.equal(displayLocationName("old_district_safehouse", []), "旧城区安全屋");
assert.equal(displayLocationName("central_cathedral", []), "中央大教堂");
assert.equal(displayLocationName("safe_house", []), "安全屋");
assert.equal(displayLocationName("亚南旧街区", []), "亚南旧街区");
assert.equal(
  displayLocationName("old_district_safehouse", [
    { id: "old_district_safehouse", name: "猎人安全屋" },
  ]),
  "猎人安全屋",
);
assert.equal(displayLocationName("yharnam_clinic", []), "未命名地点");
assert.equal(displayLocationName("", []), "未知地点");

console.log("location label regression tests passed");
