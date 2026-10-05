import { describe, expect, it } from "@jest/globals";

import { costMicroUsd } from "../../src/llm/pricing.js";

/** Illustrative prices for the arithmetic, not anyone's real price list. */
const PRICES = { "model-a": { input: 1, output: 5 } };

describe("costMicroUsd", () => {
  // $1 in and $5 out per million tokens is one micro-dollar per input token
  // and five per output token.
  it("prices a call in whole micro-dollars", () => {
    expect(costMicroUsd("model-a", { inputTokens: 800, outputTokens: 30 }, PRICES)).toBe(950);
  });

  it("matches a more specific version the API reports", () => {
    expect(costMicroUsd("model-a-2026-10", { inputTokens: 1, outputTokens: 1 }, PRICES)).toBe(6);
  });

  it("answers null for a model with no price on file, rather than guessing", () => {
    expect(costMicroUsd("model-b", { inputTokens: 1, outputTokens: 1 }, PRICES)).toBeNull();
    expect(costMicroUsd("gemini-3.6-flash", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});
