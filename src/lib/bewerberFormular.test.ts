import { describe, it, expect } from "vitest";
import {
  FORMULAR_BLOECKE,
  FORMULAR_FRAGEN,
  antwortenZumSenden,
  frageBeantwortet,
  getFrage,
  sichtbareFragen,
  wunschzeitText,
} from "./bewerberFormular";

describe("Fragenkatalog des Bewerber-Fragebogens", () => {
  it("hat dreizehn Fragen für jeden und drei bedingte Zusatzfragen", () => {
    expect(sichtbareFragen({})).toHaveLength(13);
    expect(FORMULAR_FRAGEN.filter((f) => f.nurWenn)).toHaveLength(3);
  });

  it("ordnet jede Frage einem der fünf Blöcke zu", () => {
    for (const frage of FORMULAR_FRAGEN) {
      expect(FORMULAR_BLOECKE[frage.block]).toBeTruthy();
    }
  });

  it("blendet die Zusatzfragen erst mit passender Erfahrung ein", () => {
    expect(sichtbareFragen({ hintergrund: ["quereinsteiger"] })).toHaveLength(13);
    expect(sichtbareFragen({ hintergrund: ["findi"] }).map((f) => f.key)).toEqual(
      expect.arrayContaining(["erfahrungsdauer", "findiSparten"]),
    );
    expect(sichtbareFragen({ hintergrund: ["immo", "findi"] })).toHaveLength(16);
  });

  it("zählt leeren Text und leere Auswahl nicht als Antwort", () => {
    const region = getFrage("region")!;
    const hintergrund = getFrage("hintergrund")!;
    expect(frageBeantwortet(region, { region: "  " })).toBe(false);
    expect(frageBeantwortet(region, { region: "Rosenheim" })).toBe(true);
    expect(frageBeantwortet(hintergrund, { hintergrund: [] })).toBe(false);
    expect(frageBeantwortet(hintergrund, { hintergrund: ["immo"] })).toBe(true);
  });
});

describe("antwortenZumSenden", () => {
  it("liefert dieselben Schlüssel und Typen wie der Katalog", () => {
    const ergebnis = antwortenZumSenden({
      region: " 83022 Rosenheim ",
      beschaeftigung: "angestellt",
      hintergrund: ["findi", "netzwerk"],
      findiSparten: ["baufinanzierung"],
      erfahrungsdauer: "3_bis_10",
      erwartung: "Klare Abläufe.",
      erreichbarkeit: ["nachmittags"],
    });
    expect(ergebnis).toEqual({
      region: "83022 Rosenheim",
      beschaeftigung: "angestellt",
      hintergrund: ["findi", "netzwerk"],
      findiSparten: ["baufinanzierung"],
      erfahrungsdauer: "3_bis_10",
      erwartung: "Klare Abläufe.",
      erreichbarkeit: ["nachmittags"],
    });
    for (const key of Object.keys(ergebnis)) {
      const frage = getFrage(key)!;
      expect(frage).toBeTruthy();
      expect(Array.isArray(ergebnis[key])).toBe(frage.typ === "mehrfach");
    }
  });

  it("lässt leere und verwaiste Antworten weg", () => {
    const ergebnis = antwortenZumSenden({
      region: "",
      einsatz: "   ",
      // Immobilien-Schwerpunkt war beantwortet, die Erfahrung wurde danach abgewählt.
      hintergrund: ["quereinsteiger"],
      immoSchwerpunkt: "makler",
      zeitProWoche: "vollzeit",
    });
    expect(ergebnis).toEqual({ hintergrund: ["quereinsteiger"], zeitProWoche: "vollzeit" });
  });
});

describe("wunschzeitText", () => {
  it("nennt die angegebene Erreichbarkeit in Katalogreihenfolge", () => {
    expect(wunschzeitText({ erreichbarkeit: ["nachmittags"] })).toBe("nachmittags zwischen 14 und 18 Uhr");
    expect(wunschzeitText({ erreichbarkeit: ["abends", "vormittags"] })).toBe("vormittags bis 12 Uhr oder abends ab 18 Uhr");
    expect(wunschzeitText({ erreichbarkeit: ["abends", "mittags", "vormittags"] })).toBe(
      "vormittags bis 12 Uhr, mittags zwischen 12 und 14 Uhr oder abends ab 18 Uhr",
    );
  });

  it("bleibt leer ohne Angabe", () => {
    expect(wunschzeitText({})).toBe("");
    expect(wunschzeitText({ erreichbarkeit: [] })).toBe("");
  });
});
