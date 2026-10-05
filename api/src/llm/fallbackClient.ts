import type { ExtractArgs, LlmClient, LlmResult } from "./client.js";

/**
 * Several providers behind one `LlmClient`, tried in order.
 *
 * Redundancy against one provider being down or out of quota, all inside the
 * caller's time budget: `timeoutMs` is the limit for the whole chain, not per
 * provider, so a chain of two never doubles the wait. A provider that times
 * out has used that time, so the chain stops there; one that fails fast — a
 * 429, a 5xx, a bad key, or output that failed validation — hands the
 * remaining time to the next.
 *
 * Every provider is held to the same schema and the same `validate`, so which
 * one answered changes nothing downstream except the model recorded.
 */
export function createFallbackLlmClient(clients: readonly LlmClient[]): LlmClient {
  const enabled = clients.filter((client) => client.enabled);
  if (enabled.length === 1 && enabled[0] !== undefined) {
    return enabled[0];
  }

  return {
    enabled: enabled.length > 0,
    model: enabled.map((client) => client.model).join("|") || "none",

    async extract<T>(args: ExtractArgs<T>): Promise<LlmResult<T>> {
      const started = Date.now();
      let last: LlmResult<T> = { ok: false, reason: "disabled", retryable: false, latencyMs: 0 };

      for (const client of enabled) {
        const remaining = args.timeoutMs - (Date.now() - started);
        // Too little left for a call to have any chance: stop rather than start one.
        if (remaining < 250) break;

        last = await client.extract({ ...args, timeoutMs: remaining });
        if (last.ok || last.reason === "timeout") break;
      }

      return last.ok ? last : { ...last, latencyMs: Date.now() - started };
    },
  };
}
