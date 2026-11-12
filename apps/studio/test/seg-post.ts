// The session tests' stand-in for the worker's postMessage (seg/seg-serve.ts): a session's frames reach the test
// the way they reach the main thread, through a structured clone with the worker's own transfer list
// (session.ts frameTransfers). A buffer named twice in that list throws there ("ArrayBuffer at index 3 is a
// duplicate of an earlier ArrayBuffer", which ended every pass at its first seed, 12 Nov), and a buffer the session
// goes on using after it was handed over is detached, as in the worker. The tests' fake models used to take the
// frames as the same objects, so neither could show.
import { frameTransfers, type SessionFrameOut } from "../src/pipeline/seg/session.ts";

export function postFrames(items: SessionFrameOut[]): SessionFrameOut[] {
  return structuredClone(items, { transfer: frameTransfers(items) });
}
