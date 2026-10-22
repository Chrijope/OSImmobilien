import { describe, expect, it } from "vitest";
import { antwortPruefen, enthaeltPersonendaten, herkunftText } from "./ankaufstoolUnterlagen";

describe("Ankaufstool: ausgelesene Unterlagen prüfen", () => {
  it("übernimmt nur bekannte Felder, rechnet Prozent in den Anteil um und rundet Stückzahlen", () => {
    const { vorschlaege } = antwortPruefen({
      felder: {
        wohnflaeche: { wert: "1.404,50 m²", quelle: "Flächenberechnung.pdf, Seite 2", sicherheit: "hoch" },
        maklerEinkauf: { wert: 3.57, quelle: "Exposé.pdf, Seite 1", sicherheit: "hoch" },
        wohneinheiten: { wert: 12.4, quelle: "Mieterliste.pdf, Seite 1", sicherheit: "mittel" },
        kaufpreis: { wert: -5, quelle: "Exposé.pdf", sicherheit: "hoch" },
        abgabepreisProQm: { wert: 4900, quelle: "Exposé.pdf", sicherheit: "hoch" },
        unbekannt: { wert: 1, quelle: "x", sicherheit: "hoch" },
      },
    });
    expect(vorschlaege).toEqual([
      { feld: "wohnflaeche", wert: 1404.5, quelle: "Flächenberechnung.pdf, Seite 2", sicherheit: "hoch" },
      { feld: "maklerEinkauf", wert: 0.0357, quelle: "Exposé.pdf, Seite 1", sicherheit: "hoch" },
      { feld: "wohneinheiten", wert: 12, quelle: "Mieterliste.pdf, Seite 1", sicherheit: "mittel" },
    ]);
  });

  it("verwirft Texte und Hinweise mit Personendaten aus Mieterlisten und Mietverträgen", () => {
    const { vorschlaege, hinweise } = antwortPruefen({
      felder: {
        vermietung: { wert: "voll vermietet, Mieter: Max Mustermann", quelle: "Mietvertrag.pdf", sicherheit: "hoch" },
        makler: { wert: "Herr Schulz, Musterimmobilien", quelle: "Exposé.pdf", sicherheit: "hoch" },
        energie: { wert: "Verbrauchsausweis, 112 kWh/(m²·a), Klasse D, Gas", quelle: "Energieausweis.pdf, Seite 1", sicherheit: "mittel" },
      },
      hinweise: ["Wohnfläche weicht ab: Exposé 560 m², Flächenberechnung 548 m²", "Kontakt: verwaltung@example.com"],
    });
    expect(vorschlaege.map((v) => v.feld)).toEqual(["energie"]);
    expect(hinweise).toEqual(["Wohnfläche weicht ab: Exposé 560 m², Flächenberechnung 548 m²"]);
  });

  it("erkennt typische Personendaten, lässt Hausdaten durch", () => {
    expect(enthaeltPersonendaten("Frau Meier, 2. OG")).toBe(true);
    expect(enthaeltPersonendaten("Tel. 0331 1234567")).toBe(true);
    expect(enthaeltPersonendaten("Mehrfamilienhaus, Baujahr 1988, Dach 2011")).toBe(false);
    expect(enthaeltPersonendaten("Gas-Zentralheizung 2017, Klasse C")).toBe(false);
  });

  it("schreibt die Herkunft kurz", () => {
    expect(herkunftText("Energieausweis.pdf, Seite 1")).toBe("aus Energieausweis.pdf, S. 1");
    expect(herkunftText("")).toBe("aus den Unterlagen");
  });
});
