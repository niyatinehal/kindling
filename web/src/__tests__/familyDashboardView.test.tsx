import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { FamilyDashboardView } from "../../app/family/dashboard/FamilyDashboardView";
import type { MemberPanel } from "../family/familyDashboard";
import messages from "../../messages/en.json";

function renderView(members: MemberPanel[] | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FamilyDashboardView members={members} />
    </NextIntlClientProvider>,
  );
}

const sharingEverything: MemberPanel = {
  user_id: "u1",
  display_name: "Sunita",
  role: "adult",
  shared: ["water", "sleep", "workout_detail", "meal_detail"],
  water: { water_ml: 3500 },
  sleep: { sleep_minutes: 840, sleep_nights: 2 },
  workout_detail: { workouts_completed: 4, workouts_scheduled: 6 },
  meal_detail: { meals_logged: 9 },
};

/**
 * A member who shares nothing. The API omits every category rather than sending
 * zeroes, which is the whole point of the contract: absent is not zero.
 */
const sharingNothing: MemberPanel = {
  user_id: "u2",
  display_name: "Arjun",
  role: "child",
  shared: [],
};

describe("family dashboard", () => {
  it("shows each shared measure in the unit it was logged in", () => {
    renderView([sharingEverything]);

    expect(screen.getByText("Sunita")).toBeInTheDocument();
    expect(screen.getByText("3.5L")).toBeInTheDocument();
    expect(screen.getByText("7.0h a night over 2 nights")).toBeInTheDocument();
    expect(screen.getByText("4 of 6 done")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  // The reason the panels are optional rather than nullable. A hidden category
  // drawn as "0L" would accuse someone of drinking nothing all week, and the admin
  // would have no way to tell the difference.
  it("says a private member is private rather than showing them as zero", () => {
    renderView([sharingNothing]);

    expect(screen.getByText(messages.familyDashboard.sharesNothing)).toBeInTheDocument();
    expect(screen.queryByText("0.0L")).not.toBeInTheDocument();
    expect(screen.queryByText(/of 0 done/)).not.toBeInTheDocument();
  });

  // Sharing the summary is a coarser grant than sharing the detail. When both
  // arrive, the meter would restate the numbers already on the card.
  it("shows the adherence meter only when the detail was not shared", () => {
    renderView([
      {
        user_id: "u3",
        display_name: "Ramesh",
        role: "elderly",
        shared: ["adherence_summary"],
        adherence_summary: { workout_adherence: 80, days_logged: 5 },
      },
    ]);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "80");

    renderView([sharingEverything]);
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  // A non-admin reaching the URL is told what the screen is, not bounced to a
  // page that does not explain itself.
  it("explains itself to someone who is not the family admin", () => {
    renderView(null);

    expect(screen.getByText(messages.familyDashboard.notAdmin)).toBeInTheDocument();
    expect(screen.queryByText(messages.familyDashboard.intro)).not.toBeInTheDocument();
  });

  it("offers a way back to the family screen", () => {
    renderView([sharingEverything]);

    expect(screen.getByRole("link", { name: messages.familyDashboard.back })).toHaveAttribute(
      "href",
      "/family",
    );
  });
});

/**
 * The distinction the API goes out of its way to preserve: `workout_adherence`
 * is null when nothing was scheduled, and 0 when scheduled sessions were missed.
 * Collapsing them tells a member with no plan that they failed a plan.
 */
describe("a member who has no plan yet", () => {
  const noPlan: MemberPanel = {
    user_id: "u4",
    display_name: "Kavya",
    role: "adult",
    shared: ["adherence_summary"],
    adherence_summary: { workout_adherence: null, days_logged: 1 },
  };

  it("reports what is known instead of drawing an empty meter", () => {
    renderView([noPlan]);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("No plan yet · logged on 1 day this week")).toBeInTheDocument();
  });

  // "1 days" reads as a bug in the app, so the counts are pluralised.
  it("pluralises the day count", () => {
    renderView([{ ...noPlan, adherence_summary: { workout_adherence: null, days_logged: 3 } }]);

    expect(screen.getByText("No plan yet · logged on 3 days this week")).toBeInTheDocument();
  });

  // The detail panel has the same trap: a plan-less member's "0 of 0 done" is
  // true and useless.
  it("does not report 0 of 0 workouts for a member with no plan", () => {
    renderView([
      {
        user_id: "u5",
        display_name: "Kavya",
        role: "adult",
        shared: ["workout_detail"],
        workout_detail: { workouts_completed: 0, workouts_scheduled: 0 },
      },
    ]);

    expect(screen.getByText(messages.familyDashboard.noPlanScheduled)).toBeInTheDocument();
    expect(screen.queryByText("0 of 0 done")).not.toBeInTheDocument();
  });

  it("still draws a meter for a real ratio, including a genuine zero", () => {
    renderView([{ ...noPlan, adherence_summary: { workout_adherence: 0, days_logged: 2 } }]);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("Based on 2 days logged")).toBeInTheDocument();
  });
});
