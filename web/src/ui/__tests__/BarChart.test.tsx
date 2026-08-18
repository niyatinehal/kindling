import { render } from "@testing-library/react";

import { BarChart } from "../BarChart";

const week = [
  { label: "M", value: 500, title: "Mon: 0.5L" },
  { label: "T", value: 0, title: "Tue: nothing logged" },
  { label: "W", value: 2500, title: "Wed: 2.5L" },
  { label: "T", value: 1000, title: "Thu: 1.0L", isToday: true },
];

const svg = (container: HTMLElement): SVGSVGElement => {
  const found = container.querySelector("svg");
  if (found === null) {
    throw new Error("no chart rendered");
  }
  return found as SVGSVGElement;
};

describe("BarChart", () => {
  // One series is one colour. A value ramp across nominal days would encode
  // height twice and leave nothing for a second series to say.
  it("gives every column the same fill", () => {
    const { container } = render(<BarChart data={week} />);

    const fills = [...container.querySelectorAll("path")].map((path) => path.getAttribute("fill"));

    expect(fills).toEqual(["var(--color-accent)", "var(--color-accent)", "var(--color-accent)"]);
  });

  // A day with nothing logged is still a day. Dropping it would compress the
  // week and make four logged days look like a full one.
  it("keeps an empty day in the axis and gives it a hover target", () => {
    const { container } = render(<BarChart data={week} />);

    expect([...container.querySelectorAll("text")].map((node) => node.textContent)).toContain("M");
    const empty = container.querySelector("rect");
    expect(empty).not.toBeNull();
    expect(empty?.querySelector("title")?.textContent).toBe("Tue: nothing logged");
  });

  // Two labels, not seven: the extreme and where the reader is standing.
  it("labels only the week's peak and today", () => {
    const { container } = render(<BarChart data={week} formatValue={(value) => `${value}ml`} />);

    const valueLabels = [...container.querySelectorAll("text")]
      .map((node) => node.textContent)
      .filter((text) => text?.endsWith("ml"));

    expect(valueLabels).toEqual(["2500ml", "1000ml"]);
  });

  // The goal line is part of the scale, not drawn over it — a target above every
  // bar would otherwise be clipped off the top and silently disappear.
  it("keeps a target line inside the plot when it exceeds every value", () => {
    const { container } = render(
      <BarChart data={[{ label: "M", value: 250, title: "Mon" }]} target={2000} />,
    );

    const line = container.querySelector("line");
    expect(Number(line?.getAttribute("y1"))).toBeGreaterThanOrEqual(0);
    expect(line?.getAttribute("stroke")).toBe("var(--color-accent-glow)");
  });

  // A week of nothing still has to render. The axis is arbitrary at that point,
  // so it renders flat rather than dividing by a zero peak.
  it("renders a week of zeroes without a division by zero", () => {
    const { container } = render(
      <BarChart data={[{ label: "M", value: 0, title: "Mon: nothing logged" }]} />,
    );

    expect(svg(container)).toBeInTheDocument();
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
});
