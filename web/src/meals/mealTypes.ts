/**
 * Meal shapes — pure data, no transport, so a component test can import them
 * without pulling in `next/server`. Same split as `plan/planTypes.ts` and
 * `tracking/summaryTypes.ts`.
 */
export type MealSuggestion = {
  recipe_key: string;
  slot: string;
  uses_on_hand: string[];
  missing: string[];
  approx_kcal: number;
  protein_g: number;
  minutes: number;
  cautions: string[];
  /** Whether the dish alone clears its slot's protein target. */
  meets_protein: boolean;
  /** What to serve alongside when it does not. Null when it stands alone. */
  pair_with: string | null;
  protein_target_g: number;
};

/** What `/api/meals/parse` reads out of typed text, for the user to confirm. */
export type PantryParse = {
  recognised: string[];
  unrecognised: string[];
  source: "llm" | "cache" | "synonyms";
  degraded: boolean;
  parser: string;
};

/**
 * The AI pantry toggle. `available` is false when it must not be offered at
 * all: the feature is switched off, there is no profile yet, or it is a child
 * account.
 */
export type PantryConsent = { enabled: boolean; available: boolean };

/**
 * The pantry the intake screen offers, grouped so a list of 38 keys reads as a
 * kitchen rather than a wall of checkboxes. Grouping is presentation only — the
 * API's vocabulary is the source of truth and is derived from the recipes.
 */
export const PANTRY_GROUPS: readonly { group: string; items: readonly string[] }[] = [
  { group: "grains", items: ["rice", "atta", "poha", "semolina", "oats", "besan"] },
  { group: "pulses", items: ["toor_dal", "moong_dal", "chana_dal", "rajma", "chickpeas"] },
  { group: "protein", items: ["paneer", "curd", "milk", "egg", "chicken", "fish"] },
  {
    group: "vegetables",
    items: [
      "potato",
      "onion",
      "tomato",
      "spinach",
      "cauliflower",
      "okra",
      "bottle_gourd",
      "carrot",
      "peas",
      "cabbage",
      "brinjal",
    ],
  },
  {
    group: "basics",
    items: [
      "oil",
      "ghee",
      "spices",
      "ginger",
      "garlic",
      "green_chilli",
      "lemon",
      "coriander",
      "coconut",
      "peanuts",
    ],
  },
];
