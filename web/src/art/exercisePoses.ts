/**
 * One pose per exercise, as joint positions on a 160 × 120 canvas whose floor
 * is y = 100.
 *
 * Data rather than 38 hand-drawn files so every illustration is the same
 * figure in the same style — the thing that makes a set read as a set. A new
 * exercise needs a pose here; `exerciseArt.test.tsx` fails until it has one.
 *
 * Limbs are `[joint, end]`: elbow then hand, knee then foot. The first limb of
 * each pair is the near one, drawn solid; the second is the far one, drawn
 * behind it and faded, which is all the depth a side view needs.
 */
export type Point = readonly [number, number];
export type Limb = readonly [Point, Point];

export type Prop =
  | { kind: "chair" }
  | { kind: "wall" }
  | { kind: "mat" }
  | { kind: "bench" }
  | { kind: "bar" }
  | { kind: "treadmill" }
  | { kind: "bike" }
  | { kind: "band"; d: string }
  | { kind: "rope"; d: string }
  | { kind: "dumbbell"; at: Point; vertical?: boolean }
  | { kind: "kettlebell"; at: Point }
  | { kind: "motion"; d: string };

export type Pose = {
  head: Point;
  neck: Point;
  hip: Point;
  /** A bend in the back, for poses where a straight line would read wrong. */
  spine?: Point;
  arms: readonly [Limb, Limb];
  legs: readonly [Limb, Limb];
  /**
   * For a figure facing the viewer: where each arm and leg joins the body, in
   * limb order. A side view leaves these out and every limb starts at the neck
   * or the hip, which is what a side view looks like.
   */
  shoulders?: readonly [Point, Point];
  hips?: readonly [Point, Point];
  props?: readonly Prop[];
};

/** Standing upright, arms relaxed — the base several poses start from. */
const STAND: Pose = {
  head: [80, 28],
  neck: [80, 38],
  hip: [80, 64],
  arms: [
    [
      [84, 51],
      [86, 63],
    ],
    [
      [76, 51],
      [74, 63],
    ],
  ],
  legs: [
    [
      [82, 82],
      [83, 100],
    ],
    [
      [78, 82],
      [77, 100],
    ],
  ],
};

const SQUAT: Pose = {
  head: [88, 37],
  neck: [84, 46],
  hip: [68, 72],
  arms: [
    [
      [100, 50],
      [114, 52],
    ],
    [
      [98, 53],
      [112, 55],
    ],
  ],
  legs: [
    [
      [91, 77],
      [81, 100],
    ],
    [
      [88, 78],
      [77, 100],
    ],
  ],
};

const OVERHEAD: Pose["arms"] = [
  [
    [91, 26],
    [89, 12],
  ],
  [
    [69, 26],
    [71, 12],
  ],
];

const ARMS_OUT: Pose["arms"] = [
  [
    [96, 40],
    [111, 40],
  ],
  [
    [64, 40],
    [49, 40],
  ],
];

const WALK: Pose = {
  head: [84, 28],
  neck: [82, 38],
  hip: [80, 64],
  arms: [
    [
      [77, 51],
      [73, 61],
    ],
    [
      [87, 51],
      [94, 59],
    ],
  ],
  legs: [
    [
      [90, 82],
      [98, 100],
    ],
    [
      [74, 82],
      [64, 100],
    ],
  ],
};

const HINGE: Pose = {
  head: [104, 46],
  neck: [94, 50],
  hip: [66, 60],
  arms: [
    [
      [95, 66],
      [95, 82],
    ],
    [
      [91, 66],
      [91, 82],
    ],
  ],
  legs: [
    [
      [74, 80],
      [72, 100],
    ],
    [
      [70, 80],
      [66, 100],
    ],
  ],
};

export const POSES: Record<string, Pose> = {
  bodyweight_squat: SQUAT,

  band_squat: {
    ...SQUAT,
    arms: [
      [
        [94, 56],
        [90, 45],
      ],
      [
        [91, 57],
        [87, 46],
      ],
    ],
    props: [{ kind: "band", d: "M81 100 C 96 80 94 60 90 45" }],
  },

  dumbbell_goblet_squat: {
    ...SQUAT,
    arms: [
      [
        [94, 60],
        [96, 51],
      ],
      [
        [91, 61],
        [93, 52],
      ],
    ],
    props: [{ kind: "dumbbell", at: [98, 49], vertical: true }],
  },

  chair_sit_to_stand: {
    head: [92, 36],
    neck: [87, 45],
    hip: [72, 70],
    arms: [
      [
        [100, 52],
        [113, 54],
      ],
      [
        [98, 55],
        [111, 57],
      ],
    ],
    legs: [
      [
        [93, 76],
        [89, 100],
      ],
      [
        [90, 77],
        [85, 100],
      ],
    ],
    props: [{ kind: "chair" }],
  },

  wall_pushup: {
    head: [117, 37],
    neck: [110, 44],
    hip: [90, 66],
    arms: [
      [
        [119, 54],
        [127, 46],
      ],
      [
        [117, 57],
        [127, 51],
      ],
    ],
    legs: [
      [
        [81, 83],
        [72, 100],
      ],
      [
        [79, 83],
        [69, 100],
      ],
    ],
    props: [{ kind: "wall" }],
  },

  pushup: {
    head: [115, 72],
    neck: [104, 77],
    hip: [72, 83],
    arms: [
      [
        [107, 88],
        [106, 100],
      ],
      [
        [102, 88],
        [101, 100],
      ],
    ],
    legs: [
      [
        [55, 89],
        [38, 96],
      ],
      [
        [55, 90],
        [36, 97],
      ],
    ],
  },

  plank: {
    head: [111, 77],
    neck: [100, 82],
    hip: [70, 85],
    arms: [
      [
        [100, 99],
        [116, 99],
      ],
      [
        [96, 99],
        [112, 99],
      ],
    ],
    legs: [
      [
        [53, 91],
        [36, 97],
      ],
      [
        [53, 92],
        [34, 98],
      ],
    ],
  },

  forward_lunge: {
    head: [85, 30],
    neck: [84, 40],
    hip: [82, 66],
    arms: [
      [
        [85, 53],
        [87, 65],
      ],
      [
        [81, 53],
        [80, 65],
      ],
    ],
    legs: [
      [
        [102, 78],
        [104, 100],
      ],
      [
        [70, 92],
        [54, 100],
      ],
    ],
  },

  glute_bridge: {
    head: [40, 93],
    neck: [50, 94],
    hip: [84, 76],
    arms: [
      [
        [63, 99],
        [77, 99],
      ],
      [
        [61, 99],
        [75, 99],
      ],
    ],
    legs: [
      [
        [104, 72],
        [109, 100],
      ],
      [
        [101, 73],
        [105, 100],
      ],
    ],
  },

  dead_bug: {
    head: [49, 91],
    neck: [59, 94],
    hip: [92, 94],
    arms: [
      [
        [60, 78],
        [61, 62],
      ],
      [
        [48, 86],
        [35, 80],
      ],
    ],
    legs: [
      [
        [97, 72],
        [113, 70],
      ],
      [
        [108, 90],
        [125, 86],
      ],
    ],
  },

  crunch: {
    head: [60, 74],
    neck: [66, 82],
    hip: [90, 96],
    arms: [
      [
        [80, 81],
        [94, 77],
      ],
      [
        [78, 83],
        [92, 79],
      ],
    ],
    legs: [
      [
        [104, 76],
        [117, 100],
      ],
      [
        [102, 77],
        [114, 100],
      ],
    ],
  },

  bird_dog: {
    head: [113, 68],
    neck: [102, 72],
    hip: [70, 72],
    arms: [
      [
        [118, 70],
        [134, 68],
      ],
      [
        [102, 86],
        [102, 100],
      ],
    ],
    legs: [
      [
        [52, 70],
        [34, 68],
      ],
      [
        [68, 100],
        [50, 100],
      ],
    ],
  },

  standing_calf_raise: {
    ...STAND,
    head: [80, 22],
    neck: [80, 32],
    hip: [80, 58],
    arms: [
      [
        [84, 45],
        [86, 57],
      ],
      [
        [76, 45],
        [74, 57],
      ],
    ],
    legs: [
      [
        [81, 77],
        [82, 96],
      ],
      [
        [79, 77],
        [78, 96],
      ],
    ],
    props: [{ kind: "motion", d: "M98 70 v-10 M94 64 l4 -4 l4 4" }],
  },

  burpee: {
    head: [80, 20],
    neck: [80, 30],
    hip: [80, 56],
    arms: [
      [
        [88, 18],
        [92, 6],
      ],
      [
        [72, 18],
        [68, 6],
      ],
    ],
    legs: [
      [
        [86, 72],
        [81, 87],
      ],
      [
        [76, 72],
        [72, 87],
      ],
    ],
    props: [{ kind: "motion", d: "M66 96 h10 M84 96 h10" }],
  },

  jumping_jacks: {
    head: [80, 24],
    neck: [80, 34],
    hip: [80, 60],
    arms: [
      [
        [94, 26],
        [106, 15],
      ],
      [
        [66, 26],
        [54, 15],
      ],
    ],
    legs: [
      [
        [90, 78],
        [100, 96],
      ],
      [
        [70, 78],
        [60, 96],
      ],
    ],
  },

  high_knees: {
    head: [81, 26],
    neck: [80, 36],
    hip: [80, 62],
    arms: [
      [
        [89, 48],
        [92, 38],
      ],
      [
        [72, 50],
        [68, 60],
      ],
    ],
    legs: [
      [
        [96, 62],
        [96, 80],
      ],
      [
        [80, 81],
        [79, 100],
      ],
    ],
    props: [{ kind: "motion", d: "M106 58 h8 M106 66 h6" }],
  },

  marching_in_place: {
    ...STAND,
    arms: [
      [
        [86, 50],
        [90, 42],
      ],
      [
        [75, 51],
        [72, 61],
      ],
    ],
    legs: [
      [
        [93, 72],
        [91, 90],
      ],
      [
        [80, 82],
        [79, 100],
      ],
    ],
  },

  brisk_walk: WALK,

  treadmill_walk: {
    ...WALK,
    props: [{ kind: "treadmill" }],
  },

  neck_rolls: {
    ...STAND,
    head: [86, 30],
    props: [{ kind: "motion", d: "M72 18 A 14 14 0 0 1 98 20" }],
  },

  shoulder_circles: {
    ...STAND,
    arms: ARMS_OUT,
    props: [{ kind: "motion", d: "M111 32 a8 8 0 1 1 -0.1 0 M49 32 a8 8 0 1 0 0.1 0" }],
  },

  seated_hamstring_stretch: {
    head: [88, 58],
    neck: [79, 67],
    hip: [60, 96],
    arms: [
      [
        [97, 82],
        [113, 91],
      ],
      [
        [95, 84],
        [111, 93],
      ],
    ],
    legs: [
      [
        [88, 97],
        [117, 97],
      ],
      [
        [88, 98],
        [115, 98],
      ],
    ],
  },

  hip_flexor_stretch: {
    head: [81, 38],
    neck: [80, 48],
    hip: [78, 74],
    arms: [
      [
        [89, 58],
        [83, 70],
      ],
      [
        [71, 58],
        [75, 70],
      ],
    ],
    legs: [
      [
        [98, 78],
        [100, 100],
      ],
      [
        [64, 100],
        [44, 100],
      ],
    ],
  },

  cat_cow: {
    head: [114, 79],
    neck: [104, 74],
    spine: [85, 60],
    hip: [66, 74],
    arms: [
      [
        [104, 87],
        [104, 99],
      ],
      [
        [100, 87],
        [100, 99],
      ],
    ],
    legs: [
      [
        [66, 99],
        [46, 99],
      ],
      [
        [62, 99],
        [42, 99],
      ],
    ],
    props: [{ kind: "mat" }],
  },

  downward_dog: {
    head: [110, 83],
    neck: [104, 76],
    hip: [78, 52],
    arms: [
      [
        [111, 88],
        [118, 99],
      ],
      [
        [108, 88],
        [114, 99],
      ],
    ],
    legs: [
      [
        [66, 76],
        [53, 99],
      ],
      [
        [63, 76],
        [49, 99],
      ],
    ],
    props: [{ kind: "mat" }],
  },

  band_row: {
    head: [63, 58],
    neck: [62, 68],
    hip: [58, 96],
    arms: [
      [
        [52, 79],
        [67, 82],
      ],
      [
        [50, 81],
        [65, 84],
      ],
    ],
    legs: [
      [
        [86, 97],
        [113, 97],
      ],
      [
        [86, 98],
        [111, 98],
      ],
    ],
    props: [{ kind: "band", d: "M67 82 L113 95" }],
  },

  band_chest_press: {
    ...STAND,
    arms: [
      [
        [96, 47],
        [112, 47],
      ],
      [
        [94, 49],
        [110, 49],
      ],
    ],
    props: [{ kind: "band", d: "M112 47 C 90 34 62 34 66 44 C 70 54 96 52 110 49" }],
  },

  band_overhead_press: {
    ...STAND,
    arms: OVERHEAD,
    props: [{ kind: "band", d: "M89 12 L81 100 M71 12 L79 100" }],
  },

  band_lateral_raise: {
    ...STAND,
    arms: ARMS_OUT,
    props: [{ kind: "band", d: "M111 40 L83 100 M49 40 L77 100" }],
  },

  band_pull_apart: {
    ...STAND,
    arms: [
      [
        [95, 44],
        [109, 44],
      ],
      [
        [65, 44],
        [51, 44],
      ],
    ],
    props: [{ kind: "band", d: "M109 44 L51 44" }],
  },

  dumbbell_row: {
    ...HINGE,
    arms: [
      [
        [88, 64],
        [96, 74],
      ],
      [
        [99, 66],
        [101, 81],
      ],
    ],
    props: [
      { kind: "dumbbell", at: [96, 75] },
      { kind: "dumbbell", at: [101, 83] },
    ],
  },

  dumbbell_shoulder_press: {
    ...STAND,
    arms: OVERHEAD,
    props: [
      { kind: "dumbbell", at: [89, 10] },
      { kind: "dumbbell", at: [71, 10] },
    ],
  },

  dumbbell_deadlift: {
    ...HINGE,
    props: [
      { kind: "dumbbell", at: [95, 84] },
      { kind: "dumbbell", at: [91, 84] },
    ],
  },

  dumbbell_bench_press: {
    head: [44, 69],
    neck: [54, 72],
    hip: [90, 72],
    arms: [
      [
        [57, 56],
        [59, 44],
      ],
      [
        [53, 57],
        [55, 45],
      ],
    ],
    legs: [
      [
        [104, 70],
        [110, 100],
      ],
      [
        [101, 71],
        [106, 100],
      ],
    ],
    props: [{ kind: "bench" }, { kind: "dumbbell", at: [59, 42] }],
  },

  kettlebell_swing: {
    head: [84, 28],
    neck: [82, 38],
    hip: [77, 64],
    arms: [
      [
        [96, 45],
        [110, 47],
      ],
      [
        [94, 47],
        [108, 49],
      ],
    ],
    legs: [
      [
        [84, 82],
        [82, 100],
      ],
      [
        [80, 82],
        [76, 100],
      ],
    ],
    props: [{ kind: "kettlebell", at: [114, 53] }],
  },

  pull_up: {
    head: [81, 26],
    neck: [81, 36],
    hip: [81, 62],
    arms: [
      [
        [94, 24],
        [90, 12],
      ],
      [
        [68, 24],
        [72, 12],
      ],
    ],
    legs: [
      [
        [85, 78],
        [78, 90],
      ],
      [
        [79, 78],
        [72, 90],
      ],
    ],
    props: [{ kind: "bar" }],
  },

  jump_rope: {
    head: [80, 22],
    neck: [80, 32],
    hip: [80, 58],
    arms: [
      [
        [90, 46],
        [96, 54],
      ],
      [
        [70, 46],
        [64, 54],
      ],
    ],
    legs: [
      [
        [82, 76],
        [82, 92],
      ],
      [
        [78, 76],
        [78, 92],
      ],
    ],
    props: [{ kind: "rope", d: "M96 54 C 118 70 110 104 80 104 C 50 104 42 70 64 54" }],
  },

  stationary_bike: {
    head: [91, 25],
    neck: [86, 34],
    hip: [72, 57],
    arms: [
      [
        [100, 42],
        [110, 47],
      ],
      [
        [98, 44],
        [108, 49],
      ],
    ],
    legs: [
      [
        [92, 70],
        [89, 88],
      ],
      [
        [85, 74],
        [81, 94],
      ],
    ],
    props: [{ kind: "bike" }],
  },
};

/** What an exercise the library has not been drawn for yet gets. */
export const FALLBACK_POSE: Pose = STAND;
