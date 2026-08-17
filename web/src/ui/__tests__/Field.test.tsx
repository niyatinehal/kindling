import { fireEvent, render, screen } from "@testing-library/react";

import { Field } from "../Field";

describe("Field", () => {
  it("associates its label with its input", () => {
    render(<Field label="Phone number" value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
  });

  it("reports the value, not the event", () => {
    const onChange = jest.fn();
    render(<Field label="Phone number" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+9112345" } });

    expect(onChange).toHaveBeenCalledWith("+9112345");
  });

  it("honours maxLength", () => {
    render(<Field label="Name" value="" onChange={jest.fn()} maxLength={120} />);
    expect(screen.getByLabelText("Name")).toHaveAttribute("maxlength", "120");
  });

  it("meets the minimum touch target", () => {
    render(<Field label="Name" value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText("Name").className).toContain("min-h-12");
  });
});
