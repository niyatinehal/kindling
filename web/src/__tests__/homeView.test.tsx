import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

// HomeView now contains a client island that calls `useRouter`, which throws
// outside a mounted app router. Nothing here drives it — this only lets the
// screen render.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

import messages from "../../messages/en.json";
import { EMPTY_SUMMARY } from "../tracking/summaryTypes";
import { HomeView } from "../../app/home/HomeView";

function renderView(
  props: { isGuest?: boolean; hasProfile?: boolean; inFamily?: boolean | null } = {},
) {
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
    expect(screen.getByText(messages.home.claimBody)).toBeInTheDocument();
  });

  it("shows nothing about guests for a normal user", () => {
    renderView();

    expect(screen.queryByText(messages.home.guestChip)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.home.claimBody)).not.toBeInTheDocument();
  });

  // Claiming IS built now, so the invariant this test has carried since the
  // beginning has flipped rather than gone away. What it pins is the same
  // thing it always pinned: the complete set of controls a guest is offered,
  // so that anything new has to be added here deliberately instead of
  // appearing beside the others unnoticed.
  //
  // The claim action earns its place because it does something — for as long
  // as it did not exist, a button offering it would have been a lie, which is
  // what the previous version of this test was protecting against.
  it("offers a guest the whole journey and a way to keep the account", () => {
    renderView({ isGuest: true, hasProfile: true });

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/plan",
      "/meals",
      "/dashboard",
      "/family",
    ]);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      // The frame's theme toggle, which every screen now carries. Labelled by
      // `aria-label`, so its textContent is the glyph.
      "☾",
      messages.tracking.addGlass.replace("{ml}", "250"),
      "−",
      "+",
      messages.tracking.logSleep,
      // The way out of guest mode, which is the one control a guest is
      // offered that a signed-in user is not.
      messages.home.claimAction,
      // Signing out is a session control, not an account action: it ends the
      // anonymous session rather than claiming or upgrading it, so a guest is
      // offered it on the same terms as anyone else.
      messages.home.signOut,
      // Deleting is the same kind of control for the same reason — it disposes
      // of the account rather than claiming one, and a guest who wants their
      // health data gone must be able to say so as plainly as anyone else.
      messages.home.deleteAccount,
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

describe("logging in flight", () => {
  // Same shared-flag problem as the family screen: logging water spun the
  // "Log sleep" button, which reads as sleep being saved.
  it("shows the working state only on the entry that was logged", () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;

    renderView();
    const water = screen.getByRole("button", {
      name: messages.tracking.addGlass.replace("{ml}", "250"),
    });
    fireEvent.click(water);

    expect(water).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: messages.tracking.logSleep })).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});

describe("the family card", () => {
  /*
    This card used to render "You're not in a family yet." as a hardcoded
    string, on a screen that never asked. It said that to everyone — including
    families who had already set one up on the very screen it was offering to
    take them to.
  */
  it("says nothing about membership to someone who has a family", () => {
    renderView({ inFamily: true });

    expect(screen.queryByText(messages.home.noFamily)).not.toBeInTheDocument();
    expect(screen.getByText(messages.home.inFamily)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.home.viewFamily })).toHaveAttribute(
      "href",
      "/family",
    );
  });

  it("offers to set one up when there is none", () => {
    renderView({ inFamily: false });

    expect(screen.getByText(messages.home.noFamily)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.home.setUpFamily })).toHaveAttribute(
      "href",
      "/family",
    );
  });

  // The failure mode the three-state answer exists for: an API that blinked
  // must not produce a confident sentence about a family it never looked up.
  // The way in stays; the claim does not.
  it("claims nothing either way when it could not find out", () => {
    renderView({ inFamily: null });

    expect(screen.queryByText(messages.home.noFamily)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.home.inFamily)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.home.openFamily })).toHaveAttribute(
      "href",
      "/family",
    );
  });
});
