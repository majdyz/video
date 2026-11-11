import assert from "node:assert/strict";
import { etaText, Eta } from "../src/pipeline/eta.ts";

assert.equal(etaText(0, 0.01, 10_000), null, "too little progress");
assert.equal(etaText(0, 0.5, 2_000), null, "too early");
assert.equal(etaText(0, 0.5, 20_000), "under a minute left");
assert.equal(etaText(0, 0.25, 60_000), "about 3 min left");
assert.equal(etaText(0, 0.5, 70_000), "about a minute left");
const e = new Eta();
assert.equal(e.text(0.1, 1_000), null);
assert.equal(e.text(0.2, 61_000), "about 4 min left");
console.log("eta tests passed");
