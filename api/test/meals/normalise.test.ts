import { describe, expect, it } from "@jest/globals";

import {
  normalisePantryText,
  normalisePhrase,
  splitPantrySegments,
} from "../../src/meals/normalise.js";

describe("normalisePantryText — one canonical form per pantry", () => {
  // The cache keys on this. Two orderings of the same list must be one entry.
  it("treats different orderings, casing and spacing as the same pantry", () => {
    expect(normalisePantryText("Aloo, Atta")).toBe(normalisePantryText("atta,aloo"));
    expect(normalisePantryText("  ATTA ,   aloo  ")).toBe("aloo, atta");
  });

  it("strips punctuation and drops empty parts", () => {
    expect(normalisePantryText("dahi!!, , paneer...")).toBe("dahi, paneer");
  });

  it("keeps Devanagari vowel signs, which a letters-only filter would strip", () => {
    expect(normalisePhrase("आलू")).toBe("आलू");
  });

  it("composes Unicode first, so two encodings of one word compare equal", () => {
    // "प्याज़" with a precomposed nukta letter, and with a separate nukta mark.
    expect(normalisePhrase("प्याज़")).toBe(normalisePhrase("प्याज़"));
  });
});

describe("splitPantrySegments — clauses the parser reads one at a time", () => {
  it("splits on list punctuation and on conjunctions in English and Hindi", () => {
    expect(splitPantrySegments("atta, dahi; paneer\nchawal aur dal and ghee और घी")).toEqual([
      "atta",
      "dahi",
      "paneer",
      "chawal",
      "dal",
      "ghee",
      "घी",
    ]);
  });

  it("splits a conjunction only as a whole word", () => {
    // "aur" inside a word, "and" inside "sandwich" — neither is a join.
    expect(splitPantrySegments("sandwich bread")).toEqual(["sandwich bread"]);
  });
});
