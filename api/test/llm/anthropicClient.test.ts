import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import Anthropic from "@anthropic-ai/sdk";

import { ANTHROPIC_MODEL, createAnthropicLlmClient } from "../../src/llm/anthropicClient.js";
import type { MessagesApi } from "../../src/llm/anthropicClient.js";

type Create = (
  body: unknown,
  options: { signal: AbortSignal; timeout: number; maxRetries: number },
) => Promise<unknown>;

/** A stand-in for `client.messages`. The suite never calls the real API. */
function stub(create: Create) {
  const spy = jest.fn(create);
  return { spy, messages: { create: spy } as unknown as MessagesApi };
}

const toolAnswer = (input: unknown, name = "record_result") => ({
  model: ANTHROPIC_MODEL,
  content: [{ type: "tool_use", id: "toolu_1", name, input }],
  usage: { input_tokens: 812, output_tokens: 31 },
});

const args = {
  system: "the system prompt",
  user: "<pantry>aloo</pantry>",
  schema: { type: "object" },
  validate: (raw: unknown) => {
    if (typeof raw !== "object" || raw === null || !("recognised" in raw)) {
      throw new Error("bad");
    }
    return raw as { recognised: string[] };
  },
  timeoutMs: 50,
};

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("createAnthropicLlmClient", () => {
  it("forces one strict tool call on Haiku and returns the validated input with usage", async () => {
    const { spy, messages } = stub(() => Promise.resolve(toolAnswer({ recognised: ["potato"] })));
    const llm = createAnthropicLlmClient({ apiKey: "unused", messages });

    const result = await llm.extract(args);

    expect(result).toMatchObject({
      ok: true,
      value: { recognised: ["potato"] },
      usage: { inputTokens: 812, outputTokens: 31 },
      model: ANTHROPIC_MODEL,
    });
    const [body, options] = spy.mock.calls[0] ?? [];
    expect(body).toMatchObject({
      model: "claude-haiku-4-5",
      system: "the system prompt",
      messages: [{ role: "user", content: "<pantry>aloo</pantry>" }],
      tools: [{ name: "record_result", strict: true, input_schema: { type: "object" } }],
      tool_choice: { type: "tool", name: "record_result" },
    });
    // The caller owns retries; the SDK's own would retry timeouts too.
    expect(options).toMatchObject({ timeout: 50, maxRetries: 0 });
  });

  it("reports invalid output when the model makes no tool call", async () => {
    const { messages } = stub(() =>
      Promise.resolve({ ...toolAnswer(null), content: [{ type: "text", text: "hello" }] }),
    );

    const result = await createAnthropicLlmClient({ apiKey: "unused", messages }).extract(args);

    expect(result).toMatchObject({ ok: false, reason: "invalid_output", retryable: false });
  });

  it("reports invalid output when validation throws", async () => {
    const { messages } = stub(() => Promise.resolve(toolAnswer({ something: "else" })));

    const result = await createAnthropicLlmClient({ apiKey: "unused", messages }).extract(args);

    expect(result).toMatchObject({ ok: false, reason: "invalid_output" });
  });

  it("aborts at the timeout and reports it as not retryable", async () => {
    const { messages } = stub(
      (_body, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(new Anthropic.APIUserAbortError());
          });
        }),
    );

    const result = await createAnthropicLlmClient({ apiKey: "unused", messages }).extract(args);

    expect(result).toMatchObject({ ok: false, reason: "timeout", retryable: false });
    expect(result.latencyMs).toBeGreaterThanOrEqual(45);
  });

  it("treats the SDK's own timeout as a timeout, not a connection failure", async () => {
    const { messages } = stub(() => Promise.reject(new Anthropic.APIConnectionTimeoutError()));

    const result = await createAnthropicLlmClient({ apiKey: "unused", messages }).extract(args);

    expect(result).toMatchObject({ ok: false, reason: "timeout", retryable: false });
  });

  it.each([
    ["a 5xx", () => new Anthropic.InternalServerError(529, undefined, "overloaded", new Headers())],
    ["a dropped connection", () => new Anthropic.APIConnectionError({ message: "socket hang up" })],
  ])("marks %s as retryable", async (_label, error) => {
    const { messages } = stub(() => Promise.reject(error()));

    const result = await createAnthropicLlmClient({ apiKey: "unused", messages }).extract(args);

    expect(result).toMatchObject({ ok: false, reason: "provider_error", retryable: true });
  });

  it.each([
    ["a bad request", () => new Anthropic.BadRequestError(400, undefined, "bad", new Headers())],
    [
      "a rate limit",
      () => new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()),
    ],
    ["a bad key", () => new Anthropic.AuthenticationError(401, undefined, "no", new Headers())],
  ])("does not retry %s", async (_label, error) => {
    const { messages } = stub(() => Promise.reject(error()));

    const result = await createAnthropicLlmClient({ apiKey: "unused", messages }).extract(args);

    expect(result).toMatchObject({ ok: false, reason: "provider_error", retryable: false });
  });

  it("logs a provider error through redact", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { messages } = stub(() =>
      Promise.reject(
        new Anthropic.BadRequestError(400, undefined, "bad for owner@example.com", new Headers()),
      ),
    );

    await createAnthropicLlmClient({ apiKey: "unused", messages }).extract(args);

    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain("llm_provider_error");
    expect(logged).not.toContain("owner@example.com");
  });
});
