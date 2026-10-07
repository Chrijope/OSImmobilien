import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VerlustGrundAuswahl } from "@/components/verlust/VerlustGrundAuswahl";

/**
 * Prüft die neue achte Option "Sonstiges" mit Pflicht-Freitext.
 *
 * Der Dialog meldet über `onChange` entweder eine Katalog-ID oder den
 * getrimmten Freitext. Ein leerer Text meldet "", damit der
 * Bestätigen-Knopf im umgebenden Dialog gesperrt bleibt.
 */
describe("VerlustGrundAuswahl mit Sonstiges", () => {
  it("zeigt acht Gruppen, darunter Sonstiges", () => {
    render(<VerlustGrundAuswahl wert="" onChange={() => {}} />);
    expect(screen.getByText("Kein Bedarf")).toBeInTheDocument();
    expect(screen.getByText("Wettbewerb")).toBeInTheDocument();
    expect(screen.getByText("Sonstiges")).toBeInTheDocument();
  });

  it("öffnet bei Sonstiges ein Freitextfeld und meldet zunächst leer", () => {
    const onChange = vi.fn();
    render(<VerlustGrundAuswahl wert="" onChange={onChange} />);
    fireEvent.click(screen.getByText("Sonstiges"));
    // Ohne Text bleibt der Wert leer, der Dialog sperrt damit das Bestätigen.
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByPlaceholderText("Eigenen Verlustgrund kurz eintragen")).toBeInTheDocument();
    expect(screen.getByText(/Pflichtfeld/)).toBeInTheDocument();
  });

  it("meldet den getrimmten Freitext als Grund", () => {
    const onChange = vi.fn();
    render(<VerlustGrundAuswahl wert="" onChange={onChange} />);
    fireEvent.click(screen.getByText("Sonstiges"));
    fireEvent.change(screen.getByPlaceholderText("Eigenen Verlustgrund kurz eintragen"), {
      target: { value: "  Kunde ist ins Ausland gezogen  " },
    });
    expect(onChange).toHaveBeenLastCalledWith("Kunde ist ins Ausland gezogen");
  });

  it("meldet bei nur Leerzeichen weiterhin leer", () => {
    const onChange = vi.fn();
    render(<VerlustGrundAuswahl wert="" onChange={onChange} />);
    fireEvent.click(screen.getByText("Sonstiges"));
    fireEvent.change(screen.getByPlaceholderText("Eigenen Verlustgrund kurz eintragen"), {
      target: { value: "   " },
    });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("zeigt einen vorhandenen Freitext beim Öffnen wieder an", () => {
    render(<VerlustGrundAuswahl wert="Kunde ist ins Ausland gezogen" onChange={() => {}} />);
    // Freitext-Wert heißt: direkt in der Sonstiges-Ansicht starten.
    expect(screen.getByDisplayValue("Kunde ist ins Ausland gezogen")).toBeInTheDocument();
  });

  it("lässt die Katalog-Auswahl unverändert", () => {
    const onChange = vi.fn();
    render(<VerlustGrundAuswahl wert="" onChange={onChange} />);
    fireEvent.click(screen.getByText("Kein Bedarf"));
    fireEvent.click(screen.getByText("Kein Interesse an Kapitalanlage"));
    expect(onChange).toHaveBeenLastCalledWith("kb_kein_interesse");
  });
});
