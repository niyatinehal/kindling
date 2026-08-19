import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import messages from "../../messages/en.json";
import SignInPage from "../../app/signin/page";

const originalFetch = global.fetch;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SignInPage />
    </NextIntlClientProvider>,
  );
}

function guestButton() {
  return screen.getByRole("button", { name: messages.signin.guest });
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("continue as a guest", () => {
  // The whole design in one assertion: a guest goes through the SAME 403
  // REGISTRATION_REQUIRED seam as everyone else, so nextStep needs no branch.
  it("signs in and routes to consent through the registration seam", async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input) === "/api/auth/guest"
          ? response(200, { authenticated: true })
          : response(403, { error: { code: "REGISTRATION_REQUIRED" } }),
      ),
    ) as unknown as typeof fetch;

    renderPage();
    fireEvent.click(guestButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/consent"));
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/guest", { method: "POST" });
  });

  it("sends an already-registered guest straight home", async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input) === "/api/auth/guest"
          ? response(200, { authenticated: true })
          : response(200, { id: "u1", display_name: "Guest", family: null }),
      ),
    ) as unknown as typeof fetch;

    renderPage();
    fireEvent.click(guestButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/home"));
  });

  it("shows an error and does not route when the guest session cannot start", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(502, { error: { code: "GUEST_SIGNIN_FAILED" } })),
    ) as unknown as typeof fetch;

    renderPage();
    fireEvent.click(guestButton());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.GUEST_SIGNIN_FAILED),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("sign-in actions in flight", () => {
  /** A request that never settles, so the click below lands mid-flight. */
  function pendingFetch() {
    const mock = jest.fn(() => new Promise<Response>(() => {}));
    global.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  // An OTP is a text message with a cost and an expiry. Pressing twice used to
  // send two, and the second invalidated the code the first one delivered.
  it("sends one code however many times the button is pressed", () => {
    const fetchMock = pendingFetch();

    renderPage();
    const send = screen.getByRole("button", { name: messages.signin.sendCode });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(send).toHaveAttribute("aria-busy", "true");
  });

  it("signs in one guest however many times the button is pressed", () => {
    const fetchMock = pendingFetch();

    renderPage();
    fireEvent.click(guestButton());
    fireEvent.click(guestButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
