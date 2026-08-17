import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "../Button";

describe("Button", () => {
  it("renders a button that is not a submit by default", () => {
    render(<Button>Start</Button>);
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("type", "button");
  });

  it("calls onClick", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Start</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Start
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  // The 48px floor is a requirement, not a preference: this app is used by
  // parents and grandparents, and a 32px target is a miss for a lot of people.
  it("meets the minimum touch target on every variant", () => {
    const { rerender } = render(<Button>Start</Button>);
    for (const variant of ["primary", "secondary", "ghost"] as const) {
      rerender(<Button variant={variant}>Start</Button>);
      expect(screen.getByRole("button", { name: "Start" }).className).toContain("min-h-12");
    }
  });

  // Only --color-accent passes AA against white text (5.02:1). If a variant
  // ever renders white on accent-bright (3.30:1), that is a real failure.
  it("never puts white text on the bright accent", () => {
    render(<Button>Start</Button>);
    const className = screen.getByRole("button", { name: "Start" }).className;
    expect(className).not.toContain("bg-accent-bright");
  });
});
