import { describe, expect, it } from "vitest";
import { berechneInvestment, grenzsteuersatz, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { berechnungAusRechner, steuerAus } from "./ausfuehrlicheBerechnung";
import { ohneAusgeblendeteFelder } from "./ausgeblendeteFelder";
import { r2 } from "./kundenObjektvergleich";
import we08we13 from "./__fixtures__/einhauser-we08-we13.json";

/*
 * Standardwerte seit dem 08.11.2026 (Christian): Wer nur die Objektdaten
 * einer Einhauser-Wohnung einträgt und 42 % wählt, bekommt ohne weiteres
 * Umstellen die Zahlen des Einhauser-PDFs. Gerechnet wird wie in der Maske,
 * also über `ohneAusgeblendeteFelder`.
 */

/** Nur Objektdaten der WE 13, alles andere steht auf `standardEingabe`. */
function we13(extra: Partial<InvestmentEingabe> = {}): InvestmentEingabe {
  return {
    ...standardEingabe,
    propertyTitle: "Hauffstraße 38, WE 13",
    area: 72.36,
    rooms: 3,
    purchasePrice: 285000,
    garagePrice: 15000,
    monthlyColdRent: 900,
    monthlyGarageRent: 80,
    housingFeeRecoverable: 202.8,
    housingFeeNonRecoverable: 96.3,
    housingFeeTotal: 299.1,
    monthlyReserveContribution: 62.81,
    monthlyReserveContributionAuto: false,
    buildingDepreciationRate: 3.2,
    ausfuehrlich: { mieteSubQm: 13, garageMiete1: 80, garageMieteZiel: 150 },
    ...extra,
  };
}

function rechne(input: InvestmentEingabe) {
  const wirksam = ohneAusgeblendeteFelder(input);
  return berechnungAusRechner([{ input: wirksam, result: berechneInvestment(wirksam) }]);
}

const MANUELL_42: Partial<InvestmentEingabe> = { taxCalculationMode: "manual", marginalTaxRate: 42 };

describe("Neue Standardwerte gegen die Einhauser-Rechnung", () => {
  it("nur Objektdaten plus 42 %: dieselben Zahlen wie das PDF (WE 13)", () => {
    const { v, A } = rechne(we13(MANUELL_42));
    const ref = we08we13.WE13;
    expect(v.annahmen).toMatchObject({ steuer: 0.42, zins: 0.05, tilgung: 0.01, mieteZielQm: 20, mieteZielJahr: 2060 });
    expect(v.annahmen.knk).toBeCloseTo(0.085, 10);
    expect(A.nk).toBeCloseTo(ref.knk, 6);
    expect(A.darlehen).toBe(ref.darlehen);
    expect(A.afaBasis).toBeCloseTo(ref.afa_basis, 6);
    for (const [k, wert] of Object.entries(ref.monat)) expect(r2(A.monat[k as keyof typeof A.monat]), `monat.${k}`).toBe(wert);
    for (const [k, wert] of Object.entries(ref.jahr)) expect(r2(A.jahr[k as keyof typeof A.jahr]), `jahr.${k}`).toBe(wert);
    for (const y of [25, 30, 35] as const) {
      const r = ref.entwicklung[String(y) as "25"];
      for (const k of ["wert", "rest", "erloes", "zuzahlung", "plus"] as const) expect(Math.round(A.entw[y][k]), `${k} ${y}`).toBe(r[k]);
    }
    // 175,85 € Eigenanteil, 563,43 € vor Steuer, 387,58 € Steuerersparnis.
    expect(r2(-A.monat.nach)).toBe(175.85);
    expect(r2(-A.monat.vor)).toBe(563.43);
    expect(r2(A.monat.ersparnis)).toBe(387.58);
  });

  it("ohne Einkommen und ohne Umstellen gilt 42 % wie im Exposé", () => {
    const { v, A } = rechne(we13());
    expect(v.annahmen).toMatchObject({ steuer: 0.42, steuerArt: "pauschal" });
    expect(r2(-A.monat.nach)).toBe(175.85);
  });

  it("ausgeblendete Felder wirken nicht: Mietausfall, Mietsteigerung, KfW, zweites Darlehen, degressive AfA", () => {
    const anders = rechne(
      we13({
        ...MANUELL_42,
        vacancyRate: 5, annualRentGrowth: 4, kfwEnabled: true, kfwLoanAmount: 50000, secondLoanAmount: 30000,
        juniorLoanValue: 20000, depreciationMethod: "declining", specialDepreciationRate: 5, seniorRepaymentType: "endfaellig",
        seniorGracePeriodYears: 3, acquisitionMonth: 7, forecastYears: 5,
      }),
    );
    expect(r2(-anders.A.monat.nach)).toBe(175.85);
    expect(Math.round(anders.A.entw[30].plus)).toBe(we08we13.WE13.entwicklung["30"].plus);
  });
});

describe("Darlehen folgt dem Kaufpreis", () => {
  it("ein stehengebliebener Eurobetrag führt nicht mehr zu Überfinanzierung", () => {
    // Früher: 318.652,70 € aus den Beispielzahlen, Kaufpreis auf 285.000 € geändert, 111,81 %.
    const input = ohneAusgeblendeteFelder(we13({ seniorLoanMode: "euro", seniorLoanValue: 318652.7 }));
    const result = berechneInvestment(input);
    expect(result.seniorLoanAmount).toBeCloseTo(285000, 6);
    expect(result.ueberfinanzierung).toBeLessThan(0.5);
    const billiger = ohneAusgeblendeteFelder({ ...input, purchasePrice: 250000 });
    expect(berechneInvestment(billiger).seniorLoanAmount).toBeCloseTo(250000, 6);
    expect(rechne({ ...input, purchasePrice: 250000 }).A.darlehen).toBe(250000);
  });

  it("die gespeicherte Eingabe bleibt unverändert", () => {
    const input = we13({ seniorLoanMode: "euro", seniorLoanValue: 318652.7, vacancyRate: 2 });
    ohneAusgeblendeteFelder(input);
    expect(input).toMatchObject({ seniorLoanMode: "euro", seniorLoanValue: 318652.7, vacancyRate: 2 });
  });
});

describe("Möbel gehören nicht in die Gebäude-AfA", () => {
  it("Möbel ändern AfA-Basis und Kaufnebenkosten nicht (WE 08 mit 10.000 € Möbeln)", () => {
    const we08: InvestmentEingabe = {
      ...standardEingabe, ...MANUELL_42, area: 55.06, rooms: 2, purchasePrice: 220930, garagePrice: 15000,
      monthlyColdRent: 570.26, buildingDepreciationRate: 3.2,
    };
    const ohne = rechne(we08).A;
    const mit = rechne({ ...we08, purchasePrice: 230930, furniturePrice: 10000 });
    expect(mit.v.annahmen.knk).toBeCloseTo(0.085, 10);
    expect(mit.A.afaBasis).toBeCloseTo(ohne.afaBasis, 6);
    expect(mit.A.afaJahr).toBeCloseTo(ohne.afaJahr, 6);
    expect(mit.A.nk).toBeCloseTo(ohne.nk, 6);
    // Finanziert sind die Möbel trotzdem: Das Darlehen deckt den ganzen Kaufpreis.
    expect(mit.A.darlehen).toBe(230930);
  });

  it("Möbel im Kaufpreis bei gleichem Preis senken die AfA-Basis auf den Teil ohne Möbel", () => {
    const basis = rechne(we13(MANUELL_42)).A.afaBasis;
    const mitMoebeln = rechne(we13({ ...MANUELL_42, furniturePrice: 10000 })).A;
    expect(mitMoebeln.afaBasis).toBeCloseTo(((285000 - 10000) * 1.085 * 0.8), 6);
    expect(mitMoebeln.afaBasis).toBeLessThan(basis);
  });
});

describe("Grenzsteuersatz: automatisch aus dem Einkommen, von Hand überschreibbar", () => {
  it("automatisch: Grenzsteuersatz nach Tarif 2026 mit Soli und Kirchensteuer, genau wie angezeigt", () => {
    const input = ohneAusgeblendeteFelder(we13({ taxableIncomeCustomer: 62000, churchTaxRate: 8 }));
    const result = berechneInvestment(input);
    const erwartet = Math.round(grenzsteuersatz(62000, false, 8, true, true) * 10000) / 10000;
    expect(steuerAus(input, result)).toEqual({ steuer: erwartet, steuerArt: "einkommen" });
    expect(erwartet).toBeCloseTo(result.marginalTotalTaxRate, 4);
    expect(rechne(input).v.annahmen.steuer).toBe(erwartet);
  });

  it("automatisch: Spitzensatz ohne Kirche und mit Soli", () => {
    const input = we13({ taxableIncomeCustomer: 120000 });
    // 42 % Einkommensteuer plus 5,5 % Soli darauf.
    expect(steuerAus(input, berechneInvestment(input)).steuer).toBeCloseTo(0.4431, 4);
  });

  it("manuell überschreibt den automatischen Satz, zurück auf automatisch holt ihn wieder", () => {
    const auto = we13({ taxableIncomeCustomer: 62000 });
    const manuell = { ...auto, taxCalculationMode: "manual" as const, marginalTaxRate: 37 };
    expect(steuerAus(manuell, berechneInvestment(manuell))).toEqual({ steuer: 0.37, steuerArt: "pauschal" });
    expect(rechne(manuell).v.annahmen.steuer).toBe(0.37);
    const zurueck = { ...manuell, taxCalculationMode: "tariff" as const };
    expect(steuerAus(zurueck, berechneInvestment(zurueck)).steuerArt).toBe("einkommen");
  });
});
