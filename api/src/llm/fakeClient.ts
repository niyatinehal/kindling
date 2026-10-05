import type { ExtractArgs, LlmClient, LlmFailureReason, LlmResult } from "./client.js";

/**
 * One scripted answer: either a raw answer, which goes through the caller's
 * real `validate` exactly as a provider's would, or a failure.
 */
export type FakeStep =
  | { output: unknown; latencyMs?: number }
  | { fail: LlmFailureReason; retryable?: boolean; latencyMs?: number };

/**
 * A provider stand-in for tests. CI never calls a real model.
 *
 * Steps are consumed in order and the last one repeats, so a single failure
 * step means "fails every time". `calls` records every request, which is how a
 * test proves the client was — or was not — reached.
 */
export class FakeLlmClient implements LlmClient {
  readonly enabled = true;
  readonly model = "fake";
  readonly calls: ExtractArgs<unknown>[] = [];
  private readonly steps: readonly FakeStep[];

  constructor(steps: readonly FakeStep[]) {
    this.steps = steps;
  }

  extract<T>(args: ExtractArgs<T>): Promise<LlmResult<T>> {
    this.calls.push(args);
    const step = this.steps[Math.min(this.calls.length - 1, this.steps.length - 1)];
    const latencyMs = step?.latencyMs ?? 5;

    if (step === undefined || "fail" in step) {
      return Promise.resolve({
        ok: false,
        reason: step?.fail ?? "provider_error",
        retryable: step?.retryable ?? false,
        latencyMs,
      });
    }

    try {
      return Promise.resolve({
        ok: true,
        value: args.validate(step.output),
        usage: { inputTokens: 100, outputTokens: 20 },
        latencyMs,
        model: "fake",
      });
    } catch {
      return Promise.resolve({ ok: false, reason: "invalid_output", retryable: false, latencyMs });
    }
  }
}
