import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createCircuitBreaker } from "../../src/llm/breaker.js";
import { disabledLlmClient } from "../../src/llm/client.js";
import type { LlmClient } from "../../src/llm/client.js";
import { FakeLlmClient } from "../../src/llm/fakeClient.js";
import {
  DAILY_MODEL_PARSES,
  isGuardedAccount,
  LLM_TIMEOUT_MS,
  mayUseModel,
  parsePantry,
  PARSE_BUDGET_MS,
} from "../../src/meals/parsePantry.js";
import { PANTRY_PROMPT_VERSION } from "../../src/meals/pantryPrompt.js";
import { pantryCacheKey } from "../../src/meals/pantryStore.js";
import { SYNONYM_PARSER } from "../../src/meals/synonyms.js";
import { createMemoryPantryStore } from "./memoryPantryStore.js";

const TEXT = "thoda atta, 2 aloo, dahi bacha hai, maggi";
const NOW = new Date("2026-10-05T10:00:00Z");

let requests = 0;
/** A consenting adult, with a fresh request id per call as the route would give. */
const consenting = () => ({
  text: TEXT,
  userId: "user-1",
  consented: true,
  role: undefined,
  birthYear: 1990,
  requestId: `req-${++requests}`,
});

/** What the synonym table makes of TEXT, for comparing fallbacks against. */
const SYNONYM_ANSWER = { recognised: ["atta", "potato", "curd"], unrecognised: ["maggi"] };
const MODEL_ANSWER = { recognised: ["atta", "potato", "curd"], unrecognised: ["maggi"] };

/** Fresh dependencies per test: an empty store, a closed breaker, a pinned clock. */
function setup(llm: LlmClient) {
  const memory = createMemoryPantryStore(() => NOW);
  const breaker = createCircuitBreaker();
  return { ...memory, breaker, deps: { llm, store: memory.store, breaker, now: () => NOW } };
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("parsePantry — the model path", () => {
  it("answers from the model with deduplicated keys and the prompt version", async () => {
    const llm = new FakeLlmClient([
      { output: { recognised: ["atta", "potato", "atta", "curd"], unrecognised: ["maggi"] } },
    ]);

    expect(await parsePantry(consenting(), setup(llm).deps)).toEqual({
      recognised: ["atta", "potato", "curd"],
      unrecognised: ["maggi"],
      source: "llm",
      degraded: false,
      parser: PANTRY_PROMPT_VERSION,
    });
  });

  it("sends the text inside delimiters with the per-call timeout", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: [], unrecognised: [] } }]);

    await parsePantry(consenting(), setup(llm).deps);

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

    expect(await parsePantry(consenting(), setup(llm).deps)).toEqual({
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

    expect((await parsePantry(consenting(), setup(llm).deps)).source).toBe("synonyms");
  });

  it("drops an unrecognised phrase the synonym table knows, rather than calling it unknown", async () => {
    const llm = new FakeLlmClient([
      { output: { recognised: ["atta"], unrecognised: ["Aloo", "maggi", " maggi ", ""] } },
    ]);

    expect((await parsePantry(consenting(), setup(llm).deps)).unrecognised).toEqual(["maggi"]);
  });
});

describe("parsePantry — failure, retry and fallback", () => {
  it("falls back on a timeout with degraded: true, and does not retry", async () => {
    const llm = new FakeLlmClient([{ fail: "timeout", latencyMs: LLM_TIMEOUT_MS }]);

    const result = await parsePantry(consenting(), setup(llm).deps);

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

    const result = await parsePantry(consenting(), setup(llm).deps);

    expect(llm.calls).toHaveLength(2);
    expect(result.source).toBe("synonyms");
    expect(result.degraded).toBe(true);
  });

  it("uses the model's answer when the retry succeeds", async () => {
    const llm = new FakeLlmClient([
      { fail: "provider_error", retryable: true, latencyMs: 50 },
      { output: { recognised: ["paneer"], unrecognised: [] } },
    ]);

    expect((await parsePantry(consenting(), setup(llm).deps)).source).toBe("llm");
  });

  it("gives the retry only what is left of the overall budget", async () => {
    const llm = new FakeLlmClient([{ fail: "provider_error", retryable: true, latencyMs: 1_000 }]);

    await parsePantry(consenting(), setup(llm).deps);

    expect(llm.calls[1]?.timeoutMs).toBe(PARSE_BUDGET_MS - 1_000);
  });

  it("skips the retry when too little of the budget is left", async () => {
    const llm = new FakeLlmClient([{ fail: "provider_error", retryable: true, latencyMs: 2_800 }]);

    await parsePantry(consenting(), setup(llm).deps);

    expect(llm.calls).toHaveLength(1);
  });

  it("does not retry an error that a second attempt would repeat", async () => {
    const llm = new FakeLlmClient([{ fail: "provider_error", retryable: false }]);

    await parsePantry(consenting(), setup(llm).deps);

    expect(llm.calls).toHaveLength(1);
  });

  it("never logs the pantry text when it falls back", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const llm = new FakeLlmClient([{ fail: "timeout" }]);

    await parsePantry({ ...consenting(), requestId: "req-logged" }, setup(llm).deps);

    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("pantry_parse_degraded");
    expect(logged).toContain("req-logged");
    expect(logged).not.toContain("atta");
  });
});

describe("parsePantry — who may use the model", () => {
  it("never calls the model without consent", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const { deps, calls } = setup(llm);

    const result = await parsePantry({ ...consenting(), consented: false }, deps);

    expect(llm.calls).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(result).toEqual({
      ...SYNONYM_ANSWER,
      source: "synonyms",
      degraded: false,
      parser: SYNONYM_PARSER,
    });
  });

  it("never calls the model for a child account, even with consent", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);

    const result = await parsePantry({ ...consenting(), role: "child" }, setup(llm).deps);

    expect(llm.calls).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });

  it("uses the model for every other family role that has consented", () => {
    for (const role of ["admin", "adult", "elderly", undefined] as const) {
      expect(mayUseModel({ consented: true, role, birthYear: 1990 })).toBe(true);
    }
  });

  it("never calls the model for someone whose profile says they may be a minor", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);

    const result = await parsePantry(
      { ...consenting(), role: "adult", birthYear: NOW.getUTCFullYear() - 15 },
      setup(llm).deps,
    );

    expect(llm.calls).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });

  // Only the birth year is stored, so a difference of 18 could still be a
  // 17-year-old. The guard errs on the side of the minor.
  it("treats anyone who could still be under 18 as a minor", () => {
    expect(isGuardedAccount({ role: undefined, birthYear: 2008 }, NOW)).toBe(true);
    expect(isGuardedAccount({ role: undefined, birthYear: 2007 }, NOW)).toBe(false);
    expect(isGuardedAccount({ role: "adult", birthYear: 2015 }, NOW)).toBe(true);
  });

  it("guards a child member even when no birth year is known", () => {
    expect(isGuardedAccount({ role: "child", birthYear: null })).toBe(true);
    expect(isGuardedAccount({ role: "adult", birthYear: null })).toBe(false);
  });

  // The kill switch is not a failure: nothing was attempted, so nothing degraded.
  it("answers from synonyms, not degraded, when the model is switched off", async () => {
    const result = await parsePantry(consenting(), setup(disabledLlmClient).deps);

    expect(result.source).toBe("synonyms");
    expect(result.degraded).toBe(false);
  });
});

describe("parsePantry — the cache", () => {
  it("skips the client entirely on a cache hit", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const { deps, calls } = setup(llm);

    await parsePantry(consenting(), deps);
    const second = await parsePantry({ ...consenting(), userId: "someone-else" }, deps);

    expect(llm.calls).toHaveLength(1);
    expect(second).toEqual({
      ...MODEL_ANSWER,
      source: "cache",
      degraded: false,
      parser: PANTRY_PROMPT_VERSION,
    });
    expect(calls.map((call) => call.outcome)).toEqual(["ok", "cache_hit"]);
  });

  it("keys the cache on a hash of the normalised text, never the text", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const { deps, cache } = setup(llm);

    await parsePantry(consenting(), deps);

    const [key] = [...cache.keys()];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(pantryCacheKey(TEXT, PANTRY_PROMPT_VERSION));
  });

  it("gives two orderings of the same pantry one hash", () => {
    expect(pantryCacheKey("Aloo, Atta", PANTRY_PROMPT_VERSION)).toBe(
      pantryCacheKey("atta,aloo", PANTRY_PROMPT_VERSION),
    );
  });

  // A prompt change must never be answered from the old prompt's cache.
  it("gives each prompt version its own entry", () => {
    expect(pantryCacheKey("aloo", "llm-pantry@1")).not.toBe(pantryCacheKey("aloo", "llm-pantry@2"));
  });

  it("does not cache a fallback answer", async () => {
    const llm = new FakeLlmClient([{ fail: "timeout" }]);
    const { deps, cache } = setup(llm);

    await parsePantry(consenting(), deps);

    expect(cache.size).toBe(0);
  });

  it("drops a cached key that has since left the vocabulary", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const { deps, store } = setup(llm);
    await store.writeCache(
      {
        textHash: pantryCacheKey(TEXT, PANTRY_PROMPT_VERSION),
        promptVersion: PANTRY_PROMPT_VERSION,
        recognised: ["potato", "retired_key"],
        unrecognised: [],
      },
      NOW,
    );

    expect((await parsePantry(consenting(), deps)).recognised).toEqual(["potato"]);
  });
});

describe("parsePantry — the daily limit", () => {
  it(`answers the call after the ${DAILY_MODEL_PARSES}th from synonyms, not degraded into an error`, async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["rice"], unrecognised: [] } }]);
    const { deps, calls } = setup(llm);

    for (let i = 0; i < DAILY_MODEL_PARSES; i++) {
      // Distinct text each time, so none of these is a cache hit.
      const result = await parsePantry({ ...consenting(), text: `chawal ${i}` }, deps);
      expect(result.source).toBe("llm");
    }
    const over = await parsePantry({ ...consenting(), text: "chawal again" }, deps);

    expect(over).toMatchObject({ recognised: ["rice"], source: "synonyms", degraded: true });
    expect(llm.calls).toHaveLength(DAILY_MODEL_PARSES);
    expect(calls.at(-1)?.outcome).toBe("rate_limited");
  });

  it("still serves a cache hit to someone over the limit, since it costs nothing", async () => {
    const llm = new FakeLlmClient([{ output: MODEL_ANSWER }]);
    const { deps } = setup(llm);
    await parsePantry({ ...consenting(), userId: "first" }, deps);
    for (let i = 0; i < DAILY_MODEL_PARSES; i++) {
      await parsePantry({ ...consenting(), text: `chawal ${i}` }, deps);
    }

    expect((await parsePantry(consenting(), deps)).source).toBe("cache");
  });
});

describe("parsePantry — the circuit breaker", () => {
  it("opens after 5 failures and stops calling the model, then closes after 60 s", async () => {
    jest.useFakeTimers({ now: NOW });
    const llm = new FakeLlmClient([{ fail: "timeout" }]);
    const { deps, calls } = setup(llm);

    for (let i = 0; i < 5; i++) {
      await parsePantry({ ...consenting(), text: `aloo ${i}` }, deps);
    }
    expect(llm.calls).toHaveLength(5);

    const whileOpen = await parsePantry({ ...consenting(), text: "aloo open" }, deps);
    expect(llm.calls).toHaveLength(5);
    expect(whileOpen).toMatchObject({ source: "synonyms", degraded: true });
    expect(calls.at(-1)?.outcome).toBe("breaker_open");

    jest.advanceTimersByTime(60_000);
    await parsePantry({ ...consenting(), text: "aloo later" }, deps);
    expect(llm.calls).toHaveLength(6);
  });

  it("is not tripped by bad output, which is not the provider being down", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["unobtainium"], unrecognised: [] } }]);
    const { deps } = setup(llm);

    for (let i = 0; i < 6; i++) {
      await parsePantry({ ...consenting(), text: `aloo ${i}` }, deps);
    }

    expect(llm.calls).toHaveLength(6);
  });
});

describe("parsePantry — what is recorded", () => {
  it("records each attempt with tokens, latency and cost, and never the text", async () => {
    const llm = new FakeLlmClient([
      { fail: "provider_error", retryable: true, latencyMs: 40 },
      { output: MODEL_ANSWER, latencyMs: 300 },
    ]);
    const { deps, calls } = setup(llm);

    await parsePantry({ ...consenting(), requestId: "req-recorded" }, deps);

    expect(calls).toEqual([
      expect.objectContaining({
        outcome: "provider_error",
        latencyMs: 40,
        inputTokens: null,
        requestId: "req-recorded",
      }),
      expect.objectContaining({
        outcome: "ok",
        latencyMs: 300,
        inputTokens: 100,
        outputTokens: 20,
        model: "fake",
        promptVersion: PANTRY_PROMPT_VERSION,
        userId: "user-1",
        requestId: "req-recorded",
      }),
    ]);
    expect(JSON.stringify(calls)).not.toContain("atta");
  });
});
