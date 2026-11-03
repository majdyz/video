import { useEffect, useState } from "react";
import { BRAND } from "../brand.ts";
import { feedbackAttachment, feedbackReport, feedbackTitle, issueUrl, type FeedbackContext } from "../pipeline/feedback.ts";
import { Sheet } from "./sheet";

/**
 * Send feedback: a message plus the device, build and breadcrumbs, sent the tester's own way (no backend, nobody's
 * address in the page): the share sheet (WhatsApp, Messages, Mail to whoever invited them), the clipboard, or a
 * prefilled GitHub issue. `context` is read when the sheet opens, so the steps are current.
 */
export function FeedbackSheet({ open, onClose, context }: { open: boolean; onClose: () => void; context: () => FeedbackContext }) {
  const [message, setMessage] = useState("");
  const [ctx, setCtx] = useState<FeedbackContext | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setCtx(context()); setNote(null); }
  }, [open, context]);
  if (!ctx && !open) return null;
  const c = ctx ?? context();
  const report = feedbackReport(message, c);
  const issue = issueUrl(BRAND.issues, feedbackTitle(message), report);
  const canShare = typeof navigator.share === "function";

  const copy = async (done: string) => {
    try {
      await navigator.clipboard.writeText(report);
      setNote(done);
    } catch {
      setNote("Couldn't copy here: select the text under What's attached instead");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: `${BRAND.name} feedback`, text: report });
      setNote("Sent. Thank you!");
    } catch (e) {
      // Closing the share sheet is not an error; anything else falls back to the clipboard.
      if ((e as Error)?.name !== "AbortError") await copy("Sharing didn't work here, so the report was copied: paste it into a message");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Send feedback">
      <div className="feedback">
        <p>What happened, or what would make it better? The report goes wherever you send it (a message to whoever invited you works): nothing is sent by itself.</p>
        <label className="feedback__field">
          <span className="sr-only">Your message</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="The export stopped at 40% on my iPhone 13…" />
        </label>
        <details className="feedback__attached">
          <summary>What's attached: device, build {c.build}, {c.steps.length} recent {c.steps.length === 1 ? "step" : "steps"}{c.crash ? ", the last crash" : ""}</summary>
          <pre className="crash-log">{feedbackAttachment(c)}</pre>
        </details>
        <div className="feedback__actions">
          {canShare && <button type="button" className="btn btn--strong btn--block" onClick={() => void share()}>Share report…</button>}
          <button type="button" className={`btn btn--block ${canShare ? "btn--ghost" : "btn--strong"}`} onClick={() => void copy("Copied: paste it into a message to whoever invited you")}>Copy report</button>
          <a className="link-btn feedback__issue" href={issue.url} target="_blank" rel="noreferrer" onClick={() => { if (issue.truncated) void copy("The issue text was cut short to fit the link; the full report is copied, paste it there"); }}>
            Open a GitHub issue (public)
          </a>
        </div>
        {note && <p className="feedback__note" role="status">{note}</p>}
      </div>
    </Sheet>
  );
}
