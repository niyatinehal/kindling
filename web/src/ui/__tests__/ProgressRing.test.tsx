import { render, screen } from "@testing-library/react";

import { ProgressRing } from "../ProgressRing";

describe("ProgressRing", () => {
  it("shows the figure it was given, formatted by the caller", () => {
    render(<ProgressRing label="Water" value={1500} target={2000} display="1.5L" />);

    expect(screen.getByText("1.5L")).toBeInTheDocument();
    expect(screen.getByText("Water")).toBeInTheDocument();
  });

  // The ring is a proportion, so it needs a denominator. Without one it draws
  // the track and nothing else — the alternative is inventing a target to make
  // the picture look complete, which is the one thing this screen must not do.
  it("draws no fill when there is no target to measure against", () => {
    const { container } = render(
      <ProgressRing label="Workouts" value={3} target={0} display="3" />,
    );

    expect(container.querySelector("[data-fill]")).toBeNull();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("draws a fill proportional to the target", () => {
    const { container } = render(
      <ProgressRing label="Water" value={1000} target={2000} display="1.0L" />,
    );

    expect(container.querySelector("[data-fill]")?.getAttribute("data-fill")).toBe("0.5");
  });

  // Logging more than the target is a good day, not a rendering bug.
  it("stops the fill at full rather than overshooting the circle", () => {
    const { container } = render(
      <ProgressRing label="Water" value={9000} target={2000} display="9.0L" />,
    );

    expect(container.querySelector("[data-fill]")?.getAttribute("data-fill")).toBe("1");
  });

  // The number is already on screen as text; announcing the geometry twice
  // would just make a screen reader read the same thing again.
  it("hides the drawing from assistive technology", () => {
    const { container } = render(
      <ProgressRing label="Water" value={1000} target={2000} display="1.0L" />,
    );

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
