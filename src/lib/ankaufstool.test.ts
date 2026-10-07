import { describe, it, expect } from "vitest";
import { ANKAUF_STANDARD, anteilAmErloes, berechneAnkauf } from "./ankaufstool";

/*
 * Erwartete Werte: die gecachten Ergebnisse aus Ankaufstool.xlsx, Blatt
 * „Kalkulation“ (openpyxl, data_only=True), mit den Eingaben der Vorlage.
 */
describe("berechneAnkauf: Rechenfall aus der Excel", () => {
  const r = berechneAnkauf(ANKAUF_STANDARD);

  it.each([
    ["verkaufserloes", 2744000], // C13
    ["abgabepreisJeWohnung", 343000], // C14
    ["grunderwerbsteuer", 70000], // C18
    ["notarAnkauf", 28000], // C19
    ["maklerEinkauf", 49980], // C20
    ["summeAnkauf", 1547980], // C21
    ["sanierungWohnungen", 364000], // C24
    ["pufferSanierung", 48400], // C26
    ["summeSanierung", 552400], // C29
    ["vertriebsprovision", 219520], // C32
    ["mietsubvention", 33600], // C36
    ["summeVertrieb", 263120], // C38
    ["fremdkapital", 1680304], // C42
    ["eigenkapital", 420076], // C43
    ["zinskosten", 97037.55599999998], // C46
    ["summeFinanzierung", 102037.55599999998], // C48
    ["gesamtkosten", 2465537.556], // C51
    ["gewinn", 278462.44400000013], // C53
    ["margeErloes", 0.10148048250728868], // C54
    ["margeKosten", 0.11294187887032947], // C55
    ["renditeEigenkapital", 0.662885868271456], // C56
    ["gewinnJeWohnung", 34807.80550000002], // C57
    ["gewinnJeQm", 497.25436428571453], // C58
    ["gesamtkostenJeQm", 4402.7456357142855], // C59
    ["mindestAbgabepreis", 4359.506125776397], // C60
    ["abgabepreisGruen", 5570.480049603175], // C61
  ] as const)("%s = %f", (feld, erwartet) => {
    expect(r[feld]).toBeCloseTo(erwartet, 6);
  });

  it("Urteil wie B63", () => {
    expect(r.urteil).toBe("LOHNT SICH NICHT");
  });

  it("Anteil am Erlös wie Spalte D", () => {
    expect(anteilAmErloes(r.summeAnkauf, r.verkaufserloes)).toBeCloseTo(0.5641326530612245, 10); // D21
  });
});

describe("berechneAnkauf: Ampel und Randfälle", () => {
  it("wird grün, wenn der Abgabepreis die Grün-Schwelle erreicht", () => {
    const basis = berechneAnkauf(ANKAUF_STANDARD);
    const r = berechneAnkauf({ ...ANKAUF_STANDARD, abgabepreisProQm: basis.abgabepreisGruen + 0.01 });
    expect(r.urteil).toBe("LOHNT SICH");
    expect(r.margeErloes).toBeGreaterThanOrEqual(ANKAUF_STANDARD.schwelleGruen);
  });

  it("Mindest-Abgabepreis ergibt null Gewinn", () => {
    const basis = berechneAnkauf(ANKAUF_STANDARD);
    expect(berechneAnkauf({ ...ANKAUF_STANDARD, abgabepreisProQm: basis.mindestAbgabepreis }).gewinn).toBeCloseTo(0, 6);
  });

  it("teilt nie durch null", () => {
    const r = berechneAnkauf({ ...ANKAUF_STANDARD, wohnflaeche: 0, wohneinheiten: 0 });
    for (const wert of Object.values(r)) if (typeof wert === "number") expect(Number.isFinite(wert)).toBe(true);
    expect(r.mindestAbgabepreis).toBe(0);
  });

  it("keine negative Mietsubvention, wenn die Marktmiete höher ist", () => {
    expect(berechneAnkauf({ ...ANKAUF_STANDARD, marktmieteProQm: 15 }).mietsubvention).toBe(0);
  });
});
