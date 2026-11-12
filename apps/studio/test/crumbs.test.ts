// Crash breadcrumbs (crumbs.ts): which last sessions count as crashed. A fresh browser never does; a session that
// did not end does; and a page that was left cleanly stays so whatever is written after its pagehide (the browser's
// visibilitychange on a reload came after it and its step took the "page closed" mark off: "The page crashed last
// time" on the first visit, after the reload for cross-origin isolation).
//   node --experimental-strip-types apps/studio/test/crumbs.test.ts
import assert from "node:assert/strict";

// The page's globals, as far as crumbs.ts uses them. One storage for all "page loads" of the test.
const store = new Map<string, string>();
const handlers = new Map<string, ((e: unknown) => void)[]>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
g.addEventListener = (type: string, fn: (e: unknown) => void) => { handlers.set(type, [...(handlers.get(type) ?? []), fn]); };
const doc = { visibilityState: "visible", addEventListener: (type: string, fn: (e: unknown) => void) => { handlers.set(`doc:${type}`, [...(handlers.get(`doc:${type}`) ?? []), fn]); } };
g.document = doc;
const fire = (type: string, e: unknown = {}) => { for (const fn of handlers.get(type) ?? []) fn(e); };

const { startCrumbs, crumb, lastCrash, sessionCrumbs, exportCrashed } = await import("../src/pipeline/crumbs.ts");
// The module's warning for a crashed session is expected below.
const warn = console.warn;
console.warn = () => undefined;

/** A new page load (the module's listeners of the load before are the dead page's: dropped). */
const load = () => { handlers.clear(); doc.visibilityState = "visible"; startCrumbs("test"); };
/** The page is reloaded or closed, as a browser does it: pagehide, then visibilitychange (hidden). The studio writes
 * a step on visibilitychange (studio.ts). */
const leave = () => { fire("pagehide"); doc.visibilityState = "hidden"; fire("doc:visibilitychange"); crumb("page hidden"); };

// A fresh browser: empty storage → no crash.
{
  store.clear();
  load();
  assert.equal(lastCrash(), null, "nothing in storage: no crash");
  assert.equal(sessionCrumbs().length, 1, "this session's first step");
}

// The first visit's reload (cross-origin isolation, main.tsx): the page is left cleanly, a step comes after its
// pagehide, and the second load must not read that as a crash.
{
  store.clear();
  load();
  crumb("clip opened");
  leave();
  assert.equal(sessionCrumbs().at(-1), "· page closed", "the session stays marked as ended after a late step");
  load();
  assert.equal(lastCrash(), null, "a reload is not a crash");
  // ...and again (every later visit).
  leave();
  load();
  assert.equal(lastCrash(), null);
}

// A session that did not end (the page died: no pagehide) → the next load has its steps.
{
  store.clear();
  load();
  crumb("export start (offline, 3840×2160)");
  crumb("export 40% (3840×2160, 11.0 fps)");
  load();
  const c = lastCrash();
  assert.ok(c && c.length === 3, "the dead session's steps");
  assert.match(c![2], /export 40%/);
  assert.equal(exportCrashed(c), true);
  // The load after that one is clean again.
  leave();
  load();
  assert.equal(lastCrash(), null);
}

// Hidden without a pagehide (the app in the background), then killed there: not ended, as before.
{
  store.clear();
  load();
  doc.visibilityState = "hidden";
  fire("doc:visibilitychange");
  crumb("page hidden");
  load();
  assert.ok(lastCrash(), "a page that died in the background did not end");
}

// Back from the back/forward cache: the page is alive again, its steps count, and dying then is a crash.
{
  store.clear();
  load();
  leave();
  doc.visibilityState = "visible";
  fire("pageshow", { persisted: true });
  crumb("tap 0.50,0.50");
  assert.match(sessionCrumbs().at(-1)!, /tap 0\.50/);
  load();
  assert.ok(lastCrash(), "died after coming back from the cache");
}

console.warn = warn;
console.log("crumbs: a fresh browser and a reload are no crash; a session that did not end is: ok");
