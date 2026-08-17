import { render, screen } from "@testing-library/react";

import { LinkButton } from "../LinkButton";

describe("LinkButton", () => {
  // The whole reason this exists rather than reusing Button: it must be a
  // link, because it navigates. The landing test finds it with getByRole("link").
  it("is a link, not a button", () => {
    render(<LinkButton href="/signin">Sign in</LinkButton>);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("meets the minimum touch target on every variant", () => {
    const { rerender } = render(<LinkButton href="/x">Go</LinkButton>);
    for (const variant of ["primary", "secondary"] as const) {
      rerender(
        <LinkButton href="/x" variant={variant}>
          Go
        </LinkButton>,
      );
      expect(screen.getByRole("link", { name: "Go" }).className).toContain("min-h-12");
    }
  });

  it("never puts white text on the bright accent", () => {
    const { rerender } = render(<LinkButton href="/x">Go</LinkButton>);
    for (const variant of ["primary", "secondary"] as const) {
      rerender(
        <LinkButton href="/x" variant={variant}>
          Go
        </LinkButton>,
      );
      expect(screen.getByRole("link", { name: "Go" }).className).not.toContain("bg-accent-bright");
    }
  });
});
