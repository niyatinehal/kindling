import { useId } from "react";

import { DISHES, FALLBACK_DISH } from "./dishes";
import type { Bit, Dish } from "./dishes";

/**
 * A recipe, drawn from above as if set on the table: the food in its own
 * colours on a plate, in a bowl or in a thali, toppings scattered across it.
 *
 * The scatter is seeded from the recipe key, so a dish looks the same on every
 * render and on server and client alike — a random layout would differ between
 * the two and fail hydration. Each part seeds its own sequence inside its own
 * render: React may render a component twice, and one sequence shared across
 * components would carry on where the first pass stopped.
 *
 * The crockery is white and the katori steel in both themes, as they would
 * be; the table under them follows the theme. `bare` leaves the table out, for
 * a scene that lays several dishes on one table of its own.
 *
 * Decorative, like `ExerciseArt`: the dish's name is always beside it.
 */
export function DishArt({ recipe, bare = false }: { recipe: string; bare?: boolean }) {
  const dish = DISHES[recipe] ?? FALLBACK_DISH;
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Where the main food sits, and how big it is, depends on the layout.
  const main =
    dish.layout === "thali"
      ? { cx: 101, cy: 52, r: 16 }
      : dish.layout === "bowl"
        ? { cx: 80, cy: 60, r: 31 }
        : { cx: 80, cy: 60, r: 29 };

  return (
    <svg
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      data-recipe={recipe}
      className="block size-full"
    >
      <defs>
        <radialGradient id={`${id}plate`} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.8" stopColor="#f3f1ec" />
          <stop offset="1" stopColor="#e3e0d9" />
        </radialGradient>
        <radialGradient id={`${id}steel`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f4f6f8" />
          <stop offset="0.6" stopColor="#c9ced3" />
          <stop offset="1" stopColor="#9aa1a8" />
        </radialGradient>
        <radialGradient id={`${id}glow`} cx="0.4" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {!bare && <Table />}

      <ellipse
        cx="84"
        cy="66"
        rx="46"
        ry="44"
        fill="#000"
        opacity="0.16"
        filter={`url(#${id}soft)`}
      />

      {/* White crockery: the plate, or the bowl with its inner wall. */}
      <circle cx="80" cy="60" r="45" fill={`url(#${id}plate)`} stroke="#dedad2" strokeWidth="1" />
      <circle
        cx="80"
        cy="60"
        r={dish.layout === "bowl" ? 36 : 38}
        fill="none"
        stroke="#e7e3db"
        strokeWidth="1.5"
      />
      {dish.layout === "bowl" && (
        <circle cx="80" cy="60" r="34" fill="none" stroke="#000" strokeWidth="3" opacity="0.05" />
      )}

      {dish.side === "rice" && <Rice seed={`${recipe}/rice`} />}
      {dish.side === "roti" && <Roti />}

      {dish.layout === "thali" && (
        <g>
          <circle
            cx={main.cx + 1.5}
            cy={main.cy + 2}
            r={main.r + 6}
            fill="#000"
            opacity="0.12"
            filter={`url(#${id}soft)`}
          />
          <circle cx={main.cx} cy={main.cy} r={main.r + 5} fill={`url(#${id}steel)`} />
        </g>
      )}

      <Food dish={dish} main={main} seed={`${recipe}/food`} glow={`url(#${id}glow)`} />

      {(dish.bits ?? []).map((bit, index) => (
        <Bits
          key={`${bit.kind}-${String(index)}`}
          bit={bit}
          main={main}
          seed={`${recipe}/bits/${String(index)}`}
        />
      ))}

      {dish.extra === "lemon" && (
        <g transform="translate(112 88) rotate(-25)">
          <path d="M-9 0 A9 9 0 0 1 9 0 Z" fill="#f4d23c" />
          <path d="M-6 -0.5 A6 6 0 0 1 6 -0.5" fill="none" stroke="#fbeea0" strokeWidth="1.2" />
        </g>
      )}
      {dish.extra === "cream" && (
        <path
          d={`M${main.cx - 10} ${main.cy - 4} q 5 -8 10 0 t 10 0`}
          fill="none"
          stroke="#fbf6ea"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {dish.extra === "ghee" && (
        <ellipse cx={main.cx + 3} cy={main.cy - 3} rx="4" ry="3" fill="#f7d774" opacity="0.9" />
      )}
    </svg>
  );
}

/** The table the dish sits on, with a folded napkin and a spoon beside it. */
function Table() {
  return (
    <g>
      <rect width="160" height="120" fill="var(--c-art-table)" />
      <path
        d={Array.from({ length: 20 }, (_, i) => `M0 ${String(i * 6 + 3)} H160`).join(" ")}
        stroke="var(--c-art-table-line)"
        strokeWidth="0.8"
      />
      <g transform="rotate(-14 20 100)">
        <rect x="-6" y="84" width="40" height="30" rx="2" fill="#cfded6" />
        <rect x="-6" y="90" width="40" height="2.5" fill="#b3c9bd" />
      </g>
      <g transform="rotate(18 140 70)">
        <ellipse cx="140" cy="54" rx="4.2" ry="6" fill="#c3c9cf" />
        <rect x="138.8" y="58" width="2.4" height="30" rx="1.2" fill="#b3bac1" />
      </g>
    </g>
  );
}

type Circle = { cx: number; cy: number; r: number };
type Random = () => number;

function Food({
  dish,
  main,
  seed,
  glow,
}: {
  dish: Dish;
  main: Circle;
  seed: string;
  glow: string;
}) {
  const random = seeded(seed);
  const { cx, cy, r } = main;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={dish.food} />
      <circle cx={cx} cy={cy} r={r} fill={glow} />
      <circle cx={cx} cy={cy} r={r - 1} fill="none" stroke="#000" strokeWidth="2" opacity="0.1" />
      {dish.texture === "grain" &&
        Array.from({ length: Math.round(r * 1.4) }, (_, i) => {
          const [x, y] = inside(main, random, 0.9);
          return (
            <ellipse
              key={i}
              cx={x}
              cy={y}
              rx="2.4"
              ry="1"
              transform={`rotate(${Math.round(random() * 180)} ${x} ${y})`}
              fill="#fff"
              opacity="0.35"
            />
          );
        })}
      {dish.texture === "crumble" &&
        Array.from({ length: 14 }, (_, i) => {
          const [x, y] = inside(main, random, 0.85);
          return <circle key={i} cx={x} cy={y} r={2 + random() * 3} fill="#000" opacity="0.07" />;
        })}
      {(dish.texture === undefined || dish.texture === "smooth") && (
        <path
          d={`M${cx - r * 0.6} ${cy - r * 0.45} A${r * 0.75} ${r * 0.75} 0 0 1 ${cx + r * 0.2} ${cy - r * 0.72}`}
          fill="none"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.3"
        />
      )}
    </g>
  );
}

function Bits({ bit, main, seed }: { bit: Bit; main: Circle; seed: string }) {
  const random = seeded(seed);
  return (
    <g>
      {Array.from({ length: bit.count }, (_, i) => {
        const [x, y] = inside(main, random, 0.78);
        const turn = Math.round(random() * 180);

        switch (bit.kind) {
          case "leaf":
            return (
              <ellipse
                key={i}
                cx={x}
                cy={y}
                rx="3.6"
                ry="1.8"
                fill={bit.color}
                transform={`rotate(${turn} ${x} ${y})`}
              />
            );
          case "dot":
            return <circle key={i} cx={x} cy={y} r="1.3" fill={bit.color} />;
          case "cube":
            return (
              <rect
                key={i}
                x={x - 2.8}
                y={y - 2.8}
                width="5.6"
                height="5.6"
                rx="1.2"
                fill={bit.color}
                transform={`rotate(${turn} ${x} ${y})`}
              />
            );
          case "chunk":
            return (
              <rect
                key={i}
                x={x - 4.5}
                y={y - 3}
                width="9"
                height="6"
                rx="2.5"
                fill={bit.color}
                transform={`rotate(${turn} ${x} ${y})`}
              />
            );
          case "ring":
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3.4"
                fill="none"
                stroke={bit.color}
                strokeWidth="1.4"
              />
            );
          case "slice":
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="2.8" fill={bit.color} />
                <circle cx={x} cy={y} r="1" fill="#fff" opacity="0.5" />
              </g>
            );
          case "bean":
            return (
              <ellipse
                key={i}
                cx={x}
                cy={y}
                rx="2.8"
                ry="1.8"
                fill={bit.color}
                transform={`rotate(${turn} ${x} ${y})`}
              />
            );
        }
      })}
    </g>
  );
}

function Rice({ seed }: { seed: string }) {
  const random = seeded(seed);
  const mound = { cx: 64, cy: 68, r: 22 };
  return (
    <g>
      <circle cx={mound.cx} cy={mound.cy} r={mound.r} fill="#f3eee2" />
      {Array.from({ length: 30 }, (_, i) => {
        const [x, y] = inside(mound, random, 0.9);
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx="2.4"
            ry="1"
            transform={`rotate(${Math.round(random() * 180)} ${x} ${y})`}
            fill="#ddd2bb"
          />
        );
      })}
    </g>
  );
}

function Roti() {
  return (
    <g>
      {[
        [58, 72],
        [66, 64],
      ].map(([x, y]) => (
        <g key={`${String(x)}-${String(y)}`}>
          <circle cx={x} cy={y} r="19" fill="#e2b774" stroke="#c99a55" strokeWidth="1" />
          {[
            [-6, -4],
            [5, -7],
            [7, 5],
            [-3, 8],
            [-9, 3],
          ].map(([dx = 0, dy = 0], i) => (
            <circle
              key={i}
              cx={(x ?? 0) + dx}
              cy={(y ?? 0) + dy}
              r="1.8"
              fill="#b9823f"
              opacity="0.7"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/** A point inside the circle, at most `spread` of the way to its edge. */
function inside({ cx, cy, r }: Circle, random: Random, spread: number): [number, number] {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * r * spread;
  return [
    Math.round((cx + Math.cos(angle) * distance) * 10) / 10,
    Math.round((cy + Math.sin(angle) * distance) * 10) / 10,
  ];
}

/** mulberry32, seeded from the key, so the scatter is the same every time. */
function seeded(key: string): Random {
  let state = 0;
  for (const char of key) state = (Math.imul(state, 31) + char.charCodeAt(0)) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
