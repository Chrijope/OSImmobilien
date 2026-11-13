import { describe, expect, it } from "vitest";
import { STANDARD_ANNAHMEN, finanzierungsart, jahrMonatlich, r2, rechneEinheit, type VergleichEinheit } from "./kundenObjektvergleich";

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

  it("ohne Nachrang (nur Bankdarlehen laut Angebot): Lücke aus Eigenkapital, Zuzahlung wie im Vergleich", () => {
    const e = rechneEinheit(einheit, { ...annahmen, darlehenBetrag: 130050, nachrangBetrag: 0 });
    expect(e.nrBetrag).toBe(0);
    expect(e.ek).toBeCloseTo(26732.5, 2);
    expect(e.monat.zins + e.monat.tilgung).toBeCloseTo(667.59, 2);
    expect(-e.monat.vor).toBeCloseTo(145.0, 2);
  });

  it("nur Nachrang eingetragen: Bank bleibt der Kaufpreis", () => {
    const e = rechneEinheit(einheit, { ...annahmen, nachrangBetrag: 12282.5 });
    expect(e.darlehen).toBe(144500);
    expect(e.ek).toBeCloseTo(0, 2);
  });
});

describe("Restschuld wie die Bank (monatlich verrechnet)", () => {
  const restNach = (betrag: number, zins: number, tilgung: number, jahre: number) => {
    const rate = r2((betrag * (zins + tilgung)) / 12);
    let rest = betrag;
    for (let j = 0; j < jahre; j++) rest = jahrMonatlich(rest, rate, zins).rest;
    return { rate, rest: r2(rest) };
  };
  it("trifft die Angebote vom 11. und 12.11.2026 auf den Cent", () => {
    expect(restNach(130050, 0.0466, 0.015, 10)).toEqual({ rate: 667.59, rest: 105260.9 });
    expect(restNach(26732, 0.0759, 0.0215, 5)).toEqual({ rate: 216.97, rest: 23250.53 });
    expect(restNach(265500, 0.043, 0.015, 10)).toEqual({ rate: 1283.25, rest: 215850.62 });
  });
  it("rechneEinheit: Restschuld nach 10 Jahren wie im Angebot", () => {
    const e = rechneEinheit({ ...einheit, kpWohnung: 295320 }, { ...annahmen, zins: 0.043, tilgung: 0.015, darlehenBetrag: 265500 });
    expect(e.monat.zins + e.monat.tilgung).toBeCloseTo(1283.25, 2);
    expect(r2(e.entw[10].rest)).toBe(215850.62);
  });
  it("Restschuld am Ende der Zinsbindung für Bank und Nachrang", () => {
    const e = rechneEinheit(einheit, { ...annahmen, darlehenBetrag: 130050, nachrangBetrag: 26732, zinsbindungJahre: 10, nachrangZinsbindungJahre: 5 });
    expect(e.restZinsbindung).toEqual({ jahre: 10, bank: 105260.9, nrJahre: 5, nachrang: 23250.53 });
    expect(rechneEinheit(einheit, annahmen).restZinsbindung).toBeNull();
  });

  it("Vergleich der Angebote vom 13. und 12.11.2026: beide 100 % Kaufpreis, Angebot 2 mit Nebenkosten", () => {
    const a1 = rechneEinheit(einheit, { ...annahmen, zins: 0.0469, tilgung: 0.0125, darlehenBetrag: 130000, nachrangBetrag: 14450, zinsbindungJahre: 10, nachrangZinsbindungJahre: 5 });
    const a2 = rechneEinheit(einheit, { ...annahmen, darlehenBetrag: 130050, nachrangBetrag: 26732, zinsbindungJahre: 10, nachrangZinsbindungJahre: 5 });
    expect(a1.monat.zins + a1.monat.tilgung + a1.monat.nzins + a1.monat.ntilg).toBeCloseTo(760.79, 2);
    expect(a1.restZinsbindung).toEqual({ jahre: 10, bank: 109317.24, nrJahre: 5, nachrang: 12567.63 });
    expect(a2.monat.zins + a2.monat.tilgung + a2.monat.nzins + a2.monat.ntilg).toBeCloseTo(884.56, 2);
    expect(a2.ek).toBe(0);
  });
});
