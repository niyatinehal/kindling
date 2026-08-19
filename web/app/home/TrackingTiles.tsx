"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EMPTY_SUMMARY } from "../../src/tracking/summaryTypes";
import type { TrackingSummary } from "../../src/tracking/summaryTypes";
import { SLEEP_TARGET_MINUTES, WATER_TARGET_ML } from "../../src/tracking/targets";
import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { ProgressRing } from "../../src/ui/ProgressRing";

/** One tap. Not configurable yet — a glass is the unit people think in. */
const GLASS_ML = 250;

/** The two things this component writes, and therefore the two it can report on. */
type TrackedEntry = "water" | "sleep";

/**
 * These figures are the WEEK's, not today's, so the water ring is measured
 * against a week of the daily target. Part-way through the week it therefore
 * reads part-full, which is the honest picture: the week is part-way done.
 */
const DAYS_IN_WEEK = 7;
const SLEEP_STEP_MINUTES = 30;
const DEFAULT_SLEEP_MINUTES = 420;

/** Today as a UTC calendar day, matching what the API stores. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The three tiles, now with the buttons behind them.
 *
 * Steps is gone. There is no Web API for step count, no background sensor access
 * in a PWA, and PRD §5's MVP logging list never included it — a tile that could
 * only ever show a dash until wearable sync lands in v2 is worse than no tile.
 * Sleep takes its place: it is one of the four categories FR-TRK-3 actually
 * computes adherence for, and someone can answer it in one tap.
 *
 * State is optimistic on the numbers and authoritative from the server after:
 * every log re-reads the summary, so a failed write cannot leave a tile showing
 * a total that was never stored.
 */
export function TrackingTiles({
  initial,
  greeting,
  guestChip,
}: {
  initial: TrackingSummary;
  greeting: string;
  guestChip?: string | undefined;
}) {
  const t = useTranslations("tracking");
  const tError = useTranslations("errors");

  const [summary, setSummary] = useState(initial);
  const [sleepMinutes, setSleepMinutes] = useState(DEFAULT_SLEEP_MINUTES);
  // Which entry is being written, not merely that something is. One shared
  // boolean drove every button's working state, so logging water announced
  // itself on "Log last night" as well.
  const [pending, setPending] = useState<TrackedEntry | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  async function send(entry: TrackedEntry, body: Record<string, unknown>): Promise<void> {
    setPending(entry);
    setError(undefined);

    const response = await fetch("/api/tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logged_for: today(), ...body }),
    });

    if (!response.ok) {
      setPending(null);
      setError("TRACKING_FAILED");
      return;
    }

    // Re-read rather than increment locally: the server is the only thing that
    // knows whether this was a new entry or a correction to an existing one.
    const refreshed = await fetch("/api/tracking");
    if (refreshed.ok) {
      const body = (await refreshed.json()) as { summary?: TrackingSummary };
      setSummary({ ...EMPTY_SUMMARY, ...body.summary });
    }
    setPending(null);
  }

  const litres = (summary.water_ml / 1000).toFixed(1);
  const sleepHours =
    summary.sleep_nights === 0
      ? null
      : (summary.sleep_minutes / summary.sleep_nights / 60).toFixed(1);

  const nightlyMinutes =
    summary.sleep_nights === 0 ? 0 : summary.sleep_minutes / summary.sleep_nights;

  return (
    <section className="flex flex-col gap-3">
      {/*
        The greeting lives inside this client component rather than on the
        screen above it because the rings beside it have to move the instant
        something is logged. Splitting them would mean either a server round
        trip before the numbers caught up, or two sources of truth for the same
        three figures.
      */}
      <div className="-mx-5 rounded-3xl bg-emphasis px-5 pt-5 pb-6 text-on-emphasis">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
          {guestChip !== undefined && (
            <span className="rounded-full bg-emphasis-label/15 px-3 py-1 text-sm font-semibold text-emphasis-label">
              {guestChip}
            </span>
          )}
        </div>

        <p className="mt-1 text-sm font-semibold tracking-widest text-emphasis-label uppercase">
          {t("thisWeek")}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <ProgressRing
            label={t("water")}
            value={summary.water_ml}
            target={WATER_TARGET_ML * DAYS_IN_WEEK}
            display={`${litres}L`}
          />
          <ProgressRing
            label={t("sleep")}
            value={nightlyMinutes}
            target={SLEEP_TARGET_MINUTES}
            display={sleepHours === null ? "—" : `${sleepHours}h`}
          />
          <ProgressRing
            label={t("workouts")}
            value={summary.workouts_completed}
            target={summary.workouts_scheduled}
            display={`${summary.workouts_completed}`}
          />
        </div>
      </div>

      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-muted">{t("logWaterLabel")}</p>
            <div className="mt-2">
              <Button
                disabled={pending !== null}
                loading={pending === "water"}
                onClick={() => {
                  void send("water", { type: "water", value: GLASS_ML });
                }}
              >
                {t("addGlass", { ml: GLASS_ML })}
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted">{t("logSleepLabel")}</p>
            <div className="mt-2 flex items-center gap-3">
              <Button
                variant="secondary"
                disabled={pending !== null || sleepMinutes <= SLEEP_STEP_MINUTES}
                onClick={() => {
                  setSleepMinutes(sleepMinutes - SLEEP_STEP_MINUTES);
                }}
              >
                −
              </Button>
              <span className="min-w-16 text-center text-lg font-semibold text-ink">
                {(sleepMinutes / 60).toFixed(1)}h
              </span>
              <Button
                variant="secondary"
                disabled={pending !== null || sleepMinutes >= 960}
                onClick={() => {
                  setSleepMinutes(sleepMinutes + SLEEP_STEP_MINUTES);
                }}
              >
                +
              </Button>
            </div>
            <div className="mt-2">
              <Button
                disabled={pending !== null}
                loading={pending === "sleep"}
                onClick={() => {
                  void send("sleep", { type: "sleep", value: sleepMinutes, rating: null });
                }}
              >
                {t("logSleep")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
