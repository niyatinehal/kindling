import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../messages/en.json";
import { THEME_COOKIE } from "../../theme/theme";
import { ThemeToggle } from "../ThemeToggle";

function renderToggle() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeToggle />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.cookie = `${THEME_COOKIE}=; max-age=0; path=/`;
});

describe("ThemeToggle", () => {
  // The server has already resolved the theme onto <html>. Reading it back is
  // what keeps the button honest about which way it will switch.
  it("offers the theme you are not currently in", () => {
    document.documentElement.dataset["theme"] = "dark";
    renderToggle();

    expect(screen.getByRole("button", { name: messages.theme.switchToLight })).toBeInTheDocument();
  });

  // No attribute means nobody has chosen, and the app is dark until they do.
  it("treats an unchosen theme as dark", () => {
    renderToggle();

    expect(screen.getByRole("button", { name: messages.theme.switchToLight })).toBeInTheDocument();
  });

  it("switches the document over immediately, without waiting for the server", () => {
    document.documentElement.dataset["theme"] = "light";
    renderToggle();

    fireEvent.click(screen.getByRole("button", { name: messages.theme.switchToDark }));

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  // The cookie is what makes the choice survive a reload, and what lets the
  // server render the right theme in the first byte next time.
  it("remembers the choice in a cookie the server can read", () => {
    document.documentElement.dataset["theme"] = "light";
    renderToggle();

    fireEvent.click(screen.getByRole("button", { name: messages.theme.switchToDark }));

    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  });

  it("switches back again", () => {
    document.documentElement.dataset["theme"] = "light";
    renderToggle();

    fireEvent.click(screen.getByRole("button", { name: messages.theme.switchToDark }));
    fireEvent.click(screen.getByRole("button", { name: messages.theme.switchToLight }));

    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(document.cookie).toContain(`${THEME_COOKIE}=light`);
  });
});
