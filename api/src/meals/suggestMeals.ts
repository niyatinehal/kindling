import type { DietaryConstraint, MedicalCondition } from "../../generated/prisma/enums.js";
import { RECIPES } from "./recipeLibrary.js";
import type { Ingredient, MealSlot, Recipe } from "./recipeLibrary.js";

export const RULES_MEAL_GENERATOR = "rules@1";

export type MealSuggestion = {
  recipeKey: string;
  slot: MealSlot;
  /** Core ingredients the user already has. */
  usesOnHand: Ingredient[];
  /** Core ingredients still needed. Empty means it can be cooked right now. */
  missing: Ingredient[];
  approxKcal: number;
  proteinG: number;
  minutes: number;
  /** Conditions this dish is a poor fit for, surfaced as advice not a refusal. */
  cautions: MedicalCondition[];
};

export type MealPlanDraft = {
  generator: string;
  suggestions: MealSuggestion[];
};

const SUGGESTIONS = 5;

/**
 * Diet compatibility.
 *
 * A dish must satisfy EVERY constraint the user declared, not any of them: a
 * vegan who also avoids gluten needs both true. Declaring nothing matches
 * everything, which is the honest reading of "no preference stated".
 *
 * `non_vegetarian` is a permission rather than a requirement — someone who eats
 * meat still eats dal — so it is satisfied by any dish. Without this carve-out a
 * non-vegetarian would be shown only meat.
 */
function suitsDiet(recipe: Recipe, declared: readonly DietaryConstraint[]): boolean {
  return declared.every(
    (constraint) => constraint === "non_vegetarian" || recipe.suitableFor.includes(constraint),
  );
}

/**
 * Suggests dishes from what is actually in the kitchen (PRD FR-MEAL-1).
 *
 * No model. §16.2 already requires a curated recipe and nutrition reference set
 * to ground suggestions against, and once that set exists, matching a pantry to
 * it is set intersection — deterministic, instant, and free. An LLM adapter would
 * later rank and describe these dishes rather than invent them, which is the same
 * shape as the workout engine: the dataset proposes, and nothing hallucinates.
 *
 * Ranking, in order: fewest missing core ingredients first (so "you can cook this
 * right now" beats "buy two things"), then most on-hand ingredients used, then
 * highest protein, then the recipe key so the output is stable. Deterministic
 * throughout, which is what makes it testable.
 */
export function suggestMeals(input: {
  onHand: readonly Ingredient[];
  dietary: readonly DietaryConstraint[];
  conditions: readonly MedicalCondition[];
  slot?: MealSlot;
}): MealPlanDraft {
  const have = new Set(input.onHand);

  const scored = RECIPES.filter((recipe) => suitsDiet(recipe, input.dietary))
    .filter((recipe) => input.slot === undefined || recipe.slots.includes(input.slot))
    .map((recipe) => {
      const usesOnHand = recipe.core.filter((ingredient) => have.has(ingredient));
      const missing = recipe.core.filter((ingredient) => !have.has(ingredient));
      const optionalOnHand = recipe.optional.filter((ingredient) => have.has(ingredient));

      return {
        recipe,
        usesOnHand,
        missing,
        // Optional matches only break ties; they never make a dish cookable.
        depth: usesOnHand.length + optionalOnHand.length,
      };
    })
    .sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        b.depth - a.depth ||
        b.recipe.proteinG - a.recipe.proteinG ||
        a.recipe.key.localeCompare(b.recipe.key),
    );

  return {
    generator: RULES_MEAL_GENERATOR,
    suggestions: scored.slice(0, SUGGESTIONS).map((entry) => ({
      recipeKey: entry.recipe.key,
      // The first slot the dish fits, or the requested one. A dish is not
      // duplicated across slots — one suggestion, one place in the day.
      slot: input.slot ?? entry.recipe.slots[0] ?? "lunch",
      usesOnHand: entry.usesOnHand,
      missing: entry.missing,
      approxKcal: entry.recipe.approxKcal,
      proteinG: entry.recipe.proteinG,
      minutes: entry.recipe.minutes,
      // Advice, never exclusion. Unlike a workout, where a contraindicated
      // movement can injure someone, a dish that suits a condition poorly is a
      // choice to inform — and refusing to show rice to a diabetic would be both
      // patronising and wrong about Indian food.
      cautions: entry.recipe.cautionFor.filter((condition) => input.conditions.includes(condition)),
    })),
  };
}
