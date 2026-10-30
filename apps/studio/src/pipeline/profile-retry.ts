// Clip profile samples under load: an analysis that fails or takes longer
// than its budget used to be dropped, and with too few samples the clip got no
// scene lock at all (seen on a loaded machine: 2–6 of 8 samples dropped, the
// lock skipped or different from run to run, so two exports of one clip
// differed). A sample is now retried with a longer budget each time; only a
// sample that fails every attempt is left out.

/** Sampling rounds per profile run: each re-takes only the samples a framing change threw away. */
export const PROFILE_MAX_ROUNDS = 8;

/** Analysis budgets (ms) per attempt: a slow device gets more time, not fewer samples. */
export const PROFILE_SAMPLE_BUDGETS_MS = [10_000, 20_000, 40_000] as const;

/**
 * Runs `attempt(budgetMs, n)` until one resolves, with the next budget after a
 * failure or timeout; null when every attempt failed (or `alive()` turns false).
 */
export async function withRetries<T>(
  attempt: (budgetMs: number, n: number) => Promise<T>,
  budgets: readonly number[] = PROFILE_SAMPLE_BUDGETS_MS,
  alive: () => boolean = () => true,
  onRetry?: (n: number, err: unknown) => void,
): Promise<T | null> {
  for (let n = 0; n < budgets.length; n++) {
    if (!alive()) return null;
    try {
      return await attempt(budgets[n], n);
    } catch (err) {
      if (n + 1 < budgets.length) onRetry?.(n + 1, err);
    }
  }
  return null;
}
