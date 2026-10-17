import { describe, expect, it } from "vitest";
import { berechneGarantie, garageAusMeta, mietgarantieAusMeta, type ObjektMietgarantie } from "./mietgarantie";

// Zahlen aus „Mietdifferenz Hauffstraße Abgleich.xlsx“ (Rechnung B, 15.10.2026).
const HAUFF: ObjektMietgarantie = { zielQm: 13, garageAnrechnung: 100, laufzeitMonate: 36, garagenSubventionMonate: 12 };

describe("Mietdifferenz-Garantie", () => {
  it("WE16: freie Garage zählt mit 100 €, Garantie 160,95 €, Garagen-Subvention 100 €", () => {
    const r = berechneGarantie(HAUFF, 74.95, 713.4, { nr: "G40", art: "garage", status: "frei", istMiete: 0 });
    expect(r.zielMiete).toBe(974.35);
    expect(r.garantieMonat).toBe(160.95);
    expect(r.garagenSubventionMonat).toBe(100);
  });

  it("WE1 ohne Garage: 552,89 − 404,93 = 147,96 €", () => {
    expect(berechneGarantie(HAUFF, 42.53, 404.93, null).garantieMonat).toBe(147.96);
  });

  it("WE4: ein freier Stellplatz zählt nicht", () => {
    const r = berechneGarantie(HAUFF, 42.89, 360, { nr: "SP13", art: "stellplatz", status: "frei", istMiete: 20 });
    expect(r.garageInRechnung).toBe(0);
    expect(r.garantieMonat).toBe(197.57);
    expect(r.garagenSubventionMonat).toBe(0);
  });

  it("WE46: vermietete Garage (50 €) wird im ersten Jahr um 50 € subventioniert", () => {
    expect(berechneGarantie(HAUFF, 79.72, 900, { nr: "G4", art: "garage", status: "eigener_mieter", istMiete: 50 }).garagenSubventionMonat).toBe(50);
  });

  it("gibt keine Garantie, wenn die Ist-Miete über dem Ziel liegt", () => {
    expect(berechneGarantie({ ...HAUFF, zielQm: 13.5 }, 95, 1404.5, null).garantieMonat).toBe(0);
  });

  it("summiert Garantie über die Laufzeit und Garagen-Subvention über 12 Monate", () => {
    const r = berechneGarantie(HAUFF, 74.95, 713.4, { nr: "G40", art: "garage", status: "frei", istMiete: 0 });
    expect(r.summeLaufzeit).toBe(160.95 * 36 + 1200);
  });

  it("liest Regel und Garage robust aus meta", () => {
    expect(mietgarantieAusMeta({})).toBeNull();
    expect(mietgarantieAusMeta({ mietgarantie: { zielQm: "13,5" } })).toBeNull();
    expect(mietgarantieAusMeta({ mietgarantie: { zielQm: 13.5 } })).toEqual({ zielQm: 13.5, garageAnrechnung: 0, laufzeitMonate: 36, garagenSubventionMonate: 12 });
    expect(garageAusMeta({ garage: { nr: "SP7", art: "stellplatz", status: "eigener_mieter", istMiete: "20" } }))
      .toEqual({ nr: "SP7", art: "stellplatz", status: "eigener_mieter", istMiete: 20 });
  });
});
