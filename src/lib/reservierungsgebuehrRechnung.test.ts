/**
 * Die Staffel der Reservierungsgebühr.
 *
 * Der Betrag steht auf einem Papier, das ein Kunde unterschreibt, und er
 * überweist danach genau diese Summe. Eine falsche Zahl fällt entweder sofort
 * auf und beschädigt das Vertrauen, oder sie fällt nicht auf und muss später
 * zurückgeholt werden. Deshalb steht jeder Fall hier einzeln.
 */
import { describe, expect, it } from "vitest";

import {
  GEBUEHR_GRENZE,
  GEBUEHR_GROSS,
  GEBUEHR_KLEIN,
  euroText,
  gebuehrAusText,
  gebuehrZuKaufpreis,
  kaufpreisAusText,
  staffelZeilen,
  verwendungszweck,
} from "./reservierungsgebuehr";

describe("Den Kaufpreis aus dem Textfeld lesen", () => {
  it("versteht die gaengigen Schreibweisen", () => {
    for (const text of ["300000", "300.000", "300.000,00", "300.000,00 €", "EUR 300000"]) {
      expect(kaufpreisAusText(text), text).toBe(300000);
    }
  });

  it("liest Nachkommastellen mit", () => {
    expect(kaufpreisAusText("299.999,50")).toBe(299999.5);
  });

  it("gibt null bei allem, was keine Zahl ist", () => {
    /*
     * Der wichtigste Fall. Eine unlesbare Eingabe darf keine Gebuehr
     * erzeugen, sondern muss auffallen.
     */
    for (const text of ["", "   ", "auf Anfrage", "k. A.", null, undefined]) {
      expect(kaufpreisAusText(text), String(text)).toBeNull();
    }
  });

  it("gibt null bei null und negativ", () => {
    expect(kaufpreisAusText("0")).toBeNull();
    expect(kaufpreisAusText("-5000")).toBeNull();
  });
});

describe("Die Staffel", () => {
  it("nimmt unter der Grenze den kleinen Betrag", () => {
    expect(gebuehrZuKaufpreis(299999)).toBe(GEBUEHR_KLEIN);
    expect(gebuehrZuKaufpreis(150000)).toBe(GEBUEHR_KLEIN);
  });

  it("zaehlt die Grenze selbst zur oberen Stufe", () => {
    // "ab 300.000" schliesst 300.000 ein. Genau hier entstehen sonst
    // Streitfaelle um 500 Euro.
    expect(gebuehrZuKaufpreis(GEBUEHR_GRENZE)).toBe(GEBUEHR_GROSS);
  });

  it("nimmt darueber den grossen Betrag", () => {
    expect(gebuehrZuKaufpreis(450000)).toBe(GEBUEHR_GROSS);
  });

  it("weist ohne Kaufpreis keine Gebuehr aus", () => {
    expect(gebuehrZuKaufpreis(null)).toBeNull();
    expect(gebuehrZuKaufpreis(0)).toBeNull();
  });

  it("rechnet direkt aus dem Textfeld", () => {
    expect(gebuehrAusText("299.999")).toBe(GEBUEHR_KLEIN);
    expect(gebuehrAusText("300.000")).toBe(GEBUEHR_GROSS);
    expect(gebuehrAusText("auf Anfrage")).toBeNull();
  });
});

describe("Die Schreibweise", () => {
  it("schreibt deutsche Betraege", () => {
    expect(euroText(1000)).toBe("1.000,00 EUR");
    expect(euroText(1500)).toBe("1.500,00 EUR");
  });

  it("nennt in der Staffel beide Stufen mit ihrer Grenze", () => {
    const zeilen = staffelZeilen();
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0].bereich).toContain("unter 300.000");
    expect(zeilen[0].betrag).toBe("1.000,00 EUR");
    expect(zeilen[1].bereich).toContain("ab 300.000");
    expect(zeilen[1].betrag).toBe("1.500,00 EUR");
  });
});

/*
 * Seit dem 15.09.2026 nennt der Zweck Objekt und Nachnamen, nicht mehr nur
 * die Namen: Der Name des Ueberweisenden steht ohnehin auf dem Kontoauszug,
 * das Objekt nicht (Rechtsentwurf, Abschnitt 4).
 */
describe("Der Verwendungszweck", () => {
  it("nennt Objektstrasse, Wohneinheit und den Nachnamen des ersten Kaeufers", () => {
    expect(verwendungszweck("Roonstraße 3", "6", "Sommerfeld"))
      .toBe("Reservierungsgebühr Roonstraße 3 WE 6, Sommerfeld");
  });

  it("bleibt unter den 140 Zeichen einer SEPA-Ueberweisung", () => {
    const zweck = verwendungszweck("Wendelsteinstraße 19", "14", "Sommerfeld-Hinterhuber");
    expect(zweck.length).toBeLessThanOrEqual(140);
  });

  it("bleibt leer, solange nichts dasteht", () => {
    // Lieber ein leeres Feld zum Ausfuellen als "Reservierungsgebuehr" allein,
    // das waere auf dem Kontoauszug keine Zuordnung.
    expect(verwendungszweck("", "", "")).toBe("");
    expect(verwendungszweck("  ", " ", undefined)).toBe("");
  });

  it("laesst fehlende Teile weg, ohne leere Klammern zu hinterlassen", () => {
    expect(verwendungszweck("", "", "Sommerfeld")).toBe("Reservierungsgebühr Sommerfeld");
    expect(verwendungszweck("Roonstraße 3", "", "Sommerfeld")).toBe("Reservierungsgebühr Roonstraße 3, Sommerfeld");
    expect(verwendungszweck("Roonstraße 3", "6", "")).toBe("Reservierungsgebühr Roonstraße 3 WE 6");
  });
});
