import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import messages from "../../messages/en.json";
import { ConsentClient } from "../../app/consent/ConsentClient";

const originalFetch = global.fetch;

/**
 * jsdom has no `Response` constructor, so what `fetch` resolves to here is the
 * part of the interface the page actually touches — `ok` and `.json()`.
 */
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
      <ConsentClient />
    </NextIntlClientProvider>,
  );
}

function submitButton() {
  return screen.getByRole("button", { name: messages.consent.submit });
}

/** Fills in everything the form needs before it will let you submit. */
function complete() {
  fireEvent.change(screen.getByLabelText(messages.consent.nameLabel), {
    target: { value: "Meera" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: messages.consent.healthDataLabel }));
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("consent page", () => {
  // Registration is idempotent in the API, but the form must not be the thing
  // relying on that: a double click on a slow connection posts twice.
  it("posts one registration however many times the button is clicked", () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    renderPage();
    complete();

    fireEvent.click(submitButton());
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();
  });

  it("posts the typed name, the locale and the consent", () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    renderPage();
    complete();

    fireEvent.click(submitButton());

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      display_name: "Meera",
      locale: "en",
      consents: [{ consent_type: "health_data", policy_version: "2026-10-05" }],
    });
  });

  it("re-enables submission after a rejected registration so it can be retried", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(400, { error: { code: "VALIDATION_FAILED" } })),
    ) as unknown as typeof fetch;
    renderPage();
    complete();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.VALIDATION_FAILED);
    });
    expect(submitButton()).toBeEnabled();
  });

  // `fetch` rejecting outright reaches neither the ok nor the error branch.
  // Unhandled, the in-flight state would never clear and the button would stay
  // dead with nothing on screen explaining why.
  it("reports a failed connection instead of stranding the user on a dead button", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error("Failed to fetch")),
    ) as unknown as typeof fetch;
    renderPage();
    complete();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.UPSTREAM_UNAVAILABLE);
    });
    expect(submitButton()).toBeEnabled();
  });

  it("goes home once registration succeeds", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(201, { id: "u1" })),
    ) as unknown as typeof fetch;
    renderPage();
    complete();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/home");
    });
  });
});
