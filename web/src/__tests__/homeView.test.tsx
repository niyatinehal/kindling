import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { HomeView } from "../../app/home/HomeView";

function renderView(props: { isGuest?: boolean } = {}) {
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
  it("offers no claim action, because claiming is not built yet", () => {
    renderView({ isGuest: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("HomeView shell", () => {
  it("shows the today card in its empty state", () => {
    renderView();

    expect(screen.getByText(messages.home.todayLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.home.todayEmpty)).toBeInTheDocument();
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
