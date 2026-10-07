import { describe, expect, it } from "vitest";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";

/*
 * Abgleich mit Investagon: Sigmundstraße 2, Nürnberg, Einheit 6b.
 *
 * Am 25.09.2026 wurde der Rechenkern gegen die Investagon-Kalkulation dieser
 * Einheit gelegt. Die erwarteten Werte sind aus Investagon abgelesen. Deckungs-
 * gleich sind Miete, Kosten, Rate, Cashflow vor Steuern (ab dem zweiten Jahr),
 * Wertentwicklung, Grund- und Gebäudeaufteilung, der Erhaltungsaufwand und
 * seit dem 30.09.2026 auch Kaufnebenkosten und Gebäude-AfA.
 *
 * Die Eingaben sind die von Investagon, nicht die des CRM-Imports von damals
 * (AfA 2 statt 3,5 %, Grundanteil 20 statt 18 %, kein Erhaltungsaufwand,
 * Kosten ohne Rücklage). Diese Lücke schließt der Import seit demselben Tag.
 *
 * VERBLEIBENDE ABWEICHUNGEN, alle bewusst:
 *
 * 1. Rumpfjahr. Investagon rechnet das erste Jahr ab dem Übergang anteilig,
 *    wir rechnen volle Jahre (Christian hat das Rumpfjahr am 25.09.2026
 *    abgelehnt). Deshalb stimmt der Cashflow erst ab dem zweiten Jahr (2027)
 *    überein, und alle Jahreswerte liegen um das Rumpfjahr versetzt.
 *
 * Bis zum 30.09.2026 gab es eine weitere Abweichung: Wir rechneten die
 * Kaufnebenkosten auf den ganzen Kaufpreis samt Erhaltungsaufwand (17.945
 * statt 16.195 Euro, Gebäude-AfA 9.590 statt 9.540 Euro). Seitdem laufen sie
 * wie bei Investagon nur auf den Kaufpreis ohne Erhaltungsaufwand, weil der
 * Aufwand im Notarvertrag gesondert ausgewiesen ist.
 *
 * 2. Rücklagenzuführung nicht abziehbar. Die 90 Euro Zuführung zur
 *    Instandhaltungsrücklage zählen bei beiden im Cashflow. Investagon setzt
 *    sie auch steuerlich ab, wir nicht (BFH IX R 19/24, siehe
 *    RUECKLAGENZUFUEHRUNG_ABZIEHBAR). Unser steuerliches Ergebnis liegt
 *    dadurch je Jahr um 1.080 Euro höher, die Ersparnis um 453,60 Euro
 *    niedriger.
 */

/** Die Investagon-Eingaben für Einheit 6b. */
const SIGMUNDSTRASSE_6B: InvestmentEingabe = {
  ...standardEingabe,
  propertyTitle: "Sigmundstraße 2, 6b",
  purchasePrice: 358900,
  furniturePrice: 0,
  rehabExpense: 35000,
  rehabMode: "expense",
  rehabDistributionYears: 1,
  buildingShare: 82,
  depreciationMethod: "linear",
  buildingDepreciationRate: 3.5,
  transferTaxRate: 3.5,
  notaryRate: 1,
  landRegisterRate: 0.5,
  brokerRate: 0,
  otherPurchaseCostRate: 0,
  // Kaufpreis plus 5 % Nebenkosten auf 323.900 ist 375.095; mit diesem
  // Eigenkapital bleibt genau das Darlehen von Investagon, 90 % des Kaufpreises.
  equity: 375095 - 323010,
  seniorInterestRate: 4,
  seniorRepaymentRate: 2,
  monthlyColdRent: 1650,
  monthlyOperatingCosts: 45 + 180,
  monthlyReserveContribution: 90,
  annualRentGrowth: 1.5,
  annualCostGrowth: 0,
  annualValueGrowth: 1.5,
  startYear: 2026,
  forecastYears: 15,
  financingCostRate: 0.2,
  taxCalculationMode: "manual",
  marginalTaxRate: 42,
  taxableIncomeCustomer: 0,
};

const r = berechneInvestment(SIGMUNDSTRASSE_6B);
const jahr = (jahreszahl: number) => {
  const gefunden = r.years.find((j) => j.year === jahreszahl);
  if (!gefunden) throw new Error(`Jahr ${jahreszahl} fehlt`);
  return gefunden;
};

describe("Abgleich mit Investagon: Sigmundstraße 2, Einheit 6b", () => {
  it("hat dasselbe Darlehen und dieselbe Rate", () => {
    expect(r.totalDebt).toBeCloseTo(323010, 6);
    expect(r.years[0].debtService).toBeCloseTo(19380.6, 6);
    expect(Math.round(r.monthlyDebtService * 12)).toBe(19381);
  });

  it("hat dieselben Finanzierungsnebenkosten", () => {
    expect(r.finanzierungsnebenkosten).toBeCloseTo(646.02, 6);
    expect(r.years[0].financingCostDeduction).toBeCloseTo(646.02, 6);
  });

  it("teilt den Kaufpreis wie Investagon in Grund und Gebäude", () => {
    expect(r.grundstuecksanteil).toBeCloseTo(64602, 6);
    expect(r.gebaeudeanteilKaufpreis).toBeCloseTo(294298, 6);
    expect(r.erhaltungsaufwand).toBe(35000);
    expect(r.years[0].rehabDeduction).toBe(35000);
  });

  it("hat ab dem zweiten Jahr denselben Cashflow vor Steuern (Abweichung 1: Rumpfjahr)", () => {
    // Miete 1.650 × 12 × 1,015, Kosten 225 × 12, Rücklage 90 × 12, Rate 19.380,60.
    expect(Math.round(jahr(2027).cashflowBeforeTax)).toBe(-3064);
    expect(jahr(2027).reserveContribution).toBeCloseTo(1080, 6);
  });

  it("hat denselben Wert am Ende", () => {
    expect(Math.round(jahr(2040).propertyValue)).toBe(448708);
  });

  it("rechnet die Kaufnebenkosten ohne Erhaltungsaufwand und schreibt das Gebäude mit 9.540 Euro ab", () => {
    // 5 % auf 358.900 − 35.000 = 323.900.
    expect(r.nebenkostenBasis).toBeCloseTo(323900, 6);
    expect(r.purchaseCosts).toBeCloseTo(16195, 6);
    expect(Math.round(r.years[0].buildingDepreciation)).toBe(9540);
  });

  it("rechnet mit festem Satz jährlich −Ergebnis × 42 %, auch ohne Einkommen", () => {
    for (const j of r.years) {
      expect(j.taxEffect, `Jahr ${j.year}`).toBeCloseTo(-j.taxableResult * 0.42, 6);
    }
    // Im ersten Jahr ein Verlust durch Erhaltungsaufwand und Finanzierungsnebenkosten, also eine Ersparnis.
    expect(r.years[0].taxableResult).toBeLessThan(0);
    expect(r.years[0].taxEffect).toBeGreaterThan(0);
  });

  it("zieht die Rücklagenzuführung steuerlich nicht ab (Abweichung 2)", () => {
    const wieInvestagon = berechneInvestment({
      ...SIGMUNDSTRASSE_6B,
      // So rechnete Investagon: die Rücklage in den abziehbaren Kosten.
      monthlyOperatingCosts: 45 + 180 + 90,
      monthlyReserveContribution: 0,
    });
    r.years.forEach((j, index) => {
      expect(j.cashflowBeforeTax, `Jahr ${j.year}`).toBeCloseTo(wieInvestagon.years[index].cashflowBeforeTax, 6);
      expect(j.taxableResult - wieInvestagon.years[index].taxableResult, `Jahr ${j.year}`).toBeCloseTo(1080, 6);
      expect(wieInvestagon.years[index].taxEffect - j.taxEffect, `Jahr ${j.year}`).toBeCloseTo(453.6, 6);
    });
  });
});
