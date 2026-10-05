import type { DietaryConstraint, MedicalCondition } from "../../generated/prisma/enums.js";

/**
 * Ingredients the matcher understands, as keys rather than free text.
 *
 * A curated vocabulary for the same reason the exercise library has one: "atta",
 * "wheat flour" and "chakki fresh atta" are one ingredient, and matching prose
 * would treat them as three. The intake screen offers these; a future slice can
 * add a synonym table in front without changing the matcher.
 */
export type Ingredient =
  | "rice"
  | "atta"
  | "toor_dal"
  | "moong_dal"
  | "chana_dal"
  | "rajma"
  | "chickpeas"
  | "paneer"
  | "curd"
  | "milk"
  | "egg"
  | "chicken"
  | "fish"
  | "potato"
  | "onion"
  | "tomato"
  | "spinach"
  | "cauliflower"
  | "okra"
  | "bottle_gourd"
  | "carrot"
  | "peas"
  | "cabbage"
  | "brinjal"
  | "besan"
  | "semolina"
  | "poha"
  | "oats"
  | "coconut"
  | "peanuts"
  | "ginger"
  | "garlic"
  | "green_chilli"
  | "lemon"
  | "coriander"
  | "oil"
  | "ghee"
  | "spices";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type Recipe = {
  key: string;
  slots: MealSlot[];
  /** What the dish cannot be made without. Absence of any of these disqualifies it. */
  core: Ingredient[];
  /** Improves the dish; its absence never disqualifies. Used only for ranking. */
  optional: Ingredient[];
  /** Diets this dish is compatible with. Checked against the profile as a superset. */
  suitableFor: DietaryConstraint[];
  /** Conditions this dish is a poor choice for — a soft flag, never a hard block. */
  cautionFor: MedicalCondition[];
  approxKcal: number;
  proteinG: number;
  minutes: number;
};

/**
 * A small curated Indian recipe set, in code.
 *
 * PRD §16.2 wants meal suggestions "grounded with a curated Indian
 * recipe/nutrition reference set (retrieval-augmented, not pure model recall) to
 * reduce hallucinated dishes or wrong nutrition estimates". That dataset is
 * required whether or not a model is ever involved — so this is it, and the
 * matcher below uses it directly. An LLM adapter later would rank and describe
 * these rather than invent dishes.
 *
 * ⚠️ Nutrition figures are rough per-serving estimates for orientation, not
 * dietetic data. Every surface that shows them labels them as approximate, per
 * §16.2's "always labeled as an estimate".
 */
export const RECIPES: readonly Recipe[] = [
  {
    key: "dal_chawal",
    slots: ["lunch", "dinner"],
    core: ["toor_dal", "rice"],
    optional: ["onion", "tomato", "ghee", "spices", "ginger", "garlic"],
    suitableFor: ["vegetarian", "eggetarian", "non_vegetarian", "jain", "no_gluten", "no_nuts"],
    cautionFor: [],
    approxKcal: 420,
    proteinG: 14,
    minutes: 30,
  },
  {
    key: "jeera_rice",
    slots: ["lunch", "dinner"],
    core: ["rice", "spices"],
    optional: ["ghee", "oil"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "jain",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: ["type_2_diabetes"],
    approxKcal: 300,
    proteinG: 5,
    minutes: 20,
  },
  {
    key: "roti_sabzi",
    slots: ["lunch", "dinner"],
    core: ["atta", "potato"],
    optional: ["onion", "tomato", "peas", "spices", "oil", "coriander"],
    suitableFor: ["vegetarian", "vegan", "eggetarian", "non_vegetarian", "no_nuts", "no_dairy"],
    cautionFor: [],
    approxKcal: 380,
    proteinG: 10,
    minutes: 35,
  },
  {
    key: "palak_paneer",
    slots: ["lunch", "dinner"],
    core: ["spinach", "paneer"],
    optional: ["onion", "tomato", "garlic", "ginger", "spices", "ghee"],
    suitableFor: ["vegetarian", "eggetarian", "non_vegetarian", "no_gluten", "no_nuts"],
    cautionFor: [],
    approxKcal: 350,
    proteinG: 18,
    minutes: 30,
  },
  {
    key: "rajma_chawal",
    slots: ["lunch", "dinner"],
    core: ["rajma", "rice"],
    optional: ["onion", "tomato", "ginger", "garlic", "spices", "oil"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 450,
    proteinG: 16,
    minutes: 45,
  },
  {
    key: "chana_masala",
    slots: ["lunch", "dinner"],
    core: ["chickpeas", "onion", "tomato"],
    optional: ["ginger", "garlic", "spices", "oil", "coriander", "lemon"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 380,
    proteinG: 15,
    minutes: 35,
  },
  {
    key: "aloo_gobi",
    slots: ["lunch", "dinner"],
    core: ["potato", "cauliflower"],
    optional: ["onion", "tomato", "spices", "oil", "coriander"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 260,
    proteinG: 6,
    minutes: 30,
  },
  {
    key: "bhindi_masala",
    slots: ["lunch", "dinner"],
    core: ["okra", "onion"],
    optional: ["tomato", "spices", "oil"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 220,
    proteinG: 5,
    minutes: 25,
  },
  {
    key: "lauki_chana_dal",
    slots: ["lunch", "dinner"],
    core: ["bottle_gourd", "chana_dal"],
    optional: ["onion", "tomato", "spices", "ginger"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "jain",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 240,
    proteinG: 12,
    minutes: 35,
  },
  {
    key: "baingan_bharta",
    slots: ["lunch", "dinner"],
    core: ["brinjal", "onion", "tomato"],
    optional: ["garlic", "spices", "oil", "coriander"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 210,
    proteinG: 5,
    minutes: 40,
  },
  {
    key: "poha",
    slots: ["breakfast", "snack"],
    core: ["poha", "onion"],
    optional: ["peanuts", "potato", "green_chilli", "lemon", "coriander", "oil", "spices"],
    suitableFor: ["vegetarian", "vegan", "eggetarian", "non_vegetarian", "no_gluten", "no_dairy"],
    cautionFor: [],
    approxKcal: 270,
    proteinG: 6,
    minutes: 15,
  },
  {
    key: "upma",
    slots: ["breakfast", "snack"],
    core: ["semolina", "onion"],
    optional: ["carrot", "peas", "green_chilli", "ginger", "oil", "spices"],
    suitableFor: ["vegetarian", "vegan", "eggetarian", "non_vegetarian", "no_nuts", "no_dairy"],
    cautionFor: [],
    approxKcal: 250,
    proteinG: 7,
    minutes: 20,
  },
  {
    key: "besan_chilla",
    slots: ["breakfast", "snack"],
    core: ["besan", "onion"],
    optional: ["tomato", "coriander", "green_chilli", "oil", "spices"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "no_gluten",
      "no_nuts",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 230,
    proteinG: 11,
    minutes: 15,
  },
  {
    key: "masala_oats",
    slots: ["breakfast", "snack"],
    core: ["oats"],
    optional: ["onion", "tomato", "carrot", "peas", "spices"],
    suitableFor: ["vegetarian", "vegan", "eggetarian", "non_vegetarian", "no_nuts", "no_dairy"],
    cautionFor: [],
    approxKcal: 220,
    proteinG: 8,
    minutes: 15,
  },
  {
    key: "curd_rice",
    slots: ["lunch", "dinner", "snack"],
    core: ["rice", "curd"],
    optional: ["ginger", "coriander", "spices"],
    suitableFor: ["vegetarian", "eggetarian", "non_vegetarian", "no_gluten", "no_nuts"],
    cautionFor: [],
    approxKcal: 300,
    proteinG: 9,
    minutes: 15,
  },
  {
    // Sweetened, so it is cautioned for diabetes like the other rice-heavy
    // dishes. Nuts are left out of the listed ingredients on purpose: they are
    // a garnish, not the dish, and listing them would hide kheer from no_nuts.
    key: "kheer",
    slots: ["snack"],
    core: ["rice", "milk"],
    optional: ["ghee", "spices", "coconut"],
    suitableFor: ["vegetarian", "eggetarian", "non_vegetarian", "jain", "no_gluten", "no_nuts"],
    cautionFor: ["type_2_diabetes"],
    approxKcal: 280,
    proteinG: 7,
    minutes: 40,
  },
  {
    key: "moong_dal_khichdi",
    slots: ["lunch", "dinner"],
    core: ["moong_dal", "rice"],
    optional: ["ghee", "spices", "carrot", "peas"],
    suitableFor: ["vegetarian", "eggetarian", "non_vegetarian", "jain", "no_gluten", "no_nuts"],
    cautionFor: [],
    approxKcal: 330,
    proteinG: 13,
    minutes: 30,
  },
  {
    key: "egg_bhurji",
    slots: ["breakfast", "lunch", "dinner"],
    core: ["egg", "onion"],
    optional: ["tomato", "green_chilli", "coriander", "oil", "spices"],
    suitableFor: ["eggetarian", "non_vegetarian", "no_gluten", "no_nuts", "no_dairy"],
    cautionFor: [],
    approxKcal: 280,
    proteinG: 18,
    minutes: 15,
  },
  {
    key: "chicken_curry",
    slots: ["lunch", "dinner"],
    core: ["chicken", "onion", "tomato"],
    optional: ["ginger", "garlic", "spices", "oil", "curd", "coriander"],
    suitableFor: ["non_vegetarian", "no_gluten", "no_nuts"],
    cautionFor: [],
    approxKcal: 420,
    proteinG: 32,
    minutes: 45,
  },
  {
    key: "fish_curry",
    slots: ["lunch", "dinner"],
    core: ["fish", "onion", "tomato"],
    optional: ["coconut", "ginger", "garlic", "spices", "oil", "lemon"],
    suitableFor: ["non_vegetarian", "no_gluten", "no_dairy"],
    cautionFor: [],
    approxKcal: 380,
    proteinG: 30,
    minutes: 35,
  },
  {
    key: "cabbage_poriyal",
    slots: ["lunch", "dinner", "snack"],
    core: ["cabbage"],
    optional: ["coconut", "spices", "oil", "green_chilli"],
    suitableFor: [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "jain",
      "no_gluten",
      "no_dairy",
    ],
    cautionFor: [],
    approxKcal: 160,
    proteinG: 4,
    minutes: 20,
  },
];

export const RECIPES_BY_KEY: ReadonlyMap<string, Recipe> = new Map(
  RECIPES.map((recipe) => [recipe.key, recipe]),
);

/** Every ingredient the intake screen can offer, derived so the two cannot drift. */
export const ALL_INGREDIENTS: readonly Ingredient[] = [
  ...new Set(RECIPES.flatMap((recipe) => [...recipe.core, ...recipe.optional])),
].sort();
