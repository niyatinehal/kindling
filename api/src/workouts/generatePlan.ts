import type { Profile } from "../../generated/prisma/client.js";
import type { Equipment, FitnessGoal, FitnessLevel } from "../../generated/prisma/enums.js";
import { ageFromBirthYear } from "../profile/toProfileView.js";
import { excludedTagsFor, flagsExcluding } from "./contraindications.js";
import { EXERCISES, meetsLevel } from "./exerciseLibrary.js";
import type { Exercise, Focus } from "./exerciseLibrary.js";

export const RULES_GENERATOR = "rules@1";

/** The age at which the plan switches to the elderly track (PRD FR-WRK-2). */
const ELDERLY_TRACK_AGE = 60;

export type PlannedExercise = {
  dayOfWeek: number;
  position: number;
  exerciseKey: string;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  restSeconds: number;
};

export type PlanDraft = {
  generator: string;
  exercises: PlannedExercise[];
  /** Flags that removed at least one movement — the rationale shown beside a plan. */
  appliedExclusions: string[];
};

/** How many training days a week, by declared level. */
const DAYS_BY_LEVEL: Record<FitnessLevel, number> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};

/**
 * The shape of a week per goal, as a repeating cycle of daily focuses.
 *
 * Cycles rather than fixed weeks so the same table serves a 3-day and a 5-day
 * schedule: the generator walks the cycle, wrapping as needed. Mobility appears
 * in every goal because no goal is served by losing range of motion.
 */
const FOCUS_CYCLE: Record<FitnessGoal, readonly Focus[]> = {
  fat_loss: ["full_body", "cardio", "lower", "cardio", "upper"],
  muscle_gain: ["upper", "lower", "upper", "lower", "core"],
  general_fitness: ["full_body", "mobility", "cardio", "upper", "lower"],
  mobility: ["mobility", "lower", "mobility", "core", "upper"],
  endurance: ["cardio", "lower", "cardio", "full_body", "cardio"],
  strength: ["lower", "upper", "core", "lower", "upper"],
};

/** Dose per goal. `time` movements use `seconds`; `reps` movements sets × reps. */
const DOSE: Record<FitnessGoal, { sets: number; reps: number; seconds: number; rest: number }> = {
  fat_loss: { sets: 3, reps: 12, seconds: 45, rest: 45 },
  muscle_gain: { sets: 3, reps: 10, seconds: 40, rest: 90 },
  general_fitness: { sets: 2, reps: 12, seconds: 40, rest: 60 },
  mobility: { sets: 2, reps: 10, seconds: 45, rest: 30 },
  endurance: { sets: 2, reps: 15, seconds: 90, rest: 45 },
  strength: { sets: 4, reps: 5, seconds: 30, rest: 120 },
};

const EXERCISES_PER_DAY = 5;

function hasEquipmentFor(exercise: Exercise, owned: readonly Equipment[]): boolean {
  // `none` is the user saying they own nothing, so it grants nothing. A
  // bodyweight movement lists no equipment and is therefore always available.
  return exercise.equipment.every((needed) => owned.includes(needed));
}

/**
 * Builds a week of training from a profile — no model, no network, no clock.
 *
 * Deterministic on purpose: the same profile always yields the same plan, which
 * is what lets the tests assert on real output instead of shape. Weekly variety
 * driven by logged adherence is FR-WRK-5's job, in a later slice, and it will
 * arrive as a different input to this same function rather than as randomness
 * inside it.
 *
 * The order of the pipeline is load-bearing. Availability filters run first and
 * the contraindication exclusion runs LAST and unconditionally, so no later step
 * can reintroduce a movement that a declared condition ruled out.
 */
export function generatePlan(profile: Profile, now: Date): PlanDraft {
  const excludedTags = excludedTagsFor({
    injuries: profile.injuries,
    conditions: profile.conditions,
  });
  const onElderlyTrack = ageFromBirthYear(profile.birthYear, now) >= ELDERLY_TRACK_AGE;

  const appliedExclusions = new Set<string>();

  const available = EXERCISES.filter((exercise) => {
    if (!hasEquipmentFor(exercise, profile.equipment)) {
      return false;
    }
    if (!exercise.spaces.includes(profile.space)) {
      return false;
    }
    if (!meetsLevel(exercise, profile.level)) {
      return false;
    }
    // The safety gate. Credit is attributed per TAG, via the rule that actually
    // named it — not to every flag the user declared. Blaming all of them would
    // tell someone their diabetes removed exercises when the rule for it excludes
    // nothing, which is a false claim about their own health data on the one
    // screen that has to be trustworthy.
    const blocking = exercise.tags.filter((tag) => excludedTags.has(tag));
    if (blocking.length > 0) {
      for (const tag of blocking) {
        for (const reason of flagsExcluding(tag, {
          injuries: profile.injuries,
          conditions: profile.conditions,
        })) {
          appliedExclusions.add(reason);
        }
      }
      return false;
    }
    if (onElderlyTrack && !exercise.lowImpact) {
      appliedExclusions.add("elderly_track");
      return false;
    }
    return true;
  });

  const cycle = FOCUS_CYCLE[profile.goal];
  const dose = DOSE[profile.goal];
  const dayCount = DAYS_BY_LEVEL[profile.level];
  const exercises: PlannedExercise[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    // Training days are spread across the week rather than stacked at the front:
    // 3 days becomes Mon/Wed/Fri, not Mon/Tue/Wed, so recovery is built in.
    const dayOfWeek = 1 + Math.floor((dayIndex * 7) / dayCount);
    const focus = cycle[dayIndex % cycle.length] ?? "full_body";

    const forDay = pickForFocus(available, focus);

    forDay.forEach((exercise, position) => {
      exercises.push({
        dayOfWeek,
        position,
        exerciseKey: exercise.key,
        sets: exercise.mode === "reps" ? dose.sets : null,
        reps: exercise.mode === "reps" ? dose.reps : null,
        durationSeconds: exercise.mode === "time" ? dose.seconds : null,
        restSeconds: dose.rest,
      });
    });
  }

  return {
    generator: RULES_GENERATOR,
    exercises,
    appliedExclusions: [...appliedExclusions].sort(),
  };
}

/**
 * Fills one day, preferring the day's focus and topping up from whatever else
 * survived the filters.
 *
 * The top-up matters: a small room with no equipment and a knee problem leaves
 * very few `lower` movements, and a short day is better than a day the user
 * cannot do. `full_body` counts toward every focus because it trains all of them.
 */
function pickForFocus(available: readonly Exercise[], focus: Focus): Exercise[] {
  const onFocus = available.filter(
    (exercise) => exercise.focus === focus || exercise.focus === "full_body",
  );
  const rest = available.filter((exercise) => !onFocus.includes(exercise));

  return [...onFocus, ...rest].slice(0, EXERCISES_PER_DAY);
}
