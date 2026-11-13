import { Component, type ReactNode } from "react";
import { crumb } from "../pipeline/crumbs.ts";

/**
 * The app's last line: a render exception shows a way back instead of a blank page (the 25 Oct blank-page incident),
 * and what threw goes to the breadcrumbs (About, the crash toast on the next launch).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    crumb(`ui crashed: ${error.message.slice(0, 160)}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <h2>Something went wrong</h2>
        <p>The editor hit an error. Your clip is not changed.</p>
        <button type="button" className="btn btn--primary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

/** Uncaught errors and rejections on the main thread go to the breadcrumbs too (the seg worker has its own). */
export function catchGlobalErrors(): void {
  window.addEventListener("error", (e) => crumb(`error: ${String(e.message ?? e.error ?? "?").slice(0, 160)}`));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string } | undefined;
    crumb(`unhandled rejection: ${String(r?.message ?? r ?? "?").slice(0, 160)}`);
  });
}
