import { describe, expect, it } from "@jest/globals";

import { ALL_INGREDIENTS, RECIPES, RECIPES_BY_KEY } from "../../src/meals/recipeLibrary.js";
import { suggestMeals } from "../../src/meals/suggestMeals.js";

const keys = (result: ReturnType<typeof suggestMeals>) =>
  result.suggestions.map((s) => s.recipeKey);

describe("recipe library", () => {
  it("derives the offered ingredient vocabulary from the recipes themselves", () => {
    // Anything a recipe needs must be something the intake screen can offer, or
    // the dish is permanently uncookable.
    for (const recipe of RECIPES) {
      for (const ingredient of [...recipe.core, ...recipe.optional]) {
        expect(ALL_INGREDIENTS).toContain(ingredient);
      }
    }
  });

  it("gives every recipe at least one core ingredient and one slot", () => {
    for (const recipe of RECIPES) {
      expect(recipe.core.length).toBeGreaterThan(0);
      expect(recipe.slots.length).toBeGreaterThan(0);
    }
  });

  // A dish nobody's diet admits is dead weight in the library.
  it("marks every recipe suitable for at least one diet", () => {
    for (const recipe of RECIPES) {
      expect(recipe.suitableFor.length).toBeGreaterThan(0);
    }
  });
});

describe("suggestMeals — matching what is in the kitchen", () => {
  it("puts dishes you can cook right now above dishes needing a shop", () => {
    const result = suggestMeals({
      onHand: ["toor_dal", "rice", "onion", "tomato"],
      dietary: [],
      conditions: [],
    });

    expect(keys(result)).toContain("dal_chawal");
    const dal = result.suggestions.find((s) => s.recipeKey === "dal_chawal");
    expect(dal?.missing).toEqual([]);
    // Nothing missing must sort before anything missing.
    const firstWithMissing = result.suggestions.findIndex((s) => s.missing.length > 0);
    const lastWithNone = result.suggestions.map((s) => s.missing.length).lastIndexOf(0);
    if (firstWithMissing !== -1) {
      expect(lastWithNone).toBeLessThan(firstWithMissing);
    }
  });

  it("says exactly what is missing rather than just hiding the dish", () => {
    const result = suggestMeals({ onHand: ["rice"], dietary: [], conditions: [] });
    const dal = result.suggestions.find((s) => s.recipeKey === "dal_chawal");

    // Suggested despite an incomplete pantry, with the gap named — "buy dal" is
    // more useful than silence.
    expect(dal?.usesOnHand).toEqual(["rice"]);
    expect(dal?.missing).toEqual(["toor_dal"]);
  });

  it("still suggests something for an empty kitchen", () => {
    const result = suggestMeals({ onHand: [], dietary: [], conditions: [] });

    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const suggestion of result.suggestions) {
      expect(suggestion.usesOnHand).toEqual([]);
    }
  });

  it("is deterministic for the same pantry", () => {
    const input = { onHand: ["rice", "toor_dal"] as const, dietary: [], conditions: [] };

    expect(suggestMeals({ ...input })).toEqual(suggestMeals({ ...input }));
  });

  it("stamps the generator that produced the suggestions", () => {
    expect(suggestMeals({ onHand: [], dietary: [], conditions: [] }).generator).toBe("rules@1");
  });
});

describe("suggestMeals — dietary constraints", () => {
  it("never suggests meat to a vegetarian", () => {
    const result = suggestMeals({
      onHand: ["chicken", "fish", "egg", "onion", "tomato", "rice"],
      dietary: ["vegetarian"],
      conditions: [],
    });

    for (const key of keys(result)) {
      expect(["chicken_curry", "fish_curry", "egg_bhurji"]).not.toContain(key);
    }
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("never suggests dairy to a vegan", () => {
    const result = suggestMeals({
      onHand: ["paneer", "curd", "rice", "spinach", "onion"],
      dietary: ["vegan"],
      conditions: [],
    });

    for (const key of keys(result)) {
      const recipe = RECIPES_BY_KEY.get(key);
      expect(recipe?.suitableFor).toContain("vegan");
    }
  });

  // Every declared constraint must hold at once, not just one of them.
  it("satisfies several constraints together", () => {
    const result = suggestMeals({
      onHand: ["rice", "toor_dal", "atta", "peanuts", "onion"],
      dietary: ["vegan", "no_gluten", "no_nuts"],
      conditions: [],
    });

    for (const key of keys(result)) {
      const recipe = RECIPES_BY_KEY.get(key);
      expect(recipe?.suitableFor).toContain("vegan");
      expect(recipe?.suitableFor).toContain("no_gluten");
      expect(recipe?.suitableFor).toContain("no_nuts");
    }
  });

  // Eating meat is a permission, not a requirement — a non-vegetarian still eats
  // dal, and showing them only meat would be a bug dressed as a preference.
  it("does not restrict a non-vegetarian to meat", () => {
    const result = suggestMeals({
      onHand: ["toor_dal", "rice"],
      dietary: ["non_vegetarian"],
      conditions: [],
    });

    expect(keys(result)).toContain("dal_chawal");
  });

  it("allows an eggetarian eggs but not meat", () => {
    const result = suggestMeals({
      onHand: ["egg", "onion", "chicken", "tomato"],
      dietary: ["eggetarian"],
      conditions: [],
    });

    expect(keys(result)).toContain("egg_bhurji");
    expect(keys(result)).not.toContain("chicken_curry");
  });
});

describe("suggestMeals — conditions and slots", () => {
  // Unlike a contraindicated exercise, a dish that suits a condition poorly is
  // information, not a hazard. Hiding rice from a diabetic would be patronising
  // and wrong about Indian food.
  it("flags a caution without withholding the dish", () => {
    const result = suggestMeals({
      onHand: ["rice", "spices"],
      dietary: [],
      conditions: ["type_2_diabetes"],
    });

    const jeera = result.suggestions.find((s) => s.recipeKey === "jeera_rice");
    expect(jeera).toBeDefined();
    expect(jeera?.cautions).toContain("type_2_diabetes");
  });

  it("carries no caution for someone the caution does not apply to", () => {
    const result = suggestMeals({ onHand: ["rice", "spices"], dietary: [], conditions: [] });

    for (const suggestion of result.suggestions) {
      expect(suggestion.cautions).toEqual([]);
    }
  });

  it("restricts to the requested meal slot", () => {
    const result = suggestMeals({
      onHand: ["poha", "onion", "rice", "toor_dal"],
      dietary: [],
      conditions: [],
      slot: "breakfast",
    });

    for (const key of keys(result)) {
      expect(RECIPES_BY_KEY.get(key)?.slots).toContain("breakfast");
    }
    expect(keys(result)).toContain("poha");
  });

  it("reports an estimate for every suggestion", () => {
    for (const suggestion of suggestMeals({ onHand: [], dietary: [], conditions: [] })
      .suggestions) {
      expect(suggestion.approxKcal).toBeGreaterThan(0);
      expect(suggestion.proteinG).toBeGreaterThan(0);
      expect(suggestion.minutes).toBeGreaterThan(0);
    }
  });
});
