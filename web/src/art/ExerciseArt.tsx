import { useId } from "react";

import { OUTDOORS, PEOPLE, WHO_DOES } from "./people";
import type { Person } from "./people";
import { FALLBACK_POSE, POSES } from "./exercisePoses";
import type { Limb, Point, Pose, Prop } from "./exercisePoses";

/**
 * An exercise, drawn as a small scene: a person mid-movement in a sunlit room
 * (or a park, for the walk), with whatever kit the exercise needs.
 *
 * The room follows the theme — daylight in light, a lamp-lit evening in dark —
 * through the `--c-art-*` tokens. The person and the kit do not: skin, clothes
 * and a wooden chair are the colours they are.
 *
 * Each picture is framed on its own figure, so the person fills the card
 * rather than standing small in an empty room.
 *
 * Decorative: the exercise's name is always beside it, so the SVG is
 * `aria-hidden`. `slice` fills the card's frame rather than letterboxing.
 */
export function ExerciseArt({ exercise }: { exercise: string }) {
  const pose = POSES[exercise] ?? FALLBACK_POSE;
  const person = PEOPLE[WHO_DOES[exercise] ?? "priya"];
  const props = pose.props ?? [];
  const frame = frameFor(pose);
  const shadow = contactShadow(pose);

  // The room is drawn on its own 160 × 120 canvas and scaled onto the frame, so
  // a tightly framed exercise still has its window, floor and plant at the
  // edges. `floor` is where the real floor (y = 100) lands on that canvas.
  const scale = frame.width / 160;
  const floor = (FLOOR - frame.y) / scale;
  // The plant stands in the room's right-hand corner; it is left out whenever
  // the figure reaches into that corner, rather than growing out of a head.

  return (
    <svg
      viewBox={`${String(frame.x)} ${String(frame.y)} ${String(frame.width)} ${String(frame.height)}`}
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
      data-exercise={exercise}
      className="block size-full"
    >
      <g transform={`translate(${String(frame.x)} ${String(frame.y)}) scale(${String(scale)})`}>
        <Scene
          kind={OUTDOORS.has(exercise) ? "park" : "home"}
          height={120}
          floor={floor}
          plant={
            frame.right < frame.x + PLANT_LEFT * scale &&
            !props.some((prop) => prop.kind === "wall")
          }
        />
      </g>
      {shadow !== null && (
        <ellipse
          cx={shadow.cx}
          cy={FLOOR + 0.5}
          rx={shadow.rx}
          ry="2.4"
          fill="#000"
          opacity="0.14"
        />
      )}
      {props.filter((prop) => !inFront(prop)).map(renderProp)}
      <Figure pose={pose} person={person} />
      {props.filter(inFront).map(renderProp)}
    </svg>
  );
}

/* ---------------------------------------------------------------- framing */

const FLOOR = 100;

/** Where the corner plant begins on the room's own 160-wide canvas. */
const PLANT_LEFT = 133;

/** How far past a joint the drawn body reaches: half a limb's width, a head's radius. */
const REACH = { joint: 6, head: 10 } as const;

/** The furniture's outline on the canvas, which the frame must keep in view. */
const PROP_BOX: Partial<Record<Prop["kind"], [number, number, number, number]>> = {
  chair: [45, 42, 79, 100],
  wall: [126, 16, 136, 100],
  bench: [34, 76, 106, 100],
  bar: [44, 0, 118, 13],
  treadmill: [34, 48, 134, 103],
  bike: [58, 44, 122, 100],
};

/** Every coordinate pair in a path made of absolute commands. */
const pathPoints = (d: string): Point[] =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g)].map(
    ([, x, y]) => [Number(x), Number(y)] as const,
  );

/**
 * A 4:3 window onto the canvas that holds the whole figure and its kit with a
 * margin, and always a strip of floor under it. The spare height goes above,
 * as headroom, which is how a photographer would frame it.
 */
function frameFor(pose: Pose): {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The right edge of the figure and its kit, for keeping scenery clear of it. */
  right: number;
} {
  const boxes: [number, number, number, number][] = [
    [
      pose.head[0] - REACH.head,
      pose.head[1] - REACH.head,
      pose.head[0] + REACH.head,
      pose.head[1] + REACH.head,
    ],
  ];
  for (const [x, y] of [pose.neck, pose.hip, ...pose.arms.flat(), ...pose.legs.flat()]) {
    boxes.push([x - REACH.joint, y - REACH.joint, x + REACH.joint, y + REACH.joint]);
  }
  for (const prop of pose.props ?? []) {
    const box = PROP_BOX[prop.kind];
    if (box !== undefined) boxes.push(box);
    if (prop.kind === "band" || prop.kind === "rope") {
      for (const [x, y] of pathPoints(prop.d)) boxes.push([x - 3, y - 3, x + 3, y + 3]);
    }
    if (prop.kind === "dumbbell" || prop.kind === "kettlebell") {
      const [x, y] = prop.at;
      boxes.push([x - 11, y - 11, x + 11, y + 11]);
    }
  }

  const left = Math.min(...boxes.map((box) => box[0]));
  const top = Math.min(...boxes.map((box) => box[1]));
  const right = Math.max(...boxes.map((box) => box[2]));
  const bottom = Math.max(...boxes.map((box) => box[3]));

  const PAD = 9;
  const frameBottom = Math.max(bottom + PAD, FLOOR + 12);
  const frameTop = top - PAD;
  // Never tighter than 100 wide: a small pose zoomed any further reads as a
  // close-up of a torso rather than a person doing something.
  const width = Math.max(right - left + PAD * 2, ((frameBottom - frameTop) * 4) / 3, 100);
  const height = (width * 3) / 4;

  return {
    x: Math.round(((left + right) / 2 - width / 2) * 10) / 10,
    y: Math.round((frameBottom - height) * 10) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
    right,
  };
}

/**
 * A soft shadow on the floor under whatever touches it — feet, hands, a back
 * on the mat — so the figure stands on the floor instead of floating over it.
 * None for a pose that does not touch the floor at all.
 */
function contactShadow(pose: Pose): { cx: number; rx: number } | null {
  const touching = [pose.hip, ...pose.arms.map((limb) => limb[1]), ...pose.legs.flat()]
    .filter(([, y]) => y >= FLOOR - 8)
    .map(([x]) => x);
  if (touching.length === 0) return null;

  const left = Math.min(...touching);
  const right = Math.max(...touching);
  return { cx: (left + right) / 2, rx: (right - left) / 2 + 9 };
}

/* ------------------------------------------------------------------ scene */

/**
 * The room or the park, on a 160-wide canvas of any height, with its floor at
 * `floor`. Shared with the hero scenes, which are taller.
 */
export function Scene({
  kind,
  height,
  floor,
  plant = true,
}: {
  kind: "home" | "park";
  height: number;
  floor: number;
  /** Whether the corner plant is drawn; off when a figure would overlap it. */
  plant?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (kind === "park") {
    return (
      <g>
        <defs>
          <linearGradient id={`${id}sky`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--c-art-sky)" />
            <stop offset="1" stopColor="var(--c-art-sky-low)" />
          </linearGradient>
        </defs>
        <rect width="160" height={height} fill={`url(#${id}sky)`} />
        <ellipse cx="40" cy={floor + 4} rx="80" ry="22" fill="var(--c-art-hill)" />
        <ellipse cx="140" cy={floor + 6} rx="70" ry="18" fill="var(--c-art-hill)" opacity="0.8" />
        <rect y={floor} width="160" height={height - floor} fill="var(--c-art-grass)" />
        <path
          d={`M0 ${floor + 6} Q80 ${floor + 2} 160 ${floor + 7} L160 ${floor + 13} Q80 ${floor + 9} 0 ${floor + 14} Z`}
          fill="var(--c-art-floor)"
          opacity="0.9"
        />
        {/* A tree on the left, behind everything. */}
        <rect x="18" y={floor - 34} width="4" height="36" rx="2" fill="#7a5a3c" />
        <circle cx="20" cy={floor - 42} r="15" fill="#5f8f5a" />
        <circle cx="11" cy={floor - 34} r="10" fill="#4f7d4b" />
        <circle cx="30" cy={floor - 33} r="10" fill="#6b9c63" />
      </g>
    );
  }

  const windowHeight = Math.min(46, floor * 0.46);

  return (
    <g>
      <defs>
        <linearGradient id={`${id}wall`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--c-art-wall)" />
          <stop offset="1" stopColor="var(--c-art-wall-low)" />
        </linearGradient>
        <linearGradient id={`${id}sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--c-art-sky)" />
          <stop offset="1" stopColor="var(--c-art-sky-low)" />
        </linearGradient>
      </defs>

      <rect width="160" height={floor} fill={`url(#${id}wall)`} />

      {/* The window, and the patch of light it throws on the floor. */}
      <g>
        <rect
          x="14"
          y={floor * 0.12}
          width="34"
          height={windowHeight}
          rx="2"
          fill={`url(#${id}sky)`}
          stroke="var(--c-art-frame)"
          strokeWidth="2.5"
        />
        <path
          d={`M31 ${floor * 0.12} V${floor * 0.12 + windowHeight} M14 ${floor * 0.12 + windowHeight / 2} H48`}
          stroke="var(--c-art-frame)"
          strokeWidth="1.5"
        />
        <rect
          x="11"
          y={floor * 0.12 + windowHeight}
          width="40"
          height="2.5"
          rx="1"
          fill="var(--c-art-frame)"
        />
      </g>

      <rect y={floor} width="160" height={height - floor} fill="var(--c-art-floor)" />
      <path
        d={`M16 ${floor} L50 ${floor} L78 ${height} L0 ${height} L0 ${floor + 8} Z`}
        fill="var(--c-art-light)"
        opacity="0.28"
      />
      <path
        d={`M0 ${floor} H160 M0 ${floor + (height - floor) * 0.35} H160 M0 ${floor + (height - floor) * 0.72} H160`}
        stroke="var(--c-art-floor-line)"
        strokeWidth="1"
      />

      {/* A plant in the corner. */}
      {plant && (
        <g>
          <ellipse
            cx="143"
            cy={floor - 22}
            rx="4"
            ry="10"
            fill="#4c7a48"
            transform={`rotate(-28 143 ${floor - 22})`}
          />
          <ellipse
            cx="146"
            cy={floor - 24}
            rx="4"
            ry="11"
            fill="#5f8f5a"
            transform={`rotate(22 146 ${floor - 24})`}
          />
          <ellipse cx="144" cy={floor - 28} rx="3.5" ry="10" fill="#6b9c63" />
          <path d={`M136 ${floor - 14} H152 L150 ${floor} H138 Z`} fill="#c96f4a" />
          <rect x="135" y={floor - 15.5} width="18" height="3" rx="1.2" fill="#b35f3d" />
        </g>
      )}
    </g>
  );
}

/* ----------------------------------------------------------------- person */

const path = (...points: Point[]) =>
  points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");

const along = (from: Point, to: Point, t: number): Point => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
];

const ROUND = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * A person, from a pose's joints. Far limbs first and a shade darker, then the
 * body, then near limbs and the head, which is all a side view needs to read
 * as solid.
 */
export function Figure({
  pose,
  person,
  barefoot = false,
  facing = "side",
  head: headStyle = facing === "front" ? "front" : "profile",
}: {
  pose: Pose;
  person: Person;
  /** Bare feet instead of trainers — for yoga, and anything done on a mat. */
  barefoot?: boolean;
  /** `front` draws both sides of the body in full colour, neither further away. */
  facing?: "side" | "front";
  /** A body can face the viewer while the head turns to look along an arm. */
  head?: "profile" | "front";
}) {
  const { head, neck, hip, spine, arms, legs } = pose;
  const shoulder = (i: 0 | 1) => pose.shoulders?.[i] ?? neck;
  const hipJoint = (i: 0 | 1) => pose.hips?.[i] ?? hip;
  // Facing the viewer, neither side is further away, so neither is shaded.
  const far = facing === "front" ? person : shaded(person);
  const torso =
    spine === undefined
      ? path(neck, hip)
      : `M${neck[0]} ${neck[1]} Q${2 * spine[0] - (neck[0] + hip[0]) / 2} ${2 * spine[1] - (neck[1] + hip[1]) / 2} ${hip[0]} ${hip[1]}`;

  return (
    <g>
      <Arm from={shoulder(1)} limb={arms[1]} top={far.top} skin={far.skin} />
      <Leg
        from={hipJoint(1)}
        limb={legs[1]}
        bottom={far.bottom}
        shoe={person.shoe}
        bare={barefoot ? far.skin : null}
      />
      <path d={path(neck, head)} {...ROUND} stroke={person.skin} strokeWidth="5" />
      <path d={torso} {...ROUND} stroke={person.top} strokeWidth="14" />
      <circle cx={hip[0]} cy={hip[1]} r="6.2" fill={person.bottom} />
      <Leg
        from={hipJoint(0)}
        limb={legs[0]}
        bottom={person.bottom}
        shoe={person.shoe}
        bare={barefoot ? person.skin : null}
      />
      <Arm from={shoulder(0)} limb={arms[0]} top={person.top} skin={person.skin} />
      {headStyle === "front" ? (
        <FrontHead head={head} person={person} />
      ) : (
        <Head head={head} neck={neck} person={person} />
      )}
    </g>
  );
}

/** The far side of a side-on figure: the same person, a step darker. */
const shaded = (person: Person): Person => ({
  ...person,
  skin: person.skinShade,
  top: person.topShade,
  bottom: person.bottomShade,
});

/** A head facing the viewer: a cap of hair over the crown, two small eyes. */
function FrontHead({ head, person }: { head: Point; person: Person }) {
  const [x, y] = head;
  return (
    <g>
      {person.hairStyle === "bun" && <circle cx={x} cy={y - 8.6} r="3.4" fill={person.hair} />}
      <ellipse cx={x} cy={y} rx="7" ry="7.6" fill={person.skin} />
      <path
        d={`M${x - 7.3} ${y + 0.6} A7.4 7.8 0 0 1 ${x + 7.3} ${y + 0.6} Q${x + 3} ${y - 4.2} ${x} ${y - 3.6} Q${x - 3} ${y - 4.2} ${x - 7.3} ${y + 0.6} Z`}
        fill={person.hair}
      />
      <circle cx={x - 2.5} cy={y + 1.4} r="0.8" fill="#2a1f1a" />
      <circle cx={x + 2.5} cy={y + 1.4} r="0.8" fill="#2a1f1a" />
    </g>
  );
}

function Leg({
  from,
  limb,
  bottom,
  shoe,
  bare,
}: {
  from: Point;
  limb: Limb;
  bottom: string;
  shoe: string;
  /** The skin colour of a bare foot, or `null` for a trainer. */
  bare: string | null;
}) {
  const [knee, foot] = limb;
  // The foot points the way the shin does not: forward from the ankle, level.
  const forward = knee[0] <= foot[0] ? 1 : -1;
  return (
    <g>
      <path d={path(from, knee, foot)} {...ROUND} stroke={bottom} strokeWidth="9.5" />
      {bare === null ? (
        <>
          {/* A trainer pointing forward, with a pale sole: a round dot read as a ball. */}
          <ellipse cx={foot[0] + 1.8} cy={foot[1] - 0.6} rx="4.8" ry="2.8" fill="#353a42" />
          <path
            d={`M${foot[0] - 2.6} ${foot[1] + 1.6} H${foot[0] + 6.4}`}
            stroke={shoe}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      ) : (
        <ellipse cx={foot[0] + forward * 1.6} cy={foot[1] - 0.4} rx="4.2" ry="2.3" fill={bare} />
      )}
    </g>
  );
}

function Arm({ from, limb, top, skin }: { from: Point; limb: Limb; top: string; skin: string }) {
  const [elbow, hand] = limb;
  return (
    <g>
      <path d={path(from, elbow, hand)} {...ROUND} stroke={skin} strokeWidth="5.2" />
      {/* A short sleeve over the top of the arm. */}
      <path d={path(from, along(from, elbow, 0.6))} {...ROUND} stroke={top} strokeWidth="7.5" />
      <circle cx={hand[0]} cy={hand[1]} r="2.9" fill={skin} />
    </g>
  );
}

/**
 * The head, oriented by the neck: `up` runs from neck to crown, `face` a
 * quarter-turn clockwise of it, which is where a right-facing figure looks —
 * forward when standing, at the ceiling when on its back, at the floor in a
 * push-up.
 */
function Head({ head, neck, person }: { head: Point; neck: Point; person: Person }) {
  const dx = head[0] - neck[0];
  const dy = head[1] - neck[1];
  const length = Math.hypot(dx, dy) || 1;
  const up: Point = [dx / length, dy / length];
  const face: Point = [-up[1], up[0]];
  const at = (f: number, u: number): Point => [
    head[0] + face[0] * f + up[0] * u,
    head[1] + face[1] * f + up[1] * u,
  ];
  const angle = (Math.atan2(up[1], up[0]) * 180) / Math.PI + 90;

  const hair = at(-1.3, 1.3);
  const skin = at(0.9, -0.5);
  const eye = at(4.6, 0.8);
  const bun = at(-5, 5.2);
  const tail = at(-8.5, -1.5);

  return (
    <g>
      {person.hairStyle === "ponytail" && (
        <ellipse
          cx={tail[0]}
          cy={tail[1]}
          rx="2.6"
          ry="6.5"
          fill={person.hair}
          transform={`rotate(${angle + 20} ${tail[0]} ${tail[1]})`}
        />
      )}
      <circle cx={hair[0]} cy={hair[1]} r="8.4" fill={person.hair} />
      {person.hairStyle === "bun" && <circle cx={bun[0]} cy={bun[1]} r="3.8" fill={person.hair} />}
      <circle cx={skin[0]} cy={skin[1]} r="7.3" fill={person.skin} />
      <circle cx={eye[0]} cy={eye[1]} r="0.9" fill="#2a1f1a" />
    </g>
  );
}

/* ------------------------------------------------------------------- kit */

/** Kit the figure holds or stands on is drawn over it; furniture sits behind. */
const inFront = (prop: Prop) =>
  prop.kind === "band" ||
  prop.kind === "rope" ||
  prop.kind === "dumbbell" ||
  prop.kind === "kettlebell" ||
  prop.kind === "motion";

const WOOD = "#a47148";
const WOOD_DARK = "#8a5c37";
const IRON = "#3f3f46";
const STEEL = "#9ca3af";
const MACHINE = "#4b5563";

function renderProp(prop: Prop, index: number) {
  const key = `${prop.kind}-${String(index)}`;

  switch (prop.kind) {
    case "chair":
      return (
        <g key={key}>
          <rect x="47" y="42" width="5" height="58" rx="2" fill={WOOD_DARK} />
          <rect x="72" y="74" width="4" height="26" rx="2" fill={WOOD_DARK} />
          <rect x="45" y="70" width="34" height="5" rx="2" fill={WOOD} />
          <rect x="47" y="46" width="5" height="8" rx="1" fill={WOOD} />
        </g>
      );
    case "wall":
      return (
        <g key={key}>
          <rect x="127" y="16" width="33" height="84" fill="var(--c-art-wall-low)" />
          <rect x="126" y="16" width="3" height="84" fill="var(--c-art-floor-line)" />
        </g>
      );
    case "mat":
      return <rect key={key} x="26" y="97.5" width="108" height="5" rx="2.5" fill="#7fb3a8" />;
    case "bench":
      return (
        <g key={key}>
          <rect x="44" y="80" width="4" height="20" fill={STEEL} />
          <rect x="93" y="80" width="4" height="20" fill={STEEL} />
          <rect x="34" y="76" width="72" height="6" rx="2.5" fill={MACHINE} />
        </g>
      );
    case "bar":
      return (
        <g key={key}>
          <rect x="44" y="9" width="74" height="4" rx="2" fill={STEEL} />
          <rect x="44" y="0" width="4" height="13" fill={MACHINE} />
          <rect x="114" y="0" width="4" height="13" fill={MACHINE} />
        </g>
      );
    case "treadmill":
      return (
        <g key={key}>
          <path d="M118 97 L126 52" stroke={STEEL} strokeWidth="3.5" strokeLinecap="round" />
          <rect x="118" y="48" width="16" height="7" rx="2" fill={MACHINE} />
          <rect x="34" y="95" width="94" height="8" rx="3.5" fill={MACHINE} />
          <rect x="38" y="95" width="84" height="2.5" rx="1" fill="#6b7280" />
        </g>
      );
    case "bike":
      return (
        <g key={key}>
          <circle cx="100" cy="88" r="11" fill="#6b7280" />
          <circle cx="100" cy="88" r="4" fill={STEEL} />
          <path
            d="M72 58 L82 96 L108 48 M58 100 H122"
            stroke={MACHINE}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <rect x="62" y="54.5" width="18" height="5" rx="2.5" fill={IRON} />
          <rect x="103" y="44" width="14" height="4" rx="2" fill={IRON} />
        </g>
      );
    case "band":
      return (
        <path
          key={key}
          d={prop.d}
          fill="none"
          stroke="#f2b134"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      );
    case "rope":
      return (
        <path
          key={key}
          d={prop.d}
          fill="none"
          stroke={IRON}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    case "motion":
      return (
        <path
          key={key}
          d={prop.d}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.7"
        />
      );
    case "dumbbell": {
      const [x, y] = prop.at;
      return (
        <g key={key} transform={prop.vertical === true ? `rotate(90 ${x} ${y})` : undefined}>
          <line x1={x - 6} x2={x + 6} y1={y} y2={y} stroke={STEEL} strokeWidth="2.6" />
          <rect x={x - 10.5} y={y - 5} width="5" height="10" rx="1.6" fill={IRON} />
          <rect x={x + 5.5} y={y - 5} width="5" height="10" rx="1.6" fill={IRON} />
        </g>
      );
    }
    case "kettlebell": {
      const [x, y] = prop.at;
      return (
        <g key={key}>
          <path
            d={`M${x - 4} ${y - 1} a4 4 0 0 1 8 0`}
            fill="none"
            stroke={IRON}
            strokeWidth="2.6"
          />
          <circle cx={x} cy={y + 4.5} r="7" fill={IRON} />
          <circle cx={x - 2} cy={y + 2.5} r="1.5" fill="#ffffff" opacity="0.2" />
        </g>
      );
    }
  }
}
