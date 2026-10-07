import { describe, it, expect } from "vitest";
import { istInternerPfad, rueckweg, rueckwegBeschriftung } from "./reservierungRueckweg";

/**
 * Der Zurueckweg aus der Reservierungsvereinbarung.
 *
 * Der Wert steht in der Adresszeile und ist damit von aussen gesetzt. Ein
 * zugeschickter Link darf niemanden aus dem CRM heraus auf eine fremde Seite
 * schicken, die wie das CRM aussieht.
 */

describe("Welche Ziele angenommen werden", () => {
  it("nimmt einen Pfad innerhalb der Anwendung", () => {
    expect(istInternerPfad("/kunden/abc")).toBe(true);
    expect(istInternerPfad("/kunden/abc?tab=investments&investment=7")).toBe(true);
    expect(istInternerPfad("/objekte/12/wohnung/3")).toBe(true);
  });

  it("lehnt eine Adresse mit Schema ab", () => {
    expect(istInternerPfad("https://fremd.example")).toBe(false);
    expect(istInternerPfad("http://fremd.example")).toBe(false);
    expect(istInternerPfad("javascript:alert(1)")).toBe(false);
  });

  /*
   * Die protokollrelative Adresse sieht aus wie ein Pfad, fuehrt aber auf
   * einen fremden Rechner.
   */
  it("lehnt die protokollrelative Adresse ab", () => {
    expect(istInternerPfad("//fremd.example")).toBe(false);
    expect(istInternerPfad("//fremd.example/kunden/abc")).toBe(false);
  });

  /*
   * Browser behandeln den Rueckwaertsschraegstrich in Adressen wie einen
   * Schraegstrich. Eine Pruefung, die nur auf "//" sieht, laesst das durch.
   */
  it("lehnt den Rueckwaertsschraegstrich ab", () => {
    expect(istInternerPfad("/\\fremd.example")).toBe(false);
    expect(istInternerPfad("/\\/fremd.example")).toBe(false);
  });

  it("lehnt Leeres ab", () => {
    expect(istInternerPfad("")).toBe(false);
    expect(istInternerPfad(null)).toBe(false);
    expect(istInternerPfad(undefined)).toBe(false);
    expect(istInternerPfad("kunden/abc")).toBe(false);
  });
});

describe("Der Rueckfall, damit der Knopf nie ins Leere zeigt", () => {
  it("nimmt das angegebene Ziel, wenn es taugt", () => {
    expect(rueckweg("/kunden/abc?tab=investments", "xyz")).toBe("/kunden/abc?tab=investments");
  });

  it("faellt ohne Ziel auf das Kundenprofil zurueck", () => {
    expect(rueckweg(undefined, "xyz")).toBe("/kunden/xyz");
    expect(rueckweg("", "xyz")).toBe("/kunden/xyz");
  });

  it("faellt bei einem fremden Ziel auf das Kundenprofil zurueck, nicht darauf herein", () => {
    expect(rueckweg("https://fremd.example", "xyz")).toBe("/kunden/xyz");
    expect(rueckweg("//fremd.example", "xyz")).toBe("/kunden/xyz");
  });

  it("faellt ohne Kunden auf die Kontaktliste zurueck", () => {
    expect(rueckweg(undefined, null)).toBe("/kontakte");
    expect(rueckweg("https://fremd.example", undefined)).toBe("/kontakte");
  });
});

describe("Die Beschriftung sagt, wohin es geht", () => {
  it("benennt Kundenprofil und Objekt, sonst schlicht zurueck", () => {
    expect(rueckwegBeschriftung("/kunden/abc")).toBe("Zurück zum Kundenprofil");
    expect(rueckwegBeschriftung("/objekte/12")).toBe("Zurück zum Objekt");
    // Seit dem 23.09.2026 führt auch die Einheitsseite in die Reservierung.
    expect(rueckwegBeschriftung("/objekte/12/einheiten/w6")).toBe("Zurück zur Einheit");
    expect(rueckwegBeschriftung("/objekte/12/einheiten/w6?empfehlung=inv-1")).toBe("Zurück zur Einheit");
    expect(rueckwegBeschriftung("/kontakte")).toBe("Zurück");
  });
});
