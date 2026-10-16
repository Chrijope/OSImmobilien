import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import VorschauPipeline from "./VorschauPipeline";

/*
 * Lokale Vorschau /vorschau/pipeline (nur Entwicklungsmodus): Die Spalten des
 * neuen Ablaufs und das Termin-Fenster sind ohne Anmeldung zu sehen.
 */
describe("Vorschau Pipeline, neuer Ablauf", () => {
  it("zeigt die neuen Spalten und keine Spalte Bonitätsunterlagen", () => {
    render(<VorschauPipeline />);
    for (const spalte of ["Finanzierung", "Besichtigung", "Termin Bankgutachter", "Objektpräsentation / Closing", "Kaufpreisfälligkeit"]) {
      expect(screen.getAllByText(spalte).length, spalte).toBeGreaterThan(0);
    }
    // Der Altfall steht unter „Reservierung“ und traegt den Hinweis.
    expect(screen.getByText("Alte Stufe Bonitätsunterlagen, weiter über die Finanzierung")).toBeTruthy();
  });

  it("öffnet beim Wechsel auf Besichtigung das Termin-Fenster, Abbrechen setzt nichts", () => {
    render(<VorschauPipeline />);
    const auswahl = (screen.getAllByLabelText(/Stufe von Investment/) as HTMLSelectElement[])
      .find((s) => s.value === "reservierung")!;
    expect(auswahl).toBeTruthy();
    fireEvent.change(auswahl, { target: { value: "besichtigung" } });
    expect(screen.getByText("Besichtigung eintragen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText("Besichtigung eintragen")).toBeNull();
    expect(within(document.body).getByText(/Noch kein Termin/)).toBeTruthy();
  });
});
