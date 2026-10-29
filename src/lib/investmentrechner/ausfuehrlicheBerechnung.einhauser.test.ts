import { describe, expect, it } from "vitest";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { berechnungAusRechner } from "./ausfuehrlicheBerechnung";
import { nachrangFall, r2, type EinheitErgebnis } from "./kundenObjektvergleich";
import we12we13 from "./__fixtures__/einhauser-we12-we13.json";
import we08we13 from "./__fixtures__/einhauser-we08-we13.json";

/*
 * Gegencheck (Christian, 29.10.2026): Die Einhauser-Werte so in den
 * Investmentrechner eingetragen, wie man sie in der Kalkulationsbasis
 * eintragen würde, müssen genau die Zahlen der Einhauser-PDFs ergeben
 * (letzte Fassung: 5 % Zins, 1 % Tilgung, AfA 3,2 %, mit Nachrangseite).
 * Referenz sind die `zahlen.json` des Python-Generators.
 */

interface Wohnung { kp: number; qm: number; zimmer: number; ist: number; subQm: number; u: number; n: number; r: number }

function eingabe(w: Wohnung, nr: string): InvestmentEingabe {
  return {
    ...standardEingabe,
    propertyTitle: `Hauffstraße 38, WE ${nr}`,
    address: "Hauffstraße 38, 04317 Leipzig",
    area: w.qm,
    rooms: w.zimmer,
    purchasePrice: w.kp + 15000,
    garagePrice: 15000,
    // Kaufnebenkosten 6,5 + 1,5 + 0,5 = 8,5 %, die Standardsätze.
    transferTaxRate: 6.5, notaryRate: 1.5, landRegisterRate: 0.5, brokerRate: 0,
    seniorInterestRate: 5,
    seniorRepaymentRate: 1,
    buildingShare: 80,
    buildingDepreciationRate: 3.2,
    annualValueGrowth: 2,
    annualCostGrowth: 2,
    taxCalculationMode: "manual",
    marginalTaxRate: 42,
    startYear: 2026,
    monthlyColdRent: w.ist,
    monthlyGarageRent: 80,
    housingFeeRecoverable: w.u,
    housingFeeNonRecoverable: w.n,
    housingFeeTotal: r2(w.u + w.n),
    monthlyReserveContribution: w.r,
    monthlyReserveContributionAuto: false,
    ausfuehrlich: { nr, mieteSubQm: w.subQm, garageMiete1: 80, garageMieteZiel: 150, mieteZielQm: 20, mieteZielJahr: 2060 },
  };
}

const WE08: Wohnung = { kp: 205930, qm: 55.06, zimmer: 2, ist: 570.26, subQm: 13, u: 254.96, n: 81, r: 47.84 };
const WE12: Wohnung = { kp: 209000, qm: 56, zimmer: 2, ist: 544, subQm: 13, u: 242.53, n: 81.83, r: 48.65 };
const WE13: Wohnung = { kp: 270000, qm: 72.36, zimmer: 3, ist: 900, subQm: 13, u: 202.8, n: 96.3, r: 62.81 };

type Referenz = typeof we12we13.WE12;

function rechne(a: [Wohnung, string], b: [Wohnung, string]) {
  const objekte = [a, b].map(([w, nr]) => {
    const input = eingabe(w, nr);
    return { input, result: berechneInvestment(input) };
  });
  return berechnungAusRechner(objekte);
}

function pruefe(x: EinheitErgebnis, ref: Referenz) {
  expect(x.kp).toBe(ref.kaufpreis);
  expect(x.nk).toBeCloseTo(ref.knk, 6);
  expect(x.darlehen).toBe(ref.darlehen);
  expect(x.afaBasis).toBeCloseTo(ref.afa_basis, 6);
  expect(x.mieteSub).toBe(ref.miete_sub);
  expect(x.einheit.mieteIst).toBe(ref.miete_ist);
  expect(r2(x.luecke)).toBe(ref.mietluecke);
  expect(x.hausgeld).toEqual(ref.hausgeld);
  for (const [k, v] of Object.entries(ref.monat)) expect(r2(x.monat[k as keyof typeof x.monat]), `monat.${k}`).toBe(v);
  for (const [k, v] of Object.entries(ref.jahr)) expect(r2(x.jahr[k as keyof typeof x.jahr]), `jahr.${k}`).toBe(v);
  expect(Math.round(x.steuer30), "steuer_30_jahre").toBe(ref.steuer_30_jahre);
  expect(x.miete30, "miete_30_monat").toBeCloseTo(ref.miete_30_monat, 2);
  expect(x.tilgung36, "tilgung_36_monate").toBeCloseTo(ref.tilgung_36_monate, 2);
  for (const y of [25, 30, 35] as const) {
    const r = ref.entwicklung[String(y) as "25"];
    for (const k of ["wert", "rest", "erloes", "zuzahlung", "plus"] as const) expect(Math.round(x.entw[y][k]), `${k} ${y}`).toBe(r[k]);
  }
  expect(x.nachMin, "nach min").toBeCloseTo(ref.nach_steuer_min_max_30[0], 2);
  expect(x.nachMax, "nach max").toBeCloseTo(ref.nach_steuer_min_max_30[1], 2);
}

describe("Investmentrechner gegen die Einhauser-PDFs", () => {
  it("WE 12 und WE 13 (Fassung WE 12/13)", () => {
    const { v, A, B } = rechne([WE12, "12"], [WE13, "13"]);
    expect(v.annahmen).toMatchObject({ steuer: 0.42, steuerArt: "pauschal", zins: 0.05, tilgung: 0.01, gebaeudeanteil: 0.8, wertPa: 0.02, kostenPa: 0.02, startJahr: 2026, mieteZielQm: 20, mieteZielJahr: 2060 });
    expect(v.annahmen.knk).toBeCloseTo(0.085, 10);
    expect(A.einheit.afaJahre).toBeCloseTo(31.25, 10);
    pruefe(A, we12we13.WE12);
    pruefe(B!, we12we13.WE13);
  });

  it("WE 08 und WE 13 (Fassung WE 08/13)", () => {
    const { A, B } = rechne([WE08, "08"], [WE13, "13"]);
    pruefe(A, we08we13.WE08 as unknown as Referenz);
    pruefe(B!, we08we13.WE13);
  });

  it("Nachrangseite: Eigenanteil nach Steuer bei 0, 50 und 100 % Nachrang", () => {
    const fall = (x: EinheitErgebnis, an: Parameters<typeof nachrangFall>[2]) => [0, 0.5, 1].map((a) => r2(-nachrangFall(x, a, an).nach));
    const a = rechne([WE12, "12"], [WE13, "13"]);
    const b = rechne([WE08, "08"], [WE13, "13"]);
    expect(fall(a.A, a.v.annahmen)).toEqual([137.71, 186.24, 234.78]);
    expect(fall(b.A, b.v.annahmen)).toEqual([136.51, 184.38, 232.25]);
    expect(fall(a.B!, a.v.annahmen)).toEqual([175.85, 237.61, 299.36]);
  });
});
