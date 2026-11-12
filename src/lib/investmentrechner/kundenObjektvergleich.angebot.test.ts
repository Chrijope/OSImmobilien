import { describe, expect, it } from "vitest";
import { STANDARD_ANNAHMEN, finanzierungsart, rechneEinheit, type VergleichEinheit } from "./kundenObjektvergleich";

/*
 * Darlehen laut Finanzierungsangebot (12.11.2026): Brück, Marktstraße 6, WE 1,
 * Angebot Baufi24 vom 12.11.2026: Sparda 130.050 € zu 4,66 % / 1,5 %,
 * Hanseatic (Nachrang) 26.732 € zu 7,59 % / 2,15 %, Gesamtrate 884,56 €.
 */
const einheit: VergleichEinheit = {
  nr: "1", zimmer: 2, qm: 57.18, lage: "EG links", kpWohnung: 144500, kpListe: 0, garagen: 0, garageKp: 0,
  garageMiete1: 0, garageMieteZiel: 0, garageIstVon: 0, garageIstBis: 0, mieteIst: 325, mieteSubQm: 10.5,
  u: 329.74, n: 49.35, r: 28.45, afaJahre: 100 / 3.5, mieteZielQm: 18,
};
const annahmen = {
  ...STANDARD_ANNAHMEN, steuer: 0.3, zins: 0.0466, tilgung: 0.015, knk: 0.085,
  nachrangZins: 0.0759, nachrangTilgung: 0.0215,
};

describe("Finanzierung laut Bankangebot", () => {
  it("rechnet Bank- und Nachrangrate wie das Angebot", () => {
    const e = rechneEinheit(einheit, { ...annahmen, darlehenBetrag: 130050, nachrangBetrag: 26732 });
    expect(e.darlehen).toBe(130050);
    expect(e.nrBetrag).toBe(26732);
    expect(e.monat.zins + e.monat.tilgung).toBeCloseTo(667.59, 2);
    expect(e.monat.nzins + e.monat.ntilg).toBeCloseTo(216.97, 2);
    expect(e.monat.ausgaben).toBeCloseTo(962.36, 2);
    expect(-e.monat.vor).toBeCloseTo(361.97, 2);
    // Kaufpreis 144.500 + Nebenkosten 12.282,50 − 156.782 Darlehen: 0,50 € Rundung, kein Eigenkapital
    expect(e.ek).toBe(0);
  });

  it("ohne Angebot bleibt es bei 100 % des Kaufpreises und Nebenkosten aus Eigenkapital", () => {
    const e = rechneEinheit(einheit, annahmen);
    expect(finanzierungsart(annahmen)).toBe("ek");
    expect(e.darlehen).toBe(144500);
    expect(e.nrBetrag).toBe(0);
    expect(e.ek).toBeCloseTo(12282.5, 2);
  });

  it("nur Nachrang eingetragen: Bank bleibt der Kaufpreis", () => {
    const e = rechneEinheit(einheit, { ...annahmen, nachrangBetrag: 12282.5 });
    expect(e.darlehen).toBe(144500);
    expect(e.ek).toBeCloseTo(0, 2);
  });
});
