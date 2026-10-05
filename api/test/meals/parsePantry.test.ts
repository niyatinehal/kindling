import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { disabledLlmClient } from "../../src/llm/client.js";
import { FakeLlmClient } from "../../src/llm/fakeClient.js";
import {
  isGuardedAccount,
  LLM_TIMEOUT_MS,
  mayUseModel,
  parsePantry,
  PARSE_BUDGET_MS,
} from "../../src/meals/parsePantry.js";
import { PANTRY_PROMPT_VERSION } from "../../src/meals/pantryPrompt.js";
import { SYNONYM_PARSER } from "../../src/meals/synonyms.js";

const TEXT = "thoda atta, 2 aloo, dahi bacha hai, maggi";
const consenting = { text: TEXT, consented: true, role: undefined, birthYear: 1990 };

/** What the synonym table makes of TEXT, for comparing fallbacks against. */
const SYNONYM_ANSWER = { recognised: ["atta", "potato", "curd"], unrecognised: ["maggi"] };

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("parsePantry — the model path", () => {
  it("answers from the model with deduplicated keys and the prompt version", async () => {
    const llm = new FakeLlmClient([
      { output: { recognised: ["atta", "potato", "atta", "curd"], unrecognised: ["maggi"] } },
    ]);

    expect(await parsePantry(consenting, { llm })).toEqual({
      recognised: ["atta", "potato", "curd"],
      unrecognised: ["maggi"],
      source: "llm",
      degraded: false,
      parser: PANTRY_PROMPT_VERSION,
    });
  });

  it("sends the text inside delimiters with the per-call timeout", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: [], unrecognised: [] } }]);

    await parsePantry(consenting, { llm });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.user).toBe(`<pantry>${TEXT}</pantry>`);
    expect(llm.calls[0]?.timeoutMs).toBe(LLM_TIMEOUT_MS);
  });

  // The model cannot be trusted to keep to the enum just because the schema
  // asked it to. Zod has the last word, and the table answers instead.
  it("falls back to synonyms when the output names a key outside the vocabulary", async () => {
    const llm = new FakeLlmClient([
      { output: { recognised: ["potato", "unobtainium"], unrecognised: [] } },
    ]);

    expect(await parsePantry(consenting, { llm })).toEqual({
      ...SYNONYM_ANSWER,
      source: "synonyms",
      degraded: true,
      parser: SYNONYM_PARSER,
    });
  });

  it("falls back when the output carries fields the schema does not have", async () => {
    const llm = new FakeLlmClient([
      { output: { recognised: ["potato"], unrecognised: [], note: "hello" } },
    ]);

    expect((await parsePantry(consenting, { llm })).source).toBe("synonyms");
  });

  it("drops an unrecognised phrase the synonym table knows, rather than calling it unknown", async () => {
    const llm = new FakeLlmClient([
      { output: { recognised: ["atta"], unrecognised: ["Aloo", "maggi", " maggi ", ""] } },
    ]);

    expect((await parsePantry(consenting, { llm })).unrecognised).toEqual(["maggi"]);
  });
});

describe("parsePantry — failure, retry and fallback", () => {
  it("falls back on a timeout with degraded: true, and does not retry", async () => {
    const llm = new FakeLlmClient([{ fail: "timeout", latencyMs: LLM_TIMEOUT_MS }]);

    const result = await parsePantry(consenting, { llm });

    expect(result).toEqual({
      ...SYNONYM_ANSWER,
      source: "synonyms",
      degraded: true,
      parser: SYNONYM_PARSER,
    });
    expect(llm.calls).toHaveLength(1);
  });

  it("retries a 5xx once, then falls back", async () => {
    const llm = new FakeLlmClient([{ fail: "provider_error", retryable: true, latencyMs: 50 }]);

    const result = await parsePantry(consenting, { llm });

    expect(llm.calls).toHaveLength(2);
    expect(result.source).toBe("synonyms");
    expect(result.degraded).toBe(true);
  });

  it("uses the model's answer when the retry succeeds", async () => {
    const llm = new FakeLlmClient([
      { fail: "provider_error", retryable: true, latencyMs: 50 },
      { output: { recognised: ["paneer"], unrecognised: [] } },
    ]);

    expect((await parsePantry(consenting, { llm })).source).toBe("llm");
  });

  it("gives the retry only what is left of the overall budget", async () => {
    const llm = new FakeLlmClient([{ fail: "provider_error", retryable: true, latencyMs: 1_000 }]);

    await parsePantry(consenting, { llm });

    expect(llm.calls[1]?.timeoutMs).toBe(PARSE_BUDGET_MS - 1_000);
  });

  it("skips the retry when too little of the budget is left", async () => {
    const llm = new FakeLlmClient([{ fail: "provider_error", retryable: true, latencyMs: 2_800 }]);

    await parsePantry(consenting, { llm });

    expect(llm.calls).toHaveLength(1);
  });

  it("does not retry an error that a second attempt would repeat", async () => {
    const llm = new FakeLlmClient([{ fail: "provider_error", retryable: false }]);

    await parsePantry(consenting, { llm });

    expect(llm.calls).toHaveLength(1);
  });

  it("never logs the pantry text when it falls back", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const llm = new FakeLlmClient([{ fail: "timeout" }]);

    await parsePantry({ ...consenting, requestId: "req-1" }, { llm });

    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("pantry_parse_degraded");
    expect(logged).toContain("req-1");
    expect(logged).not.toContain("atta");
  });
});

describe("parsePantry — who may use the model", () => {
  it("never calls the model without consent", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["rice"], unrecognised: [] } }]);

    const result = await parsePantry({ ...consenting, consented: false }, { llm });

    expect(llm.calls).toHaveLength(0);
    expect(result).toEqual({
      ...SYNONYM_ANSWER,
      source: "synonyms",
      degraded: false,
      parser: SYNONYM_PARSER,
    });
  });

  it("never calls the model for a child account, even with consent", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["rice"], unrecognised: [] } }]);

    const result = await parsePantry({ ...consenting, role: "child" }, { llm });

    expect(llm.calls).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });

  it("uses the model for every other family role that has consented", () => {
    for (const role of ["admin", "adult", "elderly", undefined] as const) {
      expect(mayUseModel({ consented: true, role, birthYear: 1990 })).toBe(true);
    }
  });

  it("never calls the model for someone whose profile says they may be a minor", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["rice"], unrecognised: [] } }]);
    const birthYear = new Date().getUTCFullYear() - 15;

    const result = await parsePantry({ ...consenting, role: "adult", birthYear }, { llm });

    expect(llm.calls).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });

  // Only the birth year is stored, so a difference of 18 could still be a
  // 17-year-old. The guard errs on the side of the minor.
  it("treats anyone who could still be under 18 as a minor", () => {
    const now = new Date("2026-10-05T00:00:00Z");

    expect(isGuardedAccount({ role: undefined, birthYear: 2008 }, now)).toBe(true);
    expect(isGuardedAccount({ role: undefined, birthYear: 2007 }, now)).toBe(false);
    expect(isGuardedAccount({ role: "adult", birthYear: 2015 }, now)).toBe(true);
  });

  it("guards a child member even when no birth year is known", () => {
    expect(isGuardedAccount({ role: "child", birthYear: null })).toBe(true);
    expect(isGuardedAccount({ role: "adult", birthYear: null })).toBe(false);
  });

  // The kill switch is not a failure: nothing was attempted, so nothing degraded.
  it("answers from synonyms, not degraded, when the model is switched off", async () => {
    const result = await parsePantry(consenting, { llm: disabledLlmClient });

    expect(result.source).toBe("synonyms");
    expect(result.degraded).toBe(false);
  });
});
