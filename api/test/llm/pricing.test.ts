import { describe, expect, it } from "@jest/globals";

import { costMicroUsd } from "../../src/llm/pricing.js";

describe("costMicroUsd", () => {
  // Haiku 4.5 is $1 in and $5 out per million tokens: one micro-dollar per
  // input token and five per output token.
  it("prices Haiku in whole micro-dollars", () => {
    expect(costMicroUsd("claude-haiku-4-5", { inputTokens: 800, outputTokens: 30 })).toBe(950);
  });

  it("matches the dated model id the API reports", () => {
    expect(costMicroUsd("claude-haiku-4-5-20251001", { inputTokens: 1, outputTokens: 1 })).toBe(6);
  });

  it("answers null for a model with no price on file, rather than guessing", () => {
    expect(costMicroUsd("fake", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});
