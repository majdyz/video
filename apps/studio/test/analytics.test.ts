// Usage counts: which page loads are counted (analytics.ts countable). Our own test runs must not be.
//   node --experimental-strip-types apps/studio/test/analytics.test.ts
import assert from "node:assert/strict";
import { countable } from "../src/pipeline/analytics.ts";

const visitor = { optOut: false, beacon: true, webdriver: false, hostname: "majdyz.github.io", search: "", native: false, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1" };
assert.equal(countable(visitor), true, "a visitor is counted");
assert.equal(countable({ ...visitor, search: "?intro=1&v=123" }), true, "other flags do not switch it off");
assert.equal(countable({ ...visitor, optOut: true }), false, "the opt-out (About, or the key our test scripts set)");
assert.equal(countable({ ...visitor, search: "?debug=1&v=123" }), false, "?debug=1: our headless checks");
assert.equal(countable({ ...visitor, search: "?debug" }), false, "?debug without a value");
assert.equal(countable({ ...visitor, webdriver: true }), false, "automation that says so");
assert.equal(countable({ ...visitor, ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/131.0 Safari/537.36" }), false, "headless Chrome");
assert.equal(countable({ ...visitor, hostname: "localhost" }), false);
assert.equal(countable({ ...visitor, hostname: "127.0.0.1" }), false);
assert.equal(countable({ ...visitor, hostname: "192.168.1.20" }), false);
assert.equal(countable({ ...visitor, native: true }), false, "the native shell");
assert.equal(countable({ ...visitor, beacon: false }), false);
console.log("analytics tests passed");
