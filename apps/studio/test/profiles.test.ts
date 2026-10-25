import { test } from "node:test";
import assert from "node:assert/strict";
import { DEWARP_PROFILES } from "../src/pipeline/tools.ts";
import { PROFILES } from "../../dewarp/src/profiles.ts";

test("every studio dewarp chip points at an existing dewarp profile", () => {
  for (const c of DEWARP_PROFILES) assert.ok(PROFILES[c.id], `missing profile ${c.id}`);
});
