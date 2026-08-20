export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the oldest counted attempt falls out of the window. */
  retryAfterSeconds: number;
};

/**
 * A sliding-window counter, in memory.
 *
 * In memory is a deliberate choice, not a shortcut deferred to later. The
 * alternative is a shared store, and every option for one means sending the
 * key — an email address or a phone number, so health-adjacent PII — to a
 * third party. This app's own rule is that free tiers are not acceptable for
 * data of that kind, and a paid store to hold counters is not a trade worth
 * making today. What this does buy is real: Vercel's Fluid Compute reuses an
 * instance across concurrent requests, so a burst from one source is very
 * likely counted by one limiter.
 *
 * What it does NOT do, stated plainly so nobody mistakes this for more than it
 * is: a patient attacker spread across instances and regions gets more
 * attempts than `limit`. This raises the cost of abuse; it does not close it.
 * The backstop is Supabase's own auth rate limits in the dashboard, which are
 * enforced centrally — this layer stops the cheap, loud attack that would
 * otherwise burn a day's email quota in a minute.
 *
 * Sliding rather than fixed windows: a fixed window lets `limit` attempts land
 * at the end of one window and `limit` more at the start of the next, which is
 * twice the intended rate in the moment that matters.
 */
export function createRateLimiter(options: { limit: number; windowMs: number }) {
  const attempts = new Map<string, number[]>();

  return function take(key: string, now: number = Date.now()): RateLimitVerdict {
    const cutoff = now - options.windowMs;
    const recent = (attempts.get(key) ?? []).filter((at) => at > cutoff);

    if (recent.length >= options.limit) {
      attempts.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)),
      };
    }

    recent.push(now);
    attempts.set(key, recent);

    // Keys go quiet far more often than they come back, so a map that only
    // ever grew would be a slow leak on a long-lived instance. Anything whose
    // every attempt has aged out is dropped on the next pass through.
    if (attempts.size > 1_000) {
      for (const [existing, times] of attempts) {
        if (times.every((at) => at <= cutoff)) attempts.delete(existing);
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  };
}
