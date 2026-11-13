// Phone layout choice and the zoom window (ui/layout.ts).
import assert from "node:assert/strict";
import { phoneLayout, zoomWindow } from "../src/ui/layout.ts";

// iPhone 14 portrait: a landscape clip leaves letterbox bars, the controls go there.
assert.equal(phoneLayout(390, 844, 16 / 9), "stacked");
assert.equal(phoneLayout(390, 844, 4 / 3), "stacked");
// A tall clip fills the screen: the controls float on it.
assert.equal(phoneLayout(390, 844, 9 / 16), "overlay");
assert.equal(phoneLayout(390, 844, 1), "overlay");
// No clip yet.
assert.equal(phoneLayout(390, 844, null), "overlay");
// iPhone SE: 16:9 still stacks (compact row), 4:3 does not fit.
assert.equal(phoneLayout(320, 568, 16 / 9), "stacked");
assert.equal(phoneLayout(320, 568, 4 / 3), "overlay");
// A phone on its side, whatever the clip; a tablet or a desktop window on its side is not one.
assert.equal(phoneLayout(844, 390, 16 / 9), "landscape");
assert.equal(phoneLayout(844, 390, 9 / 16), "landscape");
assert.equal(phoneLayout(932, 430, null), "landscape");
assert.equal(phoneLayout(900, 700, 16 / 9), "overlay");

// The zoom window: the fitted box at fit, growing into the free area when zoomed, never past it.
assert.deepEqual(zoomWindow(390, 219, 390, 460, 1, true), [390, 219]);
assert.deepEqual(zoomWindow(390, 219, 390, 460, 1.5, true), [390, 328.5]);
assert.deepEqual(zoomWindow(390, 219, 390, 460, 3, true), [390, 460]);
assert.deepEqual(zoomWindow(390, 219, 390, 460, 3, false), [390, 219]);
// A pillarboxed picture grows sideways.
assert.deepEqual(zoomWindow(219, 390, 788, 390, 2, true), [438, 390]);

console.log("layout: ok");
