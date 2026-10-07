import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UebergabeGrundFeld } from "./UebergabeGrundFeld";

/**
 * Das Feld fuer den Uebergabegrund.
 *
 * Der haeufige Fall soll ein Klick sein. Geprueft wird deshalb, dass ein
 * Knopf den Grund setzt, ein zweiter Klick ihn wieder aufhebt und der
 * Freitext nur bei "Sonstiges" eingefordert wird.
 */

describe("Der Grund wird angetippt, nicht getippt", () => {
  it("setzt den Grund mit einem Klick", () => {
    const onChange = vi.fn();
    render(<UebergabeGrundFeld grund={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Urlaub oder Abwesenheit" }));
    expect(onChange).toHaveBeenCalledWith({ key: "abwesenheit" });
  });

  it("hebt die Wahl beim zweiten Klick wieder auf", () => {
    const onChange = vi.fn();
    render(<UebergabeGrundFeld grund={{ key: "abwesenheit" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Urlaub oder Abwesenheit" }));
    expect(onChange).toHaveBeenCalledWith({ key: "" });
  });

  it("zeigt den gewählten Grund als gedrückt an", () => {
    render(<UebergabeGrundFeld grund={{ key: "region" }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Region passt besser" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Auslastung" })).toHaveAttribute("aria-pressed", "false");
  });

  it("bittet nur bei Sonstiges um eine Beschreibung", () => {
    const { rerender } = render(<UebergabeGrundFeld grund={{ key: "auslastung" }} onChange={() => {}} />);
    expect(screen.queryByText(/braucht es eine kurze Beschreibung/)).toBeNull();

    rerender(<UebergabeGrundFeld grund={{ key: "sonstiges" }} onChange={() => {}} />);
    expect(screen.getByText(/braucht es eine kurze Beschreibung/)).toBeTruthy();
  });

  it("gibt den Freitext weiter, ohne den Grund zu verlieren", () => {
    const onChange = vi.fn();
    render(<UebergabeGrundFeld grund={{ key: "sonstiges" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Ergänzung zum Grund"), { target: { value: "Kunde ist ein Verwandter" } });
    expect(onChange).toHaveBeenCalledWith({ key: "sonstiges", text: "Kunde ist ein Verwandter" });
  });
});
