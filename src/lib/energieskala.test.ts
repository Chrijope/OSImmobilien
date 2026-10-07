import { describe, it, expect } from "vitest";
import { ENERGIESTUFEN, energieklasseAusKennwert, energieklasseNormalisieren, energieskalaBewerten, SKALA_MAXIMUM } from "@/lib/energieskala";

/** Energieskala A+ bis H nach GEG Anlage 10, wie sie das Exposé in Abschnitt 4 zeigt. */
describe("Energieskala", () => {
  it("hat neun Stufen von A+ bis H, lückenlos", () => {
    expect(ENERGIESTUFEN.map((s) => s.klasse)).toEqual(["A+", "A", "B", "C", "D", "E", "F", "G", "H"]);
    for (let i = 1; i < ENERGIESTUFEN.length; i++) expect(ENERGIESTUFEN[i].von).toBe(ENERGIESTUFEN[i - 1].bis);
    expect(ENERGIESTUFEN[ENERGIESTUFEN.length - 1].bis).toBeNull();
  });

  it("ordnet Kennwerte den Klassen zu, Grenzen gehören zur höheren Stufe", () => {
    expect(energieklasseAusKennwert(0)).toBe("A+");
    expect(energieklasseAusKennwert(29.9)).toBe("A+");
    expect(energieklasseAusKennwert(30)).toBe("A");
    expect(energieklasseAusKennwert(99)).toBe("C");
    expect(energieklasseAusKennwert(128.8)).toBe("D");
    expect(energieklasseAusKennwert(130)).toBe("E");
    expect(energieklasseAusKennwert(249)).toBe("G");
    expect(energieklasseAusKennwert(250)).toBe("H");
    expect(energieklasseAusKennwert(999)).toBe("H");
    expect(energieklasseAusKennwert(undefined)).toBeUndefined();
    expect(energieklasseAusKennwert(-5)).toBeUndefined();
    expect(energieklasseAusKennwert(Number.NaN)).toBeUndefined();
  });

  it("normalisiert gepflegte Klassen und verwirft Unbekanntes", () => {
    expect(energieklasseNormalisieren("d")).toBe("D");
    expect(energieklasseNormalisieren("Klasse D")).toBe("D");
    expect(energieklasseNormalisieren("A +")).toBe("A+");
    expect(energieklasseNormalisieren("Z")).toBeUndefined();
    expect(energieklasseNormalisieren("")).toBeUndefined();
  });

  it("bewertet: Kennwert schlägt gepflegte Klasse, mit Hinweis bei Abweichung", () => {
    const b = energieskalaBewerten({ klasse: "C", kennwert: 128.8 });
    expect(b.klasse).toBe("D");
    expect(b.ausKennwert).toBe("D");
    expect(b.hinweis).toContain("Klasse C");
    expect(b.positionProzent).toBeCloseTo((128.8 / SKALA_MAXIMUM) * 100, 5);
  });

  it("bewertet: ohne Kennwert gilt die gepflegte Klasse, ohne beides nichts", () => {
    expect(energieskalaBewerten({ klasse: "B" })).toMatchObject({ klasse: "B", positionProzent: undefined, hinweis: undefined });
    expect(energieskalaBewerten({})).toMatchObject({ klasse: undefined, ausKennwert: undefined });
    expect(energieskalaBewerten({ kennwert: 400 }).positionProzent).toBe(100);
  });
});
