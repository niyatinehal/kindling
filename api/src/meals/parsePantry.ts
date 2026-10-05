import type { Ingredient } from "./recipeLibrary.js";
import { parseWithSynonyms, SYNONYM_PARSER } from "./synonyms.js";

export type PantrySource = "llm" | "cache" | "synonyms";

export type PantryParse = {
  /** Deduplicated keys, each one in `ALL_INGREDIENTS`. */
  recognised: Ingredient[];
  /** Phrases that map to nothing, shown back as "not in our list yet". */
  unrecognised: string[];
  source: PantrySource;
  /** True only when a model was tried and failed, so the synonym table answered. */
  degraded: boolean;
  /** Versioned like `rules@1`, so a stored result can be traced to what produced it. */
  parser: string;
};

/**
 * Turns free-text pantry input into ingredient keys for the confirm step.
 *
 * Only the synonym table for now: it works offline, costs nothing and covers
 * the common phrasing. The result is never fed straight into a suggestion —
 * the user confirms it as chips first, so a wrong parse costs one tap rather
 * than a wrong meal.
 */
export function parsePantry(input: { text: string }): PantryParse {
  const { recognised, unrecognised } = parseWithSynonyms(input.text);

  return {
    recognised,
    unrecognised,
    source: "synonyms",
    degraded: false,
    parser: SYNONYM_PARSER,
  };
}
