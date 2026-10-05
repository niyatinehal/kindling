import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createCircuitBreaker } from "../../src/llm/breaker.js";
import { disabledLlmClient } from "../../src/llm/client.js";
import type { LlmClient } from "../../src/llm/client.js";
import { FakeLlmClient } from "../../src/llm/fakeClient.js";
import { DISH_PROMPT_VERSION } from "../../src/meals/dishPrompt.js";
import { DAILY_DISH_EXPLAINS, explainDishes } from "../../src/meals/explainDishes.js";
import { createMemoryPantryStore } from "./memoryPantryStore.js";

const NOW = new Date("2026-10-05T10:00:00Z");
const GOOD = {
  explanations: [
    { recipe_key: "palak_paneer", text: "Your spinach and paneer are all this one needs." },
    { recipe_key: "poha", text: "The poha and onion you have make a quick, easy plate." },
  ],
};

let requests = 0;
const asking = () => ({
  recipeKeys: ["palak_paneer", "poha"],
  onHand: ["spinach", "paneer", "poha", "onion"],
  userId: "user-1",
  consented: true,
  role: undefined,
  birthYear: 1990,
  requestId: `req-${++requests}`,
});

function setup(llm: LlmClient) {
  const memory = createMemoryPantryStore(() => NOW);
  return {
    ...memory,
    deps: { llm, store: memory.store, breaker: createCircuitBreaker(), now: () => NOW },
  };
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("explainDishes", () => {
  it("returns one checked sentence per dish, in the order asked", async () => {
    const llm = new FakeLlmClient([{ output: GOOD }]);

    expect(await explainDishes(asking(), setup(llm).deps)).toEqual({
      explanations: GOOD.explanations,
      source: "llm",
      degraded: false,
      generator: DISH_PROMPT_VERSION,
    });
  });

  it("drops a sentence that fails the checks and keeps the rest", async () => {
    const llm = new FakeLlmClient([
      {
        output: {
          explanations: [
            { recipe_key: "palak_paneer", text: "A healthy 20-minute dinner with your spinach." },
            GOOD.explanations[1],
          ],
        },
      },
    ]);

    const result = await explainDishes(asking(), setup(llm).deps);

    expect(result.explanations.map((e) => e.recipe_key)).toEqual(["poha"]);
  });

  it("asks the model only about dishes the cache does not have", async () => {
    const llm = new FakeLlmClient([{ output: GOOD }]);
    const { deps } = setup(llm);
    await explainDishes(asking(), deps);

    const again = await explainDishes(asking(), deps);

    expect(llm.calls).toHaveLength(1);
    expect(again.source).toBe("cache");
    expect(again.explanations).toEqual(GOOD.explanations);
  });

  it("never calls the model without consent, or for a child or a minor", async () => {
    const llm = new FakeLlmClient([{ output: GOOD }]);
    const { deps } = setup(llm);

    for (const who of [
      { consented: false },
      { role: "child" as const },
      { birthYear: NOW.getUTCFullYear() - 14 },
    ]) {
      expect(await explainDishes({ ...asking(), ...who }, deps)).toMatchObject({
        explanations: [],
        source: "none",
        degraded: false,
      });
    }
    expect(llm.calls).toHaveLength(0);
  });

  it("shows nothing, not an error, when the model is switched off or fails", async () => {
    expect(await explainDishes(asking(), setup(disabledLlmClient).deps)).toMatchObject({
      explanations: [],
      degraded: false,
    });
    expect(
      await explainDishes(asking(), setup(new FakeLlmClient([{ fail: "timeout" }])).deps),
    ).toMatchObject({ explanations: [], degraded: true });
  });

  it("stops at its own daily limit, separate from pantry parsing", async () => {
    const llm = new FakeLlmClient([{ output: GOOD }]);
    const { deps, calls } = setup(llm);
    const usedUp = (feature: "pantry_parse" | "dish_explain") =>
      Promise.all(
        Array.from({ length: DAILY_DISH_EXPLAINS }, (_, i) =>
          deps.store.recordCall({
            userId: "user-1",
            feature,
            model: "fake",
            promptVersion: "x",
            outcome: "ok",
            inputTokens: null,
            outputTokens: null,
            costMicroUsd: null,
            latencyMs: 1,
            requestId: `${feature}-${i}`,
          }),
        ),
      );

    // A full day of parsing does not use up dish sentences.
    await usedUp("pantry_parse");
    expect((await explainDishes(asking(), deps)).source).toBe("llm");

    await usedUp("dish_explain");
    const over = await explainDishes({ ...asking(), recipeKeys: ["upma"] }, deps);

    expect(over).toMatchObject({ explanations: [], degraded: true });
    expect(calls.at(-1)).toMatchObject({ feature: "dish_explain", outcome: "rate_limited" });
  });

  it("records its calls under its own feature and prompt version", async () => {
    const llm = new FakeLlmClient([{ output: GOOD }]);
    const { deps, calls } = setup(llm);

    await explainDishes(asking(), deps);

    expect(calls).toEqual([
      expect.objectContaining({
        feature: "dish_explain",
        promptVersion: DISH_PROMPT_VERSION,
        outcome: "ok",
      }),
    ]);
  });

  it("ignores a recipe key that is not in the library", async () => {
    const llm = new FakeLlmClient([{ output: GOOD }]);

    await explainDishes({ ...asking(), recipeKeys: ["poha", "pizza"] }, setup(llm).deps);

    expect(llm.calls[0]?.user).not.toContain("pizza");
  });
});
