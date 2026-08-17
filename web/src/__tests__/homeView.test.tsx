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
  // Rendered with a profile already saved on purpose: the intake CTA is the one
  // link this screen ever shows, and it is not a claim action. Asserting "no
  // links at all" only says something about claiming in the state where that
  // CTA is absent.
  it("offers no claim action, because claiming is not built yet", () => {
    renderView({ isGuest: true, hasProfile: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
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

  // And once it is saved it must not keep asking, nor claim a plan is coming:
  // nothing generates one yet.
  it("reports a saved profile without re-inviting or promising a plan", () => {
    renderView({ hasProfile: true });

    expect(screen.getByText(messages.home.todayProfileSet)).toBeInTheDocument();
    expect(screen.queryByText(messages.home.todayNoProfile)).not.toBeInTheDocument();
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
