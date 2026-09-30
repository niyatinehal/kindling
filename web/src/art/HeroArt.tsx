import { useId } from "react";

import { DishArt } from "./DishArt";
import { Figure } from "./ExerciseArt";
import type { Point, Pose } from "./exercisePoses";
import { PEOPLE } from "./people";

/**
 * The two large scenes: a family moving together, for the landing page, and a
 * table of home cooking, for the meal planner. Built from the same pieces as
 * the exercise and dish pictures, so they are unmistakably the same set.
 *
 * Decorative: both sit under words that say what the screen is.
 */
export function HeroArt({ name }: { name: "family" | "food" }) {
  return name === "family" ? <Family /> : <Spread />;
}

/* ------------------------------------------------------------ family yoga */

/**
 * The three poses, on the exercise canvas (floor at y = 100). Tree pose and
 * warrior II face the viewer, so their limbs join the body at shoulders and
 * hips; the crescent lunge is side-on.
 */
const TREE: Pose = {
  head: [80, 21],
  neck: [80, 32],
  hip: [80, 60],
  shoulders: [
    [85, 36],
    [75, 36],
  ],
  hips: [
    [83, 62],
    [77, 62],
  ],
  // Palms together overhead.
  arms: [
    [
      [94, 17],
      [82, 4],
    ],
    [
      [66, 17],
      [78, 4],
    ],
  ],
  // The raised knee opens out to the side, its foot pressed to the other thigh.
  legs: [
    [
      [97, 74],
      [84, 73],
    ],
    [
      [78, 81],
      [78, 100],
    ],
  ],
};

const WARRIOR_II: Pose = {
  head: [81, 27],
  neck: [80, 37],
  hip: [80, 63],
  shoulders: [
    [85, 39],
    [75, 39],
  ],
  hips: [
    [84, 65],
    [76, 65],
  ],
  // Arms level with the shoulders, reaching both ways; gaze over the front hand.
  arms: [
    [
      [98, 39],
      [113, 39],
    ],
    [
      [62, 39],
      [47, 39],
    ],
  ],
  // Front knee bent over the ankle, back leg long and straight.
  legs: [
    [
      [101, 79],
      [103, 100],
    ],
    [
      [64, 82],
      [50, 100],
    ],
  ],
};

const CRESCENT_LUNGE: Pose = {
  // Head up and a little forward of the raised arms, looking up.
  head: [80, 39],
  neck: [77, 48],
  // A slight backbend: the chest lifts forward of a straight line.
  spine: [81, 62],
  hip: [80, 76],
  arms: [
    [
      [72, 34],
      [66, 21],
    ],
    [
      [75, 34],
      [70, 20],
    ],
  ],
  legs: [
    [
      [98, 78],
      [100, 100],
    ],
    [
      [63, 91],
      [46, 100],
    ],
  ],
};

/** Clothes chosen for the scene: no two tops and no two leggings alike. */
const GRANDMOTHER = {
  ...PEOPLE.kamala,
  top: "#c98b83",
  topShade: "#a9706a",
  bottom: "#3f5f6f",
  bottomShade: "#314b58",
};
const FATHER = {
  ...PEOPLE.arjun,
  top: "#3d8f84",
  topShade: "#2e7067",
  bottom: "#2f3640",
  bottomShade: "#22282f",
};
const DAUGHTER = {
  ...PEOPLE.meera,
  top: "#e86a92",
  topShade: "#c84f76",
  bottom: "#6c5a9e",
  bottomShade: "#554680",
};

/**
 * A grandmother, a father and his daughter doing yoga in the living room at
 * night. A floor lamp is the main light; the moon is in the window. The room
 * is kept dim so the family is the brightest thing in it.
 *
 * Night in both themes, deliberately: it is a scene, not a surface, and its
 * colours are its own rather than the page's.
 */
function Family() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  const cast = [
    {
      pose: TREE,
      person: GRANDMOTHER,
      x: 32,
      floor: 176,
      scale: 1.05,
      facing: "front",
      head: "front",
      mat: "#7fb3a8",
      matEdge: "#5f9185",
      matWidth: 42,
    },
    {
      pose: WARRIOR_II,
      person: FATHER,
      x: 84,
      floor: 170,
      scale: 1.0,
      facing: "front",
      head: "profile",
      mat: "#d98c6a",
      matEdge: "#b56d4e",
      matWidth: 70,
    },
    {
      pose: CRESCENT_LUNGE,
      person: DAUGHTER,
      x: 134,
      floor: 180,
      scale: 0.8,
      facing: "side",
      head: "profile",
      mat: "#8c7bc4",
      matEdge: "#6e5ea6",
      matWidth: 50,
    },
  ] as const;

  // Figure canvas → scene: scaled about the origin, feet landed on `floor`.
  const place = (x: number, floor: number, scale: number) =>
    `translate(${String(x - 80 * scale)} ${String(floor - 100 * scale)}) scale(${String(scale)})`;
  const toScene = ([px, py]: Point, x: number, floor: number, scale: number): Point => [
    x - 80 * scale + px * scale,
    floor - 100 * scale + py * scale,
  ];

  return (
    <svg
      viewBox="0 0 160 200"
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
      data-hero="family"
      className="block size-full"
    >
      <defs>
        <linearGradient id={`${id}wall`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#272b35" />
          <stop offset="1" stopColor="#1d2028" />
        </linearGradient>
        <linearGradient id={`${id}floor`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3a2f28" />
          <stop offset="1" stopColor="#2b231d" />
        </linearGradient>
        <linearGradient id={`${id}sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1b2743" />
          <stop offset="1" stopColor="#314466" />
        </linearGradient>
        <radialGradient id={`${id}lamp`} cx="148" cy="58" r="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffcf87" stopOpacity="0.5" />
          <stop offset="0.45" stopColor="#ffcf87" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ffcf87" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}moon`} cx="40" cy="44" r="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f3ebcf" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f3ebcf" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id={`${id}vignette`}
          cx="86"
          cy="140"
          r="130"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
      </defs>

      {/* The room. */}
      <rect width="160" height="150" fill={`url(#${id}wall)`} />
      <rect y="150" width="160" height="50" fill={`url(#${id}floor)`} />
      <path d="M0 150 H160 M0 163 H160 M0 181 H160" stroke="#231c17" strokeWidth="0.8" />
      <rect y="148.5" width="160" height="2" fill="#312922" />

      {/* The window: a night sky, the moon, a few stars, and a cool patch of light. */}
      <rect x="14" y="28" width="36" height="62" rx="2" fill={`url(#${id}sky)`} />
      <circle cx="40" cy="44" r="16" fill={`url(#${id}moon)`} />
      <circle cx="40" cy="44" r="5" fill="#f3ebcf" />
      <circle cx="22" cy="38" r="0.7" fill="#dfe6f5" />
      <circle cx="28" cy="58" r="0.5" fill="#dfe6f5" />
      <circle cx="44" cy="68" r="0.6" fill="#dfe6f5" />
      <path d="M32 28 V90 M14 59 H50" stroke="#454b57" strokeWidth="1.6" />
      <rect
        x="14"
        y="28"
        width="36"
        height="62"
        rx="2"
        fill="none"
        stroke="#4a505c"
        strokeWidth="2.5"
      />
      <rect x="11" y="90" width="42" height="3" rx="1" fill="#4a505c" />
      <path d="M16 150 L50 150 L78 200 L4 200 Z" fill="#9fb3d9" opacity="0.06" />

      {/* A framed picture on the right-hand wall. */}
      <rect
        x="100"
        y="42"
        width="30"
        height="22"
        rx="1"
        fill="#2c3646"
        stroke="#7a5f45"
        strokeWidth="2.4"
      />
      <path d="M101.5 60 L110 52 L116 57 L121 50 L128.5 58 V62.8 H101.5 Z" fill="#4b6180" />
      <circle cx="123" cy="48" r="2" fill="#e9c98a" />

      {/* The plant, in the far-left corner. */}
      <ellipse cx="9" cy="126" rx="4.5" ry="14" fill="#3f6a43" transform="rotate(-18 9 126)" />
      <ellipse cx="14" cy="124" rx="4.5" ry="15" fill="#4f7d4b" transform="rotate(16 14 124)" />
      <ellipse cx="11" cy="118" rx="4" ry="15" fill="#5f8f5a" />
      <path d="M3 137 H20 L18 152 H5 Z" fill="#a85d3f" />
      <rect x="2" y="135.5" width="19" height="3" rx="1.2" fill="#8f4e34" />

      {/* The floor lamp, and the warm light it throws over everything. */}
      <ellipse cx="148" cy="171" rx="6" ry="1.8" fill="#15171b" />
      <path d="M148 171 V62" stroke="#3a3b40" strokeWidth="1.6" />
      <path d="M139 48 H157 L160 63 H136 Z" fill="#f2d7a1" />
      <ellipse cx="148" cy="63" rx="12" ry="1.8" fill="#fff2cc" />
      <rect width="160" height="200" fill={`url(#${id}lamp)`} />
      <ellipse cx="108" cy="178" rx="72" ry="17" fill="#ffcf87" opacity="0.1" />

      {/* Three mats, each with its edge showing, and the family on them. */}
      {cast.map(({ x, floor, matWidth, mat, matEdge }) => (
        <g key={`${String(x)}-mat`}>
          <rect
            x={x - matWidth / 2}
            y={floor - 1}
            width={matWidth}
            height="3.2"
            rx="1.6"
            fill={matEdge}
          />
          <rect
            x={x - matWidth / 2}
            y={floor - 3}
            width={matWidth}
            height="3.4"
            rx="1.7"
            fill={mat}
          />
        </g>
      ))}
      {cast.map(({ pose, x, floor, scale }) =>
        pose.legs
          .map((limb) => limb[1])
          .filter(([, y]) => y >= 96)
          .map((foot) => {
            const [fx, fy] = toScene(foot, x, floor, scale);
            return (
              <ellipse
                key={`${String(x)}-${String(foot[0])}`}
                cx={fx + 1}
                cy={fy + 0.6}
                rx={5 * scale}
                ry="1.3"
                fill="#000"
                opacity="0.28"
              />
            );
          }),
      )}
      {cast.map(({ pose, person, x, floor, scale, facing, head }) => (
        <g key={String(x)} transform={place(x, floor, scale)}>
          <Figure pose={pose} person={person} barefoot facing={facing} head={head} />
        </g>
      ))}

      {/* A cushion and a rolled mat in the front corner. */}
      <ellipse cx="16" cy="191" rx="13" ry="5.5" fill="#c9a15a" />
      <ellipse cx="16" cy="189.6" rx="10" ry="3.2" fill="#d8b474" />
      <rect x="31" y="185" width="28" height="9.5" rx="4.75" fill="#5f8fa8" />
      <circle cx="35.75" cy="189.75" r="4.75" fill="#4d7a92" />
      <circle cx="35.75" cy="189.75" r="2.2" fill="none" stroke="#6ea2bc" strokeWidth="0.8" />

      <rect width="160" height="200" fill={`url(#${id}vignette)`} />
    </svg>
  );
}

/** A table laid with a thali and three dishes around it, from above. */
function Spread() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Each dish is a full DishArt canvas (160 × 120), placed and sized here.
  const dishes = [
    { recipe: "palak_paneer", x: -12, y: 28, width: 74 },
    { recipe: "roti_sabzi", x: -6, y: -3, width: 56 },
    { recipe: "chana_masala", x: 104, y: 34, width: 70 },
    { recipe: "dal_chawal", x: 32, y: -2, width: 98 },
  ];

  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      data-hero="food"
      className="block size-full"
    >
      <defs>
        <pattern id={`${id}weave`} width="160" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 3 H160" stroke="var(--c-art-table-line)" strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width="160" height="90" fill="var(--c-art-table)" />
      <rect width="160" height="90" fill={`url(#${id}weave)`} />
      <g transform="rotate(-10 20 80)">
        <rect x="-10" y="64" width="46" height="34" rx="2" fill="#cfded6" />
        <rect x="-10" y="71" width="46" height="2.5" fill="#b3c9bd" />
      </g>
      {dishes.map(({ recipe, x, y, width }) => (
        <svg key={recipe} x={x} y={y} width={width} height={(width * 3) / 4} viewBox="0 0 160 120">
          <DishArt recipe={recipe} bare />
        </svg>
      ))}
    </svg>
  );
}
