import { normalisePhrase, splitPantrySegments } from "./normalise.js";
import { ALL_INGREDIENTS } from "./recipeLibrary.js";
import type { Ingredient } from "./recipeLibrary.js";

export const SYNONYM_PARSER = "synonyms@1";

/**
 * What people actually call the things in their kitchen, mapped to the keys the
 * matcher understands.
 *
 * English, Hindi in Latin script as it is really typed (several spellings each,
 * because "pyaz", "pyaaz" and "kanda" are all one onion), and the common
 * Devanagari forms. Every key in the vocabulary is also reachable by its own
 * name — those entries are generated below rather than listed, so a new
 * ingredient in the recipe library is parseable the day it is added.
 *
 * Deliberately a lookup and not fuzzy matching: a wrong guess here becomes a
 * chip the user has to notice and remove, and a phrase that maps nowhere is
 * shown back as "not in our list yet", which is honest. Longer phrases win over
 * shorter ones, so "chana dal" is chana dal and "patta gobi" is cabbage, not
 * cauliflower.
 *
 * Bare "dal" maps to toor dal, the everyday default across most of north and
 * west India. It is a guess, and the confirm step is where it gets corrected.
 */
const PHRASES: Readonly<Record<string, Ingredient>> = {
  // Grains and flours
  chawal: "rice",
  chaawal: "rice",
  chaval: "rice",
  basmati: "rice",
  "basmati rice": "rice",
  चावल: "rice",
  aata: "atta",
  ata: "atta",
  "gehun atta": "atta",
  "gehu atta": "atta",
  "gehun ka atta": "atta",
  "gehu ka atta": "atta",
  "wheat flour": "atta",
  "whole wheat flour": "atta",
  "chakki atta": "atta",
  आटा: "atta",
  "gram flour": "besan",
  "chickpea flour": "besan",
  बेसन: "besan",
  sooji: "semolina",
  suji: "semolina",
  soojee: "semolina",
  rava: "semolina",
  rawa: "semolina",
  सूजी: "semolina",
  "flattened rice": "poha",
  "beaten rice": "poha",
  pohe: "poha",
  पोहा: "poha",
  oat: "oats",

  // Dals and pulses
  dal: "toor_dal",
  daal: "toor_dal",
  dhal: "toor_dal",
  toor: "toor_dal",
  tur: "toor_dal",
  "tur dal": "toor_dal",
  "toor daal": "toor_dal",
  "tuvar dal": "toor_dal",
  "toovar dal": "toor_dal",
  arhar: "toor_dal",
  "arhar dal": "toor_dal",
  "arhar daal": "toor_dal",
  "pigeon peas": "toor_dal",
  दाल: "toor_dal",
  "अरहर दाल": "toor_dal",
  moong: "moong_dal",
  mung: "moong_dal",
  "moong daal": "moong_dal",
  "mung dal": "moong_dal",
  "मूंग दाल": "moong_dal",
  "chana daal": "chana_dal",
  "chane ki dal": "chana_dal",
  "चना दाल": "chana_dal",
  "kidney beans": "rajma",
  "red kidney beans": "rajma",
  राजमा: "rajma",
  chana: "chickpeas",
  channa: "chickpeas",
  chole: "chickpeas",
  chhole: "chickpeas",
  cholay: "chickpeas",
  "kabuli chana": "chickpeas",
  "safed chana": "chickpeas",
  "kala chana": "chickpeas",
  chickpea: "chickpeas",
  "garbanzo beans": "chickpeas",
  छोले: "chickpeas",
  चना: "chickpeas",

  // Dairy, eggs and meat
  "cottage cheese": "paneer",
  panner: "paneer",
  पनीर: "paneer",
  dahi: "curd",
  dahee: "curd",
  yogurt: "curd",
  yoghurt: "curd",
  yoghourt: "curd",
  दही: "curd",
  anda: "egg",
  ande: "egg",
  anday: "egg",
  eggs: "egg",
  अंडा: "egg",
  अंडे: "egg",
  murgi: "chicken",
  murga: "chicken",
  murgh: "chicken",
  मुर्गा: "chicken",
  machli: "fish",
  machhli: "fish",
  machi: "fish",
  मछली: "fish",

  // Vegetables
  aloo: "potato",
  alu: "potato",
  aaloo: "potato",
  batata: "potato",
  potatoes: "potato",
  potatos: "potato",
  आलू: "potato",
  pyaz: "onion",
  pyaaz: "onion",
  piyaz: "onion",
  kanda: "onion",
  onions: "onion",
  प्याज़: "onion",
  प्याज: "onion",
  tamatar: "tomato",
  tamater: "tomato",
  tomatoes: "tomato",
  tomatos: "tomato",
  tomatoe: "tomato",
  tamato: "tomato",
  टमाटर: "tomato",
  palak: "spinach",
  paalak: "spinach",
  पालक: "spinach",
  gobi: "cauliflower",
  gobhi: "cauliflower",
  "phool gobi": "cauliflower",
  "phool gobhi": "cauliflower",
  phoolgobi: "cauliflower",
  "फूल गोभी": "cauliflower",
  गोभी: "cauliflower",
  bhindi: "okra",
  "lady finger": "okra",
  "ladies finger": "okra",
  ladyfinger: "okra",
  भिंडी: "okra",
  lauki: "bottle_gourd",
  louki: "bottle_gourd",
  ghiya: "bottle_gourd",
  dudhi: "bottle_gourd",
  doodhi: "bottle_gourd",
  लौकी: "bottle_gourd",
  gajar: "carrot",
  carrots: "carrot",
  गाजर: "carrot",
  matar: "peas",
  mattar: "peas",
  mutter: "peas",
  "green peas": "peas",
  मटर: "peas",
  "patta gobi": "cabbage",
  "patta gobhi": "cabbage",
  "band gobi": "cabbage",
  "bandh gobi": "cabbage",
  "band gobhi": "cabbage",
  "पत्ता गोभी": "cabbage",
  baingan: "brinjal",
  baigan: "brinjal",
  bengan: "brinjal",
  eggplant: "brinjal",
  aubergine: "brinjal",
  बैंगन: "brinjal",

  // Everyday basics
  tel: "oil",
  "cooking oil": "oil",
  "mustard oil": "oil",
  "sarson tel": "oil",
  "sarson ka tel": "oil",
  "refined oil": "oil",
  तेल: "oil",
  "desi ghee": "ghee",
  घी: "ghee",
  masala: "spices",
  masale: "spices",
  "garam masala": "spices",
  jeera: "spices",
  zeera: "spices",
  cumin: "spices",
  haldi: "spices",
  turmeric: "spices",
  "lal mirch": "spices",
  "red chilli powder": "spices",
  "dhania powder": "spices",
  rai: "spices",
  mustard: "spices",
  hing: "spices",
  spice: "spices",
  मसाला: "spices",
  जीरा: "spices",
  हल्दी: "spices",
  adrak: "ginger",
  adrakh: "ginger",
  अदरक: "ginger",
  lehsun: "garlic",
  lahsun: "garlic",
  lasun: "garlic",
  lehsan: "garlic",
  लहसुन: "garlic",
  mirch: "green_chilli",
  mirchi: "green_chilli",
  "hari mirch": "green_chilli",
  "hari mirchi": "green_chilli",
  "green chillies": "green_chilli",
  "green chilies": "green_chilli",
  "green chili": "green_chilli",
  chilli: "green_chilli",
  chillies: "green_chilli",
  "हरी मिर्च": "green_chilli",
  मिर्च: "green_chilli",
  nimbu: "lemon",
  nimboo: "lemon",
  neembu: "lemon",
  lime: "lemon",
  lemons: "lemon",
  नींबू: "lemon",
  dhania: "coriander",
  dhaniya: "coriander",
  cilantro: "coriander",
  "hara dhania": "coriander",
  धनिया: "coriander",
  nariyal: "coconut",
  नारियल: "coconut",
  moongphali: "peanuts",
  mungfali: "peanuts",
  moongfali: "peanuts",
  groundnut: "peanuts",
  groundnuts: "peanuts",
  peanut: "peanuts",
  मूंगफली: "peanuts",
};

/**
 * The lookup the parser actually uses: every phrase above plus every key by its
 * own name ("toor_dal" and "toor dal" alike), all passed through the same
 * normaliser as the input so a nukta or a capital can never cause a miss.
 */
export const SYNONYMS: ReadonlyMap<string, Ingredient> = new Map<string, Ingredient>([
  ...ALL_INGREDIENTS.map((key) => [normalisePhrase(key), key] as const),
  ...Object.entries(PHRASES).map(([phrase, key]) => [normalisePhrase(phrase), key] as const),
]);

const LONGEST_PHRASE = Math.max(...[...SYNONYMS.keys()].map((phrase) => phrase.split(" ").length));

/**
 * Words that say an item is NOT in the kitchen. A clause containing one is
 * dropped whole: "paneer khatam" must not put paneer on the list, and guessing
 * which word in the clause the negation belongs to is how that goes wrong.
 */
const NEGATIONS = new Set(
  [
    "khatam",
    "khatm",
    "khtm",
    "khatham",
    "nahi",
    "nahin",
    "nahee",
    "nhi",
    "no",
    "not",
    "none",
    "nothing",
    "without",
    "finished",
    "empty",
    "खत्म",
    "ख़त्म",
    "नहीं",
    "नही",
  ].map(normalisePhrase),
);

/** Two-word negations, checked as a pair. */
const NEGATION_PAIRS = new Set(["ran out", "out of", "used up"]);

/**
 * Words that carry no ingredient: quantities, units, and the Hinglish glue
 * around a list ("thoda", "bacha hai"). Dropped before matching so they never
 * end up in `unrecognised` as though they were food.
 */
const FILLER = new Set(
  [
    // English
    "a",
    "an",
    "the",
    "some",
    "little",
    "bit",
    "of",
    "few",
    "lots",
    "lot",
    "plenty",
    "i",
    "we",
    "have",
    "has",
    "got",
    "there",
    "is",
    "are",
    "in",
    "at",
    "my",
    "our",
    "also",
    "only",
    "just",
    "left",
    "leftover",
    "remaining",
    "fresh",
    "half",
    "fridge",
    "kitchen",
    "home",
    "pantry",
    "today",
    // Hinglish
    "thoda",
    "thodi",
    "thode",
    "thora",
    "thori",
    "kuch",
    "bas",
    "sirf",
    "bhi",
    "bacha",
    "bachi",
    "bache",
    "hai",
    "hain",
    "he",
    "h",
    "mein",
    "me",
    "main",
    "ghar",
    "pada",
    "padi",
    "pade",
    "rakha",
    "rakhi",
    "kaafi",
    "kafi",
    "bahut",
    "zyada",
    "aadha",
    "adha",
    "ka",
    "ki",
    "ke",
    "aaj",
    "ek",
    "do",
    "teen",
    "char",
    "paanch",
    "dedh",
    "dhai",
    // Units
    "kg",
    "kgs",
    "kilo",
    "kilos",
    "g",
    "gm",
    "gms",
    "gram",
    "grams",
    "gramme",
    "l",
    "litre",
    "litres",
    "liter",
    "liters",
    "ltr",
    "ml",
    "packet",
    "packets",
    "pack",
    "packs",
    "dozen",
    "darjan",
    "piece",
    "pieces",
    "pc",
    "pcs",
    "bunch",
    "gaddi",
    "katori",
    "bowl",
    "bowls",
    "cup",
    "cups",
    "glass",
    "tin",
    "can",
    "box",
    "bag",
    "jar",
    "bottle",
    // Devanagari
    "थोड़ा",
    "थोड़ी",
    "थोड़े",
    "कुछ",
    "बचा",
    "बची",
    "बचे",
    "है",
    "हैं",
    "में",
    "भी",
    "किलो",
  ].map(normalisePhrase),
);

/** "2", "500g", "1kg" — a number, optionally glued to a unit. */
const QUANTITY = /^\p{N}+[\p{L}]{0,6}$/u;

const MAX_UNRECOGNISED = 20;
const MAX_UNRECOGNISED_LENGTH = 40;

export type SynonymParse = {
  /** Deduplicated, in the order the user mentioned them. */
  recognised: Ingredient[];
  /** Phrases that map to nothing, short, deduplicated, in order. */
  unrecognised: string[];
};

function isNegated(words: readonly string[]): boolean {
  return words.some(
    (word, index) => NEGATIONS.has(word) || NEGATION_PAIRS.has(`${word} ${words[index + 1] ?? ""}`),
  );
}

/**
 * Reads a pantry from free text with nothing but the table above.
 *
 * Clause by clause: drop negated clauses, then match the longest known phrase
 * at each position, skipping filler and quantities that match nothing. Runs of words that match
 * nothing become one `unrecognised` phrase each, so "leftover sabzi aur maggi"
 * reports "sabzi" and "maggi", not four separate words.
 */
export function parseWithSynonyms(text: string): SynonymParse {
  const recognised = new Set<Ingredient>();
  const unrecognised = new Set<string>();

  for (const segment of splitPantrySegments(text)) {
    const words = segment.split(" ");
    if (isNegated(words)) {
      continue;
    }

    // Filler is skipped only where it matches nothing, so a phrase that
    // contains a filler word ("bottle gourd", "sarson ka tel") still matches.
    let unmatched: string[] = [];
    const flush = () => {
      if (unmatched.length > 0) {
        unrecognised.add(unmatched.join(" ").slice(0, MAX_UNRECOGNISED_LENGTH).trim());
        unmatched = [];
      }
    };

    let index = 0;
    while (index < words.length) {
      let matched = false;
      for (let length = Math.min(LONGEST_PHRASE, words.length - index); length > 0; length--) {
        const key = SYNONYMS.get(words.slice(index, index + length).join(" "));
        if (key !== undefined) {
          flush();
          recognised.add(key);
          index += length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        const word = words[index] ?? "";
        if (!FILLER.has(word) && !QUANTITY.test(word)) {
          unmatched.push(word);
        }
        index++;
      }
    }
    flush();
  }

  return {
    recognised: [...recognised],
    unrecognised: [...unrecognised].filter((phrase) => phrase !== "").slice(0, MAX_UNRECOGNISED),
  };
}
