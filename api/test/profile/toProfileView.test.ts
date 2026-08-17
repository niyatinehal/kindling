import { describe, expect, it } from "@jest/globals";

import type { Profile } from "../../generated/prisma/client.js";
import { ageFromBirthYear, toProfileView } from "../../src/profile/toProfileView.js";

const NOW = new Date("2026-08-17T00:00:00.000Z");

const row = (overrides: Partial<Profile> = {}): Profile => ({
  id: "01920000-0000-7000-8000-000000000001",
  userId: "01920000-0000-7000-8000-000000000002",
  birthYear: 1963,
  sex: "male",
  heightCm: 170,
  // Prisma hands back a Decimal, not a number. The shape that matters here is
  // "an object whose Number() is the weight", which is what the view must
  // survive — a plain number would not exercise the conversion at all.
  weightKg: { toString: () => "78.50" } as unknown as Profile["weightKg"],
  goal: "general_fitness",
  level: "beginner",
  space: "small_room",
  equipment: ["resistance_band", "yoga_mat"],
  injuries: ["knee"],
  conditions: ["arthritis", "type_2_diabetes"],
  dietary: ["vegetarian"],
  notes: "left shoulder clicks when overhead",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe("ageFromBirthYear", () => {
  it("gives whole years", () => {
    expect(ageFromBirthYear(1963, NOW)).toBe(63);
  });

  // Someone born this year is 0, not -1 and not a crash. Without a birth month
  // there is no more precise honest answer.
  it("gives 0 for someone born in the current year", () => {
    expect(ageFromBirthYear(2026, NOW)).toBe(0);
  });
});

describe("toProfileView", () => {
  it("maps a row to the wire shape and derives age", () => {
    expect(toProfileView(row(), NOW)).toMatchObject({
      user_id: "01920000-0000-7000-8000-000000000002",
      birth_year: 1963,
      age_years: 63,
      sex: "male",
      height_cm: 170,
      goal: "general_fitness",
      level: "beginner",
      space: "small_room",
      equipment: ["resistance_band", "yoga_mat"],
      injuries: ["knee"],
      conditions: ["arthritis", "type_2_diabetes"],
      dietary: ["vegetarian"],
      notes: "left shoulder clicks when overhead",
    });
  });

  // The bug this pins: Prisma's Decimal serialises through JSON.stringify as
  // {"s":1,"e":1,"d":[78,5]}, so a client reading `weight_kg` would get an
  // object where it expected a number.
  it("renders weight as a number, not a Decimal object", () => {
    const view = toProfileView(row(), NOW);

    expect(view.weight_kg).toBe(78.5);
    expect(typeof view.weight_kg).toBe("number");
  });

  it("keeps absent optional measurements null rather than inventing them", () => {
    const view = toProfileView(
      row({ sex: null, heightCm: null, weightKg: null, notes: null }),
      NOW,
    );

    expect(view.sex).toBeNull();
    expect(view.height_cm).toBeNull();
    expect(view.weight_kg).toBeNull();
    expect(view.notes).toBeNull();
  });
});
