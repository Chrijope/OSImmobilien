import { describe, it, expect } from "vitest";
import {
  formatSekunden,
  imZielbereich,
  mischeMitSaat,
  parseZahl,
  quote,
  reihenfolgeStimmt,
} from "./AufgabenHelfer";

describe("parseZahl", () => {
  it("liest deutsche Schreibweise mit Komma", () => {
    expect(parseZahl("3,6")).toBe(3.6);
  });

  it("liest englische Schreibweise mit Punkt", () => {
    expect(parseZahl("3.6")).toBe(3.6);
  });

  it("liest Tausenderpunkt und Dezimalkomma zusammen", () => {
    expect(parseZahl("16.500,50")).toBe(16500.5);
  });

  it("liest den Tausenderpunkt allein richtig", () => {
    expect(parseZahl("16.500")).toBe(16500);
    expect(parseZahl("1.234.567")).toBe(1234567);
  });

  it("ignoriert Euro, Prozent und Leerzeichen", () => {
    expect(parseZahl(" 36.210 € ")).toBe(36210);
    expect(parseZahl("3,6 %")).toBe(3.6);
  });

  it("gibt bei Unsinn null zurueck", () => {
    expect(parseZahl("")).toBeNull();
    expect(parseZahl("keine Ahnung")).toBeNull();
  });

  it("laesst negative Werte zu, Cashflow kann negativ sein", () => {
    expect(parseZahl("-190")).toBe(-190);
    expect(parseZahl("−190".replace("−", "-"))).toBe(-190);
  });
});

describe("imZielbereich", () => {
  it("akzeptiert den exakten Wert", () => {
    expect(imZielbereich(16500, 16500)).toBe(true);
  });

  it("akzeptiert eine Abweichung innerhalb der Toleranz", () => {
    expect(imZielbereich(16600, 16500, 1)).toBe(true);
  });

  it("lehnt eine Abweichung ausserhalb der Toleranz ab", () => {
    expect(imZielbereich(17000, 16500, 1)).toBe(false);
  });

  it("funktioniert bei negativen Zielwerten", () => {
    expect(imZielbereich(-190, -190, 1)).toBe(true);
    expect(imZielbereich(-250, -190, 1)).toBe(false);
  });

  it("behandelt den Zielwert null gesondert", () => {
    expect(imZielbereich(0, 0)).toBe(true);
    expect(imZielbereich(5, 0)).toBe(false);
  });
});

describe("mischeMitSaat", () => {
  it("liefert bei gleicher Saat immer dieselbe Reihenfolge", () => {
    const a = mischeMitSaat([1, 2, 3, 4, 5, 6, 7, 8], "test");
    const b = mischeMitSaat([1, 2, 3, 4, 5, 6, 7, 8], "test");
    expect(a).toEqual(b);
  });

  it("liefert bei anderer Saat eine andere Reihenfolge", () => {
    const a = mischeMitSaat([1, 2, 3, 4, 5, 6, 7, 8], "eins");
    const b = mischeMitSaat([1, 2, 3, 4, 5, 6, 7, 8], "zwei");
    expect(a).not.toEqual(b);
  });

  it("behaelt alle Elemente", () => {
    const quelle = ["a", "b", "c", "d"];
    expect([...mischeMitSaat(quelle, "x")].sort()).toEqual([...quelle].sort());
  });

  it("veraendert die Quelle nicht", () => {
    const quelle = [1, 2, 3];
    mischeMitSaat(quelle, "x");
    expect(quelle).toEqual([1, 2, 3]);
  });
});

describe("kleine Helfer", () => {
  it("reihenfolgeStimmt vergleicht Position fuer Position", () => {
    expect(reihenfolgeStimmt(["a", "b"], ["a", "b"])).toBe(true);
    expect(reihenfolgeStimmt(["b", "a"], ["a", "b"])).toBe(false);
    expect(reihenfolgeStimmt(["a"], ["a", "b"])).toBe(false);
  });

  it("quote rundet auf ganze Prozent", () => {
    expect(quote(3, 4)).toBe(75);
    expect(quote(0, 0)).toBe(0);
  });

  it("formatSekunden schreibt mm:ss", () => {
    expect(formatSekunden(9)).toBe("0:09");
    expect(formatSekunden(75)).toBe("1:15");
  });
});
