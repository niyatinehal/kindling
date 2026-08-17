"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { readPlan } from "../../src/plan/planTypes";
import type { PlanView } from "../../src/plan/planTypes";
import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { LinkButton } from "../../src/ui/LinkButton";
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
}: {
  initialPlan: PlanView | null;
  hasProfile: boolean;
}) {
  const t = useTranslations("plan");
  const tError = useTranslations("errors");
  const tExercise = useTranslations("plan.exercises");
  const tDay = useTranslations("plan.days");
  const tReason = useTranslations("plan.reasons");

  const [plan, setPlan] = useState<PlanView | null>(initialPlan);
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

  const exclusions = plan?.profile_snapshot?.applied_exclusions ?? [];
  const scheduled = new Map(plan?.days.map((day) => [day.day_of_week, day]) ?? []);

  return (
    <Screen title={t("title")}>
      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      {!hasProfile ? (
        <Card tone="ink">
          <p className="text-lg leading-relaxed">{t("noProfile")}</p>
          <div className="mt-4">
            <LinkButton href="/onboarding/profile">{t("goToProfile")}</LinkButton>
          </div>
        </Card>
      ) : (
        <>
          {plan === null && (
            <Card tone="ink">
              <p className="text-lg leading-relaxed">{t("empty")}</p>
            </Card>
          )}

          <Button
            disabled={busy}
            onClick={() => {
              void generate();
            }}
          >
            {busy ? t("generating") : plan === null ? t("generate") : t("regenerate")}
          </Button>
        </>
      )}

      {plan !== null &&
        DAY_KEYS.map((dayKey) => {
          const day = scheduled.get(Number(dayKey));
          return (
            <Card key={dayKey}>
              <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
                {tDay(dayKey)}
              </h2>

              {day === undefined ? (
                <p className="mt-2 text-muted">{t("restLabel")}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {day.exercises.map((exercise) => (
                    <li key={exercise.exercise_key} className="flex flex-col">
                      <span className="text-[1.0625rem] font-medium text-ink">
                        {tExercise.has(exercise.exercise_key)
                          ? tExercise(exercise.exercise_key)
                          : exercise.exercise_key}
                      </span>
                      <span className="text-sm text-muted">
                        {exercise.sets !== null && exercise.reps !== null
                          ? t("setsReps", { sets: exercise.sets, reps: exercise.reps })
                          : t("duration", { seconds: exercise.duration_seconds ?? 0 })}
                        {exercise.rest_seconds !== null &&
                          ` · ${t("restBetween", { seconds: exercise.rest_seconds })}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}

      {/*
        The rationale PRD §10.2 asks for ("low-impact: knee condition"). It is
        rendered from what the generator actually excluded, not from the profile,
        so it can never claim a reason that did not change the plan.
      */}
      {plan !== null && exclusions.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
            {t("whyTitle")}
          </h2>
          <p className="mt-2 text-muted">{t("whyBody")}</p>
          <ul className="mt-2 list-inside list-disc text-muted">
            {exclusions.map((reason) => (
              <li key={reason}>{tReason.has(reason) ? tReason(reason) : reason}</li>
            ))}
          </ul>
        </Card>
      )}

      {plan !== null && <p className="text-sm text-muted">{t("disclaimer")}</p>}
    </Screen>
  );
}
