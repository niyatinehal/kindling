"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EMPTY_SUMMARY } from "../../src/tracking/summaryTypes";
import type { TrackingSummary } from "../../src/tracking/summaryTypes";
import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";

/** One tap. Not configurable yet — a glass is the unit people think in. */
const GLASS_ML = 250;
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
export function TrackingTiles({ initial }: { initial: TrackingSummary }) {
  const t = useTranslations("tracking");
  const tError = useTranslations("errors");

  const [summary, setSummary] = useState(initial);
  const [sleepMinutes, setSleepMinutes] = useState(DEFAULT_SLEEP_MINUTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function send(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(undefined);

    const response = await fetch("/api/tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logged_for: today(), ...body }),
    });

    if (!response.ok) {
      setBusy(false);
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
    setBusy(false);
  }

  const litres = (summary.water_ml / 1000).toFixed(1);
  const sleepHours =
    summary.sleep_nights === 0
      ? null
      : (summary.sleep_minutes / summary.sleep_nights / 60).toFixed(1);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
        {t("thisWeek")}
      </h2>

      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Tile value={`${litres}L`} label={t("water")} />
        <Tile
          value={sleepHours === null ? "—" : `${sleepHours}h`}
          label={t("sleep")}
          hint={sleepHours === null ? undefined : t("nightly")}
        />
        <Tile
          value={`${summary.workouts_completed}`}
          label={t("workouts")}
          hint={
            summary.workouts_scheduled === 0
              ? undefined
              : t("ofScheduled", { scheduled: summary.workouts_scheduled })
          }
        />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-muted">{t("logWaterLabel")}</p>
            <div className="mt-2">
              <Button
                disabled={busy}
                onClick={() => {
                  void send({ type: "water", value: GLASS_ML });
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
                disabled={busy || sleepMinutes <= SLEEP_STEP_MINUTES}
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
                disabled={busy || sleepMinutes >= 960}
                onClick={() => {
                  setSleepMinutes(sleepMinutes + SLEEP_STEP_MINUTES);
                }}
              >
                +
              </Button>
            </div>
            <div className="mt-2">
              <Button
                disabled={busy}
                onClick={() => {
                  void send({ type: "sleep", value: sleepMinutes, rating: null });
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

function Tile({ value, label, hint }: { value: string; label: string; hint?: string | undefined }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 text-center">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
      {hint !== undefined && <div className="text-[0.65rem] text-muted">{hint}</div>}
    </div>
  );
}
