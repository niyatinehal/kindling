import { render, screen } from "@testing-library/react";

import { WeekStrip } from "../WeekStrip";

const week = [
  { date: "2026-08-13", value: 2000 },
  { date: "2026-08-14", value: 1000 },
  { date: "2026-08-15", value: 0 },
];

describe("WeekStrip", () => {
  it("draws one column per day it was given", () => {
    const { container } = render(<WeekStrip days={week} target={2000} label="Water this week" />);

    expect(container.querySelectorAll("[data-day]")).toHaveLength(3);
    expect(screen.getByText("Water this week")).toBeInTheDocument();
  });

  // Nothing logged is not the same as a zero-height bar sitting on the axis —
  // one says "no water that day", the other says "we have no record". The empty
  // track is the honest rendering of the second.
  it("leaves a day with nothing logged unfilled", () => {
    const { container } = render(<WeekStrip days={week} target={2000} label="Water this week" />);
    const columns = container.querySelectorAll("[data-day]");

    expect(columns[2]?.querySelector("[data-fill]")).toBeNull();
    expect(columns[0]?.querySelector("[data-fill]")).not.toBeNull();
  });

  it("scales each column against the target", () => {
    const { container } = render(<WeekStrip days={week} target={2000} label="Water this week" />);
    const columns = container.querySelectorAll("[data-day]");

    expect(columns[1]?.querySelector("[data-fill]")?.getAttribute("data-fill")).toBe("0.5");
  });

  it("says so rather than drawing an empty frame when there is no week yet", () => {
    render(
      <WeekStrip days={[]} target={2000} label="Water this week" empty="Nothing logged yet" />,
    );

    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
  });
});
