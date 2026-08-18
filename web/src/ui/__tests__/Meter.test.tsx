import { render, screen } from "@testing-library/react";

import { Meter } from "../Meter";

describe("Meter", () => {
  // The ratio, not the raw count, because callers arrive with both shapes — 3 of
  // 5 sessions here, an already-computed adherence percentage on the family
  // screen — and a single scale means one announcement for both.
  it("reports its ratio to assistive technology, not just visually", () => {
    render(<Meter value={3} max={5} label="Workouts" caption="3 of 5" />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "60");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-label", "Workouts");
    expect(screen.getByText("3 of 5")).toBeInTheDocument();
  });

  // Doing more than was scheduled is real and good news. A fill spilling past its
  // track reads as a rendering bug instead.
  it("clamps a value above its maximum rather than overflowing the track", () => {
    const { container } = render(<Meter value={9} max={5} label="Workouts" caption="9 of 5" />);

    const fill = container.querySelector("[style*='width']");
    expect(fill?.getAttribute("style")).toContain("100%");
  });

  // Nothing scheduled means the ratio has no denominator; it must not be NaN%.
  it("renders empty when there is nothing to measure against", () => {
    const { container } = render(<Meter value={0} max={0} label="Workouts" caption="none" />);

    const fill = container.querySelector("[style*='width']");
    expect(fill?.getAttribute("style")).toContain("0%");
  });
});
