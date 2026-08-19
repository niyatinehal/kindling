import { render, screen } from "@testing-library/react";

import { Card } from "../Card";

describe("Card", () => {
  // Its own tokens, not `ink`/`canvas`. Painting it with the body-text colour
  // worked while there was one theme and inverted the card the moment there
  // were two — this is the assertion that stops it drifting back.
  it('uses the emphasis ground for tone="emphasis"', () => {
    render(<Card tone="emphasis">emphasis card</Card>);
    expect(screen.getByText("emphasis card")).toHaveClass("bg-emphasis", "text-on-emphasis");
  });

  it("does not use the emphasis ground for the default surface tone", () => {
    render(<Card>light card</Card>);
    const el = screen.getByText("light card");
    expect(el).not.toHaveClass("bg-emphasis");
    expect(el).not.toHaveClass("text-on-emphasis");
  });
});
