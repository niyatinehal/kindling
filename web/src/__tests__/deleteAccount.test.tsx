import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import messages from "../../messages/en.json";
import { DeleteAccountButton } from "../../app/home/DeleteAccountButton";

const originalFetch = global.fetch;

function renderButton() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeleteAccountButton />
    </NextIntlClientProvider>,
  );
}

const start = () => screen.getByRole("button", { name: messages.home.deleteAccount });
const confirm = () => screen.getByRole("button", { name: messages.home.deleteConfirm });

afterEach(() => {
  global.fetch = originalFetch;
});

describe("deleting an account", () => {
  /*
    One press must never be enough. This is the only irreversible control in
    the app, it sits beside Sign out, and the two are a mis-tap apart on a
    phone held by somebody who is not looking closely.
  */
  it("asks first, and deletes nothing on the first press", () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    renderButton();
    fireEvent.click(start());

    expect(screen.getByText(messages.home.deleteWarning)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can be backed out of", () => {
    renderButton();
    fireEvent.click(start());
    fireEvent.click(screen.getByRole("button", { name: messages.home.deleteCancel }));

    expect(screen.queryByText(messages.home.deleteWarning)).not.toBeInTheDocument();
  });

  it("deletes and leaves once confirmed", async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true, status: 204 } as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    renderButton();
    fireEvent.click(start());
    fireEvent.click(confirm());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/account", { method: "DELETE" });
  });

  // The refusal names the thing to do about it. "Something went wrong" would
  // leave somebody pressing a button that can never work.
  it("explains when a family still needs an admin", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { code: "FAMILY_NEEDS_ADMIN" } }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    renderButton();
    fireEvent.click(start());
    fireEvent.click(confirm());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.FAMILY_NEEDS_ADMIN),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
