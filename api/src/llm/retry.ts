import type { LlmResult } from "./client.js";

/**
 * The retry policy every model feature shares: one more attempt after a 5xx or
 * a dropped connection, never after a timeout, and only while enough of the
 * overall budget is left for the second attempt to be worth starting.
 */
export async function withOneRetry<T>(
  attempt: (timeoutMs: number) => Promise<LlmResult<T>>,
  budget: { timeoutMs: number; totalMs: number; minRetryMs: number },
): Promise<LlmResult<T>> {
  const first = await attempt(budget.timeoutMs);
  if (first.ok || !first.retryable) {
    return first;
  }
  const remaining = budget.totalMs - first.latencyMs;
  return remaining >= budget.minRetryMs ? attempt(Math.min(budget.timeoutMs, remaining)) : first;
}
