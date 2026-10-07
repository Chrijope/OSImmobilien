import { describe, it, expect } from "vitest";
import {
  STANDARD_EIGEN_SATZ,
  STANDARD_LEAD_SATZ,
  ermittleSaetze,
  parseSatz,
  verguetungProDeal,
  verguetungProJahr,
  warteKosten,
} from "@/lib/closingPraesentationRechner";

/**
 * Diese Zahlen laufen live im Closing-Termin vor einem Bewerber über den
 * Bildschirm. Die Tests halten die Rechenbeispiele fest (350.000 Euro bei
 * 3 bzw. 4 Prozent ergeben 10.500 bzw. 14.000 Euro) und sichern, dass die
 * Satz-Auflösung dieselbe Vorrangregel benutzt wie der Vertragsgenerator:
 * individueller Satz vor Lead-/Eigen-Satz vor Standard. Der Standard ist
 * seit dem vereinheitlichten Modell 4 Prozent für beide Wege.
 */

describe("parseSatz", () => {
  it("liest ganze Zahlen, Komma- und Punktschreibweise", () => {
    expect(parseSatz("3")).toBe(3);
    expect(parseSatz("3,5")).toBe(3.5);
    expect(parseSatz("3.5")).toBe(3.5);
  });

  it("verwirft Leeres, Unlesbares und Nullwerte", () => {
    expect(parseSatz("")).toBeNull();
    expect(parseSatz(undefined)).toBeNull();
    expect(parseSatz(null)).toBeNull();
    expect(parseSatz("abc")).toBeNull();
    expect(parseSatz("0")).toBeNull();
    expect(parseSatz("-2")).toBeNull();
  });
});

describe("ermittleSaetze", () => {
  it("liefert ohne Bewerber den einheitlichen Standard von 4 Prozent", () => {
    const s = ermittleSaetze();
    expect(s.leadSatz).toBe(STANDARD_LEAD_SATZ);
    expect(s.eigenSatz).toBe(STANDARD_EIGEN_SATZ);
    expect(STANDARD_LEAD_SATZ).toBe(4);
    expect(STANDARD_EIGEN_SATZ).toBe(4);
    expect(s.verhandelt).toBe(false);
  });

  it("liefert bei leeren Feldern ebenfalls die Standards", () => {
    const s = ermittleSaetze({ satzIndividuell: "", satzLead: "", satzEigen: "" });
    expect(s).toEqual({ leadSatz: 4, eigenSatz: 4, verhandelt: false });
  });

  it("nutzt hinterlegte Lead- und Eigen-Sätze", () => {
    const s = ermittleSaetze({ satzLead: "3,5", satzEigen: "4,5" });
    expect(s).toEqual({ leadSatz: 3.5, eigenSatz: 4.5, verhandelt: true });
  });

  it("füllt einen fehlenden Einzelsatz mit dem Standard auf", () => {
    const s = ermittleSaetze({ satzEigen: "5" });
    expect(s).toEqual({ leadSatz: 4, eigenSatz: 5, verhandelt: true });
  });

  it("lässt den individuellen Einheitssatz für beide Wege gelten", () => {
    const s = ermittleSaetze({ satzIndividuell: "4", satzLead: "3", satzEigen: "5" });
    expect(s).toEqual({ leadSatz: 4, eigenSatz: 4, verhandelt: true });
  });
});

describe("verguetungProDeal", () => {
  it("rechnet die Drehbuch-Case-Study: 350.000 Euro bei 3 und 4 Prozent", () => {
    expect(verguetungProDeal(350000, 3)).toBe(10500);
    expect(verguetungProDeal(350000, 4)).toBe(14000);
  });

  it("rundet auf ganze Euro", () => {
    // 333.333 * 3 % = 9.999,99
    expect(verguetungProDeal(333333, 3)).toBe(10000);
  });

  it("liefert bei unbrauchbaren Eingaben null", () => {
    expect(verguetungProDeal(0, 3)).toBe(0);
    expect(verguetungProDeal(-100, 3)).toBe(0);
    expect(verguetungProDeal(350000, 0)).toBe(0);
    expect(verguetungProDeal(NaN, 3)).toBe(0);
  });
});

describe("verguetungProJahr", () => {
  it("rechnet einen Abschluss pro Monat aufs Jahr hoch", () => {
    expect(verguetungProJahr(1, 350000, 3)).toBe(126000);
    expect(verguetungProJahr(1, 350000, 4)).toBe(168000);
  });

  it("erlaubt halbe Abschlüsse pro Monat, also einen alle zwei Monate", () => {
    expect(verguetungProJahr(0.5, 350000, 4)).toBe(84000);
  });

  it("bleibt konsistent mit zwölf Monatswerten", () => {
    const proMonat = verguetungProDeal(300000, 3.5) * 2;
    expect(verguetungProJahr(2, 300000, 3.5)).toBe(proMonat * 12);
  });

  it("liefert bei unbrauchbaren Eingaben null", () => {
    expect(verguetungProJahr(0, 350000, 3)).toBe(0);
    expect(verguetungProJahr(-1, 350000, 3)).toBe(0);
  });
});

describe("warteKosten", () => {
  it("rechnet sechs Monate Wartezeit nüchtern als verpasste Vergütung", () => {
    // 1 Abschluss/Monat, 350.000 Euro, 4 % = 14.000 Euro pro Monat.
    expect(warteKosten(1, 350000, 4, 6)).toBe(84000);
  });

  it("ist genau die halbe Jahresvergütung bei sechs Monaten", () => {
    expect(warteKosten(2, 280000, 3, 6)).toBe(verguetungProJahr(2, 280000, 3) / 2);
  });

  it("liefert bei unbrauchbaren Eingaben null", () => {
    expect(warteKosten(1, 350000, 4, 0)).toBe(0);
    expect(warteKosten(0, 350000, 4, 6)).toBe(0);
  });
});
