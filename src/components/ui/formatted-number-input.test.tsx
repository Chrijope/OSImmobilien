import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormattedNumberInput } from "./formatted-number-input";

describe("FormattedNumberInput", () => {
  it("meldet mit sofort jeden Tastendruck", () => {
    const onChange = vi.fn();
    render(<FormattedNumberInput value={0} onChange={onChange} sofort />);
    const feld = screen.getByRole("textbox");
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "12,5" } });
    expect(onChange).toHaveBeenLastCalledWith(12.5);
  });

  it("meldet ohne sofort erst beim Verlassen", () => {
    const onChange = vi.fn();
    render(<FormattedNumberInput value={0} onChange={onChange} />);
    const feld = screen.getByRole("textbox");
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "7" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(feld);
    expect(onChange).toHaveBeenCalledWith(7);
  });
});
