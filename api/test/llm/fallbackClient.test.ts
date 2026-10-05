import { describe, expect, it } from "@jest/globals";

import { disabledLlmClient } from "../../src/llm/client.js";
import type { ExtractArgs, LlmClient, LlmResult } from "../../src/llm/client.js";
import { createFallbackLlmClient } from "../../src/llm/fallbackClient.js";

/** A provider that answers a fixed result after a fixed delay, recording its calls. */
function provider(model: string, result: LlmResult<unknown>, delayMs = 0) {
  const calls: ExtractArgs<unknown>[] = [];
  const client: LlmClient = {
    enabled: true,
    model,
    extract<T>(args: ExtractArgs<T>) {
      calls.push(args);
      return new Promise<LlmResult<T>>((resolve) => {
        setTimeout(() => {
          resolve(result as LlmResult<T>);
        }, delayMs);
      });
    },
  };
  return { client, calls };
}

const ok = (model: string): LlmResult<unknown> => ({
  ok: true,
  value: { from: model },
  usage: { inputTokens: 1, outputTokens: 1 },
  latencyMs: 1,
  model,
});
const fail = (reason: "timeout" | "provider_error" | "invalid_output"): LlmResult<unknown> => ({
  ok: false,
  reason,
  retryable: false,
  latencyMs: 1,
});

const args: ExtractArgs<unknown> = {
  system: "s",
  user: "u",
  schema: {},
  validate: (raw) => raw,
  timeoutMs: 2_000,
};

describe("createFallbackLlmClient", () => {
  it("answers from the first provider when it succeeds, without asking the next", async () => {
    const first = provider("a", ok("a"));
    const second = provider("b", ok("b"));

    const result = await createFallbackLlmClient([first.client, second.client]).extract(args);

    expect(result).toMatchObject({ ok: true, model: "a" });
    expect(second.calls).toHaveLength(0);
  });

  it("moves on after a fast failure, such as an exhausted quota", async () => {
    const first = provider("a", fail("provider_error"));
    const second = provider("b", ok("b"));

    expect(
      await createFallbackLlmClient([first.client, second.client]).extract(args),
    ).toMatchObject({ ok: true, model: "b" });
  });

  it("stops after a timeout, which has already used the time", async () => {
    const first = provider("a", fail("timeout"));
    const second = provider("b", ok("b"));

    const result = await createFallbackLlmClient([first.client, second.client]).extract(args);

    expect(result).toMatchObject({ ok: false, reason: "timeout" });
    expect(second.calls).toHaveLength(0);
  });

  // The budget is for the whole chain, so two providers never double the wait.
  it("gives the next provider only the time that is left", async () => {
    const first = provider("a", fail("provider_error"), 500);
    const second = provider("b", ok("b"));

    await createFallbackLlmClient([first.client, second.client]).extract(args);

    expect(second.calls[0]?.timeoutMs).toBeLessThanOrEqual(1_500);
    expect(second.calls[0]?.timeoutMs).toBeGreaterThan(1_300);
  });

  it("is the one client itself when only one is enabled, and disabled when none are", () => {
    const only = provider("a", ok("a"));

    expect(createFallbackLlmClient([disabledLlmClient, only.client])).toBe(only.client);
    expect(createFallbackLlmClient([disabledLlmClient]).enabled).toBe(false);
  });
});
