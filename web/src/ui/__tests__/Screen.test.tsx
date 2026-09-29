import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import messages from "../../../messages/en.json";
import { Screen } from "../Screen";

/**
 * The frame now carries the theme toggle, which is a translated client
 * component — so rendering a bare `Screen` no longer works without a message
 * catalogue behind it.
 */
function renderScreen(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Screen", () => {
  it("renders a main landmark", () => {
    renderScreen(<Screen>content</Screen>);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the title as the page heading when given one", () => {
    renderScreen(<Screen title="Sign in">content</Screen>);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("renders no heading when not given one", () => {
    renderScreen(<Screen>content</Screen>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  // The reason it lives here and not on a screen: the landing page and sign-in
  // need it too, and neither has any chrome of its own to hang it off.
  it("carries the theme toggle onto every screen, titled or not", () => {
    renderScreen(<Screen>content</Screen>);

    // Nobody has chosen a theme here, so the default (dark) is showing and the
    // toggle offers the other one.
    expect(screen.getByRole("button", { name: messages.theme.switchToLight })).toBeInTheDocument();
  });
});
