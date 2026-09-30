import { useTranslations } from "next-intl";

import { DishArt } from "../../src/art/DishArt";
import { ExerciseArt } from "../../src/art/ExerciseArt";
import type { MealSuggestion } from "../../src/meals/mealTypes";
import type { PlanExerciseView } from "../../src/plan/planTypes";
import type { TrackingSummary } from "../../src/tracking/summaryTypes";
import { WATER_TARGET_ML } from "../../src/tracking/targets";
import { Card } from "../../src/ui/Card";
import { FeatureCard } from "../../src/ui/FeatureCard";
import { LinkButton } from "../../src/ui/LinkButton";
import { MediaCard } from "../../src/ui/MediaCard";
import { NavList, NavRow } from "../../src/ui/NavList";
import { Rail } from "../../src/ui/Rail";
import { Screen } from "../../src/ui/Screen";
import { WeekStrip } from "../../src/ui/WeekStrip";
import { ClaimAccountCard } from "./ClaimAccountCard";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { SignOutButton } from "./SignOutButton";
import { TrackingTiles } from "./TrackingTiles";

/**
 * The home screen. It is a separate component because `page.tsx` has to be
 * `async` to run the onboarding guard, and `useTranslations` is a hook — it
 * cannot be called from an async component.
 *
 * The numbers here are real now. They were absent for as long as there was no
 * tracking endpoint, and the rule that kept them absent still holds: every
 * figure on this screen comes from something the user logged. Nothing is
 * inferred, estimated, or filled in to make the layout look complete.
 *
 * There is no Steps tile, and that is deliberate rather than unfinished. No Web
 * API reports step count, a PWA cannot count them in the background, and PRD §5's
 * MVP logging list never included them — so the tile could only ever have shown a
 * dash until wearable sync arrives in v2. Sleep took its place because it is one
 * of the four categories FR-TRK-3 actually computes adherence for.
 */
export function HomeView({
  isGuest = false,
  hasProfile = false,
  inFamily = null,
  summary,
  todayExercises = null,
  dishes = [],
}: {
  isGuest?: boolean;
  hasProfile?: boolean;
  /**
   * Whether this user belongs to a family, or `null` when the answer could not
   * be fetched. Defaults to `null` because "we did not ask" and "there is no
   * family" are different facts, and this card spent its whole life conflating
   * them.
   */
  inFamily?: boolean | null;
  summary: TrackingSummary;
  /** Today's exercises from the current plan; `[]` is a rest day, `null` no plan. */
  todayExercises?: PlanExerciseView[] | null;
  /** A few diet-safe dishes to show as ideas. Empty leaves the row out. */
  dishes?: MealSuggestion[];
}) {
  const t = useTranslations("home");
  const tPlan = useTranslations("plan");
  const tExercise = useTranslations("plan.exercises");
  const tRecipe = useTranslations("meals.recipes");
  const exerciseName = (key: string) => (tExercise.has(key) ? tExercise(key) : key);

  return (
    <Screen>
      {/*
        The greeting and the chip are handed to the hero rather than rendered
        here: the rings beside them own live tracking state, and a heading that
        lived outside that component would sit above numbers it could not keep
        in step.

        The chip is deliberately not a "claim your account" button — claiming is
        not built. The note can promise nothing is lost because a guest is a real
        anonymous user: linking an identity later keeps the same auth.users.id,
        and therefore the same domain row.
      */}
      <TrackingTiles
        initial={summary}
        greeting={t("greeting")}
        guestChip={isGuest ? t("guestChip") : undefined}
      />

      {/*
        This was a note telling a guest their data lives only in this browser.
        Saying that and offering nothing to do about it is a warning; the same
        sentence with a field under it is a way out, and it attaches to the
        identity the guest already has rather than moving anything.
      */}
      {isGuest && <ClaimAccountCard />}

      {/*
        The Today card is the one thing on this screen with something to say, so
        it carries the only action, and the action is whatever the journey needs
        next: intake when there is no profile, the plan once there is one. It
        still promises nothing it cannot deliver — the stat tiles below stay
        empty because no tracking endpoint exists yet.
      */}
      {hasProfile && todayExercises !== null ? (
        <section className="flex flex-col gap-3">
          {/*
            Today's first exercise, large, as the way into the plan — the whole
            card is the link. The rest of the day follows as a row, so the
            screen leads with a picture of what to do rather than a sentence.
          */}
          {todayExercises[0] === undefined ? (
            <>
              <h2 className="text-lg font-semibold text-ink">{t("todayWorkout")}</h2>
              <p className="text-muted">
                {t("restToday")}{" "}
                <a href="/plan" className="font-medium text-accent">
                  {t("viewPlan")}
                </a>
              </p>
            </>
          ) : (
            <>
              <FeatureCard
                href="/plan"
                picture={<ExerciseArt exercise={todayExercises[0].exercise_key} />}
                eyebrow={t("todayWorkout")}
                title={exerciseName(todayExercises[0].exercise_key)}
                detail={t("workoutMore", { count: todayExercises.length - 1 })}
              />
              {todayExercises.length > 1 && (
                <Rail label={t("todayWorkout")}>
                  {todayExercises.slice(1).map((exercise) => (
                    <MediaCard
                      key={exercise.id}
                      art={<ExerciseArt exercise={exercise.exercise_key} />}
                      title={exerciseName(exercise.exercise_key)}
                      meta={
                        exercise.sets !== null && exercise.reps !== null
                          ? tPlan("setsReps", { sets: exercise.sets, reps: exercise.reps })
                          : tPlan("duration", { seconds: exercise.duration_seconds ?? 0 })
                      }
                    />
                  ))}
                </Rail>
              )}
            </>
          )}
        </section>
      ) : (
        <Card>
          <p className="text-sm font-medium text-muted">{t("todayLabel")}</p>
          <p className="mt-1.5 text-lg leading-relaxed">
            {hasProfile ? t("todayPlanReady") : t("todayNoProfile")}
          </p>
          <div className="mt-4">
            {hasProfile ? (
              <LinkButton href="/plan">{t("viewPlan")}</LinkButton>
            ) : (
              <LinkButton href="/onboarding/profile">{t("startIntake")}</LinkButton>
            )}
          </div>
        </Card>
      )}

      {/*
        Ideas, not recommendations: they are filtered by diet but ranked with an
        empty pantry, so the order means little. The meal planner below is where
        a real suggestion comes from.
      */}
      {hasProfile && dishes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink">{t("dishIdeas")}</h2>
          <Rail label={t("dishIdeas")} size="lg">
            {dishes.map((dish) => (
              <MediaCard
                key={dish.recipe_key}
                art={<DishArt recipe={dish.recipe_key} />}
                title={tRecipe.has(dish.recipe_key) ? tRecipe(dish.recipe_key) : dish.recipe_key}
                meta={t("dishMeta", { minutes: dish.minutes, kcal: dish.approx_kcal })}
              />
            ))}
          </Rail>
        </section>
      )}

      {/*
        Not a chart — /dashboard already draws those. This answers the cruder
        question the home screen is for: did the week happen.
      */}
      <Card>
        <WeekStrip
          days={summary.days.map((day) => ({ date: day.date, value: day.water_ml }))}
          target={WATER_TARGET_ML}
          label={t("weekWater")}
          empty={t("weekEmpty")}
        />
      </Card>

      {/*
        Family setup exists now, so this card stops being a notice and becomes a
        way in. It carries no member preview: the family screen resolves that
        itself, and duplicating it here would mean a second pair of upstream hops
        on every /home render. `hasFamily` costs one hop precisely so that
        holds — it reads the membership off /auth/me and stops there.

        What it must NOT do is what it used to: render "You're not in a family
        yet." as a hardcoded string on a screen that never asked. That sentence
        was shown to every user forever, including the families who had already
        set one up on the screen it was offering to take them to.

        Hence three branches rather than two. When the answer could not be
        fetched the way in stays and the claim goes — an unreachable API is not
        evidence that somebody has no family.
      */}
      {/*
        One list for everywhere else there is to go, in the order people go
        there: food most days, the week now and then, the family least. What
        were tiles and a separate family card were three different shapes for
        the same kind of thing.
      */}
      <NavList>
        {hasProfile && (
          <>
            <NavRow href="/meals" icon="utensils" label={t("mealsCta")} />
            <NavRow href="/dashboard" icon="chart" label={t("viewDashboard")} />
          </>
        )}
        <NavRow
          href="/family"
          icon="users"
          label={
            inFamily === null ? t("openFamily") : inFamily ? t("viewFamily") : t("setUpFamily")
          }
          detail={inFamily === null ? undefined : inFamily ? t("inFamily") : t("noFamily")}
        />
      </NavList>

      {/*
        Last on the screen and the quietest variant on it, because signing out
        is the one control here nobody is looking for until they want it — and
        on a shared family device, one they must be able to find.
      */}
      <SignOutButton />

      {/*
        Below sign-out, because leaving is the thing people come to this corner
        for and erasing is not. It asks before it does anything, which is what
        makes it safe to put within reach of the control beside it.
      */}
      <DeleteAccountButton />
    </Screen>
  );
}
