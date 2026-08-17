import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { HomeView } from "../../app/home/HomeView";

function renderView(props: { isGuest?: boolean; hasProfile?: boolean } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeView {...props} />
    </NextIntlClientProvider>,
  );
}

describe("HomeView", () => {
  it("marks a guest session", () => {
    renderView({ isGuest: true });

    expect(screen.getByText(messages.home.guestChip)).toBeInTheDocument();
    expect(screen.getByText(messages.home.guestNote)).toBeInTheDocument();
  });

  it("shows nothing about guests for a normal user", () => {
    renderView();

    expect(screen.queryByText(messages.home.guestChip)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.home.guestNote)).not.toBeInTheDocument();
  });

  // Claiming an account is not built. A button that does nothing is worse
  // than no button, so there must not be one.
  //
  // The screen now always carries exactly one link — the Today card's next step —
  // so "no links at all" no longer expresses this. What still holds, and is what
  // the test is for, is that the only link goes to the journey and never to a
  // claim flow that does not exist.
  it("offers no claim action, because claiming is not built yet", () => {
    renderView({ isGuest: true, hasProfile: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/plan");
  });
});

describe("HomeView shell", () => {
  // Before intake the Today card is the way in, not a status message. This is
  // the screen's only action, so if it stops being a link the journey dead-ends
  // at "Welcome" with nothing to do — which is exactly what it used to do.
  it("invites intake when there is no profile yet", () => {
    renderView();

    expect(screen.getByText(messages.home.todayLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.home.todayNoProfile)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.home.startIntake })).toHaveAttribute(
      "href",
      "/onboarding/profile",
    );
  });

  // Once the profile is saved the card stops asking for it and points at the
  // plan instead. The promise is now keepable — a plan really can be built — so
  // unlike before, the card is allowed to make it.
  it("points at the plan once the profile is saved", () => {
    renderView({ hasProfile: true });

    expect(screen.getByText(messages.home.todayPlanReady)).toBeInTheDocument();
    expect(screen.queryByText(messages.home.todayNoProfile)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.home.viewPlan })).toHaveAttribute(
      "href",
      "/plan",
    );
    expect(screen.queryByRole("link", { name: messages.home.startIntake })).not.toBeInTheDocument();
  });

  it("shows stat tiles with no values", () => {
    renderView();

    expect(screen.getByText(messages.home.stepsLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.home.waterLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.home.workoutsLabel)).toBeInTheDocument();
    expect(screen.getAllByText(messages.home.empty)).toHaveLength(3);
  });

  // The line this whole screen must not cross. There is no tracking endpoint,
  // so any digit here would be fiction rendered as fact.
  it("invents no data", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HomeView />
      </NextIntlClientProvider>,
    );

    expect(container.textContent).not.toMatch(/\d/);
  });
});
