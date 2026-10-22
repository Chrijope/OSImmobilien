import { describe, expect, it } from "vitest";
import { bankplan, berechneInvestment, eigenkapitalrendite, standardEingabe, type InvestmentEingabe } from "./rechenkern";

/*
 * Korrekturen und Ausbau vom 22.10.2026 (Codex-Prüfung, freigegeben von
 * Christian). Je Befund mindestens ein Test mit nachrechenbaren Zahlen.
 */

const basis: InvestmentEingabe = {
  ...standardEingabe,
  taxableIncomeCustomer: 80000,
  purchasePrice: 285000,
  transferTaxRate: 0,
  notaryRate: 0,
  landRegisterRate: 0,
  financingCostRate: 0,
  seniorInterestRate: 4.8,
  seniorRepaymentRate: 1.2,
  monthlyColdRent: 940.68,
  area: 72.36,
  constructionYear: 2026,
  forecastYears: 10,
};
const mit = (aenderung: Partial<InvestmentEingabe>) => berechneInvestment({ ...basis, ...aenderung });

describe("1. Bankdarlehen monatlich", () => {
  it("285.000 Euro, 4,8 % und 1,2 %: Zinsen Jahr 1 und Restschuld nach 10 Jahren", () => {
    const plan = bankplan({ betrag: 285000, zinsProzent: 4.8, tilgungProzent: 1.2, zinsbindungJahre: 10, anschlusszinsProzent: 0, neueTilgungProzent: 0, jahre: 10 });
    expect(plan.ersteRate).toBeCloseTo(1425, 6);
    expect(plan.jahre[0].interest).toBeCloseTo(13603.75, 0);
    expect(plan.jahre[9].closingBalance).toBeCloseTo(241214.89, 0);
    expect(plan.restschuldZinsbindung).toBeCloseTo(241214.89, 0);
  });

  it("der Rechenkern nimmt denselben Plan", () => {
    const r = mit({});
    expect(r.seniorLoanAmount).toBeCloseTo(285000, 6);
    expect(r.years[0].darlehen.bank.interest).toBeCloseTo(13603.75, 0);
    expect(r.years[9].remainingDebt).toBeCloseTo(241214.89, 0);
    expect(r.monthlyDebtService).toBeCloseTo(1425, 6);
  });

  it("Anschluss: Restschuld × (Anschlusszins + neue Tilgung) ÷ 12", () => {
    const plan = bankplan({ betrag: 285000, zinsProzent: 4.8, tilgungProzent: 1.2, zinsbindungJahre: 10, anschlusszinsProzent: 6, neueTilgungProzent: 2, jahre: 11 });
    expect(plan.monatsraten[120]).toBeCloseTo((plan.restschuldZinsbindung * 0.08) / 12, 6);
    expect(plan.jahre[10].zinssatz).toBeCloseTo(0.06, 9);
  });

  it("auch das Nachrangdarlehen rechnet monatlich", () => {
    const r = mit({ equity: 0, juniorLoanAmount: 20000, juniorInterestRate: 6, juniorRepaymentRate: 2 });
    const rate = (20000 * 0.08) / 12;
    expect(r.years[0].darlehen.nachrang.interest).toBeLessThan(1200);
    expect(r.years[0].darlehen.nachrang.payment).toBeCloseTo(rate * 12, 6);
  });
});

describe("10. Finanzierungsvarianten", () => {
  const p = { betrag: 100000, zinsProzent: 4, tilgungProzent: 2, zinsbindungJahre: 0, anschlusszinsProzent: 0, neueTilgungProzent: 0 };

  it("Volltilgung: die Rate tilgt genau in der Laufzeit", () => {
    const plan = bankplan({ ...p, tilgungsart: "volltilgung", laufzeitJahre: 20, jahre: 21 });
    const i = 0.04 / 12;
    expect(plan.ersteRate).toBeCloseTo((100000 * i) / (1 - (1 + i) ** -240), 6);
    expect(plan.jahre[19].closingBalance).toBe(0);
    expect(plan.jahre[18].closingBalance).toBeGreaterThan(0);
  });

  it("endfällig: nur Zinsen, am Ende die Schlusszahlung", () => {
    const plan = bankplan({ ...p, tilgungsart: "endfaellig", laufzeitJahre: 5, jahre: 6 });
    expect(plan.jahre[0].interest).toBeCloseTo(4000, 6);
    expect(plan.jahre[0].principal).toBe(0);
    expect(plan.jahre[3].closingBalance).toBeCloseTo(100000, 6);
    expect(plan.jahre[4].principal).toBeCloseTo(100000, 6);
    expect(plan.jahre[4].closingBalance).toBe(0);
  });

  it("tilgungsfreie Anlaufzeit: erst Zinsen, dann die volle Rate", () => {
    const plan = bankplan({ ...p, tilgungsfreiJahre: 2, jahre: 3 });
    expect(plan.jahre[1].principal).toBe(0);
    expect(plan.monatsraten[23]).toBeCloseTo(100000 * 0.04 / 12, 6);
    expect(plan.monatsraten[24]).toBeCloseTo(100000 * 0.06 / 12, 6);
  });

  it("mehrere Anschlussfinanzierungen mit Umschuldungskosten", () => {
    const plan = bankplan({
      ...p,
      zinsbindungJahre: 5,
      anschlusszinsProzent: 5,
      neueTilgungProzent: 3,
      anschlusskosten: 500,
      weitereAnschluesse: [{ nachJahren: 10, zinsProzent: 6, tilgungProzent: 4, kosten: 300 }],
      jahre: 12,
    });
    expect(plan.jahre[5].zinssatz).toBeCloseTo(0.05, 9);
    expect(plan.jahre[10].zinssatz).toBeCloseTo(0.06, 9);
    expect(plan.jahre[5].umschuldungskosten).toBe(500);
    expect(plan.jahre[10].umschuldungskosten).toBe(300);
    const restNach10 = plan.jahre[9].closingBalance;
    expect(plan.monatsraten[120]).toBeCloseTo((restNach10 * 0.1) / 12, 6);
  });

  it("Umschuldungskosten mindern Cashflow und steuerliches Ergebnis", () => {
    const ohne = mit({ seniorFixedRateYears: 2, seniorFollowUpRate: 5 });
    const mitKosten = mit({ seniorFixedRateYears: 2, seniorFollowUpRate: 5, seniorFollowUpCosts: 1000 });
    expect(mitKosten.years[2].umschuldungskosten).toBe(1000);
    expect(ohne.years[2].cashflowBeforeTax - mitKosten.years[2].cashflowBeforeTax).toBeCloseTo(1000, 6);
    expect(ohne.years[2].taxableResult - mitKosten.years[2].taxableResult).toBeCloseTo(1000, 6);
  });

  it("zweites Bankdarlehen: Anschluss mit eigener neuer Tilgung", () => {
    const r = mit({ secondLoanAmount: 50000, secondInterestRate: 4, secondRepaymentRate: 2, secondFixedRateYears: 3, secondFollowUpRate: 5, secondFollowUpRepaymentRate: 4 });
    const plan = bankplan({ betrag: 50000, zinsProzent: 4, tilgungProzent: 2, zinsbindungJahre: 3, anschlusszinsProzent: 5, neueTilgungProzent: 4, jahre: 10 });
    expect(r.years[3].darlehen.bank2.payment).toBeCloseTo(plan.jahre[3].payment, 6);
    expect(plan.monatsraten[36]).toBeCloseTo((plan.restschuldZinsbindung * 0.09) / 12, 6);
  });
});

describe("9. Rendite der Wohnung und des Pakets", () => {
  const r = mit({ garagePrice: 15000, monthlyGarageRent: 80 });
  it("Christians Beispiel: 270.000 + 15.000 Euro, 940,68 + 80 Euro Miete", () => {
    expect(r.kaufpreisWohnung).toBeCloseTo(270000, 6);
    expect(r.grossYieldWohnung).toBeCloseTo(0.041808, 6);
    expect(r.kaufpreisfaktorWohnung!).toBeCloseTo(23.92, 2);
    expect(r.grossYield).toBeCloseTo(0.042976, 6);
    expect(r.kaufpreisfaktor!).toBeCloseTo(23.27, 2);
  });
  it("ohne Stellplatz sind Wohnung und gesamt gleich", () => {
    const ohne = mit({});
    expect(ohne.grossYieldWohnung).toBeCloseTo(ohne.grossYield, 12);
    expect(ohne.netYieldWohnung).toBeCloseTo(ohne.netYield, 12);
  });
});

describe("5. Erwerbsmonat", () => {
  const juli = mit({ acquisitionMonth: 7, furniturePrice: 12000 });
  const januar = mit({ furniturePrice: 12000 });
  it("Miete, Kosten und AfA im ersten Jahr zeitanteilig", () => {
    expect(juli.ersterJahresanteil).toBeCloseTo(0.5, 12);
    expect(juli.years[0].grossRent).toBeCloseTo(januar.years[0].grossRent / 2, 6);
    expect(juli.years[0].buildingDepreciation).toBeCloseTo(januar.years[0].buildingDepreciation / 2, 6);
    expect(juli.years[0].furnitureDepreciation).toBeCloseTo(januar.years[0].furnitureDepreciation / 2, 6);
    expect(juli.years[1].grossRent).toBeCloseTo(januar.years[1].grossRent, 6);
  });
  it("Zinsen nur ab dem Übergang, die Monatsrate bleibt", () => {
    // Sechs Monate: Juli bis Dezember sind die ersten sechs Monate des Darlehens.
    const sechs = bankplan({ betrag: 285000, zinsProzent: 4.8, tilgungProzent: 1.2, zinsbindungJahre: 10, anschlusszinsProzent: 0, neueTilgungProzent: 0, jahre: 1, startMonat: 7 });
    expect(sechs.monatsraten).toHaveLength(6);
    expect(juli.years[0].darlehen.bank.interest).toBeCloseTo(sechs.jahre[0].interest, 6);
    expect(juli.years[0].darlehen.bank.interest).toBeGreaterThan(januar.years[0].darlehen.bank.interest / 2);
    expect(juli.years[1].darlehen.bank.interest).toBeCloseTo(januar.years[0].darlehen.bank.interest - 0, -3);
    expect(juli.monthlyDebtService).toBeCloseTo(januar.monthlyDebtService, 9);
  });
  it("die Möbel werden über die Nutzungsdauer genau einmal voll abgeschrieben", () => {
    const lang = mit({ acquisitionMonth: 7, furniturePrice: 12000, forecastYears: 15 });
    const summe = lang.years.reduce((s, j) => s + j.furnitureDepreciation, 0);
    expect(summe).toBeCloseTo(12000, 6);
    expect(lang.years[10].furnitureDepreciation).toBeCloseTo(600, 6);
  });
  it("die Sonder-AfA nach § 7b ist nicht zeitanteilig", () => {
    const j = mit({ acquisitionMonth: 12, specialDepreciationRate: 5, specialDepreciationYears: 4 });
    expect(j.years[0].specialDepreciation).toBeCloseTo(j.years[1].specialDepreciation, 6);
  });
});

describe("6. Möbel-AfA auf den Restbuchwert begrenzt", () => {
  it("Nutzungsdauer 7,5 Jahre schreibt nicht mehr als den Möbelanteil ab", () => {
    const r = mit({ furniturePrice: 15000, furnitureDepreciationYears: 7.5 });
    const summe = r.years.reduce((s, j) => s + j.furnitureDepreciation, 0);
    expect(summe).toBeCloseTo(15000, 6);
    expect(r.years[7].furnitureDepreciation).toBeCloseTo(1000, 6);
    expect(r.years[8].furnitureDepreciation).toBe(0);
  });
});

describe("2. Sonder-AfA § 7b", () => {
  it("Bemessungsgrundlage höchstens 4.000 Euro je m²", () => {
    // Gebäude 80 % von 285.000 = 228.000 Euro, 72,36 m²: 3.150,91 Euro je m², unter beiden Grenzen.
    const r = mit({ specialDepreciationRate: 5, specialDepreciationYears: 4 });
    expect(r.sonderAfa.zulaessig).toBe(true);
    expect(r.sonderAfa.bemessungsgrundlage).toBeCloseTo(228000, 6);
    expect(r.years[0].specialDepreciation).toBeCloseTo(11400, 6);
    // Kleiner Wohnfläche: 50 m² heißt 4.560 Euro je m², über 4.000, unter 5.200.
    const klein = mit({ area: 50, specialDepreciationRate: 5, specialDepreciationYears: 4 });
    expect(klein.sonderAfa.bemessungsgrundlage).toBeCloseTo(200000, 6);
    expect(klein.years[0].specialDepreciation).toBeCloseTo(10000, 6);
  });
  it("über 5.200 Euro je m² Baukosten entfällt sie ganz", () => {
    const r = mit({ area: 40, specialDepreciationRate: 5, specialDepreciationYears: 4 });
    expect(r.sonderAfa.baukostenJeQm).toBeCloseTo(5700, 6);
    expect(r.sonderAfa.zulaessig).toBe(false);
    expect(r.years.every((j) => j.specialDepreciation === 0)).toBe(true);
    expect(r.sonderAfa.hinweis).toMatch(/Obergrenze/);
  });
  it("ohne Wohnfläche keine Sonder-AfA, Satz und Dauer gedeckelt", () => {
    expect(mit({ area: 0, specialDepreciationRate: 5 }).sonderAfa.zulaessig).toBe(false);
    const r = mit({ specialDepreciationRate: 8, specialDepreciationYears: 6 });
    expect(r.sonderAfa.satz).toBe(5);
    expect(r.sonderAfa.jahre).toBe(4);
    expect(r.years[4].specialDepreciation).toBe(0);
  });
});

describe("3. AfA nach der Sonder-AfA", () => {
  it("linear: Restwert über die Restnutzungsdauer (§ 7a Abs. 9)", () => {
    const r = mit({ buildingDepreciationRate: 3, specialDepreciationRate: 5, specialDepreciationYears: 4 });
    const basisAfa = 228000;
    expect(r.years[0].buildingDepreciation).toBeCloseTo(basisAfa * 0.03, 6);
    const restwert = basisAfa - 4 * (basisAfa * 0.03 + basisAfa * 0.05);
    expect(r.years[4].buildingDepreciation).toBeCloseTo(restwert / (100 / 3 - 4), 6);
    expect(r.years[5].buildingDepreciation).toBeCloseTo(r.years[4].buildingDepreciation, 6);
  });
  it("degressiv: Sonder-AfA mindert den degressiven Buchwert, Wechsel zu linear, wenn günstiger", () => {
    const r = mit({ depreciationMethod: "declining", buildingDepreciationRate: 5, specialDepreciationRate: 5, specialDepreciationYears: 4, forecastYears: 30 });
    const j0 = 228000 * 0.05;
    expect(r.years[0].buildingDepreciation).toBeCloseTo(j0, 6);
    const buchwert1 = 228000 - j0 - 228000 * 0.05;
    expect(r.years[1].buildingDepreciation).toBeCloseTo(buchwert1 * 0.05, 6);
    // Irgendwann ist linear aus dem Restwert günstiger, danach bleibt der Betrag gleich.
    const letzte = r.years.slice(-3).map((j) => j.buildingDepreciation);
    expect(letzte[1]).toBeCloseTo(letzte[0], 6);
    expect(letzte[2]).toBeCloseTo(letzte[0], 6);
  });
});

describe("7. Sanierungsanteil: zwei Fälle und 15-Prozent-Grenze", () => {
  // Gebäude ohne Aufwand: 80 % von 285.000 minus Aufwand. 15 % davon ist die Grenze.
  const darunter = mit({ rehabExpense: 20000 });
  const darueber = mit({ rehabExpense: 40000 });
  it("nach dem Kauf, unter der Grenze: Sofortabzug", () => {
    expect(darunter.fuenfzehnProzentGrenze).toBeCloseTo((228000 - 20000) * 0.15, 6);
    expect(darunter.anschaffungsnah).toBe(false);
    expect(darunter.years[0].rehabDeduction).toBeCloseTo(20000, 6);
    expect(darunter.depreciationBasis).toBeCloseTo(208000, 6);
  });
  it("nach dem Kauf, über der Grenze: anschaffungsnah, AfA statt Sofortabzug", () => {
    expect(darueber.anschaffungsnah).toBe(true);
    expect(darueber.simpleThresholdExceeded).toBe(true);
    expect(darueber.years[0].rehabDeduction).toBe(0);
    expect(darueber.depreciationBasis).toBeCloseTo(228000, 6);
  });
  it("nach dem Kauf: der Aufwand bleibt außerhalb der Grunderwerbsteuer", () => {
    const r = mit({ rehabExpense: 20000, transferTaxRate: 6.5 });
    expect(r.grunderwerbsteuer).toBeCloseTo(265000 * 0.065, 6);
  });
  it("durch den Verkäufer: Anschaffungskosten und Kaufnebenkosten auf den ganzen Preis", () => {
    const r = mit({ rehabExpense: 20000, transferTaxRate: 6.5, rehabScenario: "durchVerkaeufer" });
    expect(r.grunderwerbsteuer).toBeCloseTo(285000 * 0.065, 6);
    expect(r.sanierungAktiviert).toBe(true);
    expect(r.anschaffungsnah).toBe(false);
    expect(r.years[0].rehabDeduction).toBe(0);
    expect(r.depreciationBasis).toBeCloseTo(228000 + 285000 * 0.065 * 0.8, 6);
  });
});

describe("8. Kleinere Punkte", () => {
  it("manueller Satz: ohne Steuerlast keine Erstattung, Bestandteile ergeben die Summe", () => {
    const ohneEinkommen = mit({ taxableIncomeCustomer: 0, taxCalculationMode: "manual", marginalTaxRate: 42, rehabExpense: 20000 });
    expect(ohneEinkommen.years[0].taxEffect).toBe(0);
    expect(ohneEinkommen.erstattungBegrenzt).toBe(true);
    const r = mit({ taxCalculationMode: "manual", marginalTaxRate: 42, churchTaxRate: 9, rehabExpense: 20000 });
    for (const j of r.years) {
      expect(j.taxAfter.incomeTax + j.taxAfter.solidarity + j.taxAfter.churchTax).toBeCloseTo(j.taxAfter.totalTax, 6);
      expect(j.taxAfter.totalTax).toBeGreaterThanOrEqual(0);
    }
  });
  it("Eigentumsquote gilt auch bei Zusammenveranlagung", () => {
    const r = mit({ jointAssessment: true, investmentShare: 50, taxableIncomeSpouse: 30000 });
    expect(r.anteil).toBe(0.5);
    expect(r.kaufpreisGesamt).toBeCloseTo(142500, 6);
  });
  it("negative Miet- und Wertentwicklung wird gerechnet", () => {
    const r = mit({ annualRentGrowth: -2, annualValueGrowth: -1 });
    expect(r.years[1].grossRent).toBeCloseTo(r.years[0].grossRent * 0.98, 6);
    expect(r.years[0].wertzuwachs).toBeCloseTo(-285000 * 0.01, 6);
  });
  it("Verkaufskosten mindern den internen Zinsfuß", () => {
    const ohne = mit({ equity: 30000 });
    const mitKosten = mit({ equity: 30000, saleCostRate: 5 });
    expect(mitKosten.verkaufskosten).toBeCloseTo(ohne.years[9].propertyValue * 0.05, 6);
    expect(mitKosten.irr!).toBeLessThan(ohne.irr!);
  });
  it("Modellrendite mit zeitanteiligem ersten Jahr", () => {
    const r = mit({ equity: 30000, acquisitionMonth: 7 });
    const ekr = eigenkapitalrendite({ equity: 30000 }, r);
    expect(ekr.zuzahlungMonat).toBeCloseTo(Math.max(0, -r.years[0].cashflowBeforeTax / 6), 6);
  });
});

/* Codex-Nachprüfung vom 22.10.2026. */
describe("Nachprüfung: IRR mit Zahlungszeitpunkten", () => {
  it("Dezembererwerb, 100 % Eigenkapital, 12 % Wertsteigerung, Verkauf Ende Jahr 1: 12 % p. a.", () => {
    const r = berechneInvestment({
      ...standardEingabe,
      purchasePrice: 100000,
      equity: 100000,
      transferTaxRate: 0,
      notaryRate: 0,
      landRegisterRate: 0,
      financingCostRate: 0,
      annualValueGrowth: 12,
      forecastYears: 1,
      acquisitionMonth: 12,
    });
    expect(r.totalDebt).toBe(0);
    expect(r.irr!).toBeCloseTo(0.12, 6);
  });
});

describe("Nachprüfung: 15-Prozent-Grenze netto", () => {
  // Gebäude ohne Aufwand 228.000 − 36.000 = 192.000, Grenze 28.800 netto.
  const auf = (rehabVatRate: number) => mit({ rehabExpense: 36000, rehabVatRate });
  it("brutto 36.000 mit 19 % USt sind netto 30.252 und damit über der Grenze", () => {
    expect(auf(19).erhaltungsaufwandNetto).toBeCloseTo(36000 / 1.19, 6);
    expect(auf(19).anschaffungsnah).toBe(true);
  });
  it("mit höherem Steueranteil netto darunter: Sofortabzug des Bruttobetrags", () => {
    const r = mit({ rehabExpense: 34000, rehabVatRate: 19 });
    // 34.000 brutto sind 28.571 netto, unter 15 % von 194.000 = 29.100.
    expect(r.anschaffungsnah).toBe(false);
    expect(r.years[0].rehabDeduction).toBeCloseTo(34000, 6);
    // Ohne USt-Anteil wären es 34.000 netto, also über der Grenze.
    expect(mit({ rehabExpense: 34000, rehabVatRate: 0 }).anschaffungsnah).toBe(true);
  });
});

describe("Nachprüfung: Folge-AfA erst nach dem gesetzlichen Begünstigungszeitraum", () => {
  it("zwei Jahre Sonder-AfA: Jahre 3 und 4 lineare AfA vom Ausgangswert, ab Jahr 5 Restwert über Restnutzungsdauer", () => {
    const r = mit({ buildingDepreciationRate: 3, specialDepreciationRate: 5, specialDepreciationYears: 2 });
    const basisAfa = 228000;
    expect(r.years[2].specialDepreciation).toBe(0);
    expect(r.years[2].buildingDepreciation).toBeCloseTo(basisAfa * 0.03, 6);
    expect(r.years[3].buildingDepreciation).toBeCloseTo(basisAfa * 0.03, 6);
    const restwert = basisAfa - 4 * basisAfa * 0.03 - 2 * basisAfa * 0.05;
    expect(r.years[4].buildingDepreciation).toBeCloseTo(restwert / (100 / 3 - 4), 6);
  });
});
