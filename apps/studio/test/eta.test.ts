import assert from "node:assert/strict";
import { colourStatus, etaShort, etaText, Eta } from "../src/pipeline/eta.ts";

assert.equal(etaText(0, 0.01, 10_000), null, "too little progress");
assert.equal(etaText(0, 0.5, 2_000), null, "too early");
assert.equal(etaText(0, 0.5, 20_000), "under a minute left");
assert.equal(etaText(0, 0.25, 60_000), "about 3 min left");
assert.equal(etaText(0, 0.5, 70_000), "about a minute left");
const e = new Eta();
assert.equal(e.text(0.1, 1_000), null);
assert.equal(e.text(0.2, 61_000), "about 4 min left");
// The short form (the status chip's second line): the same estimate, the same quiet start.
assert.equal(etaShort(0, 0.01, 10_000), null);
assert.equal(etaShort(0, 0.5, 2_000), null);
assert.equal(etaShort(0, 0.5, 20_000), "under 1 min left");
assert.equal(etaShort(0, 0.5, 70_000), "1 min left");
assert.equal(etaShort(0, 0.25, 60_000), "3 min left");
assert.equal(e.short(0.2, 61_000), "4 min left", "one run: the same start as text()");
assert.equal(new Eta().short(null), null);
// The colour profile's pill: plain words, whole seconds, never "0 s".
assert.equal(colourStatus(null), "Fine-tuning colour…");
assert.equal(colourStatus(3.2), "Fine-tuning colour… 4 s left");
assert.equal(colourStatus(0.1), "Fine-tuning colour… 1 s left");
assert.equal(colourStatus(-2), "Fine-tuning colour… 1 s left");
assert.equal(colourStatus(Infinity), "Fine-tuning colour…");
console.log("eta tests passed");
