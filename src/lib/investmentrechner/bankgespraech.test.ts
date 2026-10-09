import { describe, expect, it } from "vitest";
import { berechneInvestment, eigenkapitalrendite, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import {
  bankuebersicht,
  cashflowNachSteuerBeiZins,
  eigenkapitalrenditeOhneWertsteigerung,
  fuenfzehnProzentGrenze,
  volltilgungsjahr,
  zinsrisiko,
} from "./bankgespraech";

// Christians Standardbeispiel aus eigenkapitalrendite.test.ts.
const BEISPIEL: InvestmentEingabe = {
  ...standardEingabe,
  purchasePrice: 300_000,
  rehabExpense: 20_000,
  furniturePrice: 15_000,
  monthlyColdRent: 950,
  monthlyOperatingCosts: 60,
  monthlyReserveContribution: 40,
  taxableIncomeCustomer: 80_000,
  area: 60,
  equity: 20_000,
  forecastYears: 10,
};

describe("cashflowNachSteuerBeiZins", () => {
  it("trifft bei den gerechneten Zinsen genau den Cashflow nach Steuer", () => {
    for (const eingabe of [BEISPIEL, { ...BEISPIEL, taxCalculationMode: "manual" as const, marginalTaxRate: 42 }]) {
      const ergebnis = berechneInvestment(eingabe);
      for (const jahr of ergebnis.years) {
        expect(cashflowNachSteuerBeiZins(eingabe, jahr, jahr.interest)).toBeCloseTo(jahr.cashflowAfterTax, 6);
      }
    }
  });

  it("fester Satz: 1.000 € mehr Zinsen kosten nach Steuer 580 €", () => {
    const eingabe = { ...BEISPIEL, taxCalculationMode: "manual" as const, marginalTaxRate: 42 };
    const jahr = berechneInvestment(eingabe).years[0];
    const differenz = cashflowNachSteuerBeiZins(eingabe, jahr, jahr.interest) - cashflowNachSteuerBeiZins(eingabe, jahr, jahr.interest + 1000);
    expect(differenz).toBeCloseTo(580, 6);
  });
});

describe("zinsrisiko", () => {
  it("findet den Zins, bei dem der Cashflow nach Steuer null wird", () => {
    // Reichlich Miete, damit der Cashflow positiv ist und eine Nullstelle über dem heutigen Zins liegt.
    const eingabe = { ...BEISPIEL, monthlyColdRent: 1600 };
    const ergebnis = berechneInvestment(eingabe);
    const risiko = zinsrisiko(eingabe, ergebnis, 0)!;
    expect(risiko.restschuldBeginn).toBeCloseTo(ergebnis.totalDebt, 6);
    expect(risiko.zinsHeute).toBeCloseTo(0.04, 9);
    expect(risiko.zinsBeiNull).not.toBeNull();
    expect(risiko.zinsBeiNull!).toBeGreaterThan(risiko.zinsHeute);
    const jahr = ergebnis.years[0];
    expect(cashflowNachSteuerBeiZins(eingabe, jahr, risiko.zinsBeiNull! * risiko.restschuldBeginn)).toBeCloseTo(0, 2);
    expect(risiko.mehrkostenJeProzentpunktMonat).toBeGreaterThan(0);
  });

  it("liegt bei Zuzahlung unter dem heutigen Zins und ist null, wenn es selbst ohne Zins nicht reicht", () => {
    const ergebnis = berechneInvestment(BEISPIEL);
    const risiko = zinsrisiko(BEISPIEL, ergebnis, 9)!;
    expect(risiko.restschuldBeginn).toBeCloseTo(ergebnis.years[8].remainingDebt, 6);
    if (ergebnis.years[9].cashflowAfterTax < 0 && risiko.zinsBeiNull !== null) {
      expect(risiko.zinsBeiNull).toBeLessThan(risiko.zinsHeute);
    }
    const ohneMiete = { ...BEISPIEL, monthlyColdRent: 0, taxableIncomeCustomer: 0 };
    expect(zinsrisiko(ohneMiete, berechneInvestment(ohneMiete), 0)!.zinsBeiNull).toBeNull();
  });

  it("ist null ohne Darlehen", () => {
    const bar = { ...BEISPIEL, equity: 400_000 };
    expect(zinsrisiko(bar, berechneInvestment(bar), 0)).toBeNull();
  });
});

describe("eigenkapitalrenditeOhneWertsteigerung", () => {
  it("ist die Formel mit Vermögensaufbau ohne Wertzuwachs", () => {
    const ergebnis = berechneInvestment(BEISPIEL);
    const mit = eigenkapitalrendite(BEISPIEL, ergebnis);
    const ohne = eigenkapitalrenditeOhneWertsteigerung(BEISPIEL, ergebnis);
    const zuwachs = ergebnis.years[9].wertzuwachs;
    expect(zuwachs).toBeGreaterThan(0);
    expect(ohne.vermoegensaufbau).toBeCloseTo(mit.vermoegensaufbau - zuwachs, 6);
    expect(ohne.nenner).toBe(mit.nenner);
    expect(ohne.rendite!).toBeLessThan(mit.rendite!);
  });

  it("ist gleich, ohne Wertsteigerung in der Eingabe", () => {
    const eingabe = { ...BEISPIEL, annualValueGrowth: 0 };
    const ergebnis = berechneInvestment(eingabe);
    expect(eigenkapitalrenditeOhneWertsteigerung(eingabe, ergebnis).rendite).toBeCloseTo(eigenkapitalrendite(eingabe, ergebnis).rendite!, 12);
  });
});

describe("fuenfzehnProzentGrenze", () => {
  it("passt zur Quote des Rechenkerns", () => {
    const ergebnis = berechneInvestment(BEISPIEL);
    const grenze = fuenfzehnProzentGrenze(ergebnis)!;
    expect(grenze.aufwand).toBe(20_000);
    expect(grenze.aufwand / grenze.gebaeude).toBeCloseTo(ergebnis.immediateDeductionRatio, 12);
    expect(grenze.grenzeBrutto).toBeCloseTo(grenze.grenzeNetto * 1.19, 9);
    expect(grenze.spielraumNetto).toBeCloseTo(grenze.grenzeNetto - 20_000, 9);
    // Überschritten genau dann, wenn der Rechenkern warnt (Modus „Abziehen“).
    expect(grenze.spielraumNetto < 0).toBe(ergebnis.simpleThresholdExceeded);
  });

  it("ist null ohne Kaufpreis", () => {
    expect(fuenfzehnProzentGrenze(berechneInvestment(standardEingabe))).toBeNull();
  });
});

describe("volltilgungsjahr", () => {
  it("rechnet die Laufzeit einer Annuität", () => {
    // 4 % Zins, 2 % Tilgung: ln 3 / ln 1,04 = 28,01 Jahre, also im 29. Jahr getilgt.
    expect(volltilgungsjahr(100_000, 4, 2, 2026)).toBe(2026 + 28);
    expect(volltilgungsjahr(100_000, 0, 10, 2026)).toBe(2035);
    expect(volltilgungsjahr(0, 4, 2, 2026)).toBeNull();
    expect(volltilgungsjahr(100_000, 4, 0, 2026)).toBeNull();
  });
});

describe("bankuebersicht", () => {
  it("fasst Kapitalbedarf, Beleihung und Kapitaldienst zusammen", () => {
    const ergebnis = berechneInvestment(BEISPIEL);
    const bank = bankuebersicht(BEISPIEL, ergebnis);
    expect(bank.kaufpreis).toBe(300_000);
    expect(bank.darlehen).toBeCloseTo(ergebnis.totalDebt, 6);
    expect(bank.beleihungKaufpreis).toBeCloseTo(ergebnis.totalDebt / 300_000, 9);
    expect(bank.kaufpreisJeQm).toBe(5000);
    expect(bank.kaltmieteJeQm).toBeCloseTo(950 / 60, 9);
    expect(bank.kaufpreisfaktor).toBeCloseTo(300_000 / 11_400, 9);
    expect(bank.mischzins).toBeCloseTo(0.04, 9);
    expect(bank.tilgungGewichtet).toBeCloseTo(0.015, 9);
    expect(bank.kapitaldienstMonat).toBeCloseTo(ergebnis.monthlyDebtService, 6);
    expect(bank.mietueberschussMonat).toBeCloseTo(950 - 60 - 40, 6);
    expect(bank.kapitaldienstdeckung).toBeCloseTo(850 / ergebnis.monthlyDebtService, 6);
    expect(bank.volltilgungBank).toBe(volltilgungsjahr(ergebnis.seniorLoanAmount, 4, 1.5, 2026));
    expect(bank.volltilgungNachrang).toBeNull();
  });

  it("rechnet Preise je m² auf die ganze Wohnung, auch bei halbem Anteil", () => {
    const eingabe = { ...BEISPIEL, investmentShare: 50 };
    const bank = bankuebersicht(eingabe, berechneInvestment(eingabe));
    expect(bank.kaufpreis).toBe(150_000);
    expect(bank.kaufpreisJeQm).toBe(5000);
  });
});
