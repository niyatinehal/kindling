import { useTranslations } from "next-intl";

import type { TrackingSummary } from "../../src/tracking/summaryTypes";
import { BackLink } from "../../src/ui/BackLink";
import { BarChart } from "../../src/ui/BarChart";
import type { BarDatum } from "../../src/ui/BarChart";
import { Card } from "../../src/ui/Card";
import { Meter } from "../../src/ui/Meter";
import { Screen } from "../../src/ui/Screen";

/** A daily water goal, so the chart has a reference line to read against. */
const WATER_TARGET_ML = 2000;
/** Seven hours, in minutes. */
const SLEEP_TARGET_MINUTES = 420;

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The week, in pictures.
 *
 * Four small charts rather than one combined one, deliberately: litres, hours and
 * counts are three different units, and putting two of them on one plot would mean
 * a second y-axis whose alignment is arbitrary — the single most misleading thing a
 * chart can do. Small multiples of the same form let the reader compare shapes
 * without the chart inventing a correlation.
 *
 * Each chart is one series, so each is one colour. Colouring bars
 * darker-where-taller would double-encode height as hue and spend the only free
 * channel restating what the bar already says.
 *
 * Adherence is a meter, not a chart: it is one ratio against one limit, and a
 * two-slice pie or a single bar would be a chart pretending to be a number.
 */
export function DashboardView({ summary }: { summary: TrackingSummary }) {
  const t = useTranslations("dashboard");
  const today = new Date().toISOString().slice(0, 10);

  const series = (
    pick: (day: TrackingSummary["days"][number]) => number,
    title: (value: number, date: string) => string,
  ): BarDatum[] =>
    summary.days.map((day) => {
      const value = pick(day);
      return {
        label: WEEKDAY_INITIALS[new Date(`${day.date}T00:00:00Z`).getUTCDay()] ?? "",
        value,
        title: title(value, day.date),
        isToday: day.date === today,
      };
    });

  // Emptiness is "nothing was logged", NOT "no days came back". The series is
  // always seven dense days — that is the point of it — so testing its length
  // would make this message unreachable for the one person who needs it.
  const nothingLogged =
    summary.water_ml === 0 &&
    summary.sleep_nights === 0 &&
    summary.workouts_completed === 0 &&
    summary.meals_logged === 0;

  const litres = (summary.water_ml / 1000).toFixed(1);
  const nightlyHours =
    summary.sleep_nights === 0
      ? null
      : (summary.sleep_minutes / summary.sleep_nights / 60).toFixed(1);

  return (
    <Screen title={t("title")}>
      <BackLink href="/home">{t("back")}</BackLink>

      {nothingLogged && (
        <Card tone="emphasis">
          <p className="text-lg leading-relaxed">{t("empty")}</p>
        </Card>
      )}

      {/*
        A KPI row, not four one-bar charts. Headline numbers are stat tiles; the
        charts below carry the shape of the week.
      */}
      <div className="grid grid-cols-3 gap-3">
        <Stat value={`${litres}L`} label={t("waterTotal")} />
        <Stat value={nightlyHours === null ? "—" : `${nightlyHours}h`} label={t("sleepAverage")} />
        <Stat value={String(summary.workouts_completed)} label={t("workoutsDone")} />
      </div>

      {summary.workouts_scheduled > 0 && (
        <Card>
          <Meter
            value={summary.workouts_completed}
            max={summary.workouts_scheduled}
            label={t("adherenceLabel")}
            caption={t("adherenceCaption", {
              done: summary.workouts_completed,
              scheduled: summary.workouts_scheduled,
              percent: summary.workout_adherence ?? 0,
            })}
          />
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
          {t("waterChart")}
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          {t("waterChartHint", { litres: (WATER_TARGET_ML / 1000).toFixed(1) })}
        </p>
        <BarChart
          color="var(--color-water)"
          data={series(
            (day) => day.water_ml,
            (value, date) => `${date}: ${(value / 1000).toFixed(1)}L`,
          )}
          target={WATER_TARGET_ML}
          formatValue={(value) => `${(value / 1000).toFixed(1)}L`}
        />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
          {t("sleepChart")}
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">{t("sleepChartHint")}</p>
        <BarChart
          color="var(--color-sleep)"
          data={series(
            (day) => day.sleep_minutes,
            (value, date) =>
              value === 0 ? `${date}: ${t("noneLogged")}` : `${date}: ${(value / 60).toFixed(1)}h`,
          )}
          target={SLEEP_TARGET_MINUTES}
          formatValue={(value) => `${(value / 60).toFixed(1)}h`}
        />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
          {t("workoutChart")}
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">{t("workoutChartHint")}</p>
        <BarChart
          color="var(--color-move)"
          data={series(
            (day) => day.workouts_completed,
            (value, date) =>
              value === 0
                ? `${date}: ${t("noneLogged")}`
                : `${date}: ${t("exercisesDone", { count: value })}`,
          )}
        />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
          {t("mealChart")}
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">{t("mealChartHint")}</p>
        <BarChart
          color="var(--color-meal)"
          data={series(
            (day) => day.meals_logged,
            (value, date) =>
              value === 0
                ? `${date}: ${t("noneLogged")}`
                : `${date}: ${t("mealsLoggedCount", { count: value })}`,
          )}
        />
      </Card>

      <p className="text-sm text-muted">{t("footnote")}</p>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 text-center">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}
