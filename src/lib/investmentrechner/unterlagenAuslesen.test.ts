import { describe, expect, it } from "vitest";
import {
  erkenneKategorie,
  findeSanierungen,
  parseDeutscheZahl,
  sanierungenBereinigt,
  unterlagenAuslesen,
} from "./unterlagenAuslesen";

describe("Unterlagen-Auslesung des Investmentrechners", () => {
  it("liest deutsche Zahlen mit Tausenderpunkt und Komma", () => {
    expect(parseDeutscheZahl("12.345,67")).toBe(12345.67);
    expect(parseDeutscheZahl("1 250")).toBe(1250);
    expect(parseDeutscheZahl("abc")).toBe(0);
  });

  it("erkennt Energieausweis, Rücklage und Sanierungen aus einem Beispieltext", () => {
    const text = [
      "Energieausweis für Wohngebäude. Energieeffizienzklasse: C.",
      "Endenergiebedarf: 92,5 kWh/(m²·a). Verbrauchsausweis. Wesentlicher Energieträger: Erdgas.",
      "Gültig bis: 31.12.2030.",
      "Jahresabrechnung 2025. Instandhaltungsrücklage zum 31.12.2025: 48.500,00 EUR.",
      "Davon entfallen auf die Wohnung Nr. 7 anteilig 1.940,00 EUR.",
      "2021 wurde die Heizung erneuert. 2019 Dach und Fassade saniert.",
    ].join(" ");
    const ergebnis = unterlagenAuslesen(text);
    expect(ergebnis.energyClass).toBe("C");
    expect(ergebnis.energyValue).toBe(92.5);
    expect(ergebnis.certificateType).toBe("Verbrauchsausweis");
    expect(ergebnis.energyCarrier).toBe("Erdgas");
    expect(ergebnis.certificateValidUntil).toBe("31.12.2030");
    expect(ergebnis.reserveAmount).toBe(48500);
    expect(ergebnis.reserveUnitShare).toBe(1940);
    expect(ergebnis.reserveAsOf).toBe("31.12.2025");
    expect(ergebnis.reserveExcerpt).toContain("Instandhaltungsrücklage");
    // Die Heuristik nimmt jede Jahreszahl im Umfeld eines Sanierungsbegriffs
    // mit, hier also auch die „2025" der Jahresabrechnung. Entscheidend ist,
    // dass die echten Maßnahmen erkannt und absteigend nach Jahr sortiert sind.
    expect(ergebnis.renovations.some((eintrag) => eintrag.startsWith("2021 · Heizung"))).toBe(true);
    // Der Textausschnitt beginnt beim ersten Sanierungsbegriff im Umfeld, bei
    // „2019" ist das noch die „Heizung" aus dem Satz davor.
    expect(
      ergebnis.renovations.some(
        (eintrag) => eintrag.startsWith("2019 · ") && eintrag.includes("Dach und Fassade saniert"),
      ),
    ).toBe(true);
    const jahre = ergebnis.renovations.map((eintrag) => Number(eintrag.slice(0, 4)));
    expect([...jahre].sort((a, b) => b - a)).toEqual(jahre);
    expect(ergebnis.matchedFields).toBe(9);
  });

  it("ignoriert Jahreszahlen ohne Sanierungsbegriff im Umfeld", () => {
    expect(findeSanierungen("Beschluss vom 12.03.2022 über die Hausordnung.")).toEqual([]);
  });

  it("räumt die Sanierungsliste erst beim Lesen auf, nicht beim Tippen", () => {
    // Genau dieser Zustand entsteht während der Eingabe: eine angefangene
    // Zeile mit Leerzeichen am Ende und eine leere Zeile für den nächsten
    // Eintrag. Beides muss im Feld erhalten bleiben und darf nur in der
    // Ausgabe verschwinden.
    const waehrendDerEingabe = ["2024 · Heizung erneuert", "2021 · Dach ", "", "   "];
    expect(sanierungenBereinigt(waehrendDerEingabe)).toEqual(["2024 · Heizung erneuert", "2021 · Dach"]);
    expect(sanierungenBereinigt([])).toEqual([]);
  });

  it("übernimmt höchstens zehn Maßnahmen in die Ausgabe", () => {
    const zwoelf = Array.from({ length: 12 }, (_, i) => `20${10 + i} · Maßnahme`);
    expect(sanierungenBereinigt(zwoelf)).toHaveLength(10);
  });

  it("erhält Zeilenumbrüche und Leerzeichen beim Hin- und Herwandeln", () => {
    // So arbeitet das Eingabefeld: value = join, onChange = split. Der
    // Rundlauf muss den getippten Text unverändert lassen, sonst lässt sich
    // weder ein Leerzeichen setzen noch eine neue Zeile beginnen.
    const getippt = "2024 · Heizung erneuert\n2021 · Dach \n";
    expect(getippt.split("\n").join("\n")).toBe(getippt);
  });

  it("ordnet Unterlagen nach Dateiname und Inhalt einer Kategorie zu", () => {
    expect(erkenneKategorie("Energieausweis.pdf", "")).toBe("Energieausweis");
    expect(erkenneKategorie("Abrechnung.pdf", "Wirtschaftsplan 2026")).toBe("WEG / Rücklagen");
    expect(erkenneKategorie("ETV.pdf", "Protokoll der Eigentümerversammlung")).toBe("Protokoll / Beschlüsse");
    expect(erkenneKategorie("Technik.pdf", "Sanierung der Steigleitungen")).toBe("Sanierung / Technik");
    expect(erkenneKategorie("Sonstiges.pdf", "Lorem ipsum")).toBe("Objektunterlage");
  });
});
