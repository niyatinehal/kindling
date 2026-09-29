import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { DashboardView } from "../../app/dashboard/DashboardView";
import messages from "../../messages/en.json";
import { EMPTY_SUMMARY } from "../tracking/summaryTypes";
import type { TrackingSummary } from "../tracking/summaryTypes";

function renderDashboard(summary: TrackingSummary) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardView summary={summary} />
    </NextIntlClientProvider>,
  );
}

const day = (date: string, over: Partial<TrackingSummary["days"][number]> = {}) => ({
  date,
  water_ml: 0,
  sleep_minutes: 0,
  workouts_completed: 0,
  meals_logged: 0,
  ...over,
});

const week: TrackingSummary = {
  ...EMPTY_SUMMARY,
  water_ml: 4500,
  sleep_minutes: 900,
  sleep_nights: 2,
  workouts_completed: 3,
  workouts_scheduled: 6,
  workout_adherence: 50,
  days: [
    day("2026-08-12", { water_ml: 2000, sleep_minutes: 420 }),
    day("2026-08-13"),
    day("2026-08-14", { water_ml: 2500, sleep_minutes: 480, workouts_completed: 3 }),
    day("2026-08-15", { meals_logged: 2 }),
  ],
};

describe("dashboard", () => {
  it("shows the week's headline figures in their own units", () => {
    renderDashboard(week);

    expect(screen.getByText("4.5L")).toBeInTheDocument();
    // Nightly average over the nights actually slept, not over seven days — a
    // week with two logged nights did not average three and a half hours.
    expect(screen.getByText("7.5h")).toBeInTheDocument();
    // Scoped to the tile: a bare "3" also appears as a chart's peak label, and
    // matching either would let the tile break without the test noticing.
    expect(screen.getByText(messages.dashboard.workoutsDone).previousSibling).toHaveTextContent(
      "3",
    );
  });

  // Four plots, one per unit. Litres, hours and counts on one pair of axes would
  // need a second y-scale whose alignment is arbitrary.
  it("draws each measure as its own chart rather than combining units", () => {
    const { container } = renderDashboard(week);

    expect(screen.getByText(messages.dashboard.waterChart)).toBeInTheDocument();
    expect(screen.getByText(messages.dashboard.sleepChart)).toBeInTheDocument();
    expect(screen.getByText(messages.dashboard.workoutChart)).toBeInTheDocument();
    expect(screen.getByText(messages.dashboard.mealChart)).toBeInTheDocument();
    // Charts only: the frame's icons are SVGs too, but decorative and unlabelled.
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(4);
  });

  it("measures adherence against what was actually scheduled", () => {
    renderDashboard(week);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  // No plan means nothing was scheduled, so there is no ratio to show. A meter
  // reading 0% would blame someone for missing sessions that never existed.
  it("omits the adherence meter when nothing was scheduled", () => {
    renderDashboard({ ...week, workouts_scheduled: 0, workout_adherence: null });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  // The series is ALWAYS seven dense days, so emptiness has to be read from the
  // totals. Keying the message off `days.length` made it unreachable in the real
  // app while this test still passed against a hand-made empty array.
  it("says so plainly before anything has been logged, with a full week of days", () => {
    renderDashboard({
      ...EMPTY_SUMMARY,
      days: ["2026-08-12", "2026-08-13", "2026-08-14"].map((date) => day(date)),
    });

    expect(screen.getByText(messages.dashboard.empty)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("drops the empty message as soon as anything is logged", () => {
    renderDashboard(week);

    expect(screen.queryByText(messages.dashboard.empty)).not.toBeInTheDocument();
  });

  it("offers a way back", () => {
    renderDashboard(week);

    // The arrow is aria-hidden, so the accessible name is the words alone.
    expect(screen.getByRole("link", { name: messages.dashboard.back })).toHaveAttribute(
      "href",
      "/home",
    );
  });
});
