import { describe, expect, it } from "vitest";
import {
  berechneInvestment,
  eigenkapitalrendite,
  eigenkapitalrenditeNebenkosten,
  standardEingabe,
  type InvestmentEingabe,
} from "./rechenkern";
import { rechenwege } from "./kennzahlErklaerungen";

/*
 * Eigenkapitalrendite, Christians Formel vom 30.09.2026:
 *
 *   (Vermögensaufbau im Zeitraum ÷ Jahre) ÷ (Eigenkapital + Zuzahlung vor Steuer je Monat × 12)
 *
 * Die Zuzahlung ist der angezeigte „Cashflow vor Steuer pro Monat“ im ersten
 * Jahr, ein Überschuss zählt 0. Christians Standardbeispiel: 300.000 €
 * Gesamtkaufpreis mit 20.000 € Erhaltungsaufwand und 15.000 € Möbeln, Bayern
 * 3,5/1,0/0,5 %, also 13.250 € Kaufnebenkosten auf 265.000 €.
 */
const BEISPIEL: InvestmentEingabe = {
  ...standardEingabe,
  purchasePrice: 300_000,
  rehabExpense: 20_000,
  furniturePrice: 15_000,
  transferTaxRate: 3.5,
  notaryRate: 1,
  landRegisterRate: 0.5,
  brokerRate: 0,
  otherPurchaseCostRate: 0,
  monthlyColdRent: 950,
  monthlyOperatingCosts: 60,
  monthlyReserveContribution: 40,
  taxableIncomeCustomer: 80_000,
  seniorInterestRate: 4,
  seniorRepaymentRate: 1.5,
  annualValueGrowth: 1.5,
  forecastYears: 10,
};

const A = { ...BEISPIEL, equity: 13_250 };
const B = { ...BEISPIEL, equity: 0 };
const C = { ...BEISPIEL, equity: 43_250 };

const glatt = (text: string | undefined) => (text ?? "").replace(/ | /g, " ");

describe("Eigenkapitalrendite nach Christians Formel", () => {
  it("A: Nebenkosten aus Eigenkapital", () => {
    const ergebnis = berechneInvestment(A);
    const ekr = eigenkapitalrendite(A, ergebnis);
    expect(ergebnis.purchaseCosts).toBeCloseTo(13_250, 6);
    expect(ekr.eigenkapital).toBe(13_250);
    // Miete 950 − Rate 1.375 − Kosten 60 − Rücklage 40 = −525 € vor Steuer.
    expect(ekr.zuzahlungMonat).toBeCloseTo(525, 6);
    expect(ekr.zuzahlungMonat).toBeCloseTo(-ergebnis.years[0].cashflowBeforeTax / 12, 10);
    expect(ekr.vermoegensaufbau).toBeCloseTo(ergebnis.vermoegensaufbauMonat * 120, 6);
    expect(ekr.rendite).toBeCloseTo(ekr.vermoegensaufbau / 10 / (13_250 + 525 * 12), 10);
    expect(ekr.rendite).toBeCloseTo(0.4337, 4);
    expect(glatt(rechenwege(A, ergebnis).eigenkapitalrendite?.text)).toBe(
      "(Vermögensaufbau 84.782 € ÷ 10 Jahre) ÷ (Eigenkapital 13.250 € + Zuzahlung vor Steuer 525,00 € × 12) = 43,4 %",
    );
  });

  it("B: alles finanziert, nur die Zuzahlung im Nenner", () => {
    const ergebnis = berechneInvestment(B);
    const ekr = eigenkapitalrendite(B, ergebnis);
    expect(ekr.eigenkapital).toBe(0);
    expect(ekr.nenner).toBeCloseTo(585.73 * 12, 1);
    expect(ekr.rendite).toBeCloseTo(1.0516, 4);
    expect(glatt(rechenwege(B, ergebnis).eigenkapitalrendite?.text)).toMatch(/= 105,2 %$/);
  });

  it("C: mehr Eigenkapital, kleinere Rendite", () => {
    const ergebnis = berechneInvestment(C);
    const ekr = eigenkapitalrendite(C, ergebnis);
    expect(ekr.rendite).toBeCloseTo(0.1657, 4);
    expect(glatt(rechenwege(C, ergebnis).eigenkapitalrendite?.text)).toMatch(/= 16,6 %$/);
  });

  it("zählt einen Überschuss vor Steuer als 0 und ist ohne Eigenkapital dann nicht bestimmbar", () => {
    const eingabe = { ...B, monthlyColdRent: 2_000 };
    const ergebnis = berechneInvestment(eingabe);
    const ekr = eigenkapitalrendite(eingabe, ergebnis);
    expect(ergebnis.years[0].cashflowBeforeTax).toBeGreaterThan(0);
    expect(ekr.zuzahlungMonat).toBe(0);
    expect(ekr.nenner).toBe(0);
    expect(ekr.rendite).toBeNull();
    expect(rechenwege(eingabe, ergebnis).eigenkapitalrendite).toBeNull();
  });

  it("nimmt den Cashflow vor Steuer, nicht den nach Steuer", () => {
    // Nach Steuer ist das erste Jahr hier ein Überschuss, vor Steuer nicht.
    const ergebnis = berechneInvestment(A);
    expect(ergebnis.years[0].cashflowAfterTax).toBeGreaterThan(0);
    expect(eigenkapitalrendite(A, ergebnis).zuzahlungMonat).toBeGreaterThan(0);
  });

  it("teilt durch den eingestellten Zeitraum, nicht fest durch zehn", () => {
    const eingabe = { ...A, forecastYears: 15 };
    const ergebnis = berechneInvestment(eingabe);
    const ekr = eigenkapitalrendite(eingabe, ergebnis);
    expect(ekr.jahre).toBe(15);
    expect(ekr.rendite).toBeCloseTo(ekr.vermoegensaufbau / 15 / ekr.nenner, 10);
    expect(glatt(rechenwege(eingabe, ergebnis).eigenkapitalrendite?.text)).toMatch(/÷ 15 Jahre\)/);
  });

  it("zeigt einen negativen Vermögensaufbau als negative Rendite", () => {
    // Eine negative Wertsteigerung kappt der Kern auf null. Negativ wird der
    // Vermögensaufbau, wenn die Möbel mehr an Wert verlieren, als getilgt wird.
    const eingabe = { ...C, annualValueGrowth: 0, seniorRepaymentRate: 0.1 };
    const ergebnis = berechneInvestment(eingabe);
    const ekr = eigenkapitalrendite(eingabe, ergebnis);
    expect(ekr.vermoegensaufbau).toBeLessThan(0);
    expect(ekr.rendite).toBeLessThan(0);
    expect(glatt(rechenwege(eingabe, ergebnis).eigenkapitalrendite?.text)).toMatch(/= −\d/);
  });
});

describe("Gegenfall zu den Kaufnebenkosten, mit derselben Regel", () => {
  it("A: selbst gezahlt, mitfinanziert wäre es Fall B und die Rate stiege", () => {
    const n = eigenkapitalrenditeNebenkosten(A, berechneInvestment(A));
    const b = eigenkapitalrendite(B, berechneInvestment(B));
    expect(n?.selbstGezahlt).toBe(true);
    expect(n?.vergleich.eigenkapital).toBe(0);
    expect(n?.vergleich.rendite).toBeCloseTo(b.rendite ?? Number.NaN, 10);
    expect(n?.rateDifferenzMonat).toBeCloseTo(60.73, 2);
  });

  it("B: mitfinanziert, selbst gezahlt wäre es Fall A und die Rate sänke", () => {
    const n = eigenkapitalrenditeNebenkosten(B, berechneInvestment(B));
    const a = eigenkapitalrendite(A, berechneInvestment(A));
    expect(n?.selbstGezahlt).toBe(false);
    expect(n?.vergleich.rendite).toBeCloseTo(a.rendite ?? Number.NaN, 10);
    expect(n?.rateDifferenzMonat).toBeCloseTo(-60.73, 2);
  });

  it("C: rechnet mit Eigenkapital minus Kaufnebenkosten", () => {
    const n = eigenkapitalrenditeNebenkosten(C, berechneInvestment(C));
    expect(n?.selbstGezahlt).toBe(true);
    expect(n?.vergleich.eigenkapital).toBeCloseTo(30_000, 6);
    expect(n?.vergleich.rendite).toBeCloseTo(0.2311, 4);
  });

  it("schweigt ohne Kaufnebenkosten", () => {
    const eingabe = { ...A, transferTaxRate: 0, notaryRate: 0, landRegisterRate: 0 };
    expect(eigenkapitalrenditeNebenkosten(eingabe, berechneInvestment(eingabe))).toBeNull();
  });
});
