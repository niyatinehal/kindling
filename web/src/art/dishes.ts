/**
 * One recipe per entry, described rather than drawn: what it is served in,
 * the colour and texture of the food, and what is scattered on top.
 * `DishArt` turns a description into a top-down illustration, so all twenty
 * dishes share one style. A new recipe needs an entry here; `dishArt.test.tsx`
 * fails until it has one.
 *
 * Food colours are literal on purpose. Dal is yellow in the dark theme too —
 * only the crockery and the table follow the theme.
 */
export type Bit = {
  kind: "leaf" | "dot" | "cube" | "ring" | "slice" | "bean" | "chunk";
  color: string;
  count: number;
};

export type Dish = {
  /** `thali` puts the main in a small bowl beside a side on the plate. */
  layout: "bowl" | "plate" | "thali";
  food: string;
  texture?: "smooth" | "grain" | "crumble";
  side?: "rice" | "roti";
  bits?: readonly Bit[];
  /** A lemon wedge or a spoon of cream, drawn once at a fixed spot. */
  extra?: "lemon" | "cream" | "ghee";
};

const CORIANDER = "#4f9a3c";
const CURRY_LEAF = "#2f6b2a";
const MUSTARD_SEED = "#3b2a1a";
const CUMIN = "#8a5a2b";
const TOMATO = "#d9482b";
const ONION = "#e9d7e6";
const CHILLI = "#3f8f3a";

export const DISHES: Record<string, Dish> = {
  dal_chawal: {
    layout: "thali",
    food: "#e8b33a",
    side: "rice",
    bits: [
      { kind: "leaf", color: CORIANDER, count: 4 },
      { kind: "dot", color: CUMIN, count: 6 },
    ],
    extra: "ghee",
  },
  jeera_rice: {
    layout: "bowl",
    food: "#f1ead6",
    texture: "grain",
    bits: [
      { kind: "dot", color: CUMIN, count: 18 },
      { kind: "leaf", color: CORIANDER, count: 3 },
    ],
  },
  roti_sabzi: {
    layout: "thali",
    food: "#e3a93b",
    side: "roti",
    bits: [
      { kind: "cube", color: "#f2cf6d", count: 6 },
      { kind: "leaf", color: CORIANDER, count: 3 },
    ],
  },
  palak_paneer: {
    layout: "bowl",
    food: "#4f7d3a",
    bits: [{ kind: "cube", color: "#f5efe0", count: 7 }],
    extra: "cream",
  },
  rajma_chawal: {
    layout: "thali",
    food: "#8b3a2e",
    side: "rice",
    bits: [
      { kind: "bean", color: "#5e1f18", count: 9 },
      { kind: "leaf", color: CORIANDER, count: 2 },
    ],
  },
  chana_masala: {
    layout: "bowl",
    food: "#b5602f",
    bits: [
      { kind: "slice", color: "#e0b36a", count: 10 },
      { kind: "ring", color: ONION, count: 3 },
      { kind: "leaf", color: CORIANDER, count: 3 },
    ],
    extra: "lemon",
  },
  aloo_gobi: {
    layout: "plate",
    food: "#e2ae3f",
    texture: "crumble",
    bits: [
      { kind: "cube", color: "#f3d27a", count: 7 },
      { kind: "chunk", color: "#f4ead0", count: 5 },
      { kind: "leaf", color: CORIANDER, count: 3 },
    ],
  },
  bhindi_masala: {
    layout: "plate",
    food: "#a0762f",
    texture: "crumble",
    bits: [
      { kind: "slice", color: "#5f8f3a", count: 12 },
      { kind: "ring", color: ONION, count: 2 },
    ],
  },
  lauki_chana_dal: {
    layout: "bowl",
    food: "#d9b44a",
    bits: [
      { kind: "cube", color: "#b8cf8a", count: 7 },
      { kind: "leaf", color: CORIANDER, count: 3 },
    ],
  },
  baingan_bharta: {
    layout: "bowl",
    food: "#7a4a3a",
    texture: "crumble",
    bits: [
      { kind: "dot", color: TOMATO, count: 8 },
      { kind: "slice", color: CHILLI, count: 3 },
      { kind: "leaf", color: CORIANDER, count: 3 },
    ],
  },
  poha: {
    layout: "plate",
    food: "#f0d26a",
    texture: "crumble",
    bits: [
      { kind: "bean", color: "#c98b4a", count: 7 },
      { kind: "dot", color: "#7fb04a", count: 8 },
      { kind: "leaf", color: CURRY_LEAF, count: 3 },
    ],
    extra: "lemon",
  },
  upma: {
    layout: "plate",
    food: "#eadcb5",
    texture: "crumble",
    bits: [
      { kind: "dot", color: MUSTARD_SEED, count: 12 },
      { kind: "leaf", color: CURRY_LEAF, count: 3 },
      { kind: "dot", color: "#e67e22", count: 5 },
    ],
  },
  besan_chilla: {
    layout: "plate",
    food: "#e0a23c",
    bits: [
      { kind: "dot", color: "#b36a1e", count: 12 },
      { kind: "leaf", color: CORIANDER, count: 4 },
      { kind: "dot", color: TOMATO, count: 4 },
    ],
  },
  masala_oats: {
    layout: "bowl",
    food: "#cfa86a",
    texture: "grain",
    bits: [
      { kind: "cube", color: "#e67e22", count: 6 },
      { kind: "dot", color: "#7fb04a", count: 6 },
    ],
  },
  curd_rice: {
    layout: "bowl",
    food: "#f4f1e8",
    texture: "grain",
    bits: [
      { kind: "dot", color: MUSTARD_SEED, count: 10 },
      { kind: "dot", color: "#c0283a", count: 6 },
      { kind: "leaf", color: CURRY_LEAF, count: 3 },
    ],
  },
  moong_dal_khichdi: {
    layout: "bowl",
    food: "#e9c65a",
    texture: "grain",
    bits: [
      { kind: "dot", color: CUMIN, count: 8 },
      { kind: "leaf", color: CORIANDER, count: 2 },
    ],
    extra: "ghee",
  },
  egg_bhurji: {
    layout: "plate",
    food: "#f4c542",
    texture: "crumble",
    bits: [
      { kind: "dot", color: TOMATO, count: 8 },
      { kind: "ring", color: ONION, count: 2 },
      { kind: "leaf", color: CORIANDER, count: 4 },
    ],
  },
  chicken_curry: {
    layout: "bowl",
    food: "#b04a22",
    bits: [
      { kind: "chunk", color: "#e7b07a", count: 6 },
      { kind: "leaf", color: CORIANDER, count: 3 },
    ],
    extra: "cream",
  },
  fish_curry: {
    layout: "bowl",
    food: "#d0782a",
    bits: [
      { kind: "chunk", color: "#f1dcc0", count: 5 },
      { kind: "leaf", color: CURRY_LEAF, count: 3 },
    ],
    extra: "lemon",
  },
  cabbage_poriyal: {
    layout: "plate",
    food: "#cfe3a2",
    texture: "crumble",
    bits: [
      { kind: "dot", color: "#fbfaf5", count: 12 },
      { kind: "dot", color: MUSTARD_SEED, count: 8 },
      { kind: "leaf", color: CURRY_LEAF, count: 3 },
    ],
  },
};

/** What a recipe the library has not been drawn for yet gets. */
export const FALLBACK_DISH: Dish = {
  layout: "bowl",
  food: "#d9a441",
  bits: [{ kind: "leaf", color: CORIANDER, count: 3 }],
};
