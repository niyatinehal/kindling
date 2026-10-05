import { describe, expect, it } from "@jest/globals";

import {
  checkExplanation,
  DISH_PROMPT_V1,
  dishOutput,
  dishResponseSchema,
  dishUserMessage,
} from "../../src/meals/dishPrompt.js";
import { RECIPES_BY_KEY } from "../../src/meals/recipeLibrary.js";
import type { Recipe } from "../../src/meals/recipeLibrary.js";

const recipe = (key: string): Recipe => {
  const found = RECIPES_BY_KEY.get(key);
  if (found === undefined) throw new Error(`no recipe ${key}`);
  return found;
};

describe("checkExplanation — what a dish sentence may say", () => {
  const palak = recipe("palak_paneer");

  it("lets through a plain sentence about the dish's own ingredients", () => {
    expect(
      checkExplanation(palak, "Your spinach and paneer make this one a natural pick tonight."),
    ).toBe(true);
  });

  // Nutrition and timings belong to the recipe library, shown from its data.
  it("refuses any number", () => {
    expect(checkExplanation(palak, "Ready in 30 minutes with your spinach and paneer.")).toBe(
      false,
    );
  });

  it.each([
    "A healthy way to use your spinach and paneer.",
    "High in protein thanks to the paneer you have.",
    "Good for diabetes, and uses your spinach.",
    "Low calorie and light, with your spinach.",
  ])("refuses a health or nutrition claim: %s", (text) => {
    expect(checkExplanation(palak, text)).toBe(false);
  });

  it("refuses a sentence naming an ingredient the dish does not have", () => {
    expect(checkExplanation(palak, "Your spinach, paneer and chicken come together nicely.")).toBe(
      false,
    );
    // Through a synonym too: "aloo" is potato, which palak paneer does not use.
    expect(checkExplanation(palak, "Use up the palak, paneer and aloo in one pot.")).toBe(false);
  });

  it("accepts bare 'dal' for a dish made with any dal", () => {
    expect(
      checkExplanation(recipe("moong_dal_khichdi"), "Your dal and rice are all this needs."),
    ).toBe(true);
  });

  it("refuses sentences that are empty-ish or too long", () => {
    expect(checkExplanation(palak, "Nice.")).toBe(false);
    expect(checkExplanation(palak, `Spinach and paneer ${"really ".repeat(30)}work.`)).toBe(false);
  });
});

describe("dish prompt and schema", () => {
  it("constrains recipe_key to exactly the dishes that were sent", () => {
    const schema = dishResponseSchema(["poha", "upma"]);
    expect(schema.properties.explanations.items.properties.recipe_key.enum).toEqual([
      "poha",
      "upma",
    ]);
    expect(
      dishOutput(["poha"]).safeParse({ explanations: [{ recipe_key: "upma", text: "x" }] }).success,
    ).toBe(false);
  });

  it("sends each dish's ingredients and overlap, and nothing about the person", () => {
    const message = dishUserMessage([
      { recipe: recipe("poha"), onHand: new Set(["poha", "onion", "milk"]) },
    ]);

    expect(message).toContain('"recipe_key":"poha"');
    expect(message).toContain('"you_have":["poha","onion"');
    // Milk is on hand but not in poha, so it is not this dish's business.
    expect(message).not.toContain("milk");
    expect(message.startsWith("<dishes>")).toBe(true);
  });

  it("forbids numbers and health claims in the prompt itself", () => {
    expect(DISH_PROMPT_V1).toMatch(/No numbers/);
    expect(DISH_PROMPT_V1).toMatch(/health/);
  });
});
