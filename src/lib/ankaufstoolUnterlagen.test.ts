import { describe, expect, it } from "vitest";
import { antwortPruefen, enthaeltPersonendaten, herkunftText } from "./ankaufstoolUnterlagen";

const q = (art: string, nr: number, seite: number) => `${art} (Unterlage ${nr}), Seite ${seite}`;

describe("Ankaufstool: ausgelesene Unterlagen prüfen", () => {
  it("übernimmt nur bekannte Zahlenfelder, rechnet Prozent in den Anteil um und rundet Stückzahlen", () => {
    const { vorschlaege } = antwortPruefen({
      felder: {
        wohnflaeche: { wert: 1404.5, quelle: q("Flächenberechnung", 2, 2), sicherheit: "hoch" },
        maklerEinkauf: { wert: 3.57, quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
        wohneinheiten: { wert: 12.4, quelle: q("Mieterliste", 3, 1), sicherheit: "mittel" },
        kaufpreis: { wert: -5, quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
        abgabepreisProQm: { wert: 4900, quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
      },
    });
    expect(vorschlaege).toEqual([
      { feld: "wohnflaeche", wert: 1404.5, quelle: q("Flächenberechnung", 2, 2), sicherheit: "hoch" },
      { feld: "wohneinheiten", wert: 12, quelle: q("Mieterliste", 3, 1), sicherheit: "mittel" },
      { feld: "maklerEinkauf", wert: 0.0357, quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
    ]);
  });

  it("nimmt keinen Freitext an: Namen, Text statt Zahl und unbekannte Auswahlwerte fallen heraus (Codex 22.10.2026)", () => {
    const { vorschlaege, hinweise } = antwortPruefen({
      felder: {
        makler: { wert: "Max Mustermann", quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
        vermietung: { wert: "Mieter Max Mustermann", quelle: q("Mietvertrag", 2, 1), sicherheit: "hoch" },
        objektart: { wert: "Haus von Max Mustermann", quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
        baujahr: { wert: "1988, Eigentümer Max Mustermann", quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
      },
      hinweise: ["Max Mustermann wohnt dort"],
    });
    expect(vorschlaege).toEqual([]);
    expect(hinweise).toEqual([]);
  });

  it("verwirft Vorschläge ohne gültige, vom Server gebildete Quelle", () => {
    const { vorschlaege } = antwortPruefen({
      felder: {
        wohnflaeche: { wert: 500, quelle: "Mietvertrag Max Mustermann, max@example.org", sicherheit: "hoch" },
        kaufpreis: { wert: 900000, quelle: "", sicherheit: "hoch" },
        grundstuecksflaeche: { wert: 800, sicherheit: "hoch" },
      },
    });
    expect(vorschlaege).toEqual([]);
  });

  it("setzt Objektart, Baujahr, Energie und Vermietung aus festen Werten zusammen", () => {
    const { vorschlaege, hinweise } = antwortPruefen({
      felder: {
        objektart: { wert: "Mehrfamilienhaus", quelle: q("Exposé", 1, 1), sicherheit: "hoch" },
        baujahr: { wert: 1988, quelle: q("Energieausweis", 2, 1), sicherheit: "hoch" },
        energieAusweis: { wert: "Verbrauchsausweis", quelle: q("Energieausweis", 2, 1), sicherheit: "hoch" },
        energieKennwert: { wert: 112, quelle: q("Energieausweis", 2, 1), sicherheit: "mittel" },
        energieKlasse: { wert: "D", quelle: q("Energieausweis", 2, 1), sicherheit: "hoch" },
        energieTraeger: { wert: "Gas", quelle: q("Energieausweis", 2, 2), sicherheit: "hoch" },
        leerstehendeEinheiten: { wert: 2, quelle: q("Mieterliste", 3, 1), sicherheit: "hoch" },
      },
      widersprueche: ["wohnflaeche", "unbekannt"],
    });
    const nach = Object.fromEntries(vorschlaege.map((v) => [v.feld, v]));
    expect(nach.objektart.wert).toBe("Mehrfamilienhaus");
    expect(nach.baujahr.wert).toBe("1988");
    expect(nach.energie).toMatchObject({ wert: "Verbrauchsausweis, 112 kWh/(m²·a), Klasse D, Gas", sicherheit: "mittel" });
    expect(nach.vermietung.wert).toBe("2 Einheiten leer");
    expect(hinweise).toEqual(["Die Unterlagen widersprechen sich bei: Wohnfläche. Bitte von Hand prüfen."]);
  });

  it("erkennt typische Personendaten, lässt Hausdaten durch", () => {
    expect(enthaeltPersonendaten("Frau Meier, 2. OG")).toBe(true);
    expect(enthaeltPersonendaten("Tel. 0331 1234567")).toBe(true);
    expect(enthaeltPersonendaten("Mehrfamilienhaus, Baujahr 1988, Dach 2011")).toBe(false);
  });

  it("schreibt die Herkunft kurz", () => {
    expect(herkunftText(q("Energieausweis", 2, 1))).toBe("aus Energieausweis (Unterlage 2), S. 1");
    expect(herkunftText("")).toBe("aus den Unterlagen");
  });
});
