import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { Wizard } from "../../app/onboarding/profile/Wizard";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (destination: string) => push(destination) }),
}));

function renderWizard() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Wizard />
    </NextIntlClientProvider>,
  );
}

const next = () => screen.getByRole("button", { name: messages.onboarding.next });
const finish = () => screen.getByRole("button", { name: messages.onboarding.finish });

/** Fills step 1 and moves on. */
function completeAbout(birthYear = "1963") {
  fireEvent.change(screen.getByLabelText(messages.onboarding.labels.birthYear), {
    target: { value: birthYear },
  });
  fireEvent.click(next());
}

/** Walks from step 2 to the last step, choosing the minimum each step needs. */
function completeGoalAndSpace() {
  fireEvent.click(screen.getByLabelText(messages.onboarding.goal.general_fitness));
  fireEvent.click(screen.getByLabelText(messages.onboarding.level.beginner));
  fireEvent.click(next());
  fireEvent.click(screen.getByLabelText(messages.onboarding.space.small_room));
  fireEvent.click(screen.getByLabelText(messages.onboarding.equipment.resistance_band));
  fireEvent.click(next());
}

const originalFetch = global.fetch;

/**
 * Same shape as `signinGuest.test.tsx` uses, and for the same reason: jsdom has
 * no `Response` constructor, so a real one cannot be built here.
 */
function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  sessionStorage.clear();
  push.mockClear();
  global.fetch = jest.fn(() =>
    Promise.resolve(response(200, { profile: {} })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("intake wizard", () => {
  it("starts on the first step and cannot advance without a birth year", () => {
    renderWizard();

    expect(screen.getByText(/About you/)).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  // The whole point of asking for a year rather than an age: a year that has not
  // happened yet would produce a negative age downstream.
  it("refuses a birth year in the future", () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText(messages.onboarding.labels.birthYear), {
      target: { value: String(new Date().getUTCFullYear() + 1) },
    });

    expect(next()).toBeDisabled();
  });

  it("advances once a valid birth year is entered", () => {
    renderWizard();
    completeAbout();

    expect(screen.getByText(messages.onboarding.labels.goal)).toBeInTheDocument();
  });

  // `equipment` is the one list the API refuses to accept empty, so the form
  // must not let someone walk past it without answering.
  it("will not leave the equipment step unanswered", () => {
    renderWizard();
    completeAbout();
    fireEvent.click(screen.getByLabelText(messages.onboarding.goal.fat_loss));
    fireEvent.click(screen.getByLabelText(messages.onboarding.level.beginner));
    fireEvent.click(next());

    fireEvent.click(screen.getByLabelText(messages.onboarding.space.small_room));
    expect(next()).toBeDisabled();

    fireEvent.click(screen.getByLabelText(messages.onboarding.equipment.none));
    expect(next()).toBeEnabled();
  });

  it("carries the answers into one PUT and then goes home", async () => {
    renderWizard();
    completeAbout();
    completeGoalAndSpace();

    fireEvent.click(screen.getByLabelText(messages.onboarding.condition.arthritis));
    fireEvent.click(next());
    fireEvent.click(screen.getByLabelText(messages.onboarding.dietary.vegetarian));
    fireEvent.click(finish());

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/home");
    });

    const call = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(call[0]).toBe("/api/profile");
    expect(call[1].method).toBe("PUT");
    expect(JSON.parse(call[1].body)).toMatchObject({
      birth_year: 1963,
      goal: "general_fitness",
      level: "beginner",
      space: "small_room",
      equipment: ["resistance_band"],
      conditions: ["arthritis"],
      dietary: ["vegetarian"],
      // Never asked for, so it must go up as null rather than 0 or "".
      height_cm: null,
      weight_kg: null,
    });
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  // The health step is where conditions are collected, so FR-WRK-3's
  // disclaimer has to be visible there and not deferred to a plan screen.
  it("shows the not-medical-advice disclaimer on the health step", () => {
    renderWizard();
    completeAbout();
    completeGoalAndSpace();

    expect(screen.getByText(messages.onboarding.disclaimer)).toBeInTheDocument();
  });

  it("keeps the answers and reports the failure when saving fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(502, { error: { code: "UPSTREAM_UNAVAILABLE" } })),
    ) as unknown as typeof fetch;

    renderWizard();
    completeAbout();
    completeGoalAndSpace();
    fireEvent.click(next());
    fireEvent.click(finish());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.PROFILE_SAVE_FAILED);
    });
    expect(push).not.toHaveBeenCalled();
    // Recoverable: a failed save must not throw the answers away.
    expect(sessionStorage.getItem("wellness.profile.draft")).not.toBeNull();
  });

  it("restores an abandoned draft rather than starting over", () => {
    sessionStorage.setItem(
      "wellness.profile.draft",
      JSON.stringify({ birthYear: "1996", goal: ["strength"] }),
    );

    renderWizard();

    expect(screen.getByLabelText(messages.onboarding.labels.birthYear)).toHaveValue("1996");
    expect(next()).toBeEnabled();
  });

  // A draft written by an earlier version of this form has keys the current one
  // expects to be arrays. Rendering must not crash on the missing ones.
  it("survives a draft that is missing keys", () => {
    sessionStorage.setItem("wellness.profile.draft", JSON.stringify({ birthYear: "1990" }));

    expect(() => {
      renderWizard();
    }).not.toThrow();
  });

  it("goes back to the previous step without losing what was entered", () => {
    renderWizard();
    completeAbout("1990");

    fireEvent.click(screen.getByRole("button", { name: messages.onboarding.back }));

    expect(screen.getByLabelText(messages.onboarding.labels.birthYear)).toHaveValue("1990");
  });
});
