import { describe, expect, it } from "vitest";
import { berechneInvestment, grenzsteuersatz, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { regelAfa, stresstest, wertszenarien } from "./rechenstandards";

const BEISPIEL: InvestmentEingabe = {
  ...standardEingabe,
  purchasePrice: 300_000,
  furniturePrice: 15_000,
  monthlyColdRent: 950,
  monthlyOperatingCosts: 60,
  monthlyReserveContribution: 40,
  taxableIncomeCustomer: 48_000,
  constructionYear: 1990,
  area: 60,
  equity: 20_000,
  forecastYears: 10,
};

describe("Grenzsteuersatz aus dem zvE (Vertriebspaket)", () => {
  it("rund 35 % bei 60.000 € brutto ledig (zvE rund 48.000 €), 42 % erst ab rund 70.000 € zvE", () => {
    expect(grenzsteuersatz(48_000, false, 0, true, true)).toBeGreaterThan(0.33);
    expect(grenzsteuersatz(48_000, false, 0, true, true)).toBeLessThan(0.37);
    expect(grenzsteuersatz(68_000, false, 0, false, false)).toBeLessThan(0.42);
    expect(grenzsteuersatz(71_000, false, 0, false, false)).toBeCloseTo(0.42, 2);
  });

  it("der Rechner startet im Tarifmodus, nicht mit dem festen Satz", () => {
    expect(standardEingabe.taxCalculationMode).toBe("tariff");
  });
});

describe("regelAfa", () => {
  it("kennt 2,5 % vor 1925, 2 % ab 1925 und 3 % für Neubau", () => {
    expect(regelAfa({ ...BEISPIEL, constructionYear: 1910 }).regel.satz).toBe(2.5);
    expect(regelAfa(BEISPIEL).regel.satz).toBe(2);
    expect(regelAfa({ ...BEISPIEL, constructionYear: 2024, buildingDepreciationRate: 3 }).regel.satz).toBe(3);
  });

  it("rechnet bei erhöhter AfA zusätzlich mit Regel-AfA, mit weniger Steuerwirkung", () => {
    const eingabe = { ...BEISPIEL, buildingDepreciationRate: 4 };
    const afa = regelAfa(eingabe);
    expect(afa.erhoeht).toBe(true);
    const mit = berechneInvestment(eingabe);
    expect(afa.mitRegelAfa!.years[0].buildingDepreciation).toBeCloseTo(mit.years[0].buildingDepreciation / 2, 6);
    expect(afa.mitRegelAfa!.cumulativeTaxEffect).toBeLessThan(mit.cumulativeTaxEffect);
  });

  it("ohne erhöhte AfA kein zweiter Lauf, degressiv nur mit Hinweis", () => {
    expect(regelAfa(BEISPIEL)).toMatchObject({ erhoeht: false, mitRegelAfa: null, degressiv: false });
    expect(regelAfa({ ...BEISPIEL, depreciationMethod: "declining", buildingDepreciationRate: 5 })).toMatchObject({
      erhoeht: false,
      degressiv: true,
    });
  });
});

describe("stresstest", () => {
  it("drei Fälle, jeder belastet mehr als die Basis", () => {
    const eingabe = { ...BEISPIEL, buildingDepreciationRate: 4 };
    const [gutachten, zins, leerstand] = stresstest(eingabe, berechneInvestment(eingabe));
    expect(gutachten.entfaellt).toBeUndefined();
    expect(gutachten.stress.vorSteuer).toBeCloseTo(gutachten.basis.vorSteuer, 6);
    expect(gutachten.stress.nachSteuer).toBeGreaterThan(gutachten.basis.nachSteuer);

    // Jahr 11, obwohl die Prognose nur zehn Jahre hat.
    expect(zins.jahr).toBe(eingabe.startYear + 10);
    expect(zins.stress.vorSteuer).toBeGreaterThan(zins.basis.vorSteuer);
    expect(zins.stress.nachSteuer).toBeGreaterThan(zins.basis.nachSteuer);

    const ersteMiete = berechneInvestment(eingabe).years[0].effectiveRent;
    expect(leerstand.stress.vorSteuer).toBeCloseTo((ersteMiete / 12) * 3, 6);
    expect(leerstand.stress.nachSteuer).toBeGreaterThan(0);
    expect(leerstand.stress.nachSteuer).toBeLessThan(leerstand.stress.vorSteuer);
  });

  it("Gutachten-Fall entfällt mit Regel-AfA, die Eingabe bleibt unverändert", () => {
    const kopie = structuredClone(BEISPIEL);
    const [gutachten] = stresstest(BEISPIEL, berechneInvestment(BEISPIEL));
    expect(gutachten.entfaellt).toBeTruthy();
    expect(BEISPIEL).toEqual(kopie);
  });

  it("rechnet einen Punkt mehr Zins auf die Restschuld zu Beginn von Jahr 11 (seit dem 23.10.2026 ohne Anschlusszins)", () => {
    const eingabe = { ...BEISPIEL, seniorInterestRate: 4, seniorFixedRateYears: 10 };
    const a = stresstest(eingabe, berechneInvestment(eingabe))[1];
    const lang = berechneInvestment({ ...eingabe, forecastYears: 11 });
    const mehrzins = lang.years[9].remainingDebt * 0.01;
    expect(a.basis.vorSteuer).toBeCloseTo(-lang.years[10].cashflowBeforeTax / 12, 6);
    expect(a.stress.vorSteuer - a.basis.vorSteuer).toBeCloseTo(mehrzins / 12, 6);
    // Die Steuer gibt einen Teil zurück: Nach Steuer steigt die Belastung weniger.
    expect(a.stress.nachSteuer - a.basis.nachSteuer).toBeLessThan(mehrzins / 12);
    expect(a.stress.nachSteuer - a.basis.nachSteuer).toBeGreaterThan(0);
  });
});

describe("wertszenarien", () => {
  it("0, 1 und 2 % mit Kaufkraftzeile", () => {
    const w = wertszenarien(BEISPIEL)!;
    expect(w.szenarien.map((s) => s.prozent)).toEqual([0, 1, 2]);
    expect(w.szenarien[0].wert).toBeLessThan(w.szenarien[1].wert);
    expect(w.szenarien[1].wert).toBeLessThan(w.szenarien[2].wert);
    for (const s of w.szenarien) expect(s.wertKaufkraft).toBeCloseTo(s.wert / 1.02 ** 10, 6);
    expect(w.jahr).toBe(BEISPIEL.startYear + 9);
  });
});
