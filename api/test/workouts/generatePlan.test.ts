import { describe, expect, it } from "@jest/globals";

import type { Profile } from "../../generated/prisma/client.js";
import { generatePlan } from "../../src/workouts/generatePlan.js";
import { EXERCISES_BY_KEY } from "../../src/workouts/exerciseLibrary.js";
import type { ExerciseTag } from "../../src/workouts/exerciseLibrary.js";

const NOW = new Date("2026-08-17T00:00:00.000Z");

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: "01920000-0000-7000-8000-000000000001",
  userId: "01920000-0000-7000-8000-000000000002",
  // 1996 keeps the default fixture off the elderly track; tests that want it
  // set birthYear explicitly.
  birthYear: 1996,
  sex: null,
  heightCm: null,
  weightKg: null,
  goal: "general_fitness",
  level: "intermediate",
  space: "large_room",
  equipment: ["resistance_band", "dumbbells", "yoga_mat", "jump_rope"],
  injuries: [],
  conditions: [],
  dietary: [],
  notes: null,
  aiPantryConsent: false,
  aiPantryConsentAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

/** Every tag carried by every exercise the plan prescribes. */
const tagsIn = (plan: { exercises: { exerciseKey: string }[] }): ExerciseTag[] =>
  plan.exercises.flatMap((entry) => EXERCISES_BY_KEY.get(entry.exerciseKey)?.tags ?? []);

const keysIn = (plan: { exercises: { exerciseKey: string }[] }): string[] =>
  plan.exercises.map((entry) => entry.exerciseKey);

describe("generatePlan — shape", () => {
  it("produces a plan and stamps the generator that built it", () => {
    const plan = generatePlan(profile(), NOW);

    expect(plan.generator).toBe("rules@1");
    expect(plan.exercises.length).toBeGreaterThan(0);
  });

  it("gives more training days to a more advanced user", () => {
    const days = (level: Profile["level"]) =>
      new Set(generatePlan(profile({ level }), NOW).exercises.map((e) => e.dayOfWeek)).size;

    expect(days("beginner")).toBe(3);
    expect(days("intermediate")).toBe(4);
    expect(days("advanced")).toBe(5);
  });

  // Mon/Wed/Fri, not Mon/Tue/Wed — recovery is part of the plan, not an
  // afterthought.
  it("spreads training days across the week rather than stacking them", () => {
    const plan = generatePlan(profile({ level: "beginner" }), NOW);

    expect([...new Set(plan.exercises.map((e) => e.dayOfWeek))].sort()).toEqual([1, 3, 5]);
  });

  it("gives every exercise a dose and never both a rep count and a duration", () => {
    const plan = generatePlan(profile(), NOW);

    for (const entry of plan.exercises) {
      const hasReps = entry.sets !== null && entry.reps !== null;
      const hasDuration = entry.durationSeconds !== null;

      expect(hasReps || hasDuration).toBe(true);
      expect(hasReps && hasDuration).toBe(false);
      expect(entry.restSeconds).toBeGreaterThan(0);
    }
  });

  it("doses strength heavier and lower-rep than muscle gain", () => {
    const strength = generatePlan(profile({ goal: "strength" }), NOW).exercises.find(
      (e) => e.reps !== null,
    );
    const hypertrophy = generatePlan(profile({ goal: "muscle_gain" }), NOW).exercises.find(
      (e) => e.reps !== null,
    );

    expect(strength?.sets).toBe(4);
    expect(strength?.reps).toBe(5);
    expect(hypertrophy?.sets).toBe(3);
    expect(hypertrophy?.reps).toBe(10);
  });

  // Determinism is what makes every other assertion in this file meaningful.
  it("is deterministic for the same profile", () => {
    expect(generatePlan(profile(), NOW)).toEqual(generatePlan(profile(), NOW));
  });
});

describe("generatePlan — availability filters", () => {
  it("never prescribes equipment the user does not own", () => {
    const plan = generatePlan(profile({ equipment: ["none"] }), NOW);

    for (const key of keysIn(plan)) {
      expect(EXERCISES_BY_KEY.get(key)?.equipment).toEqual([]);
    }
    expect(plan.exercises.length).toBeGreaterThan(0);
  });

  // `["none"]` is an answer, not an absence — it must still yield a usable plan.
  it("still builds a full plan for someone with no equipment in a small room", () => {
    const plan = generatePlan(
      profile({ equipment: ["none"], space: "small_room", level: "beginner" }),
      NOW,
    );

    expect(new Set(plan.exercises.map((e) => e.dayOfWeek)).size).toBe(3);
  });

  it("never prescribes a movement that does not fit the space", () => {
    const plan = generatePlan(profile({ space: "small_room" }), NOW);

    for (const key of keysIn(plan)) {
      expect(EXERCISES_BY_KEY.get(key)?.spaces).toContain("small_room");
    }
  });

  it("keeps advanced movements away from a beginner", () => {
    const plan = generatePlan(profile({ level: "beginner" }), NOW);

    for (const key of keysIn(plan)) {
      expect(EXERCISES_BY_KEY.get(key)?.minLevel).toBe("beginner");
    }
  });
});

// The reason this slice needs no LLM. Each case is a hard exclusion that must
// hold no matter what else the generator decides.
describe("generatePlan — contraindication safety layer", () => {
  it("excludes high-impact and deep knee flexion for a knee injury", () => {
    const plan = generatePlan(profile({ injuries: ["knee"] }), NOW);

    expect(tagsIn(plan)).not.toContain("high_impact");
    expect(tagsIn(plan)).not.toContain("deep_knee_flexion");
  });

  it("excludes spinal loading and flexion for a lower-back injury", () => {
    const plan = generatePlan(profile({ injuries: ["lower_back"] }), NOW);

    expect(tagsIn(plan)).not.toContain("spinal_loading");
    expect(tagsIn(plan)).not.toContain("spinal_flexion");
  });

  it("excludes overhead pressing for a shoulder injury", () => {
    const plan = generatePlan(profile({ injuries: ["shoulder"] }), NOW);

    expect(tagsIn(plan)).not.toContain("overhead_press");
  });

  // Straining against a closed airway spikes blood pressure.
  it("excludes breath-holding and inversion for hypertension", () => {
    const plan = generatePlan(profile({ conditions: ["hypertension"] }), NOW);

    expect(tagsIn(plan)).not.toContain("breath_hold");
    expect(tagsIn(plan)).not.toContain("inverted");
  });

  it("excludes loaded spinal flexion for osteoporosis", () => {
    const plan = generatePlan(profile({ conditions: ["osteoporosis"] }), NOW);

    expect(tagsIn(plan)).not.toContain("spinal_flexion");
    expect(tagsIn(plan)).not.toContain("spinal_loading");
  });

  it("excludes supine, prone, high-impact and balance work during pregnancy", () => {
    const plan = generatePlan(profile({ conditions: ["pregnancy"] }), NOW);

    for (const tag of ["supine_flat", "prone", "high_impact", "balance_demand"]) {
      expect(tagsIn(plan)).not.toContain(tag);
    }
  });

  // Ramesh, PRD persona 3: 63, knee arthritis, type 2 diabetes, resistance band,
  // small room. The plan this produces is the whole reason the slice exists.
  it("builds a safe plan for the elderly persona with overlapping flags", () => {
    const plan = generatePlan(
      profile({
        birthYear: 1963,
        level: "beginner",
        space: "small_room",
        equipment: ["resistance_band", "yoga_mat"],
        injuries: ["knee"],
        conditions: ["arthritis", "type_2_diabetes"],
      }),
      NOW,
    );

    expect(plan.exercises.length).toBeGreaterThan(0);
    expect(tagsIn(plan)).not.toContain("high_impact");
    expect(tagsIn(plan)).not.toContain("deep_knee_flexion");
    // Elderly track: every movement is joint-friendly.
    for (const key of keysIn(plan)) {
      expect(EXERCISES_BY_KEY.get(key)?.lowImpact).toBe(true);
    }
  });

  it("reports which flags removed movements, so the plan can say why", () => {
    const plan = generatePlan(profile({ injuries: ["knee"], conditions: ["arthritis"] }), NOW);

    expect(plan.appliedExclusions).toContain("knee");
    expect(plan.appliedExclusions).toContain("arthritis");
  });

  // The bug this pins, caught by generating a real plan rather than by a test:
  // attribution used to blame every declared flag whenever anything was blocked,
  // so Ramesh's plan claimed his type 2 diabetes had removed exercises. It had
  // not — the rule for it excludes nothing. Telling someone a false story about
  // their own health data is worse than telling them nothing.
  it("credits only the flags whose rules actually removed something", () => {
    const plan = generatePlan(
      profile({ injuries: ["knee"], conditions: ["arthritis", "type_2_diabetes"] }),
      NOW,
    );

    expect(plan.appliedExclusions).toContain("knee");
    expect(plan.appliedExclusions).toContain("arthritis");
    expect(plan.appliedExclusions).not.toContain("type_2_diabetes");
  });

  it("names only the injury responsible when an unrelated one is also declared", () => {
    // `wrist` excludes wrist_loading; `ankle` excludes high_impact and balance.
    // A movement blocked purely for wrist loading must not implicate the ankle.
    const plan = generatePlan(profile({ injuries: ["wrist"], conditions: [] }), NOW);

    expect(plan.appliedExclusions).toEqual(["wrist"]);
  });

  // A flag that changes pacing rather than mechanics must not silently shrink
  // the library — inventing exclusions to look thorough is its own failure.
  it("lets a metabolic-only condition leave the movement set alone", () => {
    const withDiabetes = generatePlan(profile({ conditions: ["type_2_diabetes"] }), NOW);
    const without = generatePlan(profile(), NOW);

    expect(keysIn(withDiabetes)).toEqual(keysIn(without));
    expect(withDiabetes.appliedExclusions).toEqual([]);
  });

  it("keeps the elderly track off high-impact work even with no declared flags", () => {
    const plan = generatePlan(profile({ birthYear: 1955, level: "beginner" }), NOW);

    for (const key of keysIn(plan)) {
      expect(EXERCISES_BY_KEY.get(key)?.lowImpact).toBe(true);
    }
  });
});
