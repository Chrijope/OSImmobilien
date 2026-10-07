import { describe, expect, it } from "vitest";
import { DEFAULT_GREST_P, GREST_BY_BUNDESLAND, detectBundesland, grEstForBundesland } from "./bundeslandGrEst";
import { BUNDESLAENDER } from "./grunderwerbsteuer";
import { BUNDESLAND_NK, bundeslandFromPlz, kaufnebenkostenPct, gepflegterKaufnebenkostenSatz } from "./kaufnebenkosten";

describe("Grunderwerbsteuer je Bundesland", () => {
  it("führt genau die sechzehn Länder der zentralen Tabelle mit deren Sätzen", () => {
    expect(Object.keys(GREST_BY_BUNDESLAND)).toHaveLength(16);
    for (const land of BUNDESLAENDER) {
      expect(GREST_BY_BUNDESLAND[land.name]).toBe(land.grunderwerbsteuer);
      expect(grEstForBundesland(land.name)).toBe(land.grunderwerbsteuer);
    }
  });

  it("hält die beiden Sätze, die früher veraltet waren", () => {
    // Bremen seit dem 1. Juli 2025, Thüringen seit dem 1. Januar 2024.
    expect(GREST_BY_BUNDESLAND["Bremen"]).toBe(5.5);
    expect(GREST_BY_BUNDESLAND["Thüringen"]).toBe(5.0);
  });

  it("fällt ohne erkanntes Bundesland auf den Standardsatz zurück", () => {
    expect(grEstForBundesland(undefined)).toBe(DEFAULT_GREST_P);
    expect(grEstForBundesland("Tirol")).toBe(DEFAULT_GREST_P);
  });
});

describe("Bundesland aus der Postleitzahl", () => {
  it("trennt den Bereich 89 zwischen Baden-Württemberg und Bayern", () => {
    // Ulm und Alb-Donau
    expect(detectBundesland("89073")).toBe("Baden-Württemberg");
    expect(detectBundesland("89150")).toBe("Baden-Württemberg");
    // Neu-Ulm, Günzburg, Dillingen
    expect(detectBundesland("89231")).toBe("Bayern");
    expect(detectBundesland("89312")).toBe("Bayern");
    expect(detectBundesland("89407")).toBe("Bayern");
    // Heidenheim
    expect(detectBundesland("89518")).toBe("Baden-Württemberg");
    expect(detectBundesland("89601")).toBe("Baden-Württemberg");
  });

  it("ordnet Cottbus, Halle und Gera nicht mehr Sachsen zu", () => {
    expect(detectBundesland("03046")).toBe("Brandenburg");
    expect(detectBundesland("06108")).toBe("Sachsen-Anhalt");
    expect(detectBundesland("07545")).toBe("Thüringen");
    expect(detectBundesland("04109")).toBe("Sachsen");
    expect(detectBundesland("01067")).toBe("Sachsen");
  });

  it("trennt Trier, Mainz und Koblenz von Nordrhein-Westfalen", () => {
    expect(detectBundesland("54290")).toBe("Rheinland-Pfalz");
    expect(detectBundesland("55116")).toBe("Rheinland-Pfalz");
    expect(detectBundesland("56068")).toBe("Rheinland-Pfalz");
    expect(detectBundesland("57072")).toBe("Nordrhein-Westfalen");
    expect(detectBundesland("50667")).toBe("Nordrhein-Westfalen");
  });

  it("erkennt gängige Städte richtig", () => {
    expect(detectBundesland("80331")).toBe("Bayern");
    expect(detectBundesland("10115")).toBe("Berlin");
    expect(detectBundesland("20095")).toBe("Hamburg");
    expect(detectBundesland("28195")).toBe("Bremen");
    expect(detectBundesland("70173")).toBe("Baden-Württemberg");
    expect(detectBundesland("38100")).toBe("Niedersachsen");
    expect(detectBundesland("39104")).toBe("Sachsen-Anhalt");
  });

  it("nimmt eine ausdrückliche Angabe vor der Postleitzahl", () => {
    expect(detectBundesland("80331", undefined, "Hessen")).toBe("Hessen");
  });

  it("liefert nichts bei fehlender oder unlesbarer Angabe", () => {
    expect(detectBundesland(undefined)).toBeUndefined();
    expect(detectBundesland("")).toBeUndefined();
    expect(detectBundesland("abc")).toBeUndefined();
  });
});

describe("Kaufnebenkosten je Bundesland", () => {
  it("rechnet Grunderwerbsteuer plus Notar und Grundbuch, ohne Makler", () => {
    for (const eintrag of BUNDESLAND_NK.filter((b) => b.value !== "andere")) {
      const zentral = BUNDESLAENDER.find((land) => land.name === eintrag.label);
      expect(zentral).toBeDefined();
      expect(eintrag.grEstP).toBe(zentral?.grunderwerbsteuer);
      expect(eintrag.pct).toBeCloseTo((zentral?.grunderwerbsteuer ?? 0) + 1.5, 5);
    }
  });

  it("behält die alten Schlüssel, sie stecken in gespeicherten Objektdaten", () => {
    expect(BUNDESLAND_NK.map((b) => b.value)).toEqual([
      "bw", "bayern", "berlin", "brandenburg", "bremen", "hamburg", "hessen",
      "mv", "niedersachsen", "nrw", "rlp", "saarland", "sachsen", "sa", "sh",
      "thueringen", "andere",
    ]);
  });

  it("findet den Schlüssel über die Postleitzahl", () => {
    expect(bundeslandFromPlz("89073")).toBe("bw");
    expect(bundeslandFromPlz("89231")).toBe("bayern");
    expect(bundeslandFromPlz("07545")).toBe("thueringen");
    expect(bundeslandFromPlz("")).toBeNull();
  });

  it("nimmt den gespeicherten Satz vor der Postleitzahl", () => {
    expect(kaufnebenkostenPct({ plz: "80331", metaPct: 7.2 })).toBe(7.2);
    // Bayern: 3,5 plus 1,5
    expect(kaufnebenkostenPct({ plz: "80331" })).toBeCloseTo(5.0, 5);
    // Thüringen nach der Senkung: 5,0 plus 1,5
    expect(kaufnebenkostenPct({ plz: "07545" })).toBeCloseTo(6.5, 5);
    expect(kaufnebenkostenPct({})).toBe(0);
  });
});

/*
 * Der am Objekt gepflegte Satz liegt in zwei Ablagen.
 *
 * Der Anlageassistent fragt „Kaufnebenkosten (%)" als Pflichtfeld ab und
 * speichert sie in der Spalte `global_kaufnebenkosten`, im Objekt gelesen als
 * `globalDaten.kaufnebenkosten`. Einheitenseite und Exposé lasen bis 09/2026
 * allein `meta.kaufnebenkostenPct`, und dieses Feld schreibt niemand. Die
 * Eingabe kam deshalb nie beim Rechner an.
 */
describe("gepflegterKaufnebenkostenSatz", () => {
  it("liest den Satz aus der Globalspalte des Anlageassistenten", () => {
    expect(gepflegterKaufnebenkostenSatz({ globalDaten: { kaufnebenkosten: 7.5 } })).toBe(7.5);
  });

  it("lässt einem älteren Wert in meta den Vortritt", () => {
    expect(gepflegterKaufnebenkostenSatz({
      meta: { kaufnebenkostenPct: 6 },
      globalDaten: { kaufnebenkosten: 7.5 },
    })).toBe(6);
  });

  it("meldet nichts, wenn nichts gepflegt ist, damit das Bundesland greift", () => {
    expect(gepflegterKaufnebenkostenSatz({})).toBeUndefined();
    expect(gepflegterKaufnebenkostenSatz({ globalDaten: { kaufnebenkosten: 0 } })).toBeUndefined();
    expect(gepflegterKaufnebenkostenSatz(null)).toBeUndefined();
  });

  it("verwirft unsinnige Sätze über 20 Prozent", () => {
    expect(gepflegterKaufnebenkostenSatz({ globalDaten: { kaufnebenkosten: 750 } })).toBeUndefined();
  });
});
