/**
 * The one seam between Kindling and a model provider.
 *
 * Injected like `prisma` and `verify`, so tests pass a fake and production
 * passes a real client, and swapping provider is one new file behind this
 * interface. Every call answers with a result rather than throwing: the caller
 * always has a fallback, and a thrown provider error is how a slow model turns
 * into a 500.
 */
export type LlmFailureReason = "timeout" | "provider_error" | "invalid_output" | "disabled";

export type LlmResult<T> =
  | {
      ok: true;
      value: T;
      usage: { inputTokens: number; outputTokens: number };
      latencyMs: number;
      model: string;
    }
  | {
      ok: false;
      reason: LlmFailureReason;
      /**
       * Whether one more attempt could plausibly succeed: a 5xx or a dropped
       * connection, yes; a timeout, a 4xx or bad output, no. A timeout is
       * deliberately not retryable — the user is waiting, and a second slow
       * call doubles the wait.
       */
      retryable: boolean;
      latencyMs: number;
    };

export type ExtractArgs<T> = {
  system: string;
  user: string;
  /** JSON Schema for the tool input the provider is asked to fill. */
  schema: object;
  /** Parses the raw tool input, throwing on anything malformed. */
  validate: (raw: unknown) => T;
  timeoutMs: number;
};

export interface LlmClient {
  /** False for the kill-switched client, so callers and screens can skip the model entirely. */
  readonly enabled: boolean;
  extract<T>(args: ExtractArgs<T>): Promise<LlmResult<T>>;
}

/**
 * What runs when LLM_ENABLED is off or no key is configured. A missing key
 * means the feature is off, never that the service fails to boot.
 */
export const disabledLlmClient: LlmClient = {
  enabled: false,
  extract: () => Promise.resolve({ ok: false, reason: "disabled", retryable: false, latencyMs: 0 }),
};
