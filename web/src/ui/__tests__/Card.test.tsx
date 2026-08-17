import { render, screen } from "@testing-library/react";

import { Card } from "../Card";

describe("Card", () => {
  it('uses the ink ground for tone="ink"', () => {
    render(<Card tone="ink">dark card</Card>);
    expect(screen.getByText("dark card")).toHaveClass("bg-ink", "text-canvas");
  });

  it("does not use the ink ground for the default surface tone", () => {
    render(<Card>light card</Card>);
    const el = screen.getByText("light card");
    expect(el).not.toHaveClass("bg-ink");
    expect(el).not.toHaveClass("text-canvas");
  });
});
