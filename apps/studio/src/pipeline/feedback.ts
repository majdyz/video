// Send feedback (pure): the report text a beta tester shares, and a prefilled GitHub issue link. There is no
// backend: the report leaves through the share sheet (to whoever invited them), the clipboard, or the issue page.

export type FeedbackContext = {
  build: string;
  /** "key: value" lines about the device and the session (App collects them). */
  device: string[];
  /** This session's breadcrumbs (crumbs.ts). */
  steps: string[];
  /** The last session's steps when it crashed. */
  crash: string[] | null;
};

/** What rides along with the message: build, device, the steps. */
export function feedbackAttachment(ctx: FeedbackContext): string {
  const parts = [`Build ${ctx.build}`, ...ctx.device];
  if (ctx.crash?.length) parts.push("", "Last session crashed; its last steps:", ...ctx.crash);
  if (ctx.steps.length) parts.push("", "This session:", ...ctx.steps);
  return parts.join("\n");
}

/** The whole report: the message first, then what is attached. */
export function feedbackReport(message: string, ctx: FeedbackContext): string {
  return `${message.trim() || "(no message)"}\n\n${feedbackAttachment(ctx)}`;
}

/** The issue title: the message's first line, shortened. */
export function feedbackTitle(message: string): string {
  const first = message.trim().split("\n")[0].trim();
  const t = first.length > 70 ? `${first.slice(0, 69).trimEnd()}…` : first;
  return `Beta feedback: ${t || "(no message)"}`;
}

/** Long URLs fail on GitHub (and in some browsers) past ~8 KB; stay well under. */
export const ISSUE_URL_MAX = 6000;
export const TRUNCATED = "\n\n(cut short to fit the link; the full report was copied to the clipboard)";

/**
 * A new-issue link with title and body prefilled, the body cut (from the end: the message comes first) so the whole
 * URL is at most `max` characters. `truncated` says whether it was cut.
 */
export function issueUrl(repo: string, title: string, body: string, max = ISSUE_URL_MAX): { url: string; truncated: boolean } {
  const make = (b: string) => `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(b)}`;
  const full = make(body);
  if (full.length <= max) return { url: full, truncated: false };
  // Never half a surrogate pair (encodeURIComponent throws on a lone one).
  const prefix = (n: number) => { const c = body.slice(0, n); return /[\uD800-\uDBFF]$/.test(c) ? c.slice(0, -1) : c; };
  // Longest prefix that fits (the encoded length grows with the prefix).
  let lo = 0, hi = body.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (make(prefix(mid) + TRUNCATED).length <= max) lo = mid;
    else hi = mid - 1;
  }
  return { url: make(prefix(lo) + TRUNCATED), truncated: true };
}
