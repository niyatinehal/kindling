import type { Profile } from "../../generated/prisma/client.js";

/**
 * The wire shape of a profile. snake_case to match the rest of this API (see
 * routes/auth.ts), and `age_years` is DERIVED here rather than stored so the
 * web app and the workout slice can never disagree about how age is computed.
 */
export type ProfileView = {
  user_id: string;
  birth_year: number;
  age_years: number;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: string;
  level: string;
  space: string;
  equipment: string[];
  injuries: string[];
  conditions: string[];
  dietary: string[];
  notes: string | null;
  updated_at: string;
};

/**
 * Age in whole years from the birth year alone. Someone born in the current
 * year is 0: without a birth month there is no more precise honest answer, and
 * the request schema — not this function — is what refuses a future year.
 *
 * `now` is a parameter rather than read from the clock so a test can pin it.
 */
export function ageFromBirthYear(birthYear: number, now: Date): number {
  return now.getUTCFullYear() - birthYear;
}

export function toProfileView(row: Profile, now: Date): ProfileView {
  return {
    user_id: row.userId,
    birth_year: row.birthYear,
    age_years: ageFromBirthYear(row.birthYear, now),
    sex: row.sex,
    height_cm: row.heightCm,
    // Prisma hands back a Decimal object, which JSON.stringify would render as
    // {"s":1,"e":1,...}. Weight is a plain number on the wire.
    weight_kg: row.weightKg === null ? null : Number(row.weightKg),
    goal: row.goal,
    level: row.level,
    space: row.space,
    equipment: row.equipment,
    injuries: row.injuries,
    conditions: row.conditions,
    dietary: row.dietary,
    notes: row.notes,
    updated_at: row.updatedAt.toISOString(),
  };
}
