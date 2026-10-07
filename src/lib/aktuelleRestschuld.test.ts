import { describe, it, expect } from "vitest";
import { aktuelleRestschuld, berechneTilgungsplan, jahresAnnuitaet } from "@/lib/eigeneInvestmentBerechnungen";
import { adaptMoreImmoInvestment } from "@/lib/kundePortalInvestment";
import { eigenePosition, moreImmoPosition } from "@/lib/portalPortfolio";

/*
 * Befund vom 24.09.2026: „TEST Claude Eigene Immobilie“ mit 200.000 €
 * Darlehen, 3 % Zins, 2 % Tilgung, Kauf am 01.01.2024 zeigte „Offene Tilgung
 * 0,00 €“, der Tilgungsplan rechnete dagegen mit 200.000 €.
 */
const testImmobilie = {
  offene_tilgung: null,
  darlehenssumme: 200000,
  zinssatz: 3,
  monatliche_rate: 0,
  kaufdatum: "2024-01-01",
  meta: { anfangstilgung: 2 },
};

describe("jahresAnnuitaet", () => {
  it("nimmt die eingetragene Monatsrate", () => {
    expect(jahresAnnuitaet({ ...testImmobilie, monatliche_rate: 900 })).toBe(10800);
  });
  it("bildet sie ohne Rate aus Zins und anfänglicher Tilgung", () => {
    expect(jahresAnnuitaet(testImmobilie)).toBeCloseTo(10000, 6);
  });
  it("ist 0 ohne Rate und ohne Tilgung", () => {
    expect(jahresAnnuitaet({ ...testImmobilie, meta: {} })).toBe(0);
  });
});

describe("aktuelleRestschuld", () => {
  it("schreibt das Darlehen seit dem Kauf fort, statt 0 zu zeigen", () => {
    const rest = aktuelleRestschuld(testImmobilie, new Date("2026-09-24"))!;
    // 32 volle Monate: zwei volle Jahre laut Plan, dann 8/12 des dritten.
    const plan = berechneTilgungsplan(200000, 3, 10000, 0, 3);
    const erwartet = plan[1].restschuld - (plan[1].restschuld - plan[2].restschuld) * (8 / 12);
    expect(rest).toBeCloseTo(erwartet, 6);
    expect(rest).toBeGreaterThan(185000);
    expect(rest).toBeLessThan(200000);
  });

  it("trifft nach vollen Jahren genau den Wert des Tilgungsplans", () => {
    const rest = aktuelleRestschuld(testImmobilie, new Date("2026-01-01"))!;
    const plan = berechneTilgungsplan(200000, 3, 10000, 0, 2);
    expect(rest).toBeCloseTo(plan[1].restschuld, 6);
  });

  it("lässt eine eingetragene Restschuld gelten, auch 0", () => {
    expect(aktuelleRestschuld({ ...testImmobilie, offene_tilgung: 150000 })).toBe(150000);
    expect(aktuelleRestschuld({ ...testImmobilie, offene_tilgung: 0 })).toBe(0);
  });

  it("bleibt bei der Darlehenssumme ohne Kaufdatum oder vor dem Kauf", () => {
    expect(aktuelleRestschuld({ ...testImmobilie, kaufdatum: null })).toBe(200000);
    expect(aktuelleRestschuld(testImmobilie, new Date("2023-06-01"))).toBe(200000);
  });

  it("ist null ohne Darlehen", () => {
    expect(aktuelleRestschuld({ ...testImmobilie, darlehenssumme: 0 })).toBeNull();
  });

  it("geht nach Volltilgung nicht unter 0", () => {
    const rest = aktuelleRestschuld(
      { ...testImmobilie, darlehenssumme: 10000, monatliche_rate: 1000 },
      new Date("2030-01-01"),
    );
    expect(rest).toBe(0);
  });
});

describe("Portal nutzt dieselbe Restschuld", () => {
  it("eigenes Investment: Vermögensübersicht fortgeschrieben", () => {
    const p = eigenePosition({ id: "x", kaufpreis: 250000, ...testImmobilie });
    expect(p.restschuld).toBeLessThan(200000);
    expect(p.restschuld).toBeGreaterThan(0);
  });

  it("OS Immobilien-Investment: ohne gepflegte Restschuld wird das Darlehen fortgeschrieben", () => {
    const fin = {
      akzeptiertes_angebot_id: "a",
      angebote: [{ id: "a", darlehensbetrag: 200000, zinssatz: 3 }],
    };
    const inv = { id: "m", kaufpreis: 250000, kaufdatum: "2024-01-01", meta: { monatlicheRate: 10000 / 12 } };
    const adapted = adaptMoreImmoInvestment(inv, inv.meta, fin);
    expect(adapted.offene_tilgung).toBeNull();
    const rest = aktuelleRestschuld(adapted, new Date("2026-01-01"))!;
    expect(rest).toBeCloseTo(berechneTilgungsplan(200000, 3, 10000, 0, 2)[1].restschuld, 6);
    expect(moreImmoPosition(inv, fin).restschuld).toBeLessThan(200000);
  });
});
