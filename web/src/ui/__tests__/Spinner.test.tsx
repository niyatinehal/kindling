import { render } from "@testing-library/react";

import { Spinner } from "../Spinner";

describe("Spinner", () => {
  // The button it sits in already says "Building…" or is disabled. A second
  // announcement of the same fact is noise in a screen reader, so the ring is
  // decoration and must say so.
  it("stays out of the accessibility tree", () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  // Same reasoning as ProgressRing: a spinner that names its own colour only
  // suits the one variant it was drawn against. On `secondary` and `ghost` the
  // label is `text-ink`/`text-accent`, not `text-surface`.
  it("takes its colour from the text around it", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("circle")).toHaveAttribute("stroke", "currentColor");
  });
});
