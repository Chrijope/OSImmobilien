import { describe, it, expect } from "vitest";
import { makrolageAusAnalyse, MAKROLAGE_JE_GRUPPE } from "@/lib/makrolage";
import { baueExposeInhalt } from "@/lib/exposeInhalt";
import { MUSTER_OBJEKT, MUSTER_WE7 } from "@/test/musterobjektWe7";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Die Makrolage neben der Karte (24.09.2026). Sie kommt nur aus der
 * gemessenen Standortanalyse, nie aus einer Schätzung. Alle Orte hier sind
 * erfunden.
 */

const GEMESSEN = {
  schema: 2,
  messfassung: 2,
  gemessen_am: "2026-09-23T20:00:00Z",
  objekt_koordinaten: { lat: 48.33, lng: 10.87 },
  mikrolage: {
    einkaufen: [{ name: "Testmarkt", typ: "Supermarkt", entfernung_m: 320, lat: 48.331, lng: 10.871 }],
    hochschulen: [
      { name: "Hochschule Fern", typ: "Hochschule", entfernung_m: 8200 },
      { name: "Universität Nah", typ: "Hochschule", entfernung_m: 2400 },
      { name: "", entfernung_m: 100 },
      { name: "Ohne Entfernung" },
    ],
    kliniken: [
      { name: "Klinik A", entfernung_m: 3100 },
      { name: "Klinik B", entfernung_m: 3200 },
      { name: "Klinik C", entfernung_m: 3300 },
      { name: "Klinik D", entfernung_m: 3400 },
    ],
    gewerbe: [{ name: "Werk Muster", typ: "Industrie- oder Gewerbefläche", entfernung_m: 1500 }],
  },
  mikrolage_hinweis: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage. Gemessen ab der Ortsmitte von Augsburg, nicht ab der Hausadresse.",
};

describe("makrolageAusAnalyse", () => {
  it("liest Hochschulen und Krankenhäuser, nächste zuerst, höchstens drei, nur mit Namen und Entfernung", () => {
    const m = makrolageAusAnalyse(GEMESSEN);
    expect(m?.gemessen).toBe(true);
    expect(m?.gruppen.map((g) => g.id)).toEqual(["hochschulen", "kliniken"]);
    expect(m?.gruppen[0].eintraege.map((e) => e.name)).toEqual(["Universität Nah", "Hochschule Fern"]);
    expect(m?.gruppen[1].eintraege).toHaveLength(MAKROLAGE_JE_GRUPPE);
    // Ohne Typ steht die Art der Gruppe da.
    expect(m?.gruppen[1].eintraege[0]).toEqual({ name: "Klinik A", art: "Krankenhaus", entfernungMeter: 3100 });
  });

  it("nimmt Gewerbeflächen nicht auf, sie läsen sich wie Arbeitgeber", () => {
    const m = makrolageAusAnalyse(GEMESSEN);
    expect(JSON.stringify(m)).not.toContain("Werk Muster");
  });

  it("unterscheidet „gemessen, aber nichts erfasst“ von „nicht gemessen“", () => {
    const leer = makrolageAusAnalyse({ ...GEMESSEN, mikrolage: { einkaufen: GEMESSEN.mikrolage.einkaufen } });
    expect(leer).toEqual({ gruppen: [], gemessen: true });
    const alt = makrolageAusAnalyse({ ...GEMESSEN, messfassung: undefined, mikrolage: { einkaufen: GEMESSEN.mikrolage.einkaufen } });
    expect(alt).toEqual({ gruppen: [], gemessen: false });
  });

  it("gibt ohne gemessene Analyse nichts, auch nicht aus einem alten, erfundenen Datensatz", () => {
    expect(makrolageAusAnalyse(undefined)).toBeUndefined();
    expect(makrolageAusAnalyse({ ...GEMESSEN, schema: undefined })).toBeUndefined();
  });
});

describe("Exposé-Inhalt: Mikro- und Makrolage", () => {
  const inhaltMit = (standortanalyse: unknown) => baueExposeInhalt({
    objekt: { ...MUSTER_OBJEKT, meta: { ...MUSTER_OBJEKT.meta, standortanalyse } } as ObjektData,
    wohnung: MUSTER_WE7,
    heute: new Date(2026, 8, 24),
  });

  it("trägt die Makrolage und den gespeicherten Satz zur Genauigkeit der Messung", () => {
    const inhalt = inhaltMit(GEMESSEN);
    expect(inhalt.mikrolage.makro?.gruppen.map((g) => g.titel)).toEqual(["Hochschulen", "Krankenhäuser"]);
    // Gemessen ab der Ortsmitte: Das muss unter der Liste stehen, sonst liest sich die Entfernung wie ab der Haustür.
    expect(inhalt.mikrolage.analyse?.hinweis).toContain("Gemessen ab der Ortsmitte von Augsburg");
  });

  it("hat ohne Messung weder Mikro- noch Makrolage", () => {
    const inhalt = inhaltMit(undefined);
    expect(inhalt.mikrolage.analyse).toBeUndefined();
    expect(inhalt.mikrolage.makro).toBeUndefined();
  });
});
