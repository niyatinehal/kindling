import type { MealSlot, Recipe } from "./recipeLibrary.js";

/**
 * Protein a meal should carry, by slot.
 *
 * ⚠️ Product thresholds for orientation, NOT dietetic authority. They exist so
 * that no suggested meal is protein-free, which is the failure this file prevents:
 * a plate of jeera rice is 5g and is not a meal, however Indian and however
 * pleasant. Real requirements vary by body weight, goal and condition, and a
 * qualified professional should set these before anyone relies on them.
 *
 * Slot-aware rather than one number, because holding a snack to a main meal's bar
 * would flag every legitimate light dish as deficient.
 */
export const PROTEIN_TARGET_G: Record<MealSlot, number> = {
  breakfast: 8,
  lunch: 12,
  dinner: 12,
  snack: 5,
};

export function meetsProteinTarget(recipe: Recipe, slot: MealSlot): boolean {
  return recipe.proteinG >= PROTEIN_TARGET_G[slot];
}

/**
 * The best dish to eat alongside a thin one.
 *
 * Pairing rather than filtering, deliberately. Dropping every low-protein dish
 * would delete aloo gobi, bhindi masala and cabbage poriyal from the app — dishes
 * people actually cook, which are sides rather than mistakes. Naming what to serve
 * with them is the answer that respects both the nutrition and the cuisine.
 *
 * Candidates are ranked by what the kitchen can already produce first, then by
 * protein. So the pairing is usually something cookable tonight rather than a
 * shopping list, and it always satisfies the same diet as the dish it accompanies
 * because it comes from the already-filtered set.
 */
export function pairingFor(
  dish: Recipe,
  candidates: readonly { recipe: Recipe; missing: readonly string[] }[],
  slot: MealSlot,
): Recipe | null {
  if (meetsProteinTarget(dish, slot)) {
    return null;
  }

  const best = candidates
    .filter((entry) => entry.recipe.key !== dish.key)
    // The pairing must be a protein SOURCE in its own right, not merely enough
    // arithmetic to close the gap. Requiring only `>= shortfall` let a 10g dish
    // be "fixed" by a 6g one — the sum cleared the target while the advice was
    // "serve this vegetable with another vegetable", which is not what "at least
    // one source of protein per meal" means. Holding the pairing to the full slot
    // target makes it dal, rajma, chana, paneer, egg or meat.
    .filter((entry) => meetsProteinTarget(entry.recipe, slot))
    .sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        b.recipe.proteinG - a.recipe.proteinG ||
        a.recipe.key.localeCompare(b.recipe.key),
    )[0];

  return best?.recipe ?? null;
}
