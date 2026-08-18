import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import messages from "../../messages/en.json";
import { EMPTY_SUMMARY } from "../tracking/summaryTypes";
import { HomeView } from "../../app/home/HomeView";

const originalFetch = global.fetch;

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeView summary={EMPTY_SUMMARY} />
    </NextIntlClientProvider>,
  );
}

function signOutButton() {
  return screen.getByRole("button", { name: messages.home.signOut });
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("signing out", () => {
  // POST, not a link: the session is state, and a GET would let a prefetch or a
  // crawler anywhere on the origin end it.
  it("asks the server to end the session", async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true } as Response));
    global.fetch = fetchMock;

    renderView();
    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    });
  });

  // The landing page, not /signin: signing out and being handed a sign-in form
  // reads as "that failed, try again" rather than "you are out".
  it("returns to the landing page once the session is gone", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true } as Response));

    renderView();
    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  // Next keeps server-rendered payloads in its client Router Cache, and a plain
  // push does not invalidate them — so Back, or any return to a cached route,
  // could re-render a signed-in screen from before the cookie was cleared.
  it("invalidates the cached signed-in pages it leaves behind", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true } as Response));

    renderView();
    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  // Staying put is the honest outcome: the cookie is still valid, so navigating
  // away would show a signed-in app to someone who believes they left.
  it("stays put when the server could not end the session", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 502 } as Response));

    renderView();
    fireEvent.click(signOutButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
