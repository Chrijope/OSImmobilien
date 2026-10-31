import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Abschluss } from "./SelbstauskunftArtefakt";

/*
 * Abschlussseite der Selbstauskunft im Artefakt (Christian, 31.10.2026):
 * Hinweis zur Unterschrift am Knopf, „Als PDF speichern“ pulsiert, der
 * Finanzierungsrahmen-Knopf ist grün statt orange.
 */
const DATA = { vorname: "Max", nachname: "Mustermann", einkommen: { netto: "3.500" }, mieteWarm: "1.000", vermoegenswerte: [] } as never;

describe("Abschluss der Selbstauskunft (Artefakt)", () => {
  it("zeigt Hinweis, pulsierenden Hauptknopf und grünen Rahmen-Knopf", () => {
    render(<MemoryRouter><Abschluss data={DATA} onNeu={() => {}} /></MemoryRouter>);
    expect(screen.getByTestId("hinweis-unterschrift").textContent).toContain("zur Unterschrift zusenden");
    const haupt = screen.getByTestId("als-pdf-speichern");
    expect(haupt.parentElement?.querySelector(".animate-ping")).not.toBeNull();
    const rahmen = screen.getByTestId("rahmen-als-pdf");
    expect(rahmen.className).toContain("bg-primary");
    expect(rahmen.className).not.toContain("btn-brand");
  });
});
