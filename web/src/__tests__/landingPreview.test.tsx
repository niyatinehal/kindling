import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }));

import messages from "../../messages/en.json";
import LandingPage from "../../app/page";

const originalFetch = global.fetch;

function renderLanding() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LandingPage />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("the landing page", () => {
  /*
    It used to be a title, one line and a Sign in button — a login wall with a
    headline. Somebody arriving from a link gives it seconds, and everything
    worth seeing was on the other side of an account.
  */
  it("shows what the app looks like before asking for anything", () => {
    renderLanding();

    expect(screen.getByText(messages.landing.previewLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.landing.water)).toBeInTheDocument();
    expect(screen.getByText(messages.landing.workouts)).toBeInTheDocument();
  });

  /*
    The numbers in that preview are invented, and this app's rule everywhere
    else is that no figure appears unless somebody logged it. The label is what
    keeps the preview from being the one screen that breaks that rule.
  */
  it("says plainly that the preview is not somebody's real data", () => {
    renderLanding();

    expect(screen.getByText(messages.landing.previewLabel)).toBeInTheDocument();
  });

  it("says what the app actually does", () => {
    renderLanding();

    expect(screen.getByText(messages.landing.planTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.landing.mealsTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.landing.familyTitle)).toBeInTheDocument();
  });

  // Guest mode already existed and was buried one screen deep, behind the
  // sign-in form it exists to avoid.
  it("offers a way in that needs no account", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ authenticated: true }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: messages.landing.tryGuest }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/guest", { method: "POST" });
  });

  it("still offers sign-in, and links to the privacy page", () => {
    renderLanding();

    expect(screen.getByRole("link", { name: messages.landing.signIn })).toHaveAttribute(
      "href",
      "/signin",
    );
    expect(screen.getByRole("link", { name: messages.landing.privacy })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});
