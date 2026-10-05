/**
 * A circuit breaker for the model provider.
 *
 * Without one, an outage costs every parse the full timeout before it falls
 * back. After `threshold` failures inside `windowMs`, the breaker opens and the
 * model is skipped outright for `cooldownMs`; after that it closes again and
 * the next call is a real attempt.
 *
 * In memory, per process. One instance is what this service runs, and a
 * breaker that resets on deploy is harmless: the worst case is a few more
 * timeouts while it relearns that the provider is down.
 */
export type CircuitBreaker = {
  isOpen(): boolean;
  recordFailure(): void;
  recordSuccess(): void;
};

export function createCircuitBreaker(
  options: {
    threshold?: number;
    windowMs?: number;
    cooldownMs?: number;
    now?: () => number;
  } = {},
): CircuitBreaker {
  const threshold = options.threshold ?? 5;
  const windowMs = options.windowMs ?? 60_000;
  const cooldownMs = options.cooldownMs ?? 60_000;
  const now = options.now ?? (() => Date.now());

  let failures: number[] = [];
  let openedAt: number | null = null;

  return {
    isOpen() {
      if (openedAt === null) {
        return false;
      }
      if (now() - openedAt < cooldownMs) {
        return true;
      }
      openedAt = null;
      failures = [];
      return false;
    },

    recordFailure() {
      const at = now();
      failures = [...failures.filter((time) => at - time < windowMs), at];
      if (failures.length >= threshold) {
        openedAt = at;
      }
    },

    recordSuccess() {
      failures = [];
    },
  };
}
