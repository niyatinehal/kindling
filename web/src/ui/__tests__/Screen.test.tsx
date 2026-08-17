import { render, screen } from "@testing-library/react";

import { Screen } from "../Screen";

describe("Screen", () => {
  it("renders a main landmark", () => {
    render(<Screen>content</Screen>);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the title as the page heading when given one", () => {
    render(<Screen title="Sign in">content</Screen>);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("renders no heading when not given one", () => {
    render(<Screen>content</Screen>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
