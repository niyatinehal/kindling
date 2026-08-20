import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

import messages from "../../messages/en.json";
import { ClaimAccountCard } from "../../app/home/ClaimAccountCard";

const originalFetch = global.fetch;

function renderCard() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ClaimAccountCard />
    </NextIntlClientProvider>,
  );
}

const action = () => screen.getByRole("button", { name: messages.home.claimAction });

function type(contact: string) {
  fireEvent.change(screen.getByLabelText(messages.home.claimLabel), { target: { value: contact } });
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("keeping a guest account", () => {
  it("sends the address to be attached to the session already signed in", async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderCard();
    type("someone@example.com");
    fireEvent.click(action());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: "someone@example.com" }),
      }),
    );
  });

  /*
    The confirmation link is the part people miss, and the reassurance matters
    as much as the instruction: somebody who has logged a week of meals needs
    telling that it is still there while they go and find the email.
  */
  it("says to go and confirm, and that nothing is lost meanwhile", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
    ) as unknown as typeof fetch;

    renderCard();
    type("someone@example.com");
    fireEvent.click(action());

    await waitFor(() => expect(screen.getByText(messages.home.claimSent)).toBeInTheDocument());
  });

  it("tells somebody using an address that already has an account to sign in instead", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { code: "CLAIM_TAKEN" } }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    renderCard();
    type("taken@example.com");
    fireEvent.click(action());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.CLAIM_TAKEN),
    );
  });

  // Nothing to send, nothing to do. Enabled, it posts an empty string and the
  // API answers a validation error nobody needed to see.
  it("cannot be submitted empty", () => {
    renderCard();

    expect(action()).toBeDisabled();
  });
});
