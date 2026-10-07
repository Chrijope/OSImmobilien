import { describe, it, expect } from "vitest";
import { ANNAHMEN, calculateScore, type AnalysisData } from "@/lib/scoringEngine";

const BASIS: AnalysisData = {
  age: 38,
  familyStatus: "verheiratet",
  householdSize: 2,
  dependents: 0,
  livingSituation: "miete",
  profession: "angestellt",
  employmentType: "unbefristet",
  employmentDuration: 8,
  netIncome: 4500,
  additionalIncome: 0,
  savingsRate: 600,
  equity: 40000,
  liquidityReserve: 15000,
  existingLoans: 0,
  monthlyFixedCosts: 1800,
  existingProperties: 0,
  investmentExperience: "wenig",
  realEstateExperience: "keine",
  goals: ["vermoegensaufbau", "steuerersparnis"],
  incomeClass: "50k_80k",
  taxOptimizationInterest: true,
  financingWillingness: "ja",
} as AnalysisData;

const ergebnis = (over: Partial<AnalysisData> = {}, opt?: { afaSatzProzent?: number }) =>
  calculateScore({ ...BASIS, ...over }, opt);

describe("Investition und Kaufnebenkosten", () => {
  it("rechnet die Kaufnebenkosten in die Investition ein", () => {
    const p = ergebnis().projection;
    expect(p.kaufnebenkosten).toBeCloseTo(p.purchasePrice * (ANNAHMEN.kaufnebenkostenProzent / 100), 0);
    expect(p.gesamtinvestition).toBe(p.purchasePrice + p.kaufnebenkosten);
  });

  it("finanziert die Gesamtinvestition abzüglich Eigenkapital", () => {
    const p = ergebnis().projection;
    expect(p.loanAmount).toBeCloseTo(p.gesamtinvestition - p.equityInvested, 0);
  });

  it("verlangt ohne Kaufnebenkosten nicht weniger Kapital als mit", () => {
    // Regression: Vorher fehlten die Nebenkosten komplett, dadurch war das
    // Darlehen zu klein und die Rendite zu hoch.
    const p = ergebnis().projection;
    expect(p.loanAmount).toBeGreaterThan(p.purchasePrice - p.equityInvested - 1);
  });
});

describe("Vermögensverlauf", () => {
  it("zählt die Miete nicht doppelt", () => {
    const p = ergebnis().projection;
    for (const j of p.yearlyData) {
      // Nettovermögen ist Wert minus Restschuld, nichts anderes.
      expect(j.totalWealth).toBe(Math.round(j.propertyValue - j.remainingLoan));
      expect(j.totalWealth).toBeLessThan(j.propertyValue + 1);
    }
  });

  it("passt im letzten Jahr zur ausgewiesenen Vermögenszahl", () => {
    const p = ergebnis().projection;
    const letztes = p.yearlyData[p.yearlyData.length - 1];
    // Die große Kennzahl zieht zusätzlich die Verkaufskosten ab, sonst gleich.
    const erwartet = letztes.totalWealth - Math.round(p.estimatedValueAfter10Years * (ANNAHMEN.verkaufskostenProzent / 100));
    expect(Math.abs(p.wealthAfter10Years - erwartet)).toBeLessThan(2);
  });

  it("lässt die Restschuld sinken und den Wert steigen", () => {
    const p = ergebnis().projection;
    for (let i = 1; i < p.yearlyData.length; i++) {
      expect(p.yearlyData[i].remainingLoan).toBeLessThanOrEqual(p.yearlyData[i - 1].remainingLoan);
      expect(p.yearlyData[i].propertyValue).toBeGreaterThanOrEqual(p.yearlyData[i - 1].propertyValue);
    }
  });

  it("führt das eingesetzte Kapital monoton mit", () => {
    const p = ergebnis().projection;
    for (let i = 1; i < p.yearlyData.length; i++) {
      expect(p.yearlyData[i].eingesetztesKapital).toBeGreaterThanOrEqual(p.yearlyData[i - 1].eingesetztesKapital);
    }
  });
});

describe("Rendite", () => {
  it("misst den Gewinn am tatsächlich eingesetzten Kapital", () => {
    const p = ergebnis().projection;
    expect(p.eingesetztesKapital).toBeGreaterThanOrEqual(p.equityInvested);
    expect(p.netProfit).toBe(Math.round(p.wealthAfter10Years - p.eingesetztesKapital));
  });

  it("bleibt in einem plausiblen Bereich", () => {
    // Regression: Vorher wurde die kumulierte Miete addiert, ohne die Raten
    // abzuziehen. Das ergab Renditen von mehreren hundert Prozent.
    const p = ergebnis().projection;
    expect(p.returnOnEquity).toBeLessThan(400);
  });
});

describe("AfA", () => {
  it("nimmt als Vorgabe den gesetzlichen Satz", () => {
    expect(ergebnis().projection.afaSatzProzent).toBe(ANNAHMEN.afaSatzProzent);
    expect(ANNAHMEN.afaSatzProzent).toBe(2);
  });

  it("lässt sich auf den Gutachtensatz anheben", () => {
    const r = ergebnis({}, { afaSatzProzent: ANNAHMEN.afaSatzMitGutachtenProzent });
    expect(r.projection.afaSatzProzent).toBe(4);
  });

  it("erhöht mit dem höheren Satz den Steuervorteil", () => {
    const zwei = ergebnis().projection.taxSavingsTotal;
    const vier = ergebnis({}, { afaSatzProzent: 4 }).projection.taxSavingsTotal;
    expect(vier).toBeGreaterThan(zwei);
  });

  it("senkt mit dem höheren Satz die monatliche Zuzahlung", () => {
    const zwei = ergebnis().projection.monthlyZuzahlung;
    const vier = ergebnis({}, { afaSatzProzent: 4 }).projection.monthlyZuzahlung;
    expect(vier).toBeLessThanOrEqual(zwei);
  });
});

describe("Grenzsteuersatz", () => {
  it("setzt über 120.000 Euro 42 Prozent an, nicht 45", () => {
    // 45 Prozent greifen erst ab rund 278.000 Euro.
    const hoch = ergebnis({ incomeClass: "ueber_120k" }).projection;
    const mittel = ergebnis({ incomeClass: "80k_120k" }).projection;
    expect(hoch.taxSavingsTotal).toBe(mittel.taxSavingsTotal);
  });
});

describe("Arbeitslosigkeit", () => {
  it("führt zu einer klaren Absage ohne Projektion", () => {
    const r = ergebnis({ profession: "arbeitslos" } as Partial<AnalysisData>);
    expect(r.category).toBe("nicht_geeignet");
    expect(r.leadQuality).toBe("D");
    expect(r.projection.purchasePrice).toBe(0);
  });
});

describe("Texte", () => {
  it("enthält keine verunglückten Anreden", () => {
    const r = ergebnis();
    const texte = [
      r.categoryDescription,
      r.hebelEffekt.beschreibung,
      r.bonitaetsVerbesserung.bankSicht,
      ...r.goalInsights.map((g) => `${g.description} ${g.wieErreicht}`),
      ...r.taxHints,
    ].join(" ");
    expect(texte).not.toMatch(/für Du\b/);
    expect(texte).not.toMatch(/arbeitet für Du/);
  });

  it("stellt den steuerfreien Verkauf nicht als sicheren Gewinn dar", () => {
    const r = ergebnis();
    expect(r.bonitaetsVerbesserung.bankSicht).not.toMatch(/verkaufst du steuerfrei mit Gewinn/);
    expect(r.bonitaetsVerbesserung.bankSicht).toMatch(/§ 23 EStG/);
  });
});
