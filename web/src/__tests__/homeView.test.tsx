import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { EMPTY_SUMMARY } from "../tracking/summaryTypes";
import { HomeView } from "../../app/home/HomeView";

function renderView(props: { isGuest?: boolean; hasProfile?: boolean } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeView summary={EMPTY_SUMMARY} {...props} />
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
  // This has been rewritten each time the screen gained a control, which is the
  // signal that "no buttons" and "no links" were never the real invariant. The
  // real one is that a guest is offered EXACTLY the journey and the tracking
  // controls — and nothing that claims an account, because that flow does not
  // exist. Pinning the whole set means a stray claim button fails this loudly
  // rather than slipping in beside the others.
  it("offers no claim action, because claiming is not built yet", () => {
    renderView({ isGuest: true, hasProfile: true });

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/plan",
      "/meals",
      "/dashboard",
      "/family",
    ]);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      messages.tracking.addGlass.replace("{ml}", "250"),
      "−",
      "+",
      messages.tracking.logSleep,
    ]);
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

  // The tiles now carry real figures, so "no values" and "no digits" no longer
  // describe this screen. What replaced that rule, and still holds, is that every
  // number comes from a log — an empty summary reads as zero, never as an
  // invented total. Steps is gone entirely: nothing could ever fill it.
  it("renders the three trackable categories, and not steps", () => {
    renderView();

    expect(screen.getByText(messages.tracking.water)).toBeInTheDocument();
    expect(screen.getByText(messages.tracking.sleep)).toBeInTheDocument();
    expect(screen.getByText(messages.tracking.workouts)).toBeInTheDocument();
    expect(screen.queryByText(/steps/i)).not.toBeInTheDocument();
  });

  it("shows zero rather than an invented figure when nothing is logged", () => {
    renderView();

    expect(screen.getByText("0.0L")).toBeInTheDocument();
    // Sleep has no nightly average to report yet, so it stays a dash rather than
    // claiming zero hours of sleep.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("offers the buttons that make the numbers move", () => {
    renderView();

    expect(
      screen.getByRole("button", { name: messages.tracking.addGlass.replace("{ml}", "250") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.tracking.logSleep })).toBeInTheDocument();
  });
});
