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

  // Every call site that passes `loading` is mid-POST. A press that still got
  // through would be a second registration, a second family, a second glass of
  // water — which is the whole reason the prop exists.
  it("does not call onClick while loading", () => {
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} loading>
        Start
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("reports itself as busy while loading", () => {
    render(<Button loading>Start</Button>);
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("aria-busy", "true");
  });

  // The spinner is decoration, so the label has to remain the whole accessible
  // name. Every screen test in this repo finds its buttons by that name.
  it("keeps its label as the accessible name while loading", () => {
    render(<Button loading>Building…</Button>);
    expect(screen.getByRole("button", { name: "Building…" })).toBeInTheDocument();
  });

  // Only --color-accent passes AA against white text (5.02:1). If a variant
  // ever renders white on accent-bright (3.30:1), that is a real failure.
  it("never puts white text on the bright accent", () => {
    render(<Button>Start</Button>);
    const className = screen.getByRole("button", { name: "Start" }).className;
    expect(className).not.toContain("bg-accent-bright");
  });
});
