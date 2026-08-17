import type { Equipment, FitnessLevel, SpaceCategory } from "../../generated/prisma/enums.js";

/**
 * Movement patterns a plan day can be built around.
 */
export type Focus = "full_body" | "upper" | "lower" | "core" | "mobility" | "cardio";

/**
 * What a movement does to a body, expressed so a rule can exclude it.
 *
 * These are the join between this library and `contraindications.ts`: a rule
 * names tags, never individual exercises, so adding an exercise automatically
 * inherits every exclusion that applies to it. Tagging a new entry wrongly is
 * the one way to introduce an unsafe recommendation, which is why the tags
 * describe mechanics ("the head goes below the heart") rather than opinions
 * ("hard on the back").
 */
export type ExerciseTag =
  | "high_impact"
  | "deep_knee_flexion"
  | "spinal_loading"
  | "spinal_flexion"
  | "overhead_press"
  | "wrist_loading"
  | "prone"
  | "supine_flat"
  | "breath_hold"
  | "high_intensity"
  | "inverted"
  | "balance_demand";

export type Exercise = {
  key: string;
  focus: Focus;
  tags: ExerciseTag[];
  /** ALL of these must be owned for the exercise to be offered. Empty = bodyweight. */
  equipment: Equipment[];
  /** Where the movement actually fits. Not an ordering — a gym is not a superset of outdoors. */
  spaces: SpaceCategory[];
  minLevel: FitnessLevel;
  /** `time` movements carry their dose in seconds; `reps` movements in sets × reps. */
  mode: "reps" | "time";
  /** Safe for the elderly track: joint-friendly, low fall risk, no straining. */
  lowImpact: boolean;
};

const LEVEL_ORDER: Record<FitnessLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

export function meetsLevel(exercise: Exercise, level: FitnessLevel): boolean {
  return LEVEL_ORDER[exercise.minLevel] <= LEVEL_ORDER[level];
}

/**
 * The catalogue, in code rather than in a table.
 *
 * It is reference data that ships with the application: it changes when the
 * code changes, it is what `contraindications.ts` is written against, and
 * keeping both in git means a reviewer sees a new movement and the rules that
 * constrain it in a single diff. A database table would put the safety-critical
 * half of that pair outside code review.
 *
 * Names are deliberately absent — only keys. Every user-visible string in this
 * product goes through next-intl (`web/messages/en.json`), so a display name
 * here would be a second, untranslated source of truth.
 */
export const EXERCISES: readonly Exercise[] = [
  // ---- Bodyweight, no equipment -------------------------------------------
  {
    key: "bodyweight_squat",
    focus: "lower",
    tags: ["deep_knee_flexion"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "chair_sit_to_stand",
    focus: "lower",
    tags: [],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "wall_pushup",
    focus: "upper",
    tags: ["wrist_loading"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "pushup",
    focus: "upper",
    tags: ["wrist_loading", "prone"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "intermediate",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "forward_lunge",
    focus: "lower",
    tags: ["deep_knee_flexion", "balance_demand"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "intermediate",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "glute_bridge",
    focus: "lower",
    tags: ["supine_flat"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "plank",
    focus: "core",
    tags: ["wrist_loading", "prone"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "dead_bug",
    focus: "core",
    tags: ["supine_flat"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "crunch",
    focus: "core",
    tags: ["supine_flat", "spinal_flexion"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "bird_dog",
    focus: "core",
    tags: ["wrist_loading", "balance_demand"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "standing_calf_raise",
    focus: "lower",
    tags: [],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "burpee",
    focus: "full_body",
    tags: ["high_impact", "high_intensity", "wrist_loading", "prone", "deep_knee_flexion"],
    equipment: [],
    spaces: ["large_room", "outdoor", "gym"],
    minLevel: "advanced",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "jumping_jacks",
    focus: "cardio",
    tags: ["high_impact"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: false,
  },
  {
    key: "high_knees",
    focus: "cardio",
    tags: ["high_impact", "high_intensity"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "intermediate",
    mode: "time",
    lowImpact: false,
  },
  {
    key: "marching_in_place",
    focus: "cardio",
    tags: [],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "brisk_walk",
    focus: "cardio",
    tags: [],
    equipment: [],
    spaces: ["outdoor"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },

  // ---- Mobility ------------------------------------------------------------
  {
    key: "neck_rolls",
    focus: "mobility",
    tags: [],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "shoulder_circles",
    focus: "mobility",
    tags: [],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "seated_hamstring_stretch",
    focus: "mobility",
    tags: ["spinal_flexion"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "hip_flexor_stretch",
    focus: "mobility",
    tags: ["deep_knee_flexion"],
    equipment: [],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "cat_cow",
    focus: "mobility",
    tags: ["wrist_loading", "spinal_flexion"],
    equipment: ["yoga_mat"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "downward_dog",
    focus: "mobility",
    tags: ["wrist_loading", "inverted", "overhead_press"],
    equipment: ["yoga_mat"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "intermediate",
    mode: "time",
    lowImpact: true,
  },

  // ---- Resistance band -----------------------------------------------------
  {
    key: "band_row",
    focus: "upper",
    tags: [],
    equipment: ["resistance_band"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "band_chest_press",
    focus: "upper",
    tags: [],
    equipment: ["resistance_band"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "band_overhead_press",
    focus: "upper",
    tags: ["overhead_press"],
    equipment: ["resistance_band"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "band_lateral_raise",
    focus: "upper",
    tags: [],
    equipment: ["resistance_band"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "band_pull_apart",
    focus: "upper",
    tags: [],
    equipment: ["resistance_band"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "band_squat",
    focus: "lower",
    tags: ["deep_knee_flexion"],
    equipment: ["resistance_band"],
    spaces: ["small_room", "large_room", "outdoor", "gym"],
    minLevel: "intermediate",
    mode: "reps",
    lowImpact: true,
  },

  // ---- Dumbbells -----------------------------------------------------------
  {
    key: "dumbbell_row",
    focus: "upper",
    tags: [],
    equipment: ["dumbbells"],
    spaces: ["small_room", "large_room", "gym"],
    minLevel: "beginner",
    mode: "reps",
    lowImpact: true,
  },
  {
    key: "dumbbell_shoulder_press",
    focus: "upper",
    tags: ["overhead_press", "breath_hold"],
    equipment: ["dumbbells"],
    spaces: ["small_room", "large_room", "gym"],
    minLevel: "intermediate",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "dumbbell_goblet_squat",
    focus: "lower",
    tags: ["deep_knee_flexion", "spinal_loading", "breath_hold"],
    equipment: ["dumbbells"],
    spaces: ["small_room", "large_room", "gym"],
    minLevel: "intermediate",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "dumbbell_deadlift",
    focus: "lower",
    tags: ["spinal_loading", "breath_hold"],
    equipment: ["dumbbells"],
    spaces: ["small_room", "large_room", "gym"],
    minLevel: "advanced",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "dumbbell_bench_press",
    focus: "upper",
    tags: ["supine_flat", "breath_hold"],
    equipment: ["dumbbells", "bench"],
    spaces: ["large_room", "gym"],
    minLevel: "intermediate",
    mode: "reps",
    lowImpact: false,
  },

  // ---- Other equipment -----------------------------------------------------
  {
    key: "kettlebell_swing",
    focus: "full_body",
    tags: ["spinal_loading", "high_intensity", "breath_hold"],
    equipment: ["kettlebell"],
    spaces: ["large_room", "outdoor", "gym"],
    minLevel: "advanced",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "pull_up",
    focus: "upper",
    tags: ["overhead_press", "breath_hold"],
    equipment: ["pull_up_bar"],
    spaces: ["small_room", "large_room", "gym"],
    minLevel: "advanced",
    mode: "reps",
    lowImpact: false,
  },
  {
    key: "jump_rope",
    focus: "cardio",
    tags: ["high_impact", "high_intensity"],
    equipment: ["jump_rope"],
    spaces: ["large_room", "outdoor", "gym"],
    minLevel: "intermediate",
    mode: "time",
    lowImpact: false,
  },
  {
    key: "treadmill_walk",
    focus: "cardio",
    tags: [],
    equipment: ["treadmill"],
    spaces: ["small_room", "large_room", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
  {
    key: "stationary_bike",
    focus: "cardio",
    tags: [],
    equipment: ["stationary_bike"],
    spaces: ["small_room", "large_room", "gym"],
    minLevel: "beginner",
    mode: "time",
    lowImpact: true,
  },
];

export const EXERCISES_BY_KEY: ReadonlyMap<string, Exercise> = new Map(
  EXERCISES.map((exercise) => [exercise.key, exercise]),
);
