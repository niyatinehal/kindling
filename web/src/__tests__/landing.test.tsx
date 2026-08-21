import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

// The landing page now carries a client island — the guest entry button —
// which calls `useRouter`, and that throws outside a mounted app router.
// Nothing here drives it; this only lets the screen render.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

import messages from "../../messages/en.json";
import LandingPage from "../../app/page";

describe("landing page", () => {
  it("renders its heading from the message catalogue, not a literal", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LandingPage />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("heading", { name: messages.landing.title })).toBeInTheDocument();
  });

  it("fails loudly if a key is missing rather than rendering the key name", () => {
    const withoutTitle = { ...messages, landing: { ...messages.landing, title: undefined } };

    expect(() =>
      render(
        <NextIntlClientProvider
          locale="en"
          messages={withoutTitle as unknown as typeof messages}
          onError={(error) => {
            throw error;
          }}
        >
          <LandingPage />
        </NextIntlClientProvider>,
      ),
    ).toThrow();
  });
});
