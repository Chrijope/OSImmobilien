import { describe, expect, it } from "vitest";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { berechnungAusRechner } from "./ausfuehrlicheBerechnung";

const eingabe: InvestmentEingabe = {
  ...standardEingabe,
  propertyTitle: "Musterstraße 12, WE 4", address: "Musterstraße 12, 04109 Leipzig", area: 68, rooms: 2,
  purchasePrice: 332000, garagePrice: 15000, monthlyColdRent: 1150, monthlyGarageRent: 60,
  housingFeeNonRecoverable: 95, monthlyReserveContribution: 68, monthlyReserveContributionAuto: false,
  taxCalculationMode: "manual", marginalTaxRate: 42, annualGrossIncome: 85000, taxClass: "I", clientAge: 40, retirementAge: 67,
};
const rechne = (e: InvestmentEingabe) => berechnungAusRechner([{ input: e, result: berechneInvestment(e) }]);

describe("berechnungAusRechner", () => {
  it("rechnet ohne Subvention genau mit der heutigen Miete", () => {
    const { A } = rechne(eingabe);
    expect(A.mieteSub).toBe(1150);
    expect(A.luecke).toBe(0);
    expect(A.einheit.nr).toBe("4");
    expect(A.einheit.kpWohnung).toBe(317000);
  });

  it("nimmt Kundenangaben aus „Kunde & Einkommen“, eigene Angaben gehen vor", () => {
    expect(rechne(eingabe).v.kunde).toMatchObject({ bruttoJahr: 85000, steuerklasse: "I", jahreBisRente: 27 });
    const eigen = rechne({ ...eingabe, ausfuehrlich: { kunde: { netto: 3500, jahreBisRente: 20 }, mieteSubQm: 18 } });
    expect(eigen.v.kunde).toMatchObject({ netto: 3500, jahreBisRente: 20, bruttoJahr: 85000 });
    expect(eigen.A.mieteSub).toBe(1224);
  });

  it("Vergleichsangebot (13.11.2026): zweite Finanzierung mit eigenen Sätzen, leere Sätze wie Angebot 1", () => {
    const e = { ...eingabe, seniorInterestRate: 4.69, seniorRepaymentRate: 1.25, seniorFixedRateYears: 10, juniorFixedRateYears: 5,
      ausfuehrlich: { bankBetrag: 300000, nachrangBetrag: 32000, vaBankBetrag: 300050, vaZins: 0.0466, vaTilgung: 0.015, vaNachrangBetrag: 60000 } };
    const { v } = rechne(e);
    expect(v.annahmen.vergleichsangebot).toEqual({
      darlehenBetrag: 300050, zins: 0.0466, tilgung: 0.015, zinsbindungJahre: 10,
      nachrangBetrag: 60000, nachrangZins: v.annahmen.nachrangZins, nachrangTilgung: v.annahmen.nachrangTilgung, nachrangZinsbindungJahre: 5,
    });
    expect(rechne(eingabe).v.annahmen.vergleichsangebot).toBeUndefined();
  });
});
