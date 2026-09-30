/**
 * Who does each exercise in the pictures.
 *
 * A family app should show a family: six people across three generations, each
 * with their own skin tone, hair and clothes. Gentle, low-impact moves go to
 * the older adults and the hard ones to the young, which is also who the plan
 * generator gives them to.
 *
 * Clothes and skin are literal colours, not theme tokens — a person does not
 * change colour when the page goes dark. The scene around them does.
 */
export type Person = {
  skin: string;
  /** The far side of the body, a step darker, so limbs read in depth. */
  skinShade: string;
  hair: string;
  hairStyle: "bun" | "short" | "ponytail";
  top: string;
  topShade: string;
  bottom: string;
  bottomShade: string;
  shoe: string;
};

export const PEOPLE = {
  priya: {
    skin: "#c98b62",
    skinShade: "#a9714c",
    hair: "#2b1d16",
    hairStyle: "bun",
    top: "#e07a5f",
    topShade: "#bf5f46",
    bottom: "#34495e",
    bottomShade: "#263646",
    shoe: "#f4f1ea",
  },
  arjun: {
    skin: "#a8704a",
    skinShade: "#8a5a3a",
    hair: "#231a14",
    hairStyle: "short",
    top: "#3d8f84",
    topShade: "#2e7067",
    bottom: "#2f3640",
    bottomShade: "#22282f",
    shoe: "#e9e6df",
  },
  kamala: {
    skin: "#d29a70",
    skinShade: "#b37e57",
    hair: "#bdb7b0",
    hairStyle: "bun",
    top: "#7b6bb0",
    topShade: "#5f5192",
    bottom: "#4a4e69",
    bottomShade: "#383b52",
    shoe: "#f4f1ea",
  },
  ramesh: {
    skin: "#b27a52",
    skinShade: "#93613f",
    hair: "#d3cec8",
    hairStyle: "short",
    top: "#d9a441",
    topShade: "#b8862c",
    bottom: "#3b4453",
    bottomShade: "#2c3440",
    shoe: "#e9e6df",
  },
  meera: {
    skin: "#bf8058",
    skinShade: "#a06743",
    hair: "#1f1510",
    hairStyle: "ponytail",
    top: "#e86a92",
    topShade: "#c84f76",
    bottom: "#2d3a4a",
    bottomShade: "#212b37",
    shoe: "#ffffff",
  },
  vikram: {
    skin: "#9a6340",
    skinShade: "#7d4f32",
    hair: "#16100c",
    hairStyle: "short",
    top: "#4a7fb5",
    topShade: "#386596",
    bottom: "#262b33",
    bottomShade: "#1b1f25",
    shoe: "#f4f1ea",
  },
} as const satisfies Record<string, Person>;

type Who = keyof typeof PEOPLE;

export const WHO_DOES: Record<string, Who> = {
  bodyweight_squat: "priya",
  chair_sit_to_stand: "kamala",
  wall_pushup: "ramesh",
  pushup: "vikram",
  forward_lunge: "priya",
  glute_bridge: "priya",
  plank: "arjun",
  dead_bug: "priya",
  crunch: "arjun",
  bird_dog: "kamala",
  standing_calf_raise: "kamala",
  burpee: "vikram",
  jumping_jacks: "meera",
  high_knees: "vikram",
  marching_in_place: "ramesh",
  brisk_walk: "kamala",
  neck_rolls: "priya",
  shoulder_circles: "ramesh",
  seated_hamstring_stretch: "priya",
  hip_flexor_stretch: "arjun",
  cat_cow: "priya",
  downward_dog: "priya",
  band_row: "arjun",
  band_chest_press: "priya",
  band_overhead_press: "arjun",
  band_lateral_raise: "priya",
  band_pull_apart: "ramesh",
  band_squat: "priya",
  dumbbell_row: "arjun",
  dumbbell_shoulder_press: "priya",
  dumbbell_goblet_squat: "arjun",
  dumbbell_deadlift: "vikram",
  dumbbell_bench_press: "vikram",
  kettlebell_swing: "priya",
  pull_up: "vikram",
  jump_rope: "meera",
  treadmill_walk: "kamala",
  stationary_bike: "ramesh",
};

/** Walked outdoors rather than in the living room. */
export const OUTDOORS: ReadonlySet<string> = new Set(["brisk_walk"]);
