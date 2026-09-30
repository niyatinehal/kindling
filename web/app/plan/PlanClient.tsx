"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { ExerciseArt } from "../../src/art/ExerciseArt";
import { readPlan } from "../../src/plan/planTypes";
import type { PlanView } from "../../src/plan/planTypes";
import { Alert } from "../../src/ui/Alert";
import { BackLink } from "../../src/ui/BackLink";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Icon } from "../../src/ui/Icon";
import { LinkButton } from "../../src/ui/LinkButton";
import { MediaCard } from "../../src/ui/MediaCard";
import { Screen } from "../../src/ui/Screen";

const DAY_KEYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

/**
 * The plan screen. Server-rendered with whatever plan already exists, then
 * client-side for the generate action — the button has to report progress and a
 * failure, which a server component cannot do.
 *
 * `hasProfile` is passed in rather than fetched: the parent already resolved it
 * for the guard, and asking twice would be a second round trip for an answer we
 * hold.
 */
export function PlanClient({
  initialPlan,
  hasProfile,
  initialTicks = [],
}: {
  initialPlan: PlanView | null;
  hasProfile: boolean;
  initialTicks?: { plan_exercise_id: string; status: string }[];
}) {
  const t = useTranslations("plan");
  const tError = useTranslations("errors");
  const tExercise = useTranslations("plan.exercises");
  const tDay = useTranslations("plan.days");
  const tReason = useTranslations("plan.reasons");
  const tTrack = useTranslations("tracking");

  const [plan, setPlan] = useState<PlanView | null>(initialPlan);
  // Today's ticks, keyed by exercise. Seeded from the server so a reload shows
  // what is already done rather than an unticked day.
  const [ticks, setTicks] = useState<Record<string, string>>(
    Object.fromEntries(initialTicks.map((tick) => [tick.plan_exercise_id, tick.status])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(undefined);

    const response = await fetch("/api/plan", { method: "POST" });
    const body = await readJsonBody(response);

    if (!response.ok) {
      setBusy(false);
      // A 403 here is the intake seam, not a fault — say so specifically rather
      // than reporting a generic failure for a state the user can act on.
      const code =
        typeof body === "object" && body !== null && "error" in body
          ? (body as { error?: { code?: string } }).error?.code
          : undefined;
      setError(code === "PROFILE_REQUIRED" ? "PROFILE_REQUIRED" : "PLAN_GENERATE_FAILED");
      return;
    }

    setPlan(readPlan(body));
    setBusy(false);
  }

  /**
   * Ticks one exercise. Optimistic, then corrected: the row shows the new state
   * immediately and reverts if the write failed, because a tick that silently did
   * not save is worse than one that visibly did not.
   */
  async function tick(planExerciseId: string, status: "completed" | "skipped"): Promise<void> {
    const previous = ticks[planExerciseId];
    setTicks({ ...ticks, [planExerciseId]: status });

    const response = await fetch("/api/tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "workout",
        logged_for: new Date().toISOString().slice(0, 10),
        plan_exercise_id: planExerciseId,
        status,
        rating: null,
      }),
    });

    if (!response.ok) {
      setTicks((current) => {
        const reverted = { ...current };
        if (previous === undefined) {
          delete reverted[planExerciseId];
        } else {
          reverted[planExerciseId] = previous;
        }
        return reverted;
      });
      setError("TRACKING_FAILED");
    }
  }

  const exclusions = plan?.profile_snapshot?.applied_exclusions ?? [];
  const scheduled = new Map(plan?.days.map((day) => [day.day_of_week, day]) ?? []);

  return (
    <Screen title={t("title")}>
      <BackLink href="/home">{t("backHome")}</BackLink>

      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      {!hasProfile ? (
        <Card tone="emphasis">
          <p className="text-lg leading-relaxed">{t("noProfile")}</p>
          <div className="mt-4">
            <LinkButton href="/onboarding/profile">{t("goToProfile")}</LinkButton>
          </div>
        </Card>
      ) : (
        <>
          {plan === null && (
            <Card tone="emphasis">
              <p className="text-lg leading-relaxed">{t("empty")}</p>
            </Card>
          )}

          {plan === null ? (
            <Button
              disabled={busy}
              loading={busy}
              onClick={() => {
                void generate();
              }}
            >
              {busy ? t("generating") : t("generate")}
            </Button>
          ) : (
            /*
              Rebuilding goes through the details first. A plan is derived entirely
              from the profile, so regenerating without a change would return the
              same plan — the deterministic engine has no randomness to shake loose.
              The only way a rebuild produces something different is if something
              about the person changed, so the button asks what changed.
            */
            <>
              <LinkButton href="/onboarding/profile?next=plan" variant="secondary">
                {t("regenerate")}
              </LinkButton>
              <p className="text-sm text-muted">{t("regenerateHint")}</p>
            </>
          )}
        </>
      )}

      {plan !== null &&
        DAY_KEYS.map((dayKey) => {
          const day = scheduled.get(Number(dayKey));
          // ISO weekday: getUTCDay() is 0 for Sunday, the API uses 7.
          const isoToday = new Date().getUTCDay() === 0 ? 7 : new Date().getUTCDay();
          const isToday = Number(dayKey) === isoToday;

          // A rest day is one fact, so it gets one quiet row rather than a card
          // the same size as a workout — the week should read at a glance as
          // "these days I move", not seven equal boxes.
          if (day === undefined) {
            return (
              <div
                key={dayKey}
                className="flex min-h-12 items-center justify-between gap-3 px-5 text-muted"
              >
                <h2 className="font-medium">{tDay(dayKey)}</h2>
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <Icon name="moon" className="size-4" />
                  {t("restLabel")}
                </span>
              </div>
            );
          }

          return (
            <section key={dayKey} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{tDay(dayKey)}</h2>
                {isToday && <span className="text-sm font-medium text-accent">{t("today")}</span>}
              </div>

              {/*
                Two across rather than a list: each exercise is a picture first,
                and two pictures side by side still leave the name legible at
                phone width. Today's day goes full width — it is the one being
                done, so its pictures are the ones worth seeing large.
              */}
              <ol className={`grid gap-3 ${isToday ? "grid-cols-1" : "grid-cols-2"}`}>
                {day.exercises.map((exercise) => (
                  <li key={exercise.id}>
                    <MediaCard
                      art={<ExerciseArt exercise={exercise.exercise_key} />}
                      title={
                        tExercise.has(exercise.exercise_key)
                          ? tExercise(exercise.exercise_key)
                          : exercise.exercise_key
                      }
                      meta={
                        <>
                          {exercise.sets !== null && exercise.reps !== null
                            ? t("setsReps", { sets: exercise.sets, reps: exercise.reps })
                            : t("duration", { seconds: exercise.duration_seconds ?? 0 })}
                          {exercise.rest_seconds !== null &&
                            ` · ${t("restBetween", { seconds: exercise.rest_seconds })}`}
                        </>
                      }
                    >
                      {/*
                        Only today's day gets buttons. Ticking Thursday off on a
                        Monday would be logging something that has not happened.
                      */}
                      {isToday && (
                        // Stacked, not side by side: half a phone screen is too
                        // narrow for both, and letting them wrap left Skip
                        // stranded under Done at an odd width.
                        <div className="mt-auto flex flex-col gap-1 pt-2">
                          {ticks[exercise.id] === "completed" ? (
                            <span className="inline-flex min-h-12 items-center gap-1.5 text-sm font-medium text-accent">
                              <Icon name="check" className="size-4" />
                              {tTrack("done")}
                            </span>
                          ) : ticks[exercise.id] === "skipped" ? (
                            <span className="inline-flex min-h-12 items-center text-sm text-muted">
                              {tTrack("skipped")}
                            </span>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  void tick(exercise.id, "completed");
                                }}
                              >
                                {tTrack("markDone")}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  void tick(exercise.id, "skipped");
                                }}
                              >
                                {tTrack("markSkipped")}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </MediaCard>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}

      {/*
        The rationale PRD §10.2 asks for ("low-impact: knee condition"). It is
        rendered from what the generator actually excluded, not from the profile,
        so it can never claim a reason that did not change the plan.
      */}
      {plan !== null && exclusions.length > 0 && (
        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="shield" className="size-5 text-accent" />
            <h2 className="font-semibold text-ink">{t("whyTitle")}</h2>
          </div>
          <p className="mt-2 leading-relaxed text-muted">{t("whyBody")}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {exclusions.map((reason) => (
              <li key={reason} className="rounded-md bg-raised px-2.5 py-1 text-sm text-ink">
                {tReason.has(reason) ? tReason(reason) : reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {plan !== null && <p className="text-sm text-muted">{t("disclaimer")}</p>}
    </Screen>
  );
}
