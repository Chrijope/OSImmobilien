import { describe, expect, it } from "vitest";
import golden from "./rechenkern.golden.json";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";

/*
 * Garagenmiete, seit dem 19.10.2026 (Christian): Sie zählt in allen
 * Berechnungen zur Kaltmiete der Wohnung. 100 € Garage müssen also genau
 * dasselbe ergeben wie 100 € mehr Kaltmiete.
 */
const basis = { ...standardEingabe, ...(golden as any).standard.input } as InvestmentEingabe;

describe("Garagenmiete", () => {
  it("rechnet wie eine um die Garagenmiete höhere Kaltmiete", () => {
    const mitGarage = berechneInvestment({ ...basis, monthlyGarageRent: 100 });
    const hoehereMiete = berechneInvestment({ ...basis, monthlyColdRent: basis.monthlyColdRent + 100, monthlyGarageRent: 0 });
    expect(mitGarage.years).toEqual(hoehereMiete.years);
    expect(mitGarage.grossYield).toBe(hoehereMiete.grossYield);
  });

  it("ändert ohne Garage nichts", () => {
    expect(berechneInvestment({ ...basis, monthlyGarageRent: 0 })).toEqual(berechneInvestment(basis));
  });

  it("gespeicherte Stände ohne Feld rechnen mit 0", () => {
    const { monthlyGarageRent: _weg, ...ohne } = { ...basis, monthlyGarageRent: 0 };
    expect(berechneInvestment(ohne as InvestmentEingabe)).toEqual(berechneInvestment({ ...basis, monthlyGarageRent: 0 }));
  });
});
