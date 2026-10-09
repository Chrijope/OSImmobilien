import { describe, it, expect } from "vitest";
import {
  ANKAUF_STANDARD, anteilAmErloes, berechneAnkauf, eingabenAusVersion, objektAusVersion, versionSpeichern,
  type AnkaufEingaben, type AnkaufVersion,
} from "./ankaufstool";

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

describe("berechneAnkauf: Gewerbe, Stellplätze, Mieten", () => {
  const basis = berechneAnkauf(ANKAUF_STANDARD);

  it("Gewerbe = 0 und Exposé-Felder ohne Rechenwirkung ergeben exakt die Excel", () => {
    const r = berechneAnkauf({
      ...ANKAUF_STANDARD, gewerbeflaeche: 0, gesamtflaecheManuell: 999, grundstuecksflaeche: 3000,
      abgabepreisGewerbeProQm: 3000, sanierungGewerbeProQm: 500, gewerbeeinheiten: 0,
    });
    for (const k of Object.keys(basis) as (keyof typeof basis)[]) {
      if (["gesamtflaeche", "kaufpreisJeQm"].includes(k)) continue;
      expect(r[k]).toBe(basis[k]);
    }
  });

  it("Gewerbe wie Wohnen: gleiche Preise und Fläche verdoppeln Erlös und Sanierung", () => {
    const r = berechneAnkauf({
      ...ANKAUF_STANDARD, gewerbeflaeche: 560, gewerbeeinheiten: 8,
      abgabepreisGewerbeProQm: 4900, sanierungGewerbeProQm: 650,
    });
    expect(r.verkaufserloes).toBe(2 * basis.verkaufserloes);
    expect(r.sanierungGewerbe).toBe(basis.sanierungWohnungen);
    expect(r.abgabepreisJeWohnung).toBe(basis.abgabepreisJeWohnung);
    expect(r.mietsubvention).toBe(basis.mietsubvention); // nur Wohnfläche
  });

  it("Mindest- und Grün-Preis gelten auch mit Gewerbe, Stellplätzen und Mieten", () => {
    const e: AnkaufEingaben = {
      ...ANKAUF_STANDARD, gewerbeflaeche: 300, abgabepreisGewerbeProQm: 2500, stellplaetze: 6,
      abgabepreisStellplatz: 15_000, istMieteGewerbeJahr: 30_000, bewirtschaftungJahr: 4_000,
    };
    const r = berechneAnkauf(e);
    const mit = (p: number) => berechneAnkauf({ ...e, abgabepreisProQm: p, abgabepreisGewerbeProQm: p });
    expect(mit(r.mindestAbgabepreis).gewinn).toBeCloseTo(0, 6);
    expect(mit(r.abgabepreisGruen).margeErloes).toBeCloseTo(e.schwelleGruen, 10);
  });

  it("Mietüberschuss läuft anteilig über die Laufzeit, Leerstandskosten mindern den Gewinn", () => {
    const r = berechneAnkauf({ ...ANKAUF_STANDARD, istMieteWohnenJahr: 50_000, istMieteStellplaetzeJahr: 4_000, bewirtschaftungJahr: 6_000 });
    expect(r.mieteinnahmen).toBeCloseTo(48_000 * 1.5 * 0.7, 6);
    expect(r.gewinn).toBeCloseTo(basis.gewinn + r.mieteinnahmen, 6);
    expect(r.kaufpreisFaktor).toBeCloseTo(1_400_000 / 54_000, 10);
    expect(berechneAnkauf({ ...ANKAUF_STANDARD, bewirtschaftungJahr: 10_000 }).gewinn).toBeLessThan(basis.gewinn);
  });
});

/*
 * Exposé Borchmann Immobilien, Kennung 63696: Pappelallee 34a, 14554 Seddiner
 * See. Bürogebäude / Self Storage, Bj. 1988, modernisiert, leer. Aus dem
 * Exposé: Kaufpreis, Flächen, Käuferprovision 7,14 %. Grunderwerbsteuer
 * Brandenburg 6,5 %. Annahmen (stehen nicht im Exposé): Abgabepreis und
 * Sanierung Gewerbe; alles Übrige aus der Excel-Vorlage.
 */
describe("Exposé Borchmann, Seddiner See", () => {
  const e: AnkaufEingaben = {
    ...ANKAUF_STANDARD,
    kaufpreis: 1_800_000,
    maklerEinkauf: 0.0714,
    grunderwerbsteuer: 0.065,
    wohnflaeche: 0,
    wohneinheiten: 0,
    gewerbeflaeche: 2_200,
    grundstuecksflaeche: 3_000,
    istMieteGewerbeJahr: 0, // nicht vermietet
    abgabepreisGewerbeProQm: 2_000, // Annahme
    sanierungGewerbeProQm: 300, // Annahme
  };
  const r = berechneAnkauf(e);

  it("rechnet das Gewerbe statt 0 € Erlös", () => {
    expect(r.verkaufserloes).toBe(4_400_000);
    expect(r.summeAnkauf).toBeCloseTo(1_800_000 * (1 + 0.065 + 0.02 + 0.0714), 6);
    expect(r.kaufpreisJeQm).toBeCloseTo(1_800_000 / 2_200, 10);
    expect(r.mietsubvention).toBe(0);
  });

  it("Ergebnis", () => {
    expect(r.summeSanierung).toBe(878_000);
    expect(r.gesamtkosten).toBeCloseTo(3_463_249.824, 3);
    expect(r.gewinn).toBeCloseTo(936_750.176, 3);
    expect(r.margeErloes).toBeCloseTo(0.212898, 6);
    expect(r.urteil).toBe("LOHNT SICH");
    expect(r.mindestAbgabepreis).toBeCloseTo(1_537.18, 2);
    expect(r.abgabepreisGruen).toBeCloseTo(1_964.17, 2);
  });
});

describe("Versionen", () => {
  const version = (id: string, name: string): AnkaufVersion => ({ id, name, gespeichertAm: "", eingaben: { kaufpreis: 1 } });

  it("ersetzt eine Version gleichen Namens und stellt die neue nach vorn", () => {
    const liste = versionSpeichern([version("a", "Objekt A"), version("b", "Objekt B")], version("c", " objekt b "));
    expect(liste.map((v) => v.id)).toEqual(["c", "a"]);
  });

  it("ergänzt fehlende Felder aus der Vorlage", () => {
    const e = eingabenAusVersion(version("a", "A"));
    expect(e.kaufpreis).toBe(1);
    expect(e.wohnflaeche).toBe(ANKAUF_STANDARD.wohnflaeche);
    expect(e.gewerbeflaeche).toBe(0);
    expect(objektAusVersion(version("a", "A")).objektart).toBe("");
  });
});
