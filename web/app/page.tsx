import { useTranslations } from "next-intl";

import { DishArt } from "../src/art/DishArt";
import { ExerciseArt } from "../src/art/ExerciseArt";
import { HeroArt } from "../src/art/HeroArt";
import { SLEEP_TARGET_MINUTES, WATER_TARGET_ML } from "../src/tracking/targets";
import { Card } from "../src/ui/Card";
import { Hero } from "../src/ui/Hero";
import { Icon } from "../src/ui/Icon";
import type { IconName } from "../src/ui/Icon";
import { LinkButton } from "../src/ui/LinkButton";
import { MediaCard } from "../src/ui/MediaCard";
import { ProgressRing } from "../src/ui/ProgressRing";
import { Rail } from "../src/ui/Rail";
import { Screen } from "../src/ui/Screen";
import { WeekStrip } from "../src/ui/WeekStrip";
import { GuestEntryButton } from "./GuestEntryButton";

const DAYS_IN_WEEK = 7;

/**
 * Invented figures, and the only invented figures anywhere in this product.
 *
 * Every other screen refuses to show a number nobody logged — that rule is
 * why there is no Steps tile and why sleep shows a dash rather than zero. A
 * preview has to show something, so the rule is kept a different way: the
 * label above it says the week is an example and not real data, in the same
 * size as the heading rather than in fine print.
 *
 * `date` is a React key and a data attribute inside WeekStrip and is never
 * formatted, so these are plain labels rather than dates that would go stale.
 */
const EXAMPLE_WEEK = [
  { date: "day-1", value: 2000 },
  { date: "day-2", value: 1500 },
  { date: "day-3", value: 2000 },
  { date: "day-4", value: 750 },
  { date: "day-5", value: 1750 },
  { date: "day-6", value: 2000 },
  { date: "day-7", value: 1250 },
];

/**
 * What the picture rows show. Invented in the same sense as EXAMPLE_WEEK, and
 * sitting under the same "example" framing: real exercises and real dishes
 * from the libraries, but nobody's actual plan.
 */
const EXAMPLE_EXERCISES = [
  { key: "chair_sit_to_stand", sets: 3, reps: 10 },
  { key: "band_row", sets: 3, reps: 12 },
  { key: "glute_bridge", sets: 3, reps: 12 },
  { key: "brisk_walk", seconds: 600 },
] as const;

const EXAMPLE_DISHES = [
  { key: "palak_paneer", minutes: 30, kcal: 380 },
  { key: "poha", minutes: 20, kcal: 300 },
  { key: "dal_chawal", minutes: 35, kcal: 420 },
] as const;

const FEATURES = [
  { key: "plan", icon: "activity" },
  { key: "meals", icon: "utensils" },
  { key: "family", icon: "users" },
] as const satisfies readonly { key: string; icon: IconName }[];

/**
 * What somebody sees when they follow a link to this app.
 *
 * It was a title, one line and a Sign in button — which is a login wall with a
 * headline on it. Everything worth looking at was on the other side of an
 * account: the rings, the week, a plan that explains what it left out. A
 * visitor gives a page seconds, and none of those seconds were being spent on
 * the product.
 *
 * So the product goes first and the ask goes last, and the preview is built
 * from the REAL components — the same ProgressRing and WeekStrip the home
 * screen renders. A screenshot would be a second thing to maintain and would
 * start lying the first time the design moved; this cannot drift, because it
 * is the same code.
 */
export default function LandingPage() {
  const t = useTranslations("landing");
  const tPlan = useTranslations("plan");
  const tExercise = useTranslations("plan.exercises");
  const tRecipe = useTranslations("meals.recipes");
  const tHome = useTranslations("home");

  return (
    <Screen>
      {/*
        The opening is a picture of the family the app is for, left clear:
        the scene is lit so the family is the brightest thing in it, and a
        caption laid over it would dim and cover them. The name follows
        underneath, as the page's one h1.
      */}
      <div className="flex flex-col gap-4">
        <div className="aspect-[4/5] overflow-hidden rounded-card bg-raised">
          <HeroArt name="family" />
        </div>
        <div className="flex flex-col gap-2 px-1">
          <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-ink">
            {t("title")}
          </h1>
          <p className="text-[1.0625rem] leading-snug text-muted">{t("subtitle")}</p>
        </div>
      </div>

      {/*
        The same hero the home screen uses, so what a visitor sees here is
        literally what they get after signing in.
      */}
      <Hero>
        <p className="text-sm font-medium text-muted">{t("previewLabel")}</p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <ProgressRing
            label={t("water")}
            value={12500}
            target={WATER_TARGET_ML * DAYS_IN_WEEK}
            display="12.5L"
          />
          <ProgressRing
            label={t("sleep")}
            value={400}
            target={SLEEP_TARGET_MINUTES}
            display="6.7h"
          />
          <ProgressRing label={t("workouts")} value={3} target={4} display="3" />
        </div>
      </Hero>

      <Card>
        <WeekStrip days={EXAMPLE_WEEK} target={WATER_TARGET_ML} label={t("weekWater")} />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{t("examplePlan")}</h2>
        <Rail label={t("examplePlan")} size="lg">
          {EXAMPLE_EXERCISES.map((exercise) => (
            <MediaCard
              key={exercise.key}
              art={<ExerciseArt exercise={exercise.key} />}
              title={tExercise(exercise.key)}
              meta={
                "seconds" in exercise
                  ? tPlan("duration", { seconds: exercise.seconds })
                  : tPlan("setsReps", { sets: exercise.sets, reps: exercise.reps })
              }
            />
          ))}
        </Rail>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{t("exampleDishes")}</h2>
        <Rail label={t("exampleDishes")} size="lg">
          {EXAMPLE_DISHES.map((dish) => (
            <MediaCard
              key={dish.key}
              art={<DishArt recipe={dish.key} />}
              title={tRecipe(dish.key)}
              meta={tHome("dishMeta", { minutes: dish.minutes, kcal: dish.kcal })}
            />
          ))}
        </Rail>
      </section>

      {/*
        One list rather than three boxes: three equal cards stacked under the
        preview made the page read as a wall of panels. As a list, the eye
        runs down the three promises in one pass.
      */}
      <ul className="flex flex-col gap-6 px-1 py-2">
        {FEATURES.map(({ key, icon }) => (
          <li key={key} className="flex gap-4">
            <Icon name={icon} className="mt-0.5 size-5 text-muted" />
            <div>
              <h2 className="leading-snug font-semibold text-ink">
                {t(`${key}Title` as "planTitle")}
              </h2>
              <p className="mt-1 leading-relaxed text-muted">{t(`${key}Body` as "planBody")}</p>
            </div>
          </li>
        ))}
      </ul>

      {/*
        Guest first and sign-in second, which is the opposite of the order this
        screen used to offer. Somebody who has just been shown the product is
        deciding whether to look, not whether to commit to an account.
      */}
      <div className="flex flex-col gap-3">
        <GuestEntryButton />
        <LinkButton href="/signin" variant="secondary">
          {t("signIn")}
        </LinkButton>
        <a
          href="/privacy"
          className="inline-flex min-h-11 items-center gap-1.5 self-center text-sm text-muted underline underline-offset-4"
        >
          <Icon name="shield" className="size-4" />
          {t("privacy")}
        </a>
      </div>
    </Screen>
  );
}
