import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { PlanClient } from "../../app/plan/PlanClient";
import type { PlanView } from "../plan/planTypes";

const originalFetch = global.fetch;

/** jsdom has no `Response` constructor — same shim the other suites use. */
function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const plan: PlanView = {
  id: "plan-1",
  generator: "rules@1",
  created_at: "2026-08-17T00:00:00.000Z",
  profile_snapshot: { applied_exclusions: ["knee", "arthritis"] },
  days: [
    {
      day_of_week: 1,
      exercises: [
        {
          id: "pe-1",
          exercise_key: "band_row",
          sets: 2,
          reps: 12,
          duration_seconds: null,
          rest_seconds: 60,
        },
        {
          id: "pe-2",
          exercise_key: "plank",
          sets: null,
          reps: null,
          duration_seconds: 40,
          rest_seconds: 60,
        },
      ],
    },
  ],
};

function renderPlan(props: Partial<Parameters<typeof PlanClient>[0]> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlanClient initialPlan={null} hasProfile {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("plan screen", () => {
  it("asks for intake first when there is no profile, and offers no build button", () => {
    renderPlan({ hasProfile: false });

    expect(screen.getByText(messages.plan.noProfile)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.plan.goToProfile })).toHaveAttribute(
      "href",
      "/onboarding/profile",
    );
    expect(screen.queryByRole("button", { name: messages.plan.generate })).not.toBeInTheDocument();
  });

  it("offers to build a plan when the profile is there but no plan is", () => {
    renderPlan();

    expect(screen.getByText(messages.plan.empty)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.plan.generate })).toBeEnabled();
  });

  it("renders a plan it was given, translating exercise keys and doses", () => {
    renderPlan({ initialPlan: plan });

    expect(screen.getByText(messages.plan.exercises.band_row)).toBeInTheDocument();
    expect(screen.getByText(messages.plan.exercises.plank)).toBeInTheDocument();
    // 2 × 12 for the rep movement, 40s for the timed one.
    expect(screen.getByText(/2 × 12/)).toBeInTheDocument();
    expect(screen.getByText(/40s/)).toBeInTheDocument();
  });

  // Every day of the week is shown, so a rest day reads as intentional rather
  // than as a plan that forgot Tuesday.
  it("names the untrained days as rest rather than hiding them", () => {
    renderPlan({ initialPlan: plan });

    expect(screen.getByText(messages.plan.days["1"])).toBeInTheDocument();
    expect(screen.getByText(messages.plan.days["2"])).toBeInTheDocument();
    expect(screen.getAllByText(messages.plan.restLabel)).toHaveLength(6);
  });

  // PRD §10.2's rationale, and it is rendered from what the generator actually
  // excluded — so it can never claim a reason that changed nothing.
  it("explains which declared flags shaped the plan", () => {
    renderPlan({ initialPlan: plan });

    expect(screen.getByText(messages.plan.whyTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.plan.reasons.knee)).toBeInTheDocument();
    expect(screen.getByText(messages.plan.reasons.arthritis)).toBeInTheDocument();
  });

  // FR-WRK-3: the disclaimer belongs wherever a conditions-aware plan is shown.
  it("carries the not-medical-advice disclaimer alongside a plan", () => {
    renderPlan({ initialPlan: plan });

    expect(screen.getByText(messages.plan.disclaimer)).toBeInTheDocument();
  });

  it("builds a plan and renders what came back", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(201, { plan })),
    ) as unknown as typeof fetch;

    renderPlan();
    fireEvent.click(screen.getByRole("button", { name: messages.plan.generate }));

    await waitFor(() => {
      expect(screen.getByText(messages.plan.exercises.band_row)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/plan", { method: "POST" });
    // Once a plan exists, rebuilding goes through the details rather than
    // re-running the same deterministic engine on the same inputs — so it is a
    // link to the editor, not a button that would return the identical plan.
    expect(screen.getByRole("link", { name: messages.plan.regenerate })).toHaveAttribute(
      "href",
      "/onboarding/profile?next=plan",
    );
    expect(screen.queryByRole("button", { name: messages.plan.generate })).not.toBeInTheDocument();
  });

  // A 403 here is the intake seam, not a fault, and saying so is the difference
  // between a dead end and a next step.
  it("reports the intake seam specifically when the API says a profile is required", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(403, { error: { code: "PROFILE_REQUIRED" } })),
    ) as unknown as typeof fetch;

    renderPlan();
    fireEvent.click(screen.getByRole("button", { name: messages.plan.generate }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.PROFILE_REQUIRED);
    });
  });

  it("reports a generic failure when the build genuinely breaks", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(502, { error: { code: "UPSTREAM_UNAVAILABLE" } })),
    ) as unknown as typeof fetch;

    renderPlan();
    fireEvent.click(screen.getByRole("button", { name: messages.plan.generate }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.PLAN_GENERATE_FAILED);
    });
    // The button comes back, so a transient failure is recoverable in place.
    expect(screen.getByRole("button", { name: messages.plan.generate })).toBeEnabled();
  });
});
