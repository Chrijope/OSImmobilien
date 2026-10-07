import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { kiAntwortInVorschlaege } from "@/lib/investmentrechner/unterlagenKiFelder";
import { UnterlagenUebernahme } from "./UnterlagenUebernahme";

/**
 * Die Übernahmeliste zeigt den Abgleich mit den hinterlegten Einheitsdaten
 * (Christians Vorgabe vom 28.09.2026): Bestätigtes als solches, Abweichendes
 * mit beiden Werten und ohne Häkchen, Leeres mit Häkchen, wenn sicher.
 */
describe("UnterlagenUebernahme, Abgleich", () => {
  it("zeigt Bestätigung und Abweichung, hakt nur das leere Feld an", () => {
    const quelle = "Mietvertrag der Einheit, Faktenauszug";
    const vorschlaege = kiAntwortInVorschlaege(
      {
        felder: {
          monthlyColdRent: { wert: 650, quelle, sicherheit: "hoch" },
          rooms: { wert: 3, quelle, sicherheit: "hoch" },
          area: { wert: 55.5, quelle, sicherheit: "hoch" },
        },
      },
      { ...standardEingabe, monthlyColdRent: 650, rooms: 2 },
    );
    render(
      <UnterlagenUebernahme
        auslesung={{ status: "fertig", vorschlaege, hinweise: [], fehler: "", uebernommen: 0 }}
        onUebernehmen={() => undefined}
        onSchliessen={() => undefined}
      />,
    );
    expect(screen.getByText(/Stimmt mit den hinterlegten Daten überein/)).toBeInTheDocument();
    const abweichung = screen.getByTestId("ki-abweichung-rooms");
    expect(abweichung).toHaveTextContent("Hinterlegt: 2");
    expect(abweichung).toHaveTextContent(`laut ${quelle}: 3`);
    expect(screen.getByRole("checkbox", { name: "Zimmer übernehmen" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Zimmer übernehmen" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Wohnfläche.*übernehmen/ })).toBeChecked();
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });

  it("eine während des Wartens entstandene Abweichung wird abgewählt und gezeigt (R5-006)", () => {
    const quelle = "Exposé.pdf, Seite 2";
    const antwort = { felder: { area: { wert: 72, quelle, sicherheit: "hoch" } } };
    const zeige = (vorschlaege: ReturnType<typeof kiAntwortInVorschlaege>) => (
      <UnterlagenUebernahme
        auslesung={{ status: "fertig", vorschlaege, hinweise: [], fehler: "", uebernommen: 0 }}
        onUebernehmen={() => undefined}
        onSchliessen={() => undefined}
      />
    );
    const { rerender } = render(zeige(kiAntwortInVorschlaege(antwort, standardEingabe, {})));
    expect(screen.getByRole("checkbox", { name: /Wohnfläche.*übernehmen/ })).toBeChecked();
    // Inzwischen hat jemand 68 m² eingetragen: Die Liste entsteht aus dem aktuellen Stand neu.
    rerender(zeige(kiAntwortInVorschlaege(antwort, { ...standardEingabe, area: 68 }, { area: { quelle: "eigen", text: "" } })));
    expect(screen.getByRole("checkbox", { name: /Wohnfläche.*übernehmen/ })).not.toBeChecked();
    expect(screen.getByTestId("ki-abweichung-area")).toHaveTextContent("Hinterlegt: 68 m²");
  });
});
