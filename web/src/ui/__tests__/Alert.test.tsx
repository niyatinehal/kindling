import { render, screen } from "@testing-library/react";

import { Alert } from "../Alert";

describe("Alert", () => {
  // Every existing screen finds its error with getByRole("alert"). Keeping the
  // role in the primitive is what stops a future screen from forgetting it.
  it("is announced as an alert", () => {
    render(<Alert>Something went wrong</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });
});
